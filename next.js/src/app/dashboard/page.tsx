"use client";

import React, { useState } from "react";

export default function DashboardPage() {
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

  const [selectedCliente, setSelectedCliente] = useState<string | null>(null); // Cliente selecionado
  const [modoManipulacao, setModoManipulacao] = useState<boolean>(false); // Controle do modo de manipulação
  const [novaMensagem, setNovaMensagem] = useState<string>(""); // Campo para nova mensagem

  // Alterna entre modos (Manipulação ou Envio)
  const alternarModoManipulacao = () => {
    setModoManipulacao((prev) => !prev);
  };

  // Adicionar mensagem ao cliente
  const adicionarMensagem = () => {
    if (!selectedCliente) return;

    const novaMensagem = prompt("Digite a nova mensagem:");
    if (!novaMensagem) return;

    setClientes((prevClientes) =>
      prevClientes.map((cliente) =>
        cliente.cliente === selectedCliente
          ? {
              ...cliente,
              mensagens: [
                ...cliente.mensagens,
                { remetente: "cliente", conteudo: novaMensagem, horario: "10:30" },
              ],
            }
          : cliente
      )
    );
  };

  // Remover mensagem do cliente
  const removerMensagem = (index: number) => {
    if (!selectedCliente) return;

    setClientes((prevClientes) =>
      prevClientes.map((cliente) =>
        cliente.cliente === selectedCliente
          ? {
              ...cliente,
              mensagens: cliente.mensagens.filter((_, i) => i !== index),
            }
          : cliente
      )
    );
  };

  // Enviar uma nova mensagem
  const enviarMensagem = () => {
    if (!selectedCliente || !novaMensagem.trim()) return;

    setClientes((prevClientes) =>
      prevClientes.map((cliente) =>
        cliente.cliente === selectedCliente
          ? {
              ...cliente,
              mensagens: [
                ...cliente.mensagens,
                { remetente: "eu", conteudo: novaMensagem, horario: "10:30" },
              ],
            }
          : cliente
      )
    );
    setNovaMensagem(""); // Limpa o campo de entrada
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f0f2f5",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: "30%",
          backgroundColor: "#ffffff",
          borderRight: "1px solid #ddd",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#0070f3",
            color: "#ffffff",
          }}
        >
          <h3 style={{ margin: 0 }}>Conversas</h3>
          <button
            onClick={alternarModoManipulacao}
            style={{
              backgroundColor: modoManipulacao ? "#ff4d4d" : "#0056b3", // Vermelho para manipular, azul para envio
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
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
        }}
      >
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
              {selectedCliente} -{" "}
              {modoManipulacao ? "Modo Manipulação" : "Visualizando Conversa"}
            </div>
            <div
              style={{
                flex: 1,
                padding: "1rem",
                overflowY: "auto",
                borderTop: "1px solid #ddd",
              }}
            >
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
  );
}
