/* Real account adapter. Monthly aggregates contain no buyer data; no demo generators. */
(() => {
'use strict';
const round=n=>Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:null;
const utc=s=>new Date(s+'T12:00:00Z'),shift=(s,n)=>new Date(utc(s).getTime()+n*86400000).toISOString().slice(0,10),daysBetween=(a,b)=>Math.round((utc(b)-utc(a))/86400000)+1;
const sum=a=>a.some(v=>v==null||!Number.isFinite(v))?null:round(a.reduce((n,v)=>n+v,0)),subtract=(a,b)=>a==null||b==null?null:round(a-b);
let maxDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),minDay=maxDay;
let epoch=0;
let bootstrap={products:[],data:{},version:0,progress:null,connected:false},lastError=null;
const catalogPrices=new Map(),catalogPending=new Set();
const monthCache=new Map(),pending=new Map(),failed=new Map(),visits=new Map(),visitItems=new Set(),visitPending=new Set();
const fields='orders units cancelledOrders gross cancelled refunded net fees tax shipping ads adRevenue adUnits clicks impressions cost result adResult fullUnits warehouseUnits visits'.split(' '),adKeys=['ads','adRevenue','adUnits','clicks','impressions'];
const blank=()=>Object.fromEntries(fields.map(k=>[k,0]));
const margin=p=>p.result==null||!p.net?null:p.result/p.net*100;
const defaultCosts=()=>({...bootstrap.data.costs}),defaultExpenses=()=>structuredClone(bootstrap.data.expenses||[]),manualExpenseCount=rows=>rows.length;
const inventoryPolicy=Object.freeze({urgentDays:3,attentionDays:7}),stockCoverageDays=(q,u,d)=>Number.isFinite(q)&&Number.isFinite(u)&&u>0?Math.ceil(q/(u/d)):null;
const changed=()=>window.dispatchEvent(new Event('novai-data'));
let queue=Promise.resolve();
function complete(day,kind){
 const p=bootstrap.progress,j=p?.jobs?.find(j=>j.kind===kind&&j.month.slice(0,7)===day.slice(0,7));
 return !!(j?.collected&&(!j.error||j.error==='no_ads_account')&&(!j.coverageFrom||day>=j.coverageFrom)&&p.registeredOn&&day>=p.registeredOn);
}
function fetchMonth(month){
 if(monthCache.has(month)||pending.has(month)||!bootstrap.connected||Date.now()-(failed.get(month)||0)<30000)return;
 const jobs=bootstrap.progress?.jobs||[];
 if(!jobs.some(j=>j.month.slice(0,7)===month))return;
 const request=queue.then(async()=>{
   try{const requestEpoch=epoch;const data=await api('/month?start='+month+'-01');if(requestEpoch===epoch)monthCache.set(month,data);lastError=null;}
   catch(e){failed.set(month,Date.now());lastError=e;}
   finally{pending.delete(month);changed();}
 });queue=request.catch(()=>{});pending.set(month,request);
}
function ensure(start,end){
 if(start>end)return;
 for(let d=start.slice(0,7)+'-01';d<=end;){if(d<=maxDay)fetchMonth(d.slice(0,7));const t=utc(d);t.setUTCMonth(t.getUTCMonth()+1);d=t.toISOString().slice(0,10);}
}
function aggregate(start,end,costs=defaultCosts(),missing=false,settings={},onlyId=null){
 ensure(start,end);
 const ids=onlyId==null?null:new Set(Array.isArray(onlyId)?onlyId:[onlyId]);
 const products=bootstrap.products.filter(p=>!ids||ids.has(p.id)).map(p=>({...p,...blank(),competitorPrice:catalogPrices.get(p.id)??null,unitCost:costs[p.id]??null,taxRate:settings[p.id]?.taxRate??null,manageStock:settings[p.id]?.manageStock===true}));
 const by=new Map(products.map(p=>[p.id,p])),daily=new Map(),orderIds=new Set(),cancelIds=new Set(),campaignMap=new Map();
 let ordersComplete=true,adsComplete=true,loaded=true,anyOrders=false,anyAds=false;
 const events=[];
 for(let day=start;day<=end;day=shift(day,1)){
   const m=monthCache.get(day.slice(0,7)),oc=!!m&&complete(day,'orders'),ac=!!m&&complete(day,'ads');
   ordersComplete&&=oc;adsComplete&&=ac;loaded&&=!!m;
   daily.set(day,{day,...blank(),orderIds:new Set(),cancelIds:new Set(),oc,ac});
 }
 const add=(target,source,keys)=>{for(const k of keys)target[k]=sum([target[k],source[k]]);};
 const orderKeys=fields.filter(k=>!adKeys.includes(k)&&!['result','adResult','visits'].includes(k));
 for(const m of monthCache.values()){
  for(const row of m.records||[]){
   const p=by.get(row.id),d=daily.get(row.day);if(!p||!d)continue;anyOrders=true;p.hasOrders=true;
   const r={...row,cost:row.units===0?0:p.unitCost==null?null:round(p.unitCost*row.units),tax:row.net===0?0:p.taxRate==null||row.net==null?null:round(row.net*p.taxRate/100)};
   add(p,r,orderKeys);add(d,r,orderKeys);
   for(const id of row.orderIds){orderIds.add(id);d.orderIds.add(id);}for(const id of row.cancelIds){cancelIds.add(id);d.cancelIds.add(id);}
   if(row.units>0)p.lastSale=!p.lastSale||row.day>p.lastSale?row.day:p.lastSale;
  }
  for(const row of m.adRecords||[]){
   const p=by.get(row.id),d=daily.get(row.day);if(!p||!d)continue;anyAds=true;p.hasAds=true;d.hasAds=true;
   add(p,row,adKeys);add(d,row,adKeys);
   if(!campaignMap.has(row.campaignId))campaignMap.set(row.campaignId,{id:row.campaignId,name:row.campaignName,...blank(),productIds:new Set(),allocations:new Map()});
   const c=campaignMap.get(row.campaignId);c.productIds.add(row.id);add(c,row,adKeys);const a=c.allocations.get(row.id)||{adRevenue:0,ads:0};a.adRevenue=sum([a.adRevenue,row.adRevenue]);a.ads=sum([a.ads,row.ads]);c.allocations.set(row.id,a);
  }
  events.push(...(m.events||[]).filter(e=>e.day>=start&&e.day<=end&&(!ids||ids.has(e.id))));
 }
 const finish=(p,oc,ac,hasAds)=>{
   if(!ac&&!hasAds)for(const k of adKeys)p[k]=null;
   const variable=sum([p.cost,p.fees,p.tax,p.shipping]);p.result=oc&&ac?subtract(p.net,sum([variable,p.ads])):null;
   p.adResult=p.result==null||p.adRevenue==null||!p.net&&p.adRevenue?null:round(p.adRevenue-(p.net?variable*p.adRevenue/p.net:0)-p.ads);
 };
 for(const p of products){
  finish(p,ordersComplete,adsComplete,p.hasAds);p.complete=ordersComplete;
  if(!ordersComplete){p.fullUnits=p.warehouseUnits=null;if(!p.hasOrders)for(const k of orderKeys)p[k]=null;}
  const setting=settings[p.id]||{},warehouse=setting.warehouseStock??(p.stock==null||p.full==null?null:p.stock-p.full);
  p.warehouse=warehouse;p.stock=sum([p.full,warehouse]);p.fullEnabled=p.full!=null&&p.full>0||p.fullUnits>0;p.warehouseEnabled=setting.manageStock===true||warehouse>0;
  p.fullCover=ordersComplete?stockCoverageDays(p.full,p.fullUnits,daysBetween(start,end)):null;p.warehouseCover=ordersComplete?stockCoverageDays(warehouse,p.warehouseUnits,daysBetween(start,end)):null;p.cover=ordersComplete?stockCoverageDays(p.stock,p.units,daysBetween(start,end)):null;
  p.visits=visitItems.has(p.id)?0:null;if(p.visits===0)for(let day=start;day<=end;day=shift(day,1))p.visits=sum([p.visits,visits.get(p.id+'|'+day)??null]);
  p.unitShipping=p.units&&p.shipping!=null?round(p.shipping/p.units):null;p.resultPerUnit=p.units&&p.result!=null?round(p.result/p.units):null;
 }
 const total=blank();for(const p of products)add(total,p,fields);
 total.orders=ordersComplete||anyOrders?orderIds.size:null;total.cancelledOrders=ordersComplete||anyOrders?cancelIds.size:null;
 if(!ordersComplete&&!anyOrders)for(const k of orderKeys)total[k]=null;
 if(!adsComplete&&!anyAds)for(const k of adKeys)total[k]=null;
 if(!ordersComplete||!adsComplete)total.result=total.adResult=null;
 for(const d of daily.values()){
  d.orders=d.oc||d.orderIds.size?d.orderIds.size:null;d.cancelledOrders=d.oc||d.cancelIds.size?d.cancelIds.size:null;
  if(!d.oc&&!d.orderIds.size&&!d.cancelIds.size)for(const k of orderKeys)d[k]=null;
  finish(d,d.oc,d.ac,d.hasAds);delete d.orderIds;delete d.cancelIds;d.visits=null;
 }
 const campaigns=[...campaignMap.values()].map(c=>{const results=[...c.allocations].map(([id,a])=>{const p=by.get(id),v=sum([p.cost,p.fees,p.tax,p.shipping]);return p.result==null||v==null||a.adRevenue==null||a.ads==null||!p.net&&a.adRevenue?null:round(a.adRevenue-(p.net?v*a.adRevenue/p.net:0)-a.ads);});return {...c,products:[...c.productIds].map(id=>by.get(id)),adResult:sum(results)};});
 return {...total,products,days:[...daily.values()],events,campaigns,complete:ordersComplete,adsComplete,loaded,incomplete:total.result==null,adsPartial:anyAds&&!adsComplete,lossAfterShipping:null};
}
const cancellationEvents=(a,b)=>aggregate(a,b).events,campaigns=total=>total.campaigns||[];
  function alerts(current,previous,days,comparable=true) {
    const list=[];
    const loss=current.products.filter(p=>p.units>0 && p.result!=null && p.result<0).sort((a,b)=>margin(a)-margin(b))[0];
    if (loss) list.push({type:'loss',id:loss.id,title:'Pior margem',value:margin(loss),priority:110});
    const missing=current.products.filter(p=>p.unitCost==null);
    if (missing.length) list.push({type:'cost',id:missing[0].id,title:'Custo pendente',count:missing.length,priority:100});
    if (comparable) for (const p of current.products) {
      const before=previous.products.find(x=>x.id===p.id);
      if (before?.orders>=10 && p.orders/before.orders<=.8) list.push({type:'decline',id:p.id,title:'Queda nas vendas',value:(p.orders/before.orders-1)*100,priority:80});
    }
    for(const location of ['full','warehouse']){
      const low=current.products.map(p=>({p,status:inventoryStatus(p,location)})).filter(x=>x.status.needsReorder).sort((a,b)=>(a.status.cover??Infinity)-(b.status.cover??Infinity))[0];
      if(low)list.push({type:'stock',location,id:low.p.id,title:low.status.label,value:low.status.cover,priority:low.status.tone==='bad'?95:70});
    }
    const inactive=(current.complete?current.products:[]).filter(p=>p.stock>0 && !p.units);
    if (inactive.length) list.push({type:'inactive',id:inactive[0].id,title:'Sem vendas no período',count:inactive.length,priority:50});
    return list.sort((a,b)=>b.priority-a.priority);
  }
  function expenseEntries(expenses,start,end) {
    const result=[];
    for (const e of expenses) {
      if (!e.recurring) {if (e.date>=start && e.date<=end) result.push({...e,occurrence:e.date});continue;}
      const dueDay=Number(e.date.slice(8));
      let month=start.slice(0,7)+'-01';
      while (month<=end) {
        const date=utc(month),lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12)).getUTCDate();
        const occurrence=month.slice(0,8)+String(Math.min(dueDay,lastDay)).padStart(2,'0');
        const offset=(date.getUTCFullYear()-Number(e.date.slice(0,4)))*12+date.getUTCMonth()-(Number(e.date.slice(5,7))-1);
        const within=!Number.isInteger(e.installments)||offset<e.installments;
        if (within&&occurrence>=e.date && occurrence>=start && occurrence<=end) result.push({...e,occurrence,...(Number.isInteger(e.installments)?{installment:offset+1}:{})});
        date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,10);
      }
    }
    return result.sort((a,b)=>b.occurrence.localeCompare(a.occurrence));
  }
  function quote({price,cost,commission=null,fixed=0,shipping=0,tax=null,pack=0,other=0}) {
    const values=[price,cost,commission,fixed,shipping,tax,pack,other];
    if (values.some(n=>!Number.isFinite(n)||n<0) || price<=0 || commission>100 || tax>100) return null;
    const fee=round(price*commission/100+fixed),taxValue=round(price*tax/100);
    const total=round(cost+fee+shipping+taxValue+pack+other),profit=round(price-total);
    return {price,cost,commission,fixed,shipping,tax,pack,other,fee,taxValue,total,profit,margin:profit/price*100};
  }
  function safeCover(item) {
    const candidates=[item?.secure_thumbnail,...(Array.isArray(item?.pictures)?item.pictures.map(p=>p?.secure_url):[]),item?.thumbnail,item?.coverUrl];
    for (const candidate of candidates) {
      if (typeof candidate!=='string') continue;
      try {const u=new URL(candidate);if (u.protocol==='http:')u.protocol='https:';
        if (u.protocol==='https:' && !u.username && !u.password && (u.hostname==='mlstatic.com' || u.hostname.endsWith('.mlstatic.com'))) return u.href;
      } catch {}
    }
    return null;
  }
  function costBreakdown(total) {
    const parts=[['cost','Produtos','#fee800'],['fees','Tarifas','#d2c568'],['shipping','Frete','#a9a279'],['tax','Impostos','#8c8c94'],['ads','Publicidade','#d8d8df']].map(([key,label,color])=>({key,label,color,value:total[key]}));
    const known=parts.filter(p=>p.value!=null&&Number.isFinite(p.value)&&p.value>0),sum=round(known.reduce((s,p)=>s+p.value,0));
    return {parts:known.map(p=>({...p,share:sum?p.value/sum*100:0})),total:sum,complete:parts.every(p=>p.value!=null&&Number.isFinite(p.value))};
  }
  function inventoryStatus(p,location){
    const full=location==='full',name=full?'Full':'Depósito',active=full?p.fullEnabled:p.warehouseEnabled;
    const quantity=full?p.full:p.warehouse,units=full?p.fullUnits:p.warehouseUnits,cover=full?p.fullCover:p.warehouseCover;
    if(active===false)return {location,name,quantity,cover:null,label:'Não utiliza '+name,tone:'',needsReorder:false};
    if(quantity===0&&active===true)return {location,name,quantity,cover:0,label:name+' esgotado',tone:'bad',needsReorder:true};
    if(!Number.isFinite(units))return {location,name,quantity,cover:null,label:'Giro indisponível',tone:'',needsReorder:false};
    if(units===0)return {location,name,quantity,cover:null,label:'Sem vendas no '+name,tone:'',needsReorder:false};
    if(!Number.isFinite(cover))return {location,name,quantity,cover:null,label:'Cobertura indisponível',tone:'',needsReorder:false};
    const urgent=cover<=inventoryPolicy.urgentDays,attention=cover<=inventoryPolicy.attentionDays;
    return {location,name,quantity,cover,label:urgent?'Urgente · '+name:attention?'Repor '+name:name+' em dia',tone:urgent?'bad':attention?'warning':'good',needsReorder:attention};
  }
  function inventoryInsights(total) {
    const available=total.products.filter(p=>p.stock>0),idle=total.complete?available.filter(p=>p.units===0):[];
    const fullReorder=total.products.filter(p=>inventoryStatus(p,'full').needsReorder),warehouseReorder=total.products.filter(p=>inventoryStatus(p,'warehouse').needsReorder);
    const reorder=total.products.filter(p=>fullReorder.includes(p)||warehouseReorder.includes(p));
    const valuation=list=>({value:round(list.reduce((s,p)=>s+(p.unitCost==null?0:p.stock*p.unitCost),0)),complete:list.every(p=>p.unitCost!=null)});
    return {capital:valuation(available),idle:{...valuation(idle),products:idle},reorder,fullReorder,warehouseReorder};
  }
  // Monotone cubic interpolation: preserves measured points and avoids artificial peaks.
  function smoothLine(points){
    const segments=[];let group=[];
    for(const p of points){
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){if(group.length)segments.push(group);group=[];continue;}
      if(group.length&&p.x<=group.at(-1).x){segments.push(group);group=[];}
      group.push(p);
    }
    if(group.length)segments.push(group);
    const f=n=>Number(n.toFixed(3));
    return segments.map(ps=>{
      let path='M'+f(ps[0].x)+' '+f(ps[0].y);
      if(ps.length===1)return path;
      const slopes=ps.slice(1).map((p,i)=>(p.y-ps[i].y)/(p.x-ps[i].x));
      const tangents=ps.map((p,i)=>i===0?slopes[0]:i===ps.length-1?slopes.at(-1):
        slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
      for(let i=0;i<slopes.length;i++){
        if(slopes[i]===0){tangents[i]=tangents[i+1]=0;continue;}
        const a=tangents[i]/slopes[i],b=tangents[i+1]/slopes[i],length=Math.hypot(a,b);
        if(length>3){const scale=3/length;tangents[i]=scale*a*slopes[i];tangents[i+1]=scale*b*slopes[i];}
      }
      for(let i=0;i<ps.length-1;i++){
        const a=ps[i],b=ps[i+1],dx=(b.x-a.x)/3;
        path+=' C'+f(a.x+dx)+' '+f(a.y+tangents[i]*dx)+' '+f(b.x-dx)+' '+f(b.y-tangents[i+1]*dx)+' '+f(b.x)+' '+f(b.y);
      }
      return path;
    }).join(' ');
  }
  function annualFinancials(year,expenses,costs=defaultCosts(),missing=false,settings={}){
    const months=Array.from({length:12},(_,index)=>{
      const start=year+'-'+String(index+1).padStart(2,'0')+'-01';
      const end=new Date(Date.UTC(year,index+1,0,12)).toISOString().slice(0,10);
      ensure(start,end);const available=start<=maxDay&&end>=minDay&&monthCache.has(start.slice(0,7)),cutoff=end<maxDay?end:maxDay;
      const rows=expenseEntries(expenses,start,end),confirmed=available?rows.filter(e=>e.occurrence<=cutoff):[];
      const applied=round(confirmed.reduce((sum,e)=>sum+e.amount,0)),planned=round(rows.reduce((sum,e)=>sum+e.amount,0)-applied);
      if(!available)return {month:index,start,end,available:false,partial:false,net:null,costs:null,expenses:null,planned,result:null,rows};
      const sales=aggregate(start<minDay?minDay:start,cutoff,costs,missing,settings);
      return {month:index,start,end,cutoff,available:true,partial:!sales.complete||!sales.adsComplete||end>maxDay||start<minDay,sales,net:sales.net,costs:sales.result==null?null:round(sales.net-sales.result),expenses:applied,planned,result:sales.result==null?null:round(sales.result-applied),rows};
    });
    const loaded=months.filter(m=>m.available),sum=key=>!loaded.length||loaded.some(m=>m[key]==null)?null:round(loaded.reduce((n,m)=>n+m[key],0));
    return {year,months,net:sum('net'),costs:sum('costs'),expenses:sum('expenses'),result:sum('result'),loaded:loaded.length,cutoff:year===Number(maxDay.slice(0,4))?maxDay:year<Number(maxDay.slice(0,4))?year+'-12-31':null};
  }
  function financialLedger(start,end,expenses,costs=defaultCosts(),missing=false,settings={}){
    const from=start<minDay?minDay:start,to=end>maxDay?maxDay:end,available=from<=to;
    const sales=available?aggregate(from,to,costs,missing,settings):null;
    const entries=expenseEntries(expenses,start,end),confirmed=available?entries.filter(e=>e.occurrence<=to):[];
    const applied=round(confirmed.reduce((sum,e)=>sum+e.amount,0)),planned=round(entries.filter(e=>e.occurrence>maxDay).reduce((sum,e)=>sum+e.amount,0));
    const rows=[['gross','Faturamento bruto',1],['ads','Publicidade · Ads',-1],['tax','Impostos sobre vendas',-1],['cancelled','Vendas canceladas',-1],['cost','Custo dos produtos vendidos',-1],['shipping','Frete do vendedor',-1],['fees','Tarifas de venda',-1],['refunded','Reembolsos parciais',-1]].map(([key,label,sign])=>({key,label,amount:sales==null||sales[key]==null?null:round(sign*sales[key])}));
    return {start,end,available,partial:available&&(start<minDay||end>maxDay),sales,entries,rows,applied,planned,result:!sales||sales.result==null?null:round(sales.result-applied)};
  }
  // Management DRE: expenses follow registered due dates; no fictional accounting adjustments.
  function dreReport(year,expenses,costs=defaultCosts(),missing=false,settings={}){
    const annual=annualFinancials(year,expenses,costs,missing,settings);
    const months=annual.months.map(m=>{
      if(!m.available)return {...m,report:null};
      const s=m.sales,netRevenue=subtract(s.net,s.tax),selling=sum([s.fees,s.shipping,s.ads]);
      const categories={};for(const e of m.rows.filter(e=>e.occurrence<=m.cutoff))categories[e.category||'Outros']=round((categories[e.category||'Outros']||0)+e.amount);
      return {...m,report:{gross:s.gross,cancelled:s.cancelled,refunded:s.refunded,tax:s.tax,deductions:sum([s.cancelled,s.refunded,s.tax]),netRevenue,cmv:s.cost,grossProfit:subtract(netRevenue,s.cost),fees:s.fees,shipping:s.shipping,ads:s.ads,selling,contribution:s.result,opex:m.expenses,result:m.result,categories}};
    });
    const loaded=months.filter(m=>m.available),keys=['gross','cancelled','refunded','tax','deductions','netRevenue','cmv','grossProfit','fees','shipping','ads','selling','contribution','opex','result'];
    const total=Object.fromEntries(keys.map(key=>[key,!loaded.length||loaded.some(m=>m.report[key]==null)?null:round(loaded.reduce((sum,m)=>sum+m.report[key],0))]));
    total.categories={};for(const m of loaded)for(const [name,value]of Object.entries(m.report.categories))total.categories[name]=round((total.categories[name]||0)+value);
    return {year,months,total,cutoff:annual.cutoff,loaded:annual.loaded};
  }
const M={round,utc,shift,daysBetween,aggregate,margin,alerts,expenseEntries,quote,safeCover,cancellationEvents,campaigns,costBreakdown,inventoryInsights,inventoryStatus,inventoryPolicy,stockCoverageDays,smoothLine,annualFinancials,dreReport,financialLedger,manualExpenseCount,defaultCosts,defaultExpenses,
 get minDay(){return minDay},get maxDay(){return maxDay},get products(){return bootstrap.products},get data(){return bootstrap.data},get account(){return bootstrap},get error(){return lastError},get loading(){return pending.size>0},
 async refresh(){try{const b=await api('/bootstrap'),identityChanged=b.sellerId!==bootstrap.sellerId||b.user?.email!==bootstrap.user?.email;const changedRevision=identityChanged||b.progress?.revision!==bootstrap.progress?.revision;bootstrap=b;minDay=b.progress?.registeredOn||maxDay;if(changedRevision){epoch++;monthCache.clear();}if(identityChanged){visits.clear();visitItems.clear();visitPending.clear();catalogPrices.clear();catalogPending.clear();}lastError=null;return b;}catch(e){lastError=e;throw e;}},
 async persist(changes){
   const patch={};for(const [key,value]of Object.entries(changes)){
    if(['costs','productSettings','listingUpdates'].includes(key)){const delta={};for(const [id,v]of Object.entries(value))if(JSON.stringify(v)!==JSON.stringify(bootstrap.data[key]?.[id]))delta[id]=v;if(Object.keys(delta).length)patch[key]=delta;}
    else if(JSON.stringify(value)!==JSON.stringify(bootstrap.data[key]))patch[key]=value;
   }
   if(!Object.keys(patch).length)return true;
   try{const r=await api('/preferences',{version:bootstrap.version,changes:patch});bootstrap.version=r.version;
    for(const [key,value]of Object.entries(patch))bootstrap.data[key]=['costs','productSettings','listingUpdates'].includes(key)?{...bootstrap.data[key],...structuredClone(value)}:structuredClone(value);
    return true;
   }catch(e){lastError=e;changed();return false;}
 },
 async loadCatalog(id){
  if(catalogPending.has(id))return;catalogPending.add(id);
  try{const seller=bootstrap.sellerId;const r=await api('/catalog-price?itemId='+encodeURIComponent(id));if(seller!==bootstrap.sellerId)return;catalogPrices.set(id,r.priceToWin);changed();}catch{}
 },
 async loadVisits(id,start,end){
  const key=id+start+end;if(visitPending.has(key)||end>maxDay||daysBetween(start,end)>150)return;visitPending.add(key);
  try{const seller=bootstrap.sellerId;const r=await api('/visits?itemId='+encodeURIComponent(id)+'&start='+start+'&end='+end);if(seller!==bootstrap.sellerId)return;visitItems.add(id);for(const row of r.days)visits.set(id+'|'+row.day,row.visits);changed();}catch{changed();}
 },
};
window.NovaiPanelModel=M;
 const base=document.querySelector('meta[name="novai-dashboard-api"]').content;
 async function api(path,data,signal){
   const token=localStorage.getItem('authToken');
   if(!token)throw Object.assign(new Error('Entre na sua conta NOVAI para ver o painel.'),{code:'session_required'});
   const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),signal,cache:'no-store'});
   const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error||'Não foi possível atualizar os dados.'),{code:body.error});return body;
 }
 window.NovaiDashboardApi=api;
 const listeners=new Set();
 window.NovaiSavedPanel={enabled:true,status:'loading',items:[],subscribe(f){listeners.add(f)},async load(){try{const data=await api('/saved',{action:'list'});this.items=data.items.filter(x=>!x.deleted).map(x=>({...x.item,url:x.url}));this.status='ready';}catch{this.status='error'}for(const f of listeners)f()},async remove(key){try{await api('/saved',{action:'remove',key});await this.load();return true}catch{return false}}};

window.NOVAI_ACCOUNT_BRIDGE={async logout(){const r=await api('/logout',{});localStorage.removeItem('authToken');monthCache.clear();visits.clear();bootstrap={products:[],data:{},version:0,connected:false};location.assign('/login');return r;}};
M.ready=M.refresh().catch(e=>{lastError=e;});
})();
