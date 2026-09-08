import type { Run } from "./run";
import { getTheme } from "./theme";

export type Hud = {
  log: (msg: string) => void;
  refresh: (run: Run) => void;
  overlay: (text: string | null) => void;
  clearLog: () => void;
};

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
  const lines: string[] = [];

  hint.textContent = "WASD  . wait  q quaff  F pixel  C palette";

  const log = (msg: string) => {
    lines.push(msg);
    while (lines.length > 4) lines.shift();
    logBox.innerHTML = lines.map((l) => esc(l)).join("<br>");
  };

  const refresh = (run: Run) => {
    const am = run.hasAmulet ? "  *" : "";
    const w = run.weapon ? `  ${run.weapon}` : "";
    status.textContent = `HP ${run.hp}/${run.maxHp}  ATK ${run.atk}  D${run.depth}  $${run.gold}  p${run.potions}${am}${w}  ${getTheme().name}`;
  };

  const overlay = (text: string | null) => {
    if (!text) {
      overlayBox.hidden = true;
      overlayBox.textContent = "";
      return;
    }
    overlayBox.hidden = false;
    overlayBox.textContent = text;
  };

  const clearLog = () => {
    lines.length = 0;
    logBox.textContent = "";
  };

  return { log, refresh, overlay, clearLog };
}
