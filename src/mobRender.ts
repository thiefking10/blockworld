import * as THREE from "three";
import { Mob, MobKind } from "./mobs";

interface MobLook {
  body: number;
  head: number;
  leg: number;
  bodySize: [number, number, number];
  headSize: [number, number, number];
  legHeight: number;
  /** 사람처럼 서 있는 모양 (좀비). 아니면 네발 동물. */
  upright?: boolean;
}

const LOOKS: Record<MobKind, MobLook> = {
  pig: { body: 0xf2a6a6, head: 0xf5b8b8, leg: 0xe08f8f, bodySize: [0.6, 0.45, 0.9], headSize: [0.4, 0.38, 0.36], legHeight: 0.3 },
  sheep: { body: 0xf2f2ee, head: 0x6b5f57, leg: 0x6b5f57, bodySize: [0.7, 0.55, 0.95], headSize: [0.36, 0.36, 0.34], legHeight: 0.38 },
  zombie: { body: 0x3a8f7a, head: 0x6fb36a, leg: 0x2c3f8c, bodySize: [0.55, 0.75, 0.3], headSize: [0.45, 0.45, 0.45], legHeight: 0.7, upright: true },
};

interface MobModel {
  group: THREE.Group;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[];
  colors: number[];
}

function box(size: [number, number, number], color: number, model: MobModel): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color });
  model.materials.push(material);
  model.colors.push(color);
  return new THREE.Mesh(new THREE.BoxGeometry(...size), material);
}

/** 동물 하나를 상자 몸통, 머리, 다리로 만든다. 앞쪽이 -Z 방향이다. */
function buildModel(kind: MobKind): MobModel {
  const look = LOOKS[kind];
  const model: MobModel = { group: new THREE.Group(), legs: [], arms: [], materials: [], colors: [] };
  const { group } = model;

  const [bw, bh, bd] = look.bodySize;
  const body = box(look.bodySize, look.body, model);
  body.position.set(0, look.legHeight + bh / 2, 0);
  group.add(body);

  const [, hh, hd] = look.headSize;
  const head = box(look.headSize, look.head, model);
  if (look.upright) head.position.set(0, look.legHeight + bh + hh / 2, 0);
  else head.position.set(0, look.legHeight + bh - hh / 2 + 0.05, -(bd / 2 + hd / 2 - 0.05));
  group.add(head);

  const legSpots: [number, number][] = look.upright
    ? [[-1, 0], [1, 0]]
    : [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of legSpots) {
    const legWidth = look.upright ? 0.24 : 0.16;
    const leg = box([legWidth, look.legHeight, legWidth], look.leg, model);
    leg.geometry.translate(0, -look.legHeight / 2, 0);
    leg.position.set(sx * (look.upright ? bw / 4 : bw / 2 - 0.12), look.legHeight, sz * (bd / 2 - 0.14));
    group.add(leg);
    model.legs.push(leg);
  }

  if (look.upright) {
    // 좀비는 두 팔을 앞으로 뻗는다.
    for (const sx of [-1, 1]) {
      const arm = box([0.2, 0.2, 0.7], look.head, model);
      arm.geometry.translate(0, 0, -0.35);
      arm.position.set(sx * (bw / 2 + 0.1), look.legHeight + bh - 0.12, 0);
      group.add(arm);
      model.arms.push(arm);
    }
  }
  return model;
}

const hurtColor = new THREE.Color(0xff3030);

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

      model.materials.forEach((material, i) => {
        material.color.setHex(model.colors[i]).multiply(shade);
        if (mob.hurtTimer > 0) material.color.lerp(hurtColor, 0.55);
      });
    }
  }
}
