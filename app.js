/* Barcode Label Generator - app */
// Display font used on the rendered labels. Change it to any font the browser has.
const DISPLAY_FONT="Georgia,'Times New Roman',serif";
const L=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const R=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const GUARD=new Set([0,1,2,45,46,47,48,49,92,93,94]);
const W=1011,H=760,MW=8,X0=108,BW=760,BARS_TOP=168,DATA_BOTTOM=606,GUARD_BOTTOM=664,DIGIT_CY=641;
// vertical SKU sits clear of the 9-module quiet zone: bars end at X0+BW=868, quiet zone runs to 940.
// was 958, which put the glyph edge at x=938 and ate 0.25 of a module. Revert to 958 to restore the old art.
const SKU_X=964;

function checkDigit(d11){let odd=0,even=0;for(let i=0;i<11;i++){const n=+d11[i];(i%2===0)?odd+=n:even+=n;}return (10-((odd*3+even)%10))%10;}
var normalizeUPC=function(raw){
  let d=(raw||'').replace(/\D/g,'');
  if(d.length===13&&d[0]==='0')d=d.slice(1);
  if(d.length===11){return {code:d+checkDigit(d),valid:true,note:'check digit '+checkDigit(d)+' added'};}
  if(d.length===12){const exp=checkDigit(d.slice(0,11));const ok=exp===+d[11];
    return {code:ok?d:null,valid:ok,note:ok?'valid':'check digit should be '+exp+', not '+d[11]};}
  return {code:null,valid:false,note:d.length===8?'8-digit code is not a UPC-A, get the 12-digit UPC':'need 11 or 12 digits (got '+d.length+')'};
};
// ---- UPC validity toggle: when off, codes that fail UPC-A print as Code 128 ----
let VALIDATE_UPC=true;
const _strictUPC=normalizeUPC;
normalizeUPC=function(raw){
  const r=_strictUPC(raw);
  if(r.valid||VALIDATE_UPC)return r;
  let d=(raw||'').replace(/\D/g,'');
  if(!d)return {code:null,valid:false,note:'no number to print'};
  if(d.length===12)return {code:d,valid:true,forced:true,note:'not a valid UPC-A ('+r.note+'). Printed in the UPC-A design for consistency, but scanners will reject it'};
  return {code:d,valid:true,forced:true,note:'not a valid UPC-A ('+r.note+'). Printing as Code 128, scans as '+d};
};
function isUPCA(code){return !!code&&code.length===12&&checkDigit(code.slice(0,11))===+code[11];}
// 12 digits: always drawn in the UPC-A design (a bad check digit will not scan). Other lengths: Code 128.
function useUPCALayout(code){return !!code&&/^\d{12}$/.test(code);}
function codeTag(code){return isUPCA(code)?'':(useUPCALayout(code)?' · will not scan':' · Code 128');}
const C128="11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,11001110010,11001011100,11001001110,11011100100,11001110100,11101101110,11101001100,11100101100,11100100110,11101100100,11100110100,11100110010,11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,11101110110,11010001110,11000101110,11011101000,11011100010,11011101110,11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,11110101110,11010000100,11010010000,11010011100,1100011101011".split(",");
function code128Modules(code){
  const vals=[];
  if(/^\d+$/.test(code)&&code.length%2===0){vals.push(105);for(let i=0;i<code.length;i+=2)vals.push(+code.substr(i,2));}
  else{vals.push(104);for(const ch of code)vals.push(ch.charCodeAt(0)-32);}
  let sum=vals[0];for(let i=1;i<vals.length;i++)sum+=vals[i]*i;vals.push(sum%103);
  return vals.map(v=>C128[v]).join('')+C128[106];
}
// draw Code 128 bars centered in [x0,x0+w], from top to bottom; returns module width used
function drawCode128(ctx,code,x0,w,top,bottom,maxMW){
  const bits=code128Modules(code),mw=Math.max(2,Math.min(maxMW,Math.floor(w/(bits.length+20))));
  const bx=Math.round(x0+(w-bits.length*mw)/2);
  for(let i=0;i<bits.length;i++)if(bits[i]==='1')ctx.fillRect(bx+i*mw,top,mw,bottom-top);
  return mw;
}
function upcaModules(code){const d=[...code].map(Number);let b="101";for(let i=0;i<6;i++)b+=L[d[i]];b+="01010";for(let i=6;i<12;i++)b+=R[d[i]];return b+"101";}
function sanitize(n){return (n||'').replace(/[\\/:*?"<>|]/g,'-').trim();}

// ---- colour block (variant panel) ----
let COLORBLOCK=false;
const CB_DEFAULT='#B0A696';
// product label panel geometry (canvas widens to W_CB only when the block is on)
const W_CB=1200,PX=1005,PW=165,PTOP=92,PBOT=664;
// case & carton panel geometry
const C_CONTENT=1030,CPX=1048,CPW=130,CPTOP=36,CPBOT=578;
function normHex(h){h=(h||'').trim();if(!h)return '';if(h[0]!=='#')h='#'+h;
  if(/^#[0-9a-f]{3}$/i.test(h))h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
  return /^#[0-9a-f]{6}$/i.test(h)?h.toUpperCase():'';}
function cbColor(h){return normHex(h)||CB_DEFAULT;}
function rgbOf(h){h=cbColor(h);return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function lumOf(h){const c=rgbOf(h).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
// pick whichever of black/white actually wins on WCAG contrast against the fill.
// crossover is L = sqrt(1.05*0.05) - 0.05 = 0.1791, not the midpoint.
function panelInk(h){return lumOf(h)>0.1791?'#17150F':'#FFFFFF';}
function panelEdge(h){const c=rgbOf(h),f=0.74;return 'rgb('+Math.round(c[0]*f)+','+Math.round(c[1]*f)+','+Math.round(c[2]*f)+')';}
function needsKeyline(h){return lumOf(h)>0.80;}
// "Owlbear - Hard Enamel Pin - Blue" -> base "Owlbear - Hard Enamel Pin", variant "Blue"
function splitVariant(name){const t=(name||'').trim(),i=t.lastIndexOf(' - ');
  return i>0?{base:t.slice(0,i).trim(),variant:t.slice(i+3).trim()}:{base:t,variant:''};}
function drawPanel(ctx,x,y,w,h,hex,text){
  const col=cbColor(hex);
  ctx.fillStyle=col;ctx.fillRect(x,y,w,h);
  if(needsKeyline(col)){ctx.strokeStyle=panelEdge(col);ctx.lineWidth=3;ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);}
  if(text){ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(-Math.PI/2);
    ctx.textAlign='center';ctx.textBaseline='middle';
    const sz=fitFont(ctx,text,h-44,Math.floor(w*0.44),14);
    ctx.font='bold '+sz+'px '+DISPLAY_FONT;ctx.fillStyle=panelInk(col);ctx.fillText(text,0,0);ctx.restore();}
  ctx.fillStyle='#000';
}
// what a row/field set should feed the renderer, honouring the global toggle
function cbOpt(o){return COLORBLOCK?{variant:(o&&o.variant)||'',color:cbColor(o&&o.color)}:null;}
function cbTitle(full,base){return COLORBLOCK?((base||'').trim()||splitVariant(full).base||full):full;}

function fitFont(ctx,text,maxW,start,min){for(let s=start;s>min;s--){ctx.font='bold '+s+'px '+DISPLAY_FONT;if(ctx.measureText(text).width<=maxW)return s;}return min;}
function splitTwo(ctx,title){const ws=title.split(' ').filter(Boolean);let best=null;ctx.font='bold 40px '+DISPLAY_FONT;
  for(let i=1;i<ws.length;i++){const l1=ws.slice(0,i).join(' '),l2=ws.slice(i).join(' ');const sc=Math.max(ctx.measureText(l1).width,ctx.measureText(l2).width);if(best===null||sc<best.sc)best={sc,l1,l2};}
  return best||{l1:title,l2:''};}

function renderLabel(canvas,sku,code,title,opt){
  const cb=!!opt;
  const ctx=canvas.getContext('2d');canvas.width=cb?W_CB:W;canvas.height=H;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,H);ctx.fillStyle='#000';
  ctx.textAlign='center';ctx.textBaseline='middle';
  if(useUPCALayout(code)){
  const bits=upcaModules(code);
  for(let i=0;i<bits.length;i++){if(bits[i]==='1'){const x=X0+i*MW;const bottom=GUARD.has(i)?GUARD_BOTTOM:DATA_BOTTOM;ctx.fillRect(x,BARS_TOP,MW,bottom-BARS_TOP);}}
  ctx.font='bold 46px '+DISPLAY_FONT;
  ctx.fillText(code[0],X0-4*MW,DIGIT_CY);
  ctx.fillText(code.slice(1,6),X0+((8+44)/2)*MW,DIGIT_CY);
  ctx.fillText(code.slice(6,11),X0+((50+91)/2)*MW,DIGIT_CY);
  ctx.fillText(code[11],X0+BW+4*MW,DIGIT_CY);
  }else{
    drawCode128(ctx,code,X0-4*MW,BW+8*MW,BARS_TOP,DATA_BOTTOM+14,MW);
    ctx.font='bold 46px '+DISPLAY_FONT;ctx.fillText(code,X0+BW/2,DIGIT_CY+6);
  }
  const cx=X0+BW/2, cyb=(14+150)/2, bandh=150-14;
  const one=fitFont(ctx,title,860,60,18);
  if(one>=46){ctx.font='bold '+one+'px '+DISPLAY_FONT;ctx.fillText(title,cx,cyb);}
  else{
    const {l1,l2}=splitTwo(ctx,title);
    let s=Math.min(fitFont(ctx,l1,860,50,18),fitFont(ctx,l2,860,50,18));
    ctx.font='bold '+s+'px '+DISPLAY_FONT;
    let m=ctx.measureText('Ag');let lh=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)||s*1.15;
    const gap=6;
    while(2*lh+gap>bandh && s>18){s--;ctx.font='bold '+s+'px '+DISPLAY_FONT;m=ctx.measureText('Ag');lh=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)||s*1.15;}
    const top=cyb-(2*lh+gap)/2;
    ctx.fillText(l1,cx,top+lh/2);
    ctx.fillText(l2,cx,top+lh+gap+lh/2);
  }
  ctx.save();ctx.translate(SKU_X,(BARS_TOP+GUARD_BOTTOM)/2);ctx.rotate(-Math.PI/2);
  ctx.font='bold 40px '+DISPLAY_FONT;ctx.fillText(sku,0,0);ctx.restore();
  if(cb)drawPanel(ctx,PX,PTOP,PW,PBOT-PTOP,opt.color,(opt.variant||'').toUpperCase());
}

function canvasToBlob(canvas){return new Promise(res=>canvas.toBlob(res,'image/png'));}
// Saving a file works two ways. Opened as a local file the anchor trick is fine.
// Published as a Claude artifact the frame may not download directly, so the host's
// downloads capability is asked first and the viewer confirms the save.
let DLNS=null;
const DLREADY=(typeof claude!=='undefined'&&claude&&typeof claude.use==='function')
  ? Promise.resolve(claude.use('downloads')).then(d=>{DLNS=d;}).catch(()=>{DLNS=null;})
  : Promise.resolve();
function dlNote(msg){const el=document.getElementById('dl-note');if(!el)return;
  el.textContent=msg||'';el.style.display=msg?'block':'none';
  if(msg)clearTimeout(dlNote._t),dlNote._t=setTimeout(()=>{el.textContent='';el.style.display='none';},6000);}
function anchorSave(blob,filename){const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
async function downloadBlob(blob,filename){
  await DLREADY;
  if(DLNS){
    try{await DLNS.save({filename,data:blob});dlNote('');return;}
    catch(e){const c=e&&e.code;
      if(c==='declined')return;
      if(c==='rate_limited'){dlNote('A save prompt is already open. Finish that one first.');return;}
      if(c==='too_large'){dlNote('That file is too big to save from here. Open the page locally instead.');return;}
      dlNote('This view could not save the file'+(e&&e.message?' ('+e.message+')':'')+'. Open index.html locally to download.');
      return;}
  }
  anchorSave(blob,filename);
}
function pdfBlob(doc){try{return doc.output('blob');}catch(e){return null;}}
function savePDF(doc,name){const b=pdfBlob(doc);if(b)downloadBlob(b,name);else doc.save(name);}

// ---- tabs ----
function syncShared(){const t=document.querySelector('.tab.active').dataset.tab;document.getElementById('carton-shared').style.display=(t==='carton'||t==='cartonbatch')?'':'none';document.getElementById('product-shared').style.display=(t==='single'||t==='batch')?'':'none';}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setTimeout(syncShared,0)));
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');document.getElementById('panel-'+t.dataset.tab).classList.add('active');
}));

// ---- single ----
const sName=document.getElementById('s-name'),sSku=document.getElementById('s-sku'),sUpc=document.getElementById('s-upc');
const sStatus=document.getElementById('s-upc-status'),sCanvas=document.getElementById('s-canvas'),sBtn=document.getElementById('s-download');
let sCurrent=null;
const sVariant=document.getElementById('s-variant'),sColor=document.getElementById('s-color'),sHex=document.getElementById('s-hex');
// art is drawn offscreen so downloads and PDFs keep the full-resolution label,
// while the visible canvas shows the sticker at its true proportions
const sArt=document.createElement('canvas');
function updateSingle(){
  const nu=normalizeUPC(sUpc.value);
  const full=sName.value.trim();
  const opt=cbOpt({variant:sVariant.value,color:sHex.value});
  if(nu.valid){sStatus.className='status '+(nu.forced?'warn':'ok');sStatus.textContent=nu.note;
    renderLabel(sArt,sSku.value.trim()||' ',nu.code,full||' ',opt);
    renderPreview(sCanvas,sArt,true);setScale('s-scale',sArt,'ps',true);
    sCurrent={name:full,sku:sSku.value.trim(),code:nu.code};sBtn.disabled=false;setProductPdfBtns(false);
  }else{sStatus.className='status bad';sStatus.textContent=nu.note;sBtn.disabled=true;setProductPdfBtns(true);sCurrent=null;
    const ctx=sCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,sCanvas.width,sCanvas.height);setScale('s-scale',null);}
}
[sName,sSku,sUpc,sVariant].forEach(el=>el.addEventListener('input',updateSingle));
bindHexPair(sColor,sHex,document.getElementById('s-hex-status'),updateSingle);
function setProductPdfBtns(off){['s-preview','s-pdf'].forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=off;});}
function productFile(name,sku){return 'Product sheet - '+sanitize(name)+' - '+sanitize(sku)+'.pdf';}
function productSinglePDF(preview){
  if(!sCurrent)return;const t=trimCanvas(sArt);
  outPDF(buildSheetPDF([{...t,alias:'prod'}],'ps'),productFile(sCurrent.name,sCurrent.sku),preview);
}
document.getElementById('s-pdf').addEventListener('click',()=>productSinglePDF(false));
document.getElementById('s-preview').addEventListener('click',()=>productSinglePDF(true));
sBtn.addEventListener('click',async()=>{if(!sCurrent)return;const blob=await canvasToBlob(sArt);downloadBlob(blob,sanitize(sCurrent.name)+' - '+sanitize(sCurrent.sku)+'.png');});


// ---- conflict warnings (warning only, printing is never blocked) ----
function findConflicts(rows){
  const nk=x=>(x||'').replace(/\s+/g,' ').trim().toUpperCase(),dg=x=>(x||'').replace(/\D/g,'');
  const bySku={},byUpc={},msg=rows.map(()=>[]);
  rows.forEach((r,i)=>{const k=nk(r.sku),u=dg(r.code||r.upc);if(k&&u){(bySku[k]=bySku[k]||{})[u]=(bySku[k][u]||[]).concat(i);(byUpc[u]=byUpc[u]||{})[k]=(byUpc[u][k]||[]).concat(i);}});
  Object.entries(bySku).forEach(([k,m])=>{const us=Object.keys(m);if(us.length>1)us.forEach(u=>m[u].forEach(i=>msg[i].push('SKU '+k+' also has UPC '+us.filter(x=>x!==u).join(', '))));});
  Object.entries(byUpc).forEach(([u,m])=>{const ks=Object.keys(m);if(ks.length>1)ks.forEach(k=>m[k].forEach(i=>msg[i].push('UPC '+u+' also used by '+ks.filter(x=>x!==k).join(', '))));});
  rows.forEach((r,i)=>{if(r.multiSku)msg[i].push('Row has two different SKUs');});
  return msg;
}
function conflictPill(m){return m.length?' <span class="pill warn" title="'+escapeHtml(m.join(' | '))+'">conflict</span><div class="conflict">'+escapeHtml(m.join('. '))+'</div>':'';}
function conflictNote(msgs){const n=msgs.filter(m=>m.length).length;return n?' '+n+' row'+(n===1?' has':'s have')+' a SKU or UPC conflict (still printable, check before use).':'';}
// ---- batch ----
const bInput=document.getElementById('b-input'),bParse=document.getElementById('b-parse'),bZip=document.getElementById('b-zip');
const bResults=document.getElementById('b-results'),bSummary=document.getElementById('b-summary');
let bRows=[];
// SKU shape used when parsing pasted rows. Edit SKU_PREFIXES for your own codes,
// or leave it empty to match any LETTERS+DIGITS token (e.g. ABC 12345, SKU-0012).
const SKU_PREFIXES=[];
const SKU_RE=SKU_PREFIXES.length
  ? new RegExp('^('+SKU_PREFIXES.join('|')+')\\s*[-]?\\d+','i')
  : /^[A-Z]{2,5}[\s-]?\d{3,}$/i;
// Optional: category names from your own spreadsheet, used to auto-pick packaging.
// Leave empty and packaging falls back to the name rules below.
const SOURCE_TABS=[];
const META_RE=/^(active|discontinued|draft|no listing|not found in overlord|match|mismatch|no overlord sku|\d{1,4})$|production chart$/i;
function isMeta(p){return META_RE.test(p)||SOURCE_TABS.includes(p);}
function findTab(line){const parts=(line.includes('\t')?line.split('\t'):line.split(',')).map(x=>x.trim());return parts.find(x=>SOURCE_TABS.includes(x))||'';}
function parseLine(line){
  let parts=line.includes('\t')?line.split('\t'):line.split(',');
  parts=parts.map(p=>p.trim()).filter(p=>p.length&&!isMeta(p));
  const skus=parts.filter(p=>SKU_RE.test(p));
  const upcs=parts.filter(p=>{const d=p.replace(/\D/g,'');return (d.length===11||d.length===12||(d.length===13&&d[0]==='0'))&&/^[\d\s-]+$/.test(p);});
  const sku=skus.length?skus[skus.length-1]:'';
  let upc=upcs.length?upcs[0]:'';
  if(!upc&&!VALIDATE_UPC){upc=parts.find(p=>/^[\d\s-]+$/.test(p)&&p.replace(/\D/g,'').length>=6)||'';}
  const hexRaw=parts.find(p=>p.charAt(0)==='#'&&normHex(p))||'';
  const used=new Set([sku,upc,hexRaw]);
  const name=parts.filter(p=>!used.has(p)).sort((a,b)=>b.replace(/[^A-Za-z]/g,'').length-a.replace(/[^A-Za-z]/g,'').length)[0]||'';
  const sv=splitVariant(name);
  return {name,sku,upc,base:sv.base,variant:sv.variant,color:normHex(hexRaw)||CB_DEFAULT,
    multiSku:new Set(skus.map(x=>x.replace(/\s+/g,' ').toUpperCase())).size>1};
}
bParse.addEventListener('click',()=>{
  const lines=bInput.value.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim().length);
  bRows=lines.map(parseLine).map(r=>{const nu=normalizeUPC(r.upc);return {...r,code:nu.code,valid:nu.valid,note:nu.note};});
  renderBatch();
});
function renderBatch(){
  if(!bRows.length){bSummary.textContent='Nothing parsed. Check your list.';bResults.innerHTML='';bZip.disabled=true;return;}
  const okN=bRows.filter(r=>r.valid).length;
  const bConf=findConflicts(bRows);
  bSummary.textContent=okN+' of '+bRows.length+' ready. '+(bRows.length-okN?(bRows.length-okN)+' need a look (see below).':'All valid.')+conflictNote(bConf);
  let html='<table><thead><tr><th>Preview</th><th>Product / SKU</th>'+(COLORBLOCK?'<th>Variant / colour</th>':'')+'<th>UPC</th><th></th></tr></thead><tbody>';
  bRows.forEach((r,i)=>{
    html+='<tr><td class="thumb">'+(r.valid?'<canvas id="bc-'+i+'"></canvas>':'<span class="pill bad">no preview</span>')+'</td>'
      +'<td><div>'+escapeHtml(r.name||'(no name)')+'</div><div style="color:var(--muted)">'+escapeHtml(r.sku||'(no SKU)')+'</div>'+conflictPill(bConf[i])+'</td>'
      +(COLORBLOCK?cbCell(r,i):'')
      +'<td>'+(r.valid?'<span class="pill '+(isUPCA(r.code)?'ok':'warn')+'" title="'+escapeHtml(r.note)+'">'+r.code+codeTag(r.code)+'</span>':'<span class="pill bad">'+escapeHtml(r.note)+'</span>')+'</td>'
      +'<td>'+(r.valid?'<button class="mini" data-i="'+i+'">PNG</button>':'')+'</td></tr>';
  });
  html+='</tbody></table>';
  bResults.innerHTML=html;
  const bArt=document.createElement('canvas');
  const paintRow=i=>{const c=document.getElementById('bc-'+i),r=bRows[i];if(!c||!r.valid)return;
    renderLabel(bArt,r.sku||' ',r.code,cbTitle(r.name,r.base)||' ',cbOpt(r));renderPreview(c,bArt,true,900);};
  bRows.forEach((r,i)=>{if(r.valid)paintRow(i);});
  wireCbCells(bResults,bRows,paintRow);
  bResults.querySelectorAll('.mini').forEach(btn=>btn.addEventListener('click',async()=>{
    const r=bRows[+btn.dataset.i],c=document.createElement('canvas');
    renderLabel(c,r.sku||' ',r.code,cbTitle(r.name,r.base)||' ',cbOpt(r));
    const blob=await canvasToBlob(c);downloadBlob(blob,sanitize(r.name)+' - '+sanitize(r.sku)+'.png');
  }));
  bZip.disabled=okN===0;document.getElementById('b-pdf').disabled=document.getElementById('b-preview').disabled=okN===0;
}
function productBatchPDF(preview){
  const valid=bRows.filter(r=>r.valid);if(!valid.length)return;
  const cv=document.createElement('canvas'),pages=valid.map((r,i)=>{renderLabel(cv,r.sku||' ',r.code,cbTitle(r.name,r.base)||' ',cbOpt(r));return {...trimCanvas(cv),alias:'pb'+i};});
  outPDF(buildSheetPDF(pages,'ps'),'product_labels.pdf',preview);
}
document.getElementById('b-pdf').addEventListener('click',()=>productBatchPDF(false));
document.getElementById('b-preview').addEventListener('click',()=>productBatchPDF(true));
bZip.addEventListener('click',async()=>{
  const valid=bRows.filter(r=>r.valid);if(!valid.length)return;
  if(typeof JSZip==='undefined'){alert('ZIP library did not load (offline?). Use the per-row PNG buttons instead.');return;}
  bZip.disabled=true;const old=bZip.textContent;bZip.textContent='Building ZIP...';
  const zip=new JSZip();const cv=document.createElement('canvas');
  for(const r of valid){renderLabel(cv,r.sku||' ',r.code,cbTitle(r.name,r.base)||' ',cbOpt(r));const blob=await canvasToBlob(cv);zip.file(sanitize(r.name)+' - '+sanitize(r.sku)+'.png',blob);}
  const out=await zip.generateAsync({type:'blob'});downloadBlob(out,'barcode_labels.zip');
  bZip.textContent=old;bZip.disabled=false;
});
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
// ---- shared colour-block cell for both batch tables ----
function cbCell(r,i){const c=cbColor(r.color);
  return '<td class="cbcell">'
    +'<input type="text" data-i="'+i+'" data-k="variant" placeholder="Variant" value="'+escapeHtml(r.variant||'')+'">'
    +'<div class="cbpick"><input type="color" data-i="'+i+'" data-k="color" value="'+c+'">'
    +'<input type="text" class="hex" data-i="'+i+'" data-k="hex" maxlength="7" spellcheck="false" value="'+c+'"></div></td>';}
// live edits repaint only the row that changed, so the input keeps focus
function wireCbCells(root,rows,repaint){
  root.querySelectorAll('[data-k="variant"],[data-k="color"],[data-k="hex"]').forEach(el=>{
    el.addEventListener('input',()=>{
      const i=+el.dataset.i,r=rows[i],k=el.dataset.k;if(!r)return;
      if(k==='variant'){r.variant=el.value;}
      else{const h=normHex(el.value);
        if(k==='hex'){const bad=!h&&el.value.trim()!=='';el.classList.toggle('bad',bad);
          if(el.parentElement)el.parentElement.classList.toggle('bad',bad);if(!h)return;}
        r.color=h||r.color;
        const twin=root.querySelector('[data-i="'+i+'"][data-k="'+(k==='hex'?'color':'hex')+'"]');
        if(twin)twin.value=r.color;
        const hx=root.querySelector('[data-i="'+i+'"][data-k="hex"]');
        if(hx){hx.classList.remove('bad');if(hx.parentElement)hx.parentElement.classList.remove('bad');}}
      repaint(i);
    });
  });
}
// hex text box and swatch kept in step on the two single-label tabs
function bindHexPair(colorEl,hexEl,statusEl,after){
  const wrap=hexEl.parentElement;
  const mark=bad=>{hexEl.classList.toggle('bad',bad);if(wrap)wrap.classList.toggle('bad',bad);};
  colorEl.addEventListener('input',()=>{hexEl.value=colorEl.value.toUpperCase();mark(false);
    if(statusEl)statusEl.textContent='';after();});
  hexEl.addEventListener('input',()=>{const h=normHex(hexEl.value),empty=hexEl.value.trim()==='';
    mark(!h&&!empty);
    if(statusEl)statusEl.textContent=h||empty?'':'Not a hex colour. Use #RRGGBB.';
    if(!h)return;colorEl.value=h;after();});
}


// ---- case / carton ----
const PACKS=[
  {id:'small', label:'Small box',            units:24, cases:4},
  {id:'blister',label:'Blister pack',        units:36, cases:8},
  {id:'tin',   label:'Tin',                  units:12, cases:6},
  {id:'polybag',label:'Polybag',             units:50, cases:10},
  {id:'bulk',  label:'Bulk carton',          units:100, cases:0},
  {id:'pending',label:'Not confirmed yet',units:'',cases:''},
  {id:'custom',label:'Custom (type quantities)',units:'',cases:''}
];
// 1) product-specific name rules win anywhere. Add your own patterns here.
const NAME_RULES=[
  [/tin/i,'tin'],[/blister/i,'blister'],[/polybag|bag/i,'polybag']
];
// 2) otherwise the production chart tab decides (paste the Source Tab column to use this)
// 2) otherwise the category column decides. Map your SOURCE_TABS values to a pack id.
const TAB_PACK={};
// 3) no tab given: cautious name fallback
const FALLBACK_RULES=[[/set/i,'small']];
function guessPack(text,tab){
  for(const [re,id] of NAME_RULES)if(re.test(text||''))return id;
  if(tab)return TAB_PACK[tab]||'pending';
  for(const [re,id] of FALLBACK_RULES)if(re.test(text||''))return id;
  return 'pending';
}
function packById(id){return PACKS.find(p=>p.id===id)||PACKS[PACKS.length-1];}
function packLine(type,units,cases){
  units=+units;cases=+cases;
  if(type==='case')return '1 Case of '+units+' Units Each';
  if(cases>0)return cases+' Case'+(cases===1?'':'s')+' of '+units+' Units Each';
  return '1 Carton of '+units+' Units';
}
function packOptions(sel){return PACKS.map(p=>'<option value="'+p.id+'"'+(p.id===sel?' selected':'')+'>'+p.label+'</option>').join('');}

const CW=1200,CH=600,CMW=9;
function renderCarton(canvas,o){
  const cb=!!o.cb;
  const ctx=canvas.getContext('2d');canvas.width=CW;canvas.height=CH;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,CW,CH);ctx.fillStyle='#000';
  ctx.textAlign='center';ctx.textBaseline='middle';
  // the colour block eats into the content width rather than widening the canvas,
  // so the 4 x 2 in sheet fit (and the barcode magnification) is unchanged
  const contentW=cb?C_CONTENT:CW, cxc=contentW/2;
  const maxW=contentW-140,digits=!!o.digits;
  if(cb)drawPanel(ctx,CPX,CPTOP,CPW,CPBOT-CPTOP,o.cb.color,(o.cb.variant||'').toUpperCase());
  // text block: company, collection, product, packaging, SKU, one uniform size like the template
  let lines=[o.company,o.collection,o.name,o.pack,o.sku].filter(Boolean);
  let s=Math.min(...lines.map(t=>fitFont(ctx,t,maxW,58,22)));
  if(s<40&&o.name.includes(' ')){
    const {l1,l2}=splitTwo(ctx,o.name);
    const alt=[o.company,o.collection,l1,l2,o.pack,o.sku].filter(Boolean);
    const s2=Math.min(...alt.map(t=>fitFont(ctx,t,maxW,58,22)));
    if(s2>s){lines=alt;s=s2;}
  }
  const textTop=14,textBottom=318,lh=Math.min(s*1.12,(textBottom-textTop)/lines.length);
  s=Math.min(s,Math.floor(lh/1.12));
  ctx.font='bold '+s+'px '+DISPLAY_FONT;
  let y=textTop+((textBottom-textTop)-lh*lines.length)/2;
  for(const t of lines){ctx.fillText(t,cxc,y+lh/2);y+=lh;}
  // UPC-A bars, full width under the text (about 0.03 in per module at 4 x 2 in)
  if(!useUPCALayout(o.code)){
    drawCode128(ctx,o.code,(contentW-(contentW-140))/2,contentW-140,332,digits?542:578,CMW);
    if(digits){ctx.font='bold 34px '+DISPLAY_FONT;ctx.fillText(o.code,cxc,568);}
    return;
  }
  const bits=upcaModules(o.code),bx=Math.round((contentW-95*CMW)/2),top=332;
  const dataB=digits?548:578,guardB=digits?572:578;
  for(let i=0;i<bits.length;i++){if(bits[i]==='1')ctx.fillRect(bx+i*CMW,top,CMW,(GUARD.has(i)?guardB:dataB)-top);}
  if(digits){
    ctx.font='bold 34px '+DISPLAY_FONT;const dcy=568;
    ctx.fillText(o.code[0],bx-5*CMW,dcy);
    ctx.fillText(o.code.slice(1,6),bx+((8+44)/2)*CMW,dcy);
    ctx.fillText(o.code.slice(6,11),bx+((50+91)/2)*CMW,dcy);
    ctx.fillText(o.code[11],bx+95*CMW+5*CMW,dcy);
  }
}

// p = settings prefix: 'sh' for case & carton sheets, 'ps' for product sheets
function sheetCfg(p='sh'){const v=id=>parseFloat(document.getElementById(p+'-'+id).value)||0;
  return {lw:v('lw'),lh:v('lh'),cols:Math.max(1,Math.round(v('cols'))),rows:Math.max(1,Math.round(v('rows'))),
    mt:v('mt'),ml:v('ml'),gx:v('gx'),gy:v('gy'),outline:document.getElementById(p+'-outline').value==='1'};}
function showDigits(){return document.getElementById('sh-digits').value==='1';}
function companyName(){return document.getElementById('sh-company').value.trim();}
function printCfg(per,p='sh'){
  const q=p==='ps'?'pp':'pr';
  const cp=parseInt(document.getElementById(q+'-copies').value,10),st=parseInt(document.getElementById(q+'-start').value,10);
  return {copies:cp>0?cp:0,start:Math.min(Math.max(st>0?st:1,1),per)};
}
// pages: [{data, alias, w, h}] where w/h are the image's pixel size (defaults to the carton canvas)
// one placement list drives both the PDF and the on-screen preview
function safeMargin(p){const v=parseFloat(document.getElementById(p+'-safe').value);return v>=0?Math.min(v,0.4):0;}
function layoutSheet(pages,p='sh'){
  const pad=safeMargin(p),c=sheetCfg(p),per=c.cols*c.rows,pr=printCfg(per,p),out=[[]];
  let slot=pr.start-1;
  pages.forEach((pg,pi)=>{
    if(!pr.copies&&pi){out.push([]);slot=0;}
    const n=pr.copies||per-slot;
    for(let k=0;k<n;k++){
      if(slot>=per){out.push([]);slot=0;}
      const r=Math.floor(slot/c.cols),col=slot%c.cols;
      const x=c.ml+col*(c.lw+c.gx),y=c.mt+r*(c.lh+c.gy);
      const iw=pg.w||CW,ih=pg.h||CH,bw=c.lw-2*pad,bh=c.lh-2*pad,kk=Math.min(bw/iw,bh/ih),w=iw*kk,h=ih*kk;
      out[out.length-1].push({pg,x:x+(c.lw-w)/2,y:y+(c.lh-h)/2,w,h,cell:{x,y,w:c.lw,h:c.lh}});
      slot++;
    }
  });
  return {cfg:c,sheets:out};
}
function buildSheetPDF(pages,p='sh'){
  if(!window.jspdf){alert('PDF library did not load (offline?). Use the PNG download instead.');return null;}
  if(!checkSheet(p)&&!confirm('Sheet layout does not fit a Letter page. Continue anyway?'))return null;
  const L=layoutSheet(pages,p),doc=new window.jspdf.jsPDF({unit:'in',format:'letter'});
  L.sheets.forEach((items,si)=>{
    if(si)doc.addPage();
    items.forEach(it=>{
      doc.addImage(it.pg.data,'PNG',it.x,it.y,it.w,it.h,it.pg.alias,'FAST');
      if(L.cfg.outline){doc.setDrawColor(190);doc.setLineWidth(0.005);doc.roundedRect(it.cell.x,it.cell.y,it.cell.w,it.cell.h,0.1,0.1);}
    });
  });
  doc._nfLayout=L;
  return doc;
}
// crop white margins so a product label fills a small sticker
function trimBounds(cv,padPx=10){
  const ctx=cv.getContext('2d'),{width:W0,height:H0}=cv,d=ctx.getImageData(0,0,W0,H0).data;
  let x0=W0,y0=H0,x1=-1,y1=-1;
  for(let y=0;y<H0;y++)for(let x=0;x<W0;x++){const i=(y*W0+x)*4;if(d[i]<200||d[i+1]<200||d[i+2]<200){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<0)return {x:0,y:0,w:W0,h:H0};
  x0=Math.max(0,x0-padPx);y0=Math.max(0,y0-padPx);x1=Math.min(W0-1,x1+padPx);y1=Math.min(H0-1,y1+padPx);
  return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}
function trimCanvas(cv,padPx=10){
  const b=trimBounds(cv,padPx);
  const out=document.createElement('canvas');out.width=b.w;out.height=b.h;
  const o=out.getContext('2d');o.fillStyle='#fff';o.fillRect(0,0,b.w,b.h);
  o.drawImage(cv,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
  return {data:out.toDataURL('image/png'),w:b.w,h:b.h};
}
// ---- on-screen preview = the actual sticker, not the working canvas ----
// the working canvas is a fixed drawing surface with slack around the art, so it misreads
// as the label's shape. this paints the real label cell at its real aspect and drops the
// art in using the same fit maths as layoutSheet, so the preview is what comes off the sheet.
function renderPreview(dest,art,trim,maxW){
  const b=trim?trimBounds(art):{x:0,y:0,w:art.width,h:art.height};
  const k=Math.min(1,(maxW||1100)/b.w);
  dest.width=Math.max(1,Math.round(b.w*k));dest.height=Math.max(1,Math.round(b.h*k));
  const x=dest.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,dest.width,dest.height);
  x.drawImage(art,b.x,b.y,b.w,b.h,0,0,dest.width,dest.height);
}
// the art rarely fills its sticker, so state the real printed size in words
function printedSize(art,p,trim){
  const c=sheetCfg(p),pad=safeMargin(p);
  if(!(c.lw>0&&c.lh>0))return '';
  const b=trim?trimBounds(art):{w:art.width,h:art.height};
  const k=Math.min((c.lw-2*pad)/b.w,(c.lh-2*pad)/b.h);
  return 'Prints '+(b.w*k).toFixed(2)+' x '+(b.h*k).toFixed(2)+' in, centred on a '+c.lw+' x '+c.lh+' in label';
}
function setScale(id,art,p,trim){const el=document.getElementById(id);if(el)el.textContent=art?printedSize(art,p,trim):'';}
// ---- PDF preview (view in the page, download from there if it looks right) ----
let pdfDoc=null,pdfName='';
function loadImg(src){return new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;});}
async function showPDF(doc,name){
  if(!doc)return;pdfDoc=doc;pdfName=name;
  const L=doc._nfLayout,box=document.getElementById('pdfview-pages'),DPI=150;
  const n=L.sheets.length,cells=L.sheets.reduce((a,x)=>a+x.length,0);
  document.getElementById('pdfview-name').innerHTML=escapeHtml(name)+'<small>'+n+' page'+(n===1?'':'s')+', '+cells+' label'+(cells===1?'':'s')+'. Exact layout of the PDF on a Letter page. Dashed lines show label edges and are not printed. Print at Actual size (100%).</small>';
  box.innerHTML='';document.getElementById('pdfview').classList.add('open');
  const cache={};
  for(let si=0;si<n;si++){
    const cv=document.createElement('canvas');cv.width=8.5*DPI;cv.height=11*DPI;
    const ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
    for(const it of L.sheets[si]){
      const img=cache[it.pg.alias]||(cache[it.pg.alias]=await loadImg(it.pg.data));
      if(img)ctx.drawImage(img,it.x*DPI,it.y*DPI,it.w*DPI,it.h*DPI);
      ctx.save();ctx.strokeStyle=L.cfg.outline?'#bdbdbd':'#9fb6d6';ctx.lineWidth=1;if(!L.cfg.outline)ctx.setLineDash([6,5]);
      ctx.strokeRect(it.cell.x*DPI+.5,it.cell.y*DPI+.5,it.cell.w*DPI-1,it.cell.h*DPI-1);ctx.restore();
    }
    const fig=document.createElement('figure');fig.appendChild(cv);
    const cap=document.createElement('figcaption');cap.textContent='Page '+(si+1)+' of '+n;fig.appendChild(cap);box.appendChild(fig);
  }
}
function closePDF(){document.getElementById('pdfview').classList.remove('open');document.getElementById('pdfview-pages').innerHTML='';}
function outPDF(doc,name,preview){if(!doc)return;if(preview)showPDF(doc,name);else savePDF(doc,name);}
function labelFile(type,name,sku){return (type==='case'?'Case':'Carton')+' - '+sanitize(name)+' - '+sanitize(sku);}

// single
const cEl=id=>document.getElementById(id);
const cName=cEl('c-name'),cCol=cEl('c-col'),cSku=cEl('c-sku'),cUpc=cEl('c-upc'),cPack=cEl('c-pack'),
      cUnits=cEl('c-units'),cCases=cEl('c-cases'),cType=cEl('c-type'),cStatus=cEl('c-status'),
      cCanvas=cEl('c-canvas'),cPdf=cEl('c-pdf'),cPng=cEl('c-png');
const cArt=document.createElement('canvas');
let cPackTouched=false,cCur=null;
cPack.innerHTML=packOptions('mpin');
function applyPack(id){const p=packById(id);cPack.value=p.id;if(p.id!=='custom'){cUnits.value=p.units;cCases.value=p.cases;}}
function singleGuess(){const c=cCol.value.trim();return guessPack(cName.value+' '+c,TAB_PACK[c]?c:'');}
function cTypeVal(){return cType.querySelector('.on').dataset.v;}
function updateCarton(){
  const cases=+cCases.value||0,caseBtn=cType.querySelector('[data-v=case]');
  caseBtn.disabled=cases===0;
  if(cases===0&&cTypeVal()==='case'){caseBtn.classList.remove('on');cType.querySelector('[data-v=carton]').classList.add('on');}
  const nu=normalizeUPC(cUpc.value),units=+cUnits.value,type=cTypeVal();
  let err=null;
  if(!nu.valid)err='UPC: '+nu.note;else if(!units)err=cPack.value==='pending'?'Packaging not confirmed yet. Type quantities once confirmed.':'Enter units per case';else if(!cName.value.trim())err='Enter a product name';
  const ctx=cCanvas.getContext('2d');
  if(err){cStatus.className='status bad';cStatus.textContent=err;cCur=null;cPdf.disabled=cPng.disabled=cEl('c-preview').disabled=true;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,cCanvas.width,cCanvas.height);setScale('c-scale',null);return;}
  cCur={digits:showDigits(),company:companyName(),collection:cCol.value.trim(),name:cName.value.trim(),sku:cSku.value.trim()||' ',
        code:nu.code,pack:packLine(type,units,cases),type,
        cb:cbOpt({variant:cEl('c-variant').value,color:cEl('c-hex').value})};
  renderCarton(cArt,cCur);renderPreview(cCanvas,cArt,false);setScale('c-scale',cArt,'sh',false);
  const c=sheetCfg();
  cStatus.className='status '+(nu.forced?'warn':'ok');const pr=printCfg(c.cols*c.rows);cStatus.textContent='UPC '+nu.note+'. '+(pr.copies?pr.copies+' label'+(pr.copies===1?'':'s'):'Full sheet ('+(c.cols*c.rows)+' labels)')+(pr.start>1?', starting at label #'+pr.start:'')+'.';
  cPdf.disabled=cPng.disabled=cEl('c-preview').disabled=false;
}
cName.addEventListener('input',()=>{if(!cPackTouched)applyPack(singleGuess());updateCarton();});
cCol.addEventListener('input',()=>{if(!cPackTouched)applyPack(singleGuess());updateCarton();});
cPack.addEventListener('change',()=>{cPackTouched=true;applyPack(cPack.value);updateCarton();});
[cSku,cUpc,cUnits,cCases,cEl('c-variant')].forEach(el=>el.addEventListener('input',()=>{if(el===cUnits||el===cCases){cPackTouched=true;cPack.value='custom';}updateCarton();}));
bindHexPair(cEl('c-color'),cEl('c-hex'),cEl('c-hex-status'),updateCarton);
cType.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;cType.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');updateCarton();}));
document.querySelectorAll('#carton-shared details input,#carton-shared details select').forEach(el=>['input','change'].forEach(ev=>el.addEventListener(ev,()=>{updateCarton();if(cbRows.length)renderCartonBatch();})));
cPng.addEventListener('click',async()=>{if(!cCur)return;downloadBlob(await canvasToBlob(cArt),labelFile(cCur.type,cCur.name,cCur.sku)+'.png');});
function cartonSinglePDF(preview){if(!cCur)return;outPDF(buildSheetPDF([{data:cArt.toDataURL('image/png'),alias:'one'}]),labelFile(cCur.type,cCur.name,cCur.sku)+'.pdf',preview);}
cPdf.addEventListener('click',()=>cartonSinglePDF(false));
cEl('c-preview').addEventListener('click',()=>cartonSinglePDF(true));
applyPack(singleGuess());

// batch
const cbInput=cEl('cb-input'),cbParse=cEl('cb-parse'),cbPdf=cEl('cb-pdf'),cbResults=cEl('cb-results'),cbSummary=cEl('cb-summary');
let cbRows=[];
function parseCartonLine(line){
  const r=parseLine(line);
  let parts=line.includes('\t')?line.split('\t'):line.split(',');
  parts=parts.map(p=>p.trim()).filter(p=>p.length&&p!==r.name&&p!==r.sku&&p!==r.upc);
  const col=parts.find(p=>/[A-Za-z]/.test(p)&&!isMeta(p)&&!SKU_RE.test(p))||'';
  const tab=findTab(line);
  const nu=normalizeUPC(r.upc),pk=packById(guessPack(r.name+' '+col,tab));
  if(!r.upc&&VALIDATE_UPC){const short=line.split(/[\t,]/).map(x=>x.trim()).find(x=>/^\d{8,9}$/.test(x));if(short)nu.note=short.length+'-digit code ('+short+') is not a UPC-A. Get the 12-digit UPC';else nu.note='no UPC in this row';}
  return {...r,col,tab,code:nu.code,valid:nu.valid,note:nu.note,pack:pk.id,units:pk.units,cases:pk.cases,doCarton:true,doCase:pk.cases>0};
}
function rowOk(r){return r.valid&&+r.units>0&&r.name;}
function rowLabel(r,type){return {digits:showDigits(),company:companyName(),collection:r.col,
  name:cbTitle(r.name,r.base),sku:r.sku||' ',code:r.code,pack:packLine(type,r.units,r.cases),type,cb:cbOpt(r)};}
cbParse.addEventListener('click',()=>{
  cbRows=cbInput.value.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim()).map(parseCartonLine);
  renderCartonBatch();
});
function renderCartonBatch(){
  if(!cbRows.length){cbSummary.textContent='Nothing parsed. Check your list.';cbResults.innerHTML='';cbPdf.disabled=true;return;}
  let html='<table><thead><tr><th>Preview</th><th>Product / SKU</th>'+(COLORBLOCK?'<th>Variant / colour</th>':'')+'<th>Packaging</th><th>Units</th><th>Cases</th><th>Labels</th></tr></thead><tbody>';
  const cbConf=findConflicts(cbRows);
  cbRows.forEach((r,i)=>{
    html+='<tr><td class="thumb">'+(rowOk(r)?'<canvas id="cbc-'+i+'"></canvas>':'<span class="pill bad">'+escapeHtml(r.valid?(r.pack==='pending'?'awaiting packaging':'needs units'):r.note)+'</span>')+'</td>'
      +'<td><div>'+escapeHtml(r.name||'(no name)')+'</div><div style="color:var(--muted)">'+escapeHtml((r.col?r.col+' · ':'')+(r.sku||'(no SKU)')+(r.tab?' · '+r.tab:''))+'</div>'+(r.valid&&!isUPCA(r.code)?'<span class="pill warn">'+r.code+codeTag(r.code)+'</span>':'')+conflictPill(cbConf[i])+'</td>'
      +(COLORBLOCK?cbCell(r,i):'')
      +'<td><select data-i="'+i+'" data-k="pack">'+packOptions(r.pack)+'</select></td>'
      +'<td class="qty"><input type="number" min="1" data-i="'+i+'" data-k="units" value="'+r.units+'"></td>'
      +'<td class="qty"><input type="number" min="0" data-i="'+i+'" data-k="cases" value="'+r.cases+'"></td>'
      +'<td class="chk"><label><input type="checkbox" data-i="'+i+'" data-k="doCarton"'+(r.doCarton?' checked':'')+'>Carton</label>'
      +'<label><input type="checkbox" data-i="'+i+'" data-k="doCase"'+(r.doCase&&+r.cases>0?' checked':'')+(+r.cases>0?'':' disabled')+'>Case</label></td></tr>';
  });
  cbResults.innerHTML=html+'</tbody></table>';
  const cbArt=document.createElement('canvas');
  const paintCbRow=i=>{const c=cEl('cbc-'+i),r=cbRows[i];if(!c||!rowOk(r))return;
    renderCarton(cbArt,rowLabel(r,'carton'));renderPreview(c,cbArt,false,900);};
  cbRows.forEach((r,i)=>{if(rowOk(r))paintCbRow(i);});
  wireCbCells(cbResults,cbRows,paintCbRow);
  const pages=cbPages();
  cbSummary.textContent=pages+' label'+(pages===1?'':'s')+' ready from '+cbRows.filter(rowOk).length+' of '+cbRows.length+' items.'+conflictNote(cbConf);
  cbPdf.disabled=pages===0;cEl('cb-preview').disabled=pages===0;
  cbResults.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('change',()=>{
    const r=cbRows[+el.dataset.i],k=el.dataset.k;
    if(k==='variant'||k==='color'||k==='hex')return;
    if(k==='pack'){const p=packById(el.value);r.pack=p.id;if(p.id!=='custom'){r.units=p.units;r.cases=p.cases;r.doCase=p.cases>0;}}
    else if(k==='doCarton'||k==='doCase')r[k]=el.checked;
    else{r[k]=el.value;r.pack='custom';if(k==='cases'&&!(+el.value>0))r.doCase=false;}
    renderCartonBatch();
  }));
}
function cbPages(){return cbRows.filter(rowOk).reduce((a,r)=>a+(r.doCarton?1:0)+(r.doCase&&+r.cases>0?1:0),0);}
function cartonBatchPDF(preview){
  const cv=document.createElement('canvas'),pages=[];let n=0;
  cbRows.filter(rowOk).forEach(r=>{
    const types=[];if(r.doCarton)types.push('carton');if(r.doCase&&+r.cases>0)types.push('case');
    types.forEach(t=>{renderCarton(cv,rowLabel(r,t));pages.push({data:cv.toDataURL('image/png'),alias:'p'+(n++)});});
  });
  if(!pages.length)return;
  outPDF(buildSheetPDF(pages),'case_carton_labels.pdf',preview);
}
cbPdf.addEventListener('click',()=>cartonBatchPDF(false));
cEl('cb-preview').addEventListener('click',()=>cartonBatchPDF(true));



// sheet layout: reset + fit check
const SHEET_DEFAULT={'sh-lw':4,'sh-lh':2,'sh-cols':2,'sh-rows':5,'sh-mt':0.5,'sh-ml':0.16,'sh-gx':0.19,'sh-gy':0,'sh-safe':0.06};
function checkSheet(p='sh'){
  const c=sheetCfg(p),st=document.getElementById(p+'-status');
  const w=c.ml+c.cols*c.lw+(c.cols-1)*c.gx,h=c.mt+c.rows*c.lh+(c.rows-1)*c.gy;
  if(w>8.5+0.01||h>11+0.01){st.className='status bad';st.textContent='This layout is '+w.toFixed(2)+' x '+h.toFixed(2)+' in, bigger than a Letter page (8.5 x 11 in). Labels past the edge will be cut off. All values are in inches.';return false;}
  st.className='status ok';st.textContent=(c.cols*c.rows)+' labels per page, using '+w.toFixed(2)+' x '+h.toFixed(2)+' in of the 8.5 x 11 in page.';return true;
}
document.getElementById('sh-reset').addEventListener('click',()=>{
  Object.entries(SHEET_DEFAULT).forEach(([id,v])=>document.getElementById(id).value=v);
  checkSheet();updateCarton();if(cbRows.length)renderCartonBatch();
});
document.querySelectorAll('#carton-shared details input').forEach(el=>el.addEventListener('input',()=>checkSheet('sh')));
checkSheet();
const PSHEET_DEFAULT={'ps-lw':2.625,'ps-lh':1,'ps-cols':3,'ps-rows':10,'ps-mt':0.5,'ps-ml':0.1875,'ps-gx':0.125,'ps-gy':0,'ps-safe':0.08};
document.getElementById('ps-reset').addEventListener('click',()=>{
  Object.entries(PSHEET_DEFAULT).forEach(([id,v])=>document.getElementById(id).value=v);checkSheet('ps');setTimeout(saveSettings,0);
});
document.querySelectorAll('#product-shared details input,#product-shared details select').forEach(el=>['input','change'].forEach(ev=>el.addEventListener(ev,()=>{
  checkSheet('ps');updateSingle();if(bRows.length)renderBatch();})));
checkSheet('ps');
// packaging reference table
document.querySelector('#pack-ref tbody').innerHTML=PACKS.filter(p=>p.id!=='custom').map(p=>
  '<tr><td>'+p.label+'</td><td>'+(p.cases>0?p.units+' per case':'No case')+'</td><td>'
  +(p.cases>0?p.cases+' cases ('+(p.units*p.cases)+' units)':p.units+' units')+'</td><td>'
  +(p.cases>0?packLine('case',p.units,p.cases):'<span style="color:var(--muted)">n/a</span>')+'</td><td>'
  +packLine('carton',p.units,p.cases)+'</td></tr>').join('');


// ---- UPC validity toggle wiring ----
const vBoxes=[...document.querySelectorAll('.upc-validate')];
vBoxes.forEach(vBox=>vBox.addEventListener('change',()=>{
  VALIDATE_UPC=vBox.checked;
  vBoxes.forEach(b=>{b.checked=VALIDATE_UPC;const w=b.closest('.vtoggle');w.classList.toggle('off',!VALIDATE_UPC);
    w.querySelector('.vtoggle-note').textContent=VALIDATE_UPC?'On. Only valid UPC-A codes print.'
      :'Off. Failing 12-digit codes keep the UPC-A design but will not scan. Other lengths print as Code 128.';});
  updateSingle();updateCarton();
  if(bRows.length)bParse.click();
  if(cbRows.length){const keep=cbRows.map(r=>({pack:r.pack,units:r.units,cases:r.cases,doCarton:r.doCarton,doCase:r.doCase}));
    cbRows=cbInput.value.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim()).map(parseCartonLine).map((r,i)=>keep[i]?{...r,...keep[i]}:r);
    renderCartonBatch();}
}));


// ---- colour block toggle ----
const cbBox=document.getElementById('cb-on'),cbBar=document.getElementById('cb-bar'),cbNote=document.getElementById('cb-note');
// first time it is switched on, pull the variant out of whatever is already typed
function seedVariant(nameEl,variantEl){
  if(variantEl.value.trim())return;
  const sv=splitVariant(nameEl.value);
  if(sv.variant){nameEl.value=sv.base;variantEl.value=sv.variant;}
}
function applyColorBlock(){
  document.querySelectorAll('.cbfields').forEach(el=>el.classList.toggle('on',COLORBLOCK));
  cbBar.classList.toggle('on',COLORBLOCK);
  cbNote.textContent=COLORBLOCK
    ?'On. Base name on top, variant in the colour block on the right.'
    :'Off. Labels print the current single-name format.';
  document.getElementById('s-name-lbl').textContent=COLORBLOCK?'Base product name':'Product name';
  document.getElementById('c-name-lbl').textContent=COLORBLOCK?'Base product name':'Product name';
  updateSingle();updateCarton();
  if(bRows.length)renderBatch();
  if(cbRows.length)renderCartonBatch();
}
cbBox.addEventListener('change',()=>{
  COLORBLOCK=cbBox.checked;
  if(COLORBLOCK){
    seedVariant(sName,sVariant);
    seedVariant(cName,cEl('c-variant'));
  }
  applyColorBlock();
});

// ---- remember layout settings in this browser ----
const SAVE_IDS=['sh-lw','sh-lh','sh-cols','sh-rows','sh-mt','sh-ml','sh-gx','sh-gy','sh-company','sh-outline','sh-digits','ps-lw','ps-lh','ps-cols','ps-rows','ps-mt','ps-ml','ps-gx','ps-gy','ps-outline','sh-safe','ps-safe'];
const SAVE_KEY='nfb-settings-v1';
function saveSettings(){try{const o={};SAVE_IDS.forEach(id=>o[id]=document.getElementById(id).value);localStorage.setItem(SAVE_KEY,JSON.stringify(o));}catch(e){}}
function loadSettings(){try{const o=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(!o)return;SAVE_IDS.forEach(id=>{if(o[id]!=null)document.getElementById(id).value=o[id];});}catch(e){}}
loadSettings();
SAVE_IDS.forEach(id=>['input','change'].forEach(ev=>document.getElementById(id).addEventListener(ev,saveSettings)));
document.getElementById('sh-reset').addEventListener('click',()=>setTimeout(saveSettings,0));
checkSheet();checkSheet('ps');
// preview modal controls
document.getElementById('pdfview-close').addEventListener('click',closePDF);
document.getElementById('pdfview-dl').addEventListener('click',()=>{if(pdfDoc)savePDF(pdfDoc,pdfName);});
document.getElementById('pdfview').addEventListener('click',e=>{if(e.target.id==='pdfview')closePDF();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('pdfview').classList.contains('open'))closePDF();});
// ---- click a batch preview to zoom ----
const zoomEl=document.getElementById('zoom'),zoomImg=document.getElementById('zoom-img'),zoomCap=document.getElementById('zoom-cap');
function openZoom(canvas){
  const row=canvas.closest('tr'),info=row?row.children[1]:null;
  zoomImg.src=canvas.toDataURL('image/png');
  zoomCap.innerHTML=info?info.innerHTML.replace(/<div[^>]*>/g,'<div>')+'<span>Click anywhere or press Esc to close</span>':'';
  zoomEl.classList.add('open');
}
function closeZoom(){zoomEl.classList.remove('open');zoomImg.removeAttribute('src');}
['b-results','cb-results'].forEach(id=>document.getElementById(id).addEventListener('click',e=>{
  const c=e.target.closest('td.thumb canvas');if(c)openZoom(c);
}));
zoomEl.addEventListener('click',closeZoom);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&zoomEl.classList.contains('open'))closeZoom();});

// boot: paint immediately, then repaint once fonts are settled so metrics are exact
applyColorBlock();
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(()=>{applyColorBlock();});}
