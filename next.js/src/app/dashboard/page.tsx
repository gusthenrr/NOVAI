"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  // Estados para verificação e dados do usuário
  const [userValid, setUserValid] = useState<boolean | null>(null);
  const [jwt_token, setJwt_token] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  // Define a letra para o avatar: utiliza a primeira letra de accountName ou "U" como fallback
  const avatarLetter = accountName ? accountName.charAt(0).toUpperCase() : "U";
  
  // Estados para conversas e mensagens
  const [selectedCliente, setSelectedCliente] = useState<string | null>(null);
  const [modoManipulacao, setModoManipulacao] = useState<boolean>(false);
  const [novaMensagem, setNovaMensagem] = useState<string>("");
  //useEffect: Envia o user_id para a rota /verificar_id no backend para validar o usuário
  useEffect(() => {
    async function verificarUsuario(){
      const token = localStorage.getItem("authToken");
      console.log("token pego do localstorage",token);
      if(!token){
        console.warn("Nenhum token jwt encontrado, redirecionando para /login");
        window.location.replace("/");
      }
      console.log("enviando requisição para verificar token");
      try{
        const response = await fetch(`https://6028-2804-18-1856-9d4f-cd28-27c5-8f8e-dc8.ngrok-free.app/verificar_id`,{
          method:"POST", 
          headers:{'Content-Type':'application/json',
          Authorization: `Bearer ${token}`,
          },
          body:JSON.stringify({}),
        }
      );
      console.log("resposta recebida", response);
      const data=await response.json();
    if(!response.ok) throw new Error("erro na verificação do id");
    if (data.valid){
      localStorage.setItem("user_id", data.user_id);
      localStorage.setItem("user_email", data.user_email);
      localStorage.setItem("account_name",data.account_name);
      setUserEmail(data.user_email);
      setAccountName(data.accoun_Name);
      setUserValid(true);
    }
    else{
      setUserValid(false);
      window.location.replace("/");
    }
    } catch(error){
      console.error("erro ao verificar o id");
      setUserValid(false);
      window.location.replace("/");
    }
    };
    verificarUsuario();
  },[]);

  const [clientes, setClientes] = useState([
    {
      cliente: "Cliente 1",
      mensagens: [
        { remetente: "cliente", conteudo: "Olá, tenho uma dúvida sobre meu pedido!", horario: "10:00" },
        { remetente: "eu", conteudo: "Claro, como posso ajudar?", horario: "10:01" },
      ],
    },
    {
      cliente: "Cliente 2",
      mensagens: [
        { remetente: "cliente", conteudo: "Gostaria de saber o preço de um produto.", horario: "10:05" },
      ],
    },
  ]);

  // Funções para manipulação de mensagens e conversas
  const alternarModoManipulacao = () => {
    setModoManipulacao((prev) => !prev);
  };

  const adicionarMensagem = () => {
    if (!selectedCliente) return;
    const novaMsg = prompt("Digite a nova mensagem:");
    if (!novaMsg) return;
    setClientes((prevClientes) =>
      prevClientes.map((cliente) =>
        cliente.cliente === selectedCliente
          ? { ...cliente, mensagens: [...cliente.mensagens, { remetente: "cliente", conteudo: novaMsg, horario: "10:30" }] }
          : cliente
      )
    );
  };

  const removerMensagem = (index: number) => {
    if (!selectedCliente) return;
    setClientes((prevClientes) =>
      prevClientes.map((cliente) =>
        cliente.cliente === selectedCliente
          ? { ...cliente, mensagens: cliente.mensagens.filter((_, i) => i !== index) }
          : cliente
      )
    );
  };

  const enviarMensagem = () => {
    if (!selectedCliente || !novaMensagem.trim()) return;
    setClientes((prevClientes) =>
      prevClientes.map((cliente) =>
        cliente.cliente === selectedCliente
          ? { ...cliente, mensagens: [...cliente.mensagens, { remetente: "eu", conteudo: novaMensagem, horario: "10:30" }] }
          : cliente
      )
    );
    setNovaMensagem("");
  };

  // Retorno sempre fixo, com renderização condicional dentro do JSX
  return (
    <div style={{ height: "100vh", fontFamily: "Arial, sans-serif" }}>
      {userValid === null ? (
        <div>Verificando usuário...</div>
      ) : (
        <>
          {/* Cabeçalho (Header) com avatar e userEmail */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "1rem",
              backgroundColor: "#000",
              borderBottomColor:"1px solid #efefe",
              color: "#ffffff",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0070f3",
                fontWeight: "bold",
                marginRight: "1rem",
              }}
            >
              {avatarLetter}
            </div>
            <div>
              <h2 style={{ margin: 0 }}>Dashboard</h2>
              <p style={{ margin: 0 }}>{userEmail}</p>
            </div>
          </div>

          {/* Conteúdo Principal */}
          <div style={{ display: "flex", height: "calc(100vh - 70px)", backgroundColor: "#f0f2f5" }}>
            {/* Sidebar */}
            <div style={{ width: "30%", backgroundColor: "#ffffff", borderRight: "1px solid #ddd", overflowY: "auto" }}>
              <div
                style={{
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: "#efefe",
                  color: "#ffffff",
                }}
              >
                <h3 style={{ margin: 0 }}>Conversas</h3>
                <button
                  onClick={alternarModoManipulacao}
                  style={{
                    backgroundColor: modoManipulacao ? "#ff4d4d" : "#0056b3",
                    color: "#ffffff",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  {modoManipulacao ? "Sair" : "Manipular"}
                </button>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {clientes.map((cliente, index) => (
                  <li
                    key={index}
                    onClick={() => setSelectedCliente(cliente.cliente)}
                    style={{
                      padding: "1rem",
                      cursor: "pointer",
                      backgroundColor: selectedCliente === cliente.cliente ? "#e6f7ff" : "transparent",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <strong>{cliente.cliente}</strong>
                    <p style={{ margin: "0.5rem 0 0 0", color: "#555", fontSize: "0.9rem" }}>
                      {cliente.mensagens[cliente.mensagens.length - 1]?.conteudo}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Área de Mensagens */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#ffffff" }}>
              {selectedCliente ? (
                <>
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#0070f3",
                      color: "#ffffff",
                      fontWeight: "bold",
                    }}
                  >
                    {selectedCliente} - {modoManipulacao ? "Modo Manipulação" : "Visualizando Conversa"}
                  </div>
                  <div style={{ flex: 1, padding: "1rem", overflowY: "auto", borderTop: "1px solid #ddd" }}>
                    {clientes
                      .find((cliente) => cliente.cliente === selectedCliente)
                      ?.mensagens.map((msg, index) => (
                        <div key={index} style={{ display: "flex", alignItems: "center" }}>
                          <p
                            style={{
                              padding: "0.5rem",
                              backgroundColor: msg.remetente === "cliente" ? "#f0f0f0" : "#0070f3",
                              color: msg.remetente === "cliente" ? "#000000" : "#ffffff",
                              borderRadius: "8px",
                              maxWidth: "70%",
                              marginBottom: "1rem",
                              marginLeft: msg.remetente === "cliente" ? "0" : "auto",
                              flex: 1,
                            }}
                          >
                            {msg.conteudo}
                          </p>
                          {modoManipulacao && (
                            <button
                              onClick={() => removerMensagem(index)}
                              style={{
                                marginLeft: "10px",
                                backgroundColor: "red",
                                color: "#fff",
                                border: "none",
                                borderRadius: "4px",
                                padding: "0.3rem",
                                cursor: "pointer",
                              }}
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                  {modoManipulacao ? (
                    <div style={{ padding: "1rem", borderTop: "1px solid #ddd" }}>
                      <button
                        onClick={adicionarMensagem}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: "#0070f3",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        Adicionar Mensagem
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: "1rem", borderTop: "1px solid #ddd", display: "flex" }}>
                      <input
                        type="text"
                        placeholder="Digite sua mensagem..."
                        value={novaMensagem}
                        onChange={(e) => setNovaMensagem(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "0.5rem",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                        }}
                      />
                      <button
                        onClick={enviarMensagem}
                        style={{
                          marginLeft: "0.5rem",
                          padding: "0.5rem 1rem",
                          backgroundColor: "#0070f3",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        Enviar
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    flex: 1,
                    color: "#888",
                  }}
                >
                  <p>Selecione uma conversa para começar.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}