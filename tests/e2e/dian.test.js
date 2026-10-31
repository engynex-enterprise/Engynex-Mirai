const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:900},permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push('owner:'+e.message));
await p.goto('http://localhost:8099/');await p.waitForTimeout(600);
await p.evaluate(()=>{localStorage.setItem('lmf-tour','1');localStorage.setItem('mirai-srv',JSON.stringify({url:'http://localhost:8099',token:'t'}));authHide();S=sample();S.sample=false;S.setup.dismissed=true;
 const kid=S.perfil.miembros.find(m=>/hij/i.test(m.rol));if(kid){kid.depDe=titularId();kid.nac='2015-05-10';kid.depRel='hijo'}
 S.bienes=[{id:'b1',tipo:'inmueble',nombre:'Apartamento Cedritos',ident:'50N-123456',costo:280000000,avaluo:310000000,pct:50,duenio:titularId()}];
 S.calendario.push(...FPL(2026).filter(x=>['prima2','ces','int_ces','pred_bog','veh_bog','matri','arriendo','renta'].includes(x.k)).map(x=>({...x,id:uid(),monto:0})));
 location.hash='renta';render();document.getElementById('toasts').innerHTML=''});await p.waitForTimeout(300);
console.log('menu',await p.evaluate(()=>document.querySelector('.sb-body').innerText.replace(/\n+/g,' | ').slice(0,600)));
await p.screenshot({path:OUT+'/d1.png',fullPage:true});
for(const t of ['ingresos','bienes','dependientes','deducciones','borrador']){await p.click(`[data-act=rTab][data-t=${t}]`);await p.waitForTimeout(150);await p.screenshot({path:`d_${t}.png`,fullPage:true})}
console.log('calc',await p.evaluate(()=>{const C=calcRenta(RENTAY,titularId());return[RENTAY,C.brutos,C.RL,C.apl,C.dep10,C.dep72,C.RLG,C.imp,C.ret,C.saldo,C.nD]}));
await p.evaluate(()=>{location.hash='calendario';render()});await p.waitForTimeout(300);await p.screenshot({path:OUT+'/d_cal.png',fullPage:true});
await p.evaluate(()=>{location.hash='contador';render()});await p.waitForTimeout(500);
await p.fill('#accName','Marcela Rojas');await p.click('[data-act=accNew]');await p.waitForTimeout(1500);
const link=await p.evaluate(()=>accLink(accesos()[0]));console.log('link',link.slice(0,80));
await p.screenshot({path:OUT+'/d_acc.png',fullPage:true});
const c=await ctx.newPage();c.on('pageerror',e=>errs.push('cont:'+e.message));await c.goto(link);await c.waitForTimeout(1500);
await c.screenshot({path:OUT+'/d_portal.png',fullPage:true});
console.log('portal',await c.evaluate(()=>[!!CONT,CONT&&CONT.owner,document.querySelector('.sb-body')?.innerText.replace(/\n+/g,' | '),document.querySelectorAll('main input:not([disabled])').length]));
await c.evaluate(()=>{location.hash='cnotas';render()});await c.waitForTimeout(200);await c.fill('#contNote','Hola, me falta el certificado 220.');await c.click('[data-act=contNote]');await c.waitForTimeout(800);
await p.evaluate(()=>{ACCSRV=null;render()});await p.waitForTimeout(1200);console.log('owner notes',await p.evaluate(()=>JSON.stringify(ACCNOTES).slice(0,200)));
await p.screenshot({path:OUT+'/d_acc2.png',fullPage:true});
// revoke
await p.click('[data-act=accDel]');await p.waitForTimeout(600);const c2=await ctx.newPage();await c2.goto(link);await c2.waitForTimeout(1200);console.log('revoked',await c2.evaluate(()=>document.querySelector('main').innerText.slice(0,120)));
console.log(errs);await b.close()})();
