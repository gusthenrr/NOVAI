'use client'

import React, { useState, useEffect, useRef } from 'react';
import RespostaFormatada from '../componentesGerais/respostaFormatada'; 
import { io } from 'socket.io-client';

// --- Tipos para maior segurança e clareza ---
interface Message {
  id: number;
  text: string;
  sender: 'ai' | 'user';
}

interface ChatHistoryPart {
    text: string;
}

interface ChatHistory {
    role: 'user' | 'model';
    parts: ChatHistoryPart[];
}

interface SendIconProps {
  isDisabled: boolean;
}

interface ChatInputProps {
  onSendMessage: (messageText: string) => void;
  isLoading: boolean;
}
type RespostaBonitaProps = {
  resposta: string;
};

// --- Ícones SVG para uma interface clean ---
const SendIcon: React.FC<SendIconProps> = ({ isDisabled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 2L11 13" stroke={isDisabled ? "#555" : "#1A1A1A"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={isDisabled ? "#555" : "#1A1A1A"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// --- Componente Principal da Aplicação ---
export default function NovaiApp(): JSX.Element {
  // --- Estados Globais da Aplicação ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const chatHistoryRef = useRef<ChatHistory[]>([]); // Mantém o histórico para a API
  const [token, setToken] = useState('')
  const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
  transports: ['websocket'],
  withCredentials: true, // ✅ necessário para enviar cookies (incl. HttpOnly)
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 20000 // 20s
});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Efeito inicial para a mensagem de boas-vindas
  useEffect(() => {
    const tok = localStorage.getItem('authToken');
    if (tok) setToken(tok);
    
    const initialMessage = 'Olá. Eu sou a Novai Manager. Seus dados estão conectados. Como posso ajudar hoje?';
    setMessages([
      { id: Date.now(), text: initialMessage, sender: 'ai' }
    ]);
    chatHistoryRef.current = [
        { role: "model", parts: [{ text: initialMessage }] }
    ];
  }, []);

  // Scroll automático para novas mensagens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);
  
  // Efeito para injetar estilos dinâmicos no DOM (apenas no lado do cliente)
  useEffect(() => {
    const dynamicStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');
      
      .navItem:hover {
          background-color: #252525;
          color: #FFF;
      }
      
      .inputField:focus {
          border-color: #F8DD82;
      }
      
      .sendButton:disabled {
          background-color: #3A3A3C;
          cursor: not-allowed;
      }
      
      @keyframes-typing {
        0% { transform: translateY(0px) }
        50% { transform: translateY(-3px) }
        100% { transform: translateY(0px) }
      }
      
      .typingIndicator span {
          width: 8px; height: 8px;
          border-radius: 50%;
          background-color: #8E8E93;
          animation: keyframes-typing 1s infinite ease-in-out;
      }
      .typingIndicator span:nth-child(2) { animation-delay: 0.2s; }
      .typingIndicator span:nth-child(3) { animation-delay: 0.4s; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = dynamicStyles;
    document.head.appendChild(styleSheet);

    // Função de limpeza para remover a folha de estilos quando o componente for desmontado
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []); // O array vazio assegura que este efeito só é executado uma vez

  // --- Lógica de Interação com a API do Gemini ---
  const callOpenaiApi = async (prompt: string): Promise<string> => {
    setIsLoading(true);
    console.log("Chamando a API com o prompt:", prompt);
    try {
      socketio.emit('chat_novai_manager',{message:prompt})
      socketio.on('resposta_mensagem', (resp)=>{
        if (resp) {
        const aiResponseText = result.resposta_final;
        // Atualiza o histórico para manter a conversa fluindo
        chatHistoryRef.current.push({ role: "user", parts: [{ text: prompt }] });
        chatHistoryRef.current.push({ role: "model", parts: [{ text: aiResponseText }] });
        return aiResponseText;
      } else {
        // Se a resposta for bloqueada por segurança ou vier vazia
        return "Não consegui processar essa informação. Podemos tentar de outra forma?";
      }
      })
    } catch (error) {
      console.error("Chat_novai_manager failed:", error);
      return "Desculpe, ocorreu um erro de conexão. Por favor, tente novamente.";
    } finally {
      setIsLoading(false);
    }
  };

  // --- Manipuladores de Eventos ---
  const handleSendMessage = async (messageText: string): Promise<void> => {
    if (messageText.trim() === '' || isLoading) return;

    const userMessage: Message = { id: Date.now(), text: messageText, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);

    // O prompt é simplesmente a mensagem do usuário, pois o contexto é mantido no histórico.
    const aiResponseText = await callOpenaiApi(messageText);
    const aiMessage: Message = { id: Date.now() + 1, text: aiResponseText, sender: 'ai' };
    setMessages(prev => [...prev, aiMessage]);
  };

  // --- Renderização da UI ---
  return (
    <div style={styles.appContainer}>
      <div style={styles.backgroundGradient}></div>

      {/* PAINEL ESQUERDO - NAVEGAÇÃO/MARCA */}
      <aside style={styles.leftPanel}>
        <div style={styles.logo}>
          NOVAI
        </div>
        <nav style={styles.nav}>
          <a href="#" style={{...styles.navItem, ...styles.navItemActive}}>Novai Manager</a>
          <a href="#" style={styles.navItem}>Dashboard</a>
          <a href="#" style={styles.navItem}>Relatórios</a>
        </nav>
        <div style={styles.footer}>
          &copy; {new Date().getFullYear()} Novai Inc.
        </div>
      </aside>

      {/* PAINEL CENTRAL - CHAT */}
      <main style={styles.chatPanel}>
        <header style={styles.chatHeader}>
          <h2 style={styles.chatTitle}>Novai Manager</h2>
          <p>Converse com seus dados em tempo real</p>
        </header>
        <div style={styles.messageList}>
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                ...styles.messageBubble,
                ...(msg.sender === 'user' ? styles.userBubble : styles.aiBubble),
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {msg.sender === 'ai' ? (
                <RespostaFormatada resposta={msg.text} />
              ) : (
                msg.text
              ) 
            }
            </div>
          ))}
          {isLoading && (
            <div style={{...styles.messageBubble, ...styles.aiBubble, alignSelf: 'flex-start'}}>
                <div style={styles.typingIndicator}><span></span><span></span><span></span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>
    </div>
  );
}

// --- Componente de Input do Chat ---
const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [text, setText] = useState<string>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSendMessage(text);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} style={styles.inputForm}>
      <input
        type="text"
        style={styles.inputField}
        value={text}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        placeholder={isLoading ? "Analisando..." : "Escreva sua pergunta..."}
        disabled={isLoading}
      />
      <button type="submit" style={styles.sendButton} disabled={isLoading || !text.trim()}>
        <SendIcon isDisabled={isLoading || !text.trim()} />
      </button>
    </form>
  );
};

// --- Estilos (CSS-in-JS) ---
// Para manter a consistência, os estilos permanecerão como um objeto JS,
// mas em um projeto TS maior, poderiam ser tipados com CSS-in-JS libraries.
const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr', // Layout ajustado para 2 colunas
    height: '100vh',
    backgroundColor: '#1A1A1A',
    color: '#E0E0E0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    overflow: 'hidden',
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'radial-gradient(ellipse at 70% 30%, rgba(248, 221, 130, 0.05), transparent 70%)',
    zIndex: 0,
  },
  leftPanel: {
    backgroundColor: 'rgba(18, 18, 18, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRight: '1px solid #2A2A2A',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1,
  },
  logo: {
    fontSize: '2rem',
    fontWeight: '800',
    color: '#FFFFFF', // Logo agora é toda branca
    marginBottom: '3rem',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  navItem: {
    color: '#8E8E93',
    textDecoration: 'none',
    fontSize: '1rem',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    transition: 'background-color 0.2s, color 0.2s',
  },
  navItemActive: {
    backgroundColor: '#2C2C2E',
    fontWeight: '600',
    // Efeito de gradiente no texto
    background: 'linear-gradient(90deg, #F8DD82 0%, #FAE499 100%)',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
  },
  footer: {
    marginTop: 'auto',
    fontSize: '0.8rem',
    color: '#555',
  },
 chatPanel: {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh', // ADICIONE ISSO
  zIndex: 1,
  backgroundColor: '#1A1A1A', // opcional para manter visual consistente
},
  chatHeader: {
    padding: '1.5rem 2rem',
    borderBottom: '1px solid #2A2A2A',
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
    backdropFilter: 'blur(5px)',
  },
  chatTitle: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '700',
    display: 'inline-block',
    background: 'linear-gradient(90deg, #F8DD82 0%, #FAE499 100%)',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
  },
messageList: {
  flex: 1, // Ocupa espaço restante
  padding: '2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  scrollbarWidth: 'none', // Firefox
  msOverflowStyle: 'none', // Edge
  overflowY: 'auto',
},
  messageBubble: {
    padding: '0.8rem 1.2rem',
    borderRadius: '18px',
    maxWidth: '75%',
    lineHeight: '1.5',
  },
  aiBubble: {
    backgroundColor: '#2C2C2E',
    borderTopLeftRadius: '4px',
  },
  userBubble: {
    backgroundColor: '#F8DD82',
    color: '#1A1A1A',
    borderTopRightRadius: '4px',
    alignSelf: 'flex-end',
  },
  inputForm: {
    display: 'flex',
    padding: '1.5rem 2rem',
    borderTop: '1px solid #2A2A2A',
    gap: '1rem',
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
  },
  inputField: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    border: '1px solid #3A3A3C',
    borderRadius: '12px',
    padding: '1rem',
    fontSize: '1rem',
    color: '#FFFFFF',
    outline: 'none',
  },
  sendButton: {
    width: '52px',
    height: '52px',
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#F8DD82',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  typingIndicator: {
    display: 'flex',
    gap: '4px',
  },

};



