import { describe, expect, it } from "vitest";
import { decodeSave, EditLog, encodeSave, SaveData } from "./save";

const sample: SaveData = {
  version: 1,
  seed: 42,
  edits: [[1, 2, 3, 0]],
  player: { x: 10.5, y: 8, z: 12.5, yaw: 1.2, pitch: -0.3 },
};

describe("EditLog", () => {
  it("같은 자리는 마지막 값만 남긴다", () => {
    const log = new EditLog();
    log.record(1, 2, 3, 5);
    log.record(1, 2, 3, 0);
    log.record(4, 5, 6, 3);
    expect(log.toArray()).toEqual([
      [1, 2, 3, 0],
      [4, 5, 6, 3],
    ]);
  });

  it("저장된 기록을 불러올 수 있다", () => {
    const log = new EditLog();
    log.load([[1, 1, 1, 2]]);
    expect(log.toArray()).toEqual([[1, 1, 1, 2]]);
  });
});

describe("save", () => {
  it("저장했다가 그대로 읽을 수 있다", () => {
    expect(decodeSave(encodeSave(sample))).toEqual(sample);
  });

  it("비어 있거나 깨진 저장은 null이다", () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave("")).toBeNull();
    expect(decodeSave("{not json")).toBeNull();
  });

  it("시간이 있으면 같이 저장되고, 없는 예전 저장도 읽힌다", () => {
    const withTime = { ...sample, time: 88.5 };
    expect(decodeSave(encodeSave(withTime))).toEqual(withTime);
    expect(decodeSave(encodeSave(sample))?.time).toBeUndefined();
    expect(decodeSave(JSON.stringify({ ...sample, time: "a" }))).toBeNull();
  });

  it("게임 방식과 가방도 같이 저장되고, 없는 예전 저장도 읽힌다", () => {
    const full: SaveData = { ...sample, mode: "survival", inventory: [[5, 3], [100, 2]] };
    expect(decodeSave(encodeSave(full))).toEqual(full);
    expect(decodeSave(encodeSave(sample))?.mode).toBeUndefined();
    expect(decodeSave(JSON.stringify({ ...sample, mode: "hard" }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, inventory: [[1]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, inventory: "x" }))).toBeNull();
  });

  it("심은 작물과 도전 과제도 저장된다", () => {
    const full: SaveData = { ...sample, crops: [[1, 2, 3, 40.5]], achievements: ["wood", "bed"] };
    expect(decodeSave(encodeSave(full))).toEqual(full);
    expect(decodeSave(JSON.stringify({ ...sample, crops: [[1, 2, 3]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, achievements: [1] }))).toBeNull();
  });

  it("배고픔도 저장되고, 없는 예전 저장도 읽힌다", () => {
    const full: SaveData = { ...sample, hunger: 14 };
    expect(decodeSave(encodeSave(full))).toEqual(full);
    expect(decodeSave(encodeSave(sample))?.hunger).toBeUndefined();
    expect(decodeSave(JSON.stringify({ ...sample, hunger: "많이" }))).toBeNull();
  });

  it("상자 내용도 저장되고, 모양이 이상하면 거부한다", () => {
    const full: SaveData = { ...sample, chests: [[1, 2, 3, [[3, 5]], []]] };
    expect(decodeSave(encodeSave(full))).toEqual(full);
    expect(decodeSave(encodeSave(sample))?.chests).toBeUndefined();
    expect(decodeSave(JSON.stringify({ ...sample, chests: [[1, 2, 3, [[3]], []]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, chests: [[1, 2]] }))).toBeNull();
  });

  it("월드 규격 번호도 저장되고, 없는 예전 저장도 읽힌다", () => {
    const full: SaveData = { ...sample, worldVersion: 2 };
    expect(decodeSave(encodeSave(full))?.worldVersion).toBe(2);
    expect(decodeSave(encodeSave(sample))?.worldVersion).toBeUndefined();
    expect(decodeSave(JSON.stringify({ ...sample, worldVersion: "둘" }))).toBeNull();
  });

  it("형식이 다르면 null이다", () => {
    expect(decodeSave(JSON.stringify({ ...sample, version: 2 }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, edits: [[1, 2, 3]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, player: { x: 1 } }))).toBeNull();
  });
});
