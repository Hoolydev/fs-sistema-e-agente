import { mkdtemp,readFile,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "../config.js";
import type { RpaRequest,RpaResult } from "../domain/types.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
export interface SystemDocument {id:string;company:string;cnpj:string;name:string;kind:string;createdAt:string;source:string;size:number}
export interface DocumentArchive {search(query:string,phone:string):Promise<SystemDocument[]>;deliver(document:SystemDocument,phone:string):Promise<void>}
export function storedDocumentQuery(text:string):string|null {
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(nova|novo|refaca|atualize|atualiza|refazer)\b/.test(normalized))return null;
 if(!/\b(manda|mande|envia|envie|enviar|reenviar|reenvia|busca|buscar|mostra|mostrar|quero|traga|preciso)\b/.test(normalized)||!/(analise|parecer|diagnostico|relatorio|documento)/.test(normalized))return null;
 const cnpj=text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);if(cnpj)return cnpj[0].replace(/\D/g,'');
 const match=text.match(/(?:an[aá]lise|parecer|diagn[oó]stico|relat[oó]rio|documentos?)\s+(?:j[aá]\s+(?:pront[oa]|elaborad[oa])\s+)?(?:d[aoe]\s+)?(?:(?:cliente|empresa)\s+)?(.+)/i);
 return match?.[1]?.replace(/[,!.?]+$/,'').replace(/\s+por favor$/i,'').trim()||'';
}
export class SystemDocumentClient implements DocumentArchive {
 constructor(private config:AppConfig,private whatsapp:WhatsAppGateway){}
 private headers(phone:string){return {authorization:`Bearer ${this.config.FS_SYSTEM_API_TOKEN}`,'x-fs-requester-phone':phone};}
 private url(path:string){if(!this.config.FS_SYSTEM_URL||!this.config.FS_SYSTEM_API_TOKEN)throw new Error('system_archive_not_configured');return `${this.config.FS_SYSTEM_URL.replace(/\/$/,'')}/api/agent/documents${path}`;}
 async search(query:string,phone:string){const response=await fetch(this.url(`?q=${encodeURIComponent(query)}`),{headers:this.headers(phone),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('system_archive_unavailable');const data=await response.json() as {documents:SystemDocument[];total:number};if(data.total>data.documents.length)throw new Error('system_search_too_broad');return data.documents;}
 async deliver(document:SystemDocument,phone:string){
  const response=await fetch(this.url(`/${encodeURIComponent(document.id)}`),{headers:this.headers(phone),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('system_document_unavailable');const content=Buffer.from(await response.arrayBuffer());if(content.subarray(0,5).toString()!=='%PDF-')throw new Error('system_invalid_pdf');
  const folder=await mkdtemp(join(tmpdir(),'fs-reenvio-'));const path=join(folder,'parecer.pdf');
  try{await writeFile(path,content,{mode:0o600});await this.whatsapp.sendDocument(phone,path,document.name,`Documento já elaborado: ${document.company}. Data: ${new Date(document.createdAt).toLocaleDateString('pt-BR')}. Nenhuma nova análise foi realizada.`);}finally{await rm(folder,{recursive:true,force:true});}
 }
 async archive(request:RpaRequest,result:RpaResult){
  const content=await readFile(result.localPath);const form=new FormData();
  form.set('metadata',JSON.stringify({externalId:request.requestId,cnpj:request.cnpj,company:`CNPJ ${request.cnpj}`,name:result.filename,kind:request.documentType==='diagnostico_fiscal'?'parecer':'documento',createdAt:result.obtainedAt}));
  form.set('file',new Blob([new Uint8Array(content)],{type:'application/pdf'}),result.filename);
  const response=await fetch(this.url(''),{method:'POST',headers:this.headers(request.requesterPhone),body:form,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('system_archive_failed');return response.json() as Promise<{id:string}>;
 }
}
