import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="text-center flex flex-col gap-6 p-8">
        <h1 className="text-4xl font-black">🌮 SaasMike</h1>
        <p className="text-neutral-400">Sistema de pedidos por WhatsApp</p>
        <Link
          href="/panel"
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 font-bold"
        >
          Entrar al panel de pedidos →
        </Link>
      </div>
    </main>
  );
}
