import { BAR_SECONDS, composeBar } from "./music";
import { Block } from "./world";

export type Material = "stone" | "dirt" | "sand" | "wood" | "leaves" | "water" | "glass" | "snow";

/** 블록이 어떤 재질로 들리는지. 소리를 고를 때 쓴다. */
export function materialOf(block: number): Material {
  switch (block) {
    case Block.Stone:
    case Block.Brick:
    case Block.IronOre:
      return "stone";
    case Block.Glass:
      return "glass";
    case Block.Snow:
    case Block.Wool:
      return "snow";
    case Block.Sand:
      return "sand";
    case Block.Wood:
    case Block.Planks:
      return "wood";
    case Block.Leaves:
    case Block.Cactus:
    case Block.Flower:
    case Block.YellowFlower:
    case Block.Sprout:
    case Block.Wheat:
      return "leaves";
    case Block.Water:
      return "water";
    default:
      return "dirt";
  }
}

interface BurstOptions {
  duration: number;
  type: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
}

/** 효과음 전부를 Web Audio로 직접 합성한다 (음원 파일 없음). */
class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private musicOn = true;
  private night = false;
  private musicBus: GainNode | null = null;
  private musicSend: GainNode | null = null;
  private musicTimer: number | undefined;
  private nextBarTime = 0;
  private noteIndex = 2;

  /** 브라우저 자동재생 제한 때문에, 사용자가 화면을 누른 순간 불러서 소리를 켠다. */
  unlock(): void {
    this.context();
    if (this.musicOn) this.startMusic();
  }

  /** 배경음악을 켜고 끈다. 아직 소리가 잠겨 있으면 잠금이 풀릴 때 적용된다. */
  setMusic(on: boolean): void {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.15);
  }

  isMusicOn(): boolean {
    return this.musicOn;
  }

  /** 밤이면 더 낮고 드문 음으로 바뀐다. */
  setNight(night: boolean): void {
    this.night = night;
  }

  /** 잔잔한 음악을 계속 이어서 만든다. 소리는 울림(에코)을 살짝 얹은 부드러운 사인파다. */
  private startMusic(): void {
    if (this.musicTimer !== undefined) return;
    const ctx = this.context();

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
    this.musicBus.connect(this.master as GainNode);

    // 울림: 지연된 소리를 걸러서 되먹임하면 공간이 있는 것처럼 들린다.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1800;
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.5;
    this.musicSend.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(this.musicBus);

    this.nextBarTime = ctx.currentTime + 1;
    const schedule = (): void => {
      if (this.nextBarTime < ctx.currentTime) this.nextBarTime = ctx.currentTime + 0.2;
      while (this.nextBarTime < ctx.currentTime + 2) {
        const bar = composeBar(Math.random, this.night, this.noteIndex);
        this.noteIndex = bar.lastIndex;
        for (const note of bar.notes) this.playMusicNote(this.nextBarTime + note.time, note.freq, note.length);
        this.nextBarTime += BAR_SECONDS;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 500);
    // 낮에는 새소리, 밤에는 귀뚜라미 소리를 가끔 낸다. 음악 버튼으로 같이 꺼진다.
    window.setInterval(() => {
      if (!this.musicOn) return;
      if (this.night ? Math.random() < 0.3 : Math.random() < 0.14) this.playAmbient();
    }, 1000);
  }

  /** 아주 작은 자연 소리 하나. 낮에는 새가 두세 번 짹짹, 밤에는 귀뚜라미가 빠르게 삑삑삑. */
  private playAmbient(): void {
    const ctx = this.context();
    const now = ctx.currentTime + 0.05;
    const bus = this.musicBus as GainNode;
    const pulses = this.night ? 5 : 2 + Math.floor(Math.random() * 2);
    const base = this.night ? 4300 + Math.random() * 400 : 2600 + Math.random() * 1200;
    for (let i = 0; i < pulses; i++) {
      const at = now + i * (this.night ? 0.09 : 0.16);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(this.night ? base : base * 0.85, at);
      if (!this.night) osc.frequency.exponentialRampToValueAtTime(base * 1.25, at + 0.09);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(this.night ? 0.03 : 0.045, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + (this.night ? 0.05 : 0.11));
      osc.connect(gain);
      gain.connect(bus);
      osc.start(at);
      osc.stop(at + 0.14);
    }
  }

  private playMusicNote(at: number, freq: number, length: number): void {
    const ctx = this.context();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.11, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(this.musicBus as GainNode);
    gain.connect(this.musicSend as GainNode);

    for (const [ratio, level] of [[1, 1], [2, 0.18]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * ratio;
      const part = ctx.createGain();
      part.gain.value = level;
      osc.connect(part);
      part.connect(gain);
      osc.start(at);
      osc.stop(at + length + 0.05);
    }
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const length = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** 짧게 걸러낸 잡음 한 번 (쿵, 사각, 쉬익 같은 소리의 재료). */
  private burst(o: BurstOptions): void {
    const ctx = this.context();
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    source.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq * (0.92 + Math.random() * 0.16);
    filter.Q.value = o.q ?? 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(o.gain, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + o.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    source.start(now);
    source.stop(now + o.duration + 0.02);
  }

  /** 짧은 톤 (나무 블록의 "통" 소리 등). 음이 아래로 미끄러진다. */
  private thump(from: number, to: number, duration: number, gainValue: number): void {
    const ctx = this.context();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private hit(material: Material, strength: number): void {
    switch (material) {
      case "stone":
        this.burst({ duration: 0.16 * strength, type: "bandpass", freq: 1500, q: 1.3, gain: 0.55 });
        this.burst({ duration: 0.1 * strength, type: "highpass", freq: 3200, gain: 0.15 });
        break;
      case "dirt":
        this.burst({ duration: 0.18 * strength, type: "lowpass", freq: 520, gain: 0.7 });
        break;
      case "sand":
        this.burst({ duration: 0.2 * strength, type: "highpass", freq: 2400, gain: 0.22 });
        break;
      case "wood":
        this.burst({ duration: 0.12 * strength, type: "bandpass", freq: 700, q: 1.5, gain: 0.45 });
        this.thump(230, 140, 0.12 * strength, 0.22);
        break;
      case "leaves":
        this.burst({ duration: 0.18 * strength, type: "bandpass", freq: 3400, q: 0.8, gain: 0.3 });
        break;
      case "water":
        this.splash();
        break;
      case "glass":
        this.burst({ duration: 0.22 * strength, type: "bandpass", freq: 5200, q: 2.5, gain: 0.4 });
        this.burst({ duration: 0.12 * strength, type: "highpass", freq: 6500, gain: 0.18 });
        break;
      case "snow":
        this.burst({ duration: 0.18 * strength, type: "lowpass", freq: 1500, gain: 0.35 });
        break;
    }
  }

  playBreak(block: number): void {
    this.hit(materialOf(block), 1);
  }

  playPlace(block: number): void {
    this.hit(materialOf(block), 0.65);
  }

  playStep(block: number): void {
    const m = materialOf(block);
    const soft = m === "stone" ? { type: "bandpass" as const, freq: 1800, q: 1.4 } : { type: "lowpass" as const, freq: m === "sand" ? 1800 : 700, q: 0.8 };
    this.burst({ duration: 0.08, type: soft.type, freq: soft.freq, q: soft.q, gain: 0.32 });
  }

  /** 동물 울음소리. volume은 0~1 (멀수록 작게). 돼지는 낮고 짧은 "꿀", 양은 떨리는 "메". */
  playMob(kind: "pig" | "sheep" | "zombie", volume: number): void {
    if (volume <= 0.01) return;
    const ctx = this.context();
    const now = ctx.currentTime;
    const pig = kind === "pig";
    const zombie = kind === "zombie";
    const duration = pig ? 0.22 : zombie ? 0.7 : 0.55;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(pig ? 240 : zombie ? 120 : 420, now);
    osc.frequency.exponentialRampToValueAtTime(pig ? 150 : zombie ? 70 : 330, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = pig ? 700 : zombie ? 380 : 1400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.32 * volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (kind === "sheep") {
      // 양은 소리를 빠르게 떨어서 "메에에" 느낌을 낸다.
      const tremolo = ctx.createOscillator();
      tremolo.frequency.value = 22;
      const depth = ctx.createGain();
      depth.gain.value = 40;
      tremolo.connect(depth);
      depth.connect(osc.frequency);
      tremolo.start(now);
      tremolo.stop(now + duration + 0.02);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** 동물을 때렸을 때의 퍽 소리. */
  playMobHit(): void {
    this.burst({ duration: 0.12, type: "lowpass", freq: 600, gain: 0.6 });
    this.thump(200, 90, 0.1, 0.25);
  }

  /** 플레이어가 다쳤을 때 (낮고 둔한 소리). */
  playHurt(): void {
    this.burst({ duration: 0.18, type: "lowpass", freq: 420, gain: 0.8 });
    this.thump(160, 60, 0.2, 0.4);
  }

  /** 아이템을 만들었을 때 (짧은 딸깍 두 번). */
  playCraft(): void {
    this.burst({ duration: 0.06, type: "bandpass", freq: 2200, q: 2, gain: 0.35 });
    window.setTimeout(() => this.burst({ duration: 0.09, type: "bandpass", freq: 3000, q: 2, gain: 0.35 }), 90);
  }

  /** 고기를 먹을 때. */
  playEat(): void {
    for (let i = 0; i < 3; i++) window.setTimeout(() => this.burst({ duration: 0.07, type: "bandpass", freq: 900, q: 1, gain: 0.4 }), i * 110);
  }

  splash(): void {
    this.burst({ duration: 0.4, type: "lowpass", freq: 900, gain: 0.5 });
    this.burst({ duration: 0.22, type: "highpass", freq: 2800, gain: 0.2 });
  }
}

export const audio = new GameAudio();
