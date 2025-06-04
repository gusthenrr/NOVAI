// ContentCard.tsx
// Importa React, useState e useEffect do React, e FC (Functional Component) para tipagem
import React, { useState, useEffect, FC } from 'react';

// Define a interface para as props do componente ContentCard
interface ContentCardProps {
  imageUrls: string[] | undefined | null; // Lista de URLs de imagem, pode ser undefined ou null
  title: string;
  subtitle: string;
}

// Define o componente funcional ContentCard com tipagem para as props
const ContentCard: FC<ContentCardProps> = ({ imageUrls, title, subtitle }) => {
  // Estado para controlar o índice da imagem atualmente exibida, tipado como número
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Garante que imageUrls seja sempre um array, mesmo que undefined ou null seja passado
  const images: string[] = Array.isArray(imageUrls) ? imageUrls : [];
  const totalImages: number = images.length;

  // Efeito para resetar o currentIndex se a lista de imagens mudar
  // e a imagem atual se tornar inválida.
  useEffect(() => {
    if (totalImages > 0) {
      if (currentIndex >= totalImages) {
        setCurrentIndex(totalImages - 1);
      }
    } else {
      setCurrentIndex(0); // Se não houver imagens, reseta para 0
    }
  }, [imageUrls, currentIndex, totalImages]); // Adicionado totalImages como dependência explícita


  // Função para ir para a imagem anterior
  const goToPrevious = (): void => {
    // Só permite voltar se não estiver na primeira imagem
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : prevIndex));
  };

  // Função para ir para a próxima imagem
  const goToNext = (): void => {
    // Só permite avançar se não estiver na última imagem
    setCurrentIndex((prevIndex) => (prevIndex < totalImages - 1 ? prevIndex + 1 : prevIndex));
  };

  // Lógica de visibilidade das setas
  const showArrows: boolean = totalImages > 1;
  const showLeftArrow: boolean = showArrows && currentIndex > 0;
  const showRightArrow: boolean = showArrows && currentIndex < totalImages - 1;
  // Estilos para os botões de seta (CSSProperties para tipagem)
  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1, // Para garantir que as setas fiquem sobre a imagem
  };

  const leftArrowStyle: React.CSSProperties = {
    ...arrowStyle,
    left: '5px',
  };

  const rightArrowStyle: React.CSSProperties = {
    ...arrowStyle,
    right: '5px',
  };

  // Imagem atual a ser exibida. Se não houver imagens, usa um placeholder.
  const currentImageUrl: string = totalImages > 0 && images[currentIndex]
    ? images[currentIndex]
    : "https://placehold.co/200x150/cccccc/ffffff?text=Nenhuma+Imagem";


  return (
    // Container principal do card
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Container da Imagem e Setas */}
      <div
        style={{
          position: 'relative', // Necessário para posicionar as setas absolutamente
          width: '100%',
          maxWidth: '200px', // Largura máxima da imagem
          marginBottom: '0.75rem',
        }}
      >
        {/* Componente para o Título */}
      <h3
        style={{
          fontSize: '1.2rem',
          fontWeight: '600',
          color: '#333',
          margin: '0 0 0.25rem 0',
          textAlign: 'center',
          wordBreak: 'break-word',
        }}
      >
        {title}
      </h3>
        <img
          key={currentImageUrl + currentIndex} // Chave mais robusta para re-renderização
          src={currentImageUrl}
          alt={title ? `${title} - Imagem ${currentIndex + 1}` : `Imagem ${currentIndex + 1}`}
          style={{
            width: '100%',
            height: '150px', // Altura fixa para a imagem, ajuste conforme necessário
            objectFit: 'cover',
            borderRadius: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            display: 'block', // Remove espaço extra abaixo da imagem
          }}
          onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { // Tipagem do evento
            const target = e.target as HTMLImageElement; // Type assertion
            target.onerror = null; // Previne loop de erro
            target.src = `https://placehold.co/200x150/cccccc/ffffff?text=Erro+Img+${currentIndex + 1}`;
          }}
        />

        {/* Seta Esquerda */}
        {showLeftArrow && (
          <button style={leftArrowStyle} onClick={goToPrevious} aria-label="Imagem anterior">
            &lt;
          </button>
        )}

        {/* Seta Direita */}
        {showRightArrow && (
          <button style={rightArrowStyle} onClick={goToNext} aria-label="Próxima imagem">
            &gt;
          </button>
        )}
      </div>

      {/* Componente para o Subtítulo */}
      <ul style={{ 
    listStyleType: 'none',  // Remove os marcadores de lista padrão (bolinhas)
      padding: 0,             // Remove o padding padrão da tag <ul>
      margin: 0,              // Remove a margem padrão da tag <ul>
      maxHeight: '400px',     // Defina a altura máxima desejada para a lista.
                              // Ajuste este valor conforme necessário (ex: '50vh', '300px').
      overflowY: 'auto',      // Adiciona uma barra de rolagem vertical APENAS se o conteúdo exceder maxHeight.
                              // Use 'scroll' se quiser que a barra esteja sempre visível.
      border: '1px solid #eee', // Opcional: uma borda para visualizar a área da lista
      borderRadius: '4px',       // Margem padrão para a lista em si
    // Outros estilos para o contêiner da lista, se necessário
}}>
  <li style={{fontSize: '0.9rem',
  color: '#666',
  margin: '0', // O margin: 0 no item da lista pode fazer os itens ficarem muito juntos se houver vários.
  textAlign: 'center',
  wordBreak: 'break-word',}}>
    {subtitle}
  </li>
</ul>
    </div>
  );
};

// Componente principal da aplicação para demonstrar o ContentCard
const App: FC = () => { // Tipado como Functional Component
  const cardDataMultiImage = {
    imageUrls: [
      'https://placehold.co/300x200/8E44AD/FFFFFF?text=Imagem+1', // Roxo
      'https://placehold.co/300x200/3498DB/FFFFFF?text=Imagem+2', // Azul
      'https://placehold.co/300x200/E74C3C/FFFFFF?text=Imagem+3', // Vermelho
      'https://invalid-url-for-image-4.jpg', // URL inválida para teste de fallback
    ],
    title: 'Produto Incrível com Carrossel',
    subtitle: 'Navegue pelas imagens para ver mais detalhes deste produto fantástico.',
  };

  const cardDataSingleImage = {
    title: 'Item com Uma Imagem',
    imageUrls: ['https://placehold.co/300x200/2ECC71/FFFFFF?text=Apenas+Uma'],
    subtitle: 'Este card mostra como fica com apenas uma imagem (sem setas).',
  };
  
  const cardDataNoImage = {
    imageUrls: [], // Pode ser null ou undefined também: null
    title: 'Item Sem Imagens',
    subtitle: 'Este card demonstra o comportamento quando não há imagens.',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '2rem', backgroundColor: '#f0f0f0', minHeight: '100vh' }}>

      {/* Card com Múltiplas Imagens */}
      <div style={{ width: "25%", minWidth: "250px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #ddd",
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: "#fff",
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          }}
        >
          <ContentCard
            imageUrls={cardDataMultiImage.imageUrls}
            title={cardDataMultiImage.title}
            subtitle={cardDataMultiImage.subtitle}
          />
        </div>
      </div>

      {/* Card com Uma Imagem */}
      <div style={{ width: "25%", minWidth: "250px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #ddd",
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: "#fff",
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          }}
        >
          <ContentCard
            imageUrls={cardDataSingleImage.imageUrls}
            title={cardDataSingleImage.title}
            subtitle={cardDataSingleImage.subtitle}
          />
        </div>
      </div>
      
      {/* Card Sem Imagens */}
      <div style={{ width: "25%", minWidth: "250px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #ddd",
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: "#fff",
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          }}
        >
          <ContentCard
            imageUrls={cardDataNoImage.imageUrls}
            title={cardDataNoImage.title}
            subtitle={cardDataNoImage.subtitle}
          />
        </div>
      </div>

    </div>
  );
};

export default ContentCard;
