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

  it("형식이 다르면 null이다", () => {
    expect(decodeSave(JSON.stringify({ ...sample, version: 2 }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, edits: [[1, 2, 3]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, player: { x: 1 } }))).toBeNull();
  });
});
