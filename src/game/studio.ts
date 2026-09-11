import {
  blankArmor,
  blankMonster,
  blankWeapon,
  catalogWarnings,
  cloneCatalog,
  DEFAULT_LOOT_TABLE,
  getCatalog,
  parseCatalog,
  persistCatalog,
  resetCatalog,
  slugId,
  type ArmorDef,
  type MonsterDef,
  type WeaponDef,
} from "./catalog";
import { isFormTarget } from "./dom";
import {
  cycleTheme,
  getColors,
  hexCss,
  THEME_COLOR_KEYS,
  type ThemeColorKey,
} from "./theme";

type Tab = "beasts" | "steel" | "hide" | "vitals";

export function mountStudio(root: HTMLElement): void {
  let draft = cloneCatalog(getCatalog());
  let tab: Tab = "beasts";
  let selected = draft.monsters[0]?.id ?? "";
  let note = "edits apply to new floors after save";

  const render = () => {
    root.replaceChildren(build());
  };

  const warn = () => catalogWarnings(draft);

  const taken = (kind: "monsters" | "weapons" | "armors") =>
    new Set(draft[kind].map((row) => row.id));

  const selectFirst = (next: Tab) => {
    if (next === "beasts") selected = draft.monsters[0]?.id ?? "";
    else if (next === "steel") selected = draft.weapons[0]?.id ?? "";
    else if (next === "hide") selected = draft.armors[0]?.id ?? "";
    else selected = "";
  };

  const currentMonster = () => draft.monsters.find((m) => m.id === selected);
  const currentWeapon = () => draft.weapons.find((w) => w.id === selected);
  const currentArmor = () => draft.armors.find((a) => a.id === selected);

  const save = () => {
    persistCatalog(draft);
    draft = cloneCatalog(getCatalog());
    note = "saved. new runs and new floors use this catalog";
    render();
  };

  const reset = () => {
    draft = resetCatalog();
    selectFirst(tab);
    note = "reset to builtin";
    render();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "goblinsquat-catalog.json";
    a.click();
    URL.revokeObjectURL(url);
    note = "exported catalog json";
    render();
  };

  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = parseCatalog(JSON.parse(await file.text()));
        if (!parsed) {
          note = "import failed: catalog was empty or invalid";
          render();
          return;
        }
        draft = parsed;
        selectFirst(tab);
        note = "imported. save to keep it";
        render();
      } catch {
        note = "import failed: not valid json";
        render();
      }
    });
    input.click();
  };

  const addNew = () => {
    if (tab === "beasts") {
      const row = blankMonster(taken("monsters"));
      draft.monsters.push(row);
      selected = row.id;
    } else if (tab === "steel") {
      const row = blankWeapon(taken("weapons"));
      draft.weapons.push(row);
      selected = row.id;
    } else if (tab === "hide") {
      const row = blankArmor(taken("armors"));
      draft.armors.push(row);
      selected = row.id;
    }
    note = "added. save when ready";
    render();
  };

  const duplicate = () => {
    if (tab === "beasts") {
      const src = currentMonster();
      if (!src) return;
      const ids = taken("monsters");
      const copy: MonsterDef = { ...src, id: slugId(src.id, ids), name: `${src.name} 2` };
      draft.monsters.push(copy);
      selected = copy.id;
    } else if (tab === "steel") {
      const src = currentWeapon();
      if (!src) return;
      const ids = taken("weapons");
      const copy: WeaponDef = { ...src, id: slugId(src.id, ids), name: `${src.name} 2` };
      draft.weapons.push(copy);
      selected = copy.id;
    } else if (tab === "hide") {
      const src = currentArmor();
      if (!src) return;
      const ids = taken("armors");
      const copy: ArmorDef = { ...src, id: slugId(src.id, ids), name: `${src.name} 2` };
      draft.armors.push(copy);
      selected = copy.id;
    }
    note = "duplicated. save when ready";
    render();
  };

  const remove = () => {
    if (tab === "beasts") {
      if (draft.monsters.length <= 1) {
        note = "keep at least one beast";
        render();
        return;
      }
      draft.monsters = draft.monsters.filter((m) => m.id !== selected);
    } else if (tab === "steel") {
      if (draft.weapons.length <= 1) {
        note = "keep at least one weapon";
        render();
        return;
      }
      draft.weapons = draft.weapons.filter((w) => w.id !== selected);
    } else if (tab === "hide") {
      if (draft.armors.length <= 1) {
        note = "keep at least one armor";
        render();
        return;
      }
      draft.armors = draft.armors.filter((a) => a.id !== selected);
    } else return;
    selectFirst(tab);
    note = "removed from draft. save to commit";
    render();
  };

  const build = (): HTMLElement => {
    const shell = el("div", "studio-shell");
    shell.append(buildHead(), buildBody(), buildFoot());
    return shell;
  };

  const buildHead = (): HTMLElement => {
    const head = el("header", "studio-head");
    const brand = el("div", "studio-brand");
    const title = el("h1");
    title.textContent = "studio";
    const sub = el("p", "studio-sub");
    sub.textContent = "dev catalog. new floors pick this up after save.";
    brand.append(title, sub);

    const tabs = el("div", "studio-tabs");
    for (const [id, label] of [
      ["beasts", "beasts"],
      ["steel", "steel"],
      ["hide", "hide"],
      ["vitals", "vitals"],
    ] as const) {
      const b = btn(label, tab === id ? "btn tab is-on" : "btn tab");
      b.addEventListener("click", () => {
        tab = id;
        selectFirst(tab);
        render();
      });
      tabs.append(b);
    }

    const actions = el("div", "studio-actions");
    const saveBtn = btn("save", "btn btn-primary");
    saveBtn.addEventListener("click", save);
    const resetBtn = btn("reset", "btn");
    resetBtn.addEventListener("click", () => {
      if (!confirm("throw out custom catalog and restore builtin?")) return;
      reset();
    });
    const exp = btn("export", "btn");
    exp.addEventListener("click", exportJson);
    const imp = btn("import", "btn");
    imp.addEventListener("click", importJson);
    const pal = btn("palette", "btn");
    pal.addEventListener("click", () => {
      cycleTheme();
      render();
    });
    const play = document.createElement("a");
    play.className = "btn";
    play.href = "/";
    play.textContent = "game";
    actions.append(saveBtn, resetBtn, exp, imp, pal, play);

    head.append(brand, tabs, actions);
    return head;
  };

  const buildBody = (): HTMLElement => {
    const body = el("div", "studio-body");
    if (tab === "vitals") {
      body.append(vitalsForm());
      return body;
    }
    const list = el("aside", "studio-list");
    if (tab === "beasts") {
      for (const row of draft.monsters) {
        list.append(listItem(row.id, row.name, row.glyph, row.palette));
      }
    } else if (tab === "steel") {
      for (const row of draft.weapons) {
        list.append(listItem(row.id, row.name, ")", null));
      }
    } else {
      for (const row of draft.armors) {
        list.append(listItem(row.id, row.name, "]", null));
      }
    }
    const tools = el("div", "studio-list-tools");
    const n = btn("new", "btn");
    n.addEventListener("click", addNew);
    const d = btn("dup", "btn");
    d.addEventListener("click", duplicate);
    const r = btn("del", "btn");
    r.addEventListener("click", remove);
    tools.append(n, d, r);
    list.append(tools);

    const form = el("div", "studio-form");
    if (tab === "beasts") {
      const m = currentMonster();
      if (m) form.append(beastForm(m));
    } else if (tab === "steel") {
      const w = currentWeapon();
      if (w) form.append(weaponForm(w));
    } else {
      const a = currentArmor();
      if (a) form.append(armorForm(a));
    }
    body.append(list, form);
    return body;
  };

  const listItem = (
    id: string,
    name: string,
    glyph: string,
    palette: ThemeColorKey | null,
  ): HTMLButtonElement => {
    const item = btn("", selected === id ? "btn studio-item is-on" : "btn studio-item");
    const mark = el("span", "studio-item-glyph");
    mark.textContent = glyph;
    if (palette) mark.style.color = hexCss(getColors()[palette]);
    const label = el("span");
    label.textContent = name;
    item.append(mark, label);
    item.addEventListener("click", () => {
      selected = id;
      render();
    });
    return item;
  };

  const buildFoot = (): HTMLElement => {
    const foot = el("footer", "studio-foot");
    const msg = el("p", "studio-note");
    msg.textContent = note;
    const warns = warn();
    foot.append(msg);
    if (warns.length) {
      const list = el("ul", "studio-warns");
      for (const w of warns) {
        const li = document.createElement("li");
        li.textContent = w;
        list.append(li);
      }
      foot.append(list);
    }
    return foot;
  };

  const beastForm = (m: MonsterDef): HTMLElement => {
    const wrap = el("form", "form-grid");
    wrap.addEventListener("submit", (e) => e.preventDefault());
    const preview = el("div", "glyph-preview");
    const glyphFace = el("span", "glyph-face");
    glyphFace.textContent = m.glyph || "?";
    glyphFace.style.color = hexCss(getColors()[m.palette]);
    const glyphCap = el("span", "glyph-cap");
    glyphCap.textContent = m.name;
    preview.append(glyphFace, glyphCap);

    wrap.append(preview);
    wrap.append(
      field("name", textInput(m.name, (v) => {
        m.name = v;
        glyphCap.textContent = v;
      })),
      field("id", textInput(m.id, (v) => {
        const next = slugId(v || m.name, new Set([...taken("monsters")].filter((id) => id !== m.id)));
        m.id = next;
        selected = next;
      })),
      field("glyph", textInput(m.glyph, (v) => {
        m.glyph = v.slice(0, 1);
        glyphFace.textContent = m.glyph || "?";
      }, 1)),
      field("palette", paletteSelect(m.palette, (v) => {
        m.palette = v;
        glyphFace.style.color = hexCss(getColors()[v]);
      })),
    );
    wrap.append(
      field("hp", numInput(m.hp, 1, 99, (v) => (m.hp = v))),
      field("atk", numInput(m.atk, 0, 99, (v) => (m.atk = v))),
      field("def", numInput(m.def, 0, 99, (v) => (m.def = v))),
      field("min depth", numInput(m.minDepth, 1, 99, (v) => (m.minDepth = v))),
      field("max depth", numInput(m.maxDepth ?? 0, 0, 99, (v) => {
        m.maxDepth = v <= 0 ? undefined : v;
      })),
      field("weight", numInput(m.weight, 0, 999, (v) => (m.weight = v))),
      field("range", numInput(m.range, 1, 8, (v) => (m.range = v))),
      field("y scale", numInput(m.yScale, 0.3, 2.5, (v) => (m.yScale = v), 0.05)),
      field("size", numInput(m.sizeMul, 0.5, 2, (v) => (m.sizeMul = v), 0.05)),
    );
    const flags = el("div", "flag-grid");
    flags.append(
      check("glow", m.glow, (v) => (m.glow = v)),
      check("opens doors", m.canOpenDoors, (v) => (m.canOpenDoors = v)),
      check("poison", m.poison, (v) => (m.poison = v)),
      check("bleed", m.bleed, (v) => (m.bleed = v)),
      check("burns", m.burns, (v) => (m.burns = v)),
      check("ranged", m.ranged, (v) => (m.ranged = v)),
      check("steals", m.steals, (v) => (m.steals = v)),
      check("erratic", m.erratic, (v) => (m.erratic = v)),
      check("flees", m.flees, (v) => (m.flees = v)),
      check("pack alert", m.packAlert, (v) => (m.packAlert = v)),
      check("guardian", m.guardian, (v) => {
        if (v) {
          for (const other of draft.monsters) other.guardian = other.id === m.id;
        } else m.guardian = false;
        render();
      }),
    );
    wrap.append(flags);

    const lootToggle = check("custom loot table", !!m.loot, (v) => {
      m.loot = v ? { ...DEFAULT_LOOT_TABLE } : undefined;
      render();
    });
    wrap.append(lootToggle);
    if (m.loot) {
      const loot = m.loot;
      const pct = (v: number, set: (n: number) => void) =>
        numInput(Math.round(v * 100), 0, 100, (n) => set(n / 100));
      wrap.append(
        field("potion %", pct(loot.potionChance, (n) => (loot.potionChance = n))),
        field("food %", pct(loot.foodChance, (n) => (loot.foodChance = n))),
        field("weapon %", pct(loot.weaponChance ?? 0, (n) => (loot.weaponChance = n))),
        field("armor %", pct(loot.armorChance ?? 0, (n) => (loot.armorChance = n))),
        field("gold %", pct(loot.goldChance, (n) => (loot.goldChance = n))),
        field("gold min", numInput(loot.goldMin, 0, 999, (v) => (loot.goldMin = v))),
        field("gold max", numInput(loot.goldMax, 0, 999, (v) => (loot.goldMax = v))),
      );
    }
    return wrap;
  };

  const weaponForm = (w: WeaponDef): HTMLElement => {
    const wrap = el("form", "form-grid");
    wrap.addEventListener("submit", (e) => e.preventDefault());
    wrap.append(
      field("name", textInput(w.name, (v) => (w.name = v))),
      field("id", textInput(w.id, (v) => {
        const next = slugId(v || w.name, new Set([...taken("weapons")].filter((id) => id !== w.id)));
        w.id = next;
        selected = next;
      })),
      field("atk", numInput(w.atk, 0, 99, (v) => (w.atk = v))),
      field("min depth", numInput(w.minDepth, 1, 99, (v) => (w.minDepth = v))),
      field("price", numInput(w.price ?? w.atk * 8, 0, 999, (v) => (w.price = v))),
    );
    return wrap;
  };

  const armorForm = (a: ArmorDef): HTMLElement => {
    const wrap = el("form", "form-grid");
    wrap.addEventListener("submit", (e) => e.preventDefault());
    wrap.append(
      field("name", textInput(a.name, (v) => (a.name = v))),
      field("id", textInput(a.id, (v) => {
        const next = slugId(v || a.name, new Set([...taken("armors")].filter((id) => id !== a.id)));
        a.id = next;
        selected = next;
      })),
      field("def", numInput(a.def, 0, 99, (v) => (a.def = v))),
      field("min depth", numInput(a.minDepth, 1, 99, (v) => (a.minDepth = v))),
      field("price", numInput(a.price ?? a.def * 14, 0, 999, (v) => (a.price = v))),
    );
    return wrap;
  };

  const vitalsForm = (): HTMLElement => {
    const wrap = el("form", "form-grid vitals-form");
    wrap.addEventListener("submit", (e) => e.preventDefault());
    const intro = el("p", "studio-sub");
    intro.textContent =
      "heal amounts for potions and rations. tile traps (spikes, gas, rubble, embers) are generated in code, not this catalog.";
    wrap.append(intro);
    wrap.append(
      field("potion heal", numInput(draft.vitals.potionHeal, 1, 99, (v) => {
        draft.vitals.potionHeal = v;
      })),
      field("food heal", numInput(draft.vitals.foodHeal, 1, 99, (v) => {
        draft.vitals.foodHeal = v;
      })),
    );
    return wrap;
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (isFormTarget(e.target)) return;
    if (e.code === "KeyC") {
      e.preventDefault();
      cycleTheme();
      render();
    }
  });

  render();
}

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function btn(label: string, className: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  return b;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("label", "field");
  const cap = el("span");
  cap.textContent = label;
  wrap.append(cap, control);
  return wrap;
}

function textInput(
  value: string,
  onChange: (v: string) => void,
  max?: number,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  if (max) input.maxLength = max;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.addEventListener("input", () => onChange(input.value));
  input.addEventListener("change", () => {
    input.value = max ? input.value.slice(0, max) : input.value;
    onChange(input.value);
  });
  return input;
}

function numInput(
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
  step = 1,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) return;
    onChange(Math.max(min, Math.min(max, n)));
  });
  return input;
}

function paletteSelect(
  value: ThemeColorKey,
  onChange: (v: ThemeColorKey) => void,
): HTMLSelectElement {
  const sel = document.createElement("select");
  for (const key of THEME_COLOR_KEYS) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    if (key === value) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value as ThemeColorKey));
  return sel;
}

function check(
  label: string,
  value: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const wrap = el("label", "check");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  const cap = el("span");
  cap.textContent = label;
  wrap.append(input, cap);
  return wrap;
}
