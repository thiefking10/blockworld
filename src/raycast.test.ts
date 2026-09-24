import { describe, expect, it } from "vitest";
import { lookDirection, raycast } from "./raycast";
import { Block, World } from "./world";

describe("raycast", () => {
  it("앞에 있는 블록을 찾고, 바로 앞 빈 칸도 알려준다", () => {
    const world = new World();
    world.set(5, 5, 2, Block.Stone);
    const hit = raycast(world, 5.5, 5.5, 8.5, 0, 0, -1, 10);
    expect(hit).toEqual({ x: 5, y: 5, z: 2, px: 5, py: 5, pz: 3 });
  });

  it("위에서 아래로 쏘면 위쪽 빈 칸이 놓을 자리다", () => {
    const world = new World();
    world.set(4, 2, 4, Block.Dirt);
    const hit = raycast(world, 4.5, 6.5, 4.5, 0, -1, 0, 10);
    expect(hit).toMatchObject({ x: 4, y: 2, z: 4, px: 4, py: 3, pz: 4 });
  });

  it("사거리 밖이면 못 찾는다", () => {
    const world = new World();
    world.set(5, 5, 0, Block.Stone);
    expect(raycast(world, 5.5, 5.5, 20.5, 0, 0, -1, 5)).toBeNull();
  });

  it("아무것도 없으면 null이다", () => {
    expect(raycast(new World(), 5.5, 5.5, 5.5, 1, 0, 0, 10)).toBeNull();
  });

  it("비스듬히 쏴도 블록을 맞춘다", () => {
    const world = new World();
    world.set(8, 5, 8, Block.Stone);
    const hit = raycast(world, 5.5, 5.5, 5.5, 1, 0, 1, 10);
    expect(hit).toMatchObject({ x: 8, y: 5, z: 8 });
  });
});

describe("lookDirection", () => {
  it("yaw 0, pitch 0이면 -z를 본다", () => {
    const [x, y, z] = lookDirection(0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });

  it("pitch가 양수면 위를 본다", () => {
    expect(lookDirection(0, 0.5)[1]).toBeGreaterThan(0);
  });
});
