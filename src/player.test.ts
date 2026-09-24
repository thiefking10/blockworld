import { describe, expect, it } from "vitest";
import { Player } from "./player";
import { Block, World } from "./world";

function flatWorld(): World {
  const world = new World();
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) world.set(x, 0, z, Block.Stone);
  return world;
}

const idle = { moveX: 0, moveZ: 0, jump: false };

describe("비행", () => {
  const still = { moveX: 0, moveZ: 0, jump: false, descend: false };

  function flyer(): Player {
    const player = new Player(flatWorld());
    player.x = 8;
    player.z = 8;
    player.y = 6;
    player.flying = true;
    return player;
  }

  it("가만히 있으면 떨어지지 않고 떠 있다", () => {
    const player = flyer();
    for (let i = 0; i < 120; i++) player.update(1 / 60, still);
    expect(player.y).toBeCloseTo(6, 3);
    expect(player.flying).toBe(true);
  });

  it("점프는 위로, 내려가기는 아래로 움직인다", () => {
    const player = flyer();
    for (let i = 0; i < 30; i++) player.update(1 / 60, { ...still, jump: true });
    expect(player.y).toBeGreaterThan(9);
    const high = player.y;
    for (let i = 0; i < 30; i++) player.update(1 / 60, { ...still, descend: true });
    expect(player.y).toBeLessThan(high - 2);
    expect(player.flying).toBe(true);
  });

  it("걷기보다 두 배 빠르게 날아간다", () => {
    const flying = flyer();
    const walking = new Player(flatWorld());
    walking.x = 8;
    walking.z = 8;
    walking.y = 1;
    for (let i = 0; i < 30; i++) {
      flying.update(1 / 60, { ...still, moveZ: 1 });
      walking.update(1 / 60, { ...still, moveZ: 1 });
    }
    expect(8 - flying.z).toBeCloseTo(2 * (8 - walking.z), 1);
  });

  it("내려가서 땅에 닿으면 비행이 저절로 끝난다", () => {
    const player = flyer();
    for (let i = 0; i < 120; i++) player.update(1 / 60, { ...still, descend: true });
    expect(player.flying).toBe(false);
    expect(player.y).toBeCloseTo(1, 1);
  });

  it("비행이 끝나면 다시 중력을 받는다", () => {
    const player = flyer();
    player.flying = false;
    for (let i = 0; i < 120; i++) player.update(1 / 60, still);
    expect(player.y).toBeCloseTo(1, 1);
  });
});

describe("자동 점프", () => {
  function walkForward(player: Player, seconds: number): void {
    for (let i = 0; i < seconds * 60; i++) player.update(1 / 60, { moveX: 0, moveZ: 1, jump: false });
  }

  function worldWithWall(height: number): World {
    const world = flatWorld();
    for (let y = 1; y <= height; y++) for (let x = 0; x < 16; x++) for (let z = 0; z <= 5; z++) world.set(x, y, z, Block.Stone);
    return world;
  }

  it("한 칸 높이 턱은 점프 버튼 없이 올라간다", () => {
    const player = new Player(worldWithWall(1));
    player.x = 8;
    player.z = 8;
    player.y = 1;
    walkForward(player, 2);
    expect(player.z).toBeLessThan(5.5);
    expect(player.y).toBeCloseTo(2, 1);
  });

  it("두 칸 높이 벽은 못 올라가고, 끄면 한 칸도 안 오른다", () => {
    const wall = new Player(worldWithWall(2));
    wall.x = 8;
    wall.z = 8;
    wall.y = 1;
    walkForward(wall, 2);
    expect(wall.z).toBeGreaterThan(5.9);
    expect(wall.y).toBeCloseTo(1, 1);

    const off = new Player(worldWithWall(1));
    off.autoJump = false;
    off.x = 8;
    off.z = 8;
    off.y = 1;
    walkForward(off, 2);
    expect(off.z).toBeGreaterThan(5.9);
  });

  it("머리 위가 막힌 좁은 턱은 오르지 않는다", () => {
    const world = worldWithWall(1);
    for (let x = 0; x < 16; x++) world.set(x, 3, 5, Block.Stone);
    for (let x = 0; x < 16; x++) world.set(x, 3, 4, Block.Stone);
    const player = new Player(world);
    player.x = 8;
    player.z = 8;
    player.y = 1;
    walkForward(player, 2);
    expect(player.y).toBeCloseTo(1, 1);
  });
});

describe("player", () => {
  it("공중에 있으면 떨어져서 바닥에 선다", () => {
    const player = new Player(flatWorld());
    player.x = 8;
    player.z = 8;
    player.y = 5;
    for (let i = 0; i < 120; i++) player.update(1 / 60, idle);
    expect(player.y).toBeCloseTo(1, 1);
    expect(player.onGround).toBe(true);
  });

  it("바닥에서만 뛸 수 있다", () => {
    const player = new Player(flatWorld());
    player.x = 8;
    player.z = 8;
    player.y = 1;
    for (let i = 0; i < 10; i++) player.update(1 / 60, idle);
    player.update(1 / 60, { ...idle, jump: true });
    for (let i = 0; i < 10; i++) player.update(1 / 60, { ...idle, jump: true });
    expect(player.y).toBeGreaterThan(1.2);
  });

  it("앞으로 가면 바라보는 방향으로 움직인다 (yaw 0이면 -z)", () => {
    const player = new Player(flatWorld());
    player.x = 8;
    player.z = 8;
    player.y = 1;
    for (let i = 0; i < 30; i++) player.update(1 / 60, { moveX: 0, moveZ: 1, jump: false });
    expect(player.z).toBeLessThan(8);
    expect(player.x).toBeCloseTo(8, 3);
  });

  it("자기 몸과 겹치는 칸을 알아본다", () => {
    const player = new Player(flatWorld());
    player.x = 8.5;
    player.z = 8.5;
    player.y = 1;
    expect(player.intersectsBlock(8, 1, 8)).toBe(true);
    expect(player.intersectsBlock(8, 2, 8)).toBe(true);
    expect(player.intersectsBlock(8, 3, 8)).toBe(false);
    expect(player.intersectsBlock(10, 1, 8)).toBe(false);
  });

  it("벽(월드 가장자리)을 뚫고 나가지 않는다", () => {
    const player = new Player(flatWorld());
    player.x = 0.5;
    player.z = 8;
    player.y = 1;
    player.yaw = Math.PI / 2;
    for (let i = 0; i < 120; i++) player.update(1 / 60, { moveX: 0, moveZ: 1, jump: false });
    expect(player.x).toBeGreaterThan(0);
  });

  it("물속에서는 천천히 가라앉는다", () => {
    const world = flatWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 1; y < 12; y++) world.set(x, y, z, Block.Water);
    const player = new Player(world);
    player.x = 8;
    player.z = 8;
    player.y = 10;
    for (let i = 0; i < 30; i++) player.update(1 / 60, idle);
    expect(player.isInWater()).toBe(true);
    expect(player.vy).toBeGreaterThan(-3.01);
    expect(player.y).toBeGreaterThan(8);
  });

  it("물속에서 점프를 누르면 위로 헤엄친다", () => {
    const world = flatWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 1; y < 12; y++) world.set(x, y, z, Block.Water);
    const player = new Player(world);
    player.x = 8;
    player.z = 8;
    player.y = 2;
    for (let i = 0; i < 30; i++) player.update(1 / 60, { moveX: 0, moveZ: 0, jump: true });
    expect(player.y).toBeGreaterThan(2.5);
  });
});
