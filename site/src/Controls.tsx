import { useState, type CSSProperties, type ReactNode } from "react";
import type { Look } from "./demo/director";

// Every setting of the app, described once. The desktop panel and the phone strip both render this.

type KeysOf<T> = { [K in keyof Look]: Look[K] extends T ? K : never }[keyof Look];
export type Setter = <K extends keyof Look>(key: K) => (value: Look[K]) => void;

type Slider = {
  kind: "slider";
  key: KeysOf<number>;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  when?: (l: Look) => boolean;
};
type Switch = { kind: "switch"; key: KeysOf<boolean>; label: string; short?: string; items?: Item[] };
type Choice = {
  kind: "choice";
  key: "mode" | "aspect" | "background";
  label: string;
  options: { value: string; label: string; swatch?: string }[];
};
type Item = Slider | Switch | Choice;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const deg = (v: number) => `${Math.round(v)}°`;
const sec = (v: number) => `${v.toFixed(1)} s`;
const times = (v: number) => `${v.toFixed(2)}×`;

const slider = (key: Slider["key"], label: string, min: number, max: number, step: number, fmt: Slider["fmt"], when?: Slider["when"]): Slider => ({
  kind: "slider", key, label, min, max, step, fmt, when,
});
const toggle = (key: Switch["key"], label: string, short?: string, items?: Item[]): Switch => ({
  kind: "switch", key, label, short, items,
});

export const TABS: { name: string; items: Item[] }[] = [
  {
    name: "Camera",
    items: [
      {
        kind: "choice",
        key: "mode",
        label: "Mode",
        options: [
          { value: "follow", label: "Follow mouse" },
          { value: "locked", label: "Locked" },
        ],
      },
      slider("lockX", "Position X", 0, 1, 0.01, pct, (l) => l.mode === "locked"),
      slider("lockY", "Position Y", 0, 1, 0.01, pct, (l) => l.mode === "locked"),
      slider("zoom", "Zoom", 0.8, 4, 0.05, times),
      slider("smoothing", "Smoothing", 0, 0.98, 0.01, (v) => (v < 0.01 ? "Off · instant" : pct(v))),
      slider("framingX", "Frame X", 0.1, 0.9, 0.01, pct),
      slider("framingY", "Frame Y", 0.1, 0.9, 0.01, pct),
      toggle("keepInBounds", "Keep inside screen", "Keep inside"),
    ],
  },
  {
    name: "Motion",
    items: [
      toggle("deadZone", "Dead zone", undefined, [
        slider("deadZoneSize", "Size", 0.03, 0.4, 0.01, pct),
        toggle("settleOnRest", "Settle when the mouse stops", "Settle"),
      ]),
      toggle("lookAhead", "Look ahead", undefined, [
        slider("lookAheadSeconds", "Anticipation", 0.05, 1, 0.05, (v) => `${v.toFixed(2)} s`),
      ]),
      toggle("zoomOnActivity", "Zoom in on clicks & typing", "Zoom in", [
        slider("activityZoom", "Extra zoom", 0.05, 1, 0.05, (v) => `+${Math.round(v * 100)}%`),
      ]),
      toggle("zoomOutOnFast", "Zoom out on fast moves", "Zoom out"),
      toggle("pullBackWhenIdle", "Pull back when idle", "Idle pull-back", [
        slider("idleSeconds", "After", 1, 10, 0.5, sec),
      ]),
      toggle("drift", "Handheld drift", "Drift", [slider("driftAmount", "Amount", 0.1, 1.5, 0.05, pct)]),
      toggle("intro", "Intro: ease in from flat", "Intro", [slider("introDuration", "Intro length", 0.3, 4, 0.1, sec)]),
      toggle("outro", "Outro: ease out to flat", "Outro", [slider("outroDuration", "Outro length", 0.3, 4, 0.1, sec)]),
    ],
  },
  {
    name: "Angle",
    items: [
      slider("pitch", "Tilt", -40, 40, 1, deg),
      slider("yaw", "Turn", -40, 40, 1, deg),
      slider("roll", "Rotate", -25, 25, 1, deg),
      slider("perspective", "Perspective", 0, 1, 0.01, pct),
    ],
  },
  {
    name: "Lens",
    items: [
      toggle("depthOfField", "Depth of field", "Depth of field", [
        toggle("focusFollowsCursor", "Focus follows cursor", "Focus follows"),
        slider("blur", "Blur amount", 0, 40, 1, (v) => `${Math.round(v)} px`),
        slider("focusSize", "Sharp area", 0.1, 0.8, 0.01, pct),
        slider("softness", "Falloff", 0.02, 1, 0.01, pct),
        slider("radialAmount", "Radial blur", 0, 1, 0.01, pct),
        slider("depthBlur", "Depth blur", 0, 1, 0.01, pct),
      ]),
      toggle("motionBlur", "Motion blur", undefined, [
        slider("motionBlurAmount", "Shutter", 0.1, 1, 0.05, (v) => `${Math.round(v * 360)}°`),
      ]),
    ],
  },
  {
    name: "Cursor",
    items: [
      toggle("cursorVisible", "Show cursor", "Cursor", [
        slider("cursorScale", "Size", 0.6, 3, 0.05, (v) => `${v.toFixed(1)}×`),
        toggle("cursorSmoothing", "Smooth movement", "Smooth"),
        toggle("ripples", "Click ripples", "Ripples"),
        toggle("hideIdleCursor", "Hide when idle", "Auto-hide", [
          slider("cursorIdleSeconds", "Hide after", 0.5, 10, 0.5, sec),
        ]),
      ]),
    ],
  },
  {
    name: "Look",
    items: [
      {
        kind: "choice",
        key: "aspect",
        label: "Format",
        options: [
          { value: "auto", label: "Fit" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
          { value: "4:5", label: "4:5" },
        ],
      },
      slider("cornerRadius", "Screen corners", 0, 60, 1, (v) => `${Math.round(v)} px`),
      toggle("vignette", "Vignette", undefined, [slider("vignetteStrength", "Strength", 0.05, 1, 0.01, pct)]),
      {
        kind: "choice",
        key: "background",
        label: "Background",
        options: [
          { value: "#f5f5f7", label: "Light", swatch: "#f5f5f7" },
          { value: "#ffffff", label: "White", swatch: "#ffffff" },
          { value: "#dce6f5", label: "Mist", swatch: "#dce6f5" },
          { value: "#2a2a2c", label: "Graphite", swatch: "#2a2a2c" },
          { value: "#000000", label: "Black", swatch: "#000000" },
        ],
      },
    ],
  },
];

// MARK: Desktop panel

export function WideControls({
  look,
  set,
  onReset,
  onClose,
}: {
  look: Look;
  set: Setter;
  onReset: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(TABS[0].name);
  const items = TABS.find((t) => t.name === tab)!.items;
  return (
    <>
      <div className="flex shrink-0 items-center justify-between pt-2 pr-2 pl-4">
        <span className="text-[13px] font-semibold tracking-[-0.08px] text-ink">Adjust</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onReset} className="rounded-full px-2 py-1 text-[12px] text-primary hover:bg-primary/[0.08]">
            Reset
          </button>
          <CloseButton onClose={onClose} />
        </div>
      </div>

      {/* Inspector-style tabs: icon over label, equal widths. */}
      <div role="tablist" aria-label="Settings" className="grid shrink-0 grid-cols-6 gap-0.5 border-b border-black/[0.06] px-2 pt-1 pb-2">
        {TABS.map((t) => {
          const selected = t.name === tab;
          return (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.name)}
              className={`flex flex-col items-center gap-[3px] rounded-[9px] pt-[7px] pb-[5px] text-[11px] tracking-[-0.06px] transition-colors ${
                selected ? "bg-primary-focus/[0.1] text-primary-focus" : "text-ink-48 hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              <TabIcon name={t.name} />
              {t.name}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-3 pb-4">
        {items.map((item) => (
          <WideItem key={item.key} item={item} look={look} set={set} />
        ))}
      </div>
    </>
  );
}

function TabIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    Camera: (
      <>
        <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
        <path d="m15.5 10.5 5-3v9l-5-3" />
      </>
    ),
    Motion: (
      <>
        <path d="M4 19c1.5-6.5 6-10.5 13-11" />
        <path d="m14 4.5 3.5 3.5-3.5 3.5" />
      </>
    ),
    Angle: <path d="M5 7.5 18 4.5v15L5 16.5Z" />,
    Lens: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m12 3.5 3.2 6.2M20.5 12l-6.6 2M12 20.5l-3.2-6.2M3.5 12l6.6-2" />
      </>
    ),
    Cursor: <path d="M6.5 3.5v15l4-3.8 2.8 6 2.4-1.1-2.8-5.9h5.4Z" />,
    Look: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
      </>
    ),
  };
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

function WideItem({ item, look, set }: { item: Item; look: Look; set: Setter }): ReactNode {
  if (item.kind === "slider") {
    if (item.when && !item.when(look)) return null;
    return (
      <SliderRow
        label={item.label}
        value={look[item.key]}
        min={item.min}
        max={item.max}
        step={item.step}
        fmt={item.fmt}
        onChange={set(item.key)}
      />
    );
  }
  if (item.kind === "choice") {
    const value = look[item.key] as string;
    if (item.key === "background") {
      return (
        <div>
          <div className="caption text-ink">{item.label}</div>
          <div className="mt-2 flex gap-2">
            {item.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("background")(o.value)}
                aria-label={o.label}
                aria-pressed={value === o.value}
                title={o.label}
                className={`h-7 w-7 rounded-full border border-black/15 transition-shadow ${
                  value === o.value ? "ring-2 ring-primary-focus ring-offset-2" : ""
                }`}
                style={{ background: o.swatch }}
              />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div>
        {item.key !== "mode" && <div className="mb-2 caption text-ink">{item.label}</div>}
        <Segmented
          value={value}
          options={item.options.map((o) => [o.value, o.label])}
          onChange={(v) => set(item.key)(v as never)}
        />
      </div>
    );
  }
  const on = look[item.key];
  return (
    <div>
      <SwitchRow label={item.label} checked={on} onChange={set(item.key)} />
      {on && item.items && (
        <div className="mt-2 ml-1 space-y-3 border-l border-black/10 pl-3">
          {item.items.map((child) => (
            <WideItem key={child.key} item={child} look={look} set={set} />
          ))}
        </div>
      )}
    </div>
  );
}

// MARK: Phone strip

type Chip =
  | { kind: "param"; item: Slider }
  | { kind: "toggle"; item: Switch }
  | { kind: "option"; key: Choice["key"]; value: string; label: string; swatch?: string };

function chipsFor(items: Item[], look: Look): Chip[] {
  return items.flatMap((item): Chip[] => {
    if (item.kind === "slider") return item.when && !item.when(look) ? [] : [{ kind: "param", item }];
    if (item.kind === "choice") {
      return item.options.map((o) => ({ kind: "option", key: item.key, value: o.value, label: o.label, swatch: o.swatch }));
    }
    const own: Chip = { kind: "toggle", item };
    return look[item.key] && item.items ? [own, ...chipsFor(item.items, look)] : [own];
  });
}

/** Phones: tabs, one row of chips and a single slider, like a photo editor, so the shot stays visible. */
export function CompactControls({ look, set, onClose }: { look: Look; set: Setter; onClose: () => void }) {
  const [tab, setTab] = useState(TABS[0].name);
  const [paramKey, setParamKey] = useState<Slider["key"] | null>(null);
  const chips = chipsFor(TABS.find((t) => t.name === tab)!.items, look);
  const params = chips.flatMap((c) => (c.kind === "param" ? [c.item] : []));
  const param = params.find((p) => p.key === paramKey) ?? params[0];
  const chip = "shrink-0 rounded-full px-3 py-[5px] caption transition-colors";

  return (
    <>
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setTab(t.name)}
              aria-pressed={tab === t.name}
              className={`shrink-0 rounded-full px-3 py-[5px] caption font-semibold transition-colors ${
                tab === t.name ? "text-ink" : "text-ink-48"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <div className="mt-1 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {chips.map((c) => {
          if (c.kind === "param") {
            const selected = param?.key === c.item.key;
            return (
              <button
                key={c.item.key}
                type="button"
                onClick={() => setParamKey(c.item.key)}
                aria-pressed={selected}
                className={`${chip} ${selected ? "bg-ink text-white" : "bg-black/[0.06] text-ink"}`}
              >
                {c.item.label}
              </button>
            );
          }
          if (c.kind === "toggle") {
            const on = look[c.item.key];
            return (
              <button
                key={c.item.key}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => set(c.item.key)(!on)}
                className={`${chip} flex items-center gap-1.5 ${on ? "bg-primary-focus text-white" : "bg-black/[0.06] text-ink-48"}`}
              >
                <span className={`h-[6px] w-[6px] rounded-full ${on ? "bg-white" : "bg-ink-48/60"}`} />
                {c.item.short ?? c.item.label}
              </button>
            );
          }
          const selected = look[c.key] === c.value;
          return (
            <button
              key={`${c.key}-${c.value}`}
              type="button"
              onClick={() => set(c.key)(c.value as never)}
              aria-pressed={selected}
              className={`${chip} flex items-center gap-1.5 ${selected ? "bg-ink text-white" : "bg-black/[0.06] text-ink"}`}
            >
              {c.swatch && <span className="h-3 w-3 rounded-full border border-black/20" style={{ background: c.swatch }} />}
              {c.label}
            </button>
          );
        })}
      </div>

      {param && (
        <div className="px-1 pt-2">
          <SliderRow
            label={param.label}
            value={look[param.key]}
            min={param.min}
            max={param.max}
            step={param.step}
            fmt={param.fmt}
            onChange={set(param.key)}
          />
        </div>
      )}
    </>
  );
}

// MARK: Primitives

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-48 hover:bg-black/5 hover:text-ink"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="m2 2 8 8M10 2l-8 8" />
      </svg>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small = false,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className="flex flex-1 rounded-[9px] bg-black/[0.06] p-[3px]" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[7px] py-[5px] transition-all ${small ? "text-[12px] tracking-[-0.12px]" : "caption"} ${
            value === v ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,.12)]" : "text-ink-48 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex justify-between caption">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-48">{fmt(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range mt-1"
        style={{ "--fill": `${fill}%` } as CSSProperties}
      />
    </label>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[32px] w-full items-center justify-between gap-4 text-left caption text-ink"
    >
      {label}
      <span
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-primary-focus" : "bg-chip"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}
