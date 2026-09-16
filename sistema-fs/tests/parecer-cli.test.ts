import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { demoReport } from '../lib/diagnostico/demo';

const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/generate-fs-report.ts', ...args], { cwd: resolve(__dirname, '..'), encoding: 'utf8' });
test('CLI gera PDF pelo template com recibo e preserva emissão existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fs-parecer-cli-'));
  try {
    const output = join(dir, 'demonstrativo.pdf');
    const result = run('--demo', '--output', output);
    assert.equal(result.status, 0, result.stderr);
    const pdf = readFileSync(output), receipt = JSON.parse(readFileSync(output + '.fs.json', 'utf8'));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(receipt.pdfSha256, createHash('sha256').update(pdf).digest('hex'));
    assert.equal(receipt.mode, 'demo');
    const again = run('--demo', '--output', output);
    assert.notEqual(again.status, 0);
    assert.deepEqual(readFileSync(output), pdf);
  } finally { rmSync(dir, { recursive: true }); }
});
test('CLI bloqueia demo disfarçada, ausência de fonte e divergência de origem sem emitir PDF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fs-parecer-cli-'));
  try {
    const variants: unknown[] = [demoReport, { ...demoReport, mode: 'real' }];
    const noSources = structuredClone(demoReport);
    noSources.mode = 'real'; noSources.opinion!.scenario = null; noSources.debts = [];
    noSources.sources.forEach(s => { s.status = 'pendente'; });
    variants.push(noSources);
    const mismatch = structuredClone(demoReport);
    mismatch.mode = 'real'; mismatch.opinion!.scenario = null;
    mismatch.sources.forEach(s => { s.status = 'coletado'; });
    mismatch.debts[0].sourceId = mismatch.debts[0].origin === 'PGFN' ? 'rfb' : 'pgfn';
    variants.push(mismatch);
    for (const [i, value] of variants.entries()) {
      const input = join(dir, `${i}.json`), output = join(dir, `${i}.pdf`);
      writeFileSync(input, JSON.stringify(value));
      const result = run('--input', input, '--output', output);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, [/Para exemplo use/, /Relatório real não pode/, /Nenhuma fonte fiscal/, /Origem da dívida diverge/][i]);
      assert.equal(existsSync(output), false);
      assert.equal(existsSync(output + '.fs.json'), false);
    }
  } finally { rmSync(dir, { recursive: true }); }
});
