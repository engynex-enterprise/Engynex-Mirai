// ================= Integraciones gestionadas en el servidor (Vercel + Supabase) =================
// Las claves de correo, WhatsApp e IA se guardan cifradas en el servidor. El navegador solo ve "••••1234".
const EPROV={
 gmail:{n:'Gmail',icon:'mail',d:'Tu cuenta de Gmail o Google Workspace con una contraseña de aplicación.',help:'En tu cuenta de Google activa la verificación en 2 pasos y crea una <b>contraseña de aplicación</b> (myaccount.google.com › Seguridad › Contraseñas de aplicaciones). Límite aprox. 500 correos al día.',
  f:[['user','Tu correo de Gmail','tu@gmail.com','email'],['fromName','Nombre que verá quien recibe','Mirai'],['appPassword','Contraseña de aplicación','16 letras','secret']]},
 sendgrid:{n:'SendGrid',icon:'send',d:'Servicio de envío de Twilio. Plan gratis con límite diario.',help:'En SendGrid › Settings › API Keys crea una clave con permiso <b>Mail Send</b> y verifica tu remitente (Sender Authentication).',
  f:[['from','Remitente verificado','Mirai <avisos@tudominio.com>'],['apiKey','API key','SG.xxxxx','secret']]},
 resend:{n:'Resend',icon:'zap',d:'Fácil de configurar y muy usado con Vercel. Plan gratis mensual.',help:'En resend.com › API Keys crea una clave y verifica tu dominio en Domains. Para probar puedes usar <b>onboarding@resend.dev</b> como remitente.',
  f:[['from','Remitente','Mirai <avisos@tudominio.com>'],['apiKey','API key','re_xxxxx','secret']]},
 smtp:{n:'SMTP',icon:'server',d:'El correo de tu hosting (Hostinger, Zoho, Outlook…) o cualquier servidor SMTP.',help:'Los datos están en el panel de tu proveedor de correo. Puerto 465 usa SSL; 587 usa STARTTLS.',
  f:[['host','Servidor SMTP','smtp.hostinger.com'],['port','Puerto','465','num'],['secure','Conexión segura (SSL)','','bool'],['user','Usuario','avisos@tudominio.com'],['pass','Contraseña','','secret'],['from','Remitente','Mirai <avisos@tudominio.com>']]}
};
const WAF=[['phoneId','ID del número de teléfono','123456789012345'],['template','Nombre de la plantilla aprobada','mirai_resumen'],['lang','Idioma de la plantilla','es'],['token','Token de acceso permanente','EAAG…','secret']];
const AIK={anthropic:['Claude (Anthropic)','sk-ant-…','claude-sonnet-4-5'],openai:['ChatGPT (OpenAI)','sk-…','gpt-4o-mini'],gemini:['Gemini (Google)','AIza…','gemini-2.0-flash']};
window._INT=window._INT||{data:null,loading:false,err:''};
function intLoad(force){if(!srvOk()||(_INT.loading)||(_INT.data&&!force))return;_INT.loading=true;srvFetch('/api/integrations').then(j=>{_INT.data=j.integrations||{};_INT.err=''}).catch(e=>{_INT.err=e.message}).finally(()=>{_INT.loading=false;if(view()==='ajustes')render()})}
const intGet=k=>(_INT.data||{})[k]||null;
const intDraft=()=>window._INTD||(window._INTD={});
function intField(pfx,[k,l,ph,t],cur){const id=`int_${pfx}_${k}`;const sec=cur?.secrets?.[k];
 if(t==='bool')return field(l,`<label class="tg"><input type="checkbox" class="switch" id="${id}" ${cur?.[k]===true||cur?.[k]==='true'||(!cur&&k==='secure')?'checked':''}><span class="sr">Activar</span></label>`);
 if(t==='secret')return field(l,`<div class="ui-money" style="padding-left:12px">${ic('key-round')}<input type="password" id="${id}" placeholder="${sec?esc(sec)+' (déjala vacía para conservarla)':esc(ph)}" autocomplete="new-password"></div>`,{hint:sec?'Guardada y cifrada en tu servidor.':''});
 return field(l,`<input class="inp" id="${id}" type="${t==='num'?'number':t==='email'?'email':'text'}" value="${esc(cur?.[k]??(t==='num'?ph:''))}" placeholder="${esc(ph)}" autocomplete="off">`)}
function intCollect(pfx,fields){const cfg={},secrets={};for(const [k,,,t] of fields){const el=document.getElementById(`int_${pfx}_${k}`);if(!el)continue;if(t==='bool')cfg[k]=el.checked;else if(t==='secret'){if(el.value.trim())secrets[k]=el.value.trim()}else cfg[k]=el.value.trim()}return {...cfg,secrets}}
const intStatus=(cur,label)=>cur?`<span class="pill ok">${ic('circle-check')}${label} · guardado ${cur.updated?fdate(new Date(cur.updated)):''}</span>`:`<span class="pill gray">${ic('circle-dashed')}Sin configurar</span>`;
const intNeedSrv=()=>alertBox('warn','server','Primero conecta tu servidor','Las claves de los proveedores se guardan en tu servidor (por ejemplo Vercel + Supabase), nunca en el navegador. <button class="btn sm" data-act="atab" data-t="servidor">Conectar servidor</button>');

// ---- Correo ----
function intEmailBlock(){if(!srvOk())return intNeedSrv();intLoad();
 if(_INT.loading&&!_INT.data)return `<div class="note">${ic('loader')} Leyendo la configuración de tu servidor…</div>`;
 if(_INT.err&&!_INT.data)return alertBox('bad','circle-x','No pude leer tu servidor',esc(_INT.err)+' <button class="btn sm" data-act="intReload">Reintentar</button>');
 const cur=intGet('email');const D=intDraft();const pv=D.email||cur?.provider||'resend';const P=EPROV[pv];const c=cur?.provider===pv?cur:null;
 return `<div class="int-box"><div class="int-h"><b>Servicio de correo</b>${intStatus(cur,cur?EPROV[cur.provider]?.n||cur.provider:'')}</div>
  <div class="prov-tiles" role="radiogroup" aria-label="Proveedor de correo">${Object.entries(EPROV).map(([k,p])=>`<button type="button" role="radio" aria-checked="${k===pv}" class="ptile ${k===pv?'on':''}" data-act="intPick" data-k="email" data-v="${k}"><span class="pt-i">${ic(p.icon)}</span><b>${p.n}</b><small>${p.d}</small>${cur?.provider===k?`<span class="pt-ok">${ic('check')}</span>`:''}</button>`).join('')}</div>
  <div class="int-help">${ic('lightbulb')}<span>${P.help}</span></div>
  <div class="form">${P.f.map(f=>intField('email',f,c)).join('')}</div>
  <div class="ia-acts"><button class="btn pri" data-act="intSave" data-k="email">${ic('save')}Guardar en el servidor</button><button class="btn" data-act="intTest" data-k="email" ${cur?'':'disabled'}>${ic('send')}Enviar correo de prueba</button>${cur?`<button class="btn ghost" data-act="intDel" data-k="email">${ic('trash-2')}Quitar</button>`:''}</div>
  <p class="note">${ic('lock')} Se guarda cifrado (AES-256) en tu base de datos. Nadie, ni siquiera desde este navegador, puede volver a ver la clave completa.</p></div>`}
// ---- WhatsApp ----
function intWaBlock(){if(!srvOk())return intNeedSrv();intLoad();if(_INT.loading&&!_INT.data)return '';
 const cur=intGet('whatsapp');
 return `<div class="int-box"><div class="int-h"><b>WhatsApp Cloud API (Meta)</b>${intStatus(cur,'Activo')}</div>
  <div class="int-help">${ic('lightbulb')}<span>En <b>developers.facebook.com</b> crea una app tipo Business con WhatsApp. En WhatsApp › API Setup copia el <b>ID del número</b>. Crea un <b>usuario del sistema</b> en Business Settings para un token permanente, y una <b>plantilla</b> de categoría "Utility" con una variable {{1}}.</span></div>
  <div class="form">${WAF.map(f=>intField('wa',f,cur)).join('')}</div>
  <div class="ia-acts"><button class="btn pri" data-act="intSave" data-k="whatsapp">${ic('save')}Guardar en el servidor</button><button class="btn" data-act="intTest" data-k="whatsapp" ${cur?'':'disabled'}>${ic('send')}Enviar mensaje de prueba</button>${cur?`<button class="btn ghost" data-act="intDel" data-k="whatsapp">${ic('trash-2')}Quitar</button>`:''}</div></div>`}
// ---- IA ----
function intAiBlock(){if(!srvOk())return '';intLoad();
 return ajSec('key-round','Claves de IA en tu servidor',`<p class="note" style="margin:0 0 10px">Recomendado: la clave queda cifrada en el servidor y la IA responde desde allí. Solo necesitas la del proveedor que elegiste arriba.</p>${Object.entries(AIK).map(([p,[n,ph,m]])=>{const cur=intGet('ai_'+p);return `<div class="int-row"><div class="int-h"><b>${n}</b>${intStatus(cur,'Lista')}</div><div class="form">${intField('ai_'+p,['apiKey','API key',ph,'secret'],cur)}${intField('ai_'+p,['model','Modelo (opcional)',m],cur)}</div><div class="ia-acts"><button class="btn sm pri" data-act="intSave" data-k="ai_${p}">${ic('save')}Guardar</button><button class="btn sm" data-act="intTest" data-k="ai_${p}" ${cur?'':'disabled'}>${ic('plug-zap')}Probar</button>${cur?`<button class="btn sm ghost" data-act="intDel" data-k="ai_${p}">${ic('trash-2')}Quitar</button>`:''}</div></div>`}).join('')}`)}

// ---- acciones ----
const intFields=k=>k==='email'?EPROV[intDraft().email||intGet('email')?.provider||'resend'].f:k==='whatsapp'?WAF:[['apiKey','','','secret'],['model','','']];
const intPfx=k=>k==='whatsapp'?'wa':k;
async function intRefreshHealth(){try{store.set(KSRVI,await srvFetch('/api/health'))}catch(e){}}
EXTRA_ACT.intPick=b=>{intDraft()[b.dataset.k]=b.dataset.v;render()};
EXTRA_ACT.intReload=()=>{_INT.data=null;_INT.err='';intLoad(true);render()};
EXTRA_ACT.intSave=async b=>{const k=b.dataset.k;const body=intCollect(intPfx(k),intFields(k));if(k==='email')body.provider=intDraft().email||intGet('email')?.provider||'resend';
 const cur=intGet(k);const need=intFields(k).filter(f=>f[3]==='secret').map(f=>f[0]).filter(s=>!body.secrets[s]&&!(cur&&(k!=='email'||cur.provider===body.provider)&&cur.secrets?.[s]));
 if(need.length){toast('Falta la clave o contraseña para guardar.',{type:'warn'});return}
 b.disabled=true;try{await srvFetch('/api/integrations/'+k,body,'PUT');delete intDraft()[k];toast('Guardado de forma segura en tu servidor.',{type:'success',title:'Listo'});if(k==='email'){ensureCan();S.cfg.canales.emailVia='srv';commit()}if(k==='whatsapp'){ensureCan();S.cfg.canales.waVia='api';commit()}await intRefreshHealth();_INT.data=null;intLoad(true)}catch(e){toast(esc(e.message),{type:'error',title:'No se pudo guardar'})}finally{b.disabled=false}};
EXTRA_ACT.intTest=async b=>{const k=b.dataset.k;ensureCan();const cn=S.cfg.canales;const to=k==='email'?(cn.emailTo||AUTH?.acc?.email):k==='whatsapp'?cn.waNum:'';
 if(k==='email'&&!to){toast('Escribe arriba a qué correo enviar.',{type:'warn'});return}if(k==='whatsapp'&&!to){toast('Escribe arriba tu número de WhatsApp.',{type:'warn'});return}
 b.disabled=true;try{const r=await srvFetch(`/api/integrations/${k}/test`,{to});toast(k.startsWith('ai_')?(r.ok?'La IA respondió correctamente.':'La IA respondió, pero no como esperaba.'):`Prueba enviada a ${esc(to)}. Revisa ${k==='email'?'tu bandeja (y spam)':'tu WhatsApp'}.`,{type:r.ok===false?'warn':'success',title:'Prueba'})}catch(e){toast(esc(e.message),{type:'error',title:'La prueba falló'})}finally{b.disabled=false}};
EXTRA_ACT.intDel=async b=>{const k=b.dataset.k;try{await srvFetch('/api/integrations/'+k,null,'DELETE');toast('Configuración eliminada del servidor.',{type:'del'});await intRefreshHealth();_INT.data=null;intLoad(true)}catch(e){toast(esc(e.message),{type:'error'})}};

// ---- inyectar en Ajustes ----
const _ajNi=ajNotif;ajNotif=function(swi){ensureCan();const cn=S.cfg.canales;if(!CLAUDE_RT&&cn.emailVia==='gmail'){cn.emailVia='srv'}
 let h=_ajNi(swi);
 // fuera de claude.ai no existe "Gmail conectado a Claude": solo el servidor
 h=h.replace(/\{v:'gmail',l:'Gmail \(claude\.ai\)'[^}]*\},?/,'');
 h=h.replace('Gmail (claude.ai)','Gmail conectado a Claude (solo dentro de claude.ai)').replace('Mi servidor (SendGrid / Resend / SMTP)','Mi servidor (Gmail, SendGrid, Resend o SMTP)');
 h=h.replace('Gmail funciona dentro de claude.ai. Con tu servidor se usa SendGrid, Resend o SMTP y llega aunque no abras Mirai.',CLAUDE_RT?'Dentro de claude.ai puedes usar el Gmail conectado a Claude. En tu propio servidor eliges Gmail, SendGrid, Resend o SMTP.':'Tu servidor envía los correos con el servicio que elijas abajo, aunque no abras Mirai.');
 if(cn.email&&cn.emailVia==='srv')h=h.replace('<div class="ia-acts"><button class="btn sm" data-act="nTestEmail">',intEmailBlock()+'<div class="ia-acts"><button class="btn sm" data-act="nTestEmail">');
 if(cn.wa&&cn.waVia==='api')h=h.replace('<div class="ia-acts"><button class="btn sm" data-act="nTestWa">',intWaBlock()+'<div class="ia-acts"><button class="btn sm" data-act="nTestWa">');
 if(!CLAUDE_RT)h=h.replace(/Cada mañana revisamos tu libro y, si tienes pagos vencidos[^<]*/,'Cuando entras a Mirai te mostramos primero lo urgente: pagos vencidos o por vencer en los próximos días.').replace('Resumen diario en tu celular','Lo urgente, primero');
 return h};
// el selector "Enviar con" ya no ofrece Gmail-MCP fuera de claude.ai
if(!CLAUDE_RT){const _sel=sel;sel=function(n,opts,v,o){if(n==='emailVia')opts=opts.filter(x=>x.v!=='gmail');return _sel(n,opts,v,o)}}
const _ajIAi=ajIA;ajIA=function(){return _ajIAi()+intAiBlock()};
// Servidor: texto para Vercel + Supabase
const _ajSrv=ajServidor;ajServidor=function(){let h=_ajSrv();const si=srvInfo();
 h=h.replace(/Para enviar correos con SendGrid[^<]*/,'Mirai se publica en tu propio servidor —recomendado <b>Vercel</b> con base de datos <b>Supabase</b>— y desde allí envía correos (Gmail, SendGrid, Resend o SMTP), mensajes por la API de WhatsApp y usa la IA. Las claves se configuran aquí mismo, en Alertas y notificaciones e Inteligencia artificial, y quedan cifradas en tu base de datos.');
 h=h.replace('https://mirai-xxxx.a.run.app','https://mirai.vercel.app');
 if(si)h=h.replace(/Activo · (Firestore|archivo)/,`Activo · ${({supabase:'Supabase',firestore:'Firestore',file:'archivo'})[si.store||si.alertsStore]||'archivo'}`).replace('Cron cada hora (Cloud Scheduler o cron del hosting).','Cron de Vercel (o del hosting) que envía los avisos a su hora.');
 if(si&&si.encryption===false)h=h.replace('<div class="ia-acts">',alertBox('warn','lock','Falta ENCRYPTION_KEY','Sin esta variable el servidor no puede guardar claves. Créala en Vercel › Settings › Environment Variables.')+'<div class="ia-acts">');
 h=h.replace(/<ol class="steps">[^]*?<\/ol>/,`<ol class="steps"><li><b>Supabase:</b> crea un proyecto en supabase.com, abre <b>SQL Editor</b> y ejecuta el archivo <b>supabase/schema.sql</b> del paquete. Copia la <b>Project URL</b> y la clave <b>service_role</b> (Project Settings › API).</li><li><b>GitHub:</b> sube la carpeta <b>mirai-server</b> a un repositorio.</li><li><b>Vercel:</b> New Project › importa el repositorio. En Environment Variables agrega <code>MIRAI_TOKEN</code>, <code>ENCRYPTION_KEY</code> (<code>openssl rand -base64 32</code>), <code>CRON_SECRET</code>, <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code>. Deploy.</li><li>Abre tu Mirai en la dirección de Vercel, entra aquí, pega la dirección y el <b>MIRAI_TOKEN</b> y toca <b>Probar servidor</b>.</li><li>Ve a <b>Alertas y notificaciones</b> y elige tu servicio de correo y WhatsApp; en <b>Inteligencia artificial</b> guarda tu clave. Todo queda en tu servidor.</li></ol><p class="note">${ic('info')} El cron de Vercel corre cada hora en planes Pro; en el plan gratis (Hobby) solo una vez al día: cambia <code>vercel.json</code> a la hora del resumen o usa un cron externo (cron-job.org) llamando a <code>/api/cron/send</code> con <code>Authorization: Bearer CRON_SECRET</code>. También sirve en Hostinger, Docker o Cloud Run con <code>npm start</code>.</p>`);
 return h};
