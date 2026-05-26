type StandardEvent =
  | 'Lead'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'Purchase';

type EventParams = Record<string, string | number | boolean | string[] | undefined>;

function fbqCall(event: StandardEvent, params?: EventParams): void {
  if (typeof window === 'undefined') return;
  // @ts-expect-error -- fbq is injected by the Pixel snippet
  if (typeof window.fbq !== 'function') return;
  // @ts-expect-error -- fbq is injected by the Pixel snippet
  window.fbq('track', event, params);
}

export function trackRegistrationLead(params?: {
  team?: string;
  content_name?: string;
}): void {
  fbqCall('Lead', params);
}

export function trackRegistrationComplete(params?: {
  team?: string;
  content_name?: string;
  value?: number;
  currency?: string;
}): void {
  fbqCall('CompleteRegistration', params);
}

export function trackInitiateCheckout(params?: {
  value?: number;
  currency?: string;
  content_name?: string;
  num_items?: number;
}): void {
  fbqCall('InitiateCheckout', params);
}

export function trackPurchase(params: {
  value: number;
  currency: string;
  content_name?: string;
  content_ids?: string[];
  num_items?: number;
}): void {
  fbqCall('Purchase', params);
}
