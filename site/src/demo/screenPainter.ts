// Paints the fake Mac screen into a canvas (used as a GPU texture). Same layout as FinderScreen.tsx.
import { COL, HEADER_H, MENU_H, ROW_H, SCREEN, SEARCH, SIDEBAR_W, TOOLBAR_H, WIN, type FileKind } from "./layout";
import { fileName, RENAME, visibleFiles, type ScreenState } from "./script";

const FONT = `"Inter Variable", Inter, system-ui, -apple-system, sans-serif`;
const INK = "#1d1d1f";

// Built on first use: Path2D only exists in the browser (the page is also rendered at build time).
let applePath: Path2D | undefined;
let arrowPath: Path2D | undefined;
const APPLE = () => (applePath ??= new Path2D(
  "M11.6 9c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7C3.4 4.4 2.1 5.2 1.4 6.5 0 9 1 12.7 2.4 14.7c.7 1 1.5 2 2.5 2 1 0 1.4-.7 2.6-.7s1.6.7 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2-.8-2-3.3ZM9.6 3.2c.6-.7 1-1.6.9-2.6-.8 0-1.8.6-2.4 1.3-.5.6-1 1.6-.9 2.5.9.1 1.8-.5 2.4-1.2Z",
));
const ARROW = () => (arrowPath ??= new Path2D("M4 3v24.5l6.3-6.1 4 9.4 4.2-1.8-4-9.2h8.7Z"));

const DOCK = ["finder", "apps", "safari", "messages", "mail", "maps", "photos", "facetime", "calendar", "notes", "music", "appstore", "settings"];
const RUNNING = new Set(["finder", "safari", "messages", "notes"]);
const FILE_KINDS: FileKind[] = ["folder", "mp4", "png", "txt", "xlsx", "pdf", "mov", "key", "md", "zip", "m4a", "heic"];
const SIDEBAR: [string, [string, string][], string?][] = [
  ["Favorites", [["Recents", "recents"], ["Applications", "applications"], ["Desktop", "desktop"], ["Documents", "documents"], ["Downloads", "downloads"], ["Launch assets", "folder"]], "Launch assets"],
  ["iCloud", [["iCloud Drive", "icloud"], ["Shared", "shared"]]],
  ["Locations", [["Macintosh HD", "drive"], ["Network", "network"]]],
];
const DESKTOP: { label: string; kind: FileKind; y: number }[] = [
  { label: "Projects", kind: "folder", y: 64 },
  { label: "Screenshot 2026-10-13", kind: "png", y: 170 },
  { label: "Invoice.pdf", kind: "pdf", y: 276 },
];

export type Assets = Map<string, HTMLImageElement>;

export async function loadAssets(): Promise<Assets> {
  const names = [
    ...FILE_KINDS.map((k) => `file-${k}`),
    ...DOCK.map((a) => `app-${a}`),
    "app-trash",
    ...SIDEBAR.flatMap(([, items]) => items.map(([, g]) => `side-${g}`)),
  ];
  await Promise.all([document.fonts.load(`400 15px ${FONT}`), document.fonts.load(`600 15px ${FONT}`)]).catch(() => {});
  const images = await Promise.all(
    names.map(async (name) => {
      const img = new Image();
      // The load event (unlike decode()) also fires in background tabs.
      await new Promise((resolve) => {
        img.onload = img.onerror = resolve;
        img.src = `/macos/${name}.png`;
      });
      return [name, img] as const;
    }),
  );
  return new Map(images);
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Paints the whole screen at `scale` texels per screen pixel. Returns where the text caret goes. */
export function paintScreen(canvas: HTMLCanvasElement, scale: number, state: ScreenState, assets: Assets): Rect | null {
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "middle";
  wallpaper(ctx);
  menuBar(ctx);
  desktopIcons(ctx, assets, scale);
  dock(ctx, assets);
  return finderWindow(ctx, state, assets, scale);
}

/** The arrow cursor at 5×, hot spot at (4, 3) in its 24×34 box. */
export function paintCursor(): HTMLCanvasElement {
  const k = 5;
  const canvas = document.createElement("canvas");
  canvas.width = 24 * k;
  canvas.height = 34 * k;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(k, k);
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 1.5 * k;
  ctx.shadowOffsetY = 1 * k;
  ctx.fillStyle = "#000";
  ctx.fill(ARROW());
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  ctx.stroke(ARROW());
  ctx.fill(ARROW());
  return canvas;
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 400,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

function ellipseGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rgb: string, stop: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(stop, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-cx / rx, -cy / ry, SCREEN.w / rx, SCREEN.h / ry);
  ctx.restore();
}

function wallpaper(ctx: CanvasRenderingContext2D) {
  const a = (160 * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const len = Math.abs(SCREEN.w * dx) + Math.abs(SCREEN.h * dy);
  const cx = SCREEN.w / 2, cy = SCREEN.h / 2;
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  g.addColorStop(0, "#3d6fe0");
  g.addColorStop(0.55, "#5a4fcf");
  g.addColorStop(1, "#8e63d8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
  ellipseGlow(ctx, SCREEN.w * 0.15, SCREEN.h * 0.1, SCREEN.w * 0.7, SCREEN.h * 0.6, "127,178,255", 0.6);
  ellipseGlow(ctx, SCREEN.w * 0.9, SCREEN.h * 0.85, SCREEN.w * 0.6, SCREEN.h * 0.7, "195,155,255", 0.6);
  ellipseGlow(ctx, SCREEN.w * 0.75, SCREEN.h * 0.2, SCREEN.w * 0.5, SCREEN.h * 0.5, "255,179,209", 0.55);
}

function menuBar(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillRect(0, 0, SCREEN.w, MENU_H);
  ctx.save();
  ctx.translate(18, (MENU_H - 17) / 2);
  ctx.fillStyle = INK;
  ctx.fill(APPLE());
  ctx.restore();
  let x = 18 + 14 + 22;
  const mid = MENU_H / 2;
  for (const [label, weight] of [["Finder", 600], ["File", 400], ["Edit", 400], ["View", 400], ["Go", 400], ["Window", 400], ["Help", 400]] as const) {
    text(ctx, label, x, mid, 14, INK, weight);
    x += ctx.measureText(label).width + 22;
  }
  text(ctx, "Tue 13 Oct 14:32", SCREEN.w - 18, mid, 14, INK, 400, "right");
}

function desktopIcons(ctx: CanvasRenderingContext2D, assets: Assets, scale: number) {
  for (const it of DESKTOP) {
    const img = assets.get(`file-${it.kind}`);
    if (img) ctx.drawImage(img, 1310 + 23, it.y, 64, 64);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 2 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.font = `400 12px ${FONT}`;
    const lines: string[] = [];
    let line = "";
    for (const word of it.label.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > 106 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    lines.forEach((l, i) => text(ctx, l, 1310 + 55, it.y + 64 + 14 + i * 14, 12, "#fff", 400, "center"));
    ctx.restore();
  }
}

function dock(ctx: CanvasRenderingContext2D, assets: Assets) {
  const icon = 58, gap = 4, pad = 8, sep = 18;
  const width = pad * 2 + (DOCK.length + 1) * icon + DOCK.length * gap + sep;
  const left = SCREEN.w / 2 - width / 2, top = SCREEN.h - 82, height = 74;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 24);
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
  let x = left + pad;
  const iy = top + (height - icon) / 2;
  for (const app of DOCK) {
    const img = assets.get(`app-${app}`);
    if (img) ctx.drawImage(img, x, iy, icon, icon);
    if (RUNNING.has(app)) {
      ctx.beginPath();
      ctx.arc(x + icon / 2, iy + icon + 3, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fill();
    }
    x += icon + gap;
  }
  ctx.fillStyle = "rgba(0,0,0,.15)";
  ctx.fillRect(x + (sep - 1) / 2 - gap / 2, top + (height - 50) / 2, 1, 50);
  x += sep;
  const trash = assets.get("app-trash");
  if (trash) ctx.drawImage(trash, x, iy, icon, icon);
}

function finderWindow(ctx: CanvasRenderingContext2D, state: ScreenState, assets: Assets, scale: number): Rect | null {
  const { x, y, w, h } = WIN;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.18)";
  ctx.shadowBlur = 50 * scale;
  ctx.shadowOffsetY = 20 * scale;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.clip();

  // Sidebar
  ctx.fillStyle = "#f5f5f7";
  ctx.fillRect(x, y, SIDEBAR_W, h);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(x + 24 + i * 20, y + 24, 6, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  let gy = y + 56;
  for (const [title, items, active] of SIDEBAR) {
    text(ctx, title, x + 18, gy + 7, 11, "#9a9a9f", 600);
    gy += 20;
    for (const [label, glyph] of items) {
      if (label === active) {
        ctx.beginPath();
        ctx.roundRect(x + 10, gy, SIDEBAR_W - 20, 30, 6);
        ctx.fillStyle = "rgba(0,0,0,.07)";
        ctx.fill();
      }
      const img = assets.get(`side-${glyph}`);
      if (img) ctx.drawImage(img, x + 18, gy + 6.5, 17, 17);
      text(ctx, label, x + 43, gy + 15, 14, INK);
      gy += 30;
    }
    gy += 18;
  }

  // Toolbar
  const tx = x + SIDEBAR_W;
  text(ctx, "‹", tx + 20, y + TOOLBAR_H / 2, 22, "#7a7a7a");
  text(ctx, "›", tx + 38, y + TOOLBAR_H / 2, 22, "rgba(122,122,122,.4)");
  text(ctx, "Launch assets", tx + 62, y + TOOLBAR_H / 2, 16, INK, 600);

  const sx = x + SEARCH.x, sy = y + SEARCH.y, mid = sy + SEARCH.h / 2;
  if (state.focused) {
    ctx.beginPath();
    ctx.roundRect(sx - 1.5, sy - 1.5, SEARCH.w + 3, SEARCH.h + 3, 9.5);
    ctx.strokeStyle = "rgba(0,113,227,.45)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.roundRect(sx, sy, SEARCH.w, SEARCH.h, 8);
  ctx.fillStyle = "#f0f0f2";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + 15.5, mid - 1, 4.3, 0, Math.PI * 2);
  ctx.moveTo(sx + 18.7, mid + 2.2);
  ctx.lineTo(sx + 22, mid + 5.5);
  ctx.strokeStyle = "#7a7a7a";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.stroke();
  let caret: Rect | null = null;
  if (state.query) text(ctx, state.query, sx + 31, mid, 14, INK);
  else if (!state.focused) text(ctx, "Search", sx + 31, mid, 14, "#9a9a9f");
  if (state.focused) {
    ctx.font = `400 14px ${FONT}`;
    const cx = sx + 31 + (state.query ? ctx.measureText(state.query).width + 1 : 0);
    caret = { x: cx, y: mid - 8.5, w: 1.5, h: 17 };
  }

  // Column headers
  const hy = y + TOOLBAR_H;
  for (const [label, cx, align] of [
    ["Name", x + COL.name, "left"],
    ["Date Modified", x + COL.date, "left"],
    ["Size", x + COL.sizeRight, "right"],
    ["Kind", x + COL.kind, "left"],
  ] as const) {
    text(ctx, label, cx, hy + HEADER_H / 2, 13, "#7a7a7a", 400, align);
  }
  ctx.fillStyle = "#e8e8ea";
  ctx.fillRect(tx, hy + HEADER_H - 1, w - SIDEBAR_W, 1);

  // Rows
  const files = visibleFiles(state.query);
  files.forEach((f, n) => {
    const ry = hy + HEADER_H + n * ROW_H;
    const selected = state.selected === f.index;
    if (selected || n % 2) {
      ctx.beginPath();
      ctx.roundRect(tx + 10, ry, w - SIDEBAR_W - 20, ROW_H, 6);
      ctx.fillStyle = selected ? "#0071e3" : "#f5f5f7";
      ctx.fill();
    }
    const img = assets.get(`file-${f.icon}`);
    if (img) ctx.drawImage(img, x + COL.name, ry + (ROW_H - 24) / 2, 24, 24);
    const mid = ry + ROW_H / 2;
    const dim = selected ? "rgba(255,255,255,.9)" : "rgba(29,29,31,.6)";
    const nx = x + COL.name + 34;
    if (f.index === RENAME.index && state.renaming) {
      // Finder's inline rename field: the base name starts selected, typing replaces it.
      const base = state.renameTyped || RENAME.from;
      ctx.font = `400 15px ${FONT}`;
      const baseW = ctx.measureText(base).width, full = ctx.measureText(base + RENAME.ext).width;
      ctx.beginPath();
      ctx.roundRect(nx - 5, ry + 6, full + 12, ROW_H - 12, 4);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,113,227,.55)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (!state.renameTyped) {
        ctx.fillStyle = "#b3d7ff";
        ctx.fillRect(nx - 1, ry + 10, baseW + 2, ROW_H - 20);
      } else {
        caret = { x: nx + baseW + 0.5, y: mid - 8.5, w: 1.5, h: 17 };
      }
      text(ctx, base + RENAME.ext, nx, mid, 15, INK);
    } else {
      text(ctx, fileName(f.index, state), nx, mid, 15, selected ? "#fff" : INK);
    }
    text(ctx, f.date, x + COL.date, mid, 15, dim);
    text(ctx, f.size, x + COL.sizeRight, mid, 15, dim, 400, "right");
    text(ctx, f.kind, x + COL.kind, mid, 15, dim);
  });

  // Status bar
  const by = y + h - 30;
  ctx.fillStyle = "#e8e8ea";
  ctx.fillRect(tx, by, w - SIDEBAR_W, 1);
  text(ctx, `${files.length} item${files.length === 1 ? "" : "s"}, 1,24 TB available`, tx + (w - SIDEBAR_W) / 2, by + 15, 12, "#7a7a7a", 400, "center");

  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.strokeStyle = "rgba(0,0,0,.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  return caret;
}
