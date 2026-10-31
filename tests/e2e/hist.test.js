const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1360,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ocr={tipo_documento:'extracto',acreedor:'Banco Falabella',acreedor_nit:'900047981',acreedor_es_persona:false,concepto:'Crédito de consumo',monto:12000000,fecha_inicio:'2025-06-10',frecuencia:'mensual',plazo_cuotas:36,valor_cuota:null,tasa_mensual:1.9,tasa_ea:null,seguros_por_cuota:15000,cuotas_pagadas:16,saldo_actual:7350000,fecha_ultimo_pago:'2026-10-10'};
fs.writeFileSync(OUT+'/pg.html','<!doctype html><body><script>localStorage.setItem("lmf-tour","1");window.claude={use:async n=>n==="sample"?Object.assign(async()=>({text:""}),{limits:async()=>({images:true}),json:async(pr)=>/crédito o préstamo/.test(pr)?'+JSON.stringify(ocr)+':/comprobante de pago/.test(pr)?{valor:1100000,fecha:"2026-10-30"}:{items:[]}}):null}</script>'+fs.readFileSync(APP,'utf8')+'</body>');
await p.route('**/*',r=>r.request().url().startsWith('http')?r.abort():r.continue());
await p.goto('file://'+OUT+'/pg.html');await p.waitForTimeout(500);
await p.evaluate(()=>{authHide();S=sample();S.sample=false;S.setup.dismissed=true;commit();location.hash='me-deben';render()});await p.waitForTimeout(200);
// manual: préstamo antiguo va al día
await p.evaluate(()=>openModal('loan',{kind:'cobrar'}));await p.waitForTimeout(200);
await p.click('#modal [data-pick=quien][data-v=new]');await p.fill('#modal [name=c_nombre]','Pedro Prueba');await p.fill('#modal [name=monto]','10000000');
await p.evaluate(()=>{const f=document.querySelector('#mform');setDateValue(f,'inicio','2026-01-15')});await p.fill('#modal [name=plazo]','24');
await p.click('#modal [data-pick=modoInt][data-v=tasa]');await p.fill('#modal [name=tasa]','2');
await p.click('#modal [data-pick=hist][data-v=saldo]');await p.fill('#modal [name=saldoHoy]','7000000');await p.waitForTimeout(200);
console.log('prev:',await p.textContent('#lhp'));
await p.evaluate(()=>document.querySelector('#lhp').scrollIntoView());await p.screenshot({path:OUT+'/h1.png'});
await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
console.log(await p.evaluate(()=>{const L=S.cobrar.find(x=>loanName(x,'cobrar')==='Pedro Prueba');const e=engine(L);return{pag:L.pagos.length,saldo:Math.round(e.saldo),venc:e.vencidas.length,next:e.next&&iso(e.next.fecha)}}));
// aldia
await p.evaluate(()=>openModal('loan',{kind:'cobrar'}));await p.waitForTimeout(200);await p.click('#modal [data-pick=quien][data-v=new]');await p.fill('#modal [name=c_nombre]','Ana Aldia');await p.fill('#modal [name=monto]','3000000');await p.evaluate(()=>{setDateValue(document.querySelector('#mform'),'inicio','2026-03-01')});await p.fill('#modal [name=plazo]','12');
await p.click('#modal [data-pick=hist][data-v=aldia]');await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
console.log(await p.evaluate(()=>{const L=S.cobrar.find(x=>loanName(x,'cobrar')==='Ana Aldia');const e=engine(L);return{pag:L.pagos.length,saldo:Math.round(e.saldo),venc:e.vencidas.length}}));
// OCR deuda
await p.evaluate(()=>{location.hash='le-debo';render();openModal('loan',{kind:'pagar'})});await p.waitForTimeout(300);
await p.setInputFiles('#fotoLoan',{name:'x.png',mimeType:'image/png',buffer:Buffer.from('89504e47','hex')});await p.waitForTimeout(600);
console.log('ocr hint:',await p.textContent('#ocrLoanHint'));console.log('lhp:',await p.textContent('#lhp'));
await p.screenshot({path:OUT+'/h2.png'});
await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
const lid=await p.evaluate(()=>{const L=S.pagar[S.pagar.length-1];const e=engine(L);console.log('');return [L.id,loanName(L,'pagar'),L.pagos.length,Math.round(e.saldo),L.extra,L.tasa]});console.log(lid);
// OCR pago
await p.evaluate(id=>openModal('pago',{kind:'pagar',id}),lid[0]);await p.waitForTimeout(200);
await p.setInputFiles('#fotoPago',{name:'y.png',mimeType:'image/png',buffer:Buffer.from('89504e47','hex')});await p.waitForTimeout(500);console.log('pago:',await p.textContent('#ocrPagoHint'));
console.log(errs);await b.close()})();
