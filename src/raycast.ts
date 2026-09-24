import { Block, World } from "./world";

export interface RayHit {
  /** 맞은 블록 */
  x: number;
  y: number;
  z: number;
  /** 맞은 블록 바로 앞의 빈 칸 (블록을 놓을 자리) */
  px: number;
  py: number;
  pz: number;
}

/** yaw(좌우)와 pitch(위아래)로 바라보는 방향 벡터를 만든다. yaw 0이면 -z 방향. */
export function lookDirection(yaw: number, pitch: number): [number, number, number] {
  const cosPitch = Math.cos(pitch);
  return [-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch];
}

/** 눈 위치에서 바라보는 방향으로 선을 쏴서 처음 만나는 블록을 찾는다. */
export function raycast(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): RayHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  let px = x;
  let py = y;
  let pz = z;

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx > 0 ? (x + 1 - ox) / dx : dx < 0 ? (ox - x) / -dx : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) / dy : dy < 0 ? (oy - y) / -dy : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) / dz : dz < 0 ? (oz - z) / -dz : Infinity;

  for (let guard = 0; guard < 200; guard++) {
    if (world.get(x, y, z) !== Block.Air) return { x, y, z, px, py, pz };

    px = x;
    py = y;
    pz = z;
    let t: number;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
    if (t > maxDistance) return null;
  }
  return null;
}
