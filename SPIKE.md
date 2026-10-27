# Spike test: single-lap capture in the phone browser

**Question:** can a phone browser, in real time, guide someone through one slow lap of a
room and show a coverage ring for ceiling, walls and floor that can be trusted?

## Matrix

6 phones × about 15 rooms.

| Phone | OS | Browser |
| --- | --- | --- |
| iPhone 11 | iOS 16–18 | Safari |
| iPhone 13 | iOS 16–18 | Safari |
| iPhone 15 | iOS 26 | Safari |
| Pixel 5 | Android | Chrome |
| Galaxy A-series | Android | Chrome |
| One low-end Android | Android | Chrome |

Rooms, spread across: **small**, **cluttered**, **dim**, **open-plan**. Note the type of
each room on the sheet.

## Before each phone

1. Charge to above 80% and note the battery level and room temperature.
2. Close other apps. Turn off Low Power Mode / battery saver (note it if you can't).
3. Open the link in **Safari / Chrome itself**, not from Gmail, Slack or another app.
   (The app blocks in-app browsers; note it if that screen appears.)
4. First time only: accept the certificate warning (see README).

## Each session

1. Stand in the doorway, facing into the room. Start a stopwatch and tap **I'm at the door**.
2. Allow camera and motion.
3. Follow the voice and the dot. Walk slowly along the walls. Don't help the app: if
   it's confusing, that's a result.
4. Partway round, tap pause, wait 5 s, then Resume (tests segment boundaries).
5. If something blocks the floor, use **Something in the way?**
6. At the end, fix the gaps it asks for, then stop the stopwatch at **Room captured**.
7. Tap **Download recording + log**. On iPhone choose **Save to Files**; on Android the
   files go to Downloads. Rename the folder `<phone>-<room#>`.
8. Fill in the sheet below straight away.

Every few rooms, also try one interruption: lock the screen or switch apps
mid-lap, come back, Resume. And once per phone, reload the page mid-lap and use
**Continue your last room**.

## Record per session

| Field | Where it comes from |
| --- | --- |
| Completed? (Y/N, where it failed) | you |
| Time to "Room captured" | stopwatch; also `summary.durationMs` |
| Heading drift at lap end (°) | `summary.driftDeg` (gyro vs compass; null if no compass) |
| Physical check of drift | at "Room captured", is the phone back pointing at the doorway? Estimate the error in degrees |
| UI fps: mean / min / seconds under 30 | `summary.fps` |
| Quality samples per second | `summary.qualityHz` (target ≥ 5) |
| Auto-pauses | `summary.autoPauses` |
| Signs of heat throttling | fps trend in `frames[]` over the session; phone warm to the touch? |
| Recording dropped? | `segments[]`: every segment should have chunks every ~2 s and an `endReason`; the files should play to the end |
| Codec | `codec` |
| Green-cell truth | see below |
| Anything confusing | you |

### Green-cell truth (by hand for now)

For each cell the ring showed green, find its timestamp in `events` (`type: "cell"`,
`to: "captured"`, with `slice` and `band`). Scrub to that moment in the video
(segment start times are in `segments[].startedAt`; event `t` is epoch ms) and check:
is that part of the room (that wall section / ceiling / floor) actually in view and
sharp? Count `green cells checked`, `green but not really visible`. Later this is
replaced by the server's reconstruction check.

## Targets

- UI holds **≥ 30 fps** while recording (`summary.fps.min`, `secondsBelow30`).
- Quality sampling holds **≥ 5 per second** (`summary.qualityHz`).
- **No dropped recording** on an iPhone 11-class phone over a 5-minute session: chunks
  keep arriving, no `recording-error` events, files play to the end.

## Reading `session.json`

- `device`, `permissions`, `codec`, `config`: the setup, including the thresholds in use.
- `samples[]` (10 per second): pitch, heading, unwrapped heading, progress, compass,
  rotation rate, blur, brightness, slice, band, paused / auto-paused.
- `quality[]`: every quality sample, with how long it took and whether it ran in the worker.
- `frames[]`: once a second, fps, 95th-percentile and worst frame time.
- `events[]`: anchor, lap direction, cell changes, auto-pause / resume (with reason),
  pause / resume, visibility changes, segment start / end, lap complete (with drift),
  re-anchor, errors.
- `segments[]`: per video segment, MIME type, start and end, chunks, bytes, why it ended.
- `summary`: the numbers above, precomputed.
- `finalCoverage`: the final 12×3 grid.

## Tuning between rounds

Change values in `src/config.ts` only, and note the change on the sheet. The values
most likely to need tuning:

- `quality.blurMin` / `autoPause.blurBelow`: blur scores depend on the scene and the
  phone. Use `quality[]` from a few sessions (sharp vs. shaky) to set them.
- `motion.maxRotationRateDegPerSec` / `autoPause.rotationRateDegPerSec`.
- `coverage.dwellMs`.
- `guidance.verticalFovDeg` / `horizontalFovDeg`: if the dot overshoots or lags.

## Known risks to watch

- **Plain walls.** A blank wall has little texture, so its blur score is low even when
  sharp. Expect yellow (retake) cells there; the gap flow offers "Can't reach this
  spot?" to skip. Count how often this happens.
- **Heading drift.** Gyro heading drifts over 3–5 minutes. The compass is used only to
  measure drift and, if it agrees within `maxCompassReanchorDeg`, to correct it at lap
  end. Compass readings indoors can be poor, so compare them with the physical check.
- **Walking direction.** The first 20° of turn sets the direction. If someone glances the
  wrong way first, the lap runs backwards; watch for it in `lap-direction` events.
- **iOS MediaRecorder.** Timeslice behaviour and codecs differ across iOS 16–18 and 26.
  Check `codec`, chunk cadence and playback of every file.
- **iOS 16.0–16.3** can't draw video into a canvas inside a worker, so frames are drawn
  on the main thread at 160 px and only the maths runs in the worker.
- **Backgrounding.** Locking the phone ends the camera track; Resume re-acquires it.
  Check `camera-reacquired` / `camera-reacquire-failed` events.
- **Storage.** About 30 MB per minute at 4 Mbps lands in IndexedDB. Low-storage phones
  may evict data or fail writes (`recording-error: chunk-write-failed`).
