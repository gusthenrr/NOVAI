/* eslint-disable @next/next/no-html-link-for-pages -- The presentation home is a standalone HTML route. */
import Image from "next/image";
import type { ReactNode } from "react";
import "./account.css";
export default function AccountFrame({ title, children }: { title: string; children: ReactNode }) {
  return <div className="novai-account"><main className="novai-account-card"><a className="account-logo-link" href="/" aria-label="Página inicial NOVAI"><h1 className="novai-account-logo"><Image unoptimized src="/account-logo.svg" width={86} height={61} alt="NOVAI"/></h1></a><h2>{title}</h2>{children}</main></div>;
}
