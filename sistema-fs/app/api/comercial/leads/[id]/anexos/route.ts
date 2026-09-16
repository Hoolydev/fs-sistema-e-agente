import { requireSession } from "@/lib/auth/server";
import {sameOrigin,boundedBody} from '@/lib/comercial/security';
import {getLead,addAttachment} from '@/lib/comercial/store';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const denied = await requireSession(request); if (denied) return denied;
  if(!sameOrigin(request))return Response.json({message:'Origem inválida.'},{status:403});
  try{const {id}=await params;if(!await getLead(id))return Response.json({message:'Contato não encontrado.'},{status:404});
    const body=await boundedBody(request,3*1024*1024+20000);const form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();const file=form.get('file'),kind=form.get('kind');
    if(!(file instanceof File)||file.size>3*1024*1024||!['parecer','documento'].includes(String(kind)))return Response.json({message:'Envie um PDF de até 3 MB.'},{status:422});
    const content=Buffer.from(await file.arrayBuffer());if(file.type!=='application/pdf'||content.subarray(0,5).toString()!=='%PDF-')return Response.json({message:'Arquivo PDF inválido.'},{status:422});
    const name=file.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,160)||'documento.pdf';
    return Response.json({lead:await addAttachment(id,name,kind as 'parecer'|'documento',content)},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({message:e instanceof Error&&e.message==='BODY_LIMIT'?'Envie um PDF de até 3 MB.':'Não foi possível salvar o anexo.'},{status:e instanceof Error&&e.message==='BODY_LIMIT'?413:503});}
}
