import * as THREE from "three";
import { Controls } from "./controls";
import { ChunkedWorldMesh } from "./chunks";
import { EYE_HEIGHT, Player } from "./player";
import { lookDirection, raycast, RayHit } from "./raycast";
import { Block, BlockId, SIZE_X, SIZE_Z, World } from "./world";

const REACH = 5;

const HOTBAR: { block: BlockId; name: string; color: string }[] = [
  { block: Block.Grass, name: "잔디", color: "#5ba138" },
  { block: Block.Dirt, name: "흙", color: "#785434" },
  { block: Block.Stone, name: "돌", color: "#808085" },
  { block: Block.Sand, name: "모래", color: "#dbcc8c" },
  { block: Block.Wood, name: "나무", color: "#6b4724" },
  { block: Block.Leaves, name: "잎", color: "#33802a" },
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

const worldMesh = new ChunkedWorldMesh(world);
scene.add(worldMesh.group);

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

/** 월드 가운데에서 가장 가까운, 잔디가 맨 위인 자리(나무 위가 아닌 곳)를 찾는다. */
function findSpawn(): [number, number] {
  const cx = SIZE_X / 2;
  const cz = SIZE_Z / 2;
  for (let r = 0; r < 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        if (world.get(x, world.surfaceHeight(x, z) - 1, z) === Block.Grass) return [x, z];
      }
    }
  }
  return [cx, cz];
}

const player = new Player(world);
const [spawnX, spawnZ] = findSpawn();
player.x = spawnX + 0.5;
player.z = spawnZ + 0.5;
player.y = world.surfaceHeight(spawnX, spawnZ) + 0.01;

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
  worldMesh.updateBlock(hit.x, hit.z);
}

function placeBlock(): void {
  const hit = currentTarget();
  if (!hit) return;
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz) || world.get(px, py, pz) !== Block.Air) return;
  if (player.intersectsBlock(px, py, pz)) return;
  world.set(px, py, pz, HOTBAR[selectedSlot].block);
  worldMesh.updateBlock(px, pz);
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
