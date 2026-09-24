import { describe, expect, it } from "vitest";
import { ambientColor, DAY_LENGTH_SECONDS, daylight, MORNING_PHASE, nextMorning, phaseFromSeconds, skyColor, sunHeight } from "./daycycle";

describe("daycycle", () => {
  it("한낮에는 밝고 한밤중에는 어둡다", () => {
    expect(daylight(0.5)).toBeCloseTo(1);
    expect(daylight(0)).toBeCloseTo(0);
  });

  it("해가 뜨고 질 때는 그 중간 밝기다", () => {
    expect(daylight(0.25)).toBeGreaterThan(0.2);
    expect(daylight(0.25)).toBeLessThan(0.8);
    expect(daylight(0.75)).toBeCloseTo(daylight(0.25), 5);
  });

  it("해 높이는 한낮 1, 한밤중 -1이다", () => {
    expect(sunHeight(0.5)).toBeCloseTo(1);
    expect(sunHeight(0)).toBeCloseTo(-1);
    expect(sunHeight(0.25)).toBeCloseTo(0);
  });

  it("낮 하늘은 밤 하늘보다 밝다", () => {
    const day = skyColor(0.5);
    const night = skyColor(0);
    expect(day[0] + day[1] + day[2]).toBeGreaterThan((night[0] + night[1] + night[2]) * 3);
  });

  it("노을 때는 붉은 기운이 파란 기운보다 강하다", () => {
    const [r, , b] = skyColor(0.25);
    expect(r).toBeGreaterThan(b);
  });

  it("전체 밝기 색은 0~1 안에 있다", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      for (const v of [...ambientColor(p), ...skyColor(p)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("시간이 하루를 넘으면 처음으로 돌아온다", () => {
    expect(phaseFromSeconds(DAY_LENGTH_SECONDS * 1.25)).toBeCloseTo(0.25);
    expect(phaseFromSeconds(0)).toBe(0);
  });
});

describe("nextMorning", () => {
  it("한밤중에 자면 그날 아침으로 넘어간다", () => {
    const midnight = 3 * DAY_LENGTH_SECONDS + 0.02 * DAY_LENGTH_SECONDS;
    const morning = nextMorning(midnight);
    expect(morning).toBeGreaterThan(midnight);
    expect(phaseFromSeconds(morning)).toBeCloseTo(MORNING_PHASE, 5);
    expect(morning - midnight).toBeLessThan(DAY_LENGTH_SECONDS / 2);
  });

  it("해 질 녘에 자면 다음 날 아침으로 넘어가고, 낮에는 밝은 시각이 된다", () => {
    const dusk = 2 * DAY_LENGTH_SECONDS + 0.8 * DAY_LENGTH_SECONDS;
    const morning = nextMorning(dusk);
    expect(phaseFromSeconds(morning)).toBeCloseTo(MORNING_PHASE, 5);
    expect(morning).toBeCloseTo(3.3 * DAY_LENGTH_SECONDS, 5);
    expect(daylight(phaseFromSeconds(morning))).toBeGreaterThan(0.5);
  });
});
