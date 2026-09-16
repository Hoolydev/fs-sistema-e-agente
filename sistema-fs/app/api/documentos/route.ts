import { requireSession } from "@/lib/auth/server";
import { documents } from "@/lib/documentos/store";
export const runtime="nodejs";
export async function GET(request:Request){const denied=await requireSession(request);if(denied)return denied;try{const q=(new URL(request.url).searchParams.get('q')??'').slice(0,160);const found=await documents(q);return Response.json({documents:found.slice(0,100),total:found.length},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({message:'Não foi possível carregar o acervo.'},{status:503});}}
