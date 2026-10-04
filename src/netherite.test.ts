import { describe, expect, it } from "vitest";
import { ARMOR, armorResistances, bestArmor, reduceDamage } from "./armor";
import { weaponStats } from "./combat";
import { matchGrid, planFill, shapeOf } from "./crafting";
import { SMELTS } from "./furnace";
import { Inventory, Item, RECIPES, dropsFor } from "./inventory";
import { breakSeconds, canHarvest, maxDurability, TOOL_BY_ID, TOOLS } from "./tools";
import { BLOCK_XP, SMELT_XP } from "./xp";
import { Block, SIZE_X, SIZE_Y, SIZE_Z, World } from "./world";

const NETHERITE_TOOLS = [Item.NetheritePickaxe, Item.NetheriteAxe, Item.NetheriteShovel, Item.NetheriteClub];
const NETHERITE_ARMOR = [Item.NetheriteHelmet, Item.NetheriteChestplate, Item.NetheriteLeggings, Item.NetheriteBoots];

describe("고대 잔해", () => {
  const world = new World();
  world.generate(7);

  it("월드 맨 밑에 드물게 나오고, 다이아몬드보다 깊다", () => {
    let count = 0;
    let highest = 0;
    let highestDiamond = 0;
    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        for (let y = 0; y < SIZE_Y; y++) {
          const b = world.get(x, y, z);
          if (b === Block.AncientDebris) {
            count++;
            highest = Math.max(highest, y);
          }
          if (b === Block.DiamondOre) highestDiamond = Math.max(highestDiamond, y);
        }
      }
    }
    expect(count).toBeGreaterThan(15);
    expect(count).toBeLessThan(400);
    expect(highest).toBeLessThanOrEqual(9);
    expect(highest).toBeLessThan(highestDiamond);
  });

  it("다이아몬드 곡괭이로만 캐고, 캐면 그대로 나오며, 구우면 조각이 된다", () => {
    const iron = TOOL_BY_ID.get(Item.IronPickaxe)!;
    const diamond = TOOL_BY_ID.get(Item.DiamondPickaxe)!;
    expect(canHarvest(Block.AncientDebris, iron)).toBe(false);
    expect(canHarvest(Block.AncientDebris, diamond)).toBe(true);
    expect(breakSeconds(Block.AncientDebris, diamond)).toBeGreaterThan(breakSeconds(Block.DiamondOre, diamond));
    expect(dropsFor(Block.AncientDebris, () => 0.5)).toEqual([[Block.AncientDebris, 1]]);
    expect(SMELTS[Block.AncientDebris]).toBe(Item.NetheriteScrap);
    expect(BLOCK_XP[Block.AncientDebris]).toBeGreaterThan(BLOCK_XP[Block.DiamondOre]);
    expect(SMELT_XP[Item.NetheriteScrap]).toBeGreaterThan(0);
  });
});

describe("네더라이트 도구", () => {
  it("다이아몬드보다 빠르고, 오래 가고, 더 세다", () => {
    for (let i = 0; i < 4; i++) {
      const netherite = TOOL_BY_ID.get(NETHERITE_TOOLS[i])!;
      const diamond = TOOLS.find((t) => t.type === netherite.type && t.tier === 3)!;
      expect(netherite.tier).toBe(4);
      expect(maxDurability(netherite.id)).toBeGreaterThan(maxDurability(diamond.id));
      expect(weaponStats(netherite.id).damage).toBeGreaterThan(weaponStats(diamond.id).damage);
    }
    const stone = breakSeconds(Block.Stone, TOOL_BY_ID.get(Item.NetheritePickaxe)!);
    expect(stone).toBeLessThan(breakSeconds(Block.Stone, TOOL_BY_ID.get(Item.DiamondPickaxe)!));
  });
});

describe("네더라이트 갑옷", () => {
  it("부위마다 다이아몬드보다 점수가 높고, 걸치면 불·밀림을 줄여 준다", () => {
    const worn = (ids: number[]) => (id: number) => ids.includes(id);
    const diamond = [Item.DiamondHelmet, Item.DiamondChestplate, Item.DiamondLeggings, Item.DiamondBoots];
    const sum = (ids: number[]) => bestArmor(worn(ids)).reduce((s, a) => s + a.points, 0);
    expect(sum(NETHERITE_ARMOR)).toBeGreaterThan(sum(diamond));
    // 같이 가지고 있으면 더 좋은 네더라이트를 입은 걸로 친다
    expect(bestArmor(worn([...diamond, ...NETHERITE_ARMOR])).every((a) => (NETHERITE_ARMOR as number[]).includes(a.id))).toBe(true);
    const none = armorResistances(worn([]));
    expect(none).toEqual({ fire: 0, knock: 0 });
    const full = armorResistances(worn(NETHERITE_ARMOR));
    expect(full.fire).toBeCloseTo(0.6, 5);
    expect(full.knock).toBeCloseTo(0.4, 5);
    const one = armorResistances(worn([Item.NetheriteBoots]));
    expect(one.fire).toBeCloseTo(0.15, 5);
    // 다이아몬드는 그런 효과가 없다
    expect(armorResistances(worn(diamond))).toEqual({ fire: 0, knock: 0 });
    // 다이아몬드 한 벌도 이미 피해 감소 상한(80%)이라, 네더라이트의 이점은 점수보다 불·밀림 감소다
    expect(reduceDamage(10, worn(NETHERITE_ARMOR))).toBeCloseTo(2, 5);
    expect(ARMOR.filter((a) => a.fireResist).length).toBe(4);
  });
});

describe("네더라이트 제작", () => {
  it("조각 4개와 철 주괴 4개로 주괴를 만든다", () => {
    const recipe = RECIPES.find((r) => r.name === "네더라이트 주괴")!;
    expect(recipe.inputs).toEqual([[Item.NetheriteScrap, 4], [Item.IronIngot, 4]]);
    expect(recipe.output).toEqual([Item.NetheriteIngot, 1]);
    const plan = planFill(recipe, 3, 3)!;
    expect(matchGrid(plan, 3, 3, "table")?.name).toBe("네더라이트 주괴");
  });

  it("다이아몬드 장비 하나와 주괴 하나를 놓으면 같은 종류 네더라이트 장비가 된다 (모양은 상관없다)", () => {
    const pairs: [number, number, string][] = [
      [Item.DiamondPickaxe, Item.NetheritePickaxe, "네더라이트 곡괭이"],
      [Item.DiamondAxe, Item.NetheriteAxe, "네더라이트 도끼"],
      [Item.DiamondShovel, Item.NetheriteShovel, "네더라이트 삽"],
      [Item.DiamondClub, Item.NetheriteClub, "네더라이트 검"],
      [Item.DiamondHelmet, Item.NetheriteHelmet, "네더라이트 투구"],
      [Item.DiamondChestplate, Item.NetheriteChestplate, "네더라이트 흉갑"],
      [Item.DiamondLeggings, Item.NetheriteLeggings, "네더라이트 바지"],
      [Item.DiamondBoots, Item.NetheriteBoots, "네더라이트 부츠"],
    ];
    for (const [from, to, name] of pairs) {
      const recipe = RECIPES.find((r) => r.name === name)!;
      expect(recipe.output).toEqual([to, 1]);
      expect(shapeOf(recipe)).toBeNull();
      const cells = [0, 0, 0, 0, from, 0, Item.NetheriteIngot, 0, 0];
      expect(matchGrid(cells, 3, 3, "table")?.name, name).toBe(name);
    }
    // 다이아몬드 장비가 아니라 철 장비로는 안 된다
    expect(matchGrid([Item.IronPickaxe, Item.NetheriteIngot, 0, 0, 0, 0, 0, 0, 0], 3, 3, "table")).toBeNull();
  });

  it("가방에서도 닳은 정도와 인챈트가 장비를 옮겨도 유지된다 (업그레이드 재료로 쓰는 장비)", () => {
    const inv = new Inventory();
    inv.add(Item.DiamondClub, 1);
    inv.addEnchant(Item.DiamondClub, "sharpness", 3);
    expect(inv.enchantsOf(Item.DiamondClub)).toEqual([["sharpness", 3]]);
    // 네더라이트 검에도 같은 인챈트를 붙일 수 있다 (craftUi가 옮겨 준다)
    inv.add(Item.NetheriteClub, 1);
    expect(inv.addEnchant(Item.NetheriteClub, "sharpness", 3)).toBe(true);
  });
});
