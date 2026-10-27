/** Share this page's link (e.g. to ask someone to help). Falls back to copying it. */
export async function shareLink(): Promise<"shared" | "copied" | "failed"> {
  const url = location.origin + location.pathname;
  const data = { title: "Room capture", text: "Can you help me capture a room? It takes about 3 minutes.", url };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Placeholder until each claim carries its adjuster's number. */
export const ADJUSTER_TEL = "tel:+10000000000";
