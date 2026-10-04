import * as THREE from "three";
import { createAtlasTexture, tileForFace, tileUV } from "./atlas";
import { CHUNK_SIZE } from "./chunkMath";
import { Box, renderBoxes } from "./shapes";
import { Block, BlockId, MAX_LIGHT, World, isPlant, isShaped, occludes } from "./world";

/** 하늘이 안 보이는 곳(동굴 안, 지붕 밑)의 밝기 */
const DARK_LIGHT = 0.45;

/** 하늘빛과 횃불빛 중 더 밝은 쪽을 0~1로 돌려준다. */
function faceBrightness(world: World, x: number, y: number, z: number): number {
  const skyBright = world.isSkyLit(x, y, z) ? 1 : DARK_LIGHT;
  const torchBright = world.lightAt(x, y, z) / MAX_LIGHT;
  return Math.max(skyBright, torchBright);
}
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

/** 옆면은 위가 v=1, 위/아래 면은 꼭짓점 순서에 맞춰 무늬를 붙인다. */
const SIDE_UV = [[0, 0], [0, 1], [1, 1], [1, 0]];
const FLAT_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

function jitter(x: number, y: number, z: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (((h ^ (h >>> 13)) >>> 0) / 4294967296) * 0.12 - 0.06;
}

const atlas = createAtlasTexture();
/** 밤낮에 따라 main에서 color를 바꿔 전체 밝기를 조절한다. */
export const solidMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, map: atlas, alphaTest: 0.5 });
export const waterMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  map: atlas,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});
/** 횃불빛이 닿는 자리에 쓰는 재질. 색이 낮밤에 따라 바뀌지 않아서, 밤에도 횃불 주변은 계속 밝다. */
export const litMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, map: atlas, alphaTest: 0.5 });

/** 식물은 X 모양으로 엇갈린 두 장의 판을 앞뒤로 그린다. */
const PLANT_QUADS: number[][][] = [
  [[0, 0, 0], [0, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[1, 0, 0], [1, 1, 0], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [1, 1, 0], [1, 0, 0]],
];

class MeshData {
  positions: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  addQuad(
    corners: number[][],
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    brightness: number,
    tile: number,
    flat: boolean,
  ): void {
    const start = this.positions.length / 3;
    const uvCorners = flat ? FLAT_UV : SIDE_UV;
    corners.forEach(([cx, cy, cz], i) => {
      this.positions.push(offsetX + cx, offsetY + cy, offsetZ + cz);
      this.colors.push(brightness, brightness, brightness);
      this.uvs.push(...tileUV(tile, uvCorners[i][0], uvCorners[i][1]));
    });
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  /** 칸 안의 상자 하나(box)의 한 면을 그린다. 무늬는 칸 안 위치 그대로 붙여서, 반블록 옆면은 무늬의 아랫반쪽이 보인다. */
  addBoxFace(
    face: { dir: [number, number, number]; corners: number[][] },
    box: Box,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    brightness: number,
    tile: number,
  ): void {
    const start = this.positions.length / 3;
    const flat = face.dir[1] !== 0;
    const uvCorners = flat ? FLAT_UV : SIDE_UV;
    const axisA = face.dir[0] !== 0 ? 2 : 0;
    const axisB = flat ? 2 : 1;
    face.corners.forEach((corner, i) => {
      const real = corner.map((c, axis) => (c === 1 ? box[axis + 3] : box[axis]));
      this.positions.push(offsetX + real[0], offsetY + real[1], offsetZ + real[2]);
      this.colors.push(brightness, brightness, brightness);
      const [u, v] = uvCorners[i];
      const uNew = u === corner[axisA] ? real[axisA] : 1 - real[axisA];
      const vNew = v === corner[axisB] ? real[axisB] : 1 - real[axisB];
      this.uvs.push(...tileUV(tile, uNew, vNew));
    });
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  toMesh(material: THREE.Material): THREE.Mesh | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, material);
  }
}

export interface ChunkMeshes {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
  /** 횃불빛이 닿아 낮밤과 상관없이 밝게 그려야 하는 면들 */
  lit: THREE.Mesh | null;
}

/**
 * 구역(chunk) 하나의 눈에 보이는 면만 모아 메쉬로 만든다.
 * 단단한 블록은 공기/물과 맞닿은 면, 물은 공기와 맞닿은 면만 그린다.
 * 횃불빛이 닿는 면은 낮밤 색이 안 타는 별도 메쉬(lit)로 나뉜다.
 */
export function buildChunkMesh(world: World, chunkX: number, chunkZ: number): ChunkMeshes {
  const solid = new MeshData();
  const water = new MeshData();
  const lit = new MeshData();

  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  // 구역 위쪽은 대부분 빈 하늘이라, 블록이 있을 수 있는 높이까지만 훑는다.
  const lastY = world.highestIn(startX, startZ, CHUNK_SIZE);
  for (let y = 0; y <= lastY; y++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      for (let x = startX; x < startX + CHUNK_SIZE; x++) {
        const block: BlockId = world.get(x, y, z);
        if (block === Block.Air) continue;
        const noise = jitter(x, y, z);

        if (block === Block.Water) {
          const airAbove = world.get(x, y + 1, z) === Block.Air;
          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const beside = world.get(x + dx, y + dy, z + dz);
            if (beside !== Block.Air && !isPlant(beside)) continue;
            const corners = airAbove ? face.corners.map(([cx, cy, cz]) => [cx, cy === 1 ? WATER_TOP : cy, cz]) : face.corners;
            water.addQuad(corners, x, y, z, face.shade, tileForFace(block, dy), dy !== 0);
          }
          continue;
        }

        if (isPlant(block)) {
          const torchLevel = world.lightAt(x, y, z);
          const brightness = (0.95 + noise) * faceBrightness(world, x, y, z);
          const target = torchLevel > 0 ? lit : solid;
          for (const corners of PLANT_QUADS) target.addQuad(corners, x, y, z, brightness, tileForFace(block, 0), false);
          continue;
        }

        if (isShaped(block)) {
          const boxes = renderBoxes(block) ?? [];
          for (const box of boxes) {
            for (const face of FACES) {
              const [dx, dy, dz] = face.dir;
              // 칸 가장자리에 닿은 면은 이웃이 가리면 안 그려도 된다.
              const edge = dx === 1 ? box[3] === 1 : dx === -1 ? box[0] === 0 : dy === 1 ? box[4] === 1 : dy === -1 ? box[1] === 0 : dz === 1 ? box[5] === 1 : box[2] === 0;
              const neighbor = world.get(x + dx, y + dy, z + dz);
              if (edge && occludes(neighbor)) continue;
              const brightness = (face.shade + noise) * faceBrightness(world, x + dx, y + dy, z + dz);
              const target = world.lightAt(x + dx, y + dy, z + dz) > 0 ? lit : solid;
              target.addBoxFace(face, box, x, y, z, brightness, tileForFace(block, dy, dx, dz));
            }
          }
          continue;
        }

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          const neighbor = world.get(nx, ny, nz);
          if (occludes(neighbor)) continue;
          if (block === Block.Glass && neighbor === Block.Glass) continue;

          const torchLevel = world.lightAt(nx, ny, nz);
          if (torchLevel > 0) {
            const brightness = (face.shade + noise) * faceBrightness(world, nx, ny, nz);
            lit.addQuad(face.corners, x, y, z, brightness, tileForFace(block, dy), dy !== 0);
          } else {
            const light = world.isSkyLit(nx, ny, nz) ? 1 : DARK_LIGHT;
            solid.addQuad(face.corners, x, y, z, (face.shade + noise) * light, tileForFace(block, dy), dy !== 0);
          }
        }
      }
    }
  }

  const waterMesh = water.toMesh(waterMaterial);
  if (waterMesh) waterMesh.renderOrder = 1;
  return { solid: solid.toMesh(solidMaterial), water: waterMesh, lit: lit.toMesh(litMaterial) };
}
