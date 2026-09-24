import * as THREE from "three";
import { CHUNK_SIZE } from "./chunkMath";
import { Block, BlockId, SIZE_Y, World, isOpaque } from "./world";

const BLOCK_COLOR: Record<number, [number, number, number]> = {
  [Block.Grass]: [0.36, 0.63, 0.22],
  [Block.Dirt]: [0.47, 0.33, 0.2],
  [Block.Stone]: [0.5, 0.5, 0.52],
  [Block.Sand]: [0.86, 0.8, 0.55],
  [Block.Wood]: [0.42, 0.28, 0.14],
  [Block.Leaves]: [0.2, 0.5, 0.16],
  [Block.Water]: [0.2, 0.42, 0.85],
};

/** 하늘이 안 보이는 곳(동굴 안, 지붕 밑)의 밝기 */
const DARK_LIGHT = 0.45;
/** 물 윗면을 살짝 낮춰서 물결 높이처럼 보이게 한다 */
const WATER_TOP = 0.88;

/** [이웃 방향, 밝기, 네 꼭짓점]. 꼭짓점은 바깥에서 봤을 때 반시계 방향. */
const FACES: { dir: [number, number, number]; shade: number; corners: number[][] }[] = [
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.7, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 0, -1], shade: 0.7, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

function jitter(x: number, y: number, z: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (((h ^ (h >>> 13)) >>> 0) / 4294967296) * 0.12 - 0.06;
}

export const solidMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
export const waterMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});

class MeshData {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  addQuad(corners: number[][], offsetX: number, offsetY: number, offsetZ: number, color: [number, number, number]): void {
    const start = this.positions.length / 3;
    for (const [cx, cy, cz] of corners) {
      this.positions.push(offsetX + cx, offsetY + cy, offsetZ + cz);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  toMesh(material: THREE.Material): THREE.Mesh | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, material);
  }
}

export interface ChunkMeshes {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

/**
 * 구역(chunk) 하나의 눈에 보이는 면만 모아 메쉬로 만든다.
 * 단단한 블록은 공기/물과 맞닿은 면, 물은 공기와 맞닿은 면만 그린다.
 */
export function buildChunkMesh(world: World, chunkX: number, chunkZ: number): ChunkMeshes {
  const solid = new MeshData();
  const water = new MeshData();

  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  for (let y = 0; y < SIZE_Y; y++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      for (let x = startX; x < startX + CHUNK_SIZE; x++) {
        const block: BlockId = world.get(x, y, z);
        if (block === Block.Air) continue;
        const base = BLOCK_COLOR[block];
        const noise = jitter(x, y, z);

        if (block === Block.Water) {
          const airAbove = world.get(x, y + 1, z) === Block.Air;
          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            if (world.get(x + dx, y + dy, z + dz) !== Block.Air) continue;
            const corners = airAbove ? face.corners.map(([cx, cy, cz]) => [cx, cy === 1 ? WATER_TOP : cy, cz]) : face.corners;
            const k = face.shade;
            water.addQuad(corners, x, y, z, [base[0] * k, base[1] * k, base[2] * k]);
          }
          continue;
        }

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (isOpaque(world.get(nx, ny, nz))) continue;

          const light = world.isSkyLit(nx, ny, nz) ? 1 : DARK_LIGHT;
          const k = (face.shade + noise) * light;
          solid.addQuad(face.corners, x, y, z, [base[0] * k, base[1] * k, base[2] * k]);
        }
      }
    }
  }

  const waterMesh = water.toMesh(waterMaterial);
  if (waterMesh) waterMesh.renderOrder = 1;
  return { solid: solid.toMesh(solidMaterial), water: waterMesh };
}
