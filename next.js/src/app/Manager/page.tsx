'use client'

import React, { useState, useEffect, useRef } from 'react';
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
// O componente RespostaFormatada é simulado aqui, pois não está disponível no ambiente
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const RespostaFormatada: React.FC<{ resposta: string }> = ({ resposta }) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // por padrão o react-markdown NÃO permite HTML bruto, o que é mais seguro
      >
        {resposta}
      </ReactMarkdown>

      {/* Estilos para Markdown em dark mode */}
      <style>{`
        .markdown-body {
          color: #E0E0E0;
          line-height: 1.6;
          font-size: 0.95rem;
        }

        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          margin: 0.75rem 0 0.5rem;
          font-weight: 700;
        }
        .markdown-body h1 { font-size: 1.4rem; }
        .markdown-body h2 { font-size: 1.2rem; }
        .markdown-body h3 { font-size: 1.05rem; }

        .markdown-body p { margin: 0.4rem 0; }

        /* TABELAS */
        .markdown-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0 1rem;
          background: #1f1f1f;
          border: 1px solid #2f2f2f;
          border-radius: 10px;
          overflow: hidden; /* arredondar bordas da tabela */
        }
        .markdown-body thead {
          background: #262626;
        }
        .markdown-body th, .markdown-body td {
          padding: 10px 12px;
          border-bottom: 1px solid #2f2f2f;
          text-align: left;
        }
        .markdown-body th {
          font-weight: 600;
          color: #f0f0f0;
        }
        .markdown-body tr:last-child td {
          border-bottom: none;
        }
        /* Alinha números à direita automaticamente se desejar */
        .markdown-body td:nth-child(2) {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        /* LISTAS */
        .markdown-body ul, .markdown-body ol {
          margin: 0.4rem 0 0.8rem 1.25rem;
        }

        /* CÓDIGO */
        .markdown-body code {
          background: #2a2a2a;
          padding: 2px 6px;
          border-radius: 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .markdown-body pre code {
          display: block;
          padding: 12px;
          overflow-x: auto;
        }

        /* LINKS */
        .markdown-body a {
          color: #f8dd82;
          text-decoration: none;
        }
        .markdown-body a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};


// --- Ícones SVG para uma interface clean ---
const SendIcon: React.FC<SendIconProps> = ({ isDisabled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 2L11 13" stroke={isDisabled ? "#555" : "#1A1A1A"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={isDisabled ? "#555" : "#1A1A1A"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

// --- Funções Auxiliares ---
const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

// --- Componente de Carregamento Personalizado ---
const LoadingIndicator: React.FC<{ elapsedTime: number }> = ({ elapsedTime }) => (
  <div style={loadingStyles.container}>
    <div style={loadingStyles.atomContainer}>
      <div style={loadingStyles.nucleus}>
        <span style={loadingStyles.nucleusText}>N</span>
      </div>
      <div style={loadingStyles.electron} className="electron-1"></div>
      <div style={loadingStyles.electron} className="electron-2"></div>
      <div style={loadingStyles.electron} className="electron-3"></div>
      <div style={loadingStyles.electron} className="electron-4"></div>
    </div>
    <span style={loadingStyles.analysingText}>
      Analisando... {formatTime(elapsedTime)}
    </span>
  </div>
);

// --- Componente Principal da Aplicação ---
export default function App(): JSX.Element {
  // --- Estados Globais da Aplicação ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');
  const chatHistoryRef = useRef<ChatHistory[]>([]);

  // Efeito inicial para a mensagem de boas-vindas e conexão com o socket
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      transports: ['websocket'],
      withCredentials: true, // ✅ necessário para enviar cookies (incl. HttpOnly)
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 20000 // 20s
    });
    const tok = localStorage.getItem('authToken');
    console.log('token get do manager useeffect: ', tok)
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

  // Efeito para o cronômetro
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading) {
      timer = setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    } else {
      if (timer) clearInterval(timer);
      setElapsedTime(0); // Reseta o tempo quando o carregamento termina
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading]);

  // --- Lógica de Interação com a API do Gemini ---
  const callOpenaiApi = async (prompt: string): Promise<string> => {
    setIsLoading(true);
    const token_jwt = localStorage.getItem('authToken')
    console.log('aqui esta o token:', token_jwt)
    console.log("Chamando a API com o prompt:", prompt);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat_novai_manager`, {
        method: 'POST',
        headers:{'Content-Type':'application/json',
            Authorization: `Bearer ${token_jwt}`
          },
        body: JSON.stringify({'message':prompt}),
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      const result = await response.json();
      

      if (result.resposta_final) {
        const aiResponseText = result.resposta_final;
        // Atualiza o histórico para manter a conversa fluindo
        chatHistoryRef.current.push({ role: "user", parts: [{ text: prompt }] });
        chatHistoryRef.current.push({ role: "model", parts: [{ text: aiResponseText }] });
        return aiResponseText;
      } else {
        // Se a resposta for bloqueada por segurança ou vier vazia
        return "Não consegui processar essa informação. Podemos tentar de outra forma?";
      }

    } catch (error) {
      console.error("Gemini API call failed:", error);
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
          <a href="#" style={{ ...styles.navItem, ...styles.navItemActive }}>Manager</a>
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
          <p style={{ color: '#8E8E93' }}>Converse com seus dados em tempo real</p>
        </header>
        <div style={styles.messageList}>
          {messages.map((msg, index) => (
            <div
              key={msg.id}
              style={{
                ...(msg.sender === 'ai' ? styles.aiMessageText : styles.userBubble),
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {msg.sender === 'ai' ? (
                <RespostaFormatada resposta={msg.text} />
              ) : (
                msg.text
              )}
            </div>
          ))}
          {isLoading && (
            <div style={loadingStyles.messageRow}>
              <LoadingIndicator elapsedTime={elapsedTime} />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>
      <style>
        {`
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

        /* Animações para a nova UI de carregamento */
        @keyframes nucleus-pulse {
          0% { box-shadow: 0 0 0 0 rgba(248, 221, 130, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(248, 221, 130, 0); }
          100% { box-shadow: 0 0 0 0 rgba(248, 221, 130, 0); }
        }

        @keyframes electron-orbit-1 {
            0% { transform: rotate(0deg) translateX(25px) translateY(5px); }
            100% { transform: rotate(360deg) translateX(25px) translateY(5px); }
        }
        @keyframes electron-orbit-2 {
            0% { transform: rotate(120deg) translateX(25px) translateY(8px); }
            100% { transform: rotate(480deg) translateX(25px) translateY(8px); }
        }
        @keyframes electron-orbit-3 {
            0% { transform: rotate(240deg) translateX(25px) translateY(-5px); }
            100% { transform: rotate(600deg) translateX(25px) translateY(-5px); }
        }
        @keyframes electron-orbit-4 {
            0% { transform: rotate(180deg) translateX(20px) translateY(-10px); }
            100% { transform: rotate(540deg) translateX(20px) translateY(-10px); }
        }

        .electron-1 { animation: electron-orbit-1 2s infinite linear; }
        .electron-2 { animation: electron-orbit-2 2.5s infinite linear; }
        .electron-3 { animation: electron-orbit-3 2.2s infinite linear; }
        .electron-4 { animation: electron-orbit-4 3s infinite linear; }
        
        @keyframes loading-bar {
            0% { width: 0%; }
            100% { width: 100%; }
        }
        `}
      </style>
    </div>
  );
}

// --- Estilos para a nova animação de carregamento ---
const loadingStyles: { [key: string]: React.CSSProperties } = {
  messageRow: {
    display: 'flex',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: '0.5rem',
  },
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  analysingText: {
    color: '#8E8E93',
    fontSize: '0.875rem',
    paddingLeft: 10,
  },
  atomContainer: {
    position: 'relative',
    width: '40px',
    height: '40px',
  },
  nucleus: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: '#1A1A1A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'nucleus-pulse 2s infinite cubic-bezier(0.66, 0.0, 0.34, 1.0)',
    overflow: 'hidden',
  },
  nucleusText: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#FFFFFF',
    position: 'relative',
    zIndex: 1,
  },
  nucleusLoadingBar: {
    position: 'absolute',
    bottom: '0',
    left: '0',
    height: '3px',
    backgroundColor: '#F8DD82',
    animation: 'loading-bar 5s infinite linear',
  },
  electron: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#F8DD82',
    transformOrigin: 'top left',
  },
};

// --- Estilos (CSS-in-JS) originais ---
const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr',
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
    color: '#FFFFFF',
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
    height: '100vh',
    zIndex: 1,
    backgroundColor: '#1A1A1A',
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
    flex: 1,
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
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
  aiMessageText: {
    padding: '0',
    backgroundColor: 'transparent',
    color: '#E0E0E0',
    maxWidth: '75%',
    lineHeight: '1.5',
  },
  userBubble: {
    backgroundColor: '#2C2C2E',
    color: '#E0E0E0',
    padding: '0.8rem 1rem', // Aumenta o padding para o balão do usuário
    borderRadius: '18px',
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
  initialMessageText: {
    // Estilo para a mensagem inicial sem balão
    padding: '0',
    backgroundColor: 'transparent',
    color: '#E0E0E0',
    maxWidth: '75%',
    lineHeight: '1.5',
  }
};


