/**
 * Registers the OpenWord service worker for the pure-browser build.
 *
 * The worker provides offline caching everywhere, and on static hosts that
 * cannot set COOP/COEP response headers it also injects them so the threaded
 * Writer WASM runtime can start. When the current document was served without
 * those headers, the page must reload once under service-worker control to
 * pick up the injected headers.
 *
 * The caller gates this to the web build; this module never throws.
 */

const COI_RELOAD_KEY = "openword.coi.reload";

function readReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(COI_RELOAD_KEY) === "1";
  } catch {
    // Storage may be unavailable; skip the reload rather than risk a loop.
    return true;
  }
}

function reloadForIsolation(): void {
  try {
    sessionStorage.setItem(COI_RELOAD_KEY, "1");
  } catch {
    // Without the guard flag a failed reload could loop; reload anyway is
    // unsafe, so give up and let runtimeHost report the missing isolation.
    return;
  }
  window.location.reload();
}

export interface ServiceWorkerOptions {
  /**
   * Whether the shell needs SharedArrayBuffer. The threaded Writer runtime
   * does; the ProseMirror editor does not, so it takes the offline caching
   * without paying for the isolation reload.
   */
  requireCrossOriginIsolation?: boolean;
}

export async function registerOpenWordServiceWorker(options: ServiceWorkerOptions = {}): Promise<void> {
  const requireIsolation = options.requireCrossOriginIsolation ?? true;
  try {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    // Relative URL and scope so subpath hosting (e.g. GitHub Pages) works.
    await navigator.serviceWorker.register("./openword-sw.js", { scope: "./" });

    if (!requireIsolation || globalThis.crossOriginIsolated) {
      // Isolation is either unnecessary or already in place; the worker only
      // adds offline caching. Clear the guard so a future header regression
      // can still trigger one recovery reload.
      try {
        sessionStorage.removeItem(COI_RELOAD_KEY);
      } catch {
        // Ignore; the flag is only a loop guard.
      }
      return;
    }

    // Served without isolation headers. Reload once after the worker
    // controls this page so the reloaded document gets injected headers.
    // The sessionStorage guard stops a reload loop on hosts (or browsers)
    // where isolation can never be achieved.
    if (readReloadFlag()) return;

    if (navigator.serviceWorker.controller) {
      // Already controlled but still not isolated (e.g. the controller
      // predates header injection); one guarded reload settles it.
      reloadForIsolation();
      return;
    }

    // First install: the controller appears only after activation.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => reloadForIsolation(),
      { once: true },
    );
  } catch (error) {
    // Never block boot; runtimeHost gives the authoritative diagnostic.
    console.warn("OpenWord service worker registration failed:", error);
  }
}
