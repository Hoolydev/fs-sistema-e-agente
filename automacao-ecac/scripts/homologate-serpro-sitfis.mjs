// Execução administrativa explícita: uma solicitação SITFIS por run-id, sem WhatsApp/LLM.
import { request } from 'node:https';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../dist/src/config.js';
import { SerproSitfisClient, assertSerproConfiguration, SerproError } from '../dist/src/serpro/client.js';
import { LocalCertificateProvider } from '../dist/src/security/certificate-provider.js';
import { assertPdfTaxpayer } from '../dist/src/serpro/automation.js';
import { describePdf } from '../dist/src/rpa/federal-debt-flow.js';
import { isValidCnpj } from '../dist/src/orchestrator/parser.js';
const args = process.argv.slice(2);
const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const cnpj = option('--cnpj'), runId = option('--run-id');
if (!cnpj || !isValidCnpj(cnpj) || !runId || !/^[a-zA-Z0-9_-]{6,100}$/.test(runId)) {
  console.error('Informe --cnpj autorizado e --run-id único (letras/números/hífen).'); process.exit(2);
}
const config = loadConfig(); assertSerproConfiguration(config);
const folder = join('/app/data/homologacao', runId);
await mkdir(folder, { recursive: true, mode: 0o700 });
const guard = await open(join(folder, 'started.json'), 'wx', 0o600).catch(() => null);
if (!guard) { console.error('Run-id já iniciado: revisar evidências antes de qualquer nova consulta.'); process.exit(2); }
await guard.writeFile(JSON.stringify({ cnpj, startedAt: new Date().toISOString() })); await guard.close();
let sequence = 0;
const attempts = [];
const allowed = ['https://autenticacao.sapi.serpro.gov.br/authenticate', 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Apoiar', 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Emitir'];
const transport = input => new Promise((resolve, reject) => {
  if (!allowed.includes(input.url)) { reject(new Error('invalid_destination')); return; }
  const endpoint = input.url.split('/').pop();
  const req = request(input.url, { method: 'POST', headers: input.headers,
    ...(input.certificate ? { pfx: input.certificate.pfx, passphrase: input.certificate.passphrase } : {}),
    rejectUnauthorized: true, signal: AbortSignal.timeout(input.timeoutMs),
  }, res => {
    const chunks = []; let length = 0;
    res.on('data', chunk => { length += chunk.length; if (length > 20 * 1024 * 1024) req.destroy(); else chunks.push(chunk); });
    res.on('error', () => reject(new Error('response_interrupted')));
    res.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks); let body;
        try { body = JSON.parse(raw.toString('utf8')); } catch { body = {}; }
        const messages = JSON.stringify(body.mensagens ?? body.error ?? '').toLowerCase();
        attempts.push({ endpoint, httpStatus: res.statusCode, ...(endpoint !== 'authenticate' ? { mentionsAuthorization: /procura|autoriza|permiss/.test(messages) } : {}) });
        // Nunca guardar autenticação/tokens. Respostas fiscais privadas preservam protocolo e evidências.
        if (endpoint !== 'authenticate') await writeFile(join(folder, `${++sequence}-${endpoint}.json`), raw, { mode: 0o600, flag: 'wx' });
        resolve({ status: res.statusCode, body });
      } catch { reject(new Error('response_persistence_failed')); }
    });
  });
  req.on('error', () => reject(new Error('network_or_certificate_error')));
  req.end(input.body);
});
let result;
try {
  const pdf = await new SerproSitfisClient(config, new LocalCertificateProvider(config), transport).obtainSituationPdf(cnpj);
  const file = join(folder, 'situacao-fiscal.pdf'); await writeFile(file, pdf, { mode: 0o600, flag: 'wx' });
  const source = await describePdf('rfb', 'Situação Fiscal RFB — SITFIS', file);
  assertPdfTaxpayer(source.text, cnpj);
  await writeFile(join(folder, 'source-text.txt'), source.text, { mode: 0o600, flag: 'wx' });
  result = { ok: true, runId, cnpj, pages: source.pages, bytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'), attempts, path: file };
} catch (error) {
  result = { ok: false, runId, cnpj, code: error instanceof SerproError ? error.code : 'network_or_processing_failed', attempts };
  process.exitCode = 1;
}
await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify(result));
