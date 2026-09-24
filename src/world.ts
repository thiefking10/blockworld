export const Block = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Wood: 5,
  Leaves: 6,
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

  /** 잔디 위 여기저기에 나무(기둥 + 잎)를 심는다. 시드가 같으면 같은 자리에 심긴다. */
  private plantTrees(seed: number): void {
    for (let x = 3; x < SIZE_X - 3; x++) {
      for (let z = 3; z < SIZE_Z - 3; z++) {
        if (hash2(x, z, seed + 999) > 0.012) continue;
        const ground = this.surfaceHeight(x, z) - 1;
        if (this.get(x, ground, z) !== Block.Grass) continue;

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
        for (let y = 0; y <= height && y < SIZE_Y; y++) {
          let block: BlockId = Block.Stone;
          if (y === height) block = height <= SEA_LEVEL ? Block.Sand : Block.Grass;
          else if (y >= height - 3) block = height <= SEA_LEVEL ? Block.Sand : Block.Dirt;
          this.set(x, y, z, block);
        }
      }
    }
    this.plantTrees(seed);
  }
}
