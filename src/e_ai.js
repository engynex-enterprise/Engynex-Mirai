/* ================= categorización automática y detección de gastos hormiga ================= */
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const KW={'Imprevistos':'imprevist|emergencia|urgencia|daño|dano|reparacion|arreglo|varado|grua|cerrajer|plomer|fuga|multa|comparendo|accidente|se rompio|se dano','Vivienda':'arriendo|arrendamiento|administracion|hipoteca|inmobiliaria|predial|canon','Servicios públicos':'energia|luz|enel|codensa|epm|agua|acueducto|alcantarillado|gas natural|vanti|internet|claro|movistar|tigo|etb|wom|plan celular|recarga|aseo','Mercado':'mercado|exito|carulla|jumbo|\\bd1\\b|\\bara\\b|olimpica|makro|surtimax|alkosto|tienda|fruver|verdura|carniceria|supermercado|plaza','Transporte':'gasolina|tanqueo|terpel|primax|biomax|uber|didi|cabify|indriver|taxi|transmilenio|sitp|\\bbus\\b|metro|peaje|parqueadero|lavado del carro|taller|llanta|aceite','Educación':'colegio|pension|matricula|universidad|curso|libro|utiles|uniforme|icetex','Salud':'farmacia|drogueria|\\beps\\b|medic|cita|odontolog|optica|laboratorio|cruz verde|farmatodo|examen|terapia','Comisiones bancarias':'cuota de manejo|comision|retiro|4x1000|gmf|cajero','Mascotas':'veterinari|concentrado|mascota|perro|gato|purina|peluqueria canina','Restaurantes':'restaurante|almuerzo|cena|corrientazo|hamburguesa|pizza|crepes|frisby|kfc|mcdonald|corral|sushi|asadero|comida rapida','Café':'tinto|cafe|juan valdez|tostao|\\boma\\b|starbucks|pandebono|empanada|bunuelo|arepa','Domicilios':'rappi|domicilio|ifood|didi food|propina domicili','Snacks':'snack|paquete|gaseosa|dulce|chicle|helado|galleta|papas|chocolatina|mecato|golosina|jugo|agua botella|antojo','Entretenimiento':'cine|cinecolombia|procinal|cinemark|concierto|teatro|\\bbar\\b|cerveza|rumba|discoteca|juego|steam|playstation|xbox|boleta','Suscripciones':'netflix|spotify|disney|prime video|amazon prime|\\bhbo\\b|\\bmax\\b|youtube|apple|icloud|google one|gimnasio|smart ?fit|bodytech|chatgpt|suscripcion|membresia','Ropa':'ropa|zapato|tenis|camisa|pantalon|zara|falabella|arturo calle|koaj|studio f|vestido|chaqueta','Regalos':'regalo|cumpleanos|detalle|flores','Viajes':'hotel|vuelo|avianca|latam|airbnb|viaje|tiquete|wingo|hostal','Ahorro':'ahorro|bolsillo','Inversión':'\\bcdt\\b|inversion|fiducia|acciones'};
const HKW=/tinto|cafe|gaseosa|snack|paquete|dulce|chicle|helado|galleta|mecato|empanada|pandebono|bunuelo|domicilio|rappi|propina|cigarr|chocolatina|golosina|loteria|chance|antojo|cerveza|jugo|agua botella|retiro|cuota de manejo|recarga|uber|taxi/;
function localCat(desc){const d=norm(desc);if(d.length<2)return null;
  const r=S.cfg.reglas.find(x=>x.k&&d.includes(norm(x.k)));if(r&&catOf(r.cat))return{cat:catOf(r.cat).nombre,src:'regla'};
  const hist=[...S.gastos].reverse().find(g=>{const n=norm(g.desc);return n===d||(d.length>=4&&(n.startsWith(d)||d.startsWith(n)))});if(hist&&catOf(hist.cat))return{cat:catOf(hist.cat).nombre,src:'historial'};
  for(const [c,re] of Object.entries(KW)){if(catOf(c)&&new RegExp(re).test(d))return{cat:catOf(c).nombre,src:'palabras'}}
  for(const c of S.cfg.categorias){if(norm(c.nombre).length>3&&d.includes(norm(c.nombre)))return{cat:c.nombre,src:'palabras'}}
  return null}
function localHormiga(g){if(g.fijoId)return false;const v=+g.valor||0,c=catOf(g.cat),d=norm(g.desc);if(v>S.cfg.umbral*2)return false;if(c&&(c.grupo==='a'||['Vivienda','Servicios públicos','Educación','Salud'].includes(c.nombre)))return false;if(HKW.test(d))return true;if(v<=S.cfg.umbral&&c&&c.grupo==='g')return true;return v<=S.cfg.umbral&&!c}
function isHormiga(g){if(!g||g.fijoId)return false;if(typeof g.hormiga==='boolean')return g.hormiga;return localHormiga(g)}
const vecesMes=desc=>{const d=norm(desc),lim=iso(addDays(today(),-30));return S.gastos.filter(g=>g.fecha>=lim&&norm(g.desc)===d).length};
const AICACHE={};
async function aiClassify(items){let sample=null;try{sample=window.claude&&window.claude.use?await window.claude.use('sample'):null}catch(e){}if(!sample||!items.length)return null;
  const cats=S.cfg.categorias.map(c=>`${c.nombre} (${{n:'necesidad',g:'gusto',a:'ahorro'}[c.grupo]})`);
  const prompt=`Clasificas gastos de una familia colombiana (valores en pesos COP).
Categorías disponibles (usa el nombre EXACTO, sin el paréntesis): ${cats.join('; ')}.
"Gasto hormiga": gasto pequeño (normalmente de hasta unos ${Math.round(S.cfg.umbral*2)} pesos), frecuente o impulsivo, no esencial y fácil de evitar: tinto, snacks, gaseosas, domicilios, propinas, taxis cortos, compras por antojo, retiros con comisión, apps. NO son hormiga: arriendo, servicios públicos, mercado grande, salud, educación, cuotas de créditos ni gastos grandes. Si se repite muchas veces en el mes (campo "veces_mes"), es más probable que sea hormiga.
Responde SOLO un JSON válido así: {"items":[{"i":0,"categoria":"...","hormiga":true,"razon":"máximo 8 palabras"}]}
GASTOS: ${JSON.stringify(items.map((g,i)=>({i,descripcion:g.desc,valor:Math.round(+g.valor||0),veces_mes:vecesMes(g.desc)})))}`;
  try{const r=await sample.json(prompt,{modelTier:'quick'});const out=(r&&r.items)||[];return out.map(x=>({i:+x.i,cat:catOf(x.categoria)?catOf(x.categoria).nombre:null,hormiga:typeof x.hormiga==='boolean'?x.hormiga:null,razon:String(x.razon||'').slice(0,80)}))}catch(e){return null}}

/* ---- en el formulario ---- */
let ACT=null;
function setSelValue(form,name,v){const inp=form.querySelector(`input[type=hidden][name="${name}"]`);if(!inp)return;const wrap=inp.closest('[data-sel]');const opts=OPTS.m[wrap.dataset.sel]||OPTS.p[wrap.dataset.sel]||[];const o=opts.find(x=>String(x.v)===String(v));if(!o)return;inp.value=o.v;const tv=wrap.querySelector('.tv');tv.className='tv';tv.innerHTML=optLabel(o);wrap.closest('.f')?.classList.remove('err')}
function autoCatHint(form,html){const h=form.querySelector('#catHint');if(h)h.innerHTML=html}
function onAutoInput(el){const form=el.closest('form');if(!form)return;const isG=form.dataset.form==='gasto';const desc=fv(form,el.name==='desc'||el.name==='nombre'?el.name:(isG?'desc':'nombre'));
  if(!S.cfg.ia.autocat&&!isG)return;
  if(S.cfg.ia.autocat&&form.dataset.catManual!=='1'){const lc=localCat(desc);if(lc){setSelValue(form,'cat',lc.cat);autoCatHint(form,`<span class="pill info">${ic('wand-sparkles')}Sugerida por ${lc.src==='regla'?'tus reglas':lc.src==='historial'?'tus gastos anteriores':'el nombre'}</span>`)}else if(!desc)autoCatHint(form,'')}
  clearTimeout(ACT);if(norm(desc).length<3)return;ACT=setTimeout(async()=>{const valor=isG?fv(form,'valor'):0;const key=norm(desc)+'|'+(isG?Math.round(valor/1000):'f');
    const needCat=S.cfg.ia.autocat&&form.dataset.catManual!=='1'&&!['regla','historial'].includes(localCat(desc)?.src);const needH=isG&&S.cfg.ia.hormiga&&fv(form,'hormigaMode')==='auto'&&valor>0;if(!needCat&&!needH)return;
    if(needCat)autoCatHint(form,`<span class="pill vio">${ic('sparkles')}La IA está pensando…</span>`);
    let r=AICACHE[key];if(!r){const res=await aiClassify([{desc,valor}]);r=res&&res[0];if(r)AICACHE[key]=r}
    if(!document.body.contains(form)||norm(fv(form,isG?'desc':'nombre'))!==norm(desc))return;
    const lc2=localCat(desc);const resetHint=()=>{if(needCat)autoCatHint(form,lc2?`<span class="pill info">${ic('wand-sparkles')}Sugerida por el nombre</span>`:'')};if(!r){resetHint();return}if(needCat&&(!r.cat||(r.cat==='Otros'&&lc2)))resetHint();
    if(needCat&&r.cat&&!(r.cat==='Otros'&&localCat(desc))&&form.dataset.catManual!=='1'){setSelValue(form,'cat',r.cat);autoCatHint(form,`<span class="pill vio">${ic('sparkles')}Categoría sugerida por IA</span>`)}
    if(isG&&r.hormiga!==null){form.dataset.aiH=r.hormiga?'1':'0';form.dataset.aiR=r.razon;updHormigaHint(form)}},750)}
function updHormigaHint(form){const h=form.querySelector('#hHint');if(!h)return;const mode=fv(form,'hormigaMode');const v=fv(form,'valor');
  if(mode==='si'){h.innerHTML=`<span class="pill warn">${ic('coffee')}Lo marcaste como hormiga</span>`;return}if(mode==='no'){h.innerHTML='';return}
  if(form.dataset.aiH){h.innerHTML=form.dataset.aiH==='1'?`<span class="pill warn" style="white-space:normal">${ic('sparkles')}La IA lo detecta como gasto hormiga${form.dataset.aiR?': '+esc(form.dataset.aiR):''}</span>`:`<span class="pill ok" style="white-space:normal">${ic('sparkles')}La IA no lo ve como hormiga${form.dataset.aiR?': '+esc(form.dataset.aiR):''}</span>`;return}
  const g={desc:fv(form,'desc'),valor:v,cat:fv(form,'cat')};h.innerHTML=v&&localHormiga(g)?`<span class="pill warn">${ic('coffee')}Parece un gasto hormiga</span>`:''}

/* ---- después de guardar: la IA confirma si es hormiga ---- */
let AIQ=[],AIT=null;
function queueHormiga(g){if(!S.cfg.ia.hormiga||g.hormigaSrc==='manual'||g.fijoId)return;AIQ.push(g.id);clearTimeout(AIT);AIT=setTimeout(flushHormiga,400)}
async function flushHormiga(){const ids=AIQ.splice(0,40);const items=ids.map(id=>S.gastos.find(g=>g.id===id)).filter(Boolean);if(!items.length)return;const res=await aiClassify(items);if(!res)return;let n=0;
  res.forEach(r=>{const g=items[r.i];if(!g||g.hormigaSrc==='manual'||r.hormiga===null)return;g.hormiga=r.hormiga;g.hormigaSrc='ia';g.hormigaRazon=r.razon;if(r.hormiga)n++});commit();softRender();if(AIQ.length)flushHormiga();return n}
async function reviewMonth(k){const items=gastosMesK(k).filter(g=>!g.fijoId&&g.hormigaSrc!=='manual'&&g.hormigaSrc!=='ia');if(!items.length){toast('Todos los gastos de este mes ya están revisados');return}
  toast(`La IA está revisando ${items.length} gastos…`);let total=0,ok=false;for(let i=0;i<items.length;i+=40){const part=items.slice(i,i+40);const res=await aiClassify(part);if(!res)break;ok=true;res.forEach(r=>{const g=part[r.i];if(!g||r.hormiga===null)return;g.hormiga=r.hormiga;g.hormigaSrc='ia';g.hormigaRazon=r.razon;if(r.hormiga)total++})}
  if(!ok){toast('No pude consultar la IA en esta vista. Abre el libro en claude.ai.');return}commit();render();toast(`Listo: la IA encontró ${total} gastos hormiga`)}
async function classifyImport(){if(!IMP||!IMP.rows)return;IMP.rows.forEach(r=>{if(r.cat==='Otros'){const lc=localCat(r.desc);if(lc)r.cat=lc.cat}r.hormiga=localHormiga({desc:r.desc,valor:r.valor,cat:r.cat})});
  if(!S.cfg.ia.autocat&&!S.cfg.ia.hormiga)return;IMP.ai='pensando';render();const res=await aiClassify(IMP.rows.slice(0,60));if(!IMP||!IMP.rows)return;if(res){res.forEach(x=>{const r=IMP.rows[x.i];if(!r)return;if(S.cfg.ia.autocat&&x.cat&&!(x.cat==='Otros'&&localCat(r.desc))&&localCat(r.desc)?.src!=='regla')r.cat=x.cat;if(S.cfg.ia.hormiga&&x.hormiga!==null){r.hormiga=x.hormiga;r.aiH=true}});IMP.ai='ok'}else IMP.ai='no';render()}
