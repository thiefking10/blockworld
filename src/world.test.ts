import { describe, expect, it } from "vitest";
import { Block, SIZE_X, SIZE_Z, World, terrainNoise } from "./world";

describe("world", () => {
  it("같은 시드면 같은 지형이 나온다", () => {
    const a = new World();
    const b = new World();
    a.generate(7);
    b.generate(7);
    expect(a.data).toEqual(b.data);
  });

  it("시드가 다르면 지형도 다르다", () => {
    const a = new World();
    const b = new World();
    a.generate(1);
    b.generate(2);
    expect(a.data).not.toEqual(b.data);
  });

  it("높이 노이즈는 0~1 사이다", () => {
    for (let i = 0; i < 200; i++) {
      const v = terrainNoise(i * 3.7, i * 1.3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("모든 자리에 바닥이 있고 위에는 공기가 있다", () => {
    const world = new World();
    world.generate(3);
    for (let x = 0; x < SIZE_X; x += 7) {
      for (let z = 0; z < SIZE_Z; z += 7) {
        expect(world.get(x, 0, z)).not.toBe(Block.Air);
        const top = world.surfaceHeight(x, z);
        expect(world.get(x, top, z)).toBe(Block.Air);
      }
    }
  });

  it("월드 밖 옆면과 바닥은 벽이다", () => {
    const world = new World();
    expect(world.isSolid(-1, 5, 5)).toBe(true);
    expect(world.isSolid(5, -1, 5)).toBe(true);
    expect(world.isSolid(5, 20, 5)).toBe(false);
  });

  it("블록을 놓고 지울 수 있다", () => {
    const world = new World();
    world.set(3, 3, 3, Block.Stone);
    expect(world.get(3, 3, 3)).toBe(Block.Stone);
    world.set(3, 3, 3, Block.Air);
    expect(world.get(3, 3, 3)).toBe(Block.Air);
  });
});
