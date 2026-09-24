export interface QualityLevel {
  name: string;
  /** 화면 선명도 상한 (기기 화소 비율이 이보다 높아도 이 값까지만 쓴다) */
  pixelRatioCap: number;
  /** 그려 두는 구역 반경 */
  radius: number;
}

/** 0이 가장 선명하고 멀리 보이며, 숫자가 클수록 가볍다. */
export const QUALITY_LEVELS: QualityLevel[] = [
  { name: "최고", pixelRatioCap: 2, radius: 5 },
  { name: "높음", pixelRatioCap: 1.5, radius: 4 },
  { name: "보통", pixelRatioCap: 1, radius: 3 },
  { name: "낮음", pixelRatioCap: 0.75, radius: 2 },
];

/** 그려 두는 구역 반경에 맞는 안개 끝 거리. 반경이 줄면 안개도 가까워져서 경계가 티 나지 않는다. */
export function fogFar(radius: number): number {
  return Math.min(70, radius * 16 - 8);
}

/** 이 fps보다 낮은 상태가 이어지면 화질을 한 단계 낮춘다. */
export const SLOW_FPS = 30;
/** 시작 직후(월드 만드는 중 등)에는 fps가 낮아도 세지 않는다. */
const WARMUP_SECONDS = 4;
/** fps가 이 시간(초) 누적으로 느리면 화질을 낮춘다. */
const SLOW_SECONDS = 2;
/** 화질을 바꾼 뒤 이 시간(초)은 다시 판단하지 않는다 (새 구역을 그리느라 잠깐 느려서). */
const COOLDOWN_SECONDS = 4;

/** 폰마다 성능이 다르니, 계속 느리면 스스로 화질을 낮춘다 (다시 올리지는 않는다). */
export class AdaptiveQuality {
  private slow = 0;
  private elapsed = 0;
  private cooldown = 0;

  constructor(public level = 0) {}

  /** 몇 초 동안의 평균 fps를 알려준다. 화질을 낮췄으면 새 단계, 아니면 null. */
  report(fps: number, seconds: number): number | null {
    this.elapsed += seconds;
    if (this.elapsed < WARMUP_SECONDS) return null;
    if (this.cooldown > 0) {
      this.cooldown -= seconds;
      return null;
    }
    this.slow = fps < SLOW_FPS ? this.slow + seconds : Math.max(0, this.slow - seconds);
    if (this.slow >= SLOW_SECONDS && this.level < QUALITY_LEVELS.length - 1) {
      this.level++;
      this.slow = 0;
      this.cooldown = COOLDOWN_SECONDS;
      return this.level;
    }
    return null;
  }
}
