(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NovaiCostImport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const key=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const skuKey=v=>String(v??'').trim().toLocaleUpperCase('pt-BR');
 function parseCost(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0&&value<=1000000?Math.round(value*100)/100:null;
  let s=String(value??'').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if(!s||!/^\+?\d[\d.,]*$/.test(s))return null;
  s=s.replace(/^\+/,'');
  if(s.includes(',')&&s.includes('.')){
   if(s.lastIndexOf(',')>s.lastIndexOf('.')){if(!/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s))return null;s=s.replace(/\./g,'').replace(',','.');}
   else{if(!/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(s))return null;s=s.replace(/,/g,'');}
  }else if(s.includes(',')){if(!/^\d+,\d{1,2}$/.test(s))return null;s=s.replace(',','.');}
  else if(s.includes('.')){if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');else if(!/^\d+\.\d{1,2}$/.test(s))return null;}
  const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=1000000?Math.round(n*100)/100:null;
 }
 function csvRows(text){
  text=String(text).replace(/^\uFEFF/,'');
  let quoted=false,counts={';':0,',':0,'\t':0};
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}if(!quoted){if(c==='\n'||c==='\r')break;if(c in counts)counts[c]++;}}
  const delim=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  let rows=[],row=[],value='',inQuote=false,afterQuote=false;
  const cell=()=>{row.push(value);value='';afterQuote=false;};
  const line=()=>{cell();rows.push(row);row=[];if(rows.length>5021)throw Error('Use uma planilha com até 5.000 produtos.');};
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(inQuote){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{inQuote=false;afterQuote=true;}}else value+=c;continue;}
   if(c==='"'){if(value.trim())throw Error('Confira as aspas do arquivo CSV.');inQuote=true;continue;}
   if(c===delim){cell();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue;}
   if(afterQuote&&c.trim())throw Error('Confira as colunas do arquivo CSV.');value+=c;
  }
  if(inQuote)throw Error('Confira as aspas do arquivo CSV.');if(value||row.length)line();return rows;
 }
 function analyze(rows,products,{overwrite=true}={}){
  if(!Array.isArray(rows)||rows.length>5021)throw Error('Use uma planilha com até 5.000 produtos.');
  let header=-1,skuCol=-1,costCol=-1;
  for(let i=0;i<Math.min(rows.length,20);i++){
   const normalized=(rows[i]||[]).map(key),skus=normalized.map((v,j)=>['sku','codigosku'].includes(v)?j:-1).filter(j=>j>=0),costs=normalized.map((v,j)=>['custo','custounitario','custodoproduto','custounitariodoproduto'].includes(v)?j:-1).filter(j=>j>=0);
   if(skus.length===1&&costs.length===1){header=i;skuCol=skus[0];costCol=costs[0];break;}
  }
  if(header<0)throw Error('A planilha precisa das colunas SKU e Custo.');
  const source=rows.slice(header+1).map((r,i)=>({row:i+header+2,sku:r[skuCol],cost:r[costCol]})).filter(r=>String(r.sku??'').trim()||String(r.cost??'').trim());
  if(source.length>5000)throw Error('Use uma planilha com até 5.000 produtos.');
  const counts=new Map(),catalog=new Map();source.forEach(r=>counts.set(skuKey(r.sku),(counts.get(skuKey(r.sku))||0)+1));
  products.forEach(p=>{const k=skuKey(p.sku);catalog.set(k,[...(catalog.get(k)||[]),p]);});
  const result=source.map(r=>{
   const candidates=catalog.get(skuKey(r.sku))||[],p=candidates[0],cost=parseCost(r.cost);
   let reason='Pronto para importar',valid=true;
   if(typeof r.sku!=='string'||!r.sku.trim()){reason=typeof r.sku==='number'?'SKU deve estar como texto':'SKU ausente';valid=false;}
   else if(counts.get(skuKey(r.sku))>1){reason='SKU repetido na planilha';valid=false;}
   else if(candidates.length!==1){reason=candidates.length?'SKU ambíguo no cadastro':'SKU não cadastrado';valid=false;}
   else if(cost==null){reason=String(r.cost??'').trim()?'Custo inválido':'Custo ausente';valid=false;}
   else if(!overwrite&&p.cost!=null){reason='Já possui custo';valid=false;}
   else if(p.cost===cost){reason='Sem alteração';valid=false;}
   return {row:r.row,sku:String(r.sku??''),id:p?.id,name:p?.name||'',before:p?.cost??null,cost,valid,reason};
  });
  return {rows:result,valid:result.filter(r=>r.valid).length,ignored:result.filter(r=>!r.valid).length,total:result.length};
 }
 return Object.freeze({parseCost,csvRows,analyze});
});
