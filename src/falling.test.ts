import { describe, expect, it } from "vitest";
import { isFalling, settleFrom } from "./falling";
import { fenceIdAt, refreshFences } from "./fences";
import { collisionBoxes, fenceMask, overlapsCollision, renderBoxes } from "./shapes";
import { Block, isFence, isShaped, World } from "./world";

function ground(): World {
  const world = new World();
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) world.set(x, 0, z, Block.Stone);
  return world;
}

describe("떨어지는 블록", () => {
  it("모래와 자갈만 떨어진다", () => {
    expect(isFalling(Block.Sand)).toBe(true);
    expect(isFalling(Block.Gravel)).toBe(true);
    expect(isFalling(Block.Stone)).toBe(false);
    expect(isFalling(Block.Dirt)).toBe(false);
  });

  it("받침 없이 떠 있는 모래는 땅까지 떨어진다", () => {
    const world = ground();
    world.set(5, 6, 5, Block.Sand);
    const result = settleFrom(world, 5, 6, 5);
    expect(result.moves).toEqual([{ x: 5, fromY: 6, toY: 1, block: Block.Sand }]);
    expect(world.get(5, 6, 5)).toBe(Block.Air);
    expect(world.get(5, 1, 5)).toBe(Block.Sand);
  });

  it("받침이 있으면 그대로 있다", () => {
    const world = ground();
    world.set(5, 1, 5, Block.Sand);
    expect(settleFrom(world, 5, 1, 5).moves).toEqual([]);
    expect(world.get(5, 1, 5)).toBe(Block.Sand);
  });

  it("쌓인 더미는 아래부터 떨어져 차곡차곡 쌓인다", () => {
    const world = ground();
    world.set(5, 4, 5, Block.Sand);
    world.set(5, 5, 5, Block.Gravel);
    world.set(5, 6, 5, Block.Sand);
    settleFrom(world, 5, 4, 5);
    expect([world.get(5, 1, 5), world.get(5, 2, 5), world.get(5, 3, 5)]).toEqual([Block.Sand, Block.Gravel, Block.Sand]);
    expect(world.get(5, 4, 5)).toBe(Block.Air);
  });

  it("받침 블록을 없애면 위의 모래가 내려앉는다", () => {
    const world = ground();
    world.set(5, 1, 5, Block.Stone);
    world.set(5, 2, 5, Block.Sand);
    world.set(5, 1, 5, Block.Air);
    settleFrom(world, 5, 2, 5);
    expect(world.get(5, 1, 5)).toBe(Block.Sand);
    expect(world.get(5, 2, 5)).toBe(Block.Air);
  });

  it("물을 지나 바닥까지 가라앉는다", () => {
    const world = ground();
    for (let y = 1; y <= 4; y++) world.set(5, y, 5, Block.Water);
    world.set(5, 5, 5, Block.Sand);
    settleFrom(world, 5, 5, 5);
    expect(world.get(5, 1, 5)).toBe(Block.Sand);
    expect(world.get(5, 5, 5)).toBe(Block.Air);
  });

  it("다른 블록이 위에 있어도 모래 더미만 떨어진다", () => {
    const world = ground();
    world.set(5, 3, 5, Block.Sand);
    world.set(5, 4, 5, Block.Stone);
    settleFrom(world, 5, 3, 5);
    expect(world.get(5, 1, 5)).toBe(Block.Sand);
    expect(world.get(5, 4, 5)).toBe(Block.Stone); // 돌은 떠 있어도 안 떨어진다
  });
});

describe("울타리", () => {
  it("혼자 있으면 이어진 곳이 없다", () => {
    const world = ground();
    world.set(5, 1, 5, Block.Fence);
    expect(fenceIdAt(world, 5, 1, 5)).toBe(Block.Fence);
  });

  it("옆의 울타리나 꽉 찬 블록 쪽으로 이어진다 (방향 0 +z, 1 -x, 2 -z, 3 +x)", () => {
    const world = ground();
    world.set(5, 1, 5, Block.Fence);
    world.set(5, 1, 6, Block.Fence); // +z
    world.set(4, 1, 5, Block.Stone); // -x
    world.set(5, 1, 4, Block.Flower); // 꽃은 안 이어진다
    expect(fenceMask(fenceIdAt(world, 5, 1, 5))).toBe(0b0011);
  });

  it("refreshFences는 놓은 자리와 이웃 울타리를 서로 이어 준다", () => {
    const world = ground();
    world.set(5, 1, 5, Block.Fence);
    world.set(6, 1, 5, Block.Fence);
    const changes = refreshFences(world, 6, 1, 5);
    expect(changes).toHaveLength(2);
    expect(fenceMask(world.get(5, 1, 5))).toBe(0b1000); // +x로
    expect(fenceMask(world.get(6, 1, 5))).toBe(0b0010); // -x로
    // 이웃을 치우면 다시 끊긴다
    world.set(6, 1, 5, Block.Air);
    refreshFences(world, 6, 1, 5);
    expect(world.get(5, 1, 5)).toBe(Block.Fence);
  });

  it("키가 1.5칸이라 점프로 못 넘고, 기둥은 가늘다", () => {
    expect(isFence(Block.Fence + 5)).toBe(true);
    expect(isShaped(Block.Fence)).toBe(true);
    const post = collisionBoxes(Block.Fence);
    expect(post).toHaveLength(1);
    expect(post[0][4]).toBe(1.5);
    expect(overlapsCollision(Block.Fence, [0.45, 1.2, 0.45], [0.55, 1.4, 0.55])).toBe(true);
    expect(overlapsCollision(Block.Fence, [0.0, 0, 0.0], [0.2, 2, 0.2])).toBe(false);
    // 이어진 쪽으로는 막이 있다
    expect(overlapsCollision(Block.Fence + 1, [0.45, 0.2, 0.8], [0.55, 1.2, 0.95])).toBe(true);
    expect(renderBoxes(Block.Fence + 1)!.length).toBe(3); // 기둥 + 가로대 2개
  });
});
