"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { HOME_CHAPTERS, rideToStop } from "@/lib/dashboard";
import type { Locale } from "@/lib/i18n";

export type HomeStop = (typeof HOME_CHAPTERS)[number];

/**
 * Goes to a stop of the home ride. On the home page the camera rides there; from any other page
 * it opens /#stop and the ride starts there from the opening view.
 */
export function useRideHome(lang: Locale) {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (id: HomeStop) => {
      const stop = HOME_CHAPTERS.indexOf(id);
      if (pathname === `/${lang}`) {
        // A frame later: whatever started the ride (the menu) has let go of the page by then.
        requestAnimationFrame(() => rideToStop(stop));
        return;
      }
      rideToStop(stop);
      router.push(`/${lang}#${id}`, { scroll: false });
    },
    [lang, pathname, router],
  );
}
