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
