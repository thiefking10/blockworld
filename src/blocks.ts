import { baseBlock } from "./shapes";
import { Block, BlockId, isOpaque, isPlant } from "./world";

export interface PlaceableBlock {
  block: BlockId;
  name: string;
}

/** 블록 선택창에 나오는, 놓을 수 있는 블록 전부. */
export const PLACEABLE_BLOCKS: PlaceableBlock[] = [
  { block: Block.Grass, name: "잔디" },
  { block: Block.Dirt, name: "흙" },
  { block: Block.Stone, name: "돌" },
  { block: Block.Sand, name: "모래" },
  { block: Block.Wood, name: "통나무" },
  { block: Block.Leaves, name: "잎" },
  { block: Block.Planks, name: "판자" },
  { block: Block.Glass, name: "유리" },
  { block: Block.Brick, name: "벽돌" },
  { block: Block.Snow, name: "눈" },
  { block: Block.Cactus, name: "선인장" },
  { block: Block.Wool, name: "양털" },
  { block: Block.IronOre, name: "철광석" },
  { block: Block.DiamondOre, name: "다이아몬드 광석" },
  { block: Block.CoalOre, name: "석탄 광석" },
  { block: Block.Flower, name: "붉은 꽃" },
  { block: Block.YellowFlower, name: "노란 꽃" },
  { block: Block.Sprout, name: "밀 씨앗" },
  { block: Block.CraftingTable, name: "제작대" },
  { block: Block.Furnace, name: "화로" },
  { block: Block.Torch, name: "횃불" },
  { block: Block.PlankSlab, name: "판자 반블록" },
  { block: Block.StoneSlab, name: "돌 반블록" },
  { block: Block.PlankStairs, name: "판자 계단" },
  { block: Block.StoneStairs, name: "돌 계단" },
  { block: Block.Door, name: "문" },
  { block: Block.Chest, name: "상자" },
  { block: Block.Ladder, name: "사다리" },
  { block: Block.Fence, name: "울타리" },
  { block: Block.Gravel, name: "자갈" },
];

/** 이 블록을 놓으려는 칸 바로 아래 블록이 (below) 받쳐 줄 수 있는지. 꽃과 씨앗은 풀이나 흙 위에, 횃불은 어떤 단단한 블록 위에도 세울 수 있다. */
export function canPlaceAt(block: number, below: number): boolean {
  if (block === Block.Torch) return isOpaque(below);
  if (isPlant(block)) return below === Block.Grass || below === Block.Dirt;
  return true;
}

export const HOTBAR_SIZE = 6;

export const DEFAULT_HOTBAR: number[] = [Block.Grass, Block.Dirt, Block.Stone, Block.Wood, Block.Planks, Block.Glass];

export function blockName(block: number): string {
  return PLACEABLE_BLOCKS.find((b) => b.block === baseBlock(block))?.name ?? "블록";
}

/** 이 번호가 (블록 고르기에서 고를 수 있는) 놓을 수 있는 블록인지. 도구·검 같은 아이템은 아니다. */
export function isPlaceableBlock(id: number): boolean {
  return PLACEABLE_BLOCKS.some((b) => b.block === id);
}

/**
 * 저장된 아이템 바를 검사해서 쓸 수 있으면 돌려주고, 아니면 기본값을 돌려준다.
 * 이제 블록뿐 아니라 도구·검·활 같은 아이템도 들 수 있어서, 0 이상의 정수면 일단 받아들인다 (0은 빈손).
 */
export function sanitizeHotbar(saved: number[] | undefined): number[] {
  if (!saved || saved.length !== HOTBAR_SIZE) return [...DEFAULT_HOTBAR];
  if (!saved.every((id) => Number.isInteger(id) && id >= 0)) return [...DEFAULT_HOTBAR];
  return saved;
}
