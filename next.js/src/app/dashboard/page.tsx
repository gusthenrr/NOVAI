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
} from 'lucide-react';

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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = Number(value);
    if (!Number.isNaN(normalized)) {
      return normalized;
    }
  }

  return undefined;
};

const DashboardPage: React.FC = () => {
  const { token, setToken } = useUser();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalAmount: 0,
    visualizationsToday: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? '', []);

  useEffect(() => {
    if (token) {
      return;
    }

    try {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        setToken(storedToken);
      }
    } catch (storageError) {
      console.error('Falha ao recuperar token do armazenamento local.', storageError);
    }
  }, [token, setToken]);

  const updateMetrics = useCallback((payload: MetricsPayload) => {
    setMetrics(prev => {
      const totalAmount = parseNumericValue(payload.total_amount) ?? prev.totalAmount;
      const visualizationsToday =
        parseNumericValue(payload.visualizacoes_hoje ?? payload.visualizacoes) ??
        prev.visualizationsToday;

      return {
        totalAmount,
        visualizationsToday,
      };
    });
  }, []);

  useEffect(() => {
    if (!apiUrl) {
      setError('URL da API não configurada.');
      return;
    }

    if (socketRef.current) {
      return;
    }

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

  const fetchMetrics = useCallback(
    async (authToken: string) => {
      if (!apiUrl) {
        return;
      }

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
          const message = typeof data?.error === 'string' ? data.error : 'Erro ao carregar dados do painel.';
          throw new Error(message);
        }

        updateMetrics(data as MetricsPayload);
      } catch (requestError) {
        console.error('Erro ao buscar dados do dashboard:', requestError);
        setError(requestError instanceof Error ? requestError.message : 'Erro inesperado ao carregar o painel.');
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, updateMetrics],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    void fetchMetrics(token);
  }, [token, fetchMetrics]);

  const cards = useMemo(
    () => [
      {
        title: 'Ganhos Hoje',
        value: loading ? '—' : currencyFormatter.format(metrics.totalAmount),
        icon: BarChart2,
        accent: 'text-yellow-300',
      },
      {
        title: 'Visualizações Hoje',
        value: loading ? '—' : numberFormatter.format(metrics.visualizationsToday),
        icon: Share2,
        accent: 'text-yellow-300',
      },
      {
        title: 'Curtidas',
        value: '1.259',
        icon: Heart,
        accent: 'text-yellow-300',
      },
      {
        title: 'Classificação',
        value: '8.5',
        icon: Star,
        accent: 'text-yellow-300',
      },
    ],
    [loading, metrics.totalAmount, metrics.visualizationsToday],
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
            {[{ icon: Home, label: 'Início' }, { icon: FileText, label: 'Arquivos' }, { icon: MessageSquare, label: 'Mensagens' }, { icon: Bell, label: 'Notificações' }, { icon: MapPin, label: 'Localização' }, { icon: BarChart2, label: 'Gráficos' }].map(item => (
              <li key={item.label} className="mb-2">
                <a
                  href="#"
                  className="flex items-center rounded-lg p-3 transition-colors hover:bg-zinc-700"
                >
                  <item.icon className="mr-3 text-yellow-300" />
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
          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(card => (
              <div
                key={card.title}
                className="flex items-center justify-between rounded-lg bg-zinc-800 p-6 shadow-md"
              >
                <div>
                  <p className="mb-1 text-sm text-zinc-400">{card.title}</p>
                  <h2 className={`text-2xl font-bold ${card.accent}`}>{card.value}</h2>
                </div>
                <card.icon size={36} className={card.accent} />
              </div>
            ))}
          </section>

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

