import { describe, expect, it } from "vitest";
import { dropsFor, FOOD_HEAL, Inventory, Item, mobDrops, RECIPES } from "./inventory";
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

  it("도구는 쓸 때마다 닳고, 다 닳으면 부러져서 하나가 줄어든다", () => {
    const inv = new Inventory();
    inv.add(Item.WoodPickaxe, 2);
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(59);
    for (let i = 0; i < 58; i++) expect(inv.useTool(Item.WoodPickaxe)).toBe(false);
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(1);
    expect(inv.useTool(Item.WoodPickaxe)).toBe(true);
    expect(inv.count(Item.WoodPickaxe)).toBe(1);
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(59);
    expect(inv.useTool(Item.Meat)).toBe(false);
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
