import type { SceneTuning } from "@/lib/scene-tuning";
import { clamp } from "./math";
import type { Track } from "./track";

export type PhaseKind = "hero" | "travel" | "dwell" | "tail";

export type Phase = {
  kind: PhaseKind;
  /** Stop this phase leads to (travel) or sits at (dwell); −1 for hero/tail. */
  stop: number;
  /** Scroll progress range. */
  p0: number;
  p1: number;
  /** Camera distance range and slopes (distance per unit of progress) at both ends. */
  d0: number;
  d1: number;
  m0: number;
  m1: number;
};

export type Timeline = {
  /** Scroll length of the whole ride in screens. */
  screens: number;
  phases: Phase[];
  /** Camera distance along the track for scroll progress 0..1. */
  distanceAt(p: number): number;
  /** Phase containing p and the local progress inside it. */
  phaseAt(p: number): { phase: Phase; local: number };
  /** Scroll progress at the middle of each stop's dwell. */
  stopCentres: number[];
  /** Camera distance at the middle of each stop's dwell. */
  stopCameras: number[];
};

function hermite(d0: number, d1: number, m0: number, m1: number, span: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * d0 +
    (t3 - 2 * t2 + t) * span * m0 +
    (-2 * t3 + 3 * t2) * d1 +
    (t3 - t2) * span * m1
  );
}

/**
 * Scroll → camera distance. Dwells are slow linear creeps; travels are Hermite curves
 * whose end slopes match the dwells, so the camera accelerates away from a stop and
 * brakes into the next one without a jolt.
 */
export function buildTimeline(track: Track, tuning: SceneTuning): Timeline {
  const s = tuning.scroll;
  const stopCameras = track.stops.map((stop) => stop.distance - tuning.stops[stop.id].view.back);

  type Draft = Omit<Phase, "p0" | "p1" | "m0" | "m1"> & { screens: number };
  const drafts: Draft[] = [{ kind: "hero", stop: -1, d0: 0, d1: s.heroDistance, screens: s.hero }];
  stopCameras.forEach((c, i) => {
    const prev = drafts[drafts.length - 1].d1;
    const half = tuning.stops[track.stops[i].id].view.dwell / 2;
    drafts.push({ kind: "travel", stop: i, d0: prev, d1: c - half, screens: s.travel });
    drafts.push({ kind: "dwell", stop: i, d0: c - half, d1: c + half, screens: s.dwell });
  });
  const last = drafts[drafts.length - 1].d1;
  drafts.push({ kind: "tail", stop: -1, d0: last, d1: last + s.tailDistance, screens: s.tail });

  const screens = drafts.reduce((sum, d) => sum + d.screens, 0);
  let cursor = 0;
  const phases: Phase[] = drafts.map(({ screens: len, ...d }) => {
    const p0 = cursor / screens;
    cursor += len;
    return { ...d, p0, p1: cursor / screens, m0: 0, m1: 0 };
  });

  // Linear phases keep their own slope; travels inherit their neighbours' slopes.
  const linear = (ph: Phase) => (ph.d1 - ph.d0) / (ph.p1 - ph.p0);
  phases.forEach((ph, i) => {
    if (ph.kind !== "travel") {
      ph.m0 = ph.m1 = linear(ph);
      return;
    }
    ph.m0 = linear(phases[i - 1]);
    ph.m1 = linear(phases[i + 1]);
  });

  function phaseAt(p: number) {
    const q = clamp(p, 0, 1);
    const phase = phases.find((ph) => q <= ph.p1) ?? phases[phases.length - 1];
    return { phase, local: clamp((q - phase.p0) / (phase.p1 - phase.p0), 0, 1) };
  }

  function distanceAt(p: number) {
    const { phase, local } = phaseAt(p);
    if (phase.kind !== "travel") return phase.d0 + (phase.d1 - phase.d0) * local;
    return hermite(phase.d0, phase.d1, phase.m0, phase.m1, phase.p1 - phase.p0, local);
  }

  const dwells = phases.filter((ph) => ph.kind === "dwell");
  return {
    screens,
    phases,
    distanceAt,
    phaseAt,
    stopCentres: dwells.map((ph) => (ph.p0 + ph.p1) / 2),
    stopCameras,
  };
}
