import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentServiceEnv } from '@reservai/config';
import { BRAND } from '@reservai/config';
import { requireUser } from '../auth';
import { serviceClient, userClient } from '../supabase';
import { ServiceError } from '../errors';
import { STANDARD_LIMIT } from '../rate-limit';

interface Options {
  env: AgentServiceEnv;
}

/** The price the pilot is testing. */
export const PILOT_PRICE_AED = 99;

/**
 * Willingness to pay, and the billing that is not switched on.
 *
 * The pilot metric is "≥30% would pay AED 99+/month". That is answered by
 * asking, which costs nothing and can happen today. Charging is a separate
 * thing behind a flag, and while the flag is off the endpoints say so rather
 * than half-working.
 */
export async function registerPricingRoutes(app: FastifyInstance, { env }: Options): Promise<void> {
  /**
   * Whether to ask this user, and what.
   *
   * Only worth asking someone who has actually used the thing: an opinion on
   * paying AED 99 a month from someone who has never had a booking confirmed
   * is not a signal, it is noise that would flatter the number.
   */
  app.get('/pricing/prompt', STANDARD_LIMIT, async (request, reply) => {
    const user = await requireUser(request, env);
    const asUser = userClient(env, user.accessToken);

    const [{ count: confirmed }, { data: alreadyAsked, error: askedError }] = await Promise.all([
      asUser
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['confirmed', 'reminded', 'completed']),
      asUser.from('pricing_signals').select('id').eq('price_aed', PILOT_PRICE_AED).maybeSingle(),
    ]);

    // A swallowed read error reads exactly like "never asked", which would mean
    // asking the same person the same question after every single booking.
    if (askedError) throw askedError;

    const bookings = confirmed ?? 0;

    return reply.send({
      shouldAsk: bookings >= 2 && !alreadyAsked,
      priceAed: PILOT_PRICE_AED,
      bookings,
      /** True once they have answered. The app must not ask twice. */
      answered: Boolean(alreadyAsked),
    });
  });

  app.post('/pricing/signal', STANDARD_LIMIT, async (request, reply) => {
    const user = await requireUser(request, env);

    const parsed = z
      .object({
        answer: z.enum(['yes', 'no', 'maybe']),
        comment: z.string().max(2000).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Pick one of the three.' });

    const asService = serviceClient(env);

    const { count } = await asService
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'reminded', 'completed']);

    const { error } = await asService.from('pricing_signals').upsert(
      {
        user_id: user.id,
        price_aed: PILOT_PRICE_AED,
        answer: parsed.data.answer,
        comment: parsed.data.comment ?? null,
        bookings_at_time: count ?? 0,
      },
      { onConflict: 'user_id,price_aed' },
    );
    if (error) throw error;

    return reply.send({ ok: true });
  });

  /**
   * Billing.
   *
   * Dormant. When the flag is off this refuses outright rather than returning
   * an empty subscription or a checkout URL that goes nowhere — a payment flow
   * that half-works is the worst kind of half-working thing.
   */
  app.get('/billing/status', STANDARD_LIMIT, async (request, reply) => {
    const user = await requireUser(request, env);

    if (!env.FLAG_STRIPE_SUBSCRIPTIONS) {
      return reply.send({
        enabled: false,
        status: 'none',
        message: `${BRAND.name} is free during the pilot.`,
      });
    }

    const { data } = await userClient(env, user.accessToken)
      .from('subscriptions')
      .select('status, price_aed, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    return reply.send({
      enabled: true,
      status: data?.status ?? 'none',
      priceAed: data?.price_aed ?? PILOT_PRICE_AED,
      currentPeriodEnd: data?.current_period_end ?? null,
    });
  });

  app.post('/billing/checkout', STANDARD_LIMIT, async (request) => {
    await requireUser(request, env);

    if (!env.FLAG_STRIPE_SUBSCRIPTIONS || !env.STRIPE_SECRET_KEY) {
      throw new ServiceError(
        503,
        `Subscriptions are not switched on. ${BRAND.name} is free during the pilot.`,
      );
    }

    // Deliberately not implemented. Wiring a checkout session against an
    // unconfigured Stripe account would produce code nobody has run, in the one
    // area where an untested path takes someone's money.
    throw new ServiceError(
      501,
      'Checkout is not built yet. Switching the flag on is not enough — the Stripe integration needs writing and testing first.',
    );
  });
}
