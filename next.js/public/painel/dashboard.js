(async () => {
  'use strict';
  const M=window.NovaiPanelModel,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const money=n=>n==null||!Number.isFinite(n)?'--':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n===0?0:n);
  const num=n=>n==null?'--':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(n===0?0:n);
  const pct=n=>n==null||!Number.isFinite(n)?'--':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n)+'%';
  const date=(s,year=false)=>M.utc(s).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).replaceAll('.','');
  const range=(a,b)=>date(a)+' – '+date(b,true);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=n=>'<i data-icon="'+n+'" aria-hidden="true"></i>',arrow='<span class="chevron" aria-hidden="true"></span>';
  const check='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktopLayout=window.matchMedia('(min-width: 761px)');
  const productPageSize=5;
  const panelAnimations=new WeakMap();
  function revealPanel(element,{offset=0,opacity=.82,duration=160}={}){
    if(element.hidden||!element.animate)return;
    panelAnimations.get(element)?.cancel();
    if(reducedMotion.matches)return;
    const frames=offset
      ?[{opacity,transform:'translateY('+offset+'px)'},{opacity:1,transform:'translateY(0)'}]
      :[{opacity},{opacity:1}];
    panelAnimations.set(element,element.animate(frames,{duration,easing:'cubic-bezier(.2,.75,.25,1)'}));
  }
  const savedFlag='<svg class="saved-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V5a2 2 0 0 1 2-2h9v18l-5.5-4z"/></svg>';
  const api=window.NovaiDashboardApi;
  await M.ready;
  const storageKey='novai-panel-v4';
  const validNumber=n=>Number.isFinite(n)&&n>=0&&n<=1000000;
  let stored=structuredClone(M.data);
  const costs=M.defaultCosts();for(const p of M.products)if(validNumber(stored?.costs?.[p.id]))costs[p.id]=stored.costs[p.id];
  const productSettings={};
  let listingUpdates={};
  for(const {id}of M.products){const entry=stored.listingUpdates?.[id];if(entry&&validNumber(entry.price)&&entry.price>0)listingUpdates[id]={price:entry.price};}
  const selectedProducts=new Set();
  const financeFilters={query:'',cost:'all',result:'all'};
  let financeFiltersOpen=false;
  let financeSort="units-desc";
  const financeSortOptions=[["units-desc","Mais vendidos"],["units-asc","Menos vendidos"],["revenue-desc","Maior receita"],["result-desc","Maior resultado"],["result-asc","Menor resultado"]];
  function financeProducts(total){
    const list=total.products.filter(p=>p.units>0);
    if(!desktopLayout.matches)return list;
    const key=financeSort.startsWith("units")?"units":financeSort.startsWith("revenue")?"net":"result",direction=financeSort.endsWith("asc")?1:-1;
    return list.sort((a,b)=>a[key]==null&&b[key]!=null?1:b[key]==null&&a[key]!=null?-1:(a[key]==null?0:direction*(a[key]-b[key]))||a.name.localeCompare(b.name,"pt-BR"));
  }
  function financeSortControl(){
    const label=financeSortOptions.find(([id])=>id===financeSort)[1];
    return '<div class="menu-wrap product-sort-wrap"><button type="button" id="finance-sort" class="product-sort" aria-expanded="false" aria-controls="finance-sort-menu" aria-label="Ordenar vendas por produto: '+label+'">'+label+' <span class="chevron down" aria-hidden="true"></span></button><div class="dropdown product-sort-menu" id="finance-sort-menu" role="group" aria-label="Ordenar vendas por produto" hidden>'+financeSortOptions.map(([id,name])=>'<button type="button" data-finance-sort="'+id+'" aria-pressed="'+(id===financeSort)+'">'+name+' <span aria-hidden="true">✓</span></button>').join('')+'</div></div>';
  }
  for(const {id} of M.products){
    const entry=stored?.productSettings?.[id];
    if(entry)productSettings[id]={
      taxRate:validNumber(entry.taxRate)&&entry.taxRate<=100?entry.taxRate:null,
      manageStock:entry.manageStock===true,
      ...(Number.isInteger(entry.warehouseStock)&&validNumber(entry.warehouseStock)?{warehouseStock:entry.warehouseStock}:{}),
    };
  }
  const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(M.utc(s).getTime())&&M.utc(s).toISOString().slice(0,10)===s;
  const safeExpense=e=>e&&typeof e.id==='string'&&e.id.length<100&&typeof e.name==='string'&&e.name.trim().length>0&&e.name.length<=100&&validNumber(e.amount)&&e.amount>0&&validDay(e.date)&&e.date>=M.minDay&&e.date<='2099-12-31'&&(!e.installments||Number.isInteger(e.installments)&&e.installments>=2&&e.installments<=120);
  let expenses=Array.isArray(stored.expenses)?stored.expenses.filter(safeExpense).map(e=>({...e,recurring:e.recurring===true})):M.defaultExpenses();
  const defaultExpenseCategories=['Comissões','Encargos Sociais','Gerais','Marketing','Mercado Livre','Prestadores de Serviço','Remunerações e Pessoal','Rendimentos','Utilidades (Luz/Água/Internet etc)','Equipamentos','Estrutura','Serviços','Pessoal','Outros'];
  const validCategory=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=60;
  const expenseCategoryKey=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  let expenseCategories=[...new Set([...defaultExpenseCategories,...(Array.isArray(stored.expenseCategories)?stored.expenseCategories.filter(validCategory):[]),...expenses.map(e=>e.category).filter(validCategory)])];
  let expenseEditId=null;
  const expenseDraft={name:'',amount:'',date:M.maxDay,category:'',expenseType:'fixed',recurring:false,frequency:'monthly',installments:'12'};
  const expandedExpenseMonths=new Set();
  const precifySamples=[];
  let saved=[];
  const state={route:'resumo',tab:'',start:M.shift(M.maxDay,-6),end:M.maxDay,period:7,missing:false,costs,search:'',productFilter:'all',catalogCostFilter:'all',catalogTaxFilter:'all',sort:'attention',adFilter:'all',campaignMetric:'roas',ledgerPage:1,productPage:1,expenseView:'annual',expenseYear:Number(M.maxDay.slice(0,4)),adSelection:['adUnits','roas','adRevenue'],chart:{resumo:'gross',publicidade:'roas'}};
  let current,previous,alerts=[],comparable=true,expenseRows=[],expenseTotal=0,chartPoints=[],chartWidth=700,chartHeight=195,activePoint=-1;
  let returnFocus=null,dialogKind=null,dialogProduct=null,pricing=null,pricingResult=false,toastTimer=null,undoAction=null;
  const imageOverrides=new Map(),dialog=$('#detail-dialog'),dreDialog=$('#dre-expanded-dialog');
  const dreOpenGroups=new Set(['salesCosts']);let dreRefreshStatus='',dreStatusTimer;
  let saving=false;
  const persist=async(changes={})=>{
    if(saving){toast('Aguarde o salvamento em andamento.');return false;}
    saving=true;
    try {const ok=await M.persist({costs:state.costs,productSettings,expenses,expenseCategories,listingUpdates,...changes});
      if(!ok)toast(M.error?.code==='preferences_changed'?'Os cadastros mudaram em outra aba. Atualize a página antes de salvar.':'Não foi possível salvar na sua conta. Tente novamente.');
      return ok;
    }finally{saving=false;}
  };
  const productById=id=>current.products.find(p=>p.id===id);
  const listingPrice=p=>p.price;
  const precifyProductById=id=>productById(id)||precifySamples.find(p=>p.id===id);
  const cover=p=>'<img class="cover" src="'+esc(imageOverrides.get(p.id)||p.image)+'" alt="" width="48" height="48" loading="lazy" decoding="async">';
  function imageFallbacks(){for(const img of $$('img.cover'))img.onerror=()=>{const span=document.createElement('span');span.className='cover cover-fallback';span.innerHTML=icon('package');img.replaceWith(span);};}
  function delta(value,before,informational=false,lowerIsBetter=false){
    if(value==null||before==null||before===0)return '<span class="delta neutral">Sem comparação</span>';
    const change=(value-before)/Math.abs(before)*100;if(Math.abs(change)<.05)return '<span class="delta neutral">Sem variação</span>';
    const fell=change<0;
    const tone=informational?'informational':fell!==lowerIsBetter?'negative':'positive';
    return '<span class="delta '+tone+'"><span class="delta-circle"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="'+(fell?'M6 2v8m-3-3 3 3 3-3':'M6 10V2M3 5l3-3 3 3')+'"/></svg></span>'+(fell?'−':'+')+pct(Math.abs(change))+'</span>';
  }
  function metric(label,value,meta='',foot='',tone='',trend=''){
    const amount='<strong class="metric-value '+tone+'">'+value+'</strong>';
    const valueRow=trend?'<div class="metric-value-row">'+amount+'<span class="metric-trend">'+trend+
      '<span class="sr-only"> em relação ao período anterior</span></span></div>':amount;
    return '<article class="metric"><div class="metric-label">'+label+'</div>'+valueRow+
      '<div class="metric-meta">'+meta+'</div><div class="metric-foot">'+foot+'</div></article>';
  }
  const action=(label,attrs='',yellow=false)=>'<button class="text-button '+(yellow?'yellow':'')+'" '+attrs+'>'+label+' '+arrow+'</button>';
  const productName=p=>'<div class="product-cell">'+cover(p)+'<div><button class="product-name" data-product="'+p.id+'">'+esc(p.name)+'</button><span class="product-caption">'+esc(p.sku)+' · '+p.itemId+'</span></div></div>';
  const cell=(label,value)=>'<td data-label="'+label+'">'+value+'</td>';
  const value=(a,b='',tone='')=>'<strong class="table-value '+tone+'">'+a+'</strong>'+(b?'<span class="table-sub">'+b+'</span>':'');
  const status=(text,tone='')=>'<span class="status '+tone+'"><span class="status-dot"></span>'+text+'</span>';
  function table(headers,rows,cls=''){return '<div class="table-wrap"><table class="data-table '+cls+'"><thead><tr>'+headers.map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';}
  const rowOpen=p=>cell('', '<button class="row-open" data-product="'+p.id+'" aria-label="Ver detalhes de '+esc(p.name)+'">'+arrow+'</button>');
  const empty=(title,description)=>'<div class="empty">'+icon('search')+'<strong>'+title+'</strong>'+description+'</div>';
  function recalculate(){
    current=M.aggregate(state.start,state.end,state.costs,state.missing,productSettings);
    const beforeStart=M.shift(state.start,-M.daysBetween(state.start,state.end));comparable=beforeStart>=M.minDay;
    previous=M.aggregate(beforeStart,M.shift(state.start,-1),state.costs,state.missing,productSettings);
    alerts=M.alerts(current,previous,M.daysBetween(state.start,state.end),comparable);
    expenseRows=M.expenseEntries(expenses,state.start,state.end);expenseTotal=M.round(expenseRows.reduce((s,e)=>s+e.amount,0));
  }
  function task(a,index,all=false){
    const p=productById(a.id),isCost=a.type==='cost',isStock=a.type==='stock',stock=isStock?M.inventoryStatus(p,a.location||'full'):null,critical=a.type==='loss'||stock?.tone==='bad';
    const detail=a.type==='loss'?'<b class="negative">'+pct(a.value)+'</b> · prejuízo':isCost?'Complete para conferir o resultado.':a.type==='decline'?'Vendas <b class="negative">'+pct(a.value)+'</b> no período.':isStock?'<b>'+num(stock.quantity)+' '+(stock.quantity===1?'unidade':'unidades')+' no '+stock.name+'</b>'+(stock.cover==null||stock.quantity===0?'':' · '+num(stock.cover)+' '+(stock.cover===1?'dia':'dias')+' de cobertura estimada'):'Estoque disponível, sem vendas no período.';
    return '<button class="task-card'+(critical?' task-critical':'')+(isStock?' '+(stock.tone==='bad'?'stock-empty':'stock-attention'):'')+'" data-alert="'+index+'" '+(all?'data-all-alert="true"':'')+'>'+(isCost?'<span class="task-symbol">'+icon('receipt-2')+'</span>':cover(p))+'<span class="task-copy"><small>'+(isStock?stock.label:a.title)+'</small><strong>'+(isCost?a.count+' produto'+(a.count>1?'s':'')+' sem custo':esc(p.name))+'</strong><span>'+detail+'</span></span><span class="task-action">'+(isCost?'Cadastrar custo':isStock?(stock.location==='full'?'Revisar Full':'Revisar Depósito'):'Revisar')+' '+arrow+'</span></button>';
  }
  function renderAttention(){
    $('#tasks-section').hidden=state.route!=='resumo'||!alerts.length;$('#attention-count').textContent='('+alerts.length+')';
    const previewAlerts=(desktopLayout.matches?alerts.filter(a=>a.type!=='stock'):alerts).slice(0,2);
    if(desktopLayout.matches)for(const stock of alerts.filter(a=>a.type==='stock'))if(!previewAlerts.includes(stock))previewAlerts.push(stock);
    $('#attention-list').dataset.stockPreview=String(previewAlerts.length>2);$('#attention-list').dataset.alertCount=previewAlerts.length;
    $('#attention-list').innerHTML=previewAlerts.map(a=>task(a,alerts.indexOf(a),true)).join('');
  }
  const routeTabs={financeiro:[['resumo','Resumo'],['cancelamentos','Cancelamentos'],['despesas','Gestão financeira'],['dre','DRE']],anuncios:[['lista','Meus anúncios'],['desempenho','Desempenho'],['catalogo','Catálogo']],publicidade:[['anuncios','Anúncios'],['campanhas','Campanhas']],oportunidades:[['salvos','Salvos do Precify'],['avaliar','Avaliar produtos']],ferramentas:[['ean','Gerador de EAN']]};
  if(window.NovaiSavedPanel?.enabled)routeTabs.oportunidades=[['salvos','Salvos do Precify']];
  const titles={resumo:['VISÃO DA LOJA','Resumo'],financeiro:['ENTRADAS, CUSTOS E RESULTADO','Financeiro'],produtos:['CADASTRO POR SKU','Produtos'],anuncios:['SUA OPERAÇÃO','Anúncios'],estoque:['ESTOQUE E FULL','Gestão de estoque'],publicidade:['INVESTIMENTO E RETORNO','Publicidade'],oportunidades:['ESTUDE ANTES DE DECIDIR','Precify'],ferramentas:['UTILITÁRIOS','Ferramentas'],configuracoes:['SUA CONTA','Configurações'],conexoes:['SUA CONTA','Conexões']};
  function setRoute(){
    const focusedTab=document.activeElement?.dataset.routeTab;
    let [raw,tab]=(location.hash.slice(1)||'resumo').split('/');
    if(raw==='financeiro'&&tab==='dre'&&!desktopLayout.matches){tab='resumo';history.replaceState(null,'','#financeiro/resumo');}
    if(raw==='financeiro'&&tab==='vendas'){tab='resumo';history.replaceState(null,'','#financeiro/resumo');}
    if(raw==='produtos'&&['desempenho','estoque','catalogo'].includes(tab)){
      raw='anuncios';
      history.replaceState(null,'','#anuncios/'+tab);
    }
    if(raw==='anuncios'&&tab==='estoque'){
      raw='estoque';tab='estoque';history.replaceState(null,'','#estoque');
    }
    state.route=titles[raw]?raw:'resumo';state.tab=routeTabs[state.route]?.some(([id])=>id===tab)?tab:routeTabs[state.route]?.[0][0]||'';
    if(state.route==='estoque'){state.tab='estoque';state.sort='stock';}
    state.productFilter=state.route==='estoque'?({'reposicao-full':'reorder-full','reposicao-deposito':'reorder-warehouse'}[tab]||'all'):'all';
    closeMenus();
    state.search='';state.ledgerPage=1;state.productPage=1;render();window.scrollTo(0,0);
    if($('#page-content').childElementCount)revealPanel($('#page-content'),{offset:4,duration:170});
    if(focusedTab)$('[data-route-tab][aria-current="page"]')?.focus({preventScroll:true});
  }
  function render(){
    if(!desktopLayout.matches&&state.route==='financeiro'&&state.tab==='dre'){state.tab='resumo';history.replaceState(null,'','#financeiro/resumo');}
    recalculate();
    const [eyebrow,title]=titles[state.route];
    $('#page-eyebrow').textContent=eyebrow;
    $('#page-title-label').textContent=title;
    $('#page-precify-mark').hidden=state.route!=='oportunidades';
    $('#metrics').dataset.section=state.route;
    $('#main').dataset.page=state.route;
    $('#main').dataset.financeOverview=String(state.route==='financeiro'&&state.tab==='resumo'&&desktopLayout.matches);
    $('#finance-controls').hidden=true;
    document.title=title+' · Painel da Novai';
    const realSaved=window.NovaiSavedPanel?.enabled&&state.route==='oportunidades';
    $('.demo-wrap').hidden=true;$('#nav-product-count').textContent=String(M.products.length);$('.page-footer>span:first-child').textContent=realSaved?'Estudos salvos na extensão.':'Dados da conta conectada.';
    for(const a of $$('[data-nav]')){const active=a.dataset.nav===state.route;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    $('#more-trigger').classList.toggle('active',['financeiro','publicidade','oportunidades','ferramentas','conexoes','configuracoes'].includes(state.route));
    $('#period-label').textContent=state.period?'Últimos '+state.period+' dias':'Personalizado';$('#period-range').textContent=range(state.start,state.end);
    $('.data-caption').textContent='Até '+date(state.end,true);
    const catalogSetup=state.route==='produtos',annual=desktopLayout.matches&&state.route==='financeiro'&&(state.tab==='dre'||state.tab==='despesas'&&state.expenseView==='annual');
    $('#finance-year-control').hidden=!annual;$('#main').dataset.expenseAnnual=String(annual);
    if(annual){const last=Math.max(new Date().getFullYear()+1,...expenses.map(e=>Number(e.date.slice(0,4))+Math.ceil((e.installments||0)/12)));$('#expense-year').innerHTML=Array.from({length:last-Number(M.minDay.slice(0,4))+1},(_,i)=>{const y=Number(M.minDay.slice(0,4))+i;return '<option value="'+y+'"'+(y===state.expenseYear?' selected':'')+'>'+y+'</option>';}).join('');}
    $('#start').value=state.start;$('#end').value=state.end;$('.period-wrap').hidden=['oportunidades','ferramentas','conexoes','configuracoes'].includes(state.route)||catalogSetup||annual;
    $$('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===state.period)));
    $('#custom-trigger').setAttribute('aria-current',String(!state.period));
    $$('[data-coverage]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.coverage==='missing')===state.missing)));
    const activeTab=state.tab;
    $('#route-tabs').hidden=!routeTabs[state.route]||state.route==='ferramentas';$('#route-tabs').innerHTML=(routeTabs[state.route]||[]).map(([id,label])=>'<a'+(state.route==='financeiro'&&id==='dre'?' class="dre-nav-desktop"':'')+' href="#'+state.route+'/'+id+'" data-route-tab="'+id+'"'+(id===activeTab?' aria-current="page"':'')+'>'+(state.route==='financeiro'&&id==='resumo'?'<span class="finance-desktop-label">Resumo</span><span class="finance-mobile-label">Vendas</span>':label)+'</a>').join('');
    $('#metrics').hidden=['produtos','anuncios','estoque','oportunidades','ferramentas','conexoes','configuracoes'].includes(state.route);
    const comparisonNote=$('#comparison-note');
    comparisonNote.hidden=['oportunidades','anuncios','estoque','ferramentas','conexoes','configuracoes'].includes(state.route)||catalogSetup||annual;
    comparisonNote.textContent=comparable?'Comparação com '+range(M.shift(state.start,-M.daysBetween(state.start,state.end)),M.shift(state.start,-1))+'.':'Sem período anterior completo disponível.';
    renderAttention();
    $('#chart-section').hidden=!['resumo','publicidade'].includes(state.route);
    $('#page-content').innerHTML='';
    if(state.route==='resumo')renderSummary();
    if(state.route==='financeiro')renderFinance();
    if(state.route==='produtos')renderProducts();
    if(state.route==='anuncios')renderListings();
    if(state.route==='estoque')renderListingAnalysis();
    if(state.route==='publicidade')renderAds();
    if(state.route==='oportunidades')renderOpportunities();
    if(state.route==='ferramentas')renderEAN();
    if(state.route==='conexoes')renderConnections();
    if(state.route==='configuracoes')renderSettings();
    renderConnectionNotice();
    if(state.route==='resumo'||$('#main').dataset.financeOverview==='true')$('#metrics').append(comparisonNote);
    else $('#metrics').after(comparisonNote);
    $('.page-footer').hidden=['ferramentas','conexoes','configuracoes'].includes(state.route);
    $('#footer-context').textContent=state.route==='oportunidades'?'Salvos compartilhados com a extensão e o Precify.':state.route==='publicidade'?'Resultado atribuído após custos e Ads, antes das despesas fixas.':'Resultado das vendas antes das despesas fixas.';
    if(annual)$('#footer-context').textContent='Resultado gerencial após despesas cadastradas · dados recebidos até agora.';
    if(!$('#chart-section').hidden)renderChart();
    renderPageExport();
    imageFallbacks();requestAnimationFrame(fitNumbers);$('#announcement').textContent=['ferramentas','conexoes','configuracoes'].includes(state.route)?title+' carregadas.':annual?title+' atualizado para o ano de '+state.expenseYear+'.':title+' atualizado para '+range(state.start,state.end)+'.';
  }
  function renderPageExport(){
    const type=state.route==='resumo'?'resumo':state.route==='financeiro'?(state.tab==='despesas'?'despesas':state.tab==='dre'?'dre':state.tab==='cancelamentos'?'cancelamentos':'financeiro'):
      state.route==='produtos'?'cadastro':state.route==='anuncios'?(state.tab==='lista'?'anuncios':'produtos'):state.route==='estoque'?'produtos':
      state.route==='publicidade'?(state.tab==='campanhas'?'campanhas':'publicidade'):null;
    const button=$('#page-export');button.hidden=!type;
    if(type){button.dataset.export=type;button.setAttribute('aria-label','Exportar CSV · '+$('#page-title-label').textContent);}
    else delete button.dataset.export;
  }
  function resultMetric(total=current,before=previous){return metric((total.result==null?'Resultado parcial':'Resultado das vendas')+'<button class="info-button" data-finance-info aria-label="Como calculamos o resultado"><span>i</span></button>',money(total.result),total.result==null?'Dados ou custos pendentes':'<span class="margin-context">'+pct(M.margin(total))+' de margem</span>',action('Ver composição','data-finance-info'),total.result!=null&&total.result<0?'negative':'',total.result!=null&&comparable?delta(total.result,before.result):'');}
  function renderSummary(){
    $('#metrics').innerHTML=resultMetric()+
      metric('Faturamento',money(current.gross),'',num(current.orders)+' pedidos pagos','',comparable?delta(current.gross,previous.gross):'')+
      metric('Gasto em publicidade',money(current.ads),pct(current.net?current.ads/current.net*100:null)+' da receita líquida',action('Ver publicidade','data-go="publicidade"'),'',comparable?delta(current.ads,previous.ads,true):'');
  }
  function composition(total=current){return '<div class="composition">'+[['Faturamento',total.gross],['Cancelamentos',total.cancelled==null?null:-total.cancelled],['Reembolsos',total.refunded==null?null:-total.refunded],['Custo dos produtos',total.cost==null?null:-total.cost],['Tarifas de venda',total.fees==null?null:-total.fees],['Impostos',total.tax==null?null:-total.tax],['Frete do vendedor',total.shipping==null?null:-total.shipping],['Publicidade',total.ads==null?null:-total.ads]].map(([label,n])=>'<div><span>'+label+'</span><strong>'+money(n)+'</strong></div>').join('')+'<div class="result-line"><span>Resultado das vendas</span><strong class="'+(total.result<0?'negative':'')+'">'+money(total.result)+'</strong></div></div>';}
  function costChart(total=current){
    const data=M.costBreakdown(total),circumference=2*Math.PI*70;let offset=0;
    if(!data.total)return '<div class="empty">Nenhum custo registrado neste período.</div>';
    const slices=data.parts.map(p=>{const length=p.share/100*circumference,svg='<circle data-cost-arc="'+p.key+'" cx="100" cy="100" r="70" fill="none" stroke="'+p.color+'" stroke-width="24" stroke-dasharray="'+length+' '+(circumference-length)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 100 100)"/>';offset+=length;return svg;}).join('');
    return '<div class="cost-distribution" data-total="'+data.total+'" data-complete="'+data.complete+'"><div class="donut-wrap"><svg class="cost-donut" viewBox="0 0 200 200" role="img" aria-label="Distribuição dos custos das vendas: '+data.parts.map(p=>p.label+' '+pct(p.share)).join(', ')+'."><title>Composição dos custos das vendas</title>'+slices+'</svg><div class="donut-center"><span id="cost-chart-label">'+(data.complete?'Custos das vendas':'Custos conhecidos')+'</span><strong id="cost-chart-value">'+money(data.total)+'</strong><small id="cost-chart-share">100% dos custos '+(data.complete?'':'conhecidos')+'</small></div></div><div class="cost-legend" role="group" aria-label="Detalhar custos">'+data.parts.map(p=>'<button data-cost-slice="'+p.key+'" data-value="'+p.value+'" data-share="'+p.share+'" data-name="'+esc(p.label)+'" aria-pressed="false"><span class="cost-swatch" style="--swatch:'+p.color+'"></span><span>'+p.label+'</span><strong>'+pct(p.share)+'</strong></button>').join('')+'<button class="cost-reset" data-cost-reset hidden>Ver total '+arrow+'</button></div></div>'+(!data.complete?'<p class="section-footnote">Custo de produto pendente. O gráfico mostra apenas os custos conhecidos.</p>':'');
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
      $('#metrics').innerHTML=metric('Receita cancelada',money(current.cancelled),num(current.cancelledOrders)+' pedidos','Pedidos cancelados no período.')+metric('Reembolsos',money(current.refunded),'Devoluções parciais','Já descontados do resultado das vendas.')+metric('Perda após o envio',money(current.lossAfterShipping),'Dado ainda indisponível','Diferente de receita cancelada.');
      const records=M.cancellationEvents(state.start,state.end);
      const rows=records.map(r=>{const p=productById(r.id);return '<tr>'+cell('Produto',productName(p))+cell('Data',value(date(r.day)))+cell('Ocorrência',value(r.type))+cell('Valor',value(money(r.amount)))+cell('Efeito na receita',value(money(r.effect),r.type==='Cancelamento'?'Antes do envio':'Estorno parcial'))+rowOpen(p)+'</tr>';});
      $('#page-content').innerHTML='<section class="panel"><div class="panel-heading"><div><h2>Ocorrências no período</h2><p>Receita cancelada e dinheiro devolvido aparecem separados.</p></div>'+action('Exportar CSV','data-export="cancelamentos"')+'</div>'+(rows.length?table(['Produto','Data','Ocorrência','Valor','Efeito na receita',''],rows.join('')):empty('Nenhuma ocorrência','Não há cancelamentos ou reembolsos no período.'))+'</section>';return;
    }
    if(state.tab==='despesas'){
      if(desktopLayout.matches){renderExpenseDesktop();return;}
      const operational=current.result==null?null:M.round(current.result-expenseTotal);
      $('#metrics').innerHTML=metric('Resultado após despesas',money(operational),'Considera os cadastros abaixo.','Confira se todas as despesas foram registradas.',operational<0?'negative':'')+metric('Resultado das vendas',money(current.result),pct(M.margin(current))+' de margem',action('Ver composição','data-finance-info'))+metric('Despesas da operação',money(expenseTotal),num(expenseRows.length)+' lançamentos no período',action('Cadastrar despesa','data-add-expense',true));
      const rows=expenseRows.map(e=>'<tr>'+cell('Descrição','<strong class="table-value">'+esc(e.name)+'</strong><span class="table-sub">'+esc(e.category)+'</span>')+cell('Data',value(date(e.occurrence,true)))+cell('Recorrência',value(e.recurring?'Mensal':'Uma vez'))+cell('Valor',value(money(e.amount)))+cell('','<button class="icon-button" data-remove-expense="'+esc(e.id)+'" aria-label="Remover despesa '+esc(e.name)+'"><svg viewBox="0 0 24 24"><path d="m7 7 10 10M7 17 17 7"/></svg></button>')+'</tr>').join('');
      $('#page-content').innerHTML='<section class="panel"><div class="panel-heading"><div><h2>Despesas registradas</h2><p>Competência pela data do lançamento.</p></div><button class="button primary" data-add-expense>Adicionar despesa</button></div>'+(rows?table(['Descrição','Data','Recorrência','Valor',''],rows):empty('Nenhuma despesa no período','Cadastre custos da operação para completar o resultado.'))+'<p class="section-footnote">Despesas mensais entram na data de vencimento, sem rateio automático por dia.</p></section>';return;
    }
    if(state.tab==='dre'){renderDre();return;}
    if(desktopLayout.matches){renderFinanceSummary();return;}
    const totalCosts=current.result==null?null:M.round(current.net-current.result),operational=current.result==null?null:M.round(current.result-expenseTotal);
    $('#metrics').innerHTML=resultMetric()+metric('Receita após estornos',money(current.net),num(current.orders)+' pedidos pagos','Faturamento menos cancelamentos e reembolsos.','',comparable?delta(current.net,previous.net):'')+metric('Custos das vendas',money(totalCosts),pct(current.net?totalCosts/current.net*100:null)+' da receita líquida','Inclui produto, tarifas, impostos, frete e Ads.');
    $('#page-content').innerHTML='<div class="finance-grid"><section class="panel"><div class="panel-heading"><h2>Composição do resultado</h2></div>'+composition()+'</section><section class="panel cost-panel"><div class="panel-heading"><div><h2>Para onde vai o dinheiro</h2><p>Participação de cada custo nas vendas.</p></div></div>'+costChart()+'<div class="operation-summary"><div><span>Resultado após despesas</span><strong class="'+(operational<0?'negative':'')+'">'+money(operational)+'</strong></div>'+action('Ver gestão financeira','data-go="financeiro/despesas"',true)+'<small>Despesas registradas: '+money(expenseTotal)+'</small></div><p class="section-footnote">Considera os custos e despesas cadastrados. Não representa saldo disponível para saque.</p></section></div><section class="panel"><div class="panel-heading"><div><h2>Vendas por produto</h2><p>Valores acumulados no período selecionado.</p></div>'+action('Exportar CSV','data-export="financeiro"')+'</div>'+financeTable()+'</section>';
  }
  const monthNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function expenseComposer(){
    const d=expenseDraft;
    return '<form id="expense-form" class="expense-composer" novalidate aria-label="Cadastrar despesa"><div class="expense-composer-heading"><strong>'+(expenseEditId?'Editar cadastro':'Cadastrar despesa')+'</strong>'+(expenseEditId?'<button id="cancel-inline-expense" class="text-button" type="button">Cancelar edição</button>':'<span>Cadastro rápido</span>')+'</div><div class="expense-composer-main"><label>Tipo<select id="expense-type"><option value="fixed">Custo fixo</option><option value="operational">Custo operacional</option></select></label><label>Descrição<input id="expense-name" type="text" maxlength="100" required placeholder="Ex.: impressora de etiquetas" value="'+esc(d.name)+'"></label><div id="expense-category-wrap" class="expense-category-wrap"><label for="expense-category">Categoria</label><div class="expense-category-field"><input id="expense-category" role="combobox" aria-autocomplete="list" aria-controls="expense-category-options" aria-expanded="false" autocomplete="off" maxlength="60" required placeholder="Escolha ou escreva" value="'+esc(d.category)+'"><button id="expense-category-trigger" type="button" aria-label="Mostrar categorias"><span class="chevron down" aria-hidden="true"></span></button></div><div id="expense-category-options" role="listbox" aria-label="Categorias de despesas" hidden></div></div></div><div class="expense-composer-payment"><label>Valor por pagamento<div class="field"><span>R$</span><input id="expense-value" inputmode="decimal" required placeholder="0,00" value="'+esc(d.amount)+'"></div></label><label>Primeiro vencimento<input id="expense-date" type="date" min="'+M.minDay+'" max="2099-12-31" required value="'+esc(d.date)+'"></label><label class="expense-recurring-label"><input id="expense-recurring" type="checkbox" class="product-checkbox"'+(d.recurring?' checked':'')+'>Recorrente</label><button class="button primary" type="submit">'+(expenseEditId?'Salvar alteração':'Cadastrar')+'</button></div><div id="expense-repeat-options" class="expense-repeat-options"'+(d.recurring?'':' hidden')+'><label>Repetição<select id="expense-frequency"><option value="monthly">Mensal, sem prazo</option><option value="installments">Parcelada</option></select></label><label id="expense-installments-field"'+(d.recurring&&d.frequency==='installments'?'':' hidden')+'>Quantidade de parcelas<input id="expense-installments" type="number" min="2" max="120" step="1" value="'+esc(d.installments)+'"></label></div>'+(expenseEditId?'<p class="expense-edit-note">A alteração vale para todos os vencimentos deste cadastro.</p>':'')+'<p id="expense-error" class="form-error" role="alert"></p></form>';
  }
  function expenseMonthGroups(start,end){
    const months=[];
    for(let day=start.slice(0,7)+'-01';day<=end;){months.push(day.slice(0,7));const date=M.utc(day);date.setUTCMonth(date.getUTCMonth()+1);day=date.toISOString().slice(0,10);}
    return '<div class="expense-month-groups">'+months.reverse().map(month=>{
      const year=Number(month.slice(0,4)),index=Number(month.slice(5))-1,last=new Date(Date.UTC(year,index+1,0,12)).toISOString().slice(0,10);
      const ledger=M.financialLedger(start>month+'-01'?start:month+'-01',end<last?end:last,expenses,state.costs,state.missing,productSettings);
      const rows=ledger.entries,registered=M.manualExpenseCount(rows);
      const label=M.utc(month+'-01').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
      const automatic=ledger.rows.map(r=>'<tr data-ledger-auto="'+r.key+'" data-ledger-month="'+month+'">'+cell('Descrição',value(esc(r.label),'Automático'))+cell('Origem / categoria','<span class="ledger-source">Mercado Livre</span>')+cell('Valor',value(money(r.amount),'',r.amount==null||r.amount===0?'':r.amount<0?'negative':'positive'))+cell('','')+'</tr>').join('');
      const manual=rows.map(e=>'<tr data-expense-entry="'+esc(e.id)+'">'+cell('Descrição',value(esc(e.name),(e.expenseType==='operational'?'Custo operacional':'Custo fixo')+' · '+date(e.occurrence)+(e.installment?' · parcela '+e.installment+'/'+e.installments:e.recurring?' · mensal':'')))+cell('Origem / categoria',esc(e.category||'Outros'))+cell('Valor',value(money(-e.amount),e.occurrence>M.maxDay?'Previsto':'','negative'))+cell('','<div class="expense-row-actions"><button class="expense-edit-subtle" data-edit-expense="'+esc(e.id)+'" aria-label="Editar cadastro de '+esc(e.name)+'">Editar</button><button class="icon-button" data-remove-expense="'+esc(e.id)+'" aria-label="Remover cadastro e vencimentos de '+esc(e.name)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7"/></svg></button></div>')+'</tr>').join('');
      return '<details class="expense-month" data-expense-month="'+month+'"'+(expandedExpenseMonths.has(month)?' open':'')+'><summary><span class="chevron" aria-hidden="true"></span><strong>'+label.charAt(0).toUpperCase()+label.slice(1)+'</strong><span>'+(registered?registered+' '+(registered===1?'Despesa cadastrada':'Despesas cadastradas'):'')+'</span><b class="'+(ledger.result==null?'':ledger.result<0?'negative':'positive')+'"><small>Resultado</small>'+money(ledger.result)+'</b></summary>'+table(['Descrição','Origem / categoria','Valor',''],automatic+manual,'ledger-table')+(!ledger.available?'<p class="expense-month-empty">Sem vendas carregadas neste mês. Despesas futuras aparecem como previstas.</p>':'')+'</details>';
    }).join('')+'<p class="expense-ledger-note">Valores das vendas e despesas cadastradas, sem duplicar custos. Os lançamentos automáticos acompanham as vendas do mês.</p></div>';
  }
  function startInlineExpense(id=null){
    const e=expenses.find(e=>e.id===id);expenseEditId=e?.id||null;
    if(e)Object.assign(expenseDraft,{name:e.name,amount:String(e.amount).replace('.',','),date:e.date,category:validCategory(e.category)?e.category:'',expenseType:e.expenseType==='operational'?'operational':'fixed',recurring:e.recurring===true,frequency:e.installments?'installments':'monthly',installments:String(e.installments||12)});
    else Object.assign(expenseDraft,{name:'',amount:''});
    renderExpenseDesktop();imageFallbacks();$('#expense-name').focus({preventScroll:true});$('#expense-name').select();
  }
  function bindExpenseComposer(){
    const form=$('#expense-form');if(!form)return;
    $('#expense-type').value=expenseDraft.expenseType;$('#expense-frequency').value=expenseDraft.frequency;
    const ids={name:'expense-name',amount:'expense-value',date:'expense-date',category:'expense-category',expenseType:'expense-type',installments:'expense-installments'};
    for(const [key,id] of Object.entries(ids))$('#'+id).addEventListener('input',e=>{expenseDraft[key]=e.target.value;});
    const repeat=()=>{expenseDraft.recurring=$('#expense-recurring').checked;expenseDraft.frequency=$('#expense-frequency').value;$('#expense-repeat-options').hidden=!expenseDraft.recurring;$('#expense-installments-field').hidden=!expenseDraft.recurring||expenseDraft.frequency!=='installments';};
    $('#expense-recurring').onchange=repeat;$('#expense-frequency').onchange=repeat;
    if($('#cancel-inline-expense'))$('#cancel-inline-expense').onclick=()=>startInlineExpense();
    bindExpenseCategory();
    form.onsubmit=async event=>{
      event.preventDefault();const d=expenseDraft,amount=parseNumber(d.amount),count=Number(d.installments),error=$('#expense-error');
      if(!d.name.trim()){error.textContent='Informe a descrição.';$('#expense-name').focus();return;}
      if(amount==null||amount<=0||amount>1000000){error.textContent='Informe um valor maior que zero.';$('#expense-value').focus();return;}
      if(!validDay(d.date)||d.date<M.minDay||d.date>'2099-12-31'){error.textContent='Confira o vencimento.';$('#expense-date').focus();return;}
      if(!validCategory(d.category)){error.textContent='Escolha ou escreva uma categoria.';$('#expense-category').focus();return;}
      if(d.recurring&&d.frequency==='installments'&&(!Number.isInteger(count)||count<2||count>120)){error.textContent='Informe de 2 a 120 parcelas.';$('#expense-installments').focus();return;}
      const existing=expenseCategories.find(c=>expenseCategoryKey(c)===expenseCategoryKey(d.category.trim())),category=existing||d.category.trim();
      const nextCategories=existing?expenseCategories:[...expenseCategories,category];
      const item={id:expenseEditId||crypto.randomUUID(),source:'manual',name:d.name.trim(),amount:M.round(amount),date:d.date,category,expenseType:d.expenseType==='operational'?'operational':'fixed',recurring:d.recurring,...(d.recurring&&d.frequency==='installments'?{installments:count}:{})};
      const next=expenseEditId?expenses.map(e=>e.id===expenseEditId?item:e):[...expenses,item];
      const submit=form.querySelector('[type=submit]');submit.disabled=true;
      try{await updates.run('Salvando despesa…',async()=>{
        if(!await persist({expenses:next,expenseCategories:nextCategories}))throw Error('storage');
        expenses=next;expenseCategories=nextCategories;expenseEditId=null;expenseDraft.name='';expenseDraft.amount='';expenseDraft.category=category;expandedExpenseMonths.add(item.date.slice(0,7));
        render();$('#expense-name')?.focus({preventScroll:true});
      },{success:'Despesa cadastrada.',error:'Não foi possível salvar a despesa. Tente novamente.'});}
      catch{error.textContent='Não foi possível salvar na sua conta.';}
      finally{submit.disabled=false;}
    };
  }
  function bindExpenseCategory(){
    const input=$('#expense-category'),list=$('#expense-category-options'),wrap=$('#expense-category-wrap');let active=-1,choices=[];
    const normalized=expenseCategoryKey;
    const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
    const pick=index=>{const choice=choices[index];if(!choice)return;input.value=choice.name;expenseDraft.category=choice.name;close();input.focus({preventScroll:true});};
    const draw=()=>{
      const query=input.value.trim(),found=expenseCategories.filter(c=>normalized(c).includes(normalized(query))).map(name=>({name,create:false}));
      choices=query&&!expenseCategories.some(c=>normalized(c)===normalized(query))?[...found,{name:query,create:true}]:found;
      active=-1;list.innerHTML=choices.map((c,i)=>'<button id="expense-category-option-'+i+'" type="button" tabindex="-1" role="option" aria-selected="false">'+(c.create?'Criar categoria “'+esc(c.name)+'”':esc(c.name))+'</button>').join('');
      list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
      const rect=input.getBoundingClientRect(),below=innerHeight-rect.bottom-20,up=below<160&&rect.top>below;list.classList.toggle('opens-up',up);list.style.maxHeight=Math.min(240,Math.max(100,up?rect.top-24:below))+'px';
      [...list.children].forEach((button,i)=>{button.onpointerdown=e=>e.preventDefault();button.onclick=()=>pick(i);});
    };
    input.addEventListener('input',draw);input.onfocus=draw;
    input.onblur=()=>requestAnimationFrame(()=>{if(!wrap.contains(document.activeElement))close();});
    $('#expense-category-trigger').onpointerdown=e=>e.preventDefault();$('#expense-category-trigger').onclick=()=>{if(list.hidden){input.focus({preventScroll:true});draw();}else close();};
    input.onkeydown=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();if(list.hidden)draw();active=Math.max(0,Math.min(choices.length-1,active+(e.key==='ArrowDown'?1:-1)));
        [...list.children].forEach((button,i)=>button.setAttribute('aria-selected',String(i===active)));
        const option=list.children[active];if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}return;
      }
      if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active>=0)pick(active);else close();}
      if(e.key==='Tab')close();
    };
  }
  function annualExpenses(){return M.annualFinancials(state.expenseYear,expenses,state.costs,state.missing,productSettings);}
  function renderExpenseDesktop(){
    const annual=state.expenseView==='annual',data=annual?annualExpenses():null;
    const start=annual?state.expenseYear+'-01-01':state.start,end=annual?state.expenseYear+'-12-31':state.end;
    const entries=M.expenseEntries(expenses,start,end),total=annual?data.expenses:expenseTotal;
    const result=annual?data.result:current.result==null?null:M.round(current.result-expenseTotal);
    const revenue=annual?data.net:current.net,cost=annual?data.costs:current.result==null?null:M.round(current.net-current.result);
    const controls=$('#finance-controls');controls.hidden=false;controls.setAttribute('aria-label','Visão das despesas');
    controls.innerHTML='<div class="expense-view-row"><div class="segments" role="group" aria-label="Visão das despesas"><button data-expense-view="period" aria-pressed="'+!annual+'">Por período</button><button data-expense-view="annual" aria-pressed="'+annual+'">Ano</button></div><span>'+(annual?(data.cutoff?'Vendas carregadas até '+date(data.cutoff,true):'Sem vendas carregadas neste ano'):range(start,end))+'</span></div>';
    $('#metrics').innerHTML=metric(annual?'Receita do ano':'Receita no período',money(revenue),'Após cancelamentos e reembolsos','Receita de produtos.')+
      metric('Custos e despesas',money(cost==null||total==null?null:M.round(cost+total)),money(total)+' em despesas cadastradas','Inclui custos das vendas e Ads.')+
      metric('Resultado após despesas',money(result),result==null?'Dados de vendas ou custos incompletos':pct(revenue?result/revenue*100:null)+' da receita','Visão gerencial · despesas cadastradas.',result==null||result===0?'':result<0?'negative':'positive');
    const panel='<section class="expense-months-pane" aria-label="Cadastro e despesas por mês">'+expenseComposer()+expenseMonthGroups(start,end)+'</section>';
    const monthly=annual?'<section class="panel annual-panel"><div class="panel-heading"><div><h2>Resultado mês a mês</h2><p>'+state.expenseYear+' · gastos das vendas e despesas cadastradas.</p></div>'+action('Ver DRE','data-go="financeiro/dre"')+'</div>'+table(['Mês','Receita','Gastos','Resultado'],data.months.map(m=>'<tr class="'+(!m.available?'unloaded-month':'')+'">'+cell('Mês','<strong class="table-value">'+monthNames[m.month]+'</strong>'+(m.partial?'<span class="table-sub">Parcial</span>':!m.available?'<span class="table-sub">Sem vendas carregadas</span>':''))+
      cell('Receita',value(money(m.net)))+cell('Gastos',value(money(m.costs==null||m.expenses==null?null:M.round(m.costs+m.expenses)),m.planned?'Previsto: '+money(m.planned):''))+
      cell('Resultado',value(money(m.result),'',m.result==null?'':m.result<0?'negative':'positive'))+'</tr>').join('')+'<tr class="annual-total">'+cell('Mês','<strong>Total carregado</strong>')+cell('Receita',value(money(data.net)))+cell('Gastos',value(money(data.costs==null||data.expenses==null?null:M.round(data.costs+data.expenses))))+cell('Resultado',value(money(data.result),'',data.result==null?'':data.result<0?'negative':'positive'))+'</tr>','annual-table')+'<p class="section-footnote">Meses sem vendas carregadas ficam sem resultado. Despesas previstas não entram no total carregado. Esta é uma visão gerencial, não uma DRE contábil.</p></section>':
      '<section class="panel"><div class="panel-heading"><div><h2>Lançamentos no período</h2><p>Cada parcela entra apenas no seu vencimento.</p></div></div>'+(entries.length?table(['Despesa','Vencimento','Valor'],entries.map(e=>'<tr>'+cell('Despesa',value(esc(e.name),e.installment?'Parcela '+e.installment+'/'+e.installments:e.recurring?'Mensal':'Avulsa'))+cell('Vencimento',value(date(e.occurrence,true)))+cell('Valor',value(money(e.amount)))+'</tr>').join('')):empty('Nenhum lançamento','Escolha outro período ou adicione uma despesa.'))+'</section>';
    $('#page-content').innerHTML='<div class="expense-layout expense-ledger-layout">'+panel+monthly+'</div>';
    bindExpenseComposer();
    for(const detail of $$('.expense-month'))detail.addEventListener('toggle',()=>{if(detail.open)expandedExpenseMonths.add(detail.dataset.expenseMonth);else expandedExpenseMonths.delete(detail.dataset.expenseMonth);});
  }
  function dreRows(report){
    const r=report||{},neg=v=>v==null?null:-v,net=[r.gross,r.cancelled,r.refunded].every(Number.isFinite)?M.round(r.gross-r.cancelled-r.refunded):null;
    return [
      {key:'gross',label:'Faturamento bruto',amount:r.gross},
      {key:'salesCosts',label:'Gastos das vendas',amount:r.contribution==null?null:neg(M.round(r.gross-r.contribution)),group:'salesCosts',children:[['Produtos vendidos',neg(r.cmv)],['Devoluções parciais',neg(r.refunded)],['Vendas canceladas',neg(r.cancelled)],['Frete do vendedor',neg(r.shipping)],['Tarifas de venda',neg(r.fees)],['Impostos sobre vendas',neg(r.tax)],['Publicidade · Ads',neg(r.ads)]]},
      {key:'contribution',label:'Resultado das vendas',amount:r.contribution,subtotal:true},
      {key:'salesMargin',label:'Margem das vendas',amount:r.contribution!=null&&net?r.contribution/net*100:null,percentage:true},
      {key:'opex',label:'Despesas cadastradas',amount:neg(r.opex),group:'opex',children:Object.entries(r.categories||{}).sort((a,b)=>b[1]-a[1]).map(([name,n])=>[name,-n])},
      {key:'result',label:'Resultado após despesas',amount:r.result,final:true},
      {key:'finalMargin',label:'Margem após despesas',amount:r.result!=null&&net?r.result/net*100:null,percentage:true}
    ];
  }
  function dreExpandControl(){
    const expanded=dreDialog.open;
    const glyph=expanded?'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6':'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5';
    return '<div class="dre-heading-actions"><span class="dre-refresh-status" role="status">'+dreRefreshStatus+'</span>'+(expanded?'<button type="button" class="button secondary" data-export="dre">Exportar CSV</button>':'')+'<button type="button" id="dre-expand" class="button secondary dre-expand" data-dre-expand aria-expanded="'+expanded+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+glyph+'"/></svg>'+(expanded?'Recolher':'Expandir')+'</button></div>';
  }
  function toggleDreExpanded(){
    if(dreDialog.open){dreDialog.close();return;}
    const panel=$('.dre-matrix-panel');if(!panel)return;
    dreDialog.append(panel);document.documentElement.classList.add('dre-is-expanded');dreDialog.showModal();
    const control=$('.dre-heading-actions');control.outerHTML=dreExpandControl();$('#dre-expand').focus({preventScroll:true});
  }
  dreDialog.addEventListener('close',()=>{
    document.documentElement.classList.remove('dre-is-expanded');
    if(state.route==='financeiro'&&state.tab==='dre'){
      const panel=dreDialog.querySelector('.dre-matrix-panel');if(panel)$('#page-content').append(panel);else renderDre();
      const control=$('.dre-heading-actions');if(control)control.outerHTML=dreExpandControl();$('#dre-expand')?.focus({preventScroll:true});
    }else dreDialog.replaceChildren();
  });
  function renderDre(){
    const data=M.dreReport(state.expenseYear,expenses,state.costs,state.missing,productSettings),total=data.total;
    $('#metrics').hidden=true;$('#finance-controls').hidden=true;$('#comparison-note').hidden=true;
    const currency=n=>n==null||!Number.isFinite(n)?'--':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n===0?0:n);
    const definitions=dreRows(total),lines=[],previousScroll=$('.dre-matrix-wrap')?.scrollLeft||0;
    for(const row of definitions){
      lines.push({key:row.key,group:row.group,label:row.label,percentage:row.percentage,kind:row.percentage?'margin':row.final?'final':row.subtotal?'subtotal':row.group?'group':'',read:r=>r?dreRows(r).find(x=>x.key===row.key).amount:null});
      if(row.group&&dreOpenGroups.has(row.group))for(const [index,[label]] of row.children.entries())lines.push({label,kind:'child',read:r=>!r?null:row.group==='opex'?-(r.categories[label]||0):dreRows(r).find(x=>x.key===row.key).children[index][1]});
    }
    const refreshIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-6m6 0V1M4 17h6m-6 0v6M5.6 7a7 7 0 0 1 11.6-2L20 7M4 17l2.8 2A7 7 0 0 0 18.4 17"/></svg>';
    const valueCell=(line,r,month,isTotal=false)=>{
      const n=line.read(r),tone=(line.kind==='final'||line.kind==='margin')&&n!=null&&n!==0?(n<0?'negative':'positive'):'';
      return '<td class="'+(isTotal?'dre-year-total ':'')+tone+'" title="'+esc(month+' · '+line.label+': '+(line.percentage?pct(n):money(n)))+'">'+(line.percentage?pct(n):currency(n))+'</td>';
    };
    (dreDialog.open?dreDialog:$('#page-content')).innerHTML='<section class="panel dre-matrix-panel"><div class="panel-heading"><div><h2>DRE · '+data.year+'</h2><p>Valores em R$ · '+(data.cutoff?'dados até '+date(data.cutoff,true):'sem vendas carregadas')+'</p></div>'+dreExpandControl()+'</div><div class="dre-matrix-wrap" tabindex="0" role="region" aria-label="DRE por mês. Abra os grupos para conferir o detalhamento."><table class="dre-matrix"><caption class="sr-only">Demonstração gerencial do resultado de '+data.year+', todos os meses e total acumulado.</caption><thead><tr><th scope="col">Conta</th>'+data.months.map(m=>'<th scope="col"><div><span>'+monthNames[m.month]+'</span><button type="button" class="dre-refresh" data-refresh-dre-month="'+m.month+'" aria-label="Atualizar '+monthNames[m.month]+' de '+data.year+'" title="'+(m.available?'Atualizar dados locais deste mês':'Sem vendas carregadas neste mês')+'"'+(!m.available?' disabled':'')+'>'+refreshIcon+'</button></div>'+(m.partial?'<small>Parcial</small>':!m.available?'<small>Sem dados</small>':'')+'</th>').join('')+'<th scope="col" class="dre-year-total">Total do ano</th></tr></thead><tbody>'+lines.map(line=>'<tr class="dre-matrix-'+line.kind+'"><th scope="row">'+(line.group?'<button type="button" class="dre-group-toggle" data-dre-group="'+line.group+'" aria-expanded="'+dreOpenGroups.has(line.group)+'"'+(line.key==='salesCosts'?' title="Produtos, devoluções, cancelamentos, frete, tarifas, impostos e publicidade. Cada gasto é descontado uma única vez."':'')+'><span class="chevron '+(dreOpenGroups.has(line.group)?'down':'')+'" aria-hidden="true"></span>'+esc(line.label)+'</button>':esc(line.label))+'</th>'+data.months.map(m=>valueCell(line,m.report,monthNames[m.month])).join('')+valueCell(line,total,'Total de '+data.year,true)+'</tr>').join('')+'</tbody></table></div><p class="dre-matrix-foot">'+(total.cmv==null&&data.loaded?'Há custo de produto pendente. Resultados dependentes ficam sem valor. ':'')+'Grupos abrem o detalhamento; os valores não são descontados novamente. Visão gerencial · meses sem dados ficam --.</p></section>';
    $('.dre-matrix-wrap').scrollLeft=previousScroll;
  }
  async function refreshDreMonth(index){
    const focus='[data-refresh-dre-month="'+index+'"]',wrap=$('.dre-matrix-wrap'),left=wrap?.scrollLeft||0,top=wrap?.scrollTop||0;
    clearTimeout(dreStatusTimer);dreRefreshStatus='Atualizando…';$('.dre-refresh-status').textContent=dreRefreshStatus;
    try{await updates.run('Atualizando…',async()=>{
      await M.refresh();const latest=M.data;
      if(Array.isArray(latest.expenses))expenses=latest.expenses.filter(safeExpense).map(e=>({...e,recurring:e.recurring===true}));
      for(const p of M.products)if(validNumber(latest.costs?.[p.id]))state.costs[p.id]=latest.costs[p.id];
      for(const {id}of M.products){const entry=latest.productSettings?.[id];if(entry)productSettings[id]={...productSettings[id],taxRate:validNumber(entry.taxRate)&&entry.taxRate<=100?entry.taxRate:null,manageStock:entry.manageStock===true};}
      render();const next=$('.dre-matrix-wrap');if(next){next.scrollLeft=left;next.scrollTop=top;}$(focus)?.focus({preventScroll:true});
    },{success:'Atualizado',error:'Não foi possível atualizar este mês.'});dreRefreshStatus='Atualizado';$('.dre-refresh-status').textContent=dreRefreshStatus;dreStatusTimer=setTimeout(()=>{dreRefreshStatus='';const status=$('.dre-refresh-status');if(status)status.textContent='';},3000);}catch{dreRefreshStatus='Não foi possível atualizar.';$('.dre-refresh-status').textContent=dreRefreshStatus;}
  }
  function financeScope(){
    const query=financeFilters.query.trim().toLocaleLowerCase('pt-BR');
    const products=current.products.filter(p=>(p.name+' '+p.sku+' '+p.itemId).toLocaleLowerCase('pt-BR').includes(query))
      .filter(p=>financeFilters.cost==='missing'?p.unitCost==null:financeFilters.cost==='complete'?p.unitCost!=null:true)
      .filter(p=>financeFilters.result==='negative'?p.result!=null&&p.result<0:financeFilters.result==='positive'?p.result!=null&&p.result>0:true);
    const ids=products.map(p=>p.id),days=M.daysBetween(state.start,state.end),beforeEnd=M.shift(state.start,-1);
    const total=M.aggregate(state.start,state.end,state.costs,state.missing,productSettings,ids);
    const before=M.aggregate(M.shift(beforeEnd,1-days),beforeEnd,state.costs,state.missing,productSettings,ids);
    total.products=total.products.filter(p=>ids.includes(p.id));
    before.products=before.products.filter(p=>ids.includes(p.id));
    return {total,before,filtered:!!query||financeFilters.cost!=='all'||financeFilters.result!=='all'};
  }
  function renderFinanceControls(scope){
    const active=[];
    if(financeFilters.query)active.push(['query','Busca: '+financeFilters.query]);
    if(financeFilters.cost!=='all')active.push(['cost',financeFilters.cost==='missing'?'Custo pendente':'Custo cadastrado']);
    if(financeFilters.result!=='all')active.push(['result',financeFilters.result==='negative'?'Resultado negativo':'Resultado positivo']);
    const control=$('#finance-controls');control.hidden=false;control.setAttribute('aria-label','Filtros do resumo financeiro');
    const missing=scope.total.products.filter(p=>p.unitCost==null);
    control.innerHTML='<div class="finance-control-row"><button id="finance-filter-trigger" class="action-button" type="button" aria-expanded="'+financeFiltersOpen+'" aria-controls="finance-filter-form">'+icon('adjustments-horizontal')+'Filtros'+(active.length?' ('+active.length+')':'')+' <span class="chevron down" aria-hidden="true"></span></button><div class="finance-filter-tags">'+active.map(([key,label])=>'<button type="button" data-clear-finance-filter="'+key+'" aria-label="Remover filtro '+esc(label)+'">'+esc(label)+' <span aria-hidden="true">×</span></button>').join('')+'</div><span class="finance-scope-count" role="status">'+scope.total.products.length+' de '+current.products.length+' produtos · '+(scope.total.products.length-missing.length)+'/'+scope.total.products.length+' custos cadastrados</span></div>'+
      '<form id="finance-filter-form"'+(financeFiltersOpen?'':' hidden')+'><label>Produto, SKU ou MLB<input class="plain-input" id="finance-query" type="search" autocomplete="off" value="'+esc(financeFilters.query)+'" placeholder="Buscar produto"></label><label>Custo<select id="finance-cost"><option value="all">Todos</option><option value="complete">Cadastrado</option><option value="missing">Pendente</option></select></label><label>Resultado<select id="finance-result"><option value="all">Todos</option><option value="positive">Positivo</option><option value="negative">Negativo</option></select></label><button class="button primary" type="submit">Aplicar</button></form>'+
      (missing.length?'<div class="finance-cost-warning" role="status"><span><strong>'+missing.length+' '+(missing.length===1?'produto sem custo':'produtos sem custo')+'.</strong> '+(scope.total.incomplete?'Complete o cadastro para calcular o resultado desta seleção.':'Cadastre para avaliar as próximas vendas.')+'</span><button class="action-button" data-edit-cost="'+missing[0].id+'">Cadastrar custo</button></div>':'');
    $('#finance-cost').value=financeFilters.cost;$('#finance-result').value=financeFilters.result;
    $('#finance-filter-trigger').onclick=()=>{financeFiltersOpen=!financeFiltersOpen;renderFinanceControls(scope);$('#finance-filter-trigger').focus({preventScroll:true});};
    $('#finance-filter-form').onsubmit=e=>{
      e.preventDefault();financeFilters.query=$('#finance-query').value.trim();financeFilters.cost=$('#finance-cost').value;financeFilters.result=$('#finance-result').value;
      financeFiltersOpen=false;render();$('#finance-filter-trigger').focus({preventScroll:true});revealPanel($('#metrics'));revealPanel($('#page-content'));
    };
    for(const button of $$('[data-clear-finance-filter]'))button.onclick=()=>{const key=button.dataset.clearFinanceFilter;financeFilters[key]=key==='query'?'':'all';render();$('#finance-filter-trigger').focus({preventScroll:true});};
  }
  function renderFinanceSummary(){
    const scope=financeScope(),total=scope.total,before=scope.before,breakdown=M.costBreakdown(total);
    const knownCosts=breakdown.total,totalCosts=total.result==null?null:M.round(total.net-total.result);
    const ticket=total.orders?total.net/total.orders:null;
    renderFinanceControls(scope);
    $('#metrics').innerHTML=metric('Receita das vendas',money(total.net),num(total.orders)+' pedidos pagos','Ticket médio '+money(ticket),'',comparable?delta(total.net,before.net):'')+
      metric(total.incomplete?'Custos conhecidos':'Custos das vendas',money(totalCosts??knownCosts),total.incomplete?'Parcial · falta custo de produto':pct(total.net?totalCosts/total.net*100:null)+' da receita líquida','Produto, tarifas, imposto, frete e Ads.')+
      metric(total.incomplete?'Resultado a completar':'Resultado das vendas',money(total.result),total.incomplete?'Há custos pendentes':'<span class="margin-context">'+pct(M.margin(total))+' de margem</span>',action('Ver composição','data-finance-info'),total.result==null||total.result===0?'':total.result<0?'negative':'positive',total.result!=null&&comparable?delta(total.result,before.result):'');
    const operating=total.result==null?null:M.round(total.result-expenseTotal);
    const loss=total.products.filter(p=>p.result!=null&&p.result<0).sort((a,b)=>a.result-b.result)[0];
    $('#page-content').innerHTML='<div class="finance-definition"><span>Receita de produtos após estornos. A margem considera os custos variáveis e os Ads, antes das despesas da operação.</span></div>'+
      (loss?'<div class="finance-loss-note">'+cover(loss)+'<span><small>Resultado negativo no período</small><strong>'+esc(loss.name)+'</strong></span><b class="negative">'+money(loss.result)+'</b><button class="action-button" data-product="'+loss.id+'">Revisar anúncio</button></div>':'')+
      '<div class="finance-grid"><section class="panel finance-composition-panel"><div class="panel-heading"><div><h2>Composição do resultado</h2><p>Da receita ao que sobra das vendas.</p></div></div>'+composition(total)+'<p class="section-footnote">Inclui o frete pago pelo vendedor. O frete do comprador não entra como custo do vendedor.</p></section>'+
      '<section class="panel cost-panel"><div class="panel-heading"><div><h2>Para onde vai o dinheiro</h2><p>'+(total.incomplete?'Distribuição dos custos conhecidos.':'Distribuição dos custos das vendas.')+'</p></div></div>'+costChart(total)+'<div class="finance-operation-link">'+
      (!scope.filtered?'<div><span>Resultado após despesas cadastradas</span><strong class="'+(operating<0?'negative':'')+'">'+money(operating)+'</strong></div>':'<span>Despesas da operação<br><small>Da conta inteira, sem rateio por produto.</small></span>')+
      action('Ver gestão financeira','data-go="financeiro/despesas"')+'</div></section></div>'+
      '<section class="panel"><div class="panel-heading"><div><h2>Vendas por produto</h2><p>'+total.products.filter(p=>p.units>0).length+' produtos com vendas no período selecionado.</p></div>'+financeSortControl()+'</div>'+
      (total.products.some(p=>p.units>0)?financeTable(total):empty('Nenhuma venda nesta seleção','Altere os filtros ou escolha outro período.'))+'</section>';
  }
  function financeTable(total=current){return table(['Produto','Unidades','Receita líquida','Custos das vendas','Resultado / margem',''],financeProducts(total).map(p=>'<tr data-finance-product="'+p.id+'">'+cell('Produto',productName(p))+cell('Unidades',value(num(p.units)))+cell('Receita líquida',value(money(p.net)))+cell('Custos das vendas',value(money(p.result==null?null:p.net-p.result)))+cell('Resultado / margem',value(money(p.result),p.result==null?'Custo pendente':pct(M.margin(p)),p.result<0?'negative':''))+rowOpen(p)+'</tr>').join(''));}
  function productCostCell(product){
    const pending=product.unitCost==null;
    return cell('Custo unitário','<button type="button" class="cost-edit'+(pending?' cost-pending':'')+
      '" data-edit-cost="'+product.id+'" aria-label="'+(pending?'Cadastrar':'Editar')+' custo de '+esc(product.name)+
      '">'+(pending?'Cadastrar custo':money(product.unitCost))+'</button>');
  }
  function stockPriority(p){
    const location=state.productFilter==='reorder-full'?'full':state.productFilter==='reorder-warehouse'?'warehouse':null;
    return location?(M.inventoryStatus(p,location).cover??Infinity):Math.min(...['full','warehouse'].map(key=>M.inventoryStatus(p,key).cover??Infinity));
  }
  function stockSituation(p,location){
    const info=M.inventoryStatus(p,location),coverage=info.cover==null||info.quantity===0?'':info.cover+' '+(info.cover===1?'dia':'dias')+' de cobertura';
    const label=info.label.startsWith('Não utiliza')?'Não utiliza':info.quantity===0&&info.needsReorder?'Esgotado':info.tone==='bad'?'Urgente':info.tone==='warning'?'Repor em breve':info.tone==='good'?'Em dia':info.label.startsWith('Sem vendas')?'Sem vendas':info.label;
    return '<div class="stock-situation">'+status(label,info.tone)+(coverage?'<span class="table-sub">'+coverage+'</span>':'')+(info.needsReorder?'<button type="button" class="stock-next-action" '+(location==='full'?'data-plan-full':'data-review-warehouse')+'="'+p.id+'">'+(location==='full'?'Preparar envio':'Atualizar saldo')+' '+arrow+'</button>':'')+'</div>';
  }
  function openFullPlan(id){
    const p=productById(id);if(!p)return;const info=M.inventoryStatus(p,'full');
    openDialog('full-plan','<div class="dialog-product">'+cover(p)+'<div><h2 id="dialog-title">Reposição Full</h2><small>'+esc(p.name)+'</small></div></div><div class="full-plan-status">'+status(info.label,info.tone)+'</div><div class="stock-edit-summary"><div><span>No Full</span><strong>'+num(p.full)+' un.</strong></div><div><span>No Depósito</span><strong>'+num(p.warehouse)+' un.</strong></div></div><p class="full-plan-copy">'+(p.warehouse===0?'Reponha o Depósito antes de separar as unidades para o Full.':'Separe as unidades do Depósito, embale e agende o envio no Mercado Livre.')+'</p><p class="full-plan-copy">O saldo do Full muda após o recebimento pelo Mercado Livre.</p><a class="button primary full-plan-link" href="https://vendedores.mercadolivre.com.br/nota/guia-para-envios-e-reposicao-de-estoque-no-full?guideKeyId=GE10&amp;moduleKeyId=MO47" target="_blank" rel="noopener noreferrer">Ver etapas no Mercado Livre '+arrow+'</a>');
  }
  function productRows(list){
    if(state.tab==='desempenho')return table(['Produto','Vendas no período','Período anterior','Variação','Situação',''],list.map(p=>{const before=previous.products.find(x=>x.id===p.id),change=before.orders?(p.orders/before.orders-1)*100:null;return '<tr>'+cell('Produto',productName(p))+cell('Vendas no período',value(num(p.orders)+' pedidos',p.lastSale?'Última venda: '+date(p.lastSale):'Nenhuma venda registrada'))+cell('Período anterior',value(comparable?num(before.orders)+' pedidos':'--'))+cell('Variação',comparable?delta(p.orders,before.orders):'<span class="muted small">Sem comparação</span>')+cell('Situação',!p.units?status('Sem vendas','warning'):change!=null&&change<=-20?status('Queda relevante','bad'):change!=null&&change>=20?status('Em alta','good'):status('Acompanhar'))+rowOpen(p)+'</tr>';}).join(''));
    if(state.tab==='estoque'){
      if(!desktopLayout.matches)return table(['Produto','Estoque','Full / Depósito','Cobertura','Situação',''],list.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Estoque',value(num(p.stock)+' un.'))+cell('Full / Depósito',value(num(p.full)+' / '+num(p.warehouse)))+cell('Cobertura',value(p.cover==null?'--':p.cover+' '+(p.cover===1?'dia':'dias'),'Estimativa pelo período'))+cell('Situação',p.cover!=null&&p.cover<=3?status('Repor em breve','warning'):p.units===0?status('Sem giro no período'):status('Disponível','good'))+rowOpen(p)+'</tr>').join(''));
      return table(['Produto','Full<small class="stock-column-hint">Somente leitura</small>','Depósito<small class="stock-column-hint">Dois cliques para editar</small>','Situação Full','Situação Depósito',''],list.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Full',value(num(p.full)+' un.'))+cell('Depósito',warehouseControl(p))+cell('Situação Full',stockSituation(p,'full'))+cell('Situação Depósito',stockSituation(p,'warehouse'))+rowOpen(p)+'</tr>').join(''),'stock-table');
    }
    if(state.tab==='catalogo'){for(const p of list)void M.loadCatalog(p.id);return table(['Produto','Meu preço','Preço para ganhar','Diferença','Ação',''],list.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Meu preço',value(money(p.price)))+cell('Preço para ganhar',value(money(p.competitorPrice)))+cell('Diferença',value(money(p.competitorPrice==null?null:p.price-p.competitorPrice),'Referência atual do Mercado Livre'))+cell('Ação',action('Simular margem','data-pricing="'+p.id+'"',true))+rowOpen(p)+'</tr>').join(''));}
    return table(['Produto','Custo unitário','Vendas','Resultado / margem','Estoque','Variação de vendas',''],list.map(p=>{const b=previous.products.find(x=>x.id===p.id);return '<tr>'+cell('Produto',productName(p))+productCostCell(p)+cell('Vendas',value(num(p.orders)+' pedidos',num(p.units)+' unidades'))+cell('Resultado / margem',value(money(p.result),p.result==null?'Custo pendente':M.margin(p)==null?'Sem vendas':pct(M.margin(p)),p.result<0?'negative':''))+cell('Estoque',value(num(p.stock)+' un.',p.cover==null?'Sem giro':p.cover+' '+(p.cover===1?'dia':'dias')+' de cobertura'))+cell('Variação de vendas',comparable?delta(p.orders,b.orders):'<span class="muted small">Sem comparação</span>')+rowOpen(p)+'</tr>';}).join(''));
  }
  function filteredProducts(){
    if(state.tab!=='estoque'&&state.sort==='name')state.sort='attention';
    const pendingIds=new Set(alerts.map(a=>a.id));let list=current.products.filter(p=>(p.name+' '+p.sku+' '+p.itemId).toLocaleLowerCase('pt-BR').includes(state.search.toLocaleLowerCase('pt-BR')));
    if(state.tab==='catalogo')list=list.filter(p=>p.catalog);
    if(state.productFilter==='attention')list=list.filter(p=>pendingIds.has(p.id));
    if(state.productFilter==='missing')list=list.filter(p=>p.unitCost==null);
    if(state.productFilter==='negative')list=list.filter(p=>p.result!=null&&p.result<0);
    if(state.productFilter==='decline')list=list.filter(p=>{
      const before=previous.products.find(item=>item.id===p.id);
      return comparable&&before.orders>0&&p.orders<before.orders;
    });
    if(state.productFilter==='idle')list=list.filter(p=>p.stock>0&&p.units===0);
    if(state.productFilter==='reorder-full')list=list.filter(p=>M.inventoryStatus(p,'full').needsReorder);
    if(state.productFilter==='reorder-warehouse')list=list.filter(p=>M.inventoryStatus(p,'warehouse').needsReorder);
    if(state.sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));else if(state.sort==='sales')list.sort((a,b)=>state.tab==='estoque'?b.units-a.units:b.orders-a.orders);else if(state.sort==='stock')list.sort((a,b)=>stockPriority(a)-stockPriority(b));else list.sort((a,b)=>(pendingIds.has(b.id)?1:0)-(pendingIds.has(a.id)?1:0)||(a.result??Infinity)-(b.result??Infinity));
    return list;
  }
  const productSortOptions = [
    ['attention', 'Em atenção primeiro'],
    ['sales', 'Mais vendidos'],
    ['stock', 'Menor cobertura'],
  ];
  function productSortControl(){
    const sortOptions=state.tab==='estoque'?[['stock','Repor primeiro'],['sales','Mais vendidos'],['name','Nome (A–Z)']]:productSortOptions;
    if(!sortOptions.some(([value])=>value===state.sort))state.sort=sortOptions[0][0];
    const label=sortOptions.find(([value])=>value===state.sort)[1];
    const options=sortOptions.map(([value, name])=>
      '<button type="button" data-sort="'+value+'" aria-pressed="'+(state.sort===value)+'">'+name+' <span aria-hidden="true">✓</span></button>'
    ).join('');
    return '<div class="menu-wrap product-sort-wrap">'+
      '<button type="button" id="product-sort" class="product-sort" aria-expanded="false" aria-controls="product-sort-menu" aria-label="Ordenar produtos: '+label+'">'+label+' <span class="chevron down" aria-hidden="true"></span></button>'+
      '<div class="dropdown product-sort-menu" id="product-sort-menu" role="group" aria-label="Ordenar produtos" hidden>'+options+'</div></div>';
  }
  function catalogProducts(){
    const query=state.search.trim().toLocaleLowerCase('pt-BR');
    return current.products.filter(p=>(p.name+' '+p.sku).toLocaleLowerCase('pt-BR').includes(query))
      .filter(p=>state.catalogCostFilter==='without'?p.unitCost==null:state.catalogCostFilter==='with'?p.unitCost!=null:true)
      .filter(p=>state.catalogTaxFilter==='without'?p.taxRate==null:state.catalogTaxFilter==='with'?p.taxRate!=null:true)
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  }
  function productSearch(placeholder){
    return '<label class="search-field">'+icon('search')+'<span class="sr-only">Buscar</span>'+
      '<input id="product-search" type="search" placeholder="'+placeholder+'" value="'+esc(state.search)+'" autocomplete="off"></label>';
  }
  function renderProducts(){
    const list=catalogProducts();
    const pages=Math.max(1,Math.ceil(list.length/productPageSize));
    state.productPage=Math.max(1,Math.min(pages,state.productPage));
    const start=(state.productPage-1)*productPageSize;
    const shown=desktopLayout.matches?list.slice(start,start+productPageSize):list;
    const filters=[['cost','Custo',state.catalogCostFilter],['tax','Imposto',state.catalogTaxFilter]].map(([id,label,selected])=>{
      const options=[['all','Todos'],['with',id==='cost'?'Com custo':'Com imposto'],['without',id==='cost'?'Sem custo':'Sem imposto']];
      return '<div class="menu-wrap catalog-filter-wrap"><button type="button" class="product-sort" id="catalog-'+id+'-trigger" aria-expanded="false" aria-controls="catalog-'+id+'-menu">'+label+': '+options.find(([key])=>key===selected)[1]+' <span class="chevron down" aria-hidden="true"></span></button><div class="dropdown product-sort-menu" id="catalog-'+id+'-menu" role="group" aria-label="Filtrar por '+label.toLowerCase()+'" hidden>'+options.map(([key,text])=>'<button type="button" data-catalog-filter="'+id+'" data-filter-value="'+key+'" aria-pressed="'+(selected===key)+'">'+text+' <span aria-hidden="true">✓</span></button>').join('')+'</div></div>';
    }).join('');
    const rows=shown.map(p=>'<tr class="'+(selectedProducts.has(p.id)?'product-selected':'')+'">'+
      cell('Selecionar','<input type="checkbox" class="product-checkbox" data-select-product="'+p.id+'" aria-label="Selecionar '+esc(p.name)+'"'+(selectedProducts.has(p.id)?' checked':'')+'>')+
      cell('Produto','<div class="product-cell">'+cover(p)+'<div><strong class="table-value">'+esc(p.name)+
      '</strong><span class="product-caption">SKU '+esc(p.sku)+'</span></div></div>')+productCostCell(p)+
      cell('Imposto',p.taxRate==null?status('Não informado'):value(pct(p.taxRate)))+
      cell('Gestão de estoque',p.manageStock?status('Ativada','good'):status('Desativada'))+
      cell('','<button type="button" class="action-button" data-edit-cost="'+p.id+'" aria-label="Editar cadastro de '+esc(p.name)+'">Editar</button>')+'</tr>').join('');
    $('#page-content').innerHTML='<section class="panel"><div class="panel-heading"><h2>Cadastro de produtos</h2><span class="muted small">'+
      num(current.products.length)+' SKUs cadastrados</span><button type="button" class="button secondary" id="import-product-costs">Importar custos</button></div><div class="toolbar catalog-filters">'+productSearch('Produto ou SKU')+
      '<div class="catalog-filter-controls" role="group" aria-label="Filtrar cadastro">'+filters+'</div></div>'+
      '<div class="product-selection-bar"><label class="select-visible-label"><input type="checkbox" class="product-checkbox" id="select-visible-products"><span class="desktop-selection-label">Selecionar todos</span><span class="mobile-selection-label">Selecionar exibidos</span></label>'+
      '<button type="button" class="action-button" id="bulk-products">'+
      (selectedProducts.size?'Aplicar aos selecionados':'Aplicar em todos')+'</button><span id="product-selection-count" role="status">'+
      (selectedProducts.size?selectedProducts.size+' '+(selectedProducts.size===1?'selecionado':'selecionados'):current.products.length+' produtos')+'</span>'+
      (selectedProducts.size?'<button type="button" class="text-button" id="clear-product-selection">Limpar seleção</button>':'')+'</div>'+
      (list.length?table(['<span class="sr-only">Seleção</span>','Produto','Custo unitário','Imposto','Gestão de estoque',''],rows,'catalog-table'):empty('Nenhum produto encontrado','Altere a busca ou remova o filtro.'))+
      '<div class="table-footer product-table-footer"><span class="mobile-selection-label">'+num(list.length)+' de '+num(current.products.length)+' produtos</span><span class="desktop-selection-label" role="status">'+(list.length?num(start+1)+'–'+num(Math.min(start+productPageSize,list.length)):'0')+' de '+num(list.length)+' produtos</span>'+action('Exportar CSV','data-export="cadastro"')+
      '<nav class="product-pagination" aria-label="Páginas de produtos"><button type="button" data-product-page="'+(state.productPage-1)+'" aria-label="Página anterior"'+(state.productPage===1?' disabled':'')+'><span class="chevron left" aria-hidden="true"></span></button><div class="page-wheel">'+Array.from({length:pages},(_,i)=>'<button type="button" data-product-page="'+(i+1)+'" aria-label="Página '+(i+1)+'"'+(state.productPage===i+1?' aria-current="page"':'')+'><span>'+(i+1)+'</span></button>').join('')+'</div><button type="button" data-product-page="'+(state.productPage+1)+'" aria-label="Próxima página"'+(state.productPage===pages?' disabled':'')+'><span class="chevron" aria-hidden="true"></span></button></nav></div></section>';
    const selectVisible=$('#select-visible-products');
    if(selectVisible){
      const visibleSelected=list.filter(p=>selectedProducts.has(p.id)).length;
      selectVisible.disabled=!list.length;
      selectVisible.checked=list.length>0&&visibleSelected===list.length;
      selectVisible.indeterminate=visibleSelected>0&&visibleSelected<list.length;
    }
  }
  function renderListings(){
    if(state.tab!=='lista'){renderListingAnalysis();return;}
    const query=state.search.trim().toLocaleLowerCase('pt-BR');
    const list=current.products.filter(p=>(p.name+' '+p.sku+' '+p.itemId).toLocaleLowerCase('pt-BR').includes(query))
      .filter(p=>state.productFilter==='full'?p.full>0:state.productFilter==='catalog'?p.catalog:true);
    const filters=[['all','Todos'],['full','Full'],['catalog','Catálogo']].map(([id,label])=>
      '<button type="button" data-product-filter="'+id+'" aria-pressed="'+(state.productFilter===id)+'">'+label+'</button>').join('');
    const listings=list.map(p=>{
      const tone=p.result==null?'muted':p.result<0?'negative':'positive';
      const stats='<div class="listing-stats"><div><small>Preço</small><strong>'+money(listingPrice(p))+'</strong></div><div><small>Margem no período</small><strong class="'+tone+'">'+pct(M.margin(p))+'</strong></div></div>';
      return '<article class="listing-row"><div class="listing-product">'+cover(p)+'<div><h3><button type="button" class="listing-title" data-product="'+p.id+'">'+esc(p.name)+'</button></h3><small>'+esc(p.itemId)+' · '+esc(p.sku)+'</small><div class="listing-tags">'+
        (p.full>0?status('Full','good'):'')+(p.catalog?status('Catálogo'):'')+(desktopLayout.matches?'<button type="button" class="listing-stock stock-edit-link" data-edit-stock="'+p.id+'" aria-label="Editar estoque do Depósito de '+esc(p.name)+'">Depósito: '+num(p.warehouse)+' un.</button>'+(p.unitCost==null?status('Custo pendente','warning'):''):'')+'</div></div></div>'+
        '<div class="listing-result">'+stats+'<div class="listing-actions">'+(desktopLayout.matches?'<button type="button" class="action-button listing-price-action" data-listing-price="'+p.id+'" aria-label="Precificar '+esc(p.name)+'"><img src="/painel/assets/precify.png" alt="">Precificar</button>':'')+'<button type="button" class="action-button" data-product="'+p.id+'" aria-label="Ver desempenho de '+esc(p.name)+'">Ver desempenho</button></div></div></article>';
    }).join('');
    $('#page-content').innerHTML='<section class="panel"><div class="toolbar">'+productSearch('Título, SKU ou MLB')+
      '<div class="filter-chips" role="group" aria-label="Filtrar anúncios">'+filters+'</div></div>'+
      (list.length?listings:empty('Nenhum anúncio encontrado','Altere a busca ou os filtros.'))+'</section>';
  }
  function renderListingAnalysis(){
    const list=filteredProducts(),missing=current.products.filter(p=>p.unitCost==null).length;
    const chips=state.tab==='estoque'?[['all','Todos'],['reorder-full','Reposição Full'],['reorder-warehouse','Reposição Depósito'],['idle','Sem giro']]:[['all','Todos'],['decline','Em queda'],['negative','Margem negativa'],['missing','Custo pendente']];
    $('#page-content').innerHTML=(missing?'<div class="inline-note"><span><strong>'+missing+' produto sem custo.</strong> Complete para conferir seu resultado.</span>'+action('Cadastrar custo','data-edit-cost="'+current.products.find(p=>p.unitCost==null)?.id+'"',true)+'</div>':'')+'<section class="panel"><div class="plain-summary"><span><b>'+list.length+'</b>'+(list.length===1?'produto exibido':'produtos exibidos')+'</span><span><b>'+alerts.length+'</b>pendências na conta</span><span><b>'+(current.products.length-missing)+'/'+current.products.length+'</b>custos cadastrados</span></div><div class="toolbar"><label class="search-field">'+icon('search')+'<span class="sr-only">Buscar produtos</span><input id="product-search" type="search" placeholder="Produto, SKU ou MLB" value="'+esc(state.search)+'" autocomplete="off"></label>'+productSortControl()+'<div class="filter-chips" role="group" aria-label="Filtrar produtos">'+chips.map(([id,label])=>'<button data-product-filter="'+id+'" aria-pressed="'+(state.productFilter===id)+'">'+label+'</button>').join('')+'</div></div><div id="products-list">'+(list.length?productRows(list):empty('Nenhum produto encontrado','Tente outro nome ou remova o filtro.'))+'</div><div class="table-footer"><span>'+list.length+' de '+current.products.length+' produtos'+(state.tab==='estoque'?'':' · conta conectada')+'</span>'+(state.tab==='estoque'?'':action('Exportar CSV','data-export="produtos"'))+'</div></section>';
    if(state.tab==='estoque'){
      const stock=M.inventoryInsights(current);
      $('.plain-summary').outerHTML='<div class="stock-insights"><button data-product-filter="reorder-full" aria-pressed="'+(state.productFilter==='reorder-full')+'"><span>Reposição Full '+arrow+'</span><strong>'+stock.fullReorder.length+' '+(stock.fullReorder.length===1?'anúncio':'anúncios')+'</strong></button><button data-product-filter="reorder-warehouse" aria-pressed="'+(state.productFilter==='reorder-warehouse')+'"><span>Reposição Depósito '+arrow+'</span><strong>'+stock.warehouseReorder.length+' '+(stock.warehouseReorder.length===1?'anúncio':'anúncios')+'</strong></button><div><span>Investido em estoque</span><strong>'+money(stock.capital.value)+'</strong>'+(stock.capital.complete?'':'<small>Custo pendente</small>')+'</div><button data-product-filter="idle" aria-pressed="'+(state.productFilter==='idle')+'"><span>Sem vendas no período '+arrow+'</span><strong>'+money(stock.idle.value)+'</strong><small>'+stock.idle.products.length+' '+(stock.idle.products.length===1?'produto':'produtos')+' com estoque'+(stock.idle.complete?'':' · valor parcial')+'</small></button></div>';
    }else{
      $('.plain-summary').outerHTML='<div class="analysis-heading"><div><h2>'+
        (state.tab==='catalogo'?'Preços no catálogo':'Desempenho dos anúncios')+
        '</h2><p>'+$('#comparison-note').textContent+'</p></div><span class="analysis-count">'+
        list.length+' '+(list.length===1?'anúncio':'anúncios')+'</span></div>';
    }
    $('#products-list').closest('section').classList.add('analysis-panel');
    if(state.tab==='estoque')bindWarehouseControls();
  }
  const ratio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b:null;
  const roas=total=>ratio(total.adRevenue,total.ads);
  const ratioPercent=(a,b)=>{const value=ratio(a,b);return value==null?null:value*100;};
  const acos=total=>ratioPercent(total.ads,total.adRevenue);
  const multiple=n=>n==null?'--':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'×';
  const adMetrics=[
    {id:'adUnits',label:'Vendas atribuídas',read:t=>t.adUnits,format:num,detail:'Unidades atribuídas aos Ads',bars:true},
    {id:'roas',label:'ROAS',read:roas,format:multiple,detail:'Receita atribuída dividida pelo investimento'},
    {id:'adRevenue',label:'Receita',read:t=>t.adRevenue,format:money,detail:'Receita atribuída aos Ads'},
    {id:'ads',label:'Investimento',read:t=>t.ads,format:money,detail:'Gasto com publicidade',neutral:true},
    {id:'acos',label:'ACOS',read:acos,format:pct,detail:'Investimento como percentual da receita atribuída',lowerIsBetter:true},
    {id:'clicks',label:'Cliques',read:t=>t.clicks,format:num,detail:'Cliques nos anúncios patrocinados',bars:true},
  ];
  function renderAdMetrics(){
    const selected=desktopLayout.matches?state.adSelection:[state.chart.publicidade];
    $('#metrics').innerHTML=adMetrics.map(m=>{
      const value=m.read(current);
      const comparison=comparable?delta(value,m.read(previous),m.neutral,m.lowerIsBetter):'';
      return '<button type="button" class="ad-metric" data-chart="'+m.id+'" style="--series:var(--ad-'+m.id+')" aria-controls="chart-section" aria-pressed="'+
        selected.includes(m.id)+'" title="'+m.detail+'"><span class="ad-metric-label">'+m.label+
        '</span><span class="ad-metric-value"><strong>'+m.format(value)+'</strong>'+comparison+'</span></button>';
    }).join('');
  }
  function renderAds(){
    renderAdMetrics();
    if(state.tab==='campanhas'){renderCampaigns();return;}
    const rows=current.products.filter(p=>p.ads>0).filter(p=>state.adFilter!=='negative'||p.adResult!=null&&p.adResult<0).sort((a,b)=>(a.adResult??Infinity)-(b.adResult??Infinity));
    const headline=current.adResult==null?'Complete os custos para avaliar o retorno.':current.adResult<0?'Os custos superaram a receita atribuída aos anúncios.':'Veja quais anúncios sustentam o resultado.';
    $('#page-content').innerHTML='<section class="panel"><div class="ad-note"><span><strong>'+headline+'</strong><br>Resultado após os custos proporcionais às vendas atribuídas. '+action('Ver cálculo','data-ads-info',true)+'</span><span class="mini-bars" aria-hidden="true"><b></b><b></b><b></b></span></div><div class="toolbar"><h2 style="font-size:14px">Anúncios</h2><div class="filter-chips" role="group" aria-label="Filtrar anúncios em publicidade"><button data-ad-filter="all" aria-pressed="'+(state.adFilter==='all')+'">Todos</button><button data-ad-filter="negative" aria-pressed="'+(state.adFilter==='negative')+'">Resultado negativo</button></div>'+action('Exportar CSV','data-export="publicidade"')+'</div>'+(rows.length?table(['Produto','Investimento','Receita atribuída','ROAS','ACOS','Cliques','Resultado atribuído',''],rows.map(p=>'<tr>'+cell('Produto',productName(p))+cell('Investimento',value(money(p.ads)))+cell('Receita atribuída',value(money(p.adRevenue)))+cell('ROAS',value(multiple(roas(p))))+cell('ACOS',value(pct(acos(p))))+cell('Cliques',value(num(p.clicks)))+cell('Resultado atribuído',value(money(p.adResult),'Após custos e Ads',p.adResult<0?'negative':''))+rowOpen(p)+'</tr>').join('')):empty('Nenhum anúncio nesta seleção','Altere o filtro para ver os demais produtos.'))+'</section>';
  }
  function renderCampaigns(){
    const groups=M.campaigns(current).map(c=>({...c,roas:roas(c)}));
    if(!groups.length){$('#page-content').innerHTML='<section class="panel">'+empty('Nenhuma campanha no período','Não houve investimento em publicidade nesta seleção.')+'</section>';return;}
    const options=[['roas','ROAS'],['adRevenue','Receita Ads'],['ads','Investimento'],['adResult','Resultado']],key=state.campaignMetric;
    const available=groups.filter(c=>c[key]!=null),max=Math.max(1,...available.map(c=>Math.abs(c[key]))),bipolar=available.some(c=>c[key]<0),origin=bipolar?50:0,space=bipolar?50:100;
    const bars=groups.map(c=>{const n=c[key],shown=key==='roas'?multiple(n):money(n),width=n==null?0:Math.abs(n)/max*space,left=n<0?origin-width:origin;return '<button class="campaign-bar-row" data-campaign="'+esc(c.id)+'" aria-label="Ver campanha '+esc(c.name)+': '+shown+'"><span class="campaign-bar-label">'+esc(c.name)+'</span><strong class="'+(n<0?'negative':'')+'">' +shown+'</strong><span class="campaign-bar-track '+(bipolar?'bipolar':'')+'" aria-hidden="true"><span class="campaign-bar-fill '+(n<0?'negative':'')+'" style="left:'+left+'%;width:'+width+'%"></span></span></button>';}).join('');
    const rows=groups.map(c=>'<tr>'+cell('Campanha','<button class="product-name campaign-name" data-campaign="'+esc(c.id)+'">'+esc(c.name)+'</button><span class="table-sub">'+c.products.length+' '+(c.products.length===1?'anúncio':'anúncios')+'</span>')+cell('Investimento',value(money(c.ads)))+cell('Receita atribuída',value(money(c.adRevenue)))+cell('ROAS',value(multiple(c.roas)))+cell('ACOS',value(pct(acos(c))))+cell('Cliques',value(num(c.clicks)))+cell('Resultado atribuído',value(money(c.adResult),c.adResult==null?'Custo pendente':c.adResult<0?'Resultado negativo':'Após custos e Ads',c.adResult<0?'negative':''))+cell('','<button class="row-open" data-campaign="'+esc(c.id)+'" aria-label="Detalhar campanha '+esc(c.name)+'">'+arrow+'</button>')+'</tr>').join('');
    $('#page-content').innerHTML='<section class="panel campaign-comparison"><div class="panel-heading"><div><h2>Comparar campanhas</h2><p>Selecione uma campanha para ver os anúncios.</p></div><div class="segments" role="group" aria-label="Métrica das campanhas">'+options.map(([id,label])=>'<button data-campaign-metric="'+id+'" aria-pressed="'+(id===key)+'">'+label+'</button>').join('')+'</div></div><div class="campaign-bars" role="group" aria-label="Comparação de '+options.find(([id])=>id===key)[1]+' por campanha">'+bars+'</div><p class="section-footnote">Campanhas recebidas do Mercado Livre. '+range(state.start,state.end)+'.</p></section><section class="panel"><div class="panel-heading"><h2>Campanhas</h2>'+action('Exportar CSV','data-export="campanhas"')+'</div>'+table(['Campanha','Investimento','Receita atribuída','ROAS','ACOS','Cliques','Resultado atribuído',''],rows)+'</section>';
  }
  function precifyCardLink(product,content,cssClass=''){
    const attributes=(cssClass?' class="'+cssClass+'"':'')+' aria-label="'+
      (product.permalink?'Abrir ':'Revisar cálculo de ')+esc(product.name)+'"';
    return product.permalink
      ? '<a'+attributes+' href="'+esc(product.permalink)+'" target="_blank" rel="noopener noreferrer">'+content+'</a>'
      : '<button type="button"'+attributes+' data-pricing="'+product.id+'">'+content+'</button>';
  }
  const eanHistoryKey='novai-ean-history-v1';
  function readEANHistory(){return structuredClone(M.data.eanHistory||[]);}
  let eanHistory=readEANHistory(),eanCode=eanHistory[0]?.code||'',eanPage=1;
  const eanDate=timestamp=>new Date(timestamp).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const copyIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="12" height="14" rx="2"/><path d="M16 18v2H4V8h4"/></svg>';
  const downloadIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></svg>';
  async function saveEANHistory(next){if(!await persist({eanHistory:next}))return false;eanHistory=next;return true;}
  async function copyEAN(){if(!eanCode)return;try{await navigator.clipboard.writeText(eanCode);toast('Código copiado.');}catch{const output=$('#ean-number'),selection=window.getSelection(),range=document.createRange();range.selectNodeContents(output);selection.removeAllRanges();selection.addRange(range);toast('Código selecionado. Use Ctrl+C para copiar.');}}
  function downloadEAN(){if(!eanCode)return;const url=URL.createObjectURL(new Blob([window.NovaiEAN.svg(eanCode)],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='EAN-'+eanCode+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function renderEAN(focusSelector=null){
    const pageSize=10,pages=Math.max(1,Math.ceil(eanHistory.length/pageSize));eanPage=Math.max(1,Math.min(eanPage,pages));const entries=eanHistory.slice((eanPage-1)*pageSize,eanPage*pageSize);
    $('#page-content').innerHTML='<section class="panel ean-generator" aria-labelledby="ean-title"><div class="ean-generator-heading"><h2 id="ean-title">Gerador de EAN-13</h2><p>Gere, copie e guarde seus códigos.</p></div><div class="ean-generator-strip"><button type="button" class="ean-generate" id="ean-generate">Gerar novo</button><div class="ean-code-field"><output id="ean-number" aria-label="Código EAN-13 gerado">'+(eanCode||'—')+'</output><button type="button" class="ean-icon-button" id="ean-copy" aria-label="Copiar código EAN" title="Copiar código"'+(!eanCode?' disabled':'')+'>'+copyIcon+'</button></div><div class="ean-barcode-field"><div class="ean-barcode-preview">'+(eanCode?window.NovaiEAN.previewSvg(eanCode):'<span>Seu código de barras</span>')+'</div><button type="button" class="ean-icon-button" id="ean-download" aria-label="Baixar código de barras" title="Baixar código de barras"'+(!eanCode?' disabled':'')+'>'+downloadIcon+'</button></div></div><p id="ean-error" class="form-error" role="alert"></p><p class="ean-generator-note">Numeração gerada localmente. Não registra GTIN na GS1.</p></section><section class="panel ean-history" aria-labelledby="ean-history-title"><div class="panel-heading"><div><h2 id="ean-history-title">Histórico de códigos</h2><p>Salvo na sua conta NOVAI.</p></div><span>Total de <strong>'+eanHistory.length+'</strong></span></div>'+(entries.length?table(['Código','SKU associado','Data de criação'],entries.map(entry=>{const product=M.products.find(p=>p.id===entry.skuId);return '<tr>'+cell('Código','<button type="button" class="ean-history-code" data-ean-select="'+entry.code+'"'+(entry.code===eanCode?' aria-current="true"':'')+'>'+entry.code+'</button>')+cell('SKU associado','<button type="button" class="ean-sku-button '+(product?'associated':'')+'" data-ean-sku="'+entry.code+'" aria-label="Associar SKU ao código '+entry.code+'" title="'+esc(product?product.name:'Associar um produto')+'">'+(product?esc(product.sku):'Livre')+'</button>')+cell('Data de criação',eanDate(entry.createdAt))+'</tr>';}).join(''),'ean-history-table'):'<p class="ean-history-empty">Os códigos que você gerar aparecerão aqui.</p>')+(pages>1?'<nav class="product-pagination ean-pagination" aria-label="Páginas do histórico de códigos"><button type="button" data-ean-page="'+(eanPage-1)+'" aria-label="Página anterior"'+(eanPage===1?' disabled':'')+'><span class="chevron left" aria-hidden="true"></span></button><div class="page-wheel">'+Array.from({length:pages},(_,i)=>'<button type="button" data-ean-page="'+(i+1)+'" aria-label="Página '+(i+1)+'"'+(eanPage===i+1?' aria-current="page"':'')+'><span>'+(i+1)+'</span></button>').join('')+'</div><button type="button" data-ean-page="'+(eanPage+1)+'" aria-label="Próxima página"'+(eanPage===pages?' disabled':'')+'><span class="chevron" aria-hidden="true"></span></button></nav>':'')+'</section>';
    $('#ean-generate').onclick=async ()=>{try{const latest=readEANHistory(),code=window.NovaiEAN.generate(latest.map(entry=>entry.code)),next=[{code,createdAt:Date.now(),skuId:null},...latest];if(!await saveEANHistory(next))throw Error('Não foi possível salvar o código na sua conta. Tente novamente.');eanCode=code;eanPage=1;renderEAN('#ean-generate');$('#announcement').textContent='Novo código EAN-13: '+code;}catch(cause){$('#ean-error').textContent=cause.message;}};
    $('#ean-copy').onclick=copyEAN;$('#ean-download').onclick=downloadEAN;
    for(const button of $$('[data-ean-select]'))button.onclick=()=>{eanCode=button.dataset.eanSelect;renderEAN('[data-ean-select="'+eanCode+'"]');};
    for(const button of $$('[data-ean-sku]'))button.onclick=()=>openEANAssociation(button.dataset.eanSku);
    for(const button of $$('[data-ean-page]'))button.onclick=()=>{eanPage=Number(button.dataset.eanPage);renderEAN('[data-ean-page="'+eanPage+'"]');};
    if(focusSelector)$(focusSelector)?.focus({preventScroll:true});renderPageExport();
  }
  function openEANAssociation(code){
    if(!eanHistory.some(entry=>entry.code===code))return;
    openDialog('ean-sku','<h2 id="dialog-title">Associar SKU</h2><p class="ean-association-code">'+code+'</p><label class="search-field"><span class="sr-only">Buscar SKU ou produto</span><input id="ean-sku-search" type="search" placeholder="Buscar SKU ou produto" autocomplete="off"></label><div id="ean-sku-options" class="ean-sku-options"></div><button type="button" class="button secondary" id="ean-unlink">Deixar livre</button><p class="ean-association-note">Associação no histórico; não altera o anúncio no Mercado Livre.</p>');
    const assign=async skuId=>{const next=readEANHistory().map(entry=>entry.code===code?{...entry,skuId}:entry);if(!await saveEANHistory(next)){toast('Não foi possível salvar a associação.');return;}eanCode=code;renderEAN();returnFocus=$('[data-ean-sku="'+code+'"]');dialog.close();toast(skuId?'SKU associado.':'Código livre.');};
    const list=()=>{const query=$('#ean-sku-search').value.trim().toLocaleLowerCase('pt-BR'),products=M.products.filter(p=>(p.sku+' '+p.name).toLocaleLowerCase('pt-BR').includes(query));$('#ean-sku-options').innerHTML=products.map(p=>'<button type="button" data-ean-assign="'+p.id+'">'+cover(p)+'<span><strong>'+esc(p.sku)+'</strong><small>'+esc(p.name)+'</small></span></button>').join('')||'<p>Nenhum produto encontrado.</p>';for(const button of $$('[data-ean-assign]'))button.onclick=()=>assign(button.dataset.eanAssign);imageFallbacks();};
    $('#ean-sku-search').oninput=list;$('#ean-unlink').onclick=()=>assign(null);list();$('#ean-sku-search').focus();
  }
  function creationBadge(p){
    const known=Number.isFinite(p.age)&&p.age>=0,tone=!known?'unknown':p.age>=365?'red':p.age>180?'yellow':'green';
    const tooltip=known&&p.createdAt?' title="Criado em '+date(p.createdAt,true)+'"':'';
    return '<div class="creation-cell"><span class="creation-desktop creation-badge '+tone+'"'+tooltip+'><small>Criação</small><strong>'+(known?num(p.age)+' Dias':'--')+'</strong></span><span class="creation-mobile"><small>Criação</small><span class="age-label '+tone+'"'+tooltip+'>'+(known?p.age+' Dias':'--')+'</span></span></div>';
  }
  function renderOpportunities(){
    if(window.NovaiSavedPanel?.enabled){renderExtensionSaved();return;}
    const entries=state.tab==='salvos'?saved.map(s=>({p:precifyProductById(s.id),q:M.quote(s)})):current.products.map(p=>({p,q:null}));
    const visible=entries.filter(({p})=>(p.name+' '+p.itemId).toLowerCase().includes(state.search.toLowerCase()));
    $('#page-content').innerHTML='<div class="opportunity-head"><p>'+(state.tab==='salvos'?'<span class="precify-word">Precify</span> · '+saved.length+' estudos salvos na sua conta.':'Anúncios da sua conta · custos informados por você.')+'</p><label class="search-field">'+icon('search')+'<span class="sr-only">Buscar estudos de produto</span><input id="opportunity-search" type="search" placeholder="Buscar produto" value="'+esc(state.search)+'"></label></div>'+(visible.length?'<div class="saved-grid'+(state.tab==='salvos'?' studies-grid':'')+'">'+visible.map(({p,q})=>'<article class="saved-card">'+(q?'<span class="profit-dot '+(q.profit<0?'negative':'positive')+'" aria-label="'+(q.profit<0?'Resultado negativo':'Resultado positivo')+'"></span>':'')+precifyCardLink(p,cover(p),'saved-cover')+'<div class="saved-body"><h3>'+precifyCardLink(p,esc(p.name))+'</h3><span class="saved-id">'+p.itemId+'</span>'+(q?'<div class="saved-numbers"><div><small>Resultado por venda</small><strong class="'+(q.profit<0?'negative':'positive')+'">'+money(q.profit)+'</strong></div><div><small>Margem</small><strong class="'+(q.profit<0?'negative':'positive')+'">'+pct(q.margin)+'</strong></div></div>':'<div class="saved-numbers"><div><small>Preço na amostra</small><strong>'+money(p.price)+'</strong></div>'+creationBadge(p)+'</div>')+'<div class="saved-actions">'+action(q?'Revisar cálculo':'Calcular margem','data-pricing="'+p.id+'"',true)+(q?'<button class="text-button" data-remove-saved="'+p.id+'">Remover</button>':'<span class="status">'+(p.catalog?'Catálogo':'Anúncio avulso')+'</span>')+'</div></div></article>').join('')+'</div>':empty('Nenhum estudo encontrado',state.tab==='salvos'?'Salve uma simulação do Precify para consultar depois.':'Tente outro produto da amostra.'));
  }
  function renderExtensionSaved(){
    const bridge=window.NovaiSavedPanel;
    if(bridge.status!=='ready'){$('#page-content').innerHTML='<section class="panel">'+empty(bridge.status==='loading'?'Carregando salvos…':'Entre na sua conta Novai','Os cálculos salvos no Precify aparecerão aqui.')+'<div class="dialog-actions" style="padding:0 24px 24px"><button class="button primary" data-extension-account>Entrar na conta</button><button class="button secondary" data-refresh-saved>Atualizar</button></div></section>';return;}
    const items=bridge.items.filter(p=>(p.name+' '+p.itemId).toLowerCase().includes(state.search.toLowerCase()));
    $('#page-content').innerHTML='<div class="opportunity-head"><p><span class="precify-word">Precify</span> · '+bridge.items.length+' estudos salvos.</p><label class="search-field">'+icon('search')+'<span class="sr-only">Buscar estudos de produto</span><input id="opportunity-search" type="search" placeholder="Buscar produto" value="'+esc(state.search)+'"></label></div>'+(items.length?'<div class="saved-grid studies-grid">'+items.map(p=>'<article class="saved-card"><span class="profit-dot '+(p.profit<0?'negative':'positive')+'" aria-label="'+(p.profit<0?'Resultado negativo':'Resultado positivo')+'"></span><a class="saved-cover" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer"><img class="cover" src="'+esc(p.image||'')+'" alt="" loading="lazy"></a><div class="saved-body"><h3><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.name)+'</a></h3><span class="saved-id">'+esc(p.itemId)+'</span><div class="saved-numbers"><div><small>Lucro por venda</small><strong class="'+(p.profit<0?'negative':'positive')+'">'+money(p.profit)+'</strong></div><div><small>Margem</small><strong class="'+(p.margin<0?'negative':'positive')+'">'+pct(p.margin)+'</strong></div></div><div class="saved-actions"><a class="text-button yellow" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">Revisar no anúncio '+arrow+'</a><button class="text-button" data-remove-study="'+esc(p.itemId)+'">Remover</button></div></div></article>').join('')+'</div>':empty('Nenhum estudo encontrado','Adicione um cálculo aos salvos pelo Precify no anúncio.'));imageFallbacks();
  }

  function toggleAdSeries(key){
    if(!adMetrics.some(m=>m.id===key))return;
    const index=state.adSelection.indexOf(key);
    if(index>=0)state.adSelection.splice(index,1);else state.adSelection.push(key);
    state.chart.publicidade=key;
    renderChart();revealPanel($('#chart'));
    $('[data-chart="'+key+'"]')?.focus({preventScroll:true});
    $('#announcement').textContent=state.adSelection.length+' métricas selecionadas no gráfico.';
  }
  function renderAdChart(){
    const metrics=adMetrics.filter(m=>state.adSelection.includes(m.id));
    $('#chart-section .segments').hidden=true;
    $$('.ad-metric').forEach(b=>b.setAttribute('aria-pressed',String(state.adSelection.includes(b.dataset.chart))));
    $('#chart-title').textContent='Evolução da publicidade';
    $('#chart-caption').textContent=metrics.length>1?'Compare tendências. Cada métrica usa sua própria escala.':metrics[0]?.detail||'Selecione as métricas nos cartões acima.';
    $('#chart-tooltip').hidden=true;activePoint=-1;chartPoints=[];
    const step=Math.max(1,Math.ceil(current.days.length/35));
    for(let i=0;i<current.days.length;i+=step){
      const rows=current.days.slice(i,i+step),totals={};
      for(const key of ['adUnits','adRevenue','ads','clicks'])totals[key]=rows.some(r=>r[key]==null)?null:M.round(rows.reduce((sum,r)=>sum+r[key],0));
      const values=Object.fromEntries(metrics.map(m=>[m.id,m.read(totals)]));
      chartPoints.push({day:rows[0].day,end:rows.at(-1).day,values,value:values[metrics[0]?.id]??null});
    }
    const unavailable=!metrics.length||!chartPoints.some(p=>metrics.some(m=>p.values[m.id]!=null));
    $('#chart-empty').hidden=!unavailable;$('#chart').hidden=unavailable;
    $('#chart-empty').textContent=metrics.length?'Sem dados suficientes no período selecionado.':'Selecione uma ou mais métricas nos cartões acima.';
    $('#chart-frequency').textContent=step===1?'Valores diários':'Valores agrupados a cada '+step+' dias';
    $('#ad-chart-legend').innerHTML=metrics.map(m=>'<button type="button" data-ad-toggle="'+m.id+'" style="--series:var(--ad-'+m.id+')" aria-label="Ocultar '+m.label+' do gráfico"><span class="series-swatch" aria-hidden="true"></span>'+m.label+'</button>').join('');
    $('#chart-container').setAttribute('aria-label','Gráfico com '+metrics.map(m=>m.label).join(', ')+'. Use as setas para consultar os valores por data.');
    if(unavailable){$('#chart-dates').innerHTML='';return;}
    chartWidth=$('#chart-container').clientWidth||700;chartHeight=$('#chart-container').clientHeight||245;
    const left=49,right=chartWidth-5,top=12,bottom=chartHeight-10;
    const maxima=Object.fromEntries(metrics.map(m=>[m.id,Math.max(1,...chartPoints.map(p=>p.values[m.id]??0))*1.15]));
    chartPoints.forEach((p,i)=>{
      p.x=left+(right-left)*(chartPoints.length===1?.5:i/(chartPoints.length-1));
      p.ys=Object.fromEntries(metrics.map(m=>[m.id,p.values[m.id]==null?null:bottom-p.values[m.id]/maxima[m.id]*(bottom-top)]));
      p.y=p.ys[metrics[0].id];
    });
    const grid=Array.from({length:4},(_,i)=>{
      const y=top+(bottom-top)*i/3;
      const label=metrics.length===1?new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(maxima[metrics[0].id]*(1-i/3))+(metrics[0].id==='roas'?'×':metrics[0].id==='acos'?'%':''):'';
      return '<line x1="'+left+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" class="ad-chart-grid"/><text x="0" y="'+(y+3)+'" font-size="10">'+label+'</text>';
    }).join('');
    const series=metrics.map(m=>{
      if(m.id==='adUnits'){
        const w=Math.min(28,(right-left)/chartPoints.length*.46);
        return '<g class="ad-series-bars" data-series="'+m.id+'" style="fill:var(--ad-'+m.id+')">'+chartPoints.filter(p=>p.ys[m.id]!=null).map(p=>'<rect x="'+Math.max(left,Math.min(right-w,p.x-w/2))+'" y="'+p.ys[m.id]+'" width="'+w+'" height="'+(bottom-p.ys[m.id])+'" rx="2"/>').join('')+'</g>';
      }
      const line=M.smoothLine(chartPoints.map(p=>({x:p.x,y:p.ys[m.id]})));
      const dots=chartPoints.filter((p,i)=>p.ys[m.id]!=null&&chartPoints[i-1]?.ys[m.id]==null&&chartPoints[i+1]?.ys[m.id]==null).map(p=>'<circle cx="'+p.x+'" cy="'+p.ys[m.id]+'" r="3" style="fill:var(--ad-'+m.id+')"/>').join('');
      return '<path class="ad-series-line" data-series="'+m.id+'" style="stroke:var(--ad-'+m.id+')" d="'+line+'"/>'+dots;
    }).join('');
    $('#chart').setAttribute('viewBox','0 0 '+chartWidth+' '+chartHeight);
    $('#chart').innerHTML=grid+series+'<g id="chart-focus" visibility="hidden"><line id="focus-line" y1="'+top+'" y2="'+bottom+'"/>'+metrics.map(m=>'<circle class="ad-focus-dot" data-point-series="'+m.id+'" r="4" style="fill:var(--ad-'+m.id+')"/>').join('')+'</g>';
    const ticks=[...new Set([0,Math.floor((chartPoints.length-1)/3),Math.floor((chartPoints.length-1)*2/3),chartPoints.length-1])];
    $('#chart-dates').innerHTML=ticks.map(i=>'<span>'+date(chartPoints[i].day)+'</span>').join('');
  }
  function showAdPoint(i){
    if(!chartPoints.length||$('#chart').hidden)return;
    activePoint=Math.max(0,Math.min(chartPoints.length-1,i));
    const p=chartPoints[activePoint],metrics=adMetrics.filter(m=>state.adSelection.includes(m.id));
    const focus=$('#chart-focus');if(!focus)return;focus.setAttribute('visibility','visible');
    $('#focus-line').setAttribute('x1',p.x);$('#focus-line').setAttribute('x2',p.x);
    for(const dot of $$('[data-point-series]')){const y=p.ys[dot.dataset.pointSeries];dot.setAttribute('cx',p.x);dot.setAttribute('cy',y??0);dot.style.display=y==null?'none':'';}
    const text=p.day===p.end?date(p.day,true):range(p.day,p.end),tip=$('#chart-tooltip');
    tip.innerHTML='<small>'+text+'</small>'+metrics.map(m=>'<div class="series-tip-row" style="--series:var(--ad-'+m.id+')"><span class="series-swatch" aria-hidden="true"></span><span>'+m.label+'</span><strong>'+m.format(p.values[m.id])+'</strong></div>').join('');
    tip.hidden=false;tip.style.left=Math.max(130,Math.min(chartWidth-130,p.x))+'px';tip.style.top='8px';
    $('#chart-announcement').textContent=text+': '+metrics.map(m=>m.label+' '+m.format(p.values[m.id])).join(', ');
  }
  function renderChart(){
    const multi=state.route==='publicidade'&&desktopLayout.matches;
    $('#chart-section').classList.toggle('multi-ads',multi);
    $('#chart-tooltip').classList.toggle('multi-tooltip',multi);
    const legend=$('#ad-chart-legend');if(legend)legend.hidden=!multi;
    if(multi){renderAdChart();return;}
    const ads=state.route==='publicidade',options=[['gross','Faturamento'],['result','Resultado'],['orders','Vendas']];
    const key=state.chart[state.route]||options[0][0],metric=ads?adMetrics.find(m=>m.id===key):null;
    const controls=$('#chart-section .segments');
    controls.hidden=ads;
    if(ads)$$('.ad-metric').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chart===key)));
    else controls.innerHTML=options.map(([id,label])=>'<button data-chart="'+id+'" aria-pressed="'+(id===key)+'">'+label+'</button>').join('');
    const label=metric?.label||options.find(([id])=>id===key)?.[1];
    $('#chart-title').textContent=ads?'Evolução · '+label:'Evolução do período';
    $('#chart-caption').textContent=ads?metric.detail:'Uma visão por dia.';
    $('#chart-tooltip').hidden=true;activePoint=-1;
    chartPoints=[];
    const resultMissing=key==='result'&&current.result==null;
    const step=Math.max(1,Math.ceil(current.days.length/35));
    if(!resultMissing)for(let i=0;i<current.days.length;i+=step){
      const group=current.days.slice(i,i+step);
      const sum=field=>group.some(row=>row[field]==null)?null:M.round(group.reduce((total,row)=>total+row[field],0));
      const value=key==='roas'||key==='acos'?metric.read({ads:sum('ads'),adRevenue:sum('adRevenue')}):sum(key);
      chartPoints.push({day:group[0].day,end:group.at(-1).day,value});
    }
    const unavailable=!chartPoints.some(point=>point.value!=null);
    $('#chart-empty').hidden=!unavailable;$('#chart').hidden=unavailable;
    if(unavailable){
      $('#chart-empty').textContent=resultMissing?'Aguardando dados e custos completos para calcular o resultado.':'Sem dados suficientes para calcular '+label+' neste período.';
      $('#chart-dates').innerHTML='';
    }
    $('#chart-frequency').textContent=step===1?'Valores diários':'Valores agrupados a cada '+step+' dias';
    $('#chart-container').setAttribute('aria-label',unavailable?$('#chart-empty').textContent:'Gráfico de '+label+'. Use as setas para consultar '+chartPoints.length+' valores.');
    if(unavailable)return;
    chartWidth=$('#chart-container').clientWidth||700;chartHeight=$('#chart-container').clientHeight||195;
    $('#chart').setAttribute('viewBox','0 0 '+chartWidth+' '+chartHeight);
    const high=Math.max(1,...chartPoints.map(p=>p.value))*1.18,low=Math.min(0,...chartPoints.map(p=>p.value))*1.08,span=high-low,left=49,right=chartWidth-5,top=12,bottom=chartHeight-10;
    chartPoints.forEach((p,i)=>{p.x=left+(right-left)*(chartPoints.length===1?.5:i/(chartPoints.length-1));p.y=p.value==null?null:bottom-(p.value-low)/span*(bottom-top);});
    const compact=n=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n===0?0:n);
    const unit=key==='roas'?'×':key==='acos'?'%':'';
    const grid=Array.from({length:4},(_,i)=>{const y=top+(bottom-top)*i/3;return '<line x1="'+left+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" stroke="#ffffff18" stroke-dasharray="3 5"/><text x="0" y="'+(y+3)+'" fill="#92929c" font-size="10">'+compact(high-span*i/3)+unit+'</text>';}).join('');
    const line=chartPoints.map((p,i)=>p.y==null?'':(i&&chartPoints[i-1].y!=null?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
    const zero=bottom-(0-low)/span*(bottom-top);
    const area=chartPoints.every(p=>p.y!=null)?line+' L'+chartPoints.at(-1).x+' '+zero+' L'+chartPoints[0].x+' '+zero+' Z':'';
    const barWidth=Math.min(16,(right-left)/chartPoints.length*.56);
    const plot=metric?.bars
      ?chartPoints.map(p=>'<rect x="'+(p.x-barWidth/2)+'" y="'+p.y+'" width="'+barWidth+'" height="'+(zero-p.y)+'" rx="2" fill="#fee800"/>').join('')
      :'<path d="'+area+'" fill="url(#chart-fill)" stroke="none"/><path d="'+line+'" fill="none" stroke="#fee800" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'+
        chartPoints.filter((p,i)=>p.y!=null&&chartPoints[i-1]?.y==null&&chartPoints[i+1]?.y==null).map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3" fill="#fee800"/>').join('');
    $('#chart').innerHTML='<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#fee800" stop-opacity=".16"/><stop offset="100%" stop-color="#fee800" stop-opacity="0"/></linearGradient></defs>'+grid+plot+'<g id="chart-focus" visibility="hidden"><line id="focus-line" y1="'+top+'" y2="'+bottom+'" stroke="#fee80055"/><circle id="focus-dot" r="4" fill="#fee800" stroke="#1e1e1e" stroke-width="2"/></g>';
    const ticks=[...new Set([0,Math.floor((chartPoints.length-1)/3),Math.floor((chartPoints.length-1)*2/3),chartPoints.length-1])];
    $('#chart-dates').innerHTML=ticks.map(i=>'<span>'+date(chartPoints[i].day)+'</span>').join('');
  }
  function showPoint(i){
    if(state.route==='publicidade'&&desktopLayout.matches){showAdPoint(i);return;}
    if(!chartPoints.length||$('#chart').hidden)return;activePoint=Math.max(0,Math.min(chartPoints.length-1,i));const p=chartPoints[activePoint],focus=$('#chart-focus');if(!focus)return;
    focus.setAttribute('visibility','visible');$('#focus-line').setAttribute('x1',p.x);$('#focus-line').setAttribute('x2',p.x);$('#focus-dot').setAttribute('cx',p.x);$('#focus-dot').setAttribute('cy',p.y??0);$('#focus-dot').style.display=p.y==null?'none':'';
    const tip=$('#chart-tooltip'),text=p.day===p.end?date(p.day,true):range(p.day,p.end),key=state.chart[state.route];
    const format=adMetrics.find(m=>m.id===key)?.format||(key==='orders'?num:money);
    const shown=p.value==null?'Sem dados':format(p.value);
    tip.hidden=false;tip.innerHTML='<small>'+text+'</small><strong>'+shown+'</strong>';
    tip.style.left=Math.max(73,Math.min(chartWidth-73,p.x))+'px';tip.style.top=Math.max(64,(p.y??64)-9)+'px';$('#chart-announcement').textContent=text+': '+shown;
  }
  function openDialog(kind,html,back=null){
    if(!dialog.open)returnFocus=document.activeElement;
    dialogKind=kind;$('#dialog-content').innerHTML=html;$('#dialog-eyebrow').textContent={product:'SEU PRODUTO',finance:'FINANCEIRO',ads:'PUBLICIDADE',alerts:'PARA REVISAR',pricing:'PRECIFY',performance:'DESEMPENHO DO ANÚNCIO',expense:'DESPESAS DA OPERAÇÃO',campaign:'PUBLICIDADE'}[kind]||'NOVAI';
    dialog.classList.toggle('precify-dialog',kind==='pricing');
    dialog.classList.toggle('performance-dialog',kind==='performance');
    dialog.classList.toggle('listing-pricer-dialog',kind==='listing-pricing');
    if(kind==='pricing'||kind==='listing-pricing')$('#dialog-eyebrow').innerHTML='<img src="/painel/assets/precify.png" alt=""><strong>Precify</strong>';
    $('#dialog-back').hidden=!back;$('#dialog-back').onclick=back;
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;imageFallbacks();requestAnimationFrame(fitNumbers);
  }
  // Wrap a real request with updates.run(). No simulated progress or percentage.
  const updates=(()=>{
    const notice=document.createElement('div');
    notice.id='update-notice';notice.className='update-notice';notice.hidden=true;
    notice.setAttribute('popover','manual');
    notice.innerHTML='<span class="update-indicator" aria-hidden="true"></span><span role="status" aria-live="polite" aria-atomic="true"></span><button type="button" aria-label="Fechar aviso">×</button>';
    document.body.append(notice);
    const jobs=new Map();let timer,errorSeen=false;
    const position=()=>{notice.style.top=Math.max(12,Math.min(innerHeight-90,$('.topbar').getBoundingClientRect().bottom+8))+'px';};
    const hide=()=>{notice.hidePopover?.();notice.hidden=true;};
    const show=(text,kind)=>{
      clearTimeout(timer);notice.hidden=false;notice.dataset.state=kind;
      notice.querySelector('[role=status]').textContent=text;
      notice.querySelector('button').hidden=kind==='loading';position();
      if(notice.showPopover&&!notice.matches(':popover-open'))notice.showPopover();
    };
    notice.querySelector('button').onclick=hide;
    window.addEventListener('scroll',position,{passive:true});window.addEventListener('resize',position);
    async function run(label,operation,{success='Informações atualizadas.',error='Não foi possível atualizar. Tente novamente.'}={}){
      const token=Symbol();if(!jobs.size)errorSeen=false;jobs.set(token,label);
      $('#main').setAttribute('aria-busy','true');show(label,'loading');
      try{
        // Give the busy state a paint before local work; a server Promise stays pending naturally.
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const result=await operation();jobs.delete(token);
        if(jobs.size)show(jobs.size+' atualizações em andamento…','loading');
        else if(!errorSeen){if(success==null)hide();else{show(success,'success');timer=setTimeout(hide,3200);}}
        return result;
      }catch(cause){
        jobs.delete(token);errorSeen=true;show(error,'error');throw cause;
      }finally{if(!jobs.size)$('#main').removeAttribute('aria-busy');}
    }
    return Object.freeze({run});
  })();
  function costForm(product){
    const amount=product.unitCost==null?'':product.unitCost.toFixed(2).replace('.',',');
    const tax=product.taxRate==null?'':String(product.taxRate).replace('.',',');
    return '<form class="cost-form" id="cost-form"><label for="unit-cost">Custo por unidade</label>'+
      '<div class="field cost-field"><span>R$</span><input id="unit-cost" inputmode="decimal" autocomplete="off" value="'+amount+
      '" aria-describedby="cost-help"></div><small id="cost-help">Quanto você pagou por unidade.</small>'+
      '<label for="sku-tax">Imposto sobre a venda (%)</label><div class="field cost-field"><span>%</span>'+
      '<input id="sku-tax" inputmode="decimal" autocomplete="off" value="'+tax+'" placeholder="Ex.: 4"></div>'+
      '<label class="stock-setting"><input id="sku-stock" type="checkbox"'+(product.manageStock?' checked':'')+
      '><span>Ativar gestão de estoque<small>Configuração para dar baixa no estoque ao registrar uma venda.</small></span></label>'+
      '<p class="form-error" id="cost-error" role="alert"></p><button class="button primary" type="submit">Salvar cadastro</button></form>';
  }
  function bindCostForm(product,onSaved){
    $('#cost-form').onsubmit=async e=>{
      e.preventDefault();
      const id=product.id,input=$('#unit-cost'),taxInput=$('#sku-tax'),error=$('#cost-error');
      const amount=parseNumber(input.value),taxRate=parseNumber(taxInput.value);
      if(input.value.trim()&&(amount==null||amount<0||amount>1000000)){
        error.textContent='Informe um custo válido.';input.focus();return;
      }
      if(taxInput.value.trim()&&(taxRate==null||taxRate<0||taxRate>100)){
        error.textContent='Informe um imposto entre 0% e 100%.';taxInput.focus();return;
      }
      const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;
      try{await updates.run('Atualizando custo e cadastro…',async()=>{
      const oldCost=state.costs[id],oldMissing=state.missing,oldSettings=productSettings[id];
      state.costs[id]=amount==null?null:M.round(amount);
      productSettings[id]={...oldSettings,taxRate:taxRate==null?null:M.round(taxRate),manageStock:$('#sku-stock').checked};
      if(!await persist()){
        state.costs[id]=oldCost;state.missing=oldMissing;
        if(oldSettings)productSettings[id]=oldSettings;else delete productSettings[id];
        throw Error('Não foi possível salvar na sua conta.');
      }
      render();onSaved();
      },{success:'Cadastro atualizado.',error:'Não foi possível salvar o cadastro. Tente novamente.'});}
      catch{error.textContent='Não foi possível salvar na sua conta.';}
      finally{submit.disabled=false;}

    };
  }
  let costImportSession=null;
  function stopCostImport(){if(costImportSession){clearTimeout(costImportSession.timer);costImportSession.worker?.terminate();costImportSession=null;}}
  function openCostImport(){
    stopCostImport();
    openDialog('cost-import','<h2 id="dialog-title">Importar custos</h2><p class="subtext">Use as colunas <strong>SKU</strong> e <strong>Custo</strong>. Excel (.xlsx) ou CSV, até 5 MB.</p><div class="cost-import-file-row"><button type="button" class="button secondary" id="choose-cost-file">Selecionar planilha</button><button type="button" class="text-button" id="cost-import-template">Baixar modelo</button><input id="cost-import-file" type="file" accept=".xlsx,.csv" class="sr-only" tabindex="-1"><span id="cost-import-file-name"></span></div><div id="cost-import-options" hidden><label for="cost-import-sheet">Aba da planilha</label><select id="cost-import-sheet"></select><label class="checkbox cost-import-overwrite"><input type="checkbox" id="cost-import-overwrite" class="product-checkbox" checked>Atualizar custos já cadastrados</label></div><p id="cost-import-error" class="form-error" role="alert"></p><div id="cost-import-report" aria-live="polite"></div><div class="cost-import-footer"><span id="cost-import-caption">A planilha é lida no seu navegador.</span><button type="button" class="button primary" id="apply-cost-import" disabled>Importar custos</button></div>');
    dialog.classList.add('cost-import-dialog');
    costImportSession={worker:null,report:null,timer:null};
    $('#choose-cost-file').onclick=()=>$('#cost-import-file').click();
    $('#cost-import-template').onclick=()=>{const url=URL.createObjectURL(new Blob(['\ufeffSKU;Custo\r\nSEU-SKU;25,90\r\n'],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='modelo-custos-novai.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('#cost-import-file').onchange=()=>readCostFile($('#cost-import-file').files[0]);
    $('#cost-import-sheet').onchange=()=>requestCostReport();
    $('#cost-import-overwrite').onchange=()=>requestCostReport();
    $('#apply-cost-import').onclick=applyCostImport;
  }
  function costImportError(message){
    if(dialogKind!=='cost-import')return;
    $('#cost-import-error').textContent=message;$('#cost-import-report').removeAttribute('aria-busy');if(!costImportSession?.report)$('#cost-import-report').innerHTML='';$('#apply-cost-import').disabled=true;
  }
  function costImportWatch(session){
    clearTimeout(session.timer);session.timer=setTimeout(()=>{if(costImportSession===session){session.worker?.terminate();session.worker=null;costImportError('A leitura demorou demais. Tente uma planilha menor.');}},15000);
  }
  async function readCostFile(file){
    if(!file)return;
    $('#cost-import-file').value='';
    stopCostImport();const session=costImportSession={worker:null,report:null,timer:null};
    $('#cost-import-error').textContent='';$('#cost-import-report').innerHTML='';$('#apply-cost-import').disabled=true;$('#cost-import-options').hidden=true;
    $('#cost-import-file-name').textContent=file.name;
    if(file.size>5*1024*1024){costImportError('O arquivo deve ter até 5 MB.');return;}
    if(!/\.(xlsx|csv)$/i.test(file.name)){costImportError('Selecione um arquivo Excel (.xlsx) ou CSV.');return;}
    $('#cost-import-report').textContent='Analisando a planilha…';$('#cost-import-report').setAttribute('aria-busy','true');
    try{
      const buffer=await file.arrayBuffer();if(costImportSession!==session)return;
      const worker=session.worker=new Worker(new URL('/painel/cost-import-worker.js',location.origin));
      costImportWatch(session);
      worker.onmessage=({data})=>{
        if(costImportSession!==session||dialogKind!=='cost-import')return;
        clearTimeout(session.timer);
        if(data.type==='error'){session.report=null;$('#cost-import-report').innerHTML='';costImportError(data.message);return;}
        if(data.type==='sheets'){
          $('#cost-import-sheet').innerHTML=data.names.map(n=>'<option>'+esc(n)+'</option>').join('');
          $('#cost-import-options').hidden=false;$('#cost-import-sheet').hidden=data.names.length<2;$('label[for="cost-import-sheet"]').hidden=data.names.length<2;requestCostReport();
        }
        if(data.type==='report'){session.report=data.report;renderCostImport(data.report);}
      };
      worker.onerror=()=>{clearTimeout(session.timer);session.report=null;costImportError('Não foi possível ler o arquivo. Confira a planilha e tente novamente.');};
      worker.postMessage({type:'read',buffer,name:file.name},[buffer]);
    }catch{costImportError('Não foi possível abrir a planilha. Tente selecionar novamente.');}
  }
  function requestCostReport(){
    const s=costImportSession;if(!s?.worker)return;
    $('#cost-import-error').textContent='';$('#apply-cost-import').disabled=true;costImportWatch(s);
    s.worker.postMessage({type:'analyze',sheet:$('#cost-import-sheet').value,overwrite:$('#cost-import-overwrite').checked,products:current.products.map(p=>({id:p.id,sku:p.sku,name:p.name,cost:p.unitCost}))});
  }
  function renderCostImport(report){
    $('#cost-import-report').removeAttribute('aria-busy');
    const rows=report.rows.slice(0,100).map(r=>'<tr><td>'+esc(r.sku||'—')+'<small>Linha '+r.row+'</small></td><td>'+money(r.before)+'</td><td>'+money(r.cost)+'</td><td class="'+(r.valid?'positive':'muted')+'">'+esc(r.reason)+'</td></tr>').join('');
    $('#cost-import-report').innerHTML='<div class="cost-import-count"><strong>'+report.valid+' '+(report.valid===1?'custo pronto':'custos prontos')+'</strong><span>'+report.ignored+' '+(report.ignored===1?'linha ignorada':'linhas ignoradas')+'</span></div>'+(report.total?'<div class="cost-import-table"><table><thead><tr><th>SKU</th><th>Custo atual</th><th>Novo custo</th><th>Situação</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Nenhum produto encontrado nesta aba.</p>')+(report.total>100?'<p class="cost-import-limit">Mostrando 100 de '+report.total+' linhas. Todos os custos válidos serão importados.</p>':'');
    $('#apply-cost-import').disabled=!report.valid;
    $('#apply-cost-import').textContent='Importar '+report.valid+' '+(report.valid===1?'custo':'custos');
    $('#cost-import-caption').textContent='Confira os valores antes de importar.';
  }
  async function applyCostImport(){
    const rows=costImportSession?.report?.rows.filter(r=>r.valid);if(!rows?.length)return;
    const button=$('#apply-cost-import');button.disabled=true;
    const previous=new Map(rows.map(r=>[r.id,state.costs[r.id]])),wasMissing=state.missing;
    try{await updates.run('Cadastrando custos…',async()=>{
      const next={...state.costs};rows.forEach(r=>{next[r.id]=r.cost;});
      if(!await persist({costs:next}))throw Error('Falha ao salvar');
      Object.assign(state.costs,next);
      render();returnFocus=$('#import-product-costs');dialog.close();
      toast(rows.length+' '+(rows.length===1?'custo cadastrado.':'custos cadastrados.'),false,async ()=>{
        const restored={...state.costs};previous.forEach((value,id)=>{restored[id]=value;});
        if(!await persist({costs:restored})){toast('Não foi possível desfazer.');return;}
        Object.assign(state.costs,restored);state.missing=wasMissing;render();
      });
      clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},15000);
    },{success:null,error:'Não foi possível cadastrar os custos. Tente novamente.'});}
    catch{costImportError('Não foi possível salvar os custos. Nenhum valor foi alterado.');button.disabled=false;}
  }

  function warehouseControl(p){
    return '<form class="warehouse-inline" data-warehouse="'+p.id+'" aria-label="Estoque do Depósito de '+esc(p.name)+'"><div class="warehouse-field"><input type="text" inputmode="numeric" autocomplete="off" readonly value="'+(p.warehouse)+'" aria-label="Quantidade no Depósito de '+esc(p.name)+'" aria-describedby="warehouse-help-'+p.id+' warehouse-error-'+p.id+'" title="Dois cliques ou Enter para editar o estoque do Depósito"><button type="submit" class="warehouse-save" aria-label="Salvar estoque do Depósito de '+esc(p.name)+'" title="Salvar estoque">'+check+'</button></div><small class="warehouse-help" id="warehouse-help-'+p.id+'">Enter para salvar · Esc para cancelar</small><span class="warehouse-error" id="warehouse-error-'+p.id+'" role="alert"></span></form>';
  }
  function bindWarehouseControls(){
    for(const form of $$('form[data-warehouse]')){
      const id=form.dataset.warehouse,input=form.querySelector('input'),error=form.querySelector('.warehouse-error'),submit=form.querySelector('button');
      let editing=false,saving=false,original=input.value;
      const start=()=>{if(saving)return;editing=true;input.readOnly=false;form.classList.add('editing');input.focus();input.select();$('#announcement').textContent='Editando estoque do Depósito. Enter para salvar; Escape para cancelar.';};
      const cancel=()=>{if(saving)return;editing=false;input.readOnly=true;input.value=original;input.removeAttribute('aria-invalid');error.textContent='';form.classList.remove('editing');input.focus({preventScroll:true});};
      input.ondblclick=()=>{start();input.select();};
      input.onkeydown=e=>{if(e.key==='Escape'&&editing){e.preventDefault();e.stopPropagation();cancel();}else if(!editing&&['Enter','F2'].includes(e.key)){e.preventDefault();start();}};
      input.oninput=()=>{error.textContent='';input.removeAttribute('aria-invalid');};
      form.onsubmit=async e=>{
        e.preventDefault();if(saving)return;if(!editing){start();return;}
        const raw=input.value.trim(),amount=/^\d{1,7}$/.test(raw)?Number(raw):null;
        if(amount==null||amount>1000000){error.textContent='Use um inteiro de 0 a 1.000.000.';input.setAttribute('aria-invalid','true');input.focus();return;}
        if(amount===Number(original)){cancel();return;}
        const previousSettings={...productSettings[id]},next={...productSettings,[id]:{...productSettings[id],warehouseStock:amount}};
        saving=true;submit.disabled=true;input.readOnly=true;
        try{await updates.run('Salvando estoque do Depósito…',async()=>{
          if(!await persist({productSettings:next}))throw Error('Falha ao salvar');
          productSettings[id]=next[id];render();
        },{success:null,error:'Não foi possível salvar o estoque. Tente novamente.'});
        $('form[data-warehouse="'+id+'"] input')?.focus({preventScroll:true});
        toast('Estoque do Depósito salvo.',false,async ()=>{const restored={...productSettings,[id]:previousSettings};if(!await persist({productSettings:restored})){toast('Não foi possível desfazer.');return;}productSettings[id]=previousSettings;render();});
        }catch{input.readOnly=false;input.setAttribute('aria-invalid','true');error.textContent='Não foi possível salvar. Tente novamente.';input.focus();}
        finally{saving=false;submit.disabled=false;}
      };
    }
  }
  function openStockEditor(id){
    const p=productById(id);if(!p)return;
    openDialog('stock','<div class="dialog-product">'+cover(p)+'<div><h2 id="dialog-title">'+esc(p.name)+'</h2><small>'+esc(p.itemId)+'</small></div></div><form id="stock-edit-form" class="stock-edit-form"><label for="warehouse-stock">Estoque no Depósito</label><div class="field"><input id="warehouse-stock" type="text" inputmode="numeric" autocomplete="off" value="'+(p.warehouse)+'" aria-describedby="stock-edit-help stock-edit-error"><span>unidades</span></div><div class="stock-edit-summary"><div><span>No Full</span><strong>'+num(p.full)+' un.</strong></div><div><span>Total disponível</span><strong id="stock-edit-total">'+num(p.stock)+' un.</strong></div></div><small id="stock-edit-help">O saldo do Full é atualizado pelo Mercado Livre.</small><p class="stock-local-note">Saldo gerencial salvo na NOVAI; não altera o estoque no Mercado Livre.</p><p id="stock-edit-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" id="stock-edit-cancel">Cancelar</button><button type="submit" class="button primary">Salvar estoque</button></div></form>');
    const input=$('#warehouse-stock'),form=$('#stock-edit-form');
    const quantity=()=>/^\d{1,7}$/.test(input.value.trim())&&Number(input.value)<=1000000?Number(input.value):null;
    input.oninput=()=>{$('#stock-edit-total').textContent=quantity()==null?'--':num(p.full+quantity())+' un.';$('#stock-edit-error').textContent='';};
    input.ondblclick=()=>input.select();
    $('#stock-edit-cancel').onclick=()=>dialog.close();
    form.onsubmit=async e=>{
      e.preventDefault();const amount=quantity();
      if(amount==null){$('#stock-edit-error').textContent='Informe uma quantidade inteira entre 0 e 1.000.000.';input.focus();return;}
      const previousSettings={...productSettings[id]},next={...productSettings,[id]:{...productSettings[id],warehouseStock:amount}},submit=form.querySelector('[type=submit]');
      submit.disabled=true;
      try{await updates.run('Salvando estoque…',async()=>{
        if(!await persist({productSettings:next}))throw Error('Falha ao salvar');
        productSettings[id]=next[id];render();returnFocus=$('[data-edit-stock="'+id+'"]')||$('#product-search');dialog.close();
      },{success:null,error:'Não foi possível salvar o estoque. Tente novamente.'});
      toast('Estoque salvo.',false,async ()=>{const restored={...productSettings,[id]:previousSettings};if(!await persist({productSettings:restored})){toast('Não foi possível desfazer.');return;}productSettings[id]=previousSettings;render();});
      }catch{$('#stock-edit-error')&&( $('#stock-edit-error').textContent='Não foi possível salvar. Tente novamente.');}
      finally{submit.disabled=false;}
    };
    input.focus();input.select();
  }
  function openCost(id){
    const product=productById(id);
    if(!product)return;
    dialogProduct=id;
    openDialog('product','<div class="dialog-product">'+cover(product)+'<div><h2 id="dialog-title">'+esc(product.name)+
      '</h2><small>SKU '+esc(product.sku)+'</small></div></div>'+costForm(product));
    bindCostForm(product,()=>{
      returnFocus=$('[data-edit-cost="'+id+'"]')||$('#product-search');
      dialog.close();
    });
    $('#unit-cost').focus();
    $('#unit-cost').select();
  }
  function openBulkProducts(){
    const targets=M.products.filter(p=>!selectedProducts.size||selectedProducts.has(p.id));
    const count=targets.length;
    openDialog('product','<h2 id="dialog-title">'+(selectedProducts.size?'Editar produtos selecionados':'Editar todos os produtos')+'</h2><p class="bulk-intro">'+
      count+' '+(count===1?'SKU':'SKUs')+'. Preencha apenas o que deseja alterar.</p>'+
      '<form id="bulk-products-form" class="bulk-products-form">'+
      '<label for="bulk-tax">Imposto (%)</label><div class="field"><input id="bulk-tax" inputmode="decimal" placeholder="Manter o atual" aria-describedby="bulk-tax-help"><span>%</span></div>'+
      '<small id="bulk-tax-help">O mesmo percentual nos '+count+' produtos desta edição.</small>'+
      '<label for="bulk-cost">Custo unitário</label><div class="field"><span>R$</span><input id="bulk-cost" inputmode="decimal" placeholder="Manter o atual" aria-describedby="bulk-cost-help"></div>'+
      '<small id="bulk-cost-help">Preencha se os produtos tiverem o mesmo custo.</small>'+
      '<fieldset class="bulk-stock"><legend>Gestão de estoque</legend>'+
      ['Manter','Ativar','Desativar'].map((name,i)=>'<label><input type="radio" name="bulk-stock" value="'+i+'"'+(i===0?' checked':'')+'><span>'+name+'</span></label>').join('')+
      '</fieldset><p class="form-error" id="bulk-error" role="alert"></p>'+
      '<button class="button primary" type="submit">Aplicar a '+count+' '+(count===1?'produto':'produtos')+'</button></form>');
    $('#bulk-products-form').onsubmit=async e=>{
      e.preventDefault();
      const taxText=$('#bulk-tax').value.trim(),costText=$('#bulk-cost').value.trim();
      const tax=parseNumber(taxText),cost=parseNumber(costText);
      const stock=$('#bulk-products-form input[name="bulk-stock"]:checked').value;
      const error=$('#bulk-error');
      if(taxText&&(tax==null||tax<0||tax>100)){
        error.textContent='Informe um imposto entre 0% e 100%.';$('#bulk-tax').focus();return;
      }
      if(costText&&(cost==null||cost<0||cost>1000000)){
        error.textContent='Informe um custo válido.';$('#bulk-cost').focus();return;
      }
      if(!taxText&&!costText&&stock==='0'){error.textContent='Preencha uma informação para aplicar.';return;}
      const nextCosts={...state.costs},nextSettings={...productSettings};
      for(const {id} of targets){
        if(costText)nextCosts[id]=M.round(cost);
        nextSettings[id]={...productSettings[id]};
        if(taxText)nextSettings[id].taxRate=M.round(tax);
        if(stock!=='0')nextSettings[id].manageStock=stock==='1';
      }
      const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;
      try{await updates.run('Atualizando '+count+' '+(count===1?'produto…':'produtos…'),async()=>{
      if(!await persist({costs:nextCosts,productSettings:nextSettings})){
        throw Error('Não foi possível salvar na sua conta.');
      }
      Object.assign(state.costs,nextCosts);Object.assign(productSettings,nextSettings);

      render();returnFocus=$('#bulk-products');dialog.close();

      },{success:'Cadastros atualizados em '+count+' '+(count===1?'produto.':'produtos.'),error:'Não foi possível atualizar os cadastros. Tente novamente.'});}
      catch{error.textContent='Não foi possível salvar na sua conta.';}
      finally{submit.disabled=false;}

    };
    $('#bulk-tax').focus();
  }
  function openProduct(id){
    if(!productById(id))return;
    dialogProduct=id;
    openPerformance(id,state.start,state.end,'net');
  }
  let performanceView=null;
  function openPerformance(id,start,end,metricKey,focusSelector=null){
    const scroll=dialogKind==='performance'&&dialog.open?dialog.scrollTop:0;
    performanceView={id,start,end,metricKey};
    void M.loadVisits(id,start,end);
    const result=M.aggregate(start,end,state.costs,state.missing,productSettings,id);
    const count=M.daysBetween(start,end),beforeEnd=M.shift(start,-1),beforeStart=M.shift(beforeEnd,1-count);
    const baseline=M.aggregate(beforeStart,beforeEnd,state.costs,state.missing,productSettings,id);
    const p=result.products.find(p=>p.id===id),old=baseline.products.find(p=>p.id===id),compare=beforeStart>=M.minDay;
    const kpi=(label,amount,trend,tone='')=>'<div><span>'+label+'</span><strong class="'+tone+'">'+amount+'</strong>'+trend+'</div>';
    const trend=(value,previous)=>compare?delta(value,previous):'<small>Sem comparação</small>';
    const salesTone=(value,previous)=>compare&&value!==previous?(value>previous?'positive':'negative'):'';
    openDialog('performance','<div class="dialog-product">'+cover(p)+'<div><h2 id="dialog-title">'+esc(p.name)+'</h2><small>'+esc(p.itemId)+' · '+esc(p.sku)+' · '+money(p.price)+'</small><a href="'+esc(p.permalink)+'" target="_blank" rel="noopener noreferrer">Ver anúncio no Mercado Livre '+arrow+'</a></div></div>'+
      '<div class="performance-period"><div><strong>'+range(start,end)+'</strong><small>'+(compare?'Comparação com '+range(beforeStart,beforeEnd):'Sem período anterior disponível')+'</small></div><div class="segments" role="group" aria-label="Período do anúncio">'+[7,15,30,60].map(n=>'<button data-performance-days="'+n+'" aria-pressed="'+(n===count)+'">'+n+' dias</button>').join('')+'</div></div>'+
      (p.unitCost==null?'<div class="inline-note"><span>Custo pendente. Cadastre para conferir a margem.</span><button class="action-button" data-edit-cost="'+p.id+'">Cadastrar custo</button></div>':'')+
      '<div class="performance-kpis">'+kpi('Vendas concluídas',money(p.net),trend(p.net,old.net),salesTone(p.net,old.net))+kpi('Unidades vendidas',num(p.units),trend(p.units,old.units),salesTone(p.units,old.units))+kpi('Resultado das vendas',money(p.result),trend(p.result,old.result),p.result==null||p.result===0?'':p.result<0?'negative':'positive')+kpi('Margem de contribuição',pct(M.margin(p)),'<small>Após custos e publicidade</small>',p.result==null||p.result===0?'':p.result<0?'negative':'positive')+'</div>'+
      (desktopLayout.matches?'<div class="performance-traffic" aria-label="Conversão deste anúncio"><div><span>Visitas</span><strong>'+num(p.visits)+'</strong></div><div><span>Pedidos pagos</span><strong>'+num(p.orders)+'</strong></div><div><span>Conversão do anúncio</span><strong>'+pct(p.visits>0?p.orders/p.visits*100:null)+'</strong></div></div>':'')+
      '<section class="performance-chart"><div class="performance-chart-heading"><h3>Evolução no período</h3><div class="segments" role="group" aria-label="Métrica do anúncio">'+[['net','Vendas'],['units','Unidades'],['result','Resultado']].map(([key,name])=>'<button data-performance-metric="'+key+'" aria-pressed="'+(key===metricKey)+'">'+name+'</button>').join('')+'</div></div><div id="performance-plot" tabindex="0" role="group" aria-label="Gráfico do anúncio. Use as setas para consultar cada data."></div><p id="performance-point" class="performance-point" aria-live="polite"></p><div class="performance-legend"><span><i></i>Período selecionado</span>'+(compare?'<span><i class="previous"></i>Período anterior</span>':'')+'</div></section>'+
      '<details><summary>Ver composição do resultado '+arrow+'</summary>'+composition(p)+'</details><div class="dialog-actions"><button class="button primary" data-pricing="'+p.id+'"><span class="precify-mark" aria-hidden="true"><img src="/painel/assets/precify.png" alt=""></span>Calcular margem</button></div>');
    const map=new Map(result.days.map(d=>[d.day,d])),prevMap=new Map(baseline.days.map(d=>[d.day,d]));
    const points=Array.from({length:count},(_,i)=>{const day=M.shift(start,i),prevDay=M.shift(beforeStart,i);return {day,prevDay,value:map.has(day)?map.get(day)[metricKey]:null,previous:prevMap.has(prevDay)?prevMap.get(prevDay)[metricKey]:null};});
    const values=points.flatMap(p=>compare?[p.value,p.previous]:[p.value]).filter(Number.isFinite);
    const width=Math.max(280,$('#performance-plot').clientWidth),left=50,right=width-10;
    const low=Math.min(0,...values),high=Math.max(1,...values),x=i=>left+i/(Math.max(1,count-1))*(right-left),y=v=>22+(high-v)/(high-low)*164;
    const path=key=>{let pen=false;return points.map((p,i)=>{if(p[key]==null){pen=false;return '';}const d=(pen?'L':'M')+x(i).toFixed(2)+' '+y(p[key]).toFixed(2);pen=true;return d;}).join(' ');};
    const format=v=>metricKey==='units'?num(v):money(v);
    const label=v=>metricKey==='units'?num(v):new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v);
    const line=path('value'),area=points.every(p=>p.value!=null)?line+' L'+right+' '+y(0)+' L50 '+y(0)+' Z':'';
    $('#performance-plot').innerHTML='<svg viewBox="0 0 '+width+' 225" role="img" aria-label="'+(metricKey==='units'?'Unidades vendidas':metricKey==='net'?'Vendas concluídas':'Resultado das vendas')+' por data"><defs><linearGradient id="performance-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--yellow)" stop-opacity=".18"/><stop offset="1" stop-color="var(--yellow)" stop-opacity="0"/></linearGradient></defs>'+[0,.5,1].map(r=>{const v=low+(high-low)*r;return '<line x1="50" x2="'+right+'" y1="'+y(v)+'" y2="'+y(v)+'" class="performance-grid"/><text x="40" y="'+(y(v)+4)+'" text-anchor="end">'+label(v)+'</text>';}).join('')+'<path d="'+area+'" fill="url(#performance-fill)"/>'+(compare?'<path d="'+path('previous')+'" class="performance-previous"/>':'')+'<path d="'+line+'" class="performance-line"/><line id="performance-focus" x1="50" x2="50" y1="20" y2="189" class="performance-crosshair" visibility="hidden"/><text x="50" y="213">'+date(start)+'</text><text x="'+right+'" y="213" text-anchor="end">'+date(end)+'</text></svg>';
    let index=count-1;
    const show=i=>{index=Math.max(0,Math.min(count-1,i));const point=points[index],focus=$('#performance-focus');focus.setAttribute('x1',x(index));focus.setAttribute('x2',x(index));focus.setAttribute('visibility','visible');$('#performance-point').textContent=date(point.day)+': '+format(point.value)+(compare?' · '+date(point.prevDay)+': '+format(point.previous):'');};
    const plot=$('#performance-plot');
    plot.onpointermove=plot.onpointerdown=e=>{const rect=plot.getBoundingClientRect();show(Math.round(((e.clientX-rect.left)/rect.width*width-left)/(right-left)*(count-1)));};
    plot.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();show(e.key==='Home'?0:e.key==='End'?count-1:index+(e.key==='ArrowRight'?1:-1));};
    show(index);
    for(const b of $$('[data-performance-days]'))b.onclick=()=>{const n=Number(b.dataset.performanceDays);openPerformance(id,M.shift(end,1-n),end,metricKey,'[data-performance-days="'+n+'"]');revealPanel($('#performance-plot'));};
    for(const b of $$('[data-performance-metric]'))b.onclick=()=>{openPerformance(id,start,end,b.dataset.performanceMetric,'[data-performance-metric="'+b.dataset.performanceMetric+'"]');revealPanel($('#performance-plot'));};
    dialog.scrollTop=scroll;
    if(focusSelector)$(focusSelector)?.focus({preventScroll:true});
  }
  function openFinance(){
    const scoped=state.route==='financeiro'&&state.tab==='resumo'&&desktopLayout.matches;
    const scope=scoped?financeScope():null,total=scope?scope.total:current;
    openDialog('finance','<h2 id="dialog-title">Como chegamos ao resultado</h2><p class="subtext">'+range(state.start,state.end)+(scope?.filtered?' · '+total.products.length+' produtos na seleção':'')+'</p>'+composition(total)+'<div class="detail-explanation"><p>Receita após estornos, menos produto, tarifas, impostos, frete do vendedor e publicidade.</p><p>'+(total.incomplete?'Há custo pendente. Valores ausentes não entram como zero.':'Este é o resultado das vendas, antes das despesas fixas e dos ajustes contábeis.')+'</p><p>Dados da conta conectada e custos informados por você.</p></div>'+(scoped?'':action('Ver financeiro completo','data-go="financeiro/resumo"',true)));
  }
  function openAdsInfo(){
    openDialog('ads','<h2 id="dialog-title">Resultado atribuído aos Ads</h2><p class="subtext">'+range(state.start,state.end)+'</p><div class="detail-stats"><div><span>Receita atribuída</span><strong>'+money(current.adRevenue)+'</strong></div><div><span>Resultado após Ads</span><strong class="'+(current.adResult<0?'negative':'')+'">'+money(current.adResult)+'</strong></div></div><dl class="detail-list"><div><dt>Investido</dt><dd>'+money(current.ads)+'</dd></div><div><dt>ROAS · receita / investimento</dt><dd>'+(ratio(current.adRevenue,current.ads)?.toFixed(2).replace('.',',')||'--')+'×</dd></div><div><dt>ACOS · investimento / receita Ads</dt><dd>'+pct(acos(current))+'</dd></div><div><dt>TACoS · investimento / receita da loja</dt><dd>'+pct(ratioPercent(current.ads,current.net))+'</dd></div><div><dt>Cliques</dt><dd>'+num(current.clicks)+'</dd></div><div><dt>Conversão dos cliques</dt><dd>'+pct(ratioPercent(current.adUnits,current.clicks))+'</dd></div></dl><div class="detail-explanation"><p>Neste cálculo, os custos variáveis são distribuídos proporcionalmente à receita atribuída. Depois descontamos o investimento em publicidade.</p><p>Receita atribuída não comprova vendas adicionais causadas pelos Ads. O cálculo não inclui despesas fixas.</p></div>');
  }
  function openAlerts(){openDialog('alerts','<h2 id="dialog-title">Para revisar</h2><p class="subtext">'+alerts.length+' pendências no período.</p><div class="alert-list">'+alerts.map((a,i)=>task(a,i,true)).join('')+'</div>');}
  function openCampaign(category){
    const campaign=M.campaigns(current).find(item=>item.id===category);
    const list=campaign?.products||[];
    if(!campaign)return;
    openDialog('campaign','<h2 id="dialog-title">'+esc(campaign.name)+'</h2><p class="subtext">Campanha do Mercado Livre · '+range(state.start,state.end)+'</p><div class="detail-stats"><div><span>Investido</span><strong>'+money(campaign.ads)+'</strong></div><div><span>Receita atribuída</span><strong>'+money(campaign.adRevenue)+'</strong></div></div><dl class="detail-list"><div><dt>ROAS</dt><dd>'+multiple(roas(campaign))+'</dd></div><div><dt>ACOS</dt><dd>'+pct(acos(campaign))+'</dd></div></dl><div class="alert-list">'+list.map(p=>'<button class="task-card" data-product="'+p.id+'">'+cover(p)+'<span class="task-copy"><small>Resultado atribuído</small><strong>'+esc(p.name)+'</strong><span class="'+(p.adResult<0?'negative':'')+'">'+money(p.adResult)+'</span></span>'+arrow+'</button>').join('')+'</div>');
  }
  function openExpense(id=null){
    if(desktopLayout.matches){if(state.route==='financeiro'&&state.tab==='despesas'){startInlineExpense(id);return;}openExpenseDesktop(id);return;}
    openDialog('expense','<h2 id="dialog-title">Adicionar despesa</h2><p class="subtext">Custos da operação que não estão nas vendas.</p><form id="expense-form" class="expense-form"><label>Descrição<input class="plain-input" id="expense-name" maxlength="100" required placeholder="Ex.: aluguel do espaço"></label><div class="form-grid"><label>Valor<div class="field"><span>R$</span><input id="expense-value" inputmode="decimal" required placeholder="0,00"></div></label><label>Data<input id="expense-date" type="date" min="'+M.minDay+'" max="'+M.maxDay+'" value="'+state.end+'" required></label></div><label>Categoria<select id="expense-category"><option>Estrutura</option><option>Serviços</option><option>Pessoal</option><option>Outros</option></select></label><label class="checkbox"><input type="checkbox" id="expense-recurring">Repetir mensalmente nesta data</label><p id="expense-error" class="form-error" role="alert"></p><button class="button primary full-width" type="submit">Salvar despesa</button><p class="detail-explanation">Cadastro de exemplo, salvo apenas neste navegador.</p></form>');
    $('#expense-form').onsubmit=async e=>{e.preventDefault();const name=$('#expense-name').value.trim(),amount=parseNumber($('#expense-value').value),day=$('#expense-date').value;if(!name||!amount||amount>1000000||day<M.minDay||day>M.maxDay){$('#expense-error').textContent='Confira descrição, valor e data.';return;}const next=[...expenses,{id:crypto.randomUUID(),source:'manual',name,amount:M.round(amount),date:day,category:$('#expense-category').value,recurring:$('#expense-recurring').checked}];if(!await persist({expenses:next}))return;expenses=next;dialog.close();render();toast('Despesa cadastrada.');};
  }
  function openExpenseDesktop(id=null){
    const editing=expenses.find(e=>e.id===id),e=editing||{};
    openDialog('expense','<h2 id="dialog-title">'+(editing?'Editar despesa':'Adicionar despesa')+'</h2><p class="subtext">Ex.: parcela de uma impressora de etiquetas.</p><form id="expense-form" class="expense-form"><label>Descrição<input class="plain-input" id="expense-name" maxlength="100" required placeholder="Ex.: impressora de etiquetas" value="'+esc(e.name||'')+'"></label><div class="form-grid"><label>Valor de cada pagamento<div class="field"><span>R$</span><input id="expense-value" inputmode="decimal" required placeholder="0,00" value="'+(e.amount==null?'':String(e.amount).replace('.',','))+'"></div></label><label>Primeiro vencimento<input id="expense-date" type="date" min="'+M.minDay+'" max="2099-12-31" value="'+(e.date||state.end)+'" required></label></div><label>Frequência<select id="expense-frequency"><option value="once">Uma vez</option><option value="monthly">Mensal</option><option value="installments">Parcelada</option></select></label><label id="expense-installments-field" hidden>Quantidade de parcelas<input class="plain-input" id="expense-installments" type="number" min="2" max="120" step="1" value="'+(e.installments||12)+'"></label><label>Categoria<select id="expense-category"><option>Equipamentos</option><option>Estrutura</option><option>Serviços</option><option>Pessoal</option><option>Outros</option></select></label><p class="form-error" id="expense-error" role="alert"></p><button class="button primary full-width" type="submit">Salvar despesa</button><p class="detail-explanation">'+(editing?'Alterações recalculam os meses deste cadastro. ':'')+'Cada pagamento entra no mês do vencimento. Cadastro salvo neste navegador.</p></form>');
    const frequency=$('#expense-frequency');frequency.value=e.installments?'installments':e.recurring?'monthly':'once';
    $('#expense-category').value=e.category||'Equipamentos';
    const change=()=>{$('#expense-installments-field').hidden=frequency.value!=='installments';};change();frequency.onchange=change;
    $('#expense-form').onsubmit=async event=>{
      event.preventDefault();const name=$('#expense-name').value.trim(),amount=parseNumber($('#expense-value').value),day=$('#expense-date').value,kind=frequency.value,installments=Number($('#expense-installments').value),error=$('#expense-error');
      if(!name||amount==null||amount<=0||amount>1000000||!validDay(day)||day<M.minDay||day>'2099-12-31'||kind==='installments'&&(!Number.isInteger(installments)||installments<2||installments>120)){error.textContent='Confira descrição, valor, vencimento e parcelas.';return;}
      const item={id:editing?editing.id:crypto.randomUUID(),source:'manual',name,amount:M.round(amount),date:day,category:$('#expense-category').value,recurring:kind!=='once',...(kind==='installments'?{installments}:{})};
      const next=editing?expenses.map(old=>old.id===editing.id?item:old):[...expenses,item],submit=event.currentTarget.querySelector('[type=submit]');submit.disabled=true;
      try{await updates.run('Salvando despesa…',async()=>{if(!await persist({expenses:next}))throw Error('storage');expenses=next;render();dialog.close();},{success:'Despesa salva.',error:'Não foi possível salvar a despesa. Tente novamente.'});}
      catch{error.textContent='Não foi possível salvar na sua conta.';}
      finally{submit.disabled=false;}
    };
  }
  function parseNumber(s){s=String(s??'').trim().replace(/R\$|\s/g,'');if(!s)return null;if(s.includes(','))s=s.replaceAll('.','').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null;}
  const field=(id,label,number,unit='R$',required=false)=>'<label>'+label+'<span class="field '+(id==='pc-cost'?'cost-field':'')+'">'+(unit==='R$'?'<span>R$</span>':'')+'<input id="'+id+'" inputmode="decimal" autocomplete="off" value="'+(number==null?'':String(number).replace('.',','))+'" '+(required?'required':'')+' aria-label="'+label+'">'+(unit!=='R$'?'<span>'+unit+'</span>':'')+'</span></label>';
  function openListingPricer(id){
    const p=productById(id);if(!p)return;
    const originalPrice=listingPrice(p),actualType=p.listingType==='premium'?'premium':'classic';
    const planNames={classic:'Clássico',premium:'Premium'},fees={classic:null,premium:null};
    const draft={price:originalPrice,cost:p.unitCost,shipping:p.unitShipping,tax:p.taxRate??null,commission:fees[actualType],fixed:0,pack:0,other:0,type:actualType};
    const number=n=>n==null?'':n.toFixed(2).replace('.',',');
    openDialog('listing-pricing','<div class="compact-pricing-product">'+cover(p)+'<div><h2 id="dialog-title">'+esc(p.name)+'</h2><small>'+esc(p.itemId)+' · anúncio '+planNames[actualType]+'</small></div></div><div class="compact-price-types" role="group" aria-label="Simular tipo de anúncio">'+['classic','premium'].map(type=>'<button type="button" data-listing-plan="'+type+'" aria-pressed="'+(type===actualType)+'">'+planNames[type]+'</button>').join('')+'</div><form id="listing-pricing-form" novalidate><label class="compact-sale-label" for="listing-sale-price">Preço de venda</label><div class="compact-sale-editor"><span>R$</span><input id="listing-sale-price" inputmode="decimal" autocomplete="off" value="'+number(draft.price)+'"></div><div class="compact-cost-fields"><label>Custo do produto<div class="field compact-required"><span>R$</span><input id="listing-unit-cost" inputmode="decimal" value="'+number(draft.cost)+'" placeholder="Informe o custo" required></div></label><label>Frete do vendedor<div class="field"><span>R$</span><input id="listing-shipping" inputmode="decimal" value="'+number(draft.shipping)+'"></div></label><label>Imposto<div class="field"><input id="listing-tax" inputmode="decimal" value="'+number(draft.tax)+'"><span>%</span></div></label><label>Tarifa de venda<div class="field"><input id="listing-commission" inputmode="decimal" value="'+number(draft.commission)+'"><span>%</span></div></label></div><details class="compact-extra-costs"><summary>Outros custos '+arrow+'</summary><div class="compact-cost-fields"><label>Tarifa fixa<div class="field"><span>R$</span><input id="listing-fixed" inputmode="decimal" value="0,00"></div></label><label>Embalagem e outros<div class="field"><span>R$</span><input id="listing-other" inputmode="decimal" value="0,00"></div></label></div></details><div class="compact-quote-result" aria-live="polite"><div><span>Resultado por venda</span><strong id="listing-profit">--</strong></div><div><span>Margem de contribuição</span><strong id="listing-margin">--</strong></div><small id="listing-quote-context"></small></div><p id="listing-price-error" class="form-error" role="alert"></p><div class="compact-apply"><p id="listing-price-change"></p><button class="button primary" id="apply-listing-price" type="submit">Aplicar preço ao anúncio</button><small>Ao confirmar, o novo preço será publicado no Mercado Livre. O tipo de anúncio permanece igual.</small></div></form>');
    const fields={price:'listing-sale-price',cost:'listing-unit-cost',shipping:'listing-shipping',tax:'listing-tax',commission:'listing-commission',fixed:'listing-fixed',other:'listing-other'};
    let submitting=false,confirmedPrice=null;
    const update=()=>{
      for(const [key,field]of Object.entries(fields)){const n=parseNumber($('#'+field).value);draft[key]=['fixed','other'].includes(key)?n??0:n;}
      const q=validNumber(draft.price)?M.quote(draft):null,submit=$('#apply-listing-price');submit.disabled=!q||submitting;
      $('#listing-profit').textContent=q?money(q.profit):'--';$('#listing-margin').textContent=q?pct(q.margin):'--';
      for(const selector of ['#listing-profit','#listing-margin'])$(selector).className=!q?'':q.profit<0?'negative':'positive';
      $('#listing-quote-context').textContent='Simulação '+planNames[draft.type]+' · antes dos Ads e custos fixos.';
      const actual=M.quote({...draft,commission:fees[actualType]});
      $('#listing-price-change').textContent=q?'De '+money(originalPrice)+' para '+money(draft.price)+(draft.type!==actualType?' · mantém '+planNames[actualType]+(actual?' ('+pct(actual.margin)+' de margem estimada)':''):''):'';
      $('#listing-price-error').textContent=q?'':draft.cost==null?'Informe o custo do produto para calcular.':'Confira preço, frete, custo e percentuais.';
      requestAnimationFrame(fitNumbers);
      return q;
    };
    for(const field of Object.values(fields))$('#'+field).oninput=()=>{confirmedPrice=null;$('#apply-listing-price').textContent='Aplicar preço ao anúncio';update();};
    $('#listing-sale-price').ondblclick=()=>$('#listing-sale-price').select();
    for(const button of $$('[data-listing-plan]'))button.onclick=()=>{fees[draft.type]=parseNumber($('#listing-commission').value)??fees[draft.type];draft.type=button.dataset.listingPlan;$('#listing-commission').value=number(fees[draft.type]);$$('[data-listing-plan]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));update();};
    $('#listing-pricing-form').onsubmit=async event=>{
      event.preventDefault();if(submitting)return;const q=update();if(!q)return;
      const submit=$('#apply-listing-price');
      if(confirmedPrice!==M.round(draft.price)){confirmedPrice=M.round(draft.price);submit.textContent='Confirmar novo preço';$('#listing-price-error').textContent='Confirme a publicação de '+money(draft.price)+' no Mercado Livre. Esta alteração muda o preço do anúncio.';return;}
      submitting=true;submit.disabled=true;
      try{await updates.run('Atualizando preço no Mercado Livre…',async()=>{
        await api('/listing-price',{itemId:id,price:M.round(draft.price),expectedPrice:originalPrice,confirm:true});
        await M.refresh();applyStored();render();returnFocus=$('[data-listing-price="'+id+'"]');dialog.close();
      },{success:'Preço atualizado no Mercado Livre.',error:'Não foi possível confirmar a alteração. Confira o anúncio antes de tentar novamente.'});}
      catch(error){if($('#listing-price-error'))$('#listing-price-error').textContent=error.code==='listing_price_changed'?'O preço mudou no Mercado Livre. Atualize a página antes de tentar novamente.':'Não foi possível confirmar a alteração. Confira o anúncio antes de tentar novamente.';}
      finally{submitting=false;if(submit.isConnected)update();}
    };
    update();
    if(draft.cost==null)$('#listing-unit-cost').focus({preventScroll:true});
  }
  function openPricing(id,existing=null){
    const p=precifyProductById(id);if(!p)return;dialogProduct=id;
    pricing=existing||{price:p.price,cost:p.unitCost,commission:null,fixed:0,shipping:p.unitShipping,tax:p.taxRate??null,pack:0,other:0,type:'classic',reputation:p.reputation,shippingMode:p.full>0?'Full':'Mercado Envios',weight:null,height:null,width:null,length:null,category:p.category};pricingResult=false;pricingForm();
  }
  function pricingForm(){
    const p=precifyProductById(dialogProduct),f=pricing;
    openDialog('pricing','<h2 id="dialog-title" class="sr-only">Precify</h2><p class="pricing-product">'+esc(p.name)+'</p><form id="pricing-form" class="pricing-form" novalidate><div class="form-grid">'+field('pc-price','Preço de venda',f.price,'R$',true)+field('pc-cost','Custo do produto',f.cost,'R$',true)+'</div><details id="pc-ad-section"><summary><span><strong>Anúncio</strong><small>'+(f.type==='premium'?'Premium':'Clássico')+' · '+f.shippingMode+' · imposto '+f.tax+'%</small></span>'+arrow+'</summary><div class="form-grid"><label>Tipo de anúncio<select id="pc-type"><option value="classic" '+(f.type==='classic'?'selected':'')+'>Clássico</option><option value="premium" '+(f.type==='premium'?'selected':'')+'>Premium</option></select></label><label>Reputação<select id="pc-reputation"><option value="green">Verde</option><option value="yellow">Amarela</option><option value="red">Vermelha</option></select></label><label>Envio<select id="pc-shipping-mode"><option>Full</option><option>Mercado Envios</option><option>Flex</option></select></label>'+field('pc-tax','Imposto',f.tax,'%')+'</div><div class="form-grid">'+field('pc-fee','Comissão',f.commission,'%')+field('pc-fixed','Tarifa fixa',f.fixed)+field('pc-shipping','Frete do vendedor',f.shipping)+field('pc-other','Outros custos por unidade',f.other)+'</div><p class="detail-explanation">Informe as taxas e o frete aplicáveis ao anúncio.</p></details><details id="pc-package"><summary><span><strong>Embalagem</strong><small>Selecione um tamanho ou preencha as medidas.</small></span>'+arrow+'</summary><div class="package-presets" role="group" aria-label="Preenchimento rápido de embalagem">'+['Pequena','Média','Grande'].map((name,i)=>'<button type="button" data-package="'+i+'" aria-pressed="false">'+icon('package')+name+'</button>').join('')+'</div><div class="form-grid">'+field('pc-weight','Peso',f.weight,'g',true)+field('pc-height','Altura',f.height,'cm',true)+field('pc-width','Largura',f.width,'cm',true)+field('pc-length','Comprimento',f.length,'cm',true)+field('pc-pack','Custo da embalagem',f.pack)+'</div></details><details><summary><span><strong>Categoria</strong><small>'+esc(f.category)+'</small></span>'+arrow+'</summary><p class="detail-explanation">'+esc(f.category)+' · categoria do anúncio.</p></details><p class="form-error" id="pricing-error" role="alert"></p><div class="sticky-calculate"><button class="button primary" type="submit">Calcular margem</button></div></form>',p.permalink?()=>openProduct(p.id):null);
    $('#pc-reputation').value=f.reputation;$('#pc-shipping-mode').value=f.shippingMode;
    $('#pricing-form').onsubmit=e=>{e.preventDefault();const next={...pricing};for(const [key,id] of Object.entries({price:'pc-price',cost:'pc-cost',commission:'pc-fee',fixed:'pc-fixed',shipping:'pc-shipping',tax:'pc-tax',other:'pc-other',pack:'pc-pack',weight:'pc-weight',height:'pc-height',width:'pc-width',length:'pc-length'}))next[key]=parseNumber($('#'+id).value);next.type=$('#pc-type').value;next.reputation=$('#pc-reputation').value;next.shippingMode=$('#pc-shipping-mode').value;
      const missing=['weight','height','width','length'].find(k=>!next[k]||next[k]<=0);
      if(!M.quote(next)){ $('#pricing-error').textContent='Confira preço, custo e taxas. O custo do produto é obrigatório.';if(next.cost==null)$('#pc-cost').focus();return;}
      if(missing){$('#pc-package').open=true;$('#pricing-error').textContent='Preencha as medidas ou escolha uma embalagem.';return;}
      pricing=next;pricingResult=true;renderPricingResult();};
    $('#pc-type').onchange=()=>{$('#pc-fee').value='';};
  }
  function renderPricingResult(){
    const p=precifyProductById(dialogProduct),f=pricing;
    openDialog('pricing','<section class="pricing-result"><h2 id="dialog-title" class="sr-only">Precify</h2><p class="pricing-product">'+esc(p.name)+'</p><div class="pricing-type" role="group" aria-label="Comparar tipos de anúncio"><button data-price-type="classic" aria-pressed="'+(f.type==='classic')+'">Clássico</button><button data-price-type="premium" aria-pressed="'+(f.type==='premium')+'">Premium</button></div><div class="sale-title"><span>Preço de venda</span><small>Edite ou ajuste na barra</small></div><label class="sale-editor"><span>R$</span><span class="sr-only">Preço de venda da simulação</span><input id="sale-editor" inputmode="decimal" autocomplete="off" value="'+f.price.toFixed(2).replace('.',',')+'" aria-label="Preço de venda da simulação"></label><input class="price-range" type="range" id="price-range" aria-label="Ajustar preço de venda" min="1" max="'+Math.max(10,p.base*5,f.price*5).toFixed(2)+'" step="0.01" value="'+f.price+'"><div class="detail-stats"><div><span>Margem</span><strong id="pc-margin"></strong></div><div><span>Resultado por venda</span><strong id="pc-profit"></strong></div></div><details class="costs-toggle"><summary>Ver composição dos custos '+arrow+'</summary><dl class="detail-list" id="pc-breakdown"></dl></details><p class="detail-explanation">Simulação antes dos custos fixos e da publicidade. Frete e taxas editáveis.</p><button class="save-button" id="save-quote" aria-pressed="false"><span>'+savedFlag+'<span id="save-quote-label">Adicionar aos salvos</span></span></button></section>',()=>pricingForm());
    updatePricingOutput();
    $('#sale-editor').oninput=()=>{const n=parseNumber($('#sale-editor').value);if(n!=null&&n>0&&n<=1000000){pricing.price=n;$('#price-range').value=n;updatePricingOutput();}else{$('#pc-margin').textContent='--';$('#pc-profit').textContent='--';$('#save-quote').disabled=true;}};
    $('#sale-editor').onblur=()=>{const n=parseNumber($('#sale-editor').value);if(n!=null&&n>0)$('#sale-editor').value=n.toFixed(2).replace('.',',');};
    $('#price-range').oninput=()=>{pricing.price=Number($('#price-range').value);$('#sale-editor').value=pricing.price.toFixed(2).replace('.',',');updatePricingOutput();};
    $('#save-quote').onclick=async()=>{
      const q=M.quote(pricing);if(!q)return;const button=$('#save-quote');button.disabled=true;
      try{const wasSaved=window.NovaiSavedPanel.items.some(x=>x.itemId===p.id);
        if(wasSaved)await api('/saved',{action:'remove',key:p.id});
        else await api('/saved',{action:'upsert',item:{itemId:p.id,url:p.permalink,name:p.name,image:p.image,price:q.price,type:pricing.type,cost:q.cost,other:q.pack+q.other,profit:q.profit,margin:q.margin,shipping:q.shipping,fees:q.fee,tax:q.taxValue}});
        await window.NovaiSavedPanel.load();updateSavedButton();toast(wasSaved?'Removido dos salvos.':'Adicionado aos salvos.',!wasSaved);
      }catch{toast('Não foi possível salvar. Tente novamente.');}finally{button.disabled=false;}
    };
  }

  function updateSavedButton(){
    const button=$('#save-quote'),isSaved=window.NovaiSavedPanel.items.some(s=>s.itemId===dialogProduct);
    button.classList.toggle('saved',isSaved);
    button.setAttribute('aria-pressed',String(isSaved));
    $('#save-quote-label').textContent=isSaved?'Adicionado aos salvos':'Adicionar aos salvos';
  }
  function updatePricingOutput(){
    const q=M.quote(pricing);if(!q)return;const tone=q.profit<0?'negative':'positive';$('#pc-margin').textContent=pct(q.margin);$('#pc-profit').textContent=money(q.profit);$('#pc-margin').className=tone;$('#pc-profit').className=tone;$('#save-quote').disabled=false;updateSavedButton();
    $('#pc-breakdown').innerHTML=[['Custos totais',q.total],['Tarifa ML ('+pct(q.commission)+')'+(q.fixed?' + fixa':' '),q.fee],['Frete do vendedor',q.shipping],['Imposto ('+pct(q.tax)+')',q.taxValue],['Produto e embalagem',q.cost+q.pack],['Outros custos',q.other]].map(([label,n])=>'<div><dt>'+label+'</dt><dd>'+money(n)+'</dd></div>').join('');requestAnimationFrame(fitNumbers);
  }
  function toast(text,savedLink=false,undo=null){
    clearTimeout(toastTimer);const undoVersion=M.account.version;undoAction=undo?async()=>{if(M.account.version!==undoVersion){toast('Os dados mudaram após esta ação. Não foi possível desfazer.');return;}await undo();}:null;const node=$('#toast');if(dialog.open)dialog.append(node);else document.body.append(node);node.hidden=false;node.innerHTML='<strong>'+(savedLink?savedFlag:check)+esc(text)+'</strong>'+(savedLink?'<a href="#oportunidades/salvos" data-toast-link>Lista de salvos '+arrow+'</a>':'')+(undo?'<button class="undo-button" id="undo-button">Desfazer</button>':'');toastTimer=setTimeout(()=>{$('#toast').hidden=true;},savedLink?8000:5000);
  }
  function exportRows(type){
    let rows;
    if(type==='resumo')rows=[['Início','Fim','Resultado das vendas','Margem (%)','Faturamento','Pedidos pagos','Gasto em publicidade'],[state.start,state.end,current.result,M.margin(current),current.gross,current.orders,current.ads]];
    else if(type==='dre'){const d=M.dreReport(state.expenseYear,expenses,state.costs,state.missing,productSettings);rows=[['Ano','Mês','Conta','Valor','Situação'],...d.months.flatMap(m=>dreRows(m.report).flatMap(r=>[[d.year,m.month+1,r.label+(r.percentage?' (%)':''),m.report==null?null:r.amount,m.available?(m.partial?'Parcial':'Carregado'):'Sem vendas carregadas'],...(r.children||[]).map(([label,n])=>[d.year,m.month+1,label,m.report==null?null:n,m.available?(m.partial?'Parcial':'Carregado'):'Sem vendas carregadas'])]))];}
    else if(type==='despesas'&&desktopLayout.matches&&state.expenseView==='annual'){const data=annualExpenses();rows=[['Ano','Mês','Receita de produtos após estornos','Custos das vendas (inclui Ads)','Despesas cadastradas','Resultado após despesas','Despesas previstas','Situação'],...data.months.map(m=>[data.year,m.month+1,m.net,m.costs,m.expenses,m.result,m.planned,!m.available?'Sem vendas carregadas':m.partial?'Parcial':'Carregado'])];}
    else if(type==='despesas')rows=[['Descrição','Data','Recorrência','Valor'],...expenseRows.map(e=>[e.name,e.occurrence,e.recurring?'Mensal':'Uma vez',e.amount])];
    else if(type==='anuncios'){
      const query=state.search.trim().toLocaleLowerCase('pt-BR');
      const list=current.products.filter(p=>(p.name+' '+p.sku+' '+p.itemId).toLocaleLowerCase('pt-BR').includes(query)).filter(p=>state.productFilter==='full'?p.full>0:state.productFilter==='catalog'?p.catalog:true);
      rows=[['MLB','Produto','SKU','Preço','Margem no período (%)','Full','Catálogo'],...list.map(p=>[p.itemId,p.name,p.sku,listingPrice(p),M.margin(p),p.full>0?'Sim':'Não',p.catalog?'Sim':'Não'])];
    }
    else if(type==='cancelamentos')rows=[['Data','MLB','Produto','Ocorrência','Valor','Efeito na receita'],...M.cancellationEvents(state.start,state.end).map(r=>[r.day,productById(r.id).itemId,productById(r.id).name,r.type,r.amount,r.effect])];
    else if(type==='campanhas')rows=[['Campanha','Anúncios','Investido','Receita atribuída','Resultado atribuído','ACOS (%)','ROAS','Cliques','Unidades atribuídas'],...M.campaigns(current).map(c=>[c.name,c.products.length,c.ads,c.adRevenue,c.adResult,acos(c),roas(c),c.clicks,c.adUnits])];
    else if(type==='publicidade')rows=[['MLB','Produto','Campanha','Investido','Receita atribuída','Resultado atribuído','ACOS (%)','ROAS','Cliques','Unidades atribuídas'],...current.products.filter(p=>p.ads>0&&(state.adFilter!=='negative'||p.adResult<0)).map(p=>[p.itemId,p.name,p.category,p.ads,p.adRevenue,p.adResult,acos(p),roas(p),p.clicks,p.adUnits])];
    else if(type==='produtos'&&state.route==='estoque')rows=[['MLB','Produto','Full','Depósito','Total','Cobertura Full (dias)','Situação Full','Cobertura Depósito (dias)','Situação Depósito'],...filteredProducts().map(p=>[p.itemId,p.name,p.full,p.warehouse,p.stock,p.fullCover,M.inventoryStatus(p,'full').label,p.warehouseCover,M.inventoryStatus(p,'warehouse').label])];
    else if(type==='cadastro')rows=[['SKU','Produto','Custo unitário','Imposto (%)','Gestão de estoque'],...catalogProducts().map(p=>[p.sku,p.name,p.unitCost,p.taxRate,p.manageStock?'Ativada':'Desativada'])];
    else{const list=type==='produtos'?filteredProducts():type==='financeiro'&&desktopLayout.matches?financeProducts(financeScope().total):current.products;rows=[['MLB','Produto','SKU','Pedidos','Unidades','Receita líquida','Produto (custo)','Tarifas','Impostos','Frete','Publicidade','Resultado','Margem (%)'],...list.map(p=>[p.itemId,p.name,p.sku,p.orders,p.units,p.net,p.cost,p.fees,p.tax,p.shipping,p.ads,p.result,M.margin(p)])];}
    return rows;
  }
  function exportCSV(type){const csv='\ufeff'+exportRows(type).map(row=>row.map(value=>{let v=value==null?'':String(value);if(/^[=+@\-]/.test(v)&&typeof value!=='number')v="'"+v;return '"'+v.replaceAll('"','""')+'"';}).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download='novai-'+type+'-'+((type==='dre'||type==='despesas'&&desktopLayout.matches&&state.expenseView==='annual')?state.expenseYear:state.start+'-'+state.end)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Arquivo exportado.');}
  function fitNumbers(){
    for(const group of $$('.detail-stats'))group.classList.remove('stacked-values');
    for(const el of $$('.metric-value,.detail-stats strong,.performance-kpis strong,.compact-quote-result strong,.sale-editor input')){el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&size>17){size--;el.style.fontSize=size+'px';}if(el.scrollWidth>el.clientWidth+1&&el.closest('.detail-stats')){const group=el.closest('.detail-stats');group.classList.add('stacked-values');for(const value of group.querySelectorAll('strong'))value.style.fontSize='';}}
    for(const el of $$('.donut-center>strong')){el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&size>10){el.style.fontSize=(--size)+'px';}}
  }
  function closeMenus(focus=false){
    for(const [id,trigger] of [['#period-menu','#period-trigger'],['#demo-menu','#demo-trigger'],['#product-sort-menu','#product-sort'],['#catalog-cost-menu','#catalog-cost-trigger'],['#catalog-tax-menu','#catalog-tax-trigger'],['#finance-sort-menu','#finance-sort'],['#more-menu','#more-trigger']]){
      const menu=$(id);
      if(!menu||menu.hidden)continue;
      menu.hidden=true;$(trigger).setAttribute('aria-expanded','false');
      if(id==='#period-menu')closeCustomDates();
      if(focus)$(trigger).focus({preventScroll:true});
    }
  }
  for(const [trigger,id] of [['#period-trigger','#period-menu'],['#demo-trigger','#demo-menu'],['#more-trigger','#more-menu']])$(trigger).onclick=()=>{const open=$(id).hidden;closeMenus();$(id).hidden=!open;$(trigger).setAttribute('aria-expanded',String(open));};
  const startInput=$('#start'),endInput=$('#end'),customForm=$('#custom-form');
  const calendarDays=$('#calendar-days');
  const calendarMonthFormat=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
  let calendarMonth=M.maxDay.slice(0,7)+'-01',dateEndpoint=startInput;
  function shiftMonth(month,amount){
    const day=M.utc(month);
    day.setUTCMonth(day.getUTCMonth()+amount);
    return day.toISOString().slice(0,10);
  }
  function showCalendar(focusedDay){
    const first=M.utc(calendarMonth),next=shiftMonth(calendarMonth,1);
    const start=startInput.value,end=endInput.value;
    const tabDay=focusedDay||
      (dateEndpoint.value.startsWith(calendarMonth.slice(0,7))?dateEndpoint.value:calendarMonth);
    $('#calendar-month').textContent=calendarMonthFormat.format(first);
    customForm.dataset.endpoint=dateEndpoint.id;
    $('[data-month-step="-1"]').disabled=calendarMonth<=M.minDay;
    $('[data-month-step="1"]').disabled=next>M.maxDay;
    let cells='<span></span>'.repeat(first.getUTCDay());
    for(let day=calendarMonth;day<next;day=M.shift(day,1)){
      const endpoint=day===start||day===end;
      const inside=start&&end&&day>=start&&day<=end;
      const disabled=day<M.minDay||day>M.maxDay;
      cells+='<button type="button" data-calendar-day="'+day+'" class="'+(inside?'in-range':'')+'" aria-pressed="'+endpoint+
        '" aria-label="'+date(day,true)+(day===start?' · Início':'')+(day===end?' · Fim':'')+
        '" tabindex="'+(day===tabDay&&!disabled?0:-1)+'"'+(disabled?' disabled':'')+'>'+Number(day.slice(-2))+'</button>';
    }
    calendarDays.innerHTML=cells;
    if(focusedDay)calendarDays.querySelector('[data-calendar-day="'+focusedDay+'"]')?.focus();
  }
  function closeCustomDates(){
    customForm.hidden=true;
    $('#custom-trigger').setAttribute('aria-expanded','false');
    $('#date-error').textContent='';
  }
  for(const input of [startInput,endInput]){
    input.min=M.minDay;input.max=M.maxDay;
    input.addEventListener('focus',()=>{
      dateEndpoint=input;
      if(input.value>=M.minDay&&input.value<=M.maxDay)calendarMonth=input.value.slice(0,7)+'-01';
      showCalendar();
    });
    input.addEventListener('change',()=>{
      if(input.value>=M.minDay&&input.value<=M.maxDay)calendarMonth=input.value.slice(0,7)+'-01';
      showCalendar();
    });
  }
  $('#custom-trigger').onclick=()=>{
    if(!customForm.hidden){closeCustomDates();return;}
    startInput.value=state.start;endInput.value=state.end;
    customForm.hidden=false;
    $('#custom-trigger').setAttribute('aria-expanded','true');
    dateEndpoint=startInput;
    calendarMonth=state.start.slice(0,7)+'-01';
    showCalendar(state.start);
  };
  $('#cancel-dates').onclick=()=>{closeCustomDates();$('#custom-trigger').focus();};
  customForm.addEventListener('click',e=>{
    const button=e.target.closest('button');
    if(!button)return;
    if(button.dataset.monthStep){
      calendarMonth=shiftMonth(calendarMonth,Number(button.dataset.monthStep));showCalendar();
      if(button.disabled)calendarDays.querySelector('[tabindex="0"]')?.focus();
    }
    const day=button.dataset.calendarDay;
    if(!day)return;
    if(dateEndpoint===startInput){
      startInput.value=day;
      if(endInput.value<day)endInput.value=day;
      dateEndpoint=endInput;
    }else{
      endInput.value=day;
      if(startInput.value>day)[startInput.value,endInput.value]=[day,startInput.value];
      dateEndpoint=startInput;
    }
    $('#date-error').textContent='';showCalendar(day);
  });
  calendarDays.addEventListener('keydown',e=>{
    const day=e.target.dataset.calendarDay;
    if(!day)return;
    const weekday=M.utc(day).getUTCDay();
    const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday};
    if(!Object.hasOwn(offsets,e.key))return;
    e.preventDefault();
    let target=M.shift(day,offsets[e.key]);
    if(target<M.minDay)target=M.minDay;
    if(target>M.maxDay)target=M.maxDay;
    calendarMonth=target.slice(0,7)+'-01';showCalendar(target);
  });
  customForm.onsubmit=e=>{
    e.preventDefault();
    const a=startInput.value,b=endInput.value;
    if(!a||!b||a>b||a<M.minDay||b>M.maxDay){$('#date-error').textContent='Confira as datas de início e fim.';return;}
    state.start=a;state.end=b;state.period=null;state.ledgerPage=1;
    closeMenus(true);render();
    revealUpdatedData();
  };
  function revealUpdatedData(){
    for(const selector of ['#metrics','#chart','#page-content']){
      const element=$(selector);
      if(element.closest('[hidden]')||!element.childElementCount)continue;
      revealPanel(element);
    }
  }
  $('#close-dialog').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{stopCostImport();dialog.classList.remove('cost-import-dialog');document.body.append($('#toast'));if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else $('#main').focus({preventScroll:true});});
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menu-wrap'))closeMenus();});
  document.addEventListener('focusin',e=>{
    if($('#product-sort')?.getAttribute('aria-expanded')==='true'&&!e.target.closest('.product-sort-wrap'))closeMenus();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenus(true);$('#chart-tooltip').hidden=true;$('#chart-focus')?.setAttribute('visibility','hidden');}});
  document.addEventListener('dblclick',e=>{if(e.target instanceof HTMLInputElement && ['sale-editor','unit-cost','pc-price','pc-cost'].includes(e.target.id)){e.preventDefault();e.target.select();requestAnimationFrame(()=>e.target.select());}});
  function refreshAndFocus(selector){render();$(selector)?.focus({preventScroll:true});}
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button,a');if(!b){const row=e.target.closest('tr[data-finance-product]');if(row&&!window.getSelection()?.toString()){returnFocus=row.querySelector('[data-product]');openProduct(row.dataset.financeProduct);}return;}
    if(b.id==='panel-signout'){void signOutPanel();return;}
    if(b.hasAttribute('data-retry-sync')){void retrySync();return;}
    if(b.hasAttribute('data-demo-sync-error')){simulateConnection(true);return;}
    if(b.id==='connection-sync-close'){syncNoticeDismissed=true;renderConnectionNotice();return;}
    if(b.dataset.days){
      state.period=Number(b.dataset.days);state.end=M.maxDay;state.start=M.shift(M.maxDay,1-state.period);state.ledgerPage=1;
      closeMenus(true);render();
      revealUpdatedData();
    }
    if(b.id==='product-sort'){
      const menu=$('#product-sort-menu'),open=menu.hidden;
      closeMenus();
      menu.hidden=!open;b.setAttribute('aria-expanded',String(open));
    }
    if(b.dataset.sort){state.sort=b.dataset.sort;refreshAndFocus('#product-sort');}
    if(b.id==='finance-sort'){const menu=$('#finance-sort-menu'),open=menu.hidden;closeMenus();menu.hidden=!open;b.setAttribute('aria-expanded',String(open));}
    if(b.dataset.financeSort){financeSort=b.dataset.financeSort;refreshAndFocus('#finance-sort');}
    if(b.dataset.refreshDreMonth!=null)void refreshDreMonth(Number(b.dataset.refreshDreMonth));
    if(b.hasAttribute('data-dre-expand'))toggleDreExpanded();
    if(b.dataset.dreGroup){const group=b.dataset.dreGroup;if(dreOpenGroups.has(group))dreOpenGroups.delete(group);else dreOpenGroups.add(group);renderDre();$('[data-dre-group="'+group+'"]')?.focus({preventScroll:true});}
    if(b.dataset.routeTab&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&b.dataset.routeTab!==state.tab)state.productFilter='all';
    if(b.dataset.go){if(dialog.open)dialog.close();location.hash=b.dataset.go;}
    if(b.dataset.editCost)openCost(b.dataset.editCost);
    if(b.id==='import-product-costs'){openCostImport();return;}
    if(b.id==='catalog-cost-trigger'||b.id==='catalog-tax-trigger'){const menu=$('#'+b.getAttribute('aria-controls')),open=menu.hidden;closeMenus();menu.hidden=!open;b.setAttribute('aria-expanded',String(open));return;}
    if(b.dataset.catalogFilter){state[b.dataset.catalogFilter==='cost'?'catalogCostFilter':'catalogTaxFilter']=b.dataset.filterValue;state.productPage=1;closeMenus();renderProducts();$('#catalog-'+b.dataset.catalogFilter+'-trigger').focus({preventScroll:true});imageFallbacks();return;}
    if(b.id==='bulk-products')openBulkProducts();
    if(b.id==='clear-product-selection'){selectedProducts.clear();refreshAndFocus('#bulk-products');}
    if(b.dataset.product)openProduct(b.dataset.product);
    if(b.dataset.listingPrice)openListingPricer(b.dataset.listingPrice);
    if(b.dataset.editStock)openStockEditor(b.dataset.editStock);
    if(b.dataset.planFull)openFullPlan(b.dataset.planFull);
    if(b.dataset.reviewWarehouse){const input=$('form[data-warehouse="'+b.dataset.reviewWarehouse+'"] input');input?.ondblclick?.();}
    if(b.dataset.pricing){const existing=state.route==='oportunidades'&&state.tab==='salvos'?saved.find(s=>s.id===b.dataset.pricing):null;openPricing(b.dataset.pricing,existing?{...existing,weight:existing.weight??1000,height:existing.height??15,width:existing.width??20,length:existing.length??30,reputation:existing.reputation||'green',shippingMode:existing.shippingMode||'Full',category:precifyProductById(b.dataset.pricing).category}:null);}
    if(b.dataset.alert!=null){const a=(b.dataset.allAlert?alerts:alerts.slice(0,2))[Number(b.dataset.alert)];if(a){if(a.type==='cost')openCost(a.id);else if(a.type==='stock'){if(dialog.open)dialog.close();location.hash=a.location==='warehouse'?'estoque/reposicao-deposito':'estoque/reposicao-full';}else openProduct(a.id);}}
    if(b.id==='attention-all')openAlerts();
    if(b.hasAttribute('data-finance-info'))openFinance();
    if(b.hasAttribute('data-ads-info'))openAdsInfo();
    if(b.hasAttribute('data-add-expense'))openExpense();
    if(b.dataset.expenseView){state.expenseView=b.dataset.expenseView;render();$('[data-expense-view="'+state.expenseView+'"]')?.focus({preventScroll:true});}
    if(b.dataset.editExpense)openExpense(b.dataset.editExpense);
    if(b.dataset.campaign)openCampaign(b.dataset.campaign);
    if(b.dataset.removeStudy){b.disabled=true;void window.NovaiSavedPanel.remove(b.dataset.removeStudy).then(ok=>{if(!ok){b.disabled=false;toast('Não foi possível remover agora.');}});}
    if(b.hasAttribute('data-refresh-saved'))void window.NovaiSavedPanel.load();
    if(b.hasAttribute('data-extension-account'))void chrome.runtime.sendMessage({type:'OPEN_ACCOUNT'});
    if(b.dataset.campaignMetric){state.campaignMetric=b.dataset.campaignMetric;renderCampaigns();$('[data-campaign-metric="'+state.campaignMetric+'"]')?.focus({preventScroll:true});imageFallbacks();}
    if(b.dataset.costSlice)selectCostSlice(b.dataset.costSlice);
    if(b.hasAttribute('data-cost-reset')){selectCostSlice(null);$('[data-cost-slice]')?.focus({preventScroll:true});}
    if(b.dataset.export)exportCSV(b.dataset.export);
    if(b.dataset.productPage&&desktopLayout.matches){
      const before=state.productPage;
      state.productPage=Math.max(1,Math.min(Math.ceil(catalogProducts().length/productPageSize)||1,Number(b.dataset.productPage)));
      renderProducts();imageFallbacks();
      const selected=$('.page-wheel [aria-current="page"]');selected?.focus({preventScroll:true});
      if(selected&&!reducedMotion.matches){selected.querySelector('span').animate([{opacity:.35,transform:'translateY('+(state.productPage>before?'5':'-5')+'px) rotate('+(state.productPage>before?'-18':'18')+'deg)'},{opacity:1,transform:'translateY(0) rotate(0)'}],{duration:160,easing:'ease-out'});revealPanel($('.catalog-table tbody'));}
    }
    if(b.dataset.productFilter){state.productFilter=b.dataset.productFilter;state.productPage=1;refreshAndFocus('[data-product-filter="'+state.productFilter+'"]');}
    if(b.dataset.adFilter){state.adFilter=b.dataset.adFilter;refreshAndFocus('[data-ad-filter="'+state.adFilter+'"]');}
    if(b.dataset.adToggle&&desktopLayout.matches)toggleAdSeries(b.dataset.adToggle);
    if(b.dataset.chart&&state.route==='publicidade'&&desktopLayout.matches){toggleAdSeries(b.dataset.chart);}
    else if(b.dataset.chart&&b.dataset.chart!==state.chart[state.route]){
      state.chart[state.route]=b.dataset.chart;
      renderChart();revealPanel($('#chart'));
      $('[data-chart="'+b.dataset.chart+'"]')?.focus({preventScroll:true});
    }
    if(b.dataset.removeExpense){const previousExpenses=expenses.slice(),next=expenses.filter(x=>x.id!==b.dataset.removeExpense);if(!await persist({expenses:next})){toast('Não foi possível remover a despesa.');return;}expenses=next;render();toast('Despesa removida.',false,async ()=>{if(!await persist({expenses:previousExpenses})){toast('Não foi possível restaurar a despesa.');return;}expenses=previousExpenses;render();});}
    if(b.id==='undo-button'&&undoAction){undoAction();$('#toast').hidden=true;undoAction=null;}
    if(b.hasAttribute('data-toast-link')){e.preventDefault();if(dialog.open)dialog.close();$('#toast').hidden=true;if(location.hash==='#oportunidades/salvos')render();else location.hash='oportunidades/salvos';}
    if(b.dataset.package!=null){const packages=[[500,10,15,20],[1500,15,25,35],[3000,30,40,60]],values=packages[Number(b.dataset.package)];['weight','height','width','length'].forEach((name,i)=>{$('#pc-'+name).value=values[i];});$$('[data-package]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}
    if(b.dataset.priceType){pricing.type=b.dataset.priceType;pricing.commission=null;pricingForm();}
  });
  document.addEventListener('change',e=>{
    const input=e.target;
    if(input.id==='expense-year'){state.expenseYear=Number(input.value);if(!expenseDraft.name&&!expenseDraft.amount)expenseDraft.date=state.expenseYear+'-01-01';render();$('#expense-year').focus({preventScroll:true});}
    if(input.dataset.selectProduct){
      if(input.checked)selectedProducts.add(input.dataset.selectProduct);
      else selectedProducts.delete(input.dataset.selectProduct);
      renderProducts();
      $('[data-select-product="'+input.dataset.selectProduct+'"]')?.focus({preventScroll:true});
    }
    if(input.id==='select-visible-products'){
      for(const {id} of catalogProducts()){
        if(input.checked)selectedProducts.add(id);else selectedProducts.delete(id);
      }
      renderProducts();$('#select-visible-products')?.focus({preventScroll:true});
    }
  });
  document.addEventListener('input',e=>{if(!['product-search','opportunity-search'].includes(e.target.id))return;const id=e.target.id,position=e.target.selectionStart;state.search=e.target.value;state.productPage=1;if(id==='product-search'){if(state.route==='anuncios')renderListings();else if(state.route==='estoque')renderListingAnalysis();else renderProducts();}else renderOpportunities();const input=$('#'+id);input.focus({preventScroll:true});if(position!=null)input.setSelectionRange(position,position);imageFallbacks();});
  const pointAt=e=>{const r=e.currentTarget.getBoundingClientRect();showPoint(Math.round(((e.clientX-r.left)/r.width*chartWidth-49)/(chartWidth-54)*(chartPoints.length-1)));};
  $('#chart-container').addEventListener('pointermove',pointAt);$('#chart-container').addEventListener('pointerdown',pointAt);
  $('#chart-container').addEventListener('pointerleave',()=>{if(document.activeElement!==$('#chart-container')){$('#chart-tooltip').hidden=true;$('#chart-focus')?.setAttribute('visibility','hidden');}});
  $('#chart-container').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showPoint(e.key==='Home'?0:e.key==='End'?chartPoints.length-1:activePoint<0?0:activePoint+(e.key==='ArrowRight'?1:-1));});
  window.addEventListener('resize',()=>{fitNumbers();if(!$('#chart-section').hidden)renderChart();if(dialog.open&&dialogKind==='performance'&&performanceView){const {id,start,end,metricKey}=performanceView;openPerformance(id,start,end,metricKey);}});window.addEventListener('hashchange',setRoute);
  desktopLayout.addEventListener('change',()=>{if(!desktopLayout.matches&&dreDialog.open)dreDialog.close();if(state.route==='resumo')renderAttention();if(state.route==='produtos'){renderProducts();imageFallbacks();}if(state.route==='publicidade'){renderAdMetrics();renderChart();}if(state.route==='financeiro')render();});
  const connection=window.NovaiConnectionSync.create({onChange:()=>{
    syncNoticeDismissed=false;renderConnectionNotice();
    if(state.route==='conexoes'){const focused=document.activeElement,inside=focused?.closest('.connections-view'),href=focused?.getAttribute('href'),demo=focused?.hasAttribute('data-demo-sync');renderConnections();if(inside){if(demo)$('[data-demo-sync]')?.focus({preventScroll:true});else if(href)$$('.connections-view a').find(a=>a.getAttribute('href')===href)?.focus({preventScroll:true});}}if(state.route==='configuracoes')renderSettings();
  }});
  let syncNoticeDismissed=false,demoSyncTimers=[];
  let panelSession={authenticated:false,email:null,preview:false};

  const extensionSession=!!window.chrome?.runtime?.id&&location.protocol==='chrome-extension:';
  const accessPage=()=>'/conectado';
  const accountLink='/conectado';
  const syncLabels={disconnected:'Desconectado',connected:'Conectado',syncing:'Sincronizando',ready:'Conectado',error:'Sincronização interrompida'};
  const syncTime=value=>value?new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}):'';
  function renderConnections(){
    const s=connection.snapshot(),connected=s.status!=='disconnected';
    const name=$('#store-account-name').textContent,photo=$('#store-account-photo');
    const identity=connected?'<div class="connection-owner"><span class="connection-owner-avatar">'+(!photo.hidden?'<img src="'+esc(photo.src)+'" alt="" width="40" height="40">':'<span>'+esc($('#store-account-initials').textContent)+'</span>')+'</span><div><strong>'+esc(name)+'</strong><span>Conta vinculada</span></div></div>':'';
    const detail=s.status==='syncing'?'<div class="connection-import"><span class="connection-spinner" aria-hidden="true"></span><div><strong>Recebendo seus dados</strong><p>'+esc(s.stage)+'</p></div></div>':s.status==='ready'?'<p class="connection-updated">Última atualização às '+syncTime(s.updatedAt)+'.</p>':s.status==='error'?'<p class="connection-error">Não foi possível concluir. Tente novamente.</p>':'';
    const cta=s.status==='syncing'?'<a class="button primary" href="#resumo">Ir para o resumo '+arrow+'</a>':s.status==='ready'?'<a class="button primary" href="#resumo">Abrir resumo '+arrow+'</a>':'<a class="button primary" href="'+accessPage()+'"'+(accessPage()===accountLink?' target="_blank" rel="noopener noreferrer"':'')+'>'+ (connected?'Gerenciar conexão':'Conectar Mercado Livre')+' '+arrow+'</a>';
    $('#page-content').innerHTML='<section class="connections-view" aria-labelledby="connections-intro"><p id="connections-intro" class="connections-intro">Conecte sua conta para acompanhar a operação.</p><article class="panel connection-panel" data-connection-state="'+s.status+'"><div class="connection-provider"><span class="connection-market-logo" aria-hidden="true"><img src="/painel/assets/mercado-livre-simbolo.png" alt=""></span><h2>Mercado Livre</h2><span class="connection-state '+s.status+'"><span aria-hidden="true"></span>'+syncLabels[s.status]+'</span></div>'+identity+detail+'<div class="connection-panel-actions">'+cta+('<button type="button" class="button secondary" data-retry-sync>Atualizar coleta</button>')+'</div>'+(s.mode==='preview'?'<p class="connection-preview-note">Teste visual com dados de exemplo. Nenhuma conta real é alterada.</p>':'')+'</article><p class="connection-help">Você pode continuar usando o painel durante a sincronização.</p></section>';
  }
  function renderConnectionNotice(){
    const s=connection.snapshot(),notice=$('#connection-sync-notice');
    notice.hidden=state.route==='conexoes'||syncNoticeDismissed||!['syncing','ready','error'].includes(s.status);
    notice.dataset.state=s.status;
    const title=s.status==='syncing'?'Recebendo dados do Mercado Livre':s.status==='ready'?'Seus dados estão atualizados':'A sincronização não foi concluída';
    $('#connection-sync-title').textContent=title;
    $('#connection-sync-copy').textContent=s.status==='syncing'?'Você pode continuar usando o painel.':s.status==='ready'?'Tudo pronto para acompanhar sua operação.':'Abra Conexões para tentar novamente.';
    $('#connection-sync-detail').textContent=s.status==='syncing'?s.stage:'';
    $('#connection-sync-detail').hidden=s.status!=='syncing';
    $('#connection-sync-preview').hidden=s.mode!=='preview';
    $('#connection-sync-close').hidden=s.status==='syncing';
  }
  function renderSettings(){
    const connected=connection.snapshot().status!=='disconnected',authenticated=panelSession.authenticated;
    $('#page-content').innerHTML='<section class="settings-view"><article class="panel settings-panel"><h2>Sua conta NOVAI</h2><div class="settings-line"><span>E-mail</span><strong>'+esc(authenticated?(panelSession.email||'E-mail indisponível'):'Entre para ver sua conta')+'</strong></div>'+(panelSession.preview?'<span class="settings-preview-label">Conta de demonstração</span>':'')+'<div class="settings-actions">'+(authenticated?'<button type="button" class="button secondary" id="panel-signout">Sair da conta</button>':'<a class="button primary" href="/login">Entrar na conta</a><a class="button secondary" href="'+'/cadastro'+'">Criar conta</a>')+'</div><p id="settings-feedback" role="status"></p></article><article class="panel settings-panel"><h2>Mercado Livre</h2><div class="settings-line"><span>'+ (connected?'Conta conectada':'Conta de vendas')+'</span><strong>'+esc(connected?$('#store-account-name').textContent:'Não conectado')+'</strong></div><a class="text-button yellow" href="#conexoes">Gerenciar conexão '+arrow+'</a></article></section>';
  }
  function applySession(data){
    const email=typeof data?.email==='string'&&data.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())?data.email.trim():null;
    panelSession={authenticated:data?.authenticated===true,email:data?.authenticated===true?email:null,preview:data?.preview===true};
    if(state.route==='configuracoes')renderSettings();return {...panelSession};
  }
  async function signOutPanel(){
    const button=$('#panel-signout');button.disabled=true;
    try{
      if(extensionSession){const result=await chrome.runtime.sendMessage({type:'LOGOUT'});if(result?.authenticated!==false||result.unavailable)throw Error('unavailable');}
      else if(typeof window.NOVAI_ACCOUNT_BRIDGE?.logout==='function'){const result=await window.NOVAI_ACCOUNT_BRIDGE.logout();if(result?.authenticated!==false)throw Error('unavailable');}
      else{throw Error('integration');}
      connectionAdapter.disconnected();applySession(null);render();toast('Você saiu da conta.');
    }catch{$('#settings-feedback').textContent='Não foi possível sair. Abra sua conta NOVAI para tentar novamente.';button.disabled=false;}
  }
  async function refreshPanelSession(){
    if(!extensionSession)return;
    try{const data=await chrome.runtime.sendMessage({type:'GET_AUTH_STATE'});applySession(data);
      if(data?.authenticated&&data.linked){if($('#store-account').dataset.accountSource==='preview')applyAccount({name:'Sua loja'});if(connection.snapshot().status==='disconnected')connection.connect({mode:'live'});}
      else if(connection.snapshot().mode==='live')connectionAdapter.disconnected();
    }catch{applySession(null);}
  }

  function clearDemoSync(){demoSyncTimers.forEach(clearTimeout);demoSyncTimers=[];}
  function startConnection(options={}){
    clearDemoSync();if(options.account)applyAccount(options.account);
    return connection.start({mode:options.mode||'live',stage:options.stage||'Preparando os dados…'});
  }
  async function simulateConnection(){await retrySync();}
  const connectionAdapter=Object.freeze({
    snapshot:connection.snapshot,
    connected(account){clearDemoSync();if(account)applyAccount(account);return connection.connect({mode:'live'});},
    start:startConnection,progress:connection.progress,complete:connection.complete,fail:connection.fail,
    disconnected(){clearDemoSync();connection.disconnect();applyAccount(null);},
    async run(operation,{account}={}){
      const id=startConnection({account});
      try{const value=await operation(label=>connection.progress(id,label));connection.complete(id);return value;}
      catch(error){connection.fail(id);throw error;}
    }
  });

  // Metadata only: the authenticated backend owns OAuth, account authorization and profile lookup.
  // Identity metadata comes only from the authenticated account adapter.
  let accountRenderVersion=0;
  function applyAccount(account){
    const version=++accountRenderVersion;
    const name=(typeof account?.name==='string'?account.name:'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,160)||'Sua loja';
    const photo=$('#store-account-photo'),initials=$('#store-account-initials'),header=$('#store-account');
    $('#store-account-name').textContent=name;$('#store-account-name').title=name;
    initials.textContent=name.split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('pt-BR');
    header.dataset.accountSource=account?.example?'preview':account?'account':'unavailable';
    const fallback=()=>{if(version!==accountRenderVersion)return;photo.hidden=true;initials.hidden=false;};
    photo.onload=null;photo.onerror=null;photo.removeAttribute('src');fallback();
    let pictureUrl=null;
    try{
      const raw=typeof account?.pictureUrl==='string'?account.pictureUrl.trim():'';
      if(raw){
        const url=new URL(raw,location.href),cdn=url.hostname==='mlstatic.com'||url.hostname.endsWith('.mlstatic.com');
        const sameOrigin=url.origin===location.origin;
        const localPreview=account?.example===true&&sameOrigin&&url.pathname.includes('/assets/');
        if(!url.username&&!url.password&&((url.protocol==='https:'&&(cdn||sameOrigin))||localPreview))pictureUrl=url.href;
      }
    }catch{}
    if(pictureUrl){
      photo.alt='Foto da conta '+name;
      photo.onload=()=>{if(version===accountRenderVersion&&photo.complete&&photo.naturalWidth>0){photo.hidden=false;initials.hidden=true;}};
      photo.onerror=fallback;photo.src=pictureUrl;
    }
    return {name,pictureUrl};
  }
  // Apply verified cover metadata without changing financial facts.
  function applyListings(items){let count=0;for(const item of Array.isArray(items)?items:[]){const p=M.products.find(p=>p.itemId===item?.id),url=M.safeCover(item);if(p&&url){imageOverrides.set(p.id,url);count++;}}render();return count;}
  window.NovaiPanel=Object.freeze({applyListings,applyAccount,applySession,connection:connectionAdapter,updates,snapshot:()=>JSON.parse(JSON.stringify({state,current,previous,alerts,expenseRows,expenseTotal,saved,chartPoints,dialogKind,dialogProduct})),exportRows});
  window.NovaiSavedPanel?.subscribe(()=>{if(state.route==='oportunidades')render();});
  applyAccount({name:M.account.progress?.nickname||'Sua loja'});
  applySession({authenticated:!!M.account.user,email:M.account.user?.email});
  if(window.NOVAI_CONNECTED_ACCOUNT)connection.connect({mode:'live'});
  if(window.NOVAI_SESSION)applySession(window.NOVAI_SESSION);
  if(extensionSession){void refreshPanelSession();window.addEventListener('focus',refreshPanelSession);chrome.runtime.onMessage.addListener(message=>{if(message?.type==='AUTH_STATE_CHANGED')void refreshPanelSession();});}
  let liveRun=null,pollTimer=null;
  function showLiveProgress(){
    const p=M.account.progress,error=M.error;
    if(!M.account.connected){connectionAdapter.disconnected();return;}
    const stage=p?`${p.monthsCompleted} de ${p.monthsTotal} meses de pedidos. Produtos e Ads aparecem conforme recebidos.`:'Preparando coleta…';
    if(liveRun==null)liveRun=connectionAdapter.start({stage});
    if(error){connectionAdapter.fail(liveRun);liveRun=null;}
    else if(p?.collecting){if(connection.snapshot().status!=='syncing')liveRun=connectionAdapter.start({stage});else connectionAdapter.progress(liveRun,stage);}
    else if(p?.warnings?.some(x=>x!=='ads_retention_90_days'&&x!=='no_ads_account')){connectionAdapter.fail(liveRun);liveRun=null;}
    else connectionAdapter.complete(liveRun);
    if(error){$('#connection-sync-copy').textContent=error.code==='preferences_changed'?'Os cadastros mudaram em outra aba. Atualize a página.':'Parte dos dados está indisponível. Seus cadastros continuam salvos.';}
    if(p?.nickname)applyAccount({name:p.nickname});
  }
  function applyStored(){
    Object.assign(state.costs,M.defaultCosts());expenses=M.defaultExpenses();listingUpdates=structuredClone(M.data.listingUpdates||{});
    for(const key of Object.keys(productSettings))delete productSettings[key];Object.assign(productSettings,M.data.productSettings||{});
    eanHistory=readEANHistory();
  }
  async function retrySync(){try{await api('/sync',{retry:true});await M.refresh();showLiveProgress();if(!dialog.open){applyStored();render();}}catch{toast('Não foi possível atualizar. Confira sua conexão em Configurações.');}}
  let renderPending=false;
  window.addEventListener('novai-data',()=>{
    if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;showLiveProgress();
      if(dialog.open){if(dialogKind==='performance'&&performanceView){const {id,start,end,metricKey}=performanceView;openPerformance(id,start,end,metricKey);}else recalculate();}
      else if(!document.activeElement?.matches('input,select,textarea'))render();
    });
  });
  async function poll(){try{if(!saving&&!dialog.open&&!document.activeElement?.matches('input,select,textarea')){await M.refresh();applyStored();showLiveProgress();render();}}catch{showLiveProgress();}finally{pollTimer=setTimeout(poll,15000);}}
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  window.addEventListener('storage',e=>{if(e.key==='authToken')location.reload();});
  if(M.account.connected){try{await api('/sync',{});await M.refresh();}catch{}}
  setRoute();showLiveProgress();void window.NovaiSavedPanel.load();pollTimer=setTimeout(poll,15000);
  if(!M.account.user){$('#connection-sync-notice').hidden=false;$('#connection-sync-title').textContent='Entre na sua conta NOVAI';$('#connection-sync-copy').innerHTML='<a href="/login">Entrar para carregar seus dados</a>';}
})();
