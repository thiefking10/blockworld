import { describe, expect, it } from "vitest";
import { BAR_SECONDS, composeBar, DAY_SCALE, NIGHT_SCALE } from "./music";

function seededRng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

describe("composeBar", () => {
  it("낮에는 낮 음계, 밤에는 밤 음계의 음만 쓴다", () => {
    const rng = seededRng(3);
    let index = 2;
    for (let i = 0; i < 40; i++) {
      const day = composeBar(rng, false, index);
      for (const note of day.notes) {
        expect(DAY_SCALE.some((f) => note.freq === f || note.freq === f * 2)).toBe(true);
      }
      const night = composeBar(rng, true, day.lastIndex);
      for (const note of night.notes) expect(NIGHT_SCALE).toContain(note.freq);
      index = night.lastIndex;
    }
  });

  it("음은 마디 안에서 시간 순서대로 놓이고 듬성듬성하다", () => {
    const rng = seededRng(11);
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const bar = composeBar(rng, false, 2);
      total += bar.notes.length;
      expect(bar.notes.length).toBeLessThanOrEqual(8);
      let prev = -1;
      for (const note of bar.notes) {
        expect(note.time).toBeGreaterThan(prev);
        expect(note.time).toBeLessThan(BAR_SECONDS);
        prev = note.time;
      }
    }
    expect(total / 50).toBeGreaterThan(1.5);
    expect(total / 50).toBeLessThan(6);
  });

  it("밤은 낮보다 음이 더 드물다", () => {
    const count = (night: boolean): number => {
      const rng = seededRng(21);
      let sum = 0;
      for (let i = 0; i < 300; i++) sum += composeBar(rng, night, 2).notes.length;
      return sum;
    };
    expect(count(true)).toBeLessThan(count(false));
  });

  it("가끔 한 마디를 통째로 쉰다", () => {
    const rng = seededRng(5);
    let empty = 0;
    for (let i = 0; i < 200; i++) if (composeBar(rng, false, 2).notes.length === 0) empty++;
    expect(empty).toBeGreaterThan(10);
  });
});
