// Valida somente obtenção de tokens. Não consulta contribuinte nem exibe tokens.
import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
let base = resolve('secrets'), product = 'all';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--secrets-dir' && args[i + 1]) base = resolve(args[++i]);
  else if (args[i] === '--product' && args[i + 1]) product = args[++i];
  else { console.error('Uso: --secrets-dir PASTA --product integra|divida-ativa|all'); process.exit(2); }
}
if (!['integra', 'divida-ativa', 'all'].includes(product)) process.exit(2);
const definitions = [
  { product: 'integra', folder: 'serpro', url: 'https://autenticacao.sapi.serpro.gov.br/authenticate', certificate: true },
  { product: 'divida-ativa', folder: 'serpro-divida-ativa', url: 'https://gateway.apiserpro.serpro.gov.br/token', certificate: false },
];
async function validate(item) {
  let pfx;
  try {
    const directory = join(base, item.folder);
    const key = (await readFile(join(directory, 'consumer-key'), 'utf8')).trim();
    const secret = (await readFile(join(directory, 'consumer-secret'), 'utf8')).trim();
    if (!key || !secret) return { product: item.product, ok: false, error: 'credentials_empty' };
    let tls = {};
    if (item.certificate) {
      pfx = await readFile(join(directory, 'certificate.pfx'));
      tls = { pfx, passphrase: (await readFile(join(directory, 'passphrase'), 'utf8')).trim() };
    }
    return await new Promise((resolveResult) => {
      const body = 'grant_type=client_credentials';
      const req = request(item.url, {
        method: 'POST', ...tls, rejectUnauthorized: true,
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...(item.certificate ? { 'Role-Type': 'TERCEIROS' } : {}) },
      }, res => {
        let length = 0; const chunks = [];
        res.on('data', chunk => { length += chunk.length; if (length > 1024 * 1024) req.destroy(); else chunks.push(chunk); });
        res.on('error', () => resolveResult({ product: item.product, ok: false, error: 'response_interrupted' }));
        res.on('end', () => {
          let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { data = {}; }
          const bearer = typeof data.access_token === 'string' && data.access_token.length > 0;
          const jwt = typeof data.jwt_token === 'string' && data.jwt_token.length > 0;
          const ok = res.statusCode === 200 && bearer && (!item.certificate || jwt);
          const result = { product: item.product, ok, status: res.statusCode, bearerReceived: bearer, ...(item.certificate ? { jwtReceived: jwt } : {}), ...(ok && Number.isFinite(data.expires_in) ? { expiresInSeconds: data.expires_in } : {}) };
          if (!ok) result.error = ['invalid_client', 'invalid_grant', 'unauthorized_client', 'invalid_request'].includes(data.error) ? data.error : 'authentication_rejected_or_invalid';
          resolveResult(result);
        });
      });
      req.on('error', e => resolveResult({ product: item.product, ok: false, error: ['ABORT_ERR', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_OSSL_UNSUPPORTED'].includes(e.code) ? e.code : 'network_or_certificate_error' }));
      req.end(body);
    });
  } catch { return { product: item.product, ok: false, error: 'credentials_certificate_or_runtime_unavailable' }; }
  finally { pfx?.fill(0); }
}
for (const definition of definitions.filter(d => product === 'all' || product === d.product)) {
  const result = await validate(definition); console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
}
