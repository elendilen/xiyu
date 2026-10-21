// 曦羽 · 境界配置表（凡界 9 境 + 仙界 9 境）
// 数值全部来自方案 §4.2，🔧 可调。改这里即可调整全站节奏。

export type RealmType = 'mortal' | 'immortal';

export interface Realm {
  key: string;
  name: string;
  type: RealmType;
  /** 进入该境界所需的累计修为（修为门槛值） */
  enterAt: number;
  /** 恋爱含义 */
  meaning?: string;
}

export const MORTAL_REALMS: Realm[] = [
  { key: 'qi_refining', name: '炼气期', type: 'mortal', enterAt: 0, meaning: '初入仙途' },
  { key: 'foundation', name: '筑基期', type: 'mortal', enterAt: 1200, meaning: '结为道侣' },
  { key: 'golden_core', name: '金丹期', type: 'mortal', enterAt: 3600, meaning: '感情稳固' },
  { key: 'nascent_soul', name: '元婴期', type: 'mortal', enterAt: 7200, meaning: '灵魂契合' },
  { key: 'spirit_severing', name: '化神期', type: 'mortal', enterAt: 12000, meaning: '心神合一' },
  { key: 'body_integration', name: '合体期', type: 'mortal', enterAt: 18000, meaning: '不分彼此' },
  { key: 'mahayana', name: '大乘期', type: 'mortal', enterAt: 26000, meaning: '已窥大道' },
  { key: 'tribulation', name: '渡劫期', type: 'mortal', enterAt: 36000, meaning: '感情试炼，只待机缘' },
];

export const IMMORTAL_REALMS: Realm[] = [
  { key: 'human_immortal', name: '人仙', type: 'immortal', enterAt: 0, meaning: '新婚燕尔' },
  { key: 'earth_immortal', name: '地仙', type: 'immortal', enterAt: 3650, meaning: '一起经营小家' },
  { key: 'heaven_immortal', name: '天仙', type: 'immortal', enterAt: 10950, meaning: '孕育/迎接新生命' },
  { key: 'mystic_immortal', name: '玄仙', type: 'immortal', enterAt: 18250, meaning: '共同育儿、为人父母' },
  { key: 'golden_immortal', name: '金仙', type: 'immortal', enterAt: 25550, meaning: '孩子成长、家庭稳固' },
  { key: 'taiyi', name: '太乙金仙', type: 'immortal', enterAt: 36500, meaning: '携手多年、历久弥新' },
  { key: 'daluo', name: '大罗金仙', type: 'immortal', enterAt: 54750, meaning: '相伴半生' },
  { key: 'daojun', name: '道君', type: 'immortal', enterAt: 73000, meaning: '一生相守' },
  { key: 'sage', name: '圣人', type: 'immortal', enterAt: 182500, meaning: '圆满（金婚/一生）' },
];

export const ALL_REALMS: Realm[] = [...MORTAL_REALMS, ...IMMORTAL_REALMS];

export const SUB_STAGES = ['初期', '中期', '后期', '大圆满'] as const;
export type SubStage = (typeof SUB_STAGES)[number];

/**
 * 瓶颈概率：突破「进入该境界」时触发瓶颈的概率。
 * 飞升（ascension）100% —— 等真实求婚。
 * key 为要进入的境界 key（或 'ascension'）。
 */
export const BOTTLENECK_PROBABILITY: Record<string, number> = {
  foundation: 0.3,
  golden_core: 0.35,
  nascent_soul: 0.4,
  spirit_severing: 0.45,
  body_integration: 0.5,
  mahayana: 0.6,
  tribulation: 0.7,
  ascension: 1.0,
};

export function getRealms(type: RealmType): Realm[] {
  return type === 'mortal' ? MORTAL_REALMS : IMMORTAL_REALMS;
}

export function realmByKey(key: string): Realm | undefined {
  return ALL_REALMS.find((r) => r.key === key);
}
