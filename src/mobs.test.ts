import { describe, expect, it } from "vitest";
import { findSpawnSpot, MAX_HOSTILE_COUNT, Mob, MobSimulation, raycastMobs, SKELETON_MIN_RANGE, SKELETON_RANGE } from "./mobs";
import { Block, World } from "./world";

function flatWorld(): World {
  const world = new World();
  for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) world.set(x, 0, z, Block.Grass);
  return world;
}

/** 항상 같은 값을 돌려주는 가짜 난수 */
const fixed = (value: number) => () => value;

describe("Mob", () => {
  it("공중에서 떨어져 땅에 선다", () => {
    const world = flatWorld();
    const mob = new Mob("pig", 10.5, 6, 10.5, fixed(0.5));
    for (let i = 0; i < 120; i++) mob.update(1 / 60, world, fixed(0.9));
    expect(mob.y).toBeCloseTo(1, 1);
    expect(mob.onGround).toBe(true);
  });

  it("오래 돌아다녀도 월드 안에 있고 블록 속에 파묻히지 않는다", () => {
    const world = flatWorld();
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const mob = new Mob("sheep", 20.5, 1, 20.5, rng);
    for (let i = 0; i < 60 * 120; i++) mob.update(1 / 60, world, rng);
    expect(mob.x).toBeGreaterThan(0);
    expect(mob.x).toBeLessThan(40);
    expect(mob.z).toBeGreaterThan(0);
    expect(mob.z).toBeLessThan(40);
    expect(world.isSolid(Math.floor(mob.x), Math.floor(mob.y + 0.5), Math.floor(mob.z))).toBe(false);
  });

  it("한 칸 높이 턱은 뛰어서 올라간다", () => {
    const world = flatWorld();
    for (let x = 0; x < 40; x++) for (let z = 0; z <= 14; z++) world.set(x, 1, z, Block.Stone);
    const mob = new Mob("pig", 20.5, 1, 18.5, fixed(0.5));
    mob.startWalking(0, 30);
    for (let i = 0; i < 60 * 12; i++) {
      mob.update(1 / 60, world, fixed(0.99));
      mob.startWalking(0, 30);
    }
    expect(mob.z).toBeLessThan(14);
    expect(mob.y).toBeCloseTo(2, 1);
  });

  it("맞으면 체력이 줄고 밀려나며, 체력이 다하면 죽는다", () => {
    const mob = new Mob("pig", 10.5, 1, 10.5, fixed(0.5));
    expect(mob.hit(9.5, 10.5)).toBe(false);
    expect(mob.hurtTimer).toBeGreaterThan(0);
    expect(mob.vy).toBeGreaterThan(0);
    mob.hit(9.5, 10.5);
    mob.hit(9.5, 10.5);
    expect(mob.hit(9.5, 10.5)).toBe(true);
  });

  it("물에 빠지면 가라앉지 않고 뜬다", () => {
    const world = flatWorld();
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) for (let y = 1; y < 6; y++) world.set(x, y, z, Block.Water);
    const mob = new Mob("pig", 10.5, 1, 10.5, fixed(0.5));
    for (let i = 0; i < 180; i++) mob.update(1 / 60, world, fixed(0.9));
    expect(mob.y).toBeGreaterThan(2.5);
  });
});

describe("raycastMobs", () => {
  it("앞에 있는 동물을 맞춘다", () => {
    const mob = new Mob("pig", 10.5, 1, 5.5, fixed(0.5));
    const hit = raycastMobs([mob], 10.5, 1.5, 10.5, 0, 0, -1, 8);
    expect(hit?.mob).toBe(mob);
    expect(hit?.distance).toBeCloseTo(4.6 - 0.4 + 0.4, 0);
  });

  it("옆으로 빗나가거나 사거리 밖이면 못 맞춘다", () => {
    const mob = new Mob("pig", 14.5, 1, 5.5, fixed(0.5));
    expect(raycastMobs([mob], 10.5, 1.5, 10.5, 0, 0, -1, 8)).toBeNull();
    const far = new Mob("pig", 10.5, 1, -5.5, fixed(0.5));
    expect(raycastMobs([far], 10.5, 1.5, 10.5, 0, 0, -1, 8)).toBeNull();
  });

  it("여러 마리 중 가장 가까운 동물을 고른다", () => {
    const near = new Mob("pig", 10.5, 1, 7.5, fixed(0.5));
    const far = new Mob("sheep", 10.5, 1, 4.5, fixed(0.5));
    expect(raycastMobs([far, near], 10.5, 1.5, 10.5, 0, 0, -1, 10)?.mob).toBe(near);
  });
});

describe("spawn", () => {
  it("잔디 위 열린 땅에서만 스폰 자리를 찾는다", () => {
    const world = flatWorld();
    let seed = 5;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const spot = findSpawnSpot(world, 20, 20, rng);
    expect(spot).not.toBeNull();
    if (spot) {
      expect(world.get(Math.floor(spot.x), Math.floor(spot.y) - 1, Math.floor(spot.z))).toBe(Block.Grass);
      expect(world.isSolid(Math.floor(spot.x), Math.floor(spot.y), Math.floor(spot.z))).toBe(false);
    }
  });

  it("땅이 돌뿐이면 스폰하지 않는다", () => {
    const world = new World();
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) world.set(x, 0, z, Block.Stone);
    expect(findSpawnSpot(world, 20, 20, fixed(0.5))).toBeNull();
  });

  it("플레이어에서 너무 멀어지면 사라지고, 모자라면 다시 스폰한다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("pig", 500, 1, 500, fixed(0.5)));
    sim.update(0.1, world, fixed(0.3), { x: 20, y: 1, z: 20 }, false);
    expect(sim.mobs.some((m) => m.x === 500)).toBe(false);
  });

  it("죽은 동물은 목록에서 빠지고, 몸이 있는 칸에는 블록을 못 놓는다", () => {
    const sim = new MobSimulation();
    const mob = new Mob("pig", 10.5, 1, 10.5, fixed(0.5));
    sim.mobs.push(mob);
    expect(sim.intersectsBlock(10, 1, 10)).toBe(true);
    expect(sim.intersectsBlock(20, 1, 20)).toBe(false);
    for (let i = 0; i < 3; i++) sim.hit(mob, 0, 0);
    expect(sim.hit(mob, 0, 0)).toBe(true);
    expect(sim.mobs).toHaveLength(0);
  });
});

describe("좀비", () => {
  const player = { x: 20.5, y: 1, z: 20.5 };

  it("밤에는 플레이어를 쫓아와서 가까워지면 피해를 입힌다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const zombie = new Mob("zombie", 20.5, 1, 30.5, fixed(0.5));
    sim.mobs.push(zombie);
    let total = 0;
    for (let i = 0; i < 60 * 10; i++) total += sim.update(1 / 60, world, fixed(0.9), player, true).damage;
    expect(Math.hypot(zombie.x - player.x, zombie.z - player.z)).toBeLessThan(1.5);
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it("공격은 쿨타임이 있어서 매 프레임 맞지는 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("zombie", 20.5, 1, 21.0, fixed(0.5)));
    let hits = 0;
    for (let i = 0; i < 60 * 3; i++) if (sim.update(1 / 60, world, fixed(0.9), player, true).damage > 0) hits++;
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(3);
  });

  it("플레이어가 표적이 아니면(창작 모드) 밤에도 쫓아오거나 다치게 하지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const zombie = new Mob("zombie", 20.5, 1, 30.5, fixed(0.5));
    sim.mobs.push(zombie);
    let total = 0;
    for (let i = 0; i < 60 * 10; i++) total += sim.update(1 / 60, world, fixed(0.9), player, true, false).damage;
    expect(total).toBe(0);
    expect(Math.hypot(zombie.x - player.x, zombie.z - player.z)).toBeGreaterThan(5);
  });

  it("낮에는 쫓아오지 않고 시간이 지나면 사라진다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("zombie", 20.5, 1, 30.5, fixed(0.5)));
    for (let i = 0; i < 60 * 60; i++) sim.update(1 / 60, world, () => 0.001, player, false);
    expect(sim.mobs.some((m) => m.kind === "zombie")).toBe(false);
  });

  it("밤에는 좀비가 생기지만 최대 수를 넘지 않고, 낮에는 안 생긴다", () => {
    const world = flatWorld();
    let seed = 9;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const day = new MobSimulation();
    for (let i = 0; i < 60 * 30; i++) day.update(1 / 60, world, rng, player, false);
    expect(day.mobs.some((m) => m.kind === "zombie")).toBe(false);

    const night = new MobSimulation();
    for (let i = 0; i < 60 * 30; i++) night.update(1 / 60, world, rng, player, true);
    const zombies = night.mobs.filter((m) => m.kind === "zombie").length;
    expect(zombies).toBeGreaterThan(0);
    expect(zombies).toBeLessThanOrEqual(MAX_HOSTILE_COUNT);
  });

  it("무기 피해만큼 체력이 깎인다", () => {
    const zombie = new Mob("zombie", 10.5, 1, 10.5, fixed(0.5));
    expect(zombie.hit(9, 10, 4)).toBe(false);
    expect(zombie.hp).toBe(4);
    expect(zombie.hit(9, 10, 4)).toBe(true);
  });
});

describe("해골", () => {
  const player = { x: 20.5, y: 1, z: 20.5 };

  it("멀리서 다가오다가, 너무 가까이는 오지 않고 화살을 쏜다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const skeleton = new Mob("skeleton", 20.5, 1, 34.5, fixed(0.5));
    sim.mobs.push(skeleton);
    let shots = 0;
    for (let i = 0; i < 60 * 12; i++) shots += sim.update(1 / 60, world, fixed(0.9), player, true).shots.length;
    const distance = Math.hypot(skeleton.x - player.x, skeleton.z - player.z);
    expect(distance).toBeGreaterThanOrEqual(SKELETON_MIN_RANGE - 0.5);
    expect(distance).toBeLessThan(SKELETON_RANGE);
    expect(shots).toBeGreaterThan(0);
  });

  it("화살이 맞으면 피해를 입히고, 사거리 밖이면 쏘지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("skeleton", 20.5, 1, 25.5, fixed(0.5)));
    let damage = 0;
    let shots = 0;
    for (let i = 0; i < 60 * 5; i++) {
      const result = sim.update(1 / 60, world, fixed(0.1), player, true);
      damage += result.damage;
      shots += result.shots.length;
    }
    expect(shots).toBeGreaterThan(0);
    expect(damage).toBeGreaterThan(0);

    const farSim = new MobSimulation();
    farSim.mobs.push(new Mob("skeleton", 20.5, 1, 60.5, fixed(0.5)));
    const far = farSim.update(1 / 60, world, fixed(0.9), player, true);
    expect(far.shots).toEqual([]);
  });

  it("창작 모드(표적이 아님)에서는 쏘지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("skeleton", 20.5, 1, 25.5, fixed(0.5)));
    let shots = 0;
    for (let i = 0; i < 60 * 3; i++) shots += sim.update(1 / 60, world, fixed(0.9), player, true, false).shots.length;
    expect(shots).toBe(0);
  });
});

describe("크리퍼", () => {
  const player = { x: 20.5, y: 1, z: 20.5 };

  it("가까이 오면 멈춰서 심지가 붙고, 다 타면 터져서 사라진다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const creeper = new Mob("creeper", 20.5, 1, 30.5, fixed(0.5));
    sim.mobs.push(creeper);
    let exploded = false;
    let totalDamage = 0;
    for (let i = 0; i < 60 * 15 && !exploded; i++) {
      const result = sim.update(1 / 60, world, fixed(0.9), player, true);
      totalDamage += result.damage;
      if (result.explosions.length > 0) exploded = true;
    }
    expect(exploded).toBe(true);
    expect(totalDamage).toBeGreaterThan(0);
    expect(sim.mobs).toHaveLength(0);
  });

  it("멀리 떨어져 있으면 다가오기만 하고 터지지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("creeper", 20.5, 1, 45.5, fixed(0.5)));
    let exploded = false;
    for (let i = 0; i < 60 * 2; i++) {
      if (sim.update(1 / 60, world, fixed(0.9), player, true).explosions.length > 0) exploded = true;
    }
    expect(exploded).toBe(false);
    expect(sim.mobs).toHaveLength(1);
  });

  it("심지가 붙기 전에 멀어지면 심지가 꺼진다", () => {
    const world = flatWorld();
    const creeper = new Mob("creeper", 20.5, 1, 23, fixed(0.5));
    creeper.update(0.5, world, fixed(0.9), player, true);
    // 심지 로직은 시뮬레이션 쪽에 있으니 직접 fuse를 흉내내 본다.
    creeper.fuse = 0.6;
    expect(creeper.fuse).toBeGreaterThan(0);
    // 멀어졌을 때 시뮬레이션이 fuse를 서서히 줄이는지는 아래 통합 테스트로 확인한다.
    const world2 = flatWorld();
    const sim = new MobSimulation();
    const c2 = new Mob("creeper", 20.5, 1, 22.5, fixed(0.5));
    sim.mobs.push(c2);
    sim.update(0.3, world2, fixed(0.9), player, true); // 잠깐 가까워져 심지가 붙기 시작
    expect(c2.fuse).toBeGreaterThan(0);
    c2.x = 20.5;
    c2.z = 40.5; // 멀리 순간이동 (테스트용)
    for (let i = 0; i < 30; i++) sim.update(1 / 60, world2, fixed(0.9), player, true);
    expect(c2.fuse).toBe(0);
  });

  it("폭발 피해는 최대치를 넘지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("creeper", 20.5, 1, 22, fixed(0.5)));
    let totalDamage = 0;
    for (let i = 0; i < 60 * 15 && sim.mobs.length > 0; i++) totalDamage += sim.update(1 / 60, world, fixed(0.9), player, true).damage;
    expect(totalDamage).toBeGreaterThan(0);
    expect(totalDamage).toBeLessThanOrEqual(12);
  });

  it("창작 모드(표적이 아님)에서는 심지가 붙지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("creeper", 20.5, 1, 21.5, fixed(0.5)));
    let exploded = false;
    for (let i = 0; i < 60 * 5; i++) {
      if (sim.update(1 / 60, world, fixed(0.9), player, true, false).explosions.length > 0) exploded = true;
    }
    expect(exploded).toBe(false);
  });
});

describe("적대적인 동물 스폰 종류", () => {
  it("좀비, 해골, 크리퍼가 골고루 나온다", () => {
    const world = flatWorld();
    const kinds = new Set<string>();
    let seed = 3;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 200; i++) {
      const spot = findSpawnSpot(world, 20, 20, rng, true);
      if (spot) kinds.add(spot.kind);
    }
    expect(kinds).toEqual(new Set(["zombie", "skeleton", "creeper"]));
  });
});
