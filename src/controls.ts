const LOOK_SPEED = 0.005;
const STICK_RADIUS = 56;
/** 부수기/놓기 버튼을 꾹 누르고 있을 때 반복하는 간격(밀리초) */
const REPEAT_MS = 280;

/** 터치(왼쪽 조이스틱 / 오른쪽 드래그 시점 / 점프 버튼)와 키보드·마우스 입력. */
export class Controls {
  moveX = 0;
  moveZ = 0;
  jump = false;
  /** 비행 중 내려가기 버튼/키를 누르고 있는지 */
  descend = false;
  /** 점프 버튼이나 스페이스를 새로 누른 순간 (두 번 빨리 누르면 비행 전환에 쓴다) */
  onJumpPress?: () => void;
  /** 시점 돌리는 속도 배율 (설정에서 바꾼다). */
  lookScale = 1;
  /** 부수기 버튼(또는 Q)을 누르고 있는지. 짧게 톡 눌러도 한 프레임은 눌린 것으로 친다. */
  breakHeld = false;
  private breakLatch = false;
  onPlace?: () => void;
  /** 제작대·화로를 가리키고 있을 때 나타나는 "사용" 버튼 (또는 F키) */
  onUse?: () => void;
  onSelectSlot?: (index: number) => void;
  private lookDeltaX = 0;
  private lookDeltaY = 0;

  private stickPointer: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private lookPointer: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private readonly keys = new Set<string>();

  private readonly base = document.getElementById("joystick-base") as HTMLElement;
  private readonly knob = document.getElementById("joystick-knob") as HTMLElement;
  private readonly jumpButton = document.getElementById("jump-button") as HTMLElement;

  constructor(surface: HTMLElement) {
    surface.addEventListener("pointerdown", (e) => this.onDown(e));
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("pointercancel", (e) => this.onUp(e));

    this.jumpButton.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.jump = true;
      this.jumpButton.classList.add("active");
      this.onJumpPress?.();
    });

    const descendButton = document.getElementById("descend-button") as HTMLElement;
    descendButton.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.descend = true;
      descendButton.classList.add("active");
    });
    const releaseDescend = () => {
      this.descend = false;
      descendButton.classList.remove("active");
    };
    descendButton.addEventListener("pointerup", releaseDescend);
    descendButton.addEventListener("pointercancel", releaseDescend);
    descendButton.addEventListener("pointerleave", releaseDescend);
    const releaseJump = () => {
      this.jump = false;
      this.jumpButton.classList.remove("active");
    };
    this.jumpButton.addEventListener("pointerup", releaseJump);
    this.jumpButton.addEventListener("pointercancel", releaseJump);

    const breakButton = document.getElementById("break-button") as HTMLElement;
    breakButton.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      breakButton.classList.add("active");
      this.breakHeld = true;
      this.breakLatch = true;
    });
    const releaseBreak = () => {
      breakButton.classList.remove("active");
      this.breakHeld = false;
    };
    breakButton.addEventListener("pointerup", releaseBreak);
    breakButton.addEventListener("pointercancel", releaseBreak);
    breakButton.addEventListener("pointerleave", releaseBreak);
    this.bindActionButton("place-button", () => this.onPlace?.());
    this.bindActionButton("use-button", () => this.onUse?.(), false);

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Space" && !e.repeat) this.onJumpPress?.();
      if (e.code === "KeyQ") this.breakLatch = true;
      if (e.code === "KeyE") this.onPlace?.();
      if (e.code === "KeyF") this.onUse?.();
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) this.onSelectSlot?.(Number(digit[1]) - 1);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  /** 버튼을 누르는 순간 한 번 실행하고, 계속 누르고 있으면 조금씩 간격을 두고 반복한다. */
  private bindActionButton(id: string, action: () => void, repeat = true): void {
    const button = document.getElementById(id) as HTMLElement;
    let repeatTimer: number | undefined;
    button.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      button.classList.add("active");
      action();
      window.clearInterval(repeatTimer);
      if (repeat) repeatTimer = window.setInterval(action, REPEAT_MS);
    });
    const release = () => {
      button.classList.remove("active");
      window.clearInterval(repeatTimer);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  private onDown(e: PointerEvent): void {
    const isLeftHalf = e.clientX < window.innerWidth * 0.45;
    if (isLeftHalf && this.stickPointer === null) {
      this.stickPointer = e.pointerId;
      this.stickOriginX = e.clientX;
      this.stickOriginY = e.clientY;
      this.showStick(e.clientX, e.clientY);
    } else if (!isLeftHalf && this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.stickPointer) {
      let dx = e.clientX - this.stickOriginX;
      let dy = e.clientY - this.stickOriginY;
      const length = Math.hypot(dx, dy);
      if (length > STICK_RADIUS) {
        dx = (dx / length) * STICK_RADIUS;
        dy = (dy / length) * STICK_RADIUS;
      }
      this.moveX = dx / STICK_RADIUS;
      this.moveZ = -dy / STICK_RADIUS;
      this.placeKnob(this.stickOriginX + dx, this.stickOriginY + dy);
    } else if (e.pointerId === this.lookPointer) {
      this.lookDeltaX += e.clientX - this.lastLookX;
      this.lookDeltaY += e.clientY - this.lastLookY;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.moveX = 0;
      this.moveZ = 0;
      this.base.style.display = "none";
      this.knob.style.display = "none";
    } else if (e.pointerId === this.lookPointer) {
      this.lookPointer = null;
    }
  }

  private showStick(x: number, y: number): void {
    this.base.style.display = "block";
    this.knob.style.display = "block";
    this.base.style.left = `${x - 60}px`;
    this.base.style.top = `${y - 60}px`;
    this.placeKnob(x, y);
  }

  private placeKnob(x: number, y: number): void {
    this.knob.style.left = `${x - 26}px`;
    this.knob.style.top = `${y - 26}px`;
  }

  /** 이번 프레임에 부수기를 누르고 있는지 (짧게 누른 것도 놓치지 않는다). */
  consumeBreak(): boolean {
    const held = this.breakHeld || this.keys.has("KeyQ") || this.breakLatch;
    this.breakLatch = false;
    return held;
  }

  /** 지금까지 쌓인 시점 회전량을 꺼내고 비운다. */
  consumeLook(): { yaw: number; pitch: number } {
    const speed = LOOK_SPEED * this.lookScale;
    const result = { yaw: -this.lookDeltaX * speed, pitch: -this.lookDeltaY * speed };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return result;
  }

  /** 터치 입력과 키보드 입력을 합친 이동값. */
  currentInput(): { moveX: number; moveZ: number; jump: boolean; descend: boolean } {
    let moveX = this.moveX;
    let moveZ = this.moveZ;
    if (this.keys.has("KeyW")) moveZ += 1;
    if (this.keys.has("KeyS")) moveZ -= 1;
    if (this.keys.has("KeyD")) moveX += 1;
    if (this.keys.has("KeyA")) moveX -= 1;
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) {
      moveX /= length;
      moveZ /= length;
    }
    return {
      moveX,
      moveZ,
      jump: this.jump || this.keys.has("Space"),
      descend: this.descend || this.keys.has("ShiftLeft") || this.keys.has("KeyC"),
    };
  }
}
