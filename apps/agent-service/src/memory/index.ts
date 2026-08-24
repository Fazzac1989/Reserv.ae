import type { AgentServiceEnv } from '@reservai/config';
import {
  nudgeCopy,
  pickBest,
  resolveStanding,
  type NudgeCandidate,
  type StandingMatch,
  type VenueHistoryEntry,
} from '@reservai/core';
import { serviceClient, userClient } from '../supabase';
import { sendPush } from '../notifications/push';

/**
 * What we have learned about a user, and what to do with it.
 *
 * The learning is aggregation in Postgres; the judgement about whether to act
 * on it lives in packages/core where it is tested. This module is the wiring
 * between them.
 */

export interface LearnedProfile {
  readonly history: VenueHistoryEntry[];
  /** Tags they accept more often than they skip. */
  readonly likes: { tag: string; acceptanceRate: number; shown: number }[];
  /** Tags they are consistently shown and consistently pass on. */
  readonly passes: { tag: string; acceptanceRate: number; shown: number }[];
}

export async function loadLearnedProfile(
  env: AgentServiceEnv,
  userId: string,
  accessToken?: string,
): Promise<LearnedProfile> {
  const supabase = accessToken ? userClient(env, accessToken) : serviceClient(env);

  const [history, signals] = await Promise.all([
    supabase.rpc('user_venue_history', { p_user_id: userId }),
    supabase.rpc('user_taste_signals', { p_user_id: userId }),
  ]);

  const rows = signals.data ?? [];

  return {
    history: (history.data ?? []).map((h) => ({
      venueId: h.venue_id,
      venueName: h.venue_name,
      vertical: h.vertical,
      visits: h.visits,
      lastVisit: h.last_visit,
      avgRating: h.avg_rating === null ? null : Number(h.avg_rating),
    })),
    // A 60/40 split is the line: above it they reliably pick these, below it
    // they reliably do not. Anything between is not a preference.
    likes: rows
      .filter((r) => Number(r.acceptance_rate ?? 0) >= 60)
      .map((r) => ({ tag: r.tag, acceptanceRate: Number(r.acceptance_rate), shown: r.shown })),
    passes: rows
      .filter((r) => Number(r.acceptance_rate ?? 100) <= 20)
      .map((r) => ({ tag: r.tag, acceptanceRate: Number(r.acceptance_rate), shown: r.shown })),
  };
}

/**
 * Resolves "my barber" against what the user set and what they actually do.
 *
 * Returns null when it cannot be sure, which the Concierge treats as "they did
 * not name a venue" — so it asks rather than booking the wrong place.
 */
export async function resolveStandingEntity(
  env: AgentServiceEnv,
  userId: string,
  text: string,
  vertical: string | null,
): Promise<StandingMatch | null> {
  const supabase = serviceClient(env);

  const [{ data: preferences }, profile] = await Promise.all([
    supabase.from('user_preferences').select('standing_providers').eq('user_id', userId).single(),
    loadLearnedProfile(env, userId),
  ]);

  const explicit = (preferences?.standing_providers ?? {}) as Record<string, string>;

  return resolveStanding(text, {
    explicit,
    history: profile.history,
    vertical,
  });
}

export interface NudgeSweepResult {
  readonly sent: number;
  readonly considered: number;
  readonly errors: string[];
}

/**
 * The proactive pass.
 *
 * At most one nudge per user per run, about one venue. Every rule that decides
 * whether it is welcome lives in `decideNudge`; this loop only gathers the
 * evidence and delivers the verdict.
 */
export async function sweepNudges(env: AgentServiceEnv, now: Date): Promise<NudgeSweepResult> {
  if (!env.FLAG_PROACTIVE_SUGGESTIONS) {
    return { sent: 0, considered: 0, errors: [] };
  }

  const supabase = serviceClient(env);
  const errors: string[] = [];

  const { data: candidates, error } = await supabase.rpc('proactive_candidates', {
    p_now: now.toISOString(),
  });
  if (error) return { sent: 0, considered: 0, errors: [error.message] };

  const byUser = new Map<string, NudgeCandidate[]>();
  for (const row of candidates ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({
      userId: row.user_id,
      venueId: row.venue_id,
      venueName: row.venue_name,
      vertical: row.vertical,
      visits: row.visits,
      lastVisit: row.last_visit,
      medianGapDays: row.median_gap_days === null ? null : Number(row.median_gap_days),
      avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
      worstRating: row.worst_rating,
      daysSinceVisit: Number(row.days_since_visit),
      lastNudgeAt: row.last_nudge_at,
      nudgesLast30Days: row.nudges_last_30d,
      hasUpcoming: row.has_upcoming,
    });
    byUser.set(row.user_id, list);
  }

  let sent = 0;

  for (const [userId, list] of byUser) {
    const best = pickBest(list, now);
    if (!best) continue;

    const copy = nudgeCopy(best.candidate);
    const push = await sendPush(env, userId, {
      title: copy.title,
      body: copy.body,
      data: { venueId: best.candidate.venueId, kind: 'rebook_cadence' },
    });

    // Recorded even when it reached nobody, because the record is what stops
    // the same nudge being reconsidered every minute.
    const { error: writeError } = await supabase.from('proactive_nudges').insert({
      user_id: userId,
      kind: 'rebook_cadence',
      venue_id: best.candidate.venueId,
      delivered_to: push.delivered,
      // The sweep's own clock, not the wall clock. Cooldowns are measured
      // against this, so the two must agree.
      sent_at: now.toISOString(),
    });

    if (writeError) {
      errors.push(writeError.message);
      continue;
    }
    sent += 1;
  }

  return { sent, considered: byUser.size, errors };
}
