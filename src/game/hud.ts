import type { Run } from "./run";
import type { HudMotion } from "./camera";
import { getTheme } from "./theme";
import { countKind, itemTag } from "./inventory";
import { packLetter } from "./catalog";
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
  showPack: (run: Run) => void;
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
  const lines: string[] = [];
  let lookText: string | null = null;
  let hooks: HudHooks | null = null;

  status.classList.add("panel", "hud-float");
  logBox.classList.add("panel", "hud-float");
  hint.classList.add("panel", "hud-float");
  lookBox.classList.add("panel", "hud-float");
  packBox.classList.add("panel", "hud-float");
  overlayBox.classList.add("panel", "hud-float");

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

  const refresh = (run: Run) => {
    status.replaceChildren();
    const hpRow = document.createElement("div");
    hpRow.className = "hp-row";
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
    chips.append(
      chip(`ATK ${run.atk}`),
      chip(`DEF ${run.def}`),
      chip(`D${run.depth}`),
      chip(`$${run.gold}`, "gold"),
      chip(`p${countKind(run, "potion")}`),
    );
    if (run.hasAmulet) chips.append(chip("* amulet", "gold"));
    for (const s of describeStatuses(run)) {
      chips.append(chip(`${s.kind} ${s.turns}`, "warn"));
    }
    const w = run.pack.find((i) => i.id === run.weaponId);
    const a = run.pack.find((i) => i.id === run.armorId);
    if (w) chips.append(chip(w.name));
    if (a) chips.append(chip(a.name));
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
    overlayBox.hidden = false;
    const body = document.createElement("div");
    body.className = "overlay-body";
    body.textContent = text;
    overlayBox.replaceChildren(body);
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
  };

  const showHelp = () => {
    overlay(HELP);
    hint.textContent = "esc close";
  };

  const showPack = (run: Run) => {
    packBox.hidden = false;
    packBox.replaceChildren();
    const head = document.createElement("div");
    head.className = "pack-head";
    head.textContent = "pack";
    packBox.append(head);
    if (run.pack.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pack-empty";
      empty.textContent = "your pack is empty";
      packBox.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "pack-list";
      run.pack.forEach((it, i) => {
        const row = document.createElement("li");
        row.className = "pack-row";
        const letter = document.createElement("kbd");
        letter.textContent = packLetter(i);
        const name = document.createElement("span");
        name.textContent = `${it.name}${itemTag(run, it)}`;
        row.append(letter, name);
        row.addEventListener("click", (e) => {
          if (e.shiftKey) hooks?.onPackDrop(i);
          else hooks?.onPackUse(i);
        });
        list.append(row);
      });
      packBox.append(list);
    }
    const foot = document.createElement("p");
    foot.className = "pack-foot";
    foot.textContent = "letter use  shift+letter drop  i close";
    packBox.append(foot);
    hint.textContent = "letter use  shift+letter drop  i close";
  };

  const hidePack = () => {
    packBox.hidden = true;
    packBox.replaceChildren();
  };

  const showShop = (run: Run, shop: ShopState) => {
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
        const row = document.createElement("li");
        row.className = "pack-row";
        const letter = document.createElement("kbd");
        letter.textContent = packLetter(i);
        const name = document.createElement("span");
        name.textContent = `${offer.item.name}  $${offer.price}`;
        row.append(letter, name);
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
        const row = document.createElement("li");
        row.className = "pack-row";
        const letter = document.createElement("kbd");
        letter.textContent = packLetter(i);
        const name = document.createElement("span");
        const worth = canSell(it) ? `  $${sellPrice(it)}` : "";
        name.textContent = `${it.name}${itemTag(run, it)}${worth}`;
        row.append(letter, name);
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
  };

  const setLook = (text: string | null) => {
    lookText = text;
    if (text) {
      lookBox.hidden = false;
      lookBox.textContent = text;
      hint.textContent = "x/esc stop looking";
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
    showPack,
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
