import { supabase } from './supabase';
import { env } from '../env';

/**
 * Client for the agent service.
 *
 * Every call carries the user's Supabase session; the service verifies it
 * against the auth server and acts as that user. The Anthropic key lives there,
 * never here — anything in this bundle is readable by anyone holding the app.
 */

export interface Capabilities {
  environment: string;
  rails: string[];
  concierge_chat: boolean;
  /** False when no transcription provider is configured. The mic stays hidden. */
  voice_notes: boolean;
}

export interface ConciergeReply {
  conversationId: string;
  requestId: string;
  reply: string;
  intent: {
    vertical: string | null;
    zones: string[];
    window: { starts_at: string; ends_at: string } | null;
    party_size: number | null;
    price_band_max: number | null;
    occasion: string | null;
    constraints: string[];
    missing_fields: string[];
  };
  /** Fields taken from the profile rather than from what the user said. */
  defaulted: string[];
  ready: boolean;
}

export interface Transcript {
  text: string;
  confidence: number | null;
  language: string | null;
}

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AgentError('Sign in required.', 401);

  const response = await fetch(`${env.agentServiceUrl}${path}`, {
    ...init,
    headers: {
      // Only when something is actually being sent. A request that declares
      // JSON and carries nothing is rejected before it reaches a route, and
      // several endpoints take no body at all.
      ...(init?.body === undefined || init.body === null
        ? {}
        : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new AgentError(
      body?.error ?? `Something went wrong (${response.status}).`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function getCapabilities(): Promise<Capabilities> {
  // Unauthenticated: the apps need to know what exists before anyone signs in.
  return fetch(`${env.agentServiceUrl}/capabilities`).then((r) => {
    if (!r.ok) throw new AgentError('Could not reach the concierge.', r.status);
    return r.json() as Promise<Capabilities>;
  });
}

export function sendConciergeMessage(input: {
  conversationId?: string;
  text: string;
  audioRef?: string;
  transcriptConfidence?: number;
}): Promise<ConciergeReply> {
  return request<ConciergeReply>('/concierge/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function transcribeVoiceNote(audioRef: string): Promise<Transcript> {
  return request<Transcript>('/concierge/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioRef }),
  });
}

export interface SuggestionCard {
  id: string;
  rank: number;
  venueId: string;
  name: string;
  zone: string;
  priceBand: number;
  tags: string[];
  houseNote: string | null;
  proposedStart: string;
  proposedEnd: string;
  rationale: string;
  /**
   * False until a rail has actually checked the slot exists. The UI must never
   * present a proposal as if it were a held table.
   */
  slotIsVerified: boolean;
}

export interface SuggestionsResponse {
  suggestions: SuggestionCard[];
  /** Present when nothing fitted, saying honestly why. */
  message?: string;
  rejected: { reason: string; label: string; count: number }[];
}

export function requestSuggestions(requestId: string): Promise<SuggestionsResponse> {
  return request<SuggestionsResponse>(`/requests/${requestId}/suggest`, { method: 'POST' });
}

export interface ApprovalResponse {
  bookingId: string;
  status: string;
  rail: string | null;
  message: string;
}

export function approveSuggestion(suggestionId: string): Promise<ApprovalResponse> {
  return request<ApprovalResponse>('/bookings/approve', {
    method: 'POST',
    body: JSON.stringify({ suggestionId }),
  });
}

export interface BookingRow {
  id: string;
  status: string;
  party_size: number;
  scheduled_for: string;
  special_requests: string | null;
  venues: { name: string; zone: string } | null;
}

export function listBookings(): Promise<{ bookings: BookingRow[] }> {
  return request<{ bookings: BookingRow[] }>('/bookings');
}

// --- Lifecycle ---------------------------------------------------------------

export interface Reservation {
  id: string;
  status: string;
  party_size: number;
  scheduled_for: string;
  service_name: string | null;
  special_requests: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  calendar_event_id: string | null;
  rating: number | null;
  rated_at: string | null;
  no_show: boolean;
  venues: {
    name: string;
    zone: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
}

export function listReservations(): Promise<{ upcoming: Reservation[]; past: Reservation[] }> {
  return request<{ upcoming: Reservation[]; past: Reservation[] }>('/reservations');
}

export function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<{ ok: true }> {
  return request<{ ok: true }>('/push-tokens', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
}

export function cancelBooking(
  bookingId: string,
  reason?: string,
): Promise<{ cancelled: boolean; venueTold: string; message: string }> {
  return request(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function saveCalendarEventId(
  bookingId: string,
  calendarEventId: string | null,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/bookings/${bookingId}/calendar`, {
    method: 'POST',
    body: JSON.stringify({ calendarEventId }),
  });
}

export function rateBooking(
  bookingId: string,
  input: { rating: number; note?: string; noShow?: boolean },
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/bookings/${bookingId}/rate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
