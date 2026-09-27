import { describe, expect, it } from "vitest";
import { dropsFor, FOOD_HEAL, Inventory, Item, mobDrops, RECIPES, SLOT_COUNT, STACK_MAX } from "./inventory";
import { Block } from "./world";

describe("Inventory", () => {
  it("넣고 빼며, 모자라면 빼지 못한다", () => {
    const inv = new Inventory();
    inv.add(Block.Stone, 3);
    expect(inv.count(Block.Stone)).toBe(3);
    expect(inv.remove(Block.Stone, 2)).toBe(true);
    expect(inv.remove(Block.Stone, 2)).toBe(false);
    expect(inv.count(Block.Stone)).toBe(1);
    expect(inv.remove(Block.Stone)).toBe(true);
    expect(inv.entries()).toEqual([]);
  });

  it("재료가 있을 때만 만들 수 있고, 재료가 줄고 결과가 늘어난다", () => {
    const inv = new Inventory();
    const planks = RECIPES.find((r) => r.name === "판자");
    if (!planks) throw new Error("recipe");
    expect(inv.craft(planks)).toBe(false);
    inv.add(Block.Wood, 2);
    expect(inv.craft(planks)).toBe(true);
    expect(inv.count(Block.Wood)).toBe(1);
    expect(inv.count(Block.Planks)).toBe(4);
  });

  it("검이 있으면 공격력이 오르고, 센 쪽이 우선이다", () => {
    const inv = new Inventory();
    expect(inv.attackDamage()).toBe(1);
    inv.add(Item.WoodClub);
    expect(inv.attackDamage()).toBe(2);
    inv.add(Item.StoneClub);
    expect(inv.attackDamage()).toBe(4);
  });

  it("저장했다가 그대로 불러온다", () => {
    const inv = new Inventory();
    inv.add(Block.Dirt, 5);
    inv.add(Item.Meat, 2);
    const copy = new Inventory();
    copy.load(inv.entries());
    expect(copy.entries()).toEqual(inv.entries());
  });

  const recipe = (name: string) => {
    const found = RECIPES.find((r) => r.name === name);
    if (!found) throw new Error("recipe " + name);
    return found;
  };

  it("검은 재료를 이어서 만든다 (통나무 → 판자 → 막대 → 나무 검)", () => {
    const inv = new Inventory();
    inv.add(Block.Wood, 1);
    expect(inv.craft(recipe("판자"))).toBe(true);
    expect(inv.craft(recipe("막대"))).toBe(true);
    expect(inv.craft(recipe("나무 검"))).toBe(true);
    expect(inv.count(Item.WoodClub)).toBe(1);
    expect(inv.count(Block.Planks)).toBe(0);
    expect(inv.count(Item.Stick)).toBe(3);
  });

  it("곡괭이를 만들려면 막대가 필요하다", () => {
    const inv = new Inventory();
    inv.add(Block.Planks, 3);
    expect(inv.canCraft(recipe("나무 곡괭이"))).toBe(false);
    inv.add(Item.Stick, 2);
    expect(inv.craft(recipe("나무 곡괭이"))).toBe(true);
    expect(inv.count(Item.WoodPickaxe)).toBe(1);
  });

  it("도구는 쓸 때마다 닳고, 다 닳으면 부러져서 사라진다 (도구는 한 개만 들 수 있다)", () => {
    const inv = new Inventory();
    expect(inv.add(Item.WoodPickaxe, 2)).toBe(1); // 도구는 한 개까지만 들어간다
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(59);
    for (let i = 0; i < 58; i++) expect(inv.useTool(Item.WoodPickaxe)).toBe(false);
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(1);
    expect(inv.useTool(Item.WoodPickaxe)).toBe(true);
    expect(inv.count(Item.WoodPickaxe)).toBe(0);
    expect(inv.useTool(Item.Meat)).toBe(false);
  });

  it("같은 도구를 두 개 가질 수는 없다", () => {
    const inv = new Inventory();
    expect(inv.add(Item.StoneAxe, 1)).toBe(1);
    expect(inv.add(Item.StoneAxe, 1)).toBe(0);
    expect(inv.count(Item.StoneAxe)).toBe(1);
  });

  it("닳은 정도도 저장했다가 그대로 불러온다", () => {
    const inv = new Inventory();
    inv.add(Item.StoneAxe, 1);
    for (let i = 0; i < 10; i++) inv.useTool(Item.StoneAxe);
    const copy = new Inventory();
    copy.load(inv.entries(), inv.wearEntries());
    expect(copy.toolLeft(Item.StoneAxe)).toBe(121);
    const broken = new Inventory();
    broken.load([[Item.StoneAxe, 1]], [[Item.StoneAxe, 9999]]);
    expect(broken.toolLeft(Item.StoneAxe)).toBe(131);
  });

  it("한 칸에는 64개까지만 쌓이고, 넘치면 다음 칸으로 나뉜다", () => {
    const inv = new Inventory();
    expect(inv.add(Block.Stone, STACK_MAX)).toBe(STACK_MAX);
    expect(inv.slotsUsed).toBe(1);
    expect(inv.add(Block.Stone, 5)).toBe(5);
    expect(inv.slotsUsed).toBe(2);
    expect(inv.count(Block.Stone)).toBe(STACK_MAX + 5);
  });

  it("가방 칸이 다 차면 넣던 만큼만 들어가고 나머지는 못 넣는다", () => {
    const inv = new Inventory();
    expect(inv.slotCount).toBe(SLOT_COUNT);
    // 칸을 서로 다른 아이템으로 전부 채운다 (블록 종류는 충분히 많다)
    for (let i = 0; i < SLOT_COUNT; i++) inv.add(Block.Stone + i, 1);
    expect(inv.slotsUsed).toBe(SLOT_COUNT);
    expect(inv.freeSpace(Block.Dirt)).toBe(0);
    expect(inv.add(Block.Dirt, 3)).toBe(0);
    expect(inv.count(Block.Dirt)).toBe(0);
    // 이미 가방에 있는 종류는 기존 칸에 더 쌓을 수 있다
    expect(inv.freeSpace(Block.Stone)).toBe(STACK_MAX - 1);
    expect(inv.add(Block.Stone, 3)).toBe(3);
    expect(inv.count(Block.Stone)).toBe(4);
  });

  it("도구는 freeSpace가 이미 있으면 0, 빈 칸 있으면 1이다", () => {
    const inv = new Inventory();
    expect(inv.freeSpace(Item.WoodPickaxe)).toBe(1);
    inv.add(Item.WoodPickaxe, 1);
    expect(inv.freeSpace(Item.WoodPickaxe)).toBe(0);
  });

  it("만든 결과를 넣을 칸이 없으면 만들지 못하고 재료도 그대로다", () => {
    const inv = new Inventory();
    inv.add(Block.Wood, 1);
    // 판자가 들어갈 칸만 남기고 나머지를 다른 아이템으로 채운다
    for (let i = 0; i < SLOT_COUNT - 1; i++) inv.add(Item.IronIngot + i, 1);
    expect(inv.slotsUsed).toBe(SLOT_COUNT);
    const planks = recipe("판자");
    expect(inv.canCraft(planks)).toBe(true);
    expect(inv.craft(planks)).toBe(false);
    expect(inv.count(Block.Wood)).toBe(1);
    expect(inv.count(Block.Planks)).toBe(0);
  });
});

describe("drops", () => {
  it("잔디는 흙(가끔 씨앗), 물과 공기는 아무것도 안 나온다", () => {
    expect(dropsFor(Block.Grass, () => 0.9)).toEqual([[Block.Dirt, 1]]);
    expect(dropsFor(Block.Grass, () => 0.1)).toEqual([[Block.Dirt, 1], [Block.Sprout, 1]]);
    expect(dropsFor(Block.Stone, () => 0.5)).toEqual([[Block.Stone, 1]]);
    expect(dropsFor(Block.Water, () => 0.5)).toEqual([]);
    expect(dropsFor(Block.Air, () => 0.5)).toEqual([]);
  });

  it("다 자란 밀은 밀과 씨앗을, 어린 싹은 씨앗을 준다", () => {
    expect(dropsFor(Block.Wheat, () => 0.1)).toEqual([[Item.Grain, 2], [Block.Sprout, 2]]);
    expect(dropsFor(Block.Wheat, () => 0.9)).toEqual([[Item.Grain, 1], [Block.Sprout, 1]]);
    expect(dropsFor(Block.Sprout, () => 0.5)).toEqual([[Block.Sprout, 1]]);
  });

  it("구운 고기는 회복이 더 크고, 밀 3개는 빵이 된다", () => {
    expect(FOOD_HEAL[Item.CookedMeat]).toBeGreaterThan(FOOD_HEAL[Item.Meat]);
    const inv = new Inventory();
    inv.add(Item.Grain, 3);
    const bread = RECIPES.find((r) => r.name === "빵");
    if (!bread) throw new Error("recipe");
    expect(inv.craft(bread)).toBe(true);
    expect(inv.count(Item.Bread)).toBe(1);
  });

  it("가방에서 바로 만드는 것은 판자·막대·횃불·제작대뿐이고, 나머지는 제작대가 필요하다", () => {
    expect(RECIPES.filter((r) => !r.station).map((r) => r.name)).toEqual(["판자", "막대", "횃불", "제작대"]);
    expect(RECIPES.find((r) => r.name === "화로")?.station).toBe("table");
    expect(RECIPES.find((r) => r.name === "철 곡괭이")?.inputs[0][0]).toBe(Item.IronIngot);
  });

  it("횃불은 막대와 나무로 네 개가 만들어진다", () => {
    const inv = new Inventory();
    inv.add(Item.Stick, 1);
    inv.add(Block.Wood, 1);
    const torch = RECIPES.find((r) => r.name === "횃불");
    if (!torch) throw new Error("recipe");
    expect(inv.craft(torch)).toBe(true);
    expect(inv.count(Block.Torch)).toBe(4);
  });

  it("다이아몬드 광석은 철과 달리 화로 없이 원석 그대로 나온다", () => {
    expect(dropsFor(Block.DiamondOre, () => 0.5)).toEqual([[Item.Diamond, 1]]);
  });

  it("방어구는 도구처럼 한 칸에 하나만 들어간다", () => {
    const inv = new Inventory();
    expect(inv.add(Item.IronChestplate, 1)).toBe(1);
    expect(inv.add(Item.IronChestplate, 1)).toBe(0);
    expect(inv.count(Item.IronChestplate)).toBe(1);
  });

  it("다이아몬드 도구는 막대와 다이아몬드로 만든다", () => {
    const inv = new Inventory();
    inv.add(Item.Diamond, 3);
    inv.add(Item.Stick, 2);
    const pickaxe = RECIPES.find((r) => r.name === "다이아몬드 곡괭이");
    if (!pickaxe) throw new Error("recipe");
    expect(inv.craft(pickaxe)).toBe(true);
    expect(inv.count(Item.DiamondPickaxe)).toBe(1);
  });

  it("활은 한 칸에 하나만, 화살은 다른 아이템처럼 64개까지 쌓인다", () => {
    const inv = new Inventory();
    expect(inv.add(Item.Bow, 1)).toBe(1);
    expect(inv.add(Item.Bow, 1)).toBe(0);
    expect(inv.count(Item.Bow)).toBe(1);
    expect(inv.add(Item.Arrow, 70)).toBe(70);
    expect(inv.slotsUsed).toBe(3); // 활 1칸 + 화살 64개 1칸 + 화살 6개 1칸
  });

  it("막대로 활과 화살을 만든다", () => {
    const inv = new Inventory();
    inv.add(Item.Stick, 4);
    const arrow = RECIPES.find((r) => r.name === "화살");
    const bow = RECIPES.find((r) => r.name === "활");
    if (!arrow || !bow) throw new Error("recipe");
    expect(inv.craft(arrow)).toBe(true);
    expect(inv.count(Item.Arrow)).toBe(4);
    expect(inv.count(Item.Stick)).toBe(3);
    expect(inv.craft(bow)).toBe(true);
    expect(inv.count(Item.Bow)).toBe(1);
  });

  it("철 흉갑은 철 주괴 8개로 만든다", () => {
    const inv = new Inventory();
    inv.add(Item.IronIngot, 8);
    const chest = RECIPES.find((r) => r.name === "철 흉갑");
    if (!chest) throw new Error("recipe");
    expect(inv.craft(chest)).toBe(true);
    expect(inv.count(Item.IronChestplate)).toBe(1);
    expect(inv.count(Item.IronIngot)).toBe(0);
  });

  it("돼지는 고기, 양은 고기와 양털, 해골은 뼈, 크리퍼는 화약을 떨구고 좀비는 안 떨군다", () => {
    expect(mobDrops("pig", () => 0.9)).toEqual([[Item.Meat, 1]]);
    expect(mobDrops("sheep", () => 0.1)).toEqual([[Item.Meat, 2], [Block.Wool, 2]]);
    expect(mobDrops("zombie", () => 0.5)).toEqual([]);
    expect(mobDrops("skeleton", () => 0.1)).toEqual([[Item.Bone, 2]]);
    expect(mobDrops("creeper", () => 0.9)).toEqual([[Item.Gunpowder, 1]]);
  });

  it("철광석은 철 검이 되고 가장 센 무기로 쓰인다", () => {
    const inv = new Inventory();
    inv.add(Item.IronIngot, 2);
    inv.add(Item.Stick, 1);
    const iron = RECIPES.find((r) => r.name === "철 검");
    if (!iron) throw new Error("recipe");
    inv.add(Item.StoneClub);
    expect(inv.craft(iron)).toBe(true);
    expect(inv.attackDamage()).toBe(6);
  });

  it("침대는 양털 3개와 판자 3개로 만든다", () => {
    const inv = new Inventory();
    inv.add(Block.Wool, 3);
    inv.add(Block.Planks, 3);
    const bed = RECIPES.find((r) => r.name === "침대");
    if (!bed) throw new Error("recipe");
    expect(inv.craft(bed)).toBe(true);
    expect(inv.count(Item.Bed)).toBe(1);
  });
});
