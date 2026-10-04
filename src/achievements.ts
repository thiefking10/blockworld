export interface AchievementDef {
  id: string;
  name: string;
  hint: string;
}

/** 도전 과제 목록. 무엇을 하면 좋은지 길잡이 역할을 한다. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "wood", name: "첫 나무", hint: "나무 기둥을 부숴서 통나무를 얻어요" },
  { id: "planks", name: "목수", hint: "통나무로 판자를 만들어요" },
  { id: "club", name: "무기를 들다", hint: "검을 만들어요" },
  { id: "pickaxe", name: "채굴 시작", hint: "곡괭이를 만들어요" },
  { id: "meat", name: "사냥꾼", hint: "돼지나 양을 잡아 고기를 얻어요" },
  { id: "table", name: "작업 공간", hint: "제작대를 만들어요" },
  { id: "cooked", name: "요리사", hint: "고기를 화로에서 구워요" },
  { id: "ingot", name: "제련", hint: "철광석을 화로에서 구워 철 주괴를 얻어요" },
  { id: "zombie", name: "밤의 파수꾼", hint: "좀비를 물리쳐요" },
  { id: "skeleton", name: "명사수", hint: "해골을 물리쳐요" },
  { id: "creeper", name: "쉿... 펑!", hint: "크리퍼를 물리쳐요" },
  { id: "bed", name: "포근한 밤", hint: "침대를 만들어요" },
  { id: "sleep", name: "푹 잤어요", hint: "밤에 침대에서 자고 아침을 맞아요" },
  { id: "iron", name: "광부", hint: "땅속에서 철광석을 캐요" },
  { id: "ironclub", name: "대장장이", hint: "철 검을 만들어요" },
  { id: "harvest", name: "첫 수확", hint: "씨앗을 심어 밀을 거둬요" },
  { id: "bread", name: "따끈한 빵", hint: "밀로 빵을 만들어요" },
  { id: "torch", name: "불 밝히기", hint: "횃불을 만들어요" },
  { id: "diamond", name: "반짝반짝", hint: "다이아몬드를 캐요" },
  { id: "armor", name: "든든하게", hint: "갑옷을 입어요" },
  { id: "bow", name: "명중", hint: "활로 동물이나 괴물을 맞혀요" },
  { id: "spider", name: "실 끊기", hint: "거미를 물리쳐요" },
  { id: "wolf", name: "가장 친한 친구", hint: "뼈로 늑대를 길들여요" },
  { id: "fish", name: "손맛", hint: "물고기를 잡아요" },
  { id: "summon", name: "소환사", hint: "용의 뿔로 드래곤을 불러내요" },
  { id: "dragon", name: "용 사냥꾼", hint: "드래곤을 물리쳐요" },
  { id: "level5", name: "경험을 쌓다", hint: "경험치 레벨 5에 이르러요" },
  { id: "enchant", name: "마법 부여", hint: "인챈트 테이블에서 도구에 인챈트를 붙여요" },
  { id: "potion", name: "물약 한 모금", hint: "양조대에서 만든 물약을 마셔요" },
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
