import { SIZE_X, SIZE_Z } from "./world";

export const CHUNK_SIZE = 16;
export const CHUNKS_X = SIZE_X / CHUNK_SIZE;
export const CHUNKS_Z = SIZE_Z / CHUNK_SIZE;

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
