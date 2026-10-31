// ================= Ubicaciones de Colombia: ciudades y detección desde la dirección =================
const GEO_RAW={
'Amazonas':'Leticia|Puerto Nariño',
'Antioquia':'Medellín|Bello|Itagüí|Envigado|Sabaneta|La Estrella|Caldas|Copacabana|Girardota|Barbosa|Rionegro|La Ceja|Marinilla|El Carmen de Viboral|Guarne|El Retiro|Santa Fe de Antioquia|Apartadó|Turbo|Caucasia|Chigorodó|Carepa|Necoclí|Puerto Berrío|Yarumal|Andes|Jardín|Santa Rosa de Osos|Segovia|Sonsón|Guatapé|San Jerónimo|Amagá|Fredonia|Urrao',
'Arauca':'Arauca|Saravena|Tame|Arauquita',
'Atlántico':'Barranquilla|Soledad|Malambo|Puerto Colombia|Sabanalarga|Galapa|Baranoa',
'Bogotá D.C.':'Bogotá',
'Bolívar':'Cartagena|Magangué|Turbaco|Arjona|El Carmen de Bolívar|Mompox',
'Boyacá':'Tunja|Duitama|Sogamoso|Chiquinquirá|Paipa|Villa de Leyva|Puerto Boyacá|Moniquirá|Nobsa|Garagoa',
'Caldas':'Manizales|Villamaría|Chinchiná|La Dorada|Riosucio|Anserma',
'Caquetá':'Florencia|San Vicente del Caguán',
'Casanare':'Yopal|Aguazul|Villanueva|Paz de Ariporo|Tauramena',
'Cauca':'Popayán|Santander de Quilichao|Puerto Tejada|Patía|Piendamó',
'Cesar':'Valledupar|Aguachica|Agustín Codazzi|Bosconia|La Jagua de Ibirico|Curumaní',
'Chocó':'Quibdó|Istmina|Bahía Solano|Nuquí',
'Córdoba':'Montería|Cereté|Lorica|Sahagún|Montelíbano|Planeta Rica|Tierralta',
'Cundinamarca':'Soacha|Chía|Zipaquirá|Facatativá|Fusagasugá|Mosquera|Madrid|Funza|Cajicá|Girardot|Sopó|La Calera|Tocancipá|Gachancipá|Cota|Tenjo|Tabio|Sibaté|Ubaté|Villeta|La Mesa|Anapoima|Ricaurte|Guaduas|Chocontá|Sesquilé|Guatavita|El Rosal|Subachoque|Silvania|Fómeque|Villapinzón|Pacho|Arbeláez|Nemocón|Cogua|Tocaima|Agua de Dios|Apulo|Choachí|Gachetá|Medina|Suesca',
'Guainía':'Inírida',
'Guaviare':'San José del Guaviare',
'Huila':'Neiva|Pitalito|Garzón|La Plata|Campoalegre|San Agustín',
'La Guajira':'Riohacha|Maicao|Uribia|San Juan del Cesar|Fonseca',
'Magdalena':'Santa Marta|Ciénaga|Fundación|El Banco|Zona Bananera|Plato',
'Meta':'Villavicencio|Acacías|Granada|Puerto López|Restrepo|Cumaral|Puerto Gaitán',
'Nariño':'Pasto|Tumaco|Ipiales|Túquerres|La Unión',
'Norte de Santander':'Cúcuta|Villa del Rosario|Los Patios|Ocaña|Pamplona|El Zulia|Tibú',
'Putumayo':'Mocoa|Puerto Asís|Orito|Sibundoy|Valle del Guamuez',
'Quindío':'Armenia|Calarcá|Montenegro|La Tebaida|Quimbaya|Circasia|Salento|Filandia',
'Risaralda':'Pereira|Dosquebradas|Santa Rosa de Cabal|La Virginia',
'San Andrés y Providencia':'San Andrés|Providencia',
'Santander':'Bucaramanga|Floridablanca|Girón|Piedecuesta|Barrancabermeja|San Gil|Socorro|Málaga|Barbosa|Barichara|Lebrija',
'Sucre':'Sincelejo|Corozal|Sampués|Tolú|Coveñas',
'Tolima':'Ibagué|Espinal|Melgar|Honda|Mariquita|Chaparral|Líbano|Flandes',
'Valle del Cauca':'Cali|Palmira|Buenaventura|Tuluá|Cartago|Buga|Jamundí|Yumbo|Candelaria|Florida|Pradera|El Cerrito|Sevilla|Zarzal|Roldanillo|Dagua|La Unión',
'Vaupés':'Mitú',
'Vichada':'Puerto Carreño'};
// v = valor guardado (nombre de la ciudad; si se repite en otro departamento, "Ciudad, Departamento")
const GEO=(()=>{const all=[];for(const d in GEO_RAW)GEO_RAW[d].split('|').forEach(c=>all.push({c,d}));const cnt={};all.forEach(x=>cnt[x.c]=(cnt[x.c]||0)+1);
  return all.map(x=>({...x,v:cnt[x.c]>1&&!(x.c==='Barbosa'&&x.d==='Antioquia')&&!(x.c==='La Unión'&&x.d==='Valle del Cauca')?`${x.c}, ${x.d}`:x.c})).sort((a,b)=>a.c.localeCompare(b.c,'es'))})();
const GEO_TOP=['Bogotá','Medellín','Cali','Barranquilla','Cartagena','Bucaramanga','Pereira','Manizales','Cúcuta','Santa Marta','Ibagué','Villavicencio'];
const GEO_ALIAS={'bogota d c':'Bogotá','bogota dc':'Bogotá','santafe de bogota':'Bogotá','santa fe de bogota':'Bogotá','bta':'Bogotá','bogota':'Bogotá','santiago de cali':'Cali','cartagena de indias':'Cartagena','villa de leiva':'Villa de Leyva','san jose de cucuta':'Cúcuta','mompos':'Mompox','santa cruz de mompox':'Mompox','santiago de tolu':'Tolú','puerto inirida':'Inírida'};
const GEO_ZONAS={'Bogotá':'Usaquén|Chapinero|Santa Fe|San Cristóbal|Usme|Tunjuelito|Bosa|Kennedy|Fontibón|Engativá|Suba|Barrios Unidos|Teusaquillo|Los Mártires|Antonio Nariño|Puente Aranda|La Candelaria|Rafael Uribe Uribe|Ciudad Bolívar|Cedritos|Chicó|Salitre|Modelia|Normandía|Galerías|Castilla|Hayuelos|Colina Campestre|Niza|Mazurén|Rosales|Chapinero Alto|Quinta Camacho|La Soledad|Palermo|Marsella|Timiza|Patio Bonito|Tintal',
 'Medellín':'El Poblado|Laureles|Estadio|Belén|Robledo|Buenos Aires|La América|Manrique|Aranjuez|Castilla|Envigado centro|Las Palmas|Provenza|Manila|Conquistadores',
 'Cali':'Granada|Ciudad Jardín|San Fernando|El Peñón|Chipichape|Santa Mónica|Pance|El Ingenio|Valle del Lili|Tequendama',
 'Barranquilla':'El Prado|Alto Prado|Riomar|Villa Country|Buenavista|Ciudad Jardín|El Golf',
 'Cartagena':'Bocagrande|Castillogrande|Manga|Getsemaní|Crespo|El Laguito|Pie de la Popa|Centro Histórico'};
const cityOpts=extra=>{const o=GEO.map(g=>({v:g.v,l:g.c,h:g.d,icon:'map-pin'}));const top=GEO_TOP.map(c=>o.find(x=>x.v===c)).filter(Boolean);const rest=o.filter(x=>!GEO_TOP.includes(x.v));const out=[...top,...rest];if(extra&&!out.some(x=>x.v===extra))out.unshift({v:extra,l:extra,h:'Otra ciudad',icon:'map-pin'});return out};
const geoOf=v=>GEO.find(g=>g.v===v)||GEO.find(g=>g.c===v)||null;
// --- índice de búsqueda (sin tildes, palabras completas) ---
const GEO_IDX=(()=>{const L=[];GEO.forEach(g=>L.push({k:FN(g.c),g}));for(const a in GEO_ALIAS){const g=geoOf(GEO_ALIAS[a]);if(g)L.push({k:a,g})}return L.sort((a,b)=>b.k.length-a.k.length)})();
const DEP_IDX=Object.keys(GEO_RAW).map(d=>({k:FN(d.replace(' D.C.','')),d})).sort((a,b)=>b.k.length-a.k.length);
function normAddr(s){let t=' '+String(s||'')+' ';const R=[[/\b(avenida\s+carrera|av\.?\s*cra\.?|ak)\b\.?/gi,'Av. Cra'],[/\b(avenida\s+calle|av\.?\s*cl\.?|ac)\b\.?/gi,'Av. Cl'],[/\b(carrera|carerra|cra|kra|kr|cr|crr)\b\.?/gi,'Cra'],[/\b(calle|cll|clle|cl)\b\.?/gi,'Cl'],[/\b(avenida|avda|av)\b\.?(?!\s*(Cra|Cl)\b)/gi,'Av.'],[/\b(transversal|trans|tv|tr)\b\.?/gi,'Tv'],[/\b(diagonal|diag|dg)\b\.?/gi,'Dg'],[/\b(circular|cir)\b\.?/gi,'Cir'],[/\b(apartamento|apto|apt|ap)\b\.?/gi,'Apto'],[/\b(interior|int)\b\.?/gi,'Int'],[/\b(torre|tor)\b\.?/gi,'Torre'],[/\b(oficina|of)\b\.?/gi,'Of.'],
  [/\s*(n[uú]mero|nro\.?|no\.|n°|nº|#)\s*/gi,' # '],[/(\d+[a-z]?)\s*-\s*(\d+)/gi,'$1-$2'],[/\s+,/g,','],[/,\s*,/g,','],[/\s{2,}/g,' ']];
  R.forEach(([re,r])=>t=t.replace(re,r));return t.trim().replace(/^[,\s-]+|[,\s-]+$/g,'')}
// Detecta ciudad, departamento, barrio/zona y deja la dirección limpia
function parseAddr(raw){const s=String(raw||'');if(s.trim().length<4)return null;const n=' '+FN(s).replace(/[,;]/g,' , ')+' ';
  const lastDigit=(()=>{const m=[...n.matchAll(/\d/g)];return m.length?m[m.length-1].index:-1})();
  let dep=null;for(const x of DEP_IDX){const re=new RegExp(`(^|[\\s,])${x.k.replace(/ /g,'\\s+')}(?=[\\s,]|$)`);const m=n.match(re);if(m&&m.index>lastDigit){dep={d:x.d,i:m.index,len:m[0].length};break}}
  let city=null;for(const x of GEO_IDX){const re=new RegExp(`(^|[\\s,])${x.k.replace(/ /g,'\\s+')}(?=[\\s,]|$)`,'g');let m;while((m=re.exec(n))){const after=m.index>lastDigit,comma=/,\s*$/.test(n.slice(0,m.index+1))||/^\s*,/.test(n.slice(m.index+m[0].length));if(!(after||comma))continue;if(dep&&dep.i===m.index&&x.k===FN(dep.d))continue;const sc=(after?2:0)+(comma?1:0)+(dep&&x.g.d===dep.d?3:0)+x.k.length/100;if(!city||sc>city.sc)city={g:x.g,sc,i:m.index,len:m[0].length}}}
  if(city&&dep&&city.g.d!==dep.d){const alt=GEO.find(g=>FN(g.c)===FN(city.g.c)&&g.d===dep.d);if(alt)city.g=alt}
  if(!city&&dep&&dep.d==='Bogotá D.C.')city={g:geoOf('Bogotá')};
  // zona / barrio
  let barrio='';const bm=s.match(/\b(?:barrio|br\.?|b\/|urbanizaci[oó]n|urb\.?|conjunto|sector)\s+([^,#\d][^,#]*)/i);if(bm)barrio=bm[1].trim().replace(/\s+(apto|torre|int|casa|piso).*$/i,'');
  let zona='';const cz=city?GEO_ZONAS[city.g.c]:null;if(!barrio&&cz){for(const z of cz.split('|').sort((a,b)=>b.length-a.length)){if(new RegExp(`(^|[\\s,])${FN(z).replace(/ /g,'\\s+')}(?=[\\s,]|$)`).test(n)){zona=z;break}}}
  if(!city&&!barrio&&!zona){for(const c in GEO_ZONAS){for(const z of GEO_ZONAS[c].split('|')){if(z.length>5&&new RegExp(`(^|[\\s,])${FN(z).replace(/ /g,'\\s+')}(?=[\\s,]|$)`).test(n)){city={g:geoOf(c)};zona=z;break}}if(city)break}}
  // dirección limpia: quita ciudad, departamento, país y barrio del texto
  let clean=s;const rm=t=>{if(!t)return;clean=clean.replace(new RegExp(`[,\\s-]*\\b${t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b\\.?`,'i'),'')};
  const strip=w=>{const re=new RegExp(`[,\\s-]*(${[...w].map(ch=>'aáàAÁ'.includes(ch)?'[aáà]':'eéEÉ'.includes(ch)?'[eé]':'iíIÍ'.includes(ch)?'[ií]':'oóOÓ'.includes(ch)?'[oó]':'uúüUÚ'.includes(ch)?'[uúü]':ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')})(\\s*d\\.?\\s*c\\.?)?(?=[\\s,.]|$)`,'i');clean=clean.replace(re,'')};
  if(bm)clean=clean.replace(bm[0],' ');const stripAll=()=>{if(city){strip(city.g.c);for(const a in GEO_ALIAS)if(GEO_ALIAS[a]===city.g.c&&a.length>3)strip(a)}if(dep)strip(dep.d.replace(' D.C.',''));strip('Colombia')};stripAll();if(zona)strip(zona);
  if(barrio){const keep=clean;clean=barrio;stripAll();barrio=clean.trim().replace(/[,\s-]+$/,'');clean=keep}
  return{ciudad:city?city.g.v:'',cityName:city?city.g.c:'',depto:city?city.g.d:dep?dep.d:'',barrio:barrio||zona,dir:normAddr(clean)}}

async function aiAddr(raw){let sample=null;if(S.cfg.ia.asist===false)return null;try{sample=window.claude&&window.claude.use?await window.claude.use('sample'):null}catch(e){}if(!sample)return null;
  const prompt=`Analiza esta dirección de Colombia escrita por un usuario: "${raw}".
Responde JSON {"direccion":"dirección normalizada al formato colombiano (Cl, Cra, Av., Tv, Dg, # 00-00, Apto) SIN ciudad ni barrio","barrio":"barrio o sector si se puede inferir, o vacío","ciudad":"municipio de Colombia o vacío si no se puede saber","departamento":"departamento o vacío","confianza":"alta|media|baja"}.
Si la dirección no menciona ciudad, NO la adivines: deja ciudad vacía.`;
  try{const r=await sample.json(prompt,{modelTier:'quick'});if(!r)return null;const g=r.ciudad?(GEO.find(x=>FN(x.c)===FN(r.ciudad)&&(!r.departamento||FN(x.d).startsWith(FN(r.departamento).slice(0,5))))||GEO.find(x=>FN(x.c)===FN(r.ciudad))):null;
    return{ciudad:g?g.v:(r.ciudad||''),cityName:g?g.c:(r.ciudad||''),depto:g?g.d:(r.departamento||''),barrio:String(r.barrio||''),dir:r.direccion?normAddr(r.direccion):'',conf:r.confianza||'media'}}catch(e){return null}}

// --- aplicar al formulario ---
function setSelValue(scope,name,v,o={}){const inp=scope.querySelector(`input[type=hidden][name="${name}"]`);if(!inp)return;const w=inp.closest('[data-sel]');if(!w)return;const k=w.dataset.sel;const arr=OPTS.p[k]||OPTS.m[k]||OPTS.x[k];let opt=arr&&arr.find(x=>String(x.v)===String(v));
  if(!opt){opt={v,l:o.l||v,h:o.h||'',icon:o.icon??(/ciudad$/.test(name)?'map-pin':'')};if(arr)arr.unshift(opt)}if(inp.value===String(v))return;inp.value=opt.v;const tv=w.querySelector('.tv');tv.className='tv';tv.innerHTML=optLabel(opt);w.closest('.f')?.classList.remove('err');if(!o.silent)inp.dispatchEvent(new Event('change',{bubbles:true}))}
function addrScope(el){return el.closest('form')||el.closest('.card')||document}
function addrApply(el,r,src,persist){const sc=addrScope(el);const cn=el.dataset.addr;const p=el.dataset.addrP||'';const chip=sc.querySelector(`[data-addr-chip="${el.name}"]`);const edit=!!el.dataset.edit;const fire=x=>{if(!edit)x.dispatchEvent(new Event('change',{bubbles:true}))};
  if(r&&r.ciudad){const dp=sc.querySelector(`[name="${p}depto"]`);if(dp){dp.value=r.depto;fire(dp)}setSelValue(sc,cn,r.ciudad,{l:r.cityName,h:r.depto,silent:edit})}
  let bset='';if(r&&r.barrio){const b=sc.querySelector(`[name="${p}barrio"]`);if(b&&!b.value){b.value=r.barrio;bset=r.barrio;fire(b)}}
  if(edit&&persist&&r&&(r.ciudad||bset)){if(r.ciudad){S.perfil.ciudad=r.ciudad;S.perfil.depto=r.depto}if(bset)S.perfil.barrio=bset;commit()}
  if(chip){chip.innerHTML=r&&(r.ciudad||r.barrio)?`${ic('map-pin')}<span>${src==='ia'?'La IA detectó':'Detectamos'}: <b>${esc([r.barrio,r.cityName,r.depto].filter(Boolean).join(', '))}</b>${src==='ia'&&r.conf!=='alta'?' · confírmalo':''}</span>`:'';chip.hidden=!chip.innerHTML}}
const ADDR_T=new WeakMap();
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset||el.dataset.addr===undefined)return;clearTimeout(ADDR_T.get(el));ADDR_T.set(el,setTimeout(()=>{const r=parseAddr(el.value);addrApply(el,r,'local')},350))});
document.addEventListener('focusout',async e=>{const el=e.target;if(!el.dataset||el.dataset.addr===undefined||!el.value.trim())return;clearTimeout(ADDR_T.get(el));const r=parseAddr(el.value);
  if(r&&r.dir&&r.dir!==el.value&&(r.ciudad||r.barrio||r.dir.length>4)){el.value=r.dir;el.dispatchEvent(new Event('change',{bubbles:true}))}addrApply(el,r,'local',true);
  if((!r||!r.ciudad)&&el.value.trim().length>8){const sc=addrScope(el);const chip=sc.querySelector(`[data-addr-chip="${el.name}"]`);if(chip){chip.hidden=false;chip.innerHTML=`<span class="spin"></span><span>Buscando la ciudad con IA…</span>`}
    const a=await aiAddr(el.value);if(a&&a.dir&&a.ciudad){el.value=a.dir;el.dispatchEvent(new Event('change',{bubbles:true}))}if(a&&(a.ciudad||a.barrio))addrApply(el,a,'ia',true);else if(chip){chip.innerHTML=`${ic('info')}<span>No identificamos la ciudad. Elígela en la lista.</span>`}}},true);
// marcado de un campo de dirección + ciudad + barrio (+ departamento oculto)
function addrFields(p,c,o={}){const ed=k=>o.edit?`data-edit="perfil|${k}"`:'';return `${field('Dirección',txt(p+'direccion',c.direccion,{ph:'Ej. Calle 80 # 15-20 apto 301, Chía',attrs:`data-addr="${p}ciudad" data-addr-p="${p}" autocomplete="street-address" ${ed('direccion')}`})+`<span class="addr-chip" data-addr-chip="${p}direccion" hidden></span>`,{cls:'full'})}
  ${field('Ciudad o municipio',sel(p+'ciudad',cityOpts(c.ciudad),c.ciudad||'',{search:true,create:'city',ph:'Busca tu ciudad',attrs:ed('ciudad')}))}${field('Barrio o sector',txt(p+'barrio',c.barrio,{ph:'Ej. Cedritos',attrs:ed('barrio')}))}<input type="hidden" name="${p}depto" value="${esc(c.depto||geoOf(c.ciudad)?.d||'')}" ${ed('depto')}>`}
