-- 曦羽 · 初始化迁移（M2 数据层）
-- 14 张表 + RLS 策略 + 邀请码注册函数 + 私有 Storage bucket
--
-- ⚠️ 本文件尚未在 Supabase 上执行验证 —— 这是 M2 的验收点（需你的 Supabase 项目）。
-- 设计要点：
--   * 修为是派生值：不存总修为，只存 cultivation_events 流水，可审计/撤销/重算；
--   * 邀请码经 security definer 函数消费，客户端不直接写 invites，绕过 RLS 猜码；
--   * 所有表开 RLS，仅家庭成员（有 profile 记录）可读写，非成员全部拒绝；
--   * cultivation_events 的 value 由客户端传入（M3 会改为经 RPC 按 rewards 配置 + 日上限校验）。

create extension if not exists pgcrypto;

-- ============ 1. profiles 成员档案 ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '',
  dao_name text not null default '',           -- 道号
  avatar text,                                  -- Q 版小人形象（P3 用，P1 静态头像占位）
  role text not null default 'dao_lv' check (role in ('owner', 'dao_lv', 'xian_tong')),
  realm_type text not null default 'mortal' check (realm_type in ('mortal', 'immortal')),
  cultivation_start_date date,                  -- 修为起点日（仙童=出生日；道侣共享进度读 settings）
  created_at timestamptz not null default now()
);

-- ============ 成员判定辅助（security definer 绕过 RLS，避免递归） ============
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- ============ 2. settings 全局配置（单例） ============
create table public.settings (
  id int primary key default 1 check (id = 1),
  together_date date,                           -- 在一起日期（时间修为起点）
  married_date date,                            -- 结婚日期（飞升后，仙界起点）
  theme_color text not null default '#b08d57',
  current_homestead_style text not null default 'zhulin',
  notify_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ 3. invites 邀请码 ============
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  role text not null default 'dao_lv' check (role in ('dao_lv', 'xian_tong')),
  status text not null default 'unused' check (status in ('unused', 'used', 'revoked')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_by uuid references public.profiles(id) on delete set null,
  consumed_at timestamptz
);

-- ============ 4. cultivation_events 修为流水表（核心） ============
create table public.cultivation_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade, -- 谁做的（审计/展示）
  scope text not null default 'couple',         -- 'couple' 或 'child:<profile_id>'（P4 仙童独立进度）
  source_type text not null check (source_type in ('checkin', 'photo', 'place', 'letter', 'wishlist', 'anniversary', 'streak')),
  source_id text not null,                      -- 防重：source_type + source_id 唯一
  value integer not null check (value >= 0 and value <= 1000),
  occurred_at date not null default current_date,
  note text not null default '',
  revoked boolean not null default false,       -- 软删除（撤销）
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index cultivation_events_profile_idx on public.cultivation_events (profile_id);
create index cultivation_events_occurred_idx on public.cultivation_events (occurred_at);

-- ============ 5. timeline 时间节点（修炼史） ============
create table public.timeline (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  description text not null default '',
  location text not null default '',
  type text not null default 'event',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ 6. photos 留影阁 ============
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  url text not null,                            -- Storage URL（WebP，上传时剥离 EXIF，P1.5）
  category text not null default 'default',
  caption text not null default '',
  taken_at date,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ 7. letters 信件（鸿雁传书） ============
create table public.letters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',                -- 渲染做 XSS 过滤（富文本白名单/Markdown）
  author_id uuid references public.profiles(id) on delete set null,
  recipient text not null default '',           -- 谁写给谁
  date date not null default current_date,
  photo_url text,
  created_at timestamptz not null default now()
);

-- ============ 8. checkins 每日打卡（传音入密） ============
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  date date not null default current_date,
  is_first boolean not null default false,      -- 当日首条 = 完成打卡
  created_at timestamptz not null default now()
);
-- 每人每天仅一条"首条"记录
create unique index checkins_first_unique_idx on public.checkins (author_id, date) where is_first;

-- ============ 9. wishlist 历练任务 ============
create table public.wishlist (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard', 'epic')),
  done boolean not null default false,
  done_at date,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ 10. places 秘境（地图打卡，GCJ-02） ============
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gcj02_lng double precision not null,
  gcj02_lat double precision not null,
  date date not null default current_date,
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ 11. anniversaries 纪念日 ============
-- 每年当天首次登录自动发修为入流水表（source_id = anniversary:{id}:{year} 防重，P2 实现）
create table public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  month int not null check (month between 1 and 12),
  day int not null check (day between 1 and 31),
  year int,                                     -- 可选（纪念某一年份）
  yearly boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ 12. breakthroughs 突破记录 ============
create table public.breakthroughs (
  id uuid primary key default gen_random_uuid(),
  realm text not null,                          -- 突破进入的境界
  realm_type text not null check (realm_type in ('mortal', 'immortal')),
  content text not null default '',             -- 机缘内容（标题+日期+一句话）
  photo_url text,                               -- 必传（机缘照片）
  video_url text,                               -- 可选（≤30s ≤50MB）
  oath text,                                    -- 誓词（可选，渡劫动画展示）
  date date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ 13. bottleneck_state 瓶颈状态（单例：当前瓶颈） ============
create table public.bottleneck_state (
  id int primary key default 1 check (id = 1),
  target_realm_key text not null,               -- 要进入的境界 key / 'ascension'
  is_bottleneck boolean not null default true,
  triggered_at date not null default current_date,
  updated_at timestamptz not null default now()
);

-- ============ 14. decorations 装饰（P3） ============
create table public.decorations (
  id uuid primary key default gen_random_uuid(),
  decoration_key text not null,
  unlocked boolean not null default false,
  placed boolean not null default false,
  placed_x double precision,
  placed_y double precision,
  created_at timestamptz not null default now()
);

-- ============ RLS ============
alter table public.profiles          enable row level security;
alter table public.settings          enable row level security;
alter table public.invites           enable row level security;
alter table public.cultivation_events enable row level security;
alter table public.timeline          enable row level security;
alter table public.photos            enable row level security;
alter table public.letters           enable row level security;
alter table public.checkins          enable row level security;
alter table public.wishlist          enable row level security;
alter table public.places            enable row level security;
alter table public.anniversaries     enable row level security;
alter table public.breakthroughs     enable row level security;
alter table public.bottleneck_state  enable row level security;
alter table public.decorations       enable row level security;

-- profiles：成员互见，本人可改；profile 仅由 security definer 函数创建（无 insert 策略 = 拒绝）
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_member());
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- settings（单例）
create policy "settings_select" on public.settings for select using (public.is_member());
create policy "settings_insert" on public.settings for insert with check (public.is_member());
create policy "settings_update" on public.settings for update
  using (public.is_member()) with check (public.is_member());

-- invites：成员可见，owner 生成/撤销
create policy "invites_select" on public.invites for select using (public.is_member());
create policy "invites_insert" on public.invites for insert with check (public.is_owner());
create policy "invites_update" on public.invites for update
  using (public.is_owner()) with check (public.is_owner());

-- cultivation_events：成员可读；本人可写（M3 改经 RPC 校验）；本人/owner 可撤销
create policy "ce_select" on public.cultivation_events for select using (public.is_member());
create policy "ce_insert" on public.cultivation_events for insert
  with check (profile_id = auth.uid() and public.is_member());
create policy "ce_update" on public.cultivation_events for update
  using (profile_id = auth.uid() or public.is_owner())
  with check (profile_id = auth.uid() or public.is_owner());

-- timeline
create policy "timeline_select" on public.timeline for select using (public.is_member());
create policy "timeline_insert" on public.timeline for insert with check (public.is_member());
create policy "timeline_update" on public.timeline for update
  using (public.is_member()) with check (public.is_member());
create policy "timeline_delete" on public.timeline for delete using (public.is_owner());

-- photos
create policy "photos_select" on public.photos for select using (public.is_member());
create policy "photos_insert" on public.photos for insert with check (public.is_member());
create policy "photos_update" on public.photos for update
  using (public.is_member()) with check (public.is_member());
create policy "photos_delete" on public.photos for delete using (public.is_owner());

-- letters
create policy "letters_select" on public.letters for select using (public.is_member());
create policy "letters_insert" on public.letters for insert with check (public.is_member());
create policy "letters_update" on public.letters for update
  using (public.is_member()) with check (public.is_member());
create policy "letters_delete" on public.letters for delete using (public.is_owner());

-- checkins：本人发/改/删
create policy "checkins_select" on public.checkins for select using (public.is_member());
create policy "checkins_insert" on public.checkins for insert
  with check (author_id = auth.uid() and public.is_member());
create policy "checkins_update" on public.checkins for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "checkins_delete" on public.checkins for delete
  using (author_id = auth.uid() or public.is_owner());

-- wishlist
create policy "wishlist_select" on public.wishlist for select using (public.is_member());
create policy "wishlist_insert" on public.wishlist for insert with check (public.is_member());
create policy "wishlist_update" on public.wishlist for update
  using (public.is_member()) with check (public.is_member());
create policy "wishlist_delete" on public.wishlist for delete using (public.is_owner());

-- places
create policy "places_select" on public.places for select using (public.is_member());
create policy "places_insert" on public.places for insert with check (public.is_member());
create policy "places_update" on public.places for update
  using (public.is_member()) with check (public.is_member());
create policy "places_delete" on public.places for delete using (public.is_owner());

-- anniversaries
create policy "anniversaries_select" on public.anniversaries for select using (public.is_member());
create policy "anniversaries_insert" on public.anniversaries for insert with check (public.is_member());
create policy "anniversaries_update" on public.anniversaries for update
  using (public.is_member()) with check (public.is_member());
create policy "anniversaries_delete" on public.anniversaries for delete using (public.is_owner());

-- breakthroughs
create policy "breakthroughs_select" on public.breakthroughs for select using (public.is_member());
create policy "breakthroughs_insert" on public.breakthroughs for insert with check (public.is_member());
create policy "breakthroughs_update" on public.breakthroughs for update
  using (public.is_owner()) with check (public.is_owner());
create policy "breakthroughs_delete" on public.breakthroughs for delete using (public.is_owner());

-- bottleneck_state（单例）
create policy "bs_select" on public.bottleneck_state for select using (public.is_member());
create policy "bs_insert" on public.bottleneck_state for insert with check (public.is_member());
create policy "bs_update" on public.bottleneck_state for update
  using (public.is_member()) with check (public.is_member());

-- decorations
create policy "decorations_select" on public.decorations for select using (public.is_member());
create policy "decorations_insert" on public.decorations for insert with check (public.is_member());
create policy "decorations_update" on public.decorations for update
  using (public.is_member()) with check (public.is_member());
create policy "decorations_delete" on public.decorations for delete using (public.is_owner());

-- ============ 邀请码注册（security definer） ============
create or replace function public.register_with_invite(p_invite_code text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_exists boolean;
  v_invite public.invites%rowtype;
begin
  if v_uid is null then
    raise exception '未登录';
  end if;

  -- 已有 profile 直接返回
  if exists (select 1 from public.profiles where id = v_uid) then
    return v_uid;
  end if;

  select exists (select 1 from public.profiles where role = 'owner') into v_owner_exists;

  if not v_owner_exists then
    -- 冷启动：首个注册者成为 owner，无需邀请码
    insert into public.profiles (id, role, realm_type)
    values (v_uid, 'owner', 'mortal');
    return v_uid;
  end if;

  if p_invite_code is null then
    raise exception '邀请码无效';
  end if;

  select * into v_invite from public.invites where code = p_invite_code for update;

  if v_invite.code is null or v_invite.status <> 'unused' then
    raise exception '邀请码无效';
  end if;

  insert into public.profiles (id, role, realm_type, cultivation_start_date)
  values (
    v_uid,
    v_invite.role,
    case when v_invite.role = 'xian_tong' then 'immortal' else 'mortal' end,
    case when v_invite.role = 'xian_tong' then current_date else null end
  );

  update public.invites
  set status = 'used', consumed_by = v_uid, consumed_at = now()
  where id = v_invite.id;

  return v_uid;
end;
$$;

-- 仅 authenticated 可调用（默认 public 可执行，需收回）
revoke all on function public.register_with_invite(text) from public, anon;
grant execute on function public.register_with_invite(text) to authenticated;

-- ============ Storage（图片/视频，私有 bucket，P1.5 用） ============
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('videos', 'videos', false)
on conflict (id) do nothing;

create policy "photos_read" on storage.objects for select
  using (bucket_id = 'photos' and public.is_member());
create policy "photos_write" on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_member());
create policy "videos_read" on storage.objects for select
  using (bucket_id = 'videos' and public.is_member());
create policy "videos_write" on storage.objects for insert
  with check (bucket_id = 'videos' and public.is_member());
