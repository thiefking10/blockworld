/** 하루 길이(초). 실제 시간으로 4분에 낮과 밤이 한 바퀴 돈다. */
export const DAY_LENGTH_SECONDS = 240;

type RGB = [number, number, number];

const NIGHT_SKY: RGB = [0.04, 0.06, 0.17];
const DAY_SKY: RGB = [0.53, 0.81, 0.92];
const TWILIGHT_SKY: RGB = [0.94, 0.54, 0.36];

/**
 * 하루의 위치(phase, 0~1). 0 = 한밤중, 0.25 = 해 뜰 때, 0.5 = 한낮, 0.75 = 해 질 때.
 * 태양 높이: 한낮 1, 한밤중 -1.
 */
export function sunHeight(phase: number): number {
  return -Math.cos(phase * Math.PI * 2);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 낮 밝기(0 = 밤, 1 = 낮). 해가 지평선 근처일 때 부드럽게 바뀐다. */
export function daylight(phase: number): number {
  return smoothstep(-0.15, 0.35, sunHeight(phase));
}

/** 하늘(과 안개) 색. 해가 뜨고 질 때는 붉은 노을 기운이 섞인다. */
export function skyColor(phase: number): RGB {
  const base = mix(NIGHT_SKY, DAY_SKY, daylight(phase));
  const twilight = Math.max(0, 1 - Math.abs(sunHeight(phase)) / 0.28) * 0.65;
  return mix(base, TWILIGHT_SKY, twilight);
}

/** 블록에 곱하는 전체 밝기 색. 밤에는 어둡고 푸르스름하다. */
export function ambientColor(phase: number): RGB {
  const d = daylight(phase);
  return [0.2 + 0.8 * d, 0.24 + 0.76 * d, 0.42 + 0.58 * d];
}

/** 아침 시각의 하루 위치. 게임을 처음 시작할 때와 침대에서 일어날 때 이 시각이 된다. */
export const MORNING_PHASE = 0.3;

/** 지금(초)부터 가장 가까운 다음 아침의 시각(초). 이미 아침이 막 시작한 순간이면 다음 날 아침이다. */
export function nextMorning(seconds: number): number {
  const day = Math.floor(seconds / DAY_LENGTH_SECONDS);
  const today = (day + MORNING_PHASE) * DAY_LENGTH_SECONDS;
  return today > seconds ? today : today + DAY_LENGTH_SECONDS;
}

/** 시간(초)을 하루의 위치(0~1)로 바꾼다. */
export function phaseFromSeconds(seconds: number): number {
  const phase = (seconds / DAY_LENGTH_SECONDS) % 1;
  return phase < 0 ? phase + 1 : phase;
}
