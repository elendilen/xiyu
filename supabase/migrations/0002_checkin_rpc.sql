-- 曦羽 · M3 数据层增量：打卡 RPC
-- 服务端统一校验「成员身份 + 当日防重 + 每日事件修为上限」，客户端只负责调用。
-- 日上限语义见 lib/rewards.ts：dailyEventCap=30，作用于「打卡 + 照片」合计（couple 范围），
-- 打卡拟发 5，入账 = min(5, 30 - 当日已入账日常修为)。时间修为 +10/天不在此上限内。

create or replace function public.do_checkin(p_content text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := current_date;
  v_day_total int;
  v_value int;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception '未登录';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception '不是家庭成员';
  end if;

  -- 每人每天仅一次打卡（checkins 首条唯一）
  if exists (
    select 1 from public.checkins
    where author_id = v_uid and date = v_day and is_first
  ) then
    raise exception '今日已打卡';
  end if;

  -- 当日已入账的日常修为（打卡 + 照片，couple 范围，跳过撤销）
  select coalesce(sum(value), 0) into v_day_total
  from public.cultivation_events
  where scope = 'couple'
    and source_type in ('checkin', 'photo')
    and occurred_at = v_day
    and not revoked;

  -- 入账值 = min(打卡 5, 剩余额度)，额度下限钳为 0
  v_value := least(5, greatest(0, 30 - v_day_total));

  -- 首条打卡记录
  insert into public.checkins (author_id, content, date, is_first)
  values (v_uid, coalesce(p_content, ''), v_day, true);

  -- 修为流水（source_type + source_id 防重）
  insert into public.cultivation_events
    (profile_id, scope, source_type, source_id, value, occurred_at, note)
  values (
    v_uid, 'couple', 'checkin',
    'checkin:' || v_uid::text || ':' || to_char(v_day, 'YYYY-MM-DD'),
    v_value, v_day, coalesce(p_content, '')
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.do_checkin(text) from public, anon;
grant execute on function public.do_checkin(text) to authenticated;
