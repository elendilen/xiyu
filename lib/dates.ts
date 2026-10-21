// 曦羽 · 本地日期工具（客户端显示用，日期均为 YYYY-MM-DD）
import { daysBetween } from './cultivation';

/** 本地时区今天 YYYY-MM-DD */
export function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 在一起天数（当天 = 0） */
export function daysTogether(togetherDate: string, today: string = localToday()): number {
  return Math.max(0, daysBetween(togetherDate, today));
}

/** 下一个周年纪念日（together_date 的月/日），返回日期与剩余天数 */
export function nextAnniversary(
  togetherDate: string,
  today: string = localToday(),
): { date: string; daysLeft: number } {
  const [y, m, d] = togetherDate.split('-').map(Number);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(midnight.getFullYear(), m - 1, d);
  if (next.getTime() < midnight.getTime()) {
    next = new Date(midnight.getFullYear() + 1, m - 1, d);
  }
  const daysLeft = Math.round((next.getTime() - midnight.getTime()) / 86400000);
  const ds = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  return { date: ds, daysLeft };
}
