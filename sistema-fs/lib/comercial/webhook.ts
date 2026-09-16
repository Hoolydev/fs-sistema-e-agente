import {eventSchema} from './model';
import {webhookAuth,boundedBody} from './security';
import {saveEvent} from './store';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function receiveDiagnostic(request:Request, save=saveEvent, env:Record<string,string|undefined>=process.env){
  if(!env.FS_DIAGNOSTIC_WEBHOOK_TOKEN)return json({error:'RECEIVER_NOT_CONFIGURED'},503);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'CONTENT_TYPE'},415);
  let raw:string;try{raw=(await boundedBody(request,20000)).toString('utf8');}catch{return json({error:'BODY_LIMIT'},413);}
  if(!webhookAuth(raw,request.headers,env))return json({error:'UNAUTHORIZED'},401);
  let input:unknown;try{input=JSON.parse(raw);}catch{return json({error:'INVALID_JSON'},400);}
  const parsed=eventSchema.safeParse(input);if(!parsed.success)return json({error:'INVALID_EVENT'},422);
  const event=parsed.data;
  if(request.headers.get('idempotency-key')!==event.event_id || request.headers.get('x-fs-timestamp')!==event.occurred_at)return json({error:'EVENT_HEADERS_MISMATCH'},422);
  if((event.funnel.pipeline!==null&&event.funnel.pipeline!=='comercial')||(event.funnel.stage!==null&&event.funnel.stage!=='novos-contatos'))return json({error:'INVALID_FUNNEL'},422);
  try{const result=await save(event);return json({received:true,lead_id:result.id,duplicate:result.duplicate},result.duplicate?200:201);}catch(error){return json({error:error instanceof Error&&error.message==='EVENT_CONFLICT'?'EVENT_CONFLICT':'STORAGE_UNAVAILABLE'},error instanceof Error&&error.message==='EVENT_CONFLICT'?409:503);}
}
