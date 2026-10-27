import { describe, expect, it } from "vitest";
import { inAppBrowser, missingCapabilities, platformOf } from "./environment";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iosGmail:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iosFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0]",
  iosGoogleApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/320.0.640 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; SM-A146B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 5; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Instagram 330.0.0.40.92",
  ipadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("platformOf", () => {
  it("detects iOS, iPadOS and Android", () => {
    expect(platformOf(UA.iosSafari)).toBe("ios");
    expect(platformOf(UA.ipadOS, 5)).toBe("ios");
    expect(platformOf(UA.ipadOS, 0)).toBe("other");
    expect(platformOf(UA.androidChrome)).toBe("android");
  });
});

describe("inAppBrowser", () => {
  it("lets real browsers through", () => {
    expect(inAppBrowser(UA.iosSafari, "ios")).toBeNull();
    expect(inAppBrowser(UA.iosChrome, "ios")).toBeNull();
    expect(inAppBrowser(UA.androidChrome, "android")).toBeNull();
  });

  it("catches webviews", () => {
    expect(inAppBrowser(UA.iosGmail, "ios")).toBe("an app");
    expect(inAppBrowser(UA.iosFacebook, "ios")).toBe("Facebook");
    expect(inAppBrowser(UA.iosGoogleApp, "ios")).toBe("Google app");
    expect(inAppBrowser(UA.androidWebView, "android")).toBe("an app");
    expect(inAppBrowser(UA.androidInstagram, "android")).toBe("Instagram");
  });
});

describe("missingCapabilities", () => {
  it("lists what's missing", () => {
    expect(
      missingCapabilities({ secureContext: true, getUserMedia: true, mediaRecorder: false, deviceOrientation: true, indexedDB: true }),
    ).toEqual(["mediaRecorder"]);
  });
});
