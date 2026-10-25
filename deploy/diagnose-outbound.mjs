// Read-only public GET/HEAD probes. No credentials, settings, files or transactions.
const probes = [
  ['fx-jsdelivr', 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', 6000, 'daily'],
  ['fx-cloudflare', 'https://latest.currency-api.pages.dev/v1/currencies/usd.json', 6000, 'daily'],
  ['fx-coinbase', 'https://api.coinbase.com/v2/exchange-rates?currency=USD', 3000, 'coinbase'],
  ['github-git', 'https://github.com/amirfassadi/RoyaHomeMadeFood.git/info/refs?service=git-upload-pack', 10000, 'git'],
  ['npm-package', 'https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.9.tgz', 8000, 'head'],
];
function errorCodes(error, depth = 0) {
  if (!error || depth > 4) return [];
  return [error.code, error.name, ...errorCodes(error.cause, depth + 1),
    ...(Array.isArray(error.errors) ? error.errors.flatMap(e => errorCodes(e, depth + 1)) : [])]
    .filter(v => typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v));
}
const diagnosticError = code => Object.assign(new Error(code), { code });
const currencyKeys = ['USD', 'USDT', 'EUR', 'GBP', 'AED', 'TRY', 'CAD'];
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), node: process.version, readOnly: true }));
await Promise.all(probes.map(async ([name, url, timeoutMs, kind]) => {
  const start = Date.now();
  const row = { name, host: new URL(url).hostname, timeoutMs };
  try {
    const response = await fetch(url, {
      method: kind === 'head' ? 'HEAD' : 'GET',
      credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    row.http = response.status;
    if (kind !== 'head') {
      const reader = response.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 256000) throw diagnosticError('BODY_LIMIT');
            chunks.push(part.value);
          }
        } finally { await reader.cancel().catch(() => {}); }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (response.ok && kind === 'git') {
        row.gitAdvertisement = (response.headers.get('content-type') || '')
          .includes('application/x-git-upload-pack-advertisement');
      } else if (response.ok) {
        let data;
        try { data = JSON.parse(body); } catch { throw diagnosticError('NON_JSON'); }
        const rates = kind === 'daily' ? data?.usd : data?.data?.rates;
        row.dataDate = kind === 'daily' ? data?.date ?? null : null;
        row.requiredRatesPresent = currencyKeys.every(key => {
          const value = Number(rates?.[kind === 'daily' ? key.toLowerCase() : key]);
          return Number.isFinite(value) && value > 0;
        });
      }
    }
  } catch (error) {
    row.errors = [...new Set(errorCodes(error))];
  }
  row.elapsedMs = Date.now() - start;
  console.log(JSON.stringify(row));
}));
