// ================= Gamificación: puntos, niveles, rachas, insignias y misiones =================
// Todo se calcula a partir de lo que ya registras: no hay que hacer nada extra para ganar puntos.
{const pl=MENU.find(x=>x.g==='plan');if(pl&&!pl.items.some(i=>i[0]==='logros'))pl.items.splice(pl.items.findIndex(i=>i[0]==='retos')+1,0,['logros','Logros y nivel','medal'])}
const GLV=[[0,'Semilla','sprout'],[150,'Brote','leaf'],[400,'Planta','flower-2'],[800,'Arbusto','shrub'],[1500,'Árbol','tree-deciduous'],[2500,'Roble','tree-pine'],[4000,'Bosque','trees'],[6500,'Mirai','sparkles']];
const gamiOn=()=>S.cfg.gami!==false;
function gami(){if(!S.gami||typeof S.gami!=='object')S.gami={};const g=S.gami;g.visitas=g.visitas||[];g.unl=g.unl||{};g.mis=g.mis||{};return g}
const wkStart=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x};
function racha(){const v=new Set(gami().visitas);let n=0,d=today();if(!v.has(iso(d)))d=addDays(d,-1);while(v.has(iso(d))){n++;d=addDays(d,-1)}return n}
function rachaMax(){const v=[...new Set(gami().visitas)].sort();let best=0,cur=0,prev=null;for(const s of v){const d=parse(s);cur=prev&&days(prev,d)===1?cur+1:1;best=Math.max(best,cur);prev=d}return best}
function puntuales(){let a=0,t=0;for(const L of S.pagar){try{const e=engine(L);for(const h of e.hist.filter(h=>h.tipo==='cuota')){t++;if(h.fecha<=addDays(h.prog,2))a++}}catch(e){}}return{a,t}}
const GBADGES=[
 ['perfil','Me presento','Completa tu nombre en el perfil.','user-check','b',()=>!!S.perfil.nombre],
 ['gasto1','Primer registro','Registra tu primer gasto.','receipt','b',()=>S.gastos.length>=1],
 ['gasto50','Contador experto','Llega a 50 gastos registrados.','list-checks','s',()=>S.gastos.length>=50],
 ['gasto200','Ojo de halcón','Llega a 200 gastos registrados.','scan-eye','g',()=>S.gastos.length>=200],
 ['ingreso','Sé lo que gano','Registra al menos un ingreso.','arrow-down-to-line','b',()=>S.ingresos.length>=1],
 ['fijos','Sin sorpresas','Registra 3 o más gastos fijos.','house','b',()=>S.fijos.length>=3],
 ['presu','Con presupuesto','Ponle un tope a 3 categorías.','chart-pie','s',()=>S.cfg.categorias.filter(c=>+c.tope>0).length>=3],
 ['meta','Soñar con fecha','Crea tu primera meta de ahorro.','target','b',()=>S.metas.length>=1],
 ['metaok','Meta cumplida','Completa el 100% de una meta.','party-popper','g',()=>S.metas.some(m=>+m.objetivo>0&&+m.ahorrado>=+m.objetivo)],
 ['fondo','Colchón listo','Abre tu bolsillo de emergencias con saldo.','shield-check','s',()=>!!(S.fondo&&S.fondo.on&&+S.fondo.saldo>0)],
 ['puntual','Puntual','Paga 5 cuotas a tiempo.','calendar-check','s',()=>puntuales().a>=5],
 ['libre','¡Deuda saldada!','Termina de pagar una deuda.','badge-check','g',()=>S.pagar.some(L=>{try{return engine(L).done}catch(e){return false}})],
 ['hormiga','Domador de hormigas','Pasa la quincena del mes sin superar tu límite de gastos hormiga.','bug-off','s',()=>{if(today().getDate()<15)return false;const H=hormigas();return H.mes.length>0&&!H.over}],
 ['reto','Retador','Cumple un reto de ahorro.','trophy','s',()=>S.retos.some(r=>{try{return retoEstado(r).ok}catch(e){return false}})],
 ['racha7','Constante','Usa Mirai 7 días seguidos.','flame','s',()=>rachaMax()>=7],
 ['racha30','Imparable','Usa Mirai 30 días seguidos.','flame-kindling','g',()=>rachaMax()>=30],
 ['inversor','Mi plata trabaja','Registra tu primera inversión.','trending-up','s',()=>S.inversiones.length>=1],
 ['consejo','Pregunto antes de gastar','Usa el consejero o el chat de Mirai.','message-circle-question','b',()=>(S.consejos||[]).length>0||(Array.isArray(S.chats)&&S.chats.length>0)]];
const GTIER={b:['Bronce','#B87333'],s:['Plata','#8A97A8'],g:['Oro','#E0A500']};
const GMIS=[
 {k:'reg5',t:'Registra 5 gastos',d:'Anota lo que gastas esta semana, por pequeño que sea.',icon:'receipt',xp:40,goal:5,prog:(a,b)=>S.gastos.filter(g=>g.fecha>=a&&g.fecha<=b).length},
 {k:'dias3',t:'Registra 3 días distintos',d:'Crear el hábito vale más que hacerlo todo un solo día.',icon:'calendar-days',xp:40,goal:3,prog:(a,b)=>new Set(S.gastos.filter(g=>g.fecha>=a&&g.fecha<=b).map(g=>g.fecha)).size},
 {k:'visit4',t:'Entra 4 días a Mirai',d:'Un vistazo rápido a tu plata cada día.',icon:'eye',xp:30,goal:4,prog:(a,b)=>new Set(gami().visitas.filter(v=>v>=a&&v<=b)).size},
 {k:'sinh',t:'3 días sin gastos hormiga',d:'Ni el tintico ni el antojo: tres días limpios esta semana.',icon:'bug-off',xp:50,goal:3,prog:(a,b)=>{let n=0;for(let d=parse(a);iso(d)<=b&&d<=today();d=addDays(d,1)){const s=iso(d);if(s<iso(today())||S.gastos.some(g=>g.fecha===s))if(!S.gastos.some(g=>g.fecha===s&&isHormiga(g)))n++}return n}},
 {k:'aldia',t:'Cero pagos vencidos',d:'Termina la semana sin cuotas ni gastos fijos atrasados.',icon:'circle-check-big',xp:50,goal:1,prog:()=>agenda().filter(x=>x.st==='bad'&&x.dir==='pagar').length?0:1}];
function misionesSemana(){const a=wkStart(today()),b=addDays(a,6),wk=iso(a);const seed=Math.floor(a.getTime()/6048e5);const pool=[...GMIS];const pick=[];let s=seed;while(pick.length<3&&pool.length){s=(s*9301+49297)%233280;pick.push(pool.splice(s%pool.length,1)[0])}
 return pick.map(m=>{const p=Math.min(m.prog(wk,iso(b)),m.goal);return{...m,p,ok:p>=m.goal,wk,fin:b}})}
function gamiXP(){const g=gami();const parts=[];const add=(k,l,icon,v,n)=>{if(v>0)parts.push({k,l,icon,v:Math.round(v),n})};
 const porDia={};S.gastos.forEach(x=>{porDia[x.fecha]=(porDia[x.fecha]||0)+1});const gx=Object.values(porDia).reduce((a,n)=>a+Math.min(n,10),0);
 add('gastos','Gastos registrados','receipt',gx*5,S.gastos.length);
 add('ingresos','Ingresos registrados','arrow-down-to-line',S.ingresos.length*20,S.ingresos.length);
 const P=puntuales();add('cuotas','Cuotas pagadas (a tiempo valen más)','calendar-check',P.a*25+(P.t-P.a)*10,P.t);
 const fp=S.fijos.reduce((a,f)=>a+(f.pagos||[]).length,0);add('fijos','Gastos fijos pagados','house',fp*10,fp);
 const mx=S.metas.reduce((a,m)=>a+(+m.objetivo>0?Math.min(+m.ahorrado/+m.objetivo,1)*60+(+m.ahorrado>=+m.objetivo?100:0):0),0);add('metas','Avance en metas','piggy-bank',mx,S.metas.length);
 const ro=S.retos.filter(r=>{try{return retoEstado(r).ok}catch(e){return false}}).length;add('retos','Retos de ahorro','trophy',ro*100+(S.retos.length-ro)*15,S.retos.length);
 const nv=new Set(g.visitas).size;add('visitas','Días que entraste','calendar-days',nv*3,nv);
 const nb=Object.keys(g.unl).length;add('insignias','Insignias ganadas','medal',nb*50,nb);
 const nm=Object.values(g.mis).reduce((a,l)=>a+l.reduce((s,k)=>s+(GMIS.find(m=>m.k===k)?.xp||0),0),0);add('misiones','Misiones semanales','swords',nm,Object.values(g.mis).flat().length);
 return{total:parts.reduce((a,p)=>a+p.v,0),parts}}
function nivel(xp){let i=0;while(i<GLV.length-1&&xp>=GLV[i+1][0])i++;const cur=GLV[i],nx=GLV[i+1];return{i,n:i+1,name:cur[1],icon:cur[2],min:cur[0],next:nx?nx[0]:null,nextName:nx?nx[1]:null,prog:nx?(xp-cur[0])/(nx[0]-cur[0]):1}}

// ---- detectar logros nuevos y celebrar ----
let _gChk;function gamiCheck(silent){if(!gamiOn()||!S||!S.cfg)return;const g=gami();const first=!g.init;const nuevos=[];
 for(const b of GBADGES){if(!g.unl[b[0]]){let ok=false;try{ok=b[5]()}catch(e){}if(ok){g.unl[b[0]]=iso(today());nuevos.push(b)}}}
 for(const m of misionesSemana()){if(m.ok){g.mis[m.wk]=g.mis[m.wk]||[];if(!g.mis[m.wk].includes(m.k)){g.mis[m.wk].push(m.k);if(!first)toast(`+${m.xp} puntos · ${m.t}`,{type:'success',title:'Misión cumplida'})}}}
 const ks=Object.keys(g.mis).sort();while(ks.length>12)delete g.mis[ks.shift()];
 const L=nivel(gamiXP().total);const subio=g.lvl&&L.n>g.lvl;g.lvl=Math.max(g.lvl||0,L.n);
 if(first){g.init=iso(today());_commitG();return}
 if(nuevos.length||subio)_commitG();
 if(silent)return;
 nuevos.slice(0,3).forEach((b,ix)=>setTimeout(()=>{toast(`${b[2]}`,{type:'success',title:`Insignia: ${b[1]}`,action:{l:'Ver logros',fn:()=>{location.hash='logros'}}});confetti()},ix*900));
 if(subio)setTimeout(()=>{toast(`Ahora eres nivel ${L.n}: ${L.name}. ¡Sigue así!`,{type:'success',title:'¡Subiste de nivel!'});confetti(160)},nuevos.length*900)}
function _commitG(){store.set(LKEY(),S);try{scheduleCloud()}catch(e){}}
const _commitGm=commit;commit=function(){_commitGm.apply(this,arguments);clearTimeout(_gChk);_gChk=setTimeout(()=>gamiCheck(),500)};
function gamiVisit(){if(!S||!S.cfg)return;const g=gami(),t=iso(today());if(!g.visitas.includes(t)){g.visitas.push(t);g.visitas=g.visitas.slice(-400);_commitG()}gamiCheck(true)}
function confetti(n=110){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const c=document.createElement('canvas');c.className='confetti';c.width=innerWidth;c.height=innerHeight;document.body.appendChild(c);const x=c.getContext('2d');const col=['#9EDB4E','#3F7A1E','#1F2B4B','#FFB547','#2CC7EA','#ffffff'];
 const P=[...Array(n)].map(()=>({x:innerWidth/2+(Math.random()-.5)*200,y:innerHeight*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*13-4,s:Math.random()*7+4,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:col[Math.random()*col.length|0]}));let f=0;
 (function tick(){x.clearRect(0,0,c.width,c.height);P.forEach(p=>{p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.globalAlpha=Math.max(0,1-f/110);x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);x.restore()});if(++f<110)requestAnimationFrame(tick);else c.remove()})()}

// ---- vistas ----
const ring=(p,sz,inner)=>{const r=(sz-10)/2,C=2*Math.PI*r;return `<div class="g-ring" style="width:${sz}px;height:${sz}px"><svg viewBox="0 0 ${sz} ${sz}"><circle cx="${sz/2}" cy="${sz/2}" r="${r}" stroke="var(--line-2)" stroke-width="8" fill="none"/><circle cx="${sz/2}" cy="${sz/2}" r="${r}" stroke="url(#gGrad)" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-Math.max(0,Math.min(1,p)))}" transform="rotate(-90 ${sz/2} ${sz/2})"/><defs><linearGradient id="gGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9EDB4E"/><stop offset="1" stop-color="#3F7A1E"/></linearGradient></defs></svg><div class="g-ring-c">${inner}</div></div>`};
const fnum=n=>Math.round(n).toLocaleString('es-CO');
function gamiStrip(){if(!gamiOn())return '';const X=gamiXP(),L=nivel(X.total),r=racha(),M=misionesSemana(),pend=M.find(m=>!m.ok);
 return `<a class="card g-strip" href="#logros"><span class="g-lv">${ic(L.icon)}</span><div class="g-sm"><b>Nivel ${L.n} · ${L.name}</b><div class="g-bar"><i style="width:${(L.prog*100).toFixed(1)}%"></i></div><span class="note">${fnum(X.total)} puntos${L.next?` · faltan ${fnum(L.next-X.total)} para ${L.nextName}`:' · nivel máximo'}</span></div>
  <div class="g-chip ${r?'hot':''}" title="Días seguidos usando Mirai">${ic('flame')}<b>${r}</b><span>${r===1?'día':'días'}</span></div>
  ${pend?`<div class="g-next">${ic(pend.icon)}<div><span class="note">Misión de la semana</span><b>${pend.t}</b><div class="g-bar sm"><i style="width:${pend.p/pend.goal*100}%"></i></div></div></div>`:`<div class="g-next ok">${ic('circle-check-big')}<div><span class="note">Misiones de la semana</span><b>¡Todas cumplidas!</b></div></div>`}
  <span class="g-go">${ic('chevron-right')}</span></a>`}
V.logros=()=>{gami();const on=gamiOn();const head=pageH('medal','b-violet','Logros y nivel','Gana puntos por cuidar tu plata: registrar gastos, pagar a tiempo, ahorrar y cumplir retos. Sube de nivel y colecciona insignias.',`<label class="g-tg">${tog('gami|on',on)}<span>Mostrar logros</span></label>`);
 if(!on)return head+`<div class="card">${empty('medal','Los logros están apagados','Actívalos con el interruptor de arriba para ver tu nivel, rachas, misiones e insignias.')}</div>`;
 const X=gamiXP(),L=nivel(X.total),r=racha(),rm=rachaMax(),M=misionesSemana(),g=gami();const nb=Object.keys(g.unl).length;const P=puntuales();
 const dl=Math.max(0,days(today(),M[0].fin));
 return head+`
 <section class="g-hero card">${ring(L.prog,148,`<span class="g-big">${ic(L.icon)}</span><b>Nivel ${L.n}</b>`)}
  <div class="g-hm"><span class="note">Tu nivel</span><h2>${L.name}</h2><p class="note">${L.next?`${fnum(X.total)} de ${fnum(L.next)} puntos · te faltan <b>${fnum(L.next-X.total)}</b> para ser <b>${L.nextName}</b>.`:`${fnum(X.total)} puntos. ¡Llegaste al nivel máximo!`}</p>
   <div class="g-lvls">${GLV.map((l,ix)=>`<span class="g-lvd ${ix<=L.i?'on':''} ${ix===L.i?'cur':''}" title="${l[1]} · desde ${fnum(l[0])} puntos">${ic(l[2])}</span>`).join('')}</div></div>
  <div class="g-kpis"><div class="g-k ${r?'hot':''}">${ic('flame')}<b>${r}</b><span>días seguidos</span><small>Récord: ${rm}</small></div><div class="g-k">${ic('medal')}<b>${nb}/${GBADGES.length}</b><span>insignias</span></div><div class="g-k">${ic('calendar-check')}<b>${P.t?Math.round(P.a/P.t*100)+'%':'—'}</b><span>cuotas a tiempo</span></div></div></section>
 <section class="card"><div class="ph"><h2>Misiones de la semana</h2><span class="note">${dl?`Se renuevan en ${dl} día${dl>1?'s':''}`:'Se renuevan mañana'}</span></div>
  <div class="g-mis">${M.map(m=>`<div class="g-m ${m.ok?'ok':''}"><span class="g-mi">${ic(m.ok?'check':m.icon)}</span><div class="g-mb"><b>${m.t}</b><span class="note">${m.d}</span><div class="g-bar"><i style="width:${m.p/m.goal*100}%"></i></div><small>${m.p} de ${m.goal}</small></div><span class="g-xp">+${m.xp}</span></div>`).join('')}</div></section>
 <section class="card"><div class="ph"><h2>Insignias</h2><span class="note">Toca una para ver cómo ganarla</span></div>
  <div class="g-bdg">${GBADGES.map(b=>{const u=g.unl[b[0]];const T=GTIER[b[4]];return `<div class="g-b ${u?'on':''}" tabindex="0" style="--tc:${T[1]}"><span class="g-bi">${ic(u?b[3]:'lock')}</span><b>${b[1]}</b><span class="note">${b[2]}</span><small>${u?`${T[0]} · ${fdate(parse(u))}`:T[0]}</small></div>`}).join('')}</div></section>
 <section class="grid g2"><div class="card"><div class="ph"><h2>De dónde vienen tus puntos</h2></div><div class="g-src">${X.parts.sort((a,b)=>b.v-a.v).map(p=>`<div class="g-s"><span class="ri t-green">${ic(p.icon)}</span><div><b>${p.l}</b><span class="note">${p.n} ${p.n===1?'vez':'veces'}</span></div><b class="g-pts">${fnum(p.v)}</b></div>`).join('')||empty('sparkles','Aún no tienes puntos','Registra tu primer gasto para empezar.')}</div></div>
  <div class="card"><div class="ph"><h2>Cómo ganar puntos</h2></div><div class="g-how">${[['receipt','Registrar un gasto','5 (hasta 10 al día)'],['arrow-down-to-line','Registrar un ingreso','20'],['calendar-check','Pagar una cuota a tiempo','25 (tarde: 10)'],['house','Marcar un gasto fijo pagado','10'],['piggy-bank','Cumplir una meta','100 + avance'],['trophy','Cumplir un reto de ahorro','100'],['calendar-days','Entrar a Mirai','3 por día'],['swords','Misión semanal','30 a 50'],['medal','Ganar una insignia','50']].map(([i,t,v])=>`<div class="g-h">${ic(i)}<span>${t}</span><b>${v}</b></div>`).join('')}</div><p class="note">${ic('info')} Los puntos salen de lo que ya registras. No compiten con nadie: son para que veas tu avance y te motives.</p></div></section>`};
// toggle
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.aj==='gami|on'){e.stopImmediatePropagation();S.cfg.gami=e.target.checked;_commitG();render();toast(e.target.checked?'Logros activados':'Logros ocultos',{type:'info'})}},true);
// Inicio: franja de progreso
const _vIni=V.inicio;V.inicio=function(){const h=_vIni.apply(this,arguments);return gamiOn()?gamiStrip()+h:h};
// menú: nivel bajo el nombre
const _rnG=renderNav;renderNav=function(v){_rnG(v);try{if(gamiOn()){const sm=document.querySelector('.sb-user small');if(sm){const L=nivel(gamiXP().total);sm.innerHTML=`${ic(L.icon,'g-ui')} Nivel ${L.n} · ${L.name}`}}}catch(e){}};
HELP.logros={t:'Logros y nivel',i:'Puntos, niveles, rachas, insignias y misiones semanales.',p:['Ganas puntos solo con usar Mirai: registrar gastos, pagar a tiempo, ahorrar y cumplir retos.','Cada semana tienes 3 misiones nuevas; al cumplirlas suman puntos automáticamente.','La racha cuenta los días seguidos que entras a Mirai.','Si no te gusta, apágalo con el interruptor "Mostrar logros".']};
setTimeout(gamiVisit,1200);

// ---- Insignias ilustradas (mismo estilo de los isotipos: degradados, brillo y volumen) ----
// Marco según el nivel: bronce = sello redondo, plata = hexágono, oro = roseta con laureles. Emblema propio por insignia.
const GEMC={perfil:0,gasto1:1,gasto50:1,gasto200:1,ingreso:2,fijos:3,presu:4,meta:5,metaok:5,fondo:2,puntual:3,libre:2,hormiga:6,reto:5,racha7:7,racha30:7,inversor:2,consejo:4};
const GEMS=[['#8FB6FF','#3B6FD8','#1E3F8F'],['#FFB3C1','#F0506E','#A51E43'],['#A8F0C6','#2FBF71','#137447'],['#FFE08A','#F5A524','#B4650A'],['#D7C2FF','#8B5CF6','#5B2BB5'],['#A8F0FF','#2CC7EA','#117FA8'],['#C9F59A','#7CC242','#3F7A1E'],['#FFC59E','#FF7A2F','#C2410C']];
const GMET={b:['#F6C9A0','#C98552','#8A4B22','#5E2F12'],s:['#FFFFFF','#D5DCE6','#8A97A8','#5B6676'],g:['#FFF4C2','#FFD24A','#D99A06','#8A5A00']};
function gBadgeDefs(){if(document.getElementById('gBadgeDefs'))return;const d=document.createElement('div');d.id='gBadgeDefs';d.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
 d.innerHTML=`<svg width="0" height="0" aria-hidden="true"><defs>${Object.entries(GMET).map(([k,c])=>`<linearGradient id="gm-${k}" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient><linearGradient id="gm-${k}-r" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${c[3]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`).join('')}
 ${GEMS.map((c,i)=>`<radialGradient id="ge-${i}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient><linearGradient id="gr-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`).join('')}
 <linearGradient id="g-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <filter id="g-drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0F172A" flood-opacity=".28"/></filter></defs></svg>`;document.body.appendChild(d)}
const gPoly=(n,r1,r2,cx=60,cy=56,rot=-90)=>{let p=[];for(let i=0;i<n*(r2?2:1);i++){const r=r2&&i%2?r2:r1,a=(rot+i*360/(n*(r2?2:1)))*Math.PI/180;p.push((cx+r*Math.cos(a)).toFixed(1)+','+(cy+r*Math.sin(a)).toFixed(1))}return p.join(' ')};
const gStar=(x,y,r)=>`<polygon points="${gPoly(5,r,r*.45,x,y)}" fill="#FFF7D6" stroke="#8A5A00" stroke-width=".8" stroke-linejoin="round"/>`;
function badgeSvg(b,size=84){gBadgeDefs();const t=b[4],e=GEMC[b[0]]??0,M=`url(#gm-${t})`,R=`url(#gm-${t}-r)`;
 const ribbon=`<path d="M38 84L28 124L42 116L50 128L60 92Z" fill="url(#gr-${e})"/><path d="M82 84L92 124L78 116L70 128L60 92Z" fill="url(#gr-${e})"/><path d="M38 84L28 124L42 116L45 121L52 90Z" fill="#000" opacity=".12"/>`;
 const frame=t==='g'?`<g>${[...Array(7)].map((_,i)=>{const a=(200+i*20)*Math.PI/180,a2=(-20-i*20)*Math.PI/180;return `<ellipse cx="${(60+52*Math.cos(a)).toFixed(1)}" cy="${(58+52*Math.sin(a)).toFixed(1)}" rx="7" ry="3.4" transform="rotate(${200+i*20+90} ${(60+52*Math.cos(a)).toFixed(1)} ${(58+52*Math.sin(a)).toFixed(1)})" fill="#7CC242"/><ellipse cx="${(60+52*Math.cos(a2)).toFixed(1)}" cy="${(58+52*Math.sin(a2)).toFixed(1)}" rx="7" ry="3.4" transform="rotate(${-20-i*20+90} ${(60+52*Math.cos(a2)).toFixed(1)} ${(58+52*Math.sin(a2)).toFixed(1)})" fill="#3F7A1E"/>`}).join('')}</g><polygon points="${gPoly(16,49,43)}" fill="${M}" stroke="${R}" stroke-width="2" stroke-linejoin="round"/>`
  :t==='s'?`<polygon points="${gPoly(6,49,0,60,56,-90)}" fill="${M}" stroke="${R}" stroke-width="2.5" stroke-linejoin="round"/><polygon points="${gPoly(6,42,0,60,56,-90)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>`
  :`<circle cx="60" cy="56" r="47" fill="${M}" stroke="${R}" stroke-width="2.5"/><circle cx="60" cy="56" r="41" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="2 4"/>`;
 const stars=t==='g'?gStar(46,100,5)+gStar(60,103,6)+gStar(74,100,5):t==='s'?gStar(53,101,5)+gStar(67,101,5):gStar(60,102,5.5);
 return `<svg class="gbadge" viewBox="0 0 120 132" width="${size}" height="${size*1.1}" aria-hidden="true"><g filter="url(#g-drop)">${ribbon}${frame}
  <circle cx="60" cy="56" r="33" fill="url(#ge-${e})"/><circle cx="60" cy="56" r="33" fill="none" stroke="${R}" stroke-width="2.5"/>
  <path d="M32 50A28 26 0 0 1 88 50Q60 40 32 50Z" fill="url(#g-shine)" opacity=".7"/>
  <g transform="translate(41 37) scale(1.6)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))">${ICONS[b[3]]||''}</g>
  <path d="M42 94H78L74 104L78 112H42L46 104Z" fill="${M}" stroke="${R}" stroke-width="1.5" stroke-linejoin="round"/>${stars}</g></svg>`}
const _vLog=V.logros;V.logros=function(){let h=_vLog.apply(this,arguments);const g=gami();
 for(const b of GBADGES){const u=g.unl[b[0]];h=h.replace(new RegExp(`<span class="g-bi">[^]*?</span><b>${b[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}</b>`),`<span class="g-bi2 ${u?'':'lk'}">${badgeSvg(b)}${u?'':`<span class="g-lock">${ic('lock')}</span>`}</span><b>${b[1]}</b>`)}
 return h};
// toast de insignia nueva con su ilustración
