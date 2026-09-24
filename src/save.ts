export type EditTuple = [number, number, number, number];

export interface SaveData {
  version: 1;
  seed: number;
  /** 지형 생성 결과에서 바뀐 블록만 [x, y, z, 블록] 으로 저장한다. */
  edits: EditTuple[];
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** 월드에서 흐른 시간(초). 낮/밤 위치를 이어가는 데 쓴다. 예전 저장에는 없다. */
  time?: number;
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
    if (!data.edits.every((e: unknown) => Array.isArray(e) && e.length === 4 && isFiniteNumbers(e))) return null;
    return data as SaveData;
  } catch {
    return null;
  }
}
