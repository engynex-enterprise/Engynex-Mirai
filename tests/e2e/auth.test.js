const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
let html=fs.readFileSync(APP,'utf8');html=html.replace(/<script src="https:[^"]+"><\/script>/g,'');
fs.writeFileSync(OUT+'/app.html','<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>'+html+'</body></html>');
await p.goto('file://'+OUT+'/app.html');await p.waitForTimeout(400);
console.log('screen1',await p.textContent('#auth h1'));await p.screenshot({path:OUT+'/a1.png'});
await p.click('[data-act=aGo][data-v=registro]');
await p.fill('#auth [name=nombre]','Alberto Navarro');await p.fill('#auth [name=email]','alberto@ejemplo.com');await p.fill('#a_pass','Nido#2026segura');await p.fill('#a_pass2','Nido#2026segura');
console.log('meter',await p.textContent('#pwTxt'));await p.screenshot({path:OUT+'/a2.png'});
await p.check('#auth [name=terminos]');await p.click('#auth form button.pri');await p.waitForTimeout(1500);
console.log('screen after reg',await p.textContent('#auth h1'));
await p.click('[data-act=aAfterEmail]');await p.waitForTimeout(200);console.log('2fa setup',await p.textContent('#auth h1'));await p.screenshot({path:OUT+'/a3.png'});
let code=await p.evaluate(()=>totp(AUTH.tmp.secret));for(const [i,c] of [...code].entries())await p.fill(`#auth .otp input[data-oi="${i}"]`,c);await p.waitForTimeout(500);
console.log('backup screen',await p.textContent('#auth h1'));const codes=await p.$$eval('#auth .codes code',e=>e.map(x=>x.textContent));await p.screenshot({path:OUT+'/a4.png'});
await p.check('#aSaved');await p.click('[data-act=aBackupDone]');await p.waitForTimeout(200);console.log('locked?',await p.evaluate(()=>document.body.classList.contains('locked')));
// logout and login with 2fa
await p.evaluate(()=>logout());await p.waitForTimeout(100);await p.fill('#a_pass','mala');await p.click('#auth form button.pri');await p.waitForTimeout(1200);console.log('err',await p.textContent('#auth .alert'));
await p.fill('#a_pass','Nido#2026segura');await p.click('#auth form button.pri');await p.waitForTimeout(1200);console.log('step',await p.textContent('#auth h1'));
await p.click('[data-act=aToggleBackup]');await p.fill('#auth [name=backup]',codes[0]);await p.click('#auth form button.pri');await p.waitForTimeout(400);console.log('in?',!(await p.evaluate(()=>document.body.classList.contains('locked'))));
// reuse backup fails; recovery via app code
await p.evaluate(()=>logout());await p.click('[data-act=aGo][data-v=recuperar]');await p.waitForTimeout(100);console.log('methods',await p.$$eval('#auth .choice b',e=>e.map(x=>x.textContent).join(' | ')));await p.screenshot({path:OUT+'/a5.png'});
await p.click('[data-act=aRecMethod][data-m=app]');code=await p.evaluate(()=>totp(AUTH.acc.totp.secret));for(const [i,c] of [...code].entries())await p.fill(`#auth .otp input[data-oi="${i}"]`,c);await p.waitForTimeout(400);console.log('new pass screen',await p.textContent('#auth h1'));
await p.fill('#a_pass','Otra$Clave99');await p.fill('#a_pass2','Otra$Clave99');await p.click('#auth form button.pri');await p.waitForTimeout(1500);console.log('in after reset',!(await p.evaluate(()=>document.body.classList.contains('locked'))));
// reload: session remembered
await p.reload();await p.waitForTimeout(800);console.log('after reload locked?',await p.evaluate(()=>document.body.classList.contains('locked')));
// seguridad tab
await p.evaluate(()=>{ATAB='seguridad';location.hash='ajustes';render()});await p.waitForTimeout(100);await p.screenshot({path:OUT+'/a6.png'});
await p.evaluate(()=>EXTRA_ACT.secLock());await p.waitForTimeout(100);console.log('lock',await p.textContent('#auth p'));
await p.setViewportSize({width:400,height:860});await p.screenshot({path:OUT+'/a7.png'});
console.log('ERRS',errs);await b.close()})();
