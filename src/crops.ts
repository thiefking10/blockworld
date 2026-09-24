/** 씨앗이 밀로 자라는 데 걸리는 시간 (월드 시간, 초). 하루(240초)의 약 40%다. */
export const GROW_SECONDS = 100;

export type CropRecord = [number, number, number, number];

/** 심어 둔 씨앗들의 자리와 심은 시각을 기억한다. 시간이 차면 다 자란 자리를 알려준다. */
export class CropField {
  private readonly crops = new Map<string, CropRecord>();

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  plant(x: number, y: number, z: number, now: number): void {
    this.crops.set(this.key(x, y, z), [x, y, z, now]);
  }

  /** 캐거나 부쉈을 때 잊는다. */
  remove(x: number, y: number, z: number): void {
    this.crops.delete(this.key(x, y, z));
  }

  has(x: number, y: number, z: number): boolean {
    return this.crops.has(this.key(x, y, z));
  }

  get size(): number {
    return this.crops.size;
  }

  /** 다 자란 자리들을 돌려주고, 더는 기억하지 않는다 (다 자란 밀은 이제 그냥 블록이다). */
  harvestReady(now: number, growSeconds = GROW_SECONDS): [number, number, number][] {
    const ready: [number, number, number][] = [];
    for (const [key, [x, y, z, plantedAt]] of this.crops) {
      if (now - plantedAt >= growSeconds) {
        ready.push([x, y, z]);
        this.crops.delete(key);
      }
    }
    return ready;
  }

  toArray(): CropRecord[] {
    return [...this.crops.values()];
  }

  load(records: CropRecord[]): void {
    this.crops.clear();
    for (const [x, y, z, t] of records) this.plant(x, y, z, t);
  }
}
