/**
 * 멀티플레이 서버(party/server.ts)와 게임 화면(net.ts)이 주고받는 메시지 모양.
 * 네트워크로 온 값은 믿을 수 없으니, 받는 쪽에서 항상 parse* 함수로 모양을 확인한다.
 */

/** 한 방에 최대 몇 명까지 같이 있을 수 있는지. */
export const MAX_PLAYERS = 4;

export interface Vec3Yaw {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface RemotePlayer extends Vec3Yaw {
  id: string;
  name: string;
  color: number;
}

/** 블록 하나가 바뀐 자리 [x, y, z, 블록 번호]. */
export type EditTuple = [number, number, number, number];

export interface ClientHello extends Vec3Yaw {
  type: "hello";
  name: string;
  color: number;
  /** 방이 비어 있으면(아직 시드가 없으면) 이 값으로 월드를 시작한다. */
  seed: number;
}

export interface ClientMove extends Vec3Yaw {
  type: "move";
}

export interface ClientEdit {
  type: "edit";
  x: number;
  y: number;
  z: number;
  block: number;
}

export type ClientMessage = ClientHello | ClientMove | ClientEdit;

export interface ServerWelcome {
  type: "welcome";
  id: string;
  seed: number;
  edits: EditTuple[];
  players: RemotePlayer[];
}

export interface ServerJoin {
  type: "join";
  player: RemotePlayer;
}

export interface ServerMove extends Vec3Yaw {
  type: "move";
  id: string;
}

export interface ServerEdit {
  type: "edit";
  x: number;
  y: number;
  z: number;
  block: number;
}

export interface ServerLeave {
  type: "leave";
  id: string;
}

/** 방에 이미 MAX_PLAYERS명이 있어서 못 들어갈 때. */
export interface ServerFull {
  type: "full";
}

export type ServerMessage = ServerWelcome | ServerJoin | ServerMove | ServerEdit | ServerLeave | ServerFull;

function isFiniteNumbers(values: unknown[]): boolean {
  return values.every((v) => typeof v === "number" && Number.isFinite(v));
}

function isVec3Yaw(v: Record<string, unknown>): boolean {
  return isFiniteNumbers([v.x, v.y, v.z, v.yaw, v.pitch]);
}

/** 이름은 너무 길거나 비어 있으면 곤란하니 다듬는다. */
export function sanitizeName(name: unknown): string {
  const text = typeof name === "string" ? name.trim().slice(0, 12) : "";
  return text || "손님";
}

/** 게임 화면(net.ts)이 서버로 보내는 메시지를 읽는다. 모양이 다르면 null. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const v = data as Record<string, unknown>;
  if (v.type === "hello" && isVec3Yaw(v) && Number.isFinite(v.seed) && typeof v.color === "number") {
    return { type: "hello", name: sanitizeName(v.name), color: v.color, seed: v.seed as number, x: v.x as number, y: v.y as number, z: v.z as number, yaw: v.yaw as number, pitch: v.pitch as number };
  }
  if (v.type === "move" && isVec3Yaw(v)) {
    return { type: "move", x: v.x as number, y: v.y as number, z: v.z as number, yaw: v.yaw as number, pitch: v.pitch as number };
  }
  if (v.type === "edit" && isFiniteNumbers([v.x, v.y, v.z, v.block])) {
    return { type: "edit", x: v.x as number, y: v.y as number, z: v.z as number, block: v.block as number };
  }
  return null;
}

/** net.ts가 서버로부터 받은 메시지를 읽는다. 모양이 다르면 null. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const v = data as Record<string, unknown>;
  if (v.type === "full") return { type: "full" };
  if (v.type === "welcome" && typeof v.id === "string" && Number.isFinite(v.seed) && Array.isArray(v.edits) && Array.isArray(v.players)) {
    if (!v.edits.every((e) => Array.isArray(e) && e.length === 4 && isFiniteNumbers(e))) return null;
    const players: RemotePlayer[] = [];
    for (const p of v.players) {
      if (!p || typeof p !== "object") return null;
      const rp = p as Record<string, unknown>;
      if (typeof rp.id !== "string" || !isVec3Yaw(rp) || typeof rp.color !== "number") return null;
      players.push({ id: rp.id, name: sanitizeName(rp.name), color: rp.color, x: rp.x as number, y: rp.y as number, z: rp.z as number, yaw: rp.yaw as number, pitch: rp.pitch as number });
    }
    return { type: "welcome", id: v.id, seed: v.seed as number, edits: v.edits as EditTuple[], players };
  }
  if (v.type === "join" && v.player && typeof v.player === "object") {
    const rp = v.player as Record<string, unknown>;
    if (typeof rp.id !== "string" || !isVec3Yaw(rp) || typeof rp.color !== "number") return null;
    return { type: "join", player: { id: rp.id, name: sanitizeName(rp.name), color: rp.color, x: rp.x as number, y: rp.y as number, z: rp.z as number, yaw: rp.yaw as number, pitch: rp.pitch as number } };
  }
  if (v.type === "move" && typeof v.id === "string" && isVec3Yaw(v)) {
    return { type: "move", id: v.id, x: v.x as number, y: v.y as number, z: v.z as number, yaw: v.yaw as number, pitch: v.pitch as number };
  }
  if (v.type === "edit" && isFiniteNumbers([v.x, v.y, v.z, v.block])) {
    return { type: "edit", x: v.x as number, y: v.y as number, z: v.z as number, block: v.block as number };
  }
  if (v.type === "leave" && typeof v.id === "string") {
    return { type: "leave", id: v.id };
  }
  return null;
}
