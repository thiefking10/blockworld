import * as THREE from "three";
import { CHUNK_SIZE } from "./chunkMath";
import { Block, BlockId, SIZE_Y, World } from "./world";

const BLOCK_COLOR: Record<number, [number, number, number]> = {
  [Block.Grass]: [0.36, 0.63, 0.22],
  [Block.Dirt]: [0.47, 0.33, 0.2],
  [Block.Stone]: [0.5, 0.5, 0.52],
  [Block.Sand]: [0.86, 0.8, 0.55],
};

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

const chunkMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

/** 구역(chunk) 하나의 눈에 보이는 면(공기와 맞닿은 면)만 모아 메쉬로 만든다. 블록이 하나도 안 보이면 null. */
export function buildChunkMesh(world: World, chunkX: number, chunkZ: number): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  for (let y = 0; y < SIZE_Y; y++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      for (let x = startX; x < startX + CHUNK_SIZE; x++) {
        const block: BlockId = world.get(x, y, z);
        if (block === Block.Air) continue;
        const base = BLOCK_COLOR[block];
        const noise = jitter(x, y, z);

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          if (world.get(x + dx, y + dy, z + dz) !== Block.Air) continue;

          const start = positions.length / 3;
          for (const [cx, cy, cz] of face.corners) {
            positions.push(x + cx, y + cy, z + cz);
            const k = face.shade + noise;
            colors.push(base[0] * k, base[1] * k, base[2] * k);
          }
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }

  if (indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return new THREE.Mesh(geometry, chunkMaterial);
}
