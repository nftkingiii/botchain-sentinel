export const CONTRACT = Object.freeze({
  chainId: 968,
  address: '0x6a10F724D5102a75D53f53Ee16e449385e137f53',
  selectors: Object.freeze({ recordDecision: '0x4f0cda30', revoke: '0xc2664610' })
});

const validBytes32 = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/** @typedef {{operator:string, revoked:boolean}} RegistryState */
/** @param {string|null} account @param {number|null} chainId @param {RegistryState|null} registry */
export function canOperate(account, chainId, registry) {
  return Boolean(account && registry && chainId === CONTRACT.chainId && !registry.revoked && /^0x[0-9a-fA-F]{40}$/.test(registry.operator) && account.toLowerCase() === registry.operator.toLowerCase());
}

export function encodeDecision(decisionId, allowed, reasonHash) {
  if (!validBytes32(decisionId) || !validBytes32(reasonHash) || typeof allowed !== 'boolean') throw new TypeError('Invalid decision calldata input');
  return `${CONTRACT.selectors.recordDecision}${decisionId.slice(2)}${allowed ? '1'.padStart(64, '0') : '0'.repeat(64)}${reasonHash.slice(2)}`;
}

export function encodeRevocation(decisionId, reasonHash) {
  if (!validBytes32(decisionId) || !validBytes32(reasonHash)) throw new TypeError('Invalid revocation calldata input');
  return `${CONTRACT.selectors.revoke}${decisionId.slice(2)}${reasonHash.slice(2)}`;
}
