import { z } from "zod";
import { images, type ImageKey } from "@/lib/images";

export const categories = ["drink", "helmets", "gear", "apparel"] as const;
export type Category = (typeof categories)[number];
export type CategoryFilter = Category | "all";

/** Dust and backdrop colour of each part of the store: citrus drinks, amber helmets, cool cloth. */
export const categoryColour: Record<CategoryFilter, string> = {
  all: "#e3a04f",
  drink: "#f0953a",
  helmets: "#e3a04f",
  gear: "#d9573f",
  apparel: "#5f80b3",
};

/** Free delivery from this subtotal; below it the flat rate. */
export const FREE_SHIPPING_CENTS = 15000;
export const SHIPPING_CENTS = { standard: 900, express: 1900 } as const;

const imageKey = z.custom<ImageKey>((value) => typeof value === "string" && value in images);
const hex = z.string().regex(/^#[0-9a-f]{6}$/);

const optionSchema = z.object({
  value: z.string().regex(/^[a-z0-9]+$/),
  /** The shot this option shows (flavours). */
  shot: imageKey.optional(),
  /** Scene colour while this option is chosen (flavours). */
  colour: hex.optional(),
});

const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(categories),
  priceCents: z.number().int().positive(),
  /** Shots for the gallery, the cut-out first (it is the one afloat). */
  shots: z.array(imageKey).min(1),
  options: z
    .object({
      kind: z.enum(["size", "flavour"]),
      values: z.array(optionSchema).min(2),
    })
    .optional(),
  /** Driver numbers who wear or drink it. */
  wornBy: z.array(z.enum(["21", "08", "36"])).default([]),
  limited: z.boolean().default(false),
  /** Width afloat at the reference depth (vw). */
  float: z.number().positive(),
});

export type Product = z.infer<typeof productSchema>;
export type ProductOption = z.infer<typeof optionSchema>;

const sizes = ["s", "m", "l", "xl", "xxl"].map((value) => ({ value }));

export const products: Product[] = z.array(productSchema).parse([
  {
    slug: "energy",
    category: "drink",
    priceCents: 350,
    shots: ["store/can-citrus", "store/can-cherry", "store/can-ice"],
    options: {
      kind: "flavour",
      values: [
        { value: "citrus", shot: "store/can-citrus", colour: "#f29a3c" },
        { value: "cherry", shot: "store/can-cherry", colour: "#c8323f" },
        { value: "ice", shot: "store/can-ice", colour: "#8fc4e0" },
      ],
    },
    wornBy: ["21", "08", "36"],
    float: 6,
  },
  { slug: "energy-4pack", category: "drink", priceCents: 1200, shots: ["store/can-4pack"], float: 11 },
  { slug: "helmet-21", category: "helmets", priceCents: 89000, shots: ["store/helmet-21"], wornBy: ["21"], float: 12 },
  {
    slug: "helmet-21-asfalt",
    category: "helmets",
    priceCents: 119000,
    shots: ["helmets/21-asfalt"],
    wornBy: ["21"],
    limited: true,
    float: 11,
  },
  {
    slug: "helmet-21-wycinanka",
    category: "helmets",
    priceCents: 119000,
    shots: ["helmets/21-wycinanka", "helmets/21-wycinanka-worn"],
    wornBy: ["21"],
    limited: true,
    float: 11,
  },
  {
    slug: "helmet-08-mirror",
    category: "helmets",
    priceCents: 119000,
    shots: ["helmets/08-mirror"],
    wornBy: ["08"],
    limited: true,
    float: 11,
  },
  {
    slug: "helmet-08-topo",
    category: "helmets",
    priceCents: 119000,
    shots: ["helmets/08-topo"],
    wornBy: ["08"],
    limited: true,
    float: 11,
  },
  {
    slug: "helmet-36-sol",
    category: "helmets",
    priceCents: 119000,
    shots: ["helmets/36-sol"],
    wornBy: ["36"],
    limited: true,
    float: 11,
  },
  {
    slug: "helmet-36-smoke",
    category: "helmets",
    priceCents: 119000,
    shots: ["helmets/36-smoke", "helmets/36-smoke-worn"],
    wornBy: ["36"],
    limited: true,
    float: 11,
  },
  { slug: "drift-gloves", category: "gear", priceCents: 12900, shots: ["store/gloves"], wornBy: ["21"], float: 12 },
  {
    slug: "hoodie-bokiem",
    category: "apparel",
    priceCents: 9500,
    shots: ["store/hoodie-front", "store/hoodie-back"],
    options: { kind: "size", values: sizes },
    wornBy: ["21"],
    float: 15,
  },
  {
    slug: "tee-bokiem",
    category: "apparel",
    priceCents: 4500,
    shots: ["store/tee-front", "store/tee-back"],
    options: { kind: "size", values: sizes },
    wornBy: ["21"],
    float: 13,
  },
  {
    slug: "team-jacket",
    category: "apparel",
    priceCents: 18900,
    shots: ["store/jacket"],
    options: { kind: "size", values: sizes },
    wornBy: ["21", "08", "36"],
    float: 15,
  },
  { slug: "team-cap", category: "apparel", priceCents: 3900, shots: ["store/cap"], float: 11 },
]);

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}

export function productsIn(category: CategoryFilter) {
  return category === "all" ? products : products.filter((p) => p.category === category);
}

/** Flavours afloat each as their own can; everything else once. */
export type FloatItem = { product: Product; option?: ProductOption; shot: ImageKey };

export function floatItems(category: CategoryFilter): FloatItem[] {
  return productsIn(category).flatMap((product) =>
    product.options?.kind === "flavour"
      ? product.options.values.map((option) => ({ product, option, shot: option.shot ?? product.shots[0] }))
      : [{ product, shot: product.shots[0] }],
  );
}

/** Three more from the same part of the store first, then from the rest. */
export function relatedProducts(product: Product, count = 3) {
  const same = products.filter((p) => p.category === product.category && p.slug !== product.slug);
  const rest = products.filter((p) => p.category !== product.category);
  return [...same, ...rest].slice(0, count);
}

export function shippingFor(subtotalCents: number, speed: keyof typeof SHIPPING_CENTS = "standard") {
  if (subtotalCents === 0) return 0;
  if (speed === "standard" && subtotalCents >= FREE_SHIPPING_CENTS) return 0;
  return SHIPPING_CENTS[speed];
}
