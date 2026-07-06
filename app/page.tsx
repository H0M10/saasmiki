import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="comanda w-full max-w-sm p-8 pt-10 text-center flex flex-col gap-5 entrar">
        <div>
          <p className="ticket-num text-xs text-tinta-suave tracking-widest">
            * * * SISTEMA DE PEDIDOS * * *
          </p>
          <h1 className="titulo text-5xl font-extrabold text-tinta mt-2">
            Saas<span className="text-fuego-2">Mike</span>
          </h1>
          <p className="text-tinta-suave text-sm mt-1">Pedidos por WhatsApp · Panel de cocina</p>
        </div>
        <hr className="corte" />
        <Link href="/panel" className="btn bg-fuego hover:bg-fuego-2 text-carbon text-lg py-3">
          🍳 Panel del restaurante
        </Link>
        <Link href="/repa" className="btn bg-tinta text-papel hover:opacity-90 text-lg py-3">
          🛵 Soy repartidor
        </Link>
        <p className="ticket-num text-[10px] text-tinta-suave">
          — — — — — — corte aquí — — — — — —
        </p>
      </div>
    </main>
  );
}
