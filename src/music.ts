/** 배경음악 한 마디의 길이(초). 8분음표 8칸이다. */
export const BAR_SECONDS = 4;
const SLOTS = 8;

/** 낮: 도 레 미 솔 라 (밝은 5음계) */
export const DAY_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0];
/** 밤: 한 옥타브 낮은 라 도 레 미 솔 (차분한 5음계) */
export const NIGHT_SCALE = [110.0, 130.81, 146.83, 164.81, 196.0];

export interface MusicNote {
  /** 마디 안에서 울리는 시각(초) */
  time: number;
  freq: number;
  /** 울림 길이(초) */
  length: number;
}

export interface Bar {
  notes: MusicNote[];
  /** 다음 마디가 이어서 시작할 음 위치 (음계 안 번호) */
  lastIndex: number;
}

/**
 * 조용한 음악 한 마디를 즉석에서 만든다. 음계 위를 조금씩 오르내리며 듬성듬성 울리고,
 * 가끔은 한 마디를 통째로 쉰다. 그래서 계속 웅웅거리지 않고 잔잔한 분위기만 남는다.
 */
export function composeBar(rng: () => number, night: boolean, startIndex: number): Bar {
  const scale = night ? NIGHT_SCALE : DAY_SCALE;
  let index = Math.max(0, Math.min(scale.length - 1, startIndex));
  const notes: MusicNote[] = [];
  if (rng() < 0.22) return { notes, lastIndex: index };

  const chance = night ? 0.32 : 0.5;
  const slotLength = BAR_SECONDS / SLOTS;
  for (let slot = 0; slot < SLOTS; slot++) {
    if (rng() > chance) continue;
    const step = Math.floor(rng() * 5) - 2;
    index = Math.max(0, Math.min(scale.length - 1, index + step));
    const octave = !night && rng() < 0.18 ? 2 : 1;
    notes.push({ time: slot * slotLength, freq: scale[index] * octave, length: night ? 2.6 : 1.8 });
  }
  return { notes, lastIndex: index };
}
