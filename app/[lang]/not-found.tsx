"use client";

import { useParams } from "next/navigation";
import { OffTrack } from "@/components/off-track";
import { defaultLocale, hasLocale } from "@/lib/i18n";
import { getMessages } from "@/messages";

export default function NotFound() {
  const params = useParams<{ lang?: string }>();
  const lang = params.lang && hasLocale(params.lang) ? params.lang : defaultLocale;
  return <OffTrack t={getMessages(lang).notFound} homeHref={`/${lang}`} />;
}
