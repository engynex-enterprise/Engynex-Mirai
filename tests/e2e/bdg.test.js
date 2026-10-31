const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1366,height:900},deviceScaleFactor:2});const errs=[];p.on('pageerror',e=>errs.push(e.message));
let html=fs.readFileSync(APP,'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'');fs.writeFileSync(OUT+'/app.html','<!doctype html><html><head><meta charset=utf8></head><body>'+html+'</body></html>');
await p.goto('file://'+OUT+'/app.html');await p.waitForTimeout(400);
await p.evaluate(()=>{localStorage.setItem('lmf-tour','1');authHide();S=sample();S.sample=false;S.setup.dismissed=true;GBADGES.forEach(b=>gami().unl[b[0]]='2026-10-31');delete S.gami.unl.racha30;delete S.gami.unl.gasto200;location.hash='logros';render();document.getElementById('toasts').innerHTML=''});await p.waitForTimeout(400);
const el=await p.$('.g-bdg');await el.screenshot({path:OUT+'/bdg.png'});
await p.evaluate(()=>{document.documentElement.classList.add('dk');render()});await p.waitForTimeout(200);await (await p.$('.g-bdg')).screenshot({path:OUT+'/bdg_dk.png'});
console.log(errs);await b.close()})();
