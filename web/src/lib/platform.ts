/** Platform checks for the app nudges and download buttons. */
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

/** Running inside our Android app (an Android WebView adds "; wv)" to the user agent). */
export const inAndroidWebView = /; wv\)/.test(ua) || /SahayaApp/i.test(ua);

export const isAndroid = /Android/i.test(ua);

/** Opened as an installed PWA. */
export const isStandalone = (() => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
})();

/** Already using an app, so don't ask them to install one. */
export const inApp = inAndroidWebView || isStandalone;

export const APK_URL = "/download/Sahaya-AI.apk";
