import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CompactControls, WideControls, type Setter } from "./Controls";
import { DEFAULT_LOOK, PRESETS, type Aspect, type Look } from "./demo/director";
import { TiltDemo } from "./demo/TiltDemo";
import { AuthorCredit, DownloadButton, SiteHeader, useRepoStats } from "./site/chrome";

/**
 * Everything fits one screen: text on top, the stage takes the remaining height, one bar below.
 * Also rendered at build time (see prerender.tsx), so nothing may touch `window` during the first render.
 */
export default function App() {
  const [look, setLook] = useState<Look>(() => defaultLook(matches("(min-width: 768px)")));
  const aspectChosen = useRef(false); // once someone picks a format, stop adapting it to the screen
  const [adjusting, setAdjusting] = useState(false);
  const [toast, setToast] = useState(false);
  const [inset, setInset] = useState({ right: 0, bottom: 0 });
  const wide = useMediaQuery("(min-width: 768px)");
  const stats = useRepoStats();
  const set: Setter = (key) => (value) => {
    if (key === "aspect") aspectChosen.current = true;
    setLook((l) => ({ ...l, [key]: value }));
  };

  // Phones default to a square stage, wider screens to "Fit" (until a format is picked by hand).
  useEffect(() => {
    if (!aspectChosen.current) setLook((l) => ({ ...l, aspect: defaultLook(wide).aspect }));
  }, [wide]);
  const active = PRESETS.find((p) =>
    Object.entries(p.look).every(([k, v]) => {
      const current = look[k as keyof Look];
      return typeof v === "number" ? Math.abs((current as number) - v) < 1e-6 : current === v;
    }),
  )?.name;

  useEffect(() => {
    if (!adjusting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAdjusting(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adjusting]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 12000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-white">
      <SiteHeader stats={stats} />

      <section className="shrink-0 px-5 pt-[clamp(4px,2.4vh,28px)] text-center">
        <h1
          className="mx-auto max-w-[880px] font-semibold text-balance"
          style={{ fontSize: "clamp(28px, min(6vw, 6.2vh), 56px)", lineHeight: 1.07, letterSpacing: "-0.015em" }}
        >
          Screen recordings, shot like film.
        </h1>
        <p
          className="mx-auto mt-[clamp(6px,1.4vh,14px)] max-w-[560px] text-balance text-ink-48"
          style={{ fontSize: "clamp(15px, min(2.4vw, 2.5vh), 21px)", lineHeight: 1.38 }}
        >
          A Mac screen recorder with a virtual camera that tilts, zooms and follows your cursor. You can change the angle, focus and blur after recording.
        </p>
        <div className="mt-[clamp(10px,2.4vh,26px)] flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <DownloadButton onClick={() => setToast(true)} />
          <a href="/install/" className="text-[17px] text-primary hover:underline">
            How to install <span aria-hidden>›</span>
          </a>
        </div>
        <p className="mt-[clamp(6px,1.2vh,12px)] fine-print text-ink-48">Free and open source · macOS 14+ · Apple silicon</p>
      </section>

      <Stage
        aspect={look.aspect}
        reserveRight={adjusting && wide ? PANEL_W + PANEL_GAP : 0}
        className="mt-[clamp(10px,2.6vh,30px)]"
        overlay={(geometry) =>
          adjusting && (
            <AdjustPanel
              geometry={geometry}
              look={look}
              set={set}
              onReset={() => {
                aspectChosen.current = false;
                setLook(defaultLook(wide));
              }}
              onClose={() => setAdjusting(false)}
              onCover={setInset}
            />
          )
        }
      >
        <TiltDemo
          look={look}
          inset={adjusting ? inset : { right: 0, bottom: 0 }}
          className="h-full w-full"
          label="Live Glideshot demo: a tilted Mac screen with shallow depth of field, filmed by a camera that follows the cursor."
        />
      </Stage>

      <div className="mx-auto flex w-full max-w-[1200px] shrink-0 items-center justify-center gap-2 px-5 pt-[clamp(10px,2vh,20px)] pb-[clamp(6px,1.2vh,12px)]">
        <div className="flex min-w-0 overflow-x-auto rounded-full bg-parchment p-[3px] [scrollbar-width:none]" role="group" aria-label="Looks">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setLook((l) => ({ ...l, ...p.look }))}
              aria-pressed={active === p.name}
              className={`shrink-0 rounded-full px-[14px] py-[6px] caption transition-all ${
                active === p.name ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,.14)]" : "text-ink-48 hover:text-ink"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAdjusting((a) => !a)}
          aria-expanded={adjusting}
          className={`press flex shrink-0 items-center gap-[6px] rounded-full border px-[14px] py-[6px] caption transition-colors ${
            adjusting ? "border-ink bg-ink text-white" : "border-hairline text-ink hover:border-ink-48"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M2 4h7M13 4h1M2 12h1M7 12h7" />
            <circle cx="11" cy="4" r="2" />
            <circle cx="5" cy="12" r="2" />
          </svg>
          Adjust
        </button>
      </div>

      <p className="shrink-0 pb-[clamp(8px,1.6vh,16px)] text-center fine-print text-ink-48">
        <AuthorCredit />
      </p>

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-5 left-1/2 z-50 w-max max-w-[92vw] -translate-x-1/2 rounded-[14px] bg-ink/90 px-4 py-[10px] text-center caption text-white backdrop-blur-xl transition-all duration-300 ${
          toast ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        {toast && (
          <>
            Downloading Glideshot. macOS blocks the first launch (it isn't notarized yet).{" "}
            <a href="/install/" className="font-semibold text-primary-on-dark hover:underline">
              Here's how to open it
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function defaultLook(wide: boolean): Look {
  return { ...DEFAULT_LOOK, aspect: wide ? DEFAULT_LOOK.aspect : "1:1" };
}

const RATIOS: Record<Exclude<Aspect, "auto">, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5 };

type Geometry = { area: { w: number; h: number }; stage: { x: number; y: number; w: number; h: number } };

/**
 * Fills the remaining height: any shape between 0.8 and 2 for "Fit", or exactly the chosen format.
 * `overlay` is drawn over the whole area (not clipped by the stage), e.g. the Adjust panel.
 */
function Stage({
  aspect,
  children,
  overlay,
  reserveRight = 0,
  className = "",
}: {
  aspect: Aspect;
  children: ReactNode;
  overlay?: (geometry: Geometry) => ReactNode;
  /** Room wanted on the right (an open panel): a narrow stage slides left to make space. */
  reserveRight?: number;
  className?: string;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = area.current!;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  let geometry: Geometry | null = null;
  if (box) {
    let { w, h } = box;
    if (aspect === "auto") {
      if (w / h > 2) w = h * 2;
      if (w / h < 0.8) h = w / 0.8;
    } else {
      const r = RATIOS[aspect];
      if (w / h > r) w = h * r;
      else h = w / r;
    }
    w = Math.floor(w);
    h = Math.floor(h);
    const fitsBeside = reserveRight > 0 && w + reserveRight <= box.w;
    const x = fitsBeside ? (box.w - w - reserveRight) / 2 : (box.w - w) / 2;
    geometry = { area: box, stage: { x: Math.round(x), y: Math.round((box.h - h) / 2), w, h } };
  }

  return (
    <div className={`relative mx-auto w-full max-w-[1200px] min-h-0 flex-1 ${className}`}>
      <div ref={area} className="absolute inset-y-0 inset-x-5">
        {geometry && (
          <>
            <div
              className="absolute overflow-hidden rounded-lg transition-all duration-500 ease-[cubic-bezier(.2,.7,.2,1)]"
              style={{ left: geometry.stage.x, top: geometry.stage.y, width: geometry.stage.w, height: geometry.stage.h }}
            >
              {children}
            </div>
            {overlay?.(geometry)}
          </>
        )}
      </div>
    </div>
  );
}

/** `false` while rendering at build time. */
const matches = (query: string) => typeof window !== "undefined" && window.matchMedia(query).matches;

function useMediaQuery(query: string) {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setValue(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return value;
}

const PANEL_W = 340;
const PANEL_GAP = 16;

/**
 * The Adjust panel. Desktop: beside the stage when there's room (narrow formats), otherwise over its
 * right edge, never past the page. Phones: a compact strip across the full width at the stage's bottom.
 * Reports how much of the stage it covers, so the camera can center on the rest.
 */
function AdjustPanel({
  geometry,
  look,
  set,
  onReset,
  onClose,
  onCover,
}: {
  geometry: Geometry;
  look: Look;
  set: Setter;
  onReset: () => void;
  onClose: () => void;
  onCover: (inset: { right: number; bottom: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery("(min-width: 768px)");
  const { area, stage } = geometry;
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let style: CSSProperties;
  let cover = { right: 0, bottom: 0 };
  if (wide) {
    const gap = PANEL_GAP, pad = 12;
    const stageRight = stage.x + stage.w;
    if (area.w - stageRight >= PANEL_W + gap) {
      // Room beside the stage: sit next to it and cover nothing.
      style = { left: stageRight + gap, top: stage.y, width: PANEL_W, maxHeight: area.h - stage.y };
    } else {
      const left = Math.max(0, Math.min(stageRight - pad - PANEL_W, area.w - PANEL_W));
      style = { left, top: stage.y + pad, width: PANEL_W, maxHeight: Math.max(160, stage.h - 2 * pad) };
      cover = { right: Math.max(0, stageRight - left), bottom: 0 };
    }
  } else {
    const bottom = area.h - (stage.y + stage.h) + 8;
    style = { left: 0, right: 0, bottom, maxHeight: stage.h - 16 };
    cover = { right: 0, bottom: height + 8 };
  }

  // Re-report only when the covered size actually changes.
  useEffect(() => onCover(cover), [cover.right, cover.bottom, onCover]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Adjust the camera"
      className={`absolute z-10 flex flex-col rounded-[14px] border border-white/70 bg-white/85 shadow-[0_10px_40px_rgba(0,0,0,.18)] backdrop-blur-2xl backdrop-saturate-150 transition-[left,top] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${
        wide ? "" : "p-2"
      }`}
      style={style}
    >
      {wide ? (
        <WideControls look={look} set={set} onReset={onReset} onClose={onClose} />
      ) : (
        <CompactControls look={look} set={set} onClose={onClose} />
      )}
    </div>
  );
}
