import { createHash, randomUUID } from "node:crypto";
import { init, query } from "@/lib/comercial/store";
import { ownedBy, ownerClause, type Scope } from "@/lib/auth/scope";
export type StoredDocument = { id:string; company:string; cnpj:string; name:string; kind:string; createdAt:string; source:string; size:number; mime?:string; docType?:string|null; ownerId?:string|null; reportUrl?:string };
export const documentKinds=['parecer','documento','comprovante'] as const;
export const normalizeSearch=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
let ready:Promise<void>|undefined;
export async function setupDocuments(){await init();if(!ready)ready=(async()=>{
 await query(`CREATE TABLE IF NOT EXISTS fs_documents (id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, cnpj TEXT NOT NULL, company TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, content ${process.env.FS_CRM_DATABASE_URL||process.env.DATABASE_URL?'BYTEA':'BLOB'} NOT NULL)`);
 // Comprovantes podem ser imagem; a coluna guarda o tipo real (PDF quando ausente). SQLite local não suporta IF NOT EXISTS na coluna.
 for(const column of ['mime TEXT','doc_type TEXT','owner_id TEXT']){if(process.env.FS_CRM_DATABASE_URL||process.env.DATABASE_URL)await query(`ALTER TABLE fs_documents ADD COLUMN IF NOT EXISTS ${column}`);else await query(`ALTER TABLE fs_documents ADD COLUMN ${column}`).catch(()=>{});}
 await query('CREATE TABLE IF NOT EXISTS fs_document_audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, document_id TEXT, created_at TEXT NOT NULL)');
 await query('CREATE TABLE IF NOT EXISTS fs_diagnostic_reports (document_id TEXT PRIMARY KEY REFERENCES fs_documents(id), payload TEXT NOT NULL, input_sha256 TEXT NOT NULL)');
})().catch(e=>{ready=undefined;throw e;});await ready;}
// scope: externo vê só os documentos de que é dono; anexos do CRM são sempre internos.
export async function documents(search="",companyOnly=false,scope:Scope=null):Promise<StoredDocument[]>{
 await setupDocuments();const owner=ownerClause(scope,'d.owner_id',1);
 const legacy=scope?[]:await query('SELECT a.id,a.name,a.kind,a.created_at,a.size,l.payload FROM fs_crm_attachments a JOIN fs_crm_leads l ON l.id=a.lead_id');
 const archived=await query(`SELECT d.id,d.cnpj,d.company,d.name,d.kind,d.created_at,d.source,d.size,d.mime,d.doc_type,d.owner_id,r.document_id AS report_id FROM fs_documents d LEFT JOIN fs_diagnostic_reports r ON r.document_id=d.id WHERE 1=1${owner.sql}`,owner.values);
 const all:StoredDocument[]=[...legacy.map(r=>{const event=JSON.parse(String(r.payload));return {id:`crm_${r.id}`,company:event.company.name,cnpj:event.company.cnpj,name:String(r.name),kind:String(r.kind),createdAt:String(r.created_at),source:'Sistema FS',size:Number(r.size)};}),...archived.map(r=>({id:`doc_${r.id}`,company:String(r.company),cnpj:String(r.cnpj),name:String(r.name),kind:String(r.kind),createdAt:String(r.created_at),source:String(r.source),size:Number(r.size),mime:String(r.mime||'application/pdf'),docType:r.doc_type?String(r.doc_type):(r.kind==='comprovante'?'comprovante':null),ownerId:r.owner_id?String(r.owner_id):null,...(r.report_id?{reportUrl:`/diagnostico/doc_${r.id}`}:{})}))];
 const q=normalizeSearch(search);
 const matches = all.filter(d=>!q||[d.company,d.cnpj,...(companyOnly?[]:[d.name])].some(v=>normalizeSearch(v).includes(q)));
 const companies = new Set(matches.map(d=>normalizeSearch(d.cnpj)));
 return (companyOnly?matches:all.filter(d=>companies.has(normalizeSearch(d.cnpj)))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function documentContent(id:string,scope:Scope=null){
 await setupDocuments();if(!/^(crm|doc)_[a-zA-Z0-9-]{1,80}$/.test(id))return null;
 if(scope&&id.startsWith('crm_'))return null;
 const [row]=await query(id.startsWith('crm_')?'SELECT content,name FROM fs_crm_attachments WHERE id=$1':'SELECT content,name,mime,owner_id FROM fs_documents WHERE id=$1',[id.slice(4)]);
 return row&&ownedBy(scope,row.owner_id?String(row.owner_id):null)?{name:String(row.name),content:Buffer.from(row.content as Uint8Array),mime:String(row.mime||'application/pdf')}:null;
}
export async function auditDocument(actor:string,action:string,id:string|null){await setupDocuments();await query('INSERT INTO fs_document_audit (id,actor,action,document_id,created_at) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),actor,action,id,new Date().toISOString()]);}
export async function archiveDocument(input:{externalId:string;cnpj:string;company:string;name:string;kind:string;createdAt:string;mime?:string;source?:string;docType?:string;ownerId?:string|null},content:Buffer){
 await setupDocuments();const hash=createHash('sha256').update(content).digest('hex');const id=randomUUID();
 await query('INSERT INTO fs_documents (id,external_id,cnpj,company,name,kind,created_at,source,sha256,size,content,mime,doc_type,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(external_id) DO NOTHING',[id,input.externalId,input.cnpj,input.company,input.name,input.kind,input.createdAt,input.source||'Agente FS',hash,content.length,content,input.mime||'application/pdf',input.docType??(input.kind==='comprovante'?'comprovante':null),input.ownerId??null]);
 const [row]=await query('SELECT id,sha256,cnpj FROM fs_documents WHERE external_id=$1',[input.externalId]);
 if(row.sha256!==hash||row.cnpj!==input.cnpj)throw new Error('ARCHIVE_CONFLICT');return `doc_${row.id}`;
}
