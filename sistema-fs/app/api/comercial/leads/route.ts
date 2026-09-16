import { requireSession } from "@/lib/auth/server";
import {listLeads} from '@/lib/comercial/store';
export const runtime='nodejs';
export async function GET(request:Request){
  const denied = await requireSession(request); if (denied) return denied;try{return Response.json({leads:await listLeads()},{headers:{'Cache-Control':'no-store'}});}catch(error){console.error("CRM_STORE",error instanceof Error?error.name:"unknown",error && typeof error==="object" && "code" in error?error.code:"NO_CODE");return Response.json({message:'Não foi possível carregar os contatos. Verifique a configuração do banco de dados.'},{status:503});}}
