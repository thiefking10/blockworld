import * as THREE from "three";
import { Controls } from "./controls";
import { buildMesh } from "./mesher";
import { EYE_HEIGHT, Player } from "./player";
import { lookDirection, raycast, RayHit } from "./raycast";
import { Block, BlockId, SIZE_X, SIZE_Z, World } from "./world";

const REACH = 5;

const HOTBAR: { block: BlockId; name: string; color: string }[] = [
  { block: Block.Grass, name: "잔디", color: "#5ba138" },
  { block: Block.Dirt, name: "흙", color: "#785434" },
  { block: Block.Stone, name: "돌", color: "#808085" },
  { block: Block.Sand, name: "모래", color: "#dbcc8c" },
];

const canvas = document.getElementById("game") as HTMLCanvasElement;
const fpsLabel = document.getElementById("fps") as HTMLElement;
const hotbarElement = document.getElementById("hotbar") as HTMLElement;

const seedParam = new URLSearchParams(window.location.search).get("seed");
const seed = seedParam ? Number(seedParam) || 1 : Math.floor(Math.random() * 100000);

const world = new World();
world.generate(seed);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const sky = new THREE.Color(0x87ceeb);
const scene = new THREE.Scene();
scene.background = sky;
scene.fog = new THREE.Fog(sky, 30, 70);

let worldMesh = buildMesh(world);
scene.add(worldMesh);

/** 블록이 바뀌면 지형 메쉬를 다시 만든다. */
function rebuildWorldMesh(): void {
  scene.remove(worldMesh);
  worldMesh.geometry.dispose();
  worldMesh = buildMesh(world);
  scene.add(worldMesh);
}

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0xffffff }),
);
outline.visible = false;
scene.add(outline);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 120);
camera.rotation.order = "YXZ";

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const player = new Player(world);
player.x = SIZE_X / 2;
player.z = SIZE_Z / 2;
player.y = world.surfaceHeight(Math.floor(player.x), Math.floor(player.z)) + 1;

let selectedSlot = 0;
const slotElements = HOTBAR.map((slot, index) => {
  const element = document.createElement("div");
  element.className = "slot";
  element.style.background = slot.color;
  element.textContent = slot.name;
  element.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    selectSlot(index);
  });
  hotbarElement.appendChild(element);
  return element;
});

function selectSlot(index: number): void {
  if (index < 0 || index >= HOTBAR.length) return;
  selectedSlot = index;
  slotElements.forEach((element, i) => element.classList.toggle("selected", i === index));
}
selectSlot(0);

function currentTarget(): RayHit | null {
  const [dx, dy, dz] = lookDirection(player.yaw, player.pitch);
  return raycast(world, player.x, player.y + EYE_HEIGHT, player.z, dx, dy, dz, REACH);
}

function breakBlock(): void {
  const hit = currentTarget();
  if (!hit || hit.y === 0) return;
  world.set(hit.x, hit.y, hit.z, Block.Air);
  rebuildWorldMesh();
}

function placeBlock(): void {
  const hit = currentTarget();
  if (!hit) return;
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz) || world.get(px, py, pz) !== Block.Air) return;
  if (player.intersectsBlock(px, py, pz)) return;
  world.set(px, py, pz, HOTBAR[selectedSlot].block);
  rebuildWorldMesh();
}

const controls = new Controls(canvas);
controls.onBreak = breakBlock;
controls.onPlace = placeBlock;
controls.onSelectSlot = selectSlot;

let last = performance.now();
let frames = 0;
let fpsTimer = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const look = controls.consumeLook();
  player.yaw += look.yaw;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + look.pitch));
  player.update(dt, controls.currentInput());

  camera.position.set(player.x, player.y + EYE_HEIGHT, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  const target = currentTarget();
  outline.visible = target !== null;
  if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsLabel.textContent = `${Math.round(frames / fpsTimer)} FPS · seed ${seed}`;
    frames = 0;
    fpsTimer = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
