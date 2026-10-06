import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { documentContent,auditDocument } from "@/lib/documentos/store";
import { documentResponse } from "@/lib/documentos/access";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const {actor,denied}=await requirePermission(request);if(denied)return denied;const {id}=await params;const file=await documentContent(id,scopeFor(actor));if(!file)return new Response(null,{status:404});await auditDocument(actor.id,'view',id);return documentResponse(file,new URL(request.url).searchParams.has('download'));}
