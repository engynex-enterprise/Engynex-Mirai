const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1360,height:1100}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
fs.writeFileSync(OUT+'/pg.html','<!doctype html><body><script>localStorage.setItem("lmf-tour","1");const CALLS=[];window.CALLS=CALLS;window.claude={use:async n=>n==="sample"?Object.assign(async()=>({text:"x"}),{json:async()=>({items:[]})}):n==="mcp"?{callTool:async(s,t,i)=>{CALLS.push([s,t,i]);return{payload:{ok:1}}}}:null}</script>'+fs.readFileSync(APP,'utf8')+'</body>');
await p.route('**/*',r=>r.request().url().startsWith('http')?r.abort():r.continue());
await p.goto('file://'+OUT+'/pg.html');await p.waitForTimeout(600);
await p.evaluate(()=>{authHide();S=sample();S.sample=false;S.setup.dismissed=true;commit();location.hash='ajustes';ATAB='ia';render()});await p.waitForTimeout(300);await p.screenshot({path:OUT+'/j1.png'});
await p.click('[data-prov=openai]');await p.waitForTimeout(200);await p.fill('#aiKey','sk-test');await p.click('[data-act=aiTest]');await p.waitForTimeout(800);
console.log('test:',await p.evaluate(()=>window._aiTest));await p.screenshot({path:OUT+'/j2.png'});
// adapter fallback: sample.json through wrapped use
console.log('adapter',await p.evaluate(async()=>{const s=await window.claude.use('sample');try{const r=await s.json('hola');return JSON.stringify(r)}catch(e){return 'err '+e}}));
await p.click('[data-aj="ia|on"]');await p.waitForTimeout(300);console.log('off sample',await p.evaluate(async()=>await window.claude.use('sample')));
await p.evaluate(()=>{ATAB='alertas';render()});await p.waitForTimeout(200);await p.click('[data-aj="can|email"]');await p.waitForTimeout(300);await p.fill('[name=emailTo]','a@b.co');await p.press('[name=emailTo]','Tab');await p.waitForTimeout(300);await p.click('[data-act=nTestEmail]');await p.waitForTimeout(400);
console.log('email calls',await p.evaluate(()=>window.CALLS.map(c=>c[1]+' '+c[2].to+' '+c[2].subject)));await p.screenshot({path:OUT+'/j3.png',fullPage:true});
await p.evaluate(()=>{ATAB='apariencia';render()});await p.waitForTimeout(200);await p.click('[data-ui=fs][data-v=l]');await p.click('[data-ui=tema][data-v=oscuro]');await p.waitForTimeout(200);await p.screenshot({path:OUT+'/j4.png'});
console.log('classes',await p.evaluate(()=>document.documentElement.className));
await p.click('[data-ui=fs][data-v=m]');await p.click('[data-ui=tema][data-v=claro]');
// ingreso con descuentos
await p.evaluate(()=>{location.hash='ingresos';render();openModal('ingreso')});await p.waitForTimeout(300);
await p.fill('#modal [name=concepto]','Salario Altipal');await p.fill('#modal [name=valor]','12000000');await p.click('#modal [data-pick=calc][data-v=bruto]');await p.fill('#modal [name=dON0]','Libranza');await p.fill('#modal [name=dOV0]','350000');await p.waitForTimeout(300);
console.log('prev:',await p.textContent('#dedPrev'));await p.evaluate(()=>document.querySelector('#dedPrev').scrollIntoView());await p.screenshot({path:OUT+'/j5.png'});
await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);console.log(await p.evaluate(()=>{const x=S.ingresos.at(-1);return[x.valor,x.bruto,x.dedTotal]}));
await p.evaluate(()=>{openModal('ingreso');const f=document.querySelector('#mform')});await p.waitForTimeout(200);await p.fill('#modal [name=concepto]','Contrato');await p.fill('#modal [name=valor]','8000000');await p.click('#modal [data-pick=calc][data-v=bruto]');await p.click('#modal [data-pick=dTipo][data-v=independiente]');await p.fill('#modal [name=dRetV]','10');await p.waitForTimeout(300);console.log('indep:',await p.textContent('#dedPrev'));
console.log(errs);await b.close()})();
