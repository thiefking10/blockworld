import { Block, BlockId, SIZE_Y, World } from "./world";

/** 받침이 사라지면 떨어지는 블록인지 (모래, 자갈). */
export function isFalling(block: number): boolean {
  return block === Block.Sand || block === Block.Gravel;
}

/** 떨어지는 블록이 지나갈 수 있는 칸인지 (빈 칸, 물). */
function canFallInto(block: number): boolean {
  return block === Block.Air || block === Block.Water;
}

export interface FallMove {
  x: number;
  fromY: number;
  toY: number;
  block: number;
}

export interface FallResult {
  moves: FallMove[];
  /** 횃불빛이 바뀌어 주변을 다시 그려야 하는지 */
  lightChanged: boolean;
}

/**
 * (x, y, z)에서 시작해 위로 쌓인 모래·자갈 더미가 받침 없이 떠 있으면 떨어뜨린다.
 * 아래 블록부터 차례로 떨어져서, 위의 블록이 그 위에 차곡차곡 쌓인다. 월드를 바로 바꾸고, 바뀐 것을 돌려준다.
 */
export function settleFrom(world: World, x: number, y: number, z: number): FallResult {
  const moves: FallMove[] = [];
  let lightChanged = false;
  for (let yy = y; yy < SIZE_Y; yy++) {
    const block = world.get(x, yy, z);
    if (!isFalling(block)) break;
    let landing = yy;
    while (landing > 0 && canFallInto(world.get(x, landing - 1, z))) landing--;
    if (landing === yy) continue;
    lightChanged = world.set(x, yy, z, Block.Air) || lightChanged;
    lightChanged = world.set(x, landing, z, block as BlockId) || lightChanged;
    moves.push({ x, fromY: yy, toY: landing, block });
  }
  return { moves, lightChanged };
}
