import { useCallback, useEffect, useState } from "react";
import type { CaptureController } from "./capture/CaptureController";
import type { CellState } from "./core/coverage";
import type { SessionLog } from "./core/session-log";
import { newSessionId } from "./platform/device";
import { detectEnvironment, requestAllPermissions, requestCamera, type Environment } from "./platform/permissions";
import { latestUnfinishedSession, type SavedSession } from "./platform/store";
import { Capture } from "./ui/Capture";
import { RoomCaptured } from "./ui/RoomCaptured";
import { Denied, Intro, OpenInBrowser, Permissions, Saved, Unsupported } from "./ui/screens";
import { shareLink } from "./ui/share";

type Screen =
  | { name: "intro" }
  | { name: "permissions"; restore?: SavedSession }
  | { name: "denied"; what: string; restore?: SavedSession }
  | { name: "capture"; sessionId: string; stream: MediaStream; permissions: Record<string, string>; restore?: SavedSession }
  | { name: "saved" }
  | { name: "captured"; sessionId: string; log: SessionLog; cells: CellState[] };

export function App() {
  const [env] = useState<Environment>(() => detectEnvironment());
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const [saved, setSaved] = useState<SavedSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (screen.name !== "intro") return;
    latestUnfinishedSession()
      .then((s) => setSaved(s ?? null))
      .catch(() => setSaved(null));
  }, [screen.name]);

  // Must run synchronously inside the tap: iOS only shows permission prompts from a user gesture.
  const allow = useCallback(
    (restore?: SavedSession) => {
      setBusy(true);
      void requestAllPermissions().then((r) => {
        setBusy(false);
        if (r.camera !== "granted" || !r.stream) {
          setScreen({ name: "denied", what: r.camera === "denied" ? "Camera access" : "The camera", restore });
          return;
        }
        if (r.motion === "denied" || r.motion === "error") {
          r.stream.getTracks().forEach((t) => t.stop());
          setScreen({ name: "denied", what: "Motion sensor access", restore });
          return;
        }
        // Speech has to be unlocked from a tap on iOS too.
        if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
        setScreen({
          name: "capture",
          sessionId: restore?.id ?? newSessionId(),
          stream: r.stream,
          permissions: { camera: r.camera, motion: r.motion, ...(r.error ? { cameraError: r.error } : {}) },
          restore,
        });
      });
    },
    [],
  );

  const onDone = useCallback((c: CaptureController) => {
    void c.finished.then(() => setScreen({ name: "captured", sessionId: c.sessionId, log: c.getLog(), cells: c.getCells() }));
  }, []);

  if (env.inApp) return <OpenInBrowser app={env.inApp} platform={env.platform} />;
  if (env.missing.length) return <Unsupported missing={env.missing} />;

  switch (screen.name) {
    case "intro":
      return (
        <Intro
          note={note}
          canContinue={!!saved}
          onContinue={() => saved && setScreen({ name: "permissions", restore: saved })}
          onStart={() => setScreen({ name: "permissions" })}
          onAskHelp={async () => {
            const r = await shareLink();
            setNote(r === "copied" ? "Link copied. Send it to whoever is helping." : null);
          }}
        />
      );
    case "permissions":
      return <Permissions busy={busy} onAllow={() => allow(screen.restore)} />;
    case "denied":
      return <Denied platform={env.platform} what={screen.what} onRetry={() => allow(screen.restore)} />;
    case "capture":
      return (
        <Capture
          key={screen.sessionId}
          sessionId={screen.sessionId}
          stream={screen.stream}
          permissions={screen.permissions}
          restore={screen.restore}
          reacquireCamera={requestCamera}
          onExit={() => setScreen({ name: "intro" })}
          onFinishLater={() => setScreen({ name: "saved" })}
          onDone={onDone}
        />
      );
    case "saved":
      return <Saved onBack={() => setScreen({ name: "intro" })} />;
    case "captured":
      return (
        <RoomCaptured
          sessionId={screen.sessionId}
          log={screen.log}
          cells={screen.cells}
          onNewRoom={() => setScreen({ name: "intro" })}
        />
      );
  }
}
