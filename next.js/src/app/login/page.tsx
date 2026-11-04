/* eslint-disable @next/next/no-html-link-for-pages -- The presentation home is a standalone HTML route. */
"use client";
import { useState, type FormEvent } from "react";
import { handleLogin } from "../login";
import { useUser } from "../../../userContext";
import AccountFrame from "../components/AccountFrame";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setToken, setUserValid } = useUser();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setErrorMessage(null);
    try {
      const result = await handleLogin(email, password);
      if (result.success && result.data.token) {
        setToken(result.data.token); setUserValid(false);
        const query=new URLSearchParams(window.location.search);
        let tier=query.get('plano'),cycle=query.get('ciclo');
        try{const saved=JSON.parse(sessionStorage.getItem('novaiPendingCheckout')||'null');tier=tier||saved?.tier;cycle=cycle||saved?.cycle;}catch{}
        if(tier&&['pro','max'].includes(tier)&&cycle&&['monthly','annual'].includes(cycle)){
          try{sessionStorage.removeItem('novaiPendingCheckout');}catch{}
          window.location.replace('/planos?plano='+tier+'&ciclo='+cycle);
        }else window.location.replace("/conectado");
      } else setErrorMessage(result.message || "E-mail ou senha inválidos.");
    } catch { setErrorMessage("Erro ao conectar com o servidor. Tente novamente."); }
    finally { setLoading(false); }
  }
  return <AccountFrame title="Entrar na sua conta">
    <p>Acesse sua conta NOVAI para continuar.</p>
    <form id="form" onSubmit={onSubmit}>
      <label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@exemplo.com"/>
      <label htmlFor="password">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha"/>
      {errorMessage && <p role="alert" className="account-error">{errorMessage}</p>}
      <button id="submit" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
    </form>
    <a className="secondary account-back" href="/cadastro">Criar conta</a>
    <a className="account-back" href="/">Voltar ao início</a>
  </AccountFrame>;
}
