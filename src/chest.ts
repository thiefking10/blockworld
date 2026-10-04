import { Inventory } from "./inventory";

export type ChestEntry = [number, number, number, [number, number][], [number, number][], [number, [string, number][]][]?];

/** 월드에 놓인 상자들. 상자마다 가방과 같은 27칸 보관함이 하나씩 있다. 화면 없이 계산만 한다. */
export class ChestField {
  private readonly chests = new Map<string, Inventory>();

  private key(x: number, y: number, z: number): string {
    return x + "," + y + "," + z;
  }

  /** 이 자리 상자의 보관함 (처음이면 빈 것을 만든다). */
  at(x: number, y: number, z: number): Inventory {
    const key = this.key(x, y, z);
    let chest = this.chests.get(key);
    if (!chest) {
      chest = new Inventory();
      this.chests.set(key, chest);
    }
    return chest;
  }

  /** 상자를 치운다. 안에 들어 있던 [번호, 개수] 목록을 돌려준다. */
  remove(x: number, y: number, z: number): [number, number][] {
    const key = this.key(x, y, z);
    const chest = this.chests.get(key);
    this.chests.delete(key);
    return chest ? chest.entries() : [];
  }

  /** 저장용: 안에 뭔가 든 상자들만. */
  toArray(): ChestEntry[] {
    const out: ChestEntry[] = [];
    for (const [key, chest] of this.chests) {
      const entries = chest.entries();
      if (entries.length === 0) continue;
      const [x, y, z] = key.split(",").map(Number);
      out.push([x, y, z, entries, chest.wearEntries(), chest.enchantEntries()]);
    }
    return out;
  }

  load(list: ChestEntry[]): void {
    this.chests.clear();
    for (const [x, y, z, entries, wear, enchants] of list) this.at(x, y, z).load(entries, wear, enchants ?? []);
  }
}

/** 한 종류 아이템을 from에서 to로 최대한 옮긴다 (도구는 닳은 정도도 같이 옮긴다). 옮긴 개수를 돌려준다. */
export function moveStack(from: Inventory, to: Inventory, item: number): number {
  const amount = Math.min(from.count(item), to.freeSpace(item));
  if (amount <= 0) return 0;
  const left = from.toolLeft(item);
  const enchants = from.enchantsOf(item);
  from.remove(item, amount);
  const added = to.add(item, amount);
  if (left > 0) to.setWear(item, left);
  for (const [id, level] of enchants) to.addEnchant(item, id, level);
  return added;
}
