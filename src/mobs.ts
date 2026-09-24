import { Block, World } from "./world";

export type MobKind = "pig" | "sheep";

export const MOB_SPECS: Record<MobKind, { halfWidth: number; height: number; speed: number; hp: number }> = {
  pig: { halfWidth: 0.4, height: 0.9, speed: 1.1, hp: 4 },
  sheep: { halfWidth: 0.42, height: 1.0, speed: 1.0, hp: 4 },
};

const GRAVITY = 26;
const HOP_SPEED = 8;
const HURT_SECONDS = 0.45;

export const TARGET_MOB_COUNT = 14;
export const DESPAWN_DISTANCE = 90;
const SPAWN_MIN = 14;
const SPAWN_MAX = 48;

export type Rng = () => number;

export interface MobSound {
  kind: MobKind;
  x: number;
  z: number;
}

/** 돌아다니는 동물 한 마리. 걷기, 중력, 벽 충돌, 한 칸 오르기, 물에 뜨기를 스스로 처리한다. */
export class Mob {
  vy = 0;
  yaw = 0;
  hp: number;
  hurtTimer = 0;
  moving = false;
  walkPhase = 0;
  onGround = false;
  soundTimer: number;

  private timer = 0;
  private knockX = 0;
  private knockZ = 0;

  constructor(
    readonly kind: MobKind,
    public x: number,
    public y: number,
    public z: number,
    rng: Rng,
  ) {
    this.hp = MOB_SPECS[kind].hp;
    this.soundTimer = 3 + rng() * 10;
    this.yaw = rng() * Math.PI * 2;
  }

  private collides(world: World, px: number, py: number, pz: number): boolean {
    const spec = MOB_SPECS[this.kind];
    const x0 = Math.floor(px - spec.halfWidth);
    const x1 = Math.floor(px + spec.halfWidth);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + spec.height);
    const z0 = Math.floor(pz - spec.halfWidth);
    const z1 = Math.floor(pz + spec.halfWidth);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /** 정해진 방향으로 잠깐 걷게 한다 (그다음엔 다시 제멋대로 움직인다). */
  startWalking(yaw: number, seconds: number): void {
    this.yaw = yaw;
    this.moving = true;
    this.timer = seconds;
  }

  private decide(rng: Rng): void {
    this.moving = rng() < 0.6;
    this.yaw = rng() * Math.PI * 2;
    this.timer = 1.5 + rng() * 3.5;
  }

  /** 맞았을 때 뒤로 밀려나고 잠깐 멈춘다. 죽었으면 true. */
  hit(fromX: number, fromZ: number): boolean {
    this.hp -= 1;
    this.hurtTimer = HURT_SECONDS;
    this.moving = false;
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const length = Math.hypot(dx, dz) || 1;
    this.knockX = (dx / length) * 6;
    this.knockZ = (dz / length) * 6;
    this.vy = 5;
    return this.hp <= 0;
  }

  update(dt: number, world: World, rng: Rng): void {
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.timer -= dt;
    if (this.timer <= 0) this.decide(rng);

    const spec = MOB_SPECS[this.kind];
    const speed = this.moving && this.hurtTimer <= 0 ? spec.speed : 0;
    const dx = -Math.sin(this.yaw) * speed * dt + this.knockX * dt;
    const dz = -Math.cos(this.yaw) * speed * dt + this.knockZ * dt;
    const decay = Math.exp(-6 * dt);
    this.knockX *= decay;
    this.knockZ *= decay;

    const startX = this.x;
    const startZ = this.z;
    const blockedX = this.collides(world, this.x + dx, this.y, this.z);
    if (!blockedX) this.x += dx;
    const blockedZ = this.collides(world, this.x, this.y, this.z + dz);
    if (!blockedZ) this.z += dz;

    if (speed > 0 && (blockedX || blockedZ)) {
      const aheadX = this.x - Math.sin(this.yaw) * 0.5;
      const aheadZ = this.z - Math.cos(this.yaw) * 0.5;
      if (this.onGround && !this.collides(world, aheadX, this.y + 1.05, aheadZ)) this.vy = HOP_SPEED;
      else this.timer = 0;
    }

    const inWater = world.get(Math.floor(this.x), Math.floor(this.y + 0.4), Math.floor(this.z)) === Block.Water;
    if (inWater) this.vy = Math.min(this.vy + 30 * dt, 2.2);
    else this.vy -= GRAVITY * dt;

    const dy = this.vy * dt;
    this.onGround = false;
    if (!this.collides(world, this.x, this.y + dy, this.z)) {
      this.y += dy;
    } else {
      if (this.vy < 0) this.onGround = true;
      this.vy = 0;
    }

    this.walkPhase += Math.hypot(this.x - startX, this.z - startZ) * 5;
  }
}

/** 눈 위치에서 바라보는 방향으로 선을 쏴서 가장 가까운 동물을 찾는다 (동물 몸통 상자와 만나는 거리). */
export function raycastMobs(
  mobs: Mob[],
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): { mob: Mob; distance: number } | null {
  let best: { mob: Mob; distance: number } | null = null;

  for (const mob of mobs) {
    const spec = MOB_SPECS[mob.kind];
    const min = [mob.x - spec.halfWidth, mob.y, mob.z - spec.halfWidth];
    const max = [mob.x + spec.halfWidth, mob.y + spec.height, mob.z + spec.halfWidth];
    const origin = [ox, oy, oz];
    const dir = [dx, dy, dz];

    let tMin = 0;
    let tMax = maxDistance;
    let miss = false;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(dir[axis]) < 1e-9) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) miss = true;
      } else {
        let t1 = (min[axis] - origin[axis]) / dir[axis];
        let t2 = (max[axis] - origin[axis]) / dir[axis];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
      }
    }
    if (miss || tMin > tMax) continue;
    if (!best || tMin < best.distance) best = { mob, distance: tMin };
  }
  return best;
}

/** 스폰할 자리를 찾는다: 플레이어에서 적당히 떨어진, 잔디나 눈 위의 열린 땅. */
export function findSpawnSpot(
  world: World,
  centerX: number,
  centerZ: number,
  rng: Rng,
): { x: number; y: number; z: number; kind: MobKind } | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radius = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
    const x = Math.floor(centerX + Math.cos(angle) * radius);
    const z = Math.floor(centerZ + Math.sin(angle) * radius);
    if (!world.inBounds(x, 0, z)) continue;

    const groundY = world.surfaceHeight(x, z) - 1;
    const ground = world.get(x, groundY, z);
    if (ground !== Block.Grass && ground !== Block.Snow) continue;
    if (world.isSolid(x, groundY + 1, z) || world.isSolid(x, groundY + 2, z)) continue;
    if (world.get(x, groundY + 1, z) === Block.Water) continue;

    const kind: MobKind = ground === Block.Snow || rng() < 0.4 ? "sheep" : "pig";
    return { x: x + 0.5, y: groundY + 1, z: z + 0.5, kind };
  }
  return null;
}

/** 동물 전체를 관리한다: 스폰, 이동, 멀어지면 사라짐, 맞기. */
export class MobSimulation {
  readonly mobs: Mob[] = [];
  private spawnTimer = 0;

  /** 처음 시작할 때 주변에 동물을 미리 깔아 둔다. */
  populate(world: World, centerX: number, centerZ: number, count: number, rng: Rng): void {
    for (let i = 0; i < count; i++) this.trySpawn(world, centerX, centerZ, rng);
  }

  private trySpawn(world: World, centerX: number, centerZ: number, rng: Rng): boolean {
    const spot = findSpawnSpot(world, centerX, centerZ, rng);
    if (!spot) return false;
    this.mobs.push(new Mob(spot.kind, spot.x, spot.y, spot.z, rng));
    return true;
  }

  /** 한 프레임 진행하고, 이번에 울음소리를 낸 동물들을 돌려준다. */
  update(dt: number, world: World, playerX: number, playerZ: number, rng: Rng): MobSound[] {
    const sounds: MobSound[] = [];

    for (const mob of this.mobs) {
      mob.update(dt, world, rng);
      mob.soundTimer -= dt;
      if (mob.soundTimer <= 0) {
        mob.soundTimer = 6 + rng() * 10;
        sounds.push({ kind: mob.kind, x: mob.x, z: mob.z });
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (Math.hypot(mob.x - playerX, mob.z - playerZ) > DESPAWN_DISTANCE || mob.y < -5) this.mobs.splice(i, 1);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      if (this.mobs.length < TARGET_MOB_COUNT) this.trySpawn(world, playerX, playerZ, rng);
    }
    return sounds;
  }

  /** 때린다. 죽으면 목록에서 지우고 true. */
  hit(mob: Mob, fromX: number, fromZ: number): boolean {
    const died = mob.hit(fromX, fromZ);
    if (died) {
      const index = this.mobs.indexOf(mob);
      if (index >= 0) this.mobs.splice(index, 1);
    }
    return died;
  }

  /** 이 블록 칸이 어느 동물 몸과 겹치는지 (겹치는 자리에는 블록을 못 놓게 한다). */
  intersectsBlock(bx: number, by: number, bz: number): boolean {
    return this.mobs.some((mob) => {
      const spec = MOB_SPECS[mob.kind];
      return (
        mob.x + spec.halfWidth > bx &&
        mob.x - spec.halfWidth < bx + 1 &&
        mob.y + spec.height > by &&
        mob.y < by + 1 &&
        mob.z + spec.halfWidth > bz &&
        mob.z - spec.halfWidth < bz + 1
      );
    });
  }
}
