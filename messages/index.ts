import type { Locale } from "@/lib/i18n";
import en, { type Messages } from "./en";
import pl from "./pl";

const messages: Record<Locale, Messages> = { en, pl };

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

export type { Messages };
