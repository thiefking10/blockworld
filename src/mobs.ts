import { Block, SEA_LEVEL, World } from "./world";

export type MobKind = "pig" | "sheep" | "zombie" | "skeleton" | "creeper" | "spider" | "fish" | "wolf" | "dragon";

export interface MobSpec {
  halfWidth: number;
  height: number;
  speed: number;
  /** 플레이어를 쫓아올 때의 속도 (적대적인 동물만) */
  chaseSpeed: number;
  hp: number;
  hostile: boolean;
  /** 가까이 오지 않고 멀리서 화살을 쏜다 (해골) */
  ranged?: boolean;
  /** 가까이 오면 터진다 (크리퍼) */
  explosive?: boolean;
  /** 중력 없이 날아다닌다 (드래곤). 벽에도 안 걸린다 (단순화). */
  flies?: boolean;
  /** 보스: 낮에도 사라지지 않고, 밤이 아니어도 플레이어를 쫓는다. */
  boss?: boolean;
}

export const MOB_SPECS: Record<MobKind, MobSpec> = {
  pig: { halfWidth: 0.4, height: 0.9, speed: 1.1, chaseSpeed: 1.1, hp: 4, hostile: false },
  sheep: { halfWidth: 0.42, height: 1.0, speed: 1.0, chaseSpeed: 1.0, hp: 4, hostile: false },
  zombie: { halfWidth: 0.3, height: 1.8, speed: 1.0, chaseSpeed: 2.3, hp: 8, hostile: true },
  skeleton: { halfWidth: 0.3, height: 1.8, speed: 1.0, chaseSpeed: 1.6, hp: 6, hostile: true, ranged: true },
  creeper: { halfWidth: 0.32, height: 1.6, speed: 0.9, chaseSpeed: 1.9, hp: 6, hostile: true, explosive: true },
  // 거미: 벽 타기는 생략했지만(단순화), 좀비보다 빠르고 체력은 더 낮다.
  spider: { halfWidth: 0.45, height: 0.5, speed: 1.2, chaseSpeed: 2.6, hp: 6, hostile: true },
  // 물고기: 바다에서만 나오고, 다른 동물처럼 사람을 겁내지도 쫓지도 않는다.
  fish: { halfWidth: 0.18, height: 0.22, speed: 0.7, chaseSpeed: 0.7, hp: 2, hostile: false },
  // 늑대: 야생일 때는 돼지·양처럼 그냥 돌아다니고, 뼈를 주면 길들여져 따라다니며 대신 싸운다.
  wolf: { halfWidth: 0.32, height: 0.6, speed: 1.2, chaseSpeed: 2.4, hp: 8, hostile: false },
  // 드래곤: 자연적으로 나오지 않고 용의 뿔로 불러낸다. 하늘을 날며 무는 공격과 불숨을 같이 쓰는 보스.
  dragon: { halfWidth: 1.3, height: 1.6, speed: 2, chaseSpeed: 4.5, hp: 150, hostile: true, flies: true, boss: true },
};

/** 적대적인 동물이 이 종류 중 하나로 스폰된다 (뽑힐 확률 순서) */
const HOSTILE_KINDS: { kind: MobKind; chance: number }[] = [
  { kind: "zombie", chance: 0.35 },
  { kind: "skeleton", chance: 0.3 },
  { kind: "creeper", chance: 0.2 },
  { kind: "spider", chance: 0.15 },
];

// 번식: 밀을 먹은 같은 종류 두 마리가 가까이 만나면 새끼가 태어난다.
export const LOVE_SECONDS = 20;
export const BREED_COOLDOWN = 60;
export const BABY_SECONDS = 120;
export const BREED_RANGE = 2.2;
export const LOVE_SEEK_RANGE = 12;
/** 번식시킬 수 있는 동물 */
export const BREEDABLE: ReadonlySet<MobKind> = new Set<MobKind>(["pig", "sheep"]);

export const MAX_HOSTILE_COUNT = 5;
export const CHASE_RANGE = 18;
export const ATTACK_RANGE = 1.1;
export const ATTACK_DAMAGE = 3;
export const ATTACK_COOLDOWN = 1.2;

// 해골: 가까이 오지 않고 이 거리 안에서 화살을 쏜다.
export const SKELETON_MIN_RANGE = 4;
export const SKELETON_RANGE = 11;
export const SKELETON_DAMAGE = 3;
export const SKELETON_COOLDOWN = 1.8;
export const SKELETON_HIT_CHANCE = 0.7;

// 크리퍼: 이 거리 안에 들어오면 멈춰 서서 심지가 타고, 다 타면 터진다.
export const CREEPER_FUSE_RANGE = 3;
export const CREEPER_FUSE_SECONDS = 1.4;
export const CREEPER_EXPLOSION_RADIUS = 3.5;
export const CREEPER_MAX_DAMAGE = 12;

// 길들인 늑대: 이 거리 안의 적대적인 동물을 대신 공격하고, 없으면 이만큼 멀어졌을 때 따라온다.
export const WOLF_GUARD_RANGE = 10;
export const WOLF_FOLLOW_DISTANCE = 5;
export const WOLF_DAMAGE = 4;

// 드래곤: 플레이어 머리 위 이 높이쯤에서 맴돌다가, 가까우면 물고 멀어도 불숨을 뿜는다.
export const DRAGON_HOVER_HEIGHT = 5;
export const DRAGON_BITE_RANGE = 3;
export const DRAGON_BITE_DAMAGE = 6;
export const DRAGON_BITE_COOLDOWN = 1.3;
export const DRAGON_FIRE_RANGE = 18;
export const DRAGON_FIRE_DAMAGE = 5;
export const DRAGON_FIRE_COOLDOWN = 3;

/** 낮에는 적대적인 동물이 이 비율(초당)로 사라진다. */
const DAY_DESPAWN_RATE = 0.25;

const GRAVITY = 26;
const HOP_SPEED = 8;
const HURT_SECONDS = 0.45;

export const TARGET_MOB_COUNT = 14;
export const TARGET_FISH_COUNT = 6;
export const DESPAWN_DISTANCE = 90;
const SPAWN_MIN = 14;
const SPAWN_MAX = 48;

export type Rng = () => number;

export interface MobSound {
  kind: MobKind;
  x: number;
  z: number;
}

/** 해골이 쏜 화살 한 발 (화면에서 짧게 선으로 그려 보여 준다) */
export interface ArrowShot {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  hit: boolean;
  /** 화살이 아니라 드래곤의 불숨이면 true (다른 소리로 재생한다). */
  fire?: boolean;
}

/** 크리퍼가 터진 자리 */
export interface Explosion {
  x: number;
  y: number;
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
  attackCooldown = 0;
  /** 드래곤의 불숨 쿨타임(초). */
  fireCooldown = 0;
  /** 크리퍼가 폭발까지 남은 심지 시간(초). 0이면 심지가 붙지 않은 상태. */
  fuse = 0;
  /** 늑대가 뼈로 길들여졌는지. 다른 동물은 항상 false. */
  tamed = false;
  /** 새끼인지 (몸이 절반 크기이고, BABY_SECONDS가 지나면 다 자란다). */
  baby = false;
  age = 0;
  /** 밀을 먹고 짝을 찾는 중인 남은 시간(초). 0이면 아니다. */
  love = 0;
  /** 새끼를 낳은 뒤 다시 번식할 수 있을 때까지 남은 시간(초). */
  breedCooldown = 0;

  /** 몸 크기 배율 (새끼는 절반). */
  get scale(): number {
    return this.baby ? 0.5 : 1;
  }

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
    const half = spec.halfWidth * this.scale;
    const x0 = Math.floor(px - half);
    const x1 = Math.floor(px + half);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + spec.height * this.scale);
    const z0 = Math.floor(pz - half);
    const z1 = Math.floor(pz + half);
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
  hit(fromX: number, fromZ: number, damage = 1): boolean {
    this.hp -= damage;
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

  /**
   * stand가 true면 이동은 멈추지만(제자리), 그 자리에서 조준하듯 chase 쪽을 바라본다.
   * hoverY는 날아다니는 동물(드래곤)이 쫓아갈 때 맞추려는 높이다.
   */
  update(dt: number, world: World, rng: Rng, chase: { x: number; z: number } | null = null, stand = false, hoverY?: number): void {
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.love = Math.max(0, this.love - dt);
    this.breedCooldown = Math.max(0, this.breedCooldown - dt);
    if (this.baby) {
      this.age += dt;
      if (this.age >= BABY_SECONDS) this.baby = false;
    }
    this.timer -= dt;

    const spec = MOB_SPECS[this.kind];

    if (spec.flies) {
      if (chase) {
        this.yaw = Math.atan2(-(chase.x - this.x), -(chase.z - this.z));
        this.moving = !stand && Math.hypot(chase.x - this.x, chase.z - this.z) > 1.5;
      } else if (this.timer <= 0) {
        this.decide(rng);
      }
      const speed = this.moving ? (chase ? spec.chaseSpeed : spec.speed) : 0;
      const dx = -Math.sin(this.yaw) * speed * dt;
      const dz = -Math.cos(this.yaw) * speed * dt;
      // 날아다니므로 벽에 부딪히는 건 생략한다 (단순화).
      this.x += dx;
      this.z += dz;
      if (hoverY !== undefined) this.y += Math.max(-8, Math.min(8, hoverY - this.y)) * dt * 2;
      this.onGround = false;
      this.walkPhase += Math.hypot(dx, dz) * 5;
      return;
    }
    if (chase) {
      this.yaw = Math.atan2(-(chase.x - this.x), -(chase.z - this.z));
      // 플레이어 몸속까지 파고들지 않고, 바로 앞에서 멈춘다.
      this.moving = !stand && Math.hypot(chase.x - this.x, chase.z - this.z) > 0.85;
      this.timer = 0.5;
    } else if (this.timer <= 0) {
      this.decide(rng);
    }
    const speed = this.moving && this.hurtTimer <= 0 ? (chase ? spec.chaseSpeed : spec.speed) : 0;
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
      else if (!chase) this.timer = 0;
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
    const half = spec.halfWidth * mob.scale;
    const min = [mob.x - half, mob.y, mob.z - half];
    const max = [mob.x + half, mob.y + spec.height * mob.scale, mob.z + half];
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

function pickHostileKind(rng: Rng): MobKind {
  const roll = rng();
  let acc = 0;
  for (const entry of HOSTILE_KINDS) {
    acc += entry.chance;
    if (roll < acc) return entry.kind;
  }
  return HOSTILE_KINDS[HOSTILE_KINDS.length - 1].kind;
}

/** 스폰할 자리를 찾는다: 플레이어에서 적당히 떨어진, 잔디나 눈 위의 열린 땅. */
export function findSpawnSpot(
  world: World,
  centerX: number,
  centerZ: number,
  rng: Rng,
  hostile = false,
): { x: number; y: number; z: number; kind: MobKind } | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radius = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
    const x = Math.floor(centerX + Math.cos(angle) * radius);
    const z = Math.floor(centerZ + Math.sin(angle) * radius);
    if (!world.inBounds(x, 0, z)) continue;

    const groundY = world.surfaceHeight(x, z) - 1;
    const ground = world.get(x, groundY, z);
    if (hostile) {
      if (!world.isSolid(x, groundY, z) || ground === Block.Leaves || ground === Block.Cactus) continue;
      if (world.isSolid(x, groundY + 1, z) || world.isSolid(x, groundY + 2, z)) continue;
      return { x: x + 0.5, y: groundY + 1, z: z + 0.5, kind: pickHostileKind(rng) };
    }
    if (ground !== Block.Grass && ground !== Block.Snow) continue;
    if (world.isSolid(x, groundY + 1, z) || world.isSolid(x, groundY + 2, z)) continue;
    if (world.get(x, groundY + 1, z) === Block.Water) continue;

    // 늑대는 생물군계를 가리지 않고(단순화) 풀밭에서 이따금 나온다.
    const roll = rng();
    const kind: MobKind = ground === Block.Snow ? "sheep" : roll < 0.15 ? "wolf" : roll < 0.55 ? "sheep" : "pig";
    return { x: x + 0.5, y: groundY + 1, z: z + 0.5, kind };
  }
  return null;
}

/** 물고기가 스폰할 자리를 찾는다: 플레이어에서 적당히 떨어진 바닷속. */
export function findWaterSpawnSpot(world: World, centerX: number, centerZ: number, rng: Rng): { x: number; y: number; z: number; kind: MobKind } | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radius = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
    const x = Math.floor(centerX + Math.cos(angle) * radius);
    const z = Math.floor(centerZ + Math.sin(angle) * radius);
    if (!world.inBounds(x, 0, z)) continue;
    if (world.get(x, SEA_LEVEL, z) !== Block.Water) continue;

    let bottom = SEA_LEVEL;
    while (bottom > 0 && world.get(x, bottom - 1, z) === Block.Water) bottom--;
    const y = bottom + Math.floor(rng() * (SEA_LEVEL - bottom + 1));
    return { x: x + 0.5, y, z: z + 0.5, kind: "fish" };
  }
  return null;
}

/** 길들인 늑대가 대신 잡은 동물 (전리품을 떨어뜨릴 자리). */
export interface WolfKill {
  kind: MobKind;
  x: number;
  y: number;
  z: number;
}

export interface MobUpdateResult {
  /** 이번에 태어난 새끼들 */
  births: Mob[];
  sounds: MobSound[];
  damage: number;
  shots: ArrowShot[];
  explosions: Explosion[];
  kills: WolfKill[];
}

/** 동물 전체를 관리한다: 스폰, 이동, 멀어지면 사라짐, 맞기. */
export class MobSimulation {
  readonly mobs: Mob[] = [];
  private spawnTimer = 0;

  /** 처음 시작할 때 주변에 동물을 미리 깔아 둔다. */
  populate(world: World, centerX: number, centerZ: number, count: number, rng: Rng): void {
    for (let i = 0; i < count; i++) this.trySpawn(world, centerX, centerZ, rng);
    for (let i = 0; i < TARGET_FISH_COUNT; i++) this.trySpawnWater(world, centerX, centerZ, rng);
  }

  private trySpawn(world: World, centerX: number, centerZ: number, rng: Rng, hostile = false): boolean {
    const spot = findSpawnSpot(world, centerX, centerZ, rng, hostile);
    if (!spot) return false;
    this.mobs.push(new Mob(spot.kind, spot.x, spot.y, spot.z, rng));
    return true;
  }

  private trySpawnWater(world: World, centerX: number, centerZ: number, rng: Rng): boolean {
    const spot = findWaterSpawnSpot(world, centerX, centerZ, rng);
    if (!spot) return false;
    this.mobs.push(new Mob(spot.kind, spot.x, spot.y, spot.z, rng));
    return true;
  }

  /** 새끼를 하나 만든다 (몸은 절반, 체력도 절반). */
  spawnBaby(kind: MobKind, x: number, y: number, z: number, rng: Rng): Mob {
    const baby = new Mob(kind, x, y, z, rng);
    baby.baby = true;
    baby.hp = Math.max(1, Math.ceil(baby.hp / 2));
    this.mobs.push(baby);
    return baby;
  }

  /** 밀을 먹여 짝짓기 상태로 만든다. 번식할 수 없는 동물이거나 새끼·쿨타임·이미 짝 찾는 중이면 false. */
  feed(mob: Mob): boolean {
    if (!BREEDABLE.has(mob.kind) || mob.baby || mob.love > 0 || mob.breedCooldown > 0) return false;
    mob.love = LOVE_SECONDS;
    return true;
  }

  /** 짝을 찾는 중인 같은 종류 중 가장 가까운 것. */
  private findPartner(mob: Mob): Mob | null {
    let best: Mob | null = null;
    let bestDistance = LOVE_SEEK_RANGE;
    for (const other of this.mobs) {
      if (other === mob || other.kind !== mob.kind || other.love <= 0 || other.baby) continue;
      const distance = Math.hypot(other.x - mob.x, other.z - mob.z);
      if (distance < bestDistance) {
        best = other;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** 뼈를 먹여 늑대를 길들인다. */
  tame(mob: Mob): void {
    mob.tamed = true;
  }

  /** 용의 뿔을 써서 드래곤을 불러낸다 (자연적으로는 나오지 않는다). */
  summonDragon(x: number, y: number, z: number, rng: Rng): Mob {
    const dragon = new Mob("dragon", x, y + DRAGON_HOVER_HEIGHT, z, rng);
    this.mobs.push(dragon);
    return dragon;
  }

  /**
   * 한 프레임 진행한다. 이번에 울음소리를 낸 동물들, 해골이 쏜 화살, 크리퍼가 터진 자리,
   * 적대적인 동물이 플레이어에게 입힌 피해를 돌려준다.
   * night가 true면 적대적인 동물이 나타나 플레이어를 쫓고, 아니면 서서히 사라진다.
   */
  update(
    dt: number,
    world: World,
    rng: Rng,
    player: { x: number; y: number; z: number },
    night: boolean,
    /** false면 적대적인 동물이 플레이어를 쫓지도 공격하지도 않는다 (창작 모드). */
    targetable = true,
  ): MobUpdateResult {
    const sounds: MobSound[] = [];
    const shots: ArrowShot[] = [];
    const explosions: Explosion[] = [];
    const kills: WolfKill[] = [];
    const births: Mob[] = [];
    let damage = 0;
    const exploded: Mob[] = [];
    const wolfKilled: Mob[] = [];

    for (const mob of this.mobs) {
      const spec = MOB_SPECS[mob.kind];
      const distance = Math.hypot(mob.x - player.x, mob.z - player.z);
      // 보스(드래곤)는 밤이 아니어도 늘 플레이어를 쫓는다 — 직접 불러낸 것이니 낮이라고 봐줄 필요는 없다.
      const engaged = spec.hostile && (night || spec.boss) && targetable && distance < CHASE_RANGE;

      if (spec.flies) {
        const hoverY = player.y + DRAGON_HOVER_HEIGHT;
        mob.update(dt, world, rng, engaged ? player : null, false, hoverY);
        if (engaged && distance < DRAGON_BITE_RANGE && mob.attackCooldown <= 0) {
          mob.attackCooldown = DRAGON_BITE_COOLDOWN;
          damage += DRAGON_BITE_DAMAGE;
        }
        if (engaged && distance < DRAGON_FIRE_RANGE && mob.fireCooldown <= 0) {
          mob.fireCooldown = DRAGON_FIRE_COOLDOWN;
          shots.push({
            fromX: mob.x,
            fromY: mob.y - 0.4,
            fromZ: mob.z,
            toX: player.x,
            toY: player.y + 1.2,
            toZ: player.z,
            hit: true,
            fire: true,
          });
          damage += DRAGON_FIRE_DAMAGE;
        }
      } else if (mob.kind === "wolf" && mob.tamed) {
        // 근처(WOLF_GUARD_RANGE 안)에 적대적인 동물이 있으면 대신 쫓아가 물고, 없으면 플레이어를 따라간다.
        const target = this.mobs.find((m) => m !== mob && MOB_SPECS[m.kind].hostile && Math.hypot(m.x - mob.x, m.z - mob.z) < WOLF_GUARD_RANGE);
        if (target) {
          mob.update(dt, world, rng, target);
          if (Math.hypot(target.x - mob.x, target.z - mob.z) < ATTACK_RANGE && mob.attackCooldown <= 0) {
            mob.attackCooldown = ATTACK_COOLDOWN;
            if (target.hit(mob.x, mob.z, WOLF_DAMAGE)) {
              kills.push({ kind: target.kind, x: target.x, y: target.y, z: target.z });
              wolfKilled.push(target);
            }
          }
        } else {
          const distToPlayer = Math.hypot(player.x - mob.x, player.z - mob.z);
          mob.update(dt, world, rng, distToPlayer > WOLF_FOLLOW_DISTANCE ? player : null);
        }
      } else if (spec.explosive) {
        if (engaged && distance <= CREEPER_FUSE_RANGE) {
          mob.fuse += dt;
          mob.update(dt, world, rng, player, true);
          if (mob.fuse >= CREEPER_FUSE_SECONDS) {
            explosions.push({ x: mob.x, y: mob.y, z: mob.z });
            const falloff = Math.max(0, 1 - distance / CREEPER_EXPLOSION_RADIUS);
            damage += CREEPER_MAX_DAMAGE * falloff;
            exploded.push(mob);
            continue;
          }
        } else {
          mob.fuse = Math.max(0, mob.fuse - dt * 2);
          mob.update(dt, world, rng, engaged ? player : null);
        }
      } else if (spec.ranged) {
        const chase = engaged ? player : null;
        const stand = engaged && distance <= SKELETON_MIN_RANGE;
        mob.update(dt, world, rng, chase, stand);
        if (engaged && distance <= SKELETON_RANGE && mob.attackCooldown <= 0) {
          mob.attackCooldown = SKELETON_COOLDOWN;
          const hit = rng() < SKELETON_HIT_CHANCE;
          if (hit) damage += SKELETON_DAMAGE;
          shots.push({
            fromX: mob.x,
            fromY: mob.y + spec.height * 0.6,
            fromZ: mob.z,
            toX: player.x,
            toY: player.y + 1.2,
            toZ: player.z,
            hit,
          });
        }
      } else {
        // 밀을 먹은 동물은 가까운 같은 종류 짝을 찾아 다가간다.
        const partner = mob.love > 0 ? this.findPartner(mob) : null;
        const chase = engaged ? player : partner;
        mob.update(dt, world, rng, chase);
        if (spec.hostile && targetable && distance < ATTACK_RANGE && Math.abs(mob.y - player.y) < 1.5 && mob.attackCooldown <= 0) {
          mob.attackCooldown = ATTACK_COOLDOWN;
          damage += ATTACK_DAMAGE;
        }
      }

      mob.soundTimer -= dt;
      if (mob.soundTimer <= 0) {
        mob.soundTimer = 6 + rng() * 10;
        sounds.push({ kind: mob.kind, x: mob.x, z: mob.z });
      }
    }

    // 사랑에 빠진 같은 종류 둘이 가까이 만나면 새끼가 태어난다.
    for (let i = 0; i < this.mobs.length; i++) {
      const a = this.mobs[i];
      if (a.love <= 0 || a.baby) continue;
      for (let j = i + 1; j < this.mobs.length; j++) {
        const b = this.mobs[j];
        if (b.kind !== a.kind || b.love <= 0 || b.baby || a.love <= 0) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) > BREED_RANGE) continue;
        a.love = 0;
        b.love = 0;
        a.breedCooldown = BREED_COOLDOWN;
        b.breedCooldown = BREED_COOLDOWN;
        births.push(this.spawnBaby(a.kind, (a.x + b.x) / 2, Math.max(a.y, b.y), (a.z + b.z) / 2, rng));
        break;
      }
    }

    for (const mob of [...exploded, ...wolfKilled]) {
      const index = this.mobs.indexOf(mob);
      if (index >= 0) this.mobs.splice(index, 1);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      // 길들인 늑대는 플레이어를 따라다니느라 안 그래도 잘 안 멀어지지만, 혹시 멀어져도 사라지지 않는다.
      const tamedPet = mob.kind === "wolf" && mob.tamed;
      const far = (!tamedPet && Math.hypot(mob.x - player.x, mob.z - player.z) > DESPAWN_DISTANCE) || mob.y < -5;
      // 보스(드래곤)는 직접 불러낸 것이니 아침이 됐다고 사라지지는 않는다 (너무 멀어지면 다른 동물처럼 사라진다).
      const sunrise = MOB_SPECS[mob.kind].hostile && !MOB_SPECS[mob.kind].boss && !night && rng() < dt * DAY_DESPAWN_RATE;
      if (far || sunrise) this.mobs.splice(i, 1);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      const hostileCount = this.mobs.filter((m) => MOB_SPECS[m.kind].hostile).length;
      const fishCount = this.mobs.filter((m) => m.kind === "fish").length;
      if (night && hostileCount < MAX_HOSTILE_COUNT) this.trySpawn(world, player.x, player.z, rng, true);
      if (this.mobs.length - hostileCount < TARGET_MOB_COUNT) this.trySpawn(world, player.x, player.z, rng);
      if (fishCount < TARGET_FISH_COUNT) this.trySpawnWater(world, player.x, player.z, rng);
    }
    return { births, sounds, damage, shots, explosions, kills };
  }

  /** 적대적인 동물을 전부 없앤다 (플레이어가 쓰러져서 다시 시작할 때). */
  clearHostile(): void {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      if (MOB_SPECS[this.mobs[i].kind].hostile) this.mobs.splice(i, 1);
    }
  }

  /** 때린다. 죽으면 목록에서 지우고 true. */
  hit(mob: Mob, fromX: number, fromZ: number, damage = 1): boolean {
    const died = mob.hit(fromX, fromZ, damage);
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
      const half = spec.halfWidth * mob.scale;
      return (
        mob.x + half > bx &&
        mob.x - half < bx + 1 &&
        mob.y + spec.height * mob.scale > by &&
        mob.y < by + 1 &&
        mob.z + half > bz &&
        mob.z - half < bz + 1
      );
    });
  }
}
