# Plan: Sistema de pedidos por WhatsApp para restaurante

## 1. Visión general

Tres piezas que se comunican entre sí:

```
Cliente (WhatsApp) ⇄ Bot (webhook/API) ⇄ Base de datos ⇄ App Web (panel del restaurante)
```

- El **bot de WhatsApp** toma el pedido: muestra el menú, registra platillos y modificaciones, pide nombre, método de pago y ubicación.
- La **base de datos** es la fuente única de verdad: menú, pedidos, clientes, horarios, zona de entrega.
- La **app web** administra todo: aceptar/declinar pedidos, cocina, repartidores, tickets con QR, menú, KPIs y ajustes. Como el bot lee el menú de la misma base de datos, **cambiar el menú en la web actualiza WhatsApp automáticamente** — no hay que "sincronizar" nada.

---

## 2. Decisión clave: ¿WhatsApp oficial o número personal?

| | Opción A — WhatsApp Cloud API (Meta, oficial) ✅ Recomendada | Opción B — Librería no oficial (Baileys / whatsapp-web.js) con número personal |
|---|---|---|
| Costo | Gratis responder al cliente dentro de la ventana de 24 h (todo el flujo del pedido cae ahí). Plantillas fuera de ventana cuestan centavos. | Gratis |
| Riesgo | Ninguno, es el canal oficial | **Meta puede banear el número** en cualquier momento (pasa seguido con bots) |
| Menú interactivo | Sí: listas y botones nativos (el cliente toca en vez de escribir) | No: todo es texto plano ("responde 1, 2, 3…") |
| Estabilidad | Servidor de Meta, siempre arriba | Se cae si se cierra la sesión del teléfono; hay que re-escanear QR |
| Requisitos | Cuenta Meta Business + un número que NO esté registrado en la app de WhatsApp (sirve un chip nuevo barato) | Solo el teléfono |

**Recomendación: Opción A.** Para un negocio real que depende de los pedidos, el riesgo de que te baneen el número a media hora pico no vale la pena. El costo real es ~$0 porque todo el flujo de pedido ocurre dentro de la ventana gratuita de 24 h.

---

## 3. Flujo del bot (conversación)

Máquina de estados por cliente (se guarda en qué paso va cada número):

1. **Cliente escribe cualquier cosa** → el bot revisa el horario:
   - Si está **cerrado** (por horario o por el botón "Cerrar ahora" del panel): responde "Estamos cerrados 😴 Nuestro horario es …" y no continúa.
2. **Saludo + menú**: lista interactiva con categorías y platillos (nombre + precio). Solo aparecen platillos marcados como *disponibles* en el panel.
3. **Selección**: el cliente elige un platillo → cantidad → *"¿Le quitamos algo? (cebolla, chile, etc.)"* → la nota se guarda en ese platillo.
4. *"¿Algo más?"* → repite el paso 3 o continúa.
5. **Nombre** del cliente (se guarda; a clientes recurrentes ya no se les pregunta, solo se confirma).
6. **Método de pago**: botones `Transferencia` / `Tarjeta` / `Efectivo`.
   - Si es **efectivo** → *"¿Con cuánto vas a pagar?"* (para calcular el cambio que lleva el repartidor).
   - Si es **transferencia** → el bot manda los datos de la cuenta.
7. **Ubicación**: el bot pide que compartan ubicación con el clip 📎 de WhatsApp (la ubicación fija, no la "en tiempo real" — la fija es la que sirve para entregas).
   - El servidor valida con fórmula de Haversine que esté **dentro de 3 km del punto central**. Si está fuera: *"Por ahora solo entregamos en [zona] 😔"*.
8. **Resumen y confirmación**: lista de platillos, notas, total, pago, dirección aproximada → botón `Confirmar` / `Cancelar`.
9. El pedido entra al panel web como **Pendiente** y suena una alerta.
10. El bot **notifica al cliente cada cambio de estado**: aceptado (con su número de pedido), en preparación, en camino, entregado. (Gratis dentro de la ventana de 24 h.)

---

## 4. Estados del pedido (ciclo de vida completo)

```
PENDIENTE ──aceptar──▶ ACEPTADO ──▶ EN PREPARACIÓN ──▶ LISTO ──▶ EN REPARTO ──▶ ENTREGADO
    │                                                                              
    └──declinar──▶ RECHAZADO (con motivo: fuera de zona, sin ingredientes, etc.)
    
(cualquier estado antes de EN REPARTO puede pasar a CANCELADO)
```

| Estado | Quién lo cambia | Qué pasa |
|---|---|---|
| **Pendiente** | — (entra del bot) | Alerta en el panel; botones Aceptar / Declinar |
| **Aceptado** | Caja/encargado | Se genera ticket + QR + número de 4 dígitos; se imprime; aparece en pantalla de cocina; WhatsApp: "¡Pedido #0042 aceptado!" |
| **En preparación** | Cocina | El chef lo toma |
| **Listo** | Cocina | Empacado; aparece en la vista de repartidores; se pega el QR en la bolsa |
| **En reparto** | Repartidor | Se asigna repartidor; WhatsApp: "Tu pedido va en camino 🛵" |
| **Entregado** | Repartidor | Cierra el pedido; alimenta los KPIs |
| **Rechazado / Cancelado** | Encargado | WhatsApp avisa al cliente con el motivo |

---

## 5. Módulos de la app web

### 5.1 Pedidos entrantes
- Lista en tiempo real de pedidos **Pendientes** con sonido de notificación.
- Detalle: platillos, notas ("sin cebolla" resaltado), total, pago, mapa con la ubicación.
- Botones **Aceptar** / **Declinar** (con motivo).

### 5.2 Cocina (pantalla tipo KDS)
- Tarjetas de pedidos aceptados, ordenadas por antigüedad, con cronómetro.
- Las modificaciones se ven grandes y en color (es lo que más errores causa).
- Un toque para avanzar el estado: En preparación → Listo.

### 5.3 Repartidores
- Vista móvil simple: pedidos **Listos** y **En reparto**.
- Por pedido: número de 4 dígitos, dirección con botón "Abrir en Google Maps", teléfono del cliente, y lo del pago: *"Cobrar $185 en efectivo, paga con $500 → llevar $315 de cambio"* o *"Ya pagó por transferencia"*.
- Botones: Tomar pedido → En camino → Entregado.

### 5.4 Tickets, QR y número de 4 dígitos
- Al aceptar un pedido se genera:
  - **Número corto de 4 dígitos** (contador diario: 0001, 0002… se reinicia cada día) → para escribir/pegar en las bolsas.
  - **QR** que codifica la URL del pedido (`/pedido/{id}`) → cualquiera del equipo lo escanea con el teléfono y ve el pedido completo. Sirve para verificar bolsas antes de salir.
  - **Ticket imprimible**: número grande, platillos con notas, total, pago/cambio, dirección, QR.
- **Impresión térmica: sí se puede.** Las impresoras térmicas de 58/80 mm (Xprinter, Nictom, etc., ~$700–1500 MXN) funcionan así:
  - *Camino simple (recomendado para empezar):* la impresora se instala como impresora normal de Windows por USB; el ticket es una página HTML con CSS `@page { width: 80mm }` y se imprime desde el navegador. Cero software extra.
  - *Camino pro (después):* impresión automática sin diálogo con QZ Tray o un puente local con `node-thermal-printer` (ESC/POS) — el ticket sale solo al aceptar el pedido.

### 5.5 Administrador de menú
- CRUD de **categorías** y **platillos**: nombre, descripción, precio, foto, disponible/agotado.
- El interruptor "agotado" quita el platillo del bot **al instante** (el bot consulta la BD en cada conversación).
- Opcional fase 2: lista de ingredientes removibles por platillo para que el bot ofrezca botones ("sin cebolla", "sin chile") en vez de texto libre.

### 5.6 KPIs y métricas
- Pedidos por día / semana / hora (detectar horas pico).
- Platillos más vendidos (top 10, por cantidad e ingreso).
- Ticket promedio e ingresos totales.
- Mapa de calor de zonas de entrega (dónde se concentran los clientes).
- Métodos de pago (% efectivo / tarjeta / transferencia).
- Tiempos: aceptación → listo (cocina) y listo → entregado (reparto).
- Tasa de rechazo/cancelación y clientes recurrentes.

### 5.7 Ajustes
- **Horario** por día de la semana + botón **"Cerrar ahora"** (override manual: se acabó el gas, se acabó todo, etc.).
- **Zona de entrega**: punto central en un mapa + radio (3 km, editable para crecer después).
- Textos del bot editables (saludo, mensaje de cerrado, datos de transferencia).
- Usuarios y roles: admin, caja, cocina, repartidor (cada quien ve solo su vista).

---

## 6. Stack técnico sugerido (gratis o casi gratis para empezar)

| Pieza | Tecnología | Por qué |
|---|---|---|
| Web app + API | **Next.js** (React + API routes) | Un solo proyecto para panel y webhook del bot |
| Base de datos + tiempo real + auth | **Supabase** (Postgres) | Plan gratis; *Realtime* hace que los pedidos aparezcan solos en cocina sin recargar |
| Bot | **WhatsApp Cloud API** (webhook en Next.js) | Oficial, listas/botones nativos, gratis en ventana de 24 h |
| Hosting | **Vercel** | Plan gratis, HTTPS incluido (requisito del webhook de Meta) |
| Mapas | Leaflet + OpenStreetMap (gratis) o Google Maps | Elegir zona y ver ubicación de pedidos |
| QR | librería `qrcode` (genera en el servidor) | Simple |
| Impresión | HTML + CSS `@page 80mm` → después QZ Tray | Ver 5.4 |

### Esquema de base de datos (resumen)

```
categorias      (id, nombre, orden, activa)
platillos       (id, categoria_id, nombre, descripcion, precio, foto, disponible)
clientes        (id, telefono, nombre, ultima_ubicacion)
pedidos         (id, numero_corto, cliente_id, estado, metodo_pago, paga_con,
                 cambio, lat, lng, total, motivo_rechazo, repartidor_id,
                 timestamps de cada estado)
pedido_items    (id, pedido_id, platillo_id, cantidad, precio_unit, notas)
sesiones_bot    (telefono, paso_actual, carrito_json)   ← estado de la conversación
ajustes         (horarios_json, cerrado_manual, centro_lat, centro_lng,
                 radio_km, textos_bot, datos_transferencia)
usuarios        (id, nombre, rol)  ← roles: admin, caja, cocina, repartidor
```

---

## 7. Fases de construcción (orden recomendado)

**Fase 0 — Trámites (se puede hacer en paralelo, tarda unos días):**
- Crear cuenta en Meta for Developers + Meta Business.
- Conseguir un chip/número nuevo para el negocio (que no tenga WhatsApp registrado).
- Dar de alta la app de WhatsApp Cloud API y verificar el número.

**Fase 1 — Base del proyecto**
- Crear proyecto Next.js + Supabase, esquema de BD, login con roles.

**Fase 2 — Bot de WhatsApp (el corazón)**
- Webhook que recibe mensajes; máquina de estados de la conversación.
- Menú interactivo desde la BD → carrito → notas → nombre → pago → ubicación (con validación de 3 km) → confirmación.
- Respeto de horario/cerrado.

**Fase 3 — Panel de pedidos**
- Pedidos entrantes en tiempo real con sonido; aceptar/declinar.
- Vista de cocina con estados; notificaciones de WhatsApp en cada cambio.

**Fase 4 — Tickets y QR**
- Número de 4 dígitos, QR, ticket imprimible en formato térmico 80 mm.

**Fase 5 — Repartidores**
- Vista móvil: dirección, mapa, cobro/cambio, marcar entregado.

**Fase 6 — Administrador de menú**
- CRUD de categorías/platillos, disponible/agotado, fotos.

**Fase 7 — KPIs**
- Dashboard con las métricas de la sección 5.6.

**Fase 8 — Ajustes y pulido**
- Horarios, "Cerrar ahora", zona editable, textos del bot, pruebas de punta a punta con pedidos reales.

---

## 8. Costos estimados

| Concepto | Costo |
|---|---|
| WhatsApp Cloud API | $0 (flujo de pedido cae en ventana gratuita de 24 h) |
| Vercel + Supabase | $0 (planes gratuitos alcanzan de sobra al inicio) |
| Chip para el número del negocio | ~$50–150 MXN una vez |
| Impresora térmica 80 mm USB | ~$700–1,500 MXN una vez |
| **Total mensual** | **~$0** para arrancar |

---

## 9. Notas y decisiones pendientes

- **Ubicación en tiempo real**: WhatsApp no expone la ubicación "en vivo" por API de forma útil para esto; la **ubicación fija** que manda el cliente es la correcta y suficiente para la entrega.
- **Listas de WhatsApp**: máximo 10 opciones por sección — si el menú es grande, se navega por categorías (primero eliges categoría, luego platillo). Alternativa: mandar foto del menú + lista.
- **Pago con tarjeta**: se asume terminal física al entregar. Si después quieren cobro en línea (Stripe/Mercado Pago con link de pago en el chat), se agrega como fase extra.
- Definir el **punto central** exacto de la zona de entrega (dirección del restaurante o centro de la aglomeración).
