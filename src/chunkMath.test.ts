import { describe, expect, it } from "vitest";
import { affectedChunks, CHUNKS_X, CHUNK_SIZE, chunksInRadius } from "./chunkMath";

describe("affectedChunks", () => {
  it("구역 안쪽 블록은 자기 구역만 다시 그린다", () => {
    expect(affectedChunks(20, 20)).toEqual([[1, 1]]);
  });

  it("구역 경계에 붙은 블록은 옆 구역도 다시 그린다", () => {
    const result = affectedChunks(CHUNK_SIZE, 20);
    expect(result).toContainEqual([1, 1]);
    expect(result).toContainEqual([0, 1]);
    expect(result).toHaveLength(2);
  });

  it("모서리 블록은 옆 구역 둘 다 다시 그린다", () => {
    expect(affectedChunks(CHUNK_SIZE - 1, CHUNK_SIZE - 1)).toHaveLength(3);
  });

  it("월드 가장자리 밖 구역은 빼고 계산한다", () => {
    expect(affectedChunks(0, 0)).toEqual([[0, 0]]);
    const last = CHUNKS_X * CHUNK_SIZE - 1;
    expect(affectedChunks(last, 5)).toEqual([[CHUNKS_X - 1, 0]]);
  });
});

describe("chunksInRadius", () => {
  it("가까운 구역부터 순서대로 돌려준다", () => {
    const result = chunksInRadius(8, 8, 3);
    expect(result[0]).toEqual([8, 8]);
    const distances = result.map(([x, z]) => Math.hypot(x - 8, z - 8));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(Math.max(...distances)).toBeLessThanOrEqual(3);
  });

  it("월드 밖 구역은 빼고 계산한다", () => {
    const result = chunksInRadius(0, 0, 2);
    for (const [x, z] of result) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
    }
    expect(result).toContainEqual([0, 0]);
  });
});
