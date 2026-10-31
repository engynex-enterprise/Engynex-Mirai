const {chromium}=require('playwright');const {OUT,APP}=require('../helpers.js');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const mock=`window.claude={use:async n=>n==='sample'?Object.assign(async()=>({text:'x'}),{json:async(pr)=>{
 if(/Clasifícalo y extrae/.test(pr))return {tipo:'tarjeta',desc:'Tarjeta de crédito nueva',valor:5000000,cuota_manejo:30000,tasa_mensual:1.95,uso_mensual:800000,pago_tarjeta:'cuotas',cuotas:6,dudas:['¿El banco te cobra cuota de manejo aunque no la uses?','¿Piensas pagar el total cada mes?']};
 if(/asesor financiero para familias colombianas \\(cifras/.test(pr))return {veredicto:'con_cuidado',titular:'Puedes tenerla si pagas el total cada mes',explicacion:'La tarjeta te sirve, pero diferir compras a cuotas te cuesta intereses.',razones:['Pagarías $ 30.000 de cuota de manejo','Diferir te costaría $ 45.000 al mes'],alternativas:['Pide exoneración de cuota de manejo'],plan:['Configura pago automático del total'],pregunta:'¿Necesitas la tarjeta o solo la quieres por el cupo?',tecnico:{resumen:'El costo financiero anual supera $ 900.000. DTI se mantiene en 9%.',indicadores:[{nombre:'TEA',valor:'26,1%',lectura:'alerta'},{nombre:'DTI',valor:'9%',lectura:'sano'}],recomendacion:'Usar como medio de pago, no de financiación.'}};
 if(/Decide: si el último mensaje/.test(pr))return /comprar/.test(pr.split('Conversación:')[1])?{accion:'consejero',respuesta:'Vamos a analizarlo con tus números.'}:{accion:'responder',respuesta:'Para ahorrar más: **1.** Programa un aporte fijo.\\n- Revisa gastos hormiga\\n- Usa la regla 50/30/20'};
 return {items:[]}}}):null};`;
fs.writeFileSync(OUT+'/pg.html','<!doctype html><body><script>localStorage.setItem("lmf-tour","1");'+mock+'</script>'+fs.readFileSync(APP,'utf8')+'</body>');
await p.route('**/*',r=>r.request().url().startsWith('http')?r.abort():r.continue());
await p.goto('file://'+OUT+'/pg.html');await p.waitForTimeout(500);
await p.evaluate(()=>{authHide();S=sample();S.sample=false;S.setup.dismissed=true;commit();location.hash='consejero';render()});await p.waitForTimeout(300);await p.screenshot({path:OUT+'/c1.png'});
await p.fill('#asTxt','Me ofrecieron una tarjeta de crédito con cupo de 5 millones');await p.click('[data-act=asInterp]');await p.waitForTimeout(600);await p.screenshot({path:OUT+'/c2.png'});
await p.click('#asForm button.btn.ai');await p.waitForTimeout(800);await p.screenshot({path:OUT+'/c3.png',fullPage:true});
await p.click('[data-act=asTab][data-t=fin]');await p.waitForTimeout(200);await p.evaluate(()=>document.querySelector('.as-res').scrollIntoView());await p.screenshot({path:OUT+'/c4.png'});
// local fallback parse
console.log(await p.evaluate(()=>JSON.stringify(localInterp('Comprar un celular de 3 millones a 12 cuotas con la tarjeta al 2%'))));
// chat
await p.click('#asFab');await p.waitForTimeout(300);await p.screenshot({path:OUT+'/c5.png'});
await p.fill('#chIn','¿Cómo puedo ahorrar más?');await p.keyboard.press('Enter');await p.waitForTimeout(600);
await p.fill('#chIn','Quiero comprar una moto de 8 millones a cuotas');await p.keyboard.press('Enter');await p.waitForTimeout(600);await p.screenshot({path:OUT+'/c6.png'});
await p.waitForTimeout(1800);console.log('after go',await p.evaluate(()=>[location.hash,ASR.step,ASR.txt,S.chats.length,S.chats[0].msgs.length]));
// drag fab
const fb=await p.$('#asFab');const bb=await fb.boundingBox();await p.mouse.move(bb.x+20,bb.y+20);await p.mouse.down();await p.mouse.move(300,400,{steps:5});await p.mouse.up();await p.waitForTimeout(200);console.log('pos',await p.evaluate(()=>localStorage.getItem('mirai-chat-pos')));
console.log(errs);await b.close()})();
