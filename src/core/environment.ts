// Browser and in-app-webview detection from the user agent. Pure so it can be tested.

export type Platform = "ios" | "android" | "other";

export function platformOf(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS reports a desktop Mac user agent.
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

const IN_APP_PATTERNS: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB|FBIOS/, "Facebook"],
  [/Instagram/, "Instagram"],
  [/LinkedInApp/, "LinkedIn"],
  [/GSA\//, "Google app"],
  [/Gmail/i, "Gmail"],
  [/Twitter|TwitterAndroid/, "X"],
  [/MicroMessenger/, "WeChat"],
  [/Line\//, "LINE"],
  [/Snapchat/, "Snapchat"],
  [/Pinterest/, "Pinterest"],
  [/TikTok|musical_ly|BytedanceWebview/, "TikTok"],
];

/**
 * Returns the in-app browser's name (or "an app") when the page is open inside
 * another app's webview, else null. Camera, motion and recording are unreliable there.
 */
export function inAppBrowser(ua: string, platform: Platform): string | null {
  for (const [re, name] of IN_APP_PATTERNS) if (re.test(ua)) return name;
  // Android System WebView marks itself with "; wv)".
  if (platform === "android" && /; wv\)/.test(ua)) return "an app";
  // iOS WKWebView without Safari in the UA (Gmail and many others). Chrome/Firefox/Edge on iOS include "Safari".
  if (platform === "ios" && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) return "an app";
  return null;
}

export interface Capabilities {
  secureContext: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  deviceOrientation: boolean;
  indexedDB: boolean;
}

export function missingCapabilities(c: Capabilities): (keyof Capabilities)[] {
  return (Object.keys(c) as (keyof Capabilities)[]).filter((k) => !c[k]);
}
