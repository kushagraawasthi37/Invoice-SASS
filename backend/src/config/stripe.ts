import Stripe from "stripe";
import { env } from "./env";

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

export const FREE_PDF_LIMIT = 5;
export const FREE_CUSTOM_TEMPLATES_LIMIT = 1;

export const PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    pdfLimit: FREE_PDF_LIMIT,
    features: [
      "5 PDF downloads",
      "1 custom template",
      "System templates",
      "All invoice types",
    ],
  },
  PRO_MONTHLY: {
    name: "Pro Monthly",
    price: 29,
    pdfLimit: Infinity,
    stripePriceId: env.STRIPE_PRO_MONTHLY_PRICE_ID,
    features: [
      "Unlimited PDF downloads",
      "Custom branding",
      "All templates",
      "Priority support",
    ],
  },
  PRO_YEARLY: {
    name: "Pro Yearly",
    price: 290,
    pdfLimit: Infinity,
    stripePriceId: env.STRIPE_PRO_YEARLY_PRICE_ID,
    features: ["Everything in Pro", "2 months free", "Yearly invoice"],
  },
} as const;
