"use client";

import { type CSSProperties, useMemo } from "react";
import { ButtonLink, Button } from "@/components/ui/button";
import { PitBoard } from "@/components/ui/pit-board";
import { code39 } from "@/lib/code39";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";

type PassText = Messages["checkout"]["pass"];

export type Order = {
  number: string;
  /** ISO time it was placed. */
  date: string;
  holder: string;
  lines: { id: string; label: string; qty: number; cents: number }[];
  shippingCents: number;
  totalCents: number;
};

const dateOf = (order: Order, lang: Locale) =>
  new Intl.DateTimeFormat(lang, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(order.date));

/** The order number as bars, drawn in narrow-element units and stretched to the box. */
function Barcode({ value }: { value: string }) {
  const { bars, width } = useMemo(() => code39(value), [value]);
  return (
    <svg aria-hidden viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" className="h-16 w-full text-fg">
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y="0" width={bar.width} height="40" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Draws the pass on a canvas (2× for sharp text) with the site's own faces, for saving as PNG. */
async function drawPass(order: Order, t: PassText, lang: Locale) {
  const css = getComputedStyle(document.documentElement);
  const mono = css.getPropertyValue("--font-mono").trim() || "monospace";
  const display = css.getPropertyValue("--font-display").trim() || "sans-serif";
  await document.fonts.ready;
  const [W, H, S] = [1200, 640, 2];
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(S, S);
  const fg = "#f2e9dc";
  const muted = "#8b8a92";
  const amber = "#e3a04f";
  const line = "rgba(242, 233, 220, 0.18)";

  ctx.fillStyle = "#0b0d14";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
  ctx.beginPath();
  ctx.moveTo(24, 76.5);
  ctx.lineTo(W - 24, 76.5);
  ctx.stroke();
  // Perforation before the stub.
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(840.5, 77);
  ctx.lineTo(840.5, H - 24);
  ctx.stroke();
  ctx.setLineDash([]);

  const text = (value: string, x: number, y: number, font: string, colour: string, align: CanvasTextAlign = "left") => {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  text(t.title.toUpperCase(), 48, 58, `16px ${mono}`, fg);
  text(t.eyebrow, W - 48, 58, `16px ${mono}`, amber, "right");
  text("TESORRA RACING", 48, 160, `italic 900 64px ${display}`, fg);

  const fields: [string, string][] = [
    [t.order, order.number],
    [t.date, dateOf(order, lang)],
    [t.holder, order.holder],
  ];
  fields.forEach(([label, value], i) => {
    const x = 48 + i * 250;
    text(label.toUpperCase(), x, 220, `13px ${mono}`, muted);
    text(value.toUpperCase(), x, 248, `20px ${mono}`, fg);
  });

  text(t.items.toUpperCase(), 48, 310, `13px ${mono}`, muted);
  const shown = order.lines.slice(0, 6);
  shown.forEach((l, i) => {
    const y = 342 + i * 30;
    text(`${l.qty} × ${l.label}`.toUpperCase(), 48, y, `17px ${mono}`, fg);
    text(formatPrice(l.cents, lang), 800, y, `17px ${mono}`, fg, "right");
  });
  if (order.lines.length > shown.length) text(`+${order.lines.length - shown.length}`, 48, 342 + shown.length * 30, `17px ${mono}`, muted);
  text(t.total.toUpperCase(), 48, H - 56, `13px ${mono}`, muted);
  text(formatPrice(order.totalCents, lang), 800, H - 52, `28px ${mono}`, amber, "right");

  const { bars, width } = code39(order.number);
  const [bx, by, bw, bh] = [872, 200, 280, 200];
  ctx.fillStyle = fg;
  bars.forEach((bar) => ctx.fillRect(bx + (bar.x / width) * bw, by, (bar.width / width) * bw, bh));
  text(order.number, bx + bw / 2, by + bh + 36, `20px ${mono}`, fg, "center");
  return canvas;
}

/**
 * The order confirmation as a paddock pass: a pit board with the order number, date, holder, the
 * items and total, a perforated stub with the order number as a barcode. It saves as a PNG.
 */
export function PaddockPass({ order, t, lang, storeHref }: { order: Order; t: PassText; lang: Locale; storeHref: string }) {
  const save = async () => {
    const canvas = await drawPass(order, t, lang);
    canvas?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tesorra-paddock-pass-${order.number}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div className="flex flex-col gap-8">
      <div data-enter>
        <p className="label text-[11px] text-amber">{t.eyebrow}</p>
        <h1 className="headline mt-3 text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.9]">{t.title}</h1>
        <p className="mt-4 max-w-xl text-fg/85">{t.line}</p>
      </div>

      <div data-enter style={{ "--i": 1 } as CSSProperties}>
        <PitBoard title={t.title.toUpperCase()} meta={order.number}>
          <div className="grid md:grid-cols-[1fr_17rem]">
            <div className="flex flex-col gap-6 p-5 md:p-7">
              <dl className="label grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-3">
                {(
                  [
                    [t.order, order.number],
                    [t.date, dateOf(order, lang)],
                    [t.holder, order.holder],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] text-muted">{label}</dt>
                    <dd className="mt-1 break-words text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="label text-[11px] text-muted">{t.items}</p>
                <ul className="label mt-2 flex flex-col gap-1.5 text-xs">
                  {order.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-4">
                      <span>
                        {l.qty} × {l.label}
                      </span>
                      <span className="shrink-0">{formatPrice(l.cents, lang)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="label flex justify-between border-t border-line pt-3 text-sm">
                <span className="text-muted">{t.total}</span>
                <span className="text-amber">{formatPrice(order.totalCents, lang)}</span>
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-dashed border-line p-5 md:border-t-0 md:border-l md:p-7">
              <Barcode value={order.number} />
              <p className="label text-center text-sm">{order.number}</p>
            </div>
          </div>
        </PitBoard>
      </div>

      <div data-enter className="flex flex-wrap gap-3" style={{ "--i": 2 } as CSSProperties}>
        <Button onClick={save}>{t.save}</Button>
        <ButtonLink href={storeHref} variant="secondary">
          {t.again}
        </ButtonLink>
      </div>
    </div>
  );
}
