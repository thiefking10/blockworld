import { describe, expect, it } from "vitest";
import { affectedChunks, CHUNKS_X, CHUNK_SIZE } from "./chunkMath";

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
