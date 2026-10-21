import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n";
import { RoadPrototype } from "./road-prototype";

export const metadata: Metadata = { title: "Road", robots: { index: false } };

// The dust track on its own, driven by scroll or the slider; development only.
export default async function Road({ params }: PageProps<"/[lang]/dev/road">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return <RoadPrototype />;
}
