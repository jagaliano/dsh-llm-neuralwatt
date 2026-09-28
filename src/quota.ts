import { attributionHeaders } from '@deepseek-ai/dsh-llm'

export interface NeuralwattQuotas {
  snapshot_at: string
  balance: { credits_remaining_usd: number; total_credits_usd: number; credits_used_usd: number; accounting_method: string }
  usage: { lifetime: QuotaUsage; current_month: QuotaUsage }
  limits: { overage_limit_usd: number | null; rate_limit_tier: string }
  subscription: NeuralwattSubscription | null
  key: { name: string; allowance: NeuralwattKeyAllowance | null }
}

export interface QuotaUsage { cost_usd: number; requests: number; tokens: number; energy_kwh: number }
export interface NeuralwattSubscription { plan: string; status: string; billing_interval: string; current_period_start: string; current_period_end: string; auto_renew: boolean; kwh_included: number; kwh_used: number; kwh_remaining: number; in_overage: boolean }
export interface NeuralwattKeyAllowance { limit_usd: number; period: string; spent_usd: number; remaining_usd: number; blocked: boolean }
export interface NeuralwattHeaderQuota { allowanceRemainingUsd: number; budgetRemainingUsd: number; requestCostUsd: number; cacheSavingsUsd: number; subscriptionPlan: string; energyIncluded?: number; energyRemaining?: number; energyUsed?: number }

export function parseQuotaHeaders(headers: Headers): NeuralwattHeaderQuota | undefined {
  const remaining = headers.get('x-allowance-remaining-usd')
  if (remaining === null) return undefined
  const parse = (value: string | null): number | undefined => {
    const parsed = value === null ? Number.NaN : Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const energyIncluded = parse(headers.get('x-energy-included'))
  const energyRemaining = parse(headers.get('x-energy-remaining'))
  const energyUsed = parse(headers.get('x-energy-used'))
  return {
    allowanceRemainingUsd: parse(remaining) ?? 0,
    budgetRemainingUsd: parse(headers.get('x-budget-remaining-usd')) ?? 0,
    requestCostUsd: parse(headers.get('x-request-cost-usd')) ?? 0,
    cacheSavingsUsd: parse(headers.get('x-cache-savings-usd')) ?? 0,
    subscriptionPlan: headers.get('x-subscription-plan') ?? 'none',
    ...(energyIncluded === undefined ? {} : { energyIncluded }),
    ...(energyRemaining === undefined ? {} : { energyRemaining }),
    ...(energyUsed === undefined ? {} : { energyUsed }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validUsage(value: unknown): value is QuotaUsage {
  return isRecord(value) && isFiniteNumber(value.cost_usd) && isFiniteNumber(value.requests)
    && isFiniteNumber(value.tokens) && isFiniteNumber(value.energy_kwh)
}

/**
 * Validate the subscription summary the quota panel renders.
 *
 * Only the fields that panel dereferences on a non-null `subscription` are
 * required: it formats these as numbers and reads `current_period_end.length`,
 * so a partially-shaped object (a gateway that omits the energy block) would
 * throw mid-render — a React render crash, not a catchable fetch error.
 */
function validSubscription(value: unknown): boolean {
  return value === null || (
    isRecord(value)
    && typeof value.plan === 'string'
    && isFiniteNumber(value.kwh_used)
    && isFiniteNumber(value.kwh_included)
    && isFiniteNumber(value.kwh_remaining)
    && typeof value.current_period_end === 'string'
  )
}

/** Validate the API-key allowance the panel formats as numbers. */
function validKey(value: unknown): boolean {
  if (!isRecord(value)) return false
  const allowance = value.allowance
  return allowance === null || (
    isRecord(allowance)
    && isFiniteNumber(allowance.limit_usd)
    && isFiniteNumber(allowance.spent_usd)
    && isFiniteNumber(allowance.remaining_usd)
    && typeof allowance.period === 'string'
  )
}

function assertQuota(value: unknown): asserts value is NeuralwattQuotas {
  if (!isRecord(value) || !isRecord(value.balance) || !isRecord(value.usage) || !isRecord(value.limits)
    || !validUsage(value.usage.current_month) || !validUsage(value.usage.lifetime)
    || !isFiniteNumber(value.balance.credits_remaining_usd) || !isFiniteNumber(value.balance.total_credits_usd)
    || !isFiniteNumber(value.balance.credits_used_usd) || typeof value.balance.accounting_method !== 'string'
    || typeof value.limits.rate_limit_tier !== 'string'
    || typeof value.snapshot_at !== 'string'
    || !validSubscription(value.subscription)
    || !validKey(value.key)) {
    throw new Error('Neuralwatt quota response has an invalid shape')
  }
}

function errorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  if (typeof body.error === 'string' && body.error.length > 0) return body.error
  if (isRecord(body.error) && typeof body.error.message === 'string' && body.error.message.length > 0) return body.error.message
  return undefined
}

export async function fetchQuotas(baseURL: string, apiKey: string, signal: AbortSignal): Promise<NeuralwattQuotas> {
  const response = await fetch(`${baseURL}/quota`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json', ...attributionHeaders() },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  })
  if (!response.ok) {
    let message = response.statusText
    try { message = errorMessage(await response.json()) ?? message } catch { /* retain status text */ }
    throw new Error(`Neuralwatt quota request failed (HTTP ${response.status}): ${message || 'Unknown error'}`)
  }
  const quota: unknown = await response.json()
  assertQuota(quota)
  return quota
}
