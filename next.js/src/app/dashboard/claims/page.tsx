"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart2,
  Home,
  MessageSquare,
  MessageSquareWarning,
  PlusCircle,
  Puzzle,
  Settings,
  Tag,
  User,
  CheckCircle2,
  Sparkles,
  Loader,
  Bell,
} from "lucide-react";
import { useUser } from "../../../../userContext";

// ----------------- Tipos -----------------
export type ClaimStatus = "opened" | "closed" | "pendent-novai" | string;

interface Claim {
  claim_id: number;
  resource_id?: string | null;
  status: ClaimStatus; // 'opened', 'closed', 'pendent-novai', etc
  tipo?: string | null;
  stage?: string | null;
  parent_id?: number | null;
  pack_id?: number | null;
  reason_id?: string | null;
  fulfilled?: boolean | null;
  quantity_type?: string | null;
  site_id?: string | null;
  date_created?: string | null; // ISO
  last_updated?: string | null; // ISO
  comprador_id?: number | null;
  vendedor_id?: number | null;
  acoes_disponiveis?: string[] | null;
  name_reason?: string | null; // razon legível
  expected_solutions?: string[] | null;
  problem?: string | null;
  description?: string | null;
  due_date?: string | null; // ISO
  title?: string | null;
  action_responsible?: string | null;
  usuario_id_reclamacoes?: number | null;
  reason_resolution?: string | null;
  date_resolution?: string | null;
  benefited?: string[] | null;
  resolution_closed_by?: string | null;
  apllied_coverage?: boolean | null;
  resource?: string | null;
}

interface UsuarioI {
  nickname: string;
  email: string;
}

// ----------------- Helpers -----------------
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

const truncate = (v?: string | null, n = 100) =>
  v ? (v.length > n ? v.slice(0, n - 1) + "…" : v) : "—";

function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "yellow" | "red" | "green" }) {
  const map: Record<string, string> = {
    zinc: "bg-zinc-700 text-zinc-200",
    yellow: "bg-yellow-400/20 text-yellow-300 border border-yellow-400/40",
    red: "bg-red-500/20 text-red-300 border border-red-500/40",
    green: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  };
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] ${map[tone]}`}>{children}</span>;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400/50 ${
        checked ? "bg-yellow-400" : "bg-zinc-600"
      }`}
      aria-pressed={checked}
      title={label}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full transition ${
          checked ? "translate-x-6 bg-yellow-100" : "translate-x-1 bg-zinc-200"
        }`}
      />
    </button>
  );
}

// ----------------- Página -----------------
const DashboardClaimsPage: React.FC = () => {
  const pathname = usePathname();
  const { token, setToken } = useUser();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [autoMode, setAutoMode] = useState(false); // "automatizar resolução"
  const [loading, setLoading] = useState({ list: true });
  const [user, setUser] = useState<UsuarioI>({ nickname: "--", email: "--" });

  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "", []);
  const socketRef = useRef<Socket | null>(null);

  // Socket opcional (mantendo padrão do projeto)
  useEffect(() => {
    if (!token) return;
    if (!socketRef.current) {
      socketRef.current = io(apiUrl, { transports: ["websocket"], auth: { token } });
    }
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl, token]);

  // ----------------- Fetchers -----------------
  const fetchClaims = async () => {
    if (!token) return;
    setLoading({ list: true });
    try {
      const resp = await fetch(`${apiUrl}/claims`, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await resp.json();
      // Esperado: { claims: Claim[] }
      setClaims(Array.isArray(data?.claims) ? data.claims : []);
    } catch (e) {
      console.error("Erro ao buscar reclamações:", e);
      setClaims([]);
    } finally {
      setLoading({ list: false });
    }
  };

  useEffect(() => {
    if (token) {
      fetchClaims();
      const nick = localStorage.getItem("novai_nickname") || "--";
      const email = localStorage.getItem("novai_email") || "--";
      setUser({ nickname: nick, email });
    } else {
      const storedToken = localStorage.getItem("authToken");
      if (storedToken && storedToken !== token) setToken(storedToken);
    }
  }, [token, setToken]);

  // ----------------- Derivados -----------------
  const openClaims = useMemo(() => claims.filter((c) => c.status === "opened"), [claims]);
  const closedClaims = useMemo(() => claims.filter((c) => c.status === "closed"), [claims]);
  const pendentNovai = useMemo(() => claims.filter((c) => c.status === "pendent-novai"), [claims]);
  const openCount = openClaims.length;

  const visibleList = showClosed ? closedClaims : openClaims;

  // ----------------- Ações (placeholders) -----------------
  const handleResolveAll = () => {
    // TODO: Implementar chamada para resolver todas as abertas
    console.log("[placeholder] Resolver todas as reclamações abertas");
  };

  const handleToggleAutomation = () => {
    setAutoMode((v) => !v);
    console.log("[placeholder] Alternar automação de resolução de reclamações");
  };

  const handleResolveSingle = (claim: Claim) => {
    // TODO: Implementar resolver uma reclamação específica
    console.log("[placeholder] Resolver reclamação", claim.claim_id);
  };

  // ----------------- Render -----------------
  return (
    <div className="flex min-h-screen bg-zinc-900 text-zinc-300 antialiased">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col rounded-r-lg bg-zinc-800 p-6 shadow-lg md:flex">
        <div className="mb-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-zinc-500">
            <User size={36} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">{user.nickname ?? "—"}</h1>
            <p className="text-sm text-zinc-400">{user.email ?? "—"}</p>
          </div>
        </div>

        <nav>
          <ul>
            {[
              { icon: Home, label: "Início", link: "/dashboard/inicio" },
              { icon: BarChart2, label: "Anúncios Métricas", link: "/dashboard/AnalyticsAnuncios" },
              { icon: Tag, label: "Promoções", link: "/dashboard/promo" },
              { icon: MessageSquareWarning, label: "Reclamações", link: "/dashboard/claims", badge: openCount },
              { icon: MessageSquare, label: "Assistente Novai", link: "/Manager" },
              { icon: Puzzle, label: "Novai Extensão", link: "/dashboard/ExtensaoNovai" },
              { icon: Settings, label: "Configurações", link: "/dashboard/config" },
            ].map((item) => {
              const active = pathname?.startsWith(item.link || "#");
              return (
                <li key={item.label} className="mb-2">
                  <a
                    href={item.link}
                    className={`flex items-center justify-between rounded-lg p-3 transition-colors ${
                      active ? "bg-zinc-700/50" : "hover:bg-zinc-700"
                    }`}
                  >
                    <div className="flex items-center">
                      <item.icon className={`mr-3 ${active ? "text-yellow-400" : "text-zinc-400"}`} />
                      <span className={active ? "text-yellow-200 font-medium" : ""}>{item.label}</span>
                    </div>
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span className="ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col p-6">
        {/* Topo */}
        <div className="mb-4 flex items-center justify-between">
          <button className="rounded-full p-2 transition-colors hover:bg-zinc-800 md:hidden" aria-label="Voltar">
            <ArrowLeft />
          </button>
          <h1 className="text-2xl font-bold">Reclamações</h1>
          <div className="flex items-center space-x-3">
            <button className="rounded-full p-2 transition-colors hover:bg-zinc-800" aria-label="Notificações">
              <Bell />
            </button>
          </div>
        </div>

        {/* Barra de Ações */}
        <section className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-zinc-800 p-4 shadow-md sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Filtrar:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClosed(false)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  !showClosed ? "bg-yellow-400 text-zinc-900" : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                }`}
              >
                Abertas ({openClaims.length})
              </button>
              <button
                onClick={() => setShowClosed(true)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  showClosed ? "bg-yellow-400 text-zinc-900" : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                }`}
              >
                Fechadas ({closedClaims.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResolveAll}
              className="flex items-center gap-2 rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition hover:bg-zinc-600"
              title="Resolver todas as reclamações abertas"
            >
              <CheckCircle2 size={18} className="text-emerald-300" />
              Resolver todas as reclamações
            </button>
          </div>

          <div className="flex items-center justify-start gap-3 sm:justify-end">
            <div className="flex items-center gap-2 rounded-md bg-zinc-700/60 px-3 py-1.5">
              <Sparkles size={16} className={autoMode ? "text-yellow-300" : "text-zinc-400"} />
              <span className="text-sm">Automatizar resolução</span>
              <Switch checked={autoMode} onChange={handleToggleAutomation} />
            </div>
          </div>
        </section>

        {/* Quando a automação estiver ligada, exibimos split: esquerda (pendentes da IA), direita (lista principal) */}
        {autoMode ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Coluna esquerda menor: pendentes da IA */}
            <section className="md:col-span-1 rounded-lg bg-zinc-800 p-4 shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-yellow-300">Pendentes para IA</h2>
                <Badge tone="yellow">{pendentNovai.length}</Badge>
              </div>
              <div className="nice-scroll max-h-[60vh] overflow-y-auto pr-2">
                {pendentNovai.length === 0 ? (
                  <p className="text-sm text-zinc-400">Sem pendências no momento.</p>
                ) : (
                  pendentNovai.map((c) => (
                    <ClaimRow key={c.claim_id} claim={c} autoMode={autoMode} onSelect={() => setSelected(c)} onResolve={() => handleResolveSingle(c)} />
                  ))
                )}
              </div>
            </section>

            {/* Coluna direita maior: lista principal */}
            <section className="md:col-span-2 rounded-lg bg-zinc-800 p-4 shadow-md">
              <ClaimsList
                title={showClosed ? "Reclamações Fechadas" : "Reclamações Abertas"}
                claims={visibleList}
                loading={loading.list}
                autoMode={autoMode}
                onSelect={(c) => setSelected(c)}
                onResolve={(c) => handleResolveSingle(c)}
              />
            </section>
          </div>
        ) : (
          // Automação desligada: lista única ocupando toda largura
          <section className="rounded-lg bg-zinc-800 p-4 shadow-md">
            <ClaimsList
              title={showClosed ? "Reclamações Fechadas" : "Reclamações Abertas"}
              claims={visibleList}
              loading={loading.list}
              autoMode={autoMode}
              onSelect={(c) => setSelected(c)}
              onResolve={(c) => handleResolveSingle(c)}
            />
          </section>
        )}

        {/* Modal de detalhes */}
        {selected && (
          <ClaimModal
            claim={selected}
            onClose={() => setSelected(null)}
            onResolve={() => handleResolveSingle(selected)}
          />)
        }
      </main>

      {/* Scrollbar global mais bonito */}
      <style jsx global>{`
        .nice-scroll { scrollbar-width: thin; scrollbar-color: #a1a1aa #27272a; }
        .nice-scroll::-webkit-scrollbar { width: 10px; }
        .nice-scroll::-webkit-scrollbar-track { background: #27272a; border-radius: 8px; }
        .nice-scroll::-webkit-scrollbar-thumb { background-color: #a1a1aa; border-radius: 8px; border: 2px solid #27272a; }
        .nice-scroll::-webkit-scrollbar-thumb:hover { background-color: #d4d4d8; }
      `}</style>
    </div>
  );
};

export default DashboardClaimsPage;

// ----------------- Subcomponentes -----------------
function ClaimsList({
  title,
  claims,
  loading,
  autoMode,
  onSelect,
  onResolve,
}: {
  title: string;
  claims: Claim[];
  loading: boolean;
  autoMode: boolean;
  onSelect: (c: Claim) => void;
  onResolve: (c: Claim) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-yellow-300">{title}</h2>
        <Badge tone="zinc">{claims.length}</Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader className="text-yellow-300" size={28} />
        </div>
      ) : claims.length === 0 ? (
        <p className="text-sm text-zinc-400">Nada para mostrar.</p>
      ) : (
        <div className="nice-scroll max-h-[70vh] overflow-y-auto pr-2">
          {claims.map((c) => (
            <ClaimRow key={c.claim_id} claim={c} autoMode={autoMode} onSelect={() => onSelect(c)} onResolve={() => onResolve(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim, autoMode, onSelect, onResolve }: { claim: Claim; autoMode: boolean; onSelect: () => void; onResolve: () => void }) {
  const isOpen = claim.status === "opened";
  return (
    <div
      onClick={onSelect}
      className="mb-3 cursor-pointer rounded-lg bg-zinc-700/60 p-3 transition hover:bg-zinc-700"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquareWarning size={18} className={isOpen ? "text-yellow-300" : "text-zinc-400"} />
            <h3 className="truncate text-sm font-semibold text-zinc-100" title={claim.title || "Reclamação"}>
              {claim.title || `Reclamação #${claim.claim_id}`}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            {claim.name_reason && <Badge tone="zinc">{truncate(claim.name_reason, 40)}</Badge>}
            {claim.stage && <Badge tone="zinc">Etapa: {claim.stage}</Badge>}
            <Badge tone={isOpen ? "yellow" : "green"}>{isOpen ? "Aberta" : "Fechada"}</Badge>
            {claim.due_date && <Badge tone="red">Vence {new Date(claim.due_date).toLocaleDateString("pt-BR")}</Badge>}
          </div>
          {claim.problem && (
            <p className="mt-2 line-clamp-2 text-xs text-zinc-300">{truncate(claim.problem, 160)}</p>
          )}
        </div>

        {/* Botão resolver visível em cada card somente se aberta e automação desligada */}
        {isOpen && !autoMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResolve();
            }}
            className="shrink-0 rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-yellow-300"
          >
            Resolver
          </button>
        )}
      </div>

      {/* Rodapé enxuto */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
        <span>#{claim.claim_id}</span>
        {claim.last_updated && <span>Atualizado: {fmtDate(claim.last_updated)}</span>}
        {claim.date_created && <span>Criado: {fmtDate(claim.date_created)}</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-800 p-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-100">{value ?? "—"}</div>
    </div>
  );
}

function ClaimModal({ claim, onClose, onResolve }: { claim: Claim; onClose: () => void; onResolve: () => void }) {
  const isOpen = claim.status === "opened";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-zinc-900 p-5 text-zinc-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Detalhes da Reclamação</h3>
          <div className="flex items-center gap-2">
            {isOpen && (
              <button
                onClick={onResolve}
                className="rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-yellow-300"
              >
                Resolver reclamação
              </button>
            )}
            <button className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Row label="Claim ID" value={`#${claim.claim_id}`} />
          <Row label="Status" value={claim.status} />
          <Row label="Etapa" value={claim.stage} />
          <Row label="Título" value={claim.title} />
          <Row label="Motivo" value={claim.name_reason} />
          <Row label="Tipo" value={claim.tipo} />
          <Row label="Ações disponíveis" value={claim.acoes_disponiveis?.join(", ") || "—"} />
          <Row label="Soluções esperadas" value={claim.expected_solutions?.join(", ") || "—"} />
          <Row label="Responsável pela ação" value={claim.action_responsible} />
          <Row label="Criado em" value={fmtDate(claim.date_created)} />
          <Row label="Atualizado em" value={fmtDate(claim.last_updated)} />
          <Row label="Prazo" value={fmtDate(claim.due_date)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Row label="Problema" value={<span className="whitespace-pre-wrap text-zinc-200">{claim.problem || "—"}</span>} />
          <Row label="Descrição" value={<span className="whitespace-pre-wrap text-zinc-200">{claim.description || "—"}</span>} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Row label="Comprador ID" value={claim.comprador_id} />
          <Row label="Vendedor ID" value={claim.vendedor_id} />
          <Row label="Pack ID" value={claim.pack_id} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Row label="Resolução (motivo)" value={claim.reason_resolution} />
          <Row label="Data da resolução" value={fmtDate(claim.date_resolution)} />
          <Row label="Fechado por" value={claim.resolution_closed_by} />
        </div>
      </div>
    </div>
  );
}
