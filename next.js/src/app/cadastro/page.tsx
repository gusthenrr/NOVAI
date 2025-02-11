"use client";

import { useState } from "react";

export default function CadastroPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

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
      <div
        style={{
          padding: "2rem",
          border: "1px solid #ccc",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          width: "300px",
          backgroundColor: "#fff",
        }}
      >
        <h2 style={{ textAlign: "center", color: "#111111" }}>Cadastro</h2>

        <form
          action="https://7117-2804-7f0-7980-164f-e0db-9d26-59e2-43d6.ngrok-free.app/add-usuario"
          method="POST"
        >
          <input
            type="email"
            name="email"
            placeholder="Digite seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: ".5rem",
              marginBottom: "1rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              color: "#111111",
              backgroundColor: "#ffffff",
            }}
            required
          />

          <input
            type="password"
            name="senha"
            placeholder="Digite sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={{
              width: "100%",
              padding: ".5rem",
              marginBottom: "1rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              color: "#111111",
              backgroundColor: "#ffffff",
            }}
            required
          />

          <button
            type="submit"
            style={{
              width: "100%",
              padding: ".75rem",
              backgroundColor: "#0070f3",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cadastrar
          </button>
        </form>
      </div>
    </div>
  );
}
