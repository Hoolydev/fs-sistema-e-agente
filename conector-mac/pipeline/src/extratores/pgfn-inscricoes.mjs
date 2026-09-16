import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT=process.argv[2], LOG=process.argv[3]
const NUMS=JSON.parse(fs.readFileSync(process.argv[4],'utf8'))
const log=(...a)=>fs.appendFileSync(LOG,new Date().toLocaleTimeString('pt-BR')+' '+a.join(' ')+'\n')
const b=await chromium.connectOverCDP('http://127.0.0.1:19222',{timeout:8000})
const ctx=b.contexts()[0]
const reg=ctx.pages().find(x=>/regularize\.pgfn/.test(x.url()))||ctx.pages()[0]
const CONSULTA='https://www.regularize.pgfn.gov.br/consultaDividas'
async function irConsulta(){
  for(let a=0;a<3;a++){
    if(/consultaDividas$/.test(reg.url())){ const has=await reg.locator('a').evaluateAll(as=>as.some(x=>/^\d\d\s\d\s\d\d\s\d{6}-\d\d$/.test((x.textContent||'').trim()))).catch(()=>false); if(has) return true }
    try{ await reg.goto(CONSULTA,{waitUntil:'commit',timeout:15000}) }catch{}
    await reg.waitForTimeout(5000)
  }
  return /consultaDividas$/.test(reg.url())
}
const nav=await irConsulta()
log('start url='+reg.url()+' nav='+nav+' alvos='+NUMS.length)
const res=await reg.evaluate(async(NUMS)=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms))
  const expand=async()=>{
    for(const h of [...document.querySelectorAll('a')].filter(a=>/(Tribut|Previden|Simples).*\(\d+\)/i.test(a.textContent||''))){h.click();await sleep(300)}
    for(let k=0;k<12;k++){const vm=[...document.querySelectorAll('a,button')].find(e=>/Ver mais/i.test(e.textContent||''));if(!vm)break;vm.click();await sleep(400)}
  }
  const findA=(n)=>[...document.querySelectorAll('a')].find(x=>(x.textContent||'').trim()===n)
  const out=[]
  for(const n of NUMS){
    await expand()
    let a=findA(n)
    if(!a){ out.push({num:n,erro:'no-link'}); continue }
    a.click()
    let t='',ok=false
    for(let i=0;i<50;i++){await sleep(300);t=document.body.innerText;if(/Valores da d[íi]vida/i.test(t)){ok=true;break}}
    if(!ok){out.push({num:n,erro:'no-detail'});const v=[...document.querySelectorAll('a,button')].find(e=>/^VOLTAR$/i.test((e.textContent||'').trim()));if(v)v.click();await sleep(1500);continue}
    const val=r=>{const m=t.match(new RegExp(r+'\\s*R\\$\\s*([\\d.,]+)','i'));return m?m[1]:null}
    const line=r=>{const m=t.match(new RegExp(r+'\\s*:?\\s*\\n?\\s*(.+)'));return m?m[1].trim():''}
    out.push({num:n,principal:val('Principal'),multa:val('Multa'),juros:val('Juros de mora'),encargo:val('Encargo legal'),total:val('Valor total consolidado'),situacao:line('Situação da inscrição'),natureza:line('Natureza da inscrição'),receita:line('Receita da dívida'),data:line('Data da inscrição')})
    const v=[...document.querySelectorAll('a,button')].find(e=>/^VOLTAR$/i.test((e.textContent||'').trim()));if(v)v.click()
    for(let i=0;i<40;i++){await sleep(300);if(/consultaDividas$/.test(location.href))break}
  }
  return out
},NUMS)
fs.writeFileSync(OUT,JSON.stringify(res,null,2))
log('FIM ok='+res.filter(x=>!x.erro).length+'/'+res.length)
process.exit(0)
