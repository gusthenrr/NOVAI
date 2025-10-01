// background.js
console.log("[BG] service worker up");

const API_BASE = "https://nossopoint-backend-flask-server.com";

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!res.ok) {
    console.error("[BG] HTTP", res.status, data);
    throw new Error(`HTTP ${res.status}`);
  }
  return data;
}

// Gera labels YYYY-MM para janelas de 30 dias (antigo → recente)
function makeMonthLabels_30dWindows(n = 24) {
  const out = [];
  for (let i = n; i >= 1; i--) {
    const from = new Date(Date.now() - i * 30 * 24 * 3600 * 1000);
    const yyyy = from.getFullYear();
    const mm = String(from.getMonth() + 1).padStart(2, "0");
    out.push(`${yyyy}-${mm}`);
  }
  return out;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // visitas agregadas
  if (message.type === "GET_VISITS") {
    const { itemId } = message;
    console.log("[BG] /visitsItems itemId =", itemId);

    postJSON(`${API_BASE}/visitsItems`, { itemId })
      .then((data) => {
        // Backend: { "itemId": { "YYYY-MM-DD": num, ... } }
        console.log("[BG] resposta /visitsItems:", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.error("[BG] fetch error /visitsItems:", err);
        sendResponse({ ok: false, error: String(err.message || err) });
      });

    return true; // async
  }

  // visitas por "mês"(30d) + faturamento
  if (message.type === "GET_VISITS_MONTHLY") {
    const { itemId, conversion, price } = message;
    const convNum = Number(conversion) || 0; // % (teu backend espera %)
    const priceNum = Number(price) || 0;

    postJSON(`${API_BASE}/visitas_por_mes`, {
      item_id: itemId,
      conversion: convNum,
      price: priceNum,
    })
      .then((data) => {
        // Esperado: { meses: [...], faturamentos: [...] }
        let visitasArr = Array.isArray(data?.meses) ? data.meses.slice() : [];
        let faturArr   = Array.isArray(data?.faturamentos) ? data.faturamentos.slice() : [];

        // Backend vem 1 mês atrás → 24 meses atrás; normaliza p/ cronologia
        visitasArr.reverse();
        faturArr.reverse();

        const labels = makeMonthLabels_30dWindows(Math.min(24, visitasArr.length));
        const len = Math.min(labels.length, visitasArr.length, faturArr.length);

        const payload = {
          labels: labels.slice(-len),
          visits: visitasArr.slice(-len),
          revenues: faturArr.slice(-len),
        };

        console.log("[BG] resposta /visitas_por_mes (normalizada):", payload);
        sendResponse({ ok: true, data: payload });
      })
      .catch((err) => {
        console.error("[BG] fetch error /visitas_por_mes:", err);
        sendResponse({ ok: false, error: String(err.message || err) });
      });

    return true; // async
  }
});
