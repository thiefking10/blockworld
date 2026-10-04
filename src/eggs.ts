import { Item } from "./items";
import type { MobKind } from "./mobs";

export interface EggDef {
  item: number;
  kind: MobKind;
  name: string;
  /** 알 무늬 색 (손에 든 모양) */
  color: number;
}

/** 동물·괴물마다 하나씩 있는 스폰 알. 땅을 향해 놓으면 그 동물이 나타난다. */
export const EGGS: EggDef[] = [
  { item: Item.PigEgg, kind: "pig", name: "돼지 알", color: 0xf2a6a6 },
  { item: Item.SheepEgg, kind: "sheep", name: "양 알", color: 0xf2f2ee },
  { item: Item.HorseEgg, kind: "horse", name: "말 알", color: 0x8b5a2b },
  { item: Item.WolfEgg, kind: "wolf", name: "늑대 알", color: 0xcfc7ba },
  { item: Item.VillagerEgg, kind: "villager", name: "마을 사람 알", color: 0x8b6b3d },
  { item: Item.ZombieEgg, kind: "zombie", name: "좀비 알", color: 0x3a8f7a },
  { item: Item.SkeletonEgg, kind: "skeleton", name: "해골 알", color: 0xe4e0d2 },
  { item: Item.CreeperEgg, kind: "creeper", name: "크리퍼 알", color: 0x4caf50 },
  { item: Item.SpiderEgg, kind: "spider", name: "거미 알", color: 0x2a2018 },
  { item: Item.FishEgg, kind: "fish", name: "물고기 알", color: 0xd98a4a },
  { item: Item.DragonEgg, kind: "dragon", name: "드래곤 알", color: 0x5a2f7a },
];

export const EGG_BY_ITEM = new Map<number, EggDef>(EGGS.map((egg) => [egg.item, egg]));

export function isEgg(item: number): boolean {
  return EGG_BY_ITEM.has(item);
}
