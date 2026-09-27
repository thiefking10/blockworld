import { describe, expect, it } from "vitest";
import { Furnace, FurnaceField, SLOT_MAX, SMELT_SECONDS } from "./furnace";
import { Item } from "./items";
import { Block } from "./world";

describe("Furnace", () => {
  it("연료가 있으면 재료를 하나씩 굽는다 (10초에 하나)", () => {
    const f = new Furnace();
    f.addInput(Block.IronOre, 3);
    f.addFuel(Block.Planks, 2);
    f.advance(SMELT_SECONDS);
    expect(f.output).toEqual({ item: Item.IronIngot, count: 1 });
    expect(f.input?.count).toBe(2);
    f.advance(SMELT_SECONDS * 2);
    expect(f.output?.count).toBe(3);
    expect(f.input).toBeNull();
  });

  it("판자 하나로 1.5개, 막대 하나로 0.5개를 굽는다", () => {
    const planks = new Furnace();
    planks.addInput(Block.Sand, 10);
    planks.addFuel(Block.Planks, 1);
    planks.advance(100);
    expect(planks.output?.count).toBe(1);
    expect(planks.burnLeft).toBeCloseTo(0, 5); // 남은 절반은 재료 하나를 굽기에 모자라 그냥 꺼진다

    const sticks = new Furnace();
    sticks.addInput(Block.Sand, 10);
    sticks.addFuel(Item.Stick, 2);
    sticks.advance(100);
    expect(sticks.output?.count).toBe(1);
    expect(sticks.fuel).toBeNull();
  });

  it("연료가 없으면 굽지 못하고, 연료를 넣으면 이어서 굽는다", () => {
    const f = new Furnace();
    f.addInput(Block.Sand, 2);
    f.advance(100);
    expect(f.output).toBeNull();
    f.addFuel(Block.Wood, 1);
    f.advance(100);
    expect(f.output).toEqual({ item: Block.Glass, count: 1 });
  });

  it("구울 수 없는 것은 재료로 못 넣고, 다른 재료가 이미 있으면 못 섞는다", () => {
    const f = new Furnace();
    expect(f.addInput(Block.Dirt, 1)).toBe(0);
    expect(f.addFuel(Block.Sand, 1)).toBe(0);
    f.addInput(Block.Sand, 1);
    expect(f.addInput(Block.IronOre, 1)).toBe(0);
    expect(f.addInput(Block.Sand, 5)).toBe(5);
    expect(f.input?.count).toBe(6);
  });

  it("한 칸에는 64개까지만 들어간다", () => {
    const f = new Furnace();
    expect(f.addInput(Block.Sand, 100)).toBe(SLOT_MAX);
    expect(f.addInput(Block.Sand, 1)).toBe(0);
  });

  it("결과 칸에 다른 물건이 남아 있으면 굽기를 멈춘다", () => {
    const f = new Furnace();
    f.output = { item: Item.CookedMeat, count: 1 };
    f.addInput(Block.Sand, 1);
    f.addFuel(Block.Wood, 1);
    f.advance(50);
    expect(f.input?.count).toBe(1);
    expect(f.takeOutput()).toEqual({ item: Item.CookedMeat, count: 1 });
    f.advance(50);
    expect(f.output?.item).toBe(Block.Glass);
  });

  it("고기는 구운 고기가 된다", () => {
    const f = new Furnace();
    f.addInput(Item.Meat, 1);
    f.addFuel(Block.Wood, 1);
    f.advance(10);
    expect(f.output).toEqual({ item: Item.CookedMeat, count: 1 });
  });

  it("따라잡기: 창을 닫아 둔 동안 흐른 시간만큼 굽는다", () => {
    const f = new Furnace(100);
    f.addInput(Block.IronOre, 2);
    f.addFuel(Block.Planks, 2);
    f.catchUp(125);
    expect(f.output?.count).toBe(2);
    f.catchUp(90); // 시간이 거꾸로 가도 망가지지 않는다
    expect(f.output?.count).toBe(2);
  });

  it("화로를 부수면 안에 든 것을 모두 돌려준다", () => {
    const field = new FurnaceField();
    const f = field.at(1, 2, 3, 0);
    f.addInput(Block.Sand, 4);
    f.addFuel(Block.Wood, 1);
    f.advance(10);
    const returned = field.remove(1, 2, 3, 10);
    const total = Object.fromEntries(returned.map((s) => [s.item, s.count]));
    expect(total[Block.Sand]).toBe(3);
    expect(total[Block.Glass]).toBe(1);
    expect(field.size).toBe(0);
  });

  it("저장했다가 그대로 불러온다", () => {
    const field = new FurnaceField();
    const f = field.at(5, 6, 7, 20);
    f.addInput(Block.IronOre, 5);
    f.addFuel(Block.Wood, 2);
    f.advance(15);
    const copy = new FurnaceField();
    copy.load(JSON.parse(JSON.stringify(field.toArray())));
    expect(copy.toArray()).toEqual(field.toArray());
  });
});
