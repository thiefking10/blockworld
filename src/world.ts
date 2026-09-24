export const Block = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
} as const;
export type BlockId = (typeof Block)[keyof typeof Block];

export const SIZE_X = 128;
export const SIZE_Y = 32;
export const SIZE_Z = 128;
export const SEA_LEVEL = 9;

function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
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

export class World {
  readonly data = new Uint8Array(SIZE_X * SIZE_Y * SIZE_Z);

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
    if (this.inBounds(x, y, z)) this.data[this.index(x, y, z)] = block;
  }

  /** 걸어다닐 때 막히는 블록인지. 월드 옆면과 바닥은 벽으로 친다. */
  isSolid(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z || y < 0) return true;
    return this.get(x, y, z) !== Block.Air;
  }

  /** x,z 자리에서 가장 높은 블록 위 높이(서 있을 수 있는 y). */
  surfaceHeight(x: number, z: number): number {
    for (let y = SIZE_Y - 1; y >= 0; y--) {
      if (this.get(x, y, z) !== Block.Air) return y + 1;
    }
    return 0;
  }

  generate(seed: number): void {
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const height = Math.floor(5 + terrainNoise(x, z, seed) * 16);
        for (let y = 0; y <= height && y < SIZE_Y; y++) {
          let block: BlockId = Block.Stone;
          if (y === height) block = height <= SEA_LEVEL ? Block.Sand : Block.Grass;
          else if (y >= height - 3) block = height <= SEA_LEVEL ? Block.Sand : Block.Dirt;
          this.set(x, y, z, block);
        }
      }
    }
  }
}
