import * as THREE from "three";
import { iconTile, tileIconDataUrl } from "./atlas";
import { audio } from "./audio";
import { Achievements, ACHIEVEMENTS } from "./achievements";
import { blockName, canPlaceAt, PLACEABLE_BLOCKS, sanitizeHotbar } from "./blocks";
import { CropField } from "./crops";
import { FallTracker, Health, MAX_HEALTH } from "./health";
import { dropsFor, FOOD_HEAL, Inventory, Item, ITEM_NAMES, mobDrops, RECIPES } from "./inventory";
import { Controls } from "./controls";
import { ambientColor, DAY_LENGTH_SECONDS, daylight, nextMorning, phaseFromSeconds, skyColor } from "./daycycle";
import { solidMaterial, waterMaterial } from "./mesher";
import { ChunkedWorldMesh } from "./chunks";
import { MobRenderer } from "./mobRender";
import { MOB_SPECS, MobSimulation, raycastMobs } from "./mobs";
import { AdaptiveQuality, fogFar, QUALITY_LEVELS } from "./quality";
import { EYE_HEIGHT, Player } from "./player";
import { lookDirection, raycast, RayHit } from "./raycast";
import { decodeSave, EditLog, encodeSave, SaveData } from "./save";
import { Block, BlockId, SIZE_X, SIZE_Z, World, isPassable, isPlant } from "./world";

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
const achievements = new Achievements();
if (saved && saved.seed === seed && saved.achievements) achievements.load(saved.achievements);
const crops = new CropField();
if (saved && saved.seed === seed && saved.crops) crops.load(saved.crops);

let resetting = false;
let saveTimer: number | undefined;

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

/** 도전 과제를 달성하면 알림을 띄운다. 이미 달성한 것이면 아무것도 안 한다. */
function unlockAchievement(id: string): void {
  if (!achievements.unlock(id)) return;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  showToast("도전 과제 달성! " + (def?.name ?? id), 2600);
  audio.playCraft();
  scheduleSave();
}

/** 가방에 무엇이 있는지 보고 달성한 도전 과제를 챙긴다. */
function checkInventoryAchievements(): void {
  const has = (item: number): boolean => inventory.count(item) > 0;
  if (has(Block.Wood)) unlockAchievement("wood");
  if (has(Block.Planks)) unlockAchievement("planks");
  if (has(Item.WoodClub) || has(Item.StoneClub) || has(Item.IronClub)) unlockAchievement("club");
  if (has(Item.Meat) || has(Item.CookedMeat)) unlockAchievement("meat");
  if (has(Item.CookedMeat)) unlockAchievement("cooked");
  if (has(Item.Bed)) unlockAchievement("bed");
  if (has(Block.IronOre)) unlockAchievement("iron");
  if (has(Item.IronClub)) unlockAchievement("ironclub");
  if (has(Item.Grain)) unlockAchievement("harvest");
  if (has(Item.Bread)) unlockAchievement("bread");
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

const sky = new THREE.Color(0x87ceeb);
const scene = new THREE.Scene();
scene.background = sky;
let fogNear = 30;
let fogFarDistance = 70;
scene.fog = new THREE.Fog(sky, fogNear, fogFarDistance);

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

// 화질: 폰은 한 단계 낮춰 시작하고, 계속 느리면 스스로 더 낮춘다. 주소에 ?quality=0~3 을 붙이면 그 단계로 고정한다.
const qualityParam = new URLSearchParams(window.location.search).get("quality");
const fixedQuality = qualityParam !== null && Number.isInteger(Number(qualityParam));
const startQuality = fixedQuality
  ? Math.max(0, Math.min(QUALITY_LEVELS.length - 1, Number(qualityParam)))
  : navigator.maxTouchPoints > 0
    ? 1
    : 0;
const adaptiveQuality = new AdaptiveQuality(startQuality);
let qualityLevel = startQuality;

function applyQuality(level: number): void {
  qualityLevel = level;
  const quality = QUALITY_LEVELS[level];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
  resize();
  worldMesh.setRadius(quality.radius);
  fogFarDistance = fogFar(quality.radius);
  fogNear = fogFarDistance * 0.43;
  const sceneFog = scene.fog as THREE.Fog;
  sceneFog.near = fogNear;
  sceneFog.far = fogFarDistance;
}
applyQuality(startQuality);

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
  checkInventoryAchievements();
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

function eat(item: number): void {
  const heal = FOOD_HEAL[item];
  if (heal === undefined || inventory.count(item) === 0) return;
  if (health.hp >= MAX_HEALTH) {
    showToast("체력이 가득이라 안 먹어도 돼요");
    return;
  }
  inventory.remove(item);
  health.heal(heal);
  audio.playEat();
  refreshHearts();
  refreshInventoryPanel();
  scheduleSave();
}

/** 밤에만 잘 수 있다. 가까이에 좀비가 있으면 못 잔다. 자면 아침이 되고 체력이 조금 찬다. */
function sleepInBed(): void {
  if (dayFactor >= 0.3) {
    showToast("밤에만 잘 수 있어요");
    return;
  }
  const danger = mobSim.mobs.some((m) => MOB_SPECS[m.kind].hostile && Math.hypot(m.x - player.x, m.z - player.z) < 12);
  if (danger) {
    showToast("가까이에 좀비가 있어서 잘 수 없어요");
    return;
  }
  worldSeconds = nextMorning(worldSeconds);
  unlockAchievement("sleep");
  health.heal(10);
  mobSim.clearHostile();
  refreshHearts();
  toggleInventory(false);
  showToast("푹 잤어요. 아침이 밝았어요", 2500);
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
      if (FOOD_HEAL[item] !== undefined) {
        chip.classList.add("eatable");
        const emoji = item === Item.Bread ? "🍞" : item === Item.CookedMeat ? "🍖" : "🥩";
        chip.textContent = emoji + " " + itemLabel(item) + " ×" + amount + " (눌러서 먹기)";
        onPress(chip, () => eat(item));
      } else if (item === Item.Grain) {
        chip.textContent = "🌾 " + itemLabel(item) + " ×" + amount + " (3개로 빵을 만들어요)";
      } else if (item === Item.Bed) {
        chip.classList.add("eatable");
        chip.textContent = "🛏 " + itemLabel(item) + " ×" + amount + " (밤에 눌러서 자기)";
        onPress(chip, sleepInBed);
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
  if (mobSim.hit(found.mob, player.x, player.z, damage)) {
    if (kind === "zombie") unlockAchievement("zombie");
    const drops = mode === "survival" ? mobDrops(kind, Math.random) : [];
    if (drops.length > 0) {
      for (const [item, amount] of drops) inventory.add(item, amount);
      showToast(drops.map(([item, amount]) => itemLabel(item) + " ×" + amount).join(", ") + " 얻었어요");
      refreshHotbar();
      scheduleSave();
    }
  }
  return true;
}

/** 블록 하나를 없앤다. 서바이벌이면 나오는 것들을 가방에 넣고, 알릴 만한 것은 알려 준다. */
function removeBlock(x: number, y: number, z: number): void {
  const broken = world.get(x, y, z);
  if (mode === "survival") {
    const drops = dropsFor(broken, Math.random);
    for (const [item, amount] of drops) inventory.add(item, amount);
    if (drops.some(([item]) => item === Block.Sprout) && broken === Block.Grass) showToast("밀 씨앗을 얻었어요");
    refreshHotbar();
  }
  world.set(x, y, z, Block.Air);
  editLog.record(x, y, z, Block.Air);
  crops.remove(x, y, z);
}

function breakBlock(): void {
  const hit = currentTarget();
  if (hitMobInSight(hit)) return;
  if (!hit || hit.y === 0) return;
  audio.playBreak(world.get(hit.x, hit.y, hit.z));
  removeBlock(hit.x, hit.y, hit.z);
  // 밑이 사라진 식물은 서 있을 곳이 없으니 같이 뽑힌다.
  if (isPlant(world.get(hit.x, hit.y + 1, hit.z))) removeBlock(hit.x, hit.y + 1, hit.z);
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
  if (isPlant(block) && (world.get(px, py, pz) !== Block.Air || !canPlaceAt(block, world.get(px, py - 1, pz)))) {
    showToast(blockName(block) + "은(는) 풀이나 흙 위에만 심을 수 있어요");
    return;
  }
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
  if (block === Block.Sprout) crops.plant(px, py, pz, worldSeconds);
  worldMesh.updateBlock(px, pz);
  scheduleSave();
}


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
    crops: crops.toArray(),
    achievements: achievements.toArray(),
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
  player.flying = false;
  fallTracker.reset();
  health.reset();
  mobSim.clearHostile();
  refreshHearts();
  showToast("쓰러졌어요... 처음 자리에서 다시 일어났어요", 3000);
}
mobSim.populate(world, player.x, player.z, 10, Math.random);
document.getElementById("loading")?.remove();

const controls = new Controls(canvas);
const descendButton = document.getElementById("descend-button") as HTMLElement;

/** 창작 방식에서 점프를 0.35초 안에 두 번 누르면 비행을 켜거나 끈다. */
let lastJumpPress = -1;
controls.onJumpPress = () => {
  const now = performance.now();
  if (mode === "creative" && now - lastJumpPress < 350) {
    player.flying = !player.flying;
    showToast(player.flying ? "비행 시작! 점프는 위로, 내려가기는 아래로" : "비행을 끝냈어요");
    lastJumpPress = -1;
  } else {
    lastJumpPress = now;
  }
};
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
    fog.near = fogNear;
    fog.far = fogFarDistance;
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
const clockElement = document.getElementById("clock") as HTMLElement;
let shownClock = "";

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
  audio.setNight(dayFactor < 0.3);
  const clockText = dayFactor < 0.3 ? "🌙 밤" : phase < 0.5 ? "🌅 아침" : phase < 0.7 ? "☀ 낮" : "🌇 저녁";
  if (clockText !== shownClock) {
    shownClock = clockText;
    clockElement.textContent = clockText;
  }

  const angle = phase * Math.PI * 2;
  const direction = new THREE.Vector3(Math.sin(angle), -Math.cos(angle), 0.3).normalize().multiplyScalar(85);
  sun.position.copy(camera.position).add(direction);
  moon.position.copy(camera.position).sub(direction);
  sun.lookAt(camera.position);
  moon.lookAt(camera.position);
}

// 개발용: 주소에 ?debug 를 붙이면 콘솔에서 __vox 로 월드와 플레이어를 만질 수 있다.
if (new URLSearchParams(window.location.search).has("debug")) {
  (window as unknown as { __vox: unknown }).__vox = { world, player, camera, scene, audio, generateMs, worldMesh, mobSim, health, applyQuality, crops, achievements, inventory, hurt, setMode: (m: "survival" | "creative") => { mode = m; refreshHotbar(); } };
}

const achievementPanel = document.getElementById("achievement-panel") as HTMLElement;
const achievementTitle = document.getElementById("achievement-title") as HTMLElement;
const achievementList = document.getElementById("achievement-list") as HTMLElement;

function refreshAchievementPanel(): void {
  achievementTitle.textContent = "도전 과제 (" + achievements.count + "/" + ACHIEVEMENTS.length + ")";
  achievementList.replaceChildren();
  for (const def of ACHIEVEMENTS) {
    const done = achievements.has(def.id);
    const row = document.createElement("div");
    row.className = "achievement" + (done ? " done" : "");
    row.textContent = (done ? "✅ " : "⬜ ") + def.name;
    const hint = document.createElement("small");
    hint.textContent = def.hint;
    row.append(hint);
    achievementList.appendChild(row);
  }
}
onPress(document.getElementById("achievement-button") as HTMLElement, () => {
  toggleInventory(false);
  const open = achievementPanel.classList.toggle("open");
  if (open) refreshAchievementPanel();
});
onPress(document.getElementById("achievement-close") as HTMLElement, () => achievementPanel.classList.remove("open"));

// 전체화면: 크롬 같은 브라우저의 주소창과 탭 줄을 숨겨 게임 화면을 넓힌다. 지원하지 않는 브라우저(아이폰 사파리)에서는 버튼을 숨긴다.
const fullscreenButton = document.getElementById("fullscreen-button") as HTMLElement;
if (document.documentElement.requestFullscreen) {
  fullscreenButton.style.display = "flex";
  // 전체화면 요청은 손가락을 뗄 때(click) 해야 브라우저가 허락한다.
  fullscreenButton.addEventListener("pointerdown", (e) => e.stopPropagation());
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        // 가로 화면으로 고정한다 (지원하는 기기에서만 된다).
        await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.("landscape");
      }
    } catch {
      // 거절되거나 지원하지 않으면 그냥 넘어간다.
    }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreenButton.textContent = document.fullscreenElement ? "전체화면 끄기" : "전체화면";
  });
}

const helpPanel = document.getElementById("help-panel") as HTMLElement;
const HELP_KEY = "voxelgame:help-seen";
onPress(document.getElementById("help-button") as HTMLElement, () => helpPanel.classList.toggle("open"));
onPress(document.getElementById("help-close") as HTMLElement, () => helpPanel.classList.remove("open"));
// 처음 접속했을 때 한 번만 도움말을 자동으로 보여준다.
if (readStorage(HELP_KEY) === null) {
  helpPanel.classList.add("open");
  writeStorage(HELP_KEY, "1");
}

const LOOK_KEY = "voxelgame:look";
const lookSlider = document.getElementById("look-slider") as HTMLInputElement;
const savedLook = Number(readStorage(LOOK_KEY));
if (savedLook >= 0.5 && savedLook <= 2) lookSlider.value = String(savedLook);
controls.lookScale = Number(lookSlider.value);
lookSlider.addEventListener("input", () => {
  controls.lookScale = Number(lookSlider.value);
  writeStorage(LOOK_KEY, lookSlider.value);
});

const MUSIC_KEY = "voxelgame:music";
const musicButton = document.getElementById("music-button") as HTMLElement;
audio.setMusic(readStorage(MUSIC_KEY) !== "off");
function refreshMusicButton(): void {
  musicButton.classList.toggle("off", !audio.isMusicOn());
}
refreshMusicButton();
onPress(musicButton, () => {
  audio.unlock();
  audio.setMusic(!audio.isMusicOn());
  writeStorage(MUSIC_KEY, audio.isMusicOn() ? "on" : "off");
  refreshMusicButton();
  showToast(audio.isMusicOn() ? "배경음악을 켰어요" : "배경음악을 껐어요");
});

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
let cropTimer = 0;
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
  cropTimer += dt;
  if (cropTimer >= 1) {
    cropTimer = 0;
    for (const [x, y, z] of crops.harvestReady(worldSeconds)) {
      if (world.get(x, y, z) !== Block.Sprout) continue;
      world.set(x, y, z, Block.Wheat);
      editLog.record(x, y, z, Block.Wheat);
      worldMesh.updateBlock(x, z);
      scheduleSave();
    }
  }
  if (mode !== "creative") player.flying = false;
  descendButton.classList.toggle("show", player.flying);
  if (player.flying) fallTracker.reset();
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
    const fps = frames / fpsTimer;
    if (!fixedQuality && !document.hidden) {
      const lowered = adaptiveQuality.report(fps, fpsTimer);
      if (lowered !== null) {
        applyQuality(lowered);
        showToast("화면이 느려서 화질을 '" + QUALITY_LEVELS[lowered].name + "'으로 낮췄어요", 2500);
      }
    }
    fpsLabel.textContent = `${Math.round(fps)} FPS · 화질 ${QUALITY_LEVELS[qualityLevel].name} · seed ${seed}`;
    frames = 0;
    fpsTimer = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
