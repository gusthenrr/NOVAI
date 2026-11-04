/* Live account data. Demonstration generators intentionally absent. */
(() => {
 'use strict';
 const round=n=>Math.round((n+Number.EPSILON)*100)/100,dayMs=86400000;
 const utc=s=>new Date(s+'T12:00:00Z');
 const shift=(s,n)=>new Date(utc(s).getTime()+n*dayMs).toISOString().slice(0,10);
 const daysBetween=(a,b)=>Math.round((utc(b)-utc(a))/dayMs)+1;
 let snapshot=null;
 const M={get minDay(){return snapshot?.minDay||new Date().toISOString().slice(0,10)},get maxDay(){return snapshot?.maxDay||new Date().toISOString().slice(0,10)},get products(){return snapshot?.current.products||[]},get snapshot(){return snapshot},setSnapshot(s){snapshot=s},hasRange(a,b){return snapshot?.start===a&&snapshot?.end===b},
 defaultCosts:()=>Object.fromEntries(Object.entries(snapshot?.costs||{}).map(([k,v])=>[k,v.cost])),defaultExpenses:()=>snapshot?.expenses||[],
 aggregate(a,b){return a===snapshot.start?snapshot.current:snapshot.previous},cancellationEvents(){return snapshot?.current.events||[]}};
  const margin=p=>p.result==null || !p.net ? null : p.result/p.net*100;
  function alerts(current,previous,days,comparable=true) {
    const list=[];
    const loss=current.products.filter(p=>p.units>0 && p.result!=null && p.result<0).sort((a,b)=>margin(a)-margin(b))[0];
    if (loss && current.complete) list.push({type:'loss',id:loss.id,title:'Pior margem',value:margin(loss),priority:110});
    const missing=current.products.filter(p=>p.unitCost==null);
    if (missing.length) list.push({type:'cost',id:missing[0].id,title:'Custo pendente',count:missing.length,priority:100});
    if (comparable) for (const p of current.products) {
      const before=previous.products.find(x=>x.id===p.id);
      if (before?.orders>=10 && p.orders/before.orders<=.8) list.push({type:'decline',id:p.id,title:'Queda nas vendas',value:(p.orders/before.orders-1)*100,priority:80});
    }
    const low=current.products.filter(p=>p.cover!=null && p.cover<=3).sort((a,b)=>a.cover-b.cover)[0];
    if (low) list.push({type:'stock',id:low.id,title:'Estoque para '+low.cover+' '+(low.cover===1?'dia':'dias'),value:low.cover,priority:70});
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
        if (occurrence>=e.date && occurrence>=start && occurrence<=end) result.push({...e,occurrence});
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
  function campaigns(total) { return total.campaigns || []; }
  function costBreakdown(total) {
    const parts=[['cost','Produtos','#fee800'],['fees','Tarifas','#d2c568'],['shipping','Frete','#a9a279'],['tax','Impostos','#8c8c94'],['ads','Publicidade','#d8d8df']].map(([key,label,color])=>({key,label,color,value:total[key]}));
    const known=parts.filter(p=>p.value!=null&&Number.isFinite(p.value)&&p.value>0),sum=round(known.reduce((s,p)=>s+p.value,0));
    return {parts:known.map(p=>({...p,share:sum?p.value/sum*100:0})),total:sum,complete:parts.every(p=>p.value!=null&&Number.isFinite(p.value))};
  }
  function inventoryInsights(total) {
    const available=total.products.filter(p=>p.stock>0),idle=total.complete?available.filter(p=>p.units===0):[],reorder=(total.complete?total.products:[]).filter(p=>p.units>0&&(p.stock===0||p.cover!=null&&p.cover<=3));
    const valuation=list=>({value:round(list.reduce((s,p)=>s+(p.unitCost==null?0:p.stock*p.unitCost),0)),complete:list.every(p=>p.unitCost!=null)});
    return {capital:valuation(available),idle:{...valuation(idle),products:idle},reorder};
  }

 Object.assign(M,{round,utc,shift,daysBetween,margin,alerts,expenseEntries,quote,safeCover,campaigns,costBreakdown,inventoryInsights});
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
})();
