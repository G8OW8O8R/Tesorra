# Tesorra Racing

The site of Tesorra Racing — a motorsport team known for drift, formula and moto — built as one continuous world: a winding track made of amber dust that the camera rides down as you scroll, with a stop for every discipline, a floating team store and a countdown to the next race.

Tesorra Racing is a **fictional team** and this is a **design concept**. Drivers, results and products are made up, and the store is a demo: nothing is sold, charged or shipped.

## Highlights

- **A world made of dust.** Plain WebGL2 in a Web Worker on an OffscreenCanvas (main-thread fallback, static poster without WebGL2): ~1.1M particles on desktop, additive blending into an HDR buffer with ACES tone mapping, 5-level bloom, depth of field, curl-noise smoke and shape morphs. Point clouds of a drift car, a formula car and a motorcycle are sampled from 3D models.
- **Scroll is distance.** Scroll position maps to distance along a Catmull-Rom track; the camera speeds up between stops, banks into corners and slows down at each stop, where the vehicle runs a short scroll-driven loop.
- **A steering-wheel display instead of a nav bar.** Chapter, scroll speed in km/h, gear and shift lights that fill with the page and blink on a chapter change; digits flip like a timing screen.
- **Driver pages.** A huge outlined number, a portrait that bursts into dust and reassembles as the next driver, signatures drawn stroke by stroke, counters, a fan of paddock photos and a helmet archive.
- **A floating store.** Cut-out products drift in space over the dust, categories dissolve into each other, FLOAT / LIST views, a box drawer, a demo checkout validated in the browser and a paddock pass with a Code 39 barcode as the order confirmation.
- **Details.** Start lights as the intro, page transitions through dust, pit-board cards, an `.ics` file for every race, a “BOX, BOX” radio message on add to box, EN / PL, reduced-motion versions of every page.

## Stack

Next.js 16 (App Router, React Server Components, Partial Prerendering), React 19, TypeScript (strict), Tailwind CSS 4, Lenis, Zustand, Zod, Vitest, Playwright, pnpm, Vercel. No 3D libraries.

## Lighthouse

Production build (`pnpm build && pnpm start`), Lighthouse 12, median of 3 runs. Measured on 26 October 2026.

| Page | Device | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/en` | Desktop | 99 | 100 | 100 | 100 | 1.0 s | 5 ms | 0.001 |
| `/en` | Mobile | 75 | 100 | 100 | 100 | 5.0 s | 239 ms | 0 |
| `/en/store` | Desktop | 96 | 100 | 100 | 100 | 1.4 s | 7 ms | 0 |
| `/en/store` | Mobile | 80 | 100 | 100 | 100 | 4.7 s | 181 ms | 0 |
| `/en/team/21-wierzbicki` | Desktop | 98 | 100 | 100 | 100 | 1.0 s | 2 ms | 0.001 |
| `/en/team/21-wierzbicki` | Mobile | 79 | 100 | 100 | 100 | 5.0 s | 147 ms | 0.002 |

Mobile uses Lighthouse’s simulated slow 4G and 4× CPU; the LCP observed in the same runs is 0.2–0.45 s, as the largest element is HTML painted in the first frame and the WebGL scene fades in only once it is ready.

## Running locally

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm lint
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # end-to-end and accessibility tests (Playwright, builds the app first)
pnpm build && pnpm start
pnpm images         # assets-src/ → responsive AVIF + WebP in public/img and lib/images.ts
```

## Environment variables

None are required. Optional:

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin for canonical links, `hreflang`, the sitemap and Open Graph. On Vercel the production domain is used automatically; locally it falls back to `http://localhost:3000`. |

## Rights

Code © 2026 Piotr Goworek. Photography and product images: art direction by Piotr Goworek. The Tesorra name, wordmark and liveries are part of this concept.

3D models (CC BY 4.0 and royalty-free) and typefaces (SIL Open Font License 1.1) belong to their authors and are listed on the `/credits` page; font licences are in `public/fonts/LICENSES/`. Tesorra Racing is not affiliated with any racing series, team, circuit, sponsor or brand.
