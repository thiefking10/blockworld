import { Item } from "./items";
import { Block } from "./world";

export interface Slot {
  item: number;
  count: number;
}

/** 한 개를 굽는 데 걸리는 시간(초) */
export const SMELT_SECONDS = 10;
/** 한 칸에 넣을 수 있는 최대 개수 */
export const SLOT_MAX = 64;

/** 구울 수 있는 것 → 구운 결과 */
export const SMELTS: Record<number, number> = {
  [Block.IronOre]: Item.IronIngot,
  [Block.Sand]: Block.Glass,
  [Item.Meat]: Item.CookedMeat,
  [Item.RawFish]: Item.CookedFish,
};

/** 연료로 태울 수 있는 것 → 한 개가 타는 시간(초). 통나무와 판자는 1.5개, 막대는 0.5개를 굽는다. */
export const FUELS: Record<number, number> = {
  [Block.Wood]: 15,
  [Block.Planks]: 15,
  [Item.Stick]: 5,
};

export interface FurnaceData {
  input: Slot | null;
  fuel: Slot | null;
  output: Slot | null;
  burnLeft: number;
  progress: number;
  lastTime: number;
}

/** 화로 하나. 시간이 흐르면 연료를 태워 재료를 하나씩 굽는다. 화면 없이 계산만 한다. */
export class Furnace {
  input: Slot | null = null;
  fuel: Slot | null = null;
  output: Slot | null = null;
  /** 지금 타고 있는 연료가 앞으로 탈 시간(초) */
  burnLeft = 0;
  /** 지금 굽고 있는 재료의 진행(초) */
  progress = 0;
  /** 마지막으로 계산한 월드 시각(초) */
  lastTime: number;

  constructor(now = 0) {
    this.lastTime = now;
  }

  get burning(): boolean {
    return this.burnLeft > 0;
  }

  /** 굽는 진행률 0~1 */
  get progressRatio(): number {
    return Math.min(1, this.progress / SMELT_SECONDS);
  }

  /** 이 재료를 지금 넣을 수 있는가 (구울 수 있는 것이고, 칸이 비었거나 같은 것이며, 꽉 차지 않았을 때) */
  canAddInput(item: number): boolean {
    if (SMELTS[item] === undefined) return false;
    if (this.input === null) return true;
    return this.input.item === item && this.input.count < SLOT_MAX;
  }

  canAddFuel(item: number): boolean {
    if (FUELS[item] === undefined) return false;
    if (this.fuel === null) return true;
    return this.fuel.item === item && this.fuel.count < SLOT_MAX;
  }

  /** 넣은 개수를 돌려준다 (칸이 다 차면 일부만 들어간다). */
  addInput(item: number, count: number): number {
    if (!this.canAddInput(item)) return 0;
    const current = this.input?.count ?? 0;
    const added = Math.min(count, SLOT_MAX - current);
    this.input = { item, count: current + added };
    return added;
  }

  addFuel(item: number, count: number): number {
    if (!this.canAddFuel(item)) return 0;
    const current = this.fuel?.count ?? 0;
    const added = Math.min(count, SLOT_MAX - current);
    this.fuel = { item, count: current + added };
    return added;
  }

  takeOutput(): Slot | null {
    const taken = this.output;
    this.output = null;
    return taken;
  }

  takeInput(): Slot | null {
    const taken = this.input;
    this.input = null;
    this.progress = 0;
    return taken;
  }

  takeFuel(): Slot | null {
    const taken = this.fuel;
    this.fuel = null;
    return taken;
  }

  /** 안에 든 것을 전부 꺼낸다 (화로를 부술 때). */
  takeAll(): Slot[] {
    const all = [this.takeInput(), this.takeFuel(), this.takeOutput()].filter((s): s is Slot => s !== null);
    this.burnLeft = 0;
    this.progress = 0;
    return all;
  }

  private canSmelt(): boolean {
    if (!this.input) return false;
    const result = SMELTS[this.input.item];
    if (result === undefined) return false;
    if (this.output === null) return true;
    return this.output.item === result && this.output.count < SLOT_MAX;
  }

  /** seconds초가 흐른 만큼 진행한다. */
  advance(seconds: number): void {
    let left = seconds;
    for (let guard = 0; left > 1e-9 && guard < 10000; guard++) {
      if (!this.canSmelt()) {
        // 구울 것이 없어도 타고 있는 연료는 줄어든다.
        this.burnLeft = Math.max(0, this.burnLeft - left);
        this.progress = 0;
        return;
      }
      if (this.burnLeft <= 1e-9) {
        if (!this.fuel) {
          this.progress = 0;
          return;
        }
        this.burnLeft += FUELS[this.fuel.item];
        this.fuel.count -= 1;
        if (this.fuel.count <= 0) this.fuel = null;
      }
      const step = Math.min(left, this.burnLeft, SMELT_SECONDS - this.progress);
      this.progress += step;
      this.burnLeft -= step;
      left -= step;
      if (this.progress >= SMELT_SECONDS - 1e-9) {
        const input = this.input as Slot;
        const result = SMELTS[input.item];
        input.count -= 1;
        if (input.count <= 0) this.input = null;
        this.output = { item: result, count: (this.output?.count ?? 0) + 1 };
        this.progress = 0;
      }
    }
  }

  /** 월드 시각이 now가 될 때까지 따라잡는다. (창을 닫아 두거나 잠을 자는 동안 흐른 시간도 반영된다.) */
  catchUp(now: number): void {
    if (now > this.lastTime) this.advance(now - this.lastTime);
    this.lastTime = now;
  }

  toData(): FurnaceData {
    return {
      input: this.input && { ...this.input },
      fuel: this.fuel && { ...this.fuel },
      output: this.output && { ...this.output },
      burnLeft: this.burnLeft,
      progress: this.progress,
      lastTime: this.lastTime,
    };
  }

  static fromData(data: FurnaceData): Furnace {
    const furnace = new Furnace(data.lastTime);
    furnace.input = data.input ? { ...data.input } : null;
    furnace.fuel = data.fuel ? { ...data.fuel } : null;
    furnace.output = data.output ? { ...data.output } : null;
    furnace.burnLeft = data.burnLeft;
    furnace.progress = data.progress;
    return furnace;
  }
}

/** 월드에 놓인 화로들을 자리별로 기억한다. */
export class FurnaceField {
  private readonly furnaces = new Map<string, Furnace>();

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /** 그 자리의 화로 (없으면 새로 만들어서 돌려준다). 돌려주기 전에 시간을 따라잡는다. */
  at(x: number, y: number, z: number, now: number): Furnace {
    const key = this.key(x, y, z);
    let furnace = this.furnaces.get(key);
    if (!furnace) {
      furnace = new Furnace(now);
      this.furnaces.set(key, furnace);
    }
    furnace.catchUp(now);
    return furnace;
  }

  /** 화로를 없앤다. 안에 있던 것을 돌려준다. */
  remove(x: number, y: number, z: number, now: number): Slot[] {
    const key = this.key(x, y, z);
    const furnace = this.furnaces.get(key);
    if (!furnace) return [];
    furnace.catchUp(now);
    this.furnaces.delete(key);
    return furnace.takeAll();
  }

  get size(): number {
    return this.furnaces.size;
  }

  toArray(): [number, number, number, FurnaceData][] {
    return [...this.furnaces.entries()].map(([key, furnace]) => {
      const [x, y, z] = key.split(",").map(Number);
      return [x, y, z, furnace.toData()];
    });
  }

  load(records: [number, number, number, FurnaceData][]): void {
    this.furnaces.clear();
    for (const [x, y, z, data] of records) this.furnaces.set(this.key(x, y, z), Furnace.fromData(data));
  }
}
