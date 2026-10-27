-- Supabase SQL schema for Autobahn Anki
-- Run this in the Supabase SQL Editor after creating your project

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Decks table
create table public.decks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  source_language text not null default 'en',
  target_language text not null default 'de',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Cards table
create table public.cards (
  id uuid default uuid_generate_v4() primary key,
  deck_id uuid references public.decks(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  front text not null,
  back text not null,
  notes text,
  -- Spaced repetition fields (SM-2 algorithm)
  ease_factor real default 2.5 not null,
  interval integer default 0 not null, -- days
  repetitions integer default 0 not null,
  next_review timestamptz default now() not null,
  last_reviewed timestamptz,
  created_at timestamptz default now() not null
);

-- Notebook entries
create table public.notebook (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  term text not null,
  translation text not null,
  language_from text not null default 'en',
  language_to text not null default 'de',
  notes text,
  source_card_id uuid references public.cards(id) on delete set null,
  created_at timestamptz default now() not null
);

-- Row Level Security
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.notebook enable row level security;

-- Policies: users can only access their own data
create policy "Users can view own decks" on public.decks
  for select using (auth.uid() = user_id);
create policy "Users can insert own decks" on public.decks
  for insert with check (auth.uid() = user_id);
create policy "Users can update own decks" on public.decks
  for update using (auth.uid() = user_id);
create policy "Users can delete own decks" on public.decks
  for delete using (auth.uid() = user_id);

create policy "Users can view own cards" on public.cards
  for select using (auth.uid() = user_id);
create policy "Users can insert own cards" on public.cards
  for insert with check (auth.uid() = user_id);
create policy "Users can update own cards" on public.cards
  for update using (auth.uid() = user_id);
create policy "Users can delete own cards" on public.cards
  for delete using (auth.uid() = user_id);

create policy "Users can view own notebook" on public.notebook
  for select using (auth.uid() = user_id);
create policy "Users can insert own notebook" on public.notebook
  for insert with check (auth.uid() = user_id);
create policy "Users can update own notebook" on public.notebook
  for update using (auth.uid() = user_id);
create policy "Users can delete own notebook" on public.notebook
  for delete using (auth.uid() = user_id);

-- Indexes for performance
create index idx_cards_deck_id on public.cards(deck_id);
create index idx_cards_user_next_review on public.cards(user_id, next_review);
create index idx_notebook_user_id on public.notebook(user_id);
create index idx_decks_user_id on public.decks(user_id);

-- ---------------------------------------------------------------------------
-- Usage tracking + admin
-- If your database already exists, run just this section in the SQL Editor.
-- ---------------------------------------------------------------------------

-- One row per thing a user does (visits a page, reviews a card, asks for a
-- grammar explanation, ...). See src/lib/activity.ts for the event names.
create table public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade not null,
  event text not null,
  path text,
  metadata jsonb,
  created_at timestamptz default now() not null
);

alter table public.activity_events enable row level security;

-- Users can only log their own events. Nobody reads them except the admin
-- functions below, which run with the service role.
create policy "Users can log own activity" on public.activity_events
  for insert with check (auth.uid() = user_id);

create index idx_activity_events_created_at on public.activity_events(created_at);
create index idx_activity_events_user_created on public.activity_events(user_id, created_at);

-- Per-user summary for the admin page
create or replace function public.admin_user_stats()
returns table (
  user_id uuid,
  email text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  last_active_at timestamptz,
  active_days_30d bigint,
  events_7d bigint,
  reviews_7d bigint,
  reviews_total bigint,
  decks bigint,
  cards bigint,
  notebook_entries bigint,
  top_features text[]
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    greatest(a.last_event_at, c.last_reviewed_at, u.last_sign_in_at),
    coalesce(a.active_days_30d, 0),
    coalesce(a.events_7d, 0),
    coalesce(a.reviews_7d, 0),
    coalesce(a.reviews_total, 0),
    coalesce(d.decks, 0),
    coalesce(c.cards, 0),
    coalesce(n.entries, 0),
    coalesce(f.top_features, '{}')
  from auth.users u
  left join lateral (
    select
      max(e.created_at) as last_event_at,
      count(distinct (e.created_at at time zone 'UTC')::date)
        filter (where e.created_at > now() - interval '30 days') as active_days_30d,
      count(*) filter (where e.created_at > now() - interval '7 days') as events_7d,
      count(*) filter (where e.event = 'card_reviewed' and e.created_at > now() - interval '7 days') as reviews_7d,
      count(*) filter (where e.event = 'card_reviewed') as reviews_total
    from public.activity_events e
    where e.user_id = u.id
  ) a on true
  left join lateral (
    select array_agg(t.event order by t.n desc) as top_features
    from (
      select e.event, count(*) as n
      from public.activity_events e
      where e.user_id = u.id and e.event <> 'page_view'
        and e.created_at > now() - interval '30 days'
      group by e.event
      order by n desc
      limit 3
    ) t
  ) f on true
  left join lateral (
    select count(*) as cards, max(x.last_reviewed) as last_reviewed_at
    from public.cards x where x.user_id = u.id
  ) c on true
  left join lateral (
    select count(*) as decks from public.decks x where x.user_id = u.id
  ) d on true
  left join lateral (
    select count(*) as entries from public.notebook x where x.user_id = u.id
  ) n on true
  order by 5 desc nulls last;
$$;

-- Active users and event counts per day (UTC) for the last `days` days
create or replace function public.admin_daily_activity(days integer default 30)
returns table (day date, active_users bigint, reviews bigint, events bigint)
language sql stable security definer set search_path = ''
as $$
  select
    s.d::date,
    count(distinct e.user_id),
    count(e.id) filter (where e.event = 'card_reviewed'),
    count(e.id)
  from generate_series(
    (now() at time zone 'UTC')::date - (days - 1),
    (now() at time zone 'UTC')::date,
    interval '1 day'
  ) as s(d)
  left join public.activity_events e
    on (e.created_at at time zone 'UTC')::date = s.d::date
  group by s.d
  order by s.d;
$$;

-- How much each feature is used, and by how many people, over the last `days` days
create or replace function public.admin_feature_usage(days integer default 30)
returns table (event text, uses bigint, users bigint, last_used_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.event, count(*), count(distinct e.user_id), max(e.created_at)
  from public.activity_events e
  where e.created_at > now() - make_interval(days => days)
  group by e.event
  order by count(distinct e.user_id) desc, count(*) desc;
$$;

-- Which pages people spend their visits on, over the last `days` days
create or replace function public.admin_page_views(days integer default 30)
returns table (path text, views bigint, users bigint)
language sql stable security definer set search_path = ''
as $$
  select e.path, count(*), count(distinct e.user_id)
  from public.activity_events e
  where e.event = 'page_view'
    and e.created_at > now() - make_interval(days => days)
  group by e.path
  order by count(*) desc;
$$;

-- The admin functions expose every user's data, so only the service role
-- (used server-side by /admin) may call them.
revoke execute on function public.admin_user_stats() from public, anon, authenticated;
revoke execute on function public.admin_daily_activity(integer) from public, anon, authenticated;
revoke execute on function public.admin_feature_usage(integer) from public, anon, authenticated;
revoke execute on function public.admin_page_views(integer) from public, anon, authenticated;
grant execute on function public.admin_user_stats() to service_role;
grant execute on function public.admin_daily_activity(integer) to service_role;
grant execute on function public.admin_feature_usage(integer) to service_role;
grant execute on function public.admin_page_views(integer) to service_role;
