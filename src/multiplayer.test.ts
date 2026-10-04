import { describe, expect, it } from "vitest";
import { DropField } from "./drops";
import { Mob, MobSimulation } from "./mobs";
import {
  MAX_CHAT_LENGTH,
  parseClientMessage,
  parseHostReply,
  parseHostRequest,
  parseServerMessage,
  sanitizeChat,
  type MobSnap,
} from "./protocol";
import { ProjectileField } from "./projectiles";
import { Block, World } from "./world";

const fixed = (value: number) => () => value;

function flatWorld(): World {
  const world = new World();
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) world.set(x, 0, z, Block.Grass);
  return world;
}

describe("채팅", () => {
  it("제어 문자는 공백으로, 앞뒤 공백은 지우고, 길면 자른다. 비면 null", () => {
    expect(sanitizeChat("  안녕\n하세요  ")).toBe("안녕 하세요");
    expect(sanitizeChat("a".repeat(500))).toHaveLength(MAX_CHAT_LENGTH);
    expect(sanitizeChat("   ")).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
  });

  it("보내는 쪽·받는 쪽 메시지를 읽는다", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "  hi  " }))).toEqual({ type: "chat", text: "hi" });
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "chat", id: "a", name: "민수", text: "안녕" }))).toEqual({ type: "chat", id: "a", name: "민수", text: "안녕" });
    expect(parseServerMessage(JSON.stringify({ type: "chat", id: "a", name: "민수", text: "" }))).toBeNull();
  });
});

describe("호스트 부탁·답", () => {
  it("올바른 부탁만 읽고, 값의 범위를 다듬는다", () => {
    expect(parseHostRequest({ act: "hitMob", id: 3, damage: 999, knock: -2, fromX: 1, fromZ: 2 })).toEqual({ act: "hitMob", id: 3, damage: 40, knock: 0, fromX: 1, fromZ: 2 });
    expect(parseHostRequest({ act: "hitMob", id: 1.5, damage: 1, knock: 1, fromX: 1, fromZ: 2 })).toBeNull();
    expect(parseHostRequest({ act: "spawnDrop", item: 3, count: 500, x: 1, y: 2, z: 3 })).toEqual({ act: "spawnDrop", item: 3, count: 64, x: 1, y: 2, z: 3 });
    expect(parseHostRequest({ act: "pickup", id: 9 })).toEqual({ act: "pickup", id: 9 });
    expect(parseHostRequest({ act: "feed", id: 2, item: 107 })).toEqual({ act: "feed", id: 2, item: 107 });
    expect(parseHostRequest({ act: "setTime", t: 123.5 })).toEqual({ act: "setTime", t: 123.5 });
    expect(parseHostRequest({ act: "spawnMob", kind: "pig", x: 1, y: 2, z: 3 })?.act).toBe("spawnMob");
    expect(parseHostRequest({ act: "엉터리" })).toBeNull();
    expect(parseHostRequest(null)).toBeNull();
    expect(parseHostRequest({ act: "hitMob", id: 1, damage: NaN, knock: 1, fromX: 1, fromZ: 2 })).toBeNull();
  });

  it("호스트의 답을 읽는다", () => {
    expect(parseHostReply({ act: "hurt", damage: 3, x: 1, z: 2, kind: "melee" })).toEqual({ act: "hurt", damage: 3, x: 1, z: 2, kind: "melee" });
    expect(parseHostReply({ act: "killed", kind: "zombie", x: 1, y: 2, z: 3, baby: true })).toEqual({ act: "killed", kind: "zombie", x: 1, y: 2, z: 3, baby: true });
    expect(parseHostReply({ act: "give", item: 5, count: 0 })).toEqual({ act: "give", item: 5, count: 1 });
    expect(parseHostReply({ act: "feedResult", id: 4, result: "tamed" })).toEqual({ act: "feedResult", id: 4, result: "tamed" });
    expect(parseHostReply({ act: "hurt", damage: "많이", x: 1, z: 2, kind: "melee" })).toBeNull();
  });

  it("부탁과 답이 서버를 거치는 모양으로 읽힌다", () => {
    const toHost = parseClientMessage(JSON.stringify({ type: "toHost", data: { act: "pickup", id: 1 } }));
    expect(toHost).toEqual({ type: "toHost", data: { act: "pickup", id: 1 } });
    const fromClient = parseServerMessage(JSON.stringify({ type: "toHost", from: "p2", data: { act: "pickup", id: 1 } }));
    expect(fromClient).toEqual({ type: "toHost", from: "p2", data: { act: "pickup", id: 1 } });
    expect(parseClientMessage(JSON.stringify({ type: "toPlayer", to: "p2", data: { act: "give", item: 3, count: 2 } }))?.type).toBe("toPlayer");
    expect(parseServerMessage(JSON.stringify({ type: "fromHost", data: { act: "give", item: 3, count: 2 } }))).toEqual({ type: "fromHost", data: { act: "give", item: 3, count: 2 } });
    expect(parseClientMessage(JSON.stringify({ type: "toHost", data: { act: "해킹" } }))).toBeNull();
  });
});

describe("스냅샷·상자 메시지", () => {
  it("동물·아이템·화살 목록을 읽고, 모양이 이상하면 거부한다", () => {
    const snapshot = { type: "snapshot", t: 12.5, mobs: [[1, "pig", 1, 2, 3, 0.5, 4, 0, null, ""]], drops: [[1, 3, 2, 1, 2, 3]], arrows: [[1, 2, 3, 0, 0, 1]] };
    expect(parseClientMessage(JSON.stringify(snapshot))?.type).toBe("snapshot");
    expect(parseServerMessage(JSON.stringify(snapshot))?.type).toBe("snapshot");
    expect(parseClientMessage(JSON.stringify({ ...snapshot, mobs: [[1, "pig", 1, 2]] }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...snapshot, drops: [[1.5, 3, 2, 1, 2, 3]] }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...snapshot, t: "지금" }))).toBeNull();
    const tooMany = Array.from({ length: 65 }, (_, i) => [i, "pig", 0, 0, 0, 0, 1, 0, null, ""]);
    expect(parseClientMessage(JSON.stringify({ ...snapshot, mobs: tooMany }))).toBeNull();
  });

  it("상자·화로 내용과 폭발 효과 메시지", () => {
    expect(parseClientMessage(JSON.stringify({ type: "container", key: "chest:1,2,3", data: "[1,2]" }))).toEqual({ type: "container", key: "chest:1,2,3", data: "[1,2]" });
    expect(parseClientMessage(JSON.stringify({ type: "container", key: "chest:1,2,3", data: null }))?.type).toBe("container");
    expect(parseClientMessage(JSON.stringify({ type: "container", key: "", data: "x" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "container", key: "k", data: "x".repeat(7000) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "fx", kind: "explosion", x: 1, y: 2, z: 3 }))?.type).toBe("fx");
    expect(parseClientMessage(JSON.stringify({ type: "fx", kind: "핵", x: 1, y: 2, z: 3 }))).toBeNull();
  });

  it("welcome에 호스트와 저장된 상자 내용이 담긴다", () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: "welcome", id: "me", seed: 7, edits: [], players: [], hostId: "host1", containers: [["chest:1,2,3", "[]"]] }),
    );
    expect(msg).toMatchObject({ type: "welcome", hostId: "host1", containers: [["chest:1,2,3", "[]"]] });
    expect(parseServerMessage(JSON.stringify({ type: "host", id: "p2" }))).toEqual({ type: "host", id: "p2" });
  });
});

describe("동물 모습 주고받기", () => {
  it("호스트의 동물이 다른 사람 화면에 똑같이 나타나고, 호스트와 같은 번호를 쓴다", () => {
    const host = new MobSimulation();
    const pig = host.spawn("pig", 10, 1, 10, fixed(0.5));
    pig.baby = true;
    const villager = host.spawn("villager", 12, 1, 12, fixed(0.5), true);
    villager.homeKey = "a,b,0";
    const snap = host.snapshot();
    expect(snap).toHaveLength(2);

    const guest = new MobSimulation();
    guest.applySnapshot(JSON.parse(JSON.stringify(snap)), fixed(0.5));
    expect(guest.mobs.map((m) => [m.id, m.kind])).toEqual([[pig.id, "pig"], [villager.id, "villager"]]);
    expect(guest.mobs[0].baby).toBe(true);
    expect(guest.mobs[1].profession).toBe(villager.profession);
    expect(guest.mobs[1].homeKey).toBe("a,b,0");
  });

  it("다음 스냅샷에서는 같은 동물을 새로 만들지 않고 자리만 옮기고, 없어진 동물은 지운다", () => {
    const guest = new MobSimulation();
    const first: MobSnap[] = [[5, "sheep", 10, 1, 10, 0, 4, 0, null, ""], [6, "pig", 20, 1, 20, 0, 4, 0, null, ""]];
    guest.applySnapshot(first, fixed(0.5));
    const sheep = guest.mobs[0];
    guest.applySnapshot([[5, "sheep", 11, 1, 10, 0, 3, 8, null, ""]], fixed(0.5));
    expect(guest.mobs).toHaveLength(1);
    expect(guest.mobs[0]).toBe(sheep);
    expect(sheep.tx).toBe(11);
    expect(sheep.hp).toBe(3);
    expect(sheep.moving).toBe(true);
    // 부드럽게 따라간다
    for (let i = 0; i < 30; i++) guest.smoothProxies(1 / 60);
    expect(sheep.x).toBeGreaterThan(10.5);
    expect(sheep.x).toBeLessThanOrEqual(11);
  });

  it("모르는 종류는 무시하고, 멀리 떨어진 동물은 바로 맞춘다", () => {
    const guest = new MobSimulation();
    guest.applySnapshot([[1, "외계인", 1, 1, 1, 0, 1, 0, null, ""], [2, "pig", 0, 1, 0, 0, 4, 0, null, ""]], fixed(0.5));
    expect(guest.mobs.map((m) => m.kind)).toEqual(["pig"]);
    guest.applySnapshot([[2, "pig", 40, 1, 0, 0, 4, 0, null, ""]], fixed(0.5));
    guest.smoothProxies(1 / 60);
    expect(guest.mobs[0].x).toBe(40);
  });

  it("호스트가 나가면 다음 호스트가 받아 둔 동물을 이어서 움직인다 (같은 번호로 새로 생기지 않는다)", () => {
    const world = flatWorld();
    const guest = new MobSimulation();
    guest.applySnapshot([[3, "pig", 10, 1, 10, 0, 4, 0, null, ""]], fixed(0.5));
    const pig = guest.mobs[0];
    pig.x = 10;
    pig.y = 1;
    pig.z = 10;
    for (let i = 0; i < 300; i++) guest.update(1 / 60, world, fixed(0.2), { id: "me", x: 50, y: 1, z: 50 }, false);
    expect(guest.mobs.find((m) => m.id === 3)).toBe(pig);
    expect(Math.hypot(pig.x - 10, pig.z - 10)).toBeGreaterThan(0.05);
  });
});

describe("여러 사람을 상대하는 동물", () => {
  it("각자 가장 가까운 사람을 노리고, 피해에는 맞은 사람이 적힌다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("zombie", 10.5, 1, 10.9, fixed(0.5)));
    sim.mobs.push(new Mob("zombie", 50.5, 1, 50.9, fixed(0.5)));
    const players = [
      { id: "a", x: 10.5, y: 1, z: 10.5 },
      { id: "b", x: 50.5, y: 1, z: 50.5 },
    ];
    const targets = new Set<string>();
    for (let i = 0; i < 120; i++) for (const hit of sim.update(1 / 60, world, fixed(0.9), players, true).hits) targets.add(hit.target);
    expect([...targets].sort()).toEqual(["a", "b"]);
  });

  it("혼자일 때 피해의 target은 빈 글자이고, 사람이 없으면 아무 일도 없다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    sim.mobs.push(new Mob("zombie", 10.5, 1, 10.9, fixed(0.5)));
    const hits = [];
    for (let i = 0; i < 90; i++) hits.push(...sim.update(1 / 60, world, fixed(0.9), { x: 10.5, y: 1, z: 10.5 }, true).hits);
    expect(hits[0].target).toBe("");
    expect(sim.update(1 / 60, world, fixed(0.9), [], true).hits).toEqual([]);
  });

  it("아무도 가까이 없는 동물만 멀어서 사라지고, 한 명이라도 가까우면 남는다", () => {
    const world = flatWorld();
    const sim = new MobSimulation();
    const near = new Mob("pig", 5, 1, 5, fixed(0.5));
    sim.mobs.push(near);
    const players = [
      { id: "a", x: 5, y: 1, z: 5 },
      { id: "b", x: 5000, y: 1, z: 5000 },
    ];
    sim.update(1 / 60, world, fixed(0.9), players, false);
    expect(sim.mobs).toContain(near);
    sim.update(1 / 60, world, fixed(0.9), [players[1]], false);
    expect(sim.mobs).not.toContain(near);
  });

  it("괴물의 화살은 맞은 사람이 누구인지 알려 준다", () => {
    const world = flatWorld();
    const field = new ProjectileField();
    field.shoot(10.5, 2, 14, 0, 0, -40, "enemy", 3);
    const events = [];
    for (let i = 0; i < 60; i++) events.push(...field.update(1 / 60, world, [], [{ id: "a", x: 30, y: 1, z: 30 }, { id: "b", x: 10.5, y: 1, z: 4 }]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "player", playerId: "b" });
  });
});

describe("떨어진 아이템 주고받기", () => {
  it("호스트의 아이템이 같은 번호로 다른 사람 화면에 나타나고, 사라진 것은 지워진다", () => {
    const host = new DropField();
    const a = host.spawn(3, 5, 10, 2, 10, fixed(0.5))!;
    const b = host.spawn(4, 1, 20, 2, 20, fixed(0.5))!;
    const guest = new DropField();
    guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
    expect(guest.drops.map((d) => [d.id, d.item, d.count])).toEqual([[a.id, 3, 5], [b.id, 4, 1]]);

    host.take(a.id);
    guest.applySnapshot(host.snapshot());
    expect(guest.drops.map((d) => d.id)).toEqual([b.id]);
  });

  it("take는 한 번만 가져갈 수 있다 (두 사람이 같은 걸 줍지 못한다)", () => {
    const host = new DropField();
    const a = host.spawn(3, 5, 10, 2, 10, fixed(0.5))!;
    expect(host.take(a.id)?.count).toBe(5);
    expect(host.take(a.id)).toBeNull();
  });

  it("스냅샷 위치로 부드럽게 따라가고, 호스트가 된 뒤에도 번호가 겹치지 않는다", () => {
    const guest = new DropField();
    guest.applySnapshot([[7, 3, 1, 10, 2, 10]]);
    guest.applySnapshot([[7, 3, 1, 12, 2, 10]]);
    for (let i = 0; i < 30; i++) guest.smoothProxies(1 / 60);
    expect(guest.drops[0].x).toBeGreaterThan(11);
    const fresh = guest.spawn(5, 1, 0, 2, 0, fixed(0.5))!;
    expect(fresh.id).toBeGreaterThan(7);
  });
});
