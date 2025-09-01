'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { io } from 'socket.io-client';
// A biblioteca 'remark-gfm' não pôde ser resolvida, então a removi.
// import remarkGfm from 'remark-gfm';

// --- Tipos para maior segurança e clareza ---
interface Message {
  id: number;
  text: string;
  sender: 'ai' | 'user';
  conversa_id: string;
}

type ConversationListItem = {
  id: string;
  title: string;   // "primeira mensagem do usuário • data/hora"
  createdAt: number;
  count: number;
};

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

const MenuIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E0E0E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const ChatHistoryIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E0E0E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    <path d="M8 8h.01"></path>
    <path d="M12 8h.01"></path>
    <path d="M16 8h.01"></path>
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
  const chatHistoryRef = useRef<ChatHistory[]>([]);
  
  // Novos estados para controlar a abertura/fechamento dos painéis
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isLeftPanelPinned, setIsLeftPanelPinned] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isRightPanelPinned, setIsRightPanelPinned] = useState(false);
  
  const [isHoveringLeft, setIsHoveringLeft] = useState(false);
  const [isHoveringRight, setIsHoveringRight] = useState(false);
  const [token, setToken] = useState('');
  const [activeConversaId, setActiveConversaId] = useState<string>('');
  const draftIdRef = useRef<string>('');


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
     const draftId = `draft-${Date.now()}`;
  draftIdRef.current = draftId;
  setActiveConversaId(draftId);

  setMessages([
    { id: Date.now(), text: initialMessage, sender: 'ai', conversa_id: draftId }
  ]);

  chatHistoryRef.current = [
    { role: 'model', parts: [{ text: initialMessage }] }
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
const formatDatePtBR = (d: Date) =>
  d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

const sanitizeOneLine = (s: string) =>
  s.replace(/\s+/g, ' ').trim();

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;

/**
 * Gera o conversa_id: "primeira mensagem do usuário • dd/mm/aaaa hh:mm"
 */
const buildConversaId = (firstUserText: string, when: Date) => {
  const preview = truncate(sanitizeOneLine(firstUserText), 40);
  return `${preview} • ${formatDatePtBR(when)}`;
};
  // --- Manipuladores de Eventos ---

  const ensureFinalConversaId = (firstUserText: string): string => {
  if (!activeConversaId.startsWith('draft-')) return activeConversaId;

  const finalId = buildConversaId(firstUserText, new Date());

  // renomeia todas as mensagens do rascunho para o ID final
  setMessages(prev =>
    prev.map(m =>
      m.conversa_id === activeConversaId ? { ...m, conversa_id: finalId } : m
    )
  );

  setActiveConversaId(finalId);
  return finalId;
}

/** Inicia uma nova conversa rascunho (com saudação) */
  const startNewConversation = () => {
    const draftId = `draft-${Date.now()}`;
    draftIdRef.current = draftId;
    setActiveConversaId(draftId);

    const welcome = 'Olá. Eu sou a Novai Manager. Seus dados estão conectados. Como posso ajudar hoje?';
    setMessages(prev => [
      ...prev,
      { id: Date.now(), text: welcome, sender: 'ai', conversa_id: draftId }
    ]);

    // Se você mantém histórico para o modelo:
    chatHistoryRef.current = [{ role: 'model', parts: [{ text: welcome }] }];
  };

 const handleSendMessage = async (messageText: string): Promise<void> => {
  if (messageText.trim() === '' || isLoading) return;

  // Se for a primeira mensagem do usuário desta conversa, define o conversa_id final
  const idForThisConversation = ensureFinalConversaId(messageText);

  const now = Date.now();
  const userMessage: Message = {
    id: now,
    text: messageText,
    sender: 'user',
    conversa_id: idForThisConversation,
  };
  setMessages(prev => [...prev, userMessage]);

  // (Opcional) alimente seu histórico p/ o modelo
  chatHistoryRef.current = [
    ...(chatHistoryRef.current || []),
    { role: 'user', parts: [{ text: messageText }] },
  ];

  setIsLoading(true);
  try {
    const aiResponseText = await callOpenaiApi(messageText);
    const aiMessage: Message = {
      id: now + 1,
      text: aiResponseText,
      sender: 'ai',
      conversa_id: idForThisConversation, // <- importante
    };
    setMessages(prev => [...prev, aiMessage]);

    chatHistoryRef.current = [
      ...(chatHistoryRef.current || []),
      { role: 'model', parts: [{ text: aiResponseText }] },
    ];
  } finally {
    setIsLoading(false);
  }
};
const conversationList: ConversationListItem[] = useMemo(() => {
  const ids = Array.from(
    messages.reduce((acc, m) => acc.add(m.conversa_id), new Set<string>())
  );

  return ids.map((id) => {
    const msgs = messages.filter(m => m.conversa_id === id);
    const createdAt = msgs[0]?.id ?? 0; // você usa Date.now() como id, OK
    const firstUser = msgs.find(m => m.sender === 'user');

    // Se ainda não tem mensagem de usuário (ex.: rascunho), cria um título amigável
    const fallback = `(sem mensagem) • ${formatDatePtBR(new Date(createdAt))}`;
    const title = firstUser
      ? buildConversaId(firstUser.text, new Date(createdAt))
      : fallback;

    return {
      id,
      title,
      createdAt,
      count: msgs.length,
    };
  }).sort((a, b) => b.createdAt - a.createdAt); // mais recentes primeiro
}, [messages]);

 const handleLeftPanelToggle = () => {
    setIsLeftPanelPinned(!isLeftPanelPinned);
    // Se o painel estava aberto, agora ele vai fechar
    if (isLeftPanelOpen) {
      setIsLeftPanelOpen(false);
    }
  };

  const handleRightPanelToggle = () => {
    setIsRightPanelPinned(!isRightPanelPinned);
    setIsRightPanelOpen(!isRightPanelPinned);
  };

  const getLeftTooltipText = () => {
    if (isLeftPanelPinned) {
      return 'Fechar menu';
    } else if (isLeftPanelOpen) {
      return 'Manter menu aberto';
    } else {
      return 'Abrir menu';
    }
  };

  const getRightTooltipText = () => {
    if (isRightPanelPinned) {
      return 'Fechar histórico';
    } else if (isRightPanelOpen) {
      return 'Manter histórico aberto';
    } else {
      return 'Abrir histórico';
    }
  };
  const visibleMessages = useMemo(
  () => messages.filter(m => m.conversa_id === activeConversaId),
  [messages, activeConversaId]
);

  // --- Renderização da UI ---
  return (
    <div style={styles.appContainer}>
      <div style={styles.backgroundGradient}></div>

      {/* PAINEL ESQUERDO - NAVEGAÇÃO/MARCA */}
      <aside
        style={{ ...styles.panel, ...styles.leftPanel, width: isLeftPanelPinned || isLeftPanelOpen ? '240px' : '60px' }}
        onMouseEnter={() => !isLeftPanelPinned && setIsLeftPanelOpen(true)}
        onMouseLeave={() => !isLeftPanelPinned && setIsLeftPanelOpen(false)}
      >
        <div style={styles.panelHeader}>
          <div
            style={styles.buttonWrapper}
            onMouseEnter={() => setIsHoveringLeft(true)}
            onMouseLeave={() => setIsHoveringLeft(false)}
          >
            <button
              onClick={handleLeftPanelToggle}
              style={{
                ...styles.panelToggleButton,
                ...(isHoveringLeft ? styles.panelToggleButtonHover : {})
              }}
            >
              <MenuIcon />
            </button>
            {isHoveringLeft && (
              <div style={styles.tooltip}>{getLeftTooltipText()}</div>
            )}
          </div>
          {/* Renderiza o título somente quando o painel está aberto */}
          {(isLeftPanelPinned || isLeftPanelOpen) && (
            <span style={styles.logoText}>NOVAI</span>
          )}
        </div>
        {(isLeftPanelPinned || isLeftPanelOpen) && (
          <>
            <nav style={styles.nav}>
              <a href="#" style={{ ...styles.navItem, ...styles.navItemActive }}>Manager</a>
              <a href="#" style={styles.navItem}>Dashboard</a>
              <a href="#" style={styles.navItem}>Relatórios</a>
            </nav>
            <div style={styles.footer}>
              &copy; {new Date().getFullYear()} Novai Inc.
            </div>
          </>
        )}
      </aside>

      {/* PAINEL CENTRAL - CHAT */}
      <main style={styles.chatPanel}>
        <header style={styles.chatHeader}>
          <h2 style={styles.chatTitle}>Novai Manager</h2>
          <p style={{ color: '#8E8E93' }}>Converse com seus dados em tempo real</p>
        </header>
        <div style={styles.messageList}>
  {visibleMessages.map((msg: Message) => (
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

      {/* NOVO PAINEL DIREITO - HISTÓRICO DE CONVERSAS */}
      <aside
        style={{ ...styles.panel, ...styles.rightPanel, width: isRightPanelPinned || isRightPanelOpen ? '240px' : '60px' }}
        onMouseEnter={() => !isRightPanelPinned && setIsRightPanelOpen(true)}
        onMouseLeave={() => !isRightPanelPinned && setIsRightPanelOpen(false)}
      >
        <div style={styles.panelHeader}>
          <div
            style={styles.buttonWrapper}
            onMouseEnter={() => setIsHoveringRight(true)}
            onMouseLeave={() => setIsHoveringRight(false)}
          >
            <button
              onClick={handleRightPanelToggle}
              style={{
                ...styles.panelToggleButton,
                ...(isHoveringRight ? styles.panelToggleButtonHover : {})
              }}
            >
              <ChatHistoryIcon />
            </button>
            {isHoveringRight && (
              <div style={styles.tooltip}>{getRightTooltipText()}</div>
            )}
          </div>
          {/* Renderiza o título somente quando o painel está aberto */}
          {(isRightPanelPinned || isRightPanelOpen) && (
            <span style={styles.logoText}>Histórico</span>
          )}
        </div>
        {(isRightPanelPinned || isRightPanelOpen) && (
         <nav style={styles.nav}>
  <div style={{ display: 'flex', gap: 8, padding: '0 12px 8px' }}>
    <button onClick={startNewConversation} style={{ ...styles.smallButton }}>
      + Nova conversa
    </button>
  </div>

  {conversationList.map((conv) => {
    const isActive = conv.id === activeConversaId;
    return (
      <div
        key={conv.id}
        style={{
          ...styles.navItem,
          ...(isActive ? { background: '#2a2a2a', fontWeight: 600 } : {}),
          cursor: 'pointer',
          lineHeight: 1.2,
        }}
        title={conv.title}
        onClick={() => setActiveConversaId(conv.id)}
      >
        {truncate(conv.title, 32)}
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          {conv.count} mensagem{conv.count !== 1 ? 's' : ''}
        </div>
      </div>
    );
  })}
</nav>
        )}
      </aside>

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

// --- Estilos (CSS-in-JS) originais + novos ---
const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto', // Ajustado para os 3 painéis
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
  panel: {
    backgroundColor: 'rgba(18, 18, 18, 0.8)',
    backdropFilter: 'blur(10px)',
    padding: '1rem 0.5rem', // Reduzido o padding para o estado recolhido
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.3s ease-in-out',
    zIndex: 1,
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem',
  },
  panelToggleButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    position: 'relative', // Adicionado para posicionamento do tooltip
  },
  panelToggleButtonHover: {
    background: '#3A3A3C', // Cor do círculo ao passar o mouse
  },
  buttonWrapper: {
    position: 'relative',
    display: 'inline-block', // Para que o tooltip se posicione corretamente
  },
  tooltip: {
    position: 'absolute',
    bottom: '-30px', // Posicionado abaixo do botão
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(50, 50, 50, 0.9)',
    color: '#E0E0E0',
    fontSize: '0.7rem', // Fonte menor
    padding: '0.2rem 0.5rem', // Padding menor
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 2,
    transition: 'opacity 0.2s ease-in-out',
  },
  leftPanel: {
    borderRight: '1px solid #2A2A2A',
  },
  rightPanel: {
    borderLeft: '1px solid #2A2A2A',
  },
  logoText: {
    fontSize: '1.5rem',
    fontWeight: '800',
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
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
    backgroundColor: 'transparent',
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
    padding: '0.8rem 1rem',
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


