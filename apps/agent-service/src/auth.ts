import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest } from 'fastify';
import type { AgentServiceEnv } from '@reservai/config';
import { ServiceError } from './errors';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string | null;
  readonly accessToken: string;
}

export class UnauthorizedError extends ServiceError {
  constructor(message = 'Sign in required.') {
    super(401, message);
  }
}

function bearerFrom(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new UnauthorizedError();
  return token;
}

/**
 * Verifies the caller's Supabase session.
 *
 * `getUser` revalidates the token against the auth server rather than decoding
 * it locally — a locally-decoded JWT tells you what the token claims, not
 * whether it is still valid.
 */
export async function requireUser(
  request: FastifyRequest,
  env: AgentServiceEnv,
): Promise<AuthenticatedUser> {
  const accessToken = bearerFrom(request);

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new UnauthorizedError();

  return { id: data.user.id, email: data.user.email ?? null, accessToken };
}
