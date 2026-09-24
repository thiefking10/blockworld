import { describe, expect, it } from "vitest";
import { CropField, GROW_SECONDS } from "./crops";

describe("CropField", () => {
  it("시간이 차기 전에는 자라지 않고, 차면 한 번만 알려준다", () => {
    const field = new CropField();
    field.plant(1, 2, 3, 50);
    expect(field.harvestReady(50 + GROW_SECONDS - 1)).toEqual([]);
    expect(field.harvestReady(50 + GROW_SECONDS)).toEqual([[1, 2, 3]]);
    expect(field.harvestReady(50 + GROW_SECONDS * 5)).toEqual([]);
    expect(field.size).toBe(0);
  });

  it("먼저 심은 것부터 자라고, 뽑으면 더는 자라지 않는다", () => {
    const field = new CropField();
    field.plant(1, 1, 1, 0);
    field.plant(2, 1, 1, 60);
    field.remove(2, 1, 1);
    expect(field.harvestReady(GROW_SECONDS)).toEqual([[1, 1, 1]]);
    expect(field.harvestReady(GROW_SECONDS + 100)).toEqual([]);
  });

  it("저장했다가 그대로 불러온다", () => {
    const field = new CropField();
    field.plant(4, 5, 6, 12.5);
    const copy = new CropField();
    copy.load(field.toArray());
    expect(copy.toArray()).toEqual([[4, 5, 6, 12.5]]);
    expect(copy.has(4, 5, 6)).toBe(true);
  });
});
