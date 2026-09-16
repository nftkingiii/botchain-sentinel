import test from 'node:test';
import assert from 'node:assert/strict';
import { canOperate, encodeDecision, encodeRevocation, CONTRACT } from '../contract.mjs';

const hash = `0x${'a'.repeat(64)}`;
const operator = '0x8aab2e27bd9ce18ca44722cce48adcc10df0c4c4';

test('decision and revocation calldata use deployed Solidity selectors and ABI words', () => {
  assert.equal(encodeDecision(hash, true, hash).slice(0, 10), '0x4f0cda30');
  assert.equal(encodeDecision(hash, false, hash).slice(74, 138), '0'.repeat(64));
  assert.equal(encodeRevocation(hash, hash).slice(0, 10), '0xc2664610');
  assert.equal(CONTRACT.chainId, 968);
});
test('operator check fails closed across account, network, and revocation boundaries', () => {
  const registry = { operator, revoked: false };
  assert.equal(canOperate(operator.toUpperCase().replace('0X', '0x'), 968, registry), true);
  assert.equal(canOperate('0x0000000000000000000000000000000000000001', 968, registry), false);
  assert.equal(canOperate(operator, 677, registry), false);
  assert.equal(canOperate(operator, 968, { ...registry, revoked: true }), false);
  assert.equal(canOperate(operator, 968, null), false);
});
test('malformed hashes cannot become transaction calldata', () => {
  assert.throws(() => encodeDecision('0x12', true, hash), /Invalid/);
  assert.throws(() => encodeRevocation(hash, 'nope'), /Invalid/);
});
