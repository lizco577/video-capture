import { useState } from "react";
import { ChevronIcon, CloseIcon } from "./icons";
import { ADJUSTER_TEL, shareLink } from "./share";

export function HelpSheet({ onClose, onFinishLater }: { onClose(): void; onFinishLater(): void }) {
  const [how, setHow] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const row = "flex min-h-[56px] w-full items-center justify-between border-b border-border text-left text-body text-text";

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="w-full rounded-t-2xl bg-white px-4 pt-4 text-text" style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}>
        <div className="flex items-center justify-between">
          <h2 id="help-title" className="text-title">
            {how ? "How it works" : "Need a hand?"}
          </h2>
          <button className="flex h-11 w-11 items-center justify-center" aria-label="Close help" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {how ? (
          <div className="mt-2 space-y-3 text-body">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Start at the door, facing into the room.</li>
              <li>Line up the white circle with the blue dot. It goes up to the ceiling, then down to the floor.</li>
              <li>When the dot moves sideways, take one step along the wall and do the same again.</li>
              <li>Keep going until you're back at the door. We'll show you any spots we missed.</li>
            </ol>
            <p className="text-tip text-text-2">Move slowly. If you go too fast we'll wait for you; nothing is lost.</p>
            <button className="btn-primary" onClick={() => setHow(false)}>
              Got it
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <button className={row} onClick={() => setHow(true)}>
              Watch how it works <ChevronIcon />
            </button>
            <button
              className={row}
              onClick={async () => {
                const r = await shareLink();
                setNote(r === "copied" ? "Link copied. Send it to whoever is helping." : r === "failed" ? "Couldn't share the link." : null);
              }}
            >
              Ask someone to help <ChevronIcon />
            </button>
            <a className={row} href={ADJUSTER_TEL}>
              Call your adjuster <ChevronIcon />
            </a>
            <button className={row} onClick={onFinishLater}>
              Finish later <ChevronIcon />
            </button>
            {note && (
              <p className="mt-3 text-tip text-text-2" role="status">
                {note}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
