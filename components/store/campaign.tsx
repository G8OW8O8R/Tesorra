import { floatItems } from "@/content/store";
import type { Messages } from "@/messages";

type StoreText = Messages["store"];

/** The store's heading: one small mono line in the top left corner under the bar, over the products. */
export function Campaign({ t }: { t: StoreText }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-(--gutter) pt-4">
      <h1 className="label text-xs text-fg md:text-[13px]">
        {t.campaign.heading}
        <span className="text-muted"> · {t.campaign.count.replace("{n}", String(floatItems("all").length))}</span>
      </h1>
    </header>
  );
}
