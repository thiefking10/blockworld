import { Item } from "./items";
import { baseBlock } from "./shapes";
import { Block } from "./world";

export type ToolType = "pickaxe" | "axe" | "shovel" | "sword";

export interface ToolDef {
  id: number;
  type: ToolType;
  /** 0 나무, 1 돌, 2 철, 3 다이아몬드 */
  tier: number;
}

/** 재질별 채굴 속도 배율 (맞는 도구일 때) */
export const TIER_SPEED = [2, 4, 6, 9];
/** 재질별 내구도 (블록을 몇 개 캘 수 있는지, 검은 몇 번 칠 수 있는지) */
export const TIER_DURABILITY = [59, 131, 250, 1561];
/** 재질별 검의 공격력 (맨손은 1) */
export const SWORD_DAMAGE = [2, 4, 6, 8];
export const TIER_NAMES = ["나무", "돌", "철", "다이아몬드"];

const TOOL_IDS: Record<ToolType, number[]> = {
  pickaxe: [Item.WoodPickaxe, Item.StonePickaxe, Item.IronPickaxe, Item.DiamondPickaxe],
  axe: [Item.WoodAxe, Item.StoneAxe, Item.IronAxe, Item.DiamondAxe],
  shovel: [Item.WoodShovel, Item.StoneShovel, Item.IronShovel, Item.DiamondShovel],
  sword: [Item.WoodClub, Item.StoneClub, Item.IronClub, Item.DiamondClub],
};

export const TOOLS: ToolDef[] = (Object.keys(TOOL_IDS) as ToolType[]).flatMap((type) =>
  TOOL_IDS[type].map((id, tier) => ({ id, type, tier })),
);

export const TOOL_BY_ID = new Map<number, ToolDef>(TOOLS.map((tool) => [tool.id, tool]));

export function toolDurability(tool: ToolDef): number {
  return TIER_DURABILITY[tool.tier];
}

/** 손으로 캘 때 걸리는 기본 시간(초). 0이면 바로 캐진다. 마인크래프트의 손 채굴 시간과 비슷하게 맞췄다. */
export const HARDNESS: Record<number, number> = {
  [Block.Grass]: 0.6,
  [Block.Dirt]: 0.5,
  [Block.Stone]: 1.5,
  [Block.Sand]: 0.5,
  [Block.Wood]: 2,
  [Block.Leaves]: 0.2,
  [Block.Planks]: 2,
  [Block.Glass]: 0.3,
  [Block.Brick]: 2,
  [Block.Snow]: 0.2,
  [Block.Cactus]: 0.4,
  [Block.Wool]: 0.8,
  [Block.IronOre]: 3,
  [Block.DiamondOre]: 3.5,
  [Block.CraftingTable]: 2.5,
  [Block.Furnace]: 3.5,
  [Block.CoalOre]: 3,
  [Block.PlankSlab]: 2,
  [Block.StoneSlab]: 1.5,
  [Block.PlankStairs]: 2,
  [Block.StoneStairs]: 1.5,
  [Block.Chest]: 2.5,
  [Block.Ladder]: 0.4,
  [Block.Door]: 3,
  [Block.Fence]: 2,
  [Block.Gravel]: 0.6,
  [Block.Flower]: 0,
  [Block.YellowFlower]: 0,
  [Block.Sprout]: 0,
  [Block.Wheat]: 0,
  [Block.Torch]: 0,
};

/** 블록마다 빨리 캐지는 도구 */
export const EFFECTIVE_TOOL: Record<number, ToolType | undefined> = {
  [Block.Grass]: "shovel",
  [Block.Dirt]: "shovel",
  [Block.Sand]: "shovel",
  [Block.Snow]: "shovel",
  [Block.Stone]: "pickaxe",
  [Block.Brick]: "pickaxe",
  [Block.IronOre]: "pickaxe",
  [Block.DiamondOre]: "pickaxe",
  [Block.CoalOre]: "pickaxe",
  [Block.StoneSlab]: "pickaxe",
  [Block.StoneStairs]: "pickaxe",
  [Block.PlankSlab]: "axe",
  [Block.PlankStairs]: "axe",
  [Block.Chest]: "axe",
  [Block.Ladder]: "axe",
  [Block.Door]: "axe",
  [Block.Fence]: "axe",
  [Block.Gravel]: "shovel",
  [Block.Wood]: "axe",
  [Block.Planks]: "axe",
  [Block.CraftingTable]: "axe",
  [Block.Furnace]: "pickaxe",
};

/** 이 재질(0 나무, 1 돌, 2 철) 이상의 곡괭이로 캐야 아이템이 나오는 블록 */
export const MIN_PICKAXE_TIER: Record<number, number | undefined> = {
  [Block.Stone]: 0,
  [Block.Brick]: 0,
  [Block.CoalOre]: 0,
  [Block.StoneSlab]: 0,
  [Block.StoneStairs]: 0,
  [Block.IronOre]: 1,
  [Block.DiamondOre]: 2,
  [Block.Furnace]: 0,
};

/** 이 도구로 캐면 아이템이 나오는가 (돌은 곡괭이가 없으면 부숴도 아무것도 안 나온다) */
export function canHarvest(block: number, tool: ToolDef | null): boolean {
  const need = MIN_PICKAXE_TIER[baseBlock(block)];
  if (need === undefined) return true;
  return tool !== null && tool.type === "pickaxe" && tool.tier >= need;
}

/** 블록을 캐는 데 걸리는 시간(초). 맞는 도구로 아이템을 얻을 수 있으면 x1.5, 아니면 x5, 맞는 도구면 재질 속도로 나눈다. */
export function breakSeconds(block: number, tool: ToolDef | null): number {
  const hardness = HARDNESS[baseBlock(block)];
  if (hardness === undefined) return 0;
  if (hardness === 0) return 0;
  const effective = tool !== null && tool.type === EFFECTIVE_TOOL[baseBlock(block)];
  const base = canHarvest(block, tool) ? 1.5 : 5;
  return (hardness * base) / (effective && tool ? TIER_SPEED[tool.tier] : 1);
}

/** 이 블록을 캘 때 쓸 도구 (가진 것 중 맞는 종류에서 가장 좋은 것). 없으면 null. */
export function bestTool(block: number, has: (id: number) => boolean): ToolDef | null {
  const type = EFFECTIVE_TOOL[baseBlock(block)];
  if (!type) return null;
  const candidates = TOOLS.filter((t) => t.type === type && has(t.id));
  return candidates.reduce<ToolDef | null>((best, t) => (best === null || t.tier > best.tier ? t : best), null);
}

/** 가진 검 중 가장 좋은 것 */
export function bestSword(has: (id: number) => boolean): ToolDef | null {
  const swords = TOOLS.filter((t) => t.type === "sword" && has(t.id));
  return swords.reduce<ToolDef | null>((best, t) => (best === null || t.tier > best.tier ? t : best), null);
}
