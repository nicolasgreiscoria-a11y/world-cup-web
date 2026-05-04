-- ============================================================
-- World Cup 2026 Bracket Challenge — Initial Schema
-- ============================================================

-- Tournament data --

create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  country_code  text not null,  -- ISO 3166-1 alpha-2 (e.g. "AR")
  flag_url      text,           -- populated from country_code at seed time
  group_name    text not null,  -- A through L
  fifa_ranking  int,
  created_at    timestamptz default now()
);

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  round         text not null check (round in (
                  'group','r32','r16','qf','sf','final','third_place')),
  match_number  int not null,   -- ordering within round (1-based)
  team1_id      uuid references public.teams(id),
  team2_id      uuid references public.teams(id),
  score1        int,
  score2        int,
  winner_id     uuid references public.teams(id),
  status        text not null default 'scheduled'
                  check (status in ('scheduled','live','finished')),
  kickoff_at    timestamptz,
  external_id   text unique,   -- football-data.org match ID for API sync
  created_at    timestamptz default now()
);

create index on public.matches (round);
create index on public.matches (status);
create index on public.matches (kickoff_at);

create table public.group_standings (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null unique references public.teams(id) on delete cascade,
  group_name    text not null,
  played        int not null default 0,
  wins          int not null default 0,
  draws         int not null default 0,
  losses        int not null default 0,
  goals_for     int not null default 0,
  goals_against int not null default 0,
  points        int not null default 0,
  position      int,           -- 1–4 within group (set after each match day)
  updated_at    timestamptz default now()
);

create index on public.group_standings (group_name, points desc);

-- User data --

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz default now()
);

create table public.pools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  invite_code   text not null unique,
  created_by    uuid not null references public.profiles(id) on delete cascade,
  -- June 11 2026 00:00 ART (UTC-3) = 03:00 UTC
  locked_at     timestamptz not null default '2026-06-11T03:00:00Z',
  created_at    timestamptz default now()
);

create table public.pool_members (
  id            uuid primary key default gen_random_uuid(),
  pool_id       uuid not null references public.pools(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz default now(),
  unique (pool_id, user_id)
);

-- User bracket (one per user per pool) --

create table public.brackets (
  id            uuid primary key default gen_random_uuid(),
  pool_id       uuid not null references public.pools(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  submitted_at  timestamptz,
  total_points  int not null default 0,
  created_at    timestamptz default now(),
  unique (pool_id, user_id)
);

-- Group stage predictions (1st / 2nd / best-third pick per group) --

create table public.group_picks (
  id              uuid primary key default gen_random_uuid(),
  bracket_id      uuid not null references public.brackets(id) on delete cascade,
  group_name      text not null,
  picked_1st_id   uuid references public.teams(id),
  picked_2nd_id   uuid references public.teams(id),
  picked_3rd_id   uuid references public.teams(id),
  points_earned   int not null default 0,
  unique (bracket_id, group_name)
);

-- Knockout round predictions --

create table public.bracket_picks (
  id                uuid primary key default gen_random_uuid(),
  bracket_id        uuid not null references public.brackets(id) on delete cascade,
  match_id          uuid not null references public.matches(id) on delete cascade,
  picked_winner_id  uuid references public.teams(id),
  points_earned     int not null default 0,
  unique (bracket_id, match_id)
);

create index on public.bracket_picks (bracket_id);
create index on public.bracket_picks (match_id);

-- Leaderboard view (aggregate per user per pool) --

create or replace view public.leaderboard as
  select
    b.pool_id,
    b.user_id,
    p.display_name,
    p.avatar_url,
    b.total_points,
    rank() over (partition by b.pool_id order by b.total_points desc) as rank
  from public.brackets b
  join public.profiles p on p.id = b.user_id;
