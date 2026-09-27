import { describe, expect, it } from "vitest";
import { randomRoomCode } from "./net";

describe("randomRoomCode", () => {
  it("5글자이고, 헷갈리는 0/O, 1/I는 안 나온다", () => {
    for (let i = 0; i < 200; i++) {
      const code = randomRoomCode();
      expect(code).toHaveLength(5);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
  });

  it("여러 번 만들면 서로 다르다 (아주 드물게만 겹친다)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => randomRoomCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});
