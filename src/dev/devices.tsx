import type { ReactNode } from "react";

// Phone mock-up for the preview panel. It draws the body, status bar and Safari's
// bars, and gives the app only the space Safari leaves it. Sizes are CSS px and
// close to the real thing; they are for checking layout, not pixel-exact.

export interface Device {
  id: string;
  name: string;
  /** Screen size in CSS px. */
  w: number;
  h: number;
  /** Screen corner radius. */
  radius: number;
  /** Black border round the screen. */
  bezel: number;
  /** Side buttons as [edge, start, length], fractions of body height. */
  buttons: ["left" | "right", number, number][];
}

export const DEVICES: Device[] = [
  {
    id: "iphone-16",
    name: "iPhone 16",
    w: 393,
    h: 852,
    radius: 55,
    bezel: 11,
    buttons: [["left", 0.17, 0.04], ["left", 0.24, 0.07], ["left", 0.33, 0.07], ["right", 0.27, 0.11]],
  },
];

// The status bar sits above the page; Safari's address bar, toolbar and home
// indicator sit below it.
const STATUS_BAR = 54;
const SAFARI_BAR = 139;

/** The page's viewport on this device. */
export function viewportFor(d: Device) {
  return { w: d.w, h: d.h - STATUS_BAR - SAFARI_BAR };
}

/** Outer body size, including bezels. */
export function bodySize(d: Device) {
  return { w: d.w + 2 * d.bezel, h: d.h + 2 * d.bezel };
}

const IOS_FONT = '-apple-system, "SF Pro Text", system-ui, sans-serif';
const BODY = "#0d0d0e";
const EDGE = "#3a3a3d";
const BLUE = "#007aff";

export function DeviceBody({ device: d, children }: { device: Device; children: ReactNode }) {
  const body = bodySize(d);
  return (
    <div
      className="relative"
      style={{
        width: body.w,
        height: body.h,
        padding: d.bezel,
        borderRadius: d.radius + d.bezel,
        background: BODY,
        boxShadow: `0 0 0 2px ${EDGE}, 0 0 0 3px #1c1c1e, 0 50px 90px -40px rgba(0,0,0,0.45), 0 20px 40px -24px rgba(0,0,0,0.35)`,
      }}
    >
      {d.buttons.map(([edge, start, len], i) => (
        <div
          key={i}
          className="absolute w-[3px] rounded-[2px]"
          style={{ top: start * body.h, height: len * body.h, [edge]: -5, background: EDGE }}
          aria-hidden
        />
      ))}
      <div className="relative h-full w-full overflow-hidden bg-white" style={{ borderRadius: d.radius }}>
        {children}
      </div>
    </div>
  );
}

/** The screen contents: status bar and Dynamic Island above the page, Safari's bar below. */
export function DeviceScreen({ page }: { page: ReactNode }) {
  return (
    <>
      <div className="absolute inset-x-0" style={{ top: STATUS_BAR, bottom: SAFARI_BAR }}>
        {page}
      </div>
      <StatusBar />
      <SafariBar host={location.hostname} />
    </>
  );
}

function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 bg-white text-black" style={{ height: STATUS_BAR, fontFamily: IOS_FONT }}>
      <div className="absolute left-1/2 top-[11px] h-[37px] w-[125px] -translate-x-1/2 rounded-full bg-black" />
      <span className="absolute left-0 top-0 flex h-full w-[34%] items-center justify-center pt-[6px]" style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>
        9:41
      </span>
      <span className="absolute right-0 top-0 flex h-full w-[34%] items-center justify-center gap-[6px] pt-[6px]">
        <Signal />
        <Wifi />
        <Battery />
      </span>
    </div>
  );
}

function SafariBar({ host }: { host: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-[#f6f6f6]/95 backdrop-blur" style={{ height: SAFARI_BAR, borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
      <div className="px-3 pt-[7px]">
        <div
          className="flex h-11 items-center justify-between rounded-[12px] bg-white px-3 text-black"
          style={{ fontFamily: IOS_FONT, boxShadow: "0 1px 5px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06)" }}
        >
          <PageMenuIcon />
          <span className="flex min-w-0 items-center gap-1" style={{ fontSize: 15, letterSpacing: -0.2 }}>
            <LockIcon />
            <span className="truncate">{host}</span>
          </span>
          <ReloadIcon />
        </div>
      </div>
      <div className="flex items-center justify-around px-2" style={{ height: 44, color: BLUE }}>
        <ChevronIcon dir="left" />
        <ChevronIcon dir="right" disabled />
        <ShareIcon />
        <BookIcon />
        <TabsIcon />
      </div>
      <div className="absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black" />
    </div>
  );
}

// ---- Icons ----

const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Signal() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

function Wifi() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
      <path d="M1.3 4.3a9.8 9.8 0 0 1 13.4 0M3.8 6.9a6.2 6.2 0 0 1 8.4 0" {...stroke} strokeWidth="1.9" />
      <path d="M8 11.4 5.9 9.2a3 3 0 0 1 4.2 0z" fill="currentColor" />
    </svg>
  );
}

function Battery() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity="0.35" />
      <rect x="2" y="2" width="20" height="9" rx="2.4" fill="currentColor" />
      <path d="M25 4.5v4a2.2 2.2 0 0 0 0-4z" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function PageMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="2.5" width="13" height="13" rx="2.5" {...stroke} strokeWidth="1.5" />
      <path d="M5.5 6.5h7M5.5 9h7M5.5 11.5h4" {...stroke} strokeWidth="1.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="13" viewBox="0 0 10 13" fill="#8a8a8e" aria-hidden>
      <path d="M2.2 5.5V4a2.8 2.8 0 0 1 5.6 0v1.5h-1.3V4a1.5 1.5 0 0 0-3 0v1.5z" />
      <rect x="0.5" y="5.5" width="9" height="7" rx="1.6" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <path d="M14.5 9a5.5 5.5 0 1 1-1.6-3.9" {...stroke} strokeWidth="1.6" />
      <path d="M13.3 2.4v3.1h-3.1" {...stroke} strokeWidth="1.6" />
    </svg>
  );
}

function ChevronIcon({ dir, disabled }: { dir: "left" | "right"; disabled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" style={{ opacity: disabled ? 0.3 : 1, color: disabled ? "#8a8a8e" : undefined }} aria-hidden>
      <path d={dir === "left" ? "M14 3.5 6.5 11l7.5 7.5" : "M8 3.5 15.5 11 8 18.5"} {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden>
      <path d="M7.5 9H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1.5M11 15V2M7 5.5 11 1.5l4 4" {...stroke} strokeWidth="1.8" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="24" height="22" viewBox="0 0 24 22" aria-hidden>
      <path d="M12 5.5C9.5 3.5 6 3 2.5 3.5v14c3.5-.5 7 0 9.5 2 2.5-2 6-2.5 9.5-2v-14C18 3 14.5 3.5 12 5.5zM12 5.5v14" {...stroke} strokeWidth="1.8" />
    </svg>
  );
}

function TabsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="2" y="6" width="14" height="14" rx="2.5" {...stroke} strokeWidth="1.8" />
      <path d="M6 2.5h11a2.5 2.5 0 0 1 2.5 2.5v11" {...stroke} strokeWidth="1.8" />
    </svg>
  );
}
