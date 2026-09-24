export interface AchievementDef {
  id: string;
  name: string;
  hint: string;
}

/** 도전 과제 목록. 무엇을 하면 좋은지 길잡이 역할을 한다. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "wood", name: "첫 나무", hint: "나무 기둥을 부숴서 통나무를 얻어요" },
  { id: "planks", name: "목수", hint: "통나무로 판자를 만들어요" },
  { id: "club", name: "무기를 들다", hint: "몽둥이를 만들어요" },
  { id: "meat", name: "사냥꾼", hint: "돼지나 양을 잡아 고기를 얻어요" },
  { id: "cooked", name: "요리사", hint: "고기를 구워서 구운 고기를 만들어요" },
  { id: "zombie", name: "밤의 파수꾼", hint: "좀비를 물리쳐요" },
  { id: "bed", name: "포근한 밤", hint: "침대를 만들어요" },
  { id: "sleep", name: "푹 잤어요", hint: "밤에 침대에서 자고 아침을 맞아요" },
  { id: "iron", name: "광부", hint: "땅속에서 철광석을 캐요" },
  { id: "ironclub", name: "대장장이", hint: "철 몽둥이를 만들어요" },
  { id: "harvest", name: "첫 수확", hint: "씨앗을 심어 밀을 거둬요" },
  { id: "bread", name: "따끈한 빵", hint: "밀로 빵을 만들어요" },
];

/** 달성한 도전 과제를 기억한다. 한 번 달성하면 그대로다. */
export class Achievements {
  private readonly done = new Set<string>();

  /** 처음 달성하면 true (알림을 띄울 때 쓴다). 없는 과제나 이미 달성한 과제는 false. */
  unlock(id: string): boolean {
    if (!ACHIEVEMENTS.some((a) => a.id === id) || this.done.has(id)) return false;
    this.done.add(id);
    return true;
  }

  has(id: string): boolean {
    return this.done.has(id);
  }

  get count(): number {
    return this.done.size;
  }

  toArray(): string[] {
    return [...this.done];
  }

  load(ids: string[]): void {
    this.done.clear();
    for (const id of ids) if (ACHIEVEMENTS.some((a) => a.id === id)) this.done.add(id);
  }
}
