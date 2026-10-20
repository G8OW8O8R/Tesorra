"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import type { Messages } from "@/messages";

const lines = [
  { name: "Slip Angle — Citrus", meta: "DRINK · 330 ML", price: "€3.49", qty: 6 },
  { name: "Night Shift replica", meta: "HELMETS · M", price: "€649", qty: 1 },
  { name: "Handbrake gloves", meta: "DRIFT GEAR · L", price: "€89", qty: 1 },
];

export function DrawerDemo({ t }: { t: Messages["ui"] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Drawer
        open={open}
        onClose={close}
        eyebrow="BOX · 3"
        title="In the box"
        closeLabel={t.close}
        footer={
          <div className="flex flex-col gap-3">
            <p className="label flex justify-between text-xs">
              <span className="text-muted">Subtotal</span>
              <span>€759.94</span>
            </p>
            <Button className="w-full">Checkout</Button>
          </div>
        }
      >
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((line) => (
            <li key={line.name} className="flex items-center justify-between gap-4 py-4 first:pt-0">
              <div className="min-w-0">
                <p className="label text-[10px] text-muted">{line.meta}</p>
                <p className="mt-1 truncate font-serif text-lg">{line.name}</p>
                <p className="label mt-1 text-xs">{line.price}</p>
              </div>
              <QuantityStepper size="sm" defaultValue={line.qty} labels={t} />
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}
