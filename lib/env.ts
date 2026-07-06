// Lee una variable de entorno tolerando errores comunes de pegado en
// Vercel: espacios/saltos de línea alrededor, comillas envolventes, o el
// propio nombre pegado como prefijo ("NOMBRE=valor").
export function env(nombre: string): string {
  let v = (process.env[nombre] ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  if (v.startsWith(`${nombre}=`)) {
    v = v.slice(nombre.length + 1).trim();
  }
  return v;
}
