-- Polyglot's database. Paste this into Supabase (SQL Editor, New query) and
-- press Run. It is safe to run again: it only creates what is missing.
--
-- Everything is readable by anyone (the boards are public), and a signed-in
-- player can only add rows for themselves. Nothing can be edited or deleted
-- from the site, so a daily result is final once it is in.

-- The puzzle number for a moment in time, as in src/game.js: puzzle #1 is
-- day 0, 18 October 2026. Players use their own local date, so the checks
-- below allow a day either side.
create or replace function public.puzzle_day(at timestamptz default now())
returns integer language sql stable set search_path = '' as $$
  select (at at time zone 'utc')::date - date '2026-10-18'
$$;

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_results (
  user_id uuid not null references public.profiles on delete cascade,
  day integer not null check (day >= 0),
  guesses smallint not null check (guesses between 0 and 6),  -- 0 = not solved
  hard boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.arcade_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('speed', 'endless')),
  day integer not null check (day >= 0),
  score smallint not null check (score >= 0 and score <= case kind when 'speed' then 60 else 500 end),
  created_at timestamptz not null default now()
);
create index if not exists arcade_runs_board on public.arcade_runs (kind, day);

-- Each player's saved progress (streak, badges, collection...), so it follows
-- them between devices. Only the player can read or write their own.
create table if not exists public.saves (
  user_id uuid primary key references public.profiles on delete cascade,
  data jsonb not null check (octet_length(data::text) < 200000),
  updated_at timestamptz not null default now()
);

-- ---------- profiles come from GitHub ----------
-- Filled in when someone signs in, from their GitHub account, so nobody can
-- choose someone else's name.
create or replace function public.save_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'user_name',
                   new.raw_user_meta_data ->> 'preferred_username',
                   'player-' || left(new.id::text, 8)),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url;
  return new;
end $$;

drop trigger if exists on_auth_user_saved on auth.users;
create trigger on_auth_user_saved
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.save_profile();

-- ---------- limits ----------
create or replace function public.limit_runs()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.arcade_runs where user_id = new.user_id and day = new.day) >= 200 then
    raise exception 'Too many runs today';
  end if;
  return new;
end $$;

drop trigger if exists limit_runs on public.arcade_runs;
create trigger limit_runs before insert on public.arcade_runs
  for each row execute function public.limit_runs();

-- ---------- who can do what ----------
alter table public.profiles enable row level security;
alter table public.daily_results enable row level security;
alter table public.arcade_runs enable row level security;
alter table public.saves enable row level security;

drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles for select using (true);

drop policy if exists "Results are public" on public.daily_results;
create policy "Results are public" on public.daily_results for select using (true);
drop policy if exists "Players add their own results" on public.daily_results;
create policy "Players add their own results" on public.daily_results for insert to authenticated
  with check (user_id = (select auth.uid())
              and day between public.puzzle_day() - 7 and public.puzzle_day() + 1);

drop policy if exists "Runs are public" on public.arcade_runs;
create policy "Runs are public" on public.arcade_runs for select using (true);
drop policy if exists "Players add their own runs" on public.arcade_runs;
create policy "Players add their own runs" on public.arcade_runs for insert to authenticated
  with check (user_id = (select auth.uid())
              and day between public.puzzle_day() - 7 and public.puzzle_day() + 1);

drop policy if exists "Players read their own save" on public.saves;
create policy "Players read their own save" on public.saves for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Players write their own save" on public.saves;
create policy "Players write their own save" on public.saves for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Players update their own save" on public.saves;
create policy "Players update their own save" on public.saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.profiles, public.daily_results, public.arcade_runs to anon, authenticated;
grant insert on public.daily_results, public.arcade_runs to authenticated;
grant select, insert, update on public.saves to authenticated;

-- ---------- leaderboards ----------
-- This week's boards: the seven days up to `today`. Points match the site:
-- 6 for a one-guess win, down to 1 for six guesses.
create or replace function public.daily_board(today integer)
returns table (username text, avatar_url text, points bigint, wins bigint)
language sql stable set search_path = '' as $$
  select p.username, p.avatar_url,
         coalesce(sum(7 - r.guesses) filter (where r.guesses > 0), 0),
         count(*) filter (where r.guesses > 0)
  from public.daily_results r
  join public.profiles p on p.id = r.user_id
  where r.day between greatest(0, today - 6) and today
  group by p.id
  order by 3 desc, 4 desc, p.username
  limit 50
$$;

create or replace function public.arcade_board(board text, today integer)
returns table (username text, avatar_url text, score smallint)
language sql stable set search_path = '' as $$
  select p.username, p.avatar_url, max(a.score)
  from public.arcade_runs a
  join public.profiles p on p.id = a.user_id
  where a.kind = board and a.day between greatest(0, today - 6) and today
  group by p.id
  order by 3 desc, p.username
  limit 50
$$;

grant execute on function public.puzzle_day(timestamptz), public.daily_board(integer),
  public.arcade_board(text, integer) to anon, authenticated;
