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

  const ROOT_ID = "novai-root";
  let lastUrl = location.href;

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
    const url = window.location.href;
    log("getItemIdFromUrl:url", url);

    const matchWithHyphen = url.match(/MLB-\d+/);
    if (matchWithHyphen) return matchWithHyphen[0].replace("-", "");

    const matches = url.match(/MLB\d+/g);
    if (matches && matches.length > 1) return matches[1];
    return matches ? matches[0] : null;
  }

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
    const sub = document.querySelector(".ui-pdp-header__subtitle, .ui-pdp-subtitle");
    if (!sub) return;
    const obs = new MutationObserver(() => {
      updateFaturamentoCard();
      updateConversionCard();
    });
    obs.observe(sub, { childList: true, subtree: true, characterData: true });
  }

  // ---- gráfico ----
  function showChartPlaceholder(text) {
    const svg = document.querySelector("#novai-chart");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x","200"); t.setAttribute("y","90");
    t.setAttribute("text-anchor","middle");
    t.setAttribute("fill","#6b7280");
    t.setAttribute("font-size","12");
    t.textContent = text || "Sem dados";
    svg.appendChild(t);
  }

  function drawRevenueChart(series) {
    const svg = document.querySelector("#novai-chart");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = 400, H = 180, PADL = 34, PADR = 10, PADT = 8, PADB = 24;
    const innerW = W - PADL - PADR;
    const innerH = H - PADT - PADB;

    const values = series.map(d => d.revenue);
    const maxV = Math.max(...values, 1);
    const x = (i) => PADL + (i * innerW) / Math.max(series.length - 1, 1);
    const y = (v) => PADT + innerH - (v / maxV) * innerH;

    // grade
    [0.5, 1].forEach(frac => {
      const yv = PADT + innerH * (1 - frac);
      const ln = document.createElementNS("http://www.w3.org/2000/svg","line");
      ln.setAttribute("x1", PADL); ln.setAttribute("x2", PADL + innerW);
      ln.setAttribute("y1", yv);   ln.setAttribute("y2", yv);
      ln.setAttribute("stroke", "#e5e7eb"); ln.setAttribute("stroke-width", "1");
      svg.appendChild(ln);

      const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
      txt.setAttribute("x", 4); txt.setAttribute("y", yv + 4);
      txt.setAttribute("fill", "#6b7280"); txt.setAttribute("font-size", "10");
      txt.textContent = brl.format(maxV * frac);
      svg.appendChild(txt);
    });

    // linha
    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", values.map((v,i)=> (i?`L ${x(i)},${y(v)}`:`M ${x(i)},${y(v)}`)).join(" "));
    path.setAttribute("fill","none");
    path.setAttribute("stroke","#2563eb");
    path.setAttribute("stroke-width","2");
    svg.appendChild(path);

    // pontos + tooltip
    const tip = document.createElementNS("http://www.w3.org/2000/svg","g");
    const tipBg = document.createElementNS("http://www.w3.org/2000/svg","rect");
    const tipTx = document.createElementNS("http://www.w3.org/2000/svg","text");
    tipBg.setAttribute("fill","white"); tipBg.setAttribute("stroke","#e5e7eb"); tipBg.setAttribute("rx","6");
    tipTx.setAttribute("fill","#111827"); tipTx.setAttribute("font-size","11");
    tip.appendChild(tipBg); tip.appendChild(tipTx); tip.style.display = "none"; svg.appendChild(tip);

    series.forEach((pnt,i)=>{
      const cx=x(i), cy=y(pnt.revenue);
      const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
      c.setAttribute("cx",cx); c.setAttribute("cy",cy); c.setAttribute("r","3");
      c.setAttribute("fill","#2563eb");
      c.addEventListener("mouseenter", ()=>{
        const t = `${pnt.label} · ${brl.format(pnt.revenue)}\nVisitas: ${pnt.visits}`;
        tipTx.textContent = t;
        const bb = tipTx.getBBox();
        tipBg.setAttribute("x", cx - bb.width/2 - 8);
        tipBg.setAttribute("y", cy - bb.height - 16);
        tipBg.setAttribute("width", bb.width + 16);
        tipBg.setAttribute("height", bb.height + 10);
        tipTx.setAttribute("x", cx - bb.width/2);
        tipTx.setAttribute("y", cy - 20);
        tip.style.display = "block";
      });
      c.addEventListener("mouseleave", ()=>{ tip.style.display = "none"; });
      svg.appendChild(c);
    });

    // labels X (mostra ~6)
    const step = Math.ceil(series.length / 6);
    series.forEach((pnt,i)=>{
      if (i % step !== 0 && i !== series.length - 1) return;
      const tx = document.createElementNS("http://www.w3.org/2000/svg","text");
      tx.setAttribute("x", x(i));
      tx.setAttribute("y", PADT + innerH + 14);
      tx.setAttribute("text-anchor","middle");
      tx.setAttribute("fill","#6b7280");
      tx.setAttribute("font-size","10");
      const mm = (pnt.label||"").slice(5,7);
      const yy = (pnt.label||"").slice(2,4);
      tx.textContent = `${mm}/${yy}`;
      svg.appendChild(tx);
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
      .then(({ labels, visits, revenues }) => {
        monthlySeries = labels.map((label, i) => ({
          label,
          visits: Number(visits[i]) || 0,
          revenue: Number(revenues[i]) || 0,
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
          resolve(response.data); // { labels:[], visits:[], revenues:[] }
        }
      );
    });
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
            <span class="novai-muted">últimos 7 dias</span>
          </div>
          <div id="novai-chart-panel" style="
              position:absolute; inset:auto 0 100% auto;
              width:420px; height:240px; transform:translateY(-8px);
              background:#fff; border:1px solid #e5e7eb; border-radius:12px;
              box-shadow:0 10px 25px rgba(0,0,0,.12);
              padding:10px 12px; display:none; z-index:99999;">
            <div style="font:600 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto; margin-bottom:6px;">
              Faturamento mensal (estimado)
              <span style="font-weight:400;color:#6b7280;margin-left:6px;">(preço × conversão × visitas)</span>
            </div>
            <svg id="novai-chart" viewBox="0 0 400 180" width="100%" height="180" role="img" aria-label="Gráfico de faturamento"></svg>
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
    const panel   = block.querySelector("#novai-chart-panel");
    fatCard.addEventListener("mouseenter", () => {
      panel.style.display = "block";
      if (!monthlySeries || monthlySeries.length === 0) {
        showChartPlaceholder(monthlyFetchInFlight ? "Carregando..." : "Sem dados ainda");
        return;
      }
      drawRevenueChart(monthlySeries);
    });
    fatCard.addEventListener("mouseleave", () => {
      setTimeout(() => { panel.style.display = "none"; }, 120);
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

      // fetch mensal UMA vez por item
      triggerMonthlyFetchOnce(itemId);
    });
  }

  function ensureUi() {
    if (nowUrlChanged()) {
      injected = false;
      resetPerPageState();
    }
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
