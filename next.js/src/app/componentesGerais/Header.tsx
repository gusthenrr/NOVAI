// Header.tsx
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation'; // <<<< ADIÇÃO IMPORTANTE

// CORES (como definido antes)
const CORES = {
  fundoCabecalho: 'black',
  textoPrincipal: ' #FFFFFF',
  amareloLightDetalhe: ' #FFEEA9',
  brancoSutilListra: 'rgba(255, 255, 255, 0.15)',
  sombraCabecalho: 'rgba(0, 0, 0, 0.3)',
  avatarFundo: '#FFFFFF',
  avatarTextoLetra: '#0070f3',
  popupFundo: '#333333',
  popupTexto: '#FFFFFF',
};
interface SettingsGearIconProps {
  onClick: () => void;
  isActive: boolean;
}

const SettingsGearIcon: React.FC<SettingsGearIconProps> = ({ onClick, isActive }) => {
  const [isHovered, setIsHovered] = useState(false);

  const buttonStyle: React.CSSProperties = {
    background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const showHighlight = isHovered || isActive;

  const iconStyle: React.CSSProperties = {
    width: '24px', height: '24px',
    fill: showHighlight ? CORES.amareloLightDetalhe : CORES.textoPrincipal,
    transition: 'fill 0.3s ease',
  };

  return (
    <button style={buttonStyle} onClick={onClick} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} aria-label="Abrir configurações">
      <svg style={iconStyle} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        {/* O caminho (path) abaixo foi corrigido para evitar o corte */}
        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84 c-0.24,0-0.43,0.17-0.47,0.41L9.2,5.29C8.61,5.53,8.08,5.85,7.58,6.23L5.2,5.27C5,5.19,4.75,5.26,4.63,5.48L2.71,8.8 c-0.12,0.2-0.07,0.47,0.12,0.61l2.03,1.58C4.82,11.36,4.8,11.68,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.2,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.5c-1.93,0-3.5-1.57-3.5-3.5 c0-1.93,1.57-3.5,3.5-3.5s3.5,1.57,3.5,3.5C15.5,13.93,13.93,15.5,12,15.5z" />
      </svg>
    </button>
  );
};
// --- Componente StyledLink (COM LÓGICA DE LINK ATIVO) ---
interface StyledLinkProps {
  href: string;
  children: React.ReactNode;
  isActive: boolean; // <<<< NOVA PROP para indicar se o link está ativo
}

const StyledLink: React.FC<StyledLinkProps> = ({ href, children, isActive }) => { // Recebe isActive
  const [isHovered, setIsHovered] = useState(false);

  const linkBaseStyle: React.CSSProperties = {
    fontFamily: '"Libre Baskerville", serif',
    fontWeight: 400,
    fontSize: '1.1rem',
    color: CORES.textoPrincipal,
    textDecoration: 'none',
    padding: '0.5rem 0',
    position: 'relative',
    transition: 'color 0.3s ease',
  };

  const linkActiveOrHoverStyle: React.CSSProperties = { // Renomeado para clareza
    color: CORES.amareloLightDetalhe,
  };

  const underLineBaseStyle: React.CSSProperties = { // Renomeado para clareza
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: CORES.amareloLightDetalhe,
    transformOrigin: 'left',
    transition: 'transform 0.3s ease-out',
  };

  // Determina se os estilos de destaque devem ser aplicados
  const showHighlightStyles = isHovered || isActive; // <<<< USA isActive AQUI

  const finalLinkStyle: React.CSSProperties = {
    ...linkBaseStyle,
    ...(showHighlightStyles && linkActiveOrHoverStyle), // Aplica se hover OU ativo
  };

  const finalUnderlineStyle: React.CSSProperties = {
    ...underLineBaseStyle,
    transform: showHighlightStyles ? 'scaleX(1)' : 'scaleX(0)', // Mostra/esconde a linha
  };

  return (
    <Link
      href={href}
      style={finalLinkStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      <span style={finalUnderlineStyle}></span>
    </Link>
  );
};

// --- Componente AvatarDisplay (permanece o mesmo) ---
interface AvatarDisplayProps {
  letra: string;
  email: string;
}
const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ letra, email }) => {
  const [hoverAvatar, setHoverAvatar] = useState(false);
  const avatarWrapperStyle: React.CSSProperties = { position: 'relative', cursor: 'pointer', };
  const avatarCirculoStyle: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', backgroundColor: CORES.avatarFundo, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CORES.avatarTextoLetra, fontWeight: 'bold', fontSize: '1rem', };
  const emailPopupStyle: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', backgroundColor: CORES.popupFundo, color: CORES.popupTexto, padding: '0.5rem 0.75rem', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', zIndex: 1010, fontSize: '0.875rem', opacity: hoverAvatar ? 1 : 0, visibility: hoverAvatar ? 'visible' : 'hidden', transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out', };
  return ( <div style={avatarWrapperStyle} onMouseEnter={() => setHoverAvatar(true)} onMouseLeave={() => setHoverAvatar(false)} > <div style={avatarCirculoStyle}>{letra}</div> <div style={emailPopupStyle}> <p style={{ margin: 0 }}>{email}</p> </div> </div> );
};


// --- Componente CabecalhoOrganizado (COM LÓGICA DE LINK ATIVO) ---
interface CabecalhoOrganizadoProps {
  avatarLetra?: string;
  userEmail?: string;
  mostrarAvatar?: boolean;
  onSettingsClick: () => void; // Função para avisar o pai que o ícone foi clicado
  isPanelActive: boolean;
}

const CabecalhoOrganizado: React.FC<CabecalhoOrganizadoProps> = ({
  avatarLetra,
  userEmail,
  mostrarAvatar = false,
  onSettingsClick, // Recebe a função do pai
  isPanelActive,   // Recebe o estado do pai
}) => {
  const currentPath = usePathname();

  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2.5rem', backgroundColor: CORES.fundoCabecalho, color: CORES.textoPrincipal, WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none', userSelect: 'none', boxShadow: `0 2px 5px ${CORES.sombraCabecalho}`, position: 'sticky', top: 0, zIndex: 1000,
  };
  const logoContainerStyle: React.CSSProperties = { width: '6.5rem', };
  const logoImageStyle: React.CSSProperties = { width: '100%', height: 'auto', display: 'block', };
  const secaoDireitaStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '2.5rem', };
  const navLinksContainerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '2.5rem', };

  // Array com os dados dos links para facilitar a renderização e a lógica do link ativo
  const linksNavegacao = [
    { href: "/analytics", label: "Faturamento" },
    { href: "/estoque", label: "Estoque" },
    { href: "/anuncios", label: "Anúncios" },
    { href: "/posvenda", label: "Pós-Venda" },
    { href: "/prevenda", label: "Pré-Venda" }, // Seu novo link adicionado
  ];

  return (
    <header style={headerStyle}>
      <div style={logoContainerStyle}>
        <img
          src="/NOVAI.png"
          alt="Logo Novai"
          style={logoImageStyle}
        />
      </div>

      <div style={secaoDireitaStyle}>
        <nav style={navLinksContainerStyle}>
          {linksNavegacao.map((link) => (
            <StyledLink
              key={link.href}
              href={link.href}
              // Define isActive comparando o href do link com o caminho atual
              isActive={currentPath === link.href} // <<<< PASSA A PROP isActive
            >
              {link.label}
            </StyledLink>
          ))}
          {/* AQUI USAMOS A ENGRENAGEM, PASSANDO AS PROPS CORRETAS */}
        </nav>
        <SettingsGearIcon 
            onClick={onSettingsClick} // Chama a função do pai ao clicar
            isActive={isPanelActive} // A cor depende do estado do pai
          />
        {mostrarAvatar && avatarLetra && userEmail && (
          <AvatarDisplay letra={avatarLetra} email={userEmail} />
        )}
      </div>
    </header>
  );
};

export default CabecalhoOrganizado;