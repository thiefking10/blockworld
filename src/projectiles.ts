import { MOB_SPECS, type Mob } from "./mobs";
import type { World } from "./world";

/** 화살에 걸리는 중력 (칸/초²). 일부러 걷는 중력(26)보다 약하게 해서 멀리 곧게 날아간다. */
export const ARROW_GRAVITY = 14;
/** 박힌 화살이 남아 있는 시간(초) */
export const STUCK_SECONDS = 6;
export const MAX_ARROW_AGE = 12;

/** 플레이어의 몸통 상자 (화살이 맞는 크기) */
const PLAYER_HALF = 0.35;
const PLAYER_HEIGHT = 1.8;

export class Projectile {
  age = 0;
  /** 블록에 박혀 멈춘 뒤 지난 시간. 박히기 전에는 -1. */
  stuckFor = -1;

  constructor(
    public x: number,
    public y: number,
    public z: number,
    public vx: number,
    public vy: number,
    public vz: number,
    /** 누가 쐈는지: 플레이어의 화살은 동물을, 괴물의 화살은 플레이어를 맞힌다. */
    readonly owner: "player" | "enemy",
    public damage: number,
    /** 맞은 상대를 밀어내는 세기 */
    readonly knock = 4,
  ) {}

  get stuck(): boolean {
    return this.stuckFor >= 0;
  }
}

export type ProjectileEvent =
  | { type: "mob"; projectile: Projectile; mob: Mob }
  | { type: "player"; projectile: Projectile }
  | { type: "block"; projectile: Projectile };

/** 날아가는 화살들. 화면 없이 움직임과 맞았는지만 계산한다. */
export class ProjectileField {
  readonly arrows: Projectile[] = [];

  shoot(x: number, y: number, z: number, vx: number, vy: number, vz: number, owner: "player" | "enemy", damage: number, knock = 4): Projectile {
    const arrow = new Projectile(x, y, z, vx, vy, vz, owner, damage, knock);
    this.arrows.push(arrow);
    return arrow;
  }

  clear(): void {
    this.arrows.length = 0;
  }

  /**
   * 한 프레임 진행한다. 빠른 화살이 얇은 벽을 뚫고 지나가지 않도록 작은 걸음으로 나눠 움직이고,
   * 이번에 맞은 것(동물, 플레이어, 블록)들을 돌려준다. 동물·플레이어에 맞은 화살은 사라지고, 블록에 맞은 화살은 박힌다.
   */
  update(dt: number, world: World, mobs: readonly Mob[], player: { x: number; y: number; z: number } | null): ProjectileEvent[] {
    const events: ProjectileEvent[] = [];
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.age += dt;
      if (arrow.stuck) {
        arrow.stuckFor += dt;
        if (arrow.stuckFor > STUCK_SECONDS) this.arrows.splice(i, 1);
        continue;
      }
      if (arrow.age > MAX_ARROW_AGE || arrow.y < -10) {
        this.arrows.splice(i, 1);
        continue;
      }

      arrow.vy -= ARROW_GRAVITY * dt;
      const distance = Math.hypot(arrow.vx, arrow.vy, arrow.vz) * dt;
      const steps = Math.max(1, Math.ceil(distance / 0.3));
      const sx = (arrow.vx * dt) / steps;
      const sy = (arrow.vy * dt) / steps;
      const sz = (arrow.vz * dt) / steps;
      let removed = false;
      for (let s = 0; s < steps && !removed; s++) {
        const nx = arrow.x + sx;
        const ny = arrow.y + sy;
        const nz = arrow.z + sz;
        if (world.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
          arrow.stuckFor = 0;
          arrow.vx = arrow.vy = arrow.vz = 0;
          events.push({ type: "block", projectile: arrow });
          break;
        }
        arrow.x = nx;
        arrow.y = ny;
        arrow.z = nz;
        if (arrow.owner === "player") {
          const mob = this.mobAt(mobs, nx, ny, nz);
          if (mob) {
            events.push({ type: "mob", projectile: arrow, mob });
            removed = true;
          }
        } else if (player && Math.abs(nx - player.x) < PLAYER_HALF && Math.abs(nz - player.z) < PLAYER_HALF && ny >= player.y && ny <= player.y + PLAYER_HEIGHT) {
          events.push({ type: "player", projectile: arrow });
          removed = true;
        }
      }
      if (removed) this.arrows.splice(i, 1);
    }
    return events;
  }

  /** 점 (x, y, z)이 몸 안에 있는 동물. 타고 있는 말과 길들인 동물은 맞지 않는다. */
  private mobAt(mobs: readonly Mob[], x: number, y: number, z: number): Mob | null {
    for (const mob of mobs) {
      if (mob.ridden || mob.tamed) continue;
      const spec = MOB_SPECS[mob.kind];
      const half = spec.halfWidth * mob.scale;
      if (Math.abs(x - mob.x) < half && Math.abs(z - mob.z) < half && y >= mob.y && y <= mob.y + spec.height * mob.scale) return mob;
    }
    return null;
  }
}

/**
 * 목표(tx, ty, tz)에 맞도록 중력을 감안한 발사 속도를 계산한다.
 * spread는 조준이 빗나가는 정도(칸): 0이면 정확히 겨눈다.
 */
export function aimVelocity(
  fromX: number,
  fromY: number,
  fromZ: number,
  tx: number,
  ty: number,
  tz: number,
  speed: number,
  spread: number,
  rng: () => number,
): [number, number, number] {
  const ox = (rng() - 0.5) * 2 * spread;
  const oy = (rng() - 0.5) * 2 * spread;
  const oz = (rng() - 0.5) * 2 * spread;
  const dx = tx + ox - fromX;
  const dy = ty + oy - fromY;
  const dz = tz + oz - fromZ;
  const distance = Math.hypot(dx, dy, dz) || 1;
  const time = distance / speed;
  return [dx / time, dy / time + 0.5 * ARROW_GRAVITY * time, dz / time];
}
