import * as THREE from "three";
import { Mob, MobKind } from "./mobs";

interface MobLook {
  body: number;
  head: number;
  leg: number;
  bodySize: [number, number, number];
  headSize: [number, number, number];
  legHeight: number;
}

const LOOKS: Record<MobKind, MobLook> = {
  pig: { body: 0xf2a6a6, head: 0xf5b8b8, leg: 0xe08f8f, bodySize: [0.6, 0.45, 0.9], headSize: [0.4, 0.38, 0.36], legHeight: 0.3 },
  sheep: { body: 0xf2f2ee, head: 0x6b5f57, leg: 0x6b5f57, bodySize: [0.7, 0.55, 0.95], headSize: [0.36, 0.36, 0.34], legHeight: 0.38 },
};

interface MobModel {
  group: THREE.Group;
  legs: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[];
}

function box(size: [number, number, number], color: number, materials: THREE.MeshBasicMaterial[]): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color });
  materials.push(material);
  return new THREE.Mesh(new THREE.BoxGeometry(...size), material);
}

/** 동물 하나를 상자 몸통, 머리, 다리 넷으로 만든다. 앞쪽이 -Z 방향이다. */
function buildModel(kind: MobKind): MobModel {
  const look = LOOKS[kind];
  const materials: THREE.MeshBasicMaterial[] = [];
  const group = new THREE.Group();

  const [bw, bh, bd] = look.bodySize;
  const body = box(look.bodySize, look.body, materials);
  body.position.set(0, look.legHeight + bh / 2, 0);
  group.add(body);

  const [hw, hh, hd] = look.headSize;
  const head = box(look.headSize, look.head, materials);
  head.position.set(0, look.legHeight + bh - hh / 2 + 0.05, -(bd / 2 + hd / 2 - 0.05));
  group.add(head);

  const legs: THREE.Mesh[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box([0.16, look.legHeight, 0.16], look.leg, materials);
    leg.geometry.translate(0, -look.legHeight / 2, 0);
    leg.position.set(sx * (bw / 2 - 0.12), look.legHeight, sz * (bd / 2 - 0.14));
    group.add(leg);
    legs.push(leg);
  }
  void hw;
  return { group, legs, materials };
}

/** 동물 목록과 화면의 3D 모델을 맞춰 준다. */
export class MobRenderer {
  private readonly models = new Map<Mob, MobModel>();

  constructor(private readonly scene: THREE.Scene) {}

  /** shade는 낮/밤 밝기 색. 맞은 동물은 잠깐 붉게 깜빡인다. */
  update(mobs: Mob[], shade: THREE.Color): void {
    const alive = new Set(mobs);
    for (const [mob, model] of this.models) {
      if (!alive.has(mob)) {
        this.scene.remove(model.group);
        for (const material of model.materials) material.dispose();
        for (const child of model.group.children) (child as THREE.Mesh).geometry.dispose();
        this.models.delete(mob);
      }
    }

    for (const mob of mobs) {
      let model = this.models.get(mob);
      if (!model) {
        model = buildModel(mob.kind);
        this.models.set(mob, model);
        this.scene.add(model.group);
      }
      model.group.position.set(mob.x, mob.y, mob.z);
      model.group.rotation.y = mob.yaw;

      const swing = mob.moving ? Math.sin(mob.walkPhase * 2.2) * 0.6 : 0;
      model.legs.forEach((leg, i) => {
        leg.rotation.x = i === 0 || i === 3 ? swing : -swing;
      });

      const look = LOOKS[mob.kind];
      const colors = [look.body, look.head, look.leg, look.leg, look.leg, look.leg];
      model.materials.forEach((material, i) => {
        material.color.setHex(colors[i]).multiply(shade);
        if (mob.hurtTimer > 0) material.color.lerp(new THREE.Color(0xff3030), 0.55);
      });
    }
  }
}
