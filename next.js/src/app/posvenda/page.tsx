"use client";

import "@fontsource/roboto/400.css"  // peso normal
import "@fontsource/roboto/700.css"  // peso negrito
import "@fontsource/inter/400.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { io } from 'socket.io-client';
import Link from "next/link";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/monoton/400.css";
import "@fontsource/libre-baskerville/400.css";
import LoadingRobotScreen from "../componentesGerais/LoadingRobotScreen";
import CabecalhoOrganizado from "../componentesGerais/Header";
import BotaoDeFiltro,{type FiltroOpcao} from "../componentesGerais/BotaoDeFiltro";
import { useUser } from "../../../userContext";
import ContentCard from "../componentesGerais/contentCard";

export default function PosVendaPage() {
  const router = useRouter();
  
  // Estados para verificação e dados do usuário
  const [userEmail, setUserEmail] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  // Define a letra para o avatar: utiliza a primeira letra de accountName ou "U" como fallback
  const avatarLetter = accountName ? accountName.charAt(0).toUpperCase() : "U";
  // Estados para conversas e mensagens
  const [selectedCliente, setSelectedCliente] = useState<string | null>(null);
  const [modoManipulacao, setModoManipulacao] = useState<boolean>(false);
  const [novaMensagem, setNovaMensagem] = useState<string>("");
  const {userValid,setUserValid}=useUser()
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [modo, setModo]=useState<boolean>()
  //useEffect: Envia o user_id para a rota /verificar_id no backend para validar o usuário
  const socket=io(process.env.NEXT_PUBLIC_API_URL!,{
    transports:['websocket'],
    secure: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    timeout: 20000, // 20s
})

  interface mensagem{
  cliente_nome:string;
  mensagem:string;
  data_envio:string;
  autor:string;
};
interface cliente_mensagem{
  cliente_nome:string;
  mensagem:string;
  data_envio:string;
  autor:string;
  item_id:string;
  imagem:string;
};
interface ItensDetalhes {
  item_id: string;
  nome_item: string;
  quantidade: number;
  preco: number;
  descricao: string;
  imagem: string[]; // lista de URLs
  preco_original: number;
  preco_base: number;
}

  const [todosClientes,setTodosClientes]=useState<cliente_mensagem[]>([])
  const [clientes, setClientes]=useState<cliente_mensagem[]>([])
  const [mensagens, setMensagens]=useState<mensagem[]>([])
   useEffect(() => {
       const token = localStorage.getItem('authToken')
       async function verificarUsuario(){
         console.log("enviando requisição para verificar token");
         if (!token) window.location.replace('/')
         try{
           const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/verificar_id`,{
             method:"POST",
             headers:{'Content-Type':'application/json',
               Authorization: `Bearer ${token}`
             },
             body:JSON.stringify({}),
           }
         );
         console.log("resposta recebida", response);
         const data=await response.json();
       if(!response.ok){ 
          if (response.status === 333 && data.error === "Token expirado") {
           console.warn("Token expirado detectado");
           localStorage.removeItem("authToken");
           setUserValid(false);
           sessionStorage.setItem('userValid',"false")
           window.location.replace("/login");
           return;
         }
         throw new Error("erro na verificação do id");}
       if (response.ok && data.valid){
         localStorage.setItem("user_id", data.user_id);
         localStorage.setItem("user_email", data.user_email);
         localStorage.setItem("account_name",data.account_name);
         setUserEmail(data.user_email);
         setAccountName(data.accoun_Name);
         setUserValid(true);
         sessionStorage.setItem('userValid', "true") 
         setDadosCarregados(true)
        }
       else{
         setUserValid(false);
         sessionStorage.setItem('userValid',"false")
         window.location.replace("/login");
       }
       } catch(error){
         console.error("erro ao verificar o id");
         setUserValid(false);
         sessionStorage.setItem('userValid',"false")
         window.location.replace("/login");
       }
       };
       verificarUsuario();
     },[]);
  const [itensDetalhes,setItensDetalhes]=useState<ItensDetalhes[]>([])
  const [item_id,setItem_id]=useState<string>('')
  console.log(clientes)
  useEffect(()=>{
    if(userValid==false) return;
    const token = localStorage.getItem("authToken")
    socket.emit('getMensagens',{token:token,tipo:"posvenda"})
    socket.on("respostaGetMensagens", (data:{mensagens: mensagem[],clientes:cliente_mensagem[]}) => {
    setMensagens(data.mensagens);
    setTodosClientes(data.clientes)
    setClientes(data.clientes.filter((cliente)=>cliente.autor==='cliente'))
    console.log("dados do cliente:",data.clientes)
  });
    socket.emit('getItens',{token:token})
    socket.on('RespostaGetItens',(item_detalhes:{itens:ItensDetalhes[]})=>{
      setItensDetalhes(item_detalhes.itens);
      console.log("item detalhes:",item_detalhes.itens)
    })
  return () => { socket.off("respostaGetMensagens"); };
}, [dadosCarregados]);
  // Funções para manipulação de mensagens e conversas
  const alternarModoManipulacao = () => {
    setModoManipulacao((prev) => !prev);
  };
const [filtroAtualDaPagina, setFiltroAtualDaPagina] = useState<FiltroOpcao>("Pendentes");
const aplicarFiltroNaPagina = (filtroSelecionado: FiltroOpcao) => {
    console.log("Novo filtro selecionado na página:", filtroSelecionado);
    setFiltroAtualDaPagina(filtroSelecionado);
    if (filtroSelecionado==='Pendentes'){
      if((todosClientes.filter((cliente)=>cliente.autor==='cliente'))){
      }
      setClientes(todosClientes.filter((cliente) => cliente.autor==='cliente'));
    }
    else if (filtroSelecionado==='Respondidas pela NOVAI'){
      setClientes(todosClientes.filter((cliente)=>cliente.autor==='novai'))
    }
    else if(filtroSelecionado==='Todos'){
      setClientes(todosClientes)
    }

    // Aqui você faria a lógica para recarregar ou filtrar seus dados
    // com base no 'filtroSelecionado'.
  };

  const adicionarMensagem = () => {
    if (!selectedCliente) return;
    const token = localStorage.getItem("authToken")
    const novaMsg = prompt("Digite a nova mensagem:");
    if (!novaMsg) return;
      socket.emit("mensagem_cliente",{mensagem:novaMsg,cliente_nome:selectedCliente,autor:'cliente',token:token,tipo:'posvenda'});
  };

  const removerMensagem = (index: number) => {
    if (!selectedCliente) return;

  };

  const enviarMensagem = () => {
    if (!selectedCliente || !novaMensagem.trim()) return;
      const token = localStorage.getItem("authToken")
      console.log("entrou no enviarMensagem")
      socket.emit("mensagem_cliente",{mensagem:novaMensagem,cliente_nome:selectedCliente,autor:'vendedor',token:token,tipo:'posvenda'});

  };
  const mudarModoAutomatico =() =>{
    socket.emit('mudarModo',(modo))
  }
  // Retorno sempre fixo, com renderização condicional dentro do JSX
  return (
  <div style={{ height: "100vh", fontFamily: "Arial, sans-serif" }}>
    {userValid===null ? (
      <LoadingRobotScreen message="Verificando usuário..." />
    ) : (
      <>
        {/* ======== HEADER ======== */}
        <CabecalhoOrganizado
        mostrarAvatar={true} // Agora você controla aqui se o avatar aparece
            avatarLetra={avatarLetter}
            userEmail={userEmail}/>

        {/* ======== ÁREA PRINCIPAL ======== */}
        <div
          style={{
            display: "flex",
            height: "calc(100vh - 70px)",
            backgroundColor: " #f0f2f5",
            paddingBottom:'1rem',
          }}
        >
          {/* ======== COLUNA ESQUERDA ======== */}
          <div style={{ width: "20%", padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                border: "1px solid #ddd",
                borderRadius: 7,
                overflow: "hidden",
                backgroundColor: "#fff",
              }}
            >
              {/* Cabeçalho da lista de conversas */}
              <div
                style={{
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom:"1px solid #ddd",
                  backgroundColor: "#efefe",
                }}
              >
                <h3 style={{ margin: 0, color: "black" }}>Conversas</h3>
                <BotaoDeFiltro 
        onFiltroAplicado={aplicarFiltroNaPagina} 
        filtroInicial={filtroAtualDaPagina}
      />
              </div>
              {/* Lista de clientes */}
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  flex: 1,
                  overflowY: "auto",
                }}
              >
                {clientes.map((cliente, i) => (
                  <li
                    key={i}
                    onClick={() =>{
                      setSelectedCliente(cliente.cliente_nome);
                      setItem_id(cliente.item_id)
                      console.log("id ao selecionar cliente:",cliente.imagem)
                    }
                    }
                    style={{
                      padding: "1rem",
                      cursor: "pointer",
                      backgroundColor:
                        selectedCliente === cliente.cliente_nome
                          ? "rgb(254, 255, 186)"
                          : "transparent",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <div style={{
  display: 'flex',          // Ativa o Flexbox para o container
  flexDirection: 'row',     // Organiza os filhos em uma linha (horizontal)
  alignItems: 'center',     // Alinha os filhos verticalmente ao centro. Outras opções: 'flex-start', 'flex-end'.
  gap: '16px',              // Adiciona um espaço de 16px entre o bloco de texto e a imagem.
                            // Alternativamente, você poderia usar margin no elemento de texto ou na imagem.
}}>
  {/* Container para as informações de texto do cliente */}
  <div>
    <p style={{
      color: "black",
      margin: 0, // Remove a margem padrão do parágrafo
      marginBottom: '4px' // Adiciona um pequeno espaço abaixo do nome, se desejar (0.25rem é aprox. 4px)
    }}>
      {cliente.cliente_nome}
    </p>
    <p style={{
      color: "rgb(165, 165, 165)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "150px",
      margin: 0, // Remove a margem padrão, já que o espaçamento vertical é tratado acima ou pelo alinhamento
    }}>
      {cliente.mensagem}
    </p>
  </div>

  {/* Imagem do cliente */}
  <img
    src={cliente.imagem} // Certifique-se de que o caminho para a imagem está correto
    alt={`Imagem de ${cliente.cliente_nome}`} // Texto alternativo mais descritivo para acessibilidade
    style={{
      width:selectedCliente===cliente.cliente_nome ? '50px':'85px',
      height: selectedCliente===cliente.cliente_nome ? '50px': '85px',
      objectFit: 'cover',    // Faz a imagem cobrir a área designada sem distorcer.
                              // Outras opções: 'contain', 'fill', 'scale-down'.
      borderRadius: '8px', // Opcional: adiciona bordas arredondadas à imagem
    }}
  />
</div>
                  </li>
                ))}
  
              </ul>
            </div>
          </div>

          {/* ======== COLUNA DO MEIO (CHAT) ======== */}
          <div
  style={{
    width:'59%',
    display:'flex',
    flexDirection: "column",
    backgroundColor: "#f0f2f5",
    borderRadius: 8,
    marginTop:'3rem',
    marginBottom:'1.5rem',
    overflow: "hidden", // Importante: Para que isso não corte o input, este contêiner DEVE ter altura suficiente.
    alignItems: 'center', // Mantido como no original. Se desejar que os filhos estiquem na largura, use 'stretch'.
    // Exemplo de altura definida (descomente e ajuste se necessário):
    // height: '500px',
    // Ou se for para ocupar toda a altura da viewport menos uma barra de navegação, por exemplo:
    // height: 'calc(100vh - 60px)',
  }}
>
  {selectedCliente ? (
    <>
      {/* Título do chat */}
      <div
        style={{
          padding: "1rem",
          color: "#000",
          backgroundColor: "#f0f2f5",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          flexShrink: 0, // Adicionado: Impede que o título encolha.
          width: '100%', // Adicionado: Para garantir que o título ocupe toda a largura se alignItems do pai for 'center'. Remova se não desejar.
          boxSizing: 'border-box', // Adicionado: Para que o padding não aumente a largura total além de 100%.
        }}
      >
        {selectedCliente} —{" "}
        {modoManipulacao
          ? "Modo Manipulação"
          : "Visualizando Conversa"}
      </div>
        <button
        onClick={()=>{
          setModo((prev) => !prev)
          mudarModoAutomatico;}}
         style={{
          padding: '10px 15px',
          backgroundColor: '#ffe600', // Azul vibrante e clean para o botão de ação
          color: '#000000',
          border: 'none',
          borderRadius: '25px', // Bordas arredondadas para combinar com o input
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: '500',
        }}>Resposta Automatica da NOVAI: {modo ? 'ON' : 'OFF'}</button>
      {/* Mensagens */}
      <div
        style={{
          flex: 1, // Correto: Faz esta área ocupar o espaço vertical restante.
          padding: "1rem",
          overflowY: "auto", // Correto: Permite scroll das mensagens.
          backgroundColor: " #f9f9f9",
          borderRadius: 7, // Pode ser desnecessário se o contêiner pai já tem borderRadius e overflow:hidden
          border: "1px solid #ddd",
          width: '100%', // Adicionado: Para garantir que a área de mensagens ocupe toda a largura.
          boxSizing: 'border-box', // Adicionado.
        }}
      >
        {mensagens
          .filter((m) => m.cliente_nome === selectedCliente)
          .map((msg, idx) => (
            <div
              key={idx}
              style={{ display: "flex", marginBottom: "0.5rem", alignItems: 'flex-end' /* Alinha o X com a base da mensagem */ }}
            >
              {msg.autor == "cliente" && (
                <div style={{
                  width: 30,
                  padding: "0.5rem", // Note que o padding pode fazer o conteúdo sair dos 30x30. Considere boxSizing ou ajustar.
                  height: 30,
                  borderRadius: "50%",
                  backgroundColor: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "black",
                  border: "0.5px solid black",
                  marginRight: "5px",
                  flexShrink: 0, // Para o avatar não encolher
                }}>{msg.cliente_nome[0].toUpperCase()}</div>)}
              <p
                style={{
                  padding: "1rem",
                  backgroundColor:
                    msg.autor === "cliente" ? "rgb(230, 229, 229)" : "rgb(252, 243, 128)",
                  color:
                    msg.autor === "cliente" ? "#000" : "#000",
                  borderRadius: 8,
                  maxWidth: "70%",
                  marginLeft:
                    msg.autor === "cliente" ? 0 : "auto",
                  marginRight: // Adicionado para dar espaço para o botão X quando a mensagem é do "não cliente"
                    (msg.autor !== "cliente" && modoManipulacao) ? "8px" : 0,
                  wordBreak: 'break-word', // Para quebrar palavras longas
                }}
              >
                {msg.mensagem}
              </p>
              {modoManipulacao && (
                <button
                  onClick={() => removerMensagem(idx)}
                  style={{
                    // marginLeft: 8, // Removido se a margem for no <p>
                    backgroundColor: "red",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "0.3rem",
                    cursor: "pointer",
                    height: 'fit-content', // Para alinhar melhor com a mensagem
                    flexShrink: 0,
                  }}
                >
                  X
                </button>
              )}
            </div>
          ))}
      </div>

      {/* Input & Botão de envio */}
     <div
  style={{
    display: 'flex',
    alignItems: 'center', // Alinha o input e o botão verticalmente
    padding: '10px 15px', // Padding ajustado para um visual mais clean
    borderTop: '1px solid #e5e5e5', // Borda superior mais sutil
    backgroundColor: '#f0f2f5', // Cor de fundo solicitada para o contêiner
    flexShrink: 0,
    width: '100%',
    boxSizing: 'border-box',
    borderBottomLeftRadius: 8, // Mantido do seu estilo original
    borderBottomRightRadius: 8, // Mantido do seu estilo original
  }}
>
  {modoManipulacao ? (
    <button
      onClick={adicionarMensagem}
      style={{
        flex: 1,
        padding: '10px 15px',
        backgroundColor: '#333333', // Um cinza escuro para o botão
        color: '#ffffff',
        border: 'none',
        borderRadius: '18px', // Bordas arredondadas
        cursor: 'pointer',
        fontSize: '0.95rem',
        fontWeight: '500',
      }}
    >
      Adicionar Mensagem
    </button>
  ) : (
    <>
      <input
        type="text"
        placeholder="Digite sua mensagem..."
        value={novaMensagem}
        onChange={(e) =>
          setNovaMensagem(e.target.value)
        }
        style={{
          flex: 1,
          padding: '10px 15px',
          border: '1px solid #dddddd', // Borda sutil para o input
          borderRadius: '18px', // Bordas bem arredondadas
          backgroundColor: '#ffffff', // Fundo branco para o input
          marginRight: '10px', // Espaçamento entre input e botão
          fontSize: '0.95rem', // Fonte um pouco menor para um look mais delicado
          color: '#222222', // Cor do texto do input
          outline: 'none', // Remove o outline padrão (considere acessibilidade para foco)
        }}
      />
      <button
        onClick={enviarMensagem}
        style={{
          padding: '10px 15px',
          backgroundColor: '#ffe600', // Azul vibrante e clean para o botão de ação
          color: '#000000',
          border: 'none',
          borderRadius: '25px', // Bordas arredondadas para combinar com o input
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: '500',
        }}
      >
        Enviar
      </button>
    </>
  )}
</div>
    </>
  ) : (
    <div
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "#888",
        width: '100%', // Para ocupar a largura do pai
      }}
    >
      Selecione uma conversa para começar.
    </div>
  )}
</div>
          {/* ======== COLUNA DIREITA ======== */}
          <div style={{ width: "19%", padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                border: "1px solid #ddd",
                borderRadius: 4,
                overflow: "hidden",
                backgroundColor: "#fff",
                paddingTop:'1rem',
              }}
            >{
            !!selectedCliente &&(
              <ul style={{
      listStyleType: 'none',  // Remove os marcadores de lista padrão (bolinhas)
      padding: 0,             // Remove o padding padrão da tag <ul>
      margin: 0,              // Remove a margem padrão da tag <ul>
      maxHeight: '1000px',     // Defina a altura máxima desejada para a lista.
                              // Ajuste este valor conforme necessário (ex: '50vh', '300px').
      overflowY: 'auto',      // Adiciona uma barra de rolagem vertical APENAS se o conteúdo exceder maxHeight.
                              // Use 'scroll' se quiser que a barra esteja sempre visível.
      border: '1px solid #eee', // Opcional: uma borda para visualizar a área da lista
      borderRadius: '4px',      // Opcional: cantos arredondados
    }}>
            {itensDetalhes.filter((iten)=>iten.item_id===item_id)
              .map((item_filtrado,index)=>(
              <li key={index}>
          <ContentCard
            imageUrls={item_filtrado.imagem}
            title={item_filtrado.nome_item}
            subtitle={`Descrição: ${item_filtrado.descricao}`}
          /></li>
          )
        )}</ul>)}
              {/* Conteúdo da coluna direita */}
            </div>
          </div>
        </div>
      </>
    )}
  </div>
);

}