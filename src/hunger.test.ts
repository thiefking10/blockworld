import { describe, expect, it } from "vitest";
import { Hunger, MAX_HUNGER, STARVE_INTERVAL } from "./hunger";

describe("Hunger", () => {
  it("걸으면 배고픔이 줄어든다", () => {
    const hunger = new Hunger();
    hunger.update(1, 39);
    expect(hunger.value).toBe(MAX_HUNGER);
    hunger.update(1, 1);
    expect(hunger.value).toBe(MAX_HUNGER - 1);
  });

  it("가만히 있어도 시간이 지나면 배고픔이 줄어든다", () => {
    const hunger = new Hunger();
    for (let i = 0; i < 34; i++) hunger.update(1, 0);
    expect(hunger.value).toBe(MAX_HUNGER);
    hunger.update(1, 0);
    expect(hunger.value).toBe(MAX_HUNGER - 1);
  });

  it("먹으면 채워지고, 최댓값을 넘지 않는다", () => {
    const hunger = Hunger.fromValue(5);
    hunger.eat(3);
    expect(hunger.value).toBe(8);
    hunger.eat(100);
    expect(hunger.value).toBe(MAX_HUNGER);
    expect(hunger.full).toBe(true);
  });

  it("0 밑으로 내려가지 않는다", () => {
    const hunger = Hunger.fromValue(1);
    hunger.update(1, 200);
    expect(hunger.value).toBe(0);
    expect(hunger.empty).toBe(true);
  });

  it("배고프지 않으면 굶주리지 않는다", () => {
    const hunger = Hunger.fromValue(1);
    expect(hunger.starveTick(100, 10)).toBe(false);
  });

  it("배고프면 일정 간격마다 체력을 깎으라고 알려주고, 체력이 1이면 멈춘다", () => {
    const hunger = Hunger.fromValue(0);
    expect(hunger.starveTick(STARVE_INTERVAL - 0.1, 10)).toBe(false);
    expect(hunger.starveTick(0.2, 10)).toBe(true);
    expect(hunger.starveTick(STARVE_INTERVAL, 1)).toBe(false);
  });
});
