'use client';
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
declare global {
  interface Window {
    __redirecting__?: boolean;
  }
}
// Componente da Tela de Carregamento
const LoadingScreen = ({ mensagem }: { mensagem: string }) => {
  // --- Estilos CSS-in-JS para manter tudo em um único arquivo ---
  const styles: { [key: string]: React.CSSProperties } = {
    loadingOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a1a', // Um fundo escuro e sofisticado
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      zIndex: 9999,
      fontFamily: "'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",
      transition: 'opacity 0.5s ease-out',
    },
    animationContainer: {
      width: '180px',
      height: '180px',
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
    svgStyle: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      animation: 'rotate 12s linear infinite',
    },
    pathStyle: {
      stroke: 'rgba(255, 255, 255, 0.1)',
      strokeWidth: '1',
      fill: 'none',
    },
    dotStyle: {
      fill: '#FFF159', // Amarelo do Mercado Livre
      animation: 'pulse 1.5s ease-in-out infinite',
      transformOrigin: 'center center',
    },
        logoText: {
        color: '#ffffff',
        fontSize: '32px',
        fontWeight: '600',
        letterSpacing: '1px',
        // Adiciona uma borda preta de 1px ao redor do texto para melhor contraste
        textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
        },
    // Container para a mensagem, para controlar o overflow da animação
    messageContainer: {
      marginTop: '30px',
      width: '320px',
      height: '50px', // Altura suficiente para o texto
      overflow: 'hidden',
      position: 'relative',
    },
    loadingMessage: {
      color: '#b0b0b0',
      fontSize: '16px',
      textAlign: 'center',
      lineHeight: '1.5',
      position: 'absolute',
      width: '100%',
      // Aplica a nova animação de escrita
      animation: 'slideAndFade 5s ease-in-out infinite',
    },
  };

  // --- Keyframes para as animações ---
  const keyframes = `
    @keyframes rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes pulse {
      0%, 100% {
        transform: scale(0.8);
        opacity: 0.7;
      }
      50% {
        transform: scale(1.2);
        opacity: 1;
      }
    }
    /* Nova animação para a mensagem de texto */
    @keyframes slideAndFade {
      0% { /* Texto visível e parado */
        transform: translate(0, 0);
        opacity: 1;
      }
      40% { /* Permanece visível */
        transform: translate(0, 0);
        opacity: 1;
      }
      50% { /* Desliza para baixo e some */
        transform: translate(0, 25px);
        opacity: 0;
      }
      51% { /* Move-se para a esquerda, invisível (preparando para reaparecer) */
        transform: translate(-100%, 0);
      }
      60% { /* Pausa à esquerda, ainda invisível */
        transform: translate(-100%, 0);
        opacity: 0;
      }
      100% { /* Desliza da esquerda para o centro e aparece */
        transform: translate(0, 0);
        opacity: 1;
      }
    }
  `;

  return (
    <>
      <style>{keyframes}</style>
      <div style={styles.loadingOverlay}>
        <div style={styles.animationContainer}>
          {/* Animação de fundo com SVG
            A propriedade viewBox foi ajustada de "0 0 100 100" para "-5 -5 110 110".
            Isso cria uma "margem" de 5px em todos os lados dentro da área de desenho do SVG,
            evitando que as bolinhas sejam cortadas ao pulsar nas bordas.
          */}
          <svg style={styles.svgStyle} viewBox="-5 -5 110 110">
            {/* Círculos de órbita */}
            <path style={styles.pathStyle} d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0"></path>
            <path style={styles.pathStyle} d="M 50,50 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0"></path>
            <path style={styles.pathStyle} d="M 50,50 m -20,0 a 20,20 0 1,1 40,0 a 20,20 0 1,1 -40,0"></path>
            
            {/* Pontos pulsantes */}
            <circle style={{...styles.dotStyle, animationDelay: '0s'}} cx="50" cy="10" r="3"></circle>
            <circle style={{...styles.dotStyle, animationDelay: '0.2s'}} cx="90" cy="50" r="3"></circle>
            <circle style={{...styles.dotStyle, animationDelay: '0.4s'}} cx="50" cy="90" r="3"></circle>
            <circle style={{...styles.dotStyle, animationDelay: '0.6s'}} cx="10" cy="50" r="3"></circle>
            <circle style={{...styles.dotStyle, animationDelay: '0.8s'}} cx="78" cy="22" r="2"></circle>
            <circle style={{...styles.dotStyle, animationDelay: '1s'}} cx="22" cy="78" r="2"></circle>
          </svg>
          
          {/* Texto da Logo no centro */}
          <span style={styles.logoText}>NOVAI</span>
        </div>
        
        {/* Container da Mensagem de Carregamento */}
        <div style={styles.messageContainer}>
          <p style={styles.loadingMessage}>
           {mensagem}
          </p>
        </div>
      </div>
    </>
  );
};

// Componente principal da aplicação para demonstração
export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const[mensagem, setMensagem] = useState('Estamos nos preparando para sincronizar seus dados, não saia dessa pagina')
  const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
  transports: ['websocket'],
  withCredentials: true, // ✅ necessário para enviar cookies (incl. HttpOnly)
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 20000 // 20s
});

  // Simula o carregamento de dados
 useEffect(() => {
    console.log('Tela de loadig')
    console.log('mudou alguma coisa nessa desgraça')
    socket.emit('pegar_dados_inicias');
    socket.on('guardar_token', (resp)=>{
    console.log('entrou no guardar_token')
    if (resp){
      console.log('entrou no if do resp')
      console.log(resp)
      localStorage.setItem("authToken", resp.token);    
    }
    })
    socket.on('status_loading', (dados)=>{
      console.log(dados)
      setMensagem(dados.message)
      if (dados.status){
      if (window.__redirecting__) return;
      window.__redirecting__ = true;

    // 1) desconecta o socket
    socket.once('disconnect', () => {
      // 2) redireciona após desconectar
      window.location.replace('/manager');
    });
    socket.disconnect(); // ou socket.close()
    }
    })

  }, []);

  // Estilo para o conteúdo principal da página
  const mainContentStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f0f0f0',
    color: '#333',
    fontFamily: "'Inter', sans-serif",
  };

  return (
    <div>
      {isLoading ? (
        <LoadingScreen mensagem={mensagem} />
      ) : (
        <div style={mainContentStyle}>
          <h1>Conteúdo Principal Carregado!</h1>
        </div>
      )}
    </div>
  );

}









