import { createHmac, timingSafeEqual } from 'node:crypto';
export const same = (a:string,b:string) => {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function webhookAuth(raw:string, headers:Headers, env:Record<string,string|undefined>=process.env, now=Date.now()):boolean {
  const token=env.FS_DIAGNOSTIC_WEBHOOK_TOKEN, secret=env.FS_DIAGNOSTIC_WEBHOOK_SECRET;
  if (!token || !same(headers.get('authorization')??'',`Bearer ${token}`)) return false;
  const timestamp=headers.get('x-fs-timestamp');
  if (!timestamp || !Number.isFinite(Date.parse(timestamp)) || Math.abs(now-Date.parse(timestamp))>300000) return false;
  if (headers.get('x-fs-event')!=='diagnostic.requested') return false;
  return !secret || same(headers.get('x-fs-signature')??'',`sha256=${createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex')}`);
}
export function sameOrigin(request:Request) {return request.headers.get('origin')===new URL(request.url).origin;}
export async function boundedBody(request:Request,limit:number) {
  if(Number(request.headers.get('content-length'))>limit) throw new Error('BODY_LIMIT');
  const reader=request.body?.getReader();if(!reader) return Buffer.alloc(0);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('BODY_LIMIT');}chunks.push(value);}
  return Buffer.concat(chunks);
}
