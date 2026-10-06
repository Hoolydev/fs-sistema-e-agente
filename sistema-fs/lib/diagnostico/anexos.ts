import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Junta o parecer e os anexos originais num único PDF. PDFs entram com as páginas sem alteração; imagens viram uma página
// A4 com legenda. O que não couber no limite de resposta (ou não puder ser lido) é listado numa página final.
export const COMPLETE_PDF_LIMIT = 4 * 1024 * 1024;
export type AnnexFile = { name: string; type: string; content: Buffer; mime: string };
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
export async function mergeOpinionWithAnnexes(opinion: Uint8Array, annexes: AnnexFile[], limit = COMPLETE_PDF_LIMIT) {
  const out = await PDFDocument.create(), font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
  const base = await PDFDocument.load(opinion);
  for (const page of await out.copyPages(base, base.getPageIndices())) out.addPage(page);
  let used = opinion.length;
  const included: string[] = [], skipped: { name: string; reason: string }[] = [];
  for (const annex of annexes) {
    if (used + annex.content.length > limit) { skipped.push({ name: annex.name, reason: 'excede o tamanho do arquivo único' }); continue; }
    try {
      if (annex.mime === 'application/pdf') {
        const doc = await PDFDocument.load(annex.content, { ignoreEncryption: false });
        for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
      } else {
        const image = annex.mime === 'image/png' ? await out.embedPng(annex.content) : await out.embedJpg(annex.content);
        const page = out.addPage([595.28, 841.89]), maxW = 515, maxH = 720, scale = Math.min(maxW / image.width, maxH / image.height, 1);
        page.drawText(ascii(`Anexo: ${annex.type} - ${annex.name}`).slice(0, 110), { x: 40, y: 805, size: 10, font: bold, color: rgb(.06, .16, .24) });
        page.drawImage(image, { x: 40 + (maxW - image.width * scale) / 2, y: 770 - image.height * scale, width: image.width * scale, height: image.height * scale });
      }
      used += annex.content.length; included.push(annex.name);
    } catch { skipped.push({ name: annex.name, reason: 'arquivo protegido ou ilegível' }); }
  }
  if (skipped.length) {
    const page = out.addPage([595.28, 841.89]);
    page.drawText('Anexos nao incluidos neste arquivo', { x: 40, y: 790, size: 13, font: bold, color: rgb(.06, .16, .24) });
    page.drawText('Baixe-os individualmente no acervo do Sistema FS (Documentos da empresa).', { x: 40, y: 768, size: 10, font, color: rgb(.36, .43, .47) });
    skipped.forEach((s, i) => page.drawText(ascii(`- ${s.name} (${s.reason})`).slice(0, 100), { x: 40, y: 740 - i * 16, size: 10, font, color: rgb(.19, .27, .33) }));
  }
  return { pdf: Buffer.from(await out.save()), included, skipped };
}
