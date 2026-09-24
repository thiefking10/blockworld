import * as THREE from "three";
import { affectedChunks, CHUNKS_X, CHUNKS_Z } from "./chunkMath";
import { buildChunkMesh } from "./mesher";
import { World } from "./world";

/** 월드를 구역 단위 메쉬로 관리한다. 블록이 바뀌면 관련된 구역만 다시 만든다. */
export class ChunkedWorldMesh {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(private readonly world: World) {
    for (let cx = 0; cx < CHUNKS_X; cx++) {
      for (let cz = 0; cz < CHUNKS_Z; cz++) this.rebuildChunk(cx, cz);
    }
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const old = this.meshes.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes.delete(key);
    }

    const mesh = buildChunkMesh(this.world, cx, cz);
    if (mesh) {
      this.group.add(mesh);
      this.meshes.set(key, mesh);
    }
  }

  /** (x, z) 자리의 블록이 바뀌었을 때 호출한다. */
  updateBlock(x: number, z: number): void {
    for (const [cx, cz] of affectedChunks(x, z)) this.rebuildChunk(cx, cz);
  }
}
