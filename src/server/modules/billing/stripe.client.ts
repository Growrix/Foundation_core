import Stripe from "stripe";

import { getRuntimeEnv } from "@/server/config/env";

let cachedApiKey: string | null = null;
let cachedStripeClient: Stripe | null = null;

export function getStripeClient() {
  const env = getRuntimeEnv();

  if (!env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (cachedStripeClient && cachedApiKey === env.STRIPE_SECRET_KEY) {
    return cachedStripeClient;
  }

  cachedApiKey = env.STRIPE_SECRET_KEY;
  cachedStripeClient = new Stripe(env.STRIPE_SECRET_KEY);

  return cachedStripeClient;
}

export function resetStripeClientForTests() {
  cachedApiKey = null;
  cachedStripeClient = null;
}