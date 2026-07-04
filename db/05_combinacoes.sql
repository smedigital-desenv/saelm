-- =============================================================================
-- SAELM - Combinações (montagens de refeição reutilizáveis, com foto do prato)
-- Execute no SQL Editor depois dos anteriores. Pode ser re-executado.
-- =============================================================================
set search_path to nutricao, public;

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------
create table if not exists combinacoes (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  tipo_refeicao_id  uuid references tipos_refeicao(id) on delete set null,
  foto_url          text,
  descricao         text,
  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table combinacoes is 'Montagens de refeição reutilizáveis, com a foto do prato pronto.';

create table if not exists combinacao_itens (
  id             uuid primary key default gen_random_uuid(),
  combinacao_id  uuid not null references combinacoes(id) on delete cascade,
  item_id        uuid references itens(id) on delete cascade,
  ordem          int not null default 0
);

-- refeições passam a poder apontar para uma combinação
alter table refeicoes add column if not exists combinacao_id uuid references combinacoes(id) on delete set null;

create index if not exists idx_comb_itens on combinacao_itens (combinacao_id);
create index if not exists idx_refeicoes_comb on refeicoes (combinacao_id);

drop trigger if exists trg_combinacoes_updated on combinacoes;
create trigger trg_combinacoes_updated before update on combinacoes for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) RLS + grants (mesma regra: leitura pública, escrita liberada por enquanto)
-- -----------------------------------------------------------------------------
alter table combinacoes      enable row level security;
alter table combinacao_itens enable row level security;

drop policy if exists "leitura publica"  on combinacoes;
drop policy if exists "escrita liberada" on combinacoes;
drop policy if exists "leitura publica"  on combinacao_itens;
drop policy if exists "escrita liberada" on combinacao_itens;

create policy "leitura publica"  on combinacoes      for select using (true);
create policy "escrita liberada" on combinacoes      for all using (true) with check (true);
create policy "leitura publica"  on combinacao_itens for select using (true);
create policy "escrita liberada" on combinacao_itens for all using (true) with check (true);

grant select, insert, update, delete on combinacoes, combinacao_itens to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Migração: transforma as refeições já cadastradas em combinações
--    (uma combinação por composição distinta: mesmo tipo + mesmos itens)
--    Só roda se ainda não houver combinações.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_comb uuid;
begin
  if (select count(*) from combinacoes) > 0 then
    raise notice 'Combinações já existem — migração ignorada.';
    return;
  end if;

  create temp table _mig(sig text primary key, comb uuid) on commit drop;

  -- cria uma combinação por assinatura (tipo + itens ordenados)
  for r in
    select
      rf.tipo_refeicao_id as tipo,
      string_agg(coalesce(i.nome, ri.texto_livre), ', ' order by ri.ordem) as itens_nome,
      array_agg(ri.item_id order by ri.ordem) as item_ids,
      md5(rf.tipo_refeicao_id::text || ':' ||
          string_agg(coalesce(ri.item_id::text, ri.texto_livre, ''), '|' order by ri.ordem)) as sig
    from refeicoes rf
    join refeicao_itens ri on ri.refeicao_id = rf.id
    left join itens i on i.id = ri.item_id
    group by rf.id, rf.tipo_refeicao_id
  loop
    if not exists (select 1 from _mig where sig = r.sig) then
      insert into combinacoes (nome, tipo_refeicao_id)
      values (r.itens_nome, r.tipo)
      returning id into v_comb;
      insert into _mig(sig, comb) values (r.sig, v_comb);
      insert into combinacao_itens (combinacao_id, item_id, ordem)
      select v_comb, iid, (ord - 1)::int
      from unnest(r.item_ids) with ordinality as t(iid, ord)
      where iid is not null;
    end if;
  end loop;

  -- religa cada refeição à combinação correspondente
  update refeicoes rf
  set combinacao_id = m.comb
  from (
    select rf2.id,
      md5(rf2.tipo_refeicao_id::text || ':' ||
          string_agg(coalesce(ri.item_id::text, ri.texto_livre, ''), '|' order by ri.ordem)) as sig
    from refeicoes rf2
    join refeicao_itens ri on ri.refeicao_id = rf2.id
    group by rf2.id, rf2.tipo_refeicao_id
  ) s
  join _mig m on m.sig = s.sig
  where rf.id = s.id;

  raise notice 'Migração concluída: % combinações criadas.', (select count(*) from combinacoes);
end $$;

-- -----------------------------------------------------------------------------
-- 4) View atualizada: itens e foto vêm da combinação (fallback p/ itens soltos)
--    (drop antes de recriar: a nova view muda a ordem/inclui colunas novas)
-- -----------------------------------------------------------------------------
drop view if exists vw_cardapio_completo;
create view vw_cardapio_completo as
select
  c.id            as cardapio_id,
  c.numero        as cardapio_numero,
  c.titulo        as cardapio_titulo,
  r.id            as refeicao_id,
  r.data          as data,
  r.observacao    as observacao,
  r.facultativo   as facultativo,
  r.combinacao_id as combinacao_id,
  tr.id           as tipo_refeicao_id,
  tr.nome         as tipo_refeicao,
  tr.horario      as horario,
  tr.ordem        as tipo_ordem,
  tr.cor          as tipo_cor,
  comb.nome       as combinacao_nome,
  comb.foto_url   as foto_url,
  coalesce(
    (select string_agg(i.nome, ', ' order by ci.ordem)
       from combinacao_itens ci join itens i on i.id = ci.item_id
      where ci.combinacao_id = r.combinacao_id),
    (select string_agg(coalesce(i.nome, ri.texto_livre), ', ' order by ri.ordem)
       from refeicao_itens ri left join itens i on i.id = ri.item_id
      where ri.refeicao_id = r.id)
  ) as itens
from refeicoes r
join cardapios c        on c.id = r.cardapio_id
join tipos_refeicao tr  on tr.id = r.tipo_refeicao_id
left join combinacoes comb on comb.id = r.combinacao_id;

grant select on vw_cardapio_completo to anon, authenticated;

-- Conferência:
-- select nome, tipo_refeicao_id from combinacoes order by nome;
