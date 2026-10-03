create table if not exists public.race_scores (
  player_id  text primary key,
  name       text not null check (char_length(name) between 1 and 20),
  best_score integer not null default 0,
  best_time  numeric(6,1),
  updated_at timestamptz not null default now()
);

alter table public.race_scores enable row level security;
grant select on public.race_scores to anon;

create policy "anyone can read race scores"
  on public.race_scores for select using (true);

-- Players can only save through this function (it never lowers a best score or best time)
create or replace function public.submit_race(p_id text, p_name text, p_score int, p_time numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_name  := left(trim(p_name), 20);
  p_score := greatest(0, least(p_score, 200000));
  if p_time is not null and (p_time < 20 or p_time > 1000) then p_time := null; end if;
  if p_id is null or char_length(p_id) < 10 or p_name = '' then
    raise exception 'bad input';
  end if;

  insert into public.race_scores (player_id, name, best_score, best_time)
  values (p_id, p_name, p_score, p_time)
  on conflict (player_id) do update set
    name       = excluded.name,
    best_score = greatest(public.race_scores.best_score, excluded.best_score),
    best_time  = case
                   when excluded.best_time is null then public.race_scores.best_time
                   when public.race_scores.best_time is null then excluded.best_time
                   else least(public.race_scores.best_time, excluded.best_time)
                 end,
    updated_at = case when excluded.best_score > public.race_scores.best_score
                      then now() else public.race_scores.updated_at end;
end $$;

grant execute on function public.submit_race(text, text, int, numeric) to anon;
