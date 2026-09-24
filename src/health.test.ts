import { describe, expect, it } from "vitest";
import { FallTracker, Health, INVULNERABLE_SECONDS, MAX_HEALTH } from "./health";

describe("Health", () => {
  it("피해를 입으면 줄고, 무적 시간 중에는 또 안 다친다", () => {
    const health = new Health();
    expect(health.damage(3)).toBe(true);
    expect(health.hp).toBe(MAX_HEALTH - 3);
    expect(health.damage(3)).toBe(false);
    health.update(INVULNERABLE_SECONDS + 0.01);
    expect(health.damage(3)).toBe(true);
    expect(health.hp).toBe(MAX_HEALTH - 6);
  });

  it("0이 되면 쓰러지고, 초기화하면 다시 가득 찬다", () => {
    const health = new Health();
    health.damage(100);
    expect(health.dead).toBe(true);
    expect(health.hp).toBe(0);
    health.reset();
    expect(health.dead).toBe(false);
    expect(health.hp).toBe(MAX_HEALTH);
  });

  it("맞은 뒤 한동안은 안 차고, 시간이 지나면 서서히 찬다", () => {
    const health = new Health();
    health.damage(6);
    for (let i = 0; i < 4 * 60; i++) health.update(1 / 60);
    expect(health.hp).toBe(MAX_HEALTH - 6);
    for (let i = 0; i < 40 * 60; i++) health.update(1 / 60);
    expect(health.hp).toBe(MAX_HEALTH);
  });

  it("회복은 최대치를 넘지 않는다", () => {
    const health = new Health();
    health.damage(2);
    health.heal(50);
    expect(health.hp).toBe(MAX_HEALTH);
  });
});

describe("FallTracker", () => {
  it("3칸 이하로 떨어지면 안 다친다", () => {
    const tracker = new FallTracker();
    tracker.update(10, true, false);
    tracker.update(8, false, false);
    expect(tracker.update(7, true, false)).toBe(0);
  });

  it("더 높이서 떨어지면 넘은 높이만큼 다친다", () => {
    const tracker = new FallTracker();
    tracker.update(20, true, false);
    tracker.update(12, false, false);
    expect(tracker.update(10, true, false)).toBe(7);
  });

  it("물에 떨어지면 안 다치고, 착지한 뒤엔 다시 0부터 잰다", () => {
    const tracker = new FallTracker();
    tracker.update(20, true, false);
    tracker.update(12, false, false);
    expect(tracker.update(9, false, true)).toBe(0);
    expect(tracker.update(8, true, false)).toBe(0);
    tracker.update(30, false, false);
    tracker.update(10, true, false);
    expect(tracker.update(10, true, false)).toBe(0);
  });
});
