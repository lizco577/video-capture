import type { ReactNode } from "react";
import type { Platform } from "../core/environment";

// The light, full-page screens: intro, permissions, recovery, blocked browsers, saved.

export function Screen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="screen">
      <h1 className="text-title text-text">{title}</h1>
      <div className="mt-4 flex-1 space-y-4 text-body text-text">{children}</div>
      {actions && <div className="mt-8 flex flex-col gap-3">{actions}</div>}
    </main>
  );
}

export function Intro({
  onStart,
  onAskHelp,
  canContinue,
  onContinue,
  note,
}: {
  onStart(): void;
  onAskHelp(): void;
  canContinue: boolean;
  onContinue(): void;
  note: string | null;
}) {
  return (
    <Screen
      title="One slow walk around the room"
      actions={
        <>
          {canContinue && (
            <button className="btn-secondary" onClick={onContinue}>
              Continue your last room
            </button>
          )}
          <button className="btn-secondary" onClick={onAskHelp}>
            Ask someone to help
          </button>
          <button className="btn-primary" onClick={onStart}>
            I'm at the door
          </button>
        </>
      }
    >
      <p>
        About 3 minutes. A voice tells you what to do, and the ring fills in as you go. You can't get it wrong: we'll tell
        you if anything is missing.
      </p>
      <RingPreview />
      {note && (
        <p className="text-tip text-text-2" role="status">
          {note}
        </p>
      )}
    </Screen>
  );
}

/** A static picture of the ring on the slate tile, so the first screen shows what will fill in. */
function RingPreview() {
  const r = [44, 34, 24];
  return (
    <div className="flex items-center justify-center rounded bg-slate-1 py-8" aria-hidden="true">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {r.map((radius, i) =>
          Array.from({ length: 12 }, (_, s) => {
            const a0 = ((s * 30 - 13.5) * Math.PI) / 180;
            const a1 = ((s * 30 + 13.5) * Math.PI) / 180;
            const filled = s < 4 - i;
            return (
              <path
                key={`${i}-${s}`}
                d={`M ${60 + radius * Math.sin(a0)} ${60 - radius * Math.cos(a0)} A ${radius} ${radius} 0 0 1 ${60 + radius * Math.sin(a1)} ${60 - radius * Math.cos(a1)}`}
                fill="none"
                stroke={filled ? "var(--color-captured)" : "var(--color-slate-2)"}
                strokeWidth={filled ? 6 : 2}
              />
            );
          }),
        )}
      </svg>
    </div>
  );
}

export function Permissions({ onAllow, busy }: { onAllow(): void; busy: boolean }) {
  return (
    <Screen
      title="Camera and motion"
      actions={
        <button className="btn-primary" onClick={onAllow} disabled={busy} aria-busy={busy}>
          {busy ? "Waiting for your phone…" : "Turn on camera and motion"}
        </button>
      }
    >
      <p>We use the back camera to record the room, and the motion sensor to know where your phone is pointing.</p>
      <p>Your phone will ask twice. Tap Allow both times.</p>
      <p className="text-tip text-text-2">Nothing is sent anywhere while you record.</p>
    </Screen>
  );
}

export function Denied({ platform, what, onRetry }: { platform: Platform; what: string; onRetry(): void }) {
  return (
    <Screen
      title="We need your camera and motion sensor"
      actions={
        <button className="btn-primary" onClick={onRetry}>
          Try again
        </button>
      }
    >
      <p>{what} was turned off. Here's how to turn it back on.</p>
      {platform === "ios" ? (
        <ol className="list-decimal space-y-2 pl-5">
          <li>Tap "aA" (or the page icon) next to the web address at the top or bottom of Safari.</li>
          <li>Tap "Website Settings".</li>
          <li>Set Camera to "Allow". Motion & Orientation Access should be on too.</li>
          <li>Come back to this page and tap Try again.</li>
          <li>Still stuck? Open the Settings app, tap Safari, and check that Camera and Motion & Orientation Access are on. Then reload this page.</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-2 pl-5">
          <li>Tap the icon to the left of the web address in Chrome.</li>
          <li>Tap "Permissions" (or "Site settings").</li>
          <li>Set Camera to "Allow", and make sure Motion sensors is allowed.</li>
          <li>Come back to this page and tap Try again.</li>
        </ol>
      )}
    </Screen>
  );
}

export function OpenInBrowser({ app, platform }: { app: string; platform: Platform }) {
  const browser = platform === "android" ? "Chrome" : "Safari";
  return (
    <Screen title={`Open this in ${browser}`}>
      <p>
        This page is open inside {app}. The camera and motion sensor don't work reliably there, so the recording could be
        lost.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Tap the menu ("…" or the share icon) in this screen.</li>
        <li>Choose "Open in {browser}" or "Open in browser".</li>
      </ol>
      <p className="text-tip text-text-2">Or copy the link and paste it into {browser}.</p>
    </Screen>
  );
}

export function Unsupported({ missing }: { missing: string[] }) {
  const notSecure = missing.includes("secureContext");
  return (
    <Screen title="This browser can't record the room">
      {notSecure ? (
        <p>This page has to be opened over a secure (https) link. Ask whoever sent it for the https version.</p>
      ) : (
        <p>Please open this link in Safari on an iPhone, or in Chrome on an Android phone.</p>
      )}
      <p className="text-tip text-text-2">Missing: {missing.join(", ")}</p>
    </Screen>
  );
}

export function Saved({ onBack }: { onBack(): void }) {
  return (
    <Screen
      title="Saved for later"
      actions={
        <button className="btn-primary" onClick={onBack}>
          OK
        </button>
      }
    >
      <p>Everything so far is saved on this phone. Open the same link in this browser when you're ready to carry on.</p>
    </Screen>
  );
}
