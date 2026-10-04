/**
 * 블록 월드 멀티플레이 서버. Cloudflare Workers + Durable Objects 위에서 직접 돈다
 * (wrangler로 배포). 방 하나 = Durable Object 하나. 같은 방 코드로 들어온 사람끼리
 * 같은 시드로 시작하고, 블록을 부수거나 놓으면 서로에게 알려 주고 저장소에 남긴다.
 *
 * 서버는 게임 규칙을 돌리지 않는다. 대신 "호스트"(방에서 가장 먼저 들어온 사람)를 정해 두고,
 * 호스트의 게임이 동물·떨어진 아이템을 움직여 그 모습을 모두에게 전달하게 중계만 한다.
 * 호스트가 나가면 그다음으로 오래된 사람이 호스트가 된다.
 *
 * 클라이언트(src/net.ts, partysocket)는 `/parties/main/방코드` 주소로 접속하므로,
 * 아래 default export(Worker)가 그 경로를 보고 알맞은 방(Durable Object)으로 이어 준다.
 */
import { DurableObject } from "cloudflare:workers";
import { MAX_CONTAINER_KEY, MAX_PLAYERS, parseClientMessage, RemotePlayer, ServerMessage } from "../src/protocol";
import { EditLog, EditTuple } from "../src/save";

interface ConnState {
  name: string;
  color: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface StoredWorld {
  seed: number;
  edits: EditTuple[];
}

interface Env {
  VOXEL_ROOM: DurableObjectNamespace<VoxelRoom>;
}

interface Entry {
  id: string;
  state: ConnState | null;
  /** hello를 보낸 순서 (작을수록 먼저 들어온 사람) */
  order: number;
  lastChat: number;
}

/** 방에 저장해 둘 상자·화로 자리의 최대 개수 */
const MAX_CONTAINERS = 400;
const CHAT_GAP_MS = 400;

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // 끊긴 소켓에 보내려던 것뿐이니 무시한다.
  }
}

/** 방 하나. 접속마다 임의의 id를 붙여서 기억한다 (hello 전이면 state는 null). */
export class VoxelRoom extends DurableObject<Env> {
  private seed: number | null = null;
  private readonly edits = new EditLog();
  private readonly containers = new Map<string, string>();
  private readonly sockets = new Map<WebSocket, Entry>();
  private hostSocket: WebSocket | null = null;
  private nextOrder = 1;
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const stored = await this.ctx.storage.get<StoredWorld>("world");
    if (stored) {
      this.seed = stored.seed;
      this.edits.load(stored.edits);
    }
    const containers = await this.ctx.storage.get<[string, string][]>("containers");
    if (containers) for (const [key, data] of containers) this.containers.set(key, data);
  }

  private async persist(): Promise<void> {
    if (this.seed === null) return;
    await this.ctx.storage.put<StoredWorld>("world", { seed: this.seed, edits: this.edits.toArray() });
  }

  private async persistContainers(): Promise<void> {
    await this.ctx.storage.put<[string, string][]>("containers", [...this.containers.entries()]);
  }

  private broadcast(message: ServerMessage, exceptSocket?: WebSocket): void {
    for (const socket of this.sockets.keys()) {
      if (socket !== exceptSocket) send(socket, message);
    }
  }

  private hostId(): string {
    return this.hostSocket ? (this.sockets.get(this.hostSocket)?.id ?? "") : "";
  }

  /** 가장 먼저 들어온(hello를 보낸) 사람을 호스트로 정한다. 바뀌었으면 모두에게 알린다. */
  private electHost(): void {
    let best: WebSocket | null = null;
    let bestOrder = Infinity;
    for (const [socket, entry] of this.sockets) {
      if (entry.state && entry.order < bestOrder) {
        best = socket;
        bestOrder = entry.order;
      }
    }
    if (best === this.hostSocket) return;
    this.hostSocket = best;
    this.broadcast({ type: "host", id: this.hostId() });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("이 주소는 게임 클라이언트가 웹소켓으로 접속하는 곳이에요.", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (this.sockets.size >= MAX_PLAYERS) {
      send(server, { type: "full" });
      server.close(1000, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = crypto.randomUUID();
    this.sockets.set(server, { id, state: null, order: 0, lastChat: 0 });
    server.addEventListener("message", (event: MessageEvent) => {
      void this.onMessage(server, typeof event.data === "string" ? event.data : "");
    });
    const onGone = (): void => this.onClose(server);
    server.addEventListener("close", onGone);
    server.addEventListener("error", onGone);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(sender: WebSocket, raw: string): Promise<void> {
    const entry = this.sockets.get(sender);
    if (!entry) return;
    // 터무니없이 큰 메시지는 읽지도 않는다 (동물 목록이 가장 크다).
    if (raw.length > 30000) return;
    const msg = parseClientMessage(raw);
    if (!msg) return;

    if (msg.type === "hello") {
      if (entry.state) return; // 인사는 한 번만
      if (this.seed === null) {
        this.seed = msg.seed;
        void this.persist();
      }
      entry.state = { name: msg.name, color: msg.color, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch };
      entry.order = this.nextOrder++;

      const players: RemotePlayer[] = [];
      for (const [socket, other] of this.sockets) {
        if (socket === sender || !other.state) continue;
        players.push({ id: other.id, ...other.state });
      }
      // 아직 호스트가 없으면 처음 인사한 사람이 호스트가 된다.
      if (!this.hostSocket) this.hostSocket = sender;
      send(sender, {
        type: "welcome",
        id: entry.id,
        seed: this.seed,
        edits: this.edits.toArray(),
        players,
        hostId: this.hostId(),
        containers: [...this.containers.entries()],
      });
      this.broadcast(
        { type: "join", player: { id: entry.id, name: msg.name, color: msg.color, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch } },
        sender,
      );
      return;
    }

    // 인사하기 전 접속은 아래 메시지들을 보낼 수 없다.
    if (!entry.state) return;

    if (msg.type === "move") {
      entry.state = { ...entry.state, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch };
      this.broadcast({ type: "move", id: entry.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch }, sender);
      return;
    }

    if (msg.type === "edit") {
      this.edits.record(msg.x, msg.y, msg.z, msg.block);
      void this.persist();
      this.broadcast({ type: "edit", x: msg.x, y: msg.y, z: msg.z, block: msg.block }, sender);
      return;
    }

    if (msg.type === "chat") {
      const now = Date.now();
      if (now - entry.lastChat < CHAT_GAP_MS) return; // 도배 방지
      entry.lastChat = now;
      this.broadcast({ type: "chat", id: entry.id, name: entry.state.name, text: msg.text }, sender);
      return;
    }

    if (msg.type === "snapshot") {
      if (sender !== this.hostSocket) return; // 호스트만 동물·아이템을 알릴 수 있다
      this.broadcast({ type: "snapshot", t: msg.t, mobs: msg.mobs, drops: msg.drops, arrows: msg.arrows }, sender);
      return;
    }

    if (msg.type === "fx") {
      if (sender !== this.hostSocket) return;
      this.broadcast({ type: "fx", kind: msg.kind, x: msg.x, y: msg.y, z: msg.z }, sender);
      return;
    }

    if (msg.type === "toHost") {
      if (!this.hostSocket || sender === this.hostSocket) return;
      send(this.hostSocket, { type: "toHost", from: entry.id, data: msg.data });
      return;
    }

    if (msg.type === "toPlayer") {
      if (sender !== this.hostSocket) return;
      for (const [socket, other] of this.sockets) {
        if (other.id === msg.to && other.state) send(socket, { type: "fromHost", data: msg.data });
      }
      return;
    }

    if (msg.type === "container") {
      if (msg.key.length > MAX_CONTAINER_KEY) return;
      if (msg.data === null) this.containers.delete(msg.key);
      else if (this.containers.has(msg.key) || this.containers.size < MAX_CONTAINERS) this.containers.set(msg.key, msg.data);
      else return;
      void this.persistContainers();
      this.broadcast({ type: "container", key: msg.key, data: msg.data }, sender);
      return;
    }
  }

  private onClose(socket: WebSocket): void {
    const entry = this.sockets.get(socket);
    this.sockets.delete(socket);
    if (socket === this.hostSocket) this.hostSocket = null;
    // hello를 보내기 전에 닫힌 접속(방이 꽉 차서 거절된 경우 등)은 애초에 알린 적이 없으니 굳이 알리지 않는다.
    if (entry?.state) {
      this.broadcast({ type: "leave", id: entry.id });
      this.electHost();
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // partysocket 클라이언트가 만드는 주소 모양: /parties/{party}/{room}
    const match = new URL(request.url).pathname.match(/^\/parties\/[^/]+\/([^/]+)\/?$/);
    if (!match) return new Response("Not found", { status: 404 });
    const room = decodeURIComponent(match[1]);
    const id = env.VOXEL_ROOM.idFromName(room);
    return env.VOXEL_ROOM.get(id).fetch(request);
  },
};
