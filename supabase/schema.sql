-- Polyglot's database. Paste this into Supabase (SQL Editor, New query) and
-- press Run. It is safe to run again: it only creates what is missing.
--
-- The boards are readable by anyone. The daily puzzles are not: they live in
-- the private schema, which the site's API keys can't reach, and the site
-- only ever sees them through play_daily() at the bottom of this file. Daily
-- results are written by play_daily() too, never by the site directly, so a
-- result on the board is one the server watched being played.
--
-- After this file, run languages.sql (the clue traits), then the daily
-- puzzles, which are kept out of the public repository.

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
-- Filled in when someone signs in, from their GitHub identity, so nobody can
-- choose someone else's name. The identity is written only by Supabase's
-- sign-in. (Not auth.users.raw_user_meta_data: a signed-in player can change
-- their own copy of that through the API, and so could have renamed
-- themselves to anyone.)
create or replace function public.save_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider <> 'github' then
    return new;
  end if;
  insert into public.profiles (id, username, avatar_url)
  values (new.user_id,
          coalesce(new.identity_data ->> 'user_name',
                   new.identity_data ->> 'preferred_username',
                   'player-' || left(new.user_id::text, 8)),
          new.identity_data ->> 'avatar_url')
  on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url;
  return new;
end $$;

drop trigger if exists on_auth_user_saved on auth.users;
drop trigger if exists on_identity_saved on auth.identities;
create trigger on_identity_saved
  after insert or update of identity_data on auth.identities
  for each row execute function public.save_profile();

-- Profiles made before this, from the old source, are corrected from the
-- GitHub identity.
insert into public.profiles (id, username, avatar_url)
select i.user_id,
       coalesce(i.identity_data ->> 'user_name', i.identity_data ->> 'preferred_username',
                'player-' || left(i.user_id::text, 8)),
       i.identity_data ->> 'avatar_url'
from auth.identities i
where i.provider = 'github'
on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url;

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
-- Daily results are only ever written by play_daily(), from guesses it has
-- checked itself. (Before the answers moved to the server, the site sent
-- results directly; this removes that route.)
drop policy if exists "Players add their own results" on public.daily_results;
revoke insert, update, delete on public.daily_results from anon, authenticated;

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

-- Supabase gives the API roles every right on new tables and leaves the rest
-- to the policies above. Take away what the site never needs, so those
-- requests are refused outright rather than quietly matching no rows.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke update, delete on public.arcade_runs from anon, authenticated;
revoke delete on public.saves from anon, authenticated;
revoke all on public.saves from anon;
grant select on public.profiles, public.daily_results, public.arcade_runs to anon, authenticated;
grant insert on public.arcade_runs to authenticated;
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

-- ---------- the daily puzzle ----------
-- The traits each guess is compared on. They are public (the site shows them
-- on the Languages page); languages.sql fills this table from data/languages.js.
create table if not exists public.languages (
  name text primary key,
  year smallint not null,
  paradigm text not null,
  typing text not null,
  execution text not null,
  family text not null
);
alter table public.languages enable row level security;
drop policy if exists "Languages are public" on public.languages;
create policy "Languages are public" on public.languages for select using (true);
revoke insert, update, delete on public.languages from anon, authenticated;
grant select on public.languages to anon, authenticated;

-- The puzzles and the answers. The API only exposes the public schema, and no
-- visitor role has any rights here, so the only way in is play_daily().
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.daily_puzzles (
  day integer primary key check (day >= 0),
  language text not null references public.languages (name),
  lines text[] not null check (cardinality(lines) between 5 and 14)
);

-- A signed-in player's guesses for a recent puzzle, saved as they are made,
-- so the result can't be rewritten afterwards and follows them between devices.
create table if not exists private.daily_plays (
  user_id uuid not null references public.profiles on delete cascade,
  day integer not null,
  guesses text[] not null default '{}' check (cardinality(guesses) <= 6),
  hard boolean not null default false,
  primary key (user_id, day)
);

alter table private.daily_puzzles enable row level security;
alter table private.daily_plays enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

-- Plays a daily puzzle as far as `guessed` goes and returns what the player
-- has earned: the lines they may see, the shape of the hidden ones, the clues
-- for each guess, and the answer once the puzzle is over (solved, or six
-- guesses used). Puzzles run out? It starts again from the first one.
--
-- For a signed-in player and a puzzle that is current somewhere in the world
-- (yesterday, today or tomorrow in UTC), the guesses are saved as they are
-- made and can only be added to: the saved copy always wins, and the result
-- goes on the board once the puzzle is over. Older puzzles (the archive) are
-- checked but not saved.
create or replace function public.play_daily(for_day integer, guessed text[] default '{}', hard_mode boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today constant integer := public.puzzle_day();
  me constant uuid := auth.uid();
  last_day integer;
  puzzle private.daily_puzzles;
  answer public.languages;
  played private.daily_plays;
  guess public.languages;
  tracked boolean;
  is_hard boolean := coalesce(hard_mode, false);
  results jsonb := '[]';
  misses integer := 0;
  won boolean := false;
  done boolean;
  total integer;
  shown integer;
  diff integer;
begin
  if for_day is null or for_day < 0 or for_day > today + 1 then
    raise exception 'That puzzle isn''t available yet';
  end if;
  select max(p.day) into last_day from private.daily_puzzles p;
  if last_day is null then
    raise exception 'There are no puzzles yet';
  end if;
  select * into puzzle from private.daily_puzzles p
  where p.day = case when for_day <= last_day then for_day else for_day % (last_day + 1) end;
  if not found then
    raise exception 'There is no puzzle for that day';
  end if;
  select * into strict answer from public.languages l where l.name = puzzle.language;

  -- Every guess must be a known language, guessed once, and nothing may come
  -- after the right answer.
  guessed := coalesce(guessed, '{}');
  if cardinality(guessed) > 6 then
    raise exception 'A puzzle has at most 6 guesses';
  end if;
  for i in 1 .. cardinality(guessed) loop
    if guessed[i] is null or not exists (select 1 from public.languages l where l.name = guessed[i]) then
      raise exception 'Not in the language list: %', coalesce(guessed[i], 'nothing');
    end if;
    if guessed[i] = any (guessed[1 : i - 1]) then
      raise exception 'You already guessed %', guessed[i];
    end if;
    if i > 1 and guessed[i - 1] = answer.name then
      raise exception 'That puzzle is already solved';
    end if;
  end loop;

  tracked := me is not null and for_day between today - 1 and today + 1;
  if tracked then
    if cardinality(guessed) > 0 then
      insert into private.daily_plays (user_id, day, hard) values (me, for_day, is_hard)
      on conflict (user_id, day) do nothing;
    end if;
    select * into played from private.daily_plays dp where dp.user_id = me and dp.day = for_day for update;
    if found then
      -- New guesses are added only if they continue the saved ones. Hard mode
      -- is fixed by the first guess.
      if cardinality(guessed) > cardinality(played.guesses)
         and guessed[1 : cardinality(played.guesses)] = played.guesses then
        update private.daily_plays dp
        set guesses = guessed, hard = case when cardinality(played.guesses) = 0 then is_hard else dp.hard end
        where dp.user_id = me and dp.day = for_day
        returning * into played;
      end if;
      guessed := played.guesses;
      is_hard := played.hard;
    end if;
  end if;

  for i in 1 .. cardinality(guessed) loop
    select * into strict guess from public.languages l where l.name = guessed[i];
    diff := answer.year - guess.year;
    results := results || jsonb_build_object(
      'correct', guess.name = answer.name,
      'paradigm', case when guess.paradigm = answer.paradigm then 'hit' else 'miss' end,
      'year', case when diff = 0 then 'hit' when abs(diff) <= 5 then 'close' else 'miss' end,
      'yearArrow', case when diff > 0 then 'up' when diff < 0 then 'down' else '' end,
      'typing', case when guess.typing = answer.typing then 'hit' else 'miss' end,
      'execution', case when guess.execution = answer.execution then 'hit' else 'miss' end,
      'family', case when guess.family = answer.family then 'hit' else 'miss' end);
    if guess.name = answer.name then won := true; else misses := misses + 1; end if;
  end loop;

  done := won or cardinality(guessed) >= 6;
  total := cardinality(puzzle.lines);
  shown := case when done then total else least(total, 3 + 2 * misses) end;

  if tracked and done then
    insert into public.daily_results (user_id, day, guesses, hard)
    values (me, for_day, case when won then cardinality(guessed) else 0 end, is_hard)
    on conflict (user_id, day) do nothing;
  end if;

  return jsonb_build_object(
    'guesses', to_jsonb(guessed),
    'hard', is_hard,
    'results', results,
    'lines', to_jsonb(puzzle.lines[1 : shown]),
    -- [indent, length] of each line still hidden, so the site can draw a bar
    -- the same shape without knowing what it says.
    'hidden', (select coalesce(jsonb_agg(jsonb_build_array(
                         length(t) - length(regexp_replace(t, '^\s+', '')),
                         length(regexp_replace(t, '^\s+|\s+$', '', 'g'))) order by n), '[]')
               from unnest(puzzle.lines[shown + 1 : total]) with ordinality as h(t, n)),
    'total', total,
    'done', done,
    'won', won,
    'answer', case when done then to_jsonb(answer.name) else 'null'::jsonb end);
end $$;

revoke all on function public.play_daily(integer, text[], boolean) from public;
grant execute on function public.play_daily(integer, text[], boolean) to anon, authenticated;

-- Tell the API about the new function straight away.
notify pgrst, 'reload schema';
