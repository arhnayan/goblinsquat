export type ThemeName = "ember" | "phosphor" | "rime" | "kiln";

export type ThemeColors = {
  void: number;
  floor: number;
  wall: number;
  door: number;
  water: number;
  player: number;
  goblin: number;
  rat: number;
  ogre: number;
  demon: number;
  stairs: number;
  title: number;
  potion: number;
  weapon: number;
  gold: number;
  amulet: number;
  sun: number;
  sky: number;
  ink: number;
};

export type Theme = {
  name: ThemeName;
  colors: ThemeColors;
};

const THEMES: Record<ThemeName, ThemeColors> = {
  ember: {
    void: 0x1c1812,
    floor: 0xe8d4b4,
    wall: 0xb45a38,
    door: 0x7a3a28,
    water: 0x4a8a78,
    player: 0xffcc55,
    goblin: 0xc8a878,
    rat: 0xb09068,
    ogre: 0x8a6440,
    demon: 0x8a4038,
    stairs: 0xc07850,
    title: 0xf0dcc0,
    potion: 0x8aaa70,
    weapon: 0xd0b8a8,
    gold: 0xf0c878,
    amulet: 0xffcc55,
    sun: 0xffecd4,
    sky: 0x6a5848,
    ink: 0xf0dcc0,
  },
  phosphor: {
    void: 0x101610,
    floor: 0xb8d4a8,
    wall: 0x3a7a48,
    door: 0x2a5034,
    water: 0x2a6a58,
    player: 0xa8ff70,
    goblin: 0x6aaa62,
    rat: 0x5a8a58,
    ogre: 0x4a7048,
    demon: 0x3a6040,
    stairs: 0x5a9a68,
    title: 0xc8e8b8,
    potion: 0x7ad070,
    weapon: 0xa8c8a0,
    gold: 0xc8e878,
    amulet: 0xa8ff70,
    sun: 0xdcffc8,
    sky: 0x2a4a30,
    ink: 0xc8e8b8,
  },
  rime: {
    void: 0x161c24,
    floor: 0xe4ecf4,
    wall: 0x5a6e80,
    door: 0x3e4c5a,
    water: 0x3a7088,
    player: 0x9ee8ff,
    goblin: 0x9ab0b8,
    rat: 0x7a8a98,
    ogre: 0x647888,
    demon: 0x5a4860,
    stairs: 0x7a90a4,
    title: 0xe4ecf4,
    potion: 0x6aa8c0,
    weapon: 0xc8d0d8,
    gold: 0xe8f0f8,
    amulet: 0x9ee8ff,
    sun: 0xf0f6ff,
    sky: 0x3a4858,
    ink: 0xe4ecf4,
  },
  kiln: {
    void: 0x1a1010,
    floor: 0xecc0a8,
    wall: 0xb03028,
    door: 0x701818,
    water: 0x3a5860,
    player: 0xff7030,
    goblin: 0xc07058,
    rat: 0xa85848,
    ogre: 0x8a4038,
    demon: 0x801818,
    stairs: 0xc05040,
    title: 0xf0c8b0,
    potion: 0xc07058,
    weapon: 0xd8a898,
    gold: 0xf0b060,
    amulet: 0xff7030,
    sun: 0xffd8b8,
    sky: 0x5a3024,
    ink: 0xf0c8b0,
  },
};

const ORDER: ThemeName[] = ["ember", "phosphor", "rime", "kiln"];

let currentName: ThemeName = "ember";

export function hexCss(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function getTheme(): Theme {
  return { name: currentName, colors: THEMES[currentName] };
}

export function getColors(): ThemeColors {
  return THEMES[currentName];
}

export function applyCssVars(): void {
  const c = THEMES[currentName];
  const root = document.documentElement;
  root.style.setProperty("--void", hexCss(c.void));
  root.style.setProperty("--ink", hexCss(c.ink));
  root.style.setProperty("--accent", hexCss(c.player));
}

export function setTheme(name: ThemeName): Theme {
  currentName = name;
  applyCssVars();
  return getTheme();
}

export function cycleTheme(): Theme {
  const i = ORDER.indexOf(currentName);
  currentName = ORDER[(i + 1) % ORDER.length]!;
  applyCssVars();
  return getTheme();
}
