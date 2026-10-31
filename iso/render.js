const {chromium}=require('playwright');const fs=require('fs');const d=JSON.parse(fs.readFileSync('iso.json','utf8'));
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:900}});
const defs=`<svg width="0" height="0" style="position:absolute"><defs>${d.defs}</defs></svg>`;
const names=Object.keys(d.icons);
await p.setContent(`<body style="margin:0;background:#fff;font:12px sans-serif">${defs}<div style="display:grid;grid-template-columns:repeat(8,140px);gap:8px;padding:12px">${names.map(n=>`<div style="text-align:center"><svg viewBox="0 0 256 256" width="120" height="120">${d.icons[n]}</svg><div>${n}</div></div>`).join('')}</div></body>`);
await p.screenshot({path:'sheet.png',fullPage:true});
await p.setContent(`<body style="margin:0;background:#1A2131">${defs}<div style="display:grid;grid-template-columns:repeat(8,140px);gap:8px;padding:12px">${names.map(n=>`<svg viewBox="0 0 256 256" width="120" height="120">${d.icons[n]}</svg>`).join('')}</div></body>`);
await p.screenshot({path:'sheet_dark.png',fullPage:true});
fs.mkdirSync('png',{recursive:true});await p.setViewportSize({width:1024,height:1024});
for(const n of names){await p.setContent(`<html><body style="margin:0;background:transparent">${defs}<svg viewBox="0 0 256 256" width="1024" height="1024" style="display:block">${d.icons[n]}</svg></body></html>`);await p.screenshot({path:`png/${n}.png`,omitBackground:true,clip:{x:0,y:0,width:1024,height:1024}})}
await b.close()})();
