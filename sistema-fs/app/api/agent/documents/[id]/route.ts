import { agentActor,documentResponse } from "@/lib/documentos/access";
import { documentContent,auditDocument } from "@/lib/documentos/store";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const actor=agentActor(request);if(!actor)return new Response(null,{status:401});const {id}=await params;const file=await documentContent(id);if(!file)return new Response(null,{status:404});await auditDocument(actor,'agent_download',id);return documentResponse(file,true);}
