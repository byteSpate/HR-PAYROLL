// Wire types for the exchange rate screens, written once here and read by the API and the web app.
import type { Currency } from './schemas.js';

export interface ExchangeRate {
  id: string;
  base: Currency;
  quote: Currency;
  /** Six decimals, as stored: a rate is a ratio, not money, so two decimals would round it. */
  rate: string;
  effectiveFrom: string;
  createdBy: string;
  createdAt: string;
}

export interface ExchangeRateInput {
  base: Currency;
  quote: Currency;
  rate: string;
  effectiveFrom: string;
}
