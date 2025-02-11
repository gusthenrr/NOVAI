"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";



export default function LoginPage() {
  const [email, setEmail] = useState<string>(""); // Estado do e-mail
  const [password, setPassword] = useState<string>(""); // Estado da senha
  const [loading, setLoading] = useState<boolean>(false); // Estado de carregamento
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Estado para mensagens de erro
  const router = useRouter(); // Hook para redirecionamento

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
  
    try {
      const response = await fetch("./login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        // Se o login for bem-sucedido, redireciona para /dashboard
        router.push("");
      } else {
        // Se ocorrer erro, exibe a mensagem de erro retornada pela API
        setErrorMessage(data.message || "Erro no login");
      }
    } catch (error) {
      setErrorMessage("Erro ao se conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#f9f9f9",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          padding: "2rem",
          border: "1px solid #ccc",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          width: "300px",
          backgroundColor: "#fff",
          color: "#111111", // Fonte mais escura para contraste
        }}
      >
        <h2 style={{ textAlign: "center", color: "#111111" }}>Login</h2>
        {errorMessage && (
          <p
            style={{
              color: "red",
              textAlign: "center",
              marginBottom: "1rem",
              fontSize: "0.9rem",
            }}
          >
            {errorMessage}
          </p>
        )}
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="email"
            style={{
              display: "block",
              marginBottom: ".5rem",
              color: "#111111", // Fonte mais escura
            }}
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: ".5rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              color: "#111111", // Texto dentro do input
              backgroundColor: "#ffffff", // Fundo do input
            }}
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="password"
            style={{
              display: "block",
              marginBottom: ".5rem",
              color: "#111111", // Fonte mais escura
            }}
          >
            Senha
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: ".5rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              color: "#111111", // Texto dentro do input
              backgroundColor: "#ffffff", // Fundo do input
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading} // Desativa o botão enquanto está carregando
          style={{
            width: "100%",
            padding: ".75rem",
            backgroundColor: loading ? "#999999" : "#0070f3",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <button
  type="button"
  onClick={() => router.push("/cadastro")} // Redireciona para a página de cadastro
  style={{
    width: "100%", 
    padding: ".75rem",
    backgroundColor: "#0070f3",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    marginTop: "10px", // 🔥 Garante espaço entre os botões
    display: "block", 
  }}
>
  Criar Conta
</button>

      </form>
    </div>

  
  );
}