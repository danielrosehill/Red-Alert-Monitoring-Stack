// PWA service worker registration. Loaded by every geodash HTML page.
// Safe to call from any document on the same origin.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[pwa] sw registration failed:", err));
  });
}
