import * as THREE from "three";

export interface RemotePlayerView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  color: number;
  name: string;
}

interface AvatarModel {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  label: THREE.Sprite;
}

/** 이름표 그림(캔버스에 글자를 그려 만든 작은 그림)을 3D 위에 늘 화면 쪽을 보게 띄운다. */
function makeNameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function buildAvatar(color: number, name: string): AvatarModel {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.3), new THREE.MeshBasicMaterial({ color }));
  body.position.y = 0.9;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xf0c8a0 }));
  head.position.y = 1.6;
  group.add(head);
  const label = makeNameSprite(name);
  label.position.y = 2.1;
  group.add(label);
  return { group, body, head, label };
}

/** 다른 사람들의 아바타(몸통 상자 + 이름표)를 화면에 그려 준다. */
export class PlayerAvatarRenderer {
  private readonly avatars = new Map<string, AvatarModel>();

  constructor(private readonly scene: THREE.Scene) {}

  /** 새 사람이면 만들고, 있던 사람이면 자리와 방향만 옮긴다. */
  upsert(id: string, view: RemotePlayerView): void {
    let avatar = this.avatars.get(id);
    if (!avatar) {
      avatar = buildAvatar(view.color, view.name);
      this.avatars.set(id, avatar);
      this.scene.add(avatar.group);
    }
    avatar.group.position.set(view.x, view.y, view.z);
    avatar.group.rotation.y = view.yaw;
  }

  remove(id: string): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    this.scene.remove(avatar.group);
    avatar.body.geometry.dispose();
    (avatar.body.material as THREE.Material).dispose();
    avatar.head.geometry.dispose();
    (avatar.head.material as THREE.Material).dispose();
    const labelMaterial = avatar.label.material as THREE.SpriteMaterial;
    labelMaterial.map?.dispose();
    labelMaterial.dispose();
    this.avatars.delete(id);
  }

  /** 방을 나갈 때 다 같이 치운다. */
  clear(): void {
    for (const id of [...this.avatars.keys()]) this.remove(id);
  }

  get count(): number {
    return this.avatars.size;
  }
}
