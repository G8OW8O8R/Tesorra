import { z } from "zod";

export const COUNTRIES = ["PL", "DE", "FR", "ES", "IT", "SE", "NL", "PT"] as const;
export const SPEEDS = ["standard", "express"] as const;

/** Error messages are keys into the checkout texts (`errors`). */
export type CheckoutError = "email" | "required" | "postcode" | "phone";

/** The demo checkout form. Checked in the browser only: nothing is ever sent. */
export const checkoutSchema = z.object({
  email: z.string().trim().pipe(z.email({ error: "email" })),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s]*$/, { error: "phone" }),
  name: z.string().trim().min(2, { error: "required" }),
  street: z.string().trim().min(3, { error: "required" }),
  postcode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/, { error: "postcode" }),
  city: z.string().trim().min(2, { error: "required" }),
  country: z.enum(COUNTRIES, { error: "required" }),
  speed: z.enum(SPEEDS, { error: "required" }),
});

export type CheckoutForm = z.input<typeof checkoutSchema>;
export type CheckoutField = keyof CheckoutForm;

/** First error of each field, as a message key. */
export function checkoutErrors(form: CheckoutForm): Partial<Record<CheckoutField, CheckoutError>> {
  const result = checkoutSchema.safeParse(form);
  if (result.success) return {};
  const errors: Partial<Record<CheckoutField, CheckoutError>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as CheckoutField;
    if (!errors[field]) errors[field] = (["email", "postcode", "phone"].includes(issue.message) ? issue.message : "required") as CheckoutError;
  }
  return errors;
}

/** An order number like TR-4K9Q2X, from the browser's random source. */
export function orderNumber(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `TR-${Array.from(random(6), (b) => alphabet[b % alphabet.length]).join("")}`;
}
