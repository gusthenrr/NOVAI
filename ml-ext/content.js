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
      
          tip.innerHTML = `
            <div style="font-weight:700">${label}</div>
            <div>${brl.format(val)}</div>
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
                background:#111; border:1px solid #fff; border-radius:12px;
                box-shadow:0 10px 25px rgba(0,0,0,.12);
                padding:10px 12px; display:none; z-index:99999;">
            <div class="novai-chart-head">
                <span class="novai-chart-title">Faturamento mensal (estimado)</span>
                <span class="novai-chart-hint">(Faturamento aproximado por mês)</span>
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