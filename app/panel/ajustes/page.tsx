"use client";

import { useCallback, useEffect, useState } from "react";
import { useClave, PantallaClave, NavPanel } from "@/components/panel-ui";

type Horario = { abre: string; cierra: string } | null;

type Ajustes = {
  cerrado_manual: boolean;
  horarios: Record<string, Horario>;
  centro_lat: number | null;
  centro_lng: number | null;
  radio_km: number;
  mensaje_bienvenida: string;
  mensaje_cerrado: string;
  mensaje_fuera_zona: string;
  datos_transferencia: string | null;
};

const DIAS: { clave: string; nombre: string }[] = [
  { clave: "lun", nombre: "Lunes" },
  { clave: "mar", nombre: "Martes" },
  { clave: "mie", nombre: "Miércoles" },
  { clave: "jue", nombre: "Jueves" },
  { clave: "vie", nombre: "Viernes" },
  { clave: "sab", nombre: "Sábado" },
  { clave: "dom", nombre: "Domingo" },
];

export default function PaginaAjustes() {
  const { clave, lista, guardar, salir } = useClave("panel_key");
  const [mala, setMala] = useState(false);
  const [a, setA] = useState<Ajustes | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(
    async (k: string) => {
      const res = await fetch("/api/panel/ajustes", { headers: { "x-panel-key": k } });
      if (res.status === 401) {
        salir();
        setMala(true);
        return;
      }
      const j = await res.json();
      setA(j.ajustes);
    },
    [salir]
  );

  useEffect(() => {
    if (clave) cargar(clave);
  }, [clave, cargar]);

  async function guardarTodo() {
    if (!clave || !a) return;
    setGuardando(true);
    setGuardado(false);
    try {
      const res = await fetch("/api/panel/ajustes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-panel-key": clave },
        body: JSON.stringify(a),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(`Error: ${j.error}`);
      } else {
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2500);
      }
    } finally {
      setGuardando(false);
    }
  }

  if (!lista) return null;
  if (!clave) {
    return (
      <PantallaClave
        titulo="Ajustes"
        incorrecta={mala}
        onEntrar={(v) => {
          guardar(v);
          setMala(false);
        }}
      />
    );
  }
  if (!a) return <main className="min-h-screen p-6 text-humo">Cargando…</main>;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto">
      <NavPanel clave={clave} onSalir={salir} />

      <div className="flex flex-col gap-6">
        {/* Cierre manual */}
        <section className="comanda p-5 pt-6">
          <h2 className="titulo text-2xl font-extrabold text-tinta">Estado del negocio</h2>
          <hr className="corte" />
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-tinta-suave max-w-sm">
              El botón rojo cierra el negocio <b>ahora mismo</b> aunque esté en horario (se acabó
              todo, emergencia, etc.). El bot le dirá a los clientes que está cerrado.
            </p>
            <button
              className={`btn text-lg ${
                a.cerrado_manual
                  ? "bg-chile text-papel hover:bg-chile-2"
                  : "bg-salsa text-papel hover:bg-salsa-2"
              }`}
              onClick={() => setA({ ...a, cerrado_manual: !a.cerrado_manual })}
            >
              {a.cerrado_manual ? "Cerrado — clic para abrir" : "Abierto — clic para cerrar"}
            </button>
          </div>
        </section>

        {/* Horarios */}
        <section className="comanda p-5 pt-6">
          <h2 className="titulo text-2xl font-extrabold text-tinta">Horarios</h2>
          <p className="text-xs text-tinta-suave mt-1">
            Fuera de estos horarios el bot no toma pedidos. Un día apagado = cerrado todo el día.
            Si todos los días están apagados y no configuras ninguno, el bot atiende siempre.
          </p>
          <hr className="corte" />
          <ul className="flex flex-col gap-2">
            {DIAS.map((d) => {
              const h = a.horarios?.[d.clave] ?? null;
              return (
                <li key={d.clave} className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      setA({
                        ...a,
                        horarios: {
                          ...a.horarios,
                          [d.clave]: h ? null : { abre: "12:00", cierra: "22:00" },
                        },
                      })
                    }
                    className={`sello text-xs cursor-pointer w-24 text-center ${
                      h ? "text-salsa-2" : "text-tinta-suave/60"
                    }`}
                  >
                    {d.nombre}
                  </button>
                  {h ? (
                    <>
                      <input
                        type="time"
                        className="campo ticket-num text-sm py-1"
                        value={h.abre}
                        onChange={(e) =>
                          setA({
                            ...a,
                            horarios: { ...a.horarios, [d.clave]: { ...h, abre: e.target.value } },
                          })
                        }
                      />
                      <span className="text-tinta-suave text-sm">a</span>
                      <input
                        type="time"
                        className="campo ticket-num text-sm py-1"
                        value={h.cierra}
                        onChange={(e) =>
                          setA({
                            ...a,
                            horarios: { ...a.horarios, [d.clave]: { ...h, cierra: e.target.value } },
                          })
                        }
                      />
                    </>
                  ) : (
                    <span className="ticket-num text-xs text-tinta-suave/60">cerrado</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Zona de entrega */}
        <section className="comanda p-5 pt-6">
          <h2 className="titulo text-2xl font-extrabold text-tinta">Zona de entrega</h2>
          <p className="text-xs text-tinta-suave mt-1">
            Centro de la zona (lat, lng) y radio en km. El bot rechaza ubicaciones fuera del radio.
            Déjalo vacío para aceptar cualquier ubicación. Tip: en Google Maps, clic derecho en tu
            local → copiar coordenadas.
          </p>
          <hr className="corte" />
          <div className="flex gap-3 flex-wrap items-end">
            <label className="text-xs text-tinta-suave">
              Latitud
              <input
                className="campo ticket-num text-sm block w-36"
                value={a.centro_lat ?? ""}
                placeholder="20.5888"
                onChange={(e) =>
                  setA({ ...a, centro_lat: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs text-tinta-suave">
              Longitud
              <input
                className="campo ticket-num text-sm block w-36"
                value={a.centro_lng ?? ""}
                placeholder="-100.3899"
                onChange={(e) =>
                  setA({ ...a, centro_lng: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs text-tinta-suave">
              Radio (km)
              <input
                className="campo ticket-num text-sm block w-24"
                value={a.radio_km}
                onChange={(e) => setA({ ...a, radio_km: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
        </section>

        {/* Textos del bot */}
        <section className="comanda p-5 pt-6">
          <h2 className="titulo text-2xl font-extrabold text-tinta">Textos del bot</h2>
          <hr className="corte" />
          <div className="flex flex-col gap-3">
            <label className="text-xs text-tinta-suave">
              Bienvenida
              <textarea
                className="campo text-sm block w-full mt-1"
                rows={2}
                value={a.mensaje_bienvenida}
                onChange={(e) => setA({ ...a, mensaje_bienvenida: e.target.value })}
              />
            </label>
            <label className="text-xs text-tinta-suave">
              Mensaje de cerrado
              <textarea
                className="campo text-sm block w-full mt-1"
                rows={2}
                value={a.mensaje_cerrado}
                onChange={(e) => setA({ ...a, mensaje_cerrado: e.target.value })}
              />
            </label>
            <label className="text-xs text-tinta-suave">
              Fuera de zona
              <textarea
                className="campo text-sm block w-full mt-1"
                rows={2}
                value={a.mensaje_fuera_zona}
                onChange={(e) => setA({ ...a, mensaje_fuera_zona: e.target.value })}
              />
            </label>
            <label className="text-xs text-tinta-suave">
              Datos de transferencia (los manda el bot cuando eligen ese pago)
              <textarea
                className="campo ticket-num text-sm block w-full mt-1"
                rows={3}
                placeholder={"Banco: …\nCLABE: …\nTitular: …"}
                value={a.datos_transferencia ?? ""}
                onChange={(e) => setA({ ...a, datos_transferencia: e.target.value || null })}
              />
            </label>
          </div>
        </section>

        <div className="flex items-center gap-4 pb-10">
          <button
            className="btn bg-fuego hover:bg-fuego-2 text-carbon text-lg px-8"
            disabled={guardando}
            onClick={guardarTodo}
          >
            {guardando ? "Guardando…" : "Guardar todo"}
          </button>
          {guardado && <span className="sello text-salsa text-sm">✓ Guardado</span>}
        </div>
      </div>
    </main>
  );
}
