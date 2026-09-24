import * as THREE from "three";
import { affectedChunks, CHUNK_SIZE, chunksInRadius, RENDER_RADIUS } from "./chunkMath";
import { buildChunkMesh } from "./mesher";
import { World } from "./world";

/**
 * 월드를 구역 단위 메쉬로 관리한다.
 * 플레이어 주변 구역만 만들어 두고, 멀어지면 지우고 가까워지면 만든다.
 * 블록이 바뀌면 (그려져 있는) 관련 구역만 다시 만든다.
 */
export class ChunkedWorldMesh {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh[]>();
  private queue: [number, number][] = [];
  private centerKey = "";
  private radius = RENDER_RADIUS;

  constructor(private readonly world: World) {}

  /** 그려 두는 구역 반경을 바꾼다 (화질 조절). 다음 update에서 새로 정해진다. */
  setRadius(radius: number): void {
    if (radius === this.radius) return;
    this.radius = radius;
    this.centerKey = "";
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private unloadChunk(key: string): void {
    for (const mesh of this.meshes.get(key) ?? []) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = this.key(cx, cz);
    this.unloadChunk(key);

    const { solid, water } = buildChunkMesh(this.world, cx, cz);
    const created = [solid, water].filter((mesh): mesh is THREE.Mesh => mesh !== null);
    for (const mesh of created) this.group.add(mesh);
    this.meshes.set(key, created);
  }

  /**
   * 매 프레임 호출한다. 플레이어가 다른 구역으로 넘어가면 그릴 구역을 다시 정하고,
   * 한 프레임에 budget개까지만 새로 만들어 끊김을 줄인다.
   */
  update(playerX: number, playerZ: number, budget = 2): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    const centerKey = this.key(cx, cz);

    if (centerKey !== this.centerKey) {
      this.centerKey = centerKey;
      const wanted = chunksInRadius(cx, cz, this.radius);
      const keep = new Set(chunksInRadius(cx, cz, this.radius + 1).map(([a, b]) => this.key(a, b)));
      for (const key of [...this.meshes.keys()]) {
        if (!keep.has(key)) this.unloadChunk(key);
      }
      this.queue = wanted.filter(([a, b]) => !this.meshes.has(this.key(a, b)));
    }

    for (let i = 0; i < budget && this.queue.length > 0; i++) {
      const [a, b] = this.queue.shift() as [number, number];
      if (!this.meshes.has(this.key(a, b))) this.rebuildChunk(a, b);
    }
  }

  /** 처음 시작할 때처럼, 주변 구역을 전부 한 번에 만든다. */
  loadAllNear(playerX: number, playerZ: number): void {
    this.update(playerX, playerZ, Infinity);
  }

  /** (x, z) 자리의 블록이 바뀌었을 때 호출한다. 그려져 있지 않은 구역은 나중에 만들 때 반영된다. */
  updateBlock(x: number, z: number): void {
    for (const [cx, cz] of affectedChunks(x, z)) {
      if (this.meshes.has(this.key(cx, cz))) this.rebuildChunk(cx, cz);
    }
  }
}
