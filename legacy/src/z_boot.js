/* ================= arranque ================= */
function normalBoot(){
BOOK=store.get('lmf-libro','principal');
{const v3=store.get(LKEY(),null);if(v3&&v3.v===3)S=normalize(v3);else if(BOOK==='principal'){const v2=store.get(KEY2,null);if(v2&&v2.v===2)S=normalize(v2);else{const v1=store.get(KEY1,null);if(v1&&v1.activos&&!v1.sample)S=normalize({...v1,v:1})}}if(!S){S=normalize(defaults());FIRST=true}}
if(store.get(KTHEME,'claro')==='oscuro')document.documentElement.classList.add('dk');if(store.get(KPRIV,false))document.documentElement.classList.add('priv');
if(store.get(KSIDE,false))document.body.classList.add('sb-col');
if(FIRST&&!location.hash)location.replace('#puesta');
render();maybePopups();bootCloud();bootLibros();authBoot();
const tourWait=setInterval(()=>{if(!AUTH.ready||document.body.classList.contains('locked'))return;clearInterval(tourWait);if(!store.get('lmf-tour',0))setTimeout(()=>{if(TI<0&&!MODAL)EXTRA_ACT.tourStart()},1200)},500);

}
if(CONT_Q)contBoot();else normalBoot();
