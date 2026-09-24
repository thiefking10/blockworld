import { describe, expect, it } from "vitest";
import { TILE, tileForFace, tileUV } from "./atlas";
import { Block } from "./world";

describe("atlas", () => {
  it("타일 번호는 서로 다르고 아틀라스(16칸) 안에 있다", () => {
    const tiles = Object.values(TILE);
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const t of tiles) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(16);
    }
  });

  it("잔디는 위/옆/아래 무늬가 다르다", () => {
    expect(tileForFace(Block.Grass, 1)).toBe(TILE.GrassTop);
    expect(tileForFace(Block.Grass, 0)).toBe(TILE.GrassSide);
    expect(tileForFace(Block.Grass, -1)).toBe(TILE.Dirt);
  });

  it("나무는 위아래는 나이테, 옆은 껍질 무늬다", () => {
    expect(tileForFace(Block.Wood, 1)).toBe(TILE.WoodTop);
    expect(tileForFace(Block.Wood, -1)).toBe(TILE.WoodTop);
    expect(tileForFace(Block.Wood, 0)).toBe(TILE.WoodSide);
  });

  it("타일 안 좌표는 그 타일 칸 안의 uv로 바뀐다", () => {
    for (const tile of Object.values(TILE)) {
      const col = tile % 4;
      const row = Math.floor(tile / 4);
      for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5]] as const) {
        const [tu, tv] = tileUV(tile, u, v);
        expect(tu).toBeGreaterThan(col / 4);
        expect(tu).toBeLessThan((col + 1) / 4);
        expect(tv).toBeGreaterThan(1 - (row + 1) / 4);
        expect(tv).toBeLessThan(1 - row / 4);
      }
    }
  });
});
