import { PartySocket } from "partysocket";
import { ClientMessage, EditTuple, parseServerMessage, RemotePlayer } from "./protocol";

/** 서버 접속 하나에서 벌어지는 일들을 main.ts에 알려 준다. */
export interface NetCallbacks {
  /** 접속하자마자 한 번: 이 방의 시드, 지금까지 바뀐 블록, 이미 있던 사람들. */
  onWelcome(seed: number, edits: EditTuple[], players: RemotePlayer[]): void;
  onJoin(player: RemotePlayer): void;
  onMove(id: string, x: number, y: number, z: number, yaw: number, pitch: number): void;
  onEdit(x: number, y: number, z: number, block: number): void;
  onLeave(id: string): void;
  /** 방에 이미 사람이 꽉 차서 못 들어갔다. */
  onFull(): void;
  /** 연결이 끊겼다 (방에 들어간 적이 있으면). */
  onDisconnect(): void;
}

export interface HelloInfo {
  name: string;
  color: number;
  seed: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * 멀티플레이 서버 접속 하나. 네트워크 주고받기만 맡고, 받은 걸로 무엇을 할지는 main.ts가 정한다.
 * 재연결은 partysocket이 알아서 해 준다.
 */
export class NetClient {
  private socket: PartySocket | null = null;
  private welcomed = false;
  myId = "";

  connect(host: string, room: string, hello: HelloInfo, callbacks: NetCallbacks): void {
    this.disconnect();
    const socket = new PartySocket({ host, room });
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.send({ type: "hello", ...hello });
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      const msg = parseServerMessage(String(event.data));
      if (!msg) return;
      if (msg.type === "welcome") {
        this.myId = msg.id;
        this.welcomed = true;
        callbacks.onWelcome(msg.seed, msg.edits, msg.players);
      } else if (msg.type === "join") callbacks.onJoin(msg.player);
      else if (msg.type === "move") callbacks.onMove(msg.id, msg.x, msg.y, msg.z, msg.yaw, msg.pitch);
      else if (msg.type === "edit") callbacks.onEdit(msg.x, msg.y, msg.z, msg.block);
      else if (msg.type === "leave") callbacks.onLeave(msg.id);
      else if (msg.type === "full") callbacks.onFull();
    });
    socket.addEventListener("close", () => {
      if (this.welcomed) callbacks.onDisconnect();
    });
  }

  get connected(): boolean {
    return this.socket !== null && this.welcomed;
  }

  sendMove(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.send({ type: "move", x, y, z, yaw, pitch });
  }

  sendEdit(x: number, y: number, z: number, block: number): void {
    this.send({ type: "edit", x, y, z, block });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.welcomed = false;
  }

  private send(message: ClientMessage): void {
    if (!this.socket || (this.socket.readyState !== WebSocket.OPEN && message.type !== "hello")) return;
    this.socket.send(JSON.stringify(message));
  }
}

/** 접속 하나가 "welcome"을 받을 때까지만 기다리는 약속으로 감싼다 (방 만들기/들어가기 때 한 번 씀). */
export function connectAndWait(
  net: NetClient,
  host: string,
  room: string,
  hello: HelloInfo,
  callbacks: Omit<NetCallbacks, "onWelcome">,
  timeoutMs = 8000,
): Promise<{ seed: number; edits: EditTuple[]; players: RemotePlayer[] }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    net.connect(host, room, hello, {
      ...callbacks,
      onWelcome: (seed, edits, players) => {
        window.clearTimeout(timer);
        resolve({ seed, edits, players });
      },
      onFull: () => {
        window.clearTimeout(timer);
        reject(new Error("full"));
        callbacks.onFull();
      },
    });
  });
}

/** 방 코드로 쓸 짧고 발음하기 쉬운 글자를 만든다 (헷갈리는 0/O, 1/I는 뺐다). */
export function randomRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
