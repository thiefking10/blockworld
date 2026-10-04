import { PartySocket } from "partysocket";
import { ArrowSnap, ClientMessage, DropSnap, EditTuple, HostReply, HostRequest, MobSnap, parseServerMessage, RemotePlayer } from "./protocol";

/** 서버 접속 하나에서 벌어지는 일들을 main.ts에 알려 준다. */
export interface NetCallbacks {
  /** 접속하자마자 한 번: 이 방의 시드, 지금까지 바뀐 블록, 이미 있던 사람들. */
  onWelcome(seed: number, edits: EditTuple[], players: RemotePlayer[], hostId: string, containers: [string, string][]): void;
  onJoin(player: RemotePlayer): void;
  onMove(id: string, x: number, y: number, z: number, yaw: number, pitch: number): void;
  onEdit(x: number, y: number, z: number, block: number): void;
  onLeave(id: string): void;
  /** 방에 이미 사람이 꽉 차서 못 들어갔다. */
  onFull(): void;
  /** 연결이 끊겼다 (방에 들어간 적이 있으면). */
  onDisconnect(): void;
  /** 호스트가 바뀌었다 (내가 호스트가 됐을 수도 있다). */
  onHost?(hostId: string): void;
  onChat?(id: string, name: string, text: string): void;
  /** 호스트가 보낸 동물·떨어진 아이템·화살의 모습 (호스트가 아닌 사람이 받는다). */
  onSnapshot?(t: number, mobs: MobSnap[], drops: DropSnap[], arrows: ArrowSnap[]): void;
  onFx?(kind: "explosion", x: number, y: number, z: number): void;
  /** 다른 사람이 호스트에게 한 부탁 (호스트만 받는다). */
  onToHost?(from: string, data: HostRequest): void;
  /** 호스트가 나에게 알려 준 일 */
  onFromHost?(data: HostReply): void;
  /** 다른 사람이 상자·화로 내용을 바꿨다 (data가 null이면 치워졌다). */
  onContainer?(key: string, data: string | null): void;
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
  /** 지금 호스트인 사람의 id (동물·아이템을 움직이는 사람) */
  hostId = "";

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
        this.hostId = msg.hostId;
        this.welcomed = true;
        callbacks.onWelcome(msg.seed, msg.edits, msg.players, msg.hostId, msg.containers);
      } else if (msg.type === "join") callbacks.onJoin(msg.player);
      else if (msg.type === "move") callbacks.onMove(msg.id, msg.x, msg.y, msg.z, msg.yaw, msg.pitch);
      else if (msg.type === "edit") callbacks.onEdit(msg.x, msg.y, msg.z, msg.block);
      else if (msg.type === "leave") callbacks.onLeave(msg.id);
      else if (msg.type === "full") callbacks.onFull();
      else if (msg.type === "host") {
        this.hostId = msg.id;
        callbacks.onHost?.(msg.id);
      } else if (msg.type === "chat") callbacks.onChat?.(msg.id, msg.name, msg.text);
      else if (msg.type === "snapshot") callbacks.onSnapshot?.(msg.t, msg.mobs, msg.drops, msg.arrows);
      else if (msg.type === "fx") callbacks.onFx?.(msg.kind, msg.x, msg.y, msg.z);
      else if (msg.type === "toHost") callbacks.onToHost?.(msg.from, msg.data);
      else if (msg.type === "fromHost") callbacks.onFromHost?.(msg.data);
      else if (msg.type === "container") callbacks.onContainer?.(msg.key, msg.data);
    });
    socket.addEventListener("close", () => {
      if (this.welcomed) callbacks.onDisconnect();
    });
  }

  get connected(): boolean {
    return this.socket !== null && this.welcomed;
  }

  /** 내가 호스트인지 (혼자 하거나 연결이 없으면 늘 호스트처럼 게임을 직접 돌린다). */
  get isHost(): boolean {
    return !this.connected || this.hostId === this.myId;
  }

  sendMove(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.send({ type: "move", x, y, z, yaw, pitch });
  }

  sendEdit(x: number, y: number, z: number, block: number): void {
    this.send({ type: "edit", x, y, z, block });
  }

  sendChat(text: string): void {
    this.send({ type: "chat", text });
  }

  sendSnapshot(t: number, mobs: MobSnap[], drops: DropSnap[], arrows: ArrowSnap[]): void {
    this.send({ type: "snapshot", t, mobs, drops, arrows });
  }

  sendFx(kind: "explosion", x: number, y: number, z: number): void {
    this.send({ type: "fx", kind, x, y, z });
  }

  /** 호스트에게 부탁한다 (호스트가 아닐 때만 쓴다). */
  sendToHost(data: HostRequest): void {
    this.send({ type: "toHost", data });
  }

  /** 호스트가 한 사람에게 알려 준다. */
  sendToPlayer(to: string, data: HostReply): void {
    this.send({ type: "toPlayer", to, data });
  }

  sendContainer(key: string, data: string | null): void {
    this.send({ type: "container", key, data });
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
): Promise<{ seed: number; edits: EditTuple[]; players: RemotePlayer[]; hostId: string; containers: [string, string][] }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    net.connect(host, room, hello, {
      ...callbacks,
      onWelcome: (seed, edits, players, hostId, containers) => {
        window.clearTimeout(timer);
        resolve({ seed, edits, players, hostId, containers });
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
