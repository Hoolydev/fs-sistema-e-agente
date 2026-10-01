import { z } from "zod";
import { agentActor, detectMime } from "@/lib/documentos/access";
import { documents,archiveDocument,auditDocument,documentKinds } from "@/lib/documentos/store";
import { boundedBody } from "@/lib/comercial/security";
import { formatCnpj, isValidCnpj } from "@/lib/diagnostico/model";
import { listProcesses } from "@/lib/controller/store";
import { memberByPhone } from "@/lib/equipe/team";
import { notifyReviewers } from "@/lib/avisos/store";
export const runtime="nodejs";
export async function GET(request:Request){const actor=await agentActor(request);if(!actor)return new Response(null,{status:401});const q=(new URL(request.url).searchParams.get('q')??'').trim();if(q.length<3||q.length>160)return Response.json({message:'Informe nome ou CNPJ.'},{status:422});const found=await documents(q,true);await auditDocument(actor,'search',null);return Response.json({documents:found.slice(0,100),total:found.length},{headers:{'Cache-Control':'no-store'}});}
const schema=z.object({externalId:z.string().min(1).max(150),cnpj:z.string().refine(isValidCnpj),company:z.string().min(1).max(200),name:z.string().min(1).max(160),kind:z.enum(documentKinds),createdAt:z.string().datetime(),note:z.string().max(300).optional()});
// Pareceres e documentos de apoio continuam só em PDF; comprovantes também aceitam JPG/PNG (foto do celular).
export async function POST(request:Request){const actor=await agentActor(request);if(!actor)return new Response(null,{status:401});try{const raw=await boundedBody(request,3*1024*1024+20000);const form=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();const input=schema.parse(JSON.parse(String(form.get('metadata'))));const file=form.get('file');if(!(file instanceof File)||file.size>3*1024*1024)return new Response(null,{status:422});const content=Buffer.from(await file.arrayBuffer());const mime=detectMime(content);if(!mime||(input.kind!=='comprovante'&&mime!=='application/pdf'))return Response.json({message:'Arquivo não aceito. Envie PDF (ou JPG/PNG para comprovante).'},{status:422});input.name=input.name.replace(/[^\p{L}\p{N}._ -]/gu,'_');
 // Nome da empresa vem do Controller quando o agente só conhece o CNPJ.
 if(/^(CNPJ|Empresa)\s/i.test(input.company)){const known=(await listProcesses().catch(()=>[])).find(p=>p.cnpj===input.cnpj);if(known)input.company=known.company;}
 const id=await archiveDocument({...input,mime},content);await auditDocument(actor,'archive',id);
 if(input.kind==='comprovante'){const sender=await memberByPhone(actor).catch(()=>null);await notifyReviewers('comprovante',`Comprovante de pagamento recebido de ${sender?.name??'número autorizado'} para ${input.company} (CNPJ ${formatCnpj(input.cnpj)}).${input.note?` Legenda: ${input.note}`:''} Já está no acervo do sistema.`,`comprovante:${id}`,sender?.id).catch(()=>{});}
 return Response.json({id,company:input.company},{status:201});}catch(e){return Response.json({message:'Não foi possível arquivar o documento.'},{status:e instanceof Error&&e.message==='ARCHIVE_CONFLICT'?409:e instanceof Error&&e.message==='BODY_LIMIT'?413:422});}}
