import { requirePermission } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { sameOrigin } from "@/lib/comercial/security";
import { reply } from "@/lib/controller/http";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import { certificateAudit, listCertificates, MAX_PFX_BYTES, revokeCertificate, storeCertificate } from "@/lib/certificados/store";
export const runtime = "nodejs";

const messages: Record<string, [number, string]> = {
  VAULT_NOT_CONFIGURED: [503, "O cofre de certificados ainda não está configurado no sistema."],
  FILE_INVALID: [422, "Envie o arquivo do certificado A1 (.pfx ou .p12), com até 50 KB."],
  BAD_PASSWORD: [422, "A senha não abre este certificado, ou o arquivo não é um certificado A1 (.pfx/.p12)."],
  NO_KEY: [422, "O arquivo não traz a chave privada. Exporte o certificado A1 completo (.pfx) com a chave."],
  NO_CERTIFICATE: [422, "O arquivo não traz o certificado."],
  NOT_ECNPJ: [422, "Este não é um certificado e-CNPJ: o CNPJ da empresa não aparece no certificado."],
  CNPJ_MISMATCH: [422, "O certificado é de outra empresa (o CNPJ não confere com o desta empresa)."],
  EXPIRED: [422, "Este certificado já venceu."],
  NOT_YET_VALID: [422, "Este certificado ainda não começou a valer."],
  NOT_FOUND: [404, "Certificado não encontrado."],
};
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known = messages[code];
  if (known) return reply({ code, message: known[1] }, known[0]);
  console.error("CERTIFICATE_STORE", error instanceof Error ? error.name : "unknown");
  return reply({ message: "Não foi possível concluir a operação com o certificado." }, 500);
}

// Situação do certificado da empresa (sem arquivo nem senha). Só a equipe interna.
export async function GET(request: Request) {
  const { actor, denied } = await requirePermission(request, { interno: ["acessar"] }); if (denied) return denied;
  const cnpj = normalizeCnpj(new URL(request.url).searchParams.get("cnpj") ?? "");
  if (!isValidCnpj(cnpj)) return reply({ message: "CNPJ inválido." }, 400);
  const manage = can(actor.role, { user: ["update"] }), upload = can(actor.role, { processo: ["incluir"], interno: ["acessar"] });
  try { return reply({ certificates: await listCertificates(cnpj), audit: manage ? await certificateAudit(cnpj) : [], canManage: manage, canUpload: upload, vaultReady: !!process.env.FS_CERT_VAULT_PUBLIC_KEY }); }
  catch (error) { return failure(error); }
}
// Envio do certificado A1 com a senha: equipe interna que inclui registros (é o que permite analisar com o certificado
// na primeira etapa). A senha não é gravada em claro nem registrada em log. Revogar continua só com o administrador.
export async function POST(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["incluir"], interno: ["acessar"] }); if (denied) return denied;
  if (!sameOrigin(request)) return reply({ message: "Origem inválida." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PFX_BYTES + 8192) return failure(new Error("FILE_INVALID"));
  let form: FormData;
  try { form = await request.formData(); } catch { return reply({ message: "Envio inválido." }, 400); }
  const file = form.get("file"), passphrase = String(form.get("password") ?? ""), cnpj = normalizeCnpj(String(form.get("cnpj") ?? ""));
  if (!isValidCnpj(cnpj)) return reply({ message: "CNPJ inválido." }, 400);
  if (!(file instanceof File) || !/\.(pfx|p12)$/i.test(file.name) || file.size > MAX_PFX_BYTES) return failure(new Error("FILE_INVALID"));
  if (!passphrase || passphrase.length > 128) return reply({ message: "Informe a senha do certificado." }, 422);
  try { return reply({ certificate: await storeCertificate({ cnpj, pfx: Buffer.from(await file.arrayBuffer()), passphrase }, actor) }, 201); }
  catch (error) { return failure(error); }
}
// Revogar: apaga o envelope cifrado; ficam só os dados públicos e a auditoria.
export async function DELETE(request: Request) {
  const { actor, denied } = await requirePermission(request, { user: ["update"] }); if (denied) return denied;
  if (!sameOrigin(request)) return reply({ message: "Origem inválida." }, 403);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return reply({ message: "Certificado inválido." }, 400);
  try { return reply({ certificate: await revokeCertificate(id, actor) }); } catch (error) { return failure(error); }
}
