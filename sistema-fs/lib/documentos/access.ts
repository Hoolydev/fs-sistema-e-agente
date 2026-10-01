import { same } from "@/lib/comercial/security";
import { memberByPhone } from "@/lib/equipe/team";
const serviceToken = (request: Request, env: NodeJS.ProcessEnv) => !!env.FS_AGENT_SERVICE_TOKEN && same(request.headers.get('authorization') ?? '', `Bearer ${env.FS_AGENT_SERVICE_TOKEN}`);
// Chamada do próprio agente (equipe, caixa de avisos): só o token de serviço.
export function agentService(request: Request, env: NodeJS.ProcessEnv = process.env) { return serviceToken(request, env); }
// Ação em nome de uma pessoa: token de serviço + telefone cadastrado na equipe (ou na allowlist de transição do .env).
export async function agentActor(request: Request, env: NodeJS.ProcessEnv = process.env) {
 if (!serviceToken(request, env)) return null;
 const phone = (request.headers.get('x-fs-requester-phone') ?? '').replace(/\D/g, '');
 if (!phone) return null;
 const allowlist = (env.FS_AGENT_ALLOWED_PHONES ?? '').split(',').map(v => v.replace(/\D/g, ''));
 if (allowlist.includes(phone)) return phone;
 return (await memberByPhone(phone).catch(() => null)) ? phone : null;
}
const mimes: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };
// Tipo real pelo conteúdo, nunca pela extensão informada.
export function detectMime(content: Buffer): string | null {
 if (content.subarray(0, 5).toString() === '%PDF-') return mimes.pdf;
 if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return mimes.jpg;
 if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return mimes.png;
 return null;
}
export function documentResponse(file:{name:string;content:Buffer;mime?:string},download=false){return new Response(new Uint8Array(file.content),{headers:{'Content-Type':file.mime||'application/pdf','Content-Disposition':`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}
