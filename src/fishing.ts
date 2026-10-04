import { Item } from "./items";
import { Block } from "./world";

export type FishingState = "idle" | "waiting" | "bite";

/** 낚싯줄을 던지고 물고기가 물 때까지 걸리는 시간(초) */
export const WAIT_MIN = 3;
export const WAIT_MAX = 9;
/** 물고기가 물고 있는 시간(초) — 이 안에 당겨야 잡힌다. */
export const BITE_WINDOW = 1.4;
/** 던진 자리에서 이만큼 멀어지면 줄이 끊어진다. */
export const MAX_LINE_DISTANCE = 14;

export interface Catch {
  item: number;
  count: number;
  /** 잡았을 때 얻는 경험치 */
  xp: number;
}

/** 낚은 것: 대부분 물고기이고, 가끔 잡동사니, 아주 드물게 다이아몬드. */
export function rollCatch(rng: () => number): Catch {
  const roll = rng();
  if (roll < 0.82) return { item: Item.RawFish, count: 1, xp: 2 };
  if (roll < 0.9) return { item: Item.Stick, count: 2, xp: 1 };
  if (roll < 0.95) return { item: Item.String, count: 1, xp: 1 };
  if (roll < 0.98) return { item: Item.Bone, count: 1, xp: 1 };
  return { item: Item.Diamond, count: 1, xp: 6 };
}

export type FishingEvent = "bite" | "missed" | null;
export type FishingReel = { kind: "catch"; loot: Catch } | { kind: "nothing" } | { kind: "idle" };

/** 낚시 한 번의 진행. 화면 없이 시간과 확률만 다룬다. */
export class Fishing {
  state: FishingState = "idle";
  private timer = 0;

  /** 줄을 던진다. 물고기가 물 때까지 3~9초쯤 기다린다. */
  cast(rng: () => number): void {
    this.state = "waiting";
    this.timer = WAIT_MIN + rng() * (WAIT_MAX - WAIT_MIN);
  }

  /** 시간을 흘려 보낸다. 물었으면 "bite", 물었는데 너무 늦게 당겨서 놓쳤으면 "missed". */
  update(dt: number): FishingEvent {
    if (this.state === "waiting") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = "bite";
        this.timer = BITE_WINDOW;
        return "bite";
      }
    } else if (this.state === "bite") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = "idle";
        return "missed";
      }
    }
    return null;
  }

  /** 줄을 당긴다. 물었을 때 당기면 잡히고, 너무 일찍 당기면 아무것도 없다. */
  reel(rng: () => number): FishingReel {
    if (this.state === "idle") return { kind: "idle" };
    const wasBite = this.state === "bite";
    this.state = "idle";
    return wasBite ? { kind: "catch", loot: rollCatch(rng) } : { kind: "nothing" };
  }

  cancel(): void {
    this.state = "idle";
  }
}

/** 낚시는 물이 있는 곳에서만 된다 (블록 번호가 물인지). */
export function isFishable(block: number): boolean {
  return block === Block.Water;
}
