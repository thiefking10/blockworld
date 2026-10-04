import * as THREE from "three";
import { tileForFace, tileIconDataUrl } from "./atlas";
import { isPlaceableBlock } from "./blocks";
import { Item } from "./items";
import { TOOL_BY_ID, type ToolType } from "./tools";

/** 재질(나무/돌/철/다이아몬드)별 도구 색. tools.ts의 TIER_NAMES 순서와 같다. */
const TIER_COLORS = [0xb08968, 0x9e9e9e, 0xe8e8e8, 0x7de3e3];
const SKIN_COLOR = 0xe0a978;

const tileTextureCache = new Map<number, THREE.Texture>();

/** 블록 무늬 한 칸을 3D에 쓸 수 있는 텍스처로 바꾼다 (한 번 만들면 재사용). */
function tileTexture(tile: number): THREE.Texture {
  let texture = tileTextureCache.get(tile);
  if (texture) return texture;
  const image = new Image();
  image.src = tileIconDataUrl(tile);
  texture = new THREE.Texture(image);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  image.onload = () => {
    texture!.needsUpdate = true;
  };
  tileTextureCache.set(tile, texture);
  return texture;
}

function disposeMesh(mesh: THREE.Object3D): void {
  for (const child of [...mesh.children]) disposeMesh(child);
  if (mesh instanceof THREE.Mesh) {
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.dispose();
    }
  }
}

/** 화면 위에 늘 그려지도록(벽에 파묻히지 않게) 재질을 손본다. */
function viewModelMaterial(map?: THREE.Texture, color?: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ map, color, transparent: true, alphaTest: 0.5, depthTest: false });
  return material;
}

function box(size: [number, number, number], color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), viewModelMaterial(undefined, color));
  mesh.renderOrder = 999;
  return mesh;
}

/** 블록 하나를 손에 든 것처럼 작은 상자로 만들고, 실제 블록과 같은 무늬를 입힌다. */
function buildBlockItem(block: number): THREE.Mesh {
  const side = viewModelMaterial(tileTexture(tileForFace(block, 0)));
  const top = viewModelMaterial(tileTexture(tileForFace(block, 1)));
  const bottom = viewModelMaterial(tileTexture(tileForFace(block, -1)));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), [side, side, top, bottom, side, side]);
  mesh.renderOrder = 999;
  return mesh;
}

/** 도구/검 종류마다 다르게 생긴 작은 모형을 만든다 (손잡이 + 머리). */
function buildToolItem(type: ToolType, color: number): THREE.Group {
  const group = new THREE.Group();
  const handle = box([0.05, 0.32, 0.05], 0x7a5230);
  handle.position.set(0, -0.06, 0);
  group.add(handle);

  if (type === "sword") {
    const blade = box([0.06, 0.4, 0.03], color);
    blade.position.set(0, 0.22, 0);
    group.add(blade);
    const guard = box([0.2, 0.04, 0.04], 0x8a8a8a);
    guard.position.set(0, 0.02, 0);
    group.add(guard);
  } else if (type === "pickaxe") {
    const head = box([0.34, 0.07, 0.06], color);
    head.position.set(0, 0.16, 0);
    head.rotation.z = 0.15;
    group.add(head);
  } else if (type === "axe") {
    const head = box([0.05, 0.22, 0.16], color);
    head.position.set(0.08, 0.14, 0);
    group.add(head);
  } else {
    // 삽: 날이 좁고 납작하다.
    const head = box([0.14, 0.18, 0.03], color);
    head.position.set(0, 0.2, 0);
    group.add(head);
  }
  return group;
}

/** 활은 굽은 나무 두 조각 + 시위로 단순하게 표현한다. */
function buildBowItem(): THREE.Group {
  const group = new THREE.Group();
  const upper = box([0.05, 0.26, 0.05], 0x8a6a3a);
  upper.position.set(0, 0.13, 0);
  upper.rotation.z = 0.3;
  group.add(upper);
  const lower = box([0.05, 0.26, 0.05], 0x8a6a3a);
  lower.position.set(0, -0.13, 0);
  lower.rotation.z = -0.3;
  group.add(lower);
  const string = box([0.01, 0.5, 0.01], 0xe8e2d0);
  string.position.set(0.14, 0, 0);
  group.add(string);
  return group;
}

/** 낚싯대: 긴 막대 끝에 늘어진 줄 */
function buildRodItem(): THREE.Group {
  const group = new THREE.Group();
  const rod = box([0.04, 0.6, 0.04], 0x8a6a3a);
  rod.position.set(0, 0.1, 0);
  rod.rotation.z = -0.35;
  group.add(rod);
  const line = box([0.01, 0.3, 0.01], 0xe8e2d0);
  line.position.set(0.19, 0.18, 0);
  group.add(line);
  return group;
}

/** 도구·활도 아닌 다른 아이템(재료·방어구·음식 등)은 작은 상자로 뭉뚱그려 보여준다. */
function buildGenericItem(): THREE.Mesh {
  return box([0.22, 0.22, 0.22], 0xc9b27a);
}

/** 지금 손에 든 것에 맞는 3D 모형을 만든다. id가 0이면 아무것도 없다(맨손). */
function buildItemModel(id: number): THREE.Object3D | null {
  if (id === 0) return null;
  if (isPlaceableBlock(id)) return buildBlockItem(id);
  if (id === Item.Bow) return buildBowItem();
  if (id === Item.FishingRod) return buildRodItem();
  const tool = TOOL_BY_ID.get(id);
  if (tool) return buildToolItem(tool.type, TIER_COLORS[tool.tier]);
  return buildGenericItem();
}

/**
 * 1인칭 화면 오른쪽 아래에 팔과 손에 든 것을 그린다.
 * 카메라의 자식으로 붙여서, 플레이어가 어디를 보든 항상 같은 자리에 보인다.
 */
export class HeldHandRenderer {
  private readonly root = new THREE.Group();
  private readonly arm: THREE.Mesh;
  private readonly itemSlot = new THREE.Group();
  private currentId: number | null = null;
  private swingT = 0;
  private bobPhase = 0;

  constructor(camera: THREE.Camera) {
    this.arm = box([0.16, 0.16, 0.5], SKIN_COLOR);
    this.arm.position.set(0, 0, -0.1);
    this.root.add(this.arm);
    this.itemSlot.position.set(0, 0.1, -0.4);
    this.root.add(this.itemSlot);
    this.root.position.set(0.42, -0.4, -0.55);
    this.root.rotation.set(-0.1, 0.35, -0.2);
    camera.add(this.root);
  }

  /** 손에 든 게 바뀌었을 때만 모형을 새로 만든다 (매번 다시 만들지 않는다). */
  setItem(id: number): void {
    if (id === this.currentId) return;
    this.currentId = id;
    while (this.itemSlot.children.length > 0) {
      const child = this.itemSlot.children[0];
      this.itemSlot.remove(child);
      disposeMesh(child);
    }
    const model = buildItemModel(id);
    if (model) this.itemSlot.add(model);
    this.root.visible = true;
  }

  /** 캐거나 때리거나 쏠 때 한 번 휘두르게 한다. */
  swing(): void {
    this.swingT = 1;
  }

  /** 매 프레임: 걸을 때 살짝 흔들리고, 휘두른 직후에는 앞으로 내밀었다 돌아온다. */
  update(dt: number, moving: boolean): void {
    this.swingT = Math.max(0, this.swingT - dt * 6);
    this.bobPhase += moving ? dt * 9 : 0;
    const bobY = moving ? Math.sin(this.bobPhase) * 0.015 : 0;
    const bobX = moving ? Math.sin(this.bobPhase * 0.5) * 0.01 : 0;
    const swing = Math.sin(Math.min(1, this.swingT) * Math.PI);
    this.root.position.set(0.42 + bobX, -0.4 + bobY + swing * 0.05, -0.55 + swing * 0.12);
    this.root.rotation.set(-0.1 - swing * 0.5, 0.35, -0.2 - swing * 0.35);
  }
}
