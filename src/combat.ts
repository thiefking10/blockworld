import { SWORD_DAMAGE, TOOL_BY_ID } from "./tools";

/** 무기 하나의 성능: 공격력, 다시 휘두를 수 있을 때까지(초), 밀어내는 정도 배율 */
export interface WeaponStats {
  damage: number;
  cooldown: number;
  knock: number;
}

/** 도끼는 검보다 세지만 느리다. 곡괭이·삽은 무기로는 약하다 (재질 순서: 나무, 돌, 철, 다이아몬드). */
export const AXE_DAMAGE = [3, 5, 7, 9, 10];
export const PICKAXE_DAMAGE = [2, 3, 4, 5, 6];
export const SHOVEL_DAMAGE = [1.5, 2.5, 3.5, 4.5, 5.5];

export const FIST: WeaponStats = { damage: 1, cooldown: 0.3, knock: 1 };

/** 손에 든 것(아이템 번호)의 무기 성능. 무기가 아니면 맨손이다. */
export function weaponStats(item: number): WeaponStats {
  const tool = TOOL_BY_ID.get(item);
  if (!tool) return FIST;
  switch (tool.type) {
    case "sword":
      return { damage: SWORD_DAMAGE[tool.tier], cooldown: 0.6, knock: 1 };
    case "axe":
      return { damage: AXE_DAMAGE[tool.tier], cooldown: 1.2, knock: 1.3 };
    case "pickaxe":
      return { damage: PICKAXE_DAMAGE[tool.tier], cooldown: 0.85, knock: 1 };
    default:
      return { damage: SHOVEL_DAMAGE[tool.tier], cooldown: 1, knock: 1 };
  }
}

/** 마지막 공격 뒤 since초가 지났을 때 얼마나 충전됐는지 (0~1). */
export function attackStrength(since: number, cooldown: number): number {
  if (cooldown <= 0) return 1;
  return Math.max(0, Math.min(1, since / cooldown));
}

/** 덜 충전된 채로 휘두르면 약해진다 (충전이 0이어도 20%는 들어간다). */
export function damageScale(strength: number): number {
  return 0.2 + 0.8 * strength * strength;
}

/** 치명타: 거의 다 충전한 채로, 떨어지는 중에 때린다 (마인크래프트처럼 점프해서 내려치기). */
export const CRIT_MULTIPLIER = 1.5;
export function isCriticalHit(falling: boolean, strength: number): boolean {
  return falling && strength > 0.9;
}

export interface MeleeResult {
  damage: number;
  knock: number;
  crit: boolean;
}

/** 기본으로 밀어내는 세기. 약하게 때리면 덜 밀리고, 치명타와 도끼는 더 밀린다. */
export const BASE_KNOCK = 6;

/**
 * 근접 공격 한 번의 결과.
 * bonus는 날카로움 인챈트나 힘 물약이 더해 주는 공격력이다 (충전에 따라 같이 약해진다).
 * baseOverride가 있으면 무기 공격력 대신 그 값을 쓴다 (창작 모드는 맨손도 세다).
 */
export function meleeResult(item: number, strength: number, falling: boolean, bonus = 0, baseOverride?: number): MeleeResult {
  const weapon = weaponStats(item);
  const base = baseOverride !== undefined ? Math.max(baseOverride, weapon.damage) : weapon.damage;
  const crit = isCriticalHit(falling, strength);
  const damage = (base + bonus) * damageScale(strength) * (crit ? CRIT_MULTIPLIER : 1);
  const knock = BASE_KNOCK * weapon.knock * (0.5 + 0.5 * strength) * (crit ? 1.25 : 1);
  return { damage, knock, crit };
}

// ---- 활

/** 활을 끝까지 당기는 데 걸리는 시간(초) */
export const BOW_FULL_DRAW = 1;
/** 이보다 짧게 당기면 쏘지 않는다 (톡 눌러서 헛발 쏘는 것을 막는다). */
export const BOW_MIN_POWER = 0.12;

/** 당긴 시간(초)에 따른 힘 (0~1). 마인크래프트와 같은 곡선이라 처음엔 약하고 끝으로 갈수록 빨리 세진다. */
export function bowPower(drawSeconds: number): number {
  const r = Math.max(0, Math.min(1, drawSeconds / BOW_FULL_DRAW));
  return Math.min(1, (r * r + r * 2) / 3);
}

/** 화살이 날아가는 속도(칸/초). 끝까지 당기면 빠르다. */
export function arrowSpeed(power: number): number {
  return 14 + 24 * power;
}

/** 화살 공격력. 끝까지 당기면 치명타로 조금 더 세다. */
export function arrowDamage(power: number, powerMultiplier = 1): number {
  return (2 + 4 * power) * (power >= 1 ? 1.3 : 1) * powerMultiplier;
}

// ---- 방패

export const SHIELD_DURABILITY = 336;
/** 방패가 막아 주는 각도: 바라보는 방향과 공격이 온 방향 사이의 cos 값이 이보다 크면 막는다 (앞쪽 약 150도). */
export const SHIELD_MIN_COS = 0.25;
/** 방패로 막아도 폭발은 일부만 줄어든다 (이 비율만 받는다). */
export const SHIELD_EXPLOSION_TAKEN = 0.4;
/** 방패를 든 채로는 천천히 걷는다. */
export const SHIELD_WALK_FACTOR = 0.6;

/** 이 방향(sx, sz 쪽)에서 온 공격을, 이쪽(px, pz)에서 yaw 방향을 보며 든 방패가 막는지. */
export function shieldBlocks(yaw: number, px: number, pz: number, sx: number, sz: number): boolean {
  const dx = sx - px;
  const dz = sz - pz;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const lookX = -Math.sin(yaw);
  const lookZ = -Math.cos(yaw);
  return (lookX * dx + lookZ * dz) / length > SHIELD_MIN_COS;
}

/** 막은 공격의 방패 닳음: 센 공격일수록 많이 닳는다. */
export function shieldWear(damage: number): number {
  return Math.max(1, Math.round(damage));
}
