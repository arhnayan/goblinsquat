import type { Run } from "./run";

const KEY = "goblinsquat-scores";
const KEEP = 8;

export type ScoreRow = {
  seed: number;
  gold: number;
  depth: number;
  score: number;
  won: boolean;
  at: number;
};

export function runScore(run: Run): number {
  return (
    run.gold +
    run.depth * 10 +
    (run.hasAmulet ? 50 : 0) +
    (run.status === "won" ? 200 : 0)
  );
}

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreRow[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) => r && typeof r.score === "number" && typeof r.seed === "number",
    );
  } catch {
    return [];
  }
}

export function recordScore(run: Run): ScoreRow[] {
  const row: ScoreRow = {
    seed: run.seed,
    gold: run.gold,
    depth: run.depth,
    score: runScore(run),
    won: run.status === "won",
    at: Date.now(),
  };
  const list = [...loadScores(), row].sort((a, b) => b.score - a.score);
  const top = list.slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* ignore quota */
  }
  return top;
}

export function formatScores(rows: ScoreRow[]): string {
  if (!rows.length) return "";
  const lines = ["scores"];
  for (const r of rows.slice(0, 5)) {
    const mark = r.won ? "out" : `D${r.depth}`;
    lines.push(`${r.score}  ${mark}  seed ${r.seed}`);
  }
  return lines.join("\n");
}
