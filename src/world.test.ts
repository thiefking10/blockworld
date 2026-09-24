import { describe, expect, it } from "vitest";
import { Block, biomeAt, blocksLight, occludes, SEA_LEVEL, SIZE_X, SIZE_Y, SIZE_Z, World, isCave, isPassable, terrainNoise } from "./world";

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

  it("나무가 자라고, 기둥은 잔디 위에 서 있다", () => {
    const world = new World();
    world.generate(7);
    let woods = 0;
    let leaves = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        for (let y = 1; y < 32; y++) {
          if (world.get(x, y, z) === Block.Leaves) leaves++;
          if (world.get(x, y, z) !== Block.Wood) continue;
          woods++;
          const below = world.get(x, y - 1, z);
          expect([Block.Grass, Block.Snow, Block.Wood]).toContain(below);
        }
      }
    }
    expect(woods).toBeGreaterThan(20);
    expect(leaves).toBeGreaterThan(woods);
  });

  it("블록을 놓고 지울 수 있다", () => {
    const world = new World();
    world.set(3, 3, 3, Block.Stone);
    expect(world.get(3, 3, 3)).toBe(Block.Stone);
    world.set(3, 3, 3, Block.Air);
    expect(world.get(3, 3, 3)).toBe(Block.Air);
  });

  it("바다 높이 아래 낮은 곳은 물로 차 있고, 그 위에는 물이 없다", () => {
    const world = new World();
    world.generate(7);
    let waters = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        for (let y = 0; y < SIZE_Y; y++) {
          if (world.get(x, y, z) !== Block.Water) continue;
          waters++;
          expect(y).toBeLessThanOrEqual(SEA_LEVEL);
        }
      }
    }
    expect(waters).toBeGreaterThan(50);
  });

  it("물은 몸을 막지 않고 조준도 통과한다", () => {
    const world = new World();
    world.set(3, 3, 3, Block.Water);
    expect(world.isSolid(3, 3, 3)).toBe(false);
    expect(isPassable(Block.Water)).toBe(true);
    expect(isPassable(Block.Stone)).toBe(false);
  });

  it("땅 밑에 동굴이 적당히 파여 있다", () => {
    const world = new World();
    world.generate(7);
    let carved = 0;
    let candidates = 0;
    for (let x = 0; x < SIZE_X; x += 2) {
      for (let z = 0; z < SIZE_Z; z += 2) {
        for (let y = 3; y < 8; y++) {
          candidates++;
          if (world.get(x, y, z) === Block.Air) carved++;
        }
      }
    }
    const ratio = carved / candidates;
    expect(ratio).toBeGreaterThan(0.002);
    expect(ratio).toBeLessThan(0.2);
  });

  it("같은 시드면 같은 동굴이다", () => {
    expect(isCave(10, 5, 10, 7)).toBe(isCave(10, 5, 10, 7));
  });

  it("지붕이 있으면 어둡고, 지붕을 없애면 밝아진다", () => {
    const world = new World();
    world.set(5, 5, 5, Block.Stone);
    expect(world.isSkyLit(5, 4, 5)).toBe(false);
    expect(world.isSkyLit(5, 6, 5)).toBe(true);
    world.set(5, 5, 5, Block.Air);
    expect(world.isSkyLit(5, 4, 5)).toBe(true);
  });

  it("물은 빛을 막지 않는다", () => {
    const world = new World();
    world.set(5, 5, 5, Block.Water);
    expect(world.isSkyLit(5, 3, 5)).toBe(true);
  });

  it("유리는 몸은 막지만 빛은 통과시키고 옆 블록 면을 가리지 않는다", () => {
    const world = new World();
    world.set(5, 5, 5, Block.Glass);
    expect(world.isSolid(5, 5, 5)).toBe(true);
    expect(world.isSkyLit(5, 3, 5)).toBe(true);
    expect(blocksLight(Block.Glass)).toBe(false);
    expect(occludes(Block.Glass)).toBe(false);
    expect(occludes(Block.Stone)).toBe(true);
  });

  it("환경(바이옴)이 네 종류 모두 나타난다", () => {
    const found = new Set<string>();
    for (let x = 0; x < SIZE_X; x += 8) for (let z = 0; z < SIZE_Z; z += 8) found.add(biomeAt(x, z, 7));
    expect(found).toEqual(new Set(["plains", "forest", "desert", "snow"]));
  });

  it("같은 시드면 같은 환경이 나온다", () => {
    expect(biomeAt(50, 90, 12)).toBe(biomeAt(50, 90, 12));
  });

  it("사막 땅은 모래이고 선인장은 모래 위에만 선다", () => {
    const world = new World();
    world.generate(7);
    let cacti = 0;
    let sandColumns = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        if (biomeAt(x, z, 7) === "desert") {
          const top = world.surfaceHeight(x, z) - 1;
          const block = world.get(x, top, z);
          if (block === Block.Sand) sandColumns++;
        }
        for (let y = 1; y < SIZE_Y; y++) {
          if (world.get(x, y, z) !== Block.Cactus) continue;
          cacti++;
          expect([Block.Sand, Block.Cactus]).toContain(world.get(x, y - 1, z));
        }
      }
    }
    expect(sandColumns).toBeGreaterThan(500);
    expect(cacti).toBeGreaterThan(5);
  });

  it("눈 환경의 땅 위는 눈이다", () => {
    const world = new World();
    world.generate(7);
    let snowTops = 0;
    for (let x = 0; x < SIZE_X; x += 3) {
      for (let z = 0; z < SIZE_Z; z += 3) {
        if (biomeAt(x, z, 7) !== "snow") continue;
        const top = world.surfaceHeight(x, z) - 1;
        if (world.get(x, top, z) === Block.Snow) snowTops++;
      }
    }
    expect(snowTops).toBeGreaterThan(200);
  });
});
