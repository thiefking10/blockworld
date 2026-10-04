import { ARMOR_BY_ID, type ArmorSlot } from "./armor";
import { Item, RECIPES, type Recipe } from "./inventory";
import { TOOL_BY_ID, type ToolType } from "./tools";
import { Block } from "./world";

/** 제작 격자의 한 칸: 아이템 번호, 비었으면 0 */
export type Cells = number[];

/**
 * 모양이 정해진 제작법의 칸 배치 (행마다 열, 빈 칸은 0).
 * 모양이 없는 제작법은 재료 칸 수만 맞으면 어디에 놓아도 된다 (재료 개수 = 놓아야 하는 칸 수).
 */
type Shape = number[][];

const shapes = new Map<string, Shape>();

function define(name: string, rows: string[], key: Record<string, number>): void {
  shapes.set(
    name,
    rows.map((row) => [...row].map((ch) => (ch === " " ? 0 : key[ch] ?? 0))),
  );
}

const TOOL_ROWS: Record<ToolType, string[]> = {
  pickaxe: ["MMM", " S ", " S "],
  axe: ["MM", "MS", " S"],
  shovel: ["M", "S", "S"],
  sword: ["M", "M", "S"],
};

const ARMOR_ROWS: Record<ArmorSlot, string[]> = {
  helmet: ["MMM", "M M"],
  chestplate: ["M M", "MMM", "MMM"],
  leggings: ["MMM", "M M", "M M"],
  boots: ["M M", "M M"],
};

// 도구와 갑옷은 마인크래프트와 같은 모양으로만 만든다 (곡괭이와 도끼가 재료가 같아서 모양으로 구별한다).
for (const recipe of RECIPES) {
  const out = recipe.output[0];
  const material = recipe.inputs[0][0];
  const tool = TOOL_BY_ID.get(out);
  // 네더라이트 장비 같은 "업그레이드" 제작법(재료가 도구·갑옷 자체)은 모양 없이 두 칸만 맞으면 된다.
  if (tool && !TOOL_BY_ID.has(material)) define(recipe.name, TOOL_ROWS[tool.type], { M: material, S: Item.Stick });
  const armor = ARMOR_BY_ID.get(out);
  if (armor && !ARMOR_BY_ID.has(material)) define(recipe.name, ARMOR_ROWS[armor.slot], { M: material });
}

define("막대", ["P", "P"], { P: Block.Planks });
define("제작대", ["PP", "PP"], { P: Block.Planks });
define("횃불", ["C", "S"], { C: Item.Coal, S: Item.Stick });
define("화로", ["SSS", "S S", "SSS"], { S: Block.Stone });
define("상자", ["PPP", "P P", "PPP"], { P: Block.Planks });
define("문", ["PP", "PP", "PP"], { P: Block.Planks });
define("판자 계단", ["P  ", "PP ", "PPP"], { P: Block.Planks });
define("돌 계단", ["S  ", "SS ", "SSS"], { S: Block.Stone });
define("사다리", ["S S", "SSS", "S S"], { S: Item.Stick });
define("방패", ["PIP", "PPP", " P "], { P: Block.Planks, I: Item.IronIngot });
define("울타리", ["PSP", "PSP"], { P: Block.Planks, S: Item.Stick });

export type CraftContext = "hand" | "table";

/** 이 제작법을 이 자리(가방 2×2 / 제작대 3×3)에서 격자로 만들 수 있는지. 양조대 제작법은 격자를 쓰지 않는다. */
export function usableAt(recipe: Recipe, context: CraftContext): boolean {
  if (recipe.station === "brewing") return false;
  if (recipe.station === "table") return context === "table";
  return true;
}

/** 이 제작법의 정해진 모양 (없으면 null = 모양 없음). */
export function shapeOf(recipe: Recipe): Shape | null {
  return shapes.get(recipe.name) ?? null;
}

/** 칸 배열에서 아이템이 있는 부분만 잘라 낸 직사각형 (아무것도 없으면 null). */
function trim(cells: Cells, width: number, height: number): Shape | null {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  const rows: Shape = [];
  for (let y = minY; y <= maxY; y++) {
    const row: number[] = [];
    for (let x = minX; x <= maxX; x++) row.push(cells[y * width + x]);
    rows.push(row);
  }
  return rows;
}

function sameShape(a: Shape, b: Shape): boolean {
  return a.length === b.length && a.every((row, y) => row.length === b[y].length && row.every((v, x) => v === b[y][x]));
}

/** 칸에 놓인 재료 개수 세기 (칸 하나에 아이템 하나씩 센다). */
function countCells(cells: Cells): Map<number, number> {
  const counts = new Map<number, number>();
  for (const item of cells) if (item !== 0) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function sameCounts(counts: Map<number, number>, inputs: [number, number][]): boolean {
  if (counts.size !== inputs.length) return false;
  return inputs.every(([item, amount]) => counts.get(item) === amount);
}

/**
 * 격자에 놓인 재료로 만들 수 있는 제작법을 찾는다. 모양이 정해진 제작법을 먼저(좌우 뒤집어 놓아도 된다),
 * 다음에 모양 없는 제작법을 본다. 없으면 null.
 */
export function matchGrid(cells: Cells, width: number, height: number, context: CraftContext): Recipe | null {
  const trimmed = trim(cells, width, height);
  if (!trimmed) return null;
  const mirrored = trimmed.map((row) => [...row].reverse());
  for (const recipe of RECIPES) {
    if (!usableAt(recipe, context)) continue;
    const shape = shapeOf(recipe);
    if (shape && (sameShape(trimmed, shape) || sameShape(mirrored, shape))) return recipe;
  }
  const counts = countCells(cells);
  for (const recipe of RECIPES) {
    if (!usableAt(recipe, context) || shapeOf(recipe)) continue;
    if (sameCounts(counts, recipe.inputs)) return recipe;
  }
  return null;
}

/** 이 제작법이 필요로 하는 가로·세로 칸 수 (모양 없는 제작법은 가로로 한 줄에 늘어놓는다고 본다). */
export function sizeNeeded(recipe: Recipe): { width: number; height: number } {
  const shape = shapeOf(recipe);
  if (shape) return { width: Math.max(...shape.map((r) => r.length)), height: shape.length };
  const total = recipe.inputs.reduce((sum, [, amount]) => sum + amount, 0);
  return total <= 4 ? { width: 2, height: Math.ceil(total / 2) } : { width: 3, height: Math.ceil(total / 3) };
}

/**
 * 이 제작법을 격자(width×height)의 왼쪽 위부터 채우는 배치를 만든다.
 * 격자가 너무 작으면 null. (재료 선택 버튼용: 눌러서 칸을 채워 준다.)
 */
export function planFill(recipe: Recipe, width: number, height: number): Cells | null {
  const shape = shapeOf(recipe);
  const cells: Cells = new Array(width * height).fill(0);
  if (shape) {
    if (shape.length > height || shape.some((row) => row.length > width)) return null;
    shape.forEach((row, y) => row.forEach((item, x) => (cells[y * width + x] = item)));
    return cells;
  }
  const flat: number[] = [];
  for (const [item, amount] of recipe.inputs) for (let i = 0; i < amount; i++) flat.push(item);
  if (flat.length > width * height) return null;
  flat.forEach((item, i) => (cells[i] = item));
  return cells;
}
