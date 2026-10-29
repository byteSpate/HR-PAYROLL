import type { ExchangeRate, ExchangeRateInput } from '@erp/contracts/exchange';
import { api } from '@/lib/api-client';

// The settings panel copied from HR-MNG-V1 threads an access token through every call. The shared
// client already attaches it, so these keep the original's signatures and ignore the first argument.
export const listExchangeRates = (_accessToken: string) => api.request<ExchangeRate[]>('/exchange-rates');
export const createExchangeRate = (_accessToken: string, input: ExchangeRateInput) =>
  api.request<ExchangeRate>('/exchange-rates', { method: 'POST', body: input });
export const updateExchangeRate = (_accessToken: string, id: string, input: ExchangeRateInput) =>
  api.request<ExchangeRate>(`/exchange-rates/${id}`, { method: 'PATCH', body: input });
