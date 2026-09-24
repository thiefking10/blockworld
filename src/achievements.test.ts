import { describe, expect, it } from "vitest";
import { Achievements, ACHIEVEMENTS } from "./achievements";

describe("Achievements", () => {
  it("처음 달성할 때만 true이고, 없는 과제는 무시한다", () => {
    const a = new Achievements();
    expect(a.unlock("wood")).toBe(true);
    expect(a.unlock("wood")).toBe(false);
    expect(a.unlock("nope")).toBe(false);
    expect(a.count).toBe(1);
    expect(a.has("wood")).toBe(true);
  });

  it("저장했다가 불러오면 그대로이고, 모르는 항목은 버린다", () => {
    const a = new Achievements();
    a.unlock("bed");
    a.unlock("iron");
    const b = new Achievements();
    b.load([...a.toArray(), "old-removed"]);
    expect(b.toArray().sort()).toEqual(["bed", "iron"]);
  });

  it("과제 번호는 겹치지 않는다", () => {
    const ids = ACHIEVEMENTS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
