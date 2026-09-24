import { describe, expect, it } from "vitest";
import { Player } from "./player";
import { Block, World } from "./world";

function flatWorld(): World {
  const world = new World();
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) world.set(x, 0, z, Block.Stone);
  return world;
}

const idle = { moveX: 0, moveZ: 0, jump: false };

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

  it("벽(월드 가장자리)을 뚫고 나가지 않는다", () => {
    const player = new Player(flatWorld());
    player.x = 0.5;
    player.z = 8;
    player.y = 1;
    player.yaw = Math.PI / 2;
    for (let i = 0; i < 120; i++) player.update(1 / 60, { moveX: 0, moveZ: 1, jump: false });
    expect(player.x).toBeGreaterThan(0);
  });
});
