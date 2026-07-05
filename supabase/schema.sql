-- ============================================================
-- Esquema de base de datos — Sistema de pedidos por WhatsApp
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Categorías del menú ----------
create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Platillos ----------
create table platillos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio numeric(10,2) not null,
  foto_url text,
  disponible boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Clientes (identificados por su número de WhatsApp) ----------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique,        -- formato E.164, ej. 5214421234567
  nombre text,
  ultima_lat double precision,
  ultima_lng double precision,
  created_at timestamptz not null default now()
);

-- ---------- Pedidos ----------
create type estado_pedido as enum (
  'pendiente',      -- recién llegó del bot, esperando aceptar/declinar
  'aceptado',       -- aceptado; se generó ticket, QR y número corto
  'preparando',     -- cocina lo está haciendo
  'listo',          -- empacado, esperando repartidor
  'en_reparto',     -- repartidor en camino
  'entregado',      -- cerrado con éxito
  'rechazado',      -- declinado al llegar
  'cancelado'       -- cancelado después de aceptarse
);

create type metodo_pago as enum ('efectivo', 'tarjeta', 'transferencia');

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_corto text,                    -- '0042' — se asigna al aceptar, se reinicia cada día
  cliente_id uuid not null references clientes(id),
  estado estado_pedido not null default 'pendiente',
  metodo_pago metodo_pago not null,
  paga_con numeric(10,2),               -- solo efectivo: con cuánto paga
  cambio numeric(10,2),                 -- solo efectivo: total - paga_con
  lat double precision,
  lng double precision,
  total numeric(10,2) not null,
  motivo_rechazo text,
  repartidor_id uuid,                   -- referencia a usuarios (se llena al asignar)
  -- timestamps de cada transición, para KPIs de tiempos
  creado_at timestamptz not null default now(),
  aceptado_at timestamptz,
  preparando_at timestamptz,
  listo_at timestamptz,
  en_reparto_at timestamptz,
  entregado_at timestamptz
);

-- ---------- Items de cada pedido ----------
create table pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  platillo_id uuid not null references platillos(id),
  nombre_platillo text not null,        -- copia del nombre al momento del pedido
  cantidad int not null default 1,
  precio_unit numeric(10,2) not null,   -- copia del precio al momento del pedido
  notas text                            -- 'sin cebolla', 'sin chile', etc.
);

-- ---------- Estado de la conversación del bot ----------
create table sesiones_bot (
  telefono text primary key,
  paso text not null default 'inicio',  -- en qué paso del flujo va
  carrito jsonb not null default '[]',  -- items acumulados antes de confirmar
  datos jsonb not null default '{}',    -- nombre, pago, ubicación temporal
  updated_at timestamptz not null default now()
);

-- ---------- Ajustes del negocio (una sola fila) ----------
create table ajustes (
  id int primary key default 1 check (id = 1),
  cerrado_manual boolean not null default false,
  -- horarios por día: {"lun": {"abre":"12:00","cierra":"22:00"}, ... , "dom": null}
  horarios jsonb not null default '{}',
  centro_lat double precision,          -- centro de la zona de entrega
  centro_lng double precision,
  radio_km numeric(5,2) not null default 3.0,
  mensaje_bienvenida text not null default '¡Hola! 👋 Bienvenido. Aquí está nuestro menú:',
  mensaje_cerrado text not null default 'Por el momento estamos cerrados 😴',
  mensaje_fuera_zona text not null default 'Lo sentimos, por ahora solo entregamos dentro de nuestra zona 😔',
  datos_transferencia text              -- CLABE / banco / titular que manda el bot
);
insert into ajustes (id) values (1);

-- ---------- Usuarios del panel (perfil sobre Supabase Auth) ----------
create type rol_usuario as enum ('admin', 'caja', 'cocina', 'repartidor');

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'caja',
  activo boolean not null default true
);

-- ---------- Contador diario para el número corto de 4 dígitos ----------
create table contador_diario (
  fecha date primary key,
  ultimo int not null default 0
);

create or replace function siguiente_numero_corto()
returns text
language plpgsql
as $$
declare
  n int;
begin
  insert into contador_diario (fecha, ultimo) values (current_date, 1)
  on conflict (fecha) do update set ultimo = contador_diario.ultimo + 1
  returning ultimo into n;
  return lpad(n::text, 4, '0');
end;
$$;

-- ---------- Índices para las vistas del panel y KPIs ----------
create index idx_pedidos_estado on pedidos(estado);
create index idx_pedidos_creado on pedidos(creado_at);
create index idx_platillos_categoria on platillos(categoria_id);
create index idx_pedido_items_pedido on pedido_items(pedido_id);

-- ---------- Realtime: que el panel reciba pedidos al instante ----------
alter publication supabase_realtime add table pedidos;

-- ---------- Seguridad (RLS) ----------
-- El panel y el bot acceden vía API del servidor con la service_role key,
-- que ignora RLS. Activamos RLS sin políticas públicas para que nadie
-- pueda leer/escribir directo con la clave anónima.
alter table categorias enable row level security;
alter table platillos enable row level security;
alter table clientes enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table sesiones_bot enable row level security;
alter table ajustes enable row level security;
alter table perfiles enable row level security;
alter table contador_diario enable row level security;

-- Los usuarios logueados del panel pueden leer su propio perfil
create policy "leer propio perfil" on perfiles
  for select using (auth.uid() = id);

-- ---------- Datos de ejemplo para probar ----------
insert into categorias (nombre, orden) values
  ('Tacos', 1),
  ('Tortas', 2),
  ('Bebidas', 3);

insert into platillos (categoria_id, nombre, descripcion, precio, orden)
select c.id, p.nombre, p.descripcion, p.precio, p.orden
from (values
  ('Tacos',   'Taco de pastor',   'Con piña, cebolla y cilantro', 18.00, 1),
  ('Tacos',   'Taco de bistec',   'Con cebolla y cilantro',       20.00, 2),
  ('Tortas',  'Torta de milanesa','Con aguacate y frijoles',      75.00, 1),
  ('Bebidas', 'Agua de horchata', 'Vaso 500 ml',                  25.00, 1),
  ('Bebidas', 'Refresco',         'Lata 355 ml',                  22.00, 2)
) as p(cat, nombre, descripcion, precio, orden)
join categorias c on c.nombre = p.cat;
