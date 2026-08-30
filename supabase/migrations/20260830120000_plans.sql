/**
 * A plan is an outcome. A booking is one of the things it took.
 *
 * "Joanna's birthday" is dinner, flowers and a car — three arrangements with
 * different suppliers, different rails and different failure modes, which the
 * person thinks of as one thing and will ask about as one thing. Without
 * somewhere to say they belong together, the app can only ever show them as
 * three unrelated rows and make the connection the user's job.
 *
 * Deliberately thin. A plan groups and titles; it does not duplicate anything
 * a booking already knows, and it has no status of its own — a plan's state is
 * whatever its items are doing, computed rather than stored, so the two can
 * never disagree.
 */

create table public.plans (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  /** What it is for, in the user's words: "London trip", "Anniversary". */
  title text not null,

  /**
   * When it happens. Both null for something with no date yet — a plan often
   * exists before anything in it does, which is most of the point of having
   * one.
   */
  starts_on date,
  ends_on date,

  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plans_title_check check (char_length(title) between 1 and 120),
  constraint plans_note_check check (note is null or char_length(note) <= 2000),
  constraint plans_dates_check check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index plans_user_idx on public.plans (user_id) where archived_at is null;

create trigger plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

/**
 * One thing in a plan.
 *
 * A booking when there is one, and a line of text when there is not — the
 * flowers nobody has ordered yet are part of the plan, and leaving them out
 * until they become bookable would make the plan a list of what has already
 * been done rather than of what needs doing.
 */
create table public.plan_items (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,

  /**
   * Set once this became a real arrangement. Until then the item is an
   * intention with a title, which is a different thing and should look like
   * one.
   */
  booking_id uuid references public.bookings (id) on delete set null,

  /** What it is, when there is no booking to name it. */
  title text not null,
  /** A category slug where it is known: restaurant, florist, transfer. */
  category text references public.categories (slug),

  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint plan_items_title_check check (char_length(title) between 1 and 160),
  -- The same booking twice in one plan is a mistake every time.
  constraint plan_items_booking_unique unique (plan_id, booking_id)
);

create index plan_items_plan_idx on public.plan_items (plan_id, position);

comment on table public.plans is
  'An outcome the user is arranging. Groups bookings and intentions; holds no status of its own.';

-- --------------------------------------------------------------------------
-- Access
-- --------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.plan_items enable row level security;

create policy plans_own on public.plans
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

/**
 * An item is reachable exactly when its plan is. Repeating the ownership test
 * on every item row would let the two drift; deriving it cannot.
 */
create policy plan_items_own on public.plan_items
  for all to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));

grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.plan_items to authenticated;
