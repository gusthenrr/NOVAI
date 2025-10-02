'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
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
  Settings,} from 'lucide-react';
import { useUser } from '../../../../userContext';

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
}

interface ActiveItem {
  item_id: string;
  nome_item: string;
  price: number;
  ranking_position: number;
  quantity_sold: number;
}
interface usuarioI{
  nickname: string,
  email: string,
}


const DashboardPromotionPage: React.FC = () => {
  const { token, setToken } = useUser();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [itemsAppliedToPromotions, setItemsAppliedToPromotions] = useState<ItemAppliedToPromotion[]>([]);
  const [activeItems, setActiveItems] = useState<ActiveItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemAppliedToPromotion | ActiveItem | null>(null);
  const [searchItem, setSearchItem] = useState('');
  const [user, setUser] = useState<usuarioI>({'nickname':'--','email':'--'});
  const [loading, setLoading] = useState({
    promotions: true,
    items: true,
    competitors: false,
  });
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? '', []);

  // Fetch promotions and items applied to promotions
  const fetchPromotionsAndItems = async () => {
    if (!token) return;
    setLoading(prev => ({ ...prev, promotions: true }));
    try {
      const response = await fetch(`${apiUrl}/promotions-and-items`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setPromotions(data.promotions);
      setItemsAppliedToPromotions(data.itemsAppliedToPromotions);
    } catch (error) {
      console.error("Error fetching promotions and items:", error);
    } finally {
      setLoading(prev => ({ ...prev, promotions: false, items: false }));
    }
  };

  // Fetch active items (vendedor's items)
  const fetchActiveItems = async () => {
    if (!token) return;
    setLoading(prev => ({ ...prev, items: true }));
    try {
      const response = await fetch(`${apiUrl}/active-items`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setActiveItems(data.activeItems);
    } catch (error) {
      console.error("Error fetching active items:", error);
    } finally {
      setLoading(prev => ({ ...prev, items: false }));
    }
  };

  // Fetch competitor data when selecting an item
  const fetchCompetitorData = async (itemId: string) => {
    if (!token) return;
    setLoading(prev => ({ ...prev, competitors: true }));
    try {
      const response = await fetch(`${apiUrl}/competitor-items`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({'item_id':itemId})
      });
      const data = await response.json();
      setSelectedItem(data.item);  // Update the selected item data
    } catch (error) {
      console.error("Error fetching competitor data:", error);
    } finally {
      setLoading(prev => ({ ...prev, competitors: false }));
    }
  };

  useEffect(() => {
    if (token) {
      fetchPromotionsAndItems();
      fetchActiveItems();  // Fetch active items on page load
      const nick = localStorage.getItem('novai_nickname') || '--';
      const email = localStorage.getItem('novai_email') || '--';
      setUser({'nickname':nick,'email':email});
    }
  }, [token]);

  const handleAddPromotion = () => {
    // Show a card to add a new promotion (simplified)
    // This should ideally open a modal or a new form card.
  };

  const handleSearchItem = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchItem(event.target.value);
  };

  const handleSelectItem = (itemId: string) => {
    // Fetch competitors for the selected item
    fetchCompetitorData(itemId);
  };

  return (
    <div className="flex min-h-screen bg-zinc-900 text-zinc-300 antialiased">
      <aside className="hidden w-64 flex-col rounded-r-lg bg-zinc-800 p-6 shadow-lg md:flex">
        {/* Sidebar */}
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
            {[{icon: Home, label: 'Início',link:'/dashboard'},
              { icon: BarChart2, label: 'Anúncios Métricas', link:'/dashboard/AnalyticsAnuncios'},
              { icon: Tag, label: 'Promoções', link:'/dashboard/Promotion'},
              { icon: MessageSquareWarning, label: 'Reclamações', link:'/dashboard/claims'},
              { icon: MessageSquare, label: 'Assistente Novai', link:'/Manager'},
              { icon: Puzzle, label: 'Novai Extensão', link:'/dashboard/ExtensaoNovai'},
              { icon: Settings, label:'Configurações', link:'/dashboard/config'}].map(item => (
              <li key={item.label} className="mb-2">
                <a href={item.link} className="flex items-center rounded-lg p-3 transition-colors hover:bg-zinc-700">
                  <item.icon className="mr-3 text-zinc-400" />
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
          <h1 className="text-2xl font-bold">Promoções</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleAddPromotion}
              className="flex items-center rounded-full p-2 transition-colors hover:bg-zinc-800"
            >
              <PlusCircle size={24} className="text-yellow-300" />
              Adicionar Nova Promoção
            </button>
          </div>
        </div>

        {/* Filtro */}
        <section className="mb-6 rounded-lg bg-zinc-800 p-6 shadow-md">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              placeholder="Pesquisar promoções"
              value={searchItem}
              onChange={handleSearchItem}
              className="w-full p-2 rounded-lg bg-zinc-700 text-zinc-300"
            />
          </div>
        </section>

        {/* Lista de promoções */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {loading.promotions ? (
            <div className="flex justify-center items-center">
              <Loader className="text-yellow-300" size={36} />
            </div>
          ) : (
            promotions.filter((promo) => promo.name.toLowerCase().includes(searchItem.toLowerCase())).map(promo => (
              <div key={promo.id_promotion} className="rounded-lg bg-zinc-800 p-6 shadow-md">
                <h2 className="text-xl font-bold text-yellow-300">{promo.name}</h2>
                <p className="text-sm text-zinc-400">{promo.status}</p>
                <p className="text-sm text-zinc-500">Início: {new Date(promo.start_date).toLocaleDateString()}</p>
                <p className="text-sm text-zinc-500">Fim: {new Date(promo.finish_date).toLocaleDateString()}</p>
                <button
                  onClick={() => {}}
                  className="mt-4 text-yellow-300 hover:underline"
                >
                  Ver Detalhes
                </button>
              </div>
            ))
          )}
        </section>

        {/* Itens aplicados às promoções */}
        <section className="mt-6 rounded-lg bg-zinc-800 p-6 shadow-md">
          <h2 className="text-xl font-bold text-yellow-300">Itens Aplicados às Promoções</h2>
          <div className="overflow-y-auto h-64">
            {loading.items ? (
              <div className="flex justify-center items-center">
                <Loader className="text-yellow-300" size={36} />
              </div>
            ) : (
              itemsAppliedToPromotions.map(item => (
                <div key={item.item_id} className="flex items-center justify-between p-4 bg-zinc-700 rounded-lg mb-4">
                  <div className="flex items-center space-x-4">
                    <img src={item.image_url} alt={item.nome_item} className="w-12 h-12 object-cover" />
                    <span className="text-sm text-zinc-300">{item.nome_item}</span>
                  </div>
                  <span className="text-sm text-zinc-500">{item.promotion_name}</span>
                  <button
                    onClick={() => handleSelectItem(item.item_id)}
                    className="ml-4 bg-yellow-300 text-zinc-900 p-2 rounded-full hover:bg-yellow-400"
                    title="Renovar Promoção Automática"
                  >
                    <span className="text-lg">!</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Itens para pesquisar e comparar com concorrentes */}
        <section className="mt-6 rounded-lg bg-zinc-800 p-6 shadow-md">
          <h2 className="text-xl font-bold text-yellow-300">Desempenho do Item</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Pesquise um item"
              className="w-full p-2 rounded-lg bg-zinc-700 text-zinc-300"
            />
            <p className="text-sm text-zinc-400">Pesquise um item seu e veja o desempenho dele em comparação com concorrentes.</p>
            {loading.competitors ? (
              <div className="flex justify-center items-center">
                <Loader className="text-yellow-300" size={36} />
              </div>
            ) : (
              // Aqui vai o gráfico ou a lista de itens concorrentes
              <div>
                {/* Renderizar informações de concorrentes */}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default DashboardPromotionPage;









