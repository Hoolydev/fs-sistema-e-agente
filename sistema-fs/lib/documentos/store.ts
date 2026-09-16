import { createHash, randomUUID } from "node:crypto";
import { init, query } from "@/lib/comercial/store";
export type StoredDocument = { id:string; company:string; cnpj:string; name:string; kind:string; createdAt:string; source:string; size:number };
export const normalizeSearch=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
let ready:Promise<void>|undefined;
async function setup(){await init();if(!ready)ready=(async()=>{
 await query(`CREATE TABLE IF NOT EXISTS fs_documents (id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, cnpj TEXT NOT NULL, company TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, content ${process.env.FS_CRM_DATABASE_URL||process.env.DATABASE_URL?'BYTEA':'BLOB'} NOT NULL)`);
 await query('CREATE TABLE IF NOT EXISTS fs_document_audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, document_id TEXT, created_at TEXT NOT NULL)');
})().catch(e=>{ready=undefined;throw e;});await ready;}
export async function documents(search="",companyOnly=false):Promise<StoredDocument[]>{
 await setup();
 const legacy=await query('SELECT a.id,a.name,a.kind,a.created_at,a.size,l.payload FROM fs_crm_attachments a JOIN fs_crm_leads l ON l.id=a.lead_id');
 const archived=await query('SELECT id,cnpj,company,name,kind,created_at,source,size FROM fs_documents');
 const all:StoredDocument[]=[...legacy.map(r=>{const event=JSON.parse(String(r.payload));return {id:`crm_${r.id}`,company:event.company.name,cnpj:event.company.cnpj,name:String(r.name),kind:String(r.kind),createdAt:String(r.created_at),source:'Sistema FS',size:Number(r.size)};}),...archived.map(r=>({id:`doc_${r.id}`,company:String(r.company),cnpj:String(r.cnpj),name:String(r.name),kind:String(r.kind),createdAt:String(r.created_at),source:String(r.source),size:Number(r.size)}))];
 const q=normalizeSearch(search);
 return all.filter(d=>!q||[d.company,d.cnpj,...(companyOnly?[]:[d.name])].some(v=>normalizeSearch(v).includes(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function documentContent(id:string){
 await setup();if(!/^(crm|doc)_[a-zA-Z0-9-]{1,80}$/.test(id))return null;
 const [row]=await query(id.startsWith('crm_')?'SELECT content,name FROM fs_crm_attachments WHERE id=$1':'SELECT content,name FROM fs_documents WHERE id=$1',[id.slice(4)]);
 return row?{name:String(row.name),content:Buffer.from(row.content as Uint8Array)}:null;
}
export async function auditDocument(actor:string,action:string,id:string|null){await setup();await query('INSERT INTO fs_document_audit (id,actor,action,document_id,created_at) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),actor,action,id,new Date().toISOString()]);}
export async function archiveDocument(input:{externalId:string;cnpj:string;company:string;name:string;kind:string;createdAt:string},content:Buffer){
 await setup();const hash=createHash('sha256').update(content).digest('hex');const id=randomUUID();
 await query('INSERT INTO fs_documents (id,external_id,cnpj,company,name,kind,created_at,source,sha256,size,content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(external_id) DO NOTHING',[id,input.externalId,input.cnpj,input.company,input.name,input.kind,input.createdAt,'Agente FS',hash,content.length,content]);
 const [row]=await query('SELECT id,sha256,cnpj FROM fs_documents WHERE external_id=$1',[input.externalId]);
 if(row.sha256!==hash||row.cnpj!==input.cnpj)throw new Error('ARCHIVE_CONFLICT');return `doc_${row.id}`;
}
