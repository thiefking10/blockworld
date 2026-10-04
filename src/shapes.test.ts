import { describe, expect, it } from "vitest";
import {
  baseBlock,
  collisionBoxes,
  doorPlateFacing,
  facingFromDelta,
  facingFromYaw,
  isDoorTop,
  overlapsCollision,
  placementFor,
  renderBoxes,
  toggledDoor,
} from "./shapes";
import { Block, blocksLight, isDoor, isLadder, isOpenDoor, isShaped, occludes } from "./world";

describe("방향", () => {
  it("바라보는 방향(yaw)을 네 방향으로 바꾼다", () => {
    expect(facingFromYaw(0)).toBe(2); // -z(북)
    expect(facingFromYaw(Math.PI)).toBe(0); // +z(남)
    expect(facingFromYaw(Math.PI / 2)).toBe(1); // -x(서)
    expect(facingFromYaw(-Math.PI / 2)).toBe(3); // +x(동)
  });

  it("(dx, dz)가 가로 네 방향이 아니면 -1", () => {
    expect(facingFromDelta(0, 1)).toBe(0);
    expect(facingFromDelta(1, 0)).toBe(3);
    expect(facingFromDelta(0, 0)).toBe(-1);
    expect(facingFromDelta(1, 1)).toBe(-1);
  });
});

describe("블록 모양", () => {
  it("네모 블록은 모양이 없고, 모양 블록은 있다", () => {
    expect(isShaped(Block.Stone)).toBe(false);
    expect(isShaped(Block.CoalOre)).toBe(false);
    expect(renderBoxes(Block.Stone)).toBeNull();
    for (const id of [Block.PlankSlab, Block.StoneStairs + 2, Block.Chest + 1, Block.Ladder + 3, Block.Door + 6, Block.DoorTop + 1]) {
      expect(isShaped(id)).toBe(true);
      expect(renderBoxes(id)?.length).toBeGreaterThan(0);
    }
  });

  it("반블록은 아래 반 칸만 차지한다", () => {
    expect(collisionBoxes(Block.PlankSlab)).toEqual([[0, 0, 0, 1, 0.5, 1]]);
    expect(overlapsCollision(Block.PlankSlab, [0.2, 0.6, 0.2], [0.8, 2, 0.8])).toBe(false);
    expect(overlapsCollision(Block.PlankSlab, [0.2, 0.3, 0.2], [0.8, 2, 0.8])).toBe(true);
  });

  it("계단은 아래 반 칸 + 방향 쪽 위 반 칸이다", () => {
    expect(collisionBoxes(Block.StoneStairs)).toHaveLength(2);
    // 방향 0: +z쪽이 높다
    expect(overlapsCollision(Block.StoneStairs, [0.2, 0.6, 0.7], [0.8, 2, 0.9])).toBe(true);
    expect(overlapsCollision(Block.StoneStairs, [0.2, 0.6, 0.1], [0.8, 2, 0.4])).toBe(false);
    // 방향 2는 반대쪽이 높다
    expect(overlapsCollision(Block.StoneStairs + 2, [0.2, 0.6, 0.1], [0.8, 2, 0.4])).toBe(true);
  });

  it("사다리는 몸이 통과하지만 모양은 있다", () => {
    expect(collisionBoxes(Block.Ladder + 1)).toEqual([]);
    expect(renderBoxes(Block.Ladder + 1)).toHaveLength(1);
    expect(isLadder(Block.Ladder + 1)).toBe(true);
  });

  it("문은 닫히면 가장자리의 얇은 판, 열리면 옆으로 돌아간다", () => {
    const closed = Block.Door; // 닫힘, 방향 0 (+z 가장자리)
    const open = toggledDoor(closed);
    expect(isOpenDoor(closed)).toBe(false);
    expect(isOpenDoor(open)).toBe(true);
    expect(doorPlateFacing(open)).toBe((doorPlateFacing(closed) + 1) % 4);
    expect(overlapsCollision(closed, [0.3, 0.1, 0.8], [0.7, 1.9, 0.95])).toBe(true);
    expect(overlapsCollision(open, [0.3, 0.1, 0.8], [0.7, 1.9, 0.95])).toBe(false);
  });

  it("문을 두 번 토글하면 제자리, 윗부분은 윗부분으로 남는다", () => {
    for (let id = Block.Door; id < 58; id++) {
      expect(toggledDoor(toggledDoor(id))).toBe(id);
      expect(isDoor(id)).toBe(true);
      expect(isDoorTop(id)).toBe(id >= Block.DoorTop);
      expect(isOpenDoor(toggledDoor(id))).not.toBe(isOpenDoor(id));
      expect(toggledDoor(id) >= Block.DoorTop).toBe(id >= Block.DoorTop);
    }
    expect(toggledDoor(Block.Stone)).toBe(Block.Stone);
  });

  it("방향이 다른 번호도 baseBlock으로 대표 번호가 된다", () => {
    expect(baseBlock(Block.PlankStairs + 3)).toBe(Block.PlankStairs);
    expect(baseBlock(Block.StoneStairs + 1)).toBe(Block.StoneStairs);
    expect(baseBlock(Block.Chest + 2)).toBe(Block.Chest);
    expect(baseBlock(Block.Ladder + 2)).toBe(Block.Ladder);
    expect(baseBlock(Block.Door + 7)).toBe(Block.Door);
    expect(baseBlock(Block.DoorTop + 1)).toBe(Block.Door);
    expect(baseBlock(Block.Stone)).toBe(Block.Stone);
    expect(baseBlock(Block.PlankSlab)).toBe(Block.PlankSlab);
  });
});

describe("빛과 가림", () => {
  it("모양 블록은 옆 블록의 면을 가리지 않는다", () => {
    expect(occludes(Block.Stone)).toBe(true);
    for (const id of [Block.PlankSlab, Block.StoneStairs, Block.Chest, Block.Door, Block.Ladder]) expect(occludes(id)).toBe(false);
  });

  it("사다리와 열린 문은 빛을 통과시키고, 닫힌 문과 반블록은 막는다", () => {
    expect(blocksLight(Block.Ladder)).toBe(false);
    expect(blocksLight(Block.Door + 4)).toBe(false);
    expect(blocksLight(Block.Door)).toBe(true);
    expect(blocksLight(Block.PlankSlab)).toBe(true);
  });
});

describe("놓을 때 모양 정하기", () => {
  const up: [number, number, number] = [0, 1, 0];

  it("계단은 바라보는 방향 쪽이 높고, 상자는 앞면이 나를 향한다", () => {
    expect(placementFor(Block.StoneStairs, up, Math.PI)?.cells).toEqual([[0, Block.StoneStairs + 0]]);
    expect(placementFor(Block.PlankStairs, up, 0)?.cells).toEqual([[0, Block.PlankStairs + 2]]);
    // yaw 0이면 북(2)을 보고, 상자 앞면은 반대인 남(0)을 향한다
    expect(placementFor(Block.Chest, up, 0)?.cells).toEqual([[0, Block.Chest + 0]]);
  });

  it("문은 두 칸이고 아랫부분 위에 윗부분이 같은 방향으로 놓인다", () => {
    const p = placementFor(Block.Door, up, 0);
    expect(p?.cells).toHaveLength(2);
    const [[dy0, lower], [dy1, upper]] = p!.cells;
    expect([dy0, dy1]).toEqual([0, 1]);
    expect(upper - Block.DoorTop).toBe(lower - Block.Door);
  });

  it("사다리는 옆면에만 붙고, 벽 쪽 방향이 정해진다", () => {
    expect(placementFor(Block.Ladder, up, 0)).toBeNull();
    // 바깥 방향이 +x이면 벽은 -x 쪽 (1번)
    expect(placementFor(Block.Ladder, [1, 0, 0], 0)?.cells).toEqual([[0, Block.Ladder + 1]]);
    // 바깥 방향이 -z이면 벽은 +z 쪽 (0번)
    expect(placementFor(Block.Ladder, [0, 0, -1], 0)?.cells).toEqual([[0, Block.Ladder + 0]]);
  });

  it("그냥 블록과 반블록은 그대로 놓인다", () => {
    expect(placementFor(Block.Stone, up, 1)?.cells).toEqual([[0, Block.Stone]]);
    expect(placementFor(Block.PlankSlab, up, 1)?.cells).toEqual([[0, Block.PlankSlab]]);
  });
});
