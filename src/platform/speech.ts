// Reads instructions aloud with speechSynthesis. iOS only speaks after a first
// call made inside a user tap, so unlock() is called from the start button.

export class Speaker {
  muted = false;
  private lastSpokenAt = 0;
  private queued: string | null = null;
  private timer: number | null = null;

  constructor(private minIntervalMs: number) {}

  get available(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  unlock(): void {
    if (!this.available) return;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.available) window.speechSynthesis.cancel();
  }

  /**
   * Speak `text`. Within minIntervalMs of the last line, only the newest request is
   * kept and spoken when the interval ends. `urgent` interrupts straight away.
   */
  say(text: string, urgent = false): void {
    if (!this.available || this.muted) return;
    const wait = this.lastSpokenAt + this.minIntervalMs - performance.now();
    if (urgent || wait <= 0) {
      this.speakNow(text);
      return;
    }
    this.queued = text;
    if (this.timer == null) {
      this.timer = window.setTimeout(() => {
        this.timer = null;
        const q = this.queued;
        this.queued = null;
        if (q) this.speakNow(q);
      }, wait);
    }
  }

  cancel(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
    if (this.available) window.speechSynthesis.cancel();
  }

  private speakNow(text: string) {
    if (this.muted) return;
    this.queued = null;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
    this.lastSpokenAt = performance.now();
  }
}
