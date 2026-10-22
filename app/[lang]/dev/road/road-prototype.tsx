"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect, useRef, type CSSProperties, type FormEvent } from "react";
import { DustCanvas, type DustSceneHandle } from "@/components/scene/dust-canvas";
import { getRide } from "@/lib/scene/choreography";
import { clamp } from "@/lib/scene/math";
import { sceneTuning } from "@/lib/scene-tuning";
import type { SceneStats } from "@/lib/scene/protocol";

const SLIDER_STEPS = 1000;

function describe(p: number) {
  const { timeline, track } = getRide();
  const { phase, local } = timeline.phaseAt(p);
  const stop = track.stops[phase.stop];
  const name = stop ? `${String(phase.stop + 1).padStart(2, "0")} ${stop.id.toUpperCase()}` : "";
  const pct = `${Math.round(local * 100)}%`;
  if (phase.kind === "travel") return `RIDE → ${name} ${pct}`;
  if (phase.kind === "dwell") return `STOP ${name} ${pct}`;
  return phase.kind === "hero" ? `GRID ${pct}` : `END ${pct}`;
}

function readoutText({ p, stats }: { p: number; stats: SceneStats | null }) {
  const d = getRide().timeline.distanceAt(p);
  const perf = stats
    ? ` · ${stats.fps} FPS · ${(stats.points / 1e6).toFixed(2)}M PTS · ${Math.round(stats.density * 100)}%` +
      ` · ENGINE ${stats.cpu.toFixed(1)} MS · GPU ${stats.gpu === null ? "N/A" : `${stats.gpu.toFixed(1)} MS`}`
    : "";
  return `P ${p.toFixed(3)} · D ${d.toFixed(1)} · ${describe(p)}${perf}`;
}

export function RoadPrototype() {
  const { timeline, track } = getRide();
  const scene = useRef<DustSceneHandle>(null);
  const ride = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLParagraphElement>(null);
  const lenis = useRef<Lenis | null>(null);
  const span = useRef({ top: 0, length: 1 });
  const state = useRef<{ p: number; stats: SceneStats | null }>({ p: 0, stats: null });

  useEffect(() => {
    const el = ride.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      span.current = { top, length: Math.max(1, el.offsetHeight - window.innerHeight) };
    };
    const update = () => {
      const p = clamp((window.scrollY - span.current.top) / span.current.length, 0, 1);
      state.current.p = p;
      scene.current?.setProgress(p);
      if (slider.current) slider.current.value = String(Math.round(p * SLIDER_STEPS));
      if (readout.current) readout.current.textContent = readoutText(state.current);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Smooth wheel scrolling on desktop; touch keeps the native feel. The page never slows down,
    // only the camera does.
    const smooth = reduced
      ? null
      : new Lenis({ autoRaf: true, syncTouch: false, ...sceneTuning.scroll.lenis });
    lenis.current = smooth;
    smooth?.on("scroll", update);
    window.addEventListener("scroll", update, { passive: true });
    const onResize = () => {
      measure();
      update();
    };
    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      smooth?.destroy();
      lenis.current = null;
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const onSlide = (event: FormEvent<HTMLInputElement>) => {
    const p = Number(event.currentTarget.value) / SLIDER_STEPS;
    const y = span.current.top + p * span.current.length;
    if (lenis.current) lenis.current.scrollTo(y, { immediate: true });
    else window.scrollTo({ top: y, behavior: "instant" });
  };

  const onStats = (stats: SceneStats) => {
    state.current.stats = stats;
    if (readout.current) readout.current.textContent = readoutText(state.current);
  };

  return (
    <>
      <DustCanvas ref={scene} stats onStats={onStats} />
      <div
        ref={ride}
        className="relative z-10 h-(--ride) max-md:h-(--ride-phone)"
        style={
          {
            "--ride": `${timeline.chapters * sceneTuning.scroll.chapter.desktop}svh`,
            "--ride-phone": `${timeline.chapters * sceneTuning.scroll.chapter.mobile}svh`,
          } as CSSProperties
        }
      />

      <div className="panel fixed inset-x-4 bottom-4 z-30 flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
        <label htmlFor="road-progress" className="label shrink-0 text-[11px] text-muted">
          Ride
        </label>
        <div className="relative flex-1 pt-4">
          {timeline.stopCentres.map((c, i) => (
            <span
              key={track.stops[i].id}
              aria-hidden
              className="label absolute top-0 -translate-x-1/2 text-[10px] text-muted"
              style={{ left: `${c * 100}%` }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
          ))}
          <input
            ref={slider}
            id="road-progress"
            type="range"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            defaultValue={0}
            onInput={onSlide}
            className="block w-full accent-amber"
          />
        </div>
        <p ref={readout} className="label shrink-0 text-[11px] whitespace-nowrap text-fg sm:w-[68ch]" />
      </div>
    </>
  );
}
