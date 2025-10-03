'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {PlusCircle, Loader,ArrowLeft,
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
  Puzzle,
  Award,
  Tag,
  MessageSquareWarning,
  Settings,
  Percent,
  ShoppingCart, } from 'lucide-react';

import { useUser } from '../../../../userContext';

type DashboardMetrics = {
  nickname: string | null;
  email: string | null;
};

const ExtensaoNovaiPage: React.FC = () => {
  const { token } = useUser();
  const [metrics, setMetrics] = useState<DashboardMetrics>({ nickname: null, email: null });

  // Opcional: resgatar nome/email do localStorage (igual ao dashboard),
  // se você já os envia via socket/API, pode substituí-lo.
  useEffect(() => {
    try {
      const nick = localStorage.getItem('novai_nickname');
      const email = localStorage.getItem('novai_email');
      setMetrics({
        nickname: nick && nick.trim() ? nick : null,
        email: email && email.trim() ? email : null,
      });
    } catch {
      /* ignore */
    }
  }, [token]);

  // URLs placeholder para você substituir depois
  const IMG_FATURAMENTO_MENSAL = '__URL_IMAGEM_FATURAMENTO_MENSAL__';
  const IMG_QTD_VENDIDA_MENSAL = '__URL_IMAGEM_QTD_VENDIDA_MENSAL__';
  const IMG_VISUALIZACOES_MENSAIS = '__URL_IMAGEM_VISUALIZACOES_MENSAIS__';
  const IMG_VISUALIZACOES_TOTAIS = '__URL_IMAGEM_VISUALIZACOES_TOTAIS__';
  const IMG_CONVERSAO = '__URL_IMAGEM_CONVERSAO__';
  const IMG_FATURAMENTO_TOTAL = '__URL_IMAGEM_FATURAMENTO_TOTAL__';

  return (
    <div className="flex min-h-screen bg-zinc-900 text-zinc-300 antialiased">
      {/* Sidebar (mesmo layout do dashboard) */}
      <aside className="hidden w-64 flex-col rounded-r-lg bg-zinc-800 p-6 shadow-lg md:flex">
        <div className="mb-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-zinc-500">
            <User size={36} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">{metrics.nickname ?? '—'}</h1>
            <p className="text-sm text-zinc-400">{metrics.email ?? '—'}</p>
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

      {/* Conteúdo */}
      <main className="flex flex-1 flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <button className="rounded-full p-2 transition-colors hover:bg-zinc-800 md:hidden" aria-label="Voltar">
            <ArrowLeft />
          </button>
          {/* Título mostrando onde a pessoa está */}
          <h1 className="text-2xl font-bold">Novai Extensão</h1>
          <div className="flex items-center space-x-4">
            <button className="rounded-full p-2 transition-colors hover:bg-zinc-800">
              <BarChart2 />
            </button>
            <Link href="/Manager" className="rounded-full p-2 transition-colors hover:bg-zinc-800" aria-label="Manager">
              <MessageSquare />
            </Link>
            <button className="rounded-full p-2 transition-colors hover:bg-zinc-800">
              <Bell />
            </button>
          </div>
        </div>

        <div className="-m-6 flex-1 space-y-6 overflow-y-auto p-6">
          {/* CTA final */}
          <section className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-600"
              >
                <Puzzle className="h-4 w-4 text-yellow-300" />
                Novai-Extensão
              </button>

              {/* Aponta para /public/ml-ext.zip. Coloque seu arquivo lá. */}
              <a
                href="/nova_extension.zip"
                download
                className="flex items-center gap-2 rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-yellow-400"
              >
                <Download className="h-4 w-4" />
                Baixar extensão
              </a>
            </div>

            {/* Guia rápido opcional (pode esconder se preferir explicar depois) */}
            <details className="mt-4 rounded-md border border-zinc-700 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
                Como instalar localmente (Chrome/Edge)
              </summary>
              <div className="mt-3 space-y-2 text-sm text-zinc-400">
                <p className="font-semibold text-zinc-300">Instalar local (modo desenvolvedor)</p>
                <ol className="list-decimal space-y-1 pl-6">
                  <li>Baixe e descompacte o arquivo <code>ml-ext.zip</code>.</li>
                  <li>Abra <code>chrome://extensions</code> (ou <code>edge://extensions</code>).</li>
                  <li>Ative <strong>Modo do desenvolvedor</strong>.</li>
                  <li>Clique em <strong>Carregar sem compactação (Load unpacked)</strong> e selecione a pasta <code>ml-ext</code>.</li>
                </ol>
              </div>
            </details>
          </section>
          {/* Introdução */}
          <section className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
  <h2 className="mb-3 text-xl font-bold">Como funciona</h2>
  <p className="text-zinc-400">
    A <span className="font-semibold text-yellow-300">Extensão Novai</span> exibe métricas
    dos anúncios de concorrentes no Mercado Livre diretamente na página, oferecendo uma visão rápida e
    prática do desempenho desses anúncios. Ela mostra:
  </p>

  <p className="mt-4 text-sm text-zinc-500">
    <strong className="text-red-400 bg-red-950/40 px-2 py-0.5 rounded">
      Importante:
    </strong>{' '}
    os valores de faturamento exibidos são{' '}
    <span className="font-semibold">estimativas</span> calculadas com base em dados
    obtidos do próprio Mercado Livre (como preço e quantidade vendida), podendo variar de
    acordo com promoções, fretes, descontos e outras condições da plataforma.
  </p>
</section>


          {/* Cards de explicação com imagem/link placeholder */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Faturamento por mês */}
            <article className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center gap-3">
                <BarChart2 className="text-yellow-300" />
                <h3 className="text-lg font-semibold">Faturamento (por mês)</h3>
              </div>
              <p className="text-zinc-400">
                Exibe a soma estimada de vendas em cada mês. Útil para acompanhar a sazonalidade e
                o crescimento mês a mês.
              </p>
              <figure className="mt-4">
                <img
                  src={IMG_FATURAMENTO_MENSAL}
                  alt="Exemplo: onde o faturamento mensal aparece na extensão"
                  className="h-48 w-full rounded-md object-cover bg-zinc-700"
                />
                <figcaption className="mt-2 text-xs text-zinc-500">
                  <a
                    href={IMG_FATURAMENTO_MENSAL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-300 hover:underline"
                  >
                    Abrir imagem de exemplo
                  </a>
                </figcaption>
              </figure>
            </article>

            {/* Quantidade vendida por mês */}
            <article className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center gap-3">
                <ShoppingCart className="text-yellow-300" />
                <h3 className="text-lg font-semibold">Quantidade vendida (por mês)</h3>
              </div>
              <p className="text-zinc-400">
                Mostra quantas unidades foram vendidas em cada mês, facilitando a leitura de
                tendência de demanda por item.
              </p>
              <figure className="mt-4">
                <img
                  src={IMG_QTD_VENDIDA_MENSAL}
                  alt="Exemplo: onde ver a quantidade vendida por mês na extensão"
                  className="h-48 w-full rounded-md object-cover bg-zinc-700"
                />
                <figcaption className="mt-2 text-xs text-zinc-500">
                  <a
                    href={IMG_QTD_VENDIDA_MENSAL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-300 hover:underline"
                  >
                    Abrir imagem de exemplo
                  </a>
                </figcaption>
              </figure>
            </article>

            {/* Visualizações por mês */}
            <article className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center gap-3">
                <Share2 className="text-yellow-300" />
                <h3 className="text-lg font-semibold">Visualizações (por mês)</h3>
              </div>
              <p className="text-zinc-400">
                Indica o volume de acessos mensais ao anúncio. A imagem abaixo ilustra onde as
                visualizações aparecem na extensão.
              </p>
              <figure className="mt-4">
                <img
                  src={IMG_VISUALIZACOES_MENSAIS}
                  alt="Exemplo: onde ver visualizações mensais na extensão"
                  className="h-48 w-full rounded-md object-cover bg-zinc-700"
                />
                <figcaption className="mt-2 text-xs text-zinc-500">
                  <a
                    href={IMG_VISUALIZACOES_MENSAIS}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-300 hover:underline"
                  >
                    Abrir imagem de exemplo
                  </a>
                </figcaption>
              </figure>
            </article>

            {/* Visualizações totais */}
            <article className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center gap-3">
                <Share2 className="text-yellow-300" />
                <h3 className="text-lg font-semibold">Visualizações totais</h3>
              </div>
              <p className="text-zinc-400">
                Soma todas as visualizações históricas do anúncio, oferecendo uma leitura geral do
                alcance acumulado.
              </p>
              <figure className="mt-4">
                <img
                  src={IMG_VISUALIZACOES_TOTAIS}
                  alt="Exemplo: onde ver visualizações totais na extensão"
                  className="h-48 w-full rounded-md object-cover bg-zinc-700"
                />
                <figcaption className="mt-2 text-xs text-zinc-500">
                  <a
                    href={IMG_VISUALIZACOES_TOTAIS}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-300 hover:underline"
                  >
                    Abrir imagem de exemplo
                  </a>
                </figcaption>
              </figure>
            </article>

            {/* Conversão */}
            <article className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center gap-3">
                <Percent className="text-yellow-300" />
                <h3 className="text-lg font-semibold">% de conversão (view → venda)</h3>
              </div>
              <p className="text-zinc-400">
                Calcula a taxa de conversão a partir das visualizações e vendas estimadas. Útil para
                medir eficiência de página e preço.
              </p>
              <figure className="mt-4">
                <img
                  src={IMG_CONVERSAO}
                  alt="Exemplo: onde ver a taxa de conversão na extensão"
                  className="h-48 w-full rounded-md object-cover bg-zinc-700"
                />
                <figcaption className="mt-2 text-xs text-zinc-500">
                  <a
                    href={IMG_CONVERSAO}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-300 hover:underline"
                  >
                    Abrir imagem de exemplo
                  </a>
                </figcaption>
              </figure>
            </article>

            {/* Faturamento total */}
            <article className="rounded-lg bg-transparent border border-zinc-700/40 p-6 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center gap-3">
                <TrendingUp className="text-yellow-300" />
                <h3 className="text-lg font-semibold">Faturamento total (estimado)</h3>
              </div>
              <p className="text-zinc-400">
                Soma estimada de todo o período disponível para o anúncio, baseada nos dados do
                Mercado Livre.
              </p>
              <figure className="mt-4">
                <img
                  src={IMG_FATURAMENTO_TOTAL}
                  alt="Exemplo: onde ver o faturamento total na extensão"
                  className="h-48 w-full rounded-md object-cover bg-zinc-700"
                />
                <figcaption className="mt-2 text-xs text-zinc-500">
                  <a
                    href={IMG_FATURAMENTO_TOTAL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-300 hover:underline"
                  >
                    Abrir imagem de exemplo
                  </a>
                </figcaption>
              </figure>
            </article>
          </section>

          {/* Observação sobre Produtos de Catálogo */}
          <section className="rounded-lg bg-transparent border border-yellow-300/40 p-6 shadow-lg shadow-black/40">
            <h3 className="mb-2 text-lg font-semibold text-yellow-300">Observação importante</h3>
            <p className="text-zinc-300">
              Alguns anúncios do Mercado Livre são <span className="font-semibold">Produtos de Catálogo</span>.
              Em certos casos, o Mercado Livre não permite a visualização de dados como{' '}
              <span className="font-semibold">número de visualizações</span>,{' '}
              <span className="font-semibold">% de conversão</span> e{' '}
              <span className="font-semibold">data de criação</span> do item. Nessas situações, a
              extensão poderá exibir campos vazios ou incompletos por limitação da própria
              plataforma.
            </p>
          </section>


        </div>
      </main>
    </div>
  );
};

export default ExtensaoNovaiPage;










