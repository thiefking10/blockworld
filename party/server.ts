/**
 * 블록 월드 멀티플레이 서버. Cloudflare Workers + Durable Objects 위에서 직접 돈다
 * (wrangler로 배포). 방 하나 = Durable Object 하나. 같은 방 코드로 들어온 사람끼리
 * 같은 시드로 시작하고, 블록을 부수거나 놓으면 서로에게 알려 주고 저장소에 남긴다.
 *
 * 클라이언트(src/net.ts, partysocket)는 `/parties/main/방코드` 주소로 접속하므로,
 * 아래 default export(Worker)가 그 경로를 보고 알맞은 방(Durable Object)으로 이어 준다.
 */
import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS, parseClientMessage, RemotePlayer, ServerMessage } from "../src/protocol";
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
  private readonly sockets = new Map<WebSocket, { id: string; state: ConnState | null }>();
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const stored = await this.ctx.storage.get<StoredWorld>("world");
    if (stored) {
      this.seed = stored.seed;
      this.edits.load(stored.edits);
    }
  }

  private async persist(): Promise<void> {
    if (this.seed === null) return;
    await this.ctx.storage.put<StoredWorld>("world", { seed: this.seed, edits: this.edits.toArray() });
  }

  private broadcast(message: ServerMessage, exceptSocket?: WebSocket): void {
    for (const socket of this.sockets.keys()) {
      if (socket !== exceptSocket) send(socket, message);
    }
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
    this.sockets.set(server, { id, state: null });
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
    const msg = parseClientMessage(raw);
    if (!msg) return;

    if (msg.type === "hello") {
      if (this.seed === null) {
        this.seed = msg.seed;
        void this.persist();
      }
      entry.state = { name: msg.name, color: msg.color, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch };

      const players: RemotePlayer[] = [];
      for (const [socket, other] of this.sockets) {
        if (socket === sender || !other.state) continue;
        players.push({ id: other.id, ...other.state });
      }
      send(sender, { type: "welcome", id: entry.id, seed: this.seed, edits: this.edits.toArray(), players });
      this.broadcast(
        { type: "join", player: { id: entry.id, name: msg.name, color: msg.color, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch } },
        sender,
      );
      return;
    }

    if (msg.type === "move") {
      if (entry.state) entry.state = { ...entry.state, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch };
      this.broadcast({ type: "move", id: entry.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch }, sender);
      return;
    }

    if (msg.type === "edit") {
      this.edits.record(msg.x, msg.y, msg.z, msg.block);
      void this.persist();
      this.broadcast({ type: "edit", x: msg.x, y: msg.y, z: msg.z, block: msg.block }, sender);
      return;
    }
  }

  private onClose(socket: WebSocket): void {
    const entry = this.sockets.get(socket);
    this.sockets.delete(socket);
    // hello를 보내기 전에 닫힌 접속(방이 꽉 차서 거절된 경우 등)은 애초에 알린 적이 없으니 굳이 알리지 않는다.
    if (entry?.state) this.broadcast({ type: "leave", id: entry.id });
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
