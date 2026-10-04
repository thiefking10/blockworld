import { Item } from "./items";

export type ArmorSlot = "helmet" | "chestplate" | "leggings" | "boots";

export interface ArmorDef {
  id: number;
  slot: ArmorSlot;
  /** 방어구 점수. 마인크래프트처럼 한 점당 받는 피해를 4%씩 줄인다 (전부 합쳐 최대 80%까지). */
  points: number;
  /** 불(용의 불숨) 피해를 줄이는 비율 (이 조각 하나당) */
  fireResist?: number;
  /** 맞았을 때 밀려나는 것을 줄이는 비율 (이 조각 하나당) */
  knockResist?: number;
}

/**
 * 방어구는 도구처럼 한 종류만 가지고 다니는 대신, 직접 "입는" 칸이 없다.
 * 대신 검·곡괭이처럼 가진 것 중 부위별로 가장 좋은 것을 자동으로 걸친 것으로 친다.
 * (내구도는 줄지 않는다 — 간단하게 만들었다.)
 */
export const ARMOR: ArmorDef[] = [
  { id: Item.IronHelmet, slot: "helmet", points: 2 },
  { id: Item.IronChestplate, slot: "chestplate", points: 6 },
  { id: Item.IronLeggings, slot: "leggings", points: 5 },
  { id: Item.IronBoots, slot: "boots", points: 2 },
  { id: Item.DiamondHelmet, slot: "helmet", points: 3 },
  { id: Item.DiamondChestplate, slot: "chestplate", points: 8 },
  { id: Item.DiamondLeggings, slot: "leggings", points: 6 },
  { id: Item.DiamondBoots, slot: "boots", points: 3 },
  // 네더라이트: 다이아몬드보다 단단하고, 불에 강하고, 맞아도 덜 밀린다.
  { id: Item.NetheriteHelmet, slot: "helmet", points: 4, fireResist: 0.15, knockResist: 0.1 },
  { id: Item.NetheriteChestplate, slot: "chestplate", points: 9, fireResist: 0.15, knockResist: 0.1 },
  { id: Item.NetheriteLeggings, slot: "leggings", points: 7, fireResist: 0.15, knockResist: 0.1 },
  { id: Item.NetheriteBoots, slot: "boots", points: 4, fireResist: 0.15, knockResist: 0.1 },
];

export const ARMOR_BY_ID = new Map<number, ArmorDef>(ARMOR.map((a) => [a.id, a]));

const MAX_REDUCTION = 0.8;
const PER_POINT = 0.04;

/** 부위별로 가진 것 중 가장 점수가 높은 방어구. */
export function bestArmor(has: (id: number) => boolean): ArmorDef[] {
  const bySlot = new Map<ArmorSlot, ArmorDef>();
  for (const def of ARMOR) {
    if (!has(def.id)) continue;
    const current = bySlot.get(def.slot);
    if (!current || def.points > current.points) bySlot.set(def.slot, def);
  }
  return [...bySlot.values()];
}

/** 걸친 방어구가 주는 불 피해 감소(0~1)와 밀림 감소(0~1). */
export function armorResistances(has: (id: number) => boolean): { fire: number; knock: number } {
  let fire = 0;
  let knock = 0;
  for (const def of bestArmor(has)) {
    fire += def.fireResist ?? 0;
    knock += def.knockResist ?? 0;
  }
  return { fire: Math.min(0.8, fire), knock: Math.min(0.8, knock) };
}

/** 지금 걸친 것으로 치는 방어구의 점수 합 (최대 20 근처). */
export function totalArmorPoints(has: (id: number) => boolean): number {
  return bestArmor(has).reduce((sum, a) => sum + a.points, 0);
}

/** 방어구 점수(와 보호 인챈트가 더해 주는 점수)만큼 들어오는 피해를 줄인다 (최대 80%까지, 마인크래프트와 같은 계산). */
export function reduceDamage(amount: number, has: (id: number) => boolean, bonusPoints = 0): number {
  const reduction = Math.min(MAX_REDUCTION, (totalArmorPoints(has) + bonusPoints) * PER_POINT);
  return amount * (1 - reduction);
}
