import { requireSession } from "@/lib/auth/server";
import {sameOrigin,boundedBody} from '@/lib/comercial/security';
import {getLead,moveLead} from '@/lib/comercial/store';
import {stages} from '@/lib/comercial/model';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,{params}:Context){
  const denied = await requireSession(request); if (denied) return denied;if(!sameOrigin(request))return Response.json({message:'Origem inválida.'},{status:403});try{const {id}=await params;const input=JSON.parse((await boundedBody(request,1000)).toString());if(!stages.includes(input.stage))return Response.json({message:'Etapa inválida.'},{status:422});if(!await getLead(id))return Response.json({message:'Contato não encontrado.'},{status:404});return Response.json({lead:await moveLead(id,input.stage)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({message:'Não foi possível alterar a etapa.'},{status:503});}}
