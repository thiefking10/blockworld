import * as THREE from "three";
import { iconTile, tileIconDataUrl } from "./atlas";
import { audio } from "./audio";
import { blockName, PLACEABLE_BLOCKS, sanitizeHotbar } from "./blocks";
import { FallTracker, Health, MAX_HEALTH } from "./health";
import { dropFor, Inventory, Item, ITEM_NAMES, MEAT_HEAL, mobDrop, RECIPES } from "./inventory";
import { Controls } from "./controls";
import { ambientColor, DAY_LENGTH_SECONDS, daylight, phaseFromSeconds, skyColor } from "./daycycle";
import { solidMaterial, waterMaterial } from "./mesher";
import { ChunkedWorldMesh } from "./chunks";
import { MobRenderer } from "./mobRender";
import { MobSimulation, raycastMobs } from "./mobs";
import { EYE_HEIGHT, Player } from "./player";
import { lookDirection, raycast, RayHit } from "./raycast";
import { decodeSave, EditLog, encodeSave, SaveData } from "./save";
import { Block, BlockId, SIZE_X, SIZE_Z, World, isPassable } from "./world";

const REACH = 5;

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
const hotbarBlocks: BlockId[] = sanitizeHotbar(saved?.hotbar);

/** survival: 블록을 모아서 쓴다 / creative: 블록이 무한이다. 예전 저장(모드 없음)은 무한 그대로 이어간다. */
let mode: "survival" | "creative" = saved && saved.seed === seed ? (saved.mode ?? "creative") : "survival";
const inventory = new Inventory();
if (saved && saved.seed === seed && saved.inventory) inventory.load(saved.inventory);
const health = new Health();
const fallTracker = new FallTracker();

const toastElement = document.getElementById("toast") as HTMLElement;
let toastTimer: number | undefined;
function showToast(text: string, ms = 1800): void {
  toastElement.textContent = text;
  toastElement.classList.add("on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastElement.classList.remove("on"), ms);
}

const iconCache = new Map<number, string>();
function iconUrl(block: number): string {
  let url = iconCache.get(block);
  if (!url) {
    url = tileIconDataUrl(iconTile(block));
    iconCache.set(block, url);
  }
  return url;
}

function itemLabel(item: number): string {
  return ITEM_NAMES[item] ?? blockName(item);
}

// 월드를 만드는 동안 화면이 멈추므로, 먼저 "만드는 중" 문구가 그려지게 한 프레임 기다린다.
await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const world = new World();
const generateStart = performance.now();
world.generate(seed);
const generateMs = Math.round(performance.now() - generateStart);

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
const slotElements = hotbarBlocks.map((_block, index) => {
  const element = document.createElement("div");
  element.className = "slot";
  element.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    selectSlot(index);
  });
  hotbarElement.appendChild(element);
  return element;
});

/** 아이템 바 칸마다 블록 무늬 아이콘과 이름을 그린다. */
function refreshHotbar(): void {
  slotElements.forEach((element, i) => {
    const block = hotbarBlocks[i];
    element.replaceChildren();
    const icon = document.createElement("img");
    icon.src = iconUrl(block);
    icon.alt = blockName(block);
    const label = document.createElement("span");
    label.textContent = blockName(block);
    element.append(icon, label);
    if (mode === "survival") {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(inventory.count(block));
      element.append(count);
    }
    element.classList.toggle("empty", mode === "survival" && inventory.count(block) === 0);
    element.classList.toggle("selected", i === selectedSlot);
  });
}

function selectSlot(index: number): void {
  if (index < 0 || index >= hotbarBlocks.length) return;
  selectedSlot = index;
  refreshHotbar();
}
selectSlot(0);

const inventoryPanel = document.getElementById("inventory-panel") as HTMLElement;
const inventoryGrid = document.getElementById("inventory-grid") as HTMLElement;
const inventoryEmpty = document.getElementById("inventory-empty") as HTMLElement;
const itemsRow = document.getElementById("items-row") as HTMLElement;
const itemsTitle = document.getElementById("items-title") as HTMLElement;
const craftSection = document.getElementById("craft-section") as HTMLElement;
const craftList = document.getElementById("craft-list") as HTMLElement;
const modeLabel = document.getElementById("mode-label") as HTMLElement;

function toggleInventory(open?: boolean): void {
  const isOpen = inventoryPanel.classList.toggle("open", open);
  if (isOpen) refreshInventoryPanel();
}

/** 누르는 동작은 게임 화면(시점 돌리기)으로 새지 않게 막는다. */
function onPress(element: HTMLElement, action: () => void): void {
  element.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    action();
  });
}

function eatMeat(): void {
  if (inventory.count(Item.Meat) === 0) return;
  if (health.hp >= MAX_HEALTH) {
    showToast("체력이 가득이라 안 먹어도 돼요");
    return;
  }
  inventory.remove(Item.Meat);
  health.heal(MEAT_HEAL);
  audio.playEat();
  refreshHearts();
  refreshInventoryPanel();
  scheduleSave();
}

function craftRecipe(index: number): void {
  const recipe = RECIPES[index];
  if (!inventory.craft(recipe)) return;
  audio.playCraft();
  showToast(recipe.name + " ×" + recipe.output[1] + " 만들었어요");
  refreshHotbar();
  refreshInventoryPanel();
  scheduleSave();
}

function refreshInventoryPanel(): void {
  const survival = mode === "survival";
  modeLabel.textContent = survival ? "서바이벌: 블록을 모아서 써요" : "창작: 블록이 무한이에요";

  inventoryGrid.replaceChildren();
  const shown = survival ? PLACEABLE_BLOCKS.filter((b) => inventory.count(b.block) > 0) : PLACEABLE_BLOCKS;
  for (const { block, name } of shown) {
    const tile = document.createElement("div");
    tile.className = "inv-tile";
    const icon = document.createElement("img");
    icon.src = iconUrl(block);
    icon.alt = name;
    const label = document.createElement("span");
    label.textContent = name;
    tile.append(icon, label);
    if (survival) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(inventory.count(block));
      tile.append(count);
    }
    onPress(tile, () => {
      hotbarBlocks[selectedSlot] = block;
      refreshHotbar();
      toggleInventory(false);
      scheduleSave();
    });
    inventoryGrid.appendChild(tile);
  }
  inventoryEmpty.textContent = shown.length === 0 ? "아직 블록이 없어요. 나무나 흙을 부숴서 모아 보세요!" : "";

  itemsRow.replaceChildren();
  const extras = inventory.entries().filter(([item]) => item >= 100);
  itemsTitle.style.display = survival && extras.length > 0 ? "" : "none";
  if (survival) {
    for (const [item, amount] of extras) {
      const chip = document.createElement("div");
      chip.className = "item-chip";
      if (item === Item.Meat) {
        chip.classList.add("eatable");
        chip.textContent = "🍖 " + itemLabel(item) + " ×" + amount + " (눌러서 먹기)";
        onPress(chip, eatMeat);
      } else {
        chip.textContent = "🔨 " + itemLabel(item) + " ×" + amount + " (자동으로 써요)";
      }
      itemsRow.appendChild(chip);
    }
  }

  craftSection.style.display = survival ? "" : "none";
  craftList.replaceChildren();
  RECIPES.forEach((recipe, index) => {
    const ready = inventory.canCraft(recipe);
    const row = document.createElement("div");
    row.className = "craft-row " + (ready ? "ready" : "locked");
    row.textContent = recipe.name + " ×" + recipe.output[1];
    const need = document.createElement("small");
    need.textContent =
      "재료: " + recipe.inputs.map(([item, amount]) => itemLabel(item) + " " + inventory.count(item) + "/" + amount).join(", ");
    row.append(need);
    onPress(row, () => craftRecipe(index));
    craftList.appendChild(row);
  });
}

onPress(document.getElementById("mode-toggle") as HTMLElement, () => {
  mode = mode === "survival" ? "creative" : "survival";
  showToast(mode === "survival" ? "서바이벌 방식으로 바꿨어요" : "창작 방식으로 바꿨어요");
  refreshHotbar();
  refreshInventoryPanel();
  scheduleSave();
});
document.getElementById("inventory-button")?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  toggleInventory();
});
document.getElementById("inventory-close")?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  toggleInventory(false);
});
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyB") toggleInventory();
});

function currentTarget(): RayHit | null {
  const [dx, dy, dz] = lookDirection(player.yaw, player.pitch);
  return raycast(world, player.x, player.y + EYE_HEIGHT, player.z, dx, dy, dz, REACH);
}

/** 눈앞의 동물을 때린다. 동물이 블록보다 가까이 있을 때만 맞고, 때렸으면 true. */
function hitMobInSight(blockHit: RayHit | null): boolean {
  const ex = player.x;
  const ey = player.y + EYE_HEIGHT;
  const ez = player.z;
  const [dx, dy, dz] = lookDirection(player.yaw, player.pitch);
  const found = raycastMobs(mobSim.mobs, ex, ey, ez, dx, dy, dz, REACH);
  if (!found) return false;
  const blockDistance = blockHit ? Math.hypot(blockHit.x + 0.5 - ex, blockHit.y + 0.5 - ey, blockHit.z + 0.5 - ez) - 0.5 : Infinity;
  if (found.distance > blockDistance) return false;
  audio.playMobHit();
  const damage = mode === "creative" ? 4 : inventory.attackDamage();
  const kind = found.mob.kind;
  if (mobSim.hit(found.mob, player.x, player.z, damage) && mode === "survival") {
    const drop = mobDrop(kind, Math.random);
    if (drop) {
      inventory.add(drop[0], drop[1]);
      showToast(itemLabel(drop[0]) + " ×" + drop[1] + " 얻었어요");
      refreshHotbar();
      scheduleSave();
    }
  }
  return true;
}

function breakBlock(): void {
  const hit = currentTarget();
  if (hitMobInSight(hit)) return;
  if (!hit || hit.y === 0) return;
  const broken = world.get(hit.x, hit.y, hit.z);
  audio.playBreak(broken);
  if (mode === "survival") {
    const drop = dropFor(broken);
    if (drop) inventory.add(drop[0], drop[1]);
    refreshHotbar();
  }
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
  if (player.intersectsBlock(px, py, pz) || mobSim.intersectsBlock(px, py, pz)) return;
  const block = hotbarBlocks[selectedSlot];
  if (mode === "survival") {
    if (!inventory.remove(block)) {
      showToast(blockName(block) + " 블록이 없어요");
      return;
    }
    refreshHotbar();
  }
  audio.playPlace(block);
  world.set(px, py, pz, block);
  editLog.record(px, py, pz, block);
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
    hotbar: hotbarBlocks,
    mode,
    inventory: inventory.entries(),
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

worldMesh.loadAllNear(player.x, player.z);

const mobSim = new MobSimulation();
const mobRenderer = new MobRenderer(scene);

const heartsElement = document.getElementById("hearts") as HTMLElement;
const damageFlash = document.getElementById("damage-flash") as HTMLElement;
const heartElements = Array.from({ length: MAX_HEALTH / 2 }, () => {
  const heart = document.createElement("span");
  heart.textContent = "♥";
  heartsElement.appendChild(heart);
  return heart;
});

function refreshHearts(): void {
  heartElements.forEach((heart, i) => {
    heart.className = health.hp >= (i + 1) * 2 ? "full" : health.hp === i * 2 + 1 ? "half" : "";
  });
}
refreshHearts();

/** 플레이어가 피해를 입는다. 쓰러지면 처음 자리에서 다시 시작한다. */
function hurt(amount: number): void {
  if (!health.damage(amount)) return;
  audio.playHurt();
  damageFlash.classList.add("on");
  window.setTimeout(() => damageFlash.classList.remove("on"), 60);
  refreshHearts();
  if (health.dead) respawn();
}

function respawn(): void {
  player.x = spawnX + 0.5;
  player.z = spawnZ + 0.5;
  player.y = world.surfaceHeight(spawnX, spawnZ) + 0.01;
  player.vy = 0;
  fallTracker.reset();
  health.reset();
  mobSim.clearHostile();
  refreshHearts();
  showToast("쓰러졌어요... 처음 자리에서 다시 일어났어요", 3000);
}
mobSim.populate(world, player.x, player.z, 10, Math.random);
document.getElementById("loading")?.remove();

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
  (window as unknown as { __vox: unknown }).__vox = { world, player, camera, scene, audio, generateMs, worldMesh, mobSim, health, inventory, hurt, setMode: (m: "survival" | "creative") => { mode = m; refreshHotbar(); } };
}

// 브라우저는 사용자가 화면을 누르기 전에는 소리를 못 내게 막는다. 첫 터치/클릭/키 입력 때 소리를 켠다.
function unlockAudioOnce(): void {
  audio.unlock();
  document.removeEventListener("pointerdown", unlockAudioOnce);
  document.removeEventListener("touchstart", unlockAudioOnce);
  document.removeEventListener("keydown", unlockAudioOnce);
}
document.addEventListener("pointerdown", unlockAudioOnce);
document.addEventListener("touchstart", unlockAudioOnce);
document.addEventListener("keydown", unlockAudioOnce);

const STEP_DISTANCE = 1.7;
let stepProgress = 0;
let wasInWater = false;

/** 걷는 거리마다 발소리, 물에 들어가는 순간 첨벙 소리. */
function updateMovementSounds(moved: number): void {
  const inWater = player.isInWater();
  if (inWater && !wasInWater) audio.splash();
  wasInWater = inWater;

  if (player.onGround && !inWater) {
    stepProgress += moved;
    if (stepProgress >= STEP_DISTANCE) {
      stepProgress = 0;
      audio.playStep(world.get(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z)));
    }
  } else {
    stepProgress = 0;
  }
}

let shownHp = health.hp;
let last = performance.now();
let frames = 0;
let fpsTimer = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const look = controls.consumeLook();
  player.yaw += look.yaw;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + look.pitch));
  const beforeX = player.x;
  const beforeZ = player.z;
  player.update(dt, controls.currentInput());
  updateMovementSounds(Math.hypot(player.x - beforeX, player.z - beforeZ));
  worldMesh.update(player.x, player.z);
  const fallDamage = fallTracker.update(player.y, player.onGround, player.isInWater());
  if (fallDamage > 0) hurt(fallDamage);
  health.update(dt);
  const mobResult = mobSim.update(dt, world, Math.random, { x: player.x, y: player.y, z: player.z }, dayFactor < 0.3);
  for (const call of mobResult.sounds) {
    audio.playMob(call.kind, 1 - Math.hypot(call.x - player.x, call.z - player.z) / 28);
  }
  if (mobResult.damage > 0) hurt(mobResult.damage);
  if (health.hp !== shownHp) {
    shownHp = health.hp;
    refreshHearts();
  }
  mobRenderer.update(mobSim.mobs, solidMaterial.color);

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
