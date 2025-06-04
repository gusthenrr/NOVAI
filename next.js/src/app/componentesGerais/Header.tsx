// Header.tsx
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation'; // <<<< ADIÇÃO IMPORTANTE

// CORES (como definido antes)
const CORES = {
  fundoCabecalho: 'black',
  textoPrincipal: '#FFFFFF',
  amareloLightDetalhe: '#FFEEA9',
  brancoSutilListra: 'rgba(255, 255, 255, 0.15)',
  sombraCabecalho: 'rgba(0, 0, 0, 0.3)',
  avatarFundo: '#FFFFFF',
  avatarTextoLetra: '#0070f3',
  popupFundo: '#333333',
  popupTexto: '#FFFFFF',
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
}

const CabecalhoOrganizado: React.FC<CabecalhoOrganizadoProps> = ({
  avatarLetra,
  userEmail,
  mostrarAvatar = false,
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
        </nav>

        {mostrarAvatar && avatarLetra && userEmail && (
          <AvatarDisplay letra={avatarLetra} email={userEmail} />
        )}
      </div>
    </header>
  );
};

export default CabecalhoOrganizado;