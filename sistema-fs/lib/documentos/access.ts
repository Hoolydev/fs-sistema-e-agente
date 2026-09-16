import { same } from "@/lib/comercial/security";
export function agentActor(request:Request,env:NodeJS.ProcessEnv=process.env){
 const token=env.FS_AGENT_SERVICE_TOKEN;const phone=(request.headers.get('x-fs-requester-phone')??'').replace(/\D/g,'');
 const phones=(env.FS_AGENT_ALLOWED_PHONES??'').split(',').map(v=>v.replace(/\D/g,''));
 return token&&phone&&phones.includes(phone)&&same(request.headers.get('authorization')??'',`Bearer ${token}`)?phone:null;
}
export function documentResponse(file:{name:string;content:Buffer},download=false){return new Response(new Uint8Array(file.content),{headers:{'Content-Type':'application/pdf','Content-Disposition':`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}
