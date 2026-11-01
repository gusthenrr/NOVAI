'use strict';
if('scrollRestoration' in history)history.scrollRestoration='manual';
const products = [
 {
  "id": 1,
  "title": "Fone Bluetooth Samsung Galaxy Buds Core Preto",
  "short": "Galaxy Buds Core Preto",
  "image": 1,
  "store": "Sonora Prime",
  "price": 241.53,
  "original": 349,
  "discount": 30,
  "days": 460,
  "sold": 100000,
  "visits": 2500000,
  "rating": "4,9",
  "reviews": 18420,
  "history": [
   5500,
   6500,
   6100,
   7200,
   6800,
   7100
  ],
  "projection": [
   7500,
   7900,
   8300
  ],
  "cost": 118,
  "payment": "com Saldo no Mercado Pago",
  "installment": "8x R$ 31,12 sem juros",
  "description": "Fones Bluetooth com encaixe intra-auricular e acabamento preto.",
  "spec": "Bluetooth · Estojo de recarga",
  "category": "Áudio"
 },
 {
  "id": 2,
  "title": "Fone De Ouvido Bluetooth JBL Wave Buds 2 Fit Preto",
  "short": "JBL Wave Buds 2 Fit",
  "image": 2,
  "store": "Universo Megastore",
  "price": 262.2,
  "original": 500,
  "discount": 47,
  "days": 697,
  "sold": 50000,
  "visits": 1400000,
  "rating": "4,8",
  "reviews": 9210,
  "history": [
   2600,
   2450,
   2300,
   2200,
   2180,
   2100
  ],
  "projection": [
   2080,
   2010,
   1960
  ],
  "cost": 131,
  "installment": "12x R$ 25,65",
  "wholesale": "R$ 252,84 levando 2 ou mais",
  "exclusive": true,
  "pink": true,
  "description": "Fones sem fio com estojo de recarga e acabamento preto.",
  "spec": "Bluetooth · Estojo portátil",
  "category": "Áudio"
 },
 {
  "id": 3,
  "title": "Tênis Olympikus Corre 4 Unissex Branco",
  "short": "Olympikus Corre 4",
  "category": "Calçados",
  "photo": "shoe-corre.jpg",
  "store": "Passo Leve",
  "price": 499.9,
  "original": 599.9,
  "discount": 16,
  "days": 380,
  "sold": 7200,
  "visits": 216000,
  "rating": "4,9",
  "reviews": 1089,
  "history": [
   380,
   620,
   960,
   720,
   490,
   680
  ],
  "projection": [
   710,
   760,
   800
  ],
  "cost": 265,
  "installment": "10x R$ 49,99 sem juros",
  "description": "Tênis de corrida com cabedal em tecido e acabamento branco.",
  "spec": "Corrida · Tamanhos 36 a 44"
 },
 {
  "id": 4,
  "title": "Parafusadeira Furadeira Bosch 12V com Bateria",
  "short": "Parafusadeira Bosch 12V",
  "category": "Ferramentas",
  "photo": "drill-bosch.png",
  "store": "Oficina Prime",
  "price": 599.9,
  "original": 749.9,
  "discount": 20,
  "days": 420,
  "sold": 4300,
  "visits": 129000,
  "rating": "4,8",
  "reviews": 587,
  "history": [
   270,
   285,
   280,
   295,
   290,
   305
  ],
  "projection": [
   310,
   300,
   315
  ],
  "cost": 330,
  "installment": "10x R$ 59,99 sem juros",
  "description": "Parafusadeira e furadeira sem fio para montagem e manutenção.",
  "spec": "12 V · Bateria recarregável"
 },
 {
  "id": 5,
  "title": "Fone De Ouvido Bluetooth Xiaomi Redmi Buds 6 Play Preto",
  "short": "Redmi Buds 6 Play",
  "image": 3,
  "store": "Digital Sul",
  "price": 99.9,
  "original": 119.9,
  "discount": 16,
  "days": 160,
  "sold": 2100,
  "visits": 63000,
  "rating": "4,9",
  "reviews": 1380,
  "history": [
   0,
   0,
   120,
   380,
   590,
   840
  ],
  "projection": [
   940,
   1010,
   1090
  ],
  "cost": 39,
  "wholesale": "R$ 89,57 levando 10 ou mais",
  "exclusive": true,
  "description": "Fones compactos sem fio com estojo para recarga.",
  "spec": "Bluetooth · Modelo intra-auricular",
  "category": "Áudio"
 },
 {
  "id": 6,
  "title": "Baseus Bass BS2 Lite True Wireless Fones de ouvido Bluetooth 6.0 Preto",
  "short": "Baseus Bass BS2 Lite",
  "image": 4,
  "store": "Conecta Rio",
  "price": 139.9,
  "original": 199,
  "discount": 29,
  "days": 260,
  "sold": 3200,
  "visits": 96000,
  "rating": "4,8",
  "reviews": 296,
  "history": [
   310,
   180,
   620,
   290,
   710,
   390
  ],
  "projection": [
   430,
   470,
   510
  ],
  "cost": 58,
  "description": "Fones True Wireless com encaixe confortável e estojo portátil.",
  "spec": "Bluetooth 6.0 · Estojo de recarga",
  "category": "Áudio"
 },
 {
  "id": 7,
  "title": "Tênis Nike Court Vision Low Masculino Branco",
  "short": "Nike Court Vision Low",
  "category": "Calçados",
  "photo": "shoe-court.jpg",
  "store": "Avenida Sport",
  "price": 329.9,
  "original": 449.9,
  "discount": 26,
  "days": 510,
  "sold": 24000,
  "visits": 720000,
  "rating": "4,8",
  "reviews": 3418,
  "history": [
   960,
   820,
   740,
   1030,
   880,
   690
  ],
  "projection": [
   650,
   610,
   590
  ],
  "cost": 171,
  "installment": "6x R$ 54,98 sem juros",
  "description": "Tênis casual de cano baixo, com fechamento por cadarços.",
  "spec": "Casual · Cor branca"
 },
 {
  "id": 8,
  "title": "Jogo de Ferramentas Vonder 128 Peças com Maleta",
  "short": "Kit Vonder 128 Peças",
  "category": "Ferramentas",
  "photo": "tool-kit.webp",
  "store": "Casa da Oficina",
  "price": 459.9,
  "original": 599.9,
  "discount": 23,
  "days": 330,
  "sold": 4900,
  "visits": 147000,
  "rating": "4,9",
  "reviews": 712,
  "history": [
   100,
   140,
   190,
   780,
   420,
   260
  ],
  "projection": [
   280,
   300,
   320
  ],
  "cost": 238,
  "installment": "10x R$ 45,99 sem juros",
  "description": "Jogo de ferramentas organizado em maleta para reparos e manutenção.",
  "spec": "128 peças · Maleta inclusa"
 },
 {
  "id": 9,
  "title": "Headphone sem fio Studio Pro Preto",
  "short": "Headphone Studio Pro",
  "category": "Áudio",
  "photo": "product-1.jpg",
  "store": "Som Criativo",
  "price": 249.9,
  "original": 349.9,
  "discount": 28,
  "days": 460,
  "sold": 12400,
  "visits": 310000,
  "rating": "4,9",
  "reviews": 1248,
  "history": [
   380,
   420,
   410,
   395,
   425,
   415
  ],
  "projection": [
   420,
   425,
   430
  ],
  "cost": 118,
  "installment": "6x R$ 41,65 sem juros",
  "description": "Headphone sem fio com almofadas macias para o uso diário.",
  "spec": "Bluetooth · Cor preta"
 },
 {
  "id": 10,
  "title": "Smartwatch Circular Daily Watch com Pulseira",
  "short": "Smartwatch Daily Watch",
  "category": "Tecnologia",
  "photo": "product-4.jpg",
  "store": "Tempo & Cia",
  "price": 219.9,
  "original": 299.9,
  "discount": 26,
  "days": 610,
  "sold": 8200,
  "visits": 205000,
  "rating": "4,8",
  "reviews": 1069,
  "history": [
   520,
   650,
   790,
   860,
   730,
   580
  ],
  "projection": [
   540,
   510,
   490
  ],
  "cost": 96,
  "installment": "5x R$ 43,98 sem juros",
  "description": "Relógio inteligente com mostrador circular e pulseira ajustável.",
  "spec": "Tela digital · Pulseira ajustável"
 },
 {
  "id": 11,
  "title": "Câmera Digital Focus Mirror com Lente",
  "short": "Câmera Focus Mirror",
  "category": "Tecnologia",
  "photo": "product-7.jpg",
  "store": "Lente Nova",
  "price": 2499.9,
  "original": 2999.9,
  "discount": 16,
  "days": 400,
  "sold": 760,
  "visits": 38000,
  "rating": "4,9",
  "reviews": 184,
  "history": [
   25,
   30,
   28,
   36,
   32,
   39
  ],
  "projection": [
   42,
   44,
   46
  ],
  "cost": 1540,
  "installment": "10x R$ 249,99 sem juros",
  "description": "Câmera digital de lentes intercambiáveis para fotografia e vídeo.",
  "spec": "24 MP · Lente inclusa"
 },
 {
  "id": 12,
  "title": "Teclado sem fio Slim Office Compacto",
  "short": "Teclado Slim Office",
  "category": "Tecnologia",
  "photo": "product-6.jpg",
  "store": "Setup Lab",
  "price": 289.9,
  "original": 379.9,
  "discount": 23,
  "days": 245,
  "sold": 2600,
  "visits": 78000,
  "rating": "4,8",
  "reviews": 296,
  "history": [
   120,
   220,
   160,
   310,
   240,
   380
  ],
  "projection": [
   400,
   450,
   470
  ],
  "cost": 139,
  "installment": "5x R$ 57,98 sem juros",
  "description": "Teclado de perfil baixo para trabalho e tarefas do dia a dia.",
  "spec": "Sem fio · Layout compacto"
 }
];
const $ = s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
const revenueMoney=n=>n>=1000000?'R$ '+(n/1000000).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' mi':money(n);
const int=n=>new Intl.NumberFormat('pt-BR').format(n);
const compact=n=>n>=1000000?`${(n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`:n>=1000?`${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`:int(n);
const priceHtml=n=>{const [whole,cents]=n.toFixed(2).split('.');return `R$ ${int(Number(whole))}<sup>${cents}</sup>`};
const verified='<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#eaede4"/><path d="m3.5 6 1.5 1.5 3-3" stroke="#7a8464" stroke-width="1.2"/></svg>';
let state={query:'',category:'Todos',sort:'relevance',scroll:0,focusId:null};
try{const saved=JSON.parse(sessionStorage.getItem('novai-demo'));if(saved)state={...state,...saved};}catch{}
state.category='Todos';
const persist=()=>sessionStorage.setItem('novai-demo',JSON.stringify(state));
// Displayed sales are lower-bound buckets observed on public Mercado Livre pages.
// Exact fictional totals remain local; they are not inferred from the public label.
function soldRange(n){const buckets=[250000,100000,50000,10000,5000,1000,500,100];const min=buckets.find(v=>n>=v);if(!min)return int(n);const label=min>=1000000?int(min/1000000)+' mi':min>=5000?int(min/1000)+' mil':String(min);return '+'+label;}
function metrics(p){return `<div class="metrics"><div class="metric"><span>Criado há</span><strong>${p.days} dias</strong></div><div class="metric yellow"><span>Vendidos</span><strong>${soldRange(p.sold)}</strong></div><div class="metric"><span>Visitas</span><strong>${compact(p.visits)}</strong></div></div>`}
function productMedia(p,detail=false){if(p.photo)return `<img class="catalog-photo" src="/site-apresentacao/assets/${p.photo}" alt="${p.title}" ${detail?'':'loading="lazy"'} decoding="async" width="800" height="800">`;const crops={1:[58,20,404,396],2:[484,20,405,396],3:[911,20,405,396],4:[1337,20,401,396]},[x,y,w,h]=crops[p.image];return `<img class="reference-photo" src="/site-apresentacao/assets/mercado-reference.png" alt="${p.title}" ${detail?'':'loading="lazy"'} decoding="async" width="1738" height="905" style="width:${1738/w*100}%;height:${905/h*100}%;left:${-x/w*100}%;top:${-y/h*100}%;">`}
function card(p){return `<article class="product-card" data-id="${p.id}"><a class="product-photo product-link" href="#anuncio/${p.id}" aria-label="Abrir anúncio: ${p.title}">${productMedia(p)}</a><div class="card-body"><div class="catalog">Catálogo</div><a class="product-title product-link" href="#anuncio/${p.id}">${p.title}</a><div class="store">${p.store} ${verified}</div><div class="rating"><span class="star">★</span> <b>${p.rating}</b> <span>| ${soldRange(p.sold)} vendidos</span></div><div class="offer-info"><div class="old-price">${money(p.original)}</div><div class="price-row"><div class="price">${priceHtml(p.price)}</div><span class="discount ${p.pink?'pink':''}">${p.discount}% OFF${p.pink?'<small>meli+</small>':''}</span></div>${p.payment?`<div class="payment">${p.payment}</div>`:''}${p.installment?`<div class="installment ${p.installment.includes('sem juros')?'interest-free':''}">${p.installment}</div>`:''}${p.wholesale?`<div class="wholesale">${p.wholesale}</div>`:''}${p.exclusive?'<div class="exclusive">EXCLUSIVO NEGÓCIOS</div>':''}<div class="shipping"><span class="delivery">Chegará grátis hoje <b>meli+</b></span><strong>ϟ FULL</strong></div></div><div class="extension-block">${metrics(p)}<button id="analysis-${p.id}" class="analysis-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="preview" data-product="${p.id}"><span>Ver análise</span><span aria-hidden="true">→</span></button></div></div></article>`}
function renderProducts(){closePreview();const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let shown=products.filter(p=>(state.category==='Todos'||p.category===state.category)&&normalize(p.title+' '+p.store+' '+p.category).includes(normalize(state.query)));if(state.sort==='sold')shown.sort((a,b)=>b.sold-a.sold);if(state.sort==='price-up')shown.sort((a,b)=>a.price-b.price);if(state.sort==='price-down')shown.sort((a,b)=>b.price-a.price);$('#grid').innerHTML=shown.map(card).join('');$('#empty').hidden=shown.length>0;$('#count').textContent=`${shown.length} ${shown.length===1?'anúncio para explorar':'anúncios para explorar'}`;$('#search').value=state.query;$('#sort').value=state.sort;document.querySelectorAll('[data-category]').forEach(b=>{const active=b.dataset.category===state.category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});persist();}
$('#searchForm').addEventListener('submit',e=>{e.preventDefault();state.query=$('#search').value.trim();renderProducts()});
$('#search').addEventListener('input',()=>{state.query=$('#search').value;renderProducts()});
$('#categories').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.category=b.dataset.category;renderProducts()});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;renderProducts()});
$('#reset').addEventListener('click',()=>{state={...state,query:'',category:'Todos',sort:'relevance'};renderProducts();$('#search').focus()});

// A single lazy preview. Hover grace also covers the gap between trigger and panel.
const panel=$('#preview');let openTimer,closeTimer,anchor=null,activeId=null,pinned=false,suppressFocus=false;
function cancelTimers(){clearTimeout(openTimer);clearTimeout(closeTimer)}
function closePreview(restore=false){cancelTimers();const previous=anchor;if(previous)previous.setAttribute('aria-expanded','false');panel.hidden=true;panel.innerHTML='';activeId=null;anchor=null;pinned=false;if(restore&&previous?.isConnected){suppressFocus=true;previous.focus({preventScroll:true});suppressFocus=false;}}
function chart(p){const all=[...p.history,...p.projection],max=Math.ceil(Math.max(...all)*1.18/10)*10,min=0;const x=i=>34+i*33.25,y=n=>111-(n-min)/max*88;const path=(vals,start)=>vals.map((n,i)=>`${i?'L':'M'}${x(start+i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');const hist=path(p.history,0),future=path([p.history[5],...p.projection],5);const months=['Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];return `<svg class="chart" viewBox="0 0 320 140" role="img" aria-label="Vendas ilustrativas de abril a setembro: ${p.history.join(', ')} unidades. Projeção de outubro a dezembro: ${p.projection.join(', ')} unidades."><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5df00" stop-opacity=".25"/><stop offset="1" stop-color="#f5df00" stop-opacity="0"/></linearGradient></defs><rect x="200" y="14" width="104" height="97" rx="4" fill="#fffbe2"/>${[0,.5,1].map(t=>{const val=Math.round(max*t);return `<line x1="34" y1="${y(val)}" x2="304" y2="${y(val)}" stroke="#eceee6"/><text x="26" y="${y(val)+3}" text-anchor="end">${compact(val)}</text>`}).join('')}<path d="${hist} L${x(5)},111 L34,111 Z" fill="url(#chartFill)"/><path d="${hist}" fill="none" stroke="#20241a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${future}" fill="none" stroke="#a18c00" stroke-width="2.2" stroke-dasharray="4 4" stroke-linecap="round"/>${all.map((n,i)=>`<circle cx="${x(i)}" cy="${y(n)}" r="${i===5?3:2}" fill="${i>5?'#b5a000':'#20241a'}"/>`).join('')}${months.map((m,i)=>`<text x="${x(i)}" y="132" text-anchor="middle">${m}</text>`).join('')}</svg>`}
function positionPanel(){if(panel.hidden||!anchor)return;const r=anchor.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight,vw=document.documentElement.clientWidth,vh=window.visualViewport?.height||innerHeight,pad=12,gap=10;let left,top;if(vw>=740){left=r.right+gap;if(left+w>vw-pad)left=r.left-w-gap;top=r.top-h/2+r.height/2;if(left<pad){left=r.left;top=r.top-h-gap;}}else{left=r.left+r.width/2-w/2;top=r.top-h-gap;if(top<pad)top=r.bottom+gap;}left=Math.max(pad,Math.min(left,vw-w-pad));top=Math.max(pad,Math.min(top,vh-h-pad));panel.style.left=`${left}px`;panel.style.top=`${top}px`;}
function showPreview(button,keep=false){cancelTimers();const id=Number(button.dataset.product);if(activeId===id&&!panel.hidden){pinned=pinned||keep;return}if(anchor)anchor.setAttribute('aria-expanded','false');anchor=button;activeId=id;pinned=keep;const p=products.find(p=>p.id===id),avg=Math.round(p.projection.reduce((s,n)=>s+n,0)/3);panel.innerHTML=`<div class="preview-kicker">PROJEÇÃO ILUSTRATIVA DO ANÚNCIO</div><button class="preview-close" aria-label="Fechar prévia">×</button><h3 id="previewTitle">${p.short}</h3>${chart(p)}<div class="chart-key"><span><i></i> Histórico de vendas</span><span><i class="future"></i> Próximos 3 meses</span></div><div class="preview-stats"><div><span>Média mensal estimada</span><strong>${int(avg)} <small style="font-size:10px;font-weight:400">vendas</small></strong></div><div class="yellow"><span>Faturamento bruto mensal estimado</span><strong title="${money(avg*p.price)}">${revenueMoney(avg*p.price)}</strong></div></div><p class="preview-foot">Histórico e projeção simulados. Média de out–dez/2026.<br><b>Dados do anúncio concorrente.</b> Não são uma previsão das suas vendas.</p>`;panel.hidden=false;button.setAttribute('aria-expanded','true');positionPanel();}
function scheduleOpen(b){cancelTimers();if(pinned&&anchor!==b)closePreview();openTimer=setTimeout(()=>showPreview(b),250)}
function scheduleClose(){clearTimeout(openTimer);if(!pinned)closeTimer=setTimeout(()=>{if(!panel.matches(':hover')&&!panel.contains(document.activeElement)&&document.activeElement!==anchor)closePreview()},220)}
$('#grid').addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const b=e.target.closest('.analysis-btn');if(b&&!b.contains(e.relatedTarget))scheduleOpen(b)});
$('#grid').addEventListener('pointerout',e=>{const b=e.target.closest('.analysis-btn');if(b&&!b.contains(e.relatedTarget))scheduleClose()});
$('#grid').addEventListener('focusin',e=>{const b=e.target.closest('.analysis-btn');if(b&&!suppressFocus){cancelTimers();showPreview(b)}});
$('#grid').addEventListener('focusout',e=>{if(e.target.closest('.analysis-btn')&&!panel.contains(e.relatedTarget))scheduleClose()});
panel.addEventListener('pointerenter',()=>clearTimeout(closeTimer));panel.addEventListener('pointerleave',scheduleClose);panel.addEventListener('focusin',()=>clearTimeout(closeTimer));
panel.addEventListener('focusout',e=>{if(!panel.contains(e.relatedTarget)&&e.relatedTarget!==anchor)closePreview()});
panel.addEventListener('click',e=>{e.stopPropagation();if(e.target.closest('.preview-close'))closePreview(true)});
$('#grid').addEventListener('click',e=>{const b=e.target.closest('.analysis-btn');if(b){e.preventDefault();e.stopPropagation();showPreview(b,true);return}const link=e.target.closest('.product-link');if(link){e.preventDefault();state.scroll=scrollY;state.focusId=link.closest('.product-card').dataset.id;persist();history.pushState({novaiProduct:true},'',link.getAttribute('href'));route()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();closePreview(true)}});
document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!e.target.closest('.analysis-btn'))closePreview()});
window.addEventListener('resize',positionPanel);window.visualViewport?.addEventListener('resize',positionPanel);window.addEventListener('scroll',()=>{if(!panel.hidden){const r=anchor.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)closePreview();else positionPanel()}},{passive:true});

const fields=[['sale','Preço de venda','R$',null],['cost','Custo do produto','R$',null],['commission','Comissão','%',14],['fixed','Tarifa fixa','R$',6],['shipping','Frete do vendedor','R$',18],['tax','Imposto','%',6],['other','Outros custos por unidade','R$',3]];
let calculatorValues={};
function renderDetail(p){const v=calculatorValues[p.id]||{sale:p.price,cost:p.cost,commission:14,fixed:6,shipping:18,tax:6,other:3};calculatorValues[p.id]=v;$('#detailView').innerHTML=`<div class="detail-header"><div class="header wrap"><a href="/" class="brand" aria-label="Novai início"><img class="detail-brand-logo" src="/site-apresentacao/assets/brand/novai-on-yellow.svg" width="56" height="56" alt="Novai"></a><span class="nav-note">ANÚNCIO SIMULADO</span></div></div><div class="detail wrap"><button class="back" id="back">← <span>Voltar à demonstração</span></button><div class="breadcrumb">Mercado Livre <span> / </span> ${p.category} <span> / </span> Anúncio ${String(p.id).padStart(2,'0')}</div><div class="detail-layout"><article class="detail-product"><div class="detail-photo">${productMedia(p,true)}</div><div class="detail-info"><div class="store">NOVO · ${p.store.toUpperCase()} ${verified}</div><h1 tabindex="-1">${p.title}</h1><div class="rating"><span class="star">★</span> <b>${p.rating}</b> · ${int(p.reviews)} avaliações ilustrativas</div><p style="font-size:12px;line-height:1.7;color:#747570">${p.description}</p><div class="price">${priceHtml(p.price)}</div><div class="shipping">Frete grátis para o comprador</div>${metrics(p)}<dl class="product-facts"><div><dt>Características</dt><dd>${p.spec}</dd></div><div><dt>Condição</dt><dd>Novo · Estoque simulado</dd></div><div><dt>Vendido por</dt><dd>${p.store}</dd></div><div><dt>Garantia ilustrativa</dt><dd>90 dias</dd></div></dl></div></article><section class="calc" aria-labelledby="calcTitle"><div class="calc-brand"><span>↗</span> CALCULADORA NOVAI</div><h2 id="calcTitle">O que sobra por venda?</h2><p>Edite os valores para entender a margem<br>de contribuição de cada unidade.</p><div class="editable-note">Taxas e custos iniciais são exemplos editáveis.</div><form id="calculator" novalidate><div class="calc-fields">${fields.map(([key,label,unit],i)=>`<label class="calc-field ${i===6?'full':''}"><span>${label}${unit==='%'?' percentual':''}</span><div class="input-unit"><span>${unit}</span><input name="${key}" aria-label="${label}${unit==='%'?' percentual':''}" type="number" inputmode="decimal" min="0" ${unit==='%'?'max="100"':''} step="0.01" value="${v[key]}" required></div></label>`).join('')}</div><div class="calc-error" id="calcError" hidden role="status"></div><div class="calc-result" id="calcResult" aria-live="polite" aria-atomic="true"><div class="result-title">MARGEM DE CONTRIBUIÇÃO / UNIDADE</div><div class="result-numbers"><strong id="marginMoney"></strong><span id="marginPercent"></span></div><div class="result-cost"><span>Custos totais por unidade</span><b id="totalCosts"></b></div></div></form><p class="calc-foot">A margem de contribuição é o valor que sobra para cobrir despesas fixas e formar o resultado do negócio. Comissão e imposto são calculados sobre o preço de venda.</p><div class="formula">Preço − produto − comissão − tarifa − frete − imposto − outros custos.</div></section></div><p class="detail-disclaimer">Dados ilustrativos. Este anúncio é fictício e não permite compras. As taxas não representam uma tabela oficial do Mercado Livre.</p></div>`;$('#calculator').addEventListener('submit',e=>e.preventDefault());$('#calculator').addEventListener('input',()=>calculate(p.id));$('#back').addEventListener('click',goBack);calculate(p.id);}
function calculate(id){const form=$('#calculator'),v={};let valid=true;for(const [key,,unit]of fields){const el=form.elements[key],n=el.valueAsNumber,ok=Number.isFinite(n)&&n>=0&&(unit!=='%'||n<=100);v[key]=n;el.setAttribute('aria-invalid',String(!ok));if(!ok)valid=false}$('#calcError').hidden=valid;$('#calcError').textContent=valid?'':'Preencha valores a partir de zero e percentuais de 0 a 100.';if(!valid){$('#marginMoney').textContent='—';$('#marginPercent').textContent='—';$('#totalCosts').textContent='—';return}calculatorValues[id]=v;const costs=v.cost+v.sale*(v.commission+v.tax)/100+v.fixed+v.shipping+v.other,margin=v.sale-costs;$('#marginMoney').textContent=money(margin);$('#marginPercent').textContent=v.sale>0?`${(margin/v.sale*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`:'—';$('#totalCosts').textContent=money(costs);$('#calcResult').classList.toggle('negative',margin<0);}
function goBack(){if(history.state?.novaiProduct){history.back()}else{history.replaceState({},'','#demo');route(true)}}
function route(restore=false){closePreview();const match=location.hash.match(/^#anuncio\/(\d+)$/),p=match&&products.find(p=>p.id===Number(match[1]));const wasDetail=!$('#detailView').hidden;if(p){$('#listingView').hidden=true;$('#detailView').hidden=false;renderDetail(p);document.title=`${p.short} — Novai`;window.scrollTo({top:0,behavior:'instant'});$('#detailView h1').focus({preventScroll:true})}else{$('#listingView').hidden=false;$('#detailView').hidden=true;$('#detailView').innerHTML='';document.title='Novai — Decisões melhores começam nos dados.';if(wasDetail||restore){requestAnimationFrame(()=>{window.scrollTo({top:state.scroll||$('#demo').offsetTop,behavior:'instant'});if(state.focusId)$(`[data-id="${state.focusId}"] .product-title`)?.focus({preventScroll:true})});}else if(location.hash==='#demo'){requestAnimationFrame(()=>$('#demo').scrollIntoView())}}}
window.addEventListener('popstate',()=>route(true));
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#anuncio/')||!$('#detailView').hidden)route()});
renderProducts();route();
