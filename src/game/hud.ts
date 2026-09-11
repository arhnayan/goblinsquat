import type { Run } from "./run";
import type { HudMotion } from "./camera";
import { getTheme } from "./theme";
import { countKind, itemTag } from "./inventory";
import { packLetter, UNARMED_ATK, type Item } from "./catalog";
import { affixDisplay, buildEmptySlotCard, buildItemCard } from "./itemCard";
import { describeStatuses, hasStatus } from "./status";
import { canSell, sellPrice, type ShopState } from "./shop";

export type HudHooks = {
  onStart: (seed: string) => void;
  onHelp: () => void;
  onSeedChange: (seed: string) => void;
  onPackUse: (index: number) => void;
  onPackDrop: (index: number) => void;
  onShopBuy: (index: number) => void;
  onShopSell: (index: number) => void;
};

export type Hud = {
  log: (msg: string) => void;
  refresh: (run: Run) => void;
  overlay: (text: string | null) => void;
  showTitle: (seedBuf: string) => void;
  showHelp: () => void;
  showInventory: (run: Run) => void;
  hideInventory: () => void;
  moveInventorySelection: (run: Run, dx: number, dz: number) => void;
  hidePack: () => void;
  showShop: (run: Run, shop: ShopState) => void;
  setLook: (text: string | null) => void;
  setHint: (text: string) => void;
  clearLog: () => void;
  bind: (next: HudHooks) => void;
  updateMotion: (time: number, motion: HudMotion, reduced: boolean) => void;
};

type FloatPanel = {
  node: HTMLElement;
  phase: number;
  parallax: number;
  tilt: number;
  bob: number;
  centered?: boolean;
};

const PLAY_HINT = "WASD/hjkl  v+dir thrust  . wait  z rest  i pack  enter shop  x look  ? help";

const HELP = `GOBLINSQUAT
WASD  arrows  hjkl  yubn  numpad  move
v + direction  thrust (no step)
. or space  wait
z or 5  rest
i  pack   letter uses   shift+letter drops
enter  trade beside a merchant
x  look
q  quaff   e  eat
>  descend   <  climb
water and rubble cost extra turns
embers burn   spikes and vents hide in the floor
?  help   R  title
F  pixel   C  palette
studio  /studio.html`;

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createHud(): Hud {
  const status = el("status");
  const logBox = el("log");
  const hint = el("hint");
  const overlayBox = el("overlay");
  const packBox = el("pack");
  const lookBox = el("look");
  const inventoryBox = el("inventory");
  const lines: string[] = [];
  let lookText: string | null = null;
  let hooks: HudHooks | null = null;
  let prevHp: number | null = null;
  let prevGold: number | null = null;
  let prevDepth: number | null = null;
  let invSelected: number | null = null;

  status.classList.add("panel", "hud-float");
  logBox.classList.add("panel", "hud-float");
  hint.classList.add("panel", "hud-float");
  lookBox.classList.add("panel", "hud-float");
  packBox.classList.add("panel", "hud-float");
  overlayBox.classList.add("panel", "hud-float");

  const invScrim = document.createElement("div");
  invScrim.className = "inv-scrim";
  const invShell = document.createElement("div");
  invShell.className = "inv-shell panel hud-float";
  inventoryBox.append(invScrim, invShell);

  const floatPanels: FloatPanel[] = [
    { node: status, phase: 0, parallax: 0.42, tilt: 0.35, bob: 2.6 },
    { node: logBox, phase: 1.15, parallax: 0.3, tilt: 0.28, bob: 2.2 },
    { node: hint, phase: 2.35, parallax: 0.34, tilt: -0.32, bob: 2.4 },
    { node: lookBox, phase: 0.75, parallax: 0.36, tilt: 0.22, bob: 2.1 },
    { node: packBox, phase: 1.85, parallax: 0.46, tilt: -0.28, bob: 2.8 },
    { node: overlayBox, phase: 0.4, parallax: 0.18, tilt: 0.12, bob: 1.6, centered: true },
  ];

  hint.textContent = PLAY_HINT;

  const bind = (next: HudHooks) => {
    hooks = next;
  };

  const log = (msg: string) => {
    lines.push(msg);
    while (lines.length > 8) lines.shift();
    logBox.innerHTML = lines.map((l) => esc(l)).join("<br>");
  };

  const chip = (text: string, kind = ""): HTMLElement => {
    const node = document.createElement("span");
    node.className = kind ? `chip chip-${kind}` : "chip";
    node.textContent = text;
    return node;
  };

  const chipGlyph = (text: string, glyph: string, colorVar: string, kind = ""): HTMLElement => {
    const node = chip(text, kind);
    const g = document.createElement("i");
    g.className = "chip-glyph";
    g.style.color = colorVar;
    g.textContent = glyph;
    node.prepend(g);
    return node;
  };

  const enterPanel = (node: HTMLElement) => {
    node.classList.remove("is-entering");
    void node.offsetWidth;
    node.classList.add("is-entering");
    window.setTimeout(() => node.classList.remove("is-entering"), 360);
  };

  const packRow = (letter: string, item: Item, name: string, price?: string): HTMLLIElement => {
    const row = document.createElement("li");
    row.className = "pack-row";
    row.append(buildItemCard(item, { size: "mini", letter, name, price }));
    return row;
  };

  const equipSlot = (kind: "weapon" | "armor", run: Run): HTMLElement => {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "inv-slot-label";
    label.textContent = kind;
    wrap.append(label);

    const id = kind === "weapon" ? run.weaponId : run.armorId;
    const item = run.pack.find((i) => i.id === id) ?? null;
    wrap.append(item ? buildItemCard(item, { size: "slot", equipped: true }) : buildEmptySlotCard(kind));

    const stats = document.createElement("div");
    stats.className = "inv-slot-stats";
    stats.textContent =
      kind === "weapon" ? `ATK ${run.atk}${item ? "" : " (unarmed)"}` : `DEF ${run.def}`;
    wrap.append(stats);

    if (item) {
      const affixes = affixDisplay(item);
      if (affixes.length) {
        const list = document.createElement("ul");
        list.className = "inv-affix-list";
        for (const a of affixes) {
          const li = document.createElement("li");
          li.textContent = a.detail ? `${a.label} — ${a.detail}` : a.label;
          list.append(li);
        }
        wrap.append(list);
      }
    }
    return wrap;
  };

  const invDetail = (run: Run): HTMLElement => {
    const wrap = document.createElement("div");
    const it = invSelected !== null ? (run.pack[invSelected] ?? null) : null;
    if (!it) {
      wrap.textContent = "select an item to inspect";
      return wrap;
    }
    const equipped = it.id === run.weaponId || it.id === run.armorId;
    if (equipped) {
      wrap.textContent = `${it.name} — equipped`;
      return wrap;
    }
    if (it.kind === "weapon" || it.kind === "armor") {
      const cur = run.pack.find((p) => (it.kind === "weapon" ? p.id === run.weaponId : p.id === run.armorId));
      const curVal = it.kind === "weapon" ? (cur?.weaponAtk ?? UNARMED_ATK) : (cur?.armorDef ?? 0);
      const val = it.kind === "weapon" ? (it.weaponAtk ?? 0) : (it.armorDef ?? 0);
      const delta = val - curVal;
      const label = it.kind === "weapon" ? "ATK" : "DEF";
      wrap.append(document.createTextNode(`${it.name} — `));
      const d = document.createElement("span");
      d.className = delta >= 0 ? "is-up" : "is-down";
      d.textContent = `${delta >= 0 ? "+" : ""}${delta} ${label} vs equipped`;
      wrap.append(d);
      return wrap;
    }
    wrap.textContent = it.name;
    return wrap;
  };

  const renderInventory = (run: Run) => {
    const head = document.createElement("div");
    head.className = "inv-head";
    const title = document.createElement("span");
    title.textContent = "inventory";
    const gold = document.createElement("span");
    gold.className = "inv-gold";
    gold.textContent = `$${run.gold}`;
    head.append(title, gold);

    const equip = document.createElement("div");
    equip.className = "inv-equip";
    equip.append(equipSlot("weapon", run), equipSlot("armor", run));
    if (run.hasAmulet) {
      const note = document.createElement("div");
      note.className = "inv-amulet-note";
      note.textContent = "the amulet hums — secured";
      equip.append(note);
    }

    const gridWrap = document.createElement("div");
    gridWrap.className = "inv-grid-wrap";
    const grid = document.createElement("div");
    grid.className = "inv-grid";
    if (run.pack.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pack-empty";
      empty.textContent = "your pack is empty";
      grid.append(empty);
    } else {
      run.pack.forEach((it, i) => {
        const equipped = it.id === run.weaponId || it.id === run.armorId;
        grid.append(
          buildItemCard(it, {
            letter: packLetter(i),
            size: "grid",
            equipped,
            selected: i === invSelected,
            onClick: (e) => {
              invSelected = i;
              if (e.shiftKey) hooks?.onPackDrop(i);
              else hooks?.onPackUse(i);
            },
          }),
        );
      });
    }
    gridWrap.append(grid);

    const detail = document.createElement("div");
    detail.className = "inv-detail";
    detail.append(invDetail(run));
    gridWrap.append(detail);

    const foot = document.createElement("p");
    foot.className = "inv-foot";
    foot.textContent = "letter use  shift+letter drop  arrows select  i/esc close";

    invShell.replaceChildren(head, equip, gridWrap, foot);
  };

  const showInventory = (run: Run) => {
    const wasHidden = inventoryBox.hidden;
    inventoryBox.hidden = false;
    if (invSelected === null || invSelected >= run.pack.length) {
      invSelected = run.pack.length ? 0 : null;
    }
    renderInventory(run);
    hint.textContent = "letter use  shift+letter drop  i close";
    if (wasHidden) enterPanel(invShell);
  };

  const hideInventory = () => {
    inventoryBox.hidden = true;
    invShell.replaceChildren();
    invSelected = null;
  };

  const moveInventorySelection = (run: Run, dx: number, dz: number) => {
    if (!run.pack.length) return;
    const cols = 4;
    let idx = invSelected ?? 0;
    if (dx) idx = Math.max(0, Math.min(run.pack.length - 1, idx + dx));
    else if (dz) {
      const next = idx + dz * cols;
      if (next >= 0 && next < run.pack.length) idx = next;
    }
    invSelected = idx;
    renderInventory(run);
  };


  const refresh = (run: Run) => {
    const hit = prevHp !== null && run.hp < prevHp;
    const low = run.maxHp > 0 && run.hp / run.maxHp <= 0.25;
    const goldUp = prevGold !== null && run.gold > prevGold;
    const depthUp = prevDepth !== null && run.depth > prevDepth;
    prevHp = run.hp;
    prevGold = run.gold;
    prevDepth = run.depth;

    status.replaceChildren();
    const hpRow = document.createElement("div");
    hpRow.className = "hp-row";
    if (low) hpRow.classList.add("is-low");
    if (hit) hpRow.classList.add("is-hit");
    const hpLabel = document.createElement("span");
    hpLabel.className = "hp-label";
    hpLabel.textContent = `HP ${run.hp}/${run.maxHp}`;
    const bar = document.createElement("div");
    bar.className = "hp-bar";
    if (hasStatus(run, "poison")) bar.classList.add("is-poison");
    if (hasStatus(run, "burn")) bar.classList.add("is-burn");
    if (hasStatus(run, "bleed")) bar.classList.add("is-bleed");
    const segs = Math.max(1, run.maxHp);
    for (let i = 0; i < segs; i++) {
      const seg = document.createElement("i");
      seg.className = i < run.hp ? "hp-seg is-on" : "hp-seg";
      bar.append(seg);
    }
    hpRow.append(hpLabel, bar);

    const chips = document.createElement("div");
    chips.className = "chips";
    const goldChip = chipGlyph(`$${run.gold}`, "$", "var(--gold)", "gold");
    if (goldUp) goldChip.classList.add("is-bloom");
    const depthChip = chip(`D${run.depth}`);
    if (depthUp) depthChip.classList.add("is-bloom");
    chips.append(
      chip(`ATK ${run.atk}`),
      chip(`DEF ${run.def}`),
      depthChip,
      goldChip,
      chipGlyph(`p${countKind(run, "potion")}`, "!", "var(--c-potion)"),
    );
    if (run.hasAmulet) chips.append(chipGlyph("amulet", "*", "var(--c-amulet)", "gold"));
    for (const s of describeStatuses(run)) {
      chips.append(chip(`${s.kind} ${s.turns}`, "warn"));
    }
    const w = run.pack.find((i) => i.id === run.weaponId);
    const a = run.pack.find((i) => i.id === run.armorId);
    if (w) chips.append(chipGlyph(w.name, ")", "var(--c-weapon)"));
    if (a) chips.append(chipGlyph(a.name, "]", "var(--c-armor)"));
    chips.append(chip(`seed ${run.seed}`), chip(getTheme().name));
    status.append(hpRow, chips);
  };

  const overlay = (text: string | null) => {
    overlayBox.classList.remove("is-title", "is-interactive");
    if (!text) {
      overlayBox.hidden = true;
      overlayBox.replaceChildren();
      return;
    }
    const wasHidden = overlayBox.hidden;
    overlayBox.hidden = false;
    const body = document.createElement("div");
    body.className = "overlay-body";
    body.textContent = text;
    overlayBox.replaceChildren(body);
    if (wasHidden) enterPanel(overlayBox);
  };

  const wireTitle = (seedInput: HTMLInputElement) => {
    seedInput.addEventListener("input", () => {
      const digits = seedInput.value.replace(/\D/g, "").slice(0, 10);
      if (seedInput.value !== digits) seedInput.value = digits;
      hooks?.onSeedChange(digits);
    });
    seedInput.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        hooks?.onStart(seedInput.value);
      }
    });
  };

  const showTitle = (seedBuf: string) => {
    const wasHidden = overlayBox.hidden;
    overlayBox.hidden = false;
    overlayBox.classList.add("is-title", "is-interactive");
    const existing = overlayBox.querySelector<HTMLInputElement>("#seed-input");
    if (existing) {
      if (document.activeElement !== existing) existing.value = seedBuf;
      hint.textContent = "enter start  ? help  F pixel  C palette";
      return;
    }

    const card = document.createElement("div");
    card.className = "title-card";
    const word = document.createElement("h1");
    word.className = "title-word";
    word.textContent = "GOBLINSQUAT";
    const blurb = document.createElement("p");
    blurb.className = "title-blurb";
    blurb.textContent = "type a seed, enter to squat";
    const label = document.createElement("label");
    label.className = "field title-seed";
    const cap = document.createElement("span");
    cap.textContent = "seed";
    const input = document.createElement("input");
    input.id = "seed-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = 10;
    input.spellcheck = false;
    input.value = seedBuf;
    label.append(cap, input);
    const actions = document.createElement("div");
    actions.className = "title-actions";
    const start = document.createElement("button");
    start.type = "button";
    start.className = "btn btn-primary";
    start.textContent = "squat";
    start.addEventListener("click", () => hooks?.onStart(input.value));
    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "btn";
    helpBtn.textContent = "help";
    helpBtn.addEventListener("click", () => hooks?.onHelp());
    actions.append(start, helpBtn);
    card.append(word, blurb, label, actions);
    overlayBox.replaceChildren(card);
    wireTitle(input);
    hint.textContent = "enter start  ? help  F pixel  C palette";
    if (wasHidden) enterPanel(overlayBox);
  };

  const showHelp = () => {
    overlay(HELP);
    hint.textContent = "esc close";
  };

  const hidePack = () => {
    packBox.hidden = true;
    packBox.replaceChildren();
  };

  const showShop = (run: Run, shop: ShopState) => {
    const wasHidden = packBox.hidden;
    packBox.hidden = false;
    packBox.replaceChildren();
    const head = document.createElement("div");
    head.className = "pack-head";
    head.textContent = `shop  $${run.gold}`;
    packBox.append(head);
    if (!shop.offers.length) {
      const empty = document.createElement("p");
      empty.className = "pack-empty";
      empty.textContent = "sold out";
      packBox.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "pack-list";
      shop.offers.forEach((offer, i) => {
        const row = packRow(packLetter(i), offer.item, offer.item.name, `$${offer.price}`);
        row.addEventListener("click", () => hooks?.onShopBuy(i));
        list.append(row);
      });
      packBox.append(list);
    }
    const sellHead = document.createElement("div");
    sellHead.className = "pack-head";
    sellHead.textContent = "sell";
    packBox.append(sellHead);
    if (run.pack.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pack-empty";
      empty.textContent = "nothing to pawn";
      packBox.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "pack-list";
      run.pack.forEach((it, i) => {
        const worth = canSell(it) ? `$${sellPrice(it)}` : undefined;
        const row = packRow(packLetter(i), it, `${it.name}${itemTag(run, it)}`, worth);
        row.addEventListener("click", (e) => {
          if (e.shiftKey) hooks?.onShopSell(i);
        });
        list.append(row);
      });
      packBox.append(list);
    }
    const foot = document.createElement("p");
    foot.className = "pack-foot";
    foot.textContent = "letter buy  shift+letter sell  esc close";
    packBox.append(foot);
    hint.textContent = "letter buy  shift+letter sell  esc close";
    if (wasHidden) enterPanel(packBox);
  };

  const setLook = (text: string | null) => {
    lookText = text;
    if (text) {
      const wasHidden = lookBox.hidden;
      lookBox.hidden = false;
      lookBox.textContent = text;
      hint.textContent = "x/esc stop looking";
      if (wasHidden) enterPanel(lookBox);
    } else {
      lookBox.hidden = true;
      lookBox.textContent = "";
    }
  };

  const setHint = (text: string) => {
    if (lookText) return;
    hint.textContent = text;
  };

  const clearLog = () => {
    lines.length = 0;
    logBox.textContent = "";
  };

  const updateMotion = (time: number, motion: HudMotion, reduced: boolean) => {
    for (const panel of floatPanels) {
      if (panel.node.hidden) {
        panel.node.style.transform = "";
        continue;
      }
      if (reduced) {
        panel.node.style.transform = panel.centered ? "translate(-50%, -50%)" : "";
        continue;
      }
      const px =
        (motion.swayX + motion.leanX) * panel.parallax;
      const py =
        (motion.swayY + motion.leanY) * panel.parallax +
        Math.sin(time * 1.75 + panel.phase) * panel.bob;
      const roll =
        Math.sin(time * 1.05 + panel.phase * 1.4) * panel.tilt;
      panel.node.style.setProperty("--float-lift", py.toFixed(2));
      panel.node.style.transform = panel.centered
        ? `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${roll}deg)`
        : `translate(${px}px, ${py}px) rotate(${roll}deg)`;
    }
  };

  return {
    log,
    refresh,
    overlay,
    showTitle,
    showHelp,
    showInventory,
    hideInventory,
    moveInventorySelection,
    hidePack,
    showShop,
    setLook,
    setHint,
    clearLog,
    bind,
    updateMotion,
  };
}

export { PLAY_HINT };
