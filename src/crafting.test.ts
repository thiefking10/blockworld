import { describe, expect, it } from "vitest";
import { matchGrid, planFill, shapeOf, sizeNeeded, usableAt } from "./crafting";
import { Inventory, Item, RECIPES } from "./inventory";
import { ArrayHost, pickUp, placeInto, type Stack } from "./slotOps";
import { blockName, DEFAULT_HOTBAR, HOTBAR_SIZE, sanitizeHotbar } from "./blocks";
import { Block } from "./world";

describe("제작 격자 맞추기", () => {
  it("모든 제작법은 채우기 배치를 그대로 놓으면 바로 그 제작법이 나온다", () => {
    for (const recipe of RECIPES) {
      for (const context of ["hand", "table"] as const) {
        if (!usableAt(recipe, context)) continue;
        const size = context === "hand" ? 2 : 3;
        const plan = planFill(recipe, size, size);
        if (!plan) continue; // 이 격자엔 안 들어가는 큰 제작법
        expect(matchGrid(plan, size, size, context)?.name, recipe.name + " @" + context).toBe(recipe.name);
      }
    }
  });

  it("제작대로 만드는 제작법은 모두 3×3 안에 들어간다 (격자로 만들 수 없는 것이 없다)", () => {
    for (const recipe of RECIPES) {
      if (recipe.station === "brewing") continue;
      expect(planFill(recipe, 3, 3), recipe.name).not.toBeNull();
    }
  });

  it("가방 2×2로는 판자·막대·횃불·제작대만 만든다", () => {
    const handNames = RECIPES.filter((r) => usableAt(r, "hand")).map((r) => r.name);
    expect(handNames).toEqual(["판자", "막대", "횃불", "횃불 (통나무로)", "제작대"]);
    for (const recipe of RECIPES) {
      if (!usableAt(recipe, "hand")) continue;
      expect(planFill(recipe, 2, 2), recipe.name).not.toBeNull();
    }
    // 제작대 제작법은 2×2에 놓아도 안 된다 (화살은 막대 하나)
    expect(matchGrid([Item.Stick, 0, 0, 0], 2, 2, "hand")).toBeNull();
    expect(matchGrid([Item.Stick, 0, 0, 0, 0, 0, 0, 0, 0], 3, 3, "table")?.name).toBe("화살");
  });

  it("곡괭이와 도끼는 재료가 같아도 모양으로 구별한다", () => {
    const I = Item.IronIngot;
    const S = Item.Stick;
    expect(matchGrid([I, I, I, 0, S, 0, 0, S, 0], 3, 3, "table")?.name).toBe("철 곡괭이");
    expect(matchGrid([I, I, 0, I, S, 0, 0, S, 0], 3, 3, "table")?.name).toBe("철 도끼");
    expect(matchGrid([0, I, 0, 0, S, 0, 0, S, 0], 3, 3, "table")?.name).toBe("철 삽");
    expect(matchGrid([0, I, 0, 0, I, 0, 0, S, 0], 3, 3, "table")?.name).toBe("철 검");
  });

  it("격자 어디에 놓아도, 좌우를 뒤집어 놓아도 같은 모양이면 된다", () => {
    const I = Item.IronIngot;
    const S = Item.Stick;
    // 오른쪽 아래로 밀어 놓은 삽
    expect(matchGrid([0, 0, 0, 0, 0, I, 0, 0, S], 3, 3, "table")).toBeNull(); // 모양이 달라서 안 됨 (재료 2개)
    expect(matchGrid([0, 0, I, 0, 0, S, 0, 0, S], 3, 3, "table")?.name).toBe("철 삽");
    // 뒤집은 도끼
    expect(matchGrid([0, I, I, 0, S, I, 0, S, 0], 3, 3, "table")?.name).toBe("철 도끼");
  });

  it("모양이 틀리면 안 된다 (재료가 맞아도)", () => {
    const P = Block.Planks;
    expect(matchGrid([P, 0, 0, 0, P, 0, 0, 0, 0], 3, 3, "table")).toBeNull(); // 막대인데 세로가 아니다
    expect(matchGrid([P, 0, 0, P, 0, 0, 0, 0, 0], 3, 3, "table")?.name).toBe("막대");
  });

  it("문과 계단은 같은 재료 6개라도 모양으로 구별한다", () => {
    const P = Block.Planks;
    expect(matchGrid([P, P, 0, P, P, 0, P, P, 0], 3, 3, "table")?.name).toBe("문");
    expect(matchGrid([P, 0, 0, P, P, 0, P, P, P], 3, 3, "table")?.name).toBe("판자 계단");
    expect(matchGrid([0, 0, P, 0, P, P, P, P, P], 3, 3, "table")?.name).toBe("판자 계단"); // 뒤집어도
    expect(matchGrid([P, P, P, P, P, P, 0, 0, 0], 3, 3, "table")).toBeNull();
  });

  it("모양 없는 제작법은 재료 칸 수만 맞으면 어디에 놓아도 된다", () => {
    const W = Block.Wool;
    const P = Block.Planks;
    expect(matchGrid([W, P, W, P, W, P, 0, 0, 0], 3, 3, "table")?.name).toBe("침대");
    expect(matchGrid([P, P, P, W, W, W, 0, 0, 0], 3, 3, "table")?.name).toBe("침대");
    expect(matchGrid([W, P, W, P, W, 0, 0, 0, 0], 3, 3, "table")).toBeNull(); // 판자 하나 모자람
    expect(matchGrid([W, P, W, P, W, P, P, 0, 0], 3, 3, "table")).toBeNull(); // 하나 많음
  });

  it("빈 격자나 모르는 조합은 아무것도 안 나온다", () => {
    expect(matchGrid(new Array(9).fill(0), 3, 3, "table")).toBeNull();
    expect(matchGrid([Block.Dirt, 0, 0, 0, 0, 0, 0, 0, 0], 3, 3, "table")).toBeNull();
  });

  it("가방에서 통나무 하나로 판자 4개, 판자 2개를 세로로 놓으면 막대", () => {
    expect(matchGrid([Block.Wood, 0, 0, 0], 2, 2, "hand")?.output).toEqual([Block.Planks, 4]);
    expect(matchGrid([Block.Planks, 0, Block.Planks, 0], 2, 2, "hand")?.output).toEqual([Item.Stick, 4]);
    expect(matchGrid([Block.Planks, Block.Planks, Block.Planks, Block.Planks], 2, 2, "hand")?.name).toBe("제작대");
    expect(matchGrid([Item.Coal, 0, Item.Stick, 0], 2, 2, "hand")?.output).toEqual([Block.Torch, 4]);
  });

  it("제작법 크기와 모양 정보", () => {
    expect(sizeNeeded(RECIPES.find((r) => r.name === "철 곡괭이")!)).toEqual({ width: 3, height: 3 });
    expect(sizeNeeded(RECIPES.find((r) => r.name === "막대")!)).toEqual({ width: 1, height: 2 });
    expect(shapeOf(RECIPES.find((r) => r.name === "침대")!)).toBeNull();
    expect(planFill(RECIPES.find((r) => r.name === "화로")!, 2, 2)).toBeNull();
  });
});

describe("칸 집기·놓기", () => {
  const host = () => new ArrayHost(4, (item) => (item >= 100 ? 1 : 64));
  const stack = (item: number, count: number): Stack => ({ item, count });

  it("전부 집어 들고, 빈 칸에 놓는다", () => {
    const h = host();
    h.set(0, stack(3, 10));
    const cursor = pickUp(h, 0, "all");
    expect(cursor).toEqual(stack(3, 10));
    expect(h.get(0)).toBeNull();
    expect(placeInto(h, 2, cursor!, "all")).toBeNull();
    expect(h.get(2)).toEqual(stack(3, 10));
  });

  it("절반만 집고(올림), 하나씩 놓는다", () => {
    const h = host();
    h.set(0, stack(3, 11));
    const half = pickUp(h, 0, "half")!;
    expect(half.count).toBe(6);
    expect(h.get(0)?.count).toBe(5);
    let cursor: Stack | null = half;
    cursor = placeInto(h, 1, cursor, "one");
    cursor = placeInto(h, 1, cursor!, "one");
    expect(h.get(1)?.count).toBe(2);
    expect(cursor?.count).toBe(4);
  });

  it("같은 아이템은 합치고, 넘치면 남는다", () => {
    const h = host();
    h.set(0, stack(3, 60));
    const rest = placeInto(h, 0, stack(3, 10), "all");
    expect(h.get(0)?.count).toBe(64);
    expect(rest?.count).toBe(6);
    expect(placeInto(h, 0, rest!, "all")).toEqual(rest); // 이미 가득
  });

  it("다른 아이템 칸에 놓으면 서로 바뀐다 (하나씩 모드에서는 안 바뀐다)", () => {
    const h = host();
    h.set(0, stack(3, 5));
    const swapped = placeInto(h, 0, stack(4, 2), "all");
    expect(swapped).toEqual(stack(3, 5));
    expect(h.get(0)).toEqual(stack(4, 2));
    expect(placeInto(h, 0, stack(5, 9), "one")).toEqual(stack(5, 9));
    expect(h.get(0)).toEqual(stack(4, 2));
  });

  it("빈 칸을 집으면 아무것도 없다", () => {
    expect(pickUp(host(), 1, "all")).toBeNull();
  });

  it("한 칸에 하나만 쌓이는 아이템은 하나씩만 놓인다", () => {
    const h = host();
    h.set(0, stack(150, 1));
    expect(placeInto(h, 0, stack(150, 1), "all")?.count).toBe(1); // 이미 가득(1)
  });
});

describe("가방과 칸 옮기기", () => {
  it("닳은 도구를 집어 다른 칸에 놓아도 내구도와 인챈트가 따라간다", () => {
    const inv = new Inventory();
    inv.add(Block.Dirt, 5);
    inv.add(Item.IronPickaxe, 1);
    inv.useTool(Item.IronPickaxe);
    inv.addEnchant(Item.IronPickaxe, "efficiency", 2);
    const left = inv.toolLeft(Item.IronPickaxe);
    const host = inv.host();
    const cursor = pickUp(host, 1, "all")!;
    expect(cursor.item).toBe(Item.IronPickaxe);
    expect(cursor.wear).toBe(left);
    expect(inv.count(Item.IronPickaxe)).toBe(0); // 들고 있는 동안은 가방에 없다
    expect(placeInto(host, 7, cursor, "all")).toBeNull();
    expect(inv.count(Item.IronPickaxe)).toBe(1);
    expect(inv.toolLeft(Item.IronPickaxe)).toBe(left);
    expect(inv.enchantLevel(Item.IronPickaxe, "efficiency")).toBe(2);
    expect(inv.slotStack(7)?.item).toBe(Item.IronPickaxe);
    expect(inv.slotStack(1)).toBeNull();
  });

  it("addStack은 들고 있던 것을 닳은 정도·인챈트와 함께 가방에 되돌린다", () => {
    const inv = new Inventory();
    const stack: Stack = { item: Item.IronClub, count: 1, wear: 100, enchants: [["sharpness", 2]] };
    expect(inv.addStack(stack)).toBe(1);
    expect(inv.toolLeft(Item.IronClub)).toBe(100);
    expect(inv.enchantLevel(Item.IronClub, "sharpness")).toBe(2);
  });

  it("정리하면 같은 아이템이 한 칸에 모이고 번호 순으로 앞에서부터 채워진다", () => {
    const inv = new Inventory();
    inv.add(Block.Stone, 30);
    inv.add(Block.Dirt, 10);
    inv.add(Block.Stone, 50); // 한 칸이 넘쳐서 두 칸
    inv.add(Item.WoodPickaxe, 1);
    inv.useTool(Item.WoodPickaxe);
    const left = inv.toolLeft(Item.WoodPickaxe);
    // 칸을 일부러 어지럽힌다
    const host = inv.host();
    const stray = pickUp(host, 0, "all")!;
    placeInto(host, 20, stray, "all");
    inv.compact();
    expect(inv.slotStack(0)).toEqual({ item: Block.Dirt, count: 10 });
    expect(inv.slotStack(1)).toEqual({ item: Block.Stone, count: 64 });
    expect(inv.slotStack(2)).toEqual({ item: Block.Stone, count: 16 });
    expect(inv.slotStack(3)?.item).toBe(Item.WoodPickaxe);
    expect(inv.slotStack(3)?.wear).toBe(left);
    expect(inv.slotStack(4)).toBeNull();
    expect(inv.count(Block.Stone)).toBe(80);
  });
});

describe("단축바 9칸", () => {
  it("기본 단축바는 9칸이고, 예전 6칸 저장은 새 칸을 기본 블록으로 채워 이어간다", () => {
    expect(HOTBAR_SIZE).toBe(9);
    expect(DEFAULT_HOTBAR).toHaveLength(9);
    const old = sanitizeHotbar([0, 110, 126, 135, 3, 5]);
    expect(old).toHaveLength(9);
    expect(old.slice(0, 6)).toEqual([0, 110, 126, 135, 3, 5]);
    expect(old.slice(6)).toEqual(DEFAULT_HOTBAR.slice(6));
    expect(sanitizeHotbar([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sanitizeHotbar([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual(DEFAULT_HOTBAR);
    expect(sanitizeHotbar([1, 2, 3])).toEqual(DEFAULT_HOTBAR);
    expect(blockName(Block.Torch)).toBe("횃불");
  });
});
