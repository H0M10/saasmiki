-- ============================================================
-- Migración 2: ubicación en tiempo real del repartidor
-- Pegar en: Supabase → SQL Editor → New query → Run
-- ============================================================

alter table pedidos
  add column if not exists repa_lat double precision,
  add column if not exists repa_lng double precision,
  add column if not exists repa_actualizado_at timestamptz;
