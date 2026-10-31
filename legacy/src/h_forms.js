// ================= Formularios: ayuda por campo con ícono de información =================
const FN=s=>String(s||'').replace(/<[^>]*>/g,'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[¿?¡!:*().%$]/g,' ').replace(/\s+/g,' ').trim();
const FHELP_RAW={
'¿El valor que escribiste es lo que te llega a la cuenta?':'Si escribes tu salario o el valor del contrato (antes de descuentos), calculamos salud, pensión, retención y otros descuentos para usar lo que realmente te llega.',
'Otros descuentos':'Lo que te descuentan además de la seguridad social: libranzas, cooperativa, fondo de empleados, medicina prepagada, aportes voluntarios a pensión o AFC.',
'¿Cuánto vas a guardar cada vez?':'El valor fijo que apartarás cada quincena o mes. Empieza con algo que puedas cumplir siempre; luego lo subes.',
'Día del mes':'El día en que te recordamos hacer el aporte. Lo ideal es el día en que te pagan.',
'Logo (opcional)':'Sube el logo o una imagen del servicio (por ejemplo, una captura del ícono de la app). Si no subes nada, mostramos la inicial con el color del servicio.',
'¿Qué pasó?':'Una descripción corta del imprevisto. Queda en tus gastos con la categoría Imprevistos.',
'¿Cuánto guardas?':'El dinero que separas hoy para emergencias.',
'¿Cuánto costó?':'Lo que pagaste por el imprevisto. Si es más de lo que hay en el fondo, el resto sale de tu dinero del día a día.',
'¿Dónde lo guardas?':'Dónde está ese dinero: un bolsillo de Nequi, una cuenta de ahorros aparte o un CDT. Lo ideal es que no lo uses para nada más.',
'¿Qué empeñaste?':'El objeto que dejaste como garantía. Si no pagas a tiempo, la casa de empeño puede quedarse con él.',
'¿Qué te dejaron?':'El objeto que te dejaron como garantía del préstamo.',
'¿Cuánto vale aproximadamente?':'Lo que costaría reemplazar el objeto. Sirve para saber cuánto arriesgas si no se paga.',
'Fecha límite para recuperarlo':'Último día para pagar (o refrendar) y recuperar el objeto. Aparece en la boleta o contrato. Te avisamos 15 días antes.',
'Número de contrato o boleta':'El número que aparece en la boleta de empeño. Te sirve para reclamar el objeto.',
'Elige un servicio o escribe otro':'Toca un servicio para llenar el nombre, o escribe cualquier otro.',
'¿Con qué se paga?':'La tarjeta o cuenta donde se hace el cobro automático. Te ayuda a saber qué cancelar si cambias de tarjeta.',
'¿La compartes?':'Si dividen el plan con otras personas, contamos solo tu parte en tus gastos.',
'Paga mínimo':'Lo que pagas en un mes de bajo consumo. Míralo en tus facturas anteriores.',
'Paga máximo':'Lo que pagas en un mes de alto consumo. Si una factura lo supera te avisamos y ajustamos el rango.',
'¿Cuándo es el próximo pago?':'La fecha de la siguiente factura o cobro. Desde ahí contamos los periodos, así nada aparece vencido si este mes no tocaba pagar (por ejemplo, el agua en Bogotá se paga cada dos meses).',
'Día de la 1ª quincena':'Día del mes en que pagas la primera quincena (del 1 al 15).',
'Día de la 2ª quincena':'Día del mes en que pagas la segunda quincena (del 16 al 31).',
'¿Qué día lo pagaste?':'La fecha en que hiciste ese último pago. Queda en tu historial de gastos con esa fecha.',
'¿Qué día pagaste?':'La fecha en que pagaste la quincena o quincenas que marcaste.',
'¿Cuánto pagaste?':'El valor de la factura que pagaste. Si lo dejas vacío usamos el promedio.',
'¿Cuánto pagaste en cada quincena?':'El valor de cada quincena pagada. Si lo dejas vacío usamos el promedio.',
'¿El valor es siempre igual?':'Elige "Cambia cada mes" para servicios como agua, luz, gas, internet o plan de celular, cuyo valor depende del consumo.',
'¿Ya pagaste alguna quincena de este mes?':'Marca las quincenas que ya pagaste este mes para que no te las recordemos.',
'¿Ya hiciste el último pago':'Si ya pagaste la factura anterior, regístrala con su fecha para que quede en tu historial.',
'Nombre de la categoría':'Un nombre corto y claro, por ejemplo "Mascotas" o "Regalos".',
'¿Qué tipo de gasto es?':'Necesidad: indispensable. Gusto: prescindible. Ahorro: dinero que separas para el futuro. Se usa en la regla 50/30/20.',
'Tope mensual':'Máximo que quieres gastar al mes en esta categoría. Te avisamos al acercarte.',
'NIT o documento':'Número de identificación tributaria de la entidad (sin el dígito de verificación). Aparece en el contrato, el extracto o la factura. Si es una persona, su cédula.',
'Tipo de entidad':'Qué clase de entidad es: banco, cooperativa, fintech, almacén que vende a crédito, empresa o persona.',
'% Ahorro':'Parte de tus ingresos que separas para ahorro, metas e inversión. Lo recomendado es mínimo 20%.',
'% Gustos':'Parte de tus ingresos para lo que disfrutas pero no es indispensable: salidas, compras, viajes. Lo usual es 30%.',
'% Necesidades':'Parte de tus ingresos para lo indispensable: vivienda, servicios, mercado, transporte y cuotas. Lo usual es 50%.',
'A una tasa E.A. de':'Tasa Efectiva Anual: lo que rinde o cuesta el dinero en un año completo. Es la que aparece en los extractos y ofertas de los bancos.',
'Avisar cuando una categoría llegue al de su tope':'Te avisamos cuando una categoría consuma este porcentaje de su presupuesto del mes, para que alcances a frenar.',
'Avisarme con':'Cuántos días antes de la fecha quieres recibir el recordatorio.',
'Avisarme con días de anticipación':'Cuántos días antes de la fecha quieres recibir el recordatorio.',
'Año gravable':'El año de ingresos y gastos que vas a declarar. En 2026 normalmente se declara el año gravable 2025.',
'Banco':'La entidad donde tienes la cuenta, tarjeta o producto. Sirve para agrupar y reconocer tus movimientos.',
'Banco o entidad':'Quién emite el producto: banco, cooperativa, fintech o almacén.',
'Bloquear Mirai tras inactividad':'Si no usas la plataforma durante este tiempo, se bloquea y pide tu contraseña de nuevo.',
'Cada cuánto':'Con qué frecuencia se repite este movimiento.',
'Categoría':'Grupo al que pertenece el movimiento (mercado, transporte, salud…). Se sugiere sola cuando escribes la descripción; puedes cambiarla.',
'Celular o teléfono':'Número de contacto. Se usa para recordatorios de cobro por WhatsApp.',
'Ciudad':'Ciudad donde vive o se ubica. Solo es informativo.',
'Ciudad o municipio':'Elige de la lista de municipios de Colombia. Si escribes la dirección con la ciudad, la seleccionamos sola.',
'Barrio o sector':'Barrio, conjunto o sector. Se completa solo si lo escribes en la dirección (por ejemplo "barrio Cedritos").',
'Concepto':'Para qué es el dinero: "préstamo para la moto", "arriendo", etc. Te ayuda a recordarlo después.',
'Confirma la nueva':'Escribe otra vez la contraseña nueva para evitar errores de digitación.',
'Consignaciones del año':'Suma de todo el dinero que entró a tus cuentas en el año. Es uno de los topes que te obligan a declarar renta.',
'Consumos totales del año':'Lo que gastaste en el año con tarjetas y compras. Si superas el tope, debes declarar renta aunque ganes poco.',
'Contacto':'La persona o empresa relacionada. Puedes elegirla de tus contactos guardados.',
'Contraseña actual':'La contraseña que usas hoy para entrar. La pedimos para confirmar que eres tú.',
'Contraseña nueva':'Mínimo 8 caracteres. Combina letras, números y un símbolo para que sea segura.',
'Contraseña':'Tu clave de acceso. Nunca la guardamos en texto plano: se protege con cifrado.',
'Correo':'Dirección de correo electrónico.',
'Correo electrónico':'Tu correo. Lo usamos para enviarte códigos de verificación y recuperar tu cuenta.',
'Corte de la primera quincena':'Día del mes que separa la primera de la segunda quincena (normalmente 15). Se usa para dividir tu balance en quincenas.',
'Crédito':'El préstamo sobre el que quieres hacer la simulación o el abono.',
'Cupo mensual':'Máximo que quieres gastar al mes en esta categoría o persona. Te avisamos al acercarte.',
'Cupo total':'El límite de crédito que te aprobó el banco en esta tarjeta.',
'Código de respaldo':'Uno de los 10 códigos que guardaste al activar la verificación en dos pasos. Cada uno sirve una sola vez.',
'Código':'El código de 6 dígitos que te enviamos o que muestra tu app de autenticación.',
'Descripción corta':'Un nombre corto para reconocer el movimiento, por ejemplo "Almuerzo oficina".',
'Dirección':'Escríbela como la dirías: "calle 80 numero 15-20 apto 301 Chía". La ordenamos al formato colombiano y detectamos la ciudad, el departamento y el barrio. Aparece en documentos como pagarés.',
'Día de corte':'Día en que el banco cierra el ciclo de la tarjeta. Lo que compres después pasa al siguiente extracto.',
'Día de pago':'Día del mes en que se debe pagar.',
'Día límite de pago':'Último día para pagar sin intereses de mora. Te recordamos antes.',
'Dólar hoy':'Tasa Representativa del Mercado del dólar. Se usa para convertir inversiones o deudas en dólares a pesos.',
'Enlace':'Dirección web (https://…) que se abre al tocar este acceso.',
'Escribe BORRAR para confirmar':'Medida de seguridad: escribe la palabra exacta para confirmar que quieres borrar los datos. No se puede deshacer.',
'Escribe ELIMINAR':'Medida de seguridad: escribe la palabra exacta para confirmar. No se puede deshacer.',
'Escribe ELIMINAR para confirmar':'Medida de seguridad: escribe la palabra exacta para confirmar. No se puede deshacer.',
'Euro hoy':'Valor del euro en pesos. Se usa para convertir valores en euros.',
'Fecha':'El día en que ocurrió o vence el movimiento.',
'Fecha del pago':'El día en que se hizo o se hará el pago.',
'Fecha del préstamo':'El día en que se entregó el dinero. Desde aquí se cuentan las cuotas.',
'Filtro de Gmail':'Búsqueda que usamos para encontrar en tu correo las notificaciones de compras de tu banco. Puedes ajustarla.',
'Forma de calcular la cuota':'Francés: cuota fija (lo más común). Alemán: abono a capital fijo, cuota que baja. Simple: interés solo sobre el capital inicial. Americano: solo intereses y el capital al final.',
'Interés mensual':'Porcentaje que se cobra cada mes sobre lo que se debe. Si no hay intereses, deja 0.',
'Interés mensual de tu tarjeta':'La tasa mes vencido que aparece en tu extracto. Sirve para calcular cuánto te cuesta diferir una compra.',
'Límite de gastos hormiga al mes':'Máximo que aceptas gastar al mes en pequeños gastos (cafés, snacks, domicilios). Te avisamos al pasarte.',
'Medio de pago':'Con qué pagaste: efectivo, débito, tarjeta de crédito o transferencia.',
'Mensaje':'El texto que se enviará. Puedes editarlo o mejorarlo con IA.',
'Mes':'El mes que quieres ver o registrar.',
'Mesada':'Valor que recibe periódicamente esta persona.',
'Meses de fondo de emergencia':'Cuántos meses de gastos quieres tener ahorrados para imprevistos. Lo recomendado es entre 3 y 6.',
'Moneda':'Moneda en la que se muestran los valores.',
'Nombre':'Cómo quieres llamarlo para reconocerlo fácilmente.',
'Nombre completo':'Tu nombre y apellidos. Aparece en tu perfil y en los documentos que generes.',
'Nombre del grupo':'Por ejemplo "Viaje a Cartagena" o "Apartamento". Sirve para dividir gastos con otras personas.',
'Nombre para reconocerla':'Un nombre corto, por ejemplo "Visa Bancolombia".',
'Notas':'Cualquier detalle extra que quieras recordar. Es opcional.',
'Nueva categoría':'Nombre de la categoría que quieres agregar a tu lista.',
'Nueva relación':'Tipo de relación con tus contactos, por ejemplo "Compañero de trabajo".',
'Número de cuotas':'En cuántos pagos se divide la deuda.',
'Número de documento':'Número de identificación. Se usa en documentos como el pagaré.',
'O pega aquí el contenido':'Copia y pega el texto del extracto. Separador ; o , · fechas dd/mm/aaaa · valores como 1.234.567,89 o -45000.',
'Ocupación':'A qué te dedicas. Ayuda al consejero a darte recomendaciones más acertadas.',
'Pantalla al abrir el libro':'La sección que verás primero cada vez que entres.',
'Para desactivarla, escribe un código':'Por seguridad, escribe un código de tu app de autenticación antes de quitar la verificación en dos pasos.',
'Parentesco':'Relación familiar con esta persona.',
'Por':'Durante cuántos días.',
'Próximo cobro':'Fecha del siguiente cargo. Te recordamos antes de que llegue.',
'Relación':'Qué relación tienes con este contacto: familiar, amigo, trabajo…',
'Segundo pago':'Si te pagan quincenal, el día del segundo pago del mes.',
'Seguros y otros cobros por cuota':'Valor fijo que se suma a cada cuota: seguro de vida, cuota de manejo, etc.',
'Servicio':'Nombre de la suscripción: Netflix, Spotify, gimnasio…',
'Si contiene':'Texto que, si aparece en la descripción, activa esta regla automáticamente.',
'Si pongo':'El dinero que piensas invertir, para simular cuánto ganarías.',
'Tasa de usura':'Tasa máxima legal que se puede cobrar en Colombia. La publica la Superfinanciera cada mes.',
'Tasa que te ofrecieron':'La tasa efectiva anual que te ofrece el banco o la entidad.',
'Tipo':'La clase de movimiento o producto.',
'Tipo de documento':'Cédula, cédula de extranjería, pasaporte o NIT.',
'Tu meta financiera principal':'Lo más importante que quieres lograr con tu dinero. El consejero prioriza sus consejos según esta meta.',
'Tu salario mensual':'Lo que recibes al mes después de descuentos. Es la base para calcular presupuestos y alertas.',
'Valor':'La cantidad de dinero en pesos.',
'Valor de cada cuota':'Lo que se paga en cada cuota. Si lo dejas vacío, lo calculamos con la tasa y el plazo.',
'Valor de la UVT':'Unidad de Valor Tributario que fija la DIAN cada año. Se usa para calcular los topes de renta.',
'Valor de la compra':'El total de la compra antes de dividirla en cuotas.',
'Valor de referencia de un gasto hormiga':'Gastos por debajo de este valor se consideran "hormiga". La IA también los detecta por el tipo de compra.',
'Valor del abono':'Dinero extra que pagas además de la cuota. Va directo a capital y reduce intereses.',
'Valor estimado':'Un valor aproximado. Puedes actualizarlo después.',
'Valor pagado':'Lo que se pagó realmente. Si es más que la cuota, el excedente se toma como abono.',
'¿A cuántas cuotas?':'Número de meses en que diferirás la compra. Más cuotas = cuota más baja pero más intereses.',
'¿A quién?':'La persona o entidad que recibe el dinero.',
'¿Cada cuánto se paga?':'Frecuencia de las cuotas: mensual, quincenal, semanal…',
'¿Cada cuánto?':'Con qué frecuencia se repite.',
'¿Cuándo lo invertiste?':'Fecha en que abriste la inversión. Desde aquí calculamos rendimientos y vencimiento.',
'¿Cuántas cuotas?':'En cuántos pagos se divide.',
'¿Cuánto cuesta?':'El valor en pesos de lo que vas a pagar.',
'¿Cuánto dinero pusiste?':'El capital inicial de la inversión.',
'¿Cuánto más puedes pagar al mes?':'Dinero adicional que podrías destinar cada mes a tus deudas para salir más rápido.',
'¿Cuánto necesitas?':'El valor total que quieres reunir para esta meta.',
'¿Cuánto tienes ya?':'Lo que ya llevas ahorrado para esta meta.',
'¿Cuánto vale hoy?':'Valor actual de la inversión o del bien.',
'¿Cuánto?':'La cantidad de dinero en pesos.',
'¿Cómo lo pagarías?':'Con qué medio harías el pago. Influye en el consejo (no es igual contado que a cuotas).',
'¿Cómo lo pagas?':'Con qué medio pagas: efectivo, débito, tarjeta…',
'¿Cómo pagaste?':'Con qué medio pagaste: efectivo, débito, tarjeta…',
'¿Cómo te sientes con el riesgo?':'Conservador: prefieres no perder. Moderado: aceptas algo de variación. Arriesgado: buscas más rentabilidad aunque varíe.',
'¿De quién es?':'A quién de la familia pertenece el movimiento. Sirve para ver cuánto gasta cada uno.',
'¿De quién son estos gastos?':'Persona de la familia a la que se asignarán los movimientos importados.',
'¿De qué fue?':'Descripción corta del movimiento.',
'¿En cuántas cuotas?':'Número de pagos en que se divide.',
'¿En qué gastaste?':'Escribe una descripción corta. La categoría se sugiere automáticamente.',
'¿Entre quiénes se divide?':'Personas que comparten este gasto. Se reparte en partes iguales.',
'¿Es gasto hormiga?':'Gastos pequeños y frecuentes que suman mucho al mes. Lo recomendable es dejar que la IA lo detecte.',
'¿O te dieron una tasa anual?':'Si te dieron la tasa Efectiva Anual (E.A.), escríbela aquí y calculamos la mensual por ti.',
'¿Para cuándo?':'Fecha en la que quieres lograrlo. Calculamos cuánto ahorrar al mes.',
'¿Para qué fue?':'El motivo del movimiento, para recordarlo después.',
'¿Por cuánto tiempo?':'Plazo de la inversión en días (por ejemplo, un CDT a 90, 180 o 360 días).',
'¿Quién gasta normalmente?':'La persona a la que se asignan los gastos por defecto.',
'¿Quién gastó?':'Quién de la familia hizo el gasto.',
'¿Quién pagó?':'Quién puso el dinero. Así calculamos quién le debe a quién.',
'¿Quiénes participan?':'Personas que hacen parte de este grupo o reto.',
'¿Qué compraste?':'Descripción corta de la compra.',
'¿Qué día te pagan?':'Día del mes en que recibes tu salario. Lo usamos para el flujo de caja y los recordatorios.',
'¿Qué es?':'Descripción corta para reconocerlo.',
'¿Qué hacemos con el abono?':'Terminar antes: mantienes la cuota y reduces el plazo (ahorras más intereses). Pagar menos: mantienes el plazo y baja la cuota.',
'¿Qué pagas?':'Nombre del gasto fijo: arriendo, servicios, internet…',
'¿Qué prefieres?':'Elige la opción que más te convenga.',
'¿Qué quieres lograr?':'Nombre de tu meta: viaje, carro, fondo de emergencia…',
'¿Qué se pagó?':'Descripción del gasto compartido.',
'¿Qué tan estricto es el consejero?':'Más estricto: te advierte con más frecuencia antes de gastar o prestar.',
'¿Qué tono quieres usar?':'Cómo sonará el mensaje: amable, formal o directo.',
'¿Tiene intereses?':'Indica si el préstamo cobra intereses. Si es entre familia sin intereses, elige No.',
'Ícono':'La imagen con la que reconocerás este elemento.',
'Últimos 2 dígitos de tu cédula':'Pregunta de seguridad para recuperar tu cuenta.'
};
const FHELP={};for(const k in FHELP_RAW)FHELP[FN(k)]=FHELP_RAW[k];
const FKEYS=[[/correo|email/,'Dirección de correo electrónico.'],[/contrasena|clave/,'Tu clave de acceso. Mínimo 8 caracteres.'],[/codigo/,'El código de verificación de 6 dígitos.'],[/fecha|cuando/,'El día correspondiente. Toca para abrir el calendario.'],[/tasa|interes/,'Porcentaje de interés. Si no aplica, deja 0.'],[/cuota/,'Número o valor de las cuotas del pago.'],[/valor|cuanto|monto|cupo|salario|precio/,'La cantidad de dinero en pesos. Se formatea sola mientras escribes.'],[/dia/,'Día del mes (1 a 31).'],[/nombre/,'Un nombre para reconocerlo fácilmente.'],[/quien/,'La persona relacionada con este movimiento.'],[/categoria/,'El grupo al que pertenece el movimiento.'],[/nota|descrip|que /,'Una descripción corta para recordarlo.']];
function fieldHelp(l){const n=FN(l);if(!n)return '';if(FHELP[n])return FHELP[n];for(const k in FHELP)if(k.length>5&&(n.startsWith(k)||k.startsWith(n)))return FHELP[k];for(const [re,t] of FKEYS)if(re.test(n))return t;return 'Completa este dato para que los cálculos y alertas sean exactos.'}

function enhanceFields(root){(root||document).querySelectorAll('.f:not([data-enh])').forEach(f=>{f.dataset.enh=1;const lab=f.querySelector(':scope>label,:scope>.fl');if(!lab)return;
  const txt=[...lab.childNodes].filter(n=>n.nodeType===3||!n.classList?.contains('tip')).map(n=>n.textContent).join('').trim();if(!txt)return;
  const parts=[];const tp=lab.querySelector('.tip');const base=fieldHelp(txt);
  f.querySelectorAll(':scope>.hint:not([id])').forEach(h=>{if(h.querySelector('button,input,.chip,a,[data-show]'))return;const t=h.textContent.trim();if(t)parts.push(t);h.remove()});
  if(tp){parts.unshift(tp.dataset.tip);tp.remove()}
  const msg=[...new Set([parts.length&&parts.join(' ').length>40?null:base,...parts].filter(Boolean))].join(' · ');
  lab.insertAdjacentHTML('beforeend',`<button type="button" class="finfo" data-tip="${esc(msg)}" aria-label="Información sobre ${esc(txt)}" tabindex="0">${ic('info')}</button>`)})}

// tooltip flotante (no se recorta dentro de los modales)
(function(){let el,cur;const mk=()=>{if(!el){el=document.createElement('div');el.id='ftip';el.setAttribute('role','tooltip');document.body.appendChild(el)}return el};
  const show=b=>{const t=mk();cur=b;t.textContent=b.dataset.tip;t.classList.add('on');const r=b.getBoundingClientRect(),w=Math.min(300,innerWidth-24);t.style.maxWidth=w+'px';const tw=t.offsetWidth,th=t.offsetHeight;let x=Math.max(12,Math.min(innerWidth-tw-12,r.left+r.width/2-tw/2));let y=r.top-th-10;let below=false;if(y<8){y=r.bottom+10;below=true}t.style.left=x+'px';t.style.top=y+'px';t.style.setProperty('--ax',(r.left+r.width/2-x)+'px');t.classList.toggle('below',below)};
  const hide=()=>{if(el)el.classList.remove('on');cur=null};
  document.addEventListener('mouseover',e=>{const b=e.target.closest?.('.finfo,.tip');if(b)show(b);else if(cur&&!e.target.closest?.('#ftip'))hide()});
  document.addEventListener('focusin',e=>{const b=e.target.closest?.('.finfo');if(b)show(b)});
  document.addEventListener('focusout',e=>{if(e.target.closest?.('.finfo'))hide()});
  document.addEventListener('click',e=>{const b=e.target.closest?.('.finfo');if(b){e.preventDefault();e.stopPropagation();cur===b&&el?.classList.contains('on')?hide():show(b)}else hide()},true);
  addEventListener('scroll',hide,true);addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
  new MutationObserver(()=>{if(!enhanceFields._q){enhanceFields._q=1;requestAnimationFrame(()=>{enhanceFields._q=0;enhanceFields()})}}).observe(document.body,{childList:true,subtree:true});
})();

// ================= Descripción de cada ventana =================
const MDESC={
 aporte:'Un aporte fijo que te recordamos cada quincena o mes.',
 fondo:'Tu fondo de emergencia: dinero guardado aparte solo para imprevistos.',
 gasto:'Anota en qué se fue tu dinero. La categoría y si es gasto hormiga se detectan solos al escribir.',
 contacto:'Guarda los datos de una persona o empresa con la que tienes préstamos, cobros o gastos compartidos.',
 loan:'Registra un préstamo con su plan de cuotas. Calculamos cada pago, los intereses y te avisamos las fechas.',
 pago:'Registra una cuota o un abono extra. Te mostramos cómo queda el saldo antes de guardar.',
 ingreso:'Agrega el dinero que recibes con regularidad (salario, arriendos, honorarios). Es la base de tu presupuesto.',
 activo:'Suma algo que tienes (cuentas, efectivo, bienes) o algo que debes, para calcular tu patrimonio real.',
 inversion:'Registra un CDT, ahorro o inversión. Calculamos cuánto rinde y te avisamos cuando vence.',
 meta:'Ponle nombre y valor a algo que quieres lograr. Te decimos cuánto ahorrar al mes para llegar a tiempo.',
 sub:'Agrega un servicio que se cobra solo (streaming, apps, gimnasio) para tenerlo a la vista y evitar cobros olvidados.',
 cal:'Fechas que llegan una vez al año (matrículas, impuestos, seguros) para que no te tomen por sorpresa.',
 confirm:'Revisa antes de continuar. Podrás deshacerlo durante unos segundos.',
 tarjeta:'Agrega tu tarjeta de crédito para controlar el cupo, la fecha de corte y la de pago.',
 compraTC:'Registra una compra con tarjeta. Si es a cuotas, te mostramos cuánto te cuesta en intereses.',
 cobro:'Prepara un recordatorio de cobro amable para enviar por WhatsApp o correo.',
 gcal:'Lleva tus próximos pagos y cobros a tu Google Calendar para recibir avisos en el celular.',
 grupo:'Crea un grupo para dividir gastos con otras personas: un viaje, la casa, un regalo.',
 gastoGrupo:'Anota un gasto del grupo. Calculamos automáticamente cuánto le toca a cada uno y quién le debe a quién.',
 extra:'Completa la información para continuar.',
 libro:'Un libro es un espacio separado de finanzas (por ejemplo, el hogar y tu negocio) con sus propios datos.',
 help:'Guía rápida de esta sección: para qué sirve y cómo usarla paso a paso.',
 buscar:'Busca cualquier movimiento, persona, préstamo o sección.',
 appNew:'Agrega un acceso directo a otra app que uses junto con Mirai.'
};

// ================= Notificaciones (toasts) =================
const TOAST_T={success:['circle-check','Listo'],error:['circle-x','No se pudo completar'],warn:['triangle-alert','Revisa esto'],info:['info','Aviso'],del:['trash-2','Eliminado']};
function toastType(m){m=String(m);if(/eliminad|borrad|se quit/i.test(m))return 'del';if(/^(escribe|elige|no se|no hay|no pud|error|falt|debes|este contacto|ingresa|selecciona|primero|el valor|la contraseña|el código)/i.test(m)||/incorrect|inválid|no coincide/i.test(m))return 'warn';if(/guardad|registrad|cread|actualizad|listo|agregad|import|enviad|copiad|descargad|activad|conectad|marcad|¡/i.test(m))return 'success';return 'info'}
let TX_LAST={m:'',t:0};function toastX(msg,o={}){const box=document.getElementById('toasts');if(!box)return;if(msg==='Guardado'&&!o.title){o={...o,title:'Cambios guardados',type:'success'};msg='Se guardaron automáticamente.'}if(TX_LAST.m===msg&&Date.now()-TX_LAST.t<2500&&!o.undo)return;TX_LAST={m:msg,t:Date.now()};const type=o.type||toastType(msg);const [icn,ttl]=TOAST_T[type]||TOAST_T.info;const dur=o.dur||(o.undo?7000:type==='warn'||type==='error'?5200:3600);
  while(box.children.length>=4)box.firstElementChild.remove();
  const el=document.createElement('div');el.className=`toast tx t-${type}`;el.setAttribute('role',type==='warn'||type==='error'?'alert':'status');
  el.innerHTML=`<span class="tx-i">${ic(icn)}</span><div class="tx-b"><b>${esc(o.title||ttl)}</b><span>${msg}</span>${o.undo||o.action?`<div class="tx-a">${o.undo?`<button type="button" class="tx-btn" data-tx="undo">${ic('undo-2')}Deshacer</button>`:''}${o.action?`<button type="button" class="tx-btn" data-tx="act">${esc(o.action.l)}</button>`:''}</div>`:''}</div><button type="button" class="tx-x" aria-label="Cerrar">${ic('x')}</button><span class="tx-p" style="animation-duration:${dur}ms"></span>`;
  box.appendChild(el);let left=dur,t0=Date.now(),tm;const gone=()=>{el.classList.add('out');setTimeout(()=>el.remove(),220)};const run=()=>{t0=Date.now();tm=setTimeout(gone,left)};run();
  el.addEventListener('mouseenter',()=>{clearTimeout(tm);left-=Date.now()-t0;el.classList.add('paused')});el.addEventListener('mouseleave',()=>{el.classList.remove('paused');run()});
  el.querySelector('.tx-x').onclick=()=>{clearTimeout(tm);gone()};
  const u=el.querySelector('[data-tx=undo]');if(u)u.onclick=()=>{clearTimeout(tm);S=o.undo;commit();render();gone();toastX('Recuperamos lo que habías eliminado.',{type:'success',title:'Deshecho'})};
  const a=el.querySelector('[data-tx=act]');if(a)a.onclick=()=>{clearTimeout(tm);o.action.fn();gone()};return el}
const DEL_N={fijos:'El gasto fijo',gastos:'El gasto',ingresos:'El ingreso',metas:'La meta',suscripciones:'La suscripción',inversiones:'La inversión',activos:'El registro',pasivos:'El registro',calendario:'La fecha',contactos:'El contacto',tarjetas:'La tarjeta'};
function delMsg(col,it){const n=it&&(it.nombre||it.desc||it.concepto||it.titulo);return `${DEL_N[col]||'El elemento'}${n?` "${esc(n)}"`:''} se eliminó.`}

// ================= Crear categoría desde el desplegable =================
function selCreateFoot(c){if(c.wrap.dataset.create==='ent')return entCreateFoot(c);if(c.wrap.dataset.create==='city')return cityCreateFoot(c);const list=POP.querySelector('.pop-list');const q=(c.q||'').trim();const old=POP.querySelector('.pop-foot');if(old)old.remove();
  list.insertAdjacentHTML('afterend',`<div class="pop-foot"><button type="button" class="pf-btn" data-catnew>${ic('plus')}${q?`Crear "${esc(q)}"`:'Crear categoría'}</button><button type="button" class="pf-btn ai" data-catai>${ic('sparkles')}Que la IA la cree</button></div>`);
  POP.querySelector('[data-catnew]').onclick=e=>{e.preventDefault();const w=c.wrap;closePop();openCatMini(w,{nombre:q})};
  POP.querySelector('[data-catai]').onclick=e=>{e.preventDefault();const w=c.wrap;closePop();openCatMini(w,{nombre:q,ai:true})}}
function ctxDesc(w){const f=w.closest('form');if(!f)return '';for(const n of ['desc','nombre','titulo','concepto']){const i=f.querySelector(`[name=${n}]`);if(i&&i.value&&i.type!=='hidden')return i.value}return ''}
async function aiCat(desc,nombre){let sample=null;if(S.cfg.ia.asist===false)return null;try{sample=window.claude&&window.claude.use?await window.claude.use('sample'):null}catch(e){}if(!sample)return null;
  const prompt=`Eres asistente de finanzas familiares en Colombia. El usuario necesita una NUEVA categoría de gasto.
Gasto o idea: "${desc||nombre}". ${nombre?`Nombre sugerido por el usuario: "${nombre}".`:''}
Categorías que YA existen (no repitas): ${S.cfg.categorias.map(c=>c.nombre).join(', ')}.
Íconos permitidos (elige uno EXACTO): ${ICON_CHOICES.join(', ')}.
Responde JSON {"nombre":"2-3 palabras en español, con mayúscula inicial","icon":"uno de la lista","grupo":"n|g|a" (n=necesidad, g=gusto, a=ahorro),"tope":número de pesos mensual razonable o 0,"razon":"máx 12 palabras"}`;
  try{const r=await sample.json(prompt,{modelTier:'quick'});if(!r||!r.nombre)return null;return{nombre:String(r.nombre).slice(0,40),icon:(ICON_CHOICES.includes(r.icon)||ICONS[r.icon])?r.icon:'tag',grupo:['n','g','a'].includes(r.grupo)?r.grupo:'g',tope:Math.max(0,Math.round(+r.tope||0)),razon:String(r.razon||'').slice(0,90)}}catch(e){return null}}
function localCatGuess(t){t=FN(t);const R=[[/mascota|perro|gato|veterin/,'Mascotas','paw-print','n'],[/gym|gimnas|deporte|futbol/,'Deporte','dumbbell','g'],[/regalo|cumple/,'Regalos','gift','g'],[/viaje|hotel|vuelo|tiquete/,'Viajes','plane','g'],[/belleza|pelu|barber|unas/,'Cuidado personal','sparkles','g'],[/bebe|panal|ninos|hijos/,'Hijos','baby','n'],[/donac|iglesia|diezmo/,'Donaciones','heart','g'],[/impuesto|predial|dian/,'Impuestos','landmark','n'],[/celular|plan movil|telefon/,'Telefonía','smartphone','n'],[/moto|carro|taller|mecanic/,'Vehículo','car','n']];for(const [re,n,i,g] of R)if(re.test(t))return{nombre:n,icon:i,grupo:g,tope:0};return null}
function openCatMini(wrap,o={}){let box=document.getElementById('modal2');if(!box){box=document.createElement('div');box.id='modal2';document.body.appendChild(box)}
  const desc=ctxDesc(wrap);const st={nombre:o.nombre||'',icon:'tag',grupo:'g',tope:''};
  const prev=SCOPE;SCOPE='x';OPTS.x={};const html=`<div class="dlg sm"><div class="dlg-h"><div class="dlg-ht"><h2>Nueva categoría</h2><p class="dlg-d">Crea un grupo para clasificar tus gastos. Aparecerá en tus listas, presupuesto y reportes.</p></div><button class="rbtn" data-m2x aria-label="Cerrar">${ic('x')}</button></div>
    <div class="dlg-b"><form id="m2form" class="form">
    <div class="full ai-box" id="m2ai">${ic('sparkles')}<div><b>Que la IA la proponga</b><span>${desc?`Usará "${esc(desc)}" para sugerir nombre, ícono y tipo.`:'Escribe una idea en el nombre y la IA completa el resto.'}</span></div><button type="button" class="btn sm ai" data-m2ai>${ic('sparkles')}Sugerir</button></div>
    ${field('Nombre de la categoría',txt('nombre',st.nombre,{req:true,ph:'Ej. Mascotas',max:40}),{cls:'full'})}
    <div class="f full">${hidden('grupo',st.grupo)}<span class="fl">¿Qué tipo de gasto es?</span><div class="seg">${pick('grupo',[{v:'n',l:'Necesidad',icon:'house'},{v:'g',l:'Gusto',icon:'heart'},{v:'a',l:'Ahorro',icon:'piggy-bank'}],st.grupo,'')}</div></div>
    ${field('Ícono',sel('icon',[...new Set([...ICON_CHOICES,'paw-print','dumbbell','gift','plane','sparkles','baby','heart','landmark','smartphone','car'])].map(i=>({v:i,l:i.replace(/-/g,' '),icon:i})),st.icon,{search:true}))}${field('Tope mensual (opcional)',money('tope',''))}
    </form></div><div class="dlg-f"><button class="btn" data-m2x>Cancelar</button><button class="btn pri" form="m2form">${ic('check')}Crear y usar</button></div></div>`;SCOPE=prev;
  box.innerHTML=html;box.classList.add('show');enhanceFields(box);const fm=box.querySelector('#m2form');setTimeout(()=>fm.querySelector('[name=nombre]').focus(),40);
  const close=()=>{box.classList.remove('show');box.innerHTML=''};box.querySelectorAll('[data-m2x]').forEach(b=>b.onclick=e=>{e.preventDefault();close()});box.onmousedown=e=>{if(e.target===box)close()};
  const setVals=r=>{fm.querySelector('[name=nombre]').value=r.nombre;const g=fm.querySelector(`[data-pick=grupo][data-v="${r.grupo}"]`);if(g)setPick(g);const iw=fm.querySelector('[data-sel]');const ii=iw.querySelector('input');ii.value=r.icon;iw.querySelector('.tv').className='tv';iw.querySelector('.tv').innerHTML=optLabel({l:r.icon.replace(/-/g,' '),icon:r.icon});if(r.tope){const t=fm.querySelector('[name=tope]');t.value=fmtMoneyInput(r.tope)}};
  const runAI=async()=>{const b=box.querySelector('[data-m2ai]');const nm=fm.querySelector('[name=nombre]').value.trim();if(!desc&&!nm){toastX('Escribe una idea en el nombre (por ejemplo "comida del perro") y la IA la completa.',{type:'warn'});return}b.disabled=true;b.innerHTML=`<span class="spin"></span>Pensando…`;
    let r=await aiCat(desc,nm);let src='IA';if(!r){r=localCatGuess(desc+' '+nm)||{nombre:nm||desc.split(' ').slice(0,2).join(' '),icon:'tag',grupo:'g',tope:0};src='local'}
    if(r.nombre)r.nombre=r.nombre[0].toUpperCase()+r.nombre.slice(1);setVals(r);b.disabled=false;b.innerHTML=`${ic('sparkles')}Sugerir otra vez`;box.querySelector('#m2ai span').textContent=src==='IA'?(r.razon||'Sugerencia lista. Puedes ajustarla antes de crearla.'):'La IA no está disponible ahora; te dejamos una sugerencia. Ajústala si quieres.'};
  box.querySelector('[data-m2ai]').onclick=e=>{e.preventDefault();runAI()};if(o.ai)runAI();
  fm.onsubmit=e=>{e.preventDefault();const nombre=fm.querySelector('[name=nombre]').value.trim();if(!nombre){fm.querySelector('[name=nombre]').closest('.f').classList.add('err');toastX('Escribe el nombre de la categoría.',{type:'warn'});return}
    const ex=S.cfg.categorias.find(c=>FN(c.nombre)===FN(nombre));let cat=ex;if(!ex){cat={id:uid(),nombre,icon:fm.querySelector('[name=icon]').value||'tag',grupo:fm.querySelector('[name=grupo]').value||'g',tope:+parseMoney(fm.querySelector('[name=tope]').value)||0};S.cfg.categorias.push(cat);commit()}
    const opt={v:cat.nombre,l:cat.nombre,icon:cat.icon,h:{n:'Necesidad',g:'Gusto',a:'Ahorro'}[cat.grupo]};const k=wrap.dataset.sel;const arr=OPTS.p[k]||OPTS.m[k];if(arr&&!arr.some(x=>x.v===opt.v))arr.push(opt);
    const inp=wrap.querySelector('input[type=hidden]');inp.value=opt.v;const tv=wrap.querySelector('.tv');tv.className='tv';tv.innerHTML=optLabel(opt);const f2=inp.closest('form');if(f2){f2.dataset.catManual='1';const h=f2.querySelector('#catHint');if(h)h.innerHTML=''}inp.dispatchEvent(new Event('change',{bubbles:true}));close();
    toastX(ex?`"${esc(nombre)}" ya existía; la seleccionamos.`:`"${esc(nombre)}" quedó en tu lista y ya está seleccionada.`,{type:'success',title:ex?'Categoría seleccionada':'Categoría creada'})}}

// ================= Gastos fijos: rango de valor y detección de servicios =================
const SERV_RE=/agua|acueducto|luz|energ|electric|gas\b|gas natural|internet|wifi|fibra|celular|movil|plan |claro|movistar|tigo|wom|telefon|tv|cable|servicio|alcantarill|aseo|basura/;
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-pick=tipoValor]');if(b&&e.isTrusted){const f=b.closest('form');if(f)f.dataset.tvManual='1'}},true);
document.addEventListener('input',e=>{const el=e.target;if(el.name!=='nombre')return;const f=el.closest('form[data-form=fijo]');if(!f||f.dataset.tvManual)return;const isS=SERV_RE.test(FN(el.value));const want=isS?'rango':'fijo';const cur=f.querySelector('[name=tipoValor]').value;
  if(cur!==want&&el.value.length>2){const b=f.querySelector(`[data-pick=tipoValor][data-v="${want}"]`);if(b){setPick(b)}const h=f.querySelector('#tvHint');if(h)h.innerHTML=isS?`${ic('sparkles')} Detectamos que es un servicio: su valor cambia según el consumo, así que te pedimos un rango.`:''}});
const _upPrev=updatePreviews;updatePreviews=function(root){_upPrev(root);const f=root&&root.querySelector&&root.querySelector('form[data-form=fijo]');if(!f)return;const box=f.querySelector('#rgPrev');if(!box)return;const a=+parseMoney(f.querySelector('[name=vmin]').value)||0,b=+parseMoney(f.querySelector('[name=vmax]').value)||0;
  box.innerHTML=a||b?`<span class="note">Para tus cálculos usaremos el promedio</span><span class="big">${$(Math.round(((a||b)+(b||a))/2))}</span><span>Te avisaremos si una factura sale por fuera de ${$(Math.min(a||b,b||a))} – ${$(Math.max(a,b))}, y ajustaremos el rango con tus pagos reales.</span>`:`<span class="note">${ic('info')} Escribe cuánto pagas en un mes bajo y en uno alto. Usaremos el promedio para tu presupuesto.</span>`};

// ================= Crear banco o entidad desde el desplegable =================
const ENT_T=['Banco','Cooperativa','Fintech','Casa de empeño','Compañía de financiamiento','Almacén o comercio','Fondo de empleados','Empresa','Persona'];
function entCreateFoot(c){const list=POP.querySelector('.pop-list');const q=(c.q||'').trim();const old=POP.querySelector('.pop-foot');if(old)old.remove();
  list.insertAdjacentHTML('afterend',`<div class="pop-foot"><button type="button" class="pf-btn" data-entnew>${ic('plus')}${q?`Crear "${esc(q)}"`:'Crear banco o entidad'}</button><button type="button" class="pf-btn ai" data-entai>${ic('sparkles')}Que la IA la identifique (nombre o NIT)</button></div>`);
  POP.querySelector('[data-entnew]').onclick=e=>{e.preventDefault();const w=c.wrap;closePop();openEntMini(w,{q})};POP.querySelector('[data-entai]').onclick=e=>{e.preventDefault();const w=c.wrap;closePop();openEntMini(w,{q,ai:true})}}
const NIT_RE=/^\d[\d.\s-]{5,}$/;
function nitDV(n){const d=String(n).replace(/\D/g,'');const w=[3,7,13,17,19,23,29,37,41,43,47,53,59,67,71];let s=0;for(let i=0;i<d.length;i++)s+=+d[d.length-1-i]*w[i];const r=s%11;return r>1?11-r:r}
async function aiEnt(q){let sample=null;if(S.cfg.ia.asist===false)return null;try{sample=window.claude&&window.claude.use?await window.claude.use('sample'):null}catch(e){}if(!sample)return null;
  const prompt=`Identifica una entidad que presta dinero o vende a crédito en Colombia a partir de este dato del usuario: "${q}" (puede ser un nombre comercial, una sigla, un NIT o un número de documento).
Tipos permitidos: ${ENT_T.join(', ')}.
Responde JSON {"nombre":"nombre comercial conocido","razon_social":"razón social si la conoces o vacío","nit":"NIT sin dígito de verificación, solo números, o vacío si no estás seguro","tipo":"uno de los tipos","confianza":"alta|media|baja","nota":"máx 15 palabras"}.
No inventes NIT: si no lo conoces con certeza déjalo vacío. Si el dato es un número de cédula de una persona, tipo="Persona" y nombre vacío.`;
  try{const r=await sample.json(prompt,{modelTier:'quick'});if(!r)return null;return{nombre:String(r.nombre||'').slice(0,60),razon:String(r.razon_social||'').slice(0,80),nit:String(r.nit||'').replace(/\D/g,'').slice(0,12),tipo:ENT_T.includes(r.tipo)?r.tipo:'Banco',conf:r.confianza||'media',nota:String(r.nota||'').slice(0,100)}}catch(e){return null}}
function openEntMini(wrap,o={}){let box=document.getElementById('modal2');if(!box){box=document.createElement('div');box.id='modal2';document.body.appendChild(box)}
  const q=o.q||'';const isNum=NIT_RE.test(q);const prev=SCOPE;SCOPE='x';OPTS.x={};
  box.innerHTML=`<div class="dlg sm"><div class="dlg-h"><div class="dlg-ht"><h2>Nuevo banco o entidad</h2><p class="dlg-d">Agrega quién te prestó o te vende a crédito: un banco, cooperativa, fintech, almacén o empresa. Quedará disponible en todas tus listas.</p></div><button class="rbtn" data-m2x aria-label="Cerrar">${ic('x')}</button></div>
  <div class="dlg-b"><form id="m2form" class="form">
  <div class="full ai-box" id="m2ai">${ic('sparkles')}<div><b>Que la IA la identifique</b><span>Escribe el nombre, la sigla o el NIT y completamos el resto.</span></div><button type="button" class="btn sm ai" data-m2ai>${ic('sparkles')}Identificar</button></div>
  ${field('Nombre',txt('nombre',isNum?'':q,{req:true,ph:'Ej. Cooperativa Confiar',max:60}),{cls:'full'})}
  ${field('NIT o documento',txt('nit',isNum?q.replace(/\D/g,''):'',{ph:'Ej. 890903938',attrs:'inputmode="numeric"',max:14}))}
  ${field('Tipo de entidad',sel('tipo',ENT_T.map(t=>({v:t,l:t,icon:t==='Persona'?'user':t==='Almacén o comercio'?'store':'landmark'})),'Banco'))}
  <div class="full note" id="m2nit"></div></form></div><div class="dlg-f"><button class="btn" data-m2x>Cancelar</button><button class="btn pri" form="m2form">${ic('check')}Crear y usar</button></div></div>`;SCOPE=prev;
  box.classList.add('show');enhanceFields(box);const fm=box.querySelector('#m2form');const nm=fm.querySelector('[name=nombre]'),ni=fm.querySelector('[name=nit]');setTimeout(()=>(isNum?nm:nm).focus(),40);
  const close=()=>{box.classList.remove('show');box.innerHTML=''};box.querySelectorAll('[data-m2x]').forEach(b=>b.onclick=e=>{e.preventDefault();close()});box.onmousedown=e=>{if(e.target===box)close()};
  const nitNote=()=>{const v=ni.value.replace(/\D/g,'');const el=fm.querySelector('#m2nit');el.innerHTML=v.length>=8?`${ic('info')} NIT con dígito de verificación: <b>${v}-${nitDV(v)}</b>. Verifícalo en el RUT o en el contrato del crédito.`:''};ni.addEventListener('input',nitNote);nitNote();
  const setTipo=t=>{const w=fm.querySelector('[data-sel]');w.querySelector('input').value=t;const tv=w.querySelector('.tv');tv.className='tv';tv.innerHTML=optLabel({l:t,icon:t==='Persona'?'user':t==='Almacén o comercio'?'store':'landmark'})};
  const runAI=async()=>{const b=box.querySelector('[data-m2ai]');const qq=(nm.value.trim()||ni.value.trim()||q);if(!qq){toastX('Escribe el nombre, la sigla o el NIT para que la IA la identifique.',{type:'warn'});return}b.disabled=true;b.innerHTML='<span class="spin"></span>Buscando…';
    const r=await aiEnt(qq);b.disabled=false;b.innerHTML=`${ic('sparkles')}Identificar otra vez`;const sp=box.querySelector('#m2ai span');
    if(!r){sp.textContent='La IA no está disponible ahora. Completa los datos a mano.';return}
    if(r.nombre)nm.value=r.nombre;if(r.nit)ni.value=r.nit;setTipo(r.tipo);nitNote();
    const dup=S.cfg.entidades.find(e=>(r.nit&&e.nit===r.nit)||FN(e.nombre)===FN(r.nombre));
    sp.innerHTML=`${r.razon?esc(r.razon)+'. ':''}${esc(r.nota||'')}${r.conf!=='alta'?' <b>Confirma los datos antes de guardar.</b>':''}${dup?` Ya tienes "${esc(dup.nombre)}" en tu lista.`:''}`};
  box.querySelector('[data-m2ai]').onclick=e=>{e.preventDefault();runAI()};if(o.ai)runAI();
  fm.onsubmit=e=>{e.preventDefault();const nombre=nm.value.trim();const nit=ni.value.replace(/\D/g,'');if(!nombre){nm.closest('.f').classList.add('err');toastX('Escribe el nombre de la entidad.',{type:'warn'});return}
    let ent=S.cfg.entidades.find(x=>(nit&&x.nit===nit)||FN(x.nombre)===FN(nombre));const existed=!!ent;
    if(!ent){ent={id:uid(),nombre,tipo:fm.querySelector('[name=tipo]').value||'Banco',nit};S.cfg.entidades.push(ent);commit()}else if(nit&&!ent.nit){ent.nit=nit;commit()}
    const opt={v:ent.id,l:ent.nombre,icon:'landmark',h:[ent.tipo,ent.nit?'NIT '+ent.nit:''].filter(Boolean).join(' · ')};const k=wrap.dataset.sel;const arr=OPTS.p[k]||OPTS.m[k];if(arr&&!arr.some(x=>x.v===opt.v))arr.push(opt);
    const inp=wrap.querySelector('input[type=hidden]');inp.value=opt.v;const tv=wrap.querySelector('.tv');tv.className='tv';tv.innerHTML=optLabel(opt);wrap.closest('.f')?.classList.remove('err');inp.dispatchEvent(new Event('change',{bubbles:true}));close();
    toastX(existed?`"${esc(ent.nombre)}" ya estaba en tu lista; la seleccionamos.`:`"${esc(ent.nombre)}" quedó en tu lista y ya está seleccionada.`,{type:'success',title:existed?'Entidad seleccionada':'Entidad creada'})}}

// ================= ¿Es gasto fijo o deuda? =================
const DEBT_RE=/cuota|credito|prestamo|financ|celya|addi|sistecredito|brilla|meddipay|tarjeta|leasing|a cuotas|televisor|celular a/;
document.addEventListener('input',e=>{const el=e.target;if(el.name!=='nombre')return;const f=el.closest('form[data-form=fijo]');if(!f)return;let w=f.querySelector('#debtHint');const hit=DEBT_RE.test(FN(el.value))&&el.value.length>3;
  if(!hit){if(w)w.remove();return}if(w)return;el.closest('.f').insertAdjacentHTML('afterend',`<div class="full ai-box" id="debtHint">${ic('lightbulb')}<div><b>¿Es una compra a cuotas o un crédito?</b><span>Si compraste algo a cuotas (como un televisor con Celya o Addi) regístralo como deuda: así ves cuánto te falta, los intereses y cuándo terminas.</span></div><button type="button" class="btn sm" data-debt>Registrar como deuda</button></div>`);
  f.querySelector('[data-debt]').onclick=()=>{const n=el.value;closeModal();openModal('loan',{kind:'pagar',dir:'pagar'});setTimeout(()=>{const c=document.querySelector('#modal [name=concepto]');if(c){c.value=n;c.dispatchEvent(new Event('input',{bubbles:true}))}},80)}});

function cityCreateFoot(c){const q=(c.q||'').trim();const old=POP.querySelector('.pop-foot');if(old)old.remove();if(!q)return;const list=POP.querySelector('.pop-list');
  list.insertAdjacentHTML('afterend',`<div class="pop-foot"><button type="button" class="pf-btn" data-citynew>${ic('map-pin')}Usar "${esc(q)}" como ciudad</button></div>`);
  POP.querySelector('[data-citynew]').onclick=e=>{e.preventDefault();const w=c.wrap;const v=q.replace(/^./,x=>x.toUpperCase());closePop();setSelValue(w.closest('form')||w.closest('.card')||document,w.querySelector('input').name,v,{l:v,h:'Otra ciudad'})}}

/* v3.9: atajo N = Agregar */
document.addEventListener('keydown',e=>{if((e.key==='n'||e.key==='N')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!typing()&&!MODAL&&!document.querySelector('#asChat.open')&&!document.body.classList.contains('locked')){const b=document.querySelector('.sb-create');if(b){e.preventDefault();b.click()}}});
