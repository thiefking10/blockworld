import { Item } from "./items";

export type EffectId = "speed" | "strength" | "regen";

export interface EffectInfo {
  name: string;
  emoji: string;
  /** 한 번 마시면 이어지는 시간(초) */
  seconds: number;
}

export const EFFECTS: Record<EffectId, EffectInfo> = {
  speed: { name: "속도", emoji: "💨", seconds: 90 },
  strength: { name: "힘", emoji: "💪", seconds: 90 },
  regen: { name: "재생", emoji: "💗", seconds: 30 },
};

export interface PotionDef {
  item: number;
  name: string;
  /** 즉시 회복하는 체력 (0이면 없음) */
  heal: number;
  /** 걸리는 효과 (없으면 null) */
  effect: EffectId | null;
}

/** 물약들. 마시면 빈 병이 돌아온다. */
export const POTIONS: PotionDef[] = [
  { item: Item.HealPotion, name: "치유 물약", heal: 12, effect: null },
  { item: Item.SpeedPotion, name: "속도 물약", heal: 0, effect: "speed" },
  { item: Item.StrengthPotion, name: "힘 물약", heal: 0, effect: "strength" },
  { item: Item.RegenPotion, name: "재생 물약", heal: 0, effect: "regen" },
];

export const POTION_BY_ID = new Map<number, PotionDef>(POTIONS.map((p) => [p.item, p]));

/** 속도 효과일 때 걷는 속도 배율 */
export const SPEED_MULTIPLIER = 1.4;
/** 힘 효과일 때 근접 공격력에 더하는 값 */
export const STRENGTH_BONUS = 3;
/** 재생 효과가 체력을 1 채우는 간격(초) */
const REGEN_INTERVAL = 2;

/** 지금 걸려 있는 효과들과 남은 시간. */
export class Effects {
  private readonly left = new Map<EffectId, number>();
  private regenTimer = 0;

  /** 효과를 건다. 이미 걸려 있으면 더 긴 쪽으로 이어진다. */
  add(id: EffectId, seconds = EFFECTS[id].seconds): void {
    this.left.set(id, Math.max(this.left.get(id) ?? 0, seconds));
  }

  has(id: EffectId): boolean {
    return (this.left.get(id) ?? 0) > 0;
  }

  remaining(id: EffectId): number {
    return this.left.get(id) ?? 0;
  }

  /** 시간을 흘려 보낸다. 재생 효과로 이번에 채워진 체력을 돌려준다. */
  update(dt: number): number {
    let healed = 0;
    if (this.has("regen")) {
      this.regenTimer += dt;
      while (this.regenTimer >= REGEN_INTERVAL) {
        this.regenTimer -= REGEN_INTERVAL;
        healed++;
      }
    } else {
      this.regenTimer = 0;
    }
    for (const [id, seconds] of this.left) {
      const next = seconds - dt;
      if (next <= 0) this.left.delete(id);
      else this.left.set(id, next);
    }
    return healed;
  }

  speedMultiplier(): number {
    return this.has("speed") ? SPEED_MULTIPLIER : 1;
  }

  attackBonus(): number {
    return this.has("strength") ? STRENGTH_BONUS : 0;
  }

  /** 걸려 있는 효과들 [종류, 남은 시간] (화면 표시와 저장용) */
  entries(): [EffectId, number][] {
    return [...this.left.entries()];
  }

  clear(): void {
    this.left.clear();
    this.regenTimer = 0;
  }

  load(entries: [string, number][]): void {
    this.clear();
    for (const [id, seconds] of entries) {
      if (id in EFFECTS && seconds > 0 && seconds <= 3600) this.left.set(id as EffectId, seconds);
    }
  }
}
