import * as THREE from "three";
import { tileForFace, tileUV } from "./atlas";
import type { ItemDrop } from "./drops";
import { solidMaterial } from "./mesher";
import { Item } from "./items";
import { TOOL_BY_ID } from "./tools";

/** 블록이 아닌 아이템의 모양 색 */
function itemColor(item: number): number {
  const tool = TOOL_BY_ID.get(item);
  if (tool) return [0xb98b4d, 0x8d8d92, 0xd8dde3][tool.tier];
  switch (item) {
    case Item.Meat:
      return 0xe8908f;
    case Item.CookedMeat:
      return 0xa0522d;
    case Item.Grain:
      return 0xe6c04a;
    case Item.Bread:
      return 0xd9a25a;
    case Item.Stick:
      return 0x8b5a2b;
    case Item.IronIngot:
      return 0xd0d4da;
    case Item.Bed:
      return 0xd94040;
    default:
      return 0xcccccc;
  }
}

const blockGeometries = new Map<number, THREE.BufferGeometry>();

/** 블록 모양 아이템: 작은 상자에 그 블록의 무늬를 붙인다. */
function blockGeometry(block: number): THREE.BufferGeometry {
  let geometry = blockGeometries.get(block);
  if (geometry) return geometry;
  geometry = new THREE.BoxGeometry(0.26, 0.26, 0.26);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  // 상자의 면 순서: +x, -x, +y, -y, +z, -z (한 면에 꼭짓점 4개)
  for (let face = 0; face < 6; face++) {
    const dirY = face === 2 ? 1 : face === 3 ? -1 : 0;
    const tile = tileForFace(block, dirY);
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      const [u, v] = tileUV(tile, uv.getX(index), uv.getY(index));
      uv.setXY(index, u, v);
    }
  }
  const colors = new Float32Array(geometry.getAttribute("position").count * 3).fill(1);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  blockGeometries.set(block, geometry);
  return geometry;
}

const flatGeometry = new THREE.BoxGeometry(0.28, 0.28, 0.07);

/** 바닥에 떨어진 아이템을 빙글빙글 도는 작은 물체로 그린다. */
export class DropRenderer {
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly itemMaterials = new Map<number, { material: THREE.MeshBasicMaterial; base: THREE.Color }>();

  constructor(private readonly scene: THREE.Scene) {}

  private materialFor(item: number): THREE.MeshBasicMaterial {
    let entry = this.itemMaterials.get(item);
    if (!entry) {
      const base = new THREE.Color(itemColor(item));
      entry = { material: new THREE.MeshBasicMaterial({ color: base }), base };
      this.itemMaterials.set(item, entry);
    }
    return entry.material;
  }

  /** shade는 낮/밤 밝기 색 */
  update(drops: ItemDrop[], seconds: number, shade: THREE.Color): void {
    const alive = new Set(drops.map((d) => d.id));
    for (const [id, mesh] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
    for (const entry of this.itemMaterials.values()) entry.material.color.copy(entry.base).multiply(shade);

    for (const drop of drops) {
      let mesh = this.meshes.get(drop.id);
      if (!mesh) {
        const isBlock = drop.item > 0 && drop.item < 100;
        mesh = isBlock ? new THREE.Mesh(blockGeometry(drop.item), solidMaterial) : new THREE.Mesh(flatGeometry, this.materialFor(drop.item));
        this.meshes.set(drop.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(drop.x, drop.y + 0.06 + Math.sin(seconds * 2.5 + drop.id) * 0.04, drop.z);
      mesh.rotation.y = seconds * 1.6 + drop.id;
    }
  }
}
