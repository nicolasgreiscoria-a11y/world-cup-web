-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all user-facing tables
alter table public.profiles       enable row level security;
alter table public.pools          enable row level security;
alter table public.pool_members   enable row level security;
alter table public.brackets       enable row level security;
alter table public.group_picks    enable row level security;
alter table public.bracket_picks  enable row level security;

-- Tournament tables are public read, service-role write only
alter table public.teams          enable row level security;
alter table public.matches        enable row level security;
alter table public.group_standings enable row level security;

-- Teams: public read
create policy "teams_public_read" on public.teams
  for select using (true);

-- Matches: public read
create policy "matches_public_read" on public.matches
  for select using (true);

-- Group standings: public read
create policy "group_standings_public_read" on public.group_standings
  for select using (true);

-- Profiles: authenticated users can read any profile; only owner can update
create policy "profiles_read" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Pools: authenticated users can read; only creator can update/delete
create policy "pools_read" on public.pools
  for select using (auth.role() = 'authenticated');

create policy "pools_insert" on public.pools
  for insert with check (auth.uid() = created_by);

create policy "pools_update_own" on public.pools
  for update using (auth.uid() = created_by);

create policy "pools_delete_own" on public.pools
  for delete using (auth.uid() = created_by);

-- Pool members: pool members can see other members; users can join/leave
create policy "pool_members_read" on public.pool_members
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.pool_members pm
      where pm.pool_id = pool_members.pool_id
        and pm.user_id = auth.uid()
    )
  );

create policy "pool_members_insert" on public.pool_members
  for insert with check (auth.uid() = user_id);

create policy "pool_members_delete_own" on public.pool_members
  for delete using (auth.uid() = user_id);

-- Helper: check if current user is a member of a pool
create or replace function public.is_pool_member(p_pool_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = auth.uid()
  );
$$;

-- Brackets: owner can read/write; pool members can read
create policy "brackets_select" on public.brackets
  for select using (
    auth.uid() = user_id
    or public.is_pool_member(pool_id)
  );

create policy "brackets_insert" on public.brackets
  for insert with check (auth.uid() = user_id);

create policy "brackets_update_own" on public.brackets
  for update using (auth.uid() = user_id);

-- Group picks: follow bracket access
create policy "group_picks_select" on public.group_picks
  for select using (
    exists (
      select 1 from public.brackets b
      where b.id = group_picks.bracket_id
        and (
          b.user_id = auth.uid()
          or public.is_pool_member(b.pool_id)
        )
    )
  );

create policy "group_picks_insert" on public.group_picks
  for insert with check (
    exists (
      select 1 from public.brackets b
      where b.id = group_picks.bracket_id
        and b.user_id = auth.uid()
    )
  );

create policy "group_picks_update_own" on public.group_picks
  for update using (
    exists (
      select 1 from public.brackets b
      where b.id = group_picks.bracket_id
        and b.user_id = auth.uid()
    )
  );

-- Bracket picks: follow bracket access
create policy "bracket_picks_select" on public.bracket_picks
  for select using (
    exists (
      select 1 from public.brackets b
      where b.id = bracket_picks.bracket_id
        and (
          b.user_id = auth.uid()
          or public.is_pool_member(b.pool_id)
        )
    )
  );

create policy "bracket_picks_insert" on public.bracket_picks
  for insert with check (
    exists (
      select 1 from public.brackets b
      where b.id = bracket_picks.bracket_id
        and b.user_id = auth.uid()
    )
  );

create policy "bracket_picks_update_own" on public.bracket_picks
  for update using (
    exists (
      select 1 from public.brackets b
      where b.id = bracket_picks.bracket_id
        and b.user_id = auth.uid()
    )
  );
