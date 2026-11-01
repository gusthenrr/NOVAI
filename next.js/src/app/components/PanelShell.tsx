/* eslint-disable @next/next/no-html-link-for-pages -- The presentation home is a standalone HTML route. */
"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import "./panel.css";
const sections = [
  { label: "Resumo", href: "/dashboard/inicio", icon: "layout-dashboard" },
  { label: "Promoções", href: "/dashboard/Promotion", icon: "speakerphone" },
  { label: "Reclamações", href: "/dashboard/claims", icon: "receipt-2" },
  { label: "Assistente NOVAI", href: "/Manager", icon: "box" },
  { label: "Extensão NOVAI", href: "/dashboard/ExtensaoNovai", icon: "bookmark" },
];
export default function PanelShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = sections.find(item=>item.href===path)?.label || "Painel";
  return <div className="novai-panel">
    <a className="novai-panel-skip" href="#novai-main">Ir para o conteúdo</a>
    <aside className={`novai-sidebar ${menuOpen ? "is-open" : ""}`}>
      <a className="novai-panel-brand" href="/dashboard/inicio" aria-label="NOVAI, início"><Image unoptimized src="/painel/assets/novai.svg" alt="NOVAI" width={80} height={57}/></a>
      <nav aria-label="Navegação do painel">{sections.map(item=><a key={item.href} className={`novai-nav-item ${path===item.href ? "active" : ""}`} href={item.href} aria-current={path===item.href ? "page" : undefined}><i style={{maskImage:`url(/painel/assets/icons/${item.icon}.svg)`,WebkitMaskImage:`url(/painel/assets/icons/${item.icon}.svg)`}} aria-hidden="true"/><span>{item.label}</span></a>)}</nav>
      <div className="novai-sidebar-end"><a className="novai-nav-item" href="/conectado"><i style={{maskImage:"url(/painel/assets/icons/adjustments-horizontal.svg)",WebkitMaskImage:"url(/painel/assets/icons/adjustments-horizontal.svg)"}} aria-hidden="true"/>Minha conta</a><a className="novai-nav-item" href="/">Site NOVAI ↗</a></div>
    </aside>
    <div className="novai-workspace"><header className="novai-topbar"><button className="novai-mobile-menu" onClick={()=>setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Abrir navegação">☰</button><div className="novai-store"><span className="novai-store-icon">◈</span><div><strong>Sua conta</strong><small>Mercado Livre</small></div><Image unoptimized src="/painel/assets/mercado-livre-simbolo.png" alt="Mercado Livre" width={27} height={20}/></div><a className="novai-account-link" href="/conectado">Minha conta</a></header>
      <div id="novai-main" className="novai-panel-main"><div className="novai-page-head"><div><span>VISÃO DA LOJA</span><h1>{title}</h1></div></div><div className="novai-panel-content">{children}</div></div>
    </div>
  </div>;
}
