import type * as Party from "partykit/server";
import { MAX_PLAYERS, parseClientMessage, RemotePlayer, ServerMessage } from "../src/protocol";
import { EditLog, EditTuple } from "../src/save";

/** 접속마다 기억해 두는 정보 (partykit이 알아서 접속별로 보관해 준다). */
interface ConnState {
  name: string;
  color: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** 저장소(storage)에 넣어 두는, 방을 다시 열어도 남아 있어야 하는 것들. */
interface StoredWorld {
  seed: number;
  edits: EditTuple[];
}

function send(conn: Party.Connection, message: ServerMessage): void {
  conn.send(JSON.stringify(message));
}

function broadcast(room: Party.Room, message: ServerMessage, without?: string[]): void {
  room.broadcast(JSON.stringify(message), without);
}

/**
 * 블록 월드 방 하나. 같은 방 코드로 들어온 사람끼리 같은 시드로 시작하고,
 * 블록을 부수거나 놓으면 서로에게 알려 주고 저장소에 남긴다 (최대 MAX_PLAYERS명).
 */
export default class VoxelRoom implements Party.Server {
  seed: number | null = null;
  private readonly edits = new EditLog();

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    const stored = await this.room.storage.get<StoredWorld>("world");
    if (stored) {
      this.seed = stored.seed;
      this.edits.load(stored.edits);
    }
  }

  onConnect(connection: Party.Connection): void {
    const count = [...this.room.getConnections()].length;
    if (count > MAX_PLAYERS) {
      send(connection, { type: "full" });
      connection.close();
    }
  }

  onMessage(raw: string, sender: Party.Connection<ConnState>): void {
    const msg = parseClientMessage(raw);
    if (!msg) return;

    if (msg.type === "hello") {
      if (this.seed === null) {
        this.seed = msg.seed;
        void this.persist();
      }
      sender.setState({ name: msg.name, color: msg.color, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch });

      const players: RemotePlayer[] = [];
      for (const conn of this.room.getConnections<ConnState>()) {
        if (conn.id === sender.id || !conn.state) continue;
        players.push({ id: conn.id, ...conn.state });
      }
      send(sender, { type: "welcome", id: sender.id, seed: this.seed, edits: this.edits.toArray(), players });
      broadcast(this.room, { type: "join", player: { id: sender.id, name: msg.name, color: msg.color, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch } }, [sender.id]);
      return;
    }

    if (msg.type === "move") {
      if (sender.state) sender.setState({ ...sender.state, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch });
      broadcast(this.room, { type: "move", id: sender.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch }, [sender.id]);
      return;
    }

    if (msg.type === "edit") {
      this.edits.record(msg.x, msg.y, msg.z, msg.block);
      void this.persist();
      broadcast(this.room, { type: "edit", x: msg.x, y: msg.y, z: msg.z, block: msg.block }, [sender.id]);
      return;
    }
  }

  onClose(connection: Party.Connection<ConnState>): void {
    // hello를 보내기 전에 닫힌 접속(방이 꽉 차서 거절된 경우 등)은 애초에 알린 적이 없으니 굳이 알리지 않는다.
    if (!connection.state) return;
    broadcast(this.room, { type: "leave", id: connection.id }, [connection.id]);
  }

  private async persist(): Promise<void> {
    if (this.seed === null) return;
    await this.room.storage.put<StoredWorld>("world", { seed: this.seed, edits: this.edits.toArray() });
  }
}
