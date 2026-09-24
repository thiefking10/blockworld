import { describe, expect, it } from "vitest";
import { materialOf } from "./audio";
import { Block } from "./world";

describe("materialOf", () => {
  it("블록마다 재질을 정한다", () => {
    expect(materialOf(Block.Stone)).toBe("stone");
    expect(materialOf(Block.Sand)).toBe("sand");
    expect(materialOf(Block.Wood)).toBe("wood");
    expect(materialOf(Block.Leaves)).toBe("leaves");
    expect(materialOf(Block.Water)).toBe("water");
  });

  it("잔디와 흙은 흙 소리다", () => {
    expect(materialOf(Block.Grass)).toBe("dirt");
    expect(materialOf(Block.Dirt)).toBe("dirt");
  });

  it("새 블록도 재질이 있다", () => {
    expect(materialOf(Block.Planks)).toBe("wood");
    expect(materialOf(Block.Brick)).toBe("stone");
    expect(materialOf(Block.Glass)).toBe("glass");
    expect(materialOf(Block.Snow)).toBe("snow");
  });
});
