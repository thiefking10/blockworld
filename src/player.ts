import { overlapsCollision } from "./shapes";
import { Block, isLadder, isShaped, World } from "./world";

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
const MOVE_SPEED = 4.3;
const GRAVITY = 26;
const JUMP_SPEED = 8.2;
const WATER_SPEED_FACTOR = 0.6;
const WATER_GRAVITY = 6;
const WATER_SWIM_UP = 30;
const WATER_MAX_RISE = 3.4;
const WATER_MAX_SINK = 3;
/** 사다리를 오르는 속도와, 매달려 있을 때 천천히 미끄러지는 속도 */
const LADDER_CLIMB = 3.2;
const LADDER_SLIDE = 1.6;
/** 비행 중 위아래 속도와 걷기 대비 이동 속도 배율 */
export const FLY_SPEED = 7;
export const FLY_MOVE_FACTOR = 2;

export interface PlayerInput {
  /** 좌우(오른쪽 +), 앞뒤(앞 +). 각각 -1~1 */
  moveX: number;
  moveZ: number;
  jump: boolean;
  /** 비행 중 내려가기 (없으면 false) */
  descend?: boolean;
}

export class Player {
  x = 0;
  y = 0;
  z = 0;
  vy = 0;
  yaw = 0;
  pitch = 0;
  onGround = false;
  /** 걷다가 한 칸 높이 턱에 부딪히면 알아서 뛰어 오른다 (터치 조작이 편하도록). */
  autoJump = true;
  /** 하늘을 나는 중 (창작 모드). 중력이 없고, 땅에 닿으면 저절로 끝난다. */
  flying = false;
  /** 걷는 속도 배율 (속도 물약 같은 효과) */
  speedFactor = 1;
  /** 사다리에 매달려 있는 중 (떨어지는 높이를 세지 않는다). */
  onLadder = false;

  constructor(private readonly world: World) {}

  /** 몸이 블록과 겹치는지 검사한다. */
  private collides(px: number, py: number, pz: number): boolean {
    const x0 = Math.floor(px - HALF_WIDTH);
    const x1 = Math.floor(px + HALF_WIDTH);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + HEIGHT);
    const z0 = Math.floor(pz - HALF_WIDTH);
    const z1 = Math.floor(pz + HALF_WIDTH);
    // 울타리처럼 칸보다 키가 큰 블록은 바로 아래 칸에서 위로 솟아 있어서, 한 칸 아래도 모양 블록만 살핀다.
    for (let x = x0; x <= x1; x++) {
      for (let y = y0 - 1; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const block = this.world.get(x, y, z);
          if (y < y0 && !isShaped(block)) continue;
          if (isShaped(block)) {
            // 계단·반블록·문 같은 모양 블록은 칸 전체가 아니라 실제 모양과만 부딪힌다.
            const min: [number, number, number] = [px - HALF_WIDTH - x, py - y, pz - HALF_WIDTH - z];
            const max: [number, number, number] = [px + HALF_WIDTH - x, py + HEIGHT - y, pz + HALF_WIDTH - z];
            if (overlapsCollision(block, min, max)) return true;
          } else if (this.world.isSolid(x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 몸 한가운데가 물속인지. */
  isInWater(): boolean {
    return this.world.get(Math.floor(this.x), Math.floor(this.y + 0.9), Math.floor(this.z)) === Block.Water;
  }

  /** 몸이 사다리 칸에 걸쳐 있는지 (발 높이나 가슴 높이). */
  private touchesLadder(): boolean {
    const x = Math.floor(this.x);
    const z = Math.floor(this.z);
    return isLadder(this.world.get(x, Math.floor(this.y + 0.1), z)) || isLadder(this.world.get(x, Math.floor(this.y + 1), z));
  }

  /** 이 블록 칸이 플레이어 몸과 겹치는지. 블록을 놓을 때 자기 몸에 놓지 않도록 쓴다. */
  intersectsBlock(bx: number, by: number, bz: number): boolean {
    return (
      this.x + HALF_WIDTH > bx &&
      this.x - HALF_WIDTH < bx + 1 &&
      this.y + HEIGHT > by &&
      this.y < by + 1 &&
      this.z + HALF_WIDTH > bz &&
      this.z - HALF_WIDTH < bz + 1
    );
  }

  update(dt: number, input: PlayerInput): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    const inWater = this.isInWater();
    const speed = (this.flying ? MOVE_SPEED * FLY_MOVE_FACTOR : inWater ? MOVE_SPEED * WATER_SPEED_FACTOR : MOVE_SPEED) * this.speedFactor;
    const dx = (forwardX * input.moveZ + rightX * input.moveX) * speed * dt;
    const dz = (forwardZ * input.moveZ + rightZ * input.moveX) * speed * dt;

    const blockedX = this.collides(this.x + dx, this.y, this.z);
    const blockedZ = this.collides(this.x, this.y, this.z + dz);
    if (!blockedX) this.x += dx;
    if (!blockedZ) this.z += dz;

    // 부딪힌 방향으로 한 칸 높이에 머리 위까지 빈 공간이 있으면 오를 수 있는 턱이다.
    const stepUp =
      this.autoJump &&
      !this.flying &&
      this.onGround &&
      !inWater &&
      (blockedX || blockedZ) &&
      !this.collides(this.x + (blockedX ? dx : 0), this.y + 1.05, this.z + (blockedZ ? dz : 0));

    this.onLadder = !this.flying && !inWater && this.touchesLadder();

    if (this.flying) {
      this.vy = input.jump ? FLY_SPEED : input.descend ? -FLY_SPEED : 0;
    } else if (this.onLadder) {
      // 점프나 앞으로 밀면 오르고, 아무것도 안 누르면 천천히 미끄러진다. 내려가기를 누르면 빨리 내려간다.
      this.vy = input.jump || input.moveZ > 0 ? LADDER_CLIMB : input.descend ? -LADDER_CLIMB : -LADDER_SLIDE;
    } else if (inWater) {
      if (input.jump) this.vy = Math.min(this.vy + WATER_SWIM_UP * dt, WATER_MAX_RISE);
      else this.vy = Math.max(this.vy - WATER_GRAVITY * dt, -WATER_MAX_SINK);
    } else {
      if ((input.jump || stepUp) && this.onGround) this.vy = JUMP_SPEED;
      this.vy -= GRAVITY * dt;
    }

    const dy = this.vy * dt;
    this.onGround = false;
    if (!this.collides(this.x, this.y + dy, this.z)) {
      this.y += dy;
    } else {
      if (this.vy < 0) {
        this.onGround = true;
        this.flying = false;
      }
      this.vy = 0;
    }
  }
}
