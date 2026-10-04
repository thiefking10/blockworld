import { FACING_DIRS, fenceConnectsTo } from "./shapes";
import { Block, BlockId, isFence, World } from "./world";

/** 이 자리 울타리가 이웃과 이어져야 하는 방향들의 번호 (59 + 0~15). */
export function fenceIdAt(world: World, x: number, y: number, z: number): number {
  let mask = 0;
  for (let f = 0; f < 4; f++) {
    const [dx, dz] = FACING_DIRS[f];
    if (fenceConnectsTo(world.get(x + dx, y, z + dz))) mask |= 1 << f;
  }
  return Block.Fence + mask;
}

export interface FenceChange {
  x: number;
  y: number;
  z: number;
  block: number;
}

/**
 * (x, y, z) 자리와 그 네 이웃의 울타리가 이어진 모양을 다시 맞춘다 (블록을 놓거나 없앤 뒤에 부른다).
 * 월드를 바로 바꾸고, 바뀐 칸들을 돌려준다.
 */
export function refreshFences(world: World, x: number, y: number, z: number): FenceChange[] {
  const changes: FenceChange[] = [];
  const cells: [number, number][] = [[x, z], ...FACING_DIRS.map(([dx, dz]): [number, number] => [x + dx, z + dz])];
  for (const [cx, cz] of cells) {
    const current = world.get(cx, y, cz);
    if (!isFence(current)) continue;
    const wanted = fenceIdAt(world, cx, y, cz);
    if (wanted === current) continue;
    world.set(cx, y, cz, wanted as BlockId);
    changes.push({ x: cx, y, z: cz, block: wanted });
  }
  return changes;
}
