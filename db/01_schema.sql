-- =============================================================================
-- SAELM - Sistema de Apresentação Escolar de Cardápio / Merenda
-- Schema do banco de dados (Supabase / PostgreSQL)
-- =============================================================================
-- Execute este arquivo no Supabase: Dashboard > SQL Editor > New query > Run.
-- Depois execute o 02_seed.sql para popular com os dados de exemplo (JUNHO 2026).
-- =============================================================================
-- ORGANIZAÇÃO: todo o sistema fica no schema "nutricao" (e não no "public").
-- Para renomear o schema, troque "nutricao" aqui, no 02_seed.sql e no config.js.
-- IMPORTANTE (Supabase): depois de rodar, exponha o schema para a API em
--   Project Settings > API > "Exposed schemas" -> adicione: nutricao
-- =============================================================================

-- Cria o schema dedicado e passa a trabalhar dentro dele.
create schema if not exists nutricao;
set search_path to nutricao, public;

-- Extensão para UUIDs (já vem habilitada no Supabase, mas garantimos)
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Limpeza (permite re-executar do zero). Ordem respeita as FKs.
-- -----------------------------------------------------------------------------
drop table if exists refeicao_itens   cascade;
drop table if exists refeicoes        cascade;
drop table if exists escola_cardapio  cascade;
drop table if exists itens            cascade;
drop table if exists categorias_item  cascade;
drop table if exists tipos_refeicao   cascade;
drop table if exists escolas          cascade;
drop table if exists cardapios        cascade;

-- -----------------------------------------------------------------------------
-- 1) CARDÁPIOS  (os "modelos" I a VIII do PDF)
-- -----------------------------------------------------------------------------
create table cardapios (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null unique,          -- 'I', 'II', 'IV', 'V', 'VI', 'VII', 'VIII'
  titulo        text not null,                 -- ex: 'EMEF Parcial'
  publico_alvo  text,                          -- ex: '6 a 10 anos, 11 a 15 anos'
  percentual    text,                          -- ex: 'Parcial 30%', 'Integral 70%'
  observacoes   text,                          -- notas de rodapé específicas
  ordem         int  not null default 0,       -- ordem de exibição
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table cardapios is 'Modelos de cardápio (I a VIII) por tipo de unidade/faixa etária.';

-- -----------------------------------------------------------------------------
-- 2) ESCOLAS
-- -----------------------------------------------------------------------------
create table escolas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  tipo        text,                             -- 'EMEF', 'EMEI', 'CEI', 'Conveniada'...
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table escolas is 'Unidades escolares atendidas.';

-- -----------------------------------------------------------------------------
-- 3) ESCOLA <-> CARDÁPIO  (uma escola pode seguir um ou mais cardápios)
-- -----------------------------------------------------------------------------
create table escola_cardapio (
  escola_id    uuid not null references escolas(id)   on delete cascade,
  cardapio_id  uuid not null references cardapios(id) on delete cascade,
  primary key (escola_id, cardapio_id)
);

-- -----------------------------------------------------------------------------
-- 4) TIPOS DE REFEIÇÃO  (Desjejum, Lanche Manhã, Almoço, Fruta, Jantar...)
-- -----------------------------------------------------------------------------
create table tipos_refeicao (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,             -- 'Almoço'
  horario     text,                             -- 'a partir das 11h30'
  ordem       int  not null default 0,          -- ordem ao longo do dia
  cor         text default '#4f9d69'            -- cor usada na apresentação
);
comment on table tipos_refeicao is 'Momentos/refeições do dia com horário sugerido.';

-- -----------------------------------------------------------------------------
-- 5) CATEGORIAS DE ITEM  (Cereais, Feijões, Carnes/Ovos, Frutas, Bebidas...)
-- -----------------------------------------------------------------------------
create table categorias_item (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  cor    text default '#8a8f98'
);

-- -----------------------------------------------------------------------------
-- 6) ITENS  (catálogo reutilizável de preparações/alimentos)
-- -----------------------------------------------------------------------------
create table itens (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,                  -- 'Arroz', 'Carne moída IQF refogada'
  categoria_id  uuid references categorias_item(id) on delete set null,
  descricao     text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (nome)
);
comment on table itens is 'Catálogo de preparações/alimentos reutilizáveis para montar refeições.';

-- -----------------------------------------------------------------------------
-- 7) REFEIÇÕES  (uma refeição servida = cardápio + data + tipo de refeição)
-- -----------------------------------------------------------------------------
create table refeicoes (
  id                uuid primary key default gen_random_uuid(),
  cardapio_id       uuid not null references cardapios(id)     on delete cascade,
  tipo_refeicao_id  uuid not null references tipos_refeicao(id) on delete cascade,
  data              date not null,
  observacao        text,                        -- ex: 'Ponto facultativo'
  facultativo       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (cardapio_id, data, tipo_refeicao_id)
);
comment on table refeicoes is 'Refeição concreta de um cardápio em uma data e momento do dia.';

-- -----------------------------------------------------------------------------
-- 8) REFEIÇÃO <-> ITENS  (composição da refeição, ordenada)
-- -----------------------------------------------------------------------------
create table refeicao_itens (
  id            uuid primary key default gen_random_uuid(),
  refeicao_id   uuid not null references refeicoes(id) on delete cascade,
  item_id       uuid references itens(id) on delete set null,
  texto_livre   text,                            -- usado quando não há item de catálogo
  ordem         int not null default 0
);
comment on table refeicao_itens is 'Itens que compõem cada refeição (do catálogo ou texto livre).';

-- -----------------------------------------------------------------------------
-- Índices para consultas da tela pública
-- -----------------------------------------------------------------------------
create index idx_refeicoes_cardapio_data on refeicoes (cardapio_id, data);
create index idx_refeicao_itens_refeicao on refeicao_itens (refeicao_id);
create index idx_itens_categoria         on itens (categoria_id);

-- -----------------------------------------------------------------------------
-- Gatilho para manter updated_at atualizado
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_cardapios_updated  before update on cardapios for each row execute function set_updated_at();
create trigger trg_escolas_updated    before update on escolas   for each row execute function set_updated_at();
create trigger trg_itens_updated      before update on itens     for each row execute function set_updated_at();
create trigger trg_refeicoes_updated  before update on refeicoes for each row execute function set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Regra: qualquer pessoa (chave anônima) pode LER; apenas usuários
-- autenticados (logados no painel Gerenciar) podem ESCREVER.
-- =============================================================================
alter table cardapios        enable row level security;
alter table escolas          enable row level security;
alter table escola_cardapio  enable row level security;
alter table tipos_refeicao   enable row level security;
alter table categorias_item  enable row level security;
alter table itens            enable row level security;
alter table refeicoes        enable row level security;
alter table refeicao_itens   enable row level security;

-- ATENÇÃO: por enquanto SEM controle de acesso — leitura e escrita liberadas
-- para a chave anônima (público). Quando quiser proteger o painel Gerenciar,
-- troque a política "escrita liberada" por uma restrita a "to authenticated".
do $$
declare t text;
begin
  foreach t in array array[
    'cardapios','escolas','escola_cardapio','tipos_refeicao',
    'categorias_item','itens','refeicoes','refeicao_itens'
  ]
  loop
    execute format(
      'create policy "leitura publica" on %I for select using (true);', t);
    execute format(
      'create policy "escrita liberada" on %I for all using (true) with check (true);', t);
  end loop;
end $$;

-- =============================================================================
-- VIEW de conveniência: refeições já com nomes montados (facilita o front-end)
-- =============================================================================
create or replace view vw_cardapio_completo as
select
  c.id            as cardapio_id,
  c.numero        as cardapio_numero,
  c.titulo        as cardapio_titulo,
  r.id            as refeicao_id,
  r.data          as data,
  r.observacao    as observacao,
  r.facultativo   as facultativo,
  tr.id           as tipo_refeicao_id,
  tr.nome         as tipo_refeicao,
  tr.horario      as horario,
  tr.ordem        as tipo_ordem,
  tr.cor          as tipo_cor,
  coalesce(
    string_agg(coalesce(i.nome, ri.texto_livre), ', ' order by ri.ordem),
    ''
  ) as itens
from refeicoes r
join cardapios c        on c.id = r.cardapio_id
join tipos_refeicao tr  on tr.id = r.tipo_refeicao_id
left join refeicao_itens ri on ri.refeicao_id = r.id
left join itens i           on i.id = ri.item_id
group by c.id, c.numero, c.titulo, r.id, r.data, r.observacao, r.facultativo,
         tr.id, tr.nome, tr.horario, tr.ordem, tr.cor;

comment on view vw_cardapio_completo is 'Refeições com itens concatenados, prontas para exibição.';

-- =============================================================================
-- GRANTS para as roles da API do Supabase
-- (por enquanto sem controle de acesso: anon pode ler e gravar)
-- =============================================================================
grant usage on schema nutricao to anon, authenticated;
grant select, insert, update, delete on all tables in schema nutricao to anon, authenticated;

-- Novas tabelas/views criadas depois também já entram liberadas
alter default privileges in schema nutricao
  grant select, insert, update, delete on tables to anon, authenticated;
