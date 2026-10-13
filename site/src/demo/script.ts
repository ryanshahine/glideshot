// The scripted take: where the mouse goes, when it clicks, what gets typed.
// Paced like a real person: short, unhurried glides between nearby things, and real pauses.
// Story: select "Hero shot.png", rename it in place, check two other files, then rest.
import { FILES, nameX, rowY } from "./layout";

export const LOOP = 18; // seconds

type Glide = { from: number; to: number; x: number; y: number; arc: number };

const START = { x: nameX + 150, y: rowY(5) };
const HERO = { x: nameX + 60, y: rowY(2) };
const PITCH = { x: nameX + 80, y: rowY(8) };
const NOTES = { x: nameX + 50, y: rowY(3) };

// Each glide eases in and out (minimum-jerk, like a real hand) along a gentle arc.
const GLIDES: Glide[] = [
  { from: 1.2, to: 2.5, ...HERO, arc: 0.12 },
  { from: 6.6, to: 7.9, ...PITCH, arc: -0.12 },
  { from: 9.6, to: 10.9, ...NOTES, arc: 0.12 },
  { from: 16.6, to: 17.9, ...START, arc: -0.1 },
];

export const CLICKS = [
  { t: 2.8, ...HERO },
  { t: 8.2, ...PITCH },
  { t: 11.2, ...NOTES },
];

export const RENAME = { index: 2, from: "Hero shot", to: "Final hero", ext: ".png" };
const RENAME_START = 3.5; // Return: start renaming
const TYPE_START = 4.0;
const TYPE_STEP = 0.17;
const RENAME_END = 6.0; // Return: commit
const KEYS = [RENAME_START, ...[...RENAME.to].map((_, i) => TYPE_START + i * TYPE_STEP), RENAME_END];

const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10); // smootherstep ≈ minimum-jerk

export function mouseAt(t: number) {
  t = ((t % LOOP) + LOOP) % LOOP;
  let pos = { ...START };
  for (const g of GLIDES) {
    if (t <= g.from) break;
    const a = pos;
    const f = ease(Math.min(1, (t - g.from) / (g.to - g.from)));
    // Quadratic arc: the control point sits off the straight line by `arc` × distance.
    const dx = g.x - a.x, dy = g.y - a.y;
    const cx = (a.x + g.x) / 2 - dy * g.arc, cy = (a.y + g.y) / 2 + dx * g.arc;
    const u = 1 - f;
    pos = { x: u * u * a.x + 2 * u * f * cx + f * f * g.x, y: u * u * a.y + 2 * u * f * cy + f * f * g.y };
    if (t < g.to) break;
    pos = { x: g.x, y: g.y };
  }
  return pos;
}

export type ScreenState = {
  selected: number | null;
  query: string; // search field (unused by this story, kept for the layout)
  focused: boolean;
  renaming: boolean; // the name field is being edited
  renameTyped: string; // what has been typed so far ("" = original name still selected)
  renamed: boolean; // the new name is committed
};

export function screenAt(t: number): ScreenState {
  t = ((t % LOOP) + LOOP) % LOOP;
  let selected: number | null = null;
  if (t >= CLICKS[0].t) selected = 2;
  if (t >= CLICKS[1].t) selected = 8;
  if (t >= CLICKS[2].t) selected = 3;
  const typed = [...RENAME.to].filter((_, i) => TYPE_START + i * TYPE_STEP <= t).length;
  return {
    selected,
    query: "",
    focused: false,
    renaming: t >= RENAME_START && t < RENAME_END,
    renameTyped: RENAME.to.slice(0, typed),
    renamed: t >= RENAME_END,
  };
}

export function fileName(index: number, state: ScreenState) {
  return index === RENAME.index && state.renamed ? RENAME.to + RENAME.ext : FILES[index].name;
}

export function visibleFiles(query: string) {
  const q = query.toLowerCase();
  return FILES.map((f, i) => ({ ...f, index: i })).filter((f) => !q || f.name.toLowerCase().includes(q));
}

/** Script times in the half-open window (from, to], handling the loop wrap. */
function timesIn(times: number[], from: number, to: number) {
  const out: number[] = [];
  for (let k = Math.floor(from / LOOP); k <= Math.floor(to / LOOP); k++) {
    for (const t of times) {
      const abs = k * LOOP + t;
      if (abs > from && abs <= to) out.push(abs);
    }
  }
  return out;
}

export function activityBetween(from: number, to: number) {
  return timesIn(KEYS.concat(CLICKS.map((c) => c.t)), from, to).length > 0;
}

export function clicksBetween(from: number, to: number) {
  return timesIn(CLICKS.map((c) => c.t), from, to).map((abs) => {
    const local = ((abs % LOOP) + LOOP) % LOOP;
    const c = CLICKS.find((c) => Math.abs(c.t - local) < 1e-6)!;
    return { t: abs, x: c.x, y: c.y };
  });
}
