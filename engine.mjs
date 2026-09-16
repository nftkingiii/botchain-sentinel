export const DEFAULT_POLICY = Object.freeze({ maxNotional: 1000, maxSlippageBps: 40, allowedVenues: ['BOT-DEX'], requireReason: true });

export const SCENARIOS = Object.freeze([
  { id: 'S-014', name: 'Routine rebalance', input: { venue: 'BOT-DEX', notional: 420, slippageBps: 18, reason: 'Restore target weights after inflow' }, evidence: 'fixture · balanced inventory · no external market data' },
  { id: 'S-018', name: 'Venue substitution', input: { venue: 'NORTHSTAR', notional: 320, slippageBps: 12, reason: 'Primary route unavailable' }, evidence: 'fixture · venue is outside the configured allowlist' },
  { id: 'S-021', name: 'Oversized order', input: { venue: 'BOT-DEX', notional: 1450, slippageBps: 22, reason: 'Single-step treasury rebalance' }, evidence: 'fixture · requested notional exceeds the mandate cap' },
  { id: 'S-027', name: 'Thin-book execution', input: { venue: 'BOT-DEX', notional: 280, slippageBps: 76, reason: 'Low-liquidity pool route' }, evidence: 'fixture · modeled quote exceeds slippage tolerance' },
  { id: 'S-033', name: 'Unexplained request', input: { venue: 'BOT-DEX', notional: 190, slippageBps: 8, reason: '' }, evidence: 'fixture · rationale field is empty' }
]);

export const RULES = Object.freeze([
  { id: 'venue', label: 'Venue allowlist' },
  { id: 'notional', label: 'Notional cap' },
  { id: 'slippage', label: 'Slippage ceiling' },
  { id: 'reason', label: 'Decision rationale' }
]);

export function evaluateScenario(scenario, policy = DEFAULT_POLICY) {
  const d = scenario.input;
  const checks = {
    venue: { pass: policy.allowedVenues.includes(d.venue), value: d.venue, limit: policy.allowedVenues.join(', ') },
    notional: { pass: Number.isFinite(d.notional) && d.notional > 0 && d.notional <= policy.maxNotional, value: `${d.notional} BOT`, limit: `≤ ${policy.maxNotional} BOT` },
    slippage: { pass: Number.isFinite(d.slippageBps) && d.slippageBps <= policy.maxSlippageBps, value: `${d.slippageBps} bps`, limit: `≤ ${policy.maxSlippageBps} bps` },
    reason: { pass: !policy.requireReason || Boolean(d.reason.trim()), value: d.reason || 'Missing', limit: policy.requireReason ? 'Required' : 'Optional' }
  };
  return { ...scenario, checks, allowed: Object.values(checks).every(c => c.pass), failedRules: Object.entries(checks).filter(([, c]) => !c.pass).map(([id]) => id) };
}

export function evaluateSuite(policy = DEFAULT_POLICY) {
  return SCENARIOS.map(scenario => evaluateScenario(scenario, policy));
}
