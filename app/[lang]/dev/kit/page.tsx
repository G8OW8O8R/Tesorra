import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChapterIndex } from "@/components/ui/chapter-index";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { ChapterPanel, Panel } from "@/components/ui/panel";
import { PitBoard } from "@/components/ui/pit-board";
import { ProductCard } from "@/components/ui/product-card";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { VariantPicker } from "@/components/ui/variant-picker";
import { formatPrice } from "@/lib/format";
import { hasLocale } from "@/lib/i18n";
import { getMessages } from "@/messages";
import { DrawerDemo } from "./drawer-demo";

export const metadata: Metadata = { title: "Kit", robots: { index: false } };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <h2 className="label mb-6 text-[11px] text-muted">{title}</h2>
      {children}
    </section>
  );
}

// Every component state in one place; development only.
export default async function Kit({ params }: PageProps<"/[lang]/dev/kit">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).ui;

  const chapters = [
    { id: "drift", number: "01", name: "DRIFT" },
    { id: "formula", number: "02", name: "FORMULA" },
    { id: "moto", number: "03", name: "MOTO" },
    { id: "store", number: "04", name: "STORE" },
    { id: "live", number: "05", name: "LIVE" },
  ].map((c) => ({ ...c, href: `/${lang}#${c.id}` }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-8">
      <h1 className="headline mb-12 text-5xl sm:text-7xl">Parts bin</h1>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Add to box</Button>
          <Button variant="secondary">Add to calendar</Button>
          <Button size="sm">Add to box</Button>
          <Button size="sm" variant="secondary">
            Details
          </Button>
          <Button disabled>Add to box</Button>
          <Button variant="secondary" disabled>
            Stream opens on race day
          </Button>
          <ButtonLink href={`/${lang}/store`} variant="secondary">
            Go to store
          </ButtonLink>
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label="Name" placeholder="Kuba Wierzbicki" required requiredLabel={t.required} />
          <TextField label="Email" type="email" defaultValue="pit@lane" error="That address won't reach the garage." />
          <TextField label="Postcode" hint="We only ask so the demo looks real." />
          <TextField label="Promo code" defaultValue="BOXBOX" disabled />
          <SelectField label="Country" defaultValue="pl">
            <option value="pl">Poland</option>
            <option value="fr">France</option>
            <option value="es">Spain</option>
            <option value="se">Sweden</option>
          </SelectField>
          <TextArea label="Note for the mechanics" placeholder="Leave it at the pit wall." />
        </div>
      </Section>

      <Section title="Variant picker / quantity">
        <div className="grid gap-8 sm:grid-cols-2">
          <VariantPicker
            name="size"
            legend="Size"
            unavailableLabel={t.unavailable}
            defaultValue="m"
            options={[
              { value: "xs", label: "XS", disabled: true },
              { value: "s", label: "S" },
              { value: "m", label: "M" },
              { value: "l", label: "L" },
              { value: "xl", label: "XL" },
            ]}
          />
          <VariantPicker
            name="flavour"
            legend="Flavour"
            unavailableLabel={t.unavailable}
            options={[
              { value: "citrus", label: "Citrus", swatch: "#d8c24a" },
              { value: "amber", label: "Amber", swatch: "#e3a04f" },
              { value: "night", label: "Night", swatch: "#8fb3d6" },
              { value: "zero", label: "Zero", swatch: "#f2e9dc", disabled: true },
            ]}
          />
          <div className="flex flex-wrap items-center gap-4">
            <QuantityStepper labels={t} />
            <QuantityStepper labels={t} defaultValue={9} />
            <QuantityStepper labels={t} size="sm" defaultValue={3} />
          </div>
        </div>
      </Section>

      <Section title="Panels / chapter index">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1fr_auto]">
          <ChapterPanel
            number="01"
            name="DRIFT"
            color="var(--chapter-drift)"
            heading="Sideways is the fast way"
            body="Kuba learned car control on frozen car parks outside Wrocław. He still brakes later than the judges think is reasonable."
            data="Titles 3 · Best run 98.5 pts"
            link={{ href: `/${lang}/team/21-wierzbicki`, label: "Meet #21" }}
          />
          <Panel>
            <p className="label text-[11px] text-muted">Plain panel</p>
            <p className="mt-3 text-sm text-muted">Blurred surface with a 1px line, used under every overlay.</p>
          </Panel>
          <div className="flex gap-10">
            <ChapterIndex chapters={chapters} active="drift" label="Chapters" />
            <ChapterIndex chapters={chapters} active="formula" label="Chapters" />
          </div>
        </div>
      </Section>

      <Section title="Pit boards">
        <div className="grid gap-4 sm:grid-cols-3">
          <PitBoard title="P1" meta="+0.000">
            <div className="px-5 py-5">
              <p className="headline text-2xl">Elena Moreau</p>
              <p className="label mt-2 text-[11px] text-muted">#08 · Fastest lap 1:31.442</p>
            </div>
          </PitBoard>
          <PitBoard title="#21" meta="LAP 12" interactive>
            <a href="#" className="block px-5 py-5 outline-none">
              <p className="headline text-2xl">Interactive board</p>
              <p className="label mt-2 text-[11px] text-muted">Frame turns amber on hover / focus</p>
            </a>
          </PitBoard>
          <PitBoard title="R07" meta="SAT 14 NOV">
            <div className="flex flex-1 flex-col justify-between gap-6 px-5 py-5">
              <div>
                <p className="label text-[11px] text-formula">FORMULA</p>
                <p className="headline mt-2 text-2xl">Night Street Circuit</p>
              </div>
              <Button size="sm" variant="secondary" className="self-start">
                Add to calendar
              </Button>
            </div>
          </PitBoard>
        </div>
      </Section>

      <Section title="Product cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProductCard
            href={`/${lang}/store/slip-angle-citrus`}
            name="Slip Angle — Citrus"
            category="Drink"
            price={formatPrice(349, lang)}
            board={["#21", "LAP 12"]}
          />
          <ProductCard
            href={`/${lang}/store/night-shift`}
            name="Night Shift replica"
            category="Helmets"
            price={formatPrice(64900, lang)}
            board={["P1", "+0.000"]}
          />
          <ProductCard
            href={`/${lang}/store/handbrake-gloves`}
            name="Handbrake gloves"
            category="Drift gear"
            price={formatPrice(8900, lang)}
            board={["#36", "LAP 03"]}
          />
          <ProductCard
            href={`/${lang}/store/pit-crew-jacket`}
            name="Pit crew jacket"
            category="Apparel"
            price={formatPrice(15900, lang)}
            board={["P4", "+1.208"]}
          />
        </div>
      </Section>

      <Section title="Drawer">
        <DrawerDemo t={t} />
      </Section>
    </div>
  );
}
