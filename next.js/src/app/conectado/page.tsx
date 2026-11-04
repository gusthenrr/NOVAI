"use client";
import {useState} from "react";
import AccountFrame from "../components/AccountFrame";
export default function ConectadoPage(){
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function connect(){setBusy(true);setError("");try{const token=localStorage.getItem("authToken");if(!token){location.href="/login";return;}const response=await fetch((process.env.NEXT_PUBLIC_API_URL||"https://novai-production-0d2f.up.railway.app")+"/api/novai/dashboard/connect",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}"});const data=await response.json();if(!response.ok)throw Error();location.href=data.url;}catch{setError("Não foi possível iniciar a conexão. Entre novamente na sua conta e tente outra vez.");}finally{setBusy(false);}}
 return <AccountFrame title="Sua conta NOVAI"><p>Abra o painel para acompanhar sua loja. A coleta acontece em segundo plano e os resultados aparecem conforme cada mês é processado.</p><a className="account-submit" href="/dashboard/inicio">Abrir painel</a><button className="account-back" onClick={connect} disabled={busy}>{busy?"Preparando…":"Conectar ou renovar autorização do Mercado Livre"}</button>{error&&<p role="alert">{error}</p>}<a className="account-back" href="/login">Entrar na conta NOVAI</a></AccountFrame>;
}
