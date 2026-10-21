// 曦羽 · 修为数值配置（🔧 可调，对应方案 §3、§4.1）
// 原则：时间为底，互动加速，事件定节奏。日常给小额且设每日上限，大事件给大额不限量。

export const REWARDS = {
  /** 时间修为 +10/天（唯一不受日上限的来源） */
  timePerDay: 10,
  /** 每日打卡 +5/条 */
  checkin: 5,
  /** 上传照片 +30/张 */
  photo: 30,
  /** 地图打卡 +100/处 */
  place: 100,
  /** 信件 +150/封 */
  letter: 150,
  /** 纪念日 +500/次 */
  anniversary: 500,
  /** 每日日常修为上限（打卡 + 照片合计，超出部分当日不计） */
  dailyEventCap: 30,
  /** 历练任务难度分级 */
  wishlist: {
    easy: 100,
    normal: 200,
    hard: 500,
    epic: 1000,
  },
  /** 连续打卡里程碑（双方都打卡为连续标准） */
  streak: {
    3: 15,
    7: 40,
    30: 150,
    100: 600,
  },
  /** 仙界事件修为折算比例（防加速过快，仙界以时间为主导） */
  immortalEventScale: 1 / 3,
} as const;

export type WishlistTier = keyof typeof REWARDS.wishlist;
export type StreakMilestone = keyof typeof REWARDS.streak;
