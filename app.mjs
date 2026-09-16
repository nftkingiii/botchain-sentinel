import { DEFAULT_POLICY, evaluateSuite, RULES } from './engine.mjs';
import { canOperate, encodeDecision, encodeRevocation } from './contract.mjs';

const $ = selector => document.querySelector(selector);
const ui = { view: $('#view'), notice: $('#notice'), title: $('#pageTitle'), description: $('#pageDescription'), heading: $('#headingActions'), strip: $('.authority-strip'), state: $('#contractState'), dot: $('#stateDot'), block: $('#blockNumber'), link: $('#contractLink'), wallet: $('#walletButton'), revision: $('#revision'), dialog: $('#confirmDialog') };
const info = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json());
const wallet = window.ethereum;
const state = { config: info, chain: null, account: null, contract: null, error: '', rows: [], selected: 'S-018', failedOnly: false, query: '', view: routeView(), localRuns: [], history: [], policy: structuredClone(DEFAULT_POLICY), pending: false };
const copy = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const short = value => value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—';

function routeView() {
  const path = location.pathname.split('/').filter(Boolean)[0];
  return ['evaluations', 'policies', 'authority'].includes(path) ? path : new URLSearchParams(location.search).get('view') || 'evaluations';
}
function persistPolicy() {
  const key = `sentinel:policy:${state.config.chainId}:${state.config.address || 'unconfigured'}:${state.account?.toLowerCase() || 'public'}`;
  localStorage.setItem(key, JSON.stringify(state.policy));
}
function loadPolicy() {
  const key = `sentinel:policy:${state.config.chainId}:${state.config.address || 'unconfigured'}:${state.account?.toLowerCase() || 'public'}`;
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved) state.policy = { ...DEFAULT_POLICY, ...saved }; }
  catch { state.policy = copy(DEFAULT_POLICY); }
  state.rows = evaluateSuite(state.policy);
}
function setNotice(message, kind = 'review') {
  ui.notice.hidden = !message;
  ui.notice.className = `notice ${kind}`;
  ui.notice.textContent = message || '';
}
function route(view, replace = false) {
  state.view = view;
  const next = `/${view}${location.search}`;
  history[replace ? 'replaceState' : 'pushState']({}, '', next);
  render();
}
function updateQuery() {
  const params = new URLSearchParams();
  params.set('view', state.view);
  if (state.failedOnly) params.set('failed', '1');
  if (state.query) params.set('q', state.query);
  if (state.selected) params.set('selected', state.selected);
  const next = `${location.pathname}?${params}`;
  history.replaceState({}, '', next);
}
function setViewHeader(title, description, action = '') {
  ui.title.textContent = title;
  ui.description.textContent = description;
  ui.heading.innerHTML = action;
}
function selectedRow() { return state.rows.find(row => row.id === state.selected) || state.rows[0]; }

function renderStrip() {
  const contract = state.contract;
  ui.strip.classList.toggle('is-revoked', Boolean(contract?.revoked));
  ui.strip.classList.toggle('is-active', Boolean(contract && !contract.revoked));
  ui.state.textContent = state.error ? 'Contract read unavailable' : contract?.revoked ? 'Registry revoked · records locked' : contract ? 'Registry active · external permissions unchanged' : 'Reading contract state…';
  ui.dot.setAttribute('aria-label', state.error ? 'Read error' : contract?.revoked ? 'Revoked' : contract ? 'Active' : 'Loading');
  ui.block.textContent = contract ? `Block ${contract.block.toLocaleString()}` : 'Block —';
  const address = info.address;
  ui.link.href = address ? `${info.explorer}/address/${address}` : '#';
  ui.link.title = address || 'Contract address not configured';
  $('#revision').textContent = `rev ${info.revision || 'local'}`;
  ui.wallet.textContent = state.account ? short(state.account) : 'Connect wallet';
  ui.wallet.title = state.account ? `Connected ${state.account} · disconnect this app` : 'Connect an injected EVM wallet';
  ui.wallet.setAttribute('aria-label', ui.wallet.title);
}

function cell(row, rule) {
  const c = row.checks[rule.id];
  return `<span class="cell ${c.pass ? 'pass' : 'fail'}">${c.pass ? 'Pass' : 'Fail'}</span>`;
}
function visibleRows() {
  return state.rows.filter(row => (!state.failedOnly || !row.allowed) && (!state.query || `${row.id} ${row.name} ${row.input.venue} ${row.evidence}`.toLowerCase().includes(state.query.toLowerCase())));
}
function renderDetail(row) {
  if (!row) return '<div class="empty-state">No scenario matches this filter. Clear the search or show all cases.</div>';
  const outcome = row.allowed ? '<span class="badge badge-pass">Pass · all rules</span>' : `<span class="badge badge-fail">Blocked · ${row.failedRules.length} ${row.failedRules.length === 1 ? 'rule' : 'rules'}</span>`;
  const checks = RULES.map(rule => `<div class="rule-line"><span>${esc(rule.label)}</span><strong class="${row.checks[rule.id].pass ? 'ok-text' : 'error-text'}">${row.checks[rule.id].pass ? 'Pass' : 'Fail'} · ${esc(row.checks[rule.id].limit)}</strong></div>`).join('');
  const canWrite = canOperate(state.account, state.chain, state.contract) && !state.pending;
  const recordLabel = row.allowed ? 'Record passing decision' : 'Record blocked decision';
  return `<div class="detail-head"><div><h2>${esc(row.name)}</h2><p>${esc(row.id)} · selected evidence</p></div>${outcome}</div>
    <div class="detail-block"><span class="detail-label">Request input · fixture</span><div class="input-pairs"><div class="pair"><span>Venue</span><strong>${esc(row.input.venue)}</strong></div><div class="pair"><span>Notional</span><strong>${esc(row.input.notional)} BOT</strong></div><div class="pair"><span>Slippage</span><strong>${esc(row.input.slippageBps)} bps</strong></div><div class="pair"><span>Rationale</span><strong>${esc(row.input.reason || 'Missing')}</strong></div></div></div>
    <div class="detail-block"><span class="detail-label">Rule evaluation · local policy</span><div class="rule-list">${checks}</div></div>
    <div class="detail-block"><span class="detail-label">Evidence source</span><p class="evidence-copy">${esc(row.evidence)}. This evaluation is local and deterministic; it is not a live agent call or transaction.</p></div>
    <div class="detail-actions"><button id="recordDecision" class="button button-small" ${canWrite ? '' : 'disabled'} title="Simulate contract call, then explicitly submit through connected wallet">${state.pending ? 'Transaction pending…' : recordLabel}</button><button id="viewAuthority" class="button button-small button-quiet" type="button">Authority details</button></div>
    <p class="tiny-note">A recorded hash commits to these inputs and the outcome; it does not prove the request was executed or that external policy was enforced.</p>`;
}

function renderEvaluations() {
  setViewHeader('Evaluations', 'Check each proposal against the active mandate. Failed evidence stays visible.', '<button id="runEvaluation" class="button button-small" title="Re-run deterministic local scenarios">Run scenarios</button><button id="exportCsv" class="button button-quiet button-small" title="Download visible cases as CSV">Export CSV</button>');
  const rows = visibleRows();
  if (rows.length && !rows.some(row => row.id === state.selected)) state.selected = rows[0].id;
  const tableRows = rows.map(row => `<tr data-row="${row.id}" tabindex="0" aria-label="Select ${esc(row.name)}, ${row.allowed ? 'pass' : 'blocked'}" aria-selected="${row.id === state.selected}"><td><span class="scenario-name">${esc(row.name)}</span><span class="scenario-id">${row.id}</span></td>${RULES.map(rule => `<td>${cell(row, rule)}</td>`).join('')}<td><span class="row-result ${row.allowed ? 'pass' : 'fail'}">${row.allowed ? 'Pass' : 'Blocked'}</span></td></tr>`).join('');
  ui.view.innerHTML = `<div class="eval-toolbar"><input class="search" id="searchScenarios" type="search" value="${esc(state.query)}" placeholder="Search cases, venue, evidence" aria-label="Search scenarios"><button id="filterFailed" class="filter-toggle" aria-pressed="${state.failedOnly}" type="button">Failed cases only</button><span class="result-count">${rows.length} of ${state.rows.length} scenarios</span></div>
  <div class="eval-layout"><section class="matrix-section" aria-label="Scenario by policy matrix"><div class="matrix-caption"><span>Scenario × active policy</span><span class="local-tag">Local evaluation</span></div><div class="matrix-scroll"><table><thead><tr><th>Scenario</th>${RULES.map(r => `<th>${esc(r.label)}</th>`).join('')}<th>Decision</th></tr></thead><tbody>${tableRows || ''}</tbody></table>${rows.length ? '' : '<div class="empty-state">No matching scenarios. Clear the search or turn off the failure filter.</div>'}</div></section><aside class="detail" aria-label="Selected scenario detail">${renderDetail(rows.some(r => r.id === state.selected) ? selectedRow() : rows[0])}</aside></div>
  <div class="footer-note"><span>Fixed fixtures · no external model, oracle, agent, or live market feed is connected.</span><span>Policy saved locally for this chain, contract, and account.</span></div>`;
  $('#searchScenarios').addEventListener('input', event => { state.query = event.target.value; const match = visibleRows(); if (!match.some(row => row.id === state.selected)) state.selected = match[0]?.id || ''; updateQuery(); renderEvaluations(); $('#searchScenarios').focus(); $('#searchScenarios').setSelectionRange(state.query.length, state.query.length); });
  $('#filterFailed').addEventListener('click', () => { state.failedOnly = !state.failedOnly; const match = visibleRows(); if (!match.some(row => row.id === state.selected)) state.selected = match[0]?.id || ''; updateQuery(); renderEvaluations(); });
  ui.view.querySelectorAll('tbody tr').forEach(tr => {
    const select = () => { state.selected = tr.dataset.row; updateQuery(); renderEvaluations(); };
    tr.addEventListener('click', select);
    tr.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  });
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#runEvaluation').addEventListener('click', () => { state.rows = evaluateSuite(state.policy); state.localRuns.push({ at: Date.now(), total: state.rows.length, blocked: state.rows.filter(r => !r.allowed).length }); state.selected = state.rows.find(r => !r.allowed)?.id || state.rows[0]?.id; setNotice('Deterministic fixture suite completed locally. No agent or external data source was called.', 'success'); renderEvaluations(); });
  $('#viewAuthority').addEventListener('click', () => route('authority'));
  $('#recordDecision')?.addEventListener('click', () => recordCurrentDecision());
}

function renderPolicies() {
  setViewHeader('Policies', 'Set the local mandate used by the deterministic evaluation suite.', '<button id="exportPolicy" class="button button-quiet button-small">Export policy JSON</button>');
  ui.view.innerHTML = `<div class="policy-layout"><section><h2 class="section-title">Active local mandate</h2><p class="section-subtitle">These values change local scenario checks only. They are not written to the contract and do not enforce agent or wallet permissions.</p><div class="policy-list"><div class="policy-row"><div><strong>Allowed venue</strong><span>Venue identifiers permitted by this policy</span></div><strong class="policy-value">${esc(state.policy.allowedVenues.join(', '))}</strong></div><div class="policy-row"><div><strong>Maximum notional</strong><span>Upper bound per modeled request</span></div><strong class="policy-value">${esc(state.policy.maxNotional)} BOT</strong></div><div class="policy-row"><div><strong>Maximum slippage</strong><span>Quote tolerance before a request is blocked</span></div><strong class="policy-value">${esc(state.policy.maxSlippageBps)} bps</strong></div><div class="policy-row"><div><strong>Decision rationale</strong><span>Require an explanation for every request</span></div><strong class="policy-value">${state.policy.requireReason ? 'Required' : 'Optional'}</strong></div></div></section>
  <section><h2 class="section-title">Edit local mandate</h2><p class="section-subtitle">Saved in this browser, scoped to BOT Chain Testnet, this registry, and connected account.</p><form id="policyForm" class="policy-form"><label class="field">Allowed venue<input name="venue" maxlength="40" value="${esc(state.policy.allowedVenues[0])}" required></label><label class="field">Notional cap (BOT)<input name="notional" type="number" min="1" max="1000000" step="1" value="${esc(state.policy.maxNotional)}" required></label><label class="field">Slippage ceiling (bps)<input name="slippage" type="number" min="0" max="1000" step="1" value="${esc(state.policy.maxSlippageBps)}" required></label><label class="field">Rationale rule<select name="reason"><option value="required" ${state.policy.requireReason ? 'selected' : ''}>Required</option><option value="optional" ${!state.policy.requireReason ? 'selected' : ''}>Optional</option></select></label><button class="button" type="submit">Save local policy</button></form><p class="source-note">The deployed contract accepts decision commitments and revocation records. It has no policy configuration function; Sentinel does not pretend otherwise.</p></section></div>`;
  $('#policyForm').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const venue = String(form.get('venue')).trim(); const notional = Number(form.get('notional')); const slippage = Number(form.get('slippage'));
    if (!venue || !Number.isFinite(notional) || notional <= 0 || !Number.isInteger(slippage) || slippage < 0 || slippage > 1000) return setNotice('Check the venue, positive notional cap, and integer slippage value from 0 to 1000.', 'error');
    state.policy = { maxNotional: notional, maxSlippageBps: slippage, allowedVenues: [venue], requireReason: form.get('reason') === 'required' };
    persistPolicy(); state.rows = evaluateSuite(state.policy); state.localRuns.push({ at: Date.now(), total: state.rows.length, blocked: state.rows.filter(r => !r.allowed).length }); setNotice('Local policy saved. Scenario outcomes have been recalculated; nothing was written on-chain.', 'success'); render();
  });
  $('#exportPolicy').addEventListener('click', () => download('sentinel-policy.json', JSON.stringify({ scope: 'local-only', chainId: info.chainId, contract: info.address, policy: state.policy }, null, 2), 'application/json'));
}

function renderAuthority() {
  const canRevoke = canOperate(state.account, state.chain, state.contract) && !state.pending;
  const authorityActions = `${state.account && state.chain !== info.chainId ? '<button id="switchChain" class="button button-small">Switch to testnet</button>' : ''}${canRevoke ? '<button id="revokeAuthority" class="button button-danger button-small">Revoke registry</button>' : ''}<button id="refreshChain" class="button button-quiet button-small">Refresh reads</button>`;
  setViewHeader('Authority', 'Read the registry and separate local evaluations from operator-recorded contract events.', authorityActions);
  const c = state.contract;
  const reads = c ? `<div class="authority-facts"><div class="authority-fact"><span>Contract address</span><strong><code>${esc(info.address)}</code></strong></div><div class="authority-fact"><span>Network</span><strong>BOT Chain Testnet · 968</strong></div><div class="authority-fact"><span>Configured operator</span><strong><code>${esc(c.operator)}</code></strong></div><div class="authority-fact"><span>Connected account</span><strong><code>${esc(state.account || 'Not connected')}</code></strong></div><div class="authority-fact"><span>Revocation flag</span><strong class="${c.revoked ? 'error-text' : 'ok-text'}">${c.revoked ? 'Revoked — writes locked' : 'Not revoked'}</strong></div><div class="authority-fact"><span>Last decision hash</span><strong><code>${esc(c.lastDecision)}</code></strong></div><div class="authority-fact"><span>Code at address</span><strong>${c.codeBytes.toLocaleString()} bytes · read at block ${c.block.toLocaleString()}</strong></div><div class="authority-fact"><span>Deployment transaction</span><strong><a href="${esc(info.explorer)}/tx/0x24591cc3de2fd199d8fde26b282574fda524f8daa7f9e174a76285002d5adfee" target="_blank" rel="noreferrer">Verified testnet deployment ↗</a></strong></div></div>` : `<p class="error-text">${esc(state.error || 'Waiting for contract read…')}</p>`;
  const onchain = state.history.map(event => {
    const revoke = event.topic === '0x57b86047e5d68076bdaa91409b82d607632d34eb68e31568d9d7ffff2b006ef4';
    const decisionId = event.decisionId;
    const allowed = !revoke && event.data.slice(2, 66).endsWith('1');
    return `<div class="timeline-item onchain ${revoke ? 'revocation' : ''}"><strong>${revoke ? 'Authority revocation recorded' : `Decision recorded · ${allowed ? 'allowed' : 'blocked'}`}</strong><p>Block ${event.block.toLocaleString()} · decision ${esc(short(decisionId))}</p><a href="${esc(info.explorer)}/tx/${esc(event.transactionHash)}" target="_blank" rel="noreferrer">Open transaction ${esc(short(event.transactionHash))} ↗</a></div>`;
  }).join('');
  const locals = state.localRuns.slice().reverse().map(run => `<div class="timeline-item local"><strong>Local scenario evaluation</strong><p>${new Date(run.at).toLocaleString()} · ${run.blocked} blocked of ${run.total} fixtures · not a contract write</p></div>`).join('');
  ui.view.innerHTML = `<div class="authority-layout"><section><h2 class="section-title">Registry state · read-only</h2><p class="section-subtitle">Public reads work without a connected wallet. Contract writes are available only to the configured operator.</p>${reads}<div class="callout">This contract records hashes and a single revocation flag. It does not revoke ERC-20 allowances, pause a strategy, or control external agent execution.</div></section><section><h2 class="section-title">Evidence history</h2><p class="section-subtitle">On-chain events and browser-local evaluation runs are labeled separately.</p><div class="event-list timeline">${onchain}${locals}${!onchain && !locals ? '<div class="empty-state">No decision/revocation events or local runs recorded in this browser yet.</div>' : ''}</div>${state.history.length && state.history.truncated ? '<p class="tiny-note">Event query is limited to the most recent 25,000 blocks.</p>' : ''}</section></div>`;
  $('#refreshChain').addEventListener('click', () => refreshReads(true));
  $('#switchChain')?.addEventListener('click', switchNetwork);
  $('#revokeAuthority')?.addEventListener('click', requestRevocation);
}

function render() {
  document.querySelectorAll('.tabs a').forEach(link => { if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  renderStrip();
  if (state.view === 'policies') renderPolicies();
  else if (state.view === 'authority') renderAuthority();
  else renderEvaluations();
}

function exportCsv() {
  const columns = ['scenario_id', 'scenario', ...RULES.map(r => r.id), 'decision', 'evidence'];
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  const lines = [columns.map(quote).join(','), ...visibleRows().map(row => [row.id, row.name, ...RULES.map(r => row.checks[r.id].pass ? 'pass' : 'fail'), row.allowed ? 'pass' : 'blocked', row.evidence].map(quote).join(','))];
  download('sentinel-evaluations.csv', lines.join('\r\n'), 'text/csv');
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

async function refreshReads(showMessage = false) {
  state.error = '';
  try {
    const [status, historyResult] = await Promise.all([fetch('/api/status', { cache: 'no-store' }), fetch('/api/history', { cache: 'no-store' })]);
    const payload = await status.json(); if (!status.ok) throw new Error(payload.error || 'Unable to read Sentinel contract');
    const historyPayload = await historyResult.json(); if (!historyResult.ok) throw new Error(historyPayload.error || 'Unable to read contract event history');
    state.contract = payload; state.history = historyPayload.events || [];
    if (state.chain && state.chain !== info.chainId) state.error = `Wallet is connected to chain ${state.chain}; switch to testnet 968 for writing.`;
    if (showMessage) setNotice('Contract state and event history refreshed from BOT Chain Testnet.', 'success');
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Contract read failed';
    state.contract = null;
    if (showMessage) setNotice(`Read failed: ${state.error}`, 'error');
  }
  render();
}

async function connectWallet() {
  if (!wallet?.request) return setNotice('No injected EVM wallet found. Public contract reads remain available without connecting.', 'error');
  if (state.account) { sessionStorage.setItem('sentinel:disconnected', '1'); state.account = null; state.chain = null; state.query = ''; state.failedOnly = false; loadPolicy(); setNotice('Disconnected from Sentinel. Your wallet’s site permission was not changed.', 'success'); render(); return; }
  try {
    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
    sessionStorage.removeItem('sentinel:disconnected');
    state.account = accounts[0] || null;
    state.chain = Number.parseInt(await wallet.request({ method: 'eth_chainId' }), 16);
    state.query = ''; state.failedOnly = false; loadPolicy();
    if (state.chain !== info.chainId) setNotice(`Connected on chain ${state.chain}. Switch to BOT Chain Testnet (968) before writing.`, 'review');
    else if (state.contract && state.account.toLowerCase() !== state.contract.operator.toLowerCase()) setNotice(`Connected account is not the configured operator ${short(state.contract.operator)}. Public reads work; registry writes are disabled.`, 'review');
    else setNotice('Wallet connected. No transaction has been requested.', 'success');
    render();
  } catch (error) {
    setNotice(error?.code === 4001 ? 'Wallet connection was rejected.' : 'Wallet connection failed. Public reads remain available.', 'error');
  }
}

async function switchNetwork() {
  if (!wallet?.request) return;
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x3c8' }] });
  } catch (error) {
    if (error?.code !== 4902) { setNotice(error?.code === 4001 ? 'Network switch was rejected.' : 'Could not switch network.', 'error'); return; }
    try {
      await wallet.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x3c8', chainName: 'BOT Chain Testnet', rpcUrls: [info.rpcUrl], nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, blockExplorerUrls: [info.explorer] }] });
    } catch (addError) { setNotice(addError?.code === 4001 ? 'Adding BOT Chain Testnet was rejected.' : 'Could not add BOT Chain Testnet.', 'error'); }
  }
}

async function hashText(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `0x${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
}
const wordBool = value => value ? '1'.padStart(64, '0') : '0'.padStart(64, '0');
function requireWriteAccess() {
  if (!wallet?.request || !state.account) throw new Error('Connect an EVM wallet first.');
  if (state.chain !== info.chainId) throw new Error('Switch wallet to BOT Chain Testnet (968).');
  if (!state.contract) throw new Error('Contract state is unavailable; writes are disabled.');
  if (!canOperate(state.account, state.chain, state.contract)) throw new Error('Connected wallet is not the registry operator or registry writes are locked.');
  if (state.contract.revoked) throw new Error('Registry is revoked. Its contract blocks additional decisions.');
  if (!/^0x[0-9a-fA-F]{40}$/.test(info.address)) throw new Error('Contract address is not configured.');
}

async function simulateThenSend(data, action) {
  requireWriteAccess();
  state.pending = true; render();
  try {
    const simulation = await wallet.request({ method: 'eth_call', params: [{ from: state.account, to: info.address, data }, 'latest'] });
    if (typeof simulation !== 'string') throw new Error('Wallet simulation returned an invalid response.');
    const estimate = await wallet.request({ method: 'eth_estimateGas', params: [{ from: state.account, to: info.address, data }] });
    const gasLimit = `0x${(BigInt(estimate) * 120n / 100n).toString(16)}`;
    setNotice(`${action} simulated successfully (${BigInt(estimate).toLocaleString()} gas estimate). Confirm the transaction in your wallet to continue.`, 'review');
    const txHash = await wallet.request({ method: 'eth_sendTransaction', params: [{ from: state.account, to: info.address, data, gas: gasLimit }] });
    setNotice(`Transaction submitted ${short(txHash)}. Waiting for BOT Chain confirmation…`, 'review');
    let receipt;
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      receipt = await wallet.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
      if (receipt) break;
    }
    if (!receipt) throw new Error(`Confirmation timed out. Check transaction ${txHash} in explorer.`);
    if (BigInt(receipt.status) !== 1n) throw new Error(`Transaction reverted: ${txHash}`);
    setNotice(`Confirmed on BOT Chain Testnet · ${short(txHash)}. Refreshing verified reads.`, 'success');
    await refreshReads();
  } catch (error) {
    const message = error?.code === 4001 ? 'Transaction request rejected in wallet; no transaction was sent.' : error instanceof Error ? error.message : 'Transaction failed.';
    setNotice(message, 'error');
  } finally { state.pending = false; render(); }
}

async function recordCurrentDecision() {
  const row = selectedRow();
  if (!row) return;
  try { requireWriteAccess(); }
  catch (error) { setNotice(error.message, 'error'); return; }
  const decisionId = await hashText(JSON.stringify({ chainId: info.chainId, contract: info.address.toLowerCase(), scenario: row, policy: state.policy }));
  const reason = await hashText(row.allowed ? 'sentinel-policy-pass' : `sentinel-policy-block:${row.failedRules.join(',')}`);
  $('#dialogTitle').textContent = 'Record evaluation commitment';
  $('#dialogSummary').textContent = `${row.id} · ${row.name} will be recorded as ${row.allowed ? 'allowed by the local fixture policy' : 'blocked by the local fixture policy'}. The contract stores a hash and outcome only; this is not proof that an agent acted or that funds moved.`;
  $('#reasonWrap').hidden = true;
  $('#confirmAction').textContent = 'Simulate & request wallet confirmation';
  ui.dialog.showModal();
  $('#confirmForm').onsubmit = async event => {
    event.preventDefault(); ui.dialog.close();
    await simulateThenSend(encodeDecision(decisionId, row.allowed, reason), 'Recording a decision');
  };
}

async function requestRevocation() {
  try { requireWriteAccess(); }
  catch (error) { setNotice(error.message, 'error'); return; }
  const eligible = state.account && state.chain === info.chainId && state.contract && state.account.toLowerCase() === state.contract.operator.toLowerCase() && !state.contract.revoked;
  if (!eligible) return setNotice('Only the configured operator on BOT Chain Testnet can request revocation.', 'error');
  $('#dialogTitle').textContent = 'Revoke registry authority';
  $('#dialogSummary').textContent = 'This sets the registry’s revocation flag permanently. It blocks future recordDecision calls but cannot revoke token approvals, pause external strategies, or stop agents outside this contract.';
  $('#reasonWrap').hidden = false;
  $('#confirmAction').textContent = 'Simulate & request wallet confirmation';
  ui.dialog.showModal();
  $('#confirmForm').onsubmit = async event => {
    event.preventDefault();
    const reasonText = $('#revokeReason').value.trim();
    if (reasonText.length < 8) { $('#revokeReason').setCustomValidity('Enter a short, meaningful reason (at least 8 characters).'); $('#revokeReason').reportValidity(); return; }
    $('#revokeReason').setCustomValidity(''); ui.dialog.close();
    const decisionId = state.contract.lastDecision === `0x${'0'.repeat(64)}` ? await hashText(`sentinel-revocation:${Date.now()}`) : state.contract.lastDecision;
    const reason = await hashText(reasonText);
    await simulateThenSend(encodeRevocation(decisionId, reason), 'Revoking registry authority');
  };
}

document.querySelectorAll('.tabs a').forEach(a => a.addEventListener('click', event => { event.preventDefault(); route(a.dataset.view); }));
ui.wallet.addEventListener('click', connectWallet);
window.addEventListener('popstate', () => { state.view = routeView(); const params = new URLSearchParams(location.search); state.query = params.get('q') || ''; state.failedOnly = params.get('failed') === '1'; state.selected = params.get('selected') || 'S-018'; render(); });
window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (state.view !== 'evaluations') route('evaluations'); setTimeout(() => $('#searchScenarios')?.focus(), 0); } });
if (wallet?.on) {
  wallet.on('accountsChanged', accounts => { state.account = accounts[0] || null; if (state.account) sessionStorage.removeItem('sentinel:disconnected'); else sessionStorage.setItem('sentinel:disconnected', '1'); state.query = ''; state.failedOnly = false; loadPolicy(); setNotice(state.account ? 'Wallet account changed. Local policy/query scope updated.' : 'Wallet disconnected from Sentinel. Public reads remain available.', 'review'); render(); });
  wallet.on('chainChanged', chain => { state.chain = Number.parseInt(chain, 16); state.query = ''; state.failedOnly = false; setNotice(state.chain === info.chainId ? 'Wallet is on BOT Chain Testnet.' : `Wrong wallet network (${state.chain}). Switch to BOT Chain Testnet (968) to write.`, state.chain === info.chainId ? 'success' : 'review'); render(); });
}

$('#revokeReason').addEventListener('input', event => event.target.setCustomValidity(''));

const params = new URLSearchParams(location.search);
state.query = params.get('q') || '';
state.failedOnly = params.get('failed') === '1';
state.selected = params.get('selected') || 'S-018';
loadPolicy();
state.localRuns.push({ at: Date.now(), total: state.rows.length, blocked: state.rows.filter(r => !r.allowed).length });
render();
try { if (wallet?.request && !sessionStorage.getItem('sentinel:disconnected')) { const accounts = await wallet.request({ method: 'eth_accounts' }); state.account = accounts[0] || null; state.chain = Number.parseInt(await wallet.request({ method: 'eth_chainId' }), 16); loadPolicy(); } } catch { /* Passive wallet discovery must not block public reads. */ }
render();
await refreshReads();
