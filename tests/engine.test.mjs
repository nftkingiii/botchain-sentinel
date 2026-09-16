import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, evaluateSuite, evaluateScenario, SCENARIOS } from '../engine.mjs';

test('scenario suite is repeatable and fixtures are visibly bounded', () => {
  assert.deepEqual(evaluateSuite(), evaluateSuite());
  assert.match(SCENARIOS[0].evidence, /fixture/);
});
test('known failure cases identify precise policy rules', () => {
  const rows = evaluateSuite();
  assert.equal(rows[0].allowed, true);
  assert.deepEqual(rows[1].failedRules, ['venue']);
  assert.deepEqual(rows[2].failedRules, ['notional']);
  assert.deepEqual(rows[3].failedRules, ['slippage']);
  assert.deepEqual(rows[4].failedRules, ['reason']);
});
test('a tightened rule fails closed on the selected fixture', () => {
  const row = evaluateScenario(SCENARIOS[0], { ...DEFAULT_POLICY, maxNotional: 400 });
  assert.equal(row.allowed, false);
  assert.equal(row.checks.notional.pass, false);
});
