import { getStripeClient } from "@/server/modules/billing/stripe.client";

export type StripeOfferResolution = {
  found: boolean;
  offerKey: string;
  priceId: string | null;
  currency: string | null;
  unitAmount: number | null;
};

export async function resolveStripeOfferKey(
  offerKey: string,
): Promise<StripeOfferResolution> {
  const stripe = getStripeClient();

  if (!stripe) {
    return {
      found: false,
      offerKey,
      priceId: null,
      currency: null,
      unitAmount: null,
    };
  }

  const prices = await stripe.prices.list({
    lookup_keys: [offerKey],
    active: true,
    limit: 1,
  });

  const price = prices.data[0];

  if (!price) {
    return {
      found: false,
      offerKey,
      priceId: null,
      currency: null,
      unitAmount: null,
    };
  }

  return {
    found: true,
    offerKey,
    priceId: price.id,
    currency: price.currency ?? null,
    unitAmount: price.unit_amount ?? null,
  };
}