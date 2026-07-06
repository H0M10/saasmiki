// Lee una variable de entorno tolerando errores comunes de pegado en
// Vercel: espacios/saltos de línea alrededor, comillas envolventes, el
// nombre pegado como prefijo ("NOMBRE=valor"), valores repetidos en varias
// líneas, e incluso líneas de OTRAS variables mezcladas.
export function env(nombre: string): string {
  const crudo = (process.env[nombre] ?? "").trim();
  const lineas = crudo
    .split(/\r?\n/)
    .map(limpiar)
    .filter((l) => l.length > 0);

  // Si alguna línea trae explícitamente "NOMBRE=valor", esa gana.
  for (const l of lineas) {
    if (l.startsWith(`${nombre}=`)) return limpiar(l.slice(nombre.length + 1));
  }
  // Descartar líneas que pertenecen a otras variables ("OTRA_VAR=...").
  const propias = lineas.filter((l) => !/^[A-Z][A-Z0-9_]*=/.test(l));
  return propias[0] ?? "";
}

function limpiar(v: string): string {
  v = v.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}
