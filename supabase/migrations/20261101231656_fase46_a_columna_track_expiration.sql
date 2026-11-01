-- Fase 46, parte A (YA APLICADA): columna products.track_expiration, la casilla
-- "Controlar vencimiento". Ver el contexto completo en la parte B.
alter table products add column if not exists track_expiration boolean not null default false;
