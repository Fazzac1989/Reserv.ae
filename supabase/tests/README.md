# Database verification

Three checks that run against a local stack (`pnpm db:start`). They are not unit
tests — they exercise the real Postgres instance, the real policies and, in the
case of `auth-e2e.mjs`, the real GoTrue and PostgREST containers.

| File                | What it proves                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema-guards.sql` | The seed loaded; the sign-up trigger creates profile, preferences and role rows; a venue cannot go live without recorded consent; a channel's config must match its kind; a booking cannot reach `confirmed` without evidence; a low-confidence parsed reply is refused; terminal states are terminal; a status change without an `events_log` row aborts at commit; `events_log` rejects UPDATE and DELETE. |
| `rls.sql`           | A user sees only their own rows; venue contact details and channels are invisible to users; a user cannot insert or update a booking; a user cannot self-grant ops; ops sees everything; anon sees nothing; RLS is enabled on every public table.                                                                                                                                                            |
| `auth-e2e.mjs`      | Email OTP sign-in end to end through GoTrue and Mailpit, then the same RLS expectations enforced over HTTP through PostgREST rather than psql.                                                                                                                                                                                                                                                               |

Run them:

```bash
pnpm db:verify
```

`schema-guards.sql` and `rls.sql` expect a freshly reset database, and
`db:verify` resets first. Several statements are _expected_ to raise errors —
that is the assertion. Read the `expect ERROR` labels alongside the output.
