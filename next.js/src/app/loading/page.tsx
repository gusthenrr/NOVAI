'use client';
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

declare global {
  interface Window {
    __redirecting__?: boolean;
  }
}

// Componente da Tela de Carregamento
const LoadingScreen = ({ mensagem }: { mensagem: string }) => {
  const styles: { [key: string]: React.CSSProperties } = {
    loadingOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a1a',
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
      fill: '#FFF159',
      animation: 'pulse 1.5s ease-in-out infinite',
      transformOrigin: 'center center',
    },
    logoText: {
      color: '#ffffff',
      fontSize: '32px',
      fontWeight: 600,
      letterSpacing: '1px',
      textShadow:
        '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
    },
    messageContainer: {
      marginTop: '30px',
      width: '320px',
      height: '50px',
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
      animation: 'slideAndFade 5s ease-in-out infinite',
    },
  };

  const keyframes = `
    @keyframes rotate { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
    @keyframes pulse {
      0%, 100% { transform: scale(0.8); opacity: 0.7; }
      50%      { transform: scale(1.2); opacity: 1; }
    }
    @keyframes slideAndFade {
      0%   { transform: translate(0, 0);     opacity: 1; }
      40%  { transform: translate(0, 0);     opacity: 1; }
      50%  { transform: translate(0, 25px);  opacity: 0; }
      51%  { transform: translate(-100%, 0); opacity: 0; }
      60%  { transform: translate(-100%, 0); opacity: 0; }
      100% { transform: translate(0, 0);     opacity: 1; }
    }
  `;

  return (
    <>
      <style>{keyframes}</style>
      <div style={styles.loadingOverlay}>
        <div style={styles.animationContainer}>
          <svg style={styles.svgStyle} viewBox="-5 -5 110 110">
            <path style={styles.pathStyle} d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" />
            <path style={styles.pathStyle} d="M 50,50 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0" />
            <path style={styles.pathStyle} d="M 50,50 m -20,0 a 20,20 0 1,1 40,0 a 20,20 0 1,1 -40,0" />
            <circle style={{ ...styles.dotStyle, animationDelay: '0s' }}   cx="50" cy="10" r="3" />
            <circle style={{ ...styles.dotStyle, animationDelay: '0.2s' }} cx="90" cy="50" r="3" />
            <circle style={{ ...styles.dotStyle, animationDelay: '0.4s' }} cx="50" cy="90" r="3" />
            <circle style={{ ...styles.dotStyle, animationDelay: '0.6s' }} cx="10" cy="50" r="3" />
            <circle style={{ ...styles.dotStyle, animationDelay: '0.8s' }} cx="78" cy="22" r="2" />
            <circle style={{ ...styles.dotStyle, animationDelay: '1s' }}   cx="22" cy="78" r="2" />
          </svg>
          <span style={styles.logoText}>NOVAI</span>
        </div>
        <div style={styles.messageContainer}>
          <p style={styles.loadingMessage}>{mensagem}</p>
        </div>
      </div>
    </>
  );
};

type VerificarStatusAck = { status: string; token?: string };
type GuardarTokenEvt = { token?: string };
type StatusLoadingEvt = { message?: string; status?: boolean };

export default function App() {
  const [mensagem, setMensagem] = useState(
    'Estamos nos preparando para sincronizar seus dados, não saia desta página.'
  );
  const [showLoading, setShowLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL as string;
    const socket = io(url, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 20000, // 20s
    });

    socketRef.current = socket;
    console.log('Tela de loading montada');

    // 1) Verificar status (ACK do servidor)
    socket.emit('verificar_status', (resp: VerificarStatusAck) => {
      if (resp?.status === 'Sem Token') {
        window.location.replace('/login');
        return;
      }

      // Guarda token se vier no ACK (menos seguro que HttpOnly cookie)
      if (resp?.token) {
        try {
          localStorage.setItem('authToken', resp.token);
        } catch {
          /* ignore */
        }
      }

      if (resp?.status === 'sync_nao_iniciada') {
        socket.emit('pegar_dados_iniciais');
      }

      setShowLoading(true);
    });

    // 2) Guardar token por evento
    socket.on('guardar_token', (resp: GuardarTokenEvt) => {
      if (resp?.token) {
        try {
          localStorage.setItem('authToken', resp.token);
        } catch {
          /* ignore */
        }
      }
    });

    // 3) Atualizações de status de loading
    socket.on('status_loading', (dados: StatusLoadingEvt) => {
      if (dados?.message) setMensagem(dados.message);

      if (dados?.status) {
        // Concluído → desconectar e redirecionar
        if (window.__redirecting__) return;
        window.__redirecting__ = true;

        socket.once('disconnect', () => {
          window.location.replace('/Manager');
        });
        socket.disconnect();
      }
    });

    // Cleanup ao desmontar
    return () => {
      socket.off('guardar_token');
      socket.off('status_loading');
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  if (!showLoading) {
    return (
      <div>
        <span>...</span>
      </div>
    );
  }

  return <LoadingScreen mensagem={mensagem} />;
}
