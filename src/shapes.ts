import { Block, isDoor, isFence, isLadder, isShaped, occludes } from "./world";

/** 한 칸(0~1) 안의 상자 하나: [minX, minY, minZ, maxX, maxY, maxZ] */
export type Box = readonly [number, number, number, number, number, number];

/** 방향 0~3이 가리키는 (x, z) 쪽. 0은 +z(남), 1은 -x(서), 2는 -z(북), 3은 +x(동). */
export const FACING_DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

/** 바라보는 방향(yaw)이 가장 가까운 네 방향 중 어디인지. yaw 0이면 -z(북, 2번)를 본다. */
export function facingFromYaw(yaw: number): number {
  const lx = -Math.sin(yaw);
  const lz = -Math.cos(yaw);
  if (Math.abs(lz) >= Math.abs(lx)) return lz > 0 ? 0 : 2;
  return lx > 0 ? 3 : 1;
}

/** (dx, dz) 방향이 네 방향 중 몇 번인지 (가로 방향이 아니면 -1). */
export function facingFromDelta(dx: number, dz: number): number {
  for (let f = 0; f < 4; f++) if (FACING_DIRS[f][0] === dx && FACING_DIRS[f][1] === dz) return f;
  return -1;
}

const SLAB: Box = [0, 0, 0, 1, 0.5, 1];

/** 계단: 아래 반 칸 + 방향 쪽 위 반 칸 */
function stairBoxes(facing: number): Box[] {
  const upper: Box[] = [
    [0, 0.5, 0.5, 1, 1, 1],
    [0, 0.5, 0, 0.5, 1, 1],
    [0, 0.5, 0, 1, 1, 0.5],
    [0.5, 0.5, 0, 1, 1, 1],
  ];
  return [SLAB, upper[facing]];
}

/** 방향 쪽 칸 가장자리에 붙은 얇은 판 */
function plate(facing: number, thickness: number): Box {
  const t = thickness;
  const plates: Box[] = [
    [0, 0, 1 - t, 1, 1, 1],
    [0, 0, 0, t, 1, 1],
    [0, 0, 0, 1, 1, t],
    [1 - t, 0, 0, 1, 1, 1],
  ];
  return plates[facing];
}

const DOOR_THICKNESS = 3 / 16;
const LADDER_THICKNESS = 1 / 8;
const CHEST_BOX: Box = [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16];

/** 울타리가 이어진 방향들 (비트 i는 FACING_DIRS[i] 쪽). */
export function fenceMask(block: number): number {
  return isFence(block) ? block - Block.Fence : 0;
}

/** 이 블록 옆에 울타리가 이어질 수 있는지 (다른 울타리나 속이 꽉 찬 블록). */
export function fenceConnectsTo(neighbor: number): boolean {
  return isFence(neighbor) || occludes(neighbor);
}

const FENCE_POST: Box = [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16];

/** 울타리의 그림 모양: 기둥 + 이어진 쪽으로 뻗는 가로대 두 개 */
function fenceRenderBoxes(mask: number): Box[] {
  const boxes: Box[] = [FENCE_POST];
  for (let f = 0; f < 4; f++) {
    if (!(mask & (1 << f))) continue;
    for (const [y0, y1] of [[6 / 16, 9 / 16], [12 / 16, 15 / 16]]) {
      boxes.push(armBox(f, y0, y1, 7 / 16, 9 / 16));
    }
  }
  return boxes;
}

/** 기둥 가운데에서 칸 가장자리까지 뻗는 막대 */
function armBox(facing: number, y0: number, y1: number, lo: number, hi: number): Box {
  const arms: Box[] = [
    [lo, y0, 0.5, hi, y1, 1],
    [0, y0, lo, 0.5, y1, hi],
    [lo, y0, 0, hi, y1, 0.5],
    [0.5, y0, lo, 1, y1, hi],
  ];
  return arms[facing];
}

/** 울타리는 키가 1.5칸이라 뛰어넘을 수 없다. 몸이 부딪히는 모양은 기둥과 이어진 쪽의 높은 판이다. */
function fenceCollisionBoxes(mask: number): Box[] {
  const boxes: Box[] = [[6 / 16, 0, 6 / 16, 10 / 16, 1.5, 10 / 16]];
  for (let f = 0; f < 4; f++) if (mask & (1 << f)) boxes.push(armBox(f, 0, 1.5, 6 / 16, 10 / 16));
  return boxes;
}

/** 모양 있는 블록의 방향 (0~3). 방향이 없는 블록(반블록)은 0. */
export function facingOf(block: number): number {
  if (block >= Block.PlankStairs && block < Block.PlankStairs + 8) return (block - Block.PlankStairs) % 4;
  if (block >= Block.Chest && block < Block.Ladder) return (block - Block.Chest) % 4;
  if (isLadder(block)) return (block - Block.Ladder) % 4;
  if (isDoor(block)) return (block - Block.Door) % 4;
  return 0;
}

/** 문의 판이 놓인 쪽 방향. 닫혀 있으면 정해진 방향, 열리면 옆으로 돌아간다. */
export function doorPlateFacing(block: number): number {
  const open = (block - Block.Door) % 8 >= 4;
  return (facingOf(block) + (open ? 1 : 0)) % 4;
}

/** 화면에 그릴 모양 (칸 안의 상자들). 네모 블록은 null. */
export function renderBoxes(block: number): readonly Box[] | null {
  if (!isShaped(block)) return null;
  if (block === Block.PlankSlab || block === Block.StoneSlab) return [SLAB];
  if (block >= Block.PlankStairs && block < Block.Chest) return stairBoxes(facingOf(block));
  if (block >= Block.Chest && block < Block.Ladder) return [CHEST_BOX];
  if (isLadder(block)) return [plate(facingOf(block), LADDER_THICKNESS)];
  if (isDoor(block)) return [plate(doorPlateFacing(block), DOOR_THICKNESS)];
  if (isFence(block)) return fenceRenderBoxes(fenceMask(block));
  return null;
}

/** 몸이 부딪히는 모양. 사다리는 몸이 통과한다 (타고 오르는 블록이라서). */
export function collisionBoxes(block: number): readonly Box[] {
  if (isLadder(block)) return [];
  if (isFence(block)) return fenceCollisionBoxes(fenceMask(block));
  return renderBoxes(block) ?? [];
}

/** 이 블록을 놓을 때 쓰는 대표 번호(손에 드는 번호) — 방향이 달라도 같은 물건이다. */
export function baseBlock(block: number): number {
  if (block >= Block.PlankStairs && block < Block.StoneStairs) return Block.PlankStairs;
  if (block >= Block.StoneStairs && block < Block.Chest) return Block.StoneStairs;
  if (block >= Block.Chest && block < Block.Ladder) return Block.Chest;
  if (isLadder(block)) return Block.Ladder;
  if (isDoor(block)) return Block.Door;
  if (isFence(block)) return Block.Fence;
  return block;
}

/** 이 모양이 부딪히는 몸(칸 기준 좌표의 상자)과 겹치는지. 좌표는 칸 안 기준(0~1)으로 바꿔서 넣는다. */
export function overlapsCollision(block: number, min: readonly [number, number, number], max: readonly [number, number, number]): boolean {
  for (const b of collisionBoxes(block)) {
    if (max[0] > b[0] && min[0] < b[3] && max[1] > b[1] && min[1] < b[4] && max[2] > b[2] && min[2] < b[5]) return true;
  }
  return false;
}

/** 문을 열고 닫은 번호 (아랫부분/윗부분 모두). 문이 아니면 그대로. */
export function toggledDoor(block: number): number {
  if (!isDoor(block)) return block;
  const offset = block - Block.Door;
  const half = Math.floor(offset / 8);
  const open = Math.floor((offset % 8) / 4);
  return Block.Door + half * 8 + (1 - open) * 4 + (offset % 4);
}

export function isDoorTop(block: number): boolean {
  return isDoor(block) && block >= Block.DoorTop;
}

export interface Placement {
  /** [놓는 칸에서 위로 몇 칸, 블록 번호] — 문은 두 칸이다. */
  cells: [number, number][];
}

/**
 * 손에 든 블록(base)을 어떤 모양으로 놓을지 정한다.
 * normal은 눌러서 맞힌 면의 바깥쪽 방향, yaw는 바라보는 방향. 놓을 수 없는 자리면 null.
 */
export function placementFor(base: number, normal: readonly [number, number, number], yaw: number): Placement | null {
  const looking = facingFromYaw(yaw);
  if (base === Block.PlankStairs || base === Block.StoneStairs) return { cells: [[0, base + looking]] };
  if (base === Block.Chest) return { cells: [[0, Block.Chest + (looking + 2) % 4]] };
  if (base === Block.Ladder) {
    // 벽에 붙이는 블록이라, 옆면을 눌렀을 때만 놓을 수 있다 (벽 쪽이 사다리가 붙는 방향).
    const wall = facingFromDelta(-normal[0], -normal[2]);
    if (normal[1] !== 0 || wall < 0) return null;
    return { cells: [[0, Block.Ladder + wall]] };
  }
  if (base === Block.Door) {
    const f = (looking + 2) % 4;
    return { cells: [[0, Block.Door + f], [1, Block.DoorTop + f]] };
  }
  return { cells: [[0, base]] };
}
