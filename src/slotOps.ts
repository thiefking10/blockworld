import type { EnchantId } from "./enchant";

/** 한 칸에 든 것. 도구·방어구·활·방패는 닳은 정도(wear)와 인챈트를 달고 다닌다. */
export interface Stack {
  item: number;
  count: number;
  wear?: number;
  enchants?: [EnchantId, number][];
}

/** 칸 목록(가방, 제작 격자)을 같은 방식으로 다루기 위한 연결부. */
export interface SlotHost {
  readonly size: number;
  get(index: number): Stack | null;
  set(index: number, stack: Stack | null): void;
  /** 이 아이템이 한 칸에 쌓일 수 있는 최대 개수 */
  maxStack(item: number): number;
}

export function copyStack(stack: Stack): Stack {
  const copy: Stack = { item: stack.item, count: stack.count };
  if (stack.wear !== undefined) copy.wear = stack.wear;
  if (stack.enchants) copy.enchants = stack.enchants.map(([id, level]) => [id, level]);
  return copy;
}

/**
 * 칸에서 집어 든다. "all"이면 전부, "half"면 절반(올림). 집어 든 것을 돌려주고, 빈 칸이면 null.
 * 도구의 닳은 정도와 인챈트는 전부 집을 때 함께 따라간다.
 */
export function pickUp(host: SlotHost, index: number, mode: "all" | "half"): Stack | null {
  const stack = host.get(index);
  if (!stack) return null;
  const take = mode === "all" ? stack.count : Math.ceil(stack.count / 2);
  if (take >= stack.count) {
    host.set(index, null);
    return copyStack(stack);
  }
  host.set(index, { item: stack.item, count: stack.count - take });
  return { item: stack.item, count: take };
}

/**
 * 들고 있는 것(cursor)을 칸에 놓는다. 놓고 남은 것(없으면 null)을 돌려준다.
 * - 빈 칸: "all"이면 전부, "one"이면 하나만.
 * - 같은 아이템: 자리가 남은 만큼 합친다 ("one"이면 하나만).
 * - 다른 아이템: "all"일 때만 서로 바꾼다 (칸에 있던 것이 새로 들려 온다). "one"이면 아무것도 안 한다.
 */
export function placeInto(host: SlotHost, index: number, cursor: Stack, mode: "all" | "one"): Stack | null {
  const slot = host.get(index);
  const max = host.maxStack(cursor.item);
  const want = mode === "one" ? 1 : cursor.count;

  if (!slot) {
    const n = Math.min(want, max);
    if (n <= 0) return cursor;
    if (n >= cursor.count) {
      host.set(index, copyStack(cursor));
      return null;
    }
    host.set(index, { item: cursor.item, count: n });
    return { ...cursor, count: cursor.count - n };
  }

  if (slot.item === cursor.item) {
    const room = max - slot.count;
    const n = Math.min(want, room);
    if (n <= 0) return cursor;
    host.set(index, { ...slot, count: slot.count + n });
    return n >= cursor.count ? null : { ...cursor, count: cursor.count - n };
  }

  if (mode === "one") return cursor;
  if (cursor.count > max) return cursor;
  host.set(index, copyStack(cursor));
  return copyStack(slot);
}

/** 단순한 칸 배열 (제작 격자용). */
export class ArrayHost implements SlotHost {
  private readonly cells: (Stack | null)[];

  constructor(
    readonly size: number,
    private readonly stackMax: (item: number) => number,
  ) {
    this.cells = new Array(size).fill(null);
  }

  get(index: number): Stack | null {
    const stack = this.cells[index];
    return stack ? copyStack(stack) : null;
  }

  set(index: number, stack: Stack | null): void {
    this.cells[index] = stack ? copyStack(stack) : null;
  }

  maxStack(item: number): number {
    return this.stackMax(item);
  }

  /** 안에 든 것을 모두 꺼내 비운다. */
  takeAll(): Stack[] {
    const out: Stack[] = [];
    for (let i = 0; i < this.size; i++) {
      const stack = this.cells[i];
      if (stack) out.push(copyStack(stack));
      this.cells[i] = null;
    }
    return out;
  }
}
