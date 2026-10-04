import { matchGrid, planFill, usableAt, type CraftContext } from "./crafting";
import { enchantLabel, enchantsFor, isEnchantable, type EnchantId } from "./enchant";
import { Inventory, RECIPES, type Recipe } from "./inventory";
import { ArrayHost, pickUp, placeInto, type SlotHost, type Stack } from "./slotOps";
import { maxDurability } from "./tools";

export interface CraftUiDeps {
  inventory: Inventory;
  itemLabel(item: number): string;
  itemEmoji(item: number): string;
  /** 블록이면 아이콘 그림 주소, 아니면 null (이모지로 그린다) */
  iconUrl(item: number): string | null;
  showToast(text: string, ms?: number): void;
  /** 가방 내용이 바뀌었다 (단축바 갱신·저장) */
  onChange(): void;
  /** 가방이 가득 차서 못 넣은 것을 바닥에 떨어뜨린다 */
  dropStack(stack: Stack): void;
  playCraft(): void;
  playPickup(): void;
  /** 하나를 만들었다 (경험치·도전 과제용) */
  onCrafted(recipe: Recipe): void;
}

/**
 * 제작 화면: 제작 격자(가방 2×2 / 제작대 3×3), 결과 칸, 가방 27칸을 한 화면에 놓고
 * 눌러서 집고 눌러서 놓는다 (마인크래프트의 마우스 커서와 같다).
 * 레시피 목록의 항목을 누르면 가방에서 재료를 꺼내 칸을 채워 준다.
 */
export class CraftUi {
  private readonly panel = document.getElementById("craft-panel") as HTMLElement;
  private readonly body = document.getElementById("craft-body") as HTMLElement;
  private readonly title = document.getElementById("craft-title") as HTMLElement;
  private size: 2 | 3 = 3;
  private grid = new ArrayHost(9, () => 64);
  private cursor: Stack | null = null;
  /** 켜져 있으면 집을 때 절반만, 놓을 때 하나씩 (마인크래프트의 우클릭) */
  private split = false;
  private info = "";

  constructor(private readonly deps: CraftUiDeps) {
    const close = document.getElementById("craft-close") as HTMLElement;
    close.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.close();
    });
  }

  get isOpen(): boolean {
    return this.panel.classList.contains("open");
  }

  private get context(): CraftContext {
    return this.size === 3 ? "table" : "hand";
  }

  open(size: 2 | 3): void {
    this.close();
    this.size = size;
    this.grid = new ArrayHost(size * size, (item) => this.deps.inventory.maxStack(item));
    this.cursor = null;
    this.split = false;
    this.info = "";
    this.title.textContent = size === 3 ? "제작대 (3×3 격자)" : "가방 제작 (2×2 격자)";
    this.panel.classList.add("open");
    this.render();
  }

  /** 닫는다. 격자와 손에 든 것은 모두 가방으로 돌려보낸다. */
  close(): void {
    if (!this.isOpen) return;
    this.returnAll();
    this.panel.classList.remove("open");
    this.body.replaceChildren();
    this.deps.onChange();
  }

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private giveBack(stack: Stack): void {
    const added = this.deps.inventory.addStack(stack);
    if (added < stack.count) this.deps.dropStack({ ...stack, count: stack.count - added });
  }

  private returnAll(): void {
    for (const stack of this.grid.takeAll()) this.giveBack(stack);
    if (this.cursor) {
      this.giveBack(this.cursor);
      this.cursor = null;
    }
  }

  private changed(): void {
    this.render();
    this.deps.onChange();
  }

  private cells(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.size * this.size; i++) out.push(this.grid.get(i)?.item ?? 0);
    return out;
  }

  private match(): Recipe | null {
    return matchGrid(this.cells(), this.size, this.size, this.context);
  }

  private press(element: HTMLElement, action: () => void): void {
    element.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      action();
    });
  }

  private describe(stack: Stack | null): string {
    if (!stack) return "";
    const max = maxDurability(stack.item);
    const parts = [this.deps.itemLabel(stack.item) + (stack.count > 1 ? " ×" + stack.count : "")];
    if (max > 0) parts.push("내구도 " + (stack.wear ?? max) + "/" + max);
    if (stack.enchants?.length) parts.push(stack.enchants.map(([id, level]) => enchantLabel(id, level)).join(", "));
    return parts.join(" · ");
  }

  /** 칸 하나를 그린다 (그림 + 개수). */
  private slot(stack: Stack | null, onTap: (() => void) | null, extra = ""): HTMLElement {
    const el = document.createElement("div");
    el.className = "cslot" + (extra ? " " + extra : "") + (stack ? "" : " blank");
    if (stack) {
      const url = this.deps.iconUrl(stack.item);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = this.deps.itemLabel(stack.item);
        el.append(img);
      } else {
        const emoji = document.createElement("span");
        emoji.className = "cslot-emoji";
        emoji.textContent = this.deps.itemEmoji(stack.item);
        el.append(emoji);
      }
      if (stack.count > 1) {
        const count = document.createElement("span");
        count.className = "cslot-count";
        count.textContent = String(stack.count);
        el.append(count);
      }
      el.title = this.describe(stack);
    }
    if (onTap) this.press(el, onTap);
    return el;
  }

  /** 칸을 눌렀을 때: 들고 있는 게 없으면 집고, 있으면 놓는다. */
  private tapSlot(host: SlotHost, index: number): void {
    const before = host.get(index);
    this.info = this.describe(before ?? this.cursor);
    if (!this.cursor) {
      this.cursor = pickUp(host, index, this.split ? "half" : "all");
    } else {
      this.cursor = placeInto(host, index, this.cursor, this.split ? "one" : "all");
    }
    this.changed();
  }

  /** 결과 칸을 눌러 하나 만든다 (손에 든 것에 얹힌다). */
  private takeResult(): void {
    const recipe = this.match();
    if (!recipe) return;
    const [item, count] = recipe.output;
    if (this.cursor && (this.cursor.item !== item || this.cursor.count + count > this.deps.inventory.maxStack(item))) {
      this.deps.showToast("손에 든 것을 먼저 내려놓으세요", 1800);
      return;
    }
    const carried = this.carriedEnchants(recipe);
    this.consumeOnce();
    this.cursor = this.cursor ? { ...this.cursor, count: this.cursor.count + count } : carried.length > 0 ? { item, count, enchants: carried } : { item, count };
    this.deps.playCraft();
    this.deps.onCrafted(recipe);
    this.changed();
  }

  /** 업그레이드(예: 다이아몬드 검 → 네더라이트 검)로 만들 때, 재료로 쓰는 장비에 붙은 인챈트를 따라가게 모아 둔다. */
  private carriedEnchants(recipe: Recipe): [EnchantId, number][] {
    const [output] = recipe.output;
    if (!isEnchantable(output)) return [];
    const carried: [EnchantId, number][] = [];
    for (let i = 0; i < this.size * this.size; i++) {
      const stack = this.grid.get(i);
      if (!stack || !isEnchantable(stack.item) || !recipe.inputs.some(([item]) => item === stack.item)) continue;
      for (const [id, level] of stack.enchants ?? []) if (enchantsFor(output).includes(id)) carried.push([id, level]);
    }
    return carried;
  }

  /** 가방에서 하나를 꺼내 격자 칸에 놓을 모양으로 만든다 (장비라면 인챈트가 따라간다). */
  private takeOne(item: number): Stack {
    const inventory = this.deps.inventory;
    const stack: Stack = { item, count: 1 };
    const enchants = inventory.enchantsOf(item);
    if (enchants.length > 0) stack.enchants = enchants;
    if (maxDurability(item) > 0 && inventory.count(item) === 1) stack.wear = inventory.toolLeft(item);
    inventory.remove(item, 1);
    return stack;
  }

  /** 격자 칸마다 하나씩 쓴다. */
  private consumeOnce(): void {
    for (let i = 0; i < this.size * this.size; i++) {
      const stack = this.grid.get(i);
      if (!stack) continue;
      this.grid.set(i, stack.count > 1 ? { ...stack, count: stack.count - 1 } : null);
    }
  }

  /** 격자가 비었고 가방에 재료가 있으면, 같은 제작법으로 칸을 다시 채운다 (모두 만들기용). 채웠으면 true. */
  private refillSame(recipe: Recipe): boolean {
    const plan = planFill(recipe, this.size, this.size);
    if (!plan) return false;
    const need = new Map<number, number>();
    for (const item of plan) if (item !== 0) need.set(item, (need.get(item) ?? 0) + 1);
    for (const [item, amount] of need) if (this.deps.inventory.count(item) < amount) return false;
    plan.forEach((item, i) => {
      if (item === 0) return;
      this.grid.set(i, this.takeOne(item));
    });
    return true;
  }

  /** 격자의 재료로 만들고, 가방에 재료가 있는 만큼 계속 다시 채워 만들어 가방에 넣는다. */
  private craftAll(): void {
    let made = 0;
    let recipe = this.match();
    const name = recipe?.name ?? "";
    const first = recipe;
    while (recipe && made < 64) {
      const [item, count] = recipe.output;
      if (this.deps.inventory.freeSpace(item) < count) {
        if (made === 0) this.deps.showToast("가방이 가득 찼어요", 1800);
        break;
      }
      const carried = this.carriedEnchants(recipe);
      this.consumeOnce();
      this.deps.inventory.add(item, count);
      for (const [id, level] of carried) this.deps.inventory.addEnchant(item, id, level);
      this.deps.onCrafted(recipe);
      made++;
      recipe = this.match();
      // 격자의 재료를 다 썼으면 가방에서 다시 채운다.
      if (!recipe && first && this.cells().every((c) => c === 0) && this.refillSame(first)) recipe = this.match();
    }
    if (made > 0) {
      this.deps.playCraft();
      this.deps.showToast(name + " " + made + "번 만들었어요", 1800);
    }
    this.changed();
  }

  /** 레시피를 눌렀을 때: 격자를 비우고, 가방에서 재료를 꺼내 모양대로 채운다. */
  private fillFrom(recipe: Recipe): void {
    const plan = planFill(recipe, this.size, this.size);
    if (!plan) {
      this.deps.showToast(recipe.name + "은(는) 이 격자엔 들어가지 않아요 (제작대에서 만들어요)", 2400);
      return;
    }
    for (const stack of this.grid.takeAll()) this.giveBack(stack);
    const need = new Map<number, number>();
    for (const item of plan) if (item !== 0) need.set(item, (need.get(item) ?? 0) + 1);
    for (const [item, amount] of need) {
      if (this.deps.inventory.count(item) < amount) {
        this.deps.showToast("재료가 모자라요: " + this.deps.itemLabel(item) + " " + this.deps.inventory.count(item) + "/" + amount, 2200);
        this.changed();
        return;
      }
    }
    plan.forEach((item, i) => {
      if (item === 0) return;
      this.grid.set(i, this.takeOne(item));
    });
    this.deps.playPickup();
    this.changed();
  }

  private button(text: string, action: () => void, extra = ""): HTMLElement {
    const el = document.createElement("div");
    el.className = "item-chip" + (extra ? " " + extra : "");
    el.textContent = text;
    this.press(el, action);
    return el;
  }

  private render(): void {
    const { inventory } = this.deps;
    this.body.replaceChildren();

    // 위 줄: 손에 든 것, 나누기 스위치, 정리
    const top = document.createElement("div");
    top.className = "craft-top";
    const holding = document.createElement("div");
    holding.className = "item-chip " + (this.cursor ? "equipped" : "unequipped");
    holding.textContent = this.cursor ? "✋ " + this.describe(this.cursor) + " (칸을 눌러 놓아요)" : "✋ 빈손 (칸을 눌러 집어요)";
    top.append(
      holding,
      this.button(this.split ? "나누기: 켜짐 (절반 집기 / 하나씩 놓기)" : "나누기: 꺼짐 (전부 집기 / 전부 놓기)", () => {
        this.split = !this.split;
        this.render();
      }, this.split ? "equipped" : ""),
      this.button("가방 정리", () => {
        inventory.compact();
        this.changed();
      }),
      this.button("격자 비우기", () => {
        for (const stack of this.grid.takeAll()) this.giveBack(stack);
        this.changed();
      }),
    );
    this.body.append(top);
    if (this.info) {
      const info = document.createElement("div");
      info.className = "craft-info";
      info.textContent = "마지막으로 누른 것: " + this.info;
      this.body.append(info);
    }

    // 가운데: 격자 + 결과, 가방 칸
    const middle = document.createElement("div");
    middle.className = "craft-middle";

    const left = document.createElement("div");
    left.className = "craft-left";
    const gridEl = document.createElement("div");
    gridEl.className = "craft-grid";
    gridEl.style.gridTemplateColumns = "repeat(" + this.size + ", 44px)";
    for (let i = 0; i < this.size * this.size; i++) gridEl.append(this.slot(this.grid.get(i), () => this.tapSlot(this.grid, i)));
    const arrow = document.createElement("div");
    arrow.className = "craft-arrow";
    arrow.textContent = "➜";
    const recipe = this.match();
    const resultBox = document.createElement("div");
    resultBox.className = "craft-result";
    resultBox.append(
      this.slot(recipe ? { item: recipe.output[0], count: recipe.output[1] } : null, recipe ? () => this.takeResult() : null, recipe ? "ready" : ""),
    );
    if (recipe) resultBox.append(this.button("모두 만들기", () => this.craftAll()));
    left.append(gridEl, arrow, resultBox);

    const right = document.createElement("div");
    right.className = "craft-inv";
    const invHost = inventory.host();
    for (let i = 0; i < inventory.slotCount; i++) right.append(this.slot(inventory.slotStack(i), () => this.tapSlot(invHost, i)));
    middle.append(left, right);
    this.body.append(middle);

    // 레시피 목록
    const bookTitle = document.createElement("div");
    bookTitle.className = "section-title";
    bookTitle.textContent = "레시피 (누르면 가방의 재료로 칸을 채워 줘요. 초록 테두리는 만들 수 있어요)";
    const book = document.createElement("div");
    book.className = "craft-book";
    const usable = RECIPES.filter((r) => usableAt(r, this.context));
    usable.sort((a, b) => Number(inventory.canCraft(b)) - Number(inventory.canCraft(a)));
    for (const r of usable) {
      const row = document.createElement("div");
      row.className = "craft-row " + (inventory.canCraft(r) ? "ready" : "locked");
      row.textContent = r.name + " ×" + r.output[1];
      const need = document.createElement("small");
      need.textContent = "재료: " + r.inputs.map(([item, amount]) => this.deps.itemLabel(item) + " " + inventory.count(item) + "/" + amount).join(", ");
      row.append(need);
      this.press(row, () => this.fillFrom(r));
      book.append(row);
    }
    this.body.append(bookTitle, book);
  }
}
