import { biomeAt, Block, BlockId, ROCK_LINE, SEA_LEVEL, SIZE_X, SIZE_Y, SIZE_Z, terrainHeight, World } from "./world";

// 이 파일은 world.ts와 서로를 불러 쓴다. 그래서 불러온 값(Block 등)은 반드시 함수 안에서만 쓴다.

/** 마을 한 곳. 마을 가운데(cx, cz)와 땅 높이(groundY), 집들의 안쪽 자리. */
export interface VillageSite {
  cx: number;
  cz: number;
  groundY: number;
  homes: { x: number; y: number; z: number }[];
}

/** 마을이 차지하는 둥근 땅의 반지름(칸). */
export const VILLAGE_RADIUS = 15;
/** 월드를 가로·세로 두 칸씩 4구역으로 나눠, 구역마다 평평한 곳을 찾아 마을을 짓는다. */
const REGION = 128;
const CANDIDATES_PER_REGION = 48;
/** 마을 터로 쓰려면 이 안의 땅 높이 차이가 이만큼 이하여야 한다. */
const MAX_HEIGHT_RANGE = 10;

function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Candidate {
  cx: number;
  cz: number;
  groundY: number;
  range: number;
}

/** 이 자리에 마을을 지을 수 있는지 (바다·산·급경사가 아닌지) 보고, 지을 땅 높이를 정한다. */
function evaluate(cx: number, cz: number, seed: number): Candidate | null {
  const heights: number[] = [];
  for (let dx = -VILLAGE_RADIUS; dx <= VILLAGE_RADIUS; dx += 5) {
    for (let dz = -VILLAGE_RADIUS; dz <= VILLAGE_RADIUS; dz += 5) {
      if (Math.hypot(dx, dz) > VILLAGE_RADIUS) continue;
      heights.push(terrainHeight(cx + dx, cz + dz, seed));
    }
  }
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  if (min < SEA_LEVEL + 2 || max > ROCK_LINE - 10 || max - min > MAX_HEIGHT_RANGE) return null;
  heights.sort((a, b) => a - b);
  return { cx, cz, groundY: heights[Math.floor(heights.length / 2)], range: max - min };
}

/** 같은 시드면 같은 자리에 마을이 서도록, 구역마다 가장 평평한 후보를 고른다 (없으면 그 구역엔 마을이 없다). */
export function findVillageCenters(seed: number): { cx: number; cz: number; groundY: number }[] {
  const margin = VILLAGE_RADIUS + 4;
  const found: Candidate[] = [];
  for (let rx = 0; rx < SIZE_X / REGION; rx++) {
    for (let rz = 0; rz < SIZE_Z / REGION; rz++) {
      let best: Candidate | null = null;
      for (let k = 0; k < CANDIDATES_PER_REGION; k++) {
        const cx = Math.max(margin, Math.min(SIZE_X - margin, rx * REGION + 12 + Math.floor(hash(rx * 31 + k, rz, seed + 5501) * (REGION - 24))));
        const cz = Math.max(margin, Math.min(SIZE_Z - margin, rz * REGION + 12 + Math.floor(hash(rx, rz * 37 + k, seed + 7703) * (REGION - 24))));
        const candidate = evaluate(cx, cz, seed);
        if (candidate && (!best || candidate.range < best.range)) best = candidate;
      }
      if (best) found.push(best);
    }
  }
  return found.map(({ cx, cz, groundY }) => ({ cx, cz, groundY }));
}

/** 문의 방향 번호(shapes.ts와 같다): 0 +z, 1 -x, 2 -z, 3 +x */
function facingOf(dx: number, dz: number): number {
  if (dz > 0) return 0;
  if (dx < 0) return 1;
  if (dz < 0) return 2;
  return 3;
}

/** 월드 안에서만 블록을 놓는 도우미 */
function put(world: World, x: number, y: number, z: number, block: number): void {
  if (x < 0 || x >= SIZE_X || z < 0 || z >= SIZE_Z || y < 0 || y >= SIZE_Y) return;
  world.set(x, y, z, block as BlockId);
}

/** 땅을 평평하게 고르고, 위의 나무·풀을 치운다. */
function flatten(world: World, cx: number, cz: number, groundY: number, seed: number): void {
  const R = VILLAGE_RADIUS;
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      if (Math.hypot(dx, dz) > R) continue;
      const x = cx + dx;
      const z = cz + dz;
      const h = terrainHeight(x, z, seed);
      const biome = biomeAt(x, z, seed);
      const surface = biome === "desert" ? Block.Sand : biome === "snow" ? Block.Snow : Block.Grass;
      const under = biome === "desert" ? Block.Sand : Block.Dirt;
      const top = Math.min(SIZE_Y - 1, Math.max(h, groundY) + 14);
      for (let y = groundY + 1; y <= top; y++) if (world.get(x, y, z) !== Block.Air) put(world, x, y, z, Block.Air);
      for (let y = Math.max(0, Math.min(h + 1, groundY - 3)); y < groundY; y++) put(world, x, y, z, under);
      put(world, x, groundY, z, surface);
    }
  }
}

/** 집 한 채: 판자 벽, 모서리 통나무, 유리창, 열린 문, 판자 지붕, 안에는 제작대와 횃불. door는 문이 난 쪽의 바깥 방향. */
function buildHouse(world: World, hx: number, hz: number, g: number, door: [number, number]): { x: number; y: number; z: number } {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const x = hx + dx;
      const z = hz + dz;
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      put(world, x, g, z, Block.Planks);
      for (let y = g + 1; y <= g + 3; y++) put(world, x, y, z, edge ? (corner ? Block.Wood : Block.Planks) : Block.Air);
      put(world, x, g + 4, z, Block.Planks);
    }
  }
  // 처마: 지붕 둘레에 반블록을 한 줄 더 두른다.
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) === 3) put(world, hx + dx, g + 4, hz + dz, Block.PlankSlab);
    }
  }
  // 유리창: 문이 없는 세 벽의 가운데
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as [number, number][]) {
    if (dx === door[0] * 2 && dz === door[1] * 2) continue;
    put(world, hx + dx, g + 2, hz + dz, Block.Glass);
  }
  // 문 (열려 있어서 마을 사람이 드나들 수 있다)
  const f = facingOf(door[0], door[1]);
  const doorX = hx + door[0] * 2;
  const doorZ = hz + door[1] * 2;
  put(world, doorX, g + 1, doorZ, Block.Door + 4 + f);
  put(world, doorX, g + 2, doorZ, Block.DoorTop + 4 + f);
  // 안쪽 가구: 문 반대편 모서리에 제작대, 그 옆에 횃불
  const back: [number, number] = [-door[0], -door[1]];
  const sideX = back[0] !== 0 ? 0 : 1;
  const sideZ = back[1] !== 0 ? 0 : 1;
  put(world, hx + back[0] + sideX, g + 1, hz + back[1] + sideZ, Block.CraftingTable);
  put(world, hx + back[0] - sideX, g + 1, hz + back[1] - sideZ, Block.Torch);
  return { x: hx + 0.5, y: g + 1, z: hz + 0.5 };
}

function buildWell(world: World, cx: number, cz: number, g: number): void {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
      const x = cx + dx;
      const z = cz + dz;
      if (ring) {
        put(world, x, g, z, Block.Stone);
        put(world, x, g + 1, z, Block.Stone);
      } else {
        put(world, x, g - 1, z, Block.Stone);
        put(world, x, g, z, Block.Water);
      }
      put(world, x, g + 4, z, Block.PlankSlab);
    }
  }
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    put(world, cx + dx, g + 2, cz + dz, Block.Fence);
    put(world, cx + dx, g + 3, cz + dz, Block.Fence);
  }
}

function buildFarm(world: World, cx: number, cz: number, g: number): void {
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const x = cx + dx;
      const z = cz + dz;
      const water = dx === 0 && dz === 0;
      put(world, x, g, z, water ? Block.Water : Block.Dirt);
      put(world, x, g + 1, z, water ? Block.Air : Block.Wheat);
    }
  }
}

function buildLamp(world: World, x: number, z: number, g: number): void {
  put(world, x, g + 1, z, Block.Fence);
  put(world, x, g + 2, z, Block.Fence);
  put(world, x, g + 3, z, Block.Torch);
}

/** 한 마을을 짓고, 집 안쪽 자리 목록이 든 정보를 돌려준다. */
export function buildVillage(world: World, cx: number, cz: number, groundY: number, seed: number): VillageSite {
  flatten(world, cx, cz, groundY, seed);
  const g = groundY;

  // 길 (자갈): 가운데에서 사방으로
  for (let d = -9; d <= 9; d++) {
    if (Math.abs(d) > 2) put(world, cx + d, g, cz, Block.Gravel);
  }
  for (let d = -8; d <= 8; d++) {
    if (Math.abs(d) > 2) put(world, cx, g, cz + d, Block.Gravel);
  }

  buildWell(world, cx, cz, g);
  buildFarm(world, cx, cz - 10, g);
  buildFarm(world, cx, cz + 10, g);
  for (const [dx, dz] of [[5, 2], [-5, -2], [2, 5], [-2, -5]]) buildLamp(world, cx + dx, cz + dz, g);

  const homes: { x: number; y: number; z: number }[] = [];
  for (const [hx, hz] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) {
    const towardCenter = hx < 0 ? 1 : -1;
    // 문 앞에서 가운데 길까지 이어지는 샛길
    for (let x = hx + towardCenter * 3; x !== 0; x += towardCenter) put(world, cx + x, g, cz + hz, Block.Gravel);
    homes.push(buildHouse(world, cx + hx, cz + hz, g, [towardCenter, 0]));
  }
  return { cx, cz, groundY, homes };
}

/** 월드에 마을들을 짓고 목록을 돌려준다. World.generate가 나무를 심은 뒤에 부른다. */
export function buildVillages(world: World, seed: number): VillageSite[] {
  return findVillageCenters(seed).map(({ cx, cz, groundY }) => buildVillage(world, cx, cz, groundY, seed));
}
