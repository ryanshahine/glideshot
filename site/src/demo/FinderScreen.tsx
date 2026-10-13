import { memo } from "react";
import { COL, HEADER_H, MENU_H, ROW_H, SCREEN, SEARCH, SIDEBAR_W, TOOLBAR_H, WIN, type FileKind } from "./layout";
import { fileName, visibleFiles, type ScreenState } from "./script";

/** A Finder-like Mac screen, drawn with plain DOM at a fixed 1440×900 size. */
export const FinderScreen = memo(function FinderScreen(state: ScreenState) {
  const { selected, query, focused } = state;
  const files = visibleFiles(query);
  return (
    <div
      className="absolute inset-0 overflow-hidden text-[#1d1d1f] select-none"
      style={{ width: SCREEN.w, height: SCREEN.h, letterSpacing: "-0.01em", background: WALLPAPER }}
    >
      <MenuBar />
      <DesktopIcons />
      <Dock />
      <div
        className="absolute overflow-hidden rounded-[12px] bg-white"
        style={{
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN.h,
          boxShadow: "0 0 0 1px rgba(0,0,0,.08), 0 20px 50px rgba(0,0,0,.18)",
        }}
      >
        <Sidebar />
        <Toolbar query={query} focused={focused} />

        {/* Column headers */}
        <div
          className="absolute right-0 flex items-center border-b border-[#e8e8ea] text-[13px] text-[#7a7a7a]"
          style={{ left: SIDEBAR_W, top: TOOLBAR_H, height: HEADER_H }}
        >
          <span className="absolute" style={{ left: COL.name - SIDEBAR_W }}>Name</span>
          <span className="absolute" style={{ left: COL.date - SIDEBAR_W }}>Date Modified</span>
          <span className="absolute text-right" style={{ left: COL.sizeRight - SIDEBAR_W - 80, width: 80 }}>Size</span>
          <span className="absolute" style={{ left: COL.kind - SIDEBAR_W }}>Kind</span>
        </div>

        {/* Rows */}
        {files.map((f, n) => {
          const isSelected = selected === f.index;
          return (
            <div
              key={f.name}
              className="absolute right-[10px] flex items-center rounded-[6px] text-[15px]"
              style={{
                left: SIDEBAR_W + 10,
                top: TOOLBAR_H + HEADER_H + n * ROW_H,
                height: ROW_H,
                background: isSelected ? "#0071e3" : n % 2 ? "#f5f5f7" : "transparent",
                color: isSelected ? "#fff" : undefined,
              }}
            >
              <span className="absolute flex items-center gap-[10px]" style={{ left: COL.name - SIDEBAR_W - 10 }}>
                <FileIcon kind={f.icon} />
                <span>{state.renaming && f.index === 2 ? `${state.renameTyped || "Hero shot"}.png` : fileName(f.index, state)}</span>
              </span>
              <span className="absolute" style={{ left: COL.date - SIDEBAR_W - 10, opacity: isSelected ? 0.9 : 0.6 }}>
                {f.date}
              </span>
              <span
                className="absolute text-right tabular-nums"
                style={{ left: COL.sizeRight - SIDEBAR_W - 10 - 120, width: 120, opacity: isSelected ? 0.9 : 0.6 }}
              >
                {f.size}
              </span>
              <span className="absolute" style={{ left: COL.kind - SIDEBAR_W - 10, opacity: isSelected ? 0.9 : 0.6 }}>
                {f.kind}
              </span>
            </div>
          );
        })}

        {/* Status bar */}
        <div
          className="absolute right-0 bottom-0 flex h-[30px] items-center justify-center border-t border-[#e8e8ea] text-[12px] text-[#7a7a7a]"
          style={{ left: SIDEBAR_W }}
        >
          {files.length} item{files.length === 1 ? "" : "s"}, 1,24 TB available
        </div>
      </div>
    </div>
  );
});

// A macOS-style wallpaper (product imagery, so a gradient is fine here).
const WALLPAPER = [
  "radial-gradient(ellipse 70% 60% at 15% 10%, #7fb2ff 0%, transparent 60%)",
  "radial-gradient(ellipse 60% 70% at 90% 85%, #c39bff 0%, transparent 60%)",
  "radial-gradient(ellipse 50% 50% at 75% 20%, #ffb3d1 0%, transparent 55%)",
  "linear-gradient(160deg, #3d6fe0 0%, #5a4fcf 55%, #8e63d8 100%)",
].join(", ");

function DesktopIcons() {
  const items: { label: string; kind: FileKind; y: number }[] = [
    { label: "Projects", kind: "folder", y: 64 },
    { label: "Screenshot 2026-10-13", kind: "png", y: 170 },
    { label: "Invoice.pdf", kind: "pdf", y: 276 },
  ];
  return (
    <>
      {items.map((it) => (
        <div key={it.label} className="absolute flex w-[110px] flex-col items-center gap-[6px]" style={{ left: 1310, top: it.y }}>
          <img src={`/macos/file-${it.kind}.png`} alt="" width={64} height={64} draggable={false} />
          <span className="rounded-[4px] px-[4px] text-center text-[12px] leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,.45)]">
            {it.label}
          </span>
        </div>
      ))}
    </>
  );
}

const DOCK = ["finder", "apps", "safari", "messages", "mail", "maps", "photos", "facetime", "calendar", "notes", "music", "appstore", "settings"];
const RUNNING = new Set(["finder", "safari", "messages", "notes"]);

function Dock() {
  const icon = 58, gap = 4, pad = 8, sep = 18;
  const width = pad * 2 + (DOCK.length + 1) * icon + DOCK.length * gap + sep;
  return (
    <div
      className="absolute flex items-center rounded-[24px] border border-white/45 bg-white/30 backdrop-blur-xl"
      style={{ left: SCREEN.w / 2 - width / 2, top: SCREEN.h - 82, height: 74, padding: `0 ${pad}px`, gap }}
    >
      {DOCK.map((app) => (
        <span key={app} className="relative flex flex-col items-center">
          <img src={`/macos/app-${app}.png`} alt="" width={icon} height={icon} draggable={false} />
          {RUNNING.has(app) && <span className="absolute -bottom-[5px] h-[4px] w-[4px] rounded-full bg-black/60" />}
        </span>
      ))}
      <span className="h-[50px] w-px bg-black/15" style={{ margin: `0 ${(sep - 1) / 2}px` }} />
      <img src="/macos/app-trash.png" alt="" width={icon} height={icon} draggable={false} />
    </div>
  );
}

function MenuBar() {
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center gap-[22px] bg-white/55 px-[18px] text-[14px] backdrop-blur-xl"
      style={{ height: MENU_H }}
    >
      <svg width="14" height="17" viewBox="0 0 14 17" fill="#1d1d1f" aria-hidden>
        <path d="M11.6 9c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7C3.4 4.4 2.1 5.2 1.4 6.5 0 9 1 12.7 2.4 14.7c.7 1 1.5 2 2.5 2 1 0 1.4-.7 2.6-.7s1.6.7 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2-.8-2-3.3ZM9.6 3.2c.6-.7 1-1.6.9-2.6-.8 0-1.8.6-2.4 1.3-.5.6-1 1.6-.9 2.5.9.1 1.8-.5 2.4-1.2Z" />
      </svg>
      <span className="font-semibold">Finder</span>
      {["File", "Edit", "View", "Go", "Window", "Help"].map((m) => (
        <span key={m}>{m}</span>
      ))}
      <span className="ml-auto">Tue 13 Oct 14:32</span>
    </div>
  );
}

function Sidebar() {
  const group = (title: string, items: [string, string][], active?: string) => (
    <div className="mb-[18px]">
      <div className="mb-[6px] px-[18px] text-[11px] font-semibold text-[#9a9a9f]">{title}</div>
      {items.map(([label, glyph]) => (
        <div
          key={label}
          className="mx-[10px] flex h-[30px] items-center gap-[8px] rounded-[6px] px-[8px] text-[14px]"
          style={{ background: label === active ? "rgba(0,0,0,.07)" : undefined }}
        >
          <img src={`/macos/side-${glyph}.png`} alt="" width={17} height={17} draggable={false} />
          {label}
        </div>
      ))}
    </div>
  );
  return (
    <div className="absolute top-0 bottom-0 left-0 bg-[#f5f5f7]" style={{ width: SIDEBAR_W }}>
      <div className="flex gap-[8px] px-[18px] pt-[18px] pb-[26px]">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} className="h-[12px] w-[12px] rounded-full" style={{ background: c }} />
        ))}
      </div>
      {group(
        "Favorites",
        [
          ["Recents", "recents"],
          ["Applications", "applications"],
          ["Desktop", "desktop"],
          ["Documents", "documents"],
          ["Downloads", "downloads"],
          ["Launch assets", "folder"],
        ],
        "Launch assets",
      )}
      {group("iCloud", [
        ["iCloud Drive", "icloud"],
        ["Shared", "shared"],
      ])}
      {group("Locations", [
        ["Macintosh HD", "drive"],
        ["Network", "network"],
      ])}
    </div>
  );
}

function Toolbar({ query, focused }: { query: string; focused: boolean }) {
  return (
    <div className="absolute right-0 top-0" style={{ left: SIDEBAR_W, height: TOOLBAR_H }}>
      <div className="absolute top-0 flex h-full items-center gap-[14px] text-[#7a7a7a]" style={{ left: 20 }}>
        <span className="text-[20px] leading-none">‹</span>
        <span className="text-[20px] leading-none opacity-40">›</span>
        <span className="ml-[6px] text-[16px] font-semibold text-[#1d1d1f]">Launch assets</span>
      </div>
      <div
        className="absolute flex items-center gap-[8px] rounded-[8px] px-[10px] text-[14px]"
        style={{
          left: SEARCH.x - SIDEBAR_W,
          top: SEARCH.y,
          width: SEARCH.w,
          height: SEARCH.h,
          background: "#f0f0f2",
          boxShadow: focused ? "0 0 0 3px rgba(0,113,227,.45)" : undefined,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#7a7a7a" strokeWidth="1.6" aria-hidden>
          <circle cx="5.5" cy="5.5" r="4.3" />
          <path d="m8.7 8.7 3.3 3.3" strokeLinecap="round" />
        </svg>
        {query ? <span>{query}</span> : <span className="text-[#9a9a9f]">{focused ? "" : "Search"}</span>}
        {focused && <span className="-ml-[6px] h-[17px] w-[1.5px] animate-pulse bg-[#0071e3]" />}
      </div>
    </div>
  );
}

function FileIcon({ kind }: { kind: FileKind }) {
  return <img src={`/macos/file-${kind}.png`} alt="" width={24} height={24} draggable={false} />;
}
