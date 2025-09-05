'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import io from 'socket.io-client';

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

const formatDatePtBR = (d: Date) =>
  d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const buildConversaIdByDate = (createdAtMs: number) => {
  return `Nova Conversa • ${formatDatePtBR(new Date(createdAtMs))}`;
};

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

type Props = { resposta: string };
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a || []),
      ['a', 'target'],
      ['a', 'rel'],
    ],
  },
};
const RespostaFormatada: React.FC<Props> = ({ resposta }) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          // Tabela responsiva com scroll horizontal
          table: ({ node, ...props }) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
          // Links externos seguros
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {resposta}
      </ReactMarkdown>

      <style>{`
        .markdown-body {
          color: #e6e6e6;
          line-height: 1.65;
          font-size: 0.95rem;
          -webkit-font-smoothing: antialiased;
          max-width: 80ch;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .markdown-body h1, .markdown-body h2, .markdown-body h3,
        .markdown-body h4, .markdown-body h5, .markdown-body h6 {
          margin: 0.9rem 0 0.5rem;
          font-weight: 700;
          line-height: 1.25;
        }
        .markdown-body h1 { font-size: 1.45rem; }
        .markdown-body h2 { font-size: 1.25rem; }
        .markdown-body h3 { font-size: 1.1rem; }
        .markdown-body p { margin: 0.5rem 0; }

        /* CITAÇÕES */
        .markdown-body blockquote {
          margin: 0.75rem 0;
          padding: 0.6rem 0.9rem;
          border-left: 3px solid #3a3a3a;
          background: #1f1f1f;
          border-radius: 6px;
          color: #d7d7d7;
        }

        /* LISTAS */
        .markdown-body ul, .markdown-body ol {
          margin: 0.4rem 0 0.9rem 1.25rem;
        }
        .markdown-body li + li {
          margin-top: 0.25rem;
        }

        /* CÓDIGO */
        .markdown-body code {
          background: #262626;
          padding: 0.15rem 0.4rem;
          border-radius: 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.92em;
        }
        .markdown-body pre code {
          display: block;
          padding: 0.9rem 1rem;
          overflow-x: auto;
          border-radius: 10px;
          background: #1f1f1f;
          border: 1px solid #2c2c2c;
        }

        /* LINKS */
        .markdown-body a {
          color: #f8dd82;
          text-decoration: none;
        }
        .markdown-body a:hover { text-decoration: underline; }

        /* TABELAS */
        .markdown-body .table-wrap {
          margin: 0.8rem 0 1rem;
          border: 1px solid #2f2f2f;
          border-radius: 10px;
          overflow: auto; /* scroll horizontal quando precisar */
          background: #1f1f1f;
          /* melhora a rolagem no iOS */
          -webkit-overflow-scrolling: touch;
        }
        .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          min-width: 420px; /* evita quebrar tabelas estreitas */
        }
        .markdown-body thead {
          background: #262626;
          position: sticky;
          top: 0; /* cabeçalho “gruda” ao fazer scroll no container */
          z-index: 1;
        }
        .markdown-body th, .markdown-body td {
          padding: 10px 12px;
          border-bottom: 1px solid #2f2f2f;
          text-align: start; /* remark-gfm pode sobrescrever com style inline */
          vertical-align: top;
          white-space: nowrap;
        }
        .markdown-body tr:last-child td {
          border-bottom: none;
        }
        .markdown-body tbody tr:hover {
          background: #212121;
        }

        /* IMAGENS */
        .markdown-body img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }

        /* HR */
        .markdown-body hr {
          border: 0;
          border-top: 1px solid #2f2f2f;
          margin: 1rem 0;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Alturas de referência
  const BASE = 52;   // mesma altura do botão
  const MAX  = 200;  // seu limite atual

  useEffect(() => {
    if (!textareaRef.current) return;
    // quando não há texto, fixa a altura base
    if (!text) {
      textareaRef.current.style.height = `${BASE}px`;
    }
  }, [text]);

  const autoSize = (el: HTMLTextAreaElement) => {
    // reseta para calcular o scrollHeight corretamente
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX);
    // aplica no mínimo a BASE
    el.style.height = `${Math.max(next, BASE)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage(text);
      setText('');
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSendMessage(text);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ ...styles.inputForm, alignItems: 'center' }}>
      <textarea
        ref={textareaRef}
        rows={1} // começa com 1 linha
        style={styles.inputField}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoSize(e.currentTarget);
        }}
        onFocus={(e) => {
          // garante que ao focar a altura base seja aplicada
          if (!text) e.currentTarget.style.height = `${BASE}px`;
        }}
        onKeyDown={handleKeyDown}
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
  const [isHoveringNew, setIsHoveringNew] = useState<Boolean>(false)
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);



  // Efeito inicial para a mensagem de boas-vindas
  useEffect(() => {
    // A inicialização do socket pode ficar fora da função get_conversation, pois ela só precisa ser feita uma vez.
    const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
        transports: ['websocket'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        timeout: 20000 // 20s
    });
    const tok = localStorage.getItem('authToken');
    if (tok) setToken(tok);

    const get_conversation = async () => {
        let fetchedMessages = [];
        try {
            console.log('entrou no get_conversation');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/get_conversation`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tok}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} ${response.statusText}: ${errorText}`);
            }

            const result = await response.json();
            if (result && result.messages) {
                fetchedMessages = result.messages;
            }
        } catch (error) {
            console.error("Erro ao obter conversa:", error);
            // Continua a execução mesmo com erro, para criar a nova conversa.
        }

        // ✅ Ações que sempre devem acontecer após a tentativa de buscar o histórico:
        const initialMessage = 'Olá. Eu sou a Novai Manager. Seus dados estão conectados. Como posso ajudar hoje?';
        const draftId = `draft-${Date.now()}`;

        // Define a nova conversa como a ativa.
        setActiveConversaId(draftId);

        // Cria a mensagem inicial do AI
        const initialAiMessage = {
            id: Date.now(), 
            text: initialMessage, 
            sender: 'ai', 
            conversa_id: draftId
        };

        // Combina a nova mensagem inicial com as mensagens do histórico.
        // O `draftIdRef` é usado aqui para garantir que a referência seja a correta.
        draftIdRef.current = draftId;
        setMessages([initialAiMessage, ...fetchedMessages]);

        // Atualiza o histórico para o modelo de linguagem, que é um novo chat.
        chatHistoryRef.current = [
            { role: 'model', parts: [{ text: initialMessage }] }
        ];
    };

    get_conversation();
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



  // --- Lógica de Interação com a API (SIMULAÇÃO) ---
  const callOpenaiApi = async (prompt: string, conversaId: string, date:number): Promise<string> => {
  setIsLoading(true);
  const token_jwt = localStorage.getItem('authToken');
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat_novai_manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token_jwt}`
      },
      body: JSON.stringify({
        message: prompt,
        conversa_id: conversaId,   // ✅ agora o back recebe e pode persistir
        date:date
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.resposta_final) {
      const aiResponseText = result.resposta_final;
      chatHistoryRef.current.push({ role: 'user', parts: [{ text: prompt }] });
      chatHistoryRef.current.push({ role: 'model', parts: [{ text: aiResponseText }] });
      return aiResponseText;
    } else {
      return 'Não consegui processar essa informação. Podemos tentar de outra forma?';
    }
  } catch (error) {
    console.error('API call failed:', error);
    return 'Desculpe, ocorreu um erro de conexão. Por favor, tente novamente.';
  } finally {
    setIsLoading(false);
  }
};


  // --- Manipuladores de Eventos ---
 const ensureFinalConversaId = (
  firstUserText: string,
  firstUserMessageTimestampMs: number
): string => {
  const currentId = activeConversaId;

  // Já existe alguma mensagem de usuário nesta conversa?
  const hasUserMsg = messages.some(
    (m) => m.conversa_id === currentId && m.sender === 'user'
  );

  if (hasUserMsg) {
    // Não é a primeira: mantém o id atual
    return currentId;
  }

  // Primeira mensagem do usuário → batiza usando o TEXTO + DATA
  const finalId = buildConversaId(firstUserText, new Date(firstUserMessageTimestampMs));

  if (finalId === currentId) return currentId;

  // Renomeia todas as mensagens já existentes dessa conversa para o id final
  setMessages((prev) =>
    prev.map((m) =>
      m.conversa_id === currentId ? { ...m, conversa_id: finalId } : m
    )
  );

  setActiveConversaId(finalId);
  return finalId;
};

/** Inicia uma nova conversa rascunho (com saudação) */
const startNewConversation = () => {
   const hasExistingDraft = messages.find(msg => msg.conversa_id.startsWith('draft-'));

    // Se já houver um rascunho, a função para por aqui.
    if (hasExistingDraft) {
      setActiveConversaId(hasExistingDraft.conversa_id);
      draftIdRef.current = hasExistingDraft.conversa_id; 
      return;
    }
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

  const now = Date.now();

  // Se for a primeira mensagem do usuário desta conversa, define o conversa_id final
  const idForThisConversation = ensureFinalConversaId(messageText,now);

  const userMessage: Message = {
    id: now,
    text: messageText,
    sender: 'user',
    conversa_id: idForThisConversation,
  };
  setMessages(prev => [...prev, userMessage]);

  // (Opcional) histórico p/ modelo
  chatHistoryRef.current = [
    ...(chatHistoryRef.current || []),
    { role: 'user', parts: [{ text: messageText }] },
  ];

  setIsLoading(true);
  try {
    // 🟡 Envie o conversa_id junto para o backend
    const aiResponseText = await callOpenaiApi(messageText, idForThisConversation, now);

    const aiMessage: Message = {
      id: now + 1,
      text: aiResponseText,
      sender: 'ai',
      conversa_id: idForThisConversation,
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

const visibleMessages = useMemo(
  () => messages.filter(m => m.conversa_id === activeConversaId),
  [messages, activeConversaId]
);
const conversationList: ConversationListItem[] = useMemo(() => {
  const ids = Array.from(
    messages.reduce((acc, m) => acc.add(m.conversa_id), new Set<string>())
  );

  return ids.map((id) => {
    const msgs = messages.filter(m => m.conversa_id === id);
    const createdAt = msgs[0]?.id ?? 0; // você usa Date.now() como id, OK
    const firstUser = msgs.find(m => m.sender === 'user');

    // Se ainda não tem mensagem de usuário (ex.: rascunho), cria um título amigável
    const fallback = `Nova Conversa • ${formatDatePtBR(new Date(createdAt))}`;
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


  // --- Renderização da UI ---
  return (
    <div style={styles.appContainer}>
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
          {(isLeftPanelPinned || isLeftPanelOpen) && ( <span style={styles.logoText}>NOVAI</span>
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
          <h2 style={styles.chatTitle}>Novai Manager</h2>
        <div style={styles.chatContentWrapper}>
         <div style={styles.messageList}>
  {visibleMessages.map((msg) => (
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
        </div>
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>

      {/* NOVO PAINEL DIREITO - HISTÓRICO DE CONVERSAS */}
     <aside
        style={{ ...styles.panel, ...styles.rightPanel, width: isRightPanelPinned || isRightPanelOpen ? '240px' : '60px' }}
        onMouseEnter={() => !isRightPanelPinned && setIsRightPanelOpen(true)}
        onMouseLeave={() => !isRightPanelPinned && setIsRightPanelOpen(false)}
      >
        <div style={{ ...styles.panelHeader, justifyContent: 'flex-end' }}>
          {(isRightPanelPinned || isRightPanelOpen) && (
            <span style={styles.logoText}>Histórico</span>
          )}
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
              <div style={styles.tooltipRight}>{getRightTooltipText()}</div>
            )}
          </div>
        </div>
        {(isRightPanelPinned || isRightPanelOpen) && (
          <nav style={styles.nav}>
            <div style={{ display: 'flex', gap: 8, padding: '0 12px 8px' }}>
              <button
                onClick={startNewConversation}
                style={{
                  ...styles.smallButton,
                  ...(isHoveringNew ? styles.smallButtonHover : {})
                }}
                onMouseEnter={() => setIsHoveringNew(true)}
                onMouseLeave={() => setIsHoveringNew(false)}
              >
                + Nova conversa
            </button>
            </div>
           {conversationList.map((conv) => {
  const isActive = conv.id === activeConversaId;
  const isHovered = hoveredConvId === conv.id;

  return (
    <div
      key={conv.id}
      style={{
        ...styles.navItem,
        ...(isActive
          ? { background: '#2a2a2a', fontWeight: 600 }
          : isHovered
          ? { background: '#3a3a3a' } // cinza claro quando hover
          : {}),
        cursor: 'pointer',
        lineHeight: 1.2,
      }}
      title={conv.title}
      onClick={() => setActiveConversaId(conv.id)}
      onMouseEnter={() => setHoveredConvId(conv.id)}
      onMouseLeave={() => setHoveredConvId(null)}
    >
      {truncate(conv.title, 32)}
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
        {conv.count} {conv.count !== 1 ? 'mensagens' : 'mensagem'}
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
        
        /* Estilos da barra de rolagem para navegadores WebKit (Chrome, Safari) */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: #1A1A1A;
        }

        ::-webkit-scrollbar-thumb {
          background: #3A3A3C;
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #555;
        }

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
  tooltipRight: {
    position: 'absolute',
    bottom: '-30px', // Posicionado abaixo do botão
    right: '50%', // Alinhado à direita
    transform: 'translateX(50%)',
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
    overflow:'hidden',
  },
  chatContentWrapper: {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',  // deixa o filho expandir 100%
  overflow: 'hidden',     // scroll fica no messageList
  margin: 0,              // tirar margens que “empurram” layout
  padding: '1rem 16px',   // use padding pequeno em vez de margins grandes
  gap: '1rem',
},
  chatHeader: {
    position: 'fixed',
    top: '2rem',
    left: '280px', // Ajustado para a largura do painel esquerdo
    zIndex: 10,
    // Removido o padding e borda para que o conteúdo ocupe o espaço
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
  },
 chatTitle: {
    margin: 0,
    paddingLeft:'1rem',
    paddingTop:'0.5rem',
    fontSize: '1rem',
    fontWeight: '700',
    display: 'inline-block',
    background: 'linear-gradient(90deg, #F8DD82 0%, #FAE499 100%)',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
  },
  messageList: {
  boxSizing: 'border-box',
  // padding aqui, mudança
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  overflowY: 'auto',      // scroll principal
  width: '100%',
  maxWidth: 800,
  margin: '0 auto',       // centraliza sem empurrar as laterais
  // Se quiser esconder scrollbar no Firefox já está ok com scrollbarWidth: 'none'
  // Para WebKit, precisa CSS global (não rola inline): ::-webkit-scrollbar { display: none; }
},

aiMessageText: {
  padding: 0,
  backgroundColor: 'transparent',
  color: '#E0E0E0',
  maxWidth: '100%',
  lineHeight: 1.5,
  alignSelf: 'flex-start',
  wordWrap: 'break-word',
  overflowWrap: 'anywhere', // evita overflow de links/palavras longas
},
  userBubble: {
    backgroundColor: '#F8DD82',
    color: '#1A1A1A',
    padding: '0.8rem 1rem',
    borderRadius: 18,
    borderTopRightRadius: 4,
    alignSelf: 'flex-end',
    wordWrap: 'break-word',
    overflowWrap: 'anywhere',
    maxWidth: '85%', // use maxWidth em vez de width pra não “empurrar”
  },
    smallButton: {
  background: 'transparent',
  color: '#E0E0E0',
  borderRadius: '8px',
  padding: '6px 12px',
  cursor: 'pointer',
  transition: 'background 0.2s ease',
},
smallButtonHover: {
  background: '#2A2A2A', // cinza leve
},
  inputForm: {
  display: 'flex',
  padding: '1.5rem 2rem',
  borderTop: '1px solid #2A2A2A',
  gap: '1rem',
  backgroundColor: 'rgba(26, 26, 26, 0.5)',
  alignItems: 'flex-end', // 👈 garante que o botão não sobe
},
inputField: {
  flex: 1,
  backgroundColor: '#2C2C2E',
  border: '1px solid #3A3A3C',
  borderRadius: '12px',
  padding: '0.75rem 1rem',
  fontSize: '1rem',
  lineHeight: 1.2,
  color: '#FFFFFF',
  outline: 'none',
  resize: 'none',
  overflowY: 'auto',
  maxHeight: '200px',
  boxSizing: 'border-box',
},

  sendButton: {
  alignSelf: 'flex-end',
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
