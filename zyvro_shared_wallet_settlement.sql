-- Zyvro shared multiplayer wallet + settlement patch
-- Run this AFTER zyvro_shared_rounds.sql in Supabase SQL Editor.
-- Virtual coins only. No deposits or withdrawals.

create table if not exists public.zyvro_shared_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 1000 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.zyvro_shared_bets
  add column if not exists payout bigint,
  add column if not exists net bigint,
  add column if not exists settled_at timestamptz;

alter table public.zyvro_shared_wallets enable row level security;
drop policy if exists "players read own shared wallet" on public.zyvro_shared_wallets;
create policy "players read own shared wallet" on public.zyvro_shared_wallets
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.zyvro_shared_wallets from anon, authenticated;
grant select on public.zyvro_shared_wallets to authenticated;

create or replace function public.zyvro_settle_expired_shared_bets()
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  b record;
  n integer;
  c text;
  sz text;
  pay bigint;
  v_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  -- Only settle rounds that have ended. Row locks plus settled_at guard against duplicate payouts.
  for b in
    select sb.id, sb.period, sb.user_id, sb.selections, sb.stake_each, sb.quantity,
           sb.total_stake, sr.result_number
    from public.zyvro_shared_bets sb
    join public.zyvro_shared_rounds sr on sr.period = sb.period
    where sb.settled_at is null and sr.ends_at <= v_now
    order by sr.ends_at, sb.id
    for update of sb skip locked
  loop
    n := b.result_number;
    c := case when n in (0,5) then 'Fuchsia'
              when n in (1,3,7,9) then 'Aqua' else 'Gold' end;
    sz := case when n >= 5 then 'Big' else 'Small' end;
    select coalesce(sum(case
      when (e->>'market'='number' and e->>'val'=n::text)
        or (e->>'market'='color' and e->>'val'=c)
        or (e->>'market'='size' and e->>'val'=sz)
      then (b.stake_each::bigint * b.quantity * 2) else 0 end),0)
      into pay from jsonb_array_elements(b.selections) e;

    insert into public.zyvro_shared_wallets(user_id,balance)
      values (b.user_id,1000) on conflict (user_id) do nothing;
    update public.zyvro_shared_wallets
      set balance=balance+pay, updated_at=v_now where user_id=b.user_id;
    update public.zyvro_shared_bets
      set payout=pay, net=pay-b.total_stake, settled_at=v_now
      where id=b.id and settled_at is null;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- Ensure each signed-in player has a persistent 1000-coin wallet; settle expired bets first.
create or replace function public.zyvro_get_wallet_balance()
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid; v_balance bigint;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Login required'; end if;
  perform public.zyvro_settle_expired_shared_bets();
  insert into public.zyvro_shared_wallets(user_id,balance) values(v_uid,1000)
    on conflict(user_id) do nothing;
  select balance into v_balance from public.zyvro_shared_wallets where user_id=v_uid for update;
  -- Refill only when balance is exactly zero.
  if v_balance=0 then
    update public.zyvro_shared_wallets set balance=1000,updated_at=clock_timestamp()
      where user_id=v_uid and balance=0 returning balance into v_balance;
  end if;
  return v_balance;
end;
$$;

-- Replace bet RPC: one bet per user per period, server-side deduction, and no client-controlled balance.
create or replace function public.zyvro_place_shared_bet(
  p_period text, p_selections jsonb, p_stake_each integer, p_quantity integer default 1
)
returns public.zyvro_shared_bets
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid; v_round public.zyvro_shared_rounds%rowtype;
  v_bet public.zyvro_shared_bets%rowtype; v_balance bigint; v_total bigint;
  v_now timestamptz := clock_timestamp();
begin
  v_uid := auth.uid(); if v_uid is null then raise exception 'Login required'; end if;
  if p_stake_each not in (1,5,10,20,50,100) then raise exception 'Invalid stake'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>100 then raise exception 'Invalid quantity'; end if;
  if jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections)<1 or jsonb_array_length(p_selections)>3 then
    raise exception 'Choose 1 to 3 selections'; end if;
  if exists(select 1 from jsonb_array_elements(p_selections) e
    where coalesce(e->>'market','') not in ('number','color','size')
      or (e->>'market'='number' and coalesce(e->>'val','') !~ '^[0-9]$')
      or (e->>'market'='color' and coalesce(e->>'val','') not in ('Aqua','Gold','Fuchsia'))
      or (e->>'market'='size' and coalesce(e->>'val','') not in ('Big','Small')))
    then raise exception 'Invalid selection'; end if;
  select * into v_round from public.zyvro_shared_rounds where period=p_period for update;
  if not found then raise exception 'Round not found; refresh game'; end if;
  if v_now<v_round.starts_at or v_now>=v_round.ends_at then raise exception 'Betting is closed for this round'; end if;

  insert into public.zyvro_shared_wallets(user_id,balance) values(v_uid,1000) on conflict(user_id) do nothing;
  select balance into v_balance from public.zyvro_shared_wallets where user_id=v_uid for update;
  if v_balance=0 then
    update public.zyvro_shared_wallets set balance=1000,updated_at=v_now where user_id=v_uid returning balance into v_balance;
  end if;
  v_total := p_stake_each::bigint*p_quantity*jsonb_array_length(p_selections);
  if v_balance<v_total then raise exception 'Not enough virtual coins'; end if;
  update public.zyvro_shared_wallets set balance=balance-v_total,updated_at=v_now where user_id=v_uid;
  insert into public.zyvro_shared_bets(period,user_id,selections,stake_each,quantity)
    values(p_period,v_uid,p_selections,p_stake_each,p_quantity) returning * into v_bet;
  return v_bet;
exception when unique_violation then raise exception 'You already placed a bet in this round';
end;
$$;

-- get_shared_round also triggers one-time settlement for all ended shared rounds.
create or replace function public.zyvro_get_shared_round()
returns table(period text, starts_at timestamptz, ends_at timestamptz,
              result_number integer, seconds_left integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_epoch bigint; v_start bigint; v_period text; v_start_ts timestamptz;
  v_end_ts timestamptz; v_result integer;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  perform public.zyvro_settle_expired_shared_bets();
  v_epoch := floor(extract(epoch from clock_timestamp()))::bigint;
  v_start := (v_epoch/30)*30;
  v_period := to_char(to_timestamp(v_start) at time zone 'UTC','YYYYMMDDHH24MISS');
  v_start_ts := to_timestamp(v_start); v_end_ts := to_timestamp(v_start+30);
  insert into public.zyvro_shared_rounds(period,starts_at,ends_at,result_number)
    values(v_period,v_start_ts,v_end_ts,floor(random()*10)::integer) on conflict(period) do nothing;
  select r.result_number into v_result from public.zyvro_shared_rounds r where r.period=v_period;
  return query select v_period,v_start_ts,v_end_ts,
    case when clock_timestamp()>=v_end_ts then v_result else null end,
    greatest(0,ceil(extract(epoch from(v_end_ts-clock_timestamp())))::integer);
end;
$$;

revoke all on function public.zyvro_settle_expired_shared_bets() from public, anon, authenticated;
revoke all on function public.zyvro_get_wallet_balance() from public;
grant execute on function public.zyvro_get_wallet_balance() to authenticated;
revoke all on function public.zyvro_get_shared_round() from public;
grant execute on function public.zyvro_get_shared_round() to authenticated;
revoke all on function public.zyvro_place_shared_bet(text,jsonb,integer,integer) from public;
grant execute on function public.zyvro_place_shared_bet(text,jsonb,integer,integer) to authenticated;
