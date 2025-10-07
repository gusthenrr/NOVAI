(function () {
    const NS = "[NOVAI/content]";
    // ---- estado ----
    let injected = false;
    let mo = null;
    let spaTimer = null;
  
    let lastVisitas = null;      // total de visitas agregado
    let lastConvRatio = null;    // vendidos / visitas (0..1)
    let lastPrice = null;        // preço atual
  
    let monthlySeries = null;         // série pronta (labels/visits/revenue)
    let monthlyFetchInFlight = false; // evita chamadas paralelas
    let monthlyFetched = false;       // garante fetch único por item/página
    let lastCreatedAt = null;

    let subtitleObs = null;          // NEW: observer do subtítulo
    let subtitlePatchLock = 0;
  
    const ROOT_ID = "novai-root";
    let lastUrl = location.href;

    // --- no topo do arquivo (perto das outras variáveis de estado)
let chartHoverCount = 0;
let chartCloseTimer = null;

// helpers
function openPanel(panel, card){
  clearTimeout(chartCloseTimer);
  ensureChartPortal(panel);

  if (!monthlySeries || monthlySeries.length === 0) {
    showChartPlaceholder(monthlyFetchInFlight ? "Carregando..." : "Sem dados ainda");
  } else {
    drawRevenueChart(monthlySeries);
  }
  placePanelNearCard(panel, card, "above");
  panel.style.display = "block";
}
function closePanelLater(panel, delay = 140){
  clearTimeout(chartCloseTimer);
  chartCloseTimer = setTimeout(() => {
    if (chartHoverCount <= 0) hidePanel(panel);
  }, delay);
}

  
    // ---- utils ----
    function nowUrlChanged() {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        return true;
      }
      return false;
    }
    const log = (...a) => console.log(NS, ...a);
    const warn = (...a) => console.warn(NS, ...a);
    const error = (...a) => console.error(NS, ...a);
  
    function resetPerPageState() {
      lastVisitas = null;
      lastConvRatio = null;
      lastPrice = null;
      monthlySeries = null;
      monthlyFetchInFlight = false;
      monthlyFetched = false;
    }
  
    function getItemIdFromUrl() {
  const { href, pathname } = window.location;

  // catálogo se a URL tiver /p/ no caminho
  const isCatalog = pathname.includes('/p/');
  
  // captura MLB123… ou MLB-123…, na ordem em que aparecem na URL
  const ids = [...href.matchAll(/MLB-?\d+/gi)]
    .map(m => m[0].replace(/-/g, '').toUpperCase()); // normaliza MLB-123 → MLB123

  log('getItemIdFromUrl', { href, pathname, isCatalog, ids });

  if (ids.length === 0) return null;

  // catálogo → 2º MLB; comum → 1º MLB (com fallback)
  return isCatalog ? (ids[1] || ids[0]) : ids[0];
}

function isCatalogPage() {
  // catálogo se o pathname tiver /p/
  return window.location.pathname.includes('/p/');
}

function findPdpContainer() {
  return (
    document.querySelector('.ui-pdp-container.ui-pdp-container--pdp') ||
    document.querySelector('main .ui-pdp-container--pdp') ||
    document.querySelector('.ui-vip-core .ui-pdp-container') ||
    null
  );
}

function restoreHostPosition(host) {
  if (host && host.dataset.novaiMadeRelative === '1') {
    host.style.position = host.dataset.novaiPrevPos || '';
    delete host.dataset.novaiPrevPos;
    delete host.dataset.novaiMadeRelative;
  }
}

function isCatalogLi(li){
  if (!li) return false;
  // Qualquer link do card com /p/ indica Catálogo
  return !!li.querySelector('a[href*="/p/"]');
}

function countCatalogInList(ol){
  if (!ol) return 0;
  let n = 0;
  for (const li of Array.from(ol.children)) {
    if (isCatalogLi(li)) n++;
  }
  return n;
}

function ensureCatalogChipInContainer() {
  const ID = 'novai-catalog-chip';
  const shouldShow = isCatalogPage();
  let chip = document.getElementById(ID);

  // se não for catálogo, remove e restaura host (se tivermos alterado)
  if (!shouldShow) {
    if (chip) {
      const host = chip.parentElement;
      chip.remove();
      restoreHostPosition(host);
    }
    return;
  }

  const host = findPdpContainer();
  if (!host) {
    // container ainda não montou; tenta de novo no próximo ensureUi
    if (chip) {
      const oldHost = chip.parentElement;
      chip.remove();
      restoreHostPosition(oldHost);
    }
    return;
  }

  // garante que o host seja referência de posicionamento
  const pos = getComputedStyle(host).position;
  if (pos === 'static') {
    host.dataset.novaiPrevPos = pos;      // "static"
    host.style.position = 'relative';
    host.dataset.novaiMadeRelative = '1';
  }

  // cria/move o chip
  if (!chip) {
    chip = document.createElement('div');
    chip.id = ID;
    chip.textContent = 'catalogo';
    Object.assign(chip.style, {
      position: 'absolute',
      top: '8px',
      left: '8px',
      zIndex: '1000',
      background: 'var(--novai-ml-yellow, #ffe600)',
      color: '#111',
      fontWeight: '700',
      fontSize: '12px',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '6px 10px',
      borderRadius: '9999px',
      border: '2px solid rgba(0,0,0,.12)',
      boxShadow: '0 6px 18px rgba(0,0,0,.20)',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    host.appendChild(chip);
  } else if (chip.parentElement !== host) {
    const oldHost = chip.parentElement;
    chip.remove();
    restoreHostPosition(oldHost);
    host.appendChild(chip);
  }
}
  
    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  
// ====== BUSCA/LISTA ======
const NOVAI_SEARCH_BAR_ID = 'novai-search-header';
let searchObs = null;
let classifiedCache = new Set(); // evita reclassificar os mesmos IDs

function isSearchListingPage() {
  // heurística: existe uma lista de itens de busca
  return !!findSearchOl();
}

function findSearchOl() {
  // lista padrão das páginas de busca
  return (
    document.querySelector('ol.ui-search-layout') ||
    document.querySelector('ol.ui-search-layout--stack') ||
    null
  );
}

function findSearchMain() {
  return (
    document.querySelector('main#root-app') ||
    document.querySelector('main[role="main"]#root-app') ||
    document.querySelector('main[role="main"]') ||
    document.querySelector('#root-app') ||
    null
  );
}

// mesma lógica do getItemIdFromUrl, mas para HREF arbitrário
function parseItemIdFromHref(href) {
  if (!href) return null;
  try {
    const u = new URL(href, location.origin);
    const isCatalog = u.pathname.includes('/p/');
    const ids = [...u.href.matchAll(/MLB-?\d+/gi)]
      .map(m => m[0].replace(/-/g, '').toUpperCase());
    if (ids.length === 0) return null;
    return isCatalog ? (ids[1] || ids[0]) : ids[0];
  } catch {
    return null;
  }
}

function collectSearchItems() {
  const ol = findSearchOl();
  if (!ol) return { items: [], total: 0 };

  const lis = Array.from(ol.children).filter(el => el.tagName === 'LI');
  const seen = new Set();
  const items = [];

  for (const li of lis) {
    const a =
      li.querySelector('h3 a[href]') ||
      li.querySelector('a[href*="/MLB"]') ||
      li.querySelector('a[href*="/p/"]') ||
      li.querySelector('a[href]');
    if (!a) continue;

    const url = a.getAttribute('href');
    const id = parseItemIdFromHref(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const isCatalog = /\/p\//.test(url);
    items.push({ url, itemId: id, catalog: isCatalog, li });
  }

  return { items, total: lis.length };
}

function findMlHeader() {
  return (
    document.querySelector('header.nav-header') ||
    document.querySelector('header[role="banner"].nav-header') ||
    document.querySelector('header.i-navigation-v2') ||
    document.querySelector('header[role="banner"]') ||
    null
  );
}


function ensureSearchBarSkeleton() {
  let bar = document.getElementById(NOVAI_SEARCH_BAR_ID);
  if (bar) return bar;

  ensureSearchListStyles();

  const header = findMlHeader();
  const main   = findSearchMain() || document.body;

  bar = document.createElement('div');
  bar.id = NOVAI_SEARCH_BAR_ID;
  // zera margem pra “colar”, e tira raio no topo pra não ficar espaço
  bar.style.margin = '0';
  bar.innerHTML = `
  <div class="nv-wrap"
       style="justify-content: space-evenly; margin:0; border-top-left-radius:0; border-top-right-radius:0;">
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content: space-evenly; width:100%;">
      <span class="nv-pill">🚚 <b>FULL:</b>&nbsp;<span id="novai-count-full">0</span></span>
      <span class="nv-pill">📣 <b>ADS:</b>&nbsp;<span id="novai-count-ads">0</span></span>
      <span class="nv-pill">🏷️ <b>CATÁLOGO:</b>&nbsp;<span id="novai-count-catalog">0</span></span>
      <span id="novai-competition-pill" class="nv-pill">
        🔥 <b>CONCORRÊNCIA:</b>&nbsp;<span id="novai-competition">—</span>
      </span>
    </div>
  </div>
`;


  if (header && header.parentElement) {
    // insere logo DEPOIS do header oficial
    header.parentElement.insertBefore(bar, header.nextSibling);
  } else {
    // fallback: ainda cola no topo do main
    if (main.firstChild) main.insertBefore(bar, main.firstChild);
    else main.appendChild(bar);
  }

  return bar;
}



function updateSearchBarCounts({ full = 0, ads = 0, catalog = 0, total = 0 }) {
  const elF = document.getElementById('novai-count-full');
  const elA = document.getElementById('novai-count-ads');
  const elC = document.getElementById('novai-count-catalog');
  const comp = document.getElementById('novai-competition');
  const compPill = document.getElementById('novai-competition-pill');

  if (elF) elF.textContent = String(full);
  if (elA) elA.textContent = String(ads);
  if (elC) elC.textContent = String(catalog);

  if (comp && compPill) {
    if (total > 25) {
      comp.textContent = 'Alta';
      compPill.style.background = 'var(--novai-ml-yellow,#ffe600)';
      compPill.style.color = '#111';
      compPill.style.borderColor = '#111';
      compPill.style.fontWeight = '900';
    } else {
      comp.textContent = '—';
      compPill.style.background = '#222';
      compPill.style.color = '#fff';
      compPill.style.borderColor = '#fff';
      compPill.style.fontWeight = '700';
    }
  }
}

function countAdsInList(ol){
  if (!ol) return 0;
  let n = 0;
  for (const li of Array.from(ol.children)) {
    if (isAdsInLi(li)) n++;
  }
  return n;
}

function isAdsInLi(li) {
  if (!li) return false;

  // seletores específicos do layout novo e variantes
  const selectors = [
    'a.poly-component__ads-promotion',
    '.poly-component__ads-promotion',
    '[data-testid="sponsored-label"]',
    '[aria-label="Patrocinado"]',
    '[aria-label*="patrocinad" i]',
    '[aria-label*="anúncio" i]',
    '[aria-label*="anuncio" i]',
    '.poly-component__sponsored',
    '.poly-component__ad',
    '.ui-search-item__ad-label',
    '.ui-search-item__ad-badge',
    '.ui-search-item__ad',
  ];
  if (li.querySelector(selectors.join(','))) return true;

  // link “oficial” para página de publicidade no footer
  const footer = li.querySelector('.poly-footer');
  if (footer && footer.querySelector('a[href*="publicidade.mercadolivre.com.br"]')) return true;

  // fallback por texto (sem acento)
  const scope = footer || li;
  const norm = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  const texts = Array.from(scope.querySelectorAll('a, span, small, div'))
    .map(el => norm(el.textContent));

  const hasBadge = texts.some(t =>
    (/\bpatrocinad[oa]s?\b/.test(t) || /\banuncio\b/.test(t)) &&
    !/\bnao\b.*\bpatrocinad[oa]s?\b/.test(t)
  );

  return hasBadge;
}

function getLiItemData(li){
  if (!li) return null;
  const a =
    li.querySelector('h3 a[href]') ||
    li.querySelector('a[href*="/MLB"]') ||
    li.querySelector('a[href*="/p/"]') ||
    li.querySelector('a[href]');
  if (!a) return null;

  // URL absoluta (evita problemas com URL relativa)
  const hrefRaw = a.getAttribute('href');
  const urlAbs = a.href || new URL(hrefRaw, location.origin).href;

  const itemId = parseItemIdFromHref(urlAbs);
  if (!itemId) return null;

  return { itemId, url: urlAbs };
}
// === IDs direto do <ol> ===
function getLiItemId(li){
  if (!li) return null;
  const a =
    li.querySelector('h3 a[href]') ||
    li.querySelector('a[href*="/MLB"]') ||
    li.querySelector('a[href*="/p/"]') ||
    li.querySelector('a[href]');
  if (!a) return null;
  return parseItemIdFromHref(a.getAttribute('href'));
}

function collectItemsFromOl(ol) {
  const items = [];
  if (!ol) return items;

  const lis = Array.from(ol.children).filter(el => el.tagName === 'LI');
  const seen = new Set();

  for (const li of lis) {
    const a =
      li.querySelector('h3 a[href]') ||
      li.querySelector('a[href*="/MLB"]') ||
      li.querySelector('a[href*="/p/"]') ||
      li.querySelector('a[href]');
    if (!a) continue;

    const href = a.getAttribute('href');
    const id = (href.match(/MLB-?\d+/i) || [])[0]?.replace(/-/g, '').toUpperCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    // normaliza URL absoluta
    let url;
    try { url = new URL(href, location.origin).href; } catch { url = href; }

    items.push({ itemId: id, url });
  }
  return items;
}


function collectItemIdsFromOl(ol){
  if (!ol) return [];
  const ids = [];
  const seen = new Set();
  for (const li of Array.from(ol.children)) {
    const id = getLiItemId(li);
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

// === normaliza resposta do BG '/scraping' => { [itemId]: { visits, sold, revenue, conversion, monthly:{labels, visits, revenues, quantities} } }
function normalizeBulkMetricsResponse(resp){
  const out = {};
  const src = resp?.data || resp?.items || resp || {};
  const asArray = Array.isArray(src) ? src : Object.entries(src).map(([k,v]) => ({ item_id: k, ...v }));

  for (const row of asArray) {
    const id = String(row.item_id || row.itemId || row.id || "").toUpperCase();
    if (!id) continue;

    const visits = Number(row.visits ?? row.visualizacoes ?? row.views ?? 0) || 0;
    const sold   = Number(row.sold ?? row.vendidos ?? row.quantity ?? 0) || 0;
    const rev    = Number(row.revenue ?? row.faturamento ?? 0) || 0;
    // row.conversion pode vir 0..1 (fração) ou 0..100 (%). Detecta e normaliza para %
    let conv = Number(row.conversion ?? row.conversao ?? 0) || 0;
    if (conv > 0 && conv <= 1) conv = conv * 100;

    const monthly = row.monthly || {
      labels:     row.labels || row.month_labels || [],
      visits:     row.month_visits || row.visits_month || [],
      revenues:   row.month_revenues || row.revenues_month || [],
      quantities: row.month_quantities || row.quantity_month || [],
    };

    out[id] = {
      visits, sold, revenue: rev, conversion: conv,
      monthly: {
        labels: Array.isArray(monthly.labels) ? monthly.labels : [],
        visits: Array.isArray(monthly.visits) ? monthly.visits.map(n=>Number(n)||0) : [],
        revenues: Array.isArray(monthly.revenues) ? monthly.revenues.map(n=>Number(n)||0) : [],
        quantities: Array.isArray(monthly.quantities) ? monthly.quantities.map(n=>Number(n)||0) : [],
      }
    };
  }
  return out;
}

// === cache mensal (24 meses) ===
const NOVAI_MONTHLY_CACHE = new Map(); // id -> { labels, visits, revenues, quantities }

// === barra de carregamento no header ===
function ensureLoadingBar(show) {
  let bar = document.getElementById('novai-loading-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'novai-loading-bar';
    Object.assign(bar.style, {
      position: 'fixed',
      top: '0', left: '0', width: '100%', height: '3px',
      background: '#111', zIndex: '2147483646', display: 'none'
    });
    const fill = document.createElement('div');
    fill.className = 'fill';
    Object.assign(fill.style, {
      width: '0%', height: '100%',
      background: 'var(--novai-ml-yellow,#ffe600)',
      transition: 'width .4s ease'
    });
    bar.appendChild(fill);
    document.body.appendChild(bar);
  }
  bar.style.display = show ? 'block' : 'none';
  const fill = bar.querySelector('.fill');
  if (show) {
    fill.style.width = '10%';
    setTimeout(() => (fill.style.width = '65%'), 100);
  } else {
    fill.style.width = '100%';
    setTimeout(() => { bar.style.display = 'none'; fill.style.width = '0%'; }, 350);
  }
}


// === strip de métricas no topo do card ===
function formatBR(n){ try{ return n.toLocaleString('pt-BR'); }catch{ return String(n) } }
function formatBRL(n){ try{ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n) }catch{ return `R$ ${n}` } }

function ensureMetricsStripInLi(li, summary){
  if (!li) return;
  let host = li.querySelector('.novai-metrics-strip');
  // garante li posicionável
  const cs = getComputedStyle(li);
  if (cs.position === 'static') {
    li.dataset.novaiPrevPos = 'static';
    li.style.position = 'relative';
  }
  if (!host) {
    host = document.createElement('div');
    host.className = 'novai-metrics-strip';
    li.appendChild(host);
  }
  const { visits=0, sold=0, revenue=0, conversion=0 } = summary || {};
  host.innerHTML = `
    <span title="Visualizações">👁️ <b>${formatBR(visits)}</b></span>
    <span title="Vendidos">🛒 <b>${formatBR(sold)}</b></span>
    <span title="Faturamento">💰 <b>${formatBRL(revenue)}</b></span>
    <span title="Conversão">📈 <b>${(Number(conversion)||0).toFixed(2)}%</b></span>
  `;
}

function applyBulkMetricsToList(ol, map){
  if (!ol || !map) return;
  for (const li of Array.from(ol.children)) {
    const id = getLiItemId(li);
    if (!id) continue;
    const m = map[id];
    if (!m) continue;

    // pinta o card
    ensureMetricsStripInLi(li, m);

    // guarda os 24 meses (se vier menos, armazena o que tiver)
    if (m.monthly) NOVAI_MONTHLY_CACHE.set(id, {
      labels: m.monthly.labels || [],
      visits: m.monthly.visits || [],
      revenues: m.monthly.revenues || [],
      quantities: m.monthly.quantities || [],
    });
  }
}


function wireSearchBarButton() { 
  const btn = document.getElementById('novai-btn-buscar-metricas');
  if (!btn) return;

  btn.onclick = () => {
    const ol = findSearchOl();
    const list = collectItemsFromOl(ol);       // [{ itemId, url }]
    if (!list.length) return;

    // payload no formato que o backend /scraping espera
    const items = list.map(x => ({ item_id: x.itemId, url: x.url }));
    const ids   = list.map(x => x.itemId);

    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Buscando...';
    ensureLoadingBar(true);

    chrome.runtime.sendMessage(
      { type: 'GET_SEARCH_METRICS_BULK', items, itemIds: ids },
      (resp) => {
        btn.disabled = false;
        ensureLoadingBar(false);

        if (resp?.ok) {
          const map = normalizeBulkMetricsResponse(resp.data ?? resp);
          applyBulkMetricsToList(ol, map);

          btn.textContent = 'Métricas aplicadas ✔';
          setTimeout(() => (btn.textContent = orig), 1800);
        } else {
          btn.textContent = 'Tentar novamente';
          setTimeout(() => (btn.textContent = orig), 1800);
          console.error('[NOVAI] bulk metrics error:', resp?.error);
        }
      }
    );
  };
}




function ensureSearchActionsRow(items) {
  const ol = findSearchOl();
  if (!ol) return;

  let row = document.getElementById('novai-actions-row');
  if (!row) {
    row = document.createElement('div');
    row.id = 'novai-actions-row';
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-start'; // botão à esquerda
    row.style.margin = '8px 0 14px';
    row.innerHTML = `
      <button id="novai-btn-buscar-metricas" class="nv-btn">
        Ativar Métricas de Busca
      </button>
    `;
    ol.parentElement.insertBefore(row, ol);
  }
  wireSearchBarButton(items);
}

function isFullInLi(li) {
  if (!li) return false;

  // seletores comuns do badge/ícone FULL (layout novo e antigo)
  const selectors = [
    'svg[aria-label="FULL"]',
    '[aria-label="FULL"]',
    '[aria-label*="full" i]',
    'use[href="#poly_full"]',
    '[data-testid*="full" i]',
    '.ui-search-item__full',                 // legacy
    '.ui-search-item__shipping--full',       // legacy
    '.poly-component__shipping svg[aria-label="FULL"]',
    '.poly-component__shipping [aria-label*="full" i]',
  ];
  if (li.querySelector(selectors.join(','))) return true;

  // checa as áreas onde o texto "Enviado pelo FULL" costuma aparecer
  const scopes = [
    '.poly-component__shipping',
    '.poly-component__shipped-from',
    '.ui-search-item__shipping',
    '.ui-search-item__group__element',
    '.poly-content', '.poly-footer', '.ui-search-result__content'
  ];

  const norm = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  for (const sel of scopes) {
    const el = li.querySelector(sel);
    if (!el) continue;
    const t = norm(el.textContent);
    // pega "enviado pelo full", "full" isolado etc. (evita falso positivo tipo "perfil")
    if (/\benviado pelo\b.*\bfull\b/.test(t) || /\bfull\b/.test(t)) return true;
  }

  return false;
}


function ensureSearchListStyles() {
  if (document.getElementById('novai-search-styles')) return;
  const st = document.createElement('style');
  st.id = 'novai-search-styles';
  st.textContent = `
    /* ===== Header NOVAI (preto + amarelo) ===== */
    #${NOVAI_SEARCH_BAR_ID} .nv-wrap{
      background:#111; color:#fff; border:1px solid #fff;
      display:flex; align-items:center; gap:16px;
      padding:10px 14px; border-radius:10px; margin:12px 0 8px 0;
      box-shadow:0 8px 22px rgba(0,0,0,.25);
    }
    #${NOVAI_SEARCH_BAR_ID} .nv-title{ font:800 13px/1 system-ui,-apple-system,Segoe UI,Roboto; letter-spacing:.04em; text-transform:uppercase; color:#ffe600 }
    #${NOVAI_SEARCH_BAR_ID} .nv-pill{
      display:inline-flex; align-items:center; gap:6px;
      background:#222; border:1px solid #fff; color:#fff;
      padding:6px 10px; border-radius:9999px; font-weight:700; font-size:12px;
    }
    #${NOVAI_SEARCH_BAR_ID} .nv-pill b{ letter-spacing:.02em }

    /* Row do botão (fora do header) */
    #novai-actions-row{
      display:flex; justify-content:flex-end; margin:8px 0 14px;
    }
    #novai-actions-row .nv-btn{
      background:var(--novai-ml-yellow,#ffe600); color:#111; font-weight:900;
      padding:8px 12px; border-radius:10px; border:1px solid #111; cursor:pointer;
    }

    /* ===== Grid 3 colunas ===== */
    ol.ui-search-layout.novai-three-col{
      display:grid !important;
      grid-template-columns: repeat(3, minmax(0,1fr)) !important;
      gap:16px !important;
    }
    @media (max-width: 1200px){
      ol.ui-search-layout.novai-three-col{ grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    }
    @media (max-width: 720px){
      ol.ui-search-layout.novai-three-col{ grid-template-columns: 1fr !important; }
    }
    ol.ui-search-layout.novai-three-col > li{
      list-style:none !important;
      position:relative !important;
      min-height: 100%;
    }

    /* ===== Reorganiza card: imagem em cima, info embaixo ===== */
    /* Poly card (layout novo do ML) */
    .novai-card-tuned .poly-card{ 
      display:flex !important; flex-direction:column !important; 
      height:100%; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fff;
    }
    .novai-card-tuned .poly-card__portada, 
    .novai-card-tuned .poly-card__portada *{
      width:100% !important;
    }
    .novai-card-tuned .poly-card__portada{
      aspect-ratio:1/1; display:block; background:#fff; 
    }
    .novai-card-tuned .poly-card__portada img{
      width:100% !important; height:100% !important; object-fit:contain !important;
      display:block; background:#fff;
    }
    .novai-card-tuned .poly-card__content{ 
      order:2; padding:10px 12px; display:flex; flex-direction:column; gap:8px;
      flex:1 1 auto;
    }
    .novai-card-tuned h3, 
    .novai-card-tuned .poly-component__title-wrapper, 
    .novai-card-tuned .poly-component__title{
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      margin:0; font-weight:700;
    }

    /* Layout antigo (fallback) */
    .novai-card-tuned .ui-search-result__wrapper{
      display:flex !important; flex-direction:column !important; height:100%;
      border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fff;
    }
    .novai-card-tuned .ui-search-result__image{
      aspect-ratio:1/1; width:100%; background:#fff;
    }
    .novai-card-tuned .ui-search-result__image img,
    .novai-card-tuned .ui-search-result-image__element{
      width:100% !important; height:100% !important; object-fit:contain !important; background:#fff;
    }
    .novai-card-tuned .ui-search-result__content{
      padding:10px 12px; display:flex; flex-direction:column; gap:8px; flex:1 1 auto;
    }
    .novai-card-tuned .ui-search-item__title{ 
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; 
      margin:0; font-weight:700;
    }

    /* Badge "catalogo" no card */
    .novai-catalog-badge{
      position:absolute; top:8px; left:8px; z-index:9;
      background:var(--novai-ml-yellow,#ffe600); color:#111;
      border:1px solid #111; border-radius:9999px;
      padding:2px 8px; font:800 11px/1.2 system-ui,-apple-system,Segoe UI,Roboto;
      text-transform:uppercase; letter-spacing:.04em; pointer-events:none;
    }
    .novai-catalog-badge::before{
      content:''; width:6px; height:6px; border-radius:9999px;
      background:#111; display:inline-block; margin-right:6px; vertical-align:middle;
    }
  `;
  document.head.appendChild(st);
}

function countFullInList(ol){
  if (!ol) return 0;
  let n = 0;
  for (const li of Array.from(ol.children)) {
    if (isFullInLi(li)) n++;
  }
  return n;
}

function ensureCatalogBadgesFromOl(ol){
  if (!ol) return;
  for (const li of Array.from(ol.children)) {
    const isCat = isCatalogLi(li);
    let badge = li.querySelector('.novai-catalog-badge');

    if (isCat) {
      // garante contexto de posicionamento
      const cs = getComputedStyle(li);
      if (cs.position === 'static') {
        li.dataset.novaiPrevPos = 'static';
        li.style.position = 'relative';
      }
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'novai-catalog-badge';
        badge.textContent = 'catalogo';
        li.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
      if (li.dataset.novaiPrevPos) {
        li.style.position = li.dataset.novaiPrevPos || '';
        delete li.dataset.novaiPrevPos;
      }
    }
  }
}

async function ensureSearchHeader() {
  if (!isSearchListingPage()) {
    const bar = document.getElementById(NOVAI_SEARCH_BAR_ID);
    if (bar) bar.remove();
    const row = document.getElementById('novai-actions-row');
    if (row) row.remove();
    if (searchObs) { searchObs.disconnect(); searchObs = null; }
    return;
  }

  ensureSearchBarSkeleton();

  const { items, total } = collectSearchItems(); // mantém p/ botão/ids
  const ol = findSearchOl();

  // NOVO: badges/contagem de catálogo baseados no <ol>
  ensureCatalogBadgesFromOl(ol);
  ensureSearchActionsRow(items);

  const catalogLocal = countCatalogInList(ol);
  const fullLocal    = countFullInList(ol);
  const adsLocal     = countAdsInList(ol);

  updateSearchBarCounts({ full: fullLocal, ads: adsLocal, catalog: catalogLocal, total });

  if (ol && !searchObs) {
    searchObs = new MutationObserver(() => ensureSearchHeader());
    searchObs.observe(ol, { childList: true, subtree: false });
  }
}




    // ---- preço ----
    function getPriceFromDom() {
      const a = document.querySelector('[data-testid="price-amount"]');
      if (a) {
        const raw = a.textContent.trim().replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
        const n = parseFloat(raw);
        if (!Number.isNaN(n)) return n;
      }
  
      const frac = document.querySelector(".price-tag-fraction");
      const cents = document.querySelector(".price-tag-cents");
      if (frac) {
        const f = (frac.textContent || "").replace(/[^\d]/g, "");
        const c = ((cents?.textContent || "").replace(/[^\d]/g, "") || "00").padStart(2, "0");
        const n = parseFloat(`${f}.${c}`);
        if (!Number.isNaN(n)) return n;
      }
  
      const itemprop = document.querySelector('[itemprop="price"]');
      if (itemprop) {
        const rawAttr = itemprop.getAttribute("content");
        if (rawAttr) {
          const v = parseFloat(rawAttr.replace(",", "."));
          if (!Number.isNaN(v)) return v;
        }
        const rawTxt = itemprop.textContent?.trim();
        if (rawTxt) {
          const v2 = parseFloat(rawTxt.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
          if (!Number.isNaN(v2)) return v2;
        }
      }
      return null;
    }
  
    function observePriceArea() {
      const priceArea =
        document.querySelector("#price") ||
        document.querySelector('[data-testid="price-amount"]') ||
        document.querySelector(".ui-pdp-price__second-line");
      if (!priceArea) return;
  
      const obs = new MutationObserver(() => updateFaturamentoCard());
      obs.observe(priceArea, { childList: true, subtree: true, characterData: true });
    }
  
    // ---- vendidos ----
    function getSoldFromDom() {
      const subtitle = document.querySelector(".ui-pdp-header__subtitle, .ui-pdp-subtitle");
      const txt  = (subtitle?.textContent || "").trim();
      const aria = (subtitle?.getAttribute("aria-label") || "").trim();
  
      const n = parseSoldFromText(aria) ?? parseSoldFromText(txt);
      if (Number.isFinite(n) && n > 0) return n;
  
      for (const node of document.querySelectorAll("span, small, div, p")) {
        const v = parseSoldFromText(node.textContent || "");
        if (Number.isFinite(v) && v > 0) return v;
      }
      return null;
    }
  
    function parseSoldFromText(str) {
      if (!str) return null;
      const re = /(?:mais\s+de\s+)?\+?\s*([\d.,]+)\s*(mil(?:h(?:ão|oes))?|milhões?|k|m)?\s*vendid[oa]s/i;
      const m = str.match(re);
      if (!m) return null;
  
      let base = m[1].replace(/\./g, "").replace(",", ".");
      let num = parseFloat(base);
      if (!Number.isFinite(num)) return null;
  
      const suf = (m[2] || "").toLowerCase();
      if (suf.startsWith("milh") || suf === "m") num *= 1_000_000;
      else if (suf.startsWith("mil") || suf === "k") num *= 1_000;
  
      return Math.round(num);
    }
  
    // ---- cards ----
    function updateFaturamentoCard() {
      const el = document.querySelector("#novai-faturamento");
      if (!el) return;
  
      const preco = getPriceFromDom();
      if (preco != null) lastPrice = preco;
  
      const vendidos = getSoldFromDom();
      const visitas = Number(lastVisitas) || 0;
      if (vendidos && visitas > 0) lastConvRatio = vendidos / visitas;
  
      if (preco != null && vendidos != null) {
        const fat = preco * vendidos;
        el.textContent = brl.format(isFinite(fat) ? fat : 0);
        el.title = `Preço: ${brl.format(preco)} × Vendidos: ${vendidos}`;
      } else {
        el.textContent = "—";
        el.title = `Preço: ${preco ?? "?"} | Vendidos: ${vendidos ?? "?"}`;
      }
    }
  
    function updateConversionCard() {
      const el = document.querySelector("#novai-conversao");
      if (!el) return;
  
      const vendidos = getSoldFromDom();
      const visitas = Number(lastVisitas);
      if (vendidos != null && visitas > 0) {
        el.textContent = ((vendidos / visitas) * 100).toFixed(2) + "%";
        el.title = `Vendidos: ${vendidos} • Visitas: ${visitas}`;
      } else {
        el.textContent = "—";
        el.title = `Vendidos: ${vendidos ?? "?"} • Visitas: ${isNaN(visitas) ? "?" : visitas}`;
      }
    }
  
    function observeSubtitleArea() {
  const container = document.querySelector(".ui-pdp-header__subtitle");
  if (!container) return;

  // evita múltiplos observers
  if (subtitleObs) subtitleObs.disconnect();

  subtitleObs = new MutationObserver((mutations) => {
    // se a mudança foi causada por nós, ignora
    if (subtitlePatchLock > 0) return;

    // se removerem/alterarem nosso conteúdo, reaplica
    const hasNovai = !!container.querySelector(".novai-subtitle");
    if (!hasNovai) {
      renderCustomSubtitle(lastCreatedAt);
    } else {
      // mesmo com nosso conteúdo, revalida quando mudar o "vendidos"
      renderCustomSubtitle(lastCreatedAt);
    }
  });

  subtitleObs.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}


  
    // ---- gráfico ----
    function showChartPlaceholder(text) {
        const svg = document.querySelector("#novai-chart");
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      
        const W = svg.viewBox.baseVal.width || 400;
        const H = svg.viewBox.baseVal.height || 180;
      
        // fundo escuro
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", 0); bg.setAttribute("y", 0);
        bg.setAttribute("width", W); bg.setAttribute("height", H);
        bg.setAttribute("fill", "#111");
        bg.setAttribute("pointer-events", "none");
        svg.appendChild(bg);
      
        // texto central
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", W / 2);
        t.setAttribute("y", H / 2);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "middle");
        t.setAttribute("fill", "#9ca3af");
        t.setAttribute("font-size", "12");
        t.setAttribute("pointer-events", "none");
        t.textContent = text || "Sem dados";
        svg.appendChild(t);
      }
  
      function drawRevenueChart(series) {
        const panel = document.querySelector("#novai-chart-panel");
        const svg = document.querySelector("#novai-chart");
        if (!panel || !svg || !Array.isArray(series) || series.length === 0) {
          showChartPlaceholder("Sem dados");
          return;
        }
      
        // limpa
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      
        const tip = ensureChartTip(panel);
      
        const W = svg.viewBox.baseVal.width || 400;
        const H = svg.viewBox.baseVal.height || 180;
        const PADL = 34, PADR = 10, PADT = 8, PADB = 24;
        const innerW = W - PADL - PADR;
        const innerH = H - PADT - PADB;
      
        const labels = series.map(d => d.label);
        const values = series.map(d => Math.max(0, Number(d.revenue) || 0));
        const visits = series.map(d => Math.max(0, Number(d.visits) || 0));
        const qty = series.map(d => Math.max(0, Number(d.quantity) || 0));

        const maxV = Math.max(...values, 1);
      
        const x = (i) => PADL + (i * innerW) / Math.max(series.length - 1, 1);
        const y = (v) => PADT + innerH - (v / maxV) * innerH;
      
        // fundo escuro
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", 0); bg.setAttribute("y", 0);
        bg.setAttribute("width", W); bg.setAttribute("height", H);
        bg.setAttribute("fill", "#111");
        bg.setAttribute("pointer-events", "none");
        svg.appendChild(bg);
      
        // grade (amarela, 4 linhas)
        [0.25, 0.5, 0.75, 1].forEach(frac => {
          const yv = PADT + innerH * (1 - frac);
          const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
          ln.setAttribute("x1", PADL); ln.setAttribute("x2", PADL + innerW);
          ln.setAttribute("y1", yv);   ln.setAttribute("y2", yv);
          ln.setAttribute("stroke", "var(--novai-ml-yellow, #ffe600)");
          ln.setAttribute("stroke-opacity", "0.35");
          ln.setAttribute("stroke-width", "1");
          ln.setAttribute("pointer-events", "none");
          svg.appendChild(ln);
      
          const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
          txt.setAttribute("x", 6); txt.setAttribute("y", yv + 4);
          txt.setAttribute("fill", "#d1d5db");
          txt.setAttribute("font-size", "10");
          txt.setAttribute("pointer-events", "none");
          txt.textContent = brl.format(maxV * frac);
          svg.appendChild(txt);
        });
      
        // linha da série
        const path = document.createElementNS("http://www.w3.org/2000/svg","path");
        const d = values.map((v,i) => (i===0?`M ${x(i)},${y(v)}`:`L ${x(i)},${y(v)}`)).join(" ");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "var(--novai-ml-yellow, #ffe600)");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("pointer-events", "none"); // não bloquear os pontos
        svg.appendChild(path);
      
        // labels eixo X (MM/AA) – ~6 rótulos
        const step = Math.ceil(series.length / 6);
        series.forEach((pnt, i) => {
          if (i % step !== 0 && i !== series.length - 1) return;
          const tx = document.createElementNS("http://www.w3.org/2000/svg","text");
          tx.setAttribute("x", x(i));
          tx.setAttribute("y", PADT + innerH + 14);
          tx.setAttribute("text-anchor", "middle");
          tx.setAttribute("fill", "#d1d5db");
          tx.setAttribute("font-size", "10");
          tx.setAttribute("pointer-events", "none");
          const mm = (pnt.label || "").slice(5,7);
          const yy = (pnt.label || "").slice(2,4);
          tx.textContent = `${mm}/${yy}`;
          svg.appendChild(tx);
        });
      
        // helpers para tooltip
        const panelRect = () => panel.getBoundingClientRect();
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      
        function showTip(i, clientX, clientY) {
          const rect = panelRect();
          const label = labels[i] || "";
          const val = values[i] || 0;
          const vis = visits[i] || 0;
          const q   = qty[i]     || 0;
      
          tip.innerHTML = `
            <div style="font-weight:700">${label}</div>
            <div>${brl.format(val)}</div>
            <div>Quantidade vendida: ${q.toLocaleString('pt-BR')}</div>
            <div style="opacity:.8">Visitas: ${vis.toLocaleString('pt-BR')}</div>
          `;
      
          // posiciona próximo ao cursor
          const pad = 10;
          let left = clientX - rect.left + pad;
          let top  = clientY - rect.top  - 28;
      
          // clampa dentro do painel
          const tipRect = tip.getBoundingClientRect(); // pode ser 0 na 1ª vez, reposiciona no próximo mousemove
          const maxL = rect.width - (tipRect.width || 160) - pad;
          const maxT = rect.height - (tipRect.height || 50) - pad;
          left = clamp(left, pad, maxL);
          top  = clamp(top,  pad, maxT);
      
          tip.style.transform = `translate(${left}px, ${top}px)`;
          tip.style.opacity = "1";
        }

        function hideTip() {
          tip.style.opacity = "0";
          tip.style.transform = "translate(-9999px,-9999px)";
        }
      
        // pontos com listeners
        series.forEach((pnt, i) => {
          const cx = x(i), cy = y(values[i]);
          const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
          c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", "4");
          c.setAttribute("fill", "var(--novai-ml-yellow, #ffe600)");
          c.style.cursor = "default";
          c.style.pointerEvents = "all"; // garante hover nos pontos
          c.addEventListener("mouseenter", (ev) => {
            showTip(i, ev.clientX, ev.clientY);
          });
          c.addEventListener("mousemove", (ev) => {
            showTip(i, ev.clientX, ev.clientY);
          });
          c.addEventListener("mouseleave", () => {
            hideTip();
          });
          svg.appendChild(c);
        });
      }
  
    function triggerMonthlyFetchOnce(itemId) {
      if (monthlyFetched || monthlyFetchInFlight) return;
      monthlyFetchInFlight = true;
  
      const price = lastPrice ?? getPriceFromDom() ?? 0;
      const conv = lastConvRatio ?? (() => {
        const v = getSoldFromDom(), vs = Number(lastVisitas)||0;
        return (v && vs>0) ? v/vs : 0;
      })();
  
      fetchMonthlyFromBG(itemId, price, conv)
  .then(({ labels, visits, revenues, createdAt, quantityMonths }) => {
    if (createdAt != null) {
      lastCreatedAt = createdAt;
      renderCustomSubtitle(createdAt);
    }
    monthlySeries = labels.map((label, i) => ({
      label,
      visits:   Number(visits[i]) || 0,
      revenue:  Number(revenues[i]) || 0,
      quantity: Number(quantityMonths?.[i]) || 0, // << AQUI
    }));

    monthlyFetched = true;
    log("[chart] monthly series pronta:", monthlySeries.length, "pontos");
  })
  .catch(err => warn("[chart] falha no fetch mensal:", err))
  .finally(() => { monthlyFetchInFlight = false; });

    }
  
    function fetchMonthlyFromBG(itemId, price, convRatio) {
  const conversionPct = (Number(convRatio) || 0) * 100; // backend espera %
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "GET_VISITS_MONTHLY", itemId, conversion: conversionPct, price },
      (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!response || !response.ok) return reject(response?.error || "falha");

        const data = response.data || {};
        // atualiza a data (troca "--" por "X dias")
        lastCreatedAt = data.createdAt ?? null;
        renderCustomSubtitle(lastCreatedAt);

        resolve(data); // { labels, visits, revenues, createdAt }
      }
    );
  });
}


    function parseCreatedAt(createdAt) {
  if (!createdAt) return null;
  let d = null;
  if (typeof createdAt === "number") d = new Date(createdAt);
  if (!d || isNaN(d.getTime())) d = new Date(String(createdAt));
  if (isNaN(d.getTime())) {
    const s = String(createdAt).slice(0,10).split("-");
    if (s.length === 3) d = new Date(+s[0], +s[1]-1, +s[2]);
  }
  return isNaN(d.getTime()) ? null : d;
}


function daysSince(dateObj) {
  const ms = Date.now() - dateObj.getTime();
  return Math.max(0, Math.floor(ms / (1000*60*60*24)));
}

function extractSoldTextFromNativeSubtitle() {
  const el = document.querySelector(".ui-pdp-header__subtitle .ui-pdp-subtitle");
  if (!el) return null;
  const src = el.getAttribute("aria-label") || el.textContent || "";
  // pega a parte que contém "vendid" (vendido/vendidos)
  const part = src.split("|").map(s => s.trim()).find(s => /vendid/i.test(s));
  return part || null; // ex.: "+750 mil vendidos"
}

/** Substitui o conteúdo do subtítulo por algo personalizado */
function renderCustomSubtitle(createdAtRaw) {
  try {
    const host =
      document.querySelector(".ui-pdp-header__subtitle .ui-pdp-subtitle") ||
      document.querySelector(".ui-pdp-header__subtitle"); // fallback
    if (!host) return;

    // --- CreatedAt
    const created = parseCreatedAt(createdAtRaw);
    let createdFrag = `
      <span class="novai-pill" title="Criado em —">Criado há --</span>`;
    if (created) {
      const d = daysSince(created);
      const label = d === 0 ? "hoje" : `${d} ${d === 1 ? "dia" : "dias"}`;
      createdFrag = `
        <span class="novai-pill" title="Criado em ${created.toLocaleDateString('pt-BR')}">
          Criado há ${label}
        </span>`;
        const el = document.querySelector("#novai-dias");
  if (el) {
    el.textContent = `últimos ${d} dias`;
    el.title = `Desde ${created.toLocaleDateString('pt-BR')}`;
  }
} else {
  // sem data
  const el = document.querySelector("#novai-dias");
  if (el) {
    el.textContent = "—";
    el.title = "Sem informação de criação";
  }
}

    // --- Vendidos (sempre tentamos mostrar)
    const nativeSold = extractSoldTextFromNativeSubtitle() || "";
    let soldFrag = "";
if (nativeSold) {
  // normaliza o texto nativo (remove "|" e pontos depois de "Novo")
  let raw = nativeSold.replace(/\s*\|\s*/g, " ").replace(/\s{2,}/g, " ").trim();

  // detecta se contém "Novo"
  const hasNovo = /^novo\b/i.test(raw);

  // extrai/ajusta a parte da contagem de vendidos
  let count = raw
    .replace(/^novo[.\s]*/i, "")       // tira "Novo" do começo
    .replace(/^\+/, "Mais de ")        // "+750 mil vendidos" -> "Mais de 750 mil vendidos"
    .replace(/^mais\s+de\s*/i, "Mais de ")
    .trim();

  // garante que começa com "Mais de "
  if (!/^Mais de /i.test(count)) {
    count = "Mais de " + count;
  }
  // garante sufixo "vendidos"
  if (!/vendid[oa]s$/i.test(count)) {
    count = count.replace(/\.*$/, "") + " vendidos";
  }

  const line1 = hasNovo ? "Novo" : "";
  const line2 = count;

  // quebra de linha entre as duas partes
  const labelHtml = [line1, line2].filter(Boolean).join("<br>");

  soldFrag = `
    <span class="novai-pill" title="${count.replace(/"/g, "&quot;")}">
      ${labelHtml}
    </span>`;
}

    const dot = createdFrag && soldFrag ? `<span class="novai-dot">•</span>` : "";
    const nextHTML = `<span class="novai-subtitle">${createdFrag}${dot}${soldFrag}</span>`;

    // Só escreve se mudou (evita loop do MutationObserver)
    if (host.dataset.novaiHtml !== nextHTML) {
      host.dataset.novaiHtml = nextHTML;
      host.innerHTML = nextHTML;
    }
  } catch (e) {
    console.warn("[NOVAI] renderCustomSubtitle error:", e);
  }
}




    // ---- UI ----
    function insertUi(itemId) {
      if (document.getElementById(ROOT_ID)) return;
  
      const anchor =
        document.querySelector(".ui-pdp-header__title-container") ||
        document.querySelector("#price") ||
        document.querySelector(".ui-pdp-container__row");
      if (!anchor || !anchor.parentElement) return;
  
      const block = document.createElement("div");
      block.id = ROOT_ID;
      block.className = "novai-kpi-block";
      block.innerHTML = `
        <div class="novai-kpi-grid">
          <div class="novai-kpi-card big" id="novai-fat-card" style="position:relative;">
            <div class="novai-kpi-head">
              <div class="novai-kpi-icon">💰</div>
              <div class="novai-kpi-title">FATURAMENTO</div>
            </div>
            <div id="novai-faturamento" class="novai-kpi-value">--</div>
            <div class="novai-kpi-sub">
              <span id="novai-dias" class="novai-muted">--</span>
            </div>
            <div id="novai-chart-panel" style="
                position:absolute; inset:auto 0 100% auto;
                width:420px; height:240px; transform:translateY(-8px);
                background:#111; border:1px solid #fff; border-radius:12px;
                box-shadow:0 10px 25px rgba(0,0,0,.12);
                padding:10px 12px; display:none; z-index:99999;">
            <div class="novai-chart-head">
                <span class="novai-chart-title">Faturamento mensal e quantidade vendidas (estimadas)</span>
            </div>
            <svg id="novai-chart" viewBox="0 0 400 180" width="100%" height="180" role="img" aria-label="Gráfico de faturamento"></svg>
            <!-- tooltip HTML absoluto (criado por JS se não existir) -->
            </div>
          </div>
          <div class="novai-kpi-card">
            <div class="novai-kpi-head"><div class="novai-kpi-icon">👁️</div><div class="novai-kpi-title">VISUALIZAÇÕES</div></div>
            <div id="novai-visitas" class="novai-kpi-value">--</div>
          </div>
          <div class="novai-kpi-card">
            <div class="novai-kpi-head"><div class="novai-kpi-icon">📈</div><div class="novai-kpi-title">CONVERSÃO</div></div>
            <div id="novai-conversao" class="novai-kpi-value">--</div>
          </div>
        </div>`;
  
      anchor.parentElement.insertBefore(block, anchor.nextSibling);
  
      // hover do gráfico (NÃO faz fetch aqui)
      const fatCard = block.querySelector("#novai-fat-card");
      const panel = block.querySelector("#novai-chart-panel");
      fatCard.addEventListener("mouseenter", () => {
  chartHoverCount++;
  openPanel(panel, fatCard);
});
fatCard.addEventListener("mouseleave", () => {
  chartHoverCount = Math.max(0, chartHoverCount - 1);
  closePanelLater(panel);
});

// conta hover no próprio painel (para não fechar ao passar o mouse nele)
panel.addEventListener("mouseenter", () => {
  chartHoverCount++;
  // já está aberto/posicionado, mas garantimos
  panel.style.display = "block";
});
panel.addEventListener("mouseleave", () => {
  chartHoverCount = Math.max(0, chartHoverCount - 1);
  closePanelLater(panel);
});
  
      injected = true;
  
      // GET_VISITS → total agregado dentro de data.itemId
      chrome.runtime.sendMessage({ type: "GET_VISITS", itemId }, (response) => {
        if (!response?.ok) {
          warn("GET_VISITS falhou:", response?.error);
          return;
        }
  
        // formatos aceitos:
        // { itemId: 2395 }   (principal)
        // { [MLB...]: 2395 } (fallback)
        // { itemId: "2395" }
        let totalRaw = response.data?.itemId ?? response.data?.[itemId] ?? response.data;
        if (typeof totalRaw === "object" && totalRaw !== null) {
          // futuro: { total_visits: 2395 } etc.
          totalRaw = totalRaw.total_visits ?? totalRaw.total ?? totalRaw.visits ?? totalRaw.value ?? 0;
        }
        const totalVisitas = Number(totalRaw) || 0;
        log("[GET_VISITS] total:", totalVisitas);
  
        const el = document.querySelector("#novai-visitas");
        if (el) el.textContent = totalVisitas.toLocaleString("pt-BR");
        lastVisitas = totalVisitas;
  
        updateFaturamentoCard();
        updateConversionCard();
        observePriceArea();
        observeSubtitleArea();
        renderCustomSubtitle(lastCreatedAt); 
  
        // fetch mensal UMA vez por item
        triggerMonthlyFetchOnce(itemId);
      });
    }

function ensureChartPortal(panel) {
  if (!panel) return;
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  // garantias de estilo quando virar "portal"
  panel.style.position = "fixed";
  panel.style.inset = "auto auto auto auto"; // reseta
  panel.style.transform = "none";
  panel.style.zIndex = "2147483646"; // super alto
}
// Calcula uma posição perto do card, respeitando viewport
function placePanelNearCard(panel, card, prefer = "above") {
  if (!panel || !card) return;
  const r = card.getBoundingClientRect();

  panel.style.display = "block";
  panel.style.visibility = "hidden"; // mede sem flicker

  // tamanhos (fallback pros valores do inline)
  const pw = panel.offsetWidth  || 420;
  const ph = panel.offsetHeight || 240;
  const gap = 8;

  let left = r.left;
  let top  = prefer === "above" ? (r.top - ph - gap) : (r.bottom + gap);

  // clampa dentro do viewport
  left = Math.min(Math.max(6, left),  window.innerWidth  - pw - 6);
  top  = Math.min(Math.max(6, top ),  window.innerHeight - ph - 6);

  panel.style.left = left + "px";
  panel.style.top  = top  + "px";
  panel.style.visibility = "visible";
}

function hidePanel(panel){
  if (panel) panel.style.display = "none";
}
    function ensureChartTip(panel) {
        let tip = panel.querySelector("#novai-chart-tip");
        if (!tip) {
          tip = document.createElement("div");
          tip.id = "novai-chart-tip";
          // começa “fora” da tela
          tip.style.transform = "translate(-9999px,-9999px)";
          panel.appendChild(tip);
        }
        return tip;
      }

    function ensureUi() {
      if (nowUrlChanged()) {
        injected = false;
        resetPerPageState();
      }
      ensureCatalogChipInContainer();
      ensureSearchHeader();
      const root = document.getElementById(ROOT_ID);
      if (root && !document.body.contains(root)) {
        injected = false;
        resetPerPageState();
      }
      if (!document.getElementById(ROOT_ID)) {
        const itemId = getItemIdFromUrl();
        if (itemId) insertUi(itemId);
      }
    }
  
    // heartbeat & SPA hooks
    setInterval(ensureUi, 2000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) ensureUi(); });
    ["pushState","replaceState"].forEach(fn => {
      const orig = history[fn];
      history[fn] = function() { const res = orig.apply(this, arguments); setTimeout(ensureUi, 50); return res; };
    });
    window.addEventListener("popstate", () => setTimeout(ensureUi, 50));
  
    function injectKpiCardsDebounced() {
      clearTimeout(spaTimer);
      spaTimer = setTimeout(() => {
        if (!injected) {
          const itemId = getItemIdFromUrl();
          if (itemId) insertUi(itemId);
        }
      }, 150);
    }
  
    function setupObserver() {
      if (mo) return;
      mo = new MutationObserver(injectKpiCardsDebounced);
      mo.observe(document.body, { childList: true, subtree: true });
      log("MutationObserver configurado.");
    }
  
    // boot
    setupObserver();
    injectKpiCardsDebounced();
  })();