import { describe, expect, it } from "vitest";
import { DESPAWN_SECONDS, DROP_STACK_MAX, DropField, PICKUP_DELAY } from "./drops";
import { Block, World } from "./world";

function floorWorld(): World {
  const world = new World();
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.set(x, 0, z, Block.Stone);
  return world;
}

const fixed = (v: number) => () => v;
const unlimited = () => 64;

describe("DropField", () => {
  it("떨어뜨리면 중력으로 내려와 바닥에 놓인다", () => {
    const world = floorWorld();
    const field = new DropField();
    field.spawn(Block.Dirt, 1, 10.5, 5, 10.5, fixed(0.5));
    for (let i = 0; i < 120; i++) field.update(1 / 60, world, 100, 100, 100, unlimited);
    const drop = field.drops[0];
    expect(drop.y).toBeGreaterThan(1.1);
    expect(drop.y).toBeLessThan(1.3);
    expect(drop.vy).toBe(0);
  });

  it("같은 아이템이 가까이 있으면 한 무더기로 합쳐지고, 64개를 넘으면 따로 둔다", () => {
    const field = new DropField();
    field.spawn(Block.Stone, 30, 5, 2, 5, fixed(0.5));
    field.spawn(Block.Stone, 30, 5.3, 2, 5.2, fixed(0.5));
    expect(field.drops).toHaveLength(1);
    expect(field.drops[0].count).toBe(60);
    field.spawn(Block.Stone, 10, 5.1, 2, 5.1, fixed(0.5));
    expect(field.drops).toHaveLength(2);
    field.spawn(Block.Dirt, 1, 5.1, 2, 5.1, fixed(0.5));
    expect(field.drops).toHaveLength(3);
    expect(DROP_STACK_MAX).toBe(64);
  });

  it("떨어진 직후에는 줍지 않고, 잠시 뒤 가까이 있으면 줍는다", () => {
    const world = floorWorld();
    const field = new DropField();
    field.spawn(Block.Dirt, 3, 10.5, 1.2, 10.5, fixed(0.5));
    const first = field.update(0.1, world, 10.5, 1, 10.5, unlimited);
    expect(first.picked).toEqual([]);
    let got: [number, number][] = [];
    for (let i = 0; i < 60 && got.length === 0; i++) got = field.update(1 / 30, world, 10.5, 1, 10.5, unlimited).picked;
    expect(got).toEqual([[Block.Dirt, 3]]);
    expect(field.drops).toHaveLength(0);
    expect(PICKUP_DELAY).toBeGreaterThan(0);
  });

  it("멀리 있으면 줍지 않는다", () => {
    const world = floorWorld();
    const field = new DropField();
    field.spawn(Block.Dirt, 1, 10.5, 1.2, 10.5, fixed(0.5));
    let picked = 0;
    for (let i = 0; i < 120; i++) picked += field.update(1 / 60, world, 20, 1, 20, unlimited).picked.length;
    expect(picked).toBe(0);
  });

  it("가방에 자리가 모자라면 일부만 줍고 나머지는 남는다", () => {
    const world = floorWorld();
    const field = new DropField();
    field.spawn(Block.Sand, 10, 10.5, 1.2, 10.5, fixed(0.5));
    let picked: [number, number][] = [];
    for (let i = 0; i < 90 && picked.length === 0; i++) picked = field.update(1 / 30, world, 10.5, 1, 10.5, () => 4).picked;
    expect(picked).toEqual([[Block.Sand, 4]]);
    expect(field.drops[0].count).toBe(6);
  });

  it("가방이 꽉 차면 못 줍는다고 알려준다", () => {
    const world = floorWorld();
    const field = new DropField();
    field.spawn(Block.Sand, 1, 10.5, 1.2, 10.5, fixed(0.5));
    let blocked = false;
    for (let i = 0; i < 60; i++) blocked = field.update(1 / 30, world, 10.5, 1, 10.5, () => 0).blocked || blocked;
    expect(blocked).toBe(true);
    expect(field.drops).toHaveLength(1);
  });

  it("오래되면 사라진다", () => {
    const world = floorWorld();
    const field = new DropField();
    field.spawn(Block.Sand, 1, 10.5, 1.2, 10.5, fixed(0.5));
    for (let t = 0; t < DESPAWN_SECONDS + 5; t += 5) field.update(5, world, 100, 100, 100, unlimited);
    expect(field.drops).toHaveLength(0);
  });

  it("저장했다가 그대로 불러온다", () => {
    const field = new DropField();
    field.spawn(Block.Wood, 5, 3.25, 2.5, 4.75, fixed(0.5));
    const copy = new DropField();
    copy.load(field.toArray());
    expect(copy.drops).toHaveLength(1);
    expect(copy.drops[0]).toMatchObject({ item: Block.Wood, count: 5, x: 3.25, y: 2.5, z: 4.75 });
  });
});
