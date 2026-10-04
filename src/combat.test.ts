import { describe, expect, it } from "vitest";
import {
  arrowDamage,
  arrowSpeed,
  attackStrength,
  AXE_DAMAGE,
  BOW_FULL_DRAW,
  bowPower,
  CRIT_MULTIPLIER,
  damageScale,
  FIST,
  isCriticalHit,
  meleeResult,
  SHIELD_EXPLOSION_TAKEN,
  shieldBlocks,
  shieldWear,
  weaponStats,
} from "./combat";
import { Effects } from "./effects";
import { Inventory, Item, RECIPES } from "./inventory";
import { aimVelocity, ARROW_GRAVITY, ProjectileField, STUCK_SECONDS, type ProjectileEvent } from "./projectiles";
import { maxDurability } from "./tools";
import { Mob, MobSimulation, type DamageHit } from "./mobs";
import { Player } from "./player";
import { Block, World } from "./world";

const fixed = (value: number) => () => value;

function flatWorld(): World {
  const world = new World();
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) world.set(x, 0, z, Block.Stone);
  return world;
}

describe("무기와 공격 쿨다운", () => {
  it("검은 빠르고, 도끼는 세지만 느리다. 무기가 아니면 맨손이다", () => {
    const sword = weaponStats(Item.IronClub);
    const axe = weaponStats(Item.IronAxe);
    expect(axe.damage).toBeGreaterThan(sword.damage);
    expect(axe.cooldown).toBeGreaterThan(sword.cooldown);
    expect(axe.damage).toBe(AXE_DAMAGE[2]);
    expect(weaponStats(Item.Bread)).toEqual(FIST);
    expect(weaponStats(0)).toEqual(FIST);
    expect(FIST.cooldown).toBeLessThan(sword.cooldown);
  });

  it("충전은 시간에 비례해 0~1이고, 덜 충전하면 약해진다 (최소 20%)", () => {
    expect(attackStrength(0, 0.6)).toBe(0);
    expect(attackStrength(0.3, 0.6)).toBeCloseTo(0.5, 5);
    expect(attackStrength(5, 0.6)).toBe(1);
    expect(damageScale(0)).toBeCloseTo(0.2, 5);
    expect(damageScale(1)).toBeCloseTo(1, 5);
    expect(damageScale(0.5)).toBeLessThan(0.5);
  });

  it("다 충전하고 떨어지는 중에 치면 치명타로 1.5배", () => {
    expect(isCriticalHit(true, 1)).toBe(true);
    expect(isCriticalHit(true, 0.5)).toBe(false);
    expect(isCriticalHit(false, 1)).toBe(false);
    const normal = meleeResult(Item.IronClub, 1, false);
    const crit = meleeResult(Item.IronClub, 1, true);
    expect(crit.crit).toBe(true);
    expect(crit.damage).toBeCloseTo(normal.damage * CRIT_MULTIPLIER, 5);
    expect(crit.knock).toBeGreaterThan(normal.knock);
  });

  it("약하게 때리면 덜 아프고 덜 밀린다", () => {
    const full = meleeResult(Item.IronClub, 1, false);
    const weak = meleeResult(Item.IronClub, 0.1, false);
    expect(weak.damage).toBeLessThan(full.damage * 0.3);
    expect(weak.knock).toBeLessThan(full.knock);
  });

  it("날카로움·힘 효과는 공격력에 더해지고, 창작 모드는 맨손도 센 기본 공격력을 준다", () => {
    const base = meleeResult(Item.IronClub, 1, false).damage;
    expect(meleeResult(Item.IronClub, 1, false, 2.5).damage).toBeCloseTo(base + 2.5, 5);
    expect(meleeResult(0, 1, false, 0, 4).damage).toBe(4);
    expect(meleeResult(Item.DiamondClub, 1, false, 0, 4).damage).toBe(8); // 더 센 쪽
    const fx = new Effects();
    fx.add("strength", 10);
    expect(meleeResult(0, 1, false, fx.attackBonus()).damage).toBe(1 + fx.attackBonus());
  });
});

describe("활", () => {
  it("끝까지 당기면 최대 힘이고, 아주 짧게 당기면 약하다", () => {
    expect(bowPower(0)).toBe(0);
    expect(bowPower(BOW_FULL_DRAW)).toBe(1);
    expect(bowPower(BOW_FULL_DRAW * 5)).toBe(1);
    expect(bowPower(0.5)).toBeGreaterThan(0.4); // 절반 당겨도 절반 가까이 나온다
    expect(bowPower(0.5)).toBeLessThan(1);
  });

  it("세게 당길수록 화살이 빠르고 아프다 (힘 인챈트는 곱해진다)", () => {
    expect(arrowSpeed(1)).toBeGreaterThan(arrowSpeed(0.3));
    expect(arrowDamage(1)).toBeGreaterThan(arrowDamage(0.5));
    expect(arrowDamage(1, 1.5)).toBeCloseTo(arrowDamage(1) * 1.5, 5);
    expect(arrowDamage(1)).toBeGreaterThan(6); // 완전히 당기면 치명타
  });
});

describe("날아가는 화살", () => {
  it("중력으로 포물선을 그리며 떨어진다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    const arrow = field.shoot(10, 20, 10, 0, 0, -20, "player", 4);
    const startY = arrow.y;
    for (let i = 0; i < 30; i++) field.update(1 / 60, world, [], null);
    expect(arrow.z).toBeLessThan(10 - 8);
    expect(arrow.y).toBeLessThan(startY - 0.5 * ARROW_GRAVITY * 0.5 * 0.5 + 0.5);
    expect(arrow.vy).toBeLessThan(0);
  });

  it("블록에 맞으면 박히고, 잠시 뒤 사라진다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    field.shoot(10, 1.5, 10, 0, 0, -30, "player", 4);
    world.set(10, 1, 5, Block.Stone);
    let hitBlock = false;
    for (let i = 0; i < 60; i++) for (const e of field.update(1 / 60, world, [], null)) if (e.type === "block") hitBlock = true;
    expect(hitBlock).toBe(true);
    expect(field.arrows[0].stuck).toBe(true);
    expect(field.arrows[0].z).toBeGreaterThan(5.9); // 벽 앞에서 멈춘다
    for (let i = 0; i < 60 * (STUCK_SECONDS + 1); i++) field.update(1 / 60, world, [], null);
    expect(field.arrows).toHaveLength(0);
  });

  it("아주 빠른 화살도 얇은 벽을 뚫지 못한다", () => {
    const world = flatWorld();
    world.set(10, 1, 20, Block.Stone);
    const field = new ProjectileField();
    field.shoot(10, 1.5, 40, 0, 0, -400, "player", 4);
    field.update(1 / 20, world, [], null);
    expect(field.arrows[0].stuck).toBe(true);
    expect(field.arrows[0].z).toBeGreaterThan(20);
  });

  it("플레이어의 화살은 동물을 맞히고 사라진다. 길들인 동물은 지나간다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    const pig = new Mob("pig", 10.5, 1, 6, fixed(0.5));
    field.shoot(10.5, 1.4, 12, 0, 0, -25, "player", 4);
    const events: ProjectileEvent[] = [];
    for (let i = 0; i < 30; i++) events.push(...field.update(1 / 60, world, [pig], null));
    expect(events.map((e) => e.type)).toEqual(["mob"]);
    expect(field.arrows).toHaveLength(0);

    const pet = new Mob("pig", 10.5, 1, 6, fixed(0.5));
    pet.tamed = true;
    field.shoot(10.5, 1.4, 12, 0, 0, -25, "player", 4);
    const pass: ProjectileEvent[] = [];
    for (let i = 0; i < 40; i++) pass.push(...field.update(1 / 60, world, [pet], null));
    expect(pass.some((e) => e.type === "mob")).toBe(false);
  });

  it("괴물의 화살은 플레이어를 맞히고, 동물은 무시한다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    const pig = new Mob("pig", 10.5, 1, 8, fixed(0.5));
    field.shoot(10.5, 2, 14, 0, 0, -40, "enemy", 3);
    const events: ProjectileEvent[] = [];
    for (let i = 0; i < 60; i++) events.push(...field.update(1 / 60, world, [pig], { x: 10.5, y: 1, z: 4 }));
    expect(events.map((e) => e.type)).toEqual(["player"]);
  });

  it("조준 속도는 중력을 감안해서 먼 목표에도 맞는다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    const [vx, vy, vz] = aimVelocity(10.5, 1.6, 40, 10.5, 1.4, 12, 22, 0, fixed(0.5));
    field.shoot(10.5, 1.6, 40, vx, vy, vz, "enemy", 3);
    const events: ProjectileEvent[] = [];
    for (let i = 0; i < 120; i++) events.push(...field.update(1 / 60, world, [], { x: 10.5, y: 0.6, z: 12 }));
    expect(events.some((e) => e.type === "player")).toBe(true);
  });

  it("오래 날아간 화살은 사라진다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    field.shoot(10, 50, 10, 0, 0.1, 0, "player", 4);
    world.set(10, 0, 10, Block.Air);
    for (let i = 0; i < 60 * 15; i++) field.update(1 / 60, world, [], null);
    expect(field.arrows).toHaveLength(0);
  });
});

describe("방패", () => {
  it("앞쪽에서 온 공격만 막는다", () => {
    // yaw 0 → -z 방향을 본다
    expect(shieldBlocks(0, 10, 10, 10, 5)).toBe(true); // 앞(−z)
    expect(shieldBlocks(0, 10, 10, 10, 15)).toBe(false); // 뒤
    expect(shieldBlocks(0, 10, 10, 15, 10)).toBe(false); // 옆
    expect(shieldBlocks(0, 10, 10, 12, 6)).toBe(true); // 비스듬한 앞
    expect(shieldBlocks(Math.PI, 10, 10, 10, 15)).toBe(true); // 뒤돌아보면 반대편이 앞
    expect(shieldBlocks(0, 10, 10, 10, 10)).toBe(true); // 같은 자리
  });

  it("센 공격일수록 방패가 더 닳는다", () => {
    expect(shieldWear(0.2)).toBe(1);
    expect(shieldWear(3)).toBe(3);
    expect(shieldWear(12)).toBe(12);
    expect(SHIELD_EXPLOSION_TAKEN).toBeLessThan(1);
  });

  it("방패는 판자 6개와 철 주괴 1개로 만들고, 내구도가 있어 닳으면 부러진다", () => {
    const recipe = RECIPES.find((r) => r.name === "방패");
    expect(recipe?.inputs).toEqual([[Block.Planks, 6], [Item.IronIngot, 1]]);
    expect(maxDurability(Item.Shield)).toBe(336);
    const inv = new Inventory();
    inv.add(Item.Shield, 1);
    expect(inv.add(Item.Shield, 1)).toBe(0); // 한 칸에 하나
    expect(inv.toolLeft(Item.Shield)).toBe(336);
    expect(inv.useTool(Item.Shield, fixed(0), 10)).toBe(false);
    expect(inv.toolLeft(Item.Shield)).toBe(326);
    expect(inv.useTool(Item.Shield, fixed(0), 400)).toBe(true);
    expect(inv.count(Item.Shield)).toBe(0);
  });

  it("방패에는 내구성 인챈트만 붙는다", () => {
    const inv = new Inventory();
    inv.add(Item.Shield, 1);
    expect(inv.addEnchant(Item.Shield, "unbreaking", 2)).toBe(true);
    expect(inv.addEnchant(Item.Shield, "efficiency", 1)).toBe(false);
  });

  it("도끼에는 날카로움도 붙는다 (무기로 쓰이므로)", () => {
    const inv = new Inventory();
    inv.add(Item.IronAxe, 1);
    expect(inv.addEnchant(Item.IronAxe, "sharpness", 2)).toBe(true);
  });
});

describe("맞았을 때 밀려남", () => {
  it("플레이어는 맞은 반대쪽으로 밀리고, 시간이 지나면 멈춘다", () => {
    const world = flatWorld();
    const player = new Player(world);
    player.x = 20;
    player.z = 20;
    player.y = 1;
    for (let i = 0; i < 10; i++) player.update(1 / 60, { moveX: 0, moveZ: 0, jump: false });
    const x0 = player.x;
    player.knock(18, 20, 6); // 공격자가 왼쪽(-x)에 있으니 +x로 밀린다
    for (let i = 0; i < 60; i++) player.update(1 / 60, { moveX: 0, moveZ: 0, jump: false });
    expect(player.x).toBeGreaterThan(x0 + 0.5);
    const settled = player.x;
    for (let i = 0; i < 60; i++) player.update(1 / 60, { moveX: 0, moveZ: 0, jump: false });
    expect(player.x - settled).toBeLessThan(0.05);
  });

  it("동물은 knock 세기만큼 밀려난다", () => {
    const world = flatWorld();
    const strong = new Mob("pig", 20, 1, 20, fixed(0.5));
    const weak = new Mob("pig", 20, 1, 20, fixed(0.5));
    strong.hit(10, 20, 1, 12);
    weak.hit(10, 20, 1, 2);
    for (let i = 0; i < 30; i++) {
      strong.update(1 / 60, world, fixed(0.9));
      weak.update(1 / 60, world, fixed(0.9));
    }
    expect(strong.x - 20).toBeGreaterThan((weak.x - 20) * 2);
  });

  it("괴물이 때리면 어디서 맞았는지(공격한 쪽 위치)가 함께 나온다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("zombie", 20.5, 1, 20.9, fixed(0.5)));
    const player = { x: 20.5, y: 1, z: 20.5 };
    const hits: DamageHit[] = [];
    for (let i = 0; i < 60; i++) hits.push(...sim.update(1 / 60, world, fixed(0.9), player, true).hits);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].kind).toBe("melee");
    expect(Math.hypot(hits[0].x - player.x, hits[0].z - player.z)).toBeLessThan(1.5);
  });
});
