/**
 * Browser-side view of the quota payload.
 *
 * This mirrors the host contract in `src/quota.ts` — deliberately narrowed to
 * the fields {@link NeuralwattSection} renders, since the client bundle cannot
 * import the host module. There is no compile-time link between the two, so if
 * the host shape changes, update both (and the `assertQuota` validator, which
 * is what actually rejects a mismatch at runtime).
 */
export interface NeuralwattQuotas {
  snapshot_at: string
  balance: {
    credits_remaining_usd: number
    total_credits_usd: number
    credits_used_usd: number
    accounting_method: string
  }
  usage: {
    current_month: { cost_usd: number; requests: number; tokens: number; energy_kwh: number }
  }
  limits: { rate_limit_tier: string }
  subscription: null | {
    plan: string
    status: string
    current_period_end: string
    kwh_remaining: number
    kwh_used: number
    kwh_included: number
    in_overage: boolean
  }
  key: { name: string; allowance: null | { limit_usd: number; remaining_usd: number; spent_usd: number; period: string; blocked: boolean } }
}
