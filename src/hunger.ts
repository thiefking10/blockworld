export const MAX_HUNGER = 20;
/** 이만큼 걸으면 배고픔이 1 줄어든다. */
const BLOCKS_PER_POINT = 40;
/** 가만히 있어도 이만큼(초)이 지나면 배고픔이 1 줄어든다. */
const SECONDS_PER_POINT = 35;
/** 배고픔이 0일 때, 이 간격(초)마다 체력이 1씩 줄어든다 (1 밑으로는 내려가지 않는다). */
export const STARVE_INTERVAL = 4;

/**
 * 배고픔 게이지 (0~20). 걷거나 시간이 지나면 줄고, 먹으면 채워진다.
 * 0이 되면 굶주려서 체력이 서서히 줄지만(1까지만), 그것만으로 쓰러지지는 않는다.
 * 가득 차 있어야 체력이 저절로 회복된다.
 */
export class Hunger {
  value = MAX_HUNGER;
  private walked = 0;
  private idleSeconds = 0;
  private starveTimer = 0;

  get empty(): boolean {
    return this.value <= 0;
  }

  get full(): boolean {
    return this.value >= MAX_HUNGER;
  }

  private lose(amount: number): void {
    this.value = Math.max(0, this.value - amount);
  }

  eat(amount: number): void {
    this.value = Math.min(MAX_HUNGER, this.value + amount);
  }

  /** 매 프레임 부른다. movedBlocks는 이번 프레임에 걸은 거리(칸). */
  update(dt: number, movedBlocks: number): void {
    this.walked += movedBlocks;
    while (this.walked >= BLOCKS_PER_POINT) {
      this.walked -= BLOCKS_PER_POINT;
      this.lose(1);
    }
    this.idleSeconds += dt;
    while (this.idleSeconds >= SECONDS_PER_POINT) {
      this.idleSeconds -= SECONDS_PER_POINT;
      this.lose(1);
    }
  }

  /** 굶주렸을 때(배고픔 0) 부른다. 이번에 체력을 깎아야 하면 true (hp가 이미 1 이하면 깎지 않는다). */
  starveTick(dt: number, hp: number): boolean {
    if (!this.empty || hp <= 1) {
      this.starveTimer = 0;
      return false;
    }
    this.starveTimer += dt;
    if (this.starveTimer < STARVE_INTERVAL) return false;
    this.starveTimer = 0;
    return true;
  }

  static fromValue(value: number): Hunger {
    const hunger = new Hunger();
    hunger.value = Math.max(0, Math.min(MAX_HUNGER, value));
    return hunger;
  }
}
