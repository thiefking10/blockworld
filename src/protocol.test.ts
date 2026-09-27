import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage, sanitizeName } from "./protocol";

describe("sanitizeName", () => {
  it("비어 있거나 이상하면 손님으로 바꾸고, 너무 길면 잘라낸다", () => {
    expect(sanitizeName("  ")).toBe("손님");
    expect(sanitizeName(undefined)).toBe("손님");
    expect(sanitizeName(42)).toBe("손님");
    expect(sanitizeName("  민수  ")).toBe("민수");
    expect(sanitizeName("아주아주아주아주긴이름입니다")).toHaveLength(12);
  });
});

describe("parseClientMessage", () => {
  it("hello, move, edit을 올바르게 읽는다", () => {
    const hello = parseClientMessage(JSON.stringify({ type: "hello", name: "민수", color: 1, seed: 5, x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }));
    expect(hello).toEqual({ type: "hello", name: "민수", color: 1, seed: 5, x: 1, y: 2, z: 3, yaw: 0, pitch: 0 });

    const move = parseClientMessage(JSON.stringify({ type: "move", x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.2 }));
    expect(move).toEqual({ type: "move", x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.2 });

    const edit = parseClientMessage(JSON.stringify({ type: "edit", x: 1, y: 2, z: 3, block: 5 }));
    expect(edit).toEqual({ type: "edit", x: 1, y: 2, z: 3, block: 5 });
  });

  it("깨졌거나 모양이 다르거나 숫자가 아니면 null", () => {
    expect(parseClientMessage("이건 json이 아니다")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "hello" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "move", x: 1, y: 2, z: "3", yaw: 0, pitch: 0 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "edit", x: 1, y: 2, z: 3, block: NaN }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "dance" }))).toBeNull();
  });

  it("이름이 없거나 너무 길면 다듬어진다", () => {
    const hello = parseClientMessage(JSON.stringify({ type: "hello", color: 1, seed: 5, x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }));
    expect(hello).not.toBeNull();
    if (hello?.type === "hello") expect(hello.name).toBe("손님");
  });
});

describe("parseServerMessage", () => {
  it("welcome, join, move, edit, leave, full을 올바르게 읽는다", () => {
    const player = { id: "abc", name: "민수", color: 1, x: 1, y: 2, z: 3, yaw: 0, pitch: 0 };
    const welcome = parseServerMessage(
      JSON.stringify({ type: "welcome", id: "me", seed: 7, edits: [[1, 2, 3, 4]], players: [player] }),
    );
    expect(welcome).toEqual({ type: "welcome", id: "me", seed: 7, edits: [[1, 2, 3, 4]], players: [player] });

    expect(parseServerMessage(JSON.stringify({ type: "join", player }))).toEqual({ type: "join", player });
    expect(parseServerMessage(JSON.stringify({ type: "move", id: "abc", x: 1, y: 2, z: 3, yaw: 0.1, pitch: 0.2 }))).toEqual({
      type: "move",
      id: "abc",
      x: 1,
      y: 2,
      z: 3,
      yaw: 0.1,
      pitch: 0.2,
    });
    expect(parseServerMessage(JSON.stringify({ type: "edit", x: 1, y: 2, z: 3, block: 9 }))).toEqual({ type: "edit", x: 1, y: 2, z: 3, block: 9 });
    expect(parseServerMessage(JSON.stringify({ type: "leave", id: "abc" }))).toEqual({ type: "leave", id: "abc" });
    expect(parseServerMessage(JSON.stringify({ type: "full" }))).toEqual({ type: "full" });
  });

  it("깨졌거나 모양이 다르면 null", () => {
    expect(parseServerMessage("{{{")).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "welcome", id: "me", seed: 7, edits: [[1, 2]], players: [] }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "join", player: { id: "abc" } }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "nope" }))).toBeNull();
  });
});
