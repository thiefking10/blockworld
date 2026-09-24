import * as THREE from "three";
import { Block } from "./world";

export const TILE = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  WoodSide: 5,
  WoodTop: 6,
  Leaves: 7,
  Water: 8,
  Planks: 9,
  Glass: 10,
  Brick: 11,
  Snow: 12,
  CactusSide: 13,
  CactusTop: 14,
  Wool: 15,
  IronOre: 16,
} as const;

export const ATLAS_COLS = 5;
const TILE_PIXELS = 16;
/** 타일 가장자리 색이 옆 타일에서 번지지 않게 살짝 안쪽만 쓴다. */
const EDGE = 0.002;

/** 블록과 면 방향(dirY: 위 1, 아래 -1, 옆 0)에 맞는 무늬 타일 번호. */
export function tileForFace(block: number, dirY: number): number {
  switch (block) {
    case Block.Grass:
      return dirY === 1 ? TILE.GrassTop : dirY === -1 ? TILE.Dirt : TILE.GrassSide;
    case Block.Dirt:
      return TILE.Dirt;
    case Block.Stone:
      return TILE.Stone;
    case Block.Sand:
      return TILE.Sand;
    case Block.Wood:
      return dirY !== 0 ? TILE.WoodTop : TILE.WoodSide;
    case Block.Leaves:
      return TILE.Leaves;
    case Block.Water:
      return TILE.Water;
    case Block.Planks:
      return TILE.Planks;
    case Block.Glass:
      return TILE.Glass;
    case Block.Brick:
      return TILE.Brick;
    case Block.Snow:
      return TILE.Snow;
    case Block.Cactus:
      return dirY !== 0 ? TILE.CactusTop : TILE.CactusSide;
    case Block.Wool:
      return TILE.Wool;
    case Block.IronOre:
      return TILE.IronOre;
    default:
      return TILE.Stone;
  }
}

/** 블록 선택창에 보여줄 대표 무늬 타일. */
export function iconTile(block: number): number {
  if (block === Block.Grass) return TILE.GrassSide;
  if (block === Block.Wood) return TILE.WoodSide;
  return tileForFace(block, 1);
}

/** 타일 안의 (u, v)(0~1, v는 위쪽이 1)를 아틀라스 전체의 uv로 바꾼다. */
export function tileUV(tile: number, u: number, v: number): [number, number] {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const size = 1 / ATLAS_COLS;
  const u0 = col * size + EDGE;
  const u1 = (col + 1) * size - EDGE;
  const vTop = 1 - row * size - EDGE;
  const vBottom = 1 - (row + 1) * size + EDGE;
  return [u0 + (u1 - u0) * u, vBottom + (vTop - vBottom) * v];
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];

function shade(color: RGB, amount: number): string {
  const c = color.map((v) => Math.max(0, Math.min(255, Math.round(v + amount))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 색 하나를 바탕으로 픽셀마다 밝기를 살짝 흔든 무늬를 채운다. */
function noiseFill(ctx: CanvasRenderingContext2D, ox: number, oy: number, base: RGB, spread: number, random: () => number): void {
  for (let y = 0; y < TILE_PIXELS; y++) {
    for (let x = 0; x < TILE_PIXELS; x++) {
      ctx.fillStyle = shade(base, (random() - 0.5) * spread);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function drawTile(ctx: CanvasRenderingContext2D, tile: number): void {
  const ox = (tile % ATLAS_COLS) * TILE_PIXELS;
  const oy = Math.floor(tile / ATLAS_COLS) * TILE_PIXELS;
  const random = rng(tile * 7919 + 13);
  const px = (x: number, y: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };

  switch (tile) {
    case TILE.GrassTop:
      noiseFill(ctx, ox, oy, [92, 160, 56], 34, random);
      break;
    case TILE.GrassSide: {
      noiseFill(ctx, ox, oy, [120, 84, 52], 30, random);
      for (let x = 0; x < TILE_PIXELS; x++) {
        const depth = 3 + Math.floor(random() * 3);
        for (let y = 0; y < depth; y++) px(x, y, shade([92, 160, 56], (random() - 0.5) * 34));
      }
      break;
    }
    case TILE.Dirt:
      noiseFill(ctx, ox, oy, [120, 84, 52], 34, random);
      break;
    case TILE.Stone: {
      noiseFill(ctx, ox, oy, [128, 128, 132], 26, random);
      for (let i = 0; i < 26; i++) px(Math.floor(random() * 16), Math.floor(random() * 16), shade([128, 128, 132], -38));
      break;
    }
    case TILE.Sand:
      noiseFill(ctx, ox, oy, [219, 204, 140], 22, random);
      break;
    case TILE.WoodSide: {
      for (let x = 0; x < TILE_PIXELS; x++) {
        const stripe = (x % 4 === 0 ? -18 : 0) + (x % 7 === 3 ? 10 : 0);
        for (let y = 0; y < TILE_PIXELS; y++) px(x, y, shade([107, 71, 36], stripe + (random() - 0.5) * 16));
      }
      break;
    }
    case TILE.WoodTop: {
      for (let y = 0; y < TILE_PIXELS; y++) {
        for (let x = 0; x < TILE_PIXELS; x++) {
          const ring = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
          px(x, y, shade([150, 112, 62], (ring % 2 === 0 ? -14 : 8) + (random() - 0.5) * 10));
        }
      }
      break;
    }
    case TILE.Leaves: {
      noiseFill(ctx, ox, oy, [52, 128, 42], 40, random);
      for (let i = 0; i < 30; i++) px(Math.floor(random() * 16), Math.floor(random() * 16), shade([52, 128, 42], -46));
      break;
    }
    case TILE.Water: {
      noiseFill(ctx, ox, oy, [51, 107, 217], 20, random);
      for (let i = 0; i < 14; i++) px(Math.floor(random() * 16), Math.floor(random() * 16), shade([51, 107, 217], 40));
      break;
    }
    case TILE.Planks: {
      for (let y = 0; y < TILE_PIXELS; y++) {
        const board = Math.floor(y / 4);
        for (let x = 0; x < TILE_PIXELS; x++) {
          const seam = y % 4 === 3 ? -34 : 0;
          const end = (x + board * 5) % 16 === 0 ? -26 : 0;
          px(x, y, shade([176, 132, 76], seam + end + (random() - 0.5) * 18));
        }
      }
      break;
    }
    case TILE.Glass: {
      // 안쪽은 투명하게 비워 두고 테두리와 반사광만 그린다.
      for (let i = 0; i < TILE_PIXELS; i++) {
        px(i, 0, "rgb(205,232,242)");
        px(i, TILE_PIXELS - 1, "rgb(205,232,242)");
        px(0, i, "rgb(205,232,242)");
        px(TILE_PIXELS - 1, i, "rgb(205,232,242)");
      }
      for (let i = 3; i < 9; i++) px(i, i, "rgb(235,247,252)");
      for (let i = 5; i < 8; i++) px(i + 3, i, "rgb(235,247,252)");
      break;
    }
    case TILE.Brick: {
      for (let y = 0; y < TILE_PIXELS; y++) {
        const row = Math.floor(y / 4);
        for (let x = 0; x < TILE_PIXELS; x++) {
          const offset = row % 2 === 0 ? 0 : 4;
          const mortar = y % 4 === 3 || (x + offset) % 8 === 7;
          px(x, y, mortar ? shade([170, 166, 158], (random() - 0.5) * 12) : shade([158, 64, 48], (random() - 0.5) * 26));
        }
      }
      break;
    }
    case TILE.Snow:
      noiseFill(ctx, ox, oy, [238, 244, 250], 14, random);
      break;
    case TILE.CactusSide: {
      noiseFill(ctx, ox, oy, [52, 132, 60], 22, random);
      for (let x = 0; x < TILE_PIXELS; x += 5) for (let y = 0; y < TILE_PIXELS; y++) px(x, y, shade([28, 92, 40], (random() - 0.5) * 12));
      for (let i = 0; i < 14; i++) px(Math.floor(random() * 16), Math.floor(random() * 16), "rgb(214,226,170)");
      break;
    }
    case TILE.Wool: {
      noiseFill(ctx, ox, oy, [236, 236, 230], 12, random);
      for (let y = 1; y < TILE_PIXELS; y += 4) for (let x = 0; x < TILE_PIXELS; x++) px(x, y, shade([214, 214, 208], (random() - 0.5) * 8));
      break;
    }
    case TILE.IronOre: {
      noiseFill(ctx, ox, oy, [128, 128, 132], 26, random);
      for (let i = 0; i < 26; i++) px(Math.floor(random() * 16), Math.floor(random() * 16), shade([128, 128, 132], -38));
      for (let cluster = 0; cluster < 5; cluster++) {
        const cx = 2 + Math.floor(random() * 11);
        const cy = 2 + Math.floor(random() * 11);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          if (random() < 0.85) px(cx + dx, cy + dy, shade([214, 158, 110], (random() - 0.5) * 30));
        }
      }
      break;
    }
    case TILE.CactusTop: {
      for (let y = 0; y < TILE_PIXELS; y++) {
        for (let x = 0; x < TILE_PIXELS; x++) {
          const edge = x === 0 || y === 0 || x === 15 || y === 15;
          px(x, y, shade(edge ? [28, 92, 40] : [70, 156, 74], (random() - 0.5) * 14));
        }
      }
      break;
    }
  }
}

let atlasCanvas: HTMLCanvasElement | null = null;

/** 타일 하나를 확대한 작은 그림(data URL). 블록 선택창/아이템 바의 아이콘에 쓴다. */
export function tileIconDataUrl(tile: number): string {
  if (!atlasCanvas) return "";
  const icon = document.createElement("canvas");
  icon.width = 32;
  icon.height = 32;
  const ctx = icon.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  const sx = (tile % ATLAS_COLS) * TILE_PIXELS;
  const sy = Math.floor(tile / ATLAS_COLS) * TILE_PIXELS;
  ctx.drawImage(atlasCanvas, sx, sy, TILE_PIXELS, TILE_PIXELS, 0, 0, 32, 32);
  return icon.toDataURL();
}

/** 블록 무늬 타일을 한 장에 모은 그림(아틀라스)을 코드로 그려 만든다. 브라우저에서만 쓸 수 있다. */
export function createAtlasTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  atlasCanvas = canvas;
  canvas.width = ATLAS_COLS * TILE_PIXELS;
  canvas.height = ATLAS_COLS * TILE_PIXELS;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  for (const tile of Object.values(TILE)) drawTile(ctx, tile);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
