import { World } from "./world";

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
const MOVE_SPEED = 4.3;
const GRAVITY = 26;
const JUMP_SPEED = 8.2;

export interface PlayerInput {
  /** 좌우(오른쪽 +), 앞뒤(앞 +). 각각 -1~1 */
  moveX: number;
  moveZ: number;
  jump: boolean;
}

export class Player {
  x = 0;
  y = 0;
  z = 0;
  vy = 0;
  yaw = 0;
  pitch = 0;
  onGround = false;

  constructor(private readonly world: World) {}

  /** 몸이 블록과 겹치는지 검사한다. */
  private collides(px: number, py: number, pz: number): boolean {
    const x0 = Math.floor(px - HALF_WIDTH);
    const x1 = Math.floor(px + HALF_WIDTH);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + HEIGHT);
    const z0 = Math.floor(pz - HALF_WIDTH);
    const z1 = Math.floor(pz + HALF_WIDTH);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  update(dt: number, input: PlayerInput): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    const dx = (forwardX * input.moveZ + rightX * input.moveX) * MOVE_SPEED * dt;
    const dz = (forwardZ * input.moveZ + rightZ * input.moveX) * MOVE_SPEED * dt;

    if (!this.collides(this.x + dx, this.y, this.z)) this.x += dx;
    if (!this.collides(this.x, this.y, this.z + dz)) this.z += dz;

    if (input.jump && this.onGround) this.vy = JUMP_SPEED;
    this.vy -= GRAVITY * dt;

    const dy = this.vy * dt;
    this.onGround = false;
    if (!this.collides(this.x, this.y + dy, this.z)) {
      this.y += dy;
    } else {
      if (this.vy < 0) this.onGround = true;
      this.vy = 0;
    }
  }
}
