const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1360,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/*',r=>r.request().url().startsWith('http')?r.abort():r.continue());
await p.goto('file://'+OUT+'/pg.html');await p.waitForTimeout(500);
await p.evaluate(()=>{authHide();S=sample();S.sample=false;S.setup.dismissed=true;commit();location.hash='inicio';render()});await p.waitForTimeout(300);
const res=[];for(const m of ['gasto','contacto','loan','fijo','ingreso','activo','inversion','meta','sub','tarjeta','grupo']){try{await p.evaluate(m=>openModal(m,m==='loan'?{dir:'cobrar'}:{}),m);await p.waitForTimeout(150);res.push(m+':'+await p.evaluate(()=>document.querySelectorAll('#modal .f').length+'/'+document.querySelectorAll('#modal .finfo').length));if(m==='loan')await p.screenshot({path:OUT+'/f2.png'})}catch(e){res.push(m+' ERR '+e.message.slice(0,60))}}
console.log(res.join(' | '));console.log(errs);await b.close()})();
