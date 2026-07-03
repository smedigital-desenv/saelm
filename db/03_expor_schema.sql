-- =============================================================================
-- SAELM - Expor o schema "nutricao" para a API do Supabase (PostgREST)
-- =============================================================================
-- Um schema próprio (diferente de "public") NÃO aparece na API automaticamente.
-- Alternativa por SQL ao toggle do painel (Settings > API > Exposed schemas).
--
-- ATENÇÃO: o comando SET SOBRESCREVE a lista inteira. Rode o passo 1 antes e
-- mantenha TODOS os schemas que já estavam expostos, apenas acrescentando o novo.
-- =============================================================================

-- 1) Conferir o que já está exposto hoje:
select rolname, rolconfig
from pg_roles
where rolname = 'authenticator';
-- Ex.: pgrst.db_schemas=public, graphql_public, presenca

-- 2) Reescrever a lista mantendo os existentes + "nutricao":
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, presenca, nutricao';

-- 3) Recarregar a config do PostgREST (aplica em alguns segundos, sem reiniciar):
notify pgrst, 'reload config';

-- 4) Validar:
select rolconfig from pg_roles where rolname = 'authenticator';
-- Deve conter: pgrst.db_schemas=public, graphql_public, presenca, nutricao

-- Teste rápido de leitura pela view:
-- select * from nutricao.vw_cardapio_completo limit 5;
