export type EditTuple = [number, number, number, number];

export interface SaveData {
  version: 1;
  seed: number;
  /** 지형 생성 결과에서 바뀐 블록만 [x, y, z, 블록] 으로 저장한다. */
  edits: EditTuple[];
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** 월드에서 흐른 시간(초). 낮/밤 위치를 이어가는 데 쓴다. 예전 저장에는 없다. */
  time?: number;
  /** 아이템 바에 넣어 둔 블록 종류(칸 순서대로). 예전 저장에는 없다. */
  hotbar?: number[];
  /** 게임 방식. 없으면(예전 저장) 블록이 무한인 "creative"로 이어간다. */
  mode?: "survival" | "creative";
  /** 가방 내용 [아이템 번호, 개수]. */
  inventory?: [number, number][];
  /** 심어 둔 씨앗 [x, y, z, 심은 시각(초)]. */
  crops?: [number, number, number, number][];
  /** 달성한 도전 과제 번호. */
  achievements?: string[];
}

/** 플레이어가 부수거나 놓은 블록을 기록한다. 같은 자리는 마지막 값만 남는다. */
export class EditLog {
  private readonly map = new Map<string, EditTuple>();

  record(x: number, y: number, z: number, block: number): void {
    this.map.set(`${x},${y},${z}`, [x, y, z, block]);
  }

  toArray(): EditTuple[] {
    return [...this.map.values()];
  }

  load(edits: EditTuple[]): void {
    for (const [x, y, z, block] of edits) this.record(x, y, z, block);
  }
}

export function encodeSave(data: SaveData): string {
  return JSON.stringify(data);
}

function isFiniteNumbers(values: unknown[]): boolean {
  return values.every((v) => typeof v === "number" && Number.isFinite(v));
}

/** 저장 글자를 읽는다. 깨졌거나 형식이 다르면 null (새로 시작하게). */
export function decodeSave(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (data?.version !== 1 || !Number.isFinite(data.seed) || !Array.isArray(data.edits)) return null;
    const p = data.player;
    if (!p || !isFiniteNumbers([p.x, p.y, p.z, p.yaw, p.pitch])) return null;
    if (data.time !== undefined && !Number.isFinite(data.time)) return null;
    if (data.hotbar !== undefined && !(Array.isArray(data.hotbar) && isFiniteNumbers(data.hotbar))) return null;
    if (data.mode !== undefined && data.mode !== "survival" && data.mode !== "creative") return null;
    if (
      data.inventory !== undefined &&
      !(Array.isArray(data.inventory) && data.inventory.every((e: unknown) => Array.isArray(e) && e.length === 2 && isFiniteNumbers(e)))
    )
      return null;
    if (data.crops !== undefined && !(Array.isArray(data.crops) && data.crops.every((e: unknown) => Array.isArray(e) && e.length === 4 && isFiniteNumbers(e)))) return null;
    if (data.achievements !== undefined && !(Array.isArray(data.achievements) && data.achievements.every((a: unknown) => typeof a === "string"))) return null;
    if (!data.edits.every((e: unknown) => Array.isArray(e) && e.length === 4 && isFiniteNumbers(e))) return null;
    return data as SaveData;
  } catch {
    return null;
  }
}
