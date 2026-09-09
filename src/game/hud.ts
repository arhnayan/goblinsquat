import type { Run } from "./run";
import { getTheme } from "./theme";
import { countKind, itemTag } from "./inventory";
import { packLetter } from "./catalog";

export type HudHooks = {
  onStart: (seed: string) => void;
  onHelp: () => void;
  onSeedChange: (seed: string) => void;
  onPackUse: (index: number) => void;
  onPackDrop: (index: number) => void;
};

export type Hud = {
  log: (msg: string) => void;
  refresh: (run: Run) => void;
  overlay: (text: string | null) => void;
  showTitle: (seedBuf: string) => void;
  showHelp: () => void;
  showPack: (run: Run) => void;
  hidePack: () => void;
  setLook: (text: string | null) => void;
  setHint: (text: string) => void;
  clearLog: () => void;
  bind: (next: HudHooks) => void;
};

const PLAY_HINT = "WASD/hjkl  . wait  z rest  i pack  x look  ? help  F pixel  C palette";

const HELP = `GOBLINSQUAT
WASD  arrows  hjkl  yubn  numpad  move
. or space  wait
z or 5  rest
i  pack   letter uses   shift+letter drops
x  look
q  quaff   e  eat
>  descend   <  climb
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

  status.classList.add("panel");
  logBox.classList.add("panel");
  hint.classList.add("panel");
  lookBox.classList.add("panel");
  packBox.classList.add("panel");
  overlayBox.classList.add("panel");

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
    if (run.poison > 0) bar.classList.add("is-poison");
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
    if (run.poison > 0) chips.append(chip(`psn${run.poison}`, "warn"));
    if (run.hasAmulet) chips.append(chip("* amulet", "gold"));
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

  return {
    log,
    refresh,
    overlay,
    showTitle,
    showHelp,
    showPack,
    hidePack,
    setLook,
    setHint,
    clearLog,
    bind,
  };
}

export { PLAY_HINT };
