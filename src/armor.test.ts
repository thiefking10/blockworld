import { describe, expect, it } from "vitest";
import { bestArmor, reduceDamage, totalArmorPoints } from "./armor";
import { Item } from "./items";

describe("방어구", () => {
  it("아무것도 없으면 점수 0, 피해가 그대로 들어온다", () => {
    expect(totalArmorPoints(() => false)).toBe(0);
    expect(reduceDamage(10, () => false)).toBe(10);
  });

  it("부위마다 가장 좋은 것만 세고, 같은 부위 두 개를 더하지 않는다", () => {
    const owned = new Set<number>([Item.IronHelmet, Item.DiamondHelmet]);
    const armor = bestArmor((id) => owned.has(id));
    expect(armor).toHaveLength(1);
    expect(armor[0].id).toBe(Item.DiamondHelmet);
  });

  it("전신 다이아몬드 갑옷이면 점수 20, 피해가 80% 줄어든다", () => {
    const owned = new Set<number>([Item.DiamondHelmet, Item.DiamondChestplate, Item.DiamondLeggings, Item.DiamondBoots]);
    const has = (id: number) => owned.has(id);
    expect(totalArmorPoints(has)).toBe(20);
    expect(reduceDamage(10, has)).toBeCloseTo(2, 5);
  });

  it("전신 철 갑옷이면 점수 15, 피해가 60% 줄어든다", () => {
    const owned = new Set<number>([Item.IronHelmet, Item.IronChestplate, Item.IronLeggings, Item.IronBoots]);
    const has = (id: number) => owned.has(id);
    expect(totalArmorPoints(has)).toBe(15);
    expect(reduceDamage(10, has)).toBeCloseTo(4, 5);
  });
});
