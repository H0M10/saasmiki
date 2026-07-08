"use client";

import { useCallback, useEffect, useState } from "react";
import { useClave, PantallaClave, NavPanel, dinero } from "@/components/panel-ui";

type Kpis = {
  dias: number;
  resumen: {
    pedidos: number;
    entregados: number;
    rechazados: number;
    ingresos: number;
    ticketPromedio: number;
    clientesUnicos: number;
    recurrentes: number;
    minCocina: number | null;
    minEntrega: number | null;
  };
  ventasPorDia: { fecha: string; pedidos: number; ingresos: number }[];
  porHora: number[];
  topPlatillos: { nombre: string; cantidad: number; ingreso: number }[];
  pagos: { efectivo: number; tarjeta: number; transferencia: number };
  zonas: { etiqueta: string; pedidos: number }[] | null;
};

const BARRA = "var(--color-grafica)";

export default function PaginaKpis() {
  const { clave, lista, guardar, salir } = useClave("panel_key");
  const [mala, setMala] = useState(false);
  const [dias, setDias] = useState(7);
  const [k, setK] = useState<Kpis | null>(null);

  const cargar = useCallback(
    async (kv: string, d: number) => {
      const res = await fetch(`/api/panel/kpis?dias=${d}`, { headers: { "x-panel-key": kv } });
      if (res.status === 401) {
        salir();
        setMala(true);
        return;
      }
      const j = await res.json();
      if (res.ok) setK(j);
    },
    [salir]
  );

  useEffect(() => {
    if (clave) cargar(clave, dias);
  }, [clave, dias, cargar]);

  if (!lista) return null;
  if (!clave) {
    return (
      <PantallaClave
        titulo="KPIs"
        incorrecta={mala}
        onEntrar={(v) => {
          guardar(v);
          setMala(false);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto">
      <NavPanel clave={clave} onSalir={salir} />

      {/* filtro de rango */}
      <div className="flex gap-2 mb-5">
        {[7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={`titulo px-4 py-1.5 rounded-lg text-sm font-bold ${
              dias === d ? "bg-papel text-tinta" : "bg-carbon-2 text-humo hover:text-hueso"
            }`}
          >
            {d} días
          </button>
        ))}
      </div>

      {!k ? (
        <p className="text-humo">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* fichas de resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Ficha titulo="Pedidos" valor={String(k.resumen.pedidos)} nota={`${k.resumen.entregados} entregados`} />
            <Ficha titulo="Ingresos" valor={dinero(k.resumen.ingresos)} nota="solo entregados" />
            <Ficha titulo="Ticket promedio" valor={dinero(k.resumen.ticketPromedio)} />
            <Ficha
              titulo="Clientes"
              valor={String(k.resumen.clientesUnicos)}
              nota={`${k.resumen.recurrentes} repitieron`}
            />
            <Ficha
              titulo="Cocina"
              valor={k.resumen.minCocina != null ? `${k.resumen.minCocina} min` : "—"}
              nota="aceptado → listo"
            />
            <Ficha
              titulo="Entrega"
              valor={k.resumen.minEntrega != null ? `${k.resumen.minEntrega} min` : "—"}
              nota="en camino → entregado"
            />
            <Ficha titulo="Rechazados" valor={String(k.resumen.rechazados)} nota="+ cancelados" />
            <Ficha
              titulo="Conversión"
              valor={k.resumen.pedidos ? `${Math.round((k.resumen.entregados / k.resumen.pedidos) * 100)}%` : "—"}
              nota="pedidos → entregados"
            />
          </div>

          {/* ventas por día */}
          <Tarjeta titulo={`Ingresos por día (${k.dias} días)`}>
            <BarrasVerticales
              datos={k.ventasPorDia.map((v) => ({
                etiqueta: v.fecha.slice(5).replace("-", "/"),
                valor: v.ingresos,
                tip: `${v.fecha} · ${dinero(v.ingresos)} · ${v.pedidos} pedidos`,
              }))}
              formato={(n) => dinero(n)}
            />
            <details className="mt-3">
              <summary className="text-humo text-xs cursor-pointer">ver tabla</summary>
              <table className="ticket-num text-xs text-hueso mt-2 w-full max-w-sm">
                <thead>
                  <tr className="text-humo text-left">
                    <th className="pr-4">Fecha</th>
                    <th className="pr-4">Pedidos</th>
                    <th>Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {k.ventasPorDia.map((v) => (
                    <tr key={v.fecha}>
                      <td className="pr-4">{v.fecha}</td>
                      <td className="pr-4">{v.pedidos}</td>
                      <td>{dinero(v.ingresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Tarjeta>

          {/* pedidos por hora */}
          <Tarjeta titulo="Pedidos por hora del día">
            <BarrasVerticales
              datos={k.porHora.map((n, h) => ({
                etiqueta: h % 3 === 0 ? String(h) : "",
                valor: n,
                tip: `${h}:00 — ${n} pedidos`,
              }))}
              compactas
              formato={(n) => String(n)}
            />
          </Tarjeta>

          <div className="grid md:grid-cols-2 gap-6">
            {/* top platillos */}
            <Tarjeta titulo="Platillos más vendidos">
              {k.topPlatillos.length === 0 ? (
                <Vacio />
              ) : (
                <BarrasHorizontales
                  datos={k.topPlatillos.map((t) => ({
                    etiqueta: t.nombre,
                    valor: t.cantidad,
                    tip: `${t.nombre}: ${t.cantidad} vendidos · ${dinero(t.ingreso)}`,
                  }))}
                />
              )}
            </Tarjeta>

            {/* métodos de pago */}
            <Tarjeta titulo="Métodos de pago">
              <BarrasHorizontales
                datos={[
                  { etiqueta: "💵 Efectivo", valor: k.pagos.efectivo },
                  { etiqueta: "💳 Tarjeta", valor: k.pagos.tarjeta },
                  { etiqueta: "🏦 Transferencia", valor: k.pagos.transferencia },
                ].map((d) => ({
                  ...d,
                  tip: `${d.etiqueta}: ${d.valor} pedidos`,
                }))}
              />
            </Tarjeta>
          </div>

          {/* zonas */}
          <Tarjeta titulo="Zonas de entrega (distancia al restaurante)">
            {k.zonas ? (
              <BarrasHorizontales
                datos={k.zonas.map((z) => ({
                  etiqueta: z.etiqueta,
                  valor: z.pedidos,
                  tip: `${z.etiqueta}: ${z.pedidos} pedidos`,
                }))}
              />
            ) : (
              <p className="text-humo text-sm">
                Configura el centro de tu zona en{" "}
                <a href="/panel/ajustes" className="underline text-fuego">
                  Ajustes
                </a>{" "}
                para ver esta gráfica.
              </p>
            )}
          </Tarjeta>
        </div>
      )}
    </main>
  );
}

function Ficha({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="bg-carbon-2 border border-carbon-3 rounded-xl p-3">
      <p className="titulo text-xs font-bold text-humo">{titulo}</p>
      <p className="ticket-num text-2xl font-bold text-hueso">{valor}</p>
      {nota && <p className="text-[11px] text-humo">{nota}</p>}
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-carbon-2 border border-carbon-3 rounded-xl p-4">
      <h2 className="titulo text-lg font-bold text-hueso mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function Vacio() {
  return <p className="text-humo text-sm">Sin datos en este rango.</p>;
}

function BarrasVerticales({
  datos,
  formato,
  compactas,
}: {
  datos: { etiqueta: string; valor: number; tip: string }[];
  formato: (n: number) => string;
  compactas?: boolean;
}) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const iMax = datos.findIndex((d) => d.valor === max && max > 0);
  return (
    <div className="flex items-end gap-[2px] h-36 border-b border-carbon-3">
      {datos.map((d, i) => (
        <div key={i} className="tip flex-1 flex flex-col items-center justify-end h-full" data-tip={d.tip}>
          {i === iMax && d.valor > 0 && (
            <span className="ticket-num text-[10px] text-hueso mb-0.5">{formato(d.valor)}</span>
          )}
          <div
            className="w-full rounded-t"
            style={{
              background: BARRA,
              height: `${(d.valor / max) * 100}%`,
              minHeight: d.valor > 0 ? 3 : 0,
              maxWidth: compactas ? 14 : 40,
            }}
          />
          <span className="ticket-num text-[9px] text-humo mt-1 h-3 overflow-hidden">{d.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

function BarrasHorizontales({
  datos,
}: {
  datos: { etiqueta: string; valor: number; tip: string }[];
}) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div className="flex flex-col gap-2">
      {datos.map((d, i) => (
        <div key={i} className="tip flex items-center gap-2" data-tip={d.tip}>
          <span className="text-xs text-hueso w-36 shrink-0 truncate">{d.etiqueta}</span>
          <div className="flex-1 h-5 relative">
            <div
              className="h-full rounded-r"
              style={{
                background: BARRA,
                width: `${(d.valor / max) * 100}%`,
                minWidth: d.valor > 0 ? 3 : 0,
              }}
            />
          </div>
          <span className="ticket-num text-xs text-hueso w-8 text-right">{d.valor}</span>
        </div>
      ))}
    </div>
  );
}
