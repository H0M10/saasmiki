# Guía: Conectar WhatsApp Cloud API (flujo actual 2026)

> **Importante antes de empezar:** yo (Claude) no puedo hacer estos pasos por ti aunque me des el número, porque ocurren dentro de **tu** cuenta de Meta en el navegador y el código de verificación llega por SMS a **tu** teléfono. Pero la buena noticia es que son pocos pasos, y al final solo necesito que me pegues **3 valores** (marcados abajo con 📋) para que todo el código funcione.

> **Otra buena noticia:** Meta te da un **número de prueba GRATIS** al crear la app. Con ese número podemos construir y probar TODO el sistema sin decidir todavía qué número real usarás. El número real se conecta al final, cuando ya todo funcione.

---

## Paso 1 — Crear la app en Meta for Developers

1. Entra a **[developers.facebook.com](https://developers.facebook.com)** e inicia sesión con la cuenta de Facebook ligada a tu Meta Business.
2. Arriba a la derecha: **Mis apps** → botón **Crear app**.
3. Te pedirá:
   - **Nombre de la app**: ej. `RestauranteBot` (es interno, no lo ve el cliente).
   - **Correo de contacto**.
   - **Caso de uso**: selecciona **"Conectar con clientes a través de WhatsApp"** (Connect with customers through WhatsApp) → **Siguiente**.
4. **Portafolio de negocios**: selecciona el Meta Business que ya creaste → **Crear app**.

## Paso 2 — Configuración inicial de la API

1. Al crear la app te manda a la página del caso de uso. Haz clic en **"Comenzar a usar la API"** (Start using the API). Eso abre el panel **WhatsApp → Configuración de la API** (API Setup).
2. En esa pantalla verás:
   - Un **número de prueba** que Meta te regala (tipo +1 555 ...).
   - 📋 **Phone number ID** — cópialo y guárdalo.
   - 📋 **WhatsApp Business Account ID** — cópialo y guárdalo.
   - Un botón **"Generar token de acceso"** — genera el token temporal (dura 24 h; sirve para probar hoy, en el Paso 4 hacemos el permanente).

## Paso 3 — Enviar tu primer mensaje de prueba

1. En la misma pantalla de API Setup, en la sección **"To"** (Para), agrega TU número personal como destinatario de pruebas (te llega un código por WhatsApp para confirmarlo).
2. Haz clic en **"Send message"**. Te debe llegar un "Hello World" al WhatsApp.
3. ⚠️ El número de prueba solo puede escribir a máximo 5 números que registres como destinatarios — suficiente para desarrollar.

## Paso 4 — Token permanente (el temporal muere en 24 h)

1. Ve a **[business.facebook.com/settings](https://business.facebook.com/settings)** (Configuración del negocio).
2. Menú izquierdo: **Usuarios** → **Usuarios del sistema** (System users) → botón **Agregar**.
3. Nombre: ej. `bot-restaurante`, rol: **Administrador** → crear.
4. Con el usuario del sistema creado:
   - Botón **"Agregar activos"** (Add assets) → pestaña **Apps** → selecciona tu app → activa **Control total** → Guardar.
   - Repite con la pestaña **Cuentas de WhatsApp** → selecciona tu cuenta → **Control total**.
5. Botón **"Generar token"** (Generate token):
   - App: la tuya.
   - Vencimiento: **Nunca** (Never).
   - Permisos: marca **`whatsapp_business_messaging`**, **`whatsapp_business_management`** y **`business_management`**.
6. 📋 **Copia el token y guárdalo en un lugar seguro** — Meta NO te lo vuelve a mostrar. Este es el token que va en el código.

## Paso 5 — Configurar el Webhook (esto lo hacemos juntos)

El webhook es la URL de nuestra app donde Meta entrega los mensajes que escriben los clientes. **Este paso se hace hasta que la app esté desplegada en Vercel** (yo te aviso cuándo):

1. En el panel de la app: **WhatsApp → Configuración** (Configuration) → sección **Webhook** → **Editar**.
2. **Callback URL**: `https://TU-APP.vercel.app/api/whatsapp/webhook`
3. **Verify token**: una contraseña que nosotros inventamos (la misma que pondremos en las variables de entorno). Ej: `mi-token-secreto-123`.
4. Clic en **Verificar y guardar** — nuestra app responde el reto de Meta automáticamente (ese código ya lo dejé listo).
5. En **Campos del webhook** (Webhook fields): suscríbete a **`messages`** (clic en Administrar → activar `messages`).

## Paso 6 — Conectar el número REAL (al final, cuando todo funcione)

1. En **WhatsApp → API Setup** → **"Add phone number"** (Agregar número de teléfono).
2. Llena: nombre para mostrar (el nombre del restaurante), zona horaria, categoría y descripción del negocio.
3. Ingresa el número → te llega un **código por SMS o llamada** → lo capturas → listo.
4. En el código solo cambiamos el **Phone number ID** por el del número nuevo. Nada más.

⚠️ **Requisito del número real:** NO debe tener cuenta de WhatsApp activa. Si el número ya tiene WhatsApp (app normal o Business app), hay que **eliminar esa cuenta primero** (Ajustes → Cuenta → Eliminar cuenta) y se pierden sus chats. Por eso lo mejor es un **chip nuevo** (~$50–150 MXN).

---

## Los 3 valores que me tienes que pasar 📋

| Valor | Dónde está | Para qué |
|---|---|---|
| `WHATSAPP_TOKEN` | Paso 4 (token permanente del usuario del sistema) | Autenticar cada mensaje que enviamos |
| `WHATSAPP_PHONE_NUMBER_ID` | Paso 2 (API Setup, bajo el número) | Identificar desde qué número enviamos |
| `WHATSAPP_VERIFY_TOKEN` | Lo inventamos nosotros (Paso 5) | Verificar el webhook con Meta |

Estos van como **variables de entorno** en Vercel — nunca en el código ni en GitHub.

---

## Costos (modelo vigente desde julio 2025)

- **Responder a un cliente que te escribió** (ventana de 24 h): **GRATIS e ilimitado**. Todo el flujo de pedido —menú, carrito, confirmación, avisos de estado— cae aquí.
- **Plantillas** (escribirle TÚ al cliente fuera de la ventana de 24 h): cuestan por mensaje (centavos). Para tomar pedidos no las necesitamos; servirían después para marketing ("¡Hoy 2x1!").
