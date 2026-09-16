import { requireSession } from "@/lib/auth/server";
import {getAttachment} from '@/lib/comercial/store';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string;attachmentId:string}>}){
  const denied = await requireSession(request); if (denied) return denied;
 try{const {id,attachmentId}=await params;const file=await getAttachment(id,attachmentId);if(!file)return new Response(null,{status:404});return new Response(new Uint8Array(file.content),{headers:{'Content-Type':'application/pdf','Content-Disposition':`${new URL(request.url).searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; plugin-types application/pdf"}});}catch{return new Response(null,{status:503});}
}
