import * as THREE from "three";
import { ARMOR, ARMOR_BY_ID, bestArmor, reduceDamage, totalArmorPoints, type ArmorSlot } from "./armor";
import { Effects, EFFECTS, POTION_BY_ID } from "./effects";
import { efficiencyMultiplier, enchantLabel, isEnchantable, powerMultiplier, protectionPoints, rollEnchant, sharpnessBonus, ENCHANT_TIERS } from "./enchant";
import { BLOCK_XP, Experience, MOB_XP, SMELT_XP } from "./xp";
import { iconTile, tileIconDataUrl } from "./atlas";
import { audio } from "./audio";
import { Achievements, ACHIEVEMENTS } from "./achievements";
import { blockName, canPlaceAt, isPlaceableBlock, PLACEABLE_BLOCKS, sanitizeHotbar } from "./blocks";
import { ChestField, moveStack } from "./chest";
import { CropField } from "./crops";
import { FallTracker, Health, MAX_HEALTH } from "./health";
import { Hunger, MAX_HUNGER } from "./hunger";
import { dropsFor, FOOD_HEAL, FOOD_HUNGER, Inventory, Item, ITEM_NAMES, mobDrops, RECIPES, STACK_MAX, type Recipe } from "./inventory";
import { Controls } from "./controls";
import { ambientColor, DAY_LENGTH_SECONDS, daylight, nextMorning, phaseFromSeconds, skyColor } from "./daycycle";
import { solidMaterial, waterMaterial } from "./mesher";
import { ChunkedWorldMesh } from "./chunks";
import { MobRenderer } from "./mobRender";
import { DropField } from "./drops";
import { DropRenderer } from "./dropRender";
import { FUELS, FurnaceField, SMELTS } from "./furnace";
import { Fishing, MAX_LINE_DISTANCE } from "./fishing";
import { refreshFences } from "./fences";
import { settleFrom } from "./falling";
import { HeldHandRenderer } from "./heldHand";
import { EGG_BY_ITEM } from "./eggs";
import { BREEDABLE, MOB_SPECS, MobSimulation, raycastMobs, TAME_FOODS, type Mob, type MobKind } from "./mobs";
import { connectAndWait, NetClient, randomRoomCode } from "./net";
import { PlayerAvatarRenderer } from "./playerRender";
import { RemotePlayer, sanitizeName } from "./protocol";
import { canTrade, doTrade, isProfession, PROFESSION_INFO } from "./trades";
import { breakSeconds, canHarvest, SWORD_DAMAGE, TOOL_BY_ID, toolDurability, type ToolDef } from "./tools";
import { AdaptiveQuality, fogFar, QUALITY_LEVELS } from "./quality";
import { EYE_HEIGHT, Player } from "./player";
import { lookDirection, raycast, RayHit } from "./raycast";
import { decodeSave, EditLog, encodeSave, SaveData } from "./save";
import { isDoorTop, placementFor, toggledDoor } from "./shapes";
import { Block, BlockId, SIZE_X, SIZE_Z, WORLD_VERSION, World, isChest, isDoor, isOpenDoor, isPassable, isPlant } from "./world";

const REACH = 5;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const fpsLabel = document.getElementById("fps") as HTMLElement;
const hotbarElement = document.getElementById("hotbar") as HTMLElement;
const armorLabel = document.getElementById("armor-label") as HTMLElement;

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

// ---- 멀티플레이: 주소에 ?room=방코드 가 있으면, 월드를 만들기 전에 먼저 그 방에 들어가서
// 다 같이 볼 시드와 지금까지 바뀐 블록을 받아 온다. 없으면 지금까지처럼 혼자 시작한다.
// 방을 새로 만드는 건 게임 화면의 "함께하기" 버튼으로 한다 (아래쪽, controls 만든 뒤).
// 서버 배포 방법은 README를 보고, 직접 배포했다면 이 주소를 자신의 것으로 바꾸세요.
const PARTY_HOST_DEFAULT = "voxelgame-multiplayer.thiefking10.workers.dev";
const NICKNAME_KEY = "voxelgame:nickname";
const AVATAR_COLORS = [0xff6b6b, 0x4dd0e1, 0xffd166, 0x9b7bd6, 0x81c784, 0xf48fb1];

const urlParams = new URLSearchParams(window.location.search);
const partyHost = urlParams.get("party") || PARTY_HOST_DEFAULT;
/** 월드 규격이 다르면 서버에 남은 예전 방(블록 수정 기록)과 섞이지 않게 방 이름 앞에 규격 번호를 붙인다. */
const serverRoom = (code: string): string => "w" + WORLD_VERSION + "-" + code;
const roomParam = urlParams.get("room");

const net = new NetClient();
const remotePlayers = new Map<string, RemotePlayer>();
const myColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

function askName(): string {
  const remembered = sanitizeName(readStorage(NICKNAME_KEY) ?? undefined);
  // 일부 브라우저·환경(예: 팝업이 막혔거나 자동화 도구)은 prompt() 자체를 막고 오류를 낼 수 있다.
  let typed: string | null = null;
  try {
    typed = window.prompt("함께 하는 사람들에게 보일 이름을 입력하세요", remembered);
  } catch {
    // 그냥 기억해 둔 이름(또는 "손님")으로 계속한다.
  }
  const name = sanitizeName(typed ?? remembered);
  writeStorage(NICKNAME_KEY, name);
  return name;
}

const editLog = new EditLog();
/** 월드가 아직 없을 때(막 접속하는 중) 온 블록 변화는 일단 기록만 해 두고, 나중에 한꺼번에 적용한다. */
let worldReady = false;

/** 서버에서 온 블록 변화를 적용한다. */
function applyRemoteEdit(x: number, y: number, z: number, block: number): void {
  editLog.record(x, y, z, block);
  if (worldReady) {
    const lightChanged = world.set(x, y, z, block as BlockId);
    refreshMesh(x, z, lightChanged);
  }
}

/** 접속 중 벌어지는 일들: 처음 들어갈 때도, 나중에 "함께하기" 버튼으로 방을 만들 때도 똑같이 쓴다. */
function netCallbacks() {
  return {
    onJoin: (p: RemotePlayer) => {
      remotePlayers.set(p.id, p);
      showToast(p.name + " 님이 들어왔어요");
    },
    onMove: (id: string, x: number, y: number, z: number, yaw: number, pitch: number) => {
      const p = remotePlayers.get(id);
      if (p) Object.assign(p, { x, y, z, yaw, pitch });
    },
    onEdit: applyRemoteEdit,
    onLeave: (id: string) => {
      const name = remotePlayers.get(id)?.name;
      remotePlayers.delete(id);
      avatarRenderer.remove(id);
      if (name) showToast(name + " 님이 나갔어요");
    },
    onFull: () => showToast("방이 꽉 찼어요(최대 4명)", 3000),
    onDisconnect: () => {
      showToast("멀티플레이 연결이 끊겼어요. 계속 혼자 진행할 수 있어요", 3500);
      avatarRenderer.clear();
      remotePlayers.clear();
      refreshMultiplayerPanel();
    },
  };
}

let remoteSeed: number | null = null;
let multiplayerJoinError: string | null = null;

if (roomParam) {
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.textContent = "방 " + roomParam + "에 들어가는 중...";
  const name = askName();
  const fallbackSeed = urlParams.get("seed") ? Number(urlParams.get("seed")) || 1 : Math.floor(Math.random() * 100000) + 1;
  try {
    const result = await connectAndWait(
      net,
      partyHost,
      serverRoom(roomParam),
      { name, color: myColor, seed: fallbackSeed, x: 0, y: 20, z: 0, yaw: 0, pitch: 0 },
      { ...netCallbacks(), onFull: () => { multiplayerJoinError = "방이 꽉 찼어요(최대 4명). 혼자 시작할게요."; } },
    );
    remoteSeed = result.seed;
    editLog.load(result.edits);
    for (const p of result.players) remotePlayers.set(p.id, p);
  } catch {
    multiplayerJoinError ??= "방에 들어가지 못했어요. 혼자 시작할게요.";
  }
}

const seedParam = urlParams.get("seed");
const lastSeed = Number(readStorage(LAST_SEED_KEY));
const seed = remoteSeed ?? (seedParam ? Number(seedParam) || 1 : lastSeed > 0 ? lastSeed : Math.floor(Math.random() * 100000) + 1);
writeStorage(LAST_SEED_KEY, String(seed));

const loadedSave = decodeSave(readStorage(saveKey(seed)));
/** 예전(낮은) 월드에서 저장한 것이면, 지형이 달라져서 블록 수정·작물·화로·떨어진 물건·위치는 버리고 가방·모드·배고픔 등만 이어간다. */
const oldWorldSave = loadedSave !== null && (loadedSave.worldVersion ?? 1) !== WORLD_VERSION;
const saved: SaveData | null =
  loadedSave && oldWorldSave ? { ...loadedSave, edits: [], crops: [], furnaces: [], chests: [], drops: [] } : loadedSave;
/** 이제 블록뿐 아니라 도구·검·활도 들어갈 수 있다 (0은 빈손). */
const hotbarBlocks: number[] = sanitizeHotbar(saved?.hotbar);

/** survival: 블록을 모아서 쓴다 / creative: 블록이 무한이다. 예전 저장(모드 없음)은 무한 그대로 이어간다. */
let mode: "survival" | "creative" = saved && saved.seed === seed ? (saved.mode ?? "creative") : "survival";
const inventory = new Inventory();
if (saved && saved.seed === seed && saved.inventory) inventory.load(saved.inventory, saved.durability ?? [], saved.enchants ?? []);
const experience = new Experience();
if (saved && saved.seed === seed && saved.xp) experience.load(saved.xp[0], saved.xp[1]);
const effects = new Effects();
if (saved && saved.seed === seed && saved.effects) effects.load(saved.effects);
const health = new Health();
const hunger = saved && saved.seed === seed && saved.hunger !== undefined ? Hunger.fromValue(saved.hunger) : new Hunger();
const fallTracker = new FallTracker();
const achievements = new Achievements();
if (saved && saved.seed === seed && saved.achievements) achievements.load(saved.achievements);
const crops = new CropField();
if (saved && saved.seed === seed && saved.crops) crops.load(saved.crops);
const furnaces = new FurnaceField();
if (saved && saved.seed === seed && saved.furnaces) furnaces.load(saved.furnaces);
const chests = new ChestField();
if (saved && saved.seed === seed && saved.chests) chests.load(saved.chests);
const drops = new DropField();
if (saved && saved.seed === seed && saved.drops) drops.load(saved.drops);

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

const TOOL_EMOJI: Record<string, string> = { pickaxe: "⛏️", axe: "🪓", shovel: "🥄", sword: "🗡️" };

/** 아이템 하나를 나타내는 아이콘 글자 (가방 화면 여기저기서 재사용). */
function itemEmoji(item: number): string {
  if (item === Item.Bread) return "🍞";
  if (item === Item.CookedMeat) return "🍖";
  if (item === Item.CookedFish || item === Item.RawFish) return "🐟";
  if (FOOD_HEAL[item] !== undefined) return "🥩";
  if (item === Item.Grain) return "🌾";
  if (item === Item.Bed) return "🛏";
  if (item === Item.Diamond) return "💎";
  if (ARMOR_BY_ID.has(item)) return "🛡";
  if (item === Item.Bow) return "🏹";
  if (item === Item.Arrow) return "➹";
  if (item === Item.DragonHorn) return "📯";
  if (item === Item.DragonScale) return "🐲";
  if (item === Item.Coal) return "⚫";
  if (item === Item.FishingRod) return "🎣";
  if (item === Item.String) return "🧵";
  if (item === Item.Emerald) return "💚";
  if (item === Item.Saddle) return "🏇";
  if (EGG_BY_ITEM.has(item)) return "🥚";
  if (item === Item.GlassBottle) return "⚗️";
  if (POTION_BY_ID.has(item)) return "🧪";
  const tool = TOOL_BY_ID.get(item);
  if (tool) return TOOL_EMOJI[tool.type];
  return "🪵";
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
  if (has(Block.CraftingTable)) unlockAchievement("table");
  if (has(Item.IronIngot)) unlockAchievement("ingot");
  if (has(Item.WoodClub) || has(Item.StoneClub) || has(Item.IronClub) || has(Item.DiamondClub)) unlockAchievement("club");
  if (has(Item.WoodPickaxe) || has(Item.StonePickaxe) || has(Item.IronPickaxe) || has(Item.DiamondPickaxe)) unlockAchievement("pickaxe");
  if (has(Item.Meat) || has(Item.CookedMeat)) unlockAchievement("meat");
  if (has(Item.CookedMeat)) unlockAchievement("cooked");
  if (has(Item.Bed)) unlockAchievement("bed");
  if (has(Block.IronOre)) unlockAchievement("iron");
  if (has(Item.IronClub)) unlockAchievement("ironclub");
  if (has(Item.Grain)) unlockAchievement("harvest");
  if (has(Item.Bread)) unlockAchievement("bread");
  if (has(Block.Torch)) unlockAchievement("torch");
  if (has(Item.Diamond) || has(Block.DiamondOre)) unlockAchievement("diamond");
  if (ARMOR.some((a) => has(a.id))) unlockAchievement("armor");
  if (has(Item.RawFish) || has(Item.CookedFish)) unlockAchievement("fish");
}

// 월드를 만드는 동안 화면이 멈추므로, 먼저 "만드는 중" 문구가 그려지게 한 프레임 기다린다.
await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const world = new World();
const generateStart = performance.now();
world.generate(seed);
const generateMs = Math.round(performance.now() - generateStart);

// 멀티플레이면 서버에서 받은 블록 변화가 이미 editLog에 들어 있고, 아니면 이 판의 저장을 불러온다.
if (remoteSeed === null && saved && saved.seed === seed) editLog.load(saved.edits);
for (const [x, y, z, block] of editLog.toArray()) world.set(x, y, z, block as BlockId);
worldReady = true;

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

// 캐는 중인 블록에 어두운 막이 점점 짙어지는 "금 간" 표시
const crack = new THREE.Mesh(
  new THREE.BoxGeometry(1.006, 1.006, 1.006),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }),
);
crack.visible = false;
scene.add(crack);

// 해골 화살이 날아가는 자취를 짧게 보여 준다.
const arrowGeometry = new THREE.BufferGeometry();
arrowGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const arrowMaterial = new THREE.LineBasicMaterial({ color: 0xf0e6c8, transparent: true, opacity: 0 });
const arrowLine = new THREE.Line(arrowGeometry, arrowMaterial);
scene.add(arrowLine);
let arrowFade = 0;
const ARROW_FADE_SECONDS = 0.22;

function spawnArrow(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): void {
  const position = arrowGeometry.getAttribute("position") as THREE.BufferAttribute;
  position.setXYZ(0, fromX, fromY, fromZ);
  position.setXYZ(1, toX, toY, toZ);
  position.needsUpdate = true;
  arrowFade = ARROW_FADE_SECONDS;
}

// 크리퍼가 터진 자리에 잠깐 커지며 사라지는 불빛.
const explosionMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0, depthWrite: false });
const explosionFx = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), explosionMaterial);
explosionFx.visible = false;
scene.add(explosionFx);
let explosionTimer = 0;
const EXPLOSION_SECONDS = 0.35;

function spawnExplosion(x: number, y: number, z: number): void {
  explosionFx.position.set(x, y, z);
  explosionFx.visible = true;
  explosionTimer = EXPLOSION_SECONDS;
}

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 120);
camera.rotation.order = "YXZ";
// 카메라 자체를 장면에 넣어야, 카메라에 붙인 손 모형(heldHand)도 함께 그려진다.
scene.add(camera);
const heldHand = new HeldHandRenderer(camera);

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
if (saved && saved.seed === seed && !oldWorldSave) {
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

/** 지금 선택한 칸에 든 것 (0이면 빈손). 블록뿐 아니라 도구·검·활도 될 수 있다. */
function heldItem(): number {
  return hotbarBlocks[selectedSlot];
}

/** 1인칭 손 모형이 지금 손에 든 것과 같은 걸 들게 한다. */
function refreshHeldItemView(): void {
  heldHand.setItem(heldItem());
}

/** 캐거나 때리거나 쏠 때 손에 든 것을 한 번 휘두르게 한다. */
function swingHeldItem(): void {
  heldHand.swing();
}

/** 아이템 바 칸마다 아이콘과 이름을 그린다 (블록은 그림, 도구·검 같은 아이템은 글자 아이콘). */
function refreshHotbar(): void {
  checkInventoryAchievements();
  refreshArmor();
  slotElements.forEach((element, i) => {
    const id = hotbarBlocks[i];
    element.replaceChildren();
    if (id === 0) {
      const label = document.createElement("span");
      label.textContent = "맨손";
      element.append(label);
    } else if (isPlaceableBlock(id)) {
      const icon = document.createElement("img");
      icon.src = iconUrl(id);
      icon.alt = itemLabel(id);
      const label = document.createElement("span");
      label.textContent = itemLabel(id);
      element.append(icon, label);
    } else {
      const icon = document.createElement("span");
      icon.className = "hotbar-emoji";
      icon.textContent = itemEmoji(id);
      const label = document.createElement("span");
      label.textContent = itemLabel(id);
      element.append(icon, label);
    }
    if (mode === "survival" && id !== 0) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(inventory.count(id));
      element.append(count);
    }
    element.classList.toggle("empty", mode === "survival" && id !== 0 && inventory.count(id) === 0);
    element.classList.toggle("selected", i === selectedSlot);
  });
  refreshHeldItemView();
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
const equipmentRow = document.getElementById("equipment-row") as HTMLElement;
const craftSection = document.getElementById("craft-section") as HTMLElement;
const craftList = document.getElementById("craft-list") as HTMLElement;
const modeLabel = document.getElementById("mode-label") as HTMLElement;
const slotLabel = document.getElementById("slot-label") as HTMLElement;

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

const xpLevelElement = document.getElementById("xp-level") as HTMLElement;
const xpFillElement = document.getElementById("xp-fill") as HTMLElement;
const xpElement = document.getElementById("xp") as HTMLElement;

/** 경험치 막대와 레벨 숫자를 맞춘다 (창작 모드에서는 숨긴다). */
function refreshXp(): void {
  xpElement.style.display = mode === "creative" ? "none" : "";
  xpLevelElement.textContent = String(experience.level);
  xpFillElement.style.width = Math.round(experience.progress * 100) + "%";
}

/** 경험치를 얻는다 (서바이벌에서만). 레벨이 오르면 알려 준다. */
function gainXp(points: number): void {
  if (mode !== "survival" || !(points > 0)) return;
  const levels = experience.add(points);
  refreshXp();
  if (levels > 0) {
    audio.playLevelUp();
    showToast("⬆ 레벨 " + experience.level + "!", 1800);
    if (experience.level >= 5) unlockAchievement("level5");
    refreshOpenPanels();
  }
  scheduleSave();
}

const effectsElement = document.getElementById("effects") as HTMLElement;
let effectsTimer = 0;

/** 걸려 있는 물약 효과를 화면 위쪽에 보여 준다. */
function refreshEffects(): void {
  effectsElement.replaceChildren();
  for (const [id, seconds] of effects.entries()) {
    const chip = document.createElement("span");
    chip.textContent = EFFECTS[id].emoji + " " + EFFECTS[id].name + " " + Math.ceil(seconds) + "초";
    effectsElement.append(chip);
  }
}

/** 물약을 마신다. 치유는 바로 체력이 차고, 나머지는 한동안 효과가 이어진다. 빈 병은 돌아온다. */
function drinkPotion(item: number): void {
  const potion = POTION_BY_ID.get(item);
  if (!potion || inventory.count(item) === 0) return;
  if (potion.heal > 0 && health.hp >= MAX_HEALTH) {
    showToast("체력이 가득 차서 마실 필요가 없어요");
    return;
  }
  inventory.remove(item);
  inventory.add(Item.GlassBottle, 1);
  if (potion.heal > 0) health.heal(potion.heal);
  if (potion.effect) effects.add(potion.effect);
  audio.playDrink();
  showToast("🧪 " + potion.name + "을(를) 마셨어요", 1800);
  unlockAchievement("potion");
  refreshHearts();
  refreshEffects();
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
}

function eat(item: number): void {
  const heal = FOOD_HEAL[item];
  if (heal === undefined || inventory.count(item) === 0) return;
  if (health.hp >= MAX_HEALTH && hunger.full) {
    showToast("배가 가득 불러서 더 안 먹어도 돼요");
    return;
  }
  inventory.remove(item);
  health.heal(heal);
  hunger.eat(FOOD_HUNGER[item] ?? 0);
  audio.playEat();
  refreshHearts();
  refreshHunger();
  refreshInventoryPanel();
  scheduleSave();
}

/** 창작 모드에서 바로 받을 수 있는 아이템 전부 (블록이 아닌 것 — 도구·방어구·활·재료·음식). */
const GIVEABLE_ITEMS = Object.keys(ITEM_NAMES).map(Number);

/** 창작 모드에서 아이템을 만들거나 캐지 않고 바로 받는다 (도구·방어구·활은 하나, 나머지는 한 칸 가득). */
function giveItem(item: number): void {
  const amount = TOOL_BY_ID.has(item) || ARMOR_BY_ID.has(item) || item === Item.Bow || item === Item.FishingRod || item === Item.Saddle ? 1 : EGG_BY_ITEM.has(item) ? 16 : STACK_MAX;
  const added = inventory.add(item, amount);
  if (added === 0) {
    showToast(itemLabel(item) + "은(는) 이미 있거나 가방이 가득 찼어요");
    return;
  }
  audio.playPickup();
  // 방어구는 자동으로 걸쳐져서 손에 들 필요가 없다. 그 밖의 것(도구·검·활 등)은 받자마자 손에 들려서 바로 쓸 수 있다.
  if (!ARMOR_BY_ID.has(item)) hotbarBlocks[selectedSlot] = item;
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
}

/** 도구·검·활을 지금 고른 아이템 바 칸에 손에 든 것으로 넣는다 (실제 마인크래프트처럼 직접 들어야 쓸 수 있다). */
function holdItem(item: number): void {
  hotbarBlocks[selectedSlot] = item;
  showToast(itemLabel(item) + "을(를) 손에 들었어요");
  refreshHotbar();
  toggleInventory(false);
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
  const hadMaterials = inventory.canCraft(recipe);
  if (!inventory.craft(recipe)) {
    if (hadMaterials) showToast("가방이 가득 찼어요", 2000);
    return;
  }
  audio.playCraft();
  showToast(recipe.name + " ×" + recipe.output[1] + " 만들었어요");
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
}

const stationPanel = document.getElementById("station-panel") as HTMLElement;
const stationList = document.getElementById("station-list") as HTMLElement;
const stationTitle = document.getElementById("station-title") as HTMLElement;
/** 제작대와 양조대는 같은 화면을 쓰고, 양조대에서는 물약 제작법만 보인다. */
let stationMode: "table" | "brewing" = "table";
const stationFilter = (recipe: Recipe): boolean => (stationMode === "brewing" ? recipe.station === "brewing" : recipe.station !== "brewing");
const tradePanel = document.getElementById("trade-panel") as HTMLElement;
const tradeBody = document.getElementById("trade-body") as HTMLElement;
const tradeTitle = document.getElementById("trade-title") as HTMLElement;
let tradeWith: Mob | null = null;
const enchantPanel = document.getElementById("enchant-panel") as HTMLElement;
const enchantBody = document.getElementById("enchant-body") as HTMLElement;
let enchantSelected: number | null = null;
const furnacePanel = document.getElementById("furnace-panel") as HTMLElement;
const furnaceBody = document.getElementById("furnace-body") as HTMLElement;
const chestPanel = document.getElementById("chest-panel") as HTMLElement;
const chestBody = document.getElementById("chest-body") as HTMLElement;
let openChest: { x: number; y: number; z: number } | null = null;
let openFurnace: { x: number; y: number; z: number } | null = null;
let furnaceTimer: number | undefined;

/** 제작 목록을 그린다. 만들 수 있는 것이 위로 온다. */
function renderRecipeRows(container: HTMLElement, filter: (recipe: Recipe) => boolean): void {
  container.replaceChildren();
  const order = RECIPES.map((recipe, index) => ({ recipe, index }))
    .filter(({ recipe }) => filter(recipe))
    .sort((a, b) => Number(inventory.canCraft(b.recipe)) - Number(inventory.canCraft(a.recipe)));
  order.forEach(({ recipe, index }) => {
    const ready = inventory.canCraft(recipe);
    const row = document.createElement("div");
    row.className = "craft-row " + (ready ? "ready" : "locked");
    row.textContent = recipe.name + " ×" + recipe.output[1];
    const need = document.createElement("small");
    need.textContent = "재료: " + recipe.inputs.map(([item, amount]) => itemLabel(item) + " " + inventory.count(item) + "/" + amount).join(", ");
    row.append(need);
    onPress(row, () => craftRecipe(index));
    container.appendChild(row);
  });
}

function closeStations(): void {
  stationPanel.classList.remove("open");
  enchantPanel.classList.remove("open");
  tradePanel.classList.remove("open");
  tradeWith = null;
  enchantSelected = null;
  furnacePanel.classList.remove("open");
  chestPanel.classList.remove("open");
  openChest = null;
  openFurnace = null;
  window.clearInterval(furnaceTimer);
}

function refreshOpenPanels(): void {
  if (inventoryPanel.classList.contains("open")) refreshInventoryPanel();
  if (stationPanel.classList.contains("open")) renderRecipeRows(stationList, stationFilter);
  if (enchantPanel.classList.contains("open")) refreshEnchantPanel();
  if (tradePanel.classList.contains("open")) refreshTradePanel();
  if (furnacePanel.classList.contains("open")) refreshFurnacePanel();
  if (chestPanel.classList.contains("open")) refreshChestPanel();
}

function furnaceButton(text: string, action: () => void): HTMLElement {
  const button = document.createElement("div");
  button.className = "item-chip";
  button.textContent = text;
  onPress(button, action);
  return button;
}

/** 화로 화면: 재료와 연료를 넣고, 다 구워진 것을 꺼낸다. 화면이 열려 있는 동안 0.5초마다 새로 그린다. */
function refreshFurnacePanel(): void {
  if (!openFurnace) return;
  if (world.get(openFurnace.x, openFurnace.y, openFurnace.z) !== Block.Furnace) {
    closeStations();
    return;
  }
  const furnace = furnaces.at(openFurnace.x, openFurnace.y, openFurnace.z, worldSeconds);
  furnaceBody.replaceChildren();

  const status = document.createElement("div");
  status.className = "furnace-line";
  status.textContent = furnace.burning
    ? "🔥 굽는 중… " + Math.round(furnace.progressRatio * 100) + "%"
    : furnace.input
      ? furnace.fuel
        ? "🔥 불을 붙이는 중…"
        : "연료가 없어요. 연료를 넣어 주세요."
      : "재료와 연료를 넣어 보세요.";
  const bar = document.createElement("div");
  bar.className = "furnace-bar";
  const fill = document.createElement("div");
  fill.style.width = Math.round(furnace.progressRatio * 100) + "%";
  bar.append(fill);
  furnaceBody.append(status, bar);

  const line = (label: string, slot: { item: number; count: number } | null, buttons: HTMLElement[]): void => {
    const row = document.createElement("div");
    row.className = "furnace-line";
    const text = document.createElement("span");
    text.textContent = label + ": " + (slot ? itemLabel(slot.item) + " ×" + slot.count : "비었어요");
    row.append(text, ...buttons);
    furnaceBody.append(row);
  };
  const changed = (): void => {
    refreshHotbar();
    scheduleSave();
    refreshFurnacePanel();
  };

  const inputButtons: HTMLElement[] = Object.keys(SMELTS)
    .map(Number)
    .filter((item) => inventory.count(item) > 0 && furnace.canAddInput(item))
    .map((item) =>
      furnaceButton("＋ " + itemLabel(item) + " (" + inventory.count(item) + ")", () => {
        const added = furnace.addInput(item, inventory.count(item));
        inventory.remove(item, added);
        changed();
      }),
    );
  if (furnace.input) {
    inputButtons.push(
      furnaceButton("빼기", () => {
        if (inventory.freeSpace(furnace.input!.item) < furnace.input!.count) {
          showToast("가방이 가득 찼어요", 2000);
          return;
        }
        const taken = furnace.takeInput();
        if (taken) inventory.add(taken.item, taken.count);
        changed();
      }),
    );
  }
  line("재료", furnace.input, inputButtons);

  const fuelButtons: HTMLElement[] = Object.keys(FUELS)
    .map(Number)
    .filter((item) => inventory.count(item) > 0 && furnace.canAddFuel(item))
    .map((item) =>
      furnaceButton("＋ " + itemLabel(item) + " (" + inventory.count(item) + ")", () => {
        const added = furnace.addFuel(item, inventory.count(item));
        inventory.remove(item, added);
        changed();
      }),
    );
  if (furnace.fuel) {
    fuelButtons.push(
      furnaceButton("빼기", () => {
        if (inventory.freeSpace(furnace.fuel!.item) < furnace.fuel!.count) {
          showToast("가방이 가득 찼어요", 2000);
          return;
        }
        const taken = furnace.takeFuel();
        if (taken) inventory.add(taken.item, taken.count);
        changed();
      }),
    );
  }
  line("연료", furnace.fuel, fuelButtons);

  const outputButtons: HTMLElement[] = [];
  if (furnace.output) {
    outputButtons.push(
      furnaceButton("꺼내기", () => {
        if (inventory.freeSpace(furnace.output!.item) < furnace.output!.count) {
          showToast("가방이 가득 찼어요", 2000);
          return;
        }
        const taken = furnace.takeOutput();
        if (!taken) return;
        inventory.add(taken.item, taken.count);
        audio.playCraft();
        showToast(itemLabel(taken.item) + " ×" + taken.count + " 꺼냈어요");
        gainXp((SMELT_XP[taken.item] ?? 0) * taken.count);
        changed();
      }),
    );
  }
  line("결과", furnace.output, outputButtons);
}

/** 상자 화면: 위쪽은 상자 안, 아래쪽은 내 가방. 아이템을 누르면 한 묶음이 반대편으로 옮겨진다. */
function refreshChestPanel(): void {
  if (!openChest) return;
  if (!isChest(world.get(openChest.x, openChest.y, openChest.z))) {
    closeStations();
    return;
  }
  const chest = chests.at(openChest.x, openChest.y, openChest.z);
  chestBody.replaceChildren();
  const section = (title: string, source: Inventory, target: Inventory): void => {
    const heading = document.createElement("div");
    heading.className = "section-title";
    heading.textContent = title;
    const row = document.createElement("div");
    row.className = "items-row";
    const entries = source.entries();
    if (entries.length === 0) row.append("비었어요");
    for (const [item, amount] of entries) {
      row.append(
        chipButton(itemLabel(item) + " ×" + amount, () => {
          if (moveStack(source, target, item) === 0) {
            showToast("자리가 없어요", 1500);
            return;
          }
          audio.playPlace(Block.Planks);
          refreshHotbar();
          scheduleSave();
          refreshChestPanel();
        }),
      );
    }
    chestBody.append(heading, row);
  };
  section("상자 안 " + chest.slotsUsed + "/" + chest.slotCount + "칸 (눌러서 가방으로)", chest, inventory);
  section("내 가방 " + inventory.slotsUsed + "/" + inventory.slotCount + "칸 (눌러서 상자로)", inventory, chest);
}

/** 문을 열거나 닫는다 (아랫부분·윗부분을 함께 바꾼다). */
function toggleDoorAt(x: number, y: number, z: number): void {
  const bottomY = isDoorTop(world.get(x, y, z)) ? y - 1 : y;
  const lower = world.get(x, bottomY, z);
  const upper = world.get(x, bottomY + 1, z);
  if (!isDoor(lower) || !isDoor(upper)) return;
  const closing = isOpenDoor(lower);
  if (closing) {
    for (const cy of [bottomY, bottomY + 1]) {
      if (player.intersectsBlock(x, cy, z) || mobSim.intersectsBlock(x, cy, z)) {
        showToast("누가 서 있어서 문을 닫을 수 없어요", 1800);
        return;
      }
    }
  }
  audio.playPlace(Block.Planks);
  let lightChanged = false;
  for (const [cy, id] of [[bottomY, toggledDoor(lower)], [bottomY + 1, toggledDoor(upper)]]) {
    lightChanged = world.set(x, cy, z, id as BlockId) || lightChanged;
    editLog.record(x, cy, z, id);
    net.sendEdit(x, cy, z, id);
  }
  refreshMesh(x, z, lightChanged);
  scheduleSave();
}

/** 거래 화면: 마을 사람의 직업에 맞는 거래 목록. 낼 것이 있고 받을 자리가 있으면 눌러서 거래한다. */
function refreshTradePanel(): void {
  const villager = tradeWith;
  if (!villager || !mobSim.mobs.includes(villager) || !isProfession(villager.profession)) {
    closeStations();
    return;
  }
  const info = PROFESSION_INFO[villager.profession];
  tradeTitle.textContent = info.name + " (에메랄드가 돈이에요 — 필요한 물건을 팔아 에메랄드를 벌어요)";
  tradeBody.replaceChildren();
  const wallet = document.createElement("div");
  wallet.className = "furnace-line";
  wallet.textContent = "💚 내 에메랄드: " + inventory.count(Item.Emerald);
  tradeBody.append(wallet);
  for (const trade of info.trades) {
    const label = itemLabel(trade.give[0]) + " ×" + trade.give[1] + "  →  " + itemLabel(trade.get[0]) + " ×" + trade.get[1];
    const ready = canTrade(inventory, trade);
    const row = chipButton(label, () => {
      if (!doTrade(inventory, trade)) {
        showToast(inventory.count(trade.give[0]) < trade.give[1] ? "낼 물건이 모자라요" : "가방에 자리가 없거나 이미 가진 물건이에요", 1800);
        return;
      }
      audio.playCraft();
      showToast(itemLabel(trade.get[0]) + " ×" + trade.get[1] + " 거래했어요", 1500);
      gainXp(1);
      refreshHotbar();
      refreshOpenPanels();
      scheduleSave();
    });
    if (!ready) row.classList.add("unequipped");
    tradeBody.append(row);
  }
}

// ---- 말 타기
/** 눈 높이. 말을 타면 말 등 위로 높아진다. */
function eyeY(): number {
  return player.y + EYE_HEIGHT + (mount ? 0.6 : 0);
}
const HORSE_SPEED_FACTOR = 2;
const HORSE_JUMP_FACTOR = 1.3;
let mount: Mob | null = null;

function dismount(): void {
  if (!mount) return;
  mount.ridden = false;
  mount = null;
  showToast("말에서 내렸어요");
}

/** 보고 있는 말에 안장이 있으면 올라탄다. */
function tryRide(): boolean {
  const mob = mobInSight(currentTarget());
  if (!mob || mob.kind !== "horse") return false;
  if (mode === "survival" && !mob.tamed) {
    showToast("야생 말이에요 — 밀 3개를 먹여서(놓기) 먼저 길들여 주세요", 3000);
    return true;
  }
  if (mode === "survival" && inventory.count(Item.Saddle) === 0) {
    showToast("안장이 있어야 탈 수 있어요 (제작대: 양털 3 + 철 주괴 1, 사냥꾼에게서도 살 수 있어요)", 3000);
    return true;
  }
  mount = mob;
  mob.ridden = true;
  stopFishing();
  audio.playMob("horse", 1);
  showToast("🐎 말에 올라탔어요! 사용 버튼으로 내려요", 2600);
  return true;
}

/** 보고 있는 마을 사람 (없으면 null). */
function villagerInSight(): Mob | null {
  const mob = mobInSight(currentTarget());
  return mob && mob.kind === "villager" ? mob : null;
}

/** 마을 사람과 거래를 시작한다. */
function openTrade(villager: Mob): void {
  if (mode === "creative") {
    showToast("창작 모드에서는 거래가 필요 없어요");
    return;
  }
  toggleInventory(false);
  closeStations();
  audio.playMob("villager", 1);
  tradeWith = villager;
  tradePanel.classList.add("open");
  refreshTradePanel();
}

/** 도구·방어구·활에 붙은 인챈트를 "✨효율 Ⅱ, 내구성 Ⅰ" 처럼 보여 준다 (없으면 빈 글자). */
function enchantSuffix(item: number): string {
  const list = inventory.enchantsOf(item);
  return list.length === 0 ? "" : " ✨" + list.map(([id, level]) => enchantLabel(id, level)).join(", ");
}

/** 인챈트 테이블 화면: 인챈트할 아이템을 고르고, 레벨을 내고 단계를 고르면 무작위 인챈트가 붙는다. */
function refreshEnchantPanel(): void {
  enchantBody.replaceChildren();
  const info = document.createElement("div");
  info.className = "furnace-line";
  info.textContent = "내 경험치 레벨: " + experience.level + " (몬스터 사냥, 광석 캐기, 화로 굽기로 모아요)";
  enchantBody.append(info);

  const items = inventory.entries().map(([item]) => item).filter(isEnchantable);
  if (enchantSelected !== null && !items.includes(enchantSelected)) enchantSelected = null;
  const row = document.createElement("div");
  row.className = "items-row";
  if (items.length === 0) row.append("인챈트할 도구·방어구·활이 가방에 없어요");
  for (const item of items) {
    const chip = chipButton(itemEmoji(item) + " " + itemLabel(item) + enchantSuffix(item), () => {
      enchantSelected = item;
      refreshEnchantPanel();
    });
    if (item === enchantSelected) chip.classList.add("equipped");
    row.append(chip);
  }
  enchantBody.append(row);

  if (enchantSelected === null) return;
  const target = enchantSelected;
  const tiers = document.createElement("div");
  tiers.className = "items-row";
  for (const tier of ENCHANT_TIERS) {
    const enough = experience.level >= tier;
    const button = chipButton("단계 " + "ⅠⅡⅢ"[tier - 1] + " (레벨 " + tier + " 사용)" + (enough ? "" : " — 레벨 부족"), () => doEnchant(target, tier));
    if (!enough) button.classList.add("unequipped");
    tiers.append(button);
  }
  enchantBody.append(tiers);
}

function doEnchant(item: number, tier: number): void {
  if (experience.level < tier) {
    showToast("경험치 레벨이 모자라요", 1800);
    return;
  }
  const roll = rollEnchant(item, tier, Math.random);
  if (!roll || !inventory.addEnchant(item, roll.id, roll.level)) return;
  experience.spendLevels(tier);
  audio.playEnchant();
  showToast("✨ " + itemLabel(item) + "에 " + enchantLabel(roll.id, roll.level) + " 이(가) 붙었어요!", 2600);
  unlockAchievement("enchant");
  refreshXp();
  refreshOpenPanels();
  scheduleSave();
}

/** 가리키고 있는 제작대·화로를 연다. (마인크래프트에서 블록을 우클릭하는 것과 같다.) */
function useBlock(): void {
  if (mount) {
    dismount();
    return;
  }
  if (tryRide()) return;
  const villager = villagerInSight();
  if (villager) {
    openTrade(villager);
    return;
  }
  const hit = currentTarget();
  if (!hit) return;
  const block = world.get(hit.x, hit.y, hit.z);
  if (isDoor(block)) {
    toggleDoorAt(hit.x, hit.y, hit.z);
    return;
  }
  if (isChest(block)) {
    toggleInventory(false);
    closeStations();
    openChest = { x: hit.x, y: hit.y, z: hit.z };
    chestPanel.classList.add("open");
    refreshChestPanel();
    return;
  }
  if (block !== Block.CraftingTable && block !== Block.Furnace && block !== Block.EnchantTable && block !== Block.BrewingStand) return;
  if (mode === "creative") {
    showToast("창작 모드에서는 제작이 필요 없어요");
    return;
  }
  toggleInventory(false);
  closeStations();
  if (block === Block.CraftingTable || block === Block.BrewingStand) {
    stationMode = block === Block.BrewingStand ? "brewing" : "table";
    stationTitle.textContent = block === Block.BrewingStand ? "양조대 (유리병에 재료를 넣어 물약을 만들어요)" : "제작대 (초록 테두리는 만들 수 있어요)";
    stationPanel.classList.add("open");
    renderRecipeRows(stationList, stationFilter);
  } else if (block === Block.EnchantTable) {
    enchantPanel.classList.add("open");
    refreshEnchantPanel();
  } else {
    openFurnace = { x: hit.x, y: hit.y, z: hit.z };
    furnacePanel.classList.add("open");
    refreshFurnacePanel();
    furnaceTimer = window.setInterval(refreshFurnacePanel, 500);
  }
}

const ARMOR_SLOT_NAMES: Record<ArmorSlot, string> = { helmet: "투구", chestplate: "흉갑", leggings: "바지", boots: "부츠" };
const ARMOR_SLOT_ORDER: ArmorSlot[] = ["helmet", "chestplate", "leggings", "boots"];

/** 지금 손에 든 것과, 부위별로 걸친 방어구(투구·흉갑·바지·부츠는 동시에 다 걸칠 수 있다)를 한눈에 보여준다. */
function refreshEquipmentPanel(): void {
  equipmentRow.replaceChildren();

  const held = heldItem();
  const heldChip = document.createElement("div");
  heldChip.className = "item-chip " + (held === 0 ? "unequipped" : "equipped");
  heldChip.textContent = "✋ 손: " + (held === 0 ? "맨손" : itemLabel(held) + enchantSuffix(held));
  equipmentRow.appendChild(heldChip);

  const worn = bestArmor((id) => inventory.count(id) > 0);
  for (const slot of ARMOR_SLOT_ORDER) {
    const def = worn.find((a) => a.slot === slot);
    const chip = document.createElement("div");
    chip.className = "item-chip " + (def ? "equipped" : "unequipped");
    chip.textContent = ARMOR_SLOT_NAMES[slot] + ": " + (def ? itemLabel(def.id) + " (방어 " + def.points + ")" + enchantSuffix(def.id) : "없음");
    equipmentRow.appendChild(chip);
  }

  const totalChip = document.createElement("div");
  totalChip.className = "item-chip";
  totalChip.textContent = "🛡 방어 총합 " + totalArmorPoints((id) => inventory.count(id) > 0);
  equipmentRow.appendChild(totalChip);
}

function refreshInventoryPanel(): void {
  const survival = mode === "survival";
  modeLabel.textContent = survival ? "서바이벌: 블록을 모아서 써요" : "창작: 블록이 무한이에요";
  slotLabel.textContent = survival ? "가방 " + inventory.slotsUsed + "/" + inventory.slotCount + "칸" : "";
  refreshEquipmentPanel();

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
  itemsTitle.style.display = survival ? (extras.length > 0 ? "" : "none") : "";
  itemsTitle.textContent = survival ? "아이템" : "아이템 바로 받기 (눌러서 무한으로 받아요)";
  if (!survival) {
    for (const item of GIVEABLE_ITEMS) {
      const chip = document.createElement("div");
      chip.className = "item-chip giveable";
      chip.textContent = itemEmoji(item) + " " + itemLabel(item);
      onPress(chip, () => giveItem(item));
      itemsRow.appendChild(chip);
    }
  } else {
    for (const [item, amount] of extras) {
      const chip = document.createElement("div");
      chip.className = "item-chip";
      if (FOOD_HEAL[item] !== undefined) {
        chip.classList.add("eatable");
        const emoji =
          item === Item.Bread ? "🍞" : item === Item.CookedMeat ? "🍖" : item === Item.CookedFish || item === Item.RawFish ? "🐟" : "🥩";
        chip.textContent = emoji + " " + itemLabel(item) + " ×" + amount + " (눌러서 먹기)";
        onPress(chip, () => eat(item));
      } else if (item === Item.Grain) {
        chip.textContent = "🌾 " + itemLabel(item) + " ×" + amount + " (3개로 빵을 만들어요)";
      } else if (item === Item.Bed) {
        chip.classList.add("eatable");
        chip.textContent = "🛏 " + itemLabel(item) + " ×" + amount + " (밤에 눌러서 자기)";
        onPress(chip, sleepInBed);
      } else if (POTION_BY_ID.has(item)) {
        chip.classList.add("eatable");
        chip.textContent = "🧪 " + itemLabel(item) + " ×" + amount + " (눌러서 마시기)";
        onPress(chip, () => drinkPotion(item));
      } else if (item === Item.Diamond) {
        chip.textContent = "💎 " + itemLabel(item) + " ×" + amount;
      } else if (ARMOR_BY_ID.has(item)) {
        const def = ARMOR_BY_ID.get(item)!;
        chip.textContent = "🛡 " + itemLabel(item) + " (방어 " + def.points + ", 알아서 걸쳐요)" + enchantSuffix(item);
      } else if (item === Item.Bow) {
        chip.textContent = "🏹 " + itemLabel(item) + " (손에 들면, 화살이 있을 때 먼 동물·괴물을 쏴요)" + enchantSuffix(item);
        onPress(chip, () => holdItem(item));
      } else if (EGG_BY_ITEM.has(item)) {
        chip.textContent = "🥚 " + itemLabel(item) + " ×" + amount + " (손에 들고 땅을 향해 놓기를 누르면 나타나요)";
        onPress(chip, () => holdItem(item));
      } else if (item === Item.FishingRod) {
        chip.textContent = "🎣 " + itemLabel(item) + " (손에 들고 물을 향해 놓기를 눌러 던지고, 물면 다시 눌러요)";
        onPress(chip, () => holdItem(item));
      } else if (item === Item.Arrow) {
        chip.textContent = "➹ " + itemLabel(item) + " ×" + amount;
      } else if (item === Item.DragonHorn) {
        chip.textContent = "📯 " + itemLabel(item) + " ×" + amount + " (놓기를 누르면 드래곤을 불러내요)";
      } else {
        const def = TOOL_BY_ID.get(item);
        if (def) {
          chip.textContent = TOOL_EMOJI[def.type] + " " + itemLabel(item) + " ×" + amount + " (내구도 " + inventory.toolLeft(item) + "/" + toolDurability(def) + ", 손에 들면 써요)" + enchantSuffix(item);
          onPress(chip, () => holdItem(item));
        } else {
          chip.textContent = itemEmoji(item) + " " + itemLabel(item) + " ×" + amount;
        }
      }
      itemsRow.appendChild(chip);
    }
  }

  craftSection.style.display = survival ? "" : "none";
  renderRecipeRows(craftList, (recipe) => !recipe.station);
}

onPress(document.getElementById("station-close") as HTMLElement, closeStations);
onPress(document.getElementById("furnace-close") as HTMLElement, closeStations);
onPress(document.getElementById("chest-close") as HTMLElement, closeStations);
onPress(document.getElementById("enchant-close") as HTMLElement, closeStations);
onPress(document.getElementById("trade-close") as HTMLElement, closeStations);

onPress(document.getElementById("mode-toggle") as HTMLElement, () => {
  mode = mode === "survival" ? "creative" : "survival";
  showToast(mode === "survival" ? "서바이벌 방식으로 바꿨어요" : "창작 방식으로 바꿨어요");
  refreshXp();
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
  return raycast(world, player.x, eyeY(), player.z, dx, dy, dz, REACH);
}

/** 시선 앞에 있는 동물 (블록보다 가까이 있을 때만). range를 넘겨 활처럼 더 먼 거리도 볼 수 있다. */
function mobInSight(blockHit: RayHit | null, range = REACH): Mob | null {
  // 내가 타고 있는 말은 조준 대상이 아니다.
  const ex = player.x;
  const ey = eyeY();
  const ez = player.z;
  const [dx, dy, dz] = lookDirection(player.yaw, player.pitch);
  const found = raycastMobs(
    mobSim.mobs.filter((m) => !m.ridden),
    ex,
    ey,
    ez,
    dx,
    dy,
    dz,
    range,
  );
  if (!found) return null;
  const blockDistance = blockHit ? Math.hypot(blockHit.x + 0.5 - ex, blockHit.y + 0.5 - ey, blockHit.z + 0.5 - ez) - 0.5 : Infinity;
  return found.distance > blockDistance ? null : found.mob;
}

/** 활 사정거리 안의 블록까지 (멀리 있는 벽에 가려지면 쏘지 못하게 확인할 때 쓴다). */
function farTarget(): RayHit | null {
  const [dx, dy, dz] = lookDirection(player.yaw, player.pitch);
  return raycast(world, player.x, eyeY(), player.z, dx, dy, dz, BOW_RANGE);
}

function toolBroke(tool: ToolDef): void {
  showToast("🔧 " + itemLabel(tool.id) + ": 부러졌어요!");
  refreshHotbar();
}

/** 동물이 죽으면 (플레이어가 때렸든, 활로 맞혔든, 늑대가 대신 잡았든) 도전 과제를 챙기고 전리품을 놓는다. */
function handleMobKill(kind: MobKind, x: number, y: number, z: number, baby = false): void {
  if (kind === "zombie") unlockAchievement("zombie");
  if (kind === "skeleton") unlockAchievement("skeleton");
  if (kind === "creeper") unlockAchievement("creeper");
  if (kind === "spider") unlockAchievement("spider");
  if (kind === "dragon") {
    unlockAchievement("dragon");
    showToast("🐉 드래곤을 물리쳤어요!", 3500);
  }
  gainXp(MOB_XP[kind] ?? 0);
  // 새끼는 아무것도 떨구지 않는다.
  const loot = mode === "survival" && !baby ? mobDrops(kind, Math.random) : [];
  for (const [item, amount] of loot) drops.spawn(item, amount, x, y + 0.3, z, Math.random);
  if (loot.length > 0) scheduleSave();
}

/** 동물을 한 번 때린다. 서바이벌에서는 손에 든 게 검이어야 검 공격력이 나오고, 검이 닳는다. */
function attackMob(mob: Mob): void {
  audio.playMobHit();
  swingHeldItem();
  const held = heldItem();
  const heldTool = TOOL_BY_ID.get(held);
  const sword = mode === "survival" && heldTool?.type === "sword" && inventory.count(held) > 0 ? heldTool : null;
  const damage =
    mode === "creative"
      ? 4
      : (sword ? SWORD_DAMAGE[sword.tier] + sharpnessBonus(inventory.enchantLevel(sword.id, "sharpness")) : 1) + effects.attackBonus();
  if (sword && inventory.useTool(sword.id)) toolBroke(sword);
  if (mobSim.hit(mob, player.x, player.z, damage)) handleMobKill(mob.kind, mob.x, mob.y, mob.z, mob.baby);
}

/** 검이 닿지 않는 먼 동물을 활로 쏜다 (화살 하나를 쓰고, 맞으면 즉시 명중한다 — 날아가는 시간은 생략). */
const BOW_RANGE = 20;
const BOW_DAMAGE = 4;

function shootBow(mob: Mob): void {
  inventory.remove(Item.Arrow, 1);
  audio.playArrow();
  swingHeldItem();
  const spec = MOB_SPECS[mob.kind];
  spawnArrow(player.x, eyeY(), player.z, mob.x, mob.y + spec.height * 0.6, mob.z);
  if (mobSim.hit(mob, player.x, player.z, BOW_DAMAGE * powerMultiplier(inventory.enchantLevel(Item.Bow, "power")))) handleMobKill(mob.kind, mob.x, mob.y, mob.z, mob.baby);
  unlockAchievement("bow");
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
}

/** 빛(횃불)이 바뀌었으면 15칸 너머까지, 아니면 그 자리만 다시 그린다. */
function refreshMesh(x: number, z: number, lightChanged: boolean): void {
  if (lightChanged) worldMesh.updateArea(x, z, 16);
  else worldMesh.updateBlock(x, z);
}

/** 블록을 놓거나 없앤 뒤 주변을 정리한다: 울타리 이음새는 바로 맞추고, 받침을 잃은 모래·자갈은 잠깐 뒤에 떨어뜨린다. */
function afterBlockChange(x: number, y: number, z: number): void {
  const fenceChanges = refreshFences(world, x, y, z);
  for (const c of fenceChanges) {
    editLog.record(c.x, c.y, c.z, c.block);
    net.sendEdit(c.x, c.y, c.z, c.block);
    refreshMesh(c.x, c.z, false);
  }
  if (fenceChanges.length > 0) scheduleSave();
  window.setTimeout(() => settleColumn(x, y, z), 150);
}

/** 놓은 자리(모래를 놓았을 때)와 그 바로 위(받침을 없앴을 때)에서 떨어질 것이 있으면 떨어뜨린다. */
function settleColumn(x: number, y: number, z: number): void {
  for (const startY of [y, y + 1]) {
    const result = settleFrom(world, x, startY, z);
    if (result.moves.length === 0) continue;
    for (const move of result.moves) {
      editLog.record(x, move.fromY, z, Block.Air);
      editLog.record(x, move.toY, z, move.block);
      net.sendEdit(x, move.fromY, z, Block.Air);
      net.sendEdit(x, move.toY, z, move.block);
    }
    audio.playPlace(Block.Sand);
    refreshMesh(x, z, result.lightChanged);
    scheduleSave();
  }
}

/** 블록 하나를 없앤다. 서바이벌이면 (얻을 수 있을 때) 나오는 것들을 가방에 넣는다. */
function removeBlock(x: number, y: number, z: number, harvest = true): boolean {
  const broken = world.get(x, y, z);
  if (broken === Block.Furnace) {
    const contents = furnaces.remove(x, y, z, worldSeconds);
    if (mode === "survival") for (const slot of contents) drops.spawn(slot.item, slot.count, x + 0.5, y + 0.3, z + 0.5, Math.random);
    if (openFurnace && openFurnace.x === x && openFurnace.y === y && openFurnace.z === z) closeStations();
  }
  if (isChest(broken)) {
    const contents = chests.remove(x, y, z);
    if (mode === "survival") for (const [item, amount] of contents) drops.spawn(item, amount, x + 0.5, y + 0.3, z + 0.5, Math.random);
    if (openChest && openChest.x === x && openChest.y === y && openChest.z === z) closeStations();
  }
  if (mode === "survival") {
    if (harvest) {
      const gained = dropsFor(broken, Math.random);
      for (const [item, amount] of gained) drops.spawn(item, amount, x + 0.5, y + 0.4, z + 0.5, Math.random);
      if (gained.some(([item]) => item === Block.Sprout) && broken === Block.Grass) showToast("밀 씨앗을 얻었어요");
    }
    refreshHotbar();
  }
  const lightChanged = world.set(x, y, z, Block.Air);
  editLog.record(x, y, z, Block.Air);
  net.sendEdit(x, y, z, Block.Air);
  crops.remove(x, y, z);
  afterBlockChange(x, y, z);
  // 문은 두 칸짜리라, 한쪽을 부수면 나머지 반쪽도 같이 사라진다 (문은 아랫부분이 하나만 준다).
  if (isDoor(broken)) {
    const otherY = isDoorTop(broken) ? y - 1 : y + 1;
    if (isDoor(world.get(x, otherY, z))) return removeBlock(x, otherY, z, harvest) || lightChanged;
  }
  return lightChanged;
}

/** 블록 하나를 다 캐서 없앤다 (소리, 아이템, 도구 닳기 포함). */
function breakAt(hit: RayHit, tool: ToolDef | null): void {
  const broken = world.get(hit.x, hit.y, hit.z);
  audio.playBreak(broken);
  const survival = mode === "survival";
  const harvest = !survival || canHarvest(broken, tool);
  const lightChanged = removeBlock(hit.x, hit.y, hit.z, harvest);
  if (survival && !harvest) showToast("맞는 곡괭이가 없어서 아무것도 안 나왔어요");
  if (survival && harvest) gainXp(BLOCK_XP[broken] ?? 0);
  if (survival && tool && breakSeconds(broken, null) > 0 && inventory.useTool(tool.id)) toolBroke(tool);
  // 밑이 사라진 식물은 서 있을 곳이 없으니 같이 뽑힌다.
  if (isPlant(world.get(hit.x, hit.y + 1, hit.z))) removeBlock(hit.x, hit.y + 1, hit.z);
  refreshMesh(hit.x, hit.z, lightChanged);
  scheduleSave();
}

// ---- 캐기: 부수기를 누르고 있는 동안 조금씩 진행된다 (창작 모드는 바로바로).
let mining: { x: number; y: number; z: number } | null = null;
let miningProgress = 0;
let attackCooldown = 0;
let breakCooldown = 0;
let mineSoundTimer = 0;

function resetMining(): void {
  mining = null;
  miningProgress = 0;
  crack.visible = false;
}

function updateMining(dt: number): void {
  attackCooldown = Math.max(0, attackCooldown - dt);
  breakCooldown = Math.max(0, breakCooldown - dt);
  if (!controls.consumeBreak()) {
    resetMining();
    return;
  }

  const hit = currentTarget();
  const mob = mobInSight(hit);
  if (mob) {
    resetMining();
    if (attackCooldown <= 0) {
      attackCooldown = 0.45;
      attackMob(mob);
    }
    return;
  }

  // 검이 닿지 않는 곳의 동물·괴물은, 활과 화살이 있으면 대신 쏜다.
  if (mode === "survival" && heldItem() === Item.Bow && inventory.count(Item.Bow) > 0 && inventory.count(Item.Arrow) > 0) {
    const farMob = mobInSight(farTarget(), BOW_RANGE);
    if (farMob) {
      resetMining();
      if (attackCooldown <= 0) {
        attackCooldown = 0.6;
        shootBow(farMob);
      }
      return;
    }
  }

  if (!hit || hit.y === 0) {
    resetMining();
    return;
  }

  if (mode === "creative") {
    if (breakCooldown <= 0) {
      breakCooldown = 0.22;
      breakAt(hit, null);
    }
    return;
  }

  if (!mining || mining.x !== hit.x || mining.y !== hit.y || mining.z !== hit.z) {
    mining = { x: hit.x, y: hit.y, z: hit.z };
    miningProgress = 0;
    mineSoundTimer = 0;
  }
  const block = world.get(hit.x, hit.y, hit.z);
  const held = heldItem();
  const heldToolDef = TOOL_BY_ID.get(held);
  const tool = heldToolDef && inventory.count(held) > 0 ? heldToolDef : null;
  const needed = breakSeconds(block, tool, tool ? efficiencyMultiplier(inventory.enchantLevel(tool.id, "efficiency")) : 1);
  miningProgress += dt;

  mineSoundTimer -= dt;
  if (needed > 0 && mineSoundTimer <= 0) {
    mineSoundTimer = 0.25;
    swingHeldItem();
    audio.playMining(block);
  }
  if (miningProgress >= needed) {
    breakAt(hit, tool);
    resetMining();
    return;
  }
  crack.visible = true;
  crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  (crack.material as THREE.MeshBasicMaterial).opacity = Math.min(1, miningProgress / needed) * 0.6;
}

// ---- 낚시: 낚싯대를 손에 들고 물을 향해 놓기를 누르면 던지고, 물었을 때 다시 누르면 잡는다.
const fishing = new Fishing();
const bobber = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xe03030 }));
bobber.visible = false;
scene.add(bobber);
const bobberBase = { x: 0, y: 0, z: 0 };

/** 바라보는 방향으로 팔이 닿는 거리 안에서 처음 만나는 물 칸 (물 앞에 단단한 블록이 있으면 없음). */
function findWaterAhead(): { x: number; y: number; z: number } | null {
  const [dx, dy, dz] = lookDirection(player.yaw, player.pitch);
  const ex = player.x;
  const ey = eyeY();
  const ez = player.z;
  for (let t = 0.5; t <= 8; t += 0.25) {
    const x = Math.floor(ex + dx * t);
    const y = Math.floor(ey + dy * t);
    const z = Math.floor(ez + dz * t);
    const block = world.get(x, y, z);
    if (block === Block.Water) return { x, y, z };
    if (world.isSolid(x, y, z)) return null;
  }
  return null;
}

function stopFishing(): void {
  fishing.cancel();
  bobber.visible = false;
}

/** 낚싯줄을 당긴다. 물었을 때 당기면 잡힌다. */
function reelIn(): void {
  const result = fishing.reel(Math.random);
  bobber.visible = false;
  if (result.kind !== "catch") {
    showToast("아무것도 안 잡혔어요 — 찌가 흔들릴 때 당겨 보세요");
    return;
  }
  const { item, count, xp } = result.loot;
  const added = inventory.add(item, count);
  if (added < count) drops.spawn(item, count - added, player.x, player.y + 1, player.z, Math.random);
  audio.playPickup();
  showToast("🎣 " + itemLabel(item) + (count > 1 ? " ×" + count : "") + "을(를) 낚았어요!", 2200);
  gainXp(xp);
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
}

/** 낚싯대를 들고 있으면 낚시 동작을 한다 (던지기 / 당기기). 낚싯대를 안 들었으면 false. */
function tryFish(): boolean {
  if (heldItem() !== Item.FishingRod) return false;
  if (mode === "survival" && inventory.count(Item.FishingRod) === 0) return false;
  swingHeldItem();
  if (fishing.state !== "idle") {
    reelIn();
    return true;
  }
  const water = findWaterAhead();
  if (!water) {
    showToast("물을 향해 던져 주세요");
    return true;
  }
  fishing.cast(Math.random);
  bobberBase.x = water.x + 0.5;
  bobberBase.y = water.y + 0.85;
  bobberBase.z = water.z + 0.5;
  bobber.position.set(bobberBase.x, bobberBase.y, bobberBase.z);
  bobber.visible = true;
  audio.splash();
  showToast("🎣 낚싯줄을 던졌어요… 찌가 움직이면 다시 눌러요", 2200);
  return true;
}

/** 매 프레임 낚시를 진행한다: 찌가 흔들리고, 물고기가 물면 알려 준다. 멀어지거나 낚싯대를 내려놓으면 줄이 풀린다. */
function updateFishing(dt: number, seconds: number): void {
  if (fishing.state === "idle") return;
  const farAway = Math.hypot(bobberBase.x - player.x, bobberBase.z - player.z) > MAX_LINE_DISTANCE;
  if (heldItem() !== Item.FishingRod || farAway) {
    stopFishing();
    return;
  }
  const event = fishing.update(dt);
  if (event === "bite") {
    audio.splash();
    showToast("❗ 물었어요! 지금 당겨요!", 1500);
  } else if (event === "missed") {
    bobber.visible = false;
    showToast("놓쳤어요… 다시 던져 보세요");
    return;
  }
  const biting = fishing.state === "bite";
  bobber.position.y = bobberBase.y + (biting ? -0.12 + Math.sin(seconds * 30) * 0.05 : Math.sin(seconds * 3) * 0.03);
}

/** 밀을 가지고 돼지·양을 보며 놓기를 누르면 먹인다. 먹은 같은 종류 둘이 만나면 새끼가 태어난다. */
function tryBreed(): boolean {
  const mob = mobInSight(currentTarget());
  if (!mob || !BREEDABLE.has(mob.kind) || mode !== "survival" || inventory.count(Item.Grain) === 0) return false;
  if (!mobSim.feed(mob)) {
    showToast("지금은 먹이를 줄 수 없어요 (새끼이거나 방금 새끼를 낳았어요)");
    return true;
  }
  inventory.remove(Item.Grain, 1);
  audio.playEat();
  showToast("💕 밀을 먹었어요! 같은 동물이 가까이 오면 새끼가 태어나요", 2400);
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
  return true;
}

/** 길들일 수 있는 동물을 보고 맞는 먹이가 가방에 있으면, 블록을 놓는 대신 먹여서 길들인다. (늑대 뼈, 돼지 빵, 양 밀 씨앗, 말 밀 3개) */
function tryTame(): boolean {
  const mob = mobInSight(currentTarget());
  if (!mob || mob.tamed || mode !== "survival") return false;
  const food = TAME_FOODS[mob.kind];
  if (!food || mob.baby || inventory.count(food.item) === 0) return false;
  const result = mobSim.feedTame(mob, food.item);
  if (result === "no") return false;
  inventory.remove(food.item, 1);
  audio.playEat();
  if (result === "progress") {
    showToast("🍽 먹이를 먹었어요 (" + mob.tameProgress + "/" + food.need + ")", 2000);
  } else {
    audio.playCraft();
    audio.playMob(mob.kind, 1);
    const fighter = mob.kind === "wolf" ? " 이제 따라다니며 대신 싸워줘요" : mob.kind === "horse" ? " 안장을 얹어 탈 수 있어요" : " 이제 따라다녀요";
    showToast("💕 " + (mob.kind === "wolf" ? "늑대" : mob.kind === "pig" ? "돼지" : mob.kind === "sheep" ? "양" : "말") + "을(를) 길들였어요!" + fighter, 3000);
    if (mob.kind === "wolf") unlockAchievement("wolf");
    unlockAchievement("pet");
  }
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
  return true;
}

/** 스폰 알을 손에 들고 땅을 향해 놓기를 누르면, 그 자리에 동물이 나타난다. */
function tryUseEgg(): boolean {
  const egg = EGG_BY_ITEM.get(heldItem());
  if (!egg) return false;
  if (mode === "survival" && inventory.count(egg.item) === 0) return false;
  const hit = currentTarget();
  if (!hit) {
    showToast("땅이나 블록을 향해 놓아 주세요");
    return true;
  }
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz) || !isPassable(world.get(px, py, pz))) return true;
  if (egg.kind === "fish" && world.get(px, py, pz) !== Block.Water) {
    showToast("물고기 알은 물속에 놓아 주세요");
    return true;
  }
  if (mode === "survival") inventory.remove(egg.item, 1);
  const x = px + 0.5;
  const z = pz + 0.5;
  if (egg.kind === "dragon") mobSim.summonDragon(x, py, z, Math.random);
  else mobSim.spawn(egg.kind, x, py, z, Math.random, true);
  audio.playMob(egg.kind, 1);
  swingHeldItem();
  showToast("🥚 " + egg.name.replace(" 알", "") + " 등장!", 1800);
  refreshHotbar();
  refreshOpenPanels();
  scheduleSave();
  return true;
}

/** 용의 뿔을 가지고 놓기를 누르면, 바라보는 자리에 드래곤을 불러낸다. */
function tryUseDragonHorn(): boolean {
  if (inventory.count(Item.DragonHorn) === 0) return false;
  const hit = currentTarget();
  if (!hit) return false;
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz)) return false;
  inventory.remove(Item.DragonHorn, 1);
  mobSim.summonDragon(px + 0.5, py, pz + 0.5, Math.random);
  audio.playMob("dragon", 1);
  showToast("🐉 드래곤이 나타났어요! 조심하세요", 3000);
  unlockAchievement("summon");
  refreshHotbar();
  scheduleSave();
  return true;
}

function placeBlock(): void {
  if (tryFish()) return;
  if (tryUseEgg()) return;
  if (tryTame()) return;
  if (tryBreed()) return;
  if (tryRide()) return;
  const villager = villagerInSight();
  if (villager) {
    openTrade(villager);
    return;
  }
  if (tryUseDragonHorn()) return;
  const hit = currentTarget();
  if (!hit) return;
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz) || !isPassable(world.get(px, py, pz))) return;
  if (player.intersectsBlock(px, py, pz) || mobSim.intersectsBlock(px, py, pz)) return;
  const block = hotbarBlocks[selectedSlot];
  const placement = isPlaceableBlock(block) ? placementFor(block, [px - hit.x, py - hit.y, pz - hit.z], player.yaw) : null;
  if (isPlaceableBlock(block) && !placement) {
    showToast(blockName(block) + "은(는) 벽의 옆면을 눌러서 붙일 수 있어요");
    return;
  }
  // 문처럼 위로 한 칸 더 차지하는 블록은, 그 칸들이 모두 비어 있어야 한다.
  for (const [dy] of placement?.cells ?? []) {
    if (dy === 0) continue;
    const cy = py + dy;
    if (!world.inBounds(px, cy, pz) || !isPassable(world.get(px, cy, pz)) || player.intersectsBlock(px, cy, pz) || mobSim.intersectsBlock(px, cy, pz)) {
      showToast(blockName(block) + "을(를) 놓을 공간이 모자라요");
      return;
    }
  }
  if (!isPlaceableBlock(block)) {
    showToast(block === 0 ? "빈손이에요 — 놓을 블록을 골라 주세요" : itemLabel(block) + "은(는) 놓을 수 없어요");
    return;
  }
  if (isPlant(block) && (world.get(px, py, pz) !== Block.Air || !canPlaceAt(block, world.get(px, py - 1, pz)))) {
    showToast(blockName(block) + (block === Block.Torch ? "은(는) 물 밖의 단단한 블록 위에만 세울 수 있어요" : "은(는) 풀이나 흙 위에만 심을 수 있어요"));
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
  let lightChanged = false;
  for (const [dy, id] of placement?.cells ?? []) {
    lightChanged = world.set(px, py + dy, pz, id as BlockId) || lightChanged;
    editLog.record(px, py + dy, pz, id);
    net.sendEdit(px, py + dy, pz, id);
  }
  for (const [dy] of placement?.cells ?? []) afterBlockChange(px, py + dy, pz);
  if (block === Block.Sprout) crops.plant(px, py, pz, worldSeconds);
  refreshMesh(px, pz, lightChanged);
  scheduleSave();
}


function saveNow(): void {
  if (resetting) return;
  const data: SaveData = {
    version: 1,
    worldVersion: WORLD_VERSION,
    seed,
    edits: editLog.toArray(),
    player: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch },
    time: worldSeconds,
    hotbar: hotbarBlocks,
    mode,
    inventory: inventory.entries(),
    durability: inventory.wearEntries(),
    crops: crops.toArray(),
    furnaces: furnaces.toArray(),
    chests: chests.toArray(),
    drops: drops.toArray(),
    achievements: achievements.toArray(),
    hunger: hunger.value,
    xp: experience.toArray(),
    enchants: inventory.enchantEntries(),
    effects: effects.entries(),
    pets: mobSim.mobs.filter((m) => m.tamed).map((m): [string, number, number, number, number] => [m.kind, m.x, m.y, m.z, m.baby ? 1 : 0]),
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
const dropRenderer = new DropRenderer(scene);
const avatarRenderer = new PlayerAvatarRenderer(scene);

if (multiplayerJoinError) showToast(multiplayerJoinError, 3500);
else if (oldWorldSave) showToast("세계가 더 높아졌어요! 가방은 그대로, 지형은 새로 만들어졌어요", 4500);
if (net.connected) {
  // 접속할 때는 자리를 몰라 임시 위치로 알렸으니, 이제 진짜 자리로 다시 알린다.
  net.sendMove(player.x, player.y, player.z, player.yaw, player.pitch);
  for (const p of remotePlayers.values()) avatarRenderer.upsert(p.id, p);
  document.getElementById("multiplayer-button")?.classList.add("connected");
}

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

const hungerElement = document.getElementById("hunger") as HTMLElement;
const hungerElements = Array.from({ length: MAX_HUNGER / 2 }, () => {
  const drumstick = document.createElement("span");
  drumstick.textContent = "🍗";
  hungerElement.appendChild(drumstick);
  return drumstick;
});

function refreshHunger(): void {
  hungerElement.style.display = mode === "creative" ? "none" : "";
  hungerElements.forEach((drumstick, i) => {
    drumstick.className = hunger.value >= (i + 1) * 2 ? "full" : hunger.value === i * 2 + 1 ? "half" : "";
  });
}
refreshHunger();
refreshXp();
refreshEffects();

/** 가진 투구·흉갑·바지·부츠 중 부위별로 가장 좋은 것을 걸친 걸로 치고, 그 점수를 보여준다. */
function refreshArmor(): void {
  const points = totalArmorPoints((id) => inventory.count(id) > 0);
  armorLabel.style.display = mode === "creative" || points === 0 ? "none" : "";
  armorLabel.textContent = "🛡 " + points;
}
refreshArmor();

/** 플레이어가 피해를 입는다. 쓰러지면 처음 자리에서 다시 시작한다. */
function hurt(amount: number): void {
  // 창작 모드에서는 다치지 않는다 (낙하, 좀비 모두).
  if (mode === "creative") return;
  if (!health.damage(amount)) return;
  audio.playHurt();
  damageFlash.classList.add("on");
  window.setTimeout(() => damageFlash.classList.remove("on"), 60);
  refreshHearts();
  if (health.dead) respawn();
}

/** 걸친 방어구에 붙은 보호 인챈트를 다 합친 점수 (방어 점수처럼 피해를 줄인다). */
function wornProtection(): number {
  let levels = 0;
  for (const def of bestArmor((id) => inventory.count(id) > 0)) levels += inventory.enchantLevel(def.id, "protection");
  return protectionPoints(levels);
}

function respawn(): void {
  if (mount) {
    mount.ridden = false;
    mount = null;
  }
  effects.clear();
  refreshEffects();
  player.x = spawnX + 0.5;
  player.z = spawnZ + 0.5;
  player.y = world.surfaceHeight(spawnX, spawnZ) + 0.01;
  player.vy = 0;
  player.flying = false;
  fallTracker.reset();
  health.reset();
  hunger.eat(MAX_HUNGER);
  mobSim.clearHostile();
  refreshHearts();
  refreshHunger();
  showToast("쓰러졌어요... 처음 자리에서 다시 일어났어요", 3000);
}
mobSim.populate(world, player.x, player.z, 10, Math.random);
mobSim.maintainVillagers(world.villages, player.x, player.z, Math.random);
// 저장해 둔 길들인 동물을 되살린다 (이어하기).
if (saved && saved.seed === seed && saved.pets) for (const [kind, x, y, z, baby] of saved.pets) mobSim.restorePet(kind, x, y, z, baby === 1, Math.random);
let villagerTimer = 0;
document.getElementById("loading")?.remove();

const controls = new Controls(canvas);
const descendButton = document.getElementById("descend-button") as HTMLElement;
const useButton = document.getElementById("use-button") as HTMLElement;

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
controls.onPlace = placeBlock;
controls.onUse = useBlock;
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
  (window as unknown as { __vox: unknown }).__vox = { world, player, camera, scene, audio, generateMs, worldMesh, mobSim, health, applyQuality, crops, achievements, inventory, hurt, setMode: (m: "survival" | "creative") => { mode = m; refreshHotbar(); }, drops, furnaces, controls, currentTarget, getMode: () => mode, getMining: () => ({ mining, miningProgress }), stepMining: updateMining, stepDrops: (dt: number) => drops.update(dt, world, player.x, player.y, player.z, () => Infinity), dropRenderer, renderNow: () => { camera.position.set(player.x, eyeY(), player.z); camera.rotation.set(player.pitch, player.yaw, 0); dropRenderer.update(drops.drops, worldSeconds, solidMaterial.color); mobRenderer.update(mobSim.mobs, solidMaterial.color, worldSeconds); renderer.render(scene, camera); }, mobRenderer, spawnArrow, spawnExplosion, hunger, refreshHunger, placeBlock, breakAt, currentTargetPlace: () => currentTarget(), Block, hotbarBlocks, selectSlot, selectedSlotGet: () => selectedSlot, solidMaterial, waterMaterial };
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

// ---- 멀티플레이 화면: 방 만들기/들어가기 상태를 보여주고, 나가기 버튼을 둔다.
const multiplayerPanel = document.getElementById("multiplayer-panel") as HTMLElement;
const multiplayerBody = document.getElementById("multiplayer-body") as HTMLElement;
const multiplayerButton = document.getElementById("multiplayer-button") as HTMLElement;
let myRoomCode: string | null = roomParam;

function shareLink(code: string): string {
  return window.location.origin + window.location.pathname + "?room=" + code;
}

function chipButton(text: string, action: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "item-chip";
  el.textContent = text;
  onPress(el, action);
  return el;
}

async function hostRoom(): Promise<void> {
  const code = randomRoomCode();
  const name = askName();
  multiplayerBody.replaceChildren();
  multiplayerBody.append("방을 만드는 중...");
  try {
    const result = await connectAndWait(net, partyHost, serverRoom(code), { name, color: myColor, seed, x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch }, netCallbacks());
    for (const p of result.players) {
      remotePlayers.set(p.id, p);
      avatarRenderer.upsert(p.id, p);
    }
    myRoomCode = code;
    showToast("방을 만들었어요! 친구에게 방 코드나 주소를 알려주세요", 3500);
  } catch {
    showToast("방을 만들지 못했어요. 인터넷 연결을 확인해 보세요", 3000);
  }
  refreshMultiplayerPanel();
}

function refreshMultiplayerPanel(): void {
  multiplayerButton.classList.toggle("connected", net.connected);
  multiplayerBody.replaceChildren();
  if (net.connected && myRoomCode) {
    const codeRow = document.createElement("div");
    codeRow.textContent = "방 코드: " + myRoomCode;
    multiplayerBody.append(codeRow);
    multiplayerBody.append(
      chipButton("🔗 주소 복사하기", () => {
        navigator.clipboard?.writeText(shareLink(myRoomCode as string)).then(
          () => showToast("주소를 복사했어요. 친구에게 붙여넣기 해 주세요"),
          () => showToast(shareLink(myRoomCode as string), 6000),
        );
      }),
    );
    const peopleTitle = document.createElement("div");
    peopleTitle.className = "section-title";
    peopleTitle.textContent = "함께 있는 사람 (" + (remotePlayers.size + 1) + "/4)";
    multiplayerBody.append(peopleTitle);
    const me = document.createElement("div");
    me.textContent = "🙂 나";
    multiplayerBody.append(me);
    for (const p of remotePlayers.values()) {
      const row = document.createElement("div");
      row.textContent = "🙂 " + p.name;
      multiplayerBody.append(row);
    }
    multiplayerBody.append(
      chipButton("나가기", () => {
        net.disconnect();
        avatarRenderer.clear();
        remotePlayers.clear();
        myRoomCode = null;
        window.history.replaceState(null, "", window.location.pathname);
        showToast("혼자 하기로 돌아왔어요");
        refreshMultiplayerPanel();
      }),
    );
  } else {
    const info = document.createElement("div");
    info.textContent = "지금 만든 세상을 그대로 열어서, 같은 방 코드로 들어온 사람과 함께 블록을 짓고 돌아다닐 수 있어요.";
    multiplayerBody.append(info);
    multiplayerBody.append(chipButton("🌍 이 세상 함께하기", hostRoom));
  }
}

onPress(multiplayerButton, () => {
  toggleInventory(false);
  const open = multiplayerPanel.classList.toggle("open");
  if (open) refreshMultiplayerPanel();
});
onPress(document.getElementById("multiplayer-close") as HTMLElement, () => multiplayerPanel.classList.remove("open"));

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

// 배포된 게임은 처음 접속하면 파일을 폰에 저장해 두어 인터넷이 없어도 열린다 (개발 중에는 쓰지 않는다).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // 등록에 실패해도 게임은 그대로 된다.
  });
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
let shownHunger = hunger.value;
let shownHungerMode = mode;
let lastFullBagToast = -Infinity;
let netMoveTimer = 0;
const NET_MOVE_INTERVAL = 0.1; // 1초에 열 번쯤 내 위치를 알린다
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
  const moved = Math.hypot(player.x - beforeX, player.z - beforeZ);
  updateMovementSounds(moved);
  heldHand.update(dt, moved > 0.001);
  updateMining(dt);
  worldMesh.update(player.x, player.z);
  cropTimer += dt;
  villagerTimer += dt;
  if (villagerTimer >= 2) {
    villagerTimer = 0;
    mobSim.maintainVillagers(world.villages, player.x, player.z, Math.random);
  }
  if (cropTimer >= 1) {
    cropTimer = 0;
    for (const [x, y, z] of crops.harvestReady(worldSeconds)) {
      if (world.get(x, y, z) !== Block.Sprout) continue;
      world.set(x, y, z, Block.Wheat);
      editLog.record(x, y, z, Block.Wheat);
      net.sendEdit(x, y, z, Block.Wheat);
      worldMesh.updateBlock(x, z);
      scheduleSave();
    }
  }
  const regenHeal = effects.update(dt);
  if (regenHeal > 0 && mode === "survival") {
    health.heal(regenHeal);
    refreshHearts();
  }
  player.speedFactor = effects.speedMultiplier() * (mount ? HORSE_SPEED_FACTOR : 1);
  player.jumpFactor = mount ? HORSE_JUMP_FACTOR : 1;
  if (mount) {
    if (!mobSim.mobs.includes(mount)) {
      mount = null;
    } else {
      // 타고 있는 말은 플레이어와 같은 자리에서 같은 쪽을 보며 달린다.
      mount.x = player.x;
      mount.y = player.y;
      mount.z = player.z;
      mount.yaw = player.yaw;
      mount.vy = 0;
      mount.moving = moved > 0.002;
      mount.walkPhase += moved * 5;
    }
  }
  effectsTimer += dt;
  if (effectsTimer >= 0.5) {
    effectsTimer = 0;
    refreshEffects();
  }
  if (mode !== "creative") player.flying = false;
  heartsElement.style.display = mode === "creative" ? "none" : "";
  descendButton.classList.toggle("show", player.flying);
  if (player.flying || player.onLadder) fallTracker.reset();
  const fallDamage = fallTracker.update(player.y, player.onGround, player.isInWater());
  if (fallDamage > 0) hurt(fallDamage);
  if (mode === "survival") {
    hunger.update(dt, moved);
    if (hunger.starveTick(dt, health.hp)) {
      health.hp = Math.max(1, health.hp - 1);
      audio.playHurt();
      damageFlash.classList.add("on");
      window.setTimeout(() => damageFlash.classList.remove("on"), 60);
    }
  }
  if (mode !== "survival" || !hunger.empty) health.update(dt);
  const mobResult = mobSim.update(dt, world, Math.random, { x: player.x, y: player.y, z: player.z }, dayFactor < 0.3, mode !== "creative");
  for (const baby of mobResult.births) {
    gainXp(3);
    audio.playMob(baby.kind, 1 - Math.hypot(baby.x - player.x, baby.z - player.z) / 28);
    showToast("🐣 새끼가 태어났어요!", 2000);
  }
  updateFishing(dt, worldSeconds);
  for (const call of mobResult.sounds) {
    audio.playMob(call.kind, 1 - Math.hypot(call.x - player.x, call.z - player.z) / 28);
  }
  // 낙하 피해와 달리, 동물·괴물의 공격은 걸친 방어구만큼 줄어든다.
  if (mobResult.damage > 0) hurt(reduceDamage(mobResult.damage, (id) => inventory.count(id) > 0, wornProtection()));
  for (const shot of mobResult.shots) {
    if (shot.fire) audio.playDragonFire();
    else audio.playArrow();
    spawnArrow(shot.fromX, shot.fromY, shot.fromZ, shot.toX, shot.toY, shot.toZ);
  }
  for (const explosion of mobResult.explosions) {
    audio.playExplosion();
    spawnExplosion(explosion.x, explosion.y, explosion.z);
  }
  // 길들인 늑대가 대신 잡아 준 동물도 전리품과 도전 과제를 챙긴다.
  for (const kill of mobResult.kills) handleMobKill(kill.kind, kill.x, kill.y, kill.z);
  if (arrowFade > 0) {
    arrowFade = Math.max(0, arrowFade - dt);
    arrowMaterial.opacity = arrowFade > 0 ? Math.min(1, arrowFade / ARROW_FADE_SECONDS + 0.3) : 0;
  }
  if (explosionTimer > 0) {
    explosionTimer = Math.max(0, explosionTimer - dt);
    const ratio = explosionTimer / EXPLOSION_SECONDS;
    explosionFx.scale.setScalar(0.6 + (1 - ratio) * 3);
    explosionMaterial.opacity = ratio * 0.85;
    if (explosionTimer <= 0) explosionFx.visible = false;
  }
  if (health.hp !== shownHp) {
    shownHp = health.hp;
    refreshHearts();
  }
  if (hunger.value !== shownHunger || mode !== shownHungerMode) {
    shownHunger = hunger.value;
    shownHungerMode = mode;
    refreshHunger();
  }
  mobRenderer.update(mobSim.mobs, solidMaterial.color, worldSeconds);
  if (mode === "survival") {
    const result = drops.update(dt, world, player.x, player.y, player.z, (item) => inventory.freeSpace(item));
    if (result.picked.length > 0) {
      for (const [item, amount] of result.picked) inventory.add(item, amount);
      audio.playPickup();
      refreshHotbar();
      refreshOpenPanels();
      scheduleSave();
    }
    if (result.blocked && worldSeconds - lastFullBagToast > 5) {
      lastFullBagToast = worldSeconds;
      showToast("가방이 가득 찼어요", 2000);
    }
  }
  dropRenderer.update(drops.drops, worldSeconds, solidMaterial.color);

  if (net.connected) {
    for (const p of remotePlayers.values()) avatarRenderer.upsert(p.id, p);
    netMoveTimer -= dt;
    if (netMoveTimer <= 0) {
      netMoveTimer = NET_MOVE_INTERVAL;
      net.sendMove(player.x, player.y, player.z, player.yaw, player.pitch);
    }
  }

  camera.position.set(player.x, eyeY(), player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  const target = currentTarget();
  outline.visible = target !== null;
  const aimed = target ? world.get(target.x, target.y, target.z) : Block.Air;
  useButton.classList.toggle("show", mount !== null || ["villager", "horse"].includes(mobInSight(target)?.kind ?? "") || aimed === Block.CraftingTable || aimed === Block.Furnace || aimed === Block.EnchantTable || aimed === Block.BrewingStand || isDoor(aimed) || isChest(aimed));
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
