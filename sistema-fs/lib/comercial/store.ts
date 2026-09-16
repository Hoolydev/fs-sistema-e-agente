import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Pool } from 'pg';
import type { Attachment, DiagnosticEvent, Lead } from './model';
type Row = Record<string,unknown>;
let sqlite:DatabaseSync|undefined, pool:Pool|undefined, ready:Promise<void>|undefined;
export async function query(sql:string, values:unknown[]=[]):Promise<Row[]> {
  if((process.env.FS_CRM_DATABASE_URL||process.env.DATABASE_URL)){
    if(!pool){const {Pool}=await import('pg');pool=new Pool({connectionString:(process.env.FS_CRM_DATABASE_URL||process.env.DATABASE_URL),max:3,connectionTimeoutMillis:5000});}
    return (await pool.query(sql,values)).rows;
  }
  if(process.env.NODE_ENV==='production' || process.env.VERCEL) throw new Error('CRM_DATABASE_NOT_CONFIGURED');
  if(!sqlite){const {DatabaseSync}=await import('node:sqlite');const directory=path.resolve(process.env.FS_CRM_LOCAL_DIR||'.local/comercial');mkdirSync(directory,{recursive:true,mode:0o700});sqlite=new DatabaseSync(path.join(directory,'crm.sqlite'));chmodSync(path.join(directory,'crm.sqlite'),0o600);sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');}
  const statement=sqlite.prepare(sql.replace(/\$\d+/g,'?'));
  return statement.all(...values as (string|number|Buffer|null)[]) as Row[];
}
export async function init(){
  if(!ready)ready=(async()=>{
    await query('CREATE TABLE IF NOT EXISTS fs_crm_leads (id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, stage TEXT NOT NULL)');
    await query(`CREATE TABLE IF NOT EXISTS fs_crm_attachments (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES fs_crm_leads(id), name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, kind TEXT NOT NULL, content ${(process.env.FS_CRM_DATABASE_URL||process.env.DATABASE_URL)?'BYTEA':'BLOB'} NOT NULL)`);
  })().catch(e=>{ready=undefined;throw e;});return ready;
}
function fingerprint(event:DiagnosticEvent){const {occurred_at:_,consent,...stable}=event;const {received_at:__,...permission}=consent;void _;void __;return createHash('sha256').update(JSON.stringify({...stable,consent:permission})).digest('hex');}
const attachment=(r:Row):Attachment=>({id:String(r.id),name:String(r.name),size:Number(r.size),createdAt:String(r.created_at),kind:r.kind as Attachment['kind']});
async function lead(r:Row):Promise<Lead>{return {id:String(r.id),event:JSON.parse(String(r.payload)),createdAt:String(r.created_at),stage:r.stage as Lead['stage'],attachments:(await query('SELECT id,name,size,created_at,kind FROM fs_crm_attachments WHERE lead_id=$1 ORDER BY created_at DESC',[r.id])).map(attachment)};}
export async function saveEvent(event:DiagnosticEvent){await init();const hash=fingerprint(event);const id=randomUUID();const inserted=await query('INSERT INTO fs_crm_leads (id,event_id,fingerprint,payload,created_at,stage) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING RETURNING id',[id,event.event_id,hash,JSON.stringify(event),new Date().toISOString(),'novos-contatos']);const [row]=await query('SELECT * FROM fs_crm_leads WHERE event_id=$1',[event.event_id]);if(row.fingerprint!==hash)throw new Error('EVENT_CONFLICT');return {id:String(row.id),duplicate:inserted.length===0};}
export async function listLeads(){await init();return Promise.all((await query('SELECT * FROM fs_crm_leads ORDER BY created_at DESC LIMIT 500')).map(lead));}
export async function getLead(id:string){await init();const [row]=await query('SELECT * FROM fs_crm_leads WHERE id=$1',[id]);return row?lead(row):null;}
export async function moveLead(id:string,stage:Lead['stage']){await init();await query('UPDATE fs_crm_leads SET stage=$1 WHERE id=$2',[stage,id]);return getLead(id);}
export async function addAttachment(id:string,name:string,kind:Attachment['kind'],content:Buffer){await init();const documentId=randomUUID();await query('INSERT INTO fs_crm_attachments (id,lead_id,name,size,created_at,kind,content) VALUES ($1,$2,$3,$4,$5,$6,$7)',[documentId,id,name,content.length,new Date().toISOString(),kind,content]);return getLead(id);}
export async function getAttachment(leadId:string,id:string){await init();const [row]=await query('SELECT * FROM fs_crm_attachments WHERE lead_id=$1 AND id=$2',[leadId,id]);return row?{...attachment(row),content:Buffer.from(row.content as Uint8Array)}:null;}
