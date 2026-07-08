-- ============================================================
-- Migración 3: confirmación de pago y comprobante de transferencia
-- Pegar en: Supabase → SQL Editor → New query → Run
-- ============================================================

alter table pedidos
  add column if not exists pago_confirmado boolean not null default false,
  add column if not exists comprobante_url text;
