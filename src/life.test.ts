import { describe, expect, it } from "vitest";
import { BITE_WINDOW, Fishing, rollCatch, WAIT_MAX, WAIT_MIN } from "./fishing";
import { Item, mobDrops, RECIPES } from "./inventory";
import { BABY_SECONDS, BREED_COOLDOWN, findSpawnSpot, LOVE_SECONDS, Mob, MOB_SPECS, MobSimulation, raycastMobs } from "./mobs";
import { Player } from "./player";
import { Block, World } from "./world";

function flatWorld(): World {
  const world = new World();
  for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) world.set(x, 0, z, Block.Grass);
  return world;
}
const fixed = (value: number) => () => value;
const FAR_PLAYER = { x: 39, y: 1, z: 39 };

describe("낚시", () => {
  it("던지면 기다리다가 물고기가 문다 (3~9초)", () => {
    const fishing = new Fishing();
    fishing.cast(fixed(0)); // 가장 짧게 = 3초
    expect(fishing.state).toBe("waiting");
    expect(fishing.update(WAIT_MIN - 0.1)).toBeNull();
    expect(fishing.update(0.2)).toBe("bite");
    expect(fishing.state).toBe("bite");

    fishing.cast(fixed(0.999)); // 가장 길게
    expect(fishing.update(WAIT_MAX - 0.1)).toBeNull();
  });

  it("물었을 때 당기면 잡히고, 일찍 당기면 아무것도 없다", () => {
    const fishing = new Fishing();
    fishing.cast(fixed(0));
    fishing.update(WAIT_MIN + 0.01);
    const caught = fishing.reel(fixed(0.1));
    expect(caught.kind).toBe("catch");
    if (caught.kind === "catch") expect(caught.loot.item).toBe(Item.RawFish);
    expect(fishing.state).toBe("idle");

    fishing.cast(fixed(0.5));
    expect(fishing.reel(fixed(0.1)).kind).toBe("nothing");
    expect(fishing.reel(fixed(0.1)).kind).toBe("idle");
  });

  it("너무 늦게 당기면 놓친다", () => {
    const fishing = new Fishing();
    fishing.cast(fixed(0));
    fishing.update(WAIT_MIN + 0.01);
    expect(fishing.update(BITE_WINDOW - 0.1)).toBeNull();
    expect(fishing.update(0.2)).toBe("missed");
    expect(fishing.state).toBe("idle");
  });

  it("낚은 것: 대부분 물고기, 아주 드물게 다이아몬드", () => {
    expect(rollCatch(fixed(0.5)).item).toBe(Item.RawFish);
    expect(rollCatch(fixed(0.85)).item).toBe(Item.Stick);
    expect(rollCatch(fixed(0.999)).item).toBe(Item.Diamond);
    let fish = 0;
    for (let i = 0; i < 1000; i++) if (rollCatch(() => i / 1000).item === Item.RawFish) fish++;
    expect(fish).toBeGreaterThan(780);
  });

  it("낚싯대는 막대 3개와 실 2개로 만들고, 거미가 실을 떨군다", () => {
    const rod = RECIPES.find((r) => r.name === "낚싯대");
    expect(rod?.output).toEqual([Item.FishingRod, 1]);
    expect(rod?.inputs).toEqual([[Item.Stick, 3], [Item.String, 2]]);
    expect(mobDrops("spider", fixed(0.1)).some(([item]) => item === Item.String)).toBe(true);
    expect(mobDrops("spider", fixed(0.9)).some(([item]) => item === Item.String)).toBe(false);
  });
});

describe("번식", () => {
  it("밀을 먹이면 짝을 찾는 상태가 되고, 새끼·쿨타임 중엔 안 된다", () => {
    const sim = new MobSimulation();
    const pig = new Mob("pig", 10, 1, 10, fixed(0.5));
    expect(sim.feed(pig)).toBe(true);
    expect(pig.love).toBe(LOVE_SECONDS);
    expect(sim.feed(pig)).toBe(false); // 이미 짝 찾는 중
    const zombie = new Mob("zombie", 12, 1, 12, fixed(0.5));
    expect(sim.feed(zombie)).toBe(false);
    const baby = sim.spawnBaby("sheep", 5, 1, 5, fixed(0.5));
    expect(sim.feed(baby)).toBe(false);
  });

  it("짝을 찾는 두 마리가 만나면 새끼가 태어나고, 둘 다 쿨타임에 들어간다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const a = new Mob("pig", 10, 1, 10, fixed(0.5));
    const b = new Mob("pig", 11, 1, 10, fixed(0.5));
    sim.mobs.push(a, b);
    sim.feed(a);
    sim.feed(b);
    const result = sim.update(0.1, world, fixed(0.9), FAR_PLAYER, false);
    expect(result.births).toHaveLength(1);
    const baby = result.births[0];
    expect(baby.kind).toBe("pig");
    expect(baby.baby).toBe(true);
    expect(baby.scale).toBe(0.5);
    expect(a.love).toBe(0);
    expect(a.breedCooldown).toBeGreaterThan(BREED_COOLDOWN - 1);
    expect(sim.feed(a)).toBe(false); // 쿨타임
    expect(sim.mobs).toContain(baby);
  });

  it("종류가 다르면 번식하지 않는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const pig = new Mob("pig", 10, 1, 10, fixed(0.5));
    const sheep = new Mob("sheep", 10.5, 1, 10, fixed(0.5));
    sim.mobs.push(pig, sheep);
    sim.feed(pig);
    sim.feed(sheep);
    expect(sim.update(0.1, world, fixed(0.9), FAR_PLAYER, false).births).toHaveLength(0);
  });

  it("멀리 있는 짝에게 다가간다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const a = new Mob("sheep", 10, 1, 10, fixed(0.5));
    const b = new Mob("sheep", 18, 1, 10, fixed(0.5));
    sim.mobs.push(a, b);
    sim.feed(a);
    sim.feed(b);
    const before = Math.hypot(a.x - b.x, a.z - b.z);
    let births = 0;
    for (let i = 0; i < 60 * 12 && births === 0; i++) births += sim.update(1 / 60, world, fixed(0.9), FAR_PLAYER, false).births.length;
    expect(births).toBe(1);
    expect(before).toBeGreaterThan(5);
  });

  it("새끼는 시간이 지나면 어른이 된다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const baby = sim.spawnBaby("pig", 10, 1, 10, fixed(0.5));
    expect(baby.hp).toBe(2);
    for (let i = 0; i < Math.ceil(BABY_SECONDS) + 2; i++) baby.update(1, world, fixed(0.9));
    expect(baby.baby).toBe(false);
    expect(baby.scale).toBe(1);
  });

  it("새끼는 몸이 작아서 조준 범위도 작다", () => {
    const sim = new MobSimulation();
    const baby = sim.spawnBaby("pig", 10, 1, 10, fixed(0.5));
    const adult = new Mob("pig", 10, 1, 10, fixed(0.5));
    // 몸통 가장자리를 겨냥: 어른은 맞고 새끼는 빗나간다
    const side = (mob: Mob) => raycastMobs([mob], 9.7, 1.2, 20, 0, 0, -1, 30);
    expect(side(adult)).not.toBeNull();
    expect(side(baby)).toBeNull();
  });
});

describe("말", () => {
  it("풀밭에서 이따금 말이 나온다", () => {
    const world = flatWorld();
    const kinds = new Set<string>();
    let seed = 3;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 400; i++) {
      const spot = findSpawnSpot(world, 20, 20, rng);
      if (spot) kinds.add(spot.kind);
    }
    expect(kinds.has("horse")).toBe(true);
  });

  it("타고 있는 말은 스스로 움직이지 않고, 블록 놓기를 막지도 않고, 조준 대상도 아니다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const horse = new Mob("horse", 10.5, 1, 10.5, fixed(0.5));
    sim.mobs.push(horse);
    expect(sim.intersectsBlock(10, 1, 10)).toBe(true);
    horse.ridden = true;
    expect(sim.intersectsBlock(10, 1, 10)).toBe(false);
    const x = horse.x;
    const z = horse.z;
    for (let i = 0; i < 120; i++) sim.update(1 / 60, world, fixed(0.2), FAR_PLAYER, false);
    expect(horse.x).toBe(x);
    expect(horse.z).toBe(z);
    horse.ridden = false;
    for (let i = 0; i < 300; i++) sim.update(1 / 60, world, fixed(0.2), FAR_PLAYER, false);
    expect(Math.hypot(horse.x - x, horse.z - z)).toBeGreaterThan(0.1);
  });

  it("말은 몸이 크고 체력이 많다", () => {
    expect(MOB_SPECS.horse.height).toBeGreaterThan(MOB_SPECS.pig.height);
    expect(MOB_SPECS.horse.hp).toBeGreaterThan(MOB_SPECS.pig.hp);
    expect(MOB_SPECS.horse.hostile).toBe(false);
  });

  it("안장은 양털 3개와 철 주괴 1개로 만든다", () => {
    const saddle = RECIPES.find((r) => r.name === "안장");
    expect(saddle?.output).toEqual([Item.Saddle, 1]);
    expect(saddle?.inputs).toEqual([[Block.Wool, 3], [Item.IronIngot, 1]]);
  });

  it("말을 타면 더 높이 뛰고 더 빨리 달린다", () => {
    const run = (jumpFactor: number, speedFactor: number) => {
      const w = flatWorld();
      const p = new Player(w);
      p.x = 20.5;
      p.z = 20.5;
      p.y = 1;
      p.jumpFactor = jumpFactor;
      p.speedFactor = speedFactor;
      for (let i = 0; i < 10; i++) p.update(1 / 60, { moveX: 0, moveZ: 0, jump: false }); // 먼저 땅에 선다
      p.x = 20.5;
      p.z = 20.5;
      let top = 1;
      for (let i = 0; i < 90; i++) {
        p.update(1 / 60, { moveX: 0, moveZ: 1, jump: i === 0 });
        top = Math.max(top, p.y);
      }
      return { top, dist: Math.hypot(p.x - 20.5, p.z - 20.5) };
    };
    const walk = run(1, 1);
    const ride = run(1.3, 2);
    expect(ride.top).toBeGreaterThan(walk.top + 0.5);
    expect(ride.dist).toBeGreaterThan(walk.dist * 1.6);
  });
});
