/* ================= utilidades ================= */
const ICONS=/*ICONS*/{};
const isoIcon=(n,s=24,cls='')=>ISO[n]?`<svg class="isoi ${cls}" viewBox="0 0 256 256" width="${s}" height="${s}" aria-hidden="true">${ISO[n]}</svg>`:'';
const ic=(n,cls='')=>`<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||ICONS['circle-help']||''}</svg>`;
const NF=new Intl.NumberFormat('es-CO',{maximumFractionDigits:0});
const $=v=>{const n=Math.round(+v||0);return (n<0?'-$\u00a0':'$\u00a0')+NF.format(Math.abs(n))};
const $k=v=>{const a=Math.abs(v);return a>=1e6?'$'+(v/1e6).toLocaleString('es-CO',{maximumFractionDigits:1})+' M':a>=1e3?'$'+Math.round(v/1e3)+' mil':$(v)};
const fx=(v,m)=>!m||m==='COP'?$(v):`${m} ${(+v).toLocaleString('es-CO',{maximumFractionDigits:2})}`;
const pct=(v,d=1)=>(isFinite(v)?v*100:0).toLocaleString('es-CO',{maximumFractionDigits:d})+'%';
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parse=s=>{const [y,m,d]=String(s||iso(today())).split('-').map(Number);return new Date(y,(m||1)-1,d||1)};
const addMonths=(d,n)=>{const r=new Date(d.getFullYear(),d.getMonth()+n,1);const last=new Date(r.getFullYear(),r.getMonth()+1,0).getDate();r.setDate(Math.min(d.getDate(),last));return r};
const addDays=(d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r};
const days=(a,b)=>Math.round((b-a)/864e5);
const lastDay=(y,m)=>new Date(y,m+1,0).getDate();
const fdate=d=>`${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
const fshort=d=>`${d.getDate()} ${MES[d.getMonth()]}`;
const mkey=d=>iso(d).slice(0,7);
const clone=o=>JSON.parse(JSON.stringify(o));
const parseMoney=s=>{s=String(s??'').trim();if(!s)return 0;s=s.replace(/[^\d,.-]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/\./g,'');return parseFloat(s)||0};
const parseNum=s=>parseFloat(String(s??'').replace(',','.'))||0;
const fmtMoneyInput=(v,dec)=>{if(v===''||v==null)return'';const n=+v;if(!isFinite(n))return'';return dec?n.toLocaleString('es-CO',{maximumFractionDigits:2}):NF.format(Math.round(n))};
const initials=n=>(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
const hashC=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return 'c'+(Math.abs(h)%5)};
const relTime=d=>{const n=days(today(),d);return n===0?'Hoy':n===1?'Mañana':n===-1?'Ayer':n>0?`En ${n} días`:`Hace ${-n} días`};
const KEY='libro-mayor-familiar-v3',KEY2='libro-mayor-familiar-v2',KEY1='libro-mayor-familiar-v1',KTHEME='lmf-tema',KREAD='lmf-leidas',KNAV='lmf-nav',KHOME='lmf-inicio',KPRIV='lmf-privado',KSIDE='lmf-menu-contraido';
let BOOK=null;const P_EST=()=>BOOK==='principal'?'libro/estado':'libros/'+BOOK;const P_G=()=>BOOK==='principal'?'gastos':'libros/'+BOOK+'/gastos';const LKEY=()=>BOOK==='principal'?KEY:KEY+':'+BOOK;
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* ================= parámetros por defecto ================= */
const ICON_CHOICES=['house','zap','droplets','wifi','shopping-cart','car','bus','fuel','graduation-cap','heart-pulse','landmark','utensils','coffee','bike','cookie','film','tv','shirt','repeat','dog','gift','plane','piggy-bank','trending-up','briefcase','store','baby','dumbbell','smartphone','receipt','banknote','credit-card','coins','percent','file-text','tag','umbrella','sprout','circle-ellipsis'];
function defCats(){return[['Vivienda','n','house',0],['Servicios públicos','n','zap',0],['Mercado','n','shopping-cart',0],['Transporte','n','car',0],['Educación','n','graduation-cap',0],['Salud','n','heart-pulse',0],['Comisiones bancarias','n','landmark',0],['Mascotas','n','dog',0],['Imprevistos','n','siren',0],['Restaurantes','g','utensils',0],['Café','g','coffee',0],['Domicilios','g','bike',0],['Snacks','g','cookie',0],['Entretenimiento','g','film',0],['Suscripciones','g','repeat',0],['Ropa','g','shirt',0],['Regalos','g','gift',0],['Viajes','g','plane',0],['Ahorro','a','piggy-bank',0],['Inversión','a','trending-up',0],['Otros','g','circle-ellipsis',0]].map(([nombre,grupo,icon,tope])=>({id:uid(),nombre,grupo,icon,tope}))}
const defCatIng=()=>[['Salario','briefcase'],['Honorarios','file-text'],['Arriendos','house'],['Negocio propio','store'],['Intereses y rendimientos','percent'],['Otros ingresos','coins']].map(([nombre,icon])=>({id:uid(),nombre,icon}));
const defEntidades=()=>[['Bancolombia','Banco'],['Banco de Bogotá','Banco'],['Davivienda','Banco'],['BBVA Colombia','Banco'],['Banco de Occidente','Banco'],['Banco Popular','Banco'],['Scotiabank Colpatria','Banco'],['Banco Caja Social','Banco'],['Banco AV Villas','Banco'],['Banco Agrario','Banco'],['Fondo Nacional del Ahorro','Fondo'],['Nu Colombia','Fintech'],['Lulo Bank','Fintech'],['Nequi','Billetera'],['Daviplata','Billetera'],['Cooperativa de ahorro y crédito','Cooperativa']].map(([nombre,tipo])=>({id:uid(),nombre,tipo}));
const defMedios=()=>[['Efectivo','banknote'],['Tarjeta débito','credit-card'],['Tarjeta de crédito','credit-card'],['Transferencia','arrow-left-right'],['Nequi / Daviplata','smartphone']].map(([nombre,icon])=>({id:uid(),nombre,icon}));
const defRel=()=>['Familiar','Amigo','Compañero de trabajo','Cliente','Vecino','Proveedor','Otro'];
function defCalendar(y){const D=(m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return[
  {id:uid(),titulo:'Intereses sobre cesantías',fecha:D(1,31),tipo:'ingreso',monto:0,nota:'Tu empleador te los paga a más tardar el 31 de enero.'},
  {id:uid(),titulo:'Consignación de cesantías al fondo',fecha:D(2,14),tipo:'ingreso',monto:0,nota:'Plazo para que tu empleador consigne las cesantías en tu fondo.'},
  {id:uid(),titulo:'Prima de servicios de junio',fecha:D(6,30),tipo:'ingreso',monto:0,nota:'Medio salario por semestre trabajado.'},
  {id:uid(),titulo:'Prima de servicios de diciembre',fecha:D(12,20),tipo:'ingreso',monto:0,nota:'Plazo legal: 20 de diciembre.'},
  {id:uid(),titulo:'Declaración de renta (DIAN)',fecha:D(8,20),tipo:'egreso',monto:0,nota:'Fecha de ejemplo: ajústala según los dos últimos dígitos de tu cédula en el calendario DIAN del año.'},
  {id:uid(),titulo:'Impuesto predial',fecha:D(4,10),tipo:'egreso',monto:0,nota:'Fecha de ejemplo: cada municipio publica su calendario.'},
  {id:uid(),titulo:'Impuesto vehicular',fecha:D(5,15),tipo:'egreso',monto:0,nota:'Fecha de ejemplo: verifica el calendario de tu departamento.'}]}
function defaults(){return{v:3,sample:false,
  perfil:{nombre:'',ciudad:'',ocupacion:'',digitos:'',riesgo:'moderado',meta:'',miembros:[]},
  cfg:{umbral:25000,limite:250000,trm:{USD:4100,EUR:4450},pct:{n:50,g:30,a:20},emergMeta:6,anticipo:5,usura:26,
    reglas:[],categorias:defCats(),catIngreso:defCatIng(),entidades:defEntidades(),medios:defMedios(),relaciones:defRel(),
    notif:{pagos:true,cobros:true,hormiga:true,presupuesto:true,inversiones:true,metas:true,popup:true},ia:{autocat:true,hormiga:true},apps:defApps(),corteQ:15,alertaPres:100,uvt:{2025:49799,2026:52374},estricto:'equilibrado',def:{cat:'',medio:'',quien:'familia',sistema:'frances',frec:'mensual',plazo:12}},
  setup:{skip:{},dismissed:false},tarjetas:[],grupos:[],retos:[],extras:[],kids:{},resumenes:{},renta:{},calIds:{},correoIds:[],contactos:[],ingresos:[],activos:[],pasivos:[],cobrar:[],pagar:[],inversiones:[],metas:[],fijos:[],suscripciones:[],calendario:defCalendar(today().getFullYear()),gastos:[],consejos:[]}}

/* ================= migración y normalización ================= */
function migrate(o){
  if(!o||typeof o!=='object')return defaults();
  if(o.v===3)return o;
  const d=defaults();const r={...d,sample:!!o.sample};
  r.perfil={...d.perfil,...(o.perfil||{})};const oldIng=r.perfil.ingresos||[];delete r.perfil.ingresos;
  r.ingresos=oldIng.map(x=>({id:x.id||uid(),concepto:x.concepto,cat:'Salario',valor:+x.valor,frec:x.frec||'mensual',dia:30,quien:x.quien||'familia',moneda:x.moneda||'COP'}));
  const oc=o.cfg||{};r.cfg={...d.cfg,umbral:oc.umbral||d.cfg.umbral,limite:oc.limite||d.cfg.limite,trm:{...d.cfg.trm,...(oc.trm||{})},pct:{...d.cfg.pct,...(oc.pct||{})},emergMeta:oc.emergMeta||6,anticipo:oc.anticipo||5,reglas:oc.reglas||[]};
  if(Array.isArray(o.presupuesto)&&o.presupuesto.length){const cats=r.cfg.categorias;o.presupuesto.forEach(p=>{const c=cats.find(x=>x.nombre.toLowerCase()===String(p.cat).toLowerCase());if(c){c.tope=+p.tope;c.grupo=p.grupo}else cats.push({id:uid(),nombre:p.cat,grupo:p.grupo,icon:'tag',tope:+p.tope})})}
  ['activos','pasivos','inversiones','metas','suscripciones','gastos'].forEach(k=>{if(Array.isArray(o[k]))r[k]=o[k]});
  r.inversiones=r.inversiones.map(x=>({...x,tipo:x.tipo==='CDT'?'cdt':x.tipo==='Fondo'?'fondo':x.tipo==='Acciones'?'acciones':x.tipo==='Cripto'?'cripto':(x.tipo||'otro')}));
  if(Array.isArray(o.calendario)&&o.calendario.length)r.calendario=o.calendario;
  r.fijos=(o.recordatorios||[]).map(x=>({id:x.id||uid(),nombre:x.titulo,cat:/arriendo|admin/i.test(x.titulo)?'Vivienda':/energ|agua|gas|internet|tv/i.test(x.titulo)?'Servicios públicos':/coleg|pensi/i.test(x.titulo)?'Educación':'Otros',valor:+x.monto,frec:x.rec==='anual'?'anual':x.rec==='unico'?'unico':'mensual',dia:parse(x.fecha).getDate(),mes:parse(x.fecha).getMonth()+1,fecha:x.fecha,variable:false,medio:'',proveedor:'',desde:mkey(today()),pagos:[]}));
  const toLoan=(L,kind)=>{const i=L.tipo==='EA'?(Math.pow(1+L.tasa/100,1/12)-1)*100:+L.tasa;const pagos=[];for(let j=0;j<(L.pagadas||0);j++)pagos.push({id:uid(),fecha:iso(addMonths(parse(L.inicio),j+1)),tipo:'cuota',valor:0});
    const base={id:L.id||uid(),concepto:'',monto:+L.monto,sistema:'frances',tasa:+i.toFixed(4),frec:'mensual',plazo:+L.plazo,inicio:L.inicio,pagos,extra:0};
    if(kind==='cobrar'){const c={id:uid(),tipo:'persona',nombre:L.nombre,docTipo:'CC',doc:'',telefono:'',email:'',direccion:'',ciudad:'',relacion:'',notas:''};r.contactos.push(c);return{...base,contactoId:c.id}}
    let e=r.cfg.entidades.find(x=>x.nombre.toLowerCase()===String(L.nombre).toLowerCase());if(!e){e={id:uid(),nombre:L.nombre,tipo:'Otro'};r.cfg.entidades.push(e)}return{...base,acreedor:{kind:'entidad',id:e.id}}};
  r.cobrar=(o.cobrar||[]).map(L=>toLoan(L,'cobrar'));r.pagar=(o.pagar||[]).map(L=>toLoan(L,'pagar'));
  return r}
function normalize(o){const r0=migrate(o);const d=defaults();const r={...d,...r0};r.perfil={...d.perfil,...(r0.perfil||{})};r.cfg={...d.cfg,...(r0.cfg||{})};
  r.cfg.trm={...d.cfg.trm,...(r.cfg.trm||{})};r.cfg.pct={...d.cfg.pct,...(r.cfg.pct||{})};r.cfg.notif={...d.cfg.notif,...(r.cfg.notif||{})};r.cfg.ia={...d.cfg.ia,...(r.cfg.ia||{})};r.cfg.def={...d.cfg.def,...(r.cfg.def||{})};
  ['categorias','catIngreso','entidades','medios','relaciones','reglas','apps'].forEach(k=>{if(!Array.isArray(r.cfg[k]))r.cfg[k]=d.cfg[k]});
  ['contactos','ingresos','activos','pasivos','cobrar','pagar','inversiones','metas','fijos','suscripciones','calendario','gastos','consejos','tarjetas','grupos','retos','extras','correoIds'].forEach(k=>{if(!Array.isArray(r[k]))r[k]=[]});['kids','resumenes','renta','calIds'].forEach(k=>{if(!r[k]||typeof r[k]!=='object'||Array.isArray(r[k]))r[k]={}});r.cfg.uvt={2025:49799,2026:52374,...(r.cfg.uvt||{})};
  if(!Array.isArray(r.perfil.miembros))r.perfil.miembros=[];r.setup={skip:{},dismissed:false,...(r0.setup||{})};if(!r0.setup&&(r.ingresos.length||r.gastos.length))r.setup.dismissed=false;
  r.activos.forEach(x=>x.moneda=x.moneda||'COP');r.pasivos.forEach(x=>x.moneda=x.moneda||'COP');
  r.gastos.forEach(g=>{g.quien=g.quien||'familia'});[...r.cobrar,...r.pagar].forEach(L=>{L.pagos=L.pagos||[];L.extra=+L.extra||0;L.frec=L.frec||'mensual';L.sistema=L.sistema||'frances'});
  r.fijos.forEach(f=>{f.pagos=f.pagos||[];f.desde=f.desde||mkey(today())});
  (r.fijos||[]).forEach(f=>{if(f.variable&&!f.vmin){f.vmin=Math.round(f.valor*.85/1000)*1000;f.vmax=Math.round(f.valor*1.15/1000)*1000}});
  if(!r.cfg.categorias.some(c=>c.nombre==='Imprevistos'))r.cfg.categorias.push({id:uid(),nombre:'Imprevistos',grupo:'n',icon:'siren',tope:0});
  if(!r.fondo||typeof r.fondo!=='object')r.fondo={saldo:0,mov:[],on:false};
  r.v=3;return r}

/* ================= datos de ejemplo ================= */
function sample(){
  const t=today(),d=n=>iso(addDays(t,n)),m=n=>iso(addMonths(t,n));const S0=defaults();S0.sample=true;
  const mid={a:uid(),b:uid(),c:uid()};
  S0.perfil={nombre:'Alberto Navarro',ciudad:'',ocupacion:'',digitos:'',riesgo:'moderado',meta:'Fondo de emergencia de 6 meses',miembros:[{id:mid.a,nombre:'Alberto',rol:'Titular',cupo:600000},{id:mid.b,nombre:'Cónyuge',rol:'Cónyuge',cupo:600000},{id:mid.c,nombre:'Hija',rol:'Hija',cupo:150000}]};
  const C=S0.cfg.categorias,cat=n=>C.find(c=>c.nombre===n);[['Vivienda',1700000],['Servicios públicos',450000],['Mercado',1400000],['Transporte',650000],['Educación',1150000],['Salud',250000],['Comisiones bancarias',40000],['Restaurantes',350000],['Café',90000],['Domicilios',60000],['Snacks',50000],['Entretenimiento',150000],['Suscripciones',120000],['Ropa',200000],['Ahorro',1500000],['Inversión',800000]].forEach(([n,v])=>cat(n).tope=v);
  S0.ingresos=[{id:uid(),concepto:'Salario titular',cat:'Salario',valor:4750000,frec:'quincenal',dia:15,quien:mid.a,moneda:'COP'},{id:uid(),concepto:'Salario cónyuge',cat:'Salario',valor:4200000,frec:'mensual',dia:30,quien:mid.b,moneda:'COP'},{id:uid(),concepto:'Arriendo apartaestudio',cat:'Arriendos',valor:1300000,frec:'mensual',dia:5,quien:'familia',moneda:'COP'}];
  const c1={id:uid(),tipo:'persona',nombre:'Andrés Navarro',docTipo:'CC',doc:'1.020.345.678',telefono:'300 123 4567',email:'',direccion:'Cra 15 # 80-20',ciudad:'Bogotá',relacion:'Familiar',notas:'Ejemplo'};
  const c2={id:uid(),tipo:'empresa',nombre:'Muebles Rivera SAS',docTipo:'NIT',doc:'900.123.456-7',telefono:'601 555 0101',email:'compras@ejemplo.co',direccion:'Cl 13 # 68-40',ciudad:'Bogotá',relacion:'Cliente',notas:'Ejemplo'};
  const c3={id:uid(),tipo:'persona',nombre:'Laura Gómez',docTipo:'CC',doc:'52.987.654',telefono:'310 987 6543',email:'',direccion:'',ciudad:'Chía',relacion:'Amigo',notas:'Ejemplo'};
  S0.contactos=[c1,c2,c3];
  const E=S0.cfg.entidades,ent=n=>E.find(e=>e.nombre===n).id;
  const cuotas=(ini,n,f='mensual')=>Array.from({length:n},(_,j)=>({id:uid(),fecha:iso(f==='quincenal'?addDays(parse(ini),15*(j+1)):addMonths(parse(ini),j+1)),tipo:'cuota',valor:0}));
  S0.cobrar=[{id:uid(),contactoId:c1.id,concepto:'Préstamo para el carro',monto:4000000,sistema:'frances',tasa:1,frec:'mensual',plazo:8,inicio:m(-3),pagos:[...cuotas(m(-3),2),{id:uid(),fecha:d(-10),tipo:'abono',valor:500000,modo:'cuota'}],extra:0},
    {id:uid(),contactoId:c2.id,concepto:'Saldo de cocina integral',monto:2500000,sistema:'sin',tasa:0,frec:'quincenal',plazo:5,inicio:d(-40),pagos:cuotas(d(-40),2,'quincenal'),extra:0},
    {id:uid(),contactoId:c3.id,concepto:'Préstamo personal',monto:1000000,sistema:'simple',tasa:2,frec:'mensual',plazo:4,inicio:m(-2),pagos:cuotas(m(-2),1),extra:0}];
  S0.pagar=[{id:uid(),acreedor:{kind:'entidad',id:ent('Banco de Bogotá')},concepto:'Crédito de vehículo',monto:30000000,sistema:'frances',tasa:1.23,frec:'mensual',plazo:48,inicio:m(-14),pagos:cuotas(m(-14),14),extra:65000},
    {id:uid(),acreedor:{kind:'entidad',id:ent('Davivienda')},concepto:'Libre inversión',monto:8000000,sistema:'frances',tasa:1.84,frec:'mensual',plazo:24,inicio:m(-5),pagos:cuotas(m(-5),5),extra:12000}];
  S0.activos=[{id:uid(),cod:'1105',nombre:'Efectivo en casa',valor:850000,moneda:'COP'},{id:uid(),cod:'1110',nombre:'Cuenta de ahorros',valor:12400000,moneda:'COP'},{id:uid(),cod:'1110',nombre:'Cuenta en dólares',valor:2500,moneda:'USD'},{id:uid(),cod:'1540',nombre:'Vehículo (valor comercial)',valor:38000000,moneda:'COP'}];
  S0.pasivos=[{id:uid(),cod:'2380',nombre:'Saldo tarjeta de crédito',valor:2350000,moneda:'COP'}];
  S0.inversiones=[{id:uid(),tipo:'cdt',nombre:'CDT a 180 días',entidad:ent('Bancolombia'),capital:15000000,tasa:9.8,inicio:d(-60),dias:180,ret:4,moneda:'COP',actual:0},{id:uid(),tipo:'ahorro',nombre:'Bolsillo de alto rendimiento',entidad:ent('Nu Colombia'),capital:3000000,tasa:8.25,inicio:d(-90),dias:0,ret:0,moneda:'COP',actual:0},{id:uid(),tipo:'fondo',nombre:'Fondo de inversión colectiva',entidad:ent('Bancolombia'),capital:5000000,tasa:0,inicio:d(-200),dias:0,ret:0,moneda:'COP',actual:5420000}];
  S0.metas=[{id:uid(),nombre:'Viaje familiar a Cartagena',objetivo:8000000,ahorrado:2600000,fecha:m(8),icon:'plane'},{id:uid(),nombre:'Cuota inicial de vivienda',objetivo:60000000,ahorrado:14500000,fecha:m(30),icon:'house'}];
  const prevM=mkey(addMonths(t,-1)),curM=mkey(t);
  S0.fijos=[{id:uid(),nombre:'Arriendo',cat:'Vivienda',valor:1700000,frec:'mensual',dia:5,variable:false,medio:'Transferencia',proveedor:'Inmobiliaria',desde:prevM,pagos:[{per:prevM,fecha:iso(addMonths(t,-1)),valor:1700000}]},
    {id:uid(),nombre:'Energía',cat:'Servicios públicos',valor:186000,vmin:150000,vmax:222000,frec:'mensual',dia:Math.min(t.getDate()+3,28),variable:true,medio:'Nequi / Daviplata',proveedor:'Empresa de energía',desde:curM,pagos:[]},
    {id:uid(),nombre:'Agua y alcantarillado',cat:'Servicios públicos',valor:142000,vmin:118000,vmax:166000,frec:'bimestral',dia:20,variable:true,medio:'Transferencia',proveedor:'Acueducto',desde:curM,pagos:[]},
    {id:uid(),nombre:'Internet y TV',cat:'Servicios públicos',valor:129900,frec:'mensual',dia:Math.max(t.getDate()-2,1),variable:false,medio:'Tarjeta débito',proveedor:'Operador',desde:curM,pagos:[]},
    {id:uid(),nombre:'Administración del conjunto',cat:'Vivienda',valor:420000,frec:'mensual',dia:10,variable:false,medio:'Transferencia',proveedor:'Conjunto',desde:curM,pagos:[]},
    {id:uid(),nombre:'Pensión del colegio',cat:'Educación',valor:1150000,frec:'mensual',dia:Math.min(t.getDate()+9,28),variable:false,medio:'Transferencia',proveedor:'Colegio',desde:curM,pagos:[]},
    {id:uid(),nombre:'SOAT del vehículo',cat:'Transporte',valor:1050000,frec:'anual',dia:addDays(t,26).getDate(),mes:addDays(t,26).getMonth()+1,variable:false,medio:'Tarjeta de crédito',proveedor:'Aseguradora',desde:curM,pagos:[]}];
  S0.suscripciones=[{id:uid(),nombre:'Netflix',valor:44900,ciclo:'mensual',proximo:d(6),moneda:'COP'},{id:uid(),nombre:'Gimnasio',valor:139000,ciclo:'mensual',proximo:d(12),moneda:'COP'},{id:uid(),nombre:'Almacenamiento en la nube',valor:99.99,ciclo:'anual',proximo:d(70),moneda:'USD'}];
  const g=[];const H=[['Café','Tinto y pandebono',6500,mid.a],['Domicilios','Tarifa de domicilio',5900,'familia'],['Snacks','Paquete y gaseosa',4800,mid.c],['Transporte','Taxi corto',9500,mid.b],['Comisiones bancarias','Retiro en cajero',7200,'familia']];
  for(let i=0;i<110;i++){const c=H[i%H.length];g.push({id:uid(),fecha:d(-Math.floor(i*1.6)),desc:c[1],cat:c[0],valor:Math.round(c[2]*(0.8+((i*37)%40)/100)/100)*100,quien:c[3],medio:'Efectivo'})}
  for(let k=0;k<6;k++){const b=addMonths(t,-k);const dd=n=>{const x=new Date(b.getFullYear(),b.getMonth(),n);return iso(x>t?addDays(t,-1):x)};
    g.push({id:uid(),fecha:dd(3),desc:'Mercado quincenal',cat:'Mercado',valor:680000,quien:'familia',medio:'Tarjeta débito'},{id:uid(),fecha:dd(17),desc:'Mercado quincenal',cat:'Mercado',valor:640000,quien:'familia',medio:'Tarjeta débito'},{id:uid(),fecha:dd(9),desc:'SPOTIFY FAMILY',cat:'Suscripciones',valor:26900,quien:'familia',medio:'Tarjeta de crédito'},{id:uid(),fecha:dd(12),desc:'Almuerzo en restaurante',cat:'Restaurantes',valor:128000,quien:'familia',medio:'Tarjeta de crédito'},{id:uid(),fecha:dd(21),desc:'Tanqueo de gasolina',cat:'Transporte',valor:185000,quien:mid.a,medio:'Tarjeta débito'})}
  g.push({id:uid(),fecha:iso(addMonths(t,-1)),desc:'Arriendo',cat:'Vivienda',valor:1700000,quien:'familia',medio:'Transferencia',fijoId:S0.fijos[0].id,per:prevM});
  S0.gastos=g;
  S0.cfg.reglas=[['netflix','Suscripciones'],['spotify','Suscripciones'],['rappi','Domicilios'],['exito','Mercado'],['carulla','Mercado'],['d1','Mercado'],['terpel','Transporte'],['uber','Transporte'],['juan valdez','Café'],['cuota de manejo','Comisiones bancarias']].map(([k,cat])=>({k,cat}));
  return normalize(S0)}

/* ================= motor de préstamos ================= */
const SISTEMAS={
  frances:{n:'Cuota fija',t:'Sistema francés',icon:'equal',d:'Pagas el mismo valor en cada cuota. Es el que usan los bancos en Colombia para créditos de consumo, libranza y vehículo.'},
  aleman:{n:'Cuota que va bajando',t:'Abono fijo a capital (sistema alemán)',icon:'trending-down',d:'Cada cuota abona lo mismo a la deuda y los intereses se calculan sobre lo que falta, así que la cuota empieza alta y baja. Pagas menos intereses en total.'},
  simple:{n:'Interés sobre lo prestado',t:'Interés simple',icon:'percent',d:'Muy común entre conocidos ("te presto al 2%"): el interés de cada cuota se calcula sobre el valor prestado y la cuota es fija.'},
  americano:{n:'Solo intereses y al final el capital',t:'Sistema americano',icon:'hourglass',d:'Cada periodo se pagan solo los intereses y el valor prestado se devuelve completo en la última cuota.'},
  sin:{n:'Sin intereses',t:'Partes iguales',icon:'hand-coins',d:'Se divide el valor en cuotas iguales, sin cobrar intereses.'}};
const FRECS={mensual:{n:'Mensual',per:'mes',k:1,pl:'meses'},quincenal:{n:'Quincenal',per:'quincena',k:.5,pl:'quincenas'},semanal:{n:'Semanal',per:'semana',k:12/52,pl:'semanas'},diario:{n:'Diario',per:'día',k:12/365,pl:'días'},diariohab:{n:'Diario (lunes a sábado)',per:'día hábil',k:12/313,pl:'días hábiles'}};
const FMES={mensual:1,quincenal:2,semanal:52/12,diario:365/12,diariohab:313/12};
function addBiz(d,k){let x=new Date(d),c=0;while(c<k){x=addDays(x,1);if(x.getDay()!==0)c++}return x}
function periodRate(L){const im=(+L.tasa||0)/100;if(L.sistema==='sin'||!im)return 0;const k=FRECS[L.frec]?.k||1;return L.sistema==='simple'?im*k:Math.pow(1+im,k)-1}
const addPeriod=(ini,frec,k)=>frec==='quincenal'?addDays(parse(ini),15*k):frec==='semanal'?addDays(parse(ini),7*k):frec==='diario'?addDays(parse(ini),k):frec==='diariohab'?addBiz(parse(ini),k):addMonths(parse(ini),k);
const annuity=(S,i,n)=>n<=0?S:i===0?S/n:S*i/(1-Math.pow(1+i,-n));
function engine(L){
  const i=periodRate(L),sys=SISTEMAS[L.sistema]?L.sistema:'frances';
  let S=+L.monto,nRem=+L.plazo,k=0,base=S;let C=annuity(S,i,nRem),capF=S/nRem;const extra=+L.extra||0;
  const next=()=>{if(S<=.5||nRem<=0)return null;let int=0,cap=0;
    if(sys==='frances'){int=S*i;cap=nRem<=1?S:Math.min(Math.max(C-int,0),S)}
    else if(sys==='aleman'){int=S*i;cap=nRem<=1?S:Math.min(capF,S)}
    else if(sys==='americano'){int=S*i;cap=nRem<=1?S:0}
    else if(sys==='simple'){int=base*i;cap=nRem<=1?S:Math.min(capF,S)}
    else{int=0;cap=nRem<=1?S:Math.min(capF,S)}
    return{int,cap,valor:int+cap+extra}};
  const hist=[];let intPag=0,pagado=0;
  const pagos=[...L.pagos].map((p,ix)=>({...p,ix})).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.ix-b.ix);
  for(const p of pagos){
    if(p.tipo==='cuota'){const q=next();if(!q)continue;S-=q.cap;k++;nRem--;intPag+=q.int;pagado+=q.valor;hist.push({id:p.id,tipo:'cuota',n:k,fecha:parse(p.fecha),prog:addPeriod(L.inicio,L.frec,k),valor:q.valor,int:q.int,cap:q.cap,extra,saldo:Math.max(S,0)})}
    else{const v=Math.min(+p.valor||0,S);if(v<=0)continue;S-=v;pagado+=v;hist.push({id:p.id,tipo:'abono',fecha:parse(p.fecha),valor:v,int:0,cap:v,extra:0,saldo:Math.max(S,0),modo:p.modo});
      if(S<=.5){S=0;nRem=0;continue}
      if(p.modo==='plazo'&&(sys==='frances'||sys==='aleman'||sys==='simple'||sys==='sin')){
        if(sys==='frances'){nRem=i===0?Math.ceil(S/C):Math.max(1,Math.ceil(-Math.log(1-Math.min(S*i/C,.999999))/Math.log(1+i)))}
        else nRem=Math.max(1,Math.ceil(S/capF-1e-9));
      }else{C=annuity(S,i,nRem);capF=S/nRem;base=S}
      if(sys==='simple')base=S}}
  const plan=[];{const sv={S,nRem,k,C,capF,base};let j=k;while(S>.5&&nRem>0&&plan.length<1200){const q=next();j++;S-=q.cap;nRem--;plan.push({n:j,fecha:addPeriod(L.inicio,L.frec,j),valor:q.valor,int:q.int,cap:q.cap,extra,saldo:Math.max(S,0)})}({S,nRem,k,C,capF,base}=sv)}
  const saldo=Math.max(S,0),nx=plan[0]||null,t=today();const mora=nx&&nx.fecha<t?days(nx.fecha,t):0;
  const vencidas=plan.filter(r=>r.fecha<t);
  const intFut=plan.reduce((a,r)=>a+r.int,0),extraFut=plan.reduce((a,r)=>a+r.extra,0);
  return{i,sys,saldo,hist,plan,next:nx,mora,vencidas,k,intPag,pagado,intTotal:intPag+intFut,totalPagar:pagado+plan.reduce((a,r)=>a+r.valor,0),done:saldo<=.5,progreso:L.monto?1-saldo/L.monto:1,extraFut}}
function previewLoan(p){const L={monto:p.monto,sistema:p.sistema,tasa:p.tasa,frec:p.frec,plazo:p.plazo,inicio:p.inicio||iso(today()),pagos:[],extra:p.extra||0};const e=engine(L);const first=e.plan[0],last=e.plan[e.plan.length-1];
  const ea=L.sistema==='simple'?(+L.tasa||0)*12/100:Math.pow(1+(+L.tasa||0)/100,12)-1;
  return{cuota:first?first.valor:0,cuotaFin:last?last.valor:0,total:e.plan.reduce((a,r)=>a+r.valor,0),int:e.plan.reduce((a,r)=>a+r.int,0),fin:last?last.fecha:null,ea,plan:e.plan}}
function rateFromCuota(M,cuota,n,frec){const k=FRECS[frec]?.k||1;if(cuota*n<=M)return 0;let lo=0,hi=1;for(let it=0;it<80;it++){const mid=(lo+hi)/2;const ip=Math.pow(1+mid,k)-1;const c=annuity(M,ip,n);if(c>cuota)hi=mid;else lo=mid}return lo*100}
const loanName=(L,kind)=>kind==='cobrar'?(S.contactos.find(c=>c.id===L.contactoId)?.nombre||'Sin contacto'):(L.acreedor?.kind==='contacto'?(S.contactos.find(c=>c.id===L.acreedor.id)?.nombre||'—'):(S.cfg.entidades.find(e=>e.id===L.acreedor?.id)?.nombre||'—'));
const loanStatus=e=>e.done?['ok','Pagado','circle-check']:e.mora>0?['bad',`Atrasado ${e.mora} d`,'circle-alert']:e.next&&days(today(),e.next.fecha)<=S.cfg.anticipo?['warn','Cuota pronto','clock']:['info','Al día','check'];

/* ================= gastos fijos ================= */
const FFREC={mensual:'Cada mes',quincenal:'Cada quincena',bimestral:'Cada dos meses',trimestral:'Cada tres meses',semestral:'Cada seis meses',anual:'Una vez al año',unico:'Una sola vez'};const FSTEP={mensual:1,bimestral:2,trimestral:3,semestral:6,anual:12};
function fijoPeriods(f,y,m){const ld=lastDay(y,m),mk=`${y}-${String(m+1).padStart(2,'0')}`,dd=x=>new Date(y,m,Math.min(x||1,ld));
  if(f.frec==='mensual')return[{per:mk,due:dd(f.dia)}];
  if(f.frec==='quincenal')return[{per:mk+'-Q1',due:dd(f.dia&&f.dia<=15?f.dia:15)},{per:mk+'-Q2',due:dd(f.dia2||30)}];
  if(FSTEP[f.frec]>1&&f.frec!=='anual'){const n=FSTEP[f.frec];const [dy,dm]=(f.desde||mk).split('-').map(Number);const diff=(y-dy)*12+(m-(dm-1));return diff>=0&&diff%n===0?[{per:mk,due:dd(f.dia)}]:[]}
  if(f.frec==='anual')return(+f.mes===m+1)?[{per:String(y),due:dd(f.dia)}]:[];
  if(f.frec==='unico'){const d=parse(f.fecha);return d.getFullYear()===y&&d.getMonth()===m?[{per:'U',due:d}]:[]}
  return[]}
function fijoStatus(f){const t=today(),out=[];const [dy,dm]=(f.desde||mkey(t)).split('-').map(Number);const start=new Date(Math.max(new Date(dy,dm-1,1),new Date(t.getFullYear(),t.getMonth()-3,1)));
  for(let d=new Date(start);d<=new Date(t.getFullYear(),t.getMonth()+13,1);d=new Date(d.getFullYear(),d.getMonth()+1,1)){const ini=f.inicio?parse(f.inicio):null;fijoPeriods(f,d.getFullYear(),d.getMonth()).forEach(p=>{if(ini&&p.due<ini)return;const pago=f.pagos.find(x=>x.per===p.per);out.push({...p,pago})})}
  const venc=out.filter(p=>!p.pago&&p.due<t),prox=out.find(p=>!p.pago&&p.due>=t)||null;return{periods:out,venc,prox,mensual:fijoMensual(f)}}
function fijoProxIso(f){if(f&&f.id){const st=fijoStatus(f);const p=st.venc[0]||st.prox;if(p)return iso(p.due)}return iso(addDays(today(),10))}
const fijoMensual=f=>f.frec==='quincenal'?f.valor*2:FSTEP[f.frec]?f.valor/FSTEP[f.frec]:0;

/* ================= cálculos generales ================= */
const conv=(v,m)=>(+v||0)*(m&&m!=='COP'?(+S.cfg.trm[m]||0):1);
const catOf=n=>S.cfg.categorias.find(c=>c.nombre.toLowerCase()===String(n||'').toLowerCase());
const catIcon=n=>catOf(n)?.icon||'tag';
const entName=id=>S.cfg.entidades.find(e=>e.id===id)?.nombre||'—';
const FREC={mensual:1,quincenal:2,semanal:52/12,anual:1/12};
const ingresoMensual=()=>S.ingresos.reduce((a,x)=>a+conv(x.valor,x.moneda)*(FREC[x.frec]||0),0);
const subMensual=x=>conv(x.valor,x.moneda)*(x.ciclo==='anual'?1/12:1)/(+x.comparte>1?+x.comparte:1);
const liquidez=()=>S.activos.filter(a=>/^11/.test(a.cod)).reduce((s,a)=>s+conv(a.valor,a.moneda),0)+S.inversiones.filter(x=>x.tipo==='ahorro').reduce((a,x)=>a+inv(x).valor,0);
const cuotasMes=kind=>S[kind].reduce((a,L)=>{const e=engine(L);if(e.done||!e.next)return a;return a+e.next.valor*(FMES[L.frec]||1)},0);
const fijosMes=()=>S.fijos.reduce((a,f)=>a+fijoMensual(f),0);
const subsMes=()=>S.suscripciones.reduce((a,s)=>a+subMensual(s),0);
const gastosMesK=k=>S.gastos.filter(g=>g.fecha.startsWith(k));
const fijoCats=()=>new Set(S.fijos.map(f=>String(f.cat).toLowerCase()));
const variableMes=()=>{const fc=fijoCats();return S.cfg.categorias.filter(c=>c.grupo!=='a'&&!fc.has(c.nombre.toLowerCase())&&c.nombre!=='Suscripciones').reduce((a,c)=>a+ +c.tope,0)};
function gastoVariableReal(){const t=today();let tot=0,n=0;for(let j=1;j<=3;j++){const k=mkey(addMonths(new Date(t.getFullYear(),t.getMonth(),1),-j));const g=gastosMesK(k).filter(x=>!x.fijoId);if(g.length){tot+=g.reduce((a,x)=>a+ +x.valor,0);n++}}return n?tot/n:variableMes()}
function inv(x){const ini=parse(x.inicio),t=today();const trans=Math.max(0,days(ini,t));
  if(x.tipo==='cdt'){const D=+x.dias||0;const bruto=x.capital*(Math.pow(1+x.tasa/100,D/365)-1);const ret=bruto*(+x.ret||0)/100;const hoyR=x.capital*(Math.pow(1+x.tasa/100,Math.min(trans,D)/365)-1);const venc=addDays(ini,D);return{bruto,ret,neto:bruto-ret,valor:x.capital+hoyR,final:x.capital+bruto-ret,venc,prog:D?Math.min(trans/D,1):1,rest:Math.max(days(t,venc),0),ganHoy:hoyR,mes:(bruto-ret)/(D/30.4||1)}}
  if(x.tipo==='ahorro'){const g=x.capital*(Math.pow(1+x.tasa/100,trans/365)-1);return{bruto:g,ret:0,neto:g,valor:x.capital+g,final:null,venc:null,prog:null,ganHoy:g,mes:x.capital*(Math.pow(1+x.tasa/100,1/12)-1)}}
  const v=+x.actual||+x.capital;return{bruto:v-x.capital,ret:0,neto:v-x.capital,valor:v,final:null,venc:null,prog:null,ganHoy:v-x.capital,rent:x.capital?v/x.capital-1:0,mes:null}}
function totales(){const xc=S.cobrar.reduce((a,L)=>a+engine(L).saldo,0),xp=S.pagar.reduce((a,L)=>a+engine(L).saldo,0),xi=S.inversiones.reduce((a,x)=>a+conv(inv(x).valor,x.moneda),0);
  const xt=tarjetasDeuda(),A=S.activos.reduce((a,x)=>a+conv(x.valor,x.moneda),0)+xc+xi,P=S.pasivos.reduce((a,x)=>a+conv(x.valor,x.moneda),0)+xp+xt;return{xc,xp,xi,xt,A,P,pat:A-P}}
function hormigas(){const t=today(),k=mkey(t);const small=S.gastos.filter(isHormiga);const mes=small.filter(g=>g.fecha.startsWith(k));
  const porCat={};mes.forEach(g=>{porCat[g.cat]=porCat[g.cat]||{n:0,v:0};porCat[g.cat].n++;porCat[g.cat].v+= +g.valor});
  const totalMes=mes.reduce((a,g)=>a+ +g.valor,0);const meses=[];for(let j=5;j>=0;j--){const a=addMonths(new Date(t.getFullYear(),t.getMonth(),1),-j);const kk=mkey(a);meses.push({l:MES[a.getMonth()],v:small.filter(g=>g.fecha.startsWith(kk)).reduce((s,g)=>s+ +g.valor,0)})}
  const dim=lastDay(t.getFullYear(),t.getMonth());const proy=totalMes/t.getDate()*dim;return{mes,porCat,totalMes,meses,proy,anual:proy*12,over:proy>S.cfg.limite}}
function subOcc(s,a,b){const out=[];let d=parse(s.proximo);const step=s.ciclo==='anual'?12:1;while(d>a)d=addMonths(d,-step);while(d<=b){if(d>=a)out.push(new Date(d));d=addMonths(d,step)}return out}
function loanCal(L){const e=engine(L);const rows=[];e.hist.filter(h=>h.tipo==='cuota').forEach(h=>rows.push({fecha:h.prog,valor:h.valor,paid:true,n:h.n}));e.plan.forEach(p=>rows.push({fecha:p.fecha,valor:p.valor,paid:false,n:p.n}));return rows}

/* ---- quincenas ---- */
function quincena(y,m,which){const ld=lastDay(y,m);const cq=Math.min(Math.max(+S.cfg.corteQ||15,1),27);const a=new Date(y,m,which==='q2'?cq+1:1),b=new Date(y,m,which==='q1'?cq:ld);const inR=d=>d>=a&&d<=b;const ent=[],sal=[];
  S.ingresos.forEach(x=>{const v=conv(x.valor,x.moneda);if(x.frec==='mensual'){const d=new Date(y,m,Math.min(x.dia||30,ld));if(inR(d))ent.push({icon:'briefcase',n:x.concepto,s:'Ingreso · '+fshort(d),v,fecha:d})}
    else if(x.frec==='quincenal'){[new Date(y,m,15),new Date(y,m,ld)].forEach(d=>{if(inR(d))ent.push({icon:'briefcase',n:x.concepto,s:'Ingreso quincenal · '+fshort(d),v,fecha:d})})}
    else if(x.frec==='semanal'){let c=0;for(let d=new Date(a);d<=b;d=addDays(d,1))if(d.getDay()===5)c++;if(c)ent.push({icon:'briefcase',n:x.concepto,s:`${c} pagos semanales`,v:v*c,fecha:a})}});
  S.cobrar.forEach(L=>loanCal(L).forEach(r=>{if(inR(r.fecha))ent.push({icon:'hand-coins',n:`Cuota ${r.n} · ${loanName(L,'cobrar')}`,s:'Te pagan · '+fshort(r.fecha),v:r.valor,fecha:r.fecha,paid:r.paid})}));
  S.calendario.filter(c=>c.tipo==='ingreso'&&+c.monto>0).forEach(c=>{const d=new Date(y,parse(c.fecha).getMonth(),parse(c.fecha).getDate());if(inR(d))ent.push({icon:'calendar',n:c.titulo,s:fshort(d),v:+c.monto,fecha:d})});
  S.fijos.forEach(f=>fijoPeriods(f,y,m).forEach(p=>{if(inR(p.due)){const pg=f.pagos.find(x=>x.per===p.per);sal.push({icon:catIcon(f.cat),n:f.nombre,s:'Gasto fijo · '+fshort(p.due),v:pg?+pg.valor:+f.valor,fecha:p.due,paid:!!pg})}}));
  S.pagar.forEach(L=>loanCal(L).forEach(r=>{if(inR(r.fecha))sal.push({icon:'landmark',n:`Cuota ${r.n} · ${loanName(L,'pagar')}`,s:'Crédito · '+fshort(r.fecha),v:r.valor,fecha:r.fecha,paid:r.paid})}));
  S.suscripciones.forEach(s=>subOcc(s,a,b).forEach(d=>sal.push({icon:'repeat',n:s.nombre,s:'Suscripción · '+fshort(d),v:conv(s.valor,s.moneda),fecha:d})));
  S.calendario.filter(c=>c.tipo==='egreso'&&+c.monto>0).forEach(c=>{const d=new Date(y,parse(c.fecha).getMonth(),parse(c.fecha).getDate());if(inR(d))sal.push({icon:'calendar',n:c.titulo,s:fshort(d),v:+c.monto,fecha:d})});
  S.extras.forEach(x=>{const d=parse(x.fecha);if(inR(d))ent.push({icon:'coins',n:x.desc,s:'Ingreso extra · '+fshort(d),v:+x.valor,fecha:d,paid:true})});
  S.tarjetas.forEach(t=>{const d=new Date(y,m,Math.min(+t.pago||15,ld));const pm=tarjetaPagoMes(t);if(inR(d)&&pm>0)sal.push({icon:'credit-card',n:'Tarjeta '+t.nombre,s:'Pago mínimo · '+fshort(d),v:pm,fecha:d})});
  const vm=variableMes();if(vm)sal.push({icon:'shopping-cart',n:'Gasto variable estimado',s:'Mercado, transporte, gustos… según tu presupuesto',v:which==='mes'?vm:vm/2,fecha:b});
  ent.sort((p,q)=>p.fecha-q.fecha);sal.sort((p,q)=>p.fecha-q.fecha);const E=ent.reduce((s,x)=>s+x.v,0),Sa=sal.reduce((s,x)=>s+x.v,0);return{a,b,ent,sal,E,Sa,disp:E-Sa}}

/* ---- agenda y notificaciones ---- */
function agenda(){const t=today(),A=+S.cfg.anticipo||5,items=[];
  S.fijos.forEach(f=>{const st=fijoStatus(f);st.venc.forEach(p=>items.push({k:'fijo',id:f.id,per:p.per,icon:catIcon(f.cat),titulo:f.nombre,sub:'Gasto fijo',monto:+f.valor,fecha:p.due,dir:'pagar',go:'fijos'}));if(st.prox&&days(t,st.prox.due)<=45)items.push({k:'fijo',id:f.id,per:st.prox.per,icon:catIcon(f.cat),titulo:f.nombre,sub:'Gasto fijo',monto:+f.valor,fecha:st.prox.due,dir:'pagar',go:'fijos'})});
  S.pagar.forEach(L=>{const e=engine(L);(e.vencidas.length?e.vencidas:[e.next]).filter(Boolean).slice(0,3).forEach(r=>items.push({k:'pagar',id:L.id,icon:'landmark',titulo:`Cuota ${r.n} · ${loanName(L,'pagar')}`,sub:L.concepto||'Crédito',monto:r.valor,fecha:r.fecha,dir:'pagar',go:'le-debo'}));if(e.vencidas.length&&e.next&&e.next.fecha>=t)items.push({k:'pagar',id:L.id,icon:'landmark',titulo:`Cuota ${e.next.n} · ${loanName(L,'pagar')}`,sub:L.concepto,monto:e.next.valor,fecha:e.next.fecha,dir:'pagar',go:'le-debo'})});
  S.cobrar.forEach(L=>{const e=engine(L);if(e.next)items.push({k:'cobrar',id:L.id,icon:'hand-coins',titulo:`Cobrar cuota ${e.next.n} · ${loanName(L,'cobrar')}`,sub:L.concepto||'Préstamo',monto:e.next.valor,fecha:e.next.fecha,dir:'cobrar',go:'me-deben'})});
  S.tarjetas.forEach(t=>{const pm=tarjetaPagoMes(t);if(pm>0){const f=proxDia(+t.pago||15);items.push({k:'tarjeta',id:t.id,icon:'credit-card',titulo:'Tarjeta '+t.nombre,sub:'Pago mínimo de la tarjeta',monto:pm,fecha:f,dir:'pagar',go:'tarjetas'})}});
  S.suscripciones.forEach(s=>items.push({k:'sub',id:s.id,icon:'repeat',titulo:s.nombre,sub:'Suscripción '+s.ciclo,monto:conv(s.valor,s.moneda),fecha:parse(s.proximo),dir:'pagar',go:'suscripciones'}));
  S.calendario.forEach(c=>{const d=parse(c.fecha);let f=new Date(t.getFullYear(),d.getMonth(),d.getDate());if(f<t)f=new Date(t.getFullYear()+1,d.getMonth(),d.getDate());if(days(t,f)<=45)items.push({k:'cal',id:c.id,icon:'calendar',titulo:c.titulo,sub:'Calendario fiscal',monto:+c.monto,fecha:f,dir:c.tipo==='ingreso'?'cobrar':'pagar',go:'calendario'})});
  items.forEach(x=>{x.d=days(t,x.fecha);x.st=x.d<0?'bad':x.d<=A?'warn':'ok';x.lbl=relTime(x.fecha)});return items.sort((a,b)=>a.fecha-b.fecha)}
function notifs(){const N=[],t=today(),nf=S.cfg.notif,A=+S.cfg.anticipo||5;
  agenda().forEach(x=>{if(x.k==='cobrar'){if(!nf.cobros)return;if(x.d<0)N.push({id:`c:${x.id}:${iso(x.fecha)}`,lvl:'bad',icon:'hand-coins',bg:'b-red',t:`${x.titulo.replace('Cobrar cuota','La cuota')} está atrasada`,b:`Debían pagarte ${$(x.monto)} ${x.lbl.toLowerCase()}.`,fecha:x.fecha,go:x.go});else if(x.d<=A)N.push({id:`c:${x.id}:${iso(x.fecha)}`,lvl:'info',icon:'hand-coins',bg:'b-green',t:x.titulo,b:`Te deben pagar ${$(x.monto)} ${x.lbl.toLowerCase()}.`,fecha:x.fecha,go:x.go});return}
    if(!nf.pagos)return;if(x.d<0)N.push({id:`p:${x.k}:${x.id}:${iso(x.fecha)}`,lvl:'bad',icon:x.icon,bg:'b-red',t:`Pago vencido: ${x.titulo}`,b:`${$(x.monto)} · venció ${x.lbl.toLowerCase()}.`,fecha:x.fecha,go:x.go});else if(x.d<=A)N.push({id:`p:${x.k}:${x.id}:${iso(x.fecha)}`,lvl:'warn',icon:x.icon,bg:'b-amber',t:`${x.lbl}: ${x.titulo}`,b:`Ten listos ${$(x.monto)}.`,fecha:x.fecha,go:x.go})});
  if(nf.hormiga){const H=hormigas();if(H.over)N.push({id:`h:${mkey(t)}`,lvl:'warn',icon:'coffee',bg:'b-amber',t:'Los gastos hormiga se están saliendo de control',b:`Vas camino a ${$(H.proy)} este mes y tu límite es ${$(S.cfg.limite)}.`,fecha:t,go:'gastos'})}
  if(nf.presupuesto){const k=mkey(t);S.cfg.categorias.filter(c=>c.tope>0&&c.grupo!=='a').forEach(c=>{const r=gastosMesK(k).filter(g=>g.cat.toLowerCase()===c.nombre.toLowerCase()).reduce((a,g)=>a+ +g.valor,0);if(r>=c.tope*(+S.cfg.alertaPres||100)/100)N.push({id:`b:${c.id}:${k}`,lvl:'warn',icon:c.icon,bg:'b-amber',t:r>c.tope?`Te pasaste del presupuesto en ${c.nombre}`:`Vas en el ${pct(r/c.tope,0)} del presupuesto de ${c.nombre}`,b:`Llevas ${$(r)} de ${$(c.tope)}.`,fecha:t,go:'presupuesto'})})}
  if(nf.inversiones)S.inversiones.forEach(x=>{const r=inv(x);if(r.venc){const dd=days(t,r.venc);if(dd>=0&&dd<=10)N.push({id:`i:${x.id}`,lvl:'info',icon:'trending-up',bg:'b-teal',t:`Tu ${x.nombre} vence ${relTime(r.venc).toLowerCase()}`,b:`Recibirás cerca de ${$(r.final)}. Decide si lo renuevas.`,fecha:r.venc,go:'inversiones'})}});
  if(nf.metas)S.metas.forEach(m=>{const dd=days(t,parse(m.fecha));if(dd>=0&&dd<=30&&m.ahorrado<m.objetivo)N.push({id:`m:${m.id}`,lvl:'info',icon:'target',bg:'b-violet',t:`Tu meta "${m.nombre}" vence pronto`,b:`Te faltan ${$(m.objetivo-m.ahorrado)} y quedan ${dd} días.`,fecha:parse(m.fecha),go:'metas'})});
  const ord={bad:0,warn:1,info:2,ok:3};return N.sort((a,b)=>ord[a.lvl]-ord[b.lvl]||a.fecha-b.fecha)}

/* ---- indicadores y flujo ---- */
function indicadores(){const ing=ingresoMensual(),T=totales(),H=hormigas(),t=today();const cuo=cuotasMes('pagar');
  const kPrev=mkey(addMonths(new Date(t.getFullYear(),t.getMonth(),1),-1)),gPrev=gastosMesK(kPrev),gCur=gastosMesK(mkey(t));
  const hayIng=ing>0,hayGastosPrev=gPrev.length>=5||(S.fijos.length>0&&gPrev.length>0),hayLiq=S.activos.some(a=>/^11/.test(a.cod))||S.inversiones.some(x=>x.tipo==='ahorro'),hayAct=S.activos.length>0||S.inversiones.length>0,hayGastosCur=gCur.length>0;
  const gReal=gPrev.filter(g=>!g.fijoId).reduce((a,g)=>a+ +g.valor,0)+fijosMes()+cuo+subsMes();const bas=gastosBasicos(),liq=liquidez();const L=[];
  const add=(o,need)=>{const miss=need.filter(n=>!n[0]);L.push({...o,ok:!miss.length,falta:miss.map(n=>n[1]),go:miss[0]?.[2]})};
  const r1=ing?cuo/ing:0;add({k:'¿Cuánto de tu sueldo se va en deudas?',v:pct(r1),r:r1,st:r1<=.3?'ok':r1<=.4?'warn':'bad',meta:'Lo sano es menos del 30%',d:S.pagar.length?`Pagas ${$(cuo)} en cuotas al mes de un ingreso de ${$(ing)}.`:'No tienes deudas registradas en Le debo.',max:.6,icon:'landmark'},[[hayIng,'tus ingresos','ingresos']]);
  const r2=ing?(ing-gReal)/ing:0;add({k:'¿Cuánto logras ahorrar?',v:pct(r2),r:Math.max(r2,0),st:r2>=.2?'ok':r2>=.1?'warn':'bad',meta:'Lo ideal es guardar 20% o más',d:`El mes pasado gastaste ${$(gReal)} contando gastos, fijos, cuotas y suscripciones.`,max:.4,icon:'piggy-bank'},[[hayIng,'tus ingresos','ingresos'],[hayGastosPrev,`los gastos de ${MESL[addMonths(t,-1).getMonth()]} (al menos 5)`,'gastos']]);
  const r3=bas?liq/bas:0;add({k:'Si dejaras de recibir ingresos, ¿cuánto aguantas?',v:r3.toFixed(1)+' meses',r:r3,st:r3>=S.cfg.emergMeta?'ok':r3>=3?'warn':'bad',meta:`La meta es ${S.cfg.emergMeta} meses`,d:`Tienes ${$(liq)} disponibles y tus gastos básicos son ${$(bas)} al mes.`,max:Math.max(S.cfg.emergMeta*1.5,1),icon:'umbrella'},[[hayLiq,'tus cuentas bancarias o efectivo','balance'],[bas>0,'tus gastos fijos o el presupuesto de necesidades','fijos']]);
  const r4=T.A?T.P/T.A:0;add({k:'¿Qué parte de lo que tienes es deuda?',v:pct(r4),r:r4,st:r4<.4?'ok':r4<.6?'warn':'bad',meta:'Lo sano es menos del 40%',d:`Debes ${$(T.P)} y tienes bienes por ${$(T.A)}.`,max:1,icon:'scale'},[[hayAct,'tus bienes y cuentas (lo que tienes)','balance']]);
  const r5=ing?H.proy/ing:0;add({k:'Gastos hormiga',v:pct(r5),r:r5,st:r5<.03?'ok':r5<.06?'warn':'bad',meta:'Menos del 3% del ingreso',d:`Este mes van camino a ${$(H.proy)}.`,max:.1,icon:'coffee'},[[hayIng,'tus ingresos','ingresos'],[hayGastosCur,'los gastos de este mes','gastos']]);
  const r6=ing-gReal;add({k:'Dinero libre cada mes',v:$(r6),r:Math.max(r6,0),st:r6>ing*.15?'ok':r6>0?'warn':'bad',meta:'Lo que sobra después de todos tus gastos',d:'Es la plata con la que puedes ahorrar, invertir o asumir algo nuevo.',max:Math.max(ing*.4,1),icon:'wallet'},[[hayIng,'tus ingresos','ingresos'],[hayGastosPrev,`los gastos de ${MESL[addMonths(t,-1).getMonth()]} (al menos 5)`,'gastos']]);
  return L}
function flujo(){const t=today(),out=[];let saldo=liquidez();const vm=variableMes();
  for(let k=0;k<12;k++){const a=new Date(t.getFullYear(),t.getMonth()+k,1),b=new Date(t.getFullYear(),t.getMonth()+k+1,0),inM=d=>d>=a&&d<=b;const det={ing:0,cob:0,cuo:0,fij:0,sub:0,var:vm};
    S.ingresos.forEach(x=>{const v=conv(x.valor,x.moneda);det.ing+=x.frec==='anual'?0:v*(FREC[x.frec]||0)});
    S.calendario.filter(c=>c.tipo==='ingreso'&&+c.monto>0&&parse(c.fecha).getMonth()===a.getMonth()).forEach(c=>det.ing+= +c.monto);
    S.cobrar.forEach(L=>engine(L).plan.forEach(r=>{if(inM(r.fecha))det.cob+=r.valor}));
    S.pagar.forEach(L=>engine(L).plan.forEach(r=>{if(inM(r.fecha)||(k===0&&r.fecha<a))det.cuo+=r.valor}));
    S.fijos.forEach(f=>fijoPeriods(f,a.getFullYear(),a.getMonth()).forEach(p=>{if(!f.pagos.find(x=>x.per===p.per))det.fij+= +f.valor}));
    S.calendario.filter(c=>c.tipo==='egreso'&&+c.monto>0&&parse(c.fecha).getMonth()===a.getMonth()).forEach(c=>det.fij+= +c.monto);
    S.suscripciones.forEach(s=>det.sub+=subOcc(s,a,b).length*conv(s.valor,s.moneda));det.cuo+=S.tarjetas.reduce((q,t)=>q+tarjetaPagoMes(t,k),0);S.extras.forEach(x=>{if(inM(parse(x.fecha)))det.ing+= +x.valor});
    const I=det.ing+det.cob,E=det.cuo+det.fij+det.sub+det.var;saldo+=I-E;out.push({l:MES[a.getMonth()]+(a.getMonth()===0||k===0?' '+String(a.getFullYear()).slice(2):''),I,E,neto:I-E,saldo,det})}return out}
