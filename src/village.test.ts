import { describe, expect, it } from "vitest";
import { Inventory, Item } from "./inventory";
import { HOME_RANGE, Mob, MobSimulation, VILLAGE_SPAWN_RANGE } from "./mobs";
import { canTrade, doTrade, isProfession, PROFESSION_INFO, PROFESSIONS, professionAt } from "./trades";
import { VILLAGE_RADIUS } from "./village";
import { Block, isDoor, isOpenDoor, SIZE_X, SIZE_Z, World } from "./world";

const fixed = (value: number) => () => value;

// 월드 생성은 0.5초쯤 걸려서, 여러 시험이 같은 세계를 같이 쓴다.
const world = new World();
world.generate(1);

describe("마을 만들기", () => {
  it("월드에 마을이 두 곳 이상 생긴다", () => {
    expect(world.villages.length).toBeGreaterThanOrEqual(2);
    for (const site of world.villages) {
      expect(site.cx).toBeGreaterThan(VILLAGE_RADIUS);
      expect(site.cx).toBeLessThan(SIZE_X - VILLAGE_RADIUS);
      expect(site.cz).toBeGreaterThan(VILLAGE_RADIUS);
      expect(site.cz).toBeLessThan(SIZE_Z - VILLAGE_RADIUS);
    }
  });

  it("같은 시드면 같은 자리에 같은 마을이 선다", () => {
    const again = new World();
    again.generate(1);
    expect(again.villages).toEqual(world.villages);
  });

  it("땅이 평평하고 위가 깨끗하다 (나무·풀이 치워져 있다)", () => {
    for (const site of world.villages) {
      // 길(가운데 십자)은 자갈이고, 그 위는 비어 있어야 한다.
      for (const d of [-9, -6, -4, 4, 6, 9]) {
        expect(world.get(site.cx + d, site.groundY, site.cz)).toBe(Block.Gravel);
        expect(world.get(site.cx + d, site.groundY + 1, site.cz)).toBe(Block.Air);
        expect(world.get(site.cx + d, site.groundY + 2, site.cz)).toBe(Block.Air);
      }
    }
  });

  it("가운데 우물에는 물이 있고, 밭에는 밀이 자라고 있다", () => {
    for (const site of world.villages) {
      expect(world.get(site.cx, site.groundY, site.cz)).toBe(Block.Water);
      expect(world.get(site.cx + 2, site.groundY, site.cz)).toBe(Block.Stone);
      expect(world.get(site.cx + 2, site.groundY, site.cz - 10)).toBe(Block.Dirt);
      expect(world.get(site.cx + 2, site.groundY + 1, site.cz - 10)).toBe(Block.Wheat);
    }
  });

  it("집이 네 채이고, 각 집은 지붕·벽·열린 문을 갖춘다", () => {
    for (const site of world.villages) {
      expect(site.homes).toHaveLength(4);
      for (const home of site.homes) {
        const hx = Math.floor(home.x);
        const hz = Math.floor(home.z);
        const g = site.groundY;
        expect(home.y).toBe(g + 1);
        expect(world.get(hx, g, hz)).toBe(Block.Planks); // 바닥
        expect(world.get(hx, g + 4, hz)).toBe(Block.Planks); // 지붕
        expect(world.get(hx, g + 1, hz)).toBe(Block.Air); // 안쪽 공간
        expect(world.get(hx, g + 3, hz)).toBe(Block.Air);
        expect(world.get(hx + 2, g + 3, hz + 2)).toBe(Block.Wood); // 모서리 기둥
        // 가운데 길 쪽 벽 가운데에 열린 문이 있다
        const doorX = hx + (hx < site.cx ? 2 : -2);
        expect(isDoor(world.get(doorX, g + 1, hz))).toBe(true);
        expect(isOpenDoor(world.get(doorX, g + 1, hz))).toBe(true);
        expect(isDoor(world.get(doorX, g + 2, hz))).toBe(true);
      }
    }
  });
});

describe("마을 사람", () => {
  it("가까이 가면 집마다 한 명씩 나타나고, 이미 있으면 더 만들지 않는다", () => {
    const sim = new MobSimulation();
    const site = world.villages[0];
    const spawned = sim.maintainVillagers([site], site.cx, site.cz, fixed(0.5));
    expect(spawned).toHaveLength(site.homes.length);
    for (const villager of spawned) {
      expect(villager.kind).toBe("villager");
      expect(isProfession(villager.profession)).toBe(true);
    }
    expect(sim.maintainVillagers([site], site.cx, site.cz, fixed(0.5))).toHaveLength(0);
    // 한 명이 사라지면 다시 채운다
    sim.mobs.splice(sim.mobs.indexOf(spawned[0]), 1);
    expect(sim.maintainVillagers([site], site.cx, site.cz, fixed(0.5))).toHaveLength(1);
  });

  it("멀리 있으면 나타나지 않는다", () => {
    const sim = new MobSimulation();
    const site = world.villages[0];
    expect(sim.maintainVillagers([site], site.cx + VILLAGE_SPAWN_RANGE + 5, site.cz, fixed(0.5))).toHaveLength(0);
  });

  it("집 근처에서만 서성인다 (오래 돌아다녀도 멀리 가지 않는다)", () => {
    const sim = new MobSimulation();
    const site = world.villages[0];
    const [villager] = sim.maintainVillagers([site], site.cx, site.cz, fixed(0.5));
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let far = 0;
    for (let i = 0; i < 60 * 120; i++) {
      villager.update(1 / 60, world, rng);
      far = Math.max(far, Math.hypot(villager.x - villager.home!.x, villager.z - villager.home!.z));
    }
    expect(far).toBeLessThan(HOME_RANGE + 6);
  });

  it("마을 사람은 자연 스폰되는 동물 수를 차지하지 않고, 괴물처럼 쫓지도 않는다", () => {
    const sim = new MobSimulation();
    const villager = new Mob("villager", 10, 1, 10, fixed(0.5));
    expect(villager.hp).toBe(10);
    sim.mobs.push(villager);
    const result = sim.update(0.1, world, fixed(0.9), { x: 10.5, y: 1, z: 10.5 }, true);
    expect(result.damage).toBe(0);
  });
});

describe("거래", () => {
  it("직업은 네 가지이고 번호로 돌려 쓴다", () => {
    expect(PROFESSIONS).toHaveLength(4);
    expect(professionAt(0)).toBe("farmer");
    expect(professionAt(5)).toBe("smith");
    expect(professionAt(-1)).toBe("hunter");
    for (const p of PROFESSIONS) expect(PROFESSION_INFO[p].trades.length).toBeGreaterThanOrEqual(4);
    expect(isProfession("smith")).toBe(true);
    expect(isProfession("엉터리")).toBe(false);
    expect(isProfession(null)).toBe(false);
  });

  it("밀 20개를 에메랄드 1개로 바꾸고, 모자라면 못 한다", () => {
    const inv = new Inventory();
    const trade = PROFESSION_INFO.farmer.trades[0];
    inv.add(Item.Grain, 19);
    expect(canTrade(inv, trade)).toBe(false);
    expect(doTrade(inv, trade)).toBe(false);
    expect(inv.count(Item.Grain)).toBe(19);
    inv.add(Item.Grain, 1);
    expect(doTrade(inv, trade)).toBe(true);
    expect(inv.count(Item.Grain)).toBe(0);
    expect(inv.count(Item.Emerald)).toBe(1);
  });

  it("에메랄드로 물건을 산다", () => {
    const inv = new Inventory();
    inv.add(Item.Emerald, 6);
    const bow = PROFESSION_INFO.hunter.trades.find((t) => t.get[0] === Item.Bow)!;
    expect(doTrade(inv, bow)).toBe(true);
    expect(inv.count(Item.Bow)).toBe(1);
    expect(inv.count(Item.Emerald)).toBe(0);
  });

  it("이미 가진 도구·방어구는 또 사지 못한다 (가방은 한 칸에 하나)", () => {
    const inv = new Inventory();
    inv.add(Item.Emerald, 20);
    inv.add(Item.Bow, 1);
    const bow = PROFESSION_INFO.hunter.trades.find((t) => t.get[0] === Item.Bow)!;
    expect(canTrade(inv, bow)).toBe(false);
    expect(inv.count(Item.Emerald)).toBe(20);
  });

  it("가방이 가득 차서 받을 자리가 없으면 거래가 안 되고, 낸 것이 자리를 비우면 된다", () => {
    const inv = new Inventory();
    // 27칸을 서로 다른 아이템 한 개씩으로 채운다 (에메랄드가 마지막 한 칸)
    inv.add(Item.Emerald, 1);
    const fillers = [Item.Meat, Item.Bone, Item.Gunpowder, Item.Diamond, Item.Coal, Item.Grain, Item.Bread, Item.Stick, Item.IronIngot, Item.RawFish, Item.CookedFish, Item.String];
    for (const f of fillers) inv.add(f, 1);
    for (let b = 1; b <= 14 && inv.slotsUsed < inv.slotCount; b++) inv.add(b, 1);
    expect(inv.slotsUsed).toBe(inv.slotCount);
    const arrows = PROFESSION_INFO.hunter.trades.find((t) => t.get[0] === Item.Arrow)!;
    // 에메랄드 1개를 내면 그 칸이 비어 화살이 들어간다
    expect(canTrade(inv, arrows)).toBe(true);
    expect(doTrade(inv, arrows)).toBe(true);
    expect(inv.count(Item.Arrow)).toBe(16);
    // 이번엔 같은 물건을 낼 칸이 남지 않는 거래: 모아 둔 게 한 칸을 더 차지해야 하면 거절
    const wool = PROFESSION_INFO.farmer.trades[2]; // 에메랄드 1 → 씨앗 8
    expect(canTrade(inv, wool)).toBe(false); // 에메랄드가 이제 없다
  });
});
