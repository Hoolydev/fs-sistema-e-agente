import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupDocuments,preferredDocument} from '../lib/documentos/groups';
import type {StoredDocument} from '../lib/documentos/store';
const doc=(id:string,kind:string,company:string,createdAt:string,cnpj='12345678000195'):StoredDocument=>({id,kind,company,createdAt,cnpj,name:id+'.pdf',source:'Teste sintético',size:100});
test('agrupa por CNPJ normalizado, prefere razão social e preserva todas as versões',()=>{
 const items=[doc('source','documento','CNPJ 12345678000195','2026-09-16T12:00:00Z','12.345.678/0001-95'),doc('v1','parecer','Empresa sintética','2026-09-15T12:00:00Z'),doc('v2','parecer','Empresa sintética','2026-09-16T11:00:00Z'),doc('other','parecer','Outra empresa','2026-09-15T12:00:00Z','47733961000179')];
 const groups=groupDocuments(items);assert.equal(groups.length,2);assert.equal(groups[0].documents.length,3);assert.equal(groups[0].name,'Empresa sintética');
 assert.equal(preferredDocument(groups[0]).id,'v2');assert.equal(preferredDocument(groups[0],'v1').id,'v1');assert.equal(preferredDocument(groups[0],'source').id,'source');
 const refreshed=groupDocuments([...items,doc('v3','parecer','Empresa sintética','2026-09-17T12:00:00Z')]);
 assert.equal(preferredDocument(refreshed[0],'v1').id,'v1');assert.equal(preferredDocument(refreshed[0]).id,'v3');
 assert.equal(items[0].id,'source');
});
