import * as THREE from "three";
import type { Projectile } from "./projectiles";

/** 화살 모양: +Z 쪽이 앞(화살촉), 뒤에는 깃. */
function buildArrow(color: number): THREE.Group {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.6), new THREE.MeshBasicMaterial({ color: 0x8a6a3a }));
  group.add(shaft);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), new THREE.MeshBasicMaterial({ color }));
  tip.position.set(0, 0, 0.34);
  group.add(tip);
  const feather = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.14), new THREE.MeshBasicMaterial({ color: 0xf0ece0 }));
  feather.position.set(0, 0, -0.27);
  group.add(feather);
  const feather2 = feather.clone();
  feather2.rotation.z = Math.PI / 2;
  group.add(feather2);
  return group;
}

/** 날아가는 화살과 박힌 화살을 화면에 그린다. */
export class ArrowRenderer {
  private readonly models = new Map<Projectile, THREE.Group>();

  constructor(private readonly scene: THREE.Scene) {}

  update(arrows: readonly Projectile[]): void {
    const alive = new Set(arrows);
    for (const [arrow, group] of this.models) {
      if (alive.has(arrow)) continue;
      this.scene.remove(group);
      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      this.models.delete(arrow);
    }
    for (const arrow of arrows) {
      let group = this.models.get(arrow);
      if (!group) {
        group = buildArrow(arrow.owner === "player" ? 0xcfcfd4 : 0x6a6a70);
        this.models.set(arrow, group);
        this.scene.add(group);
      }
      group.position.set(arrow.x, arrow.y, arrow.z);
      // 날아가는 중에는 속도 방향을 향하고, 박힌 뒤에는 마지막 방향을 그대로 둔다.
      if (!arrow.stuck) group.lookAt(arrow.x + arrow.vx, arrow.y + arrow.vy, arrow.z + arrow.vz);
    }
  }
}
