import { describe, it, expect } from 'vitest';
import {
  computeCultivation,
  timeValue,
  daysBetween,
  sumEvents,
  remainingDailyQuota,
  cappedEventValue,
  streakMilestoneAward,
  bottleneckProbability,
  rollBottleneck,
  isBottleneckStillValid,
  type CultivationEvent,
  type BottleneckState,
} from './cultivation';

const D = '2025-01-01';

/** 用一个合成事件把总修为凑到 total（时间修为 = 0，便于直接验证境界映射） */
function stateAt(
  total: number,
  opts: {
    realmType?: 'mortal' | 'immortal';
    bottleneck?: BottleneckState | null;
    startDate?: string;
    today?: string;
    eventScale?: number;
  } = {},
) {
  const events: CultivationEvent[] =
    total === 0 ? [] : [{ id: 'e1', sourceType: 'wishlist', sourceId: 'w1', value: total, occurredAt: D }];
  return computeCultivation({
    startDate: opts.startDate ?? D,
    realmType: opts.realmType ?? 'mortal',
    events,
    bottleneck: opts.bottleneck ?? null,
    today: opts.today ?? D,
    eventScale: opts.eventScale,
  });
}

describe('时间修为', () => {
  it('按天数 × 10 计算', () => {
    expect(daysBetween('2025-01-01', '2025-01-02')).toBe(1);
    expect(timeValue('2025-01-01', '2025-01-01')).toBe(0);
    expect(timeValue('2025-01-01', '2025-01-11')).toBe(100);
  });

  it('起点日在未来时钳为 0', () => {
    expect(timeValue('2025-02-01', '2025-01-01')).toBe(0);
  });
});

describe('凡界境界映射', () => {
  it('修为 0 为炼气初期', () => {
    const s = stateAt(0);
    expect(s.realm.name).toBe('炼气期');
    expect(s.subStage).toBe('初期');
  });

  it('1200 进入筑基初期', () => {
    const s = stateAt(1200);
    expect(s.realm.name).toBe('筑基期');
    expect(s.subStage).toBe('初期');
  });

  it('筑基期四小阶四等分（1800 中期 / 2400 后期 / 3000 大圆满）', () => {
    expect(stateAt(1800).subStage).toBe('中期');
    expect(stateAt(2400).subStage).toBe('后期');
    expect(stateAt(3000).subStage).toBe('大圆满');
  });

  it('3600 进入金丹初期', () => {
    const s = stateAt(3600);
    expect(s.realm.name).toBe('金丹期');
    expect(s.subStage).toBe('初期');
  });

  it('35999 为大乘大圆满（差 1 到渡劫门槛）', () => {
    const s = stateAt(35999);
    expect(s.realm.name).toBe('大乘期');
    expect(s.subStage).toBe('大圆满');
  });

  it('36000 进入渡劫大圆满（最后一境，等待飞升）', () => {
    const s = stateAt(36000);
    expect(s.realm.name).toBe('渡劫期');
    expect(s.subStage).toBe('大圆满');
    expect(s.isAtPeak).toBe(true);
  });

  it('远超渡劫门槛仍停留渡劫大圆满', () => {
    const s = stateAt(999999);
    expect(s.realm.name).toBe('渡劫期');
    expect(s.subStage).toBe('大圆满');
  });
});

describe('事件流水', () => {
  it('求和并跳过已撤销事件', () => {
    expect(
      sumEvents([
        { id: 'a', sourceType: 'letter', sourceId: 'l1', value: 100, occurredAt: D },
        { id: 'b', sourceType: 'letter', sourceId: 'l2', value: 200, occurredAt: D, revoked: true },
        { id: 'c', sourceType: 'photo', sourceId: 'p1', value: 50, occurredAt: D },
      ]),
    ).toBe(150);
  });

  it('时间 + 事件合计为总修为', () => {
    const s = computeCultivation({
      startDate: '2025-01-01',
      realmType: 'mortal',
      events: [{ id: 'a', sourceType: 'letter', sourceId: 'l1', value: 100, occurredAt: '2025-01-02' }],
      bottleneck: null,
      today: '2025-01-11',
    });
    expect(s.timeValue).toBe(100);
    expect(s.eventValue).toBe(100);
    expect(s.rawTotal).toBe(200);
  });
});

describe('每日日常上限（打卡 + 照片 ≤ 30）', () => {
  it('剩余额度与截断', () => {
    expect(remainingDailyQuota(10)).toBe(20);
    expect(remainingDailyQuota(35)).toBe(0);
    expect(cappedEventValue(10, 30)).toBe(20);
    expect(cappedEventValue(10, 5)).toBe(5);
  });

  it('两人打卡 10 + 一张照片 30 → 照片截到 20，合计 30', () => {
    let day = 0;
    for (const v of [5, 5, 30]) {
      // 两次打卡 + 一张照片
      day += cappedEventValue(day, v);
    }
    expect(day).toBe(30);
  });
});

describe('连续打卡里程碑', () => {
  it('命中 3/7/30/100 天发对应奖励', () => {
    expect(streakMilestoneAward(3)).toEqual({ milestone: 3, award: 15 });
    expect(streakMilestoneAward(7)).toEqual({ milestone: 7, award: 40 });
    expect(streakMilestoneAward(30)).toEqual({ milestone: 30, award: 150 });
    expect(streakMilestoneAward(100)).toEqual({ milestone: 100, award: 600 });
  });

  it('非里程碑天数不发', () => {
    expect(streakMilestoneAward(4)).toBeNull();
    expect(streakMilestoneAward(0)).toBeNull();
    expect(streakMilestoneAward(101)).toBeNull();
  });
});

describe('瓶颈概率与掷点', () => {
  it('概率表正确', () => {
    expect(bottleneckProbability('foundation')).toBeCloseTo(0.3);
    expect(bottleneckProbability('ascension')).toBe(1);
  });

  it('rollBottleneck 注入 rng 后确定性', () => {
    expect(rollBottleneck('ascension', () => 0)).toBe(true);
    expect(rollBottleneck('foundation', () => 0.5)).toBe(false);
    expect(rollBottleneck('foundation', () => 0.29)).toBe(true);
  });
});

describe('瓶颈厚积薄发', () => {
  const bottleneck: BottleneckState = { targetRealmKey: 'golden_core', isBottleneck: true, triggeredAt: D };

  it('封顶在 3600，修为停在筑基大圆满，积压入 backlog', () => {
    const s = stateAt(5000, { bottleneck });
    expect(s.realm.name).toBe('筑基期');
    expect(s.subStage).toBe('大圆满');
    expect(s.effectiveTotal).toBe(3600);
    expect(s.rawTotal).toBe(5000);
    expect(s.backlogValue).toBe(1400);
    expect(s.isBottleneck).toBe(true);
    expect(s.bottleneckDays).toBe(0);
  });

  it('突破后积压修为一次性生效（进入金丹中期）', () => {
    const s = stateAt(5000);
    expect(s.realm.name).toBe('金丹期');
    expect(s.subStage).toBe('中期');
    expect(s.rawTotal).toBe(5000);
  });

  it('飞升瓶颈封顶在渡劫大圆满 36000', () => {
    const s = stateAt(40000, {
      bottleneck: { targetRealmKey: 'ascension', isBottleneck: true, triggeredAt: D },
    });
    expect(s.realm.name).toBe('渡劫期');
    expect(s.effectiveTotal).toBe(36000);
    expect(s.backlogValue).toBe(4000);
  });
});

describe('仙界', () => {
  it('事件修为按 1/3 折算', () => {
    const s = stateAt(150, { realmType: 'immortal' });
    expect(s.eventValue).toBeCloseTo(50);
    expect(s.rawTotal).toBeCloseTo(50);
  });

  it('境界按婚后天数锚定（绕过折算直接验证映射）', () => {
    expect(stateAt(3650, { realmType: 'immortal', eventScale: 1 }).realm.name).toBe('地仙');
    expect(stateAt(10950, { realmType: 'immortal', eventScale: 1 }).realm.name).toBe('天仙');
    expect(stateAt(182500, { realmType: 'immortal', eventScale: 1 }).realm.name).toBe('圣人');
  });
});

describe('逆天改命（境界倒退）', () => {
  const bottleneck: BottleneckState = { targetRealmKey: 'golden_core', isBottleneck: true, triggeredAt: D };
  const ev = (v: number): CultivationEvent[] => [
    { id: 'a', sourceType: 'letter', sourceId: 'l1', value: v, occurredAt: D },
  ];

  it('自然修为仍达门槛 → 瓶颈有效', () => {
    expect(
      isBottleneckStillValid({ bottleneck, startDate: D, realmType: 'mortal', events: ev(5000), today: D }),
    ).toBe(true);
  });

  it('改日期后修为低于门槛 → 瓶颈作废', () => {
    expect(
      isBottleneckStillValid({ bottleneck, startDate: D, realmType: 'mortal', events: ev(1000), today: D }),
    ).toBe(false);
  });
});
