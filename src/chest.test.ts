import { describe, expect, it } from "vitest";
import { ChestField, moveStack } from "./chest";
import { Inventory, Item } from "./inventory";
import { Block } from "./world";

describe("상자", () => {
  it("자리마다 따로 보관함이 있다", () => {
    const field = new ChestField();
    field.at(1, 2, 3).add(Block.Stone, 5);
    expect(field.at(1, 2, 3).count(Block.Stone)).toBe(5);
    expect(field.at(4, 2, 3).count(Block.Stone)).toBe(0);
  });

  it("치우면 안에 든 것을 돌려주고 비운다", () => {
    const field = new ChestField();
    field.at(1, 2, 3).add(Block.Dirt, 3);
    expect(field.remove(1, 2, 3)).toEqual([[Block.Dirt, 3]]);
    expect(field.at(1, 2, 3).count(Block.Dirt)).toBe(0);
    expect(field.remove(9, 9, 9)).toEqual([]);
  });

  it("저장했다 불러와도 그대로이고, 빈 상자는 저장하지 않는다", () => {
    const field = new ChestField();
    field.at(1, 2, 3).add(Block.Stone, 70);
    field.at(7, 7, 7);
    const saved = field.toArray();
    expect(saved).toHaveLength(1);
    const again = new ChestField();
    again.load(JSON.parse(JSON.stringify(saved)));
    expect(again.at(1, 2, 3).count(Block.Stone)).toBe(70);
  });

  it("옮길 때 받는 쪽 자리가 모자라면 들어가는 만큼만 옮긴다", () => {
    const bag = new Inventory();
    const chest = new Inventory();
    bag.add(Block.Dirt, 10);
    expect(moveStack(bag, chest, Block.Dirt)).toBe(10);
    expect(bag.count(Block.Dirt)).toBe(0);
    expect(chest.count(Block.Dirt)).toBe(10);
    expect(moveStack(bag, chest, Block.Dirt)).toBe(0);
  });

  it("도구를 옮겨도 닳은 정도가 그대로 따라간다", () => {
    const bag = new Inventory();
    const chest = new Inventory();
    bag.add(Item.WoodPickaxe, 1);
    bag.useTool(Item.WoodPickaxe);
    const left = bag.toolLeft(Item.WoodPickaxe);
    moveStack(bag, chest, Item.WoodPickaxe);
    expect(chest.toolLeft(Item.WoodPickaxe)).toBe(left);
    moveStack(chest, bag, Item.WoodPickaxe);
    expect(bag.toolLeft(Item.WoodPickaxe)).toBe(left);
  });
});
