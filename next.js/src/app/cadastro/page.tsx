/* eslint-disable @next/next/no-html-link-for-pages -- The presentation home is a standalone HTML route. */
"use client";
import { useState, type FormEvent } from "react";
import AccountFrame from "../components/AccountFrame";
export default function CadastroPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    if (password !== confirmation) { event.preventDefault(); setError("As senhas não coincidem. Por favor, verifique."); }
  }
  return <AccountFrame title="Criar sua conta">
    <p>Comece com sua conta NOVAI e conecte seu Mercado Livre.</p>
    <form id="form" action={`${process.env.NEXT_PUBLIC_API_URL}/add-usuario`} method="POST" onSubmit={submit}>
      <label htmlFor="name">Nome</label><input id="name" name="usuario" autoComplete="name" required placeholder="Seu nome"/>
      <label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@exemplo.com"/>
      <label htmlFor="password">Senha</label><input id="password" name="senha" type="password" autoComplete="new-password" required value={password} onChange={e=>{setPassword(e.target.value);setError("");}} placeholder="Crie sua senha"/>
      <label htmlFor="confirmation">Confirmar senha</label><input id="confirmation" name="confirmar_senha_cliente" type="password" autoComplete="new-password" required value={confirmation} onChange={e=>{setConfirmation(e.target.value);setError("");}} placeholder="Repita sua senha"/>
      {error && <p role="alert" className="account-error">{error}</p>}
      <button id="submit" type="submit">Criar conta</button>
    </form>
    <a className="secondary account-back" href="/login">Já tenho conta · Entrar</a>
    <a className="account-back" href="/">Voltar ao início</a>
  </AccountFrame>;
}
