import { Block } from "./world";

/** 블록이 아닌 아이템은 100번부터 쓴다 (블록은 블록 번호 그대로). */
export const Item = {
  Meat: 100,
  WoodClub: 101,
  StoneClub: 102,
  Bed: 103,
  IronClub: 104,
} as const;

export const ITEM_NAMES: Record<number, string> = {
  [Item.Meat]: "고기",
  [Item.WoodClub]: "나무 몽둥이",
  [Item.StoneClub]: "돌 몽둥이",
  [Item.Bed]: "침대",
  [Item.IronClub]: "철 몽둥이",
};

/** 고기를 먹으면 회복하는 체력 (하트 4개). */
export const MEAT_HEAL = 8;

/** 가진 도구별 공격력. 도구가 없으면 맨손 1. 센 것부터 적는다. */
export const CLUB_DAMAGE: [number, number][] = [
  [Item.IronClub, 6],
  [Item.StoneClub, 4],
  [Item.WoodClub, 2],
];

export interface Recipe {
  name: string;
  inputs: [number, number][];
  output: [number, number];
}

export const RECIPES: Recipe[] = [
  { name: "판자", inputs: [[Block.Wood, 1]], output: [Block.Planks, 4] },
  { name: "유리", inputs: [[Block.Sand, 2]], output: [Block.Glass, 2] },
  { name: "벽돌", inputs: [[Block.Stone, 2]], output: [Block.Brick, 2] },
  { name: "나무 몽둥이", inputs: [[Block.Planks, 3]], output: [Item.WoodClub, 1] },
  { name: "돌 몽둥이", inputs: [[Block.Stone, 2], [Block.Planks, 1]], output: [Item.StoneClub, 1] },
  { name: "철 몽둥이", inputs: [[Block.IronOre, 2], [Block.Planks, 1]], output: [Item.IronClub, 1] },
  { name: "침대", inputs: [[Block.Wool, 3], [Block.Planks, 3]], output: [Item.Bed, 1] },
];

/** 블록을 부수면 무엇이 몇 개 나오는지. 잔디는 흙이 나온다. */
export function dropFor(block: number): [number, number] | null {
  if (block === Block.Air || block === Block.Water) return null;
  if (block === Block.Grass) return [Block.Dirt, 1];
  return [block, 1];
}

/** 동물을 잡으면 나오는 것들. 돼지와 양은 고기, 양은 양털도 준다. */
export function mobDrops(kind: string, rng: () => number): [number, number][] {
  const drops: [number, number][] = [];
  if (kind === "pig" || kind === "sheep") drops.push([Item.Meat, 1 + (rng() < 0.5 ? 1 : 0)]);
  if (kind === "sheep") drops.push([Block.Wool, 1 + (rng() < 0.5 ? 1 : 0)]);
  return drops;
}

/** 가방. 아이템 번호마다 개수를 센다. */
export class Inventory {
  private readonly counts = new Map<number, number>();

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
    if (left === 0) this.counts.delete(item);
    else this.counts.set(item, left);
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

  /** 가진 도구 중 가장 센 것의 공격력. */
  attackDamage(): number {
    for (const [item, damage] of CLUB_DAMAGE) if (this.count(item) > 0) return damage;
    return 1;
  }

  /** 가진 아이템을 [번호, 개수] 목록으로 (번호 순). */
  entries(): [number, number][] {
    return [...this.counts.entries()].sort((a, b) => a[0] - b[0]);
  }

  load(entries: [number, number][]): void {
    this.counts.clear();
    for (const [item, amount] of entries) this.add(item, amount);
  }
}
