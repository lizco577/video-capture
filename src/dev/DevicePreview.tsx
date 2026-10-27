import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEVICES, DeviceBody, DeviceScreen, bodySize, viewportFor, type Device } from "./devices";

// Hidden preview panel for checking the layout at phone sizes from a laptop.
// Only exists on devices with a mouse: hover the bottom-right corner to reveal a
// small gear. Picking a device shows the app in an iframe inside a phone mock-up,
// sized to what the phone's browser leaves for the page, so media queries and
// viewport units behave as they would on the phone. Phones and tablets never
// render any of it.

const STORE_KEY = "device-preview";

interface Prefs {
  device: string | null;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { device: null, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // Storage blocked: start from full window.
  }
  return { device: null };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // Not worth surfacing; the choice just won't be remembered.
  }
}

/** True inside the preview iframe, which renders the plain app. */
export function inPreviewFrame(): boolean {
  return new URLSearchParams(location.search).has("frame");
}

function hasMouse(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function frameSrc(): string {
  const url = new URL(location.href);
  url.searchParams.set("frame", "1");
  return url.toString();
}

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function DevicePreview({ children }: { children: ReactNode }) {
  const [enabled] = useState(hasMouse);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const device = enabled ? DEVICES.find((d) => d.id === prefs.device) ?? null : null;

  const update = (next: Partial<Prefs>) => {
    const p = { ...prefs, ...next };
    setPrefs(p);
    savePrefs(p);
  };

  return (
    <>
      {device ? <Frame device={device} /> : children}
      {enabled && <Trigger prefs={prefs} update={update} />}
    </>
  );
}

function Frame({ device }: { device: Device }) {
  const win = useWindowSize();
  const body = bodySize(device);
  // Room for the edge ring, side buttons and shadow.
  const scale = Math.min(1, (win.w - 96) / (body.w + 12), (win.h - 112) / (body.h + 12));
  const view = viewportFor(device);
  const [src] = useState(frameSrc);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-[#ececee]" data-testid="device-preview">
      <div style={{ width: body.w * scale, height: body.h * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <DeviceBody device={device}>
            <DeviceScreen
              page={
                <iframe
                  key={device.id}
                  title={`${device.name} preview`}
                  src={src}
                  className="block h-full w-full border-0"
                  allow="camera; microphone; accelerometer; gyroscope; magnetometer; fullscreen"
                />
              }
            />
          </DeviceBody>
        </div>
      </div>
      <p className="text-tip text-text-2">
        {device.name} · Safari · page {view.w} × {view.h}
        {scale < 1 && ` · ${Math.round(scale * 100)}%`}
      </p>
    </div>
  );
}

function Trigger({ prefs, update }: { prefs: Prefs; update(next: Partial<Prefs>): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sim = new URLSearchParams(location.search).has("sim");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const toggleSim = () => {
    const url = new URL(location.href);
    if (sim) url.searchParams.delete("sim");
    else url.searchParams.set("sim", "1");
    location.href = url.toString();
  };

  const row = (selected: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-2 py-1 text-left ${selected ? "bg-black text-white" : "hover:bg-quiet"}`;

  return (
    <div ref={ref} className="fixed bottom-0 right-0 z-[100]" data-testid="device-preview-panel">
      {/* 24px keeps the hover spot clear of the window's rounded corner and resize
          edge, while staying outside the rounded corner of full-width buttons. */}
      <button
        aria-label="Preview settings"
        onClick={() => setOpen(!open)}
        className={`flex h-6 w-6 items-center justify-center transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 ${open ? "opacity-100" : "opacity-0"}`}
      >
        <span className="frost flex h-5 w-5 items-center justify-center rounded-full text-white">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="absolute bottom-7 right-2 w-44 rounded-2xl border border-border bg-white p-2 text-tip text-text shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
          <p className="px-2 pb-1 pt-1 font-semibold">Preview</p>
          <button className={row(prefs.device === null)} onClick={() => update({ device: null })}>
            Full window
          </button>
          {DEVICES.map((d) => (
            <button key={d.id} className={row(prefs.device === d.id)} onClick={() => update({ device: d.id })}>
              {d.name}
            </button>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            <label className={`${row(false)} cursor-pointer`}>
              <span title="Fake camera and motion sensors">Simulator</span>
              <input type="checkbox" checked={sim} onChange={toggleSim} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
