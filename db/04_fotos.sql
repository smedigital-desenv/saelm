-- =============================================================================
-- SAELM - Fotos dos pratos
-- Adiciona foto por item do catálogo + bucket público no Supabase Storage.
-- Execute no SQL Editor do projeto (depois do 01/02).
-- =============================================================================

-- 1) Coluna de foto no catálogo de itens
alter table nutricao.itens add column if not exists foto_url text;

-- 2) Bucket público para as fotos dos pratos
insert into storage.buckets (id, name, public)
values ('pratos', 'pratos', true)
on conflict (id) do update set public = true;

-- 3) Sem controle de acesso (por enquanto): leitura e escrita liberadas
--    apenas dentro do bucket "pratos".
drop policy if exists "pratos leitura" on storage.objects;
drop policy if exists "pratos escrita" on storage.objects;

create policy "pratos leitura"
  on storage.objects for select
  using (bucket_id = 'pratos');

create policy "pratos escrita"
  on storage.objects for all
  using (bucket_id = 'pratos')
  with check (bucket_id = 'pratos');

-- Pronto. As fotos podem ser enviadas pela tela Gerenciar > Catálogo de itens.
