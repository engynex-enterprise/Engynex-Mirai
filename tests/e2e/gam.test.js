const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1366,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const INT={email:{provider:'resend',from:'Mirai <a@b.co>',secrets:{apiKey:'••••6789'},updated:'2026-10-30T10:00:00Z'}};const calls=[];
await p.route('https://srv.test/**',async r=>{const u=new URL(r.request().url());calls.push(r.request().method()+' '+u.pathname+' '+(r.request().postData()||''));let j={ok:true};
 if(u.pathname==='/api/health')j={ok:true,version:'2.0.0',store:'supabase',email:'resend',emailFrom:'a@b.co',whatsapp:false,ai:[],cron:true,encryption:true};
 if(u.pathname==='/api/integrations')j={ok:true,integrations:INT};
 r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(j)})});
let html=fs.readFileSync(APP,'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'');fs.writeFileSync(OUT+'/app.html','<!doctype html><html><head><meta charset=utf8></head><body>'+html+'</body></html>');await p.goto('file://'+OUT+'/app.html');await p.waitForTimeout(400);
await p.evaluate(()=>{localStorage.setItem('lmf-tour','1');localStorage.setItem('mirai-srv',JSON.stringify({url:'https://srv.test',token:'t'}));authHide();S=sample();S.sample=false;S.setup.dismissed=true;S.gami={visitas:['2026-10-27','2026-10-28','2026-10-29','2026-10-30']};gamiVisit();location.hash='inicio';render();document.getElementById('toasts').innerHTML=''});await p.waitForTimeout(400);
await p.screenshot({path:OUT+'/g1.png'});
await p.evaluate(()=>{location.hash='logros';render()});await p.waitForTimeout(300);await p.screenshot({path:OUT+'/g2.png',fullPage:true});
console.log('xp',await p.evaluate(()=>[gamiXP().total,nivel(gamiXP().total).name,racha(),Object.keys(S.gami.unl).length]));
// new badge celebration
await p.evaluate(()=>{S.inversiones=[];delete S.gami.unl.inversor;commit();S.inversiones.push({id:'x',nombre:'CDT',monto:1000000,tasa:10,inicio:'2026-10-01',plazo:90});commit()});await p.waitForTimeout(900);console.log('toast',await p.evaluate(()=>document.getElementById('toasts').innerText.slice(0,120)));
// notifications settings
await p.evaluate(()=>{ensureCan();S.cfg.canales.email=true;S.cfg.canales.emailVia='srv';S.cfg.canales.emailTo='al@x.co';location.hash='ajustes';ATAB='alertas';render()});await p.waitForTimeout(800);
await p.screenshot({path:OUT+'/g3.png',fullPage:true});
await p.click('.ptile[data-v="smtp"]');await p.waitForTimeout(200);
await p.fill('#int_email_host','smtp.hostinger.com');await p.fill('#int_email_user','u@x.co');await p.fill('#int_email_pass','secret');await p.fill('#int_email_from','Mirai <u@x.co>');
await p.click('[data-act=intSave][data-k=email]');await p.waitForTimeout(500);
await p.click('[data-act=intTest][data-k=email]');await p.waitForTimeout(400);
console.log(calls.filter(c=>!c.includes('snapshot')).join('\n'));
await p.evaluate(()=>{ATAB='ia';render()});await p.waitForTimeout(500);await p.screenshot({path:OUT+'/g4.png',fullPage:true});
console.log(errs);await b.close()})();
