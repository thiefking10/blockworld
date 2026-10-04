import { World } from "./world";

/** 바닥에 떨어져 있는 아이템 하나(같은 종류가 합쳐진 무더기) */
export interface ItemDrop {
  id: number;
  item: number;
  count: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 떨어진 뒤 지난 시간(초) */
  age: number;
  /** 호스트가 아닌 사람 화면에서 따라갈 자리 */
  tx?: number;
  ty?: number;
  tz?: number;
}

/** 이 거리 안에 오면 줍는다 (가로 기준) */
export const PICKUP_RADIUS = 1.4;
/** 떨어진 직후에는 이 시간(초) 동안 줍지 않는다 (캐자마자 빨려 들어가지 않게) */
export const PICKUP_DELAY = 0.5;
/** 이 시간(초)이 지나면 사라진다 */
export const DESPAWN_SECONDS = 300;
export const MAX_DROPS = 300;
/** 같은 아이템이 이 거리 안에 있으면 한 무더기로 합친다 */
export const MERGE_RADIUS = 0.9;
/** 한 무더기의 최대 개수 */
export const DROP_STACK_MAX = 64;
/** 아이템 몸통 반지름 (땅에 닿는 높이 계산용) */
const RADIUS = 0.13;
const GRAVITY = 20;

export type Rng = () => number;

/** 떨어진 아이템들. 중력, 바닥에 닿기, 합치기, 줍기, 사라지기를 처리한다. */
export class DropField {
  drops: ItemDrop[] = [];
  private nextId = 1;

  /** 아이템을 떨어뜨린다. 가까이에 같은 아이템 무더기가 있으면 거기에 합친다. */
  spawn(item: number, count: number, x: number, y: number, z: number, rng: Rng): ItemDrop | null {
    if (count <= 0) return null;
    const near = this.drops.find(
      (d) =>
        d.item === item &&
        d.count + count <= DROP_STACK_MAX &&
        Math.hypot(d.x - x, d.y - y, d.z - z) < MERGE_RADIUS,
    );
    if (near) {
      near.count += count;
      return near;
    }
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    const angle = rng() * Math.PI * 2;
    const speed = 0.8 + rng() * 1.2;
    const drop: ItemDrop = {
      id: this.nextId++,
      item,
      count,
      x,
      y,
      z,
      vx: Math.cos(angle) * speed,
      vy: 3 + rng() * 1.5,
      vz: Math.sin(angle) * speed,
      age: 0,
    };
    this.drops.push(drop);
    return drop;
  }

  /**
   * dt초 진행한다. 플레이어(px, py, pz)가 가까이 오면 줍는다.
   * room(item)은 가방에 더 넣을 수 있는 개수다. 줍은 [아이템, 개수] 목록과, 가방이 꽉 차서 못 주운 것이 있는지를 돌려준다.
   */
  update(
    dt: number,
    world: World,
    px: number,
    py: number,
    pz: number,
    room: (item: number) => number,
  ): { picked: [number, number][]; blocked: boolean } {
    const picked: [number, number][] = [];
    let blocked = false;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > DESPAWN_SECONDS || d.y < -5) {
        this.drops.splice(i, 1);
        continue;
      }

      d.vy -= GRAVITY * dt;
      const nx = d.x + d.vx * dt;
      if (world.isSolid(Math.floor(nx), Math.floor(d.y), Math.floor(d.z))) d.vx = 0;
      else d.x = nx;
      const nz = d.z + d.vz * dt;
      if (world.isSolid(Math.floor(d.x), Math.floor(d.y), Math.floor(nz))) d.vz = 0;
      else d.z = nz;

      const ny = d.y + d.vy * dt;
      const below = Math.floor(ny - RADIUS);
      if (d.vy <= 0 && world.isSolid(Math.floor(d.x), below, Math.floor(d.z))) {
        d.y = below + 1 + RADIUS;
        d.vy = 0;
        const friction = Math.exp(-10 * dt);
        d.vx *= friction;
        d.vz *= friction;
      } else {
        d.y = ny;
      }

      if (d.age < PICKUP_DELAY) continue;
      if (Math.hypot(d.x - px, d.z - pz) > PICKUP_RADIUS || Math.abs(d.y - (py + 0.8)) > 1.6) continue;
      const free = room(d.item);
      if (free <= 0) {
        blocked = true;
        continue;
      }
      const taken = Math.min(free, d.count);
      picked.push([d.item, taken]);
      d.count -= taken;
      if (d.count <= 0) this.drops.splice(i, 1);
      else blocked = true;
    }
    return { picked, blocked };
  }

  /** 지금 떨어진 아이템들의 모습 (호스트가 다른 사람에게 알릴 때 쓴다). */
  snapshot(): [number, number, number, number, number, number][] {
    return this.drops.slice(0, 128).map((d) => [d.id, d.item, d.count, round(d.x), round(d.y), round(d.z)]);
  }

  /** 호스트가 알려 준 목록으로 맞춘다 (호스트가 아닌 사람의 화면용). 목록에 없어진 것은 지운다. */
  applySnapshot(list: [number, number, number, number, number, number][]): void {
    const seen = new Set<number>();
    for (const [id, item, count, x, y, z] of list) {
      seen.add(id);
      const existing = this.drops.find((d) => d.id === id);
      if (existing) {
        existing.count = count;
        existing.tx = x;
        existing.ty = y;
        existing.tz = z;
      } else {
        this.drops.push({ id, item, count, x, y, z, vx: 0, vy: 0, vz: 0, age: PICKUP_DELAY, tx: x, ty: y, tz: z });
        if (id >= this.nextId) this.nextId = id + 1;
      }
    }
    this.drops = this.drops.filter((d) => seen.has(d.id));
  }

  /** 호스트가 아닌 사람의 화면: 아이템을 알려 준 자리로 부드럽게 옮긴다. */
  smoothProxies(dt: number): void {
    const k = Math.min(1, dt * 12);
    for (const d of this.drops) {
      if (d.tx === undefined || d.ty === undefined || d.tz === undefined) continue;
      d.x += (d.tx - d.x) * k;
      d.y += (d.ty - d.y) * k;
      d.z += (d.tz - d.z) * k;
      d.age += dt;
    }
  }

  /** 번호로 하나 가져간다 (다른 사람이 줍겠다고 했을 때). 가져간 것을 돌려주고 없으면 null. */
  take(id: number): ItemDrop | null {
    const index = this.drops.findIndex((d) => d.id === id);
    if (index < 0) return null;
    return this.drops.splice(index, 1)[0];
  }

  /** 저장용: [아이템, 개수, x, y, z, 지난 시간] */
  toArray(): [number, number, number, number, number, number][] {
    return this.drops.map((d) => [d.item, d.count, round(d.x), round(d.y), round(d.z), Math.round(d.age)]);
  }

  load(records: [number, number, number, number, number, number][]): void {
    this.drops = [];
    for (const [item, count, x, y, z, age] of records) {
      this.drops.push({ id: this.nextId++, item, count, x, y, z, vx: 0, vy: 0, vz: 0, age: Math.max(age, PICKUP_DELAY) });
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
