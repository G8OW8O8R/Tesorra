/**
 * What the steering-wheel display in the bar shows, fed by the page that owns the ride.
 * `chapter` is the current home chapter (null on other pages); `blink` counts chapter changes
 * so the shift lights can flash on each one. Listeners write straight to the DOM: nothing here
 * goes through React state, so scrolling never re-renders the bar.
 */
export type Dashboard = { chapter: number | null; kmh: number; gear: number; blink: number };

const idle: Dashboard = { chapter: null, kmh: 0, gear: 0, blink: 0 };
let state = idle;
const listeners = new Set<(state: Dashboard) => void>();

/** The home ride's stops in order; the bar's chapter list rides to them. */
export const HOME_CHAPTERS = ["drift", "formula", "moto", "store", "live"] as const;

/** Top of the speed scale, at the camera's flat-out speed. */
export const TOP_KMH = 320;

/** Gear for a road speed: neutral when stopped, then one gear per 40 km/h up to 8th. */
export function gearFor(kmh: number) {
  if (kmh < 2) return 0;
  return Math.min(8, 1 + Math.floor(kmh / 40));
}

export function updateDashboard(next: { chapter?: number | null; kmh?: number }) {
  const chapter = next.chapter === undefined ? state.chapter : next.chapter;
  const kmh = next.kmh === undefined ? state.kmh : Math.round(next.kmh);
  if (chapter === state.chapter && kmh === state.kmh) return;
  const blink = chapter !== state.chapter && state.chapter !== null && chapter !== null ? state.blink + 1 : state.blink;
  state = { chapter, kmh, gear: gearFor(kmh), blink };
  listeners.forEach((listener) => listener(state));
}

export function resetDashboard() {
  state = idle;
  listeners.forEach((listener) => listener(state));
}

/** Calls `listener` now and on every change. */
export function subscribeDashboard(listener: (state: Dashboard) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function getDashboard() {
  return state;
}

let rideHandler: ((stop: number) => void) | null = null;

/** The page that owns the ride takes requests to ride to a stop (0 = the first) while it is mounted. */
export function setRideHandler(handler: (stop: number) => void) {
  rideHandler = handler;
  return () => {
    if (rideHandler === handler) rideHandler = null;
  };
}

export function rideToStop(stop: number) {
  rideHandler?.(stop);
}
