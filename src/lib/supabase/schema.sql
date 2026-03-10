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
