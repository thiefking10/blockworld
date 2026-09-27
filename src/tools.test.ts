import { describe, expect, it } from "vitest";
import { Item } from "./items";
import { bestSword, bestTool, breakSeconds, canHarvest, TOOL_BY_ID, TOOLS } from "./tools";
import { Block } from "./world";

const tool = (id: number) => {
  const found = TOOL_BY_ID.get(id);
  if (!found) throw new Error("tool " + id);
  return found;
};

describe("도구 목록", () => {
  it("곡괭이, 도끼, 삽, 검이 재질 세 가지씩, 번호가 겹치지 않는다", () => {
    expect(TOOLS).toHaveLength(12);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(12);
    for (const type of ["pickaxe", "axe", "shovel", "sword"]) {
      expect(TOOLS.filter((t) => t.type === type).map((t) => t.tier)).toEqual([0, 1, 2]);
    }
  });
});

describe("캐는 시간 (마인크래프트와 비슷하게)", () => {
  it("맨손: 흙은 금방, 돌은 아주 오래 걸린다", () => {
    expect(breakSeconds(Block.Dirt, null)).toBeCloseTo(0.75, 2);
    expect(breakSeconds(Block.Stone, null)).toBeCloseTo(7.5, 2);
    expect(breakSeconds(Block.Wood, null)).toBeCloseTo(3, 2);
  });

  it("맞는 도구가 있으면 훨씬 빠르고, 재질이 좋을수록 더 빠르다", () => {
    const wood = breakSeconds(Block.Stone, tool(Item.WoodPickaxe));
    const stone = breakSeconds(Block.Stone, tool(Item.StonePickaxe));
    const iron = breakSeconds(Block.Stone, tool(Item.IronPickaxe));
    expect(wood).toBeCloseTo(1.125, 2);
    expect(stone).toBeLessThan(wood);
    expect(iron).toBeLessThan(stone);
    expect(breakSeconds(Block.Wood, tool(Item.IronAxe))).toBeCloseTo(0.5, 2);
  });

  it("엉뚱한 도구는 속도 이득이 없다 (곡괭이로 나무 캐기 = 맨손)", () => {
    expect(breakSeconds(Block.Wood, tool(Item.IronPickaxe))).toBe(breakSeconds(Block.Wood, null));
  });

  it("꽃과 밀은 바로 캐진다", () => {
    for (const b of [Block.Flower, Block.YellowFlower, Block.Sprout, Block.Wheat]) expect(breakSeconds(b, null)).toBe(0);
  });

  it("정해지지 않은 블록(공기 등)은 0이다", () => {
    expect(breakSeconds(Block.Air, null)).toBe(0);
  });
});

describe("아이템을 얻을 수 있는 조건", () => {
  it("돌은 곡괭이가 있어야 나오고, 철광석은 돌 곡괭이 이상이어야 한다", () => {
    expect(canHarvest(Block.Stone, null)).toBe(false);
    expect(canHarvest(Block.Stone, tool(Item.WoodAxe))).toBe(false);
    expect(canHarvest(Block.Stone, tool(Item.WoodPickaxe))).toBe(true);
    expect(canHarvest(Block.IronOre, tool(Item.WoodPickaxe))).toBe(false);
    expect(canHarvest(Block.IronOre, tool(Item.StonePickaxe))).toBe(true);
  });

  it("흙, 나무, 모래 등은 맨손으로도 나온다", () => {
    for (const b of [Block.Dirt, Block.Wood, Block.Sand, Block.Leaves, Block.Grass]) expect(canHarvest(b, null)).toBe(true);
  });
});

describe("쓸 도구 고르기", () => {
  it("가진 것 중 맞는 종류에서 가장 좋은 것을 고른다", () => {
    const has = (ids: number[]) => (id: number) => ids.includes(id);
    expect(bestTool(Block.Stone, has([Item.WoodPickaxe, Item.IronPickaxe, Item.IronAxe]))?.id).toBe(Item.IronPickaxe);
    expect(bestTool(Block.Stone, has([Item.IronAxe]))).toBeNull();
    expect(bestTool(Block.Flower, has([Item.IronPickaxe]))).toBeNull();
    expect(bestTool(Block.Dirt, has([Item.WoodShovel, Item.StoneShovel]))?.id).toBe(Item.StoneShovel);
  });

  it("검은 가장 센 것을 고른다", () => {
    expect(bestSword(() => false)).toBeNull();
    expect(bestSword((id) => id === Item.WoodClub || id === Item.StoneClub)?.id).toBe(Item.StoneClub);
  });
});
