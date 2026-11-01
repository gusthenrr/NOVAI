import AccountFrame from "../components/AccountFrame";
export default function ConectadoPage() {
 return <AccountFrame title="Conta conectada"><p>A autorização do Mercado Livre foi concluída. Neste momento, a NOVAI armazenou somente as credenciais OAuth e a data de expiração.</p><p>Nenhum anúncio, pedido, mensagem, campanha, reclamação ou métrica foi importado.</p><a className="account-submit" href="/dashboard/inicio">Abrir painel</a><a className="account-back" href="/login">Voltar ao login</a></AccountFrame>;
}
