import { describe, expect, it } from "vitest";
import { AdaptiveQuality, fogFar, QUALITY_LEVELS } from "./quality";

/** 같은 fps를 seconds초 동안 0.5초 간격으로 알려준다. 화질이 바뀐 순간의 단계를 모아 돌려준다. */
function feed(quality: AdaptiveQuality, fps: number, seconds: number): number[] {
  const changes: number[] = [];
  for (let t = 0; t < seconds; t += 0.5) {
    const changed = quality.report(fps, 0.5);
    if (changed !== null) changes.push(changed);
  }
  return changes;
}

describe("AdaptiveQuality", () => {
  it("잘 돌아가면 화질을 그대로 둔다", () => {
    const quality = new AdaptiveQuality(0);
    expect(feed(quality, 58, 60)).toEqual([]);
    expect(quality.level).toBe(0);
  });

  it("시작 직후에는 느려도 세지 않는다", () => {
    const quality = new AdaptiveQuality(0);
    expect(feed(quality, 5, 3.5)).toEqual([]);
  });

  it("계속 느리면 한 단계씩 낮추고, 바꾼 직후에는 잠시 기다린다", () => {
    const quality = new AdaptiveQuality(0);
    const changes = feed(quality, 15, 40);
    expect(changes[0]).toBe(1);
    expect(changes).toEqual([1, 2, 3]);
    expect(quality.level).toBe(QUALITY_LEVELS.length - 1);
  });

  it("가장 낮은 단계 밑으로는 내려가지 않는다", () => {
    const quality = new AdaptiveQuality(QUALITY_LEVELS.length - 1);
    expect(feed(quality, 5, 60)).toEqual([]);
  });

  it("잠깐 느린 것만으로는 낮추지 않는다", () => {
    const quality = new AdaptiveQuality(0);
    feed(quality, 60, 6);
    expect(feed(quality, 10, 1)).toEqual([]);
    expect(feed(quality, 60, 10)).toEqual([]);
    expect(quality.level).toBe(0);
  });
});

describe("fogFar", () => {
  it("반경이 작을수록 안개가 가까워진다", () => {
    expect(fogFar(5)).toBe(70);
    expect(fogFar(3)).toBeLessThan(fogFar(4));
    expect(fogFar(2)).toBeGreaterThan(0);
  });
});
