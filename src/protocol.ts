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

// ---- 동물·떨어진 아이템 공유: 방에서 가장 먼저 들어온 사람(호스트)의 게임이 동물과 아이템을 움직이고, 모두에게 알려 준다.

/** 동물 하나의 모습 [번호, 종류, x, y, z, 방향, 체력, 상태 비트, 직업(마을 사람), 집 이름(마을 사람)] */
export type MobSnap = [number, string, number, number, number, number, number, number, string | null, string];
/** 떨어진 아이템 [번호, 아이템, 개수, x, y, z] */
export type DropSnap = [number, number, number, number, number, number];
/** 날아가는 화살 [x, y, z, vx, vy, vz] */
export type ArrowSnap = [number, number, number, number, number, number];

export const MAX_MOB_SNAPS = 64;
export const MAX_DROP_SNAPS = 128;
export const MAX_ARROW_SNAPS = 32;
export const MAX_CHAT_LENGTH = 100;

/** 호스트가 아닌 사람이 호스트에게 부탁하는 일들 */
export type HostRequest =
  | { act: "hitMob"; id: number; damage: number; knock: number; fromX: number; fromZ: number }
  | { act: "feed"; id: number; item: number }
  | { act: "spawnMob"; kind: string; x: number; y: number; z: number }
  | { act: "spawnDrop"; item: number; count: number; x: number; y: number; z: number }
  | { act: "pickup"; id: number }
  | { act: "setTime"; t: number };

/** 호스트가 한 사람에게 알려 주는 일들 */
export type HostReply =
  | { act: "hurt"; damage: number; x: number; z: number; kind: string }
  | { act: "killed"; kind: string; x: number; y: number; z: number; baby: boolean }
  | { act: "give"; item: number; count: number }
  | { act: "feedResult"; id: number; result: string };

export interface ClientChat {
  type: "chat";
  text: string;
}

export interface ClientSnapshot {
  type: "snapshot";
  /** 호스트의 게임 시각(초): 모두 같은 낮밤을 보게 한다. */
  t: number;
  mobs: MobSnap[];
  drops: DropSnap[];
  arrows: ArrowSnap[];
}

export interface ClientFx {
  type: "fx";
  kind: "explosion";
  x: number;
  y: number;
  z: number;
}

export interface ClientToHost {
  type: "toHost";
  data: HostRequest;
}

export interface ClientToPlayer {
  type: "toPlayer";
  to: string;
  data: HostReply;
}

/** 상자·화로 안 내용 (자리 이름 → 글자로 바꾼 내용, null이면 치워졌다). */
export interface ClientContainer {
  type: "container";
  key: string;
  data: string | null;
}

export type ClientMessage = ClientHello | ClientMove | ClientEdit | ClientChat | ClientSnapshot | ClientFx | ClientToHost | ClientToPlayer | ClientContainer;

export interface ServerWelcome {
  type: "welcome";
  id: string;
  seed: number;
  edits: EditTuple[];
  players: RemotePlayer[];
  /** 지금 호스트인 사람의 id */
  hostId: string;
  /** 방에 저장된 상자·화로 내용 [자리 이름, 내용] */
  containers: [string, string][];
}

export interface ServerHost {
  type: "host";
  id: string;
}

export interface ServerChat {
  type: "chat";
  id: string;
  name: string;
  text: string;
}

export interface ServerSnapshot {
  type: "snapshot";
  t: number;
  mobs: MobSnap[];
  drops: DropSnap[];
  arrows: ArrowSnap[];
}

export interface ServerFx {
  type: "fx";
  kind: "explosion";
  x: number;
  y: number;
  z: number;
}

/** 다른 사람이 호스트에게 보낸 부탁 (호스트만 받는다). */
export interface ServerToHost {
  type: "toHost";
  from: string;
  data: HostRequest;
}

export interface ServerFromHost {
  type: "fromHost";
  data: HostReply;
}

export interface ServerContainer {
  type: "container";
  key: string;
  data: string | null;
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

export type ServerMessage =
  | ServerWelcome
  | ServerJoin
  | ServerMove
  | ServerEdit
  | ServerLeave
  | ServerFull
  | ServerHost
  | ServerChat
  | ServerSnapshot
  | ServerFx
  | ServerToHost
  | ServerFromHost
  | ServerContainer;

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

function isTuple(v: unknown, length: number): v is unknown[] {
  return Array.isArray(v) && v.length === length;
}

/** 채팅 글은 줄바꿈·제어 문자를 없애고 길이를 줄인다. 비면 null. */
export function sanitizeChat(text: unknown): string | null {
  if (typeof text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CHAT_LENGTH);
  return clean.length > 0 ? clean : null;
}

export function parseMobSnaps(list: unknown): MobSnap[] | null {
  if (!Array.isArray(list) || list.length > MAX_MOB_SNAPS) return null;
  const out: MobSnap[] = [];
  for (const e of list) {
    if (!isTuple(e, 10)) return null;
    const [id, kind, x, y, z, yaw, hp, flags, prof, home] = e;
    if (!Number.isInteger(id) || typeof kind !== "string" || kind.length > 16) return null;
    if (!isFiniteNumbers([x, y, z, yaw, hp, flags])) return null;
    if (prof !== null && (typeof prof !== "string" || prof.length > 12)) return null;
    if (typeof home !== "string" || home.length > 40) return null;
    out.push([id as number, kind, x as number, y as number, z as number, yaw as number, hp as number, flags as number, prof as string | null, home]);
  }
  return out;
}

export function parseDropSnaps(list: unknown): DropSnap[] | null {
  if (!Array.isArray(list) || list.length > MAX_DROP_SNAPS) return null;
  for (const e of list) if (!isTuple(e, 6) || !isFiniteNumbers(e) || !Number.isInteger(e[0])) return null;
  return list as DropSnap[];
}

export function parseArrowSnaps(list: unknown): ArrowSnap[] | null {
  if (!Array.isArray(list) || list.length > MAX_ARROW_SNAPS) return null;
  for (const e of list) if (!isTuple(e, 6) || !isFiniteNumbers(e)) return null;
  return list as ArrowSnap[];
}

export function parseHostRequest(v: unknown): HostRequest | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (r.act === "hitMob" && isFiniteNumbers([r.id, r.damage, r.knock, r.fromX, r.fromZ]) && Number.isInteger(r.id)) {
    return { act: "hitMob", id: r.id as number, damage: Math.max(0, Math.min(40, r.damage as number)), knock: Math.max(0, Math.min(20, r.knock as number)), fromX: r.fromX as number, fromZ: r.fromZ as number };
  }
  if (r.act === "feed" && isFiniteNumbers([r.id, r.item]) && Number.isInteger(r.id)) return { act: "feed", id: r.id as number, item: r.item as number };
  if (r.act === "spawnMob" && typeof r.kind === "string" && r.kind.length <= 16 && isFiniteNumbers([r.x, r.y, r.z])) {
    return { act: "spawnMob", kind: r.kind, x: r.x as number, y: r.y as number, z: r.z as number };
  }
  if (r.act === "spawnDrop" && isFiniteNumbers([r.item, r.count, r.x, r.y, r.z])) {
    return { act: "spawnDrop", item: r.item as number, count: Math.max(1, Math.min(64, Math.floor(r.count as number))), x: r.x as number, y: r.y as number, z: r.z as number };
  }
  if (r.act === "pickup" && Number.isInteger(r.id)) return { act: "pickup", id: r.id as number };
  if (r.act === "setTime" && Number.isFinite(r.t)) return { act: "setTime", t: r.t as number };
  return null;
}

export function parseHostReply(v: unknown): HostReply | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (r.act === "hurt" && isFiniteNumbers([r.damage, r.x, r.z]) && typeof r.kind === "string" && r.kind.length <= 12) {
    return { act: "hurt", damage: Math.max(0, Math.min(40, r.damage as number)), x: r.x as number, z: r.z as number, kind: r.kind };
  }
  if (r.act === "killed" && typeof r.kind === "string" && r.kind.length <= 16 && isFiniteNumbers([r.x, r.y, r.z])) {
    return { act: "killed", kind: r.kind, x: r.x as number, y: r.y as number, z: r.z as number, baby: r.baby === true };
  }
  if (r.act === "give" && isFiniteNumbers([r.item, r.count])) return { act: "give", item: r.item as number, count: Math.max(1, Math.min(64, Math.floor(r.count as number))) };
  if (r.act === "feedResult" && Number.isInteger(r.id) && typeof r.result === "string" && r.result.length <= 12) return { act: "feedResult", id: r.id as number, result: r.result };
  return null;
}

/** 상자·화로 내용 글자는 너무 길면 거부한다. */
export const MAX_CONTAINER_LENGTH = 6000;
export const MAX_CONTAINER_KEY = 48;

function parseContainerFields(v: Record<string, unknown>): { key: string; data: string | null } | null {
  if (typeof v.key !== "string" || v.key.length === 0 || v.key.length > MAX_CONTAINER_KEY) return null;
  if (v.data !== null && (typeof v.data !== "string" || v.data.length > MAX_CONTAINER_LENGTH)) return null;
  return { key: v.key, data: v.data as string | null };
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
  if (v.type === "chat") {
    const text = sanitizeChat(v.text);
    return text ? { type: "chat", text } : null;
  }
  if (v.type === "snapshot" && Number.isFinite(v.t)) {
    const mobs = parseMobSnaps(v.mobs);
    const drops = parseDropSnaps(v.drops);
    const arrows = parseArrowSnaps(v.arrows);
    return mobs && drops && arrows ? { type: "snapshot", t: v.t as number, mobs, drops, arrows } : null;
  }
  if (v.type === "fx" && v.kind === "explosion" && isFiniteNumbers([v.x, v.y, v.z])) {
    return { type: "fx", kind: "explosion", x: v.x as number, y: v.y as number, z: v.z as number };
  }
  if (v.type === "toHost") {
    const data = parseHostRequest(v.data);
    return data ? { type: "toHost", data } : null;
  }
  if (v.type === "toPlayer" && typeof v.to === "string" && v.to.length <= 64) {
    const data = parseHostReply(v.data);
    return data ? { type: "toPlayer", to: v.to, data } : null;
  }
  if (v.type === "container") {
    const fields = parseContainerFields(v);
    return fields ? { type: "container", ...fields } : null;
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
    const containers: [string, string][] = [];
    if (Array.isArray(v.containers)) {
      for (const c of v.containers) {
        if (!isTuple(c, 2) || typeof c[0] !== "string" || typeof c[1] !== "string") return null;
        containers.push([c[0], c[1]]);
      }
    }
    const hostId = typeof v.hostId === "string" ? v.hostId : "";
    return { type: "welcome", id: v.id, seed: v.seed as number, edits: v.edits as EditTuple[], players, hostId, containers };
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
  if (v.type === "host" && typeof v.id === "string") return { type: "host", id: v.id };
  if (v.type === "chat" && typeof v.id === "string") {
    const text = sanitizeChat(v.text);
    return text ? { type: "chat", id: v.id, name: sanitizeName(v.name), text } : null;
  }
  if (v.type === "snapshot" && Number.isFinite(v.t)) {
    const mobs = parseMobSnaps(v.mobs);
    const drops = parseDropSnaps(v.drops);
    const arrows = parseArrowSnaps(v.arrows);
    return mobs && drops && arrows ? { type: "snapshot", t: v.t as number, mobs, drops, arrows } : null;
  }
  if (v.type === "fx" && v.kind === "explosion" && isFiniteNumbers([v.x, v.y, v.z])) {
    return { type: "fx", kind: "explosion", x: v.x as number, y: v.y as number, z: v.z as number };
  }
  if (v.type === "toHost" && typeof v.from === "string") {
    const data = parseHostRequest(v.data);
    return data ? { type: "toHost", from: v.from, data } : null;
  }
  if (v.type === "fromHost") {
    const data = parseHostReply(v.data);
    return data ? { type: "fromHost", data } : null;
  }
  if (v.type === "container") {
    const fields = parseContainerFields(v);
    return fields ? { type: "container", ...fields } : null;
  }
  return null;
}
