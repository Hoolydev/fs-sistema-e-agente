import { z } from 'zod';
import { isValidCnpj, normalizeCnpj } from '../diagnostico/model';
const short = (max: number) => z.string().trim().min(1).max(max).refine(s => !/[\x00-\x1f\x7f]/.test(s));
export const stages = ['novos-contatos', 'qualificacao', 'proposta', 'negociacao'] as const;
export const stageLabels = ['Novos contatos', 'Em qualificação', 'Proposta enviada', 'Em negociação'];
export const eventSchema = z.object({
  schema_version: z.literal('1.0'), event: z.literal('diagnostic.requested'), event_id: z.string().uuid(), occurred_at: z.string().datetime(),
  source: z.object({channel:z.literal('website'),form:z.literal('diagnostico'),page:z.literal('/diagnostico/')}),
  funnel: z.object({pipeline:short(100).nullable(),stage:short(100).nullable()}),
  company:z.object({name:short(160),cnpj:z.string().max(18).transform(normalizeCnpj).refine(isValidCnpj),city:short(100).nullable(),state:z.string().regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/).nullable(),tax_regime:z.enum(['simples','presumido','real','mei','desconhecido']).nullable(),tax_regime_label:short(100).nullable()}),
  contact:z.object({name:short(120),email:z.string().trim().email().max(180),whatsapp:short(25).refine(v=>/^[+()\s\d-]+$/.test(v)&&/^\d{10,15}$/.test(v.replace(/\D/g,'')))}),
  request:z.object({service:z.enum(['diagnostico','debitos','creditos','planejamento','outra']),service_label:short(120),message:z.string().max(1000).nullable()}),
  consent:z.object({accepted:z.literal(true),version:short(100),received_at:z.string().datetime(),purpose:short(250)}),
});
export type DiagnosticEvent = z.infer<typeof eventSchema>;
export type Attachment = {id:string;name:string;size:number;createdAt:string;kind:'parecer'|'documento'};
export type Lead = {id:string;event:DiagnosticEvent;createdAt:string;stage:typeof stages[number];attachments:Attachment[]};
