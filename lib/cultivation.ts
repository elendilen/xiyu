// 曦羽 · 修为计算核心（纯函数，前后端共用）
// 修为 = 时间修为 + Σ(事件修为)，是实时计算的派生值，不单独存储总修为。
// 流水表只读、撤销自动重算；瓶颈期事件照常入账，突破后一次性生效（厚积薄发）。

import {
  BOTTLENECK_PROBABILITY,
  getRealms,
  SUB_STAGES,
  type Realm,
  type RealmType,
  type SubStage,
} from './realms';
import { REWARDS } from './rewards';

export type SourceType =
  | 'checkin'
  | 'photo'
  | 'place'
  | 'letter'
  | 'wishlist'
  | 'anniversary'
  | 'streak';

export interface CultivationEvent {
  /** 流水 id（sourceType + sourceId 唯一防重） */
  id: string;
  sourceType: SourceType;
  sourceId: string;
  /** 最终入账修为（已按日上限截断） */
  value: number;
  /** 发生日期 YYYY-MM-DD */
  occurredAt: string;
  /** 软删除（撤销）标记 */
  revoked?: boolean;
}

export interface BottleneckState {
  /** 卡在哪个突破上 = 要进入的境界 key；飞升用 'ascension' */
  targetRealmKey: string;
  isBottleneck: boolean;
  triggeredAt: string; // YYYY-MM-DD
}

export interface CultivationResult {
  timeValue: number; // 时间修为
  eventValue: number; // 事件修为（已折算）
  rawTotal: number; // 未封顶总修为
  effectiveTotal: number; // 封顶后的显示修为
  realm: Realm;
  realmIndex: number;
  subStage: SubStage;
  subStageIndex: number;
  progress: number; // 0..1 当前小阶内进度
  isAtPeak: boolean; // 到达大圆满，等待突破
  isBottleneck: boolean;
  bottleneckDays: number;
  backlogValue: number; // 瓶颈期积压修为
}

/** 解析 YYYY-MM-DD（UTC，避免时区偏移） */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** to - from 的整天数（UTC，无 DST 干扰） */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

/** 时间修为 = (今天 − 起点日) × perDay，负值钳为 0 */
export function timeValue(startDate: string, today: string, perDay: number = REWARDS.timePerDay): number {
  return Math.max(0, daysBetween(startDate, today)) * perDay;
}

/** 事件修为求和（跳过已撤销） */
export function sumEvents(events: CultivationEvent[]): number {
  return events.reduce((s, e) => (e.revoked ? s : s + e.value), 0);
}

/** 今日日常修为剩余额度（打卡 + 照片合计 ≤ 上限） */
export function remainingDailyQuota(dayTotal: number, cap: number = REWARDS.dailyEventCap): number {
  return Math.max(0, cap - dayTotal);
}

/** 新事件入账值 = min(拟发值, 剩余额度)，在写入流水表时判定 */
export function cappedEventValue(dayTotal: number, proposed: number, cap: number = REWARDS.dailyEventCap): number {
  return Math.min(proposed, remainingDailyQuota(dayTotal, cap));
}

/** 连续打卡里程碑：连续天数正好命中 3/7/30/100 时返回该档奖励（一次性发放） */
export function streakMilestoneAward(streakDays: number): { milestone: number; award: number } | null {
  const milestones = Object.keys(REWARDS.streak).map(Number).sort((a, b) => a - b);
  for (const m of milestones) {
    if (streakDays === m) {
      return { milestone: m, award: REWARDS.streak[m as keyof typeof REWARDS.streak] };
    }
  }
  return null;
}

export function bottleneckProbability(targetRealmKey: string): number {
  return BOTTLENECK_PROBABILITY[targetRealmKey] ?? 0;
}

/** 掷一次瓶颈概率，注入 rng 便于测试 */
export function rollBottleneck(targetRealmKey: string, rng: () => number = Math.random): boolean {
  return rng() < bottleneckProbability(targetRealmKey);
}

/** 瓶颈封顶值（卡住的修为门槛），无法定位时返回 null */
function bottleneckCap(realms: Realm[], targetRealmKey: string): number | null {
  if (targetRealmKey === 'ascension') return realms[realms.length - 1].enterAt;
  const idx = realms.findIndex((r) => r.key === targetRealmKey);
  if (idx <= 0) return null;
  return realms[idx].enterAt;
}

/** 瓶颈时被"按住"的境界下标（= 要进入的境界的前一境） */
function heldRealmIndex(realms: Realm[], targetRealmKey: string): number {
  if (targetRealmKey === 'ascension') return realms.length - 1;
  return Math.max(0, realms.findIndex((r) => r.key === targetRealmKey) - 1);
}

/** 无瓶颈时的自然境界/小阶（大圆满四等分） */
function naturalState(realms: Realm[], total: number) {
  let idx = 0;
  for (let i = 0; i < realms.length; i++) {
    if (total >= realms[i].enterAt) idx = i;
  }
  const realm = realms[idx];
  const isLast = idx === realms.length - 1;
  // 最后一境（渡劫/圣人）：进入即大圆满，等待飞升/圆满
  if (isLast) {
    return { realm, realmIndex: idx, subStage: '大圆满' as SubStage, subStageIndex: 3, progress: 1, isAtPeak: true };
  }
  const upper = realms[idx + 1].enterAt;
  const quarter = (upper - realm.enterAt) / 4;
  const offset = total - realm.enterAt;
  const subStageIndex = Math.min(3, Math.floor(offset / quarter));
  const progress = Math.min(1, (offset - subStageIndex * quarter) / quarter);
  return {
    realm,
    realmIndex: idx,
    subStage: SUB_STAGES[subStageIndex] as SubStage,
    subStageIndex,
    progress,
    isAtPeak: total >= upper,
  };
}

export function computeCultivation(args: {
  startDate: string;
  realmType: RealmType;
  events: CultivationEvent[];
  bottleneck?: BottleneckState | null;
  today: string;
  timePerDay?: number;
  eventScale?: number;
}): CultivationResult {
  const { startDate, realmType, events, bottleneck = null, today, timePerDay: perDay, eventScale } = args;
  const scale = eventScale ?? (realmType === 'immortal' ? REWARDS.immortalEventScale : 1);
  const realms = getRealms(realmType);
  const tv = timeValue(startDate, today, perDay ?? REWARDS.timePerDay);
  const ev = sumEvents(events) * scale;
  const rawTotal = tv + ev;

  // 瓶颈生效：修为已越过门槛 => 封顶，停在上一境大圆满，积压入 backlog
  if (bottleneck && bottleneck.isBottleneck) {
    const cap = bottleneckCap(realms, bottleneck.targetRealmKey);
    if (cap !== null && rawTotal >= cap) {
      const heldIdx = heldRealmIndex(realms, bottleneck.targetRealmKey);
      return {
        timeValue: tv,
        eventValue: ev,
        rawTotal,
        effectiveTotal: cap,
        realm: realms[heldIdx],
        realmIndex: heldIdx,
        subStage: '大圆满',
        subStageIndex: 3,
        progress: 1,
        isAtPeak: true,
        isBottleneck: true,
        bottleneckDays: Math.max(0, daysBetween(bottleneck.triggeredAt, today)),
        backlogValue: rawTotal - cap,
      };
    }
  }

  const nat = naturalState(realms, rawTotal);
  return {
    timeValue: tv,
    eventValue: ev,
    rawTotal,
    effectiveTotal: rawTotal,
    realm: nat.realm,
    realmIndex: nat.realmIndex,
    subStage: nat.subStage,
    subStageIndex: nat.subStageIndex,
    progress: nat.progress,
    isAtPeak: nat.isAtPeak,
    isBottleneck: false,
    bottleneckDays: 0,
    backlogValue: 0,
  };
}

/** 逆天改命：改日期/撤销事件后，自然修为已低于封顶门槛时瓶颈作废 */
export function isBottleneckStillValid(args: {
  bottleneck: BottleneckState;
  startDate: string;
  realmType: RealmType;
  events: CultivationEvent[];
  today: string;
  timePerDay?: number;
  eventScale?: number;
}): boolean {
  const realms = getRealms(args.realmType);
  const cap = bottleneckCap(realms, args.bottleneck.targetRealmKey);
  if (cap === null) return false;
  const scale = args.eventScale ?? (args.realmType === 'immortal' ? REWARDS.immortalEventScale : 1);
  const tv = timeValue(args.startDate, args.today, args.timePerDay ?? REWARDS.timePerDay);
  const rawTotal = tv + sumEvents(args.events) * scale;
  return rawTotal >= cap;
}
