export const Block = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Wood: 5,
  Leaves: 6,
  Water: 7,
  Planks: 8,
  Glass: 9,
  Brick: 10,
  Snow: 11,
  Cactus: 12,
  Wool: 13,
  IronOre: 14,
  Flower: 15,
  YellowFlower: 16,
  Sprout: 17,
  Wheat: 18,
  CraftingTable: 19,
  Furnace: 20,
  Torch: 21,
  DiamondOre: 22,
  CoalOre: 23,
  /** 아래부터는 모양이 네모가 아닌 블록이다. 방향이 있는 것은 방향마다 번호가 하나씩 있다 (shapes.ts). */
  PlankSlab: 24,
  StoneSlab: 25,
  /** 계단: 26~29(판자) / 30~33(돌), 방향 0~3 */
  PlankStairs: 26,
  StoneStairs: 30,
  /** 상자: 34~37 */
  Chest: 34,
  /** 사다리: 38~41 */
  Ladder: 38,
  /** 문 아랫부분: 42~49 (닫힘 42~45, 열림 46~49), 윗부분: 50~57 */
  Door: 42,
  DoorTop: 50,
  /** 자갈은 모래처럼 받침이 없으면 떨어진다 (falling.ts) */
  Gravel: 58,
  /** 울타리: 59~74. 번호는 59 + (이웃과 이어진 방향 4칸의 조합 0~15) */
  Fence: 59,
} as const;
export type BlockId = (typeof Block)[keyof typeof Block];

export const SIZE_X = 256;
/** 높이 128칸: 바다 40, 평지 50~60 안팎, 산꼭대기는 100 근처까지 올라간다. */
export const SIZE_Y = 128;
export const SIZE_Z = 256;
export const SEA_LEVEL = 40;
/** 지형 생성 방식이 바뀔 때마다 올린다. 옛 저장·옛 멀티플레이 방과 섞이지 않게 하는 데 쓴다. */
export const WORLD_VERSION = 2;

/** 이 높이 이상의 산은 맨 돌이 드러나고, 더 높으면 눈이 덮인다. */
export const ROCK_LINE = SEA_LEVEL + 36;
export const SNOW_LINE = SEA_LEVEL + 46;

/** 빛의 최댓값 (횃불 바로 옆). 한 칸 지날 때마다 1씩 줄어든다. */
export const MAX_LIGHT = 15;

/** 꽃, 밀, 횃불처럼 십자 모양으로 그려지는 블록인지. 몸은 지나가며 빛도 막지 않고, 밑받침이 사라지면 같이 떨어진다. */
export function isPlant(block: number): boolean {
  return (
    block === Block.Flower ||
    block === Block.YellowFlower ||
    block === Block.Sprout ||
    block === Block.Wheat ||
    block === Block.Torch
  );
}

/** 반블록·계단·상자·사다리·문처럼 한 칸을 다 채우지 않는 모양의 블록인지. */
export function isShaped(block: number): boolean {
  return (block >= Block.PlankSlab && block <= 57) || isFence(block);
}

export function isFence(block: number): boolean {
  return block >= Block.Fence && block < Block.Fence + 16;
}

export function isChest(block: number): boolean {
  return block >= Block.Chest && block < Block.Ladder;
}

export function isLadder(block: number): boolean {
  return block >= Block.Ladder && block < Block.Door;
}

export function isDoor(block: number): boolean {
  return block >= Block.Door && block < 58;
}

/** 열려 있는 문인지 (아랫부분 46~49, 윗부분 54~57). */
export function isOpenDoor(block: number): boolean {
  return isDoor(block) && (block - Block.Door) % 8 >= 4;
}

/** 빛을 막고 몸이 부딪히는 블록인지 (공기, 물, 식물은 아니다). */
export function isOpaque(block: number): boolean {
  return block !== Block.Air && block !== Block.Water && !isPlant(block);
}

/** 하늘빛을 막는 블록인지. 유리는 몸은 막아도 빛은 통과시킨다. */
export function blocksLight(block: number): boolean {
  return isOpaque(block) && block !== Block.Glass && !isLadder(block) && !isOpenDoor(block) && !isFence(block);
}

/** 옆 블록의 면을 가려 그리지 않아도 되게 하는 블록인지 (투명한 유리는 가리지 못한다). */
export function occludes(block: number): boolean {
  return isOpaque(block) && block !== Block.Glass && !isShaped(block);
}

/** 지나갈 수 있고 조준이 통과하는 블록인지 (공기, 물). */
export function isPassable(block: number): boolean {
  return block === Block.Air || block === Block.Water;
}

function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 1103515245) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const layer = (yy: number): number => {
    const a = hash3(x0, yy, z0, seed);
    const b = hash3(x0 + 1, yy, z0, seed);
    const c = hash3(x0, yy, z0 + 1, seed);
    const d = hash3(x0 + 1, yy, z0 + 1, seed);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
  return lerp(layer(y0), layer(y0 + 1), ty);
}

/** 여러 크기의 물결을 겹쳐 자연스러운 언덕 높이(0~1)를 만든다. */
export function terrainNoise(x: number, z: number, seed: number): number {
  let total = 0;
  let amp = 1;
  let freq = 1 / 24;
  let norm = 0;
  for (let i = 0; i < 3; i++) {
    total += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

/** 땅 높이. 완만한 언덕(30~60) 위에, 넓은 범위의 산 노이즈가 높은 곳에서 산을 100 근처까지 솟게 한다. */
export function terrainHeight(x: number, z: number, seed: number): number {
  const t = terrainNoise(x, z, seed);
  const mountain = valueNoise(x / 90, z / 90, seed + 7001);
  const lift = Math.max(0, mountain - 0.52) * 140 * (0.5 + t);
  return Math.min(SIZE_Y - 8, Math.floor(30 + t * 30 + lift));
}

/** 동굴은 이 높이까지만 파고, 철광석·다이아몬드는 각각 이 높이 아래에서만 나온다. */
const CAVE_TOP = 90;
const IRON_TOP = 72;
const COAL_TOP = 100;
const DIAMOND_TOP = 14;

/** 두 개의 3차원 노이즈가 동시에 "중간값 근처"인 자리가 구불구불한 터널이 된다. */
export function isCave(x: number, y: number, z: number, seed: number): boolean {
  const a = valueNoise3(x * 0.07, y * 0.09, z * 0.07, seed + 301);
  const b = valueNoise3(x * 0.07 + 50, y * 0.09 + 50, z * 0.07 + 50, seed + 707);
  return Math.abs(a - 0.5) < 0.075 && Math.abs(b - 0.5) < 0.075;
}

export type Biome = "plains" | "forest" | "desert" | "snow";

/** 아주 넓은 물결 두 개(온도, 습도)로 지역의 환경을 정한다. */
export function biomeAt(x: number, z: number, seed: number): Biome {
  const temperature = valueNoise(x / 70, z / 70, seed + 4001);
  const moisture = valueNoise(x / 55 + 300, z / 55 + 300, seed + 5003);
  if (temperature > 0.62) return "desert";
  if (temperature < 0.38) return "snow";
  return moisture > 0.55 ? "forest" : "plains";
}

/** 환경별 나무(사막은 선인장) 심는 확률 */
const PLANT_DENSITY: Record<Biome, number> = { plains: 0.012, forest: 0.04, desert: 0.01, snow: 0.006 };

/** 빛이 퍼지는 여섯 방향 */
const LIGHT_NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class World {
  readonly data = new Uint8Array(SIZE_X * SIZE_Y * SIZE_Z);
  /** 열(x,z)마다 가장 높은 "빛을 막는 블록"의 높이. 없으면 -1. 동굴 안을 어둡게 그릴 때 쓴다. */
  private readonly top = new Int16Array(SIZE_X * SIZE_Z).fill(-1);
  /** 열(x,z)마다 지금까지 놓인 가장 높은 "공기가 아닌 블록"의 높이 (줄어들 수는 있어도 여기선 안 줄인다 — 위쪽 한계로만 쓴다). */
  private readonly high = new Int16Array(SIZE_X * SIZE_Z).fill(-1);
  /** 횃불에서 퍼진 빛(0~15). 횃불이 하나도 없으면 전부 0이고 계산도 건너뛴다. */
  private readonly light = new Uint8Array(SIZE_X * SIZE_Y * SIZE_Z);
  /** 지금 세워진 횃불 개수. 0이면 set()에서 빛 계산을 건너뛰어 세계를 만들 때 느려지지 않는다. */
  private torchCount = 0;

  private index(x: number, y: number, z: number): number {
    return x + SIZE_X * (z + SIZE_Z * y);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < SIZE_X && y >= 0 && y < SIZE_Y && z >= 0 && z < SIZE_Z;
  }

  get(x: number, y: number, z: number): BlockId {
    if (!this.inBounds(x, y, z)) return Block.Air;
    return this.data[this.index(x, y, z)] as BlockId;
  }

  /** 이 자리에 횃불빛이 얼마나 닿는지 (0~15, 범위 밖이거나 안 닿으면 0). */
  lightAt(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.light[this.index(x, y, z)];
  }

  /** level만큼(기본 최댓값) (x,y,z)에서 사방으로 빛을 퍼뜨린다. 막힌 곳은 넘지 못하고, 이미 더 밝으면 그대로 둔다. */
  private addLight(x: number, y: number, z: number, level: number = MAX_LIGHT): void {
    if (!this.inBounds(x, y, z)) return;
    const idx = this.index(x, y, z);
    if (this.light[idx] >= level) return;
    this.light[idx] = level;
    this.spread([[x, y, z, level]]);
  }

  private spread(queue: [number, number, number, number][]): void {
    while (queue.length > 0) {
      const [x, y, z, level] = queue.shift() as [number, number, number, number];
      if (level <= 1) continue;
      const nextLevel = level - 1;
      for (const [dx, dy, dz] of LIGHT_NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!this.inBounds(nx, ny, nz) || blocksLight(this.get(nx, ny, nz))) continue;
        const idx = this.index(nx, ny, nz);
        if (this.light[idx] >= nextLevel) continue;
        this.light[idx] = nextLevel;
        queue.push([nx, ny, nz, nextLevel]);
      }
    }
  }

  /**
   * (x,y,z)의 빛의 근원이 사라졌을 때 부른다. 이 자리에서 나온 빛을 거둬들이고,
   * 다른 횃불이 여전히 비추고 있는 자리는 그 빛으로 다시 채운다 (표준 2단계 빛 제거 방식).
   */
  private removeLight(x: number, y: number, z: number): void {
    if (!this.inBounds(x, y, z)) return;
    const idx = this.index(x, y, z);
    const startLevel = this.light[idx];
    if (startLevel === 0) return;
    this.light[idx] = 0;

    const removalQueue: [number, number, number, number][] = [[x, y, z, startLevel]];
    const refillSeeds: [number, number, number, number][] = [];
    while (removalQueue.length > 0) {
      const [cx, cy, cz, level] = removalQueue.shift() as [number, number, number, number];
      for (const [dx, dy, dz] of LIGHT_NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;
        if (!this.inBounds(nx, ny, nz)) continue;
        const nIdx = this.index(nx, ny, nz);
        const nLevel = this.light[nIdx];
        if (nLevel === 0) continue;
        if (nLevel < level) {
          this.light[nIdx] = 0;
          removalQueue.push([nx, ny, nz, nLevel]);
        } else {
          refillSeeds.push([nx, ny, nz, nLevel]);
        }
      }
    }
    this.spread(refillSeeds);
  }

  /** 블록을 놓거나 지운다. 빛(횃불)이 달라졌으면 true를 돌려준다 (화면을 얼마나 넓게 다시 그릴지 정할 때 쓴다). */
  set(x: number, y: number, z: number, block: BlockId): boolean {
    if (!this.inBounds(x, y, z)) return false;
    const idx = this.index(x, y, z);
    const oldBlock = this.data[idx] as BlockId;
    if (oldBlock === block) return false;
    this.data[idx] = block;

    const column = x + SIZE_X * z;
    if (block !== Block.Air && y > this.high[column]) this.high[column] = y;
    if (blocksLight(block)) {
      if (y > this.top[column]) this.top[column] = y;
    } else if (y === this.top[column]) {
      let t = y - 1;
      while (t >= 0 && !blocksLight(this.get(x, t, z))) t--;
      this.top[column] = t;
    }

    if (oldBlock === Block.Torch) this.torchCount--;
    if (block === Block.Torch) this.torchCount++;
    // 횃불이 세상에 하나도 없고 이번 일도 횃불과 상관없다면, 빛 계산은 아예 건너뛴다 (세계 생성이 느려지지 않도록).
    if (this.torchCount === 0 && block !== Block.Torch && oldBlock !== Block.Torch) return false;

    let lightChanged = false;
    if (oldBlock === Block.Torch) {
      this.removeLight(x, y, z);
      lightChanged = true;
    }
    if (blocksLight(oldBlock) !== blocksLight(block)) {
      if (blocksLight(block)) {
        if (this.lightAt(x, y, z) > 0) {
          this.removeLight(x, y, z);
          lightChanged = true;
        }
      } else {
        let best = 0;
        for (const [dx, dy, dz] of LIGHT_NEIGHBORS) best = Math.max(best, this.lightAt(x + dx, y + dy, z + dz) - 1);
        if (best > 0) {
          this.addLight(x, y, z, best);
          lightChanged = true;
        }
      }
    }
    if (block === Block.Torch) {
      this.addLight(x, y, z, MAX_LIGHT);
      lightChanged = true;
    }
    return lightChanged;
  }

  /** 걸어다닐 때 막히는 블록인지. 월드 옆면과 바닥은 벽으로 친다. 물은 막지 않는다. */
  isSolid(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z || y < 0) return true;
    const block = this.get(x, y, z);
    if (isShaped(block)) return !isLadder(block) && !isOpenDoor(block);
    return isOpaque(block);
  }

  /** 이 칸 위로 하늘이 뚫려 있는지 (위에 빛을 막는 블록이 없는지). */
  isSkyLit(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z) return true;
    return y > this.top[x + SIZE_X * z];
  }

  /** x,z 자리에서 가장 높은 블록 위 높이(서 있을 수 있는 y). 물도 센다. */
  surfaceHeight(x: number, z: number): number {
    if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z) return 0;
    for (let y = this.high[x + SIZE_X * z]; y >= 0; y--) {
      if (this.get(x, y, z) !== Block.Air) return y + 1;
    }
    return 0;
  }

  /** 가로 size칸 구역 안에서 블록이 있을 수 있는 가장 높은 y (그림 조각을 만들 때 빈 하늘을 건너뛰는 데 쓴다). -1이면 비었다. */
  highestIn(startX: number, startZ: number, size: number): number {
    let best = -1;
    for (let z = Math.max(0, startZ); z < Math.min(SIZE_Z, startZ + size); z++) {
      for (let x = Math.max(0, startX); x < Math.min(SIZE_X, startX + size); x++) {
        const h = this.high[x + SIZE_X * z];
        if (h > best) best = h;
      }
    }
    return best;
  }

  /** 땅 밑을 3차원 노이즈로 파내 동굴을 만든다. 바다 근처와 맨 아래층은 건드리지 않는다. */
  private carveCaves(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const surface = this.top[x + SIZE_X * z];
        if (surface < SEA_LEVEL + 2) continue;
        const ceiling = Math.min(surface, CAVE_TOP);
        for (let y = 4; y <= ceiling; y++) {
          if (isCave(x, y, z, seed)) this.set(x, y, z, Block.Air);
        }
      }
    }
  }

  /** 땅속 돌 사이에 철광석을 덩어리(2x2x2 칸 단위)로 흩뿌린다. 땅속 깊은 곳에 더 많고, 높은 산 위쪽엔 드물다. */
  private scatterOre(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const surface = this.top[x + SIZE_X * z];
        for (let y = 2; y <= Math.min(surface - 3, IRON_TOP); y++) {
          if (this.get(x, y, z) !== Block.Stone) continue;
          const chance = y <= SEA_LEVEL ? 0.02 : 0.008;
          if (hash3(x >> 1, y >> 1, z >> 1, seed + 31337) > chance) continue;
          if (hash3(x, y, z, seed + 11) < 0.85) this.set(x, y, z, Block.IronOre);
        }
      }
    }
  }

  /** 석탄은 철보다 흔하다. 땅속 어디서나 덩어리로 나오고, 산 높은 곳에도 있다. */
  private scatterCoal(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const surface = this.top[x + SIZE_X * z];
        for (let y = 5; y <= Math.min(surface - 2, COAL_TOP); y++) {
          if (this.get(x, y, z) !== Block.Stone) continue;
          if (hash3(x >> 1, y >> 1, z >> 1, seed + 24601) > 0.022) continue;
          if (hash3(x, y, z, seed + 91) < 0.85) this.set(x, y, z, Block.CoalOre);
        }
      }
    }
  }

  /** 다이아몬드는 철보다 훨씬 드물고, 땅속 아주 깊은 곳(맨 밑 14칸)에서만 나온다 (진짜 마인크래프트처럼 깊을수록 귀하다). */
  private scatterGravel(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const surface = this.top[x + SIZE_X * z];
        for (let y = 5; y <= Math.min(surface - 3, SEA_LEVEL + 12); y++) {
          if (this.get(x, y, z) !== Block.Stone) continue;
          if (hash3(x >> 1, y >> 1, z >> 1, seed + 77123) > 0.012) continue;
          if (hash3(x, y, z, seed + 33) < 0.8) this.set(x, y, z, Block.Gravel);
        }
      }
    }
  }

  private scatterDiamond(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        for (let y = 2; y <= DIAMOND_TOP; y++) {
          if (this.get(x, y, z) !== Block.Stone) continue;
          if (hash3(x >> 1, y >> 1, z >> 1, seed + 51413) > 0.003) continue;
          if (hash3(x, y, z, seed + 71) < 0.8) this.set(x, y, z, Block.DiamondOre);
        }
      }
    }
  }

  /** 잔디 위 여기저기에 나무(기둥 + 잎)를 심는다. 시드가 같으면 같은 자리에 심긴다. */
  private plantTrees(seed: number): void {
    for (let x = 3; x < SIZE_X - 3; x++) {
      for (let z = 3; z < SIZE_Z - 3; z++) {
        const biome = biomeAt(x, z, seed);
        if (hash2(x, z, seed + 999) > PLANT_DENSITY[biome]) continue;
        const ground = this.surfaceHeight(x, z) - 1;
        const groundBlock = this.get(x, ground, z);

        if (biome === "desert") {
          if (groundBlock !== Block.Sand || ground < SEA_LEVEL + 2) continue;
          const cactusHeight = 2 + Math.floor(hash2(x, z, seed + 77) * 2);
          for (let y = ground + 1; y <= ground + cactusHeight; y++) this.set(x, y, z, Block.Cactus);
          continue;
        }
        if (groundBlock !== Block.Grass && groundBlock !== Block.Snow) continue;
        if (ground >= ROCK_LINE - 6) continue; // 높은 산자락엔 나무가 안 자란다

        const top = ground + 4 + Math.floor(hash2(x, z, seed + 5) * 2);
        if (top + 2 >= SIZE_Y) continue;

        for (let y = ground + 1; y <= top; y++) this.set(x, y, z, Block.Wood);
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let y = top - 1; y <= top + 1; y++) {
              const far = Math.max(Math.abs(dx), Math.abs(dz));
              if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              if (y === top + 1 && far > 1) continue;
              if (this.get(x + dx, y, z + dz) === Block.Air) this.set(x + dx, y, z + dz, Block.Leaves);
            }
          }
        }
      }
    }
  }

  /** 풀밭 위에 꽃을 드문드문 심는다. 초원과 숲에만 핀다. */
  private scatterFlowers(seed: number): void {
    for (let x = 1; x < SIZE_X - 1; x++) {
      for (let z = 1; z < SIZE_Z - 1; z++) {
        const biome = biomeAt(x, z, seed);
        const density = biome === "plains" ? 0.03 : biome === "forest" ? 0.02 : 0;
        if (density === 0 || hash2(x, z, seed + 2024) > density) continue;
        const ground = this.surfaceHeight(x, z) - 1;
        if (ground < SEA_LEVEL || this.get(x, ground, z) !== Block.Grass || this.get(x, ground + 1, z) !== Block.Air) continue;
        this.set(x, ground + 1, z, hash2(x, z, seed + 55) < 0.5 ? Block.Flower : Block.YellowFlower);
      }
    }
  }

  generate(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const height = terrainHeight(x, z, seed);
        const biome = biomeAt(x, z, seed);
        const sandy = height <= SEA_LEVEL || biome === "desert";
        const rocky = height >= ROCK_LINE;
        const topBlock: BlockId = height >= SNOW_LINE ? Block.Snow : rocky ? Block.Stone : sandy ? Block.Sand : biome === "snow" ? Block.Snow : Block.Grass;
        const underBlock: BlockId = rocky ? Block.Stone : sandy ? Block.Sand : Block.Dirt;
        for (let y = 0; y <= height && y < SIZE_Y; y++) {
          let block: BlockId = Block.Stone;
          if (y === height) block = topBlock;
          else if (y >= height - 3) block = underBlock;
          this.set(x, y, z, block);
        }
        for (let y = height + 1; y <= SEA_LEVEL; y++) this.set(x, y, z, Block.Water);
      }
    }
    this.carveCaves(seed);
    this.scatterOre(seed);
    this.scatterCoal(seed);
    this.scatterGravel(seed);
    this.scatterDiamond(seed);
    this.plantTrees(seed);
    this.scatterFlowers(seed);
  }
}
