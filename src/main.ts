import * as THREE from "three";
import { Controls } from "./controls";
import { ambientColor, DAY_LENGTH_SECONDS, daylight, phaseFromSeconds, skyColor } from "./daycycle";
import { solidMaterial, waterMaterial } from "./mesher";
import { ChunkedWorldMesh } from "./chunks";
import { EYE_HEIGHT, Player } from "./player";
import { lookDirection, raycast, RayHit } from "./raycast";
import { decodeSave, EditLog, encodeSave, SaveData } from "./save";
import { Block, BlockId, SIZE_X, SIZE_Z, World, isPassable } from "./world";

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

const LAST_SEED_KEY = "voxelgame:last-seed";
const saveKey = (worldSeed: number): string => `voxelgame:save:${worldSeed}`;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)에서는 저장 없이 그냥 계속한다.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 위와 같다.
  }
}

const seedParam = new URLSearchParams(window.location.search).get("seed");
const lastSeed = Number(readStorage(LAST_SEED_KEY));
const seed = seedParam ? Number(seedParam) || 1 : lastSeed > 0 ? lastSeed : Math.floor(Math.random() * 100000) + 1;
writeStorage(LAST_SEED_KEY, String(seed));

const saved = decodeSave(readStorage(saveKey(seed)));

const world = new World();
world.generate(seed);

const editLog = new EditLog();
if (saved && saved.seed === seed) {
  editLog.load(saved.edits);
  for (const [x, y, z, block] of saved.edits) world.set(x, y, z, block as BlockId);
}

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
if (saved && saved.seed === seed) {
  player.x = saved.player.x;
  player.y = saved.player.y;
  player.z = saved.player.z;
  player.yaw = saved.player.yaw;
  player.pitch = saved.player.pitch;
}

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
  editLog.record(hit.x, hit.y, hit.z, Block.Air);
  worldMesh.updateBlock(hit.x, hit.z);
  scheduleSave();
}

function placeBlock(): void {
  const hit = currentTarget();
  if (!hit) return;
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz) || !isPassable(world.get(px, py, pz))) return;
  if (player.intersectsBlock(px, py, pz)) return;
  world.set(px, py, pz, HOTBAR[selectedSlot].block);
  editLog.record(px, py, pz, HOTBAR[selectedSlot].block);
  worldMesh.updateBlock(px, pz);
  scheduleSave();
}

let resetting = false;
let saveTimer: number | undefined;

function saveNow(): void {
  if (resetting) return;
  const data: SaveData = {
    version: 1,
    seed,
    edits: editLog.toArray(),
    player: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch },
    time: worldSeconds,
  };
  writeStorage(saveKey(seed), encodeSave(data));
}

/** 블록을 바꾼 뒤 1초 안에 또 바꾸면 모아서 한 번만 저장한다. */
function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, 1000);
}

window.addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveNow();
});
window.setInterval(saveNow, 5000);

document.getElementById("new-world-button")?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  if (!window.confirm("지금 월드를 지우고 새로 시작할까요?")) return;
  resetting = true;
  removeStorage(saveKey(seed));
  removeStorage(LAST_SEED_KEY);
  window.location.href = window.location.pathname;
});

const controls = new Controls(canvas);
controls.onBreak = breakBlock;
controls.onPlace = placeBlock;
controls.onSelectSlot = selectSlot;

const fog = scene.fog as THREE.Fog;
const underwaterColor = new THREE.Color(0x1a4f8f);
const underwaterTinted = new THREE.Color();

/** 눈이 물속에 있으면 시야를 파랗고 짧게 만든다. 밤에는 물속도 어둡다. */
function applyUnderwaterLook(underwater: boolean): void {
  if (underwater) {
    underwaterTinted.copy(underwaterColor).multiplyScalar(0.25 + 0.75 * dayFactor);
    fog.color.copy(underwaterTinted);
    fog.near = 0.5;
    fog.far = 16;
    scene.background = underwaterTinted;
  } else {
    fog.color.copy(sky);
    fog.near = 30;
    fog.far = 70;
    scene.background = sky;
  }
}

// 낮/밤. 주소에 ?time=0.5 (0~1, 0.5가 한낮)를 붙이면 그 시각으로 멈춘다 (확인용).
const timeParam = new URLSearchParams(window.location.search).get("time");
const freezeTime = timeParam !== null && Number.isFinite(Number(timeParam));
let worldSeconds = freezeTime
  ? Number(timeParam) * DAY_LENGTH_SECONDS
  : saved && saved.seed === seed && saved.time !== undefined
    ? saved.time
    : 0.3 * DAY_LENGTH_SECONDS;
let dayFactor = 1;

function makeDisc(color: number, size: number): THREE.Mesh {
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false }),
  );
  scene.add(disc);
  return disc;
}
const sun = makeDisc(0xfff2b0, 16);
const moon = makeDisc(0xdfe6f5, 11);

function updateEnvironment(): void {
  const phase = phaseFromSeconds(worldSeconds);
  const [sr, sg, sb] = skyColor(phase);
  sky.setRGB(sr, sg, sb);
  const [ar, ag, ab] = ambientColor(phase);
  solidMaterial.color.setRGB(ar, ag, ab);
  waterMaterial.color.setRGB(ar, ag, ab);
  dayFactor = daylight(phase);

  const angle = phase * Math.PI * 2;
  const direction = new THREE.Vector3(Math.sin(angle), -Math.cos(angle), 0.3).normalize().multiplyScalar(85);
  sun.position.copy(camera.position).add(direction);
  moon.position.copy(camera.position).sub(direction);
  sun.lookAt(camera.position);
  moon.lookAt(camera.position);
}

// 개발용: 주소에 ?debug 를 붙이면 콘솔에서 __vox 로 월드와 플레이어를 만질 수 있다.
if (new URLSearchParams(window.location.search).has("debug")) {
  (window as unknown as { __vox: unknown }).__vox = { world, player, camera, scene };
}

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

  if (!freezeTime) worldSeconds += dt;
  updateEnvironment();
  applyUnderwaterLook(world.get(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === Block.Water);

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
