import { agentService } from "@/lib/documentos/access";
import { reply } from "@/lib/controller/http";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import { envelopeForAgent } from "@/lib/certificados/store";
export const runtime = "nodejs";

// Envelope cifrado do certificado ativo para o agente, que tem a chave privada. Sem a chave, o envelope não abre.
export async function GET(request: Request) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  const params = new URL(request.url).searchParams, cnpj = normalizeCnpj(params.get("cnpj") ?? "");
  if (!isValidCnpj(cnpj)) return reply({ message: "CNPJ inválido." }, 400);
  try {
    const found = await envelopeForAgent(cnpj, params.get("finalidade") ?? "não informada");
    return found ? reply({ certificate: { cnpj: found.certificate.cnpj, certCnpj: found.certificate.certCnpj, notAfter: found.certificate.notAfter, fingerprint: found.certificate.fingerprint }, envelope: found.envelope }) : reply({ message: "Nenhum certificado ativo e válido para esta empresa." }, 404);
  } catch { return reply({ message: "Cofre indisponível." }, 503); }
}
