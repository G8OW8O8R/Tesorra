import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (hasLocale(first)) return;

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 301);
}

export const config = {
  // Skip Next internals, API routes and files with an extension (public assets).
  matcher: ["/((?!_next/|api/|.*\\.[^/]+$).*)"],
};
