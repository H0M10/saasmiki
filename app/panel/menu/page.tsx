"use client";

import { useCallback, useEffect, useState } from "react";
import { useClave, PantallaClave, NavPanel } from "@/components/panel-ui";

type Platillo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  orden: number;
  foto_url: string | null;
};

// Reduce la foto en el navegador (máx 1280 px, JPEG) para que suba rápido
// y WhatsApp la acepte sin problema.
async function comprimirImagen(archivo: File): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const max = 1280;
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("no se pudo procesar la imagen"))), "image/jpeg", 0.82)
  );
}

type Categoria = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  platillos: Platillo[];
};

export default function EditorMenu() {
  const { clave, lista, guardar, salir } = useClave("panel_key");
  const [mala, setMala] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [nuevaCat, setNuevaCat] = useState("");

  const cargar = useCallback(
    async (k: string) => {
      const res = await fetch("/api/panel/menu", { headers: { "x-panel-key": k } });
      if (res.status === 401) {
        salir();
        setMala(true);
        return;
      }
      const j = await res.json();
      setCategorias(j.categorias ?? []);
    },
    [salir]
  );

  useEffect(() => {
    if (clave) cargar(clave);
  }, [clave, cargar]);

  async function llamar(metodo: string, cuerpo?: object, query = "") {
    if (!clave) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/panel/menu${query}`, {
        method: metodo,
        headers: { "Content-Type": "application/json", "x-panel-key": clave },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      const j = await res.json();
      if (!res.ok) alert(`Error: ${j.error}`);
      else if (j.aviso) alert(j.aviso);
      await cargar(clave);
    } finally {
      setOcupado(false);
    }
  }

  async function subirFoto(platilloId: string, archivo: File) {
    if (!clave) return;
    setOcupado(true);
    try {
      const blob = await comprimirImagen(archivo);
      const fd = new FormData();
      fd.append("archivo", blob, "foto.jpg");
      fd.append("platillo_id", platilloId);
      const res = await fetch("/api/panel/menu/foto", {
        method: "POST",
        headers: { "x-panel-key": clave },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) alert(`Error: ${j.error}`);
      await cargar(clave);
    } catch (e) {
      alert(`Error con la imagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setOcupado(false);
    }
  }

  async function quitarFoto(platilloId: string) {
    if (!clave || !confirm("¿Quitar la foto de este platillo?")) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/panel/menu/foto?platillo_id=${platilloId}`, {
        method: "DELETE",
        headers: { "x-panel-key": clave },
      });
      if (!res.ok) {
        const j = await res.json();
        alert(`Error: ${j.error}`);
      }
      await cargar(clave);
    } finally {
      setOcupado(false);
    }
  }

  if (!lista) return null;
  if (!clave) {
    return (
      <PantallaClave
        titulo="Editor de menú"
        incorrecta={mala}
        onEntrar={(v) => {
          guardar(v);
          setMala(false);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      <NavPanel clave={clave} onSalir={salir} />

      <p className="text-humo text-sm mb-5">
        Lo que edites aquí se refleja en WhatsApp <b className="text-hueso">al instante</b>. Apaga el
        interruptor de un platillo cuando se agote.
      </p>

      <div className="flex flex-col gap-6">
        {categorias.map((cat) => (
          <section key={cat.id} className={`comanda p-4 pt-6 ${cat.activa ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                className="titulo text-2xl font-extrabold text-tinta bg-transparent border-b-2 border-transparent focus:border-fuego outline-none min-w-0 flex-1"
                defaultValue={cat.nombre}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== cat.nombre)
                    llamar("PATCH", { tipo: "categoria", id: cat.id, cambios: { nombre: v } });
                }}
              />
              <Interruptor
                encendido={cat.activa}
                etiquetas={["Activa", "Oculta"]}
                onCambio={(v) =>
                  llamar("PATCH", { tipo: "categoria", id: cat.id, cambios: { activa: v } })
                }
              />
              <button
                className="text-chile-2 text-sm underline"
                disabled={ocupado}
                onClick={() => {
                  if (confirm(`¿Borrar la categoría "${cat.nombre}" y todos sus platillos?`))
                    llamar("DELETE", undefined, `?tipo=categoria&id=${cat.id}`);
                }}
              >
                borrar
              </button>
            </div>

            <hr className="corte" />

            <ul className="flex flex-col">
              {cat.platillos
                .sort((a, b) => a.orden - b.orden)
                .map((pl) => (
                  <li
                    key={pl.id}
                    className={`flex items-center gap-2 flex-wrap py-2 border-b border-dashed border-tinta/15 ${
                      pl.disponible ? "" : "opacity-50"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <label
                        className="cursor-pointer block"
                        title={pl.foto_url ? "Cambiar foto" : "Agregar foto (el bot la manda al cliente)"}
                      >
                        {pl.foto_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pl.foto_url}
                            alt={pl.nombre}
                            className="w-12 h-12 object-cover rounded-lg border-2 border-tinta/20"
                          />
                        ) : (
                          <span className="w-12 h-12 rounded-lg border-2 border-dashed border-tinta/30 flex items-center justify-center text-lg">
                            📷
                          </span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) subirFoto(pl.id, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {pl.foto_url && (
                        <button
                          type="button"
                          title="Quitar foto"
                          onClick={() => quitarFoto(pl.id)}
                          className="absolute -top-1.5 -right-1.5 bg-chile text-papel rounded-full w-4 h-4 text-[10px] leading-none"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-40">
                      <input
                        className="ticket-num font-bold text-tinta bg-transparent border-b border-transparent focus:border-fuego outline-none w-full"
                        defaultValue={pl.nombre}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== pl.nombre)
                            llamar("PATCH", { tipo: "platillo", id: pl.id, cambios: { nombre: v } });
                        }}
                      />
                      <input
                        className="text-xs text-tinta-suave bg-transparent border-b border-transparent focus:border-fuego outline-none w-full"
                        placeholder="descripción…"
                        defaultValue={pl.descripcion ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (pl.descripcion ?? ""))
                            llamar("PATCH", {
                              tipo: "platillo",
                              id: pl.id,
                              cambios: { descripcion: v || null },
                            });
                        }}
                      />
                    </div>
                    <input
                      className="ticket-num text-tinta text-right w-20 bg-papel-2 rounded px-1 py-0.5 border border-tinta/20 focus:border-fuego outline-none"
                      defaultValue={Number(pl.precio).toFixed(2)}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value.replace(/[$,\s]/g, ""));
                        if (!isNaN(v) && v > 0 && v !== Number(pl.precio))
                          llamar("PATCH", { tipo: "platillo", id: pl.id, cambios: { precio: v } });
                        else e.target.value = Number(pl.precio).toFixed(2);
                      }}
                    />
                    <Interruptor
                      encendido={pl.disponible}
                      etiquetas={["Disponible", "Agotado"]}
                      onCambio={(v) =>
                        llamar("PATCH", { tipo: "platillo", id: pl.id, cambios: { disponible: v } })
                      }
                    />
                    <button
                      className="text-chile-2 text-xs underline"
                      disabled={ocupado}
                      onClick={() => {
                        if (confirm(`¿Borrar "${pl.nombre}"?`))
                          llamar("DELETE", undefined, `?tipo=platillo&id=${pl.id}`);
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
            </ul>

            <NuevoPlatillo
              onCrear={(nombre, precio, descripcion) =>
                llamar("POST", {
                  tipo: "platillo",
                  categoria_id: cat.id,
                  nombre,
                  precio,
                  descripcion: descripcion || null,
                  orden: cat.platillos.length + 1,
                })
              }
            />
          </section>
        ))}

        {/* nueva categoría */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = nuevaCat.trim();
            if (v) {
              llamar("POST", { tipo: "categoria", nombre: v, orden: categorias.length + 1 });
              setNuevaCat("");
            }
          }}
        >
          <input
            className="campo-oscuro flex-1"
            placeholder="Nueva categoría (ej. Postres)"
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
          />
          <button className="btn bg-fuego hover:bg-fuego-2 text-carbon">+ Categoría</button>
        </form>
      </div>
    </main>
  );
}

function NuevoPlatillo({
  onCrear,
}: {
  onCrear: (nombre: string, precio: number, descripcion: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [descripcion, setDescripcion] = useState("");

  return (
    <form
      className="flex gap-2 mt-3 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        const p = parseFloat(precio);
        if (nombre.trim() && !isNaN(p) && p > 0) {
          onCrear(nombre.trim(), p, descripcion.trim());
          setNombre("");
          setPrecio("");
          setDescripcion("");
        }
      }}
    >
      <input
        className="campo text-sm flex-1 min-w-32"
        placeholder="Nuevo platillo"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <input
        className="campo text-sm flex-1 min-w-32"
        placeholder="descripción (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <input
        className="campo ticket-num text-sm w-24"
        placeholder="$0.00"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
      />
      <button className="btn bg-tinta text-papel text-sm">+ Agregar</button>
    </form>
  );
}

function Interruptor({
  encendido,
  etiquetas,
  onCambio,
}: {
  encendido: boolean;
  etiquetas: [string, string] | string[];
  onCambio: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCambio(!encendido)}
      className={`sello text-xs cursor-pointer ${encendido ? "text-salsa-2" : "text-chile-2"}`}
    >
      {encendido ? etiquetas[0] : etiquetas[1]}
    </button>
  );
}
