import { ARMOR_BY_ID } from "./armor";
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
  [Item.RawFish]: 4,
  [Item.CookedFish]: 10,
};

/** 먹을 수 있는 아이템이 채워 주는 배고픔 (0~20 중). */
export const FOOD_HUNGER: Record<number, number> = {
  [Item.Meat]: 3,
  [Item.CookedMeat]: 6,
  [Item.Bread]: 5,
  [Item.RawFish]: 2,
  [Item.CookedFish]: 5,
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
  // 원래는 석탄이 있어야 하지만, 아직 석탄이 없어 나무로 불을 붙이는 것으로 단순화했다.
  { name: "횃불", inputs: [[Item.Stick, 1], [Block.Wood, 1]], output: [Block.Torch, 4] },
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
  { name: "다이아몬드 곡괭이", station: "table", inputs: [[Item.Diamond, 3], [Item.Stick, 2]], output: [Item.DiamondPickaxe, 1] },
  { name: "다이아몬드 도끼", station: "table", inputs: [[Item.Diamond, 3], [Item.Stick, 2]], output: [Item.DiamondAxe, 1] },
  { name: "다이아몬드 삽", station: "table", inputs: [[Item.Diamond, 1], [Item.Stick, 2]], output: [Item.DiamondShovel, 1] },
  { name: "다이아몬드 검", station: "table", inputs: [[Item.Diamond, 2], [Item.Stick, 1]], output: [Item.DiamondClub, 1] },
  { name: "철 투구", station: "table", inputs: [[Item.IronIngot, 5]], output: [Item.IronHelmet, 1] },
  { name: "철 흉갑", station: "table", inputs: [[Item.IronIngot, 8]], output: [Item.IronChestplate, 1] },
  { name: "철 바지", station: "table", inputs: [[Item.IronIngot, 7]], output: [Item.IronLeggings, 1] },
  { name: "철 부츠", station: "table", inputs: [[Item.IronIngot, 4]], output: [Item.IronBoots, 1] },
  { name: "다이아몬드 투구", station: "table", inputs: [[Item.Diamond, 5]], output: [Item.DiamondHelmet, 1] },
  { name: "다이아몬드 흉갑", station: "table", inputs: [[Item.Diamond, 8]], output: [Item.DiamondChestplate, 1] },
  { name: "다이아몬드 바지", station: "table", inputs: [[Item.Diamond, 7]], output: [Item.DiamondLeggings, 1] },
  { name: "다이아몬드 부츠", station: "table", inputs: [[Item.Diamond, 4]], output: [Item.DiamondBoots, 1] },
  // 원래는 부싯돌과 깃털이 있어야 하지만, 아직 없어 막대만으로 단순화했다.
  { name: "화살", station: "table", inputs: [[Item.Stick, 1]], output: [Item.Arrow, 4] },
  { name: "활", station: "table", inputs: [[Item.Stick, 3]], output: [Item.Bow, 1] },
  { name: "침대", station: "table", inputs: [[Block.Wool, 3], [Block.Planks, 3]], output: [Item.Bed, 1] },
  { name: "빵", station: "table", inputs: [[Item.Grain, 3]], output: [Item.Bread, 1] },
  // 드래곤을 불러내는 뿔. 비싸게 만들어서 함부로 못 부르게 했다.
  { name: "용의 뿔", station: "table", inputs: [[Item.Diamond, 4], [Item.IronIngot, 2], [Item.Stick, 1]], output: [Item.DragonHorn, 1] },
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
    // 다이아몬드는 철과 달리 화로에 굽지 않고 캐면 바로 원석 그대로 쓴다 (진짜 마인크래프트처럼).
    case Block.DiamondOre:
      return [[Item.Diamond, 1]];
    default:
      return [[block, 1]];
  }
}

/** 동물을 잡으면 나오는 것들. 돼지와 양은 고기, 양은 양털, 해골은 뼈, 크리퍼는 화약을 준다. */
export function mobDrops(kind: string, rng: () => number): [number, number][] {
  const drops: [number, number][] = [];
  if (kind === "pig" || kind === "sheep") drops.push([Item.Meat, 1 + (rng() < 0.5 ? 1 : 0)]);
  if (kind === "sheep") drops.push([Block.Wool, 1 + (rng() < 0.5 ? 1 : 0)]);
  if (kind === "skeleton") drops.push([Item.Bone, 1 + (rng() < 0.5 ? 1 : 0)]);
  if (kind === "creeper") drops.push([Item.Gunpowder, 1 + (rng() < 0.5 ? 1 : 0)]);
  if (kind === "fish") drops.push([Item.RawFish, 1]);
  if (kind === "dragon") {
    drops.push([Item.DragonScale, 3 + Math.floor(rng() * 3)]);
    drops.push([Item.Diamond, 2 + Math.floor(rng() * 3)]);
  }
  return drops;
}

/** 한 칸에 쌓을 수 있는 최대 개수 (도구는 내구도가 서로 달라질 수 있어 한 칸에 하나만 넣는다). */
export const STACK_MAX = 64;

/** 가방 칸 수. 실제 마인크래프트(27칸 보관 + 9칸 아이템 바)와 같은 27칸으로 맞췄다 (아이템 바는 이 칸과 별개로 6칸이다). */
export const SLOT_COUNT = 27;

interface Slot {
  item: number;
  count: number;
}

/**
 * 가방. 정해진 칸 수(SLOT_COUNT) 안에서만 아이템을 들 수 있고, 한 칸에는 STACK_MAX개까지만 쌓인다.
 * 도구(곡괭이·도끼·삽·검), 방어구(투구·흉갑·바지·부츠), 활은 한 칸에 하나만 들어가고, 같은 종류를 두 개 갖고 다니지 않는다.
 */
export class Inventory {
  private slots: (Slot | null)[] = new Array(SLOT_COUNT).fill(null);
  /** 도구 번호 → 지금 가진 그 도구의 남은 내구도 */
  private readonly wear = new Map<number, number>();

  private maxStack(item: number): number {
    if (item === Item.Bow) return 1;
    return TOOL_BY_ID.has(item) || ARMOR_BY_ID.has(item) ? 1 : STACK_MAX;
  }

  count(item: number): number {
    let total = 0;
    for (const slot of this.slots) if (slot && slot.item === item) total += slot.count;
    return total;
  }

  /** 이 아이템을 지금 몇 개나 더 넣을 수 있는지 (칸이 다 차면 0). */
  freeSpace(item: number): number {
    const max = this.maxStack(item);
    if (max === 1) return this.count(item) > 0 ? 0 : this.slots.some((s) => s === null) ? 1 : 0;
    let free = 0;
    for (const slot of this.slots) {
      if (slot === null) free += max;
      else if (slot.item === item) free += max - slot.count;
    }
    return free;
  }

  /** 실제로 넣은 개수를 돌려준다. 가방이 모자라면 들어가는 만큼만 넣는다. */
  add(item: number, amount = 1): number {
    if (amount <= 0) return 0;
    const max = this.maxStack(item);

    if (max === 1) {
      if (this.count(item) > 0) return 0;
      const empty = this.slots.indexOf(null);
      if (empty < 0) return 0;
      this.slots[empty] = { item, count: 1 };
      return 1;
    }

    let remaining = amount;
    for (const slot of this.slots) {
      if (remaining <= 0) break;
      if (slot && slot.item === item && slot.count < max) {
        const added = Math.min(max - slot.count, remaining);
        slot.count += added;
        remaining -= added;
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const added = Math.min(max, remaining);
        this.slots[i] = { item, count: added };
        remaining -= added;
      }
    }
    return amount - remaining;
  }

  /** 충분히 있으면 빼고 true, 모자라면 아무것도 안 하고 false. */
  remove(item: number, amount = 1): boolean {
    if (this.count(item) < amount) return false;
    let remaining = amount;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (!slot || slot.item !== item) continue;
      const taken = Math.min(slot.count, remaining);
      slot.count -= taken;
      remaining -= taken;
      if (slot.count === 0) {
        this.slots[i] = null;
        this.wear.delete(item);
      }
    }
    return true;
  }

  canCraft(recipe: Recipe): boolean {
    return recipe.inputs.every(([item, amount]) => this.count(item) >= amount);
  }

  /** 재료가 있어도 결과를 넣을 자리가 없으면 만들지 않는다 (재료를 잃지 않도록). */
  craft(recipe: Recipe): boolean {
    if (!this.canCraft(recipe)) return false;
    const [outItem, outAmount] = recipe.output;
    if (this.freeSpace(outItem) < outAmount) return false;
    for (const [item, amount] of recipe.inputs) this.remove(item, amount);
    this.add(outItem, outAmount);
    return true;
  }

  /** 지금 가진 도구 하나의 남은 내구도 (없는 도구면 0). */
  toolLeft(item: number): number {
    const tool = TOOL_BY_ID.get(item);
    if (!tool || this.count(item) === 0) return 0;
    return this.wear.get(item) ?? toolDurability(tool);
  }

  /** 도구를 한 번 쓴다. 다 닳아서 부러졌으면 true. */
  useTool(item: number): boolean {
    if (!TOOL_BY_ID.has(item) || this.count(item) === 0) return false;
    const left = this.toolLeft(item) - 1;
    if (left <= 0) {
      this.remove(item, 1);
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

  /** 가진 아이템을 종류별 [번호, 총 개수] 목록으로 (번호 순). */
  entries(): [number, number][] {
    const totals = new Map<number, number>();
    for (const slot of this.slots) if (slot) totals.set(slot.item, (totals.get(slot.item) ?? 0) + slot.count);
    return [...totals.entries()].sort((a, b) => a[0] - b[0]);
  }

  /** 쓰고 있는 칸 수 (화면에 "24/27칸"처럼 보여줄 때 쓴다). */
  get slotsUsed(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  get slotCount(): number {
    return this.slots.length;
  }

  /** 저장용: 닳은 도구의 [번호, 남은 내구도] 목록 */
  wearEntries(): [number, number][] {
    return [...this.wear.entries()].filter(([item]) => this.count(item) > 0);
  }

  /**
   * 저장된 목록을 불러온다. 예전(칸 제한이 없던) 저장에 지금 칸 수보다 많은 아이템이 있었다면,
   * 넘치는 만큼은 어쩔 수 없이 사라진다.
   */
  load(entries: [number, number][], wear: [number, number][] = []): void {
    this.slots = new Array(SLOT_COUNT).fill(null);
    this.wear.clear();
    for (const [item, amount] of entries) this.add(item, amount);
    for (const [item, left] of wear) {
      const tool = TOOL_BY_ID.get(item);
      if (tool && this.count(item) > 0 && left > 0 && left <= toolDurability(tool)) this.wear.set(item, left);
    }
  }
}
