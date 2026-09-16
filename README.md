# Sentinel

Sentinel is a policy evaluation and revocation console for financial-agent operators. It presents a scenario-by-policy matrix, lets operators tune a local evaluation mandate, and records a commitment to one selected result through the deployed SentinelRegistry contract.

The decision product is the evaluation: inspect the failed input, rule, evidence, and result before deciding what—if anything—to record. Sentinel focuses on pre-execution policy evidence and the registry's narrow decision/revocation record, rather than payment settlement or transaction tracing.

## Run locally

Requirements: Node.js `24.12.0` and npm `11.6.2` (pinned in `.node-version` and `package.json`). Copy `.env.example` to `.env`, then run:

```sh
npm ci
npm test
npm run typecheck
npm run build
npm start
```

The server binds `0.0.0.0:$PORT` (default `4313`), serves the built app, provides `/healthz` with a revision, and supports `/evaluations`, `/policies`, and `/authority` deep links. API reads use the configured BOT Chain RPC server-side.

## Current testnet deployment

- Network: BOT Chain Testnet, chain ID `968` (`0x3c8`), native token `BOT`.
- RPC: `https://rpc.bohr.life`.
- Contract: `SentinelRegistry` at `0x6a10F724D5102a75D53f53Ee16e449385e137f53`.
- Operator: `0x8aab2e27bd9ce18ca44722cce48adcc10df0c4c4` (read from contract; only this address can write).
- Deployment transaction: `0x24591cc3de2fd199d8fde26b282574fda524f8daa7f9e174a76285002d5adfee`.
- Verified source/evidence: [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md); explorer [contract page](https://scan.bohr.life/address/0x6a10f724d5102a75d53f53ee16e449385e137f53).

The UI reads `eth_chainId`, `eth_blockNumber`, `eth_getCode`, `operator()`, `revoked()`, `lastDecision()`, and decision/revocation events. The contract has no policy-setting function. Policy edits stay in browser local storage, scoped by chain, contract, and account.

## Write boundary

Public reads do not need a wallet. `recordDecision` and `revoke` require an injected EVM wallet, the configured operator account, and BOT Chain Testnet. Each explicit action is ABI encoded, simulated with `eth_call`, gas-estimated, then submitted only after the user chooses the action and confirms in their wallet. Transaction rejection, pending, timeout, revert, and confirmation are distinguished in the UI.

The registry stores a decision hash/outcome and a permanent revocation flag. A hash is a commitment, not proof the underlying agent request was true, completed, or executed. Revoking this registry does not revoke token allowances or stop unrelated wallets, agents, or strategies. No private key is stored or used by Sentinel.

## Honest data boundaries

Scenario rows are deterministic local fixtures, not real agent outputs. No market feed, external agent, oracle, independent prover, or BOT Chain financial execution service is integrated. On-chain events are labeled separately from local runs; a connected wallet never causes an automatic transaction.

## Testnet proof checklist

- [x] Deployment transaction hash and verified contract source documented.
- [x] Contract address and operator read back from BOT Chain Testnet.
- [ ] Wallet owner reviews registry state and confirms the connected account.
- [ ] Explicitly test one `recordDecision` through the DApp and confirm its transaction/event in the explorer.
- [ ] Explicitly test `revoke` only with operator approval; confirm the irreversible registry flag and post-revocation write rejection.
- [ ] Preserve clean-browser screenshots/receipts for the reviewed user flow. Do not call fixture evidence a live agent evaluation.

## Railway

Set `PORT` through the platform and configure `BOTCHAIN_RPC_URL`, `SENTINEL_CONTRACT_ADDRESS`, `SENTINEL_DEPLOYMENT_BLOCK`, and (if needed) `SENTINEL_EXPLORER_URL`. `.env.example` uses the verified testnet deployment. Build command: `npm ci && npm run build`. Start command: `npm start`. Health path: `/healthz`. Build/start do not deploy the service.
