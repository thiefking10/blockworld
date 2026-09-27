import { describe, expect, it } from "vitest";
import { blockName, DEFAULT_HOTBAR, HOTBAR_SIZE, isPlaceableBlock, PLACEABLE_BLOCKS, sanitizeHotbar } from "./blocks";
import { Block } from "./world";

describe("blocks", () => {
  it("놓을 수 있는 블록 종류가 겹치지 않는다", () => {
    const ids = PLACEABLE_BLOCKS.map((b) => b.block);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(Block.Air);
    expect(ids).not.toContain(Block.Water);
  });

  it("기본 아이템 바는 칸 수와 같고 모두 놓을 수 있는 블록이다", () => {
    expect(DEFAULT_HOTBAR).toHaveLength(HOTBAR_SIZE);
    const ids = PLACEABLE_BLOCKS.map((b) => b.block);
    for (const b of DEFAULT_HOTBAR) expect(ids).toContain(b);
  });

  it("저장된 아이템 바가 이상하면 기본값을 쓴다", () => {
    expect(sanitizeHotbar(undefined)).toEqual(DEFAULT_HOTBAR);
    expect(sanitizeHotbar([1, 2])).toEqual(DEFAULT_HOTBAR);
    expect(sanitizeHotbar([1, 2, 3, 4, 5, -1])).toEqual(DEFAULT_HOTBAR);
    expect(sanitizeHotbar([1, 2, 3, 4, 5, 1.5])).toEqual(DEFAULT_HOTBAR);
    expect(sanitizeHotbar([1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("도구·검·활 같은 아이템도 아이템 바에 들 수 있고, 0은 빈손이다", () => {
    expect(sanitizeHotbar([0, 110, 126, 135, 3, 5])).toEqual([0, 110, 126, 135, 3, 5]);
  });

  it("놓을 수 있는 블록인지 구분한다", () => {
    expect(isPlaceableBlock(Block.Stone)).toBe(true);
    expect(isPlaceableBlock(126)).toBe(false); // 다이아몬드 검
    expect(isPlaceableBlock(0)).toBe(false);
  });

  it("블록 이름을 찾는다", () => {
    expect(blockName(Block.Glass)).toBe("유리");
  });
});
