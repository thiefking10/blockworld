import { describe, expect, it } from "vitest";
import { findSpawnSpot, Mob, MobSimulation, raycastMobs } from "./mobs";
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
    sim.update(0.1, world, 20, 20, fixed(0.3));
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
