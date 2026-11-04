(() => {
  'use strict';
  const M=window.NovaiPanelModel,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const money=n=>n==null||!Number.isFinite(n)?'--':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const num=n=>n==null?'--':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(n);
  const pct=n=>n==null||!Number.isFinite(n)?'--':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n)+'%';
  const date=(s,year=false)=>M.utc(s).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).replaceAll('.','');
  const range=(a,b)=>date(a)+' – '+date(b,true);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=n=>'<i data-icon="'+n+'" aria-hidden="true"></i>',arrow='<span class="chevron" aria-hidden="true"></span>';
  const check='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const savedFlag='<svg class="saved-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V5a2 2 0 0 1 2-2h9v18l-5.5-4z"/></svg>';
  const api=window.NovaiDashboardApi;
  const validNumber=n=>Number.isFinite(n)&&n>=0&&n<=1000000;
  let stored={};
  const costs=M.defaultCosts();for(const p of M.products)if(validNumber(stored?.costs?.[p.id]))costs[p.id]=stored.costs[p.id];
  const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(M.utc(s).getTime())&&M.utc(s).toISOString().slice(0,10)===s;
  const safeExpense=e=>e&&typeof e.id==='string'&&e.id.length<100&&typeof e.name==='string'&&e.name.trim().length>0&&e.name.length<=100&&validNumber(e.amount)&&e.amount>0&&validDay(e.date)&&e.date>=M.minDay&&e.date<=M.maxDay;
  let expenses=Array.isArray(stored.expenses)?stored.expenses.filter(safeExpense).map(e=>({...e,recurring:e.recurring===true})):M.defaultExpenses();
  const seedSaved=()=>[];
  let saved=Array.isArray(stored.saved)?stored.saved.filter(s=>M.products.some(p=>p.id===s.id)&&M.quote(s)):seedSaved();
  const state={route:'resumo',tab:'',start:M.shift(M.maxDay,-6),end:M.maxDay,period:7,missing:false,costs,search:'',productFilter:'all',sort:'attention',adFilter:'all',campaignMetric:'adRevenue',ledgerPage:1,chart:{resumo:'gross',publicidade:'adRevenue'}};
  let current,previous,alerts=[],comparable=true,expenseRows=[],expenseTotal=0,chartPoints=[],chartWidth=700,chartHeight=195,activePoint=-1;
  let returnFocus=null,dialogKind=null,dialogProduct=null,pricing=null,pricingResult=false,toastTimer=null,undoAction=null;
  const imageOverrides=new Map(),dialog=$('#detail-dialog');
  const persist=()=>{};
  const productById=id=>current.products.find(p=>p.id===id);
  const cover=p=>'<img class="cover" src="'+esc(imageOverrides.get(p.id)||p.image)+'" alt="" width="48" height="48" loading="lazy" decoding="async">';
  function imageFallbacks(){for(const img of $$('img.cover'))img.onerror=()=>{const span=document.createElement('span');span.className='cover cover-fallback';span.innerHTML=icon('package');img.replaceWith(span);};}
  function delta(value,before,inverse=false){
    if(value==null||before==null||before===0)return '<span class="delta neutral">Sem comparação</span>';
    const change=(value-before)/Math.abs(before)*100;if(Math.abs(change)<.05)return '<span class="delta neutral">Sem variação</span>';
    const worse=inverse?change>0:change<0;
    return '<span class="delta '+(worse?'negative':'')+'"><span class="delta-circle"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="'+(worse?'M6 2v8m-3-3 3 3 3-3':'M6 10V2M3 5l3-3 3 3')+'"/></svg></span>'+(change<0?'−':'+')+pct(Math.abs(change))+'</span>';
  }
  function metric(label,value,meta='',foot='',tone=''){return '<article class="metric"><div class="metric-label">'+label+'</div><strong class="metric-value '+tone+'">'+value+'</strong><div class="metric-meta">'+meta+'</div><div class="metric-foot">'+foot+'</div></article>';}
  const action=(label,attrs='',yellow=false)=>'<button class="text-button '+(yellow?'yellow':'')+'" '+attrs+'>'+label+' '+arrow+'</button>';
  const productName=p=>'<div class="product-cell">'+cover(p)+'<div><button class="product-name" data-product="'+p.id+'">'+esc(p.name)+'</button><span class="product-caption">'+esc(p.sku)+' · '+p.itemId+'</span></div></div>';
  const cell=(label,value)=>'<td data-label="'+label+'">'+value+'</td>';
  const value=(a,b='',tone='')=>'<strong class="table-value '+tone+'">'+a+'</strong>'+(b?'<span class="table-sub">'+b+'</span>':'');
  const status=(text,tone='')=>'<span class="status '+tone+'"><span class="status-dot"></span>'+text+'</span>';
  function table(headers,rows,cls=''){return '<div class="table-wrap"><table class="data-table '+cls+'"><thead><tr>'+headers.map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';}
  const rowOpen=p=>cell('', '<button class="row-open" data-product="'+p.id+'" aria-label="Ver detalhes de '+esc(p.name)+'">'+arrow+'</button>');
  const empty=(title,description)=>'<div class="empty">'+icon('search')+'<strong>'+title+'</strong>'+description+'</div>';
  function recalculate(){
    current=M.aggregate(state.start,state.end,state.costs,state.missing);
    const beforeStart=M.shift(state.start,-M.daysBetween(state.start,state.end));comparable=M.snapshot.current.complete&&M.snapshot.previous.complete;
    previous=M.aggregate(beforeStart,M.shift(state.start,-1),state.costs,state.missing);
    alerts=M.alerts(current,previous,M.daysBetween(state.start,state.end),comparable);
    expenseRows=M.expenseEntries(expenses,state.start,state.end);expenseTotal=M.round(expenseRows.reduce((s,e)=>s+e.amount,0));
  }
  function task(a,index,all=false){
    const p=productById(a.id),isCost=a.type==='cost';
    const detail=a.type==='loss'?'<b class="negative">'+pct(a.value)+'</b> · prejuízo':isCost?'Complete para conferir o resultado.':a.type==='decline'?'Vendas <b class="negative">'+pct(a.value)+'</b> no período.':a.type==='stock'?'Cobertura estimada no ritmo atual.':'Estoque disponível, sem vendas no período.';
    return '<button class="task-card" data-alert="'+index+'" '+(all?'data-all-alert="true"':'')+'>'+(isCost?'<span class="task-symbol">'+icon('receipt-2')+'</span>':cover(p))+'<span class="task-copy"><small>'+a.title+'</small><strong>'+(isCost?a.count+' produto'+(a.count>1?'s':'')+' sem custo':esc(p.name))+'</strong><span>'+detail+'</span></span><span class="task-action">'+(isCost?'Cadastrar custo':'Revisar')+' '+arrow+'</span></button>';
  }
  const routeTabs={financeiro:[['vendas','Vendas'],['cancelamentos','Cancelamentos'],['despesas','Despesas da operação']],produtos:[['todos','Todos os produtos'],['desempenho','Desempenho'],['estoque','Estoque'],['catalogo','Catálogo']],publicidade:[['anuncios','Anúncios'],['campanhas','Campanhas']],oportunidades:[['salvos','Salvos do Precify'],['avaliar','Avaliar produtos']]};

  const titles={resumo:['VISÃO DA LOJA','Resumo'],financeiro:['ENTRADAS, CUSTOS E RESULTADO','Financeiro'],produtos:['SUA OPERAÇÃO','Produtos'],publicidade:['INVESTIMENTO E RETORNO','Publicidade'],oportunidades:['ESTUDE ANTES DE DECIDIR','Precify']};
  function setRoute(){
    const [raw,tab]=(location.hash.slice(1)||'resumo').split('/');
    state.route=titles[raw]?raw:'resumo';state.tab=routeTabs[state.route]?.some(([id])=>id===tab)?tab:routeTabs[state.route]?.[0][0]||'';
    state.search='';state.ledgerPage=1;render();window.scrollTo(0,0);
  }
  function render(){
    if(!M.hasRange(state.start,state.end)){$('#sync-title').textContent='Atualizando o período…';$('#main').setAttribute('aria-busy','true');void loadSnapshot();return;}$('#main').removeAttribute('aria-busy');
    recalculate();
    const [eyebrow,title]=titles[state.route];$('#page-eyebrow').textContent=eyebrow;$('#page-title').textContent=title;document.title=title+' · Novai';
    const realSaved=window.NovaiSavedPanel?.enabled&&state.route==='oportunidades';
    $('.demo-wrap').hidden=true;$('.page-footer>span:first-child').textContent=realSaved?'Salvos compartilhados com o Precify e a extensão.':(current.complete&&current.adsComplete?'Dados da conta conectada.':'Dados parciais: período ainda não totalmente disponível.');
    for(const a of $$('[data-nav]')){const active=a.dataset.nav===state.route;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    $('#period-label').textContent=state.period?'Últimos '+state.period+' dias':'Personalizado';$('#period-range').textContent=range(state.start,state.end);
    $('.data-caption').textContent='Até '+date(state.end,true);
    $('#start').value=state.start;$('#end').value=state.end;$('.period-wrap').hidden=state.route==='oportunidades';
    $$('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===state.period)));
    $$('[data-coverage]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.coverage==='missing')===state.missing)));
    $('#route-tabs').hidden=!routeTabs[state.route];$('#route-tabs').innerHTML=(routeTabs[state.route]||[]).map(([id,label])=>'<button data-route-tab="'+id+'" aria-pressed="'+(id===state.tab)+'">'+label+'</button>').join('');
    $('#metrics').hidden=['produtos','oportunidades'].includes(state.route);
    $('#comparison-note').hidden=state.route==='oportunidades';$('#comparison-note').textContent=comparable?'Comparação com '+range(M.shift(state.start,-M.daysBetween(state.start,state.end)),M.shift(state.start,-1))+'.':'Comparação indisponível: um dos períodos ainda não foi completamente coletado.';
    if(current.adsPartial)$('#comparison-note').textContent+=' Publicidade parcial: mostrando os valores já recebidos.';
    $('#tasks-section').hidden=state.route!=='resumo'||!alerts.length;$('#attention-count').textContent='('+alerts.length+')';$('#attention-list').innerHTML=alerts.slice(0,2).map((a,i)=>task(a,i)).join('');
    $('#chart-section').hidden=!(state.route==='resumo'||state.route==='publicidade'&&state.tab==='anuncios');
    $('#page-content').innerHTML='';
    if(state.route==='resumo')renderSummary();
    if(state.route==='financeiro')renderFinance();
    if(state.route==='produtos')renderProducts();
    if(state.route==='publicidade')renderAds();
    if(state.route==='oportunidades')renderOpportunities();
    $('#footer-context').textContent=state.route==='oportunidades'?'Salvos na sua conta NOVAI.':state.route==='publicidade'?'Resultado atribuído após custos e Ads, antes das despesas fixas.':'Resultado das vendas antes das despesas fixas.';
    if(!$('#chart-section').hidden)renderChart();
    imageFallbacks();requestAnimationFrame(fitNumbers);$('#announcement').textContent=title+' atualizado para '+range(state.start,state.end)+'.';
  }
  function resultMetric(total=current,before=previous){return metric((total.result==null||total.complete===false?'Resultado parcial':'Resultado das vendas')+'<button class="info-button" data-finance-info aria-label="Como calculamos o resultado"><span>i</span></button>',money(total.result),total.result==null?'Há custos ou métricas pendentes':(comparable?delta(total.result,before.result):'')+'<span>'+pct(M.margin(total))+' de margem</span>',action('Ver composição','data-finance-info',true),total.result!=null&&total.result<0?'negative':'');}
  function renderSummary(){
    $('#metrics').innerHTML=resultMetric()+metric('Faturamento',money(current.gross),comparable?delta(current.gross,previous.gross):'',num(current.orders)+' pedidos pagos')+metric('Gasto em publicidade',money(current.ads),pct(current.ads!=null&&current.net?current.ads/current.net*100:null)+' da receita líquida',action('Ver publicidade','data-go="publicidade"'));
  }
  function composition(total=current){return '<div class="composition">'+[['Faturamento',total.gross],['Cancelamentos',total.cancelled==null?null:-total.cancelled],['Reembolsos',total.refunded==null?null:-total.refunded],['Custo dos produtos',total.cost==null?null:-total.cost],['Tarifas de venda',total.fees==null?null:-total.fees],['Impostos',total.tax==null?null:-total.tax],['Frete do vendedor',total.shipping==null?null:-total.shipping],['Publicidade',total.ads==null?null:-total.ads]].map(([label,n])=>'<div><span>'+label+'</span><strong>'+money(n)+'</strong></div>').join('')+'<div class="result-line"><span>Resultado das vendas</span><strong class="'+(total.result<0?'negative':'')+'">'+money(total.result)+'</strong></div></div>';}
  function costChart(){
    const data=M.costBreakdown(current),circumference=2*Math.PI*70;let offset=0;
    if(!data.total)return '<div class="empty">Nenhum custo registrado neste período.</div>';
    const slices=data.parts.map(p=>{const length=p.share/100*circumference,svg='<circle data-cost-arc="'+p.key+'" cx="100" cy="100" r="70" fill="none" stroke="'+p.color+'" stroke-width="24" stroke-dasharray="'+length+' '+(circumference-length)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 100 100)"/>';offset+=length;return svg;}).join('');
    return '<div class="cost-distribution" data-total="'+data.total+'" data-complete="'+data.complete+'"><div class="donut-wrap"><svg class="cost-donut" viewBox="0 0 200 200" role="img" aria-label="Distribuição dos custos das vendas: '+data.parts.map(p=>p.label+' '+pct(p.share)).join(', ')+'."><title>Composição dos custos das vendas</title>'+slices+'</svg><div class="donut-center"><span id="cost-chart-label">'+(data.complete?'Custos das vendas':'Custos conhecidos')+'</span><strong id="cost-chart-value">'+money(data.total)+'</strong><small id="cost-chart-share">100% dos custos '+(data.complete?'':'conhecidos')+'</small></div></div><div class="cost-legend" role="group" aria-label="Detalhar custos">'+data.parts.map(p=>'<button data-cost-slice="'+p.key+'" data-value="'+p.value+'" data-share="'+p.share+'" data-name="'+esc(p.label)+'" aria-pressed="false"><span class="cost-swatch" style="--swatch:'+p.color+'"></span><span>'+p.label+'</span><strong>'+pct(p.share)+'</strong></button>').join('')+'<button class="cost-reset" data-cost-reset hidden>Ver total '+arrow+'</button></div></div>'+(!data.complete?'<p class="section-footnote">Há custos ou métricas pendentes. O gráfico mostra apenas os custos conhecidos.</p>':'');
  }
  function selectCostSlice(key){
    const root=$('.cost-distribution');if(!root)return;
    const button=key?$('[data-cost-slice="'+key+'"]'):null,selected=button?.getAttribute('aria-pressed')!=='true'&&button;
    $$('[data-cost-slice]').forEach(b=>b.setAttribute('aria-pressed',String(b===selected)));
    $$('[data-cost-arc]').forEach(arc=>arc.style.opacity=selected&&arc.dataset.costArc!==key?'.22':'1');
    $('#cost-chart-label').textContent=selected?selected.dataset.name:root.dataset.complete==='true'?'Custos das vendas':'Custos conhecidos';
    $('#cost-chart-value').textContent=money(Number(selected?selected.dataset.value:root.dataset.total));
    $('#cost-chart-share').textContent=selected?pct(Number(selected.dataset.share))+' dos custos':'100% dos custos '+(root.dataset.complete==='true'?'':'conhecidos');
    $('[data-cost-reset]').hidden=!selected;
    requestAnimationFrame(fitNumbers);
  }
  function renderFinance(){
    if(state.tab==='cancelamentos'){
      $('#metrics').innerHTML=metric('Receita cancelada',money(current.cancelled),num(current.cancelledOrders)+' pedidos','Pedidos cancelados nos dados coletados.')+metric('Reembolsos',money(current.refunded),'Devoluções parciais','Já descontados do resultado das vendas.')+metric('Perda após o envio',money(current.lossAfterShipping),'Não disponível nesta fonte.','Diferente de receita cancelada.');
      const records=M.cancellationEvents(state.start,state.end);
      const rows=records.map(r=>{const p=productById(r.id);return '<tr>'+cell('Produto',productName(p))+cell('Data',value(date(r.day)))+cell('Ocorrência',value(r.type))+cell('Valor',value(money(r.amount)))+cell('Efeito na receita',value(money(r.effect),r.type==='Cancelamento'?'Receita cancelada':'Estorno parcial'))+rowOpen(p)+'</tr>';});
      $('#page-content').innerHTML='<section class="panel"><div class="panel-heading"><div><h2>Ocorrências no período</h2><p>Receita cancelada e dinheiro devolvido aparecem separados.</p></div>'+action('Exportar CSV','data-export="cancelamentos"')+'</div>'+(rows.length?table(['Produto','Data','Ocorrência','Valor','Efeito na receita',''],rows.join('')):empty('Nenhuma ocorrência','Não há cancelamentos ou reembolsos no período.'))+'</section>';return;
    }
    if(state.tab==='despesas'){
      const operational=current.result==null?null:M.round(current.result-expenseTotal);
      $('#metrics').innerHTML=metric('Resultado após despesas',money(operational),'Considera os cadastros abaixo.','Confira se todas as despesas foram registradas.',operational<0?'negative':'')+metric('Resultado das vendas',money(current.result),pct(M.margin(current))+' de margem',action('Ver composição','data-finance-info'))+metric('Despesas da operação',money(expenseTotal),num(expenseRows.length)+' lançamentos no período',action('Cadastrar despesa','data-add-expense',true));
      const rows=expenseRows.map(e=>'<tr>'+cell('Descrição','<strong class="table-value">'+esc(e.name)+'</strong><span class="table-sub">'+esc(e.category)+'</span>')+cell('Data',value(date(e.occurrence,true)))+cell('Recorrência',value(e.recurring?'Mensal':'Uma vez'))+cell('Valor',value(money(e.amount)))+cell('','<button class="icon-button" data-remove-expense="'+esc(e.id)+'" aria-label="Remover despesa '+esc(e.name)+'"><svg viewBox="0 0 24 24"><path d="m7 7 10 10M7 17 17 7"/></svg></button>')+'</tr>').join('');
      $('#page-content').innerHTML='<section class="panel"><div class="panel-heading"><div><h2>Despesas registradas</h2><p>Competência pela data do lançamento.</p></div><button class="button primary" data-add-expense>Adicionar despesa</button></div>'+(rows?table(['Descrição','Data','Recorrência','Valor',''],rows):empty('Nenhuma despesa no período','Cadastre custos da operação para completar o resultado.'))+'<p class="section-footnote">Despesas mensais entram na data de vencimento, sem rateio automático por dia.</p></section>';return;
    }
    const totalCosts=current.result==null?null:M.round(current.net-current.result),operational=current.result==null?null:M.round(current.result-expenseTotal);
    $('#metrics').innerHTML=resultMetric()+metric('Receita após estornos',money(current.net),num(current.orders)+' pedidos pagos','Faturamento menos cancelamentos e reembolsos.')+metric('Custos das vendas',money(totalCosts),pct(totalCosts!=null&&current.net?totalCosts/current.net*100:null)+' da receita líquida','Inclui produto, tarifas, impostos, frete e Ads.');
    $('#page-content').innerHTML='<div class="finance-grid"><section class="panel"><div class="panel-heading"><h2>Composição do resultado</h2></div>'+composition()+'</section><section class="panel cost-panel"><div class="panel-heading"><div><h2>Para onde vai o dinheiro</h2><p>Participação de cada custo nas vendas.</p></div></div>'+costChart()+'<div class="operation-summary"><div><span>Resultado após despesas</span><strong class="'+(operational<0?'negative':'')+'">'+money(operational)+'</strong></div>'+action('Ver despesas','data-go="financeiro/despesas"',true)+'<small>Despesas registradas: '+money(expenseTotal)+'</small></div><p class="section-footnote">Considera os custos e despesas cadastrados. Não representa saldo disponível para saque.</p></section></div><section class="panel"><div class="panel-heading"><div><h2>Vendas por produto</h2><p>Valores acumulados no período selecionado.</p></div>'+action('Exportar CSV','data-export="financeiro"')+'</div>'+financeTable()+'</section>';
  }
  function financeTable(){return table(['Produto','Unidades','Receita líquida','Custos das vendas','Resultado / margem',''],current.products.filter(p=>p.units>0).map(p=>'<tr>'+cell('Produto',productName(p))+cell('Unidades',value(num(p.units)))+cell('Receita líquida',value(money(p.net)))+cell('Custos das vendas',value(money(p.result==null?null:p.net-p.result)))+cell('Resultado / margem',value(money(p.result),p.result==null?'Dados pendentes':pct(M.margin(p)),p.result<0?'negative':''))+rowOpen(p)+'</tr>').join(''));}
  function productRows(list){
    if(state.tab==='desempenho')return table(['Produto','Vendas no período','Período anterior','Variação','Situação',''],list.map(p=>{const before=previous.products.find(x=>x.id===p.id),change=before.orders?(p.orders/before.orders-1)*100:null;return '<tr>'+cell('Produto',productName(p))+cell('Vendas no período',value(num(p.orders)+' pedidos',p.lastSale?'Última venda: '+date(p.lastSale):'Nenhuma venda registrada'))+cell('Período anterior',value(comparable?num(before.orders)+' pedidos':'--'))+cell('Variação',comparable?delta(p.orders,before.orders):'<span class="muted small">Sem comparação</span>')+cell('Situação',!p.units?status('Sem vendas','warning'):change!=null&&change<=-20?status('Queda relevante','bad'):change!=null&&change>=20?status('Em alta','good'):status('Acompanhar'))+rowOpen(p)+'</tr>';}).join(''));
    if(state.tab==='estoque')return table(['Produto','Estoque','Full / depósito','Cobertura','Situação',''],list.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Estoque',value(num(p.stock)+' un.'))+cell('Full / depósito',value(num(p.full)+' / '+num(p.stock-p.full)))+cell('Cobertura',value(p.cover==null?'--':p.cover+' '+(p.cover===1?'dia':'dias'),'Estimativa pelo período'))+cell('Situação',p.cover!=null&&p.cover<=3?status('Repor em breve','warning'):p.units===0?status('Sem giro no período'):status('Disponível','good'))+rowOpen(p)+'</tr>').join(''));
    if(state.tab==='catalogo')return table(['Produto','Meu preço','Referência do anúncio','Diferença','Ação',''],list.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Meu preço',value(money(p.price)))+cell('Referência do anúncio',value(money(p.competitorPrice)))+cell('Diferença',value(money(p.price-p.competitorPrice),'Preço acima da referência'))+cell('Ação',action('Simular margem','data-pricing="'+p.id+'"',true))+rowOpen(p)+'</tr>').join(''));
    return table(['Produto','Vendas','Resultado / margem','Estoque','Variação de vendas',''],list.map(p=>{const b=previous.products.find(x=>x.id===p.id);return '<tr>'+cell('Produto',productName(p))+cell('Vendas',value(num(p.orders)+' pedidos',num(p.units)+' unidades'))+cell('Resultado / margem',value(money(p.result),p.result==null?'Dados pendentes':M.margin(p)==null?'Sem vendas':pct(M.margin(p)),p.result<0?'negative':''))+cell('Estoque',value(num(p.stock)+' un.',p.cover==null?'Cobertura indisponível':p.cover+' '+(p.cover===1?'dia':'dias')+' de cobertura'))+cell('Variação de vendas',comparable?delta(p.orders,b.orders):'<span class="muted small">Sem comparação</span>')+rowOpen(p)+'</tr>';}).join(''));
  }
  function filteredProducts(){
    const pendingIds=new Set(alerts.map(a=>a.id));let list=current.products.filter(p=>(p.name+' '+p.sku+' '+p.itemId).toLocaleLowerCase('pt-BR').includes(state.search.toLocaleLowerCase('pt-BR')));
    if(state.tab==='catalogo')list=list.filter(p=>p.catalog);
    if(state.productFilter==='attention')list=list.filter(p=>pendingIds.has(p.id));
    if(state.productFilter==='missing')list=list.filter(p=>p.unitCost==null);
    if(state.productFilter==='negative')list=list.filter(p=>p.result!=null&&p.result<0);
    if(state.productFilter==='idle')list=current.complete?list.filter(p=>p.stock>0&&p.units===0):[];
    if(state.productFilter==='reorder')list=list.filter(p=>p.units>0&&(p.stock===0||p.cover!=null&&p.cover<=3));
    if(state.sort==='sales')list.sort((a,b)=>b.orders-a.orders);else if(state.sort==='stock')list.sort((a,b)=>(a.cover??Infinity)-(b.cover??Infinity));else list.sort((a,b)=>(pendingIds.has(b.id)?1:0)-(pendingIds.has(a.id)?1:0)||(a.result??Infinity)-(b.result??Infinity));
    return list;
  }
  function renderProducts(){
    const list=filteredProducts(),missing=current.products.filter(p=>p.unitCost==null).length;
    const chips=state.tab==='estoque'?[['all','Todos'],['reorder','Reposição'],['idle','Sem giro'],['missing','Dados pendentes']]:[['all','Todos'],['attention','Em atenção'],['negative','Margem negativa'],['missing','Dados pendentes']];
    $('#page-content').innerHTML=(missing?'<div class="inline-note"><span><strong>'+missing+' produto sem custo.</strong> Complete para conferir seu resultado.</span>'+action('Cadastrar custo','data-product="'+(current.products.find(p=>p.unitCost==null)?.id||'')+'"',true)+'</div>':'')+'<section class="panel"><div class="plain-summary"><span><b>'+list.length+'</b>'+(list.length===1?'produto exibido':'produtos exibidos')+'</span><span><b>'+alerts.length+'</b>pendências na conta</span><span><b>'+(current.products.length-missing)+'/'+current.products.length+'</b>custos cadastrados</span></div><div class="toolbar"><label class="search-field">'+icon('search')+'<span class="sr-only">Buscar produtos</span><input id="product-search" type="search" placeholder="Produto, SKU ou MLB" value="'+esc(state.search)+'" autocomplete="off"></label><label class="sr-only" for="product-sort">Ordenar produtos</label><select id="product-sort" style="width:auto;font-size:11px;min-height:36px;padding:7px 10px"><option value="attention" '+(state.sort==='attention'?'selected':'')+'>Em atenção primeiro</option><option value="sales" '+(state.sort==='sales'?'selected':'')+'>Mais vendidos</option><option value="stock" '+(state.sort==='stock'?'selected':'')+'>Menor cobertura</option></select><div class="filter-chips" role="group" aria-label="Filtrar produtos">'+chips.map(([id,label])=>'<button data-product-filter="'+id+'" aria-pressed="'+(state.productFilter===id)+'">'+label+'</button>').join('')+'</div></div><div id="products-list">'+(list.length?productRows(list):empty('Nenhum produto encontrado','Tente outro nome ou remova o filtro.'))+'</div><div class="table-footer"><span>'+list.length+' de '+current.products.length+' produtos · anúncios coletados da conta</span>'+action('Exportar CSV','data-export="produtos"')+'</div></section>';
    if(state.tab==='estoque'){
      const stock=M.inventoryInsights(current);
      $('.plain-summary').outerHTML='<div class="stock-insights"><div><span>Investido em estoque</span><strong>'+money(stock.capital.value)+'</strong><small>'+(stock.capital.complete?'Estoque atual × custo cadastrado.':'Valor parcial · há custo pendente.')+'</small></div><button data-product-filter="idle" aria-pressed="'+(state.productFilter==='idle')+'"><span>Sem vendas no período '+arrow+'</span><strong>'+money(stock.idle.value)+'</strong><small>'+stock.idle.products.length+' '+(stock.idle.products.length===1?'produto':'produtos')+' com estoque'+(stock.idle.complete?'':' · valor parcial')+'</small></button><button data-product-filter="reorder" aria-pressed="'+(state.productFilter==='reorder')+'"><span>Reposição em atenção '+arrow+'</span><strong>'+stock.reorder.length+' '+(stock.reorder.length===1?'produto':'produtos')+'</strong><small>Cobertura estimada de até 3 dias.</small></button></div><p class="stock-context">Estoque da última coleta. Giro calculado de '+range(state.start,state.end)+'.</p>';
    }
  }
  const ratio=(a,b)=>a!=null&&b!=null&&b!==0?a/b:null;
  const percentRatio=(a,b)=>ratio(a,b)==null?null:ratio(a,b)*100;
  function renderAds(){
    if(state.tab==='campanhas'){renderCampaigns();return;}
    $('#metrics').innerHTML=metric('Resultado atribuído aos Ads<button class="info-button" data-ads-info aria-label="Como calculamos o resultado atribuído"><span>i</span></button>',money(current.adResult),current.adResult==null?'Dados pendentes':comparable?delta(current.adResult,previous.adResult):'',action('Ver cálculo','data-ads-info',true),current.adResult<0?'negative':'')+metric('Gasto em publicidade',money(current.ads),pct(percentRatio(current.ads,current.net))+' da receita da loja','Investimento isolado não indica melhora ou piora.')+metric('Receita atribuída aos Ads',money(current.adRevenue),num(current.adUnits)+' unidades atribuídas','ROAS '+(ratio(current.adRevenue,current.ads)?.toFixed(1).replace('.',',')||'--')+'× · ACOS '+pct(percentRatio(current.ads,current.adRevenue)));
    const rows=current.products.filter(p=>p.ads>0).filter(p=>state.adFilter!=='negative'||p.adResult!=null&&p.adResult<0).sort((a,b)=>(a.adResult??Infinity)-(b.adResult??Infinity));
    const headline=current.adResult==null?'Complete os custos para avaliar o retorno.':current.adResult<0?'Os custos superaram a receita atribuída aos anúncios.':'Veja quais anúncios sustentam o resultado.';
    $('#page-content').innerHTML='<section class="panel"><div class="ad-note"><span><strong>'+headline+'</strong><br>Resultado após os custos proporcionais às vendas atribuídas.</span><span class="mini-bars" aria-hidden="true"><b></b><b></b><b></b></span></div><div class="toolbar"><h2 style="font-size:14px">Por anúncio</h2><div class="filter-chips" role="group" aria-label="Filtrar anúncios em publicidade"><button data-ad-filter="all" aria-pressed="'+(state.adFilter==='all')+'">Todos</button><button data-ad-filter="negative" aria-pressed="'+(state.adFilter==='negative')+'">Resultado negativo</button></div>'+action('Exportar CSV','data-export="publicidade"')+'</div>'+(rows.length?table(['Produto','Investido','Receita atribuída','Resultado atribuído','ACOS',''],rows.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Investido',value(money(p.ads)))+cell('Receita atribuída',value(money(p.adRevenue)))+cell('Resultado atribuído',value(money(p.adResult),'Após custos e Ads',p.adResult<0?'negative':''))+cell('ACOS',value(pct(percentRatio(p.ads,p.adRevenue))))+rowOpen(p)+'</tr>').join('')):empty('Nenhum anúncio nesta seleção','Altere o filtro para ver os demais produtos.'))+'</section>';
  }
  function renderCampaigns(){
    const groups=M.campaigns(current),negative=groups.filter(c=>c.adResult!=null&&c.adResult<0).length;
    $('#metrics').innerHTML=metric('Campanhas no período',num(groups.length),num(groups.reduce((s,c)=>s+c.products.length,0))+' anúncios com investimento',negative?negative+' '+(negative===1?'campanha com resultado negativo':'campanhas com resultado negativo'):'Campanhas reais da conta conectada.')+metric('Resultado das campanhas',money(current.adResult),current.adResult==null?'Dados pendentes':comparable?delta(current.adResult,previous.adResult):'',action('Ver cálculo','data-ads-info',true),current.adResult<0?'negative':'')+metric('Investimento total',money(current.ads),'Distribuído entre '+groups.length+' campanhas.','Mesmo período e anúncios da visão individual.');
    if(!groups.length){$('#page-content').innerHTML='<section class="panel">'+empty('Nenhuma campanha no período','Não houve investimento em publicidade nesta seleção.')+'</section>';return;}
    const options=[['adRevenue','Receita Ads'],['ads','Investimento'],['adResult','Resultado']],key=state.campaignMetric;
    const available=groups.filter(c=>c[key]!=null),max=Math.max(1,...available.map(c=>Math.abs(c[key]))),bipolar=available.some(c=>c[key]<0),origin=bipolar?50:0,space=bipolar?50:100;
    const bars=groups.map(c=>{const n=c[key],width=n==null?0:Math.abs(n)/max*space,left=n<0?origin-width:origin;return '<button class="campaign-bar-row" data-campaign="'+esc(c.name)+'" aria-label="Ver campanha '+esc(c.name)+': '+money(n)+'"><span class="campaign-bar-label">'+esc(c.name)+'</span><strong class="'+(n<0?'negative':'')+'">'+money(n)+'</strong><span class="campaign-bar-track '+(bipolar?'bipolar':'')+'" aria-hidden="true"><span class="campaign-bar-fill '+(n<0?'negative':'')+'" style="left:'+left+'%;width:'+width+'%"></span></span></button>';}).join('');
    const rows=groups.map(c=>'<tr>'+cell('Campanha','<button class="product-name campaign-name" data-campaign="'+esc(c.name)+'">'+esc(c.name)+'</button><span class="table-sub">'+c.products.length+' '+(c.products.length===1?'anúncio':'anúncios')+'</span>')+cell('Investido',value(money(c.ads)))+cell('Receita atribuída',value(money(c.adRevenue)))+cell('Resultado atribuído',value(money(c.adResult),c.adResult==null?'Dados pendentes':c.adResult<0?'Resultado negativo':'Após custos e Ads',c.adResult<0?'negative':''))+cell('ACOS',value(pct(percentRatio(c.ads,c.adRevenue))))+cell('','<button class="row-open" data-campaign="'+esc(c.name)+'" aria-label="Detalhar campanha '+esc(c.name)+'">'+arrow+'</button>')+'</tr>').join('');
    $('#page-content').innerHTML='<section class="panel campaign-comparison"><div class="panel-heading"><div><h2>Comparar campanhas</h2><p>Selecione uma campanha para ver os anúncios.</p></div><div class="segments" role="group" aria-label="Métrica das campanhas">'+options.map(([id,label])=>'<button data-campaign-metric="'+id+'" aria-pressed="'+(id===key)+'">'+label+'</button>').join('')+'</div></div><div class="campaign-bars" role="group" aria-label="Comparação de '+options.find(([id])=>id===key)[1]+' por campanha">'+bars+'</div><p class="section-footnote">Campanhas importadas do Mercado Livre. '+range(state.start,state.end)+'.</p></section><section class="panel"><div class="panel-heading"><h2>Por campanha</h2>'+action('Exportar CSV','data-export="campanhas"')+'</div>'+table(['Campanha','Investido','Receita atribuída','Resultado atribuído','ACOS',''],rows)+'</section>';
  }
  function renderOpportunities(){
    if(window.NovaiSavedPanel?.enabled&&state.tab==='salvos'){renderExtensionSaved();return;}
    const entries=state.tab==='salvos'?saved.map(s=>({p:productById(s.id),q:M.quote(s),saved:s})):current.products.map(p=>({p,q:null}));
    const visible=entries.filter(({p})=>(p.name+' '+p.itemId).toLowerCase().includes(state.search.toLowerCase()));
    $('#page-content').innerHTML='<div class="opportunity-head"><p>'+(state.tab==='salvos'?'<span class="precify-word">Precify</span> · '+saved.length+' estudos de margem neste navegador.':'Anúncios da conta conectada · simule antes de decidir.')+'</p><label class="search-field">'+icon('search')+'<span class="sr-only">Buscar estudos de produto</span><input id="opportunity-search" type="search" placeholder="Buscar produto" value="'+esc(state.search)+'"></label></div>'+(visible.length?'<div class="saved-grid">'+visible.map(({p,q,saved:s})=>'<article class="saved-card">'+(q?'<span class="profit-dot '+(q.profit<0?'negative':'positive')+'" aria-label="'+(q.profit<0?'Resultado negativo':'Resultado positivo')+'"></span>':'')+'<a class="saved-cover" href="'+esc(p.permalink)+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir '+esc(p.name)+' no Mercado Livre">'+cover(p)+'</a><div class="saved-body"><h3><a href="'+esc(p.permalink)+'" target="_blank" rel="noopener noreferrer">'+esc(p.name)+'</a></h3><span class="saved-id">'+p.itemId+'</span>'+(q?'<div class="saved-numbers"><div><small>Resultado por venda</small><strong class="'+(q.profit<0?'negative':'positive')+'">'+money(q.profit)+'</strong></div><div><small>Margem</small><strong class="'+(q.profit<0?'negative':'positive')+'">'+pct(q.margin)+'</strong></div></div>':'<div class="saved-numbers"><div><small>Preço do anúncio</small><strong>'+money(p.price)+'</strong></div><div><small>Criação</small><span class="age-label '+(p.age>=365?'red':p.age>180?'yellow':'')+'" title="Criado em '+(p.createdAt?date(p.createdAt,true):'Indisponível')+'">'+(p.age==null?'Indisponível':p.age+' Dias')+'</span></div></div>')+'<div class="saved-actions">'+action(q?'Revisar cálculo':'Calcular margem','data-pricing="'+p.id+'"',true)+(q?'<button class="text-button" data-remove-saved="'+p.id+'">Remover</button>':'<span class="status">'+(p.catalog?'Catálogo':'Anúncio avulso')+'</span>')+'</div></div></article>').join('')+'</div>':empty('Nenhum estudo encontrado',state.tab==='salvos'?'Salve uma simulação do Precify para consultar depois.':'Tente outro produto do anúncio.'));
  }
  function renderExtensionSaved(){
    const bridge=window.NovaiSavedPanel;
    if(bridge.status!=='ready'){$('#page-content').innerHTML='<section class="panel">'+empty(bridge.status==='loading'?'Carregando salvos…':'Entre na sua conta Novai','Os cálculos salvos no Precify aparecerão aqui.')+'<div class="dialog-actions" style="padding:0 24px 24px"><button class="button primary" data-extension-account>Entrar na conta</button><button class="button secondary" data-refresh-saved>Atualizar</button></div></section>';return;}
    const items=bridge.items.filter(p=>(p.name+' '+p.itemId).toLowerCase().includes(state.search.toLowerCase()));
    $('#page-content').innerHTML='<div class="opportunity-head"><p><span class="precify-word">Precify</span> · '+bridge.items.length+' estudos salvos.</p><label class="search-field">'+icon('search')+'<span class="sr-only">Buscar estudos de produto</span><input id="opportunity-search" type="search" placeholder="Buscar produto" value="'+esc(state.search)+'"></label></div>'+(items.length?'<div class="saved-grid">'+items.map(p=>'<article class="saved-card"><span class="profit-dot '+(p.profit==null?'unknown':p.profit<0?'negative':'positive')+'" aria-label="'+(p.profit==null?'A calcular':p.profit<0?'Resultado negativo':'Resultado positivo')+'"></span><a class="saved-cover" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer"><img class="cover" src="'+esc(p.image||'')+'" alt="" loading="lazy"></a><div class="saved-body"><h3><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.name)+'</a></h3><span class="saved-id">'+esc(p.itemId)+'</span><div class="saved-numbers"><div><small>Lucro por venda</small><strong class="'+(p.profit<0?'negative':'positive')+'">'+(p.profit==null?'A calcular':money(p.profit))+'</strong></div><div><small>Margem</small><strong class="'+(p.margin<0?'negative':'positive')+'">'+(p.margin==null?'A calcular':pct(p.margin))+'</strong></div></div><div class="saved-actions"><a class="text-button yellow" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">Revisar no anúncio '+arrow+'</a><button class="text-button" data-remove-study="'+esc(p.itemId)+'">Remover</button></div></div></article>').join('')+'</div>':empty('Nenhum estudo encontrado','Adicione um cálculo aos salvos pelo Precify no anúncio.'));imageFallbacks();
  }

  function renderChart(){
    if(!current)return;
    const ads=state.route==='publicidade',options=ads?[['adRevenue','Receita Ads'],['ads','Investimento'],['adResult','Resultado']]:[['gross','Faturamento'],['result','Resultado'],['orders','Vendas']];
    const key=state.chart[state.route]||options[0][0];
    $('#chart-section .segments').innerHTML=options.map(([id,label])=>'<button data-chart="'+id+'" aria-pressed="'+(id===key)+'">'+label+'</button>').join('');
    $('#chart-title').textContent=ads?'Receita, investimento e resultado':'Evolução do período';
    const unavailable=!current.days.length||current.days.some(d=>d[key]==null)||(key==='result'&&current.result==null)||(key==='adResult'&&current.adResult==null);
    $('#chart-empty').textContent='Não há dados completos para este gráfico no período. Acompanhe a coleta e os custos pendentes.';$('#chart-empty').hidden=!unavailable;$('#chart').hidden=unavailable;$('#chart-tooltip').hidden=true;activePoint=-1;
    chartPoints=[];if(unavailable||!current.days.length){$('#chart-dates').innerHTML='';return;}
    const step=Math.max(1,Math.ceil(current.days.length/35));
    for(let i=0;i<current.days.length;i+=step){const group=current.days.slice(i,i+step);chartPoints.push({day:group[0].day,end:group.at(-1).day,value:M.round(group.reduce((sum,r)=>sum+r[key],0))});}
    $('#chart-frequency').textContent=step===1?'Valores diários':'Valores agrupados a cada '+step+' dias';
    const label=options.find(([id])=>id===key)?.[1];$('#chart-container').setAttribute('aria-label','Gráfico de '+label+'. Use as setas para consultar '+chartPoints.length+' valores.');
    chartWidth=$('#chart-container').clientWidth||700;chartHeight=$('#chart-container').clientHeight||195;
    $('#chart').setAttribute('viewBox','0 0 '+chartWidth+' '+chartHeight);
    const high=Math.max(1,...chartPoints.map(p=>p.value))*1.18,low=Math.min(0,...chartPoints.map(p=>p.value))*1.08,span=high-low,left=49,right=chartWidth-5,top=12,bottom=chartHeight-10;
    chartPoints.forEach((p,i)=>{p.x=left+(right-left)*(chartPoints.length===1?.5:i/(chartPoints.length-1));p.y=bottom-(p.value-low)/span*(bottom-top);});
    const compact=n=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n);
    const grid=Array.from({length:4},(_,i)=>{const y=top+(bottom-top)*i/3;return '<line x1="'+left+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" stroke="#ffffff09" stroke-dasharray="3 5"/><text x="0" y="'+(y+3)+'" fill="#92929c" font-size="10">'+compact(high-span*i/3)+'</text>';}).join('');
    const line=chartPoints.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' '),zero=bottom-(0-low)/span*(bottom-top);
    const area=line+' L'+chartPoints.at(-1).x+' '+zero+' L'+chartPoints[0].x+' '+zero+' Z';
    $('#chart').innerHTML='<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#fee800" stop-opacity=".16"/><stop offset="100%" stop-color="#fee800" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#chart-fill)" stroke="none"/><path d="'+line+'" fill="none" stroke="#fee800" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><g id="chart-focus" visibility="hidden"><line id="focus-line" y1="'+top+'" y2="'+bottom+'" stroke="#fee80055"/><circle id="focus-dot" r="4" fill="#fee800" stroke="#1e1e1e" stroke-width="2"/></g>';
    const ticks=[...new Set([0,Math.floor((chartPoints.length-1)/3),Math.floor((chartPoints.length-1)*2/3),chartPoints.length-1])];
    $('#chart-dates').innerHTML=ticks.map(i=>'<span>'+date(chartPoints[i].day)+'</span>').join('');
  }
  function showPoint(i){
    if(!chartPoints.length||$('#chart').hidden)return;activePoint=Math.max(0,Math.min(chartPoints.length-1,i));const p=chartPoints[activePoint],focus=$('#chart-focus');if(!focus)return;
    focus.setAttribute('visibility','visible');$('#focus-line').setAttribute('x1',p.x);$('#focus-line').setAttribute('x2',p.x);$('#focus-dot').setAttribute('cx',p.x);$('#focus-dot').setAttribute('cy',p.y);
    const tip=$('#chart-tooltip'),text=p.day===p.end?date(p.day,true):range(p.day,p.end),key=state.chart[state.route];tip.hidden=false;tip.innerHTML='<small>'+text+'</small><strong>'+(key==='orders'?num(p.value):money(p.value))+'</strong>';
    tip.style.left=Math.max(73,Math.min(chartWidth-73,p.x))+'px';tip.style.top=Math.max(64,p.y-9)+'px';$('#chart-announcement').textContent=text+': '+(key==='orders'?num(p.value):money(p.value));
  }
  function openDialog(kind,html,back=null){
    if(!dialog.open)returnFocus=document.activeElement;
    dialogKind=kind;$('#dialog-content').innerHTML=html;$('#dialog-eyebrow').textContent={product:'SEU PRODUTO',finance:'FINANCEIRO',ads:'PUBLICIDADE',alerts:'PARA REVISAR',pricing:'PRECIFY',expense:'DESPESAS DA OPERAÇÃO',campaign:'PUBLICIDADE'}[kind]||'NOVAI';
    dialog.classList.toggle('precify-dialog',kind==='pricing');
    if(kind==='pricing')$('#dialog-eyebrow').innerHTML='<img src="/painel/assets/precify.png" alt=""><strong>Precify</strong>';
    $('#dialog-back').hidden=!back;$('#dialog-back').onclick=back;
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;imageFallbacks();requestAnimationFrame(fitNumbers);
  }
  function openProduct(id){
    const p=productById(id);if(!p)return;dialogProduct=id;
    const previousProduct=previous.products.find(x=>x.id===id);
    const note=p.unitCost==null?'<div class="inline-note"><span><strong>Custo pendente.</strong> Preencha para avaliar a margem.</span></div>':'';
    openDialog('product','<div class="dialog-product">'+cover(p)+'<div><h2 id="dialog-title">'+esc(p.name)+'</h2><small>'+p.itemId+' · '+esc(p.sku)+'</small><a href="'+esc(p.permalink)+'" target="_blank" rel="noopener noreferrer">Ver anúncio no Mercado Livre '+arrow+'</a></div></div><p class="subtext">'+range(state.start,state.end)+'</p>'+note+'<div class="detail-stats"><div><span>Resultado das vendas</span><strong class="'+(p.result<0?'negative':'')+'">'+money(p.result)+'</strong><small>Após custos e publicidade</small></div><div><span>Margem de contribuição</span><strong class="'+(p.result<0?'negative':'')+'">'+pct(M.margin(p))+'</strong><small>Sobre a receita após estornos</small></div></div><dl class="detail-list"><div><dt>Vendas no período</dt><dd>'+num(p.orders)+' pedidos · '+num(p.units)+' un.</dd></div><div><dt>Variação de vendas</dt><dd>'+(comparable?delta(p.orders,previousProduct.orders):'Sem comparação')+'</dd></div><div><dt>Receita após estornos</dt><dd>'+money(p.net)+'</dd></div><div><dt>Estoque</dt><dd><b>'+num(p.stock)+' unidades</b></dd></div><div><dt>Full / depósito</dt><dd>'+num(p.full)+' / '+(p.stock==null||p.full==null?'--':num(p.stock-p.full))+'</dd></div><div><dt>Cobertura estimada</dt><dd>'+(p.cover==null?'Dados insuficientes para estimar':p.cover+' '+(p.cover===1?'dia':'dias'))+'</dd></div><div><dt>Criado há</dt><dd><span class="age-label '+(p.age>=365?'red':p.age>180?'yellow':'')+'" title="Criado em '+(p.createdAt?date(p.createdAt,true):'Indisponível')+'">'+(p.age==null?'Indisponível':p.age+' Dias')+'</span></dd></div></dl><details><summary>Ver composição do resultado '+arrow+'</summary>'+composition(p)+'</details><form class="cost-form" id="cost-form"><label for="unit-cost">Custo do produto por unidade</label><div class="field cost-field"><span>R$</span><input id="unit-cost" inputmode="decimal" autocomplete="off" value="'+(p.unitCost==null?'':p.unitCost.toFixed(2).replace('.',','))+'" required aria-describedby="cost-help"></div><small id="cost-help">Custos informados são aplicados às vendas do período e ficam salvos na sua conta.</small><label for="product-tax">Imposto sobre a receita (%)</label><div class="field"><input id="product-tax" inputmode="decimal" value="'+(p.taxPercent==null?'':p.taxPercent)+'" placeholder="Informe 0 se isento"></div><p class="form-error" id="cost-error" role="alert"></p><button class="button secondary" type="submit">Atualizar custo</button></form><div class="dialog-actions"><button class="button primary" data-pricing="'+p.id+'"><span class="precify-mark" aria-hidden="true"><img src="/painel/assets/precify.png" alt=""></span>Calcular margem</button></div>');
    $('#cost-form').onsubmit=async e=>{e.preventDefault();const n=parseNumber($('#unit-cost').value),tax=parseNumber($('#product-tax').value);if(n==null||n<0||n>1000000||tax==null||tax<0||tax>100){$('#cost-error').textContent='Informe custo e imposto válidos (0 se isento).';return;}const button=e.submitter;button.disabled=true;try{await api('/cost',{itemId:id,unitCost:M.round(n),taxPercent:tax});await loadSnapshot(true);openProduct(id);toast('Custo atualizado na sua conta.');}catch(err){$('#cost-error').textContent=errorText(err);}finally{button.disabled=false;}};
  }
  function openFinance(){openDialog('finance','<h2 id="dialog-title">Como chegamos ao resultado</h2><p class="subtext">'+range(state.start,state.end)+'</p>'+composition()+'<div class="detail-explanation"><p>Receita após estornos, menos produto, tarifas, impostos, frete do vendedor e publicidade.</p><p>'+(current.incomplete?'Há custo pendente. Valores ausentes não entram como zero.':'Este é o resultado das vendas, antes das despesas fixas e dos ajustes contábeis.')+'</p><p>Valores importados do Mercado Livre e custos informados por você. Campos indisponíveis ficam pendentes.</p></div>'+action('Ver financeiro completo','data-go="financeiro"',true));}
  function openAdsInfo(){
    openDialog('ads','<h2 id="dialog-title">Resultado atribuído aos Ads</h2><p class="subtext">'+range(state.start,state.end)+'</p><div class="detail-stats"><div><span>Receita atribuída</span><strong>'+money(current.adRevenue)+'</strong></div><div><span>Resultado após Ads</span><strong class="'+(current.adResult<0?'negative':'')+'">'+money(current.adResult)+'</strong></div></div><dl class="detail-list"><div><dt>Investido</dt><dd>'+money(current.ads)+'</dd></div><div><dt>ROAS · receita / investimento</dt><dd>'+(ratio(current.adRevenue,current.ads)?.toFixed(2).replace('.',',')||'--')+'×</dd></div><div><dt>ACOS · investimento / receita Ads</dt><dd>'+pct(percentRatio(current.ads,current.adRevenue))+'</dd></div><div><dt>TACoS · investimento / receita da loja</dt><dd>'+pct(percentRatio(current.ads,current.net))+'</dd></div><div><dt>Cliques</dt><dd>'+num(current.clicks)+'</dd></div><div><dt>Conversão dos cliques</dt><dd>'+pct(percentRatio(current.adUnits,current.clicks))+'</dd></div></dl><div class="detail-explanation"><p>Neste cálculo, os custos variáveis são distribuídos proporcionalmente à receita atribuída. Depois descontamos o investimento em publicidade.</p><p>Receita atribuída não comprova vendas adicionais causadas pelos Ads. O cálculo não inclui despesas fixas.</p></div>');
  }
  function openAlerts(){openDialog('alerts','<h2 id="dialog-title">Para revisar</h2><p class="subtext">'+alerts.length+' pendências no período.</p><div class="alert-list">'+alerts.map((a,i)=>task(a,i,true)).join('')+'</div>');}
  function openCampaign(category){
    const list=current.products.filter(p=>(current.campaigns.find(c=>c.name===category)?.products||[]).some(x=>x.id===p.id));
    openDialog('campaign','<h2 id="dialog-title">'+esc(category)+'</h2><p class="subtext">Campanha · '+range(state.start,state.end)+'</p><div class="detail-stats"><div><span>Investido</span><strong>'+money(list.reduce((s,p)=>s+p.ads,0))+'</strong></div><div><span>Receita atribuída</span><strong>'+money(list.reduce((s,p)=>s+p.adRevenue,0))+'</strong></div></div><div class="alert-list">'+list.map(p=>'<button class="task-card" data-product="'+p.id+'">'+cover(p)+'<span class="task-copy"><small>Resultado atribuído</small><strong>'+esc(p.name)+'</strong><span class="'+(p.adResult<0?'negative':'')+'">'+money(p.adResult)+'</span></span>'+arrow+'</button>').join('')+'</div>');
  }
  function openExpense(){
    openDialog('expense','<h2 id="dialog-title">Adicionar despesa</h2><p class="subtext">Custos da operação que não estão nas vendas.</p><form id="expense-form" class="expense-form"><label>Descrição<input class="plain-input" id="expense-name" maxlength="100" required placeholder="Ex.: aluguel do espaço"></label><div class="form-grid"><label>Valor<div class="field"><span>R$</span><input id="expense-value" inputmode="decimal" required placeholder="0,00"></div></label><label>Data<input id="expense-date" type="date" min="'+M.minDay+'" max="'+M.maxDay+'" value="'+state.end+'" required></label></div><label>Categoria<select id="expense-category"><option>Estrutura</option><option>Serviços</option><option>Pessoal</option><option>Outros</option></select></label><label class="checkbox"><input type="checkbox" id="expense-recurring">Repetir mensalmente nesta data</label><p id="expense-error" class="form-error" role="alert"></p><button class="button primary full-width" type="submit">Salvar despesa</button><p class="detail-explanation">A despesa fica salva na sua conta NOVAI.</p></form>');
    $('#expense-form').onsubmit=async e=>{e.preventDefault();const name=$('#expense-name').value.trim(),amount=parseNumber($('#expense-value').value),day=$('#expense-date').value;if(!name||!amount||amount>1000000||day<M.minDay||day>M.maxDay){$('#expense-error').textContent='Confira descrição, valor e data.';return;}e.submitter.disabled=true;try{await api('/expenses',{name,amount:M.round(amount),date:day,category:$('#expense-category').value,recurring:$('#expense-recurring').checked});dialog.close();await loadSnapshot(true);render();toast('Despesa cadastrada.');}catch(err){$('#expense-error').textContent=errorText(err);e.submitter.disabled=false;}};
  }
  function parseNumber(s){s=String(s??'').trim().replace(/R\$|\s/g,'');if(!s)return null;if(s.includes(','))s=s.replaceAll('.','').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null;}
  const field=(id,label,number,unit='R$',required=false)=>'<label>'+label+'<span class="field '+(id==='pc-cost'?'cost-field':'')+'">'+(unit==='R$'?'<span>R$</span>':'')+'<input id="'+id+'" inputmode="decimal" autocomplete="off" value="'+(number==null?'':String(number).replace('.',','))+'" '+(required?'required':'')+' aria-label="'+label+'">'+(unit!=='R$'?'<span>'+unit+'</span>':'')+'</span></label>';
  function openPricing(id,existing=null){
    const p=productById(id);if(!p)return;dialogProduct=id;
    pricing=existing||{price:p.price,cost:p.unitCost,commission:null,fixed:0,shipping:p.unitShipping,tax:p.taxPercent,pack:0,other:0,type:p.listingType,reputation:p.reputation,shippingMode:p.full>0?'Full':'Mercado Envios',weight:null,height:null,width:null,length:null,category:p.category};pricingResult=false;pricingForm();
  }
  function pricingForm(){
    const p=productById(dialogProduct),f=pricing;
    openDialog('pricing','<h2 id="dialog-title" class="sr-only">Precify</h2><p class="pricing-product">'+esc(p.name)+'</p><form id="pricing-form" class="pricing-form" novalidate><div class="form-grid">'+field('pc-price','Preço de venda',f.price,'R$',true)+field('pc-cost','Custo do produto',f.cost,'R$',true)+'</div><details id="pc-ad-section"><summary><span><strong>Anúncio</strong><small>'+(f.type==='premium'?'Premium':'Clássico')+' · '+f.shippingMode+' · imposto '+f.tax+'%</small></span>'+arrow+'</summary><div class="form-grid"><label>Tipo de anúncio<select id="pc-type"><option value="classic" '+(f.type==='classic'?'selected':'')+'>Clássico</option><option value="premium" '+(f.type==='premium'?'selected':'')+'>Premium</option></select></label><label>Reputação<select id="pc-reputation"><option value="">Não informada</option><option value="green">Verde</option><option value="yellow">Amarela</option><option value="red">Vermelha</option></select></label><label>Envio<select id="pc-shipping-mode"><option>Full</option><option>Mercado Envios</option><option>Flex</option></select></label>'+field('pc-tax','Imposto',f.tax,'%')+'</div><div class="form-grid">'+field('pc-fee','Comissão',f.commission,'%')+field('pc-fixed','Tarifa fixa',f.fixed)+field('pc-shipping','Frete do vendedor',f.shipping)+field('pc-other','Outros custos por unidade',f.other)+'</div><p class="detail-explanation">Informe a comissão e confira frete e imposto. A simulação usa os valores que você preencher.</p></details><details id="pc-package"><summary><span><strong>Embalagem</strong><small>Selecione um tamanho ou preencha as medidas.</small></span>'+arrow+'</summary><div class="package-presets" role="group" aria-label="Preenchimento rápido de embalagem">'+['Pequena','Média','Grande'].map((name,i)=>'<button type="button" data-package="'+i+'" aria-pressed="false">'+icon('package')+name+'</button>').join('')+'</div><div class="form-grid">'+field('pc-weight','Peso',f.weight,'g',true)+field('pc-height','Altura',f.height,'cm',true)+field('pc-width','Largura',f.width,'cm',true)+field('pc-length','Comprimento',f.length,'cm',true)+field('pc-pack','Custo da embalagem',f.pack)+'</div></details><details><summary><span><strong>Categoria</strong><small>'+esc(f.category)+'</small></span>'+arrow+'</summary><p class="detail-explanation">'+esc(f.category)+' · categoria do anúncio.</p></details><p class="form-error" id="pricing-error" role="alert"></p><div class="sticky-calculate"><button class="button primary" type="submit">Calcular margem</button></div></form>',()=>openProduct(p.id));
    $('#pc-reputation').value=f.reputation||'';$('#pc-shipping-mode').value=f.shippingMode;
    $('#pricing-form').onsubmit=e=>{e.preventDefault();const next={...pricing};for(const [key,id] of Object.entries({price:'pc-price',cost:'pc-cost',commission:'pc-fee',fixed:'pc-fixed',shipping:'pc-shipping',tax:'pc-tax',other:'pc-other',pack:'pc-pack',weight:'pc-weight',height:'pc-height',width:'pc-width',length:'pc-length'}))next[key]=parseNumber($('#'+id).value);next.type=$('#pc-type').value;next.reputation=$('#pc-reputation').value;next.shippingMode=$('#pc-shipping-mode').value;
      const missing=['weight','height','width','length'].find(k=>!next[k]||next[k]<=0);
      if(!M.quote(next)){ $('#pricing-error').textContent='Confira preço, custo e taxas. O custo do produto é obrigatório.';if(next.cost==null)$('#pc-cost').focus();return;}
      if(missing){$('#pc-package').open=true;$('#pricing-error').textContent='Preencha as medidas ou escolha uma embalagem.';return;}
      pricing=next;pricingResult=true;renderPricingResult();};
    $('#pc-type').onchange=()=>{$('#pc-fee').value='';$('#pricing-error').textContent='Informe a comissão correspondente ao tipo escolhido.';};
  }
  function renderPricingResult(){
    const p=productById(dialogProduct),f=pricing;
    openDialog('pricing','<section class="pricing-result"><h2 id="dialog-title" class="sr-only">Precify</h2><p class="pricing-product">'+esc(p.name)+'</p><div class="pricing-type" role="group" aria-label="Comparar tipos de anúncio"><button data-price-type="classic" aria-pressed="'+(f.type==='classic')+'">Clássico</button><button data-price-type="premium" aria-pressed="'+(f.type==='premium')+'">Premium</button></div><div class="sale-title"><span>Preço de venda</span><small>Edite ou ajuste na barra</small></div><label class="sale-editor"><span>R$</span><span class="sr-only">Preço de venda da simulação</span><input id="sale-editor" inputmode="decimal" autocomplete="off" value="'+f.price.toFixed(2).replace('.',',')+'" aria-label="Preço de venda da simulação"></label><input class="price-range" type="range" id="price-range" aria-label="Ajustar preço de venda" min="1" max="'+Math.max(10,p.base*5,f.price*5).toFixed(2)+'" step="0.01" value="'+f.price+'"><div class="detail-stats"><div><span>Margem</span><strong id="pc-margin"></strong></div><div><span>Resultado por venda</span><strong id="pc-profit"></strong></div></div><details class="costs-toggle"><summary>Ver composição dos custos '+arrow+'</summary><dl class="detail-list" id="pc-breakdown"></dl></details><p class="detail-explanation">Simulação antes dos custos fixos e da publicidade. Frete e taxas editáveis.</p><button class="save-button" id="save-quote"><span>'+icon('bookmark')+'Adicionar aos salvos</span></button></section>',()=>pricingForm());
    updatePricingOutput();
    $('#sale-editor').oninput=()=>{const n=parseNumber($('#sale-editor').value);if(n!=null&&n>0&&n<=1000000){pricing.price=n;$('#price-range').value=n;updatePricingOutput();}else{$('#pc-margin').textContent='--';$('#pc-profit').textContent='--';$('#save-quote').disabled=true;}};
    $('#sale-editor').onblur=()=>{const n=parseNumber($('#sale-editor').value);if(n!=null&&n>0)$('#sale-editor').value=n.toFixed(2).replace('.',',');};
    $('#price-range').oninput=()=>{pricing.price=Number($('#price-range').value);$('#sale-editor').value=pricing.price.toFixed(2).replace('.',',');updatePricingOutput();};
    $('#save-quote').onclick=async()=>{const q=M.quote(pricing);if(!q)return;const button=$('#save-quote');button.disabled=true;try{await api('/saved',{action:'upsert',item:{itemId:p.itemId,url:p.permalink,name:p.name,image:p.image,price:q.price,cost:q.cost,other:q.pack+q.other,type:pricing.type,profit:q.profit,margin:q.margin,shipping:q.shipping,fees:q.fee,tax:q.taxValue}});await window.NovaiSavedPanel.load();button.classList.add('saved');button.innerHTML='<span>'+savedFlag+'Adicionado aos salvos</span>';toast('Adicionado aos salvos',true);}catch(err){toast(errorText(err));button.disabled=false;}};
  }
  function updatePricingOutput(){
    const q=M.quote(pricing);if(!q)return;const tone=q.profit<0?'negative':'positive';$('#pc-margin').textContent=pct(q.margin);$('#pc-profit').textContent=money(q.profit);$('#pc-margin').className=tone;$('#pc-profit').className=tone;$('#save-quote').disabled=false;$('#save-quote').classList.remove('saved');$('#save-quote').innerHTML='<span>'+icon('bookmark')+'Adicionar aos salvos</span>';
    $('#pc-breakdown').innerHTML=[['Custos totais',q.total],['Tarifa ML ('+pct(q.commission)+')'+(q.fixed?' + fixa':' '),q.fee],['Frete do vendedor',q.shipping],['Imposto ('+pct(q.tax)+')',q.taxValue],['Produto e embalagem',q.cost+q.pack],['Outros custos',q.other]].map(([label,n])=>'<div><dt>'+label+'</dt><dd>'+money(n)+'</dd></div>').join('');requestAnimationFrame(fitNumbers);
  }
  function toast(text,savedLink=false,undo=null){
    clearTimeout(toastTimer);undoAction=undo;const node=$('#toast');if(dialog.open)dialog.append(node);else document.body.append(node);node.hidden=false;node.innerHTML='<strong>'+check+esc(text)+'</strong>'+(savedLink?'<a href="#oportunidades/salvos" data-toast-link>Lista de salvos '+arrow+'</a>':'')+(undo?'<button class="undo-button" id="undo-button">Desfazer</button>':'');toastTimer=setTimeout(()=>{$('#toast').hidden=true;},savedLink?8000:5000);
  }
  function exportRows(type){
    let rows;
    if(type==='cancelamentos')rows=[['Data','MLB','Produto','Ocorrência','Valor','Efeito na receita'],...M.cancellationEvents(state.start,state.end).map(r=>[r.day,productById(r.id).itemId,productById(r.id).name,r.type,r.amount,r.effect])];
    else if(type==='campanhas')rows=[['Campanha do anúncio','Anúncios','Investido','Receita atribuída','Resultado atribuído','ACOS (%)','ROAS','Cliques','Unidades atribuídas'],...M.campaigns(current).map(c=>[c.name,c.products.length,c.ads,c.adRevenue,c.adResult,ratio(c.ads,c.adRevenue)==null?null:c.ads/c.adRevenue*100,ratio(c.adRevenue,c.ads),c.clicks,c.adUnits])];
    else if(type==='publicidade')rows=[['MLB','Produto','Campanha do anúncio','Investido','Receita atribuída','Resultado atribuído','ACOS (%)','ROAS','Cliques','Unidades atribuídas'],...current.products.filter(p=>p.ads>0).map(p=>[p.itemId,p.name,(current.campaigns.filter(c=>c.products.some(x=>x.id===p.id)).map(c=>c.name).join(', ')),p.ads,p.adRevenue,p.adResult,ratio(p.ads,p.adRevenue)==null?null:p.ads/p.adRevenue*100,ratio(p.adRevenue,p.ads),p.clicks,p.adUnits])];
    else{const list=type==='produtos'?filteredProducts():current.products;rows=[['MLB','Produto','SKU','Pedidos','Unidades','Receita líquida','Produto (custo)','Tarifas','Impostos','Frete','Publicidade','Resultado','Margem (%)'],...list.map(p=>[p.itemId,p.name,p.sku,p.orders,p.units,p.net,p.cost,p.fees,p.tax,p.shipping,p.ads,p.result,M.margin(p)])];}
    return rows;
  }
  function exportCSV(type){const csv='\ufeff'+exportRows(type).map(row=>row.map(value=>{let v=value==null?'':String(value);if(/^[=+@\-]/.test(v)&&typeof value!=='number')v="'"+v;return '"'+v.replaceAll('"','""')+'"';}).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download='novai-'+type+'-'+state.start+'-'+state.end+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Arquivo exportado.');}
  function fitNumbers(){
    for(const group of $$('.detail-stats'))group.classList.remove('stacked-values');
    for(const el of $$('.metric-value,.detail-stats strong,.sale-editor input')){el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&size>17){size--;el.style.fontSize=size+'px';}if(el.scrollWidth>el.clientWidth+1&&el.closest('.detail-stats')){const group=el.closest('.detail-stats');group.classList.add('stacked-values');for(const value of group.querySelectorAll('strong'))value.style.fontSize='';}}
    for(const el of $$('.donut-center>strong')){el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&size>10){el.style.fontSize=(--size)+'px';}}
  }
  function closeMenus(focus=false){for(const [id,trigger] of [['#period-menu','#period-trigger'],['#demo-menu','#demo-trigger']])if(!$(id).hidden){$(id).hidden=true;$(trigger).setAttribute('aria-expanded','false');if(focus)$(trigger).focus();}}
  for(const [trigger,id] of [['#period-trigger','#period-menu'],['#demo-trigger','#demo-menu']])$(trigger).onclick=()=>{const open=$(id).hidden;closeMenus();$(id).hidden=!open;$(trigger).setAttribute('aria-expanded',String(open));};
  $('#custom-trigger').onclick=()=>{const open=$('#custom-form').hidden;$('#custom-form').hidden=!open;$('#custom-trigger').setAttribute('aria-expanded',String(open));if(open)$('#start').focus();};
  $('#custom-form').onsubmit=e=>{e.preventDefault();const a=$('#start').value,b=$('#end').value;if(!a||!b||a>b||a<M.minDay||b>M.maxDay){$('#date-error').textContent='Selecione um intervalo válido até hoje.';return;}state.start=a;state.end=b;state.period=null;$('#date-error').textContent='';closeMenus(true);render();};
  $('#close-dialog').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{document.body.append($('#toast'));render();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else $('#main').focus({preventScroll:true});});
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menu-wrap'))closeMenus();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenus(true);$('#chart-tooltip').hidden=true;$('#chart-focus')?.setAttribute('visibility','hidden');}});
  document.addEventListener('dblclick',e=>{if(e.target instanceof HTMLInputElement && ['sale-editor','unit-cost','pc-price','pc-cost'].includes(e.target.id)){e.preventDefault();e.target.select();requestAnimationFrame(()=>e.target.select());}});
  function refreshAndFocus(selector){render();$(selector)?.focus({preventScroll:true});}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button,a');if(!b)return;
    if(b.dataset.days){state.period=Number(b.dataset.days);state.end=M.maxDay;state.start=M.shift(M.maxDay,1-state.period);state.ledgerPage=1;closeMenus(true);render();}
    if(b.dataset.coverage){state.missing=b.dataset.coverage==='missing';closeMenus(true);render();}
    if(false&&b.id==='reset-demo'){Object.assign(state.costs,M.defaultCosts());expenses=M.defaultExpenses();saved=seedSaved();state.missing=false;persist();closeMenus(true);render();toast('Dados atualizados.');}
    if(b.dataset.routeTab){state.productFilter='all';location.hash=state.route+'/'+b.dataset.routeTab;}
    if(b.dataset.go){if(dialog.open)dialog.close();location.hash=b.dataset.go;}
    if(b.dataset.product)openProduct(b.dataset.product);
    if(b.dataset.pricing){const existing=state.route==='oportunidades'&&state.tab==='salvos'?saved.find(s=>s.id===b.dataset.pricing):null;openPricing(b.dataset.pricing,existing?{...existing,weight:existing.weight??1000,height:existing.height??15,width:existing.width??20,length:existing.length??30,reputation:existing.reputation||'green',shippingMode:existing.shippingMode||'Full',category:productById(b.dataset.pricing).category}:null);}
    if(b.dataset.alert!=null){const a=(b.dataset.allAlert?alerts:alerts.slice(0,2))[Number(b.dataset.alert)];if(a)openProduct(a.id);}
    if(b.id==='attention-all')openAlerts();
    if(b.hasAttribute('data-finance-info'))openFinance();
    if(b.hasAttribute('data-ads-info'))openAdsInfo();
    if(b.hasAttribute('data-add-expense'))openExpense();
    if(b.dataset.campaign)openCampaign(b.dataset.campaign);
    if(b.dataset.removeStudy){b.disabled=true;void window.NovaiSavedPanel.remove(b.dataset.removeStudy).then(ok=>{if(!ok){b.disabled=false;toast('Não foi possível remover agora.');}});}
    if(b.hasAttribute('data-refresh-saved'))void window.NovaiSavedPanel.load();
    if(b.hasAttribute('data-extension-account'))location.href='/login';
    if(b.dataset.campaignMetric){state.campaignMetric=b.dataset.campaignMetric;renderCampaigns();$('[data-campaign-metric="'+state.campaignMetric+'"]')?.focus({preventScroll:true});imageFallbacks();}
    if(b.dataset.costSlice)selectCostSlice(b.dataset.costSlice);
    if(b.hasAttribute('data-cost-reset')){selectCostSlice(null);$('[data-cost-slice]')?.focus({preventScroll:true});}
    if(b.dataset.export)exportCSV(b.dataset.export);
    if(b.dataset.productFilter){state.productFilter=b.dataset.productFilter;refreshAndFocus('[data-product-filter="'+state.productFilter+'"]');}
    if(b.dataset.adFilter){state.adFilter=b.dataset.adFilter;refreshAndFocus('[data-ad-filter="'+state.adFilter+'"]');}
    if(b.dataset.chart){state.chart[state.route]=b.dataset.chart;renderChart();$('[data-chart="'+b.dataset.chart+'"]')?.focus({preventScroll:true});}
    if(b.dataset.removeExpense){b.disabled=true;void api('/expenses',{action:'remove',id:b.dataset.removeExpense}).then(()=>loadSnapshot(true)).then(()=>{render();toast('Despesa removida.');}).catch(err=>{b.disabled=false;toast(errorText(err));});}
    if(b.dataset.removeSaved){const previousSaved=saved.slice();saved=saved.filter(x=>x.id!==b.dataset.removeSaved);persist();render();toast('Estudo removido.',false,()=>{saved=previousSaved;persist();render();});}
    if(b.id==='undo-button'&&undoAction){undoAction();$('#toast').hidden=true;undoAction=null;}
    if(b.hasAttribute('data-toast-link')){e.preventDefault();if(dialog.open)dialog.close();$('#toast').hidden=true;if(location.hash==='#oportunidades/salvos')render();else location.hash='oportunidades/salvos';}
    if(b.dataset.package!=null){const packages=[[500,10,15,20],[1500,15,25,35],[3000,30,40,60]],values=packages[Number(b.dataset.package)];['weight','height','width','length'].forEach((name,i)=>{$('#pc-'+name).value=values[i];});$$('[data-package]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}
    if(b.dataset.priceType){pricing.type=b.dataset.priceType;pricing.commission=null;pricingForm();}
  });
  document.addEventListener('change',e=>{if(e.target.id==='product-sort'){state.sort=e.target.value;refreshAndFocus('#product-sort');}});
  document.addEventListener('input',e=>{if(!['product-search','opportunity-search'].includes(e.target.id))return;const id=e.target.id,position=e.target.selectionStart;state.search=e.target.value;if(id==='product-search')renderProducts();else renderOpportunities();const input=$('#'+id);input.focus({preventScroll:true});if(position!=null)input.setSelectionRange(position,position);imageFallbacks();});
  const pointAt=e=>{const r=e.currentTarget.getBoundingClientRect();showPoint(Math.round(((e.clientX-r.left)/r.width*chartWidth-49)/(chartWidth-54)*(chartPoints.length-1)));};
  $('#chart-container').addEventListener('pointermove',pointAt);$('#chart-container').addEventListener('pointerdown',pointAt);
  $('#chart-container').addEventListener('pointerleave',()=>{if(document.activeElement!==$('#chart-container')){$('#chart-tooltip').hidden=true;$('#chart-focus')?.setAttribute('visibility','hidden');}});
  $('#chart-container').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showPoint(e.key==='Home'?0:e.key==='End'?chartPoints.length-1:activePoint<0?0:activePoint+(e.key==='ArrowRight'?1:-1));});
  window.addEventListener('resize',()=>{fitNumbers();if(!$('#chart-section').hidden)renderChart();});window.addEventListener('hashchange',setRoute);

  let requestSerial=0,loadingRequest=null,pollTimer=null,lastRevision=-1;
  function errorText(error){return ({session_required:'Entre novamente na sua conta NOVAI.',session_expired:'Sua sessão expirou. Entre novamente.',ml_connection_required:'Conecte sua conta do Mercado Livre para iniciar a coleta.',ml_reconnect_required:'Reconecte o Mercado Livre para continuar a coleta.',ml_account_changed:'A conta conectada mudou. Atualize o painel.',ml_permission_required:'O Mercado Livre não autorizou este recurso.'})[error.code]||'Não foi possível atualizar agora. Seus dados já coletados continuam salvos.';}
  function showError(error){$('#sync-title').textContent=errorText(error);$('#sync-login').hidden=!['session_required','session_expired'].includes(error.code);$('#sync-connect').hidden=!['ml_connection_required','ml_reconnect_required'].includes(error.code);$('#sync-description').textContent='Tente atualizar após resolver a conexão.';$('#sync-progress').hidden=true;}
  function showProgress(p){
    const sources=p.sources||{};
    const stages=[['profile','Loja'],['catalog','Produtos'],['ads','Publicidade'],['orders','Pedidos']].map(([k,label])=>label+': '+(sources[k]?.failed?'com pendências':sources[k]?.ready&&!sources[k]?.pending?'disponível':sources[k]?.completed?'atualizando':'coletando')).join(' · ');
    const blocked=p.jobs?.some(j=>['blocked','retry','unavailable'].includes(j.state));
    $('#sync-title').textContent=p.collecting?'Coletando o histórico da sua loja…':blocked?'Coleta com pendências':'Coleta disponível atualizada';
    $('#sync-description').textContent=p.collecting?`${p.monthsCompleted} de ${p.monthsTotal} meses de pedidos coletados. Você pode navegar; o painel atualiza a cada mês concluído.`:blocked?'Parte dos dados não pôde ser consultada. Os valores disponíveis continuam no painel.':'Dados salvos na sua conta. A coleta continua sendo atualizada em segundo plano.';
    $('#sync-description').textContent+=' '+stages+'. Informações já recebidas aparecem sem esperar os pedidos; valores parciais podem mudar.';
    $('#sync-progress').hidden=!p.collecting;$('#sync-progress').max=Math.max(1,p.monthsTotal);$('#sync-progress').value=p.monthsCompleted;
    $('#sync-coverage').textContent=(p.availableFrom?'Pedidos disponíveis desde '+date(p.availableFrom,true)+'. ':'')+'A API disponibiliza até 12 meses de pedidos e 90 dias de Ads. O histórico coletado fica preservado. Custos ou permissões ausentes aparecem como pendentes.';
    $('#sync-connect').hidden=!p.warnings?.some(x=>['ml_connection_required','ml_reconnect_required'].includes(x));
    if(p.nickname)$('.store strong').textContent=p.nickname;
    if(p.warnings?.includes('ml_permission_required'))$('#sync-coverage').textContent+=' Há um recurso sem permissão de acesso no Mercado Livre.';
    if(p.warnings?.includes('ads_retention_90_days'))$('#sync-coverage').textContent+=' Ads anteriores à janela disponível não puderam ser recuperados.';
  }
  async function loadSnapshot(force=false){
    const key=state.start+state.end;if(loadingRequest?.key===key&&!force)return loadingRequest.promise;
    const serial=++requestSerial;const promise=(async()=>{try{
      const data=await api('/snapshot?start='+state.start+'&end='+state.end);
      if(serial!==requestSerial)return;
      M.setSnapshot(data);expenses=data.expenses;Object.assign(state.costs,M.defaultCosts());lastRevision=data.progress.revision;
      showProgress(data.progress);$('#nav-product-count').textContent=String(data.current.products.length);
      for(const input of [$('#start'),$('#end')]){input.min=data.minDay;input.max=data.maxDay;}
      if(!dialog.open)render();else recalculate();
    }catch(error){showError(error);}finally{if(serial===requestSerial)loadingRequest=null;}})();loadingRequest={key,promise};return promise;
  }
  async function poll(){try{const p=await api('/status');showProgress(p);if(p.revision!==lastRevision)await loadSnapshot(true);}catch(error){showError(error);}finally{pollTimer=setTimeout(poll,10000);}}
  $('#sync-retry').onclick=async()=>{const button=$('#sync-retry');button.disabled=true;try{await api('/sync',{retry:true});await loadSnapshot(true);}catch(error){showError(error);}finally{button.disabled=false;}};
  $('#all-period').onclick=()=>{state.start=M.minDay;state.end=M.maxDay;state.period=null;closeMenus(true);render();};
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  window.addEventListener('storage',e=>{if(e.key==='authToken')location.reload();});
  window.NovaiPanel=Object.freeze({snapshot:()=>({state,current,previous,alerts,expenseRows,expenseTotal}),exportRows});
  window.NovaiSavedPanel.subscribe(()=>{if(state.route==='oportunidades'&&!dialog.open)render();});
  (async()=>{try{await api('/sync',{});}catch(error){showError(error);}await loadSnapshot(true);if(M.snapshot)setRoute();void window.NovaiSavedPanel.load();pollTimer=setTimeout(poll,10000);})();
})();
