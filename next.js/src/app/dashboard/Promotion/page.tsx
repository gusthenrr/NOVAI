'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { usePathname } from 'next/navigation';
import {
  PlusCircle,
  Loader,
  ArrowLeft,
  BarChart2,
  MessageSquare,
  Puzzle,
  Tag,
  MessageSquareWarning,
  Settings,
  Home,
  User,
} from 'lucide-react';
import { useUser } from '../../../../userContext';

// ----------------- Tipos -----------------
interface Promotion {
  id_promotion: string;
  name: string;
  status: string;
  start_date: string;
  finish_date: string;
  deadline_date: string;
  type_promotion: string;
}

interface ItemAppliedToPromotion {
  item_id: string;
  promotion_name: string;
  nome_item: string;
  image_url: string;
  price: number;
  original_price: number;
  min_discounted_price: number;
  max_discounted_price: number;
  suggested_discounted_price: number;
  start_date: string;
  end_date: string;
  renovacao_auto: boolean; // \u26a0\ufe0f virá do backend como 'renovacao_auto': row['item_auto']
}

interface ActiveItem {
  item_id: string;
  nome_item: string;
  price: number;
  ranking_position: number;
  quantity_sold: number;
}

interface UsuarioI {
  nickname: string;
  email: string;
}

// ----------------- Helpers -----------------
const money = (v?: number) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '--';

// Toggle minimalista
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400/50 ${
        checked ? 'bg-yellow-400' : 'bg-zinc-600'
      }`}
      aria-pressed={checked}
      title={checked ? 'Auto-renovação ativada' : 'Auto-renovação desativada'}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full transition ${
          checked ? 'translate-x-6 bg-yellow-100' : 'translate-x-1 bg-zinc-300'
        }`}
      />
    </button>
  );
}

// ----------------- Página -----------------
const DashboardPromotionPage: React.FC = () => {
  const pathname = usePathname();
  const { token, setToken } = useUser();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [itemsAppliedToPromotions, setItemsAppliedToPromotions] = useState<
    ItemAppliedToPromotion[]
  >([]);
  const [activeItems, setActiveItems] = useState<ActiveItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemAppliedToPromotion | null>(null);

  const [searchPromo, setSearchPromo] = useState('');
  const [searchApplied, setSearchApplied] = useState('');

  const [user, setUser] = useState<UsuarioI>({ nickname: '--', email: '--' });
  const [loading, setLoading] = useState({ promotions: true, items: true, competitors: false });

  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? '', []);

  // Socket
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    // Conecta socket apenas uma vez
    if (!socketRef.current) {
      socketRef.current = io(apiUrl, {
        transports: ['websocket'],
        auth: { token },
      });
    }
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl, token]);

  // ----------------- Fetchers -----------------
  const fetchPromotionsAndItems = async () => {
    if (!token) return;
    setLoading((p) => ({ ...p, promotions: true }));
    try {
      const response = await fetch(`${apiUrl}/promotions-and-items`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      setPromotions(data.promotions || []);
      setItemsAppliedToPromotions(data.itemsAppliedToPromotions || []);
    } catch (error) {
      console.error('Error fetching promotions and items:', error);
    } finally {
      setLoading((p) => ({ ...p, promotions: false, items: false }));
    }
  };

  const fetchActiveItems = async () => {
    if (!token) return;
    setLoading((p) => ({ ...p, items: true }));
    try {
      const response = await fetch(`${apiUrl}/active-items`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      setActiveItems(data.activeItems || []);
    } catch (error) {
      console.error('Error fetching active items:', error);
    } finally {
      setLoading((p) => ({ ...p, items: false }));
    }
  };

  const fetchCompetitorData = async (itemId: string) => {
    if (!token) return;
    setLoading((p) => ({ ...p, competitors: true }));
    try {
      const response = await fetch(`${apiUrl}/competitor-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ item_id: itemId }),
      });
      const data = await response.json();
      // Nesta tela exibimos apenas detalhes do item aplicado à promoção; concorrentes podem ser mostrados depois
      setSelectedItem((prev) => prev); // placeholder para futuro uso
    } catch (error) {
      console.error('Error fetching competitor data:', error);
    } finally {
      setLoading((p) => ({ ...p, competitors: false }));
    }
  };

  useEffect(() => {
    if (token) {
      fetchPromotionsAndItems();
      // fetchActiveItems(); // opcional
      const nick = localStorage.getItem('novai_nickname') || '--';
      const email = localStorage.getItem('novai_email') || '--';
      setUser({ nickname: nick, email });
    } else {
      try {
        const storedToken = localStorage.getItem('authToken');
        if (storedToken && storedToken !== token) setToken(storedToken);
      } catch (e) {
        console.error('Falha ao recuperar token do armazenamento local.', e);
      }
    }
  }, [token, setToken]);

  // ----------------- Ações UI -----------------
  const handleAddPromotion = () => {
    // Abrir modal/form de criação (futuro)
  };

  const handleSelectItem = (item: ItemAppliedToPromotion) => {
    setSelectedItem(item);
  };

  const handleToggleRenovacao = (item: ItemAppliedToPromotion) => {
    const newVal = !item.renovacao_auto;
    // Otimismo na UI
    setItemsAppliedToPromotions((list) =>
      list.map((it) => (it.item_id === item.item_id ? { ...it, renovacao_auto: newVal } : it))
    );
    // Emite socket
    socketRef.current?.emit('agendar_renovacao_promotion', {
      item_id: item.item_id,
      renovacao_auto: newVal,
    });
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
            <h1 className="text-xl font-bold">{user.nickname ?? '—'}</h1>
            <p className="text-sm text-zinc-400">{user.email ?? '—'}</p>
          </div>
        </div>

        <nav>
          <ul>
            {[
              { icon: Home, label: 'Início', link: '/dashboard/inicio' },
              { icon: BarChart2, label: 'Anúncios Métricas', link: '/dashboard/AnalyticsAnuncios' },
              { icon: Tag, label: 'Promoções', link: '/dashboard/Promotion' },
              { icon: MessageSquareWarning, label: 'Reclamações', link: '/dashboard/claims' },
              { icon: MessageSquare, label: 'Assistente Novai', link: '/Manager' },
              { icon: Puzzle, label: 'Novai Extensão', link: '/dashboard/ExtensaoNovai' },
              { icon: Settings, label: 'Configurações', link: '/dashboard/config' },
            ].map((item) => {
              const active = pathname?.startsWith(item.link);
              return (
                <li key={item.label} className="mb-2">
                  <a
                    href={item.link}
                    className={`flex items-center rounded-lg p-3 transition-colors ${
                      active ? 'bg-zinc-700/50' : 'hover:bg-zinc-700'
                    }`}
                  >
                    <item.icon className={`mr-3 ${active ? 'text-yellow-400' : 'text-zinc-400'}`} />
                    <span className={active ? 'text-yellow-200 font-medium' : ''}>{item.label}</span>
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
          <button className="rounded-full p-2 transition-colors hover:bg-zinc-800 md:hidden">
            <ArrowLeft />
          </button>
          <h1 className="text-2xl font-bold">Promoções</h1>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleAddPromotion}
              className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-2 text-sm transition-colors hover:bg-zinc-700"
            >
              <PlusCircle size={18} className="text-yellow-300" />
              Adicionar Nova Promoção
            </button>
          </div>
        </div>

        {/* Filtro compacto para promoções */}
        <section className="mb-4 rounded-lg bg-zinc-800 p-4 shadow-md">
          <input
            type="text"
            placeholder="Pesquisar promoções"
            value={searchPromo}
            onChange={(e) => setSearchPromo(e.target.value)}
            className="w-full rounded-lg bg-zinc-700 p-2 text-sm text-zinc-200 placeholder-zinc-400"
          />
        </section>

        {/* Lista de promoções (cards menores) */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading.promotions ? (
            <div className="col-span-full flex items-center justify-center py-8">
              <Loader className="text-yellow-300" size={28} />
            </div>
          ) : (
            promotions
              .filter((p) => p.name?.toLowerCase().includes(searchPromo.toLowerCase()))
              .map((promo) => (
                <div key={promo.id_promotion} className="rounded-lg bg-zinc-800 p-4 text-sm shadow-md">
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="truncate text-base font-semibold text-yellow-300" title={promo.name}>
                      {promo.name}
                    </h2>
                    <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{promo.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Início: {new Date(promo.start_date).toLocaleDateString()}</span>
                    <span>Fim: {new Date(promo.finish_date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
          )}
        </section>

        {/* Itens aplicados às promoções - MAIOR e com scroll bonito + busca */}
        <section className="mt-6 rounded-lg bg-zinc-800 p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-yellow-300">Itens Aplicados às Promoções</h2>
            <input
              type="text"
              placeholder="Buscar item aplicado"
              value={searchApplied}
              onChange={(e) => setSearchApplied(e.target.value)}
              className="w-64 rounded-lg bg-zinc-700 p-2 text-sm text-zinc-200 placeholder-zinc-400"
            />
          </div>

          <div className="nice-scroll max-h-[520px] overflow-y-auto pr-2">
            {loading.items ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="text-yellow-300" size={28} />
              </div>
            ) : (
              itemsAppliedToPromotions
                .filter((it) => it.nome_item?.toLowerCase().includes(searchApplied.toLowerCase()))
                .map((it) => (
                  <div
                    key={`${it.item_id}-${it.promotion_name}`}
                    onClick={() => handleSelectItem(it)}
                    className="mb-3 flex cursor-pointer items-center justify-between rounded-lg bg-zinc-700/60 p-3 transition hover:bg-zinc-700"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={it.image_url}
                        alt={it.nome_item}
                        className="h-12 w-12 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm text-zinc-100">{it.nome_item}</div>
                        <div className="truncate text-xs text-zinc-400">
                          <span className="text-zinc-300">Promoção aplicada:</span> {it.promotion_name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Preço atual vs original */}
                      <div className="hidden text-right text-xs sm:block">
                        <div className="text-zinc-300">{money(it.price)}</div>
                        <div className="text-zinc-500 line-through">{money(it.original_price)}</div>
                      </div>

                      {/* Toggle de renovação automática (substitui o botão "!") */}
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                        <Toggle checked={it.renovacao_auto} onChange={() => handleToggleRenovacao(it)} />
                        <span className="text-[10px] text-zinc-400">auto</span>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </section>

        {/* Desempenho do Item (placeholder para futuro) */}
        <section className="mt-6 rounded-lg bg-zinc-800 p-6 shadow-md">
          <h2 className="text-xl font-bold text-yellow-300">Desempenho do Item</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Pesquise um item seu e veja o desempenho dele em comparação com concorrentes. (Em breve)
          </p>
          {loading.competitors ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="text-yellow-300" size={28} />
            </div>
          ) : (
            <div />
          )}
        </section>

        {/* Modal de detalhes do item aplicado */}
        {selectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="w-full max-w-2xl rounded-xl bg-zinc-900 p-5 text-zinc-200 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Detalhes do Item</h3>
                <button
                  className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                  onClick={() => setSelectedItem(null)}
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <img
                    src={selectedItem.image_url}
                    alt={selectedItem.nome_item}
                    className="h-40 w-full rounded object-cover"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Info label="Item ID" value={selectedItem.item_id} />
                    <Info label="Nome" value={selectedItem.nome_item} />
                    <Info label="Promoção aplicada" value={selectedItem.promotion_name} />
                    <Info label="Preço" value={money(selectedItem.price)} />
                    <Info label="Preço original" value={money(selectedItem.original_price)} />
                    <Info label="Preço mín. desc." value={money(selectedItem.min_discounted_price)} />
                    <Info label="Preço máx. desc." value={money(selectedItem.max_discounted_price)} />
                    <Info label="Preço sugerido" value={money(selectedItem.suggested_discounted_price)} />
                    <Info
                      label="Início"
                      value={new Date(selectedItem.start_date).toLocaleString('pt-BR')}
                    />
                    <Info
                      label="Fim"
                      value={new Date(selectedItem.end_date).toLocaleString('pt-BR')}
                    />
                    <Info label="Auto-renovação" value={selectedItem.renovacao_auto ? 'Ativa' : 'Desativada'} />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Auto-renovação</span>
                  <Toggle
                    checked={selectedItem.renovacao_auto}
                    onChange={() => handleToggleRenovacao(selectedItem)}
                  />
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="rounded-md bg-yellow-400 px-4 py-2 text-zinc-900 hover:bg-yellow-300"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Scrollbar bonito (somente para este componente) */}
      <style jsx global>{`
        .nice-scroll {
          scrollbar-width: thin;
          scrollbar-color: #a1a1aa #27272a; /* thumb track */
        }
        .nice-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .nice-scroll::-webkit-scrollbar-track {
          background: #27272a;
          border-radius: 8px;
        }
        .nice-scroll::-webkit-scrollbar-thumb {
          background-color: #a1a1aa;
          border-radius: 8px;
          border: 2px solid #27272a;
        }
        .nice-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #d4d4d8;
        }
      `}</style>
    </div>
  );
};

export default DashboardPromotionPage;

// ----------------- Subcomponentes -----------------
function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-800 p-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="truncate text-sm text-zinc-100">{value ?? '—'}</div>
    </div>
  );
}

