export type StatusKind = "poison" | "bleed" | "burn";

export type Status = {
  kind: StatusKind;
  turns: number;
};

export type StatusHost = {
  hp: number;
  statuses: Status[];
};

export const STATUS_TURNS: Record<StatusKind, number> = {
  poison: 4,
  bleed: 3,
  burn: 4,
};

export const STATUS_DMG: Record<StatusKind, number> = {
  poison: 1,
  bleed: 2,
  burn: 1,
};

const APPLY_LOG: Record<StatusKind, string> = {
  poison: "you are poisoned",
  bleed: "you start bleeding",
  burn: "you catch fire",
};

const TICK_LOG: Record<StatusKind, [string, string]> = {
  poison: ["the poison burns", "the poison fades"],
  bleed: ["you bleed", "the bleeding stops"],
  burn: ["the fire bites", "the fire dies"],
};

export function hasStatus(run: StatusHost, kind: StatusKind): boolean {
  return run.statuses.some((s) => s.kind === kind && s.turns > 0);
}

export function hasAnyStatus(run: StatusHost): boolean {
  return run.statuses.some((s) => s.turns > 0);
}

export function statusTurns(run: StatusHost, kind: StatusKind): number {
  return run.statuses.find((s) => s.kind === kind)?.turns ?? 0;
}

export function applyStatus(
  run: StatusHost,
  kind: StatusKind,
  turns = STATUS_TURNS[kind],
): string | null {
  const existing = run.statuses.find((s) => s.kind === kind);
  if (existing) {
    if (turns <= existing.turns) return null;
    existing.turns = turns;
    return APPLY_LOG[kind];
  }
  run.statuses.push({ kind, turns });
  return APPLY_LOG[kind];
}

export function clearStatus(run: StatusHost, kind: StatusKind): boolean {
  const before = run.statuses.length;
  run.statuses = run.statuses.filter((s) => s.kind !== kind);
  return run.statuses.length < before;
}

export function clearStatuses(run: StatusHost): boolean {
  if (!run.statuses.length) return false;
  run.statuses = [];
  return true;
}

export function tickStatuses(run: StatusHost): string[] {
  const logs: string[] = [];
  let dmg = 0;
  const next: Status[] = [];
  for (const s of run.statuses) {
    dmg += STATUS_DMG[s.kind];
    s.turns -= 1;
    const [tick, fade] = TICK_LOG[s.kind];
    logs.push(s.turns > 0 ? tick : fade);
    if (s.turns > 0) next.push(s);
  }
  run.statuses = next;
  if (dmg > 0) run.hp -= dmg;
  return logs;
}

export function describeStatuses(run: StatusHost): { kind: StatusKind; turns: number }[] {
  return run.statuses.filter((s) => s.turns > 0);
}
