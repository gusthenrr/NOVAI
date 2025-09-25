import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
// Icons from Lucide React
import {
  User,
  Home,
  FileText,
  MessageSquare,
  Bell,
  MapPin,
  BarChart2,
  Share2,
  Heart,
  Star,
  ArrowLeft
} from 'lucide-react';
type DadosGerais = {
  total_amount?: string;
  visualisacoes_hoje?: string;
};
// Main App component
const App: React.FC = () => {
const [dadosGerais, setDadosGerais] = useState<DadosGerais>({})
const [vendidosHoje, setVendidosHoje] = useState()
const [visuHoje, setVisuHoje] = useState()
  
  useEffect(() => {
    // A inicialização do socket pode ficar fora da função get_conversation, pois ela só precisa ser feita uma vez.
    if(!socketRef.current){
      socketRef.current = io(process.env.NEXT_PUBLIC_API_URL!, {
        transports: ['websocket'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        timeout: 20000 // 20s
    });
    }
const tok = localStorage.getItem('authToken');
    if (tok) setToken(tok);
const get_dados = async () => {
        try {
            console.log('entrou no get_dados');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/get_dados_gerais`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tok}`,
                },
            });
  const atualizar_dados = ({
    total_amount,
    visualisacoes_hoje,
  }: {
    total_amount: string;
    visualisacoes_hoje: string;
  }) => {
    setDadosGerais(prev => ({
      ...prev,
      total_amount,
      visualisacoes_hoje,
    }));
  };
  socketRef.current?.on('atualizar_dados', atualizar_dados);
}
  get_dados()
  },[])
  
  return (
    // The main container for the dashboard, using a dark background color.
    <div className="flex min-h-screen bg-zinc-900 text-zinc-300 antialiased">
      {/* Sidebar section - fixed */}
      <aside className="hidden md:flex flex-col w-64 bg-zinc-800 p-6 rounded-r-lg shadow-lg">
        {/* User profile section */}
        <div className="mb-8">
          <div className="flex items-center justify-center p-2 rounded-full bg-zinc-700 text-zinc-500 mb-4 w-16 h-16 mx-auto">
            <User size={36} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">JOHN DON</h1>
            <p className="text-sm text-zinc-400">johndon@company.com</p>
          </div>
        </div>

        {/* Navigation menu */}
        <nav>
          <ul>
            <li className="mb-2">
              <a href="#" className="flex items-center p-3 rounded-lg hover:bg-zinc-700 transition-colors">
                <Home className="mr-3 text-yellow-300" />
                Início
              </a>
            </li>
            <li className="mb-2">
              <a href="#" className="flex items-center p-3 rounded-lg hover:bg-zinc-700 transition-colors">
                <FileText className="mr-3 text-zinc-400" />
                Arquivos
              </a>
            </li>
            <li className="mb-2">
              <a href="#" className="flex items-center p-3 rounded-lg hover:bg-zinc-700 transition-colors">
                <MessageSquare className="mr-3 text-zinc-400" />
                Mensagens
              </a>
            </li>
            <li className="mb-2">
              <a href="#" className="flex items-center p-3 rounded-lg hover:bg-zinc-700 transition-colors">
                <Bell className="mr-3 text-zinc-400" />
                Notificações
              </a>
            </li>
            <li className="mb-2">
              <a href="#" className="flex items-center p-3 rounded-lg hover:bg-zinc-700 transition-colors">
                <MapPin className="mr-3 text-zinc-400" />
                Localização
              </a>
            </li>
            <li className="mb-2">
              <a href="#" className="flex items-center p-3 rounded-lg hover:bg-zinc-700 transition-colors">
                <BarChart2 className="mr-3 text-zinc-400" />
                Gráficos
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content area, structured as a flex column */}
      <main className="flex-1 flex flex-col p-6">
        {/* Top header - remains fixed at the top of the main area */}
        <div className="flex justify-between items-center mb-6">
          <button className="md:hidden p-2 rounded-full hover:bg-zinc-800 transition-colors">
            <ArrowLeft />
          </button>
          <h1 className="text-2xl font-bold">Painel de Controle</h1>
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
              <BarChart2 />
            </button>
            <a href="/Manager" className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
              <MessageSquare />
            </a>
            <button className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
              <Bell />
            </button>
          </div>
        </div>
        
        {/* Scrollable content area below the header */}
        <div className="flex-1 overflow-y-auto space-y-6 -m-6 p-6">
          {/* Top cards grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-zinc-800 p-6 rounded-lg shadow-md flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Ganhos Hoje</p>
                <h2 className="text-2xl font-bold text-yellow-300">${dadosGerais.total_amount}</h2>
              </div>
              <BarChart2 size={36} className="text-yellow-300" />
            </div>
            <div className="bg-zinc-800 p-6 rounded-lg shadow-md flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Visualisações Hoje</p>
                <h2 className="text-2xl font-bold text-yellow-300">${dadosGerais.visualisacoes_hoje}</h2>
              </div>
              <Share2 size={36} className="text-yellow-300" />
            </div>
            <div className="bg-zinc-800 p-6 rounded-lg shadow-md flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Curtidas</p>
                <h2 className="text-2xl font-bold text-yellow-300">1259</h2>
              </div>
              <Heart size={36} className="text-yellow-300" />
            </div>
            <div className="bg-zinc-800 p-6 rounded-lg shadow-md flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Classificação</p>
                <h2 className="text-2xl font-bold text-yellow-300">8.5</h2>
              </div>
              <Star size={36} className="text-yellow-300" />
            </div>
          </section>

          {/* Results section with empty graph block */}
          <section className="bg-zinc-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Resultado</h2>
              <button className="bg-zinc-700 text-zinc-400 px-4 py-2 rounded-lg hover:bg-zinc-600 transition-colors">Ver Agora</button>
            </div>
            {/* Placeholder for the bar chart */}
            <div className="w-full h-64 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-500">
              Espaço para o gráfico de barras
            </div>
          </section>

          {/* Bottom section with empty graph and info card */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-zinc-800 p-6 rounded-lg shadow-md">
              {/* Placeholder for the line chart */}
              <div className="w-full h-64 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-500">
                Espaço para o gráfico de linha
              </div>
            </div>
            <div className="bg-zinc-800 p-6 rounded-lg shadow-md space-y-4">
              <h2 className="text-xl font-bold">Informações</h2>
              <div className="w-full h-32 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-500">
                Espaço para o gráfico de rosca
              </div>
              <ul className="space-y-2 text-zinc-400">
                <li>Lorem ipsum dolor sit amet.</li>
                <li>Lorem ipsum dolor sit amet.</li>
                <li>Lorem ipsum dolor sit amet.</li>
                <li>Lorem ipsum dolor sit amet.</li>
              </ul>
              <button className="w-full bg-zinc-700 text-zinc-400 px-4 py-2 rounded-lg hover:bg-zinc-600 transition-colors">
                Ver Agora
              </button>
            </div>
          </section>

          {/* Adding more content to make the page scrollable */}
          <section className="bg-zinc-800 p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">Mais Conteúdo</h2>
            <p className="text-zinc-400">
              Adicionei este bloco de texto para garantir que a página tenha conteúdo suficiente para a barra de rolagem aparecer, permitindo que você veja o resultado do seu pedido.
            </p>
            <div className="w-full h-48 mt-4 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-500">
              Espaço para mais um gráfico ou elemento
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;








