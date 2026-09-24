import { SIZE_X, SIZE_Z } from "./world";

export const CHUNK_SIZE = 16;
export const CHUNKS_X = SIZE_X / CHUNK_SIZE;
export const CHUNKS_Z = SIZE_Z / CHUNK_SIZE;

/** 플레이어 주변에서 그려 둘 구역의 반지름(구역 수). 안개가 끝나는 거리(70칸)보다 조금 멀다. */
export const RENDER_RADIUS = 5;

/** 가운데 구역에서 반지름 안에 있는 구역들을 가까운 순서로 돌려준다 (월드 밖은 뺀다). */
export function chunksInRadius(centerX: number, centerZ: number, radius: number): [number, number][] {
  const result: { cx: number; cz: number; distance: number }[] = [];
  for (let cx = centerX - radius; cx <= centerX + radius; cx++) {
    for (let cz = centerZ - radius; cz <= centerZ + radius; cz++) {
      if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) continue;
      const distance = Math.hypot(cx - centerX, cz - centerZ);
      if (distance <= radius) result.push({ cx, cz, distance });
    }
  }
  result.sort((a, b) => a.distance - b.distance);
  return result.map(({ cx, cz }) => [cx, cz]);
}

/**
 * 블록 하나가 바뀔 때 다시 그려야 하는 구역들.
 * 그 블록이 속한 구역, 그리고 구역 경계에 붙어 있으면 옆 구역도 (옆 블록의 보이는 면이 달라지므로).
 */
export function affectedChunks(x: number, z: number): [number, number][] {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const localX = x - cx * CHUNK_SIZE;
  const localZ = z - cz * CHUNK_SIZE;

  const result: [number, number][] = [[cx, cz]];
  if (localX === 0) result.push([cx - 1, cz]);
  if (localX === CHUNK_SIZE - 1) result.push([cx + 1, cz]);
  if (localZ === 0) result.push([cx, cz - 1]);
  if (localZ === CHUNK_SIZE - 1) result.push([cx, cz + 1]);

  return result.filter(([a, b]) => a >= 0 && a < CHUNKS_X && b >= 0 && b < CHUNKS_Z);
}
