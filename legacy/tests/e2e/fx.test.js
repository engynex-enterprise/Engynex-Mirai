const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1360,height:960}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
fs.writeFileSync(OUT+'/pg.html','<!doctype html><body><script>window.claude={use:async n=>n==="sample"?Object.assign(async()=>({text:""}),{json:async(pr)=>/NUEVA categoría/.test(pr)?{nombre:"Mascotas",icon:"paw-print",grupo:"n",tope:120000,razon:"Gastos del perro: comida y veterinario"}:{items:[]}}):null}</script>'+fs.readFileSync(APP,'utf8')+'</body>');
await p.route('**/*',r=>r.request().url().startsWith('http')?r.abort():r.continue());
await p.goto('file://'+OUT+'/pg.html');await p.waitForTimeout(500);
await p.evaluate(()=>{authHide();S=sample();S.sample=false;S.setup.dismissed=true;commit();location.hash='fijos';render()});await p.waitForTimeout(300);
// agua bimestral
await p.evaluate(()=>openModal('fijo'));await p.waitForTimeout(200);
await p.fill('#modal [name=nombre]','Agua Acueducto');await p.waitForTimeout(300);
console.log('tipoValor auto:',await p.inputValue('#modal [name=tipoValor]'));
await p.fill('#modal [name=vmin]','120000');await p.fill('#modal [name=vmax]','170000');
await p.evaluate(()=>{const f=document.querySelector('#mform');const i=f.querySelector('[name=frec]');i.value='bimestral';i.dispatchEvent(new Event('change',{bubbles:true}));const pr=f.querySelector('[name=prox]');pr.value='2026-11-15';});
await p.click('#modal [data-pick=yaPagoM][data-v=si]');await p.waitForTimeout(100);
await p.evaluate(()=>{document.querySelector('#mform [name=fpag]').value='2026-09-20'});await p.fill('#modal [name=vpag]','138000');
await p.screenshot({path:OUT+'/x1.png'});
await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
console.log(await p.evaluate(()=>{const f=S.fijos.find(x=>x.nombre==='Agua Acueducto');const st=fijoStatus(f);return {f:{valor:f.valor,vmin:f.vmin,vmax:f.vmax,desde:f.desde,dia:f.dia},venc:st.venc.length,prox:iso(st.prox.due),g:S.gastos.filter(g=>g.fijoId===f.id).map(g=>g.fecha+' '+g.valor)}}));
await p.screenshot({path:OUT+'/x2.png'});
// quincenal
await p.evaluate(()=>openModal('fijo'));await p.waitForTimeout(200);await p.fill('#modal [name=nombre]','Empleada doméstica');await p.fill('#modal [name=valor]','600000');
await p.evaluate(()=>{const i=document.querySelector('#mform [name=frec]');i.value='quincenal';i.dispatchEvent(new Event('change',{bubbles:true}))});await p.waitForTimeout(100);
await p.click('#modal [data-pick=yaPagoQ][data-v=q2]');await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
console.log(await p.evaluate(()=>{const f=S.fijos.find(x=>x.nombre==='Empleada doméstica');const st=fijoStatus(f);return{pag:f.pagos.map(x=>x.per),venc:st.venc.map(x=>x.per),prox:st.prox&&st.prox.per}}));
// category create via AI
await p.evaluate(()=>openModal('gasto'));await p.waitForTimeout(200);await p.fill('#modal [name=desc]','concentrado para el perro');
await p.evaluate(()=>{const w=document.querySelector('#modal [name=cat]').closest('[data-sel]');openSel(w)});await p.waitForTimeout(100);await p.screenshot({path:OUT+'/x3.png'});
await p.click('#pop [data-catai]');await p.waitForTimeout(400);await p.screenshot({path:OUT+'/x4.png'});
await p.click('#modal2 .dlg-f .btn.pri');await p.waitForTimeout(200);
console.log('cat now',await p.inputValue('#modal [name=cat]'),await p.evaluate(()=>S.cfg.categorias.find(c=>c.nombre==='Mascotas')));
await p.evaluate(()=>closeModal());
// delete + undo
const n0=await p.evaluate(()=>S.fijos.length);await p.click('[data-act=del][data-col=fijos] >> nth=0');await p.waitForTimeout(200);await p.screenshot({path:OUT+'/x5.png'});
await p.click('#toasts [data-tx=undo]');await p.waitForTimeout(200);console.log('undo',n0,await p.evaluate(()=>S.fijos.length));
console.log(errs);await b.close()})();
