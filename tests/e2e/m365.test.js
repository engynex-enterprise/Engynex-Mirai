const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1366,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
let html=fs.readFileSync(APP,'utf8');html=html.replace(/<script src="https:[^"]+"><\/script>/g,'');
fs.writeFileSync(OUT+'/app.html','<!doctype html><html><head><meta charset=utf8></head><body>'+html+'</body></html>');
await p.goto('file://'+OUT+'/app.html');await p.waitForTimeout(400);
await p.evaluate(()=>{localStorage.setItem('lmf-tour','1');authHide();S=sample();S.sample=false;S.setup.dismissed=true;location.hash='inicio';render();document.getElementById('toasts').innerHTML=''});await p.waitForTimeout(150);
await p.screenshot({path:OUT+'/m1.png'});
await p.evaluate(()=>{location.hash='me-deben';render()});await p.waitForTimeout(100);await p.screenshot({path:OUT+'/m2.png'});

await p.evaluate(()=>openModal('gasto'));await p.waitForTimeout(100);await p.screenshot({path:OUT+'/m4.png'});await p.evaluate(()=>closeModal());
await p.evaluate(()=>{document.documentElement.classList.add('dk');location.hash='ajustes';ATAB='general';render()});await p.waitForTimeout(100);await p.screenshot({path:OUT+'/m5.png'});
await p.setViewportSize({width:400,height:860});await p.evaluate(()=>{document.documentElement.classList.remove('dk');location.hash='inicio';render()});await p.waitForTimeout(100);console.log('w',await p.evaluate(()=>document.documentElement.scrollWidth));await p.screenshot({path:OUT+'/m6.png'});
console.log(errs);await b.close()})();
