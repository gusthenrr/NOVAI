// Arquivo: BotaoDeFiltro.tsx
import React, { useState, useEffect, useCallback } from 'react';

// Ícone de Filtro SVG simples
const IconeFiltro: React.FC<{ color?: string }> = ({ color = '#212529' }) => ( // Cor padrão ajustada
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginRight: '8px' }}
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
  </svg>
);

// Cores para o componente
const CORES_FILTRO = {
  // Cores do botão principal de filtro (fora do modal)
  textoPrimarioBotao: '#212529',
  textoSecundarioBotao: '#6c757d',
  fundoBotaoPrincipal: '#FFFFFF',
  bordaBotaoPrincipal: '#CED4DA',
  hoverBotaoPrincipalFundo: '#F8F9FA',
  hoverBordaBotaoPrincipal: '#adb5bd', // Nova cor para hover da borda do botão principal

  // Cores do Modal (Tema escuro com detalhes amarelos)
  fundoOverlay: 'rgba(0, 0, 0, 0.65)',
  fundoModal: '#1E1E1E', // Preto/Cinza bem escuro
  textoModalPrincipal: '#F0F0F0', // Branco suave
  amareloLightDetalhe: '#FFEEA9', // Amarelo para seleção e destaques
  fundoOpcaoHover: '#2A2A2A', // Fundo sutil para hover nas opções

  // Cores do botão "Filtrar" dentro do modal
  botaoAplicarFundo: '#FFEEA9', // Amarelo Light
  botaoAplicarTexto: '#1A1A1A',   // Texto preto
  botaoAplicarHoverFundo: '#FFF9C4', // Amarelo um pouco mais claro/intenso no hover
};

export type FiltroOpcao = "Todos" | "Pendentes" | "Respondidas pela NOVAI";

interface BotaoDeFiltroProps {
  onFiltroAplicado: (filtro: FiltroOpcao) => void;
  filtroInicial?: FiltroOpcao;
}

const BotaoDeFiltro: React.FC<BotaoDeFiltroProps> = ({
  onFiltroAplicado,
  filtroInicial = "Todos",
}) => {
  const [modalAberto, setModalAberto] = useState(false);
  const [selecaoTemporaria, setSelecaoTemporaria] = useState<FiltroOpcao>(filtroInicial);
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroOpcao>(filtroInicial);
  const [hoverBotaoPrincipal, setHoverBotaoPrincipal] = useState(false);
  const [hoverBotaoAplicar, setHoverBotaoAplicar] = useState(false);
  const [opcaoEmHover, setOpcaoEmHover] = useState<FiltroOpcao | null>(null);

  const opcoesFiltro: FiltroOpcao[] = ["Pendentes", "Todos", "Respondidas pela NOVAI"];

  const abrirModal = () => {
    setSelecaoTemporaria(filtroAtivo);
    setModalAberto(true);
  };

  const fecharModal = useCallback(() => {
    setModalAberto(false);
  }, []);

  const lidarComAplicarFiltro = () => {
    setFiltroAtivo(selecaoTemporaria);
    onFiltroAplicado(selecaoTemporaria);
    fecharModal();
  };

  useEffect(() => {
    const lidarComTeclaEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        fecharModal();
      }
    };
    if (modalAberto) {
      document.addEventListener('keydown', lidarComTeclaEsc);
    }
    return () => {
      document.removeEventListener('keydown', lidarComTeclaEsc);
    };
  }, [modalAberto, fecharModal]);

  const estiloBotaoFiltroPrincipal: React.CSSProperties = {
    padding: '0.6rem 1rem',
    fontSize: '0.95rem',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
    color: CORES_FILTRO.textoPrimarioBotao,
    backgroundColor: CORES_FILTRO.fundoBotaoPrincipal,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: CORES_FILTRO.bordaBotaoPrincipal,
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  };

  const estiloBotaoFiltroHover: React.CSSProperties = {
    backgroundColor: CORES_FILTRO.hoverBotaoPrincipalFundo,
    borderColor: CORES_FILTRO.hoverBordaBotaoPrincipal,
    boxShadow: '0 3px 6px rgba(0,0,0,0.07)',
  };

  const estiloOverlay: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: CORES_FILTRO.fundoOverlay,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 1050,
    opacity: modalAberto ? 1 : 0,
    visibility: modalAberto ? 'visible' : 'hidden',
    transition: 'opacity 0.25s ease, visibility 0.25s ease',
  };

  const estiloModalContainer: React.CSSProperties = {
    backgroundColor: CORES_FILTRO.fundoModal,
    color: CORES_FILTRO.textoModalPrincipal,
    padding: '1.5rem',
    borderRadius: '10px',
    boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
    width: '100%',
    maxWidth: '340px', // Modal menor
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
    transform: modalAberto ? 'scale(1)' : 'scale(0.95)',
    opacity: modalAberto ? 1 : 0,
    transition: 'transform 0.25s ease-out, opacity 0.25s ease-out',
  };

  const estiloTituloModal: React.CSSProperties = {
    marginTop: 0,
    marginBottom: '1.25rem',
    fontSize: '1.15rem',
    color: CORES_FILTRO.textoModalPrincipal,
    fontWeight: 600,
    borderBottom: `1px solid ${CORES_FILTRO.fundoOpcaoHover}`, // Linha sutil abaixo do título
    paddingBottom: '0.75rem',
  };

  const estiloOpcoesContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  };

  const criarEstiloOpcao = (opcao: FiltroOpcao, selecionada: boolean, hover: boolean): React.CSSProperties => {
    let backgroundColor = CORES_FILTRO.fundoModal; // Fundo padrão (transparente em relação ao modal)
    let textColor = CORES_FILTRO.textoModalPrincipal;
    let borderBottomColor = 'transparent';

    if (selecionada) {
      textColor = CORES_FILTRO.amareloLightDetalhe;
      borderBottomColor = CORES_FILTRO.amareloLightDetalhe;
    } else if (hover) {
      backgroundColor = CORES_FILTRO.fundoOpcaoHover;
      // textColor = CORES_FILTRO.amareloLightDetalhe; // Opcional: texto amarelo no hover
    }

    return {
      padding: '0.75rem 0.5rem',
      border: 'none',
      borderBottom: `2px solid ${borderBottomColor}`,
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'left',
      backgroundColor: backgroundColor,
      color: textColor,
      fontWeight: selecionada ? 600 : 400,
      transition: 'background-color 0.2s ease, color 0.2s ease, border-bottom-color 0.2s ease',
      width: '100%',
      boxSizing: 'border-box',
      fontSize: '0.9rem',
    };
  };
  
  const estiloBotaoAplicarFiltro: React.CSSProperties = {
    width: '100%',
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: CORES_FILTRO.botaoAplicarTexto,
    backgroundColor: CORES_FILTRO.botaoAplicarFundo,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, transform 0.1s ease',
    marginTop: '0.5rem',
  };
  
  const estiloBotaoAplicarFiltroHover: React.CSSProperties = {
     backgroundColor: CORES_FILTRO.botaoAplicarHoverFundo,
     transform: 'scale(1.02)',
  };

  return (
    <>
      <button
        style={hoverBotaoPrincipal ? {...estiloBotaoFiltroPrincipal, ...estiloBotaoFiltroHover} : estiloBotaoFiltroPrincipal}
        onClick={abrirModal}
        onMouseEnter={() => setHoverBotaoPrincipal(true)}
        onMouseLeave={() => setHoverBotaoPrincipal(false)}
      >
        <IconeFiltro color={CORES_FILTRO.textoPrimarioBotao} />
        Filtros
        {filtroAtivo !== "Todos" && (
          <span style={{ marginLeft: '8px', color: CORES_FILTRO.textoSecundarioBotao, fontSize: '0.85em' }}>
            ({filtroAtivo})
          </span>
        )}
      </button>

      {modalAberto && (
        <div style={estiloOverlay} onClick={fecharModal}>
          <div style={estiloModalContainer} onClick={(e) => e.stopPropagation()}>
            <h3 style={estiloTituloModal}>Filtrar por status</h3>
            <div style={estiloOpcoesContainer}>
              {opcoesFiltro.map((opcao) => (
                <button
                  key={opcao}
                  style={criarEstiloOpcao(opcao, selecaoTemporaria === opcao, opcaoEmHover === opcao)}
                  onClick={() => setSelecaoTemporaria(opcao)}
                  onMouseEnter={() => setOpcaoEmHover(opcao)}
                  onMouseLeave={() => setOpcaoEmHover(null)}
                >
                  {opcao}
                </button>
              ))}
            </div>
            <button
              style={hoverBotaoAplicar ? {...estiloBotaoAplicarFiltro, ...estiloBotaoAplicarFiltroHover } : estiloBotaoAplicarFiltro}
              onClick={lidarComAplicarFiltro}
              onMouseEnter={() => setHoverBotaoAplicar(true)}
              onMouseLeave={() => setHoverBotaoAplicar(false)}
            >
              Filtrar
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default BotaoDeFiltro;