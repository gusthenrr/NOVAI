"use client";

import { useRouter } from "next/navigation";

export default function ConectadoPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-neutral-950 px-6 text-white">
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
        <section className="w-full rounded-3xl border border-white/10 bg-neutral-900 p-10 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-300 text-3xl font-bold text-black">
            ✓
          </div>
          <h1 className="text-3xl font-semibold">Conta conectada</h1>
          <p className="mt-4 leading-7 text-neutral-300">
            A autorização do Mercado Livre foi concluída. Neste momento, a
            NOVAI armazenou somente as credenciais OAuth e a data de expiração.
          </p>
          <p className="mt-3 text-sm text-neutral-500">
            Nenhum anúncio, pedido, mensagem, campanha, reclamação ou métrica
            foi importado.
          </p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-8 rounded-xl bg-yellow-300 px-6 py-3 font-semibold text-black transition hover:bg-yellow-200"
          >
            Voltar ao login
          </button>
        </section>
      </div>
    </main>
  );
}
