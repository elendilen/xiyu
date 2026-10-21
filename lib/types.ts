// 曦羽 · 数据库行类型（对应 Supabase public schema）

export type RealmType = 'mortal' | 'immortal';
export type Role = 'owner' | 'dao_lv' | 'xian_tong';

export interface Profile {
  id: string;
  nickname: string;
  dao_name: string;
  avatar: string | null;
  role: Role;
  realm_type: RealmType;
  cultivation_start_date: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  together_date: string | null;
  married_date: string | null;
  theme_color: string;
  current_homestead_style: string;
  notify_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CultivationEventRow {
  id: string;
  profile_id: string;
  scope: string;
  source_type: string;
  source_id: string;
  value: number;
  occurred_at: string;
  note: string;
  revoked: boolean;
  created_at: string;
}

export interface CheckinRow {
  id: string;
  author_id: string;
  content: string;
  date: string;
  is_first: boolean;
  created_at: string;
}

export interface TimelineRow {
  id: string;
  date: string;
  title: string;
  description: string;
  location: string;
  type: string;
  created_by: string | null;
  created_at: string;
}
