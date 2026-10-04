import { describe, expect, it } from "vitest";
import { reduceDamage } from "./armor";
import { moveStack } from "./chest";
import { Effects, POTION_BY_ID, POTIONS, SPEED_MULTIPLIER, STRENGTH_BONUS } from "./effects";
import {
  efficiencyMultiplier,
  enchantLabel,
  enchantsFor,
  isEnchantable,
  powerMultiplier,
  rollEnchant,
  sharpnessBonus,
  wearChance,
} from "./enchant";
import { Inventory, Item, RECIPES } from "./inventory";
import { decodeSave, encodeSave, type SaveData } from "./save";
import { breakSeconds, TOOL_BY_ID } from "./tools";
import { BLOCK_XP, Experience, MOB_XP, SMELT_XP, xpForLevel } from "./xp";
import { Block } from "./world";

describe("경험치", () => {
  it("레벨별 필요량은 마인크래프트 공식을 따른다", () => {
    expect(xpForLevel(0)).toBe(7);
    expect(xpForLevel(1)).toBe(9);
    expect(xpForLevel(15)).toBe(37);
    expect(xpForLevel(16)).toBe(42);
    expect(xpForLevel(30)).toBe(112);
    expect(xpForLevel(31)).toBe(121);
  });

  it("모으면 레벨이 오르고 남는 양은 이어진다", () => {
    const xp = new Experience();
    expect(xp.add(6)).toBe(0);
    expect(xp.level).toBe(0);
    expect(xp.add(1)).toBe(1); // 7 모음 → 레벨 1
    expect(xp.level).toBe(1);
    expect(xp.into).toBe(0);
    expect(xp.add(9 + 11 + 3)).toBe(2); // 레벨 2 (9), 레벨 3 (11), 3 남음
    expect(xp.level).toBe(3);
    expect(xp.into).toBe(3);
    expect(xp.progress).toBeCloseTo(3 / 13, 5);
  });

  it("0 이하나 이상한 값은 무시한다", () => {
    const xp = new Experience();
    expect(xp.add(0)).toBe(0);
    expect(xp.add(-5)).toBe(0);
    expect(xp.add(NaN)).toBe(0);
    expect(xp.level).toBe(0);
    expect(xp.into).toBe(0);
  });

  it("레벨을 쓰면 줄어들고, 모자라면 못 쓴다", () => {
    const xp = new Experience();
    xp.add(7 + 9 + 11 + 4); // 레벨 3, 진행 4
    expect(xp.spendLevels(5)).toBe(false);
    expect(xp.level).toBe(3);
    expect(xp.spendLevels(2)).toBe(true);
    expect(xp.level).toBe(1);
    expect(xp.into).toBe(4);
    expect(xp.spendLevels(1)).toBe(true);
    expect(xp.level).toBe(0);
    expect(xp.into).toBe(4);
  });

  it("저장했다 불러온다 (이상한 값은 보정)", () => {
    const xp = new Experience();
    xp.load(5, 8);
    expect(xp.toArray()).toEqual([5, 8]);
    xp.load(2, 9999);
    expect(xp.into).toBe(xpForLevel(2) - 1);
    xp.load(-3, -1);
    expect(xp.toArray()).toEqual([0, 0]);
  });

  it("보상표: 드래곤이 가장 크고, 다이아몬드 광석이 석탄보다 크다", () => {
    expect(MOB_XP.dragon).toBeGreaterThan(MOB_XP.zombie);
    expect(MOB_XP.zombie).toBeGreaterThan(MOB_XP.pig);
    expect(BLOCK_XP[Block.DiamondOre]).toBeGreaterThan(BLOCK_XP[Block.CoalOre]);
    expect(SMELT_XP[Item.IronIngot]).toBeGreaterThan(0);
  });
});

describe("인챈트", () => {
  it("도구 종류마다 붙일 수 있는 인챈트가 다르다", () => {
    expect(enchantsFor(Item.IronPickaxe)).toEqual(["efficiency", "unbreaking"]);
    expect(enchantsFor(Item.IronClub)).toEqual(["sharpness", "unbreaking"]);
    expect(enchantsFor(Item.Bow)).toEqual(["power", "unbreaking"]);
    expect(enchantsFor(Item.DiamondHelmet)).toEqual(["protection", "unbreaking"]);
    expect(enchantsFor(Item.Bread)).toEqual([]);
    expect(isEnchantable(Item.Bread)).toBe(false);
    expect(isEnchantable(Item.StoneAxe)).toBe(true);
  });

  it("단계가 곧 인챈트 단계이고, 가능한 것 중에서만 뽑힌다", () => {
    expect(rollEnchant(Item.IronPickaxe, 2, () => 0)).toEqual({ id: "efficiency", level: 2 });
    expect(rollEnchant(Item.IronPickaxe, 3, () => 0.99)).toEqual({ id: "unbreaking", level: 3 });
    expect(rollEnchant(Item.IronPickaxe, 9, () => 0)).toEqual({ id: "efficiency", level: 3 });
    expect(rollEnchant(Item.Bread, 1, () => 0)).toBeNull();
  });

  it("이름은 로마 숫자로 나온다", () => {
    expect(enchantLabel("efficiency", 2)).toBe("효율 Ⅱ");
    expect(enchantLabel("unbreaking", 3)).toBe("내구성 Ⅲ");
  });

  it("효과 크기: 효율은 빨라지고, 날카로움·힘은 세지고, 내구성은 덜 닳는다", () => {
    expect(efficiencyMultiplier(0)).toBe(1);
    expect(efficiencyMultiplier(3)).toBeGreaterThan(efficiencyMultiplier(1));
    expect(sharpnessBonus(2)).toBeGreaterThan(sharpnessBonus(1));
    expect(sharpnessBonus(0)).toBe(0);
    expect(powerMultiplier(3)).toBeGreaterThan(1);
    expect(wearChance(0)).toBe(1);
    expect(wearChance(3)).toBe(0.25);
  });

  it("효율을 붙인 도구는 같은 블록을 더 빨리 캔다", () => {
    const pickaxe = TOOL_BY_ID.get(Item.IronPickaxe)!;
    const plain = breakSeconds(Block.Stone, pickaxe);
    const boosted = breakSeconds(Block.Stone, pickaxe, efficiencyMultiplier(3));
    expect(boosted).toBeLessThan(plain);
    // 맞지 않는 도구나 맨손에는 효과가 없다
    expect(breakSeconds(Block.Stone, null, 2.8)).toBe(breakSeconds(Block.Stone, null));
  });

  it("보호 점수는 방어구 점수처럼 받는 피해를 줄인다 (최대 80%)", () => {
    const none = () => false;
    expect(reduceDamage(10, none)).toBe(10);
    expect(reduceDamage(10, none, 5)).toBeCloseTo(8, 5);
    expect(reduceDamage(10, none, 100)).toBeCloseTo(2, 5);
  });
});

describe("가방과 인챈트", () => {
  it("붙일 수 있는 것에만 붙고, 같은 인챈트는 높은 단계만 남는다", () => {
    const inv = new Inventory();
    inv.add(Item.IronPickaxe, 1);
    expect(inv.addEnchant(Item.IronPickaxe, "efficiency", 2)).toBe(true);
    expect(inv.addEnchant(Item.IronPickaxe, "efficiency", 1)).toBe(true);
    expect(inv.enchantLevel(Item.IronPickaxe, "efficiency")).toBe(2);
    expect(inv.addEnchant(Item.IronPickaxe, "sharpness", 1)).toBe(false); // 곡괭이에는 안 붙는다
    expect(inv.addEnchant(Item.IronAxe, "efficiency", 1)).toBe(false); // 없는 아이템
    expect(inv.addEnchant(Item.IronPickaxe, "unbreaking", 99)).toBe(true);
    expect(inv.enchantLevel(Item.IronPickaxe, "unbreaking")).toBe(3); // 최대 3
  });

  it("아이템을 잃으면 인챈트도 사라진다", () => {
    const inv = new Inventory();
    inv.add(Item.IronClub, 1);
    inv.addEnchant(Item.IronClub, "sharpness", 3);
    inv.remove(Item.IronClub);
    expect(inv.enchantLevel(Item.IronClub, "sharpness")).toBe(0);
    inv.add(Item.IronClub, 1);
    expect(inv.enchantsOf(Item.IronClub)).toEqual([]);
  });

  it("내구성 인챈트는 확률적으로만 닳게 한다", () => {
    const inv = new Inventory();
    inv.add(Item.WoodPickaxe, 1);
    inv.addEnchant(Item.WoodPickaxe, "unbreaking", 3); // 4번 중 1번만 닳음
    const full = inv.toolLeft(Item.WoodPickaxe);
    inv.useTool(Item.WoodPickaxe, () => 0.9); // 안 닳는다
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(full);
    inv.useTool(Item.WoodPickaxe, () => 0.1); // 닳는다
    expect(inv.toolLeft(Item.WoodPickaxe)).toBe(full - 1);
  });

  it("저장했다 불러와도 인챈트가 그대로다", () => {
    const inv = new Inventory();
    inv.add(Item.DiamondChestplate, 1);
    inv.addEnchant(Item.DiamondChestplate, "protection", 2);
    const again = new Inventory();
    again.load(inv.entries(), inv.wearEntries(), JSON.parse(JSON.stringify(inv.enchantEntries())));
    expect(again.enchantLevel(Item.DiamondChestplate, "protection")).toBe(2);
    // 이상한 인챈트 이름은 무시
    again.load(inv.entries(), [], [[Item.DiamondChestplate, [["엉터리", 2]]]]);
    expect(again.enchantsOf(Item.DiamondChestplate)).toEqual([]);
  });

  it("상자로 옮겼다 꺼내도 인챈트가 따라간다", () => {
    const bag = new Inventory();
    const chest = new Inventory();
    bag.add(Item.Bow, 1);
    bag.addEnchant(Item.Bow, "power", 2);
    moveStack(bag, chest, Item.Bow);
    expect(chest.enchantLevel(Item.Bow, "power")).toBe(2);
    expect(bag.enchantLevel(Item.Bow, "power")).toBe(0);
    moveStack(chest, bag, Item.Bow);
    expect(bag.enchantLevel(Item.Bow, "power")).toBe(2);
  });

  it("물약은 한 칸에 16개까지 쌓인다", () => {
    const inv = new Inventory();
    expect(inv.add(Item.HealPotion, 40)).toBe(40);
    expect(inv.slotsUsed).toBe(3);
  });
});

describe("물약과 효과", () => {
  it("효과는 시간이 지나면 사라지고, 다시 마시면 더 긴 쪽으로 이어진다", () => {
    const fx = new Effects();
    fx.add("speed", 10);
    expect(fx.has("speed")).toBe(true);
    expect(fx.speedMultiplier()).toBe(SPEED_MULTIPLIER);
    fx.update(4);
    fx.add("speed", 3); // 남은 6초보다 짧아서 그대로
    expect(fx.remaining("speed")).toBeCloseTo(6, 5);
    fx.add("speed", 30);
    expect(fx.remaining("speed")).toBe(30);
    fx.update(31);
    expect(fx.has("speed")).toBe(false);
    expect(fx.speedMultiplier()).toBe(1);
  });

  it("힘은 공격력을 더하고, 재생은 2초마다 체력을 1 채운다", () => {
    const fx = new Effects();
    expect(fx.attackBonus()).toBe(0);
    fx.add("strength", 5);
    expect(fx.attackBonus()).toBe(STRENGTH_BONUS);
    fx.add("regen", 5);
    let healed = 0;
    for (let i = 0; i < 10; i++) healed += fx.update(0.5);
    expect(healed).toBe(2); // 5초 동안 2초마다 → 2번 (재생이 막 끝나는 시점 포함)
  });

  it("저장했다 불러오고, 이상한 것은 무시한다", () => {
    const fx = new Effects();
    fx.add("regen", 20);
    const again = new Effects();
    again.load(JSON.parse(JSON.stringify(fx.entries())));
    expect(again.remaining("regen")).toBe(20);
    again.load([["엉터리", 10], ["speed", -3], ["strength", 5]]);
    expect(again.entries()).toEqual([["strength", 5]]);
  });

  it("물약 목록: 네 가지, 모두 양조 제작법이 있다", () => {
    expect(POTIONS).toHaveLength(4);
    for (const potion of POTIONS) {
      const recipe = RECIPES.find((r) => r.output[0] === potion.item);
      expect(recipe?.station).toBe("brewing");
      expect(recipe?.inputs[0][0]).toBe(Item.GlassBottle);
      expect(POTION_BY_ID.get(potion.item)).toBe(potion);
    }
    expect(POTION_BY_ID.get(Item.HealPotion)?.heal).toBeGreaterThan(0);
  });

  it("양조대·인챈트 테이블·유리병은 제작대에서 만든다", () => {
    for (const name of ["유리병", "인챈트 테이블", "양조대"]) {
      expect(RECIPES.find((r) => r.name === name)?.station).toBe("table");
    }
  });
});

describe("저장 파일", () => {
  const sample: SaveData = { version: 1, seed: 1, edits: [], player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } };

  it("경험치·인챈트·효과도 저장되고, 없는 예전 저장도 읽힌다", () => {
    const full: SaveData = { ...sample, xp: [4, 5], enchants: [[Item.IronPickaxe, [["efficiency", 2]]]], effects: [["speed", 30]] };
    expect(decodeSave(encodeSave(full))).toEqual(full);
    const old = decodeSave(encodeSave(sample));
    expect(old?.xp).toBeUndefined();
    expect(old?.enchants).toBeUndefined();
  });

  it("모양이 이상하면 거부한다", () => {
    expect(decodeSave(JSON.stringify({ ...sample, xp: [1] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, enchants: [[1, [[2, 3]]]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...sample, effects: [["speed", "많이"]] }))).toBeNull();
  });
});
