"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {handleLogin} from "../login" // Certifique-se que o caminho está correto
import { useUser } from "../../../userContext";

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const {setToken, setUserValid}=useUser()
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await handleLogin(email, password);
      if (result.success && result.data.token) {
        localStorage.setItem("authToken", result.data.token);
        console.log("token do login:",result.data.token)
        setToken(result.data.token)
        setUserValid(false)
        window.location.replace("/prevenda"); // Ou router.push('/prevend') se preferir a navegação do Next
      } else {
        setErrorMessage(result.message || "E-mail ou senha inválidos."); // Mensagem mais específica
      }
    } catch (error) {
      console.error("Login error:", error); // Adicionar log do erro
      setErrorMessage("Erro ao conectar com o servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  
  const amareloLight = "rgb(253, 244, 110)";
  const amareloLightTransparenteInicioFim = "rgba(253, 244, 110, 0.2)";
  const amareloLightMeio = "rgba(253, 244, 110, 0.8)";


  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#f9f9f9", // Fundo da página
      }}
    >
      {/* Container Flex para os dois formulários e o divisor */}
      <div style={{ display: "flex", alignItems: "stretch", boxShadow: "0 5px 20px rgba(0, 0, 0, 0.2)" , borderRadius: "20px" }}> {/* Sombra no container geral */}
        {/* Formulário Esquerdo (Preto) */}
        <div // Alterado de form para div para não ter submissão aninhada, se for só visual
          style={{
            padding: "3rem", // Ajustado padding para melhor visualização do logo
            borderTopLeftRadius : "20px",
            borderBottomLeftRadius : "20px",
            height: "495px", // Altura consistente
            width: "300px",
            backgroundColor: "#000",
            color: "#111111",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between", // Para alinhar o logo e o botão
            alignItems: "center", // Centraliza o logo horizontalmente
          }}
        >
          <img
            src="/novai_sem_fundo_branco.png" // Certifique-se que o caminho está correto
            alt="Logo Novai"
            style={{ width: "80%", height: "auto", marginTop: "2rem", marginBottom:"1rem" }} // Ajuste de margem e tamanho
          />
          <button
            type="button"
            onClick={() => router.push("/cadastro")}
            style={{
              width: "calc(100% - 0rem)", // Largura total menos padding lateral do botão
              padding: ".75rem",
              backgroundColor: "#000",
              color: "#ffffff",
              border: "1px solid rgb(252, 244, 129)", // Borda sólida
              borderRadius: "15px",
              cursor: "pointer",
              // marginTop: "auto", // Empurra para baixo
              marginBottom: "2rem", // Espaço na parte inferior
              display: "block", 
              fontWeight: "500",
              transition: "background-color 0.2s, border-color 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "rgb(31, 31, 31)";
              e.currentTarget.style.color = "#ffffff";
              e.currentTarget.style.borderColor = amareloLight;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#000";
              e.currentTarget.style.color = "#fff";
            }}
          >
            Criar Conta
          </button>
        </div>

        {/* Fio Divisor Amarelo */}
        <div
          style={{
            width: '10px', // Espessura do fio
            height: '495px', // Mesma altura dos formulários
            background: `linear-gradient(to right, ${amareloLightTransparenteInicioFim}, ${amareloLightMeio} 30%, ${amareloLightMeio} 70%, ${amareloLightTransparenteInicioFim})`,
          }}
        />

        {/* Formulário Direito (Branco) */}
        <form
          onSubmit={onSubmit}
          style={{
            padding: "3rem", // Ajustado padding
            height: "495px", // Altura consistente
            borderTopRightRadius : "20px",
            borderBottomRightRadius : "20px",
            // boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)", // Sombra já está no container pai
            width: "400px", // Ajustado para um tamanho razoável
            backgroundColor: "#ffffff",
            color: "#111111",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center", // Centraliza o conteúdo verticalmente
          }}
        >
          <h2 style={{ textAlign: "center", color: "#111111", marginBottom: "1.5rem", fontSize:"1.8rem" }}>Login</h2> {/* Ajuste de margem e tamanho */}
          {errorMessage && (
            <p
              style={{
                color: "red",
                textAlign: "center",
                marginBottom: "1rem",
                fontSize: "0.9rem",
                minHeight: "1.2em" // Para evitar pulo de layout
              }}
            >
              {errorMessage}
            </p>
          )}
          <div style={{ marginBottom: "1.2rem" }}> {/* Ajuste de margem */}
            <label
              htmlFor="email"
              style={{
                display: "block",
                marginBottom: ".5rem",
                color: "#333333", // Cor do label mais escura
                fontSize: "0.9rem",
                fontWeight: "500"
              }}
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              required
              style={{
                width: "100%",
                padding: ".75rem", // Padding aumentado
                borderRadius: "8px", // Borda mais suave
                border: "1px solid #ccc",
                color: "#333333",
                backgroundColor: "#f9f9f9", // Fundo do input levemente acinzentado
                boxSizing: "border-box",
                fontSize: "1rem"
              }}
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}> {/* Ajuste de margem */}
            <label
              htmlFor="password"
              style={{
                display: "block",
                marginBottom: ".5rem",
                color: "#333333",
                fontSize: "0.9rem",
                fontWeight: "500"
              }}
            >
              Senha
            </label>
            <input
              type="password"
              id="password"
              value={password}
              placeholder="Digite sua senha"
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: ".75rem",
                borderRadius: "8px",
                border: "1px solid #ccc",
                color: "#333333",
                backgroundColor: "#f9f9f9",
                boxSizing: "border-box",
                fontSize: "1rem"
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              // marginTop: "5px", // Removido, o flex container já ajuda
              width: "100%",
              padding: ".85rem", // Padding aumentado
              backgroundColor: loading ? "#cccccc" : amareloLight, // Amarelo para o botão
              color: loading? "#666666" : "#1A1A1A", // Texto preto para contraste no amarelo
              border: "none", // Sem borda
              borderRadius: "8px", // Consistente com inputs
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              fontSize: "1rem",
              transition: "background-color 0.2s ease, transform 0.1s ease",
            }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'rgb(240, 230, 100)';}} // Amarelo mais escuro no hover
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.backgroundColor = amareloLight;}}
            onMouseDown={(e) => { if(!loading) e.currentTarget.style.transform = 'scale(0.98)';}}
            onMouseUp={(e) => { if(!loading) e.currentTarget.style.transform = 'scale(1)';}}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
