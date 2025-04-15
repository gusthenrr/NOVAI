"use client";

import { useRouter } from "next/navigation";

export default function CadastroPage() {
  const Router = useRouter();

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
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          backgroundColor: "#000",
          display: "flex",
          alignItems: "center",
          padding: "15px 20px",
          boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
        }}
      >
        <form
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            height: "55px",
          }}
        >
          <img
            src="/NOVAI.png"
            alt="Logo da Novai"
            style={{
              width: "150px",
              marginLeft: "30px",
              height: "auto",
              marginBottom: ".5rem",
            }}
          />
        </form>
      </div>
      <div
        style={{
          marginTop: "70px",
          paddingTop: "2rem",
          paddingBottom: "3rem",
          paddingLeft: "3rem",
          paddingRight: "3rem",
          border: "1px solid #ccc",
          borderRadius: "20px",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          width: "330px",
          height: "490px",
          backgroundColor: "#000",
        }}
      >
        <h2
          style={{
            fontSize: "25px",
            textAlign: "center",
            color: "#f9f9f9",
            paddingBottom: "0px",
          }}
        >
          Seja Bem-vindo
        </h2>
        <h2
          style={{
            fontSize: "20px",
            textAlign: "center",
            color: "#f9f9f9",
            marginBottom: "1.5rem",
          }}
        >
          Cadastre-se:
        </h2>

        {/* Formulário usando o método POST */}
        <form
          action="https://6028-2804-18-1856-9d4f-cd28-27c5-8f8e-dc8.ngrok-free.app/add-usuario"
          method="POST"
        >
          <div>
            <label
              htmlFor="usuario"
              style={{ display: "block", marginBottom: ".5rem", color: "#f9f9f9" }}
            >
              Usuário:
            </label>
            <input
              type="text"
              name="usuario"
              placeholder="Digite seu usuário"
              style={{
                width: "100%",
                padding: ".5rem",
                marginBottom: "1rem",
                borderRadius: "20px",
                border: "1px solid #f9f9f9",
                color: "#f9f9f9",
                backgroundColor: "#0e0e0e",
              }}
              required
            />
          </div>
          <div>
            <label
              htmlFor="email"
              style={{ display: "block", marginBottom: ".5rem", color: "#f9f9f9" }}
            >
              Email:
            </label>
            <input
              type="email"
              name="email"
              placeholder="Digite seu e-mail"
              style={{
                width: "100%",
                padding: ".5rem",
                marginBottom: "1rem",
                borderRadius: "20px",
                border: "1px solid #ccc",
                color: "#f9f9f9",
                backgroundColor: "#1a1a1a",
              }}
              required
            />
          </div>
          <div>
            <label
              htmlFor="senha"
              style={{ display: "block", marginBottom: ".5rem", color: "#f9f9f9" }}
            >
              Senha:
            </label>
            <input
              type="password"
              name="senha"
              placeholder="Digite sua senha"
              style={{
                width: "100%",
                padding: ".5rem",
                marginBottom: "1.5rem",
                borderRadius: "20px",
                border: "1px solid #ccc",
                color: "#f9f9f9",
                backgroundColor: "#2c2c2c",
              }}
              required
            />
          </div>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: ".75rem",
              backgroundColor: "#000",
              color: "#ffffff",
              border: "solid 1px #ffff",
              display: "block",
              borderRadius: "15px",
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
