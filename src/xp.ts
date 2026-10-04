import { Block } from "./world";
import { Item } from "./items";

/** 레벨 level에서 다음 레벨까지 필요한 경험치 (마인크래프트와 같은 공식). */
export function xpForLevel(level: number): number {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

/** 경험치(레벨과 그 레벨에서 모은 양). 화면 없이 계산만 한다. */
export class Experience {
  level = 0;
  /** 지금 레벨에서 모은 경험치 (0 이상, xpForLevel(level) 미만) */
  into = 0;

  /** 지금 레벨의 진행 정도 (0~1) — 경험치 막대 길이 */
  get progress(): number {
    return this.into / xpForLevel(this.level);
  }

  /** 경험치를 더한다. 올라간 레벨 수를 돌려준다. */
  add(points: number): number {
    if (!(points > 0)) return 0;
    this.into += points;
    let gained = 0;
    while (this.into >= xpForLevel(this.level)) {
      this.into -= xpForLevel(this.level);
      this.level++;
      gained++;
    }
    return gained;
  }

  /** 레벨을 쓴다 (인챈트 비용). 모자라면 아무것도 안 하고 false. 모아 둔 진행 정도는 최대한 남긴다. */
  spendLevels(levels: number): boolean {
    if (levels < 0 || this.level < levels) return false;
    this.level -= levels;
    this.into = Math.min(this.into, xpForLevel(this.level) - 1);
    return true;
  }

  /** 저장용 [레벨, 진행] */
  toArray(): [number, number] {
    return [this.level, this.into];
  }

  load(level: number, into: number): void {
    this.level = Math.max(0, Math.floor(level));
    this.into = Math.max(0, Math.min(Math.floor(into), xpForLevel(this.level) - 1));
  }
}

/** 동물·괴물을 잡았을 때 얻는 경험치 */
export const MOB_XP: Record<string, number> = {
  pig: 3,
  sheep: 3,
  fish: 1,
  wolf: 3,
  zombie: 6,
  skeleton: 6,
  creeper: 6,
  spider: 6,
  dragon: 400,
};

/** 광석을 캘 때 얻는 경험치 (곡괭이로 제대로 캐서 아이템이 나왔을 때만) */
export const BLOCK_XP: Record<number, number> = {
  [Block.CoalOre]: 2,
  [Block.IronOre]: 1,
  [Block.DiamondOre]: 6,
};

/** 화로에서 다 구운 것을 꺼낼 때, 하나당 얻는 경험치 */
export const SMELT_XP: Record<number, number> = {
  [Item.IronIngot]: 2,
  [Block.Glass]: 1,
  [Item.CookedMeat]: 1,
  [Item.CookedFish]: 1,
};
