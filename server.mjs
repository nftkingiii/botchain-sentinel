import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

try {
  const envText = await readFile('.env', 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* .env is optional; platform environment variables take precedence. */ }

const chainId = 968;
const rpcUrl = process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life';
const address = process.env.SENTINEL_CONTRACT_ADDRESS || '';
const deploymentBlock = Number(process.env.SENTINEL_DEPLOYMENT_BLOCK || '23591585');
const explorer = process.env.SENTINEL_EXPLORER_URL || 'https://scan.bohr.life';
const revision = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.REVISION || 'local';
const root = resolve(process.env.NODE_ENV === 'production' ? 'dist' : '.');
const staticFiles = new Set(['index.html', 'app.mjs', 'engine.mjs', 'contract.mjs', 'styles.css', 'overrides.css', 'favicon.svg', 'sentinel-mark.svg']);
const selectors = { operator: '0x570ca735', revoked: '0x63d256ce', lastDecision: '0x435dd5ca' };
const topics = {
  decision: '0xdcefb40b603eb96e6daf47c52e4282acec52d2f7a54bcab4d99c71605cae704a',
  revoke: '0x57b86047e5d68076bdaa91409b82d607632d34eb68e31568d9d7ffff2b006ef4'
};

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'RPC error');
  return payload.result;
}

async function contractCall(data) {
  return rpc('eth_call', [{ to: address, data }, 'latest']);
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://rpc.bohr.life; frame-ancestors 'none'; base-uri 'self'");
  try {
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, revision });
    if (url.pathname === '/api/config') return json(res, 200, { chainId, rpcUrl, address, deploymentBlock, explorer, revision });
    if (url.pathname === '/api/status') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return json(res, 503, { error: 'Sentinel contract address is not configured.' });
      const [chainHex, blockHex, code, operatorResult, revokedResult, decisionResult] = await Promise.all([
        rpc('eth_chainId'), rpc('eth_blockNumber'), rpc('eth_getCode', [address, 'latest']),
        contractCall(selectors.operator), contractCall(selectors.revoked), contractCall(selectors.lastDecision)
      ]);
      const actualChain = Number.parseInt(chainHex, 16);
      if (actualChain !== chainId) throw new Error(`Unexpected chain ID ${actualChain}`);
      if (code === '0x') throw new Error('No contract bytecode at configured address');
      return json(res, 200, { chainId: actualChain, block: Number.parseInt(blockHex, 16), codeBytes: (code.length - 2) / 2, operator: `0x${operatorResult.slice(-40)}`, revoked: BigInt(revokedResult) !== 0n, lastDecision: decisionResult });
    }
    if (url.pathname === '/api/history') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return json(res, 503, { error: 'Sentinel contract address is not configured.' });
      const latest = Number.parseInt(await rpc('eth_blockNumber'), 16);
      const from = Math.max(deploymentBlock, latest - 24_999);
      const logs = await rpc('eth_getLogs', [{ address, fromBlock: `0x${from.toString(16)}`, toBlock: 'latest', topics: [[topics.decision, topics.revoke]] }]);
      return json(res, 200, { fromBlock: from, truncated: from > deploymentBlock, events: logs.map(log => ({ block: Number.parseInt(log.blockNumber, 16), transactionHash: log.transactionHash, topic: log.topics[0], decisionId: log.topics[1], data: log.data })) });
    }
    const filename = url.pathname === '/' || /^\/(evaluations|policies|authority)\/?$/.test(url.pathname) ? 'index.html' : basename(decodeURIComponent(url.pathname));
    if (!staticFiles.has(filename)) return json(res, 404, { error: 'Not found' });
    const file = await readFile(resolve(root, filename));
    const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': `${types[filename.slice(filename.lastIndexOf('.'))]}; charset=utf-8` });
    res.end(file);
  } catch (error) {
    if (url.pathname.startsWith('/api/')) return json(res, 502, { error: error instanceof Error ? error.message : 'Read failed' });
    json(res, 404, { error: 'Not found' });
  }
});

const port = Number(process.env.PORT || 4313);
server.listen(port, '0.0.0.0', () => console.log(`Sentinel listening on 0.0.0.0:${port} (${revision})`));
