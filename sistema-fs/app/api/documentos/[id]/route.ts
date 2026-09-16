import { sessionFor } from "@/lib/auth/server";
import { documentContent,auditDocument } from "@/lib/documentos/store";
import { documentResponse } from "@/lib/documentos/access";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const session=await sessionFor(request);if(!session)return new Response(null,{status:401});const {id}=await params;const file=await documentContent(id);if(!file)return new Response(null,{status:404});await auditDocument(session.user.id,'view',id);return documentResponse(file,new URL(request.url).searchParams.has('download'));}
