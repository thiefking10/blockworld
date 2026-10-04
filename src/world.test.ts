import { describe, expect, it } from "vitest";
import { Block, BlockId, biomeAt, blocksLight, MAX_LIGHT, occludes, ROCK_LINE, SEA_LEVEL, SIZE_X, SIZE_Y, SIZE_Z, SNOW_LINE, World, isCave, isPassable, isPlant, terrainHeight, terrainNoise } from "./world";

/** 수백만 칸을 toEqual로 비교하면 느려서, 직접 훑어 비교한다. */
function sameData(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("world", () => {
  it("같은 시드면 같은 지형이 나온다", () => {
    const a = new World();
    const b = new World();
    a.generate(7);
    b.generate(7);
    // 2천만 칸을 하나씩 비교하면 느려서, 바이트 덩어리째 비교한다.
    expect(sameData(a.data, b.data)).toBe(true);
  }, 30000);

  it("시드가 다르면 지형도 다르다", () => {
    const a = new World();
    const b = new World();
    a.generate(1);
    b.generate(2);
    expect(sameData(a.data, b.data)).toBe(false);
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
        for (let y = 1; y < SIZE_Y; y++) {
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
        for (let y = 20; y < 30; y++) {
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

  it("땅속 돌 사이에 철광석이 있고, 돌 안쪽에만 박혀 있다", () => {
    const world = new World();
    world.generate(7);
    let ore = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        for (let y = 0; y < SIZE_Y; y++) {
          if (world.get(x, y, z) !== Block.IronOre) continue;
          ore++;
          expect(y).toBeGreaterThanOrEqual(2);
          expect(y).toBeLessThanOrEqual(72);
          expect(y).toBeLessThan(world.surfaceHeight(x, z) - 2);
        }
      }
    }
    expect(ore).toBeGreaterThan(200);
  });
});

describe("높은 세계", () => {
  it("높이는 128칸이고 바다는 40이다", () => {
    expect(SIZE_Y).toBe(128);
    expect(SEA_LEVEL).toBe(40);
  });

  it("지형 높이는 월드 안에 있고, 산(맨 돌·눈 덮인 봉우리)이 실제로 솟아 있다", () => {
    let max = 0;
    let min = SIZE_Y;
    for (let x = 0; x < SIZE_X; x += 2) {
      for (let z = 0; z < SIZE_Z; z += 2) {
        const h = terrainHeight(x, z, 7);
        max = Math.max(max, h);
        min = Math.min(min, h);
      }
    }
    expect(min).toBeGreaterThan(5);
    expect(max).toBeLessThan(SIZE_Y - 4);
    expect(max).toBeGreaterThanOrEqual(SNOW_LINE);
  });

  it("높은 산은 맨 돌이고 가장 높은 곳은 눈이 덮여 있다", () => {
    const world = new World();
    world.generate(7);
    let rock = 0;
    let snowCap = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        let top = world.surfaceHeight(x, z) - 1;
        if (isPlant(world.get(x, top, z))) top--; // 꽃·풀은 한 칸 아래 땅을 본다
        const block = world.get(x, top, z);
        if (top >= SNOW_LINE && block === Block.Snow) snowCap++;
        else if (top >= ROCK_LINE && top < SNOW_LINE && block === Block.Stone) rock++;
        if (top >= ROCK_LINE) expect([Block.Stone, Block.Snow, Block.Wood, Block.Leaves, Block.Cactus]).toContain(block);
      }
    }
    expect(rock).toBeGreaterThan(50);
    expect(snowCap).toBeGreaterThan(20);
  });

  it("다이아몬드는 맨 밑에서만, 철광석은 훨씬 높은 곳에도 있다", () => {
    const world = new World();
    world.generate(7);
    let highestIron = 0;
    let highestDiamond = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        for (let y = 0; y < SIZE_Y; y++) {
          const b = world.get(x, y, z);
          if (b === Block.IronOre) highestIron = Math.max(highestIron, y);
          if (b === Block.DiamondOre) highestDiamond = Math.max(highestDiamond, y);
        }
      }
    }
    expect(highestDiamond).toBeGreaterThan(0);
    expect(highestDiamond).toBeLessThanOrEqual(14);
    expect(highestIron).toBeGreaterThan(40);
  });

  it("surfaceHeight와 highestIn은 실제로 놓인 블록과 맞는다", () => {
    const world = new World();
    world.set(10, 77, 10, Block.Stone);
    expect(world.surfaceHeight(10, 10)).toBe(78);
    expect(world.highestIn(0, 0, 16)).toBe(77);
    expect(world.highestIn(16, 16, 16)).toBe(-1);
    world.set(10, 77, 10, Block.Air);
    expect(world.surfaceHeight(10, 10)).toBe(0);
  });
});

/** 사방이 트인 32칸 짜리 빈 방. 가운데(16,5,16)에서 빛 실험을 한다. */
function emptyRoom(): World {
  const world = new World();
  for (let x = 0; x < 32; x++) {
    for (let z = 0; z < 32; z++) {
      world.set(x, 0, z, Block.Stone);
      world.set(x, 10, z, Block.Stone);
    }
  }
  for (let x = 0; x < 32; x++) for (let y = 1; y < 10; y++) world.set(x, y, 0, Block.Stone);
  return world;
}

describe("횃불 빛", () => {
  it("횃불 자리는 가장 밝고(15), 한 칸마다 1씩 어두워진다", () => {
    const world = emptyRoom();
    world.set(16, 5, 16, Block.Torch);
    expect(world.lightAt(16, 5, 16)).toBe(MAX_LIGHT);
    expect(world.lightAt(17, 5, 16)).toBe(MAX_LIGHT - 1);
    expect(world.lightAt(19, 5, 16)).toBe(MAX_LIGHT - 3);
  });

  /** x=17 한 면 전체를 채운 진짜 벽을 세운다 (한 칸만 막으면 옆이나 위아래로 돌아갈 수 있다). */
  function buildWall(world: World, atBlock: BlockId): void {
    for (let y = 0; y < SIZE_Y; y++) for (let z = 0; z < 32; z++) world.set(17, y, z, atBlock);
  }

  it("돌 벽은 넘지 못하지만 유리는 통과한다", () => {
    const world = emptyRoom();
    world.set(16, 5, 16, Block.Torch);
    buildWall(world, Block.Stone);
    expect(world.lightAt(18, 5, 16)).toBe(0);

    const glassWorld = emptyRoom();
    glassWorld.set(16, 5, 16, Block.Torch);
    buildWall(glassWorld, Block.Glass);
    expect(glassWorld.lightAt(18, 5, 16)).toBe(MAX_LIGHT - 2);
  });

  it("횃불을 없애면 빛도 사라진다", () => {
    const world = emptyRoom();
    world.set(16, 5, 16, Block.Torch);
    expect(world.lightAt(17, 5, 16)).toBeGreaterThan(0);
    world.set(16, 5, 16, Block.Air);
    expect(world.lightAt(16, 5, 16)).toBe(0);
    expect(world.lightAt(17, 5, 16)).toBe(0);
  });

  it("횃불 두 개가 겹치면 더 밝은 쪽 값을 따르고, 하나를 없애도 남은 쪽 빛은 그대로다", () => {
    const world = emptyRoom();
    world.set(15, 5, 16, Block.Torch);
    world.set(19, 5, 16, Block.Torch);
    const middleBefore = world.lightAt(17, 5, 16);
    expect(middleBefore).toBe(MAX_LIGHT - 2);
    world.set(19, 5, 16, Block.Air);
    expect(world.lightAt(17, 5, 16)).toBe(MAX_LIGHT - 2); // 왼쪽 횃불이 여전히 비춘다
    expect(world.lightAt(19, 5, 16)).toBe(MAX_LIGHT - 4);
  });

  it("벽을 나중에 부수면 그 틈으로 빛이 새로 들어온다", () => {
    const world = emptyRoom();
    world.set(16, 5, 16, Block.Torch);
    buildWall(world, Block.Stone);
    expect(world.lightAt(18, 5, 16)).toBe(0);
    world.set(17, 5, 16, Block.Air);
    expect(world.lightAt(17, 5, 16)).toBe(MAX_LIGHT - 1);
    expect(world.lightAt(18, 5, 16)).toBe(MAX_LIGHT - 2);
  });

  it("횃불이 하나도 없으면 blockLight를 계산하지 않아 set()이 빛을 바꾸지 않았다고 알려준다", () => {
    const world = emptyRoom();
    expect(world.set(5, 5, 5, Block.Dirt)).toBe(false);
  });

  it("횃불을 놓거나 없애면 set()이 빛이 바뀌었다고 알려준다", () => {
    const world = emptyRoom();
    expect(world.set(16, 5, 16, Block.Torch)).toBe(true);
    expect(world.set(16, 5, 16, Block.Air)).toBe(true);
  });
});
