// Session-scoped store for the last 3D Studio frame.
//
// The Babylon <canvas> only exists while the 3D Studio tab is mounted. When the
// user switches to the Fabricator Audit (or any other tab) that canvas is gone,
// so "Capture 3D Studio" cannot read it live. We therefore snapshot the canvas
// on the way out of the Studio and keep it in sessionStorage, letting the audit
// embed the last rendered model without requiring the Studio to stay mounted.

const SNAPSHOT_KEY = 'fullaludoor.studio-snapshot.v1';
const MAX_SNAPSHOT_BYTES = 2.5 * 1024 * 1024;

export function saveStudioSnapshot(dataUrl: string): void {
  try {
    if (dataUrl.length > MAX_SNAPSHOT_BYTES) return;
    window.sessionStorage.setItem(SNAPSHOT_KEY, dataUrl);
  } catch {
    // sessionStorage may be unavailable (private mode / quota) — capture is optional.
  }
}

export function loadStudioSnapshot(): string | null {
  try {
    return window.sessionStorage.getItem(SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

export function clearStudioSnapshot(): void {
  try {
    window.sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

/** Captures the Studio canvas when it is currently in the DOM. */
export function captureStudioCanvasNow(): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>('#fullaludoor-studio-canvas');
  if (!canvas) return null;
  try {
    const dataUrl = canvas.toDataURL('image/png');
    saveStudioSnapshot(dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
