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
} as const;
export type BlockId = (typeof Block)[keyof typeof Block];

export const SIZE_X = 256;
export const SIZE_Y = 32;
export const SIZE_Z = 256;
export const SEA_LEVEL = 9;

/** 빛을 막고 몸이 부딪히는 블록인지 (공기와 물은 아니다). */
export function isOpaque(block: number): boolean {
  return block !== Block.Air && block !== Block.Water;
}

/** 하늘빛을 막는 블록인지. 유리는 몸은 막아도 빛은 통과시킨다. */
export function blocksLight(block: number): boolean {
  return isOpaque(block) && block !== Block.Glass;
}

/** 옆 블록의 면을 가려 그리지 않아도 되게 하는 블록인지 (투명한 유리는 가리지 못한다). */
export function occludes(block: number): boolean {
  return isOpaque(block) && block !== Block.Glass;
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

export class World {
  readonly data = new Uint8Array(SIZE_X * SIZE_Y * SIZE_Z);
  /** 열(x,z)마다 가장 높은 "빛을 막는 블록"의 높이. 없으면 -1. 동굴 안을 어둡게 그릴 때 쓴다. */
  private readonly top = new Int16Array(SIZE_X * SIZE_Z).fill(-1);

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

  set(x: number, y: number, z: number, block: BlockId): void {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = block;

    const column = x + SIZE_X * z;
    if (blocksLight(block)) {
      if (y > this.top[column]) this.top[column] = y;
    } else if (y === this.top[column]) {
      let t = y - 1;
      while (t >= 0 && !blocksLight(this.get(x, t, z))) t--;
      this.top[column] = t;
    }
  }

  /** 걸어다닐 때 막히는 블록인지. 월드 옆면과 바닥은 벽으로 친다. 물은 막지 않는다. */
  isSolid(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z || y < 0) return true;
    return isOpaque(this.get(x, y, z));
  }

  /** 이 칸 위로 하늘이 뚫려 있는지 (위에 빛을 막는 블록이 없는지). */
  isSkyLit(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z) return true;
    return y > this.top[x + SIZE_X * z];
  }

  /** x,z 자리에서 가장 높은 블록 위 높이(서 있을 수 있는 y). 물도 센다. */
  surfaceHeight(x: number, z: number): number {
    for (let y = SIZE_Y - 1; y >= 0; y--) {
      if (this.get(x, y, z) !== Block.Air) return y + 1;
    }
    return 0;
  }

  /** 땅 밑을 3차원 노이즈로 파내 동굴을 만든다. 바다 근처와 맨 아래층은 건드리지 않는다. */
  private carveCaves(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const surface = this.top[x + SIZE_X * z];
        if (surface < SEA_LEVEL + 2) continue;
        for (let y = 3; y <= surface; y++) {
          if (isCave(x, y, z, seed)) this.set(x, y, z, Block.Air);
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

  generate(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const height = Math.floor(5 + terrainNoise(x, z, seed) * 16);
        const biome = biomeAt(x, z, seed);
        const sandy = height <= SEA_LEVEL || biome === "desert";
        const topBlock: BlockId = sandy ? Block.Sand : biome === "snow" ? Block.Snow : Block.Grass;
        const underBlock: BlockId = sandy ? Block.Sand : Block.Dirt;
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
    this.plantTrees(seed);
  }
}
