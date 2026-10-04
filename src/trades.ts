import { Item } from "./items";
import type { Inventory } from "./inventory";
import { Block } from "./world";

export type Profession = "farmer" | "smith" | "mason" | "hunter";

/** 직업 순서 (마을 사람마다 번호로 정해진다). */
export const PROFESSIONS: readonly Profession[] = ["farmer", "smith", "mason", "hunter"];

/** 거래 하나: give를 내면 get을 받는다. [아이템 번호, 개수] */
export interface Trade {
  give: [number, number];
  get: [number, number];
}

export interface ProfessionInfo {
  name: string;
  /** 몸(옷) 색 */
  color: number;
  trades: Trade[];
}

/**
 * 직업별 거래. 에메랄드가 돈이다: 필요한 물건을 팔아 에메랄드를 벌고, 에메랄드로 물건을 산다.
 * (거래 횟수 제한은 없다 — 단순하게 만들었다.)
 */
export const PROFESSION_INFO: Record<Profession, ProfessionInfo> = {
  farmer: {
    name: "농부",
    color: 0x8b6b3d,
    trades: [
      { give: [Item.Grain, 20], get: [Item.Emerald, 1] },
      { give: [Item.Emerald, 1], get: [Item.Bread, 5] },
      { give: [Item.Emerald, 1], get: [Block.Sprout, 8] },
      { give: [Item.Emerald, 2], get: [Item.CookedMeat, 6] },
    ],
  },
  smith: {
    name: "대장장이",
    color: 0x3a3a3a,
    trades: [
      { give: [Item.IronIngot, 4], get: [Item.Emerald, 1] },
      { give: [Item.Emerald, 5], get: [Item.IronPickaxe, 1] },
      { give: [Item.Emerald, 6], get: [Item.IronClub, 1] },
      { give: [Item.Emerald, 12], get: [Item.IronChestplate, 1] },
      { give: [Item.Emerald, 18], get: [Item.Diamond, 1] },
    ],
  },
  mason: {
    name: "석공",
    color: 0x9a9a9a,
    trades: [
      { give: [Item.Coal, 15], get: [Item.Emerald, 1] },
      { give: [Block.Stone, 40], get: [Item.Emerald, 1] },
      { give: [Item.Emerald, 1], get: [Block.Brick, 8] },
      { give: [Item.Emerald, 1], get: [Block.Glass, 6] },
      { give: [Item.Emerald, 2], get: [Block.Torch, 16] },
    ],
  },
  hunter: {
    name: "사냥꾼",
    color: 0x4a6b3a,
    trades: [
      { give: [Item.RawFish, 6], get: [Item.Emerald, 1] },
      { give: [Item.Bone, 8], get: [Item.Emerald, 1] },
      { give: [Item.Emerald, 1], get: [Item.Arrow, 16] },
      { give: [Item.Emerald, 6], get: [Item.Bow, 1] },
      { give: [Item.Emerald, 4], get: [Item.FishingRod, 1] },
      { give: [Item.Emerald, 8], get: [Item.Saddle, 1] },
    ],
  },
};

/** 번호로 직업을 고른다 (음수나 큰 수도 돌려 쓴다). */
export function professionAt(index: number): Profession {
  const n = PROFESSIONS.length;
  return PROFESSIONS[((Math.floor(index) % n) + n) % n];
}

export function isProfession(value: string | null): value is Profession {
  return value !== null && (PROFESSIONS as readonly string[]).includes(value);
}

/** 이 거래를 지금 할 수 있는지: 낼 것이 충분하고, 받을 것을 넣을 자리가 있다 (낸 것이 비워 주는 자리도 센다). */
export function canTrade(inventory: Inventory, trade: Trade): boolean {
  const [giveItem, giveCount] = trade.give;
  const [getItem, getCount] = trade.get;
  if (inventory.count(giveItem) < giveCount) return false;
  // 낸 뒤의 가방에 받을 것이 들어가는지 확인하려고, 임시로 빼 보고 되돌린다.
  inventory.remove(giveItem, giveCount);
  const fits = inventory.freeSpace(getItem) >= getCount;
  inventory.add(giveItem, giveCount);
  return fits;
}

/** 거래한다. 성공하면 true. 도구 닳은 정도·인챈트는 거래에 들어가지 않는 새 물건만 오간다. */
export function doTrade(inventory: Inventory, trade: Trade): boolean {
  if (!canTrade(inventory, trade)) return false;
  inventory.remove(trade.give[0], trade.give[1]);
  inventory.add(trade.get[0], trade.get[1]);
  return true;
}
