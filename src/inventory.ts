import { Item, ITEM_NAMES } from "./items";
import { bestSword, SWORD_DAMAGE, TOOL_BY_ID, toolDurability } from "./tools";
import { Block } from "./world";

export { Item, ITEM_NAMES };

/** 고기를 먹으면 회복하는 체력 (하트 4개). */
export const MEAT_HEAL = 8;

/** 먹을 수 있는 아이템과 회복하는 체력. */
export const FOOD_HEAL: Record<number, number> = {
  [Item.Meat]: MEAT_HEAL,
  [Item.CookedMeat]: 14,
  [Item.Bread]: 10,
};

export interface Recipe {
  name: string;
  /** 이 작업대가 있어야 만들 수 있다. 없으면 가방에서 바로 만든다. */
  station?: "table";
  inputs: [number, number][];
  output: [number, number];
}

/**
 * 만들 수 있는 것들. 가방에서는 판자, 막대, 제작대만 바로 만들고 (마인크래프트의 2×2),
 * 나머지는 제작대를 가리키고 "사용"을 눌러서 만든다 (3×3).
 * 유리, 구운 고기, 철 주괴는 화로에서 굽는다 (furnace.ts).
 */
export const RECIPES: Recipe[] = [
  { name: "판자", inputs: [[Block.Wood, 1]], output: [Block.Planks, 4] },
  { name: "막대", inputs: [[Block.Planks, 2]], output: [Item.Stick, 4] },
  { name: "제작대", inputs: [[Block.Planks, 4]], output: [Block.CraftingTable, 1] },
  { name: "화로", station: "table", inputs: [[Block.Stone, 8]], output: [Block.Furnace, 1] },
  { name: "벽돌", station: "table", inputs: [[Block.Stone, 2]], output: [Block.Brick, 2] },
  { name: "나무 곡괭이", station: "table", inputs: [[Block.Planks, 3], [Item.Stick, 2]], output: [Item.WoodPickaxe, 1] },
  { name: "나무 도끼", station: "table", inputs: [[Block.Planks, 3], [Item.Stick, 2]], output: [Item.WoodAxe, 1] },
  { name: "나무 삽", station: "table", inputs: [[Block.Planks, 1], [Item.Stick, 2]], output: [Item.WoodShovel, 1] },
  { name: "나무 검", station: "table", inputs: [[Block.Planks, 2], [Item.Stick, 1]], output: [Item.WoodClub, 1] },
  { name: "돌 곡괭이", station: "table", inputs: [[Block.Stone, 3], [Item.Stick, 2]], output: [Item.StonePickaxe, 1] },
  { name: "돌 도끼", station: "table", inputs: [[Block.Stone, 3], [Item.Stick, 2]], output: [Item.StoneAxe, 1] },
  { name: "돌 삽", station: "table", inputs: [[Block.Stone, 1], [Item.Stick, 2]], output: [Item.StoneShovel, 1] },
  { name: "돌 검", station: "table", inputs: [[Block.Stone, 2], [Item.Stick, 1]], output: [Item.StoneClub, 1] },
  { name: "철 곡괭이", station: "table", inputs: [[Item.IronIngot, 3], [Item.Stick, 2]], output: [Item.IronPickaxe, 1] },
  { name: "철 도끼", station: "table", inputs: [[Item.IronIngot, 3], [Item.Stick, 2]], output: [Item.IronAxe, 1] },
  { name: "철 삽", station: "table", inputs: [[Item.IronIngot, 1], [Item.Stick, 2]], output: [Item.IronShovel, 1] },
  { name: "철 검", station: "table", inputs: [[Item.IronIngot, 2], [Item.Stick, 1]], output: [Item.IronClub, 1] },
  { name: "침대", station: "table", inputs: [[Block.Wool, 3], [Block.Planks, 3]], output: [Item.Bed, 1] },
  { name: "빵", station: "table", inputs: [[Item.Grain, 3]], output: [Item.Bread, 1] },
];

/**
 * 블록을 부수면 무엇이 몇 개 나오는지. 잔디는 흙이 나오고 가끔 씨앗도 나온다.
 * 다 자란 밀은 밀과 씨앗을, 어린 싹은 씨앗을 준다. 씨앗은 밀 씨앗 블록(Sprout)이 곧 아이템이다.
 */
export function dropsFor(block: number, rng: () => number): [number, number][] {
  if (block === Block.Air || block === Block.Water) return [];
  switch (block) {
    case Block.Grass:
      return rng() < 0.25 ? [[Block.Dirt, 1], [Block.Sprout, 1]] : [[Block.Dirt, 1]];
    case Block.Wheat:
      return [[Item.Grain, 1 + (rng() < 0.5 ? 1 : 0)], [Block.Sprout, 1 + (rng() < 0.5 ? 1 : 0)]];
    default:
      return [[block, 1]];
  }
}

/** 동물을 잡으면 나오는 것들. 돼지와 양은 고기, 양은 양털도 준다. */
export function mobDrops(kind: string, rng: () => number): [number, number][] {
  const drops: [number, number][] = [];
  if (kind === "pig" || kind === "sheep") drops.push([Item.Meat, 1 + (rng() < 0.5 ? 1 : 0)]);
  if (kind === "sheep") drops.push([Block.Wool, 1 + (rng() < 0.5 ? 1 : 0)]);
  return drops;
}

/** 가방. 아이템 번호마다 개수를 세고, 도구는 지금 쓰는 한 개의 남은 내구도를 기억한다. */
export class Inventory {
  private readonly counts = new Map<number, number>();
  /** 도구 번호 → 지금 쓰고 있는 도구 하나의 남은 내구도 (안 쓴 도구는 항목이 없다) */
  private readonly wear = new Map<number, number>();

  count(item: number): number {
    return this.counts.get(item) ?? 0;
  }

  add(item: number, amount = 1): void {
    if (amount <= 0) return;
    this.counts.set(item, this.count(item) + amount);
  }

  /** 충분히 있으면 빼고 true, 모자라면 아무것도 안 하고 false. */
  remove(item: number, amount = 1): boolean {
    if (this.count(item) < amount) return false;
    const left = this.count(item) - amount;
    if (left === 0) {
      this.counts.delete(item);
      this.wear.delete(item);
    } else {
      this.counts.set(item, left);
    }
    return true;
  }

  canCraft(recipe: Recipe): boolean {
    return recipe.inputs.every(([item, amount]) => this.count(item) >= amount);
  }

  craft(recipe: Recipe): boolean {
    if (!this.canCraft(recipe)) return false;
    for (const [item, amount] of recipe.inputs) this.remove(item, amount);
    this.add(recipe.output[0], recipe.output[1]);
    return true;
  }

  /** 지금 쓰는 도구 하나의 남은 내구도 (없는 도구면 0). */
  toolLeft(item: number): number {
    const tool = TOOL_BY_ID.get(item);
    if (!tool || this.count(item) === 0) return 0;
    return this.wear.get(item) ?? toolDurability(tool);
  }

  /** 도구를 한 번 쓴다. 다 닳아서 부러졌으면 true (같은 도구가 더 있으면 새것을 쓰기 시작한다). */
  useTool(item: number): boolean {
    if (!TOOL_BY_ID.has(item) || this.count(item) === 0) return false;
    const left = this.toolLeft(item) - 1;
    if (left <= 0) {
      this.remove(item);
      this.wear.delete(item);
      return true;
    }
    this.wear.set(item, left);
    return false;
  }

  /** 가진 검 중 가장 센 것의 공격력 (맨손은 1). */
  attackDamage(): number {
    const sword = bestSword((id) => this.count(id) > 0);
    return sword ? SWORD_DAMAGE[sword.tier] : 1;
  }

  /** 가진 아이템을 [번호, 개수] 목록으로 (번호 순). */
  entries(): [number, number][] {
    return [...this.counts.entries()].sort((a, b) => a[0] - b[0]);
  }

  /** 저장용: 닳은 도구의 [번호, 남은 내구도] 목록 */
  wearEntries(): [number, number][] {
    return [...this.wear.entries()].filter(([item]) => this.count(item) > 0);
  }

  load(entries: [number, number][], wear: [number, number][] = []): void {
    this.counts.clear();
    this.wear.clear();
    for (const [item, amount] of entries) this.add(item, amount);
    for (const [item, left] of wear) {
      const tool = TOOL_BY_ID.get(item);
      if (tool && this.count(item) > 0 && left > 0 && left <= toolDurability(tool)) this.wear.set(item, left);
    }
  }
}
