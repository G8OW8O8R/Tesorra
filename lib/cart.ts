"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProduct } from "@/content/store";

/** One line in the box: a product, its size or flavour, how many. */
export type BoxLine = { id: string; slug: string; option?: string; qty: number };

export const MAX_QTY = 9;

type BoxState = {
  lines: BoxLine[];
  add: (slug: string, option: string | undefined, qty: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const lineId = (slug: string, option?: string) => (option ? `${slug}:${option}` : slug);

/**
 * The box (cart), kept in this browser only. It is read back after hydration (`rehydrate` from the
 * box button), so the server and the first client render agree on an empty box.
 */
export const useBox = create<BoxState>()(
  persist(
    (set) => ({
      lines: [],
      add: (slug, option, qty) =>
        set(({ lines }) => {
          const id = lineId(slug, option);
          const found = lines.find((l) => l.id === id);
          if (found) return { lines: lines.map((l) => (l.id === id ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l)) };
          return { lines: [...lines, { id, slug, option, qty: Math.min(MAX_QTY, qty) }] };
        }),
      setQty: (id, qty) =>
        set(({ lines }) => ({ lines: lines.map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)) })),
      remove: (id) => set(({ lines }) => ({ lines: lines.filter((l) => l.id !== id) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "tesorra-box",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Products that left the catalogue drop out of a stored box.
      merge: (stored, current) => {
        const lines = ((stored as Partial<BoxState> | undefined)?.lines ?? []).filter((l) => getProduct(l.slug));
        return { ...current, lines };
      },
    },
  ),
);

export function boxCount(lines: BoxLine[]) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function boxSubtotal(lines: BoxLine[]) {
  return lines.reduce((sum, l) => sum + (getProduct(l.slug)?.priceCents ?? 0) * l.qty, 0);
}

type BoxUi = {
  open: boolean;
  /** The last add, for the radio call: items in the box then, and a counter to retrigger it. */
  radio: { count: number; seq: number } | null;
  setOpen: (open: boolean) => void;
  call: (count: number) => void;
};

/** Drawer and radio state, not kept between visits. */
export const useBoxUi = create<BoxUi>()((set) => ({
  open: false,
  radio: null,
  setOpen: (open) => set({ open }),
  call: (count) => set(({ radio }) => ({ radio: { count, seq: (radio?.seq ?? 0) + 1 } })),
}));

/** Adds to the box and puts the radio call out. */
export function addToBox(slug: string, option: string | undefined, qty: number) {
  useBox.getState().add(slug, option, qty);
  useBoxUi.getState().call(boxCount(useBox.getState().lines));
}
