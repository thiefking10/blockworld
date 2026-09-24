export const MAX_HEALTH = 20;
/** 피해를 입은 뒤 이 시간(초) 동안은 또 맞아도 피해가 없다. */
export const INVULNERABLE_SECONDS = 0.8;
/** 마지막 피해 뒤 이 시간(초)이 지나면 체력이 서서히 찬다. */
const REGEN_DELAY = 6;
const REGEN_INTERVAL = 3;
/** 이 높이(블록)까지는 떨어져도 안 다친다. */
export const SAFE_FALL = 3;

/** 플레이어 체력. 20이 가득이고, 화면에는 하트 10개(하트 하나 = 2)로 보여준다. */
export class Health {
  hp = MAX_HEALTH;
  private sinceDamage = REGEN_DELAY;
  private invulnerable = 0;
  private regenTimer = 0;

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** 피해를 입힌다. 실제로 입었으면 true (무적 시간 중이면 false). */
  damage(amount: number): boolean {
    if (amount <= 0 || this.dead || this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerable = INVULNERABLE_SECONDS;
    this.sinceDamage = 0;
    this.regenTimer = 0;
    return true;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.hp = Math.min(MAX_HEALTH, this.hp + amount);
  }

  reset(): void {
    this.hp = MAX_HEALTH;
    this.invulnerable = 0;
    this.sinceDamage = REGEN_DELAY;
  }

  update(dt: number): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.sinceDamage += dt;
    if (this.dead || this.hp >= MAX_HEALTH || this.sinceDamage < REGEN_DELAY) return;
    this.regenTimer += dt;
    if (this.regenTimer >= REGEN_INTERVAL) {
      this.regenTimer = 0;
      this.heal(1);
    }
  }
}

/** 떨어진 높이를 재서, 땅에 닿는 순간 낙하 피해를 알려준다. 물에 떨어지면 피해가 없다. */
export class FallTracker {
  private peak = 0;
  private started = false;

  /** 매 프레임 호출. 착지한 프레임에는 받을 피해(없으면 0)를 돌려준다. */
  update(y: number, onGround: boolean, inWater: boolean): number {
    if (!this.started || inWater) {
      this.peak = y;
      this.started = true;
      return 0;
    }
    if (onGround) {
      const fall = this.peak - y;
      this.peak = y;
      return fall > SAFE_FALL ? Math.floor(fall - SAFE_FALL) : 0;
    }
    this.peak = Math.max(this.peak, y);
    return 0;
  }

  /** 순간이동 등으로 위치가 갑자기 바뀌었을 때 기록을 지운다. */
  reset(): void {
    this.started = false;
  }
}
