import { ARMOR_BY_ID } from "./armor";
import { Item } from "./items";
import { TOOL_BY_ID } from "./tools";

export type EnchantId = "efficiency" | "sharpness" | "power" | "protection" | "unbreaking";

export interface EnchantDef {
  id: EnchantId;
  name: string;
  max: number;
}

export const ENCHANTS: Record<EnchantId, EnchantDef> = {
  efficiency: { id: "efficiency", name: "효율", max: 3 },
  sharpness: { id: "sharpness", name: "날카로움", max: 3 },
  power: { id: "power", name: "힘", max: 3 },
  protection: { id: "protection", name: "보호", max: 3 },
  unbreaking: { id: "unbreaking", name: "내구성", max: 3 },
};

/** 인챈트 한 번에 드는 레벨 (1단계 1레벨, 2단계 2레벨, 3단계 3레벨) */
export const ENCHANT_TIERS = [1, 2, 3];

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ"];

export function isEnchantId(value: string): value is EnchantId {
  return value in ENCHANTS;
}

/** 이 아이템에 붙일 수 있는 인챈트들 (붙일 수 없으면 빈 목록). */
export function enchantsFor(item: number): EnchantId[] {
  const tool = TOOL_BY_ID.get(item);
  if (tool) {
    if (tool.type === "sword") return ["sharpness", "unbreaking"];
    // 도끼는 무기로도 쓰이므로 날카로움도 붙는다.
    if (tool.type === "axe") return ["efficiency", "sharpness", "unbreaking"];
    return ["efficiency", "unbreaking"];
  }
  if (ARMOR_BY_ID.has(item)) return ["protection", "unbreaking"];
  if (item === Item.Bow) return ["power", "unbreaking"];
  if (item === Item.Shield) return ["unbreaking"];
  return [];
}

/** 인챈트할 수 있는 아이템인지. */
export function isEnchantable(item: number): boolean {
  return enchantsFor(item).length > 0;
}

/** 단계(1~3)에 맞는 인챈트를 무작위로 하나 뽑는다. 붙일 수 없는 아이템이면 null. */
export function rollEnchant(item: number, tier: number, rng: () => number): { id: EnchantId; level: number } | null {
  const options = enchantsFor(item);
  if (options.length === 0) return null;
  const id = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
  return { id, level: Math.max(1, Math.min(ENCHANTS[id].max, tier)) };
}

/** "효율 Ⅱ" 같은 이름 */
export function enchantLabel(id: EnchantId, level: number): string {
  return ENCHANTS[id].name + " " + (ROMAN[level] ?? String(level));
}

/** 효율: 맞는 도구로 캐는 속도에 곱하는 배율 */
export function efficiencyMultiplier(level: number): number {
  return [1, 1.5, 2.1, 2.8][Math.max(0, Math.min(3, level))];
}

/** 날카로움: 검 공격력에 더하는 값 */
export function sharpnessBonus(level: number): number {
  return 1.25 * Math.max(0, level);
}

/** 힘: 활 공격력에 곱하는 배율 */
export function powerMultiplier(level: number): number {
  return 1 + 0.25 * Math.max(0, level);
}

/** 보호 한 단계는 방어구 점수 1점과 같이 친다 (마인크래프트처럼 한 점당 피해 4% 감소). */
export function protectionPoints(totalLevels: number): number {
  return Math.max(0, totalLevels);
}

/** 내구성: 도구를 쓸 때 닳는 확률 (내구성 N이면 1/(N+1)) */
export function wearChance(level: number): number {
  return 1 / (Math.max(0, level) + 1);
}
