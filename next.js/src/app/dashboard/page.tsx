'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ArrowLeft,
  BarChart2,
  Bell,
  FileText,
  Heart,
  Home,
  MapPin,
  MessageSquare,
  Share2,
  Star,
  User,
  CalendarDays,
  TrendingUp,
  Download,
  ThumbsUp,
  Award,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUser } from '../../../userContext';

type DashboardMetrics = {
  totalAmount: number;
  visualizationsToday: number;
};

type MetricsPayload = {
  total_amount?: number | string | null;
  visualizacoes?: number | string | null;
  visualizacoes_hoje?: number | string | null;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const numberFormatter = new Intl.NumberFormat('pt-BR');

const parseNumericValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = Number(value);
    if (!Number.isNaN(normalized)) return normalized;
  }
  return undefined;
};

type CardKey = 'earnings' | 'shares' | 'likes' | 'rating';

const ptMonths = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const weekLabels = ['D','S','T','Q','Q','S','S'];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function isBetween(d: Date, a: Date, b: Date) {
  const da = startOfDay(d).getTime();
  const aT = startOfDay(a).getTime();
  const bT = startOfDay(b).getTime();
  return da > Math.min(aT,bT) && da < Math.max(aT,bT);
}
function formatPt(d: Date) {
  return `${d.getDate()} de ${ptMonths[d.getMonth()]} de ${d.getFullYear()}`;
}

const DashboardPage: React.FC = () => {
  const { token, setToken } = useUser();
  const [metrics, setMetrics] = useState<DashboardMetrics>({ totalAmount: 0, visualizationsToday: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? '', []);

  // ---- Calendário (estado global por card) ----
  const [selectedCard, setSelectedCard] = useState<CardKey | null>(null);
  const [selectedDates, setSelectedDates] = useState<Record<CardKey, string>>({
    earnings: 'Hoje',
    shares: 'Hoje',
    likes: 'Hoje',
    rating: 'Hoje',
  });

  // Componente de calendário com seleção de intervalo (tematizado em amarelo)
  const SimpleCalendar: React.FC<{
    onClose: () => void;
    onConfirm: (label: string) => void;
    defaultMonth?: { year: number; month: number };
  }> = ({ onClose, onConfirm, defaultMonth }) => {
    const today = startOfDay(new Date());
    const [view, setView] = useState<{year:number; month:number}>(() => {
      if (defaultMonth) return defaultMonth;
      return { year: today.getFullYear(), month: today.getMonth() };
    });
    const [rangeStart, setRangeStart] = useState<Date | null>(today);
    const [rangeEnd, setRangeEnd] = useState<Date | null>(today);

    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const firstWeekday = new Date(view.year, view.month, 1).getDay(); // 0=Domingo

    const goPrev = () => {
      setView(v => {
        const m = v.month - 1;
        return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m };
      });
    };
    const goNext = () => {
      setView(v => {
        const m = v.month + 1;
        return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m };
      });
    };

    const handlePick = (day: number) => {
      const picked = startOfDay(new Date(view.year, view.month, day));
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(picked);
        setRangeEnd(null);
      } else {
        if (picked.getTime() < rangeStart.getTime()) {
          setRangeStart(picked);
          setRangeEnd(null);
        } else if (sameDay(picked, rangeStart)) {
          setRangeEnd(picked);
        } else {
          setRangeEnd(picked);
        }
      }
    };

    const confirm = () => {
      if (rangeStart && rangeEnd) {
        const label = `De: ${formatPt(rangeStart)}\nAté: ${formatPt(rangeEnd)}`;
        onConfirm(label);
      } else if (rangeStart) {
        const label = `${formatPt(rangeStart)}`;
        onConfirm(label);
      } else {
        onConfirm('—');
      }
      onClose();
    };

    const clear = () => {
      setRangeStart(null);
      setRangeEnd(null);
    };

    const isSelected = (d: Date) =>
      (rangeStart && sameDay(d, rangeStart)) || (rangeEnd && sameDay(d, rangeEnd));
    const inRange = (d: Date) =>
      rangeStart && rangeEnd ? isBetween(d, rangeStart, rangeEnd) : false;

    const leading = Array.from({ length: firstWeekday }, (_, i) => <span key={`l-${i}`} />);

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateObj = startOfDay(new Date(view.year, view.month, day));
      const selected = isSelected(dateObj);
      const between = inRange(dateObj);

      const base = 'cursor-pointer rounded-full p-1 text-sm transition-colors select-none';
      const styleSelected = 'bg-yellow-300 text-zinc-800 font-semibold';
      const styleBetween  = 'bg-yellow-300/60 text-zinc-900';
      const styleNormal   = 'text-zinc-300 hover:bg-yellow-300 hover:text-zinc-900';

      return (
        <span
          key={day}
          className={`${base} ${selected ? styleSelected : between ? styleBetween : styleNormal}`}
          onClick={() => handlePick(day)}
        >
          {day}
        </span>
      );
    });

    return (
      <div className="absolute top-full right-0 z-10 mt-2 w-72 rounded-lg bg-zinc-800 p-4 shadow-xl border border-zinc-700">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">
            {ptMonths[view.month]} {view.year}
          </span>
          <div className="flex gap-2">
            <button onClick={goPrev} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-700">◀</button>
            <button onClick={goNext} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-700">▶</button>
          </div>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs">
          {weekLabels.map(lbl => (
            <span key={lbl} className="font-bold text-zinc-500">{lbl}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {leading}
          {dayCells}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={clear} className="text-xs text-zinc-400 hover:text-white">
            Limpar
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
              Cancelar
            </button>
            <button
              onClick={confirm}
              className="rounded-lg bg-yellow-300 px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-yellow-400"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---- token localStorage ----
  useEffect(() => {
    if (token) return;
    try {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) setToken(storedToken);
    } catch (e) {
      console.error('Falha ao recuperar token do armazenamento local.', e);
    }
  }, [token, setToken]);

  const updateMetrics = useCallback((payload: MetricsPayload) => {
    setMetrics(prev => {
      const totalAmount = parseNumericValue(payload.total_amount) ?? prev.totalAmount;
      const visualizationsToday =
        parseNumericValue(payload.visualizacoes_hoje ?? payload.visualizacoes) ?? prev.visualizationsToday;
      return { totalAmount, visualizationsToday };
    });
  }, []);

  // ---- socket ----
  useEffect(() => {
    if (!apiUrl) {
      setError('URL da API não configurada.');
      return;
    }
    if (socketRef.current) return;

    const socket = io(apiUrl, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 20000,
    });

    socketRef.current = socket;
    socket.on('atualizar_dados', updateMetrics);

    return () => {
      socket.off('atualizar_dados', updateMetrics);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl, updateMetrics]);

  // ---- fetch inicial ----
  const fetchMetrics = useCallback(
    async (authToken: string) => {
      if (!apiUrl) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/get_dados_gerais`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          credentials: 'include',
        });
        const data = await response.json();
        if (!response.ok) {
          const msg = typeof data?.error === 'string' ? data.error : 'Erro ao carregar dados do painel.';
          throw new Error(msg);
        }
        updateMetrics(data as MetricsPayload);
      } catch (err) {
        console.error('Erro ao buscar dados do dashboard:', err);
        setError(err instanceof Error ? err.message : 'Erro inesperado ao carregar o painel.');
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, updateMetrics]
  );

  useEffect(() => {
    if (!token) return;
    void fetchMetrics(token);
  }, [token, fetchMetrics]);

  // ---- cards (com amarelo) ----
  const cards = useMemo<
    Array<{ id: CardKey; title: string; value: string; icon: LucideIcon; badgeIcon: LucideIcon }>
  >(
    () => [
      { id: 'earnings', title: 'Ganhos', value: loading ? '—' : currencyFormatter.format(metrics.totalAmount), icon: BarChart2, badgeIcon: TrendingUp },
      { id: 'shares',   title: 'Visualizações', value: loading ? '—' : numberFormatter.format(metrics.visualizationsToday), icon: Share2, badgeIcon: Download },
      { id: 'likes',    title: 'Curtidas', value: '1.259', icon: Heart, badgeIcon: ThumbsUp },
      { id: 'rating',   title: 'Classificação', value: '8.5', icon: Star, badgeIcon: Award },
    ],
    [loading, metrics.totalAmount, metrics.visualizationsToday]
  );

  return (
    <div className="flex min-h-screen bg-zinc-900 text-zinc-300 antialiased">
      <aside className="hidden w-64 flex-col rounded-r-lg bg-zinc-800 p-6 shadow-lg md:flex">
        <div className="mb-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-zinc-500">
            <User size={36} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">JOHN DON</h1>
            <p className="text-sm text-zinc-400">johndon@company.com</p>
          </div>
        </div>

        <nav>
          <ul>
            {[
              { icon: Home, label: 'Início' },
              { icon: FileText, label: 'Arquivos' },
              { icon: MessageSquare, label: 'Mensagens' },
              { icon: Bell, label: 'Notificações' },
              { icon: MapPin, label: 'Localização' },
              { icon: BarChart2, label: 'Gráficos' },
            ].map(item => (
              <li key={item.label} className="mb-2">
                <a href="#" className="flex items-center rounded-lg p-3 transition-colors hover:bg-zinc-700">
                  <item.icon className={`mr-3 ${item.label === 'Início' ? 'text-yellow-300' : 'text-zinc-400'}`} />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="flex flex-1 flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <button className="rounded-full p-2 transition-colors hover:bg-zinc-800 md:hidden">
            <ArrowLeft />
          </button>
          <h1 className="text-2xl font-bold">Painel de Controle</h1>
          <div className="flex items-center space-x-4">
            <button className="rounded-full p-2 transition-colors hover:bg-zinc-800">
              <BarChart2 />
            </button>
            <a href="/Manager" className="rounded-full p-2 transition-colors hover:bg-zinc-800">
              <MessageSquare />
            </a>
            <button className="rounded-full p-2 transition-colors hover:bg-zinc-800">
              <Bell />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="-m-6 flex-1 space-y-6 overflow-y-auto p-6">
          {/* Cards com calendário (amarelo aplicado) */}
          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(card => (
              <div key={card.id} className="relative flex items-center justify-between rounded-lg bg-zinc-800 p-6 shadow-md">
                {/* Ações topo-direito */}
                <div className="absolute right-4 top-4 flex flex-col items-center space-y-2">
                  <button
                    onClick={() => setSelectedCard(selectedCard === card.id ? null : card.id)}
                    className="rounded-full p-2 transition-colors hover:bg-zinc-700"
                    aria-label={`Selecionar período em ${card.title}`}
                  >
                    <CalendarDays size={20} className="text-yellow-300" />
                  </button>
                  <card.badgeIcon size={16} className="text-zinc-500 hover:text-yellow-300 cursor-pointer" />
                </div>

                {/* Conteúdo */}
                <div>
                  <p className="mb-1 text-sm text-zinc-400">{card.title}</p>
                  <h2 className="text-2xl font-bold text-yellow-300">{card.value}</h2>
                  <p className="mt-1 whitespace-pre-line text-xs text-zinc-500">
                    {selectedDates[card.id]}
                  </p>
                </div>

                <card.icon size={36} className="text-zinc-400" />

                {/* Popover do calendário */}
                {selectedCard === card.id && (
                  <SimpleCalendar
                    onClose={() => setSelectedCard(null)}
                    onConfirm={(label) => setSelectedDates(prev => ({ ...prev, [card.id]: label }))}
                    defaultMonth={(() => {
                      const now = new Date();
                      return { year: now.getFullYear(), month: now.getMonth() };
                    })()}
                  />
                )}
              </div>
            ))}
          </section>

          {/* O resto da página permanece igual */}
          <section className="rounded-lg bg-zinc-800 p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Resultado</h2>
              <button className="rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-600">
                Ver Agora
              </button>
            </div>
            <div className="flex h-64 w-full items-center justify-center rounded-lg bg-zinc-700 text-zinc-500">
              Espaço para o gráfico de barras
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-lg bg-zinc-800 p-6 shadow-md lg:col-span-2">
              <div className="flex h-64 w-full items-center justify-center rounded-lg bg-zinc-700 text-zinc-500">
                Espaço para o gráfico de linha
              </div>
            </div>
            <div className="space-y-4 rounded-lg bg-zinc-800 p-6 shadow-md">
              <h2 className="text-xl font-bold">Informações</h2>
              <div className="flex h-32 w-full items-center justify-center rounded-lg bg-zinc-700 text-zinc-500">
                Espaço para o gráfico de rosca
              </div>
              <ul className="space-y-2 text-zinc-400">
                <li>Lorem ipsum dolor sit amet.</li>
                <li>Lorem ipsum dolor sit amet.</li>
                <li>Lorem ipsum dolor sit amet.</li>
                <li>Lorem ipsum dolor sit amet.</li>
              </ul>
              <button className="w-full rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-600">
                Ver Agora
              </button>
            </div>
          </section>

          <section className="rounded-lg bg-zinc-800 p-6 shadow-md">
            <h2 className="mb-4 text-xl font-bold">Mais Conteúdo</h2>
            <p className="text-zinc-400">
              Adicionei este bloco de texto para garantir que a página tenha conteúdo suficiente para a barra de rolagem aparecer,
              permitindo que você veja o resultado do seu pedido.
            </p>
            <div className="mt-4 flex h-48 w-full items-center justify-center rounded-lg bg-zinc-700 text-zinc-500">
              Espaço para mais um gráfico ou elemento
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
