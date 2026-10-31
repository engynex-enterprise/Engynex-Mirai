const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1360,height:1100}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
fs.writeFileSync(OUT+'/pg.html','<!doctype html><body><script>localStorage.setItem("lmf-tour","1");window.claude={use:async()=>null}</script>'+fs.readFileSync(APP,'utf8')+'</body>');
await p.route('**/*',r=>r.request().url().startsWith('http')?r.abort():r.continue());
await p.goto('file://'+OUT+'/pg.html');await p.waitForTimeout(500);
await p.evaluate(()=>{authHide();S=sample();S.sample=false;S.setup.dismissed=true;commit();location.hash='metas';render()});await p.waitForTimeout(200);
console.log('paydays',await p.evaluate(()=>payDays()));
await p.click('.fondo .aporte.add');await p.waitForTimeout(200);await p.screenshot({path:OUT+'/ap1.png'});await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
const mid=await p.evaluate(()=>S.metas[0].id);await p.click(`.aporte.add[data-lid="${mid}"]`);await p.waitForTimeout(200);await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
console.log(await p.evaluate(()=>S.fijos.filter(f=>f.link).map(f=>[f.nombre,f.valor,f.frec,f.dia,iso(fijoStatus(f).prox.due)])));
// pay fondo aporte
const fid=await p.evaluate(()=>S.fijos.find(f=>f.link&&f.link.t==='fondo').id);await p.evaluate(id=>openModal('pagarFijo',{id}),fid);await p.waitForTimeout(200);await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
const fm=await p.evaluate(()=>S.fijos.find(f=>f.link&&f.link.t==='meta').id);await p.evaluate(id=>openModal('pagarFijo',{id}),fm);await p.waitForTimeout(200);await p.click('#modal .dlg-f .btn.pri');await p.waitForTimeout(300);
console.log(await p.evaluate(()=>[S.fondo.saldo,S.metas[0].ahorrado,S.gastos.filter(g=>g.aporte).length]));
await p.evaluate(()=>{render();window.scrollTo(0,150)});await p.waitForTimeout(200);await p.screenshot({path:OUT+'/ap2.png'});
// delete gasto reverses
const gid=await p.evaluate(()=>S.gastos.find(g=>g.aporte&&g.aporte.t==='meta').id);const before=await p.evaluate(()=>S.metas[0].ahorrado);
await p.evaluate(gid=>{location.hash='gastos';render()},gid);await p.waitForTimeout(200);await p.evaluate(gid=>{const b=document.createElement('button');b.dataset.act='del';b.dataset.col='gastos';b.dataset.id=gid;document.body.appendChild(b);b.click()},gid);await p.waitForTimeout(200);
console.log('revert',before,await p.evaluate(()=>S.metas[0].ahorrado));
// accordion
await p.evaluate(()=>{location.hash='inicio';render()});await p.waitForTimeout(200);await p.click('#side [data-g=dinero]');await p.click('#side [data-g=plan]');await p.waitForTimeout(100);
console.log('open groups',await p.evaluate(()=>[...document.querySelectorAll('#side .sb-item.open')].map(x=>x.dataset.g)));
console.log(errs);await b.close()})();
