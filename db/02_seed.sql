-- =============================================================================
-- SAELM - Dados de exemplo (JUNHO 2026 / 5ª semana: 29/06 a 03/07/2026)
-- Extraídos do PDF "Gerência de Nutrição Escolar - JUNHO 2026".
-- Execute DEPOIS do 01_schema.sql.
-- Pode ser re-executado quantas vezes quiser (é idempotente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos de refeição (momentos do dia)
-- -----------------------------------------------------------------------------
insert into tipos_refeicao (nome, horario, ordem, cor) values
  ('Desjejum',        'a partir das 6h45',  1, '#f2b705'),
  ('Colação',         '9h30 / 10h30',       2, '#f4845f'),
  ('Lanche da Manhã', 'a partir das 9h',    3, '#f78154'),
  ('Almoço',          'a partir das 11h30', 4, '#4f9d69'),
  ('Leite',           '13h30 / 14h30',      5, '#6fb1d6'),
  ('Lanche da Tarde', 'a partir das 15h',   6, '#b07bac'),
  ('Sobremesa',       'após o almoço',      7, '#e26d9c'),
  ('Fruta',           'a partir das 17h',   8, '#e05263'),
  ('Jantar',          'a partir das 18h45', 9, '#3b6ea5')
on conflict (nome) do update set horario = excluded.horario, ordem = excluded.ordem, cor = excluded.cor;

-- -----------------------------------------------------------------------------
-- Categorias do catálogo de itens
-- -----------------------------------------------------------------------------
insert into categorias_item (nome, cor) values
  ('Cereais',              '#e0a458'),
  ('Feijões',              '#7a4419'),
  ('Carnes / Ovos',        '#c1443c'),
  ('Legumes e Verduras',   '#4f9d69'),
  ('Frutas',               '#e05263'),
  ('Bebidas',              '#6fb1d6'),
  ('Pães e Massas',        '#d9a566'),
  ('Outros',               '#8a8f98')
on conflict (nome) do nothing;

-- -----------------------------------------------------------------------------
-- Cardápios (modelos I a VIII + bebês)
-- -----------------------------------------------------------------------------
insert into cardapios (numero, titulo, publico_alvo, percentual, ordem, observacoes) values
  ('I',    'EMEF Parcial / Marcenaria / Mais Educação', '6 a 10 anos, 11 a 15 anos', 'Parcial 30%', 1, null),
  ('II',   'EMEFs com EJA',                             'EMEF e EJA',                'EMEF 30% / EJA 20%', 2, 'Alunos com necessidades alimentares especiais são atendidos conforme protocolos de dietas especiais.'),
  ('IV',   'EMEI Integral / Parcial',                   '3 a 5 anos',                'Integral 70% / Parcial 30%', 4, 'Hidratação: oferecer água filtrada e/ou fervida nos intervalos entre as refeições.'),
  ('BEBE', 'CEI - Crianças menores de 6 meses',         'menores de 6 meses',        'Integral 70%', 5, 'De preferência LEITE MATERNO. Na impossibilidade, fórmula infantil fase 1 até 5 meses e 30 dias.'),
  ('V',    'CEI - Crianças de 6 a 12 meses',            '6 a 12 meses',              'Integral 70%', 6, 'Consistência dos alimentos adequada à idade. Os alimentos devem ser oferecidos separadamente.'),
  ('VI',   'CEI/EMEI e CEI (1 a 5 anos)',               '1 a 5 anos',                'Integral 70% / Parcial 30%', 7, null),
  ('VII',  'Conveniadas',                               'Conveniadas',               'Integral 70%', 8, null),
  ('VIII', 'Cardápio Vegetariano',                      '5 a 8 anos',                'Parcial 30%', 9, 'Cardápio vegetariano.')
on conflict (numero) do nothing;

-- -----------------------------------------------------------------------------
-- Escolas + vínculo com cardápios
-- -----------------------------------------------------------------------------
insert into escolas (nome, tipo) values
  ('EMEPB Celso Charuri',        'EMEF'),
  ('EMEF Egydio Pedreschi',      'EMEF'),
  ('CEI Aloisio Olaia Paschoal', 'CEI'),
  ('CEI Anita Procópio Junqueira','CEI'),
  ('CEI José Bonifácio C. Nogueira','CEI'),
  ('CEI José Carlos Sobral',     'CEI'),
  ('CEI Hilda Mosca',            'CEI'),
  ('CEI Miguel Mussi',           'CEI'),
  ('CEI Moacir Firmino',         'CEI'),
  ('CEI Nicolau Spinelli',       'CEI'),
  ('CEI Wilson Roselino',        'CEI')
on conflict (nome) do nothing;

-- Vincula as EMEFs ao cardápio I e as CEIs (1 a 5) ao cardápio VI
insert into escola_cardapio (escola_id, cardapio_id)
select e.id, c.id from escolas e cross join cardapios c
where c.numero = 'I' and e.tipo = 'EMEF'
on conflict do nothing;

insert into escola_cardapio (escola_id, cardapio_id)
select e.id, c.id from escolas e cross join cardapios c
where c.numero = 'VI' and e.tipo = 'CEI'
on conflict do nothing;

-- =============================================================================
-- Função auxiliar de seed: cria uma refeição e seus itens (cria itens que
-- ainda não existem no catálogo). Deixa o seed legível e idempotente.
-- =============================================================================
create or replace function seed_add_refeicao(
  p_cardapio text, p_tipo text, p_data date,
  p_itens text[], p_obs text default null, p_facultativo boolean default false
) returns void language plpgsql as $$
declare
  v_card uuid; v_tipo uuid; v_ref uuid; v_item uuid; v_nome text; v_ord int := 0;
begin
  select id into v_card from cardapios where numero = p_cardapio limit 1;
  select id into v_tipo from tipos_refeicao where nome = p_tipo limit 1;
  if v_card is null or v_tipo is null then
    raise notice 'Ignorado (cardapio/tipo inexistente): % / %', p_cardapio, p_tipo;
    return;
  end if;

  insert into refeicoes (cardapio_id, tipo_refeicao_id, data, observacao, facultativo)
  values (v_card, v_tipo, p_data, p_obs, p_facultativo)
  on conflict (cardapio_id, data, tipo_refeicao_id)
    do update set observacao = excluded.observacao, facultativo = excluded.facultativo
  returning id into v_ref;

  delete from refeicao_itens where refeicao_id = v_ref;  -- idempotência

  if p_itens is not null then
    foreach v_nome in array p_itens loop
      v_nome := trim(v_nome);
      continue when v_nome = '';
      select id into v_item from itens where nome = v_nome;
      if v_item is null then
        insert into itens (nome) values (v_nome) returning id into v_item;
      end if;
      insert into refeicao_itens (refeicao_id, item_id, ordem) values (v_ref, v_item, v_ord);
      v_ord := v_ord + 1;
    end loop;
  end if;
end $$;

-- =============================================================================
-- CARDÁPIO I  - EMEF Parcial
-- =============================================================================
select seed_add_refeicao('I','Desjejum','2026-06-29', array['Leite c/ cacau']);
select seed_add_refeicao('I','Lanche da Manhã','2026-06-29', array['Pão hot dog c/ manteiga','Leite c/ cacau','Melancia']);
select seed_add_refeicao('I','Almoço','2026-06-29', array['Arroz','Feijão','Carne moída IQF refogada','Batata refogada']);
select seed_add_refeicao('I','Lanche da Tarde','2026-06-29', null, 'Ponto facultativo', true);
select seed_add_refeicao('I','Fruta','2026-06-29', array['Melão','Melancia']);

select seed_add_refeicao('I','Desjejum','2026-06-30', array['Leite c/ cacau']);
select seed_add_refeicao('I','Lanche da Manhã','2026-06-30', array['Pão hot dog c/ manteiga','Chocolate quente','Melão']);
select seed_add_refeicao('I','Almoço','2026-06-30', array['Arroz','Feijão','Filé mignon suíno refogado','Quibebe de abóbora seca']);
select seed_add_refeicao('I','Lanche da Tarde','2026-06-30', array['Bolo de milho','Chocolate quente']);
select seed_add_refeicao('I','Fruta','2026-06-30', array['Tangerina pokan','Maçã Fuji']);

select seed_add_refeicao('I','Desjejum','2026-07-01', array['Leite c/ cacau']);
select seed_add_refeicao('I','Lanche da Manhã','2026-07-01', array['Pão hot dog c/ manteiga','Leite c/ cacau','Melancia']);
select seed_add_refeicao('I','Almoço','2026-07-01', array['Arroz','Feijão','Frango (peito) ao molho','Cenoura refogada']);
select seed_add_refeicao('I','Lanche da Tarde','2026-07-01', array['Pão hot dog c/ manteiga','Leite c/ cacau']);

select seed_add_refeicao('I','Desjejum','2026-07-02', array['Leite c/ cacau']);
select seed_add_refeicao('I','Lanche da Manhã','2026-07-02', array['Pão hot dog c/ pernil','Tangerina pokan']);
select seed_add_refeicao('I','Almoço','2026-07-02', array['Arroz','Feijão','Tilápia assada c/ batata','Inhame refogado']);
select seed_add_refeicao('I','Lanche da Tarde','2026-07-02', array['Pão francês c/ pernil']);

select seed_add_refeicao('I','Desjejum','2026-07-03', array['Leite c/ cacau']);
select seed_add_refeicao('I','Lanche da Manhã','2026-07-03', array['Omelete de forno (c/ cenoura)','Maçã Fuji']);
select seed_add_refeicao('I','Almoço','2026-07-03', array['Arroz','Feijão','Pernil refogado','Cará refogado']);
select seed_add_refeicao('I','Lanche da Tarde','2026-07-03', array['Omelete de forno (c/ cenoura)','Leite c/ cacau']);

-- =============================================================================
-- CARDÁPIO II  - EMEFs com EJA  (igual ao I + Jantar + Fruta explícita)
-- =============================================================================
select seed_add_refeicao('II','Desjejum','2026-06-29', array['Leite c/ cacau']);
select seed_add_refeicao('II','Lanche da Manhã','2026-06-29', array['Pão hot dog c/ manteiga','Leite c/ cacau','Melancia']);
select seed_add_refeicao('II','Almoço','2026-06-29', array['Arroz','Feijão','Carne moída IQF refogada','Batata refogada']);
select seed_add_refeicao('II','Lanche da Tarde','2026-06-29', null, 'Ponto facultativo', true);
select seed_add_refeicao('II','Fruta','2026-06-29', null, 'Ponto facultativo', true);
select seed_add_refeicao('II','Jantar','2026-06-29', array['Arroz','Feijão','Carne moída IQF refogada','Batata refogada','Melancia']);

select seed_add_refeicao('II','Desjejum','2026-06-30', array['Leite c/ cacau']);
select seed_add_refeicao('II','Lanche da Manhã','2026-06-30', array['Pão hot dog c/ manteiga','Chocolate quente','Melão']);
select seed_add_refeicao('II','Almoço','2026-06-30', array['Arroz','Feijão','Filé mignon suíno refogado','Quibebe de abóbora seca']);
select seed_add_refeicao('II','Lanche da Tarde','2026-06-30', array['Bolo de milho','Chocolate quente']);
select seed_add_refeicao('II','Fruta','2026-06-30', array['Melão']);
select seed_add_refeicao('II','Jantar','2026-06-30', array['Arroz','Feijão','Filé mignon suíno refogado','Quibebe de abóbora seca','Melão']);

select seed_add_refeicao('II','Desjejum','2026-07-01', array['Leite c/ cacau']);
select seed_add_refeicao('II','Lanche da Manhã','2026-07-01', array['Pão hot dog c/ manteiga','Leite c/ cacau','Melancia']);
select seed_add_refeicao('II','Almoço','2026-07-01', array['Arroz','Feijão','Frango (peito) ao molho','Cenoura refogada']);
select seed_add_refeicao('II','Lanche da Tarde','2026-07-01', array['Pão hot dog c/ manteiga','Leite c/ cacau']);
select seed_add_refeicao('II','Fruta','2026-07-01', array['Melancia']);
select seed_add_refeicao('II','Jantar','2026-07-01', array['Arroz','Feijão','Frango (peito) ao molho','Cenoura refogada','Melancia']);

select seed_add_refeicao('II','Desjejum','2026-07-02', array['Leite c/ cacau']);
select seed_add_refeicao('II','Lanche da Manhã','2026-07-02', array['Pão hot dog c/ pernil','Tangerina pokan']);
select seed_add_refeicao('II','Almoço','2026-07-02', array['Arroz','Feijão','Tilápia assada c/ batata','Inhame refogado']);
select seed_add_refeicao('II','Lanche da Tarde','2026-07-02', array['Pão francês c/ pernil']);
select seed_add_refeicao('II','Fruta','2026-07-02', array['Tangerina pokan']);
select seed_add_refeicao('II','Jantar','2026-07-02', array['Arroz','Feijão','Tilápia assada c/ batata','Inhame refogado','Tangerina pokan']);

select seed_add_refeicao('II','Desjejum','2026-07-03', array['Leite c/ cacau']);
select seed_add_refeicao('II','Lanche da Manhã','2026-07-03', array['Omelete de forno (c/ cenoura)','Maçã Fuji']);
select seed_add_refeicao('II','Almoço','2026-07-03', array['Arroz','Feijão','Pernil refogado','Cará refogado']);
select seed_add_refeicao('II','Lanche da Tarde','2026-07-03', array['Omelete de forno (c/ cenoura)','Leite c/ cacau']);
select seed_add_refeicao('II','Fruta','2026-07-03', array['Maçã Fuji']);
select seed_add_refeicao('II','Jantar','2026-07-03', array['Arroz','Feijão','Pernil refogado','Cará refogado','Maçã Fuji']);

-- =============================================================================
-- CARDÁPIO IV  - EMEI (Lanche Manhã / Almoço / Lanche Tarde)
-- =============================================================================
select seed_add_refeicao('IV','Lanche da Manhã','2026-06-29', array['Pão bisnaga c/ manteiga','Leite c/ cacau','Melancia']);
select seed_add_refeicao('IV','Almoço','2026-06-29', array['Arroz','Feijão','Carne moída IQF refogada','Batata refogada']);
select seed_add_refeicao('IV','Lanche da Tarde','2026-06-29', null, 'Ponto facultativo', true);

select seed_add_refeicao('IV','Lanche da Manhã','2026-06-30', array['Pão bisnaga c/ manteiga','Chocolate quente','Melão']);
select seed_add_refeicao('IV','Almoço','2026-06-30', array['Arroz','Feijão','Filé mignon suíno refogado','Quibebe de abóbora seca']);
select seed_add_refeicao('IV','Lanche da Tarde','2026-06-30', array['Bolo de milho','Leite c/ cacau','Melão']);

select seed_add_refeicao('IV','Lanche da Manhã','2026-07-01', array['Pão bisnaga c/ manteiga','Leite c/ cacau','Melancia']);
select seed_add_refeicao('IV','Almoço','2026-07-01', array['Arroz','Feijão','Polenta com frango (peito) ao molho','Cenoura refogada']);
select seed_add_refeicao('IV','Lanche da Tarde','2026-07-01', array['Pão bisnaga c/ manteiga','Leite c/ cacau','Melancia']);

select seed_add_refeicao('IV','Lanche da Manhã','2026-07-02', array['Pão bisnaga c/ manteiga','Leite c/ cacau','Tangerina pokan']);
select seed_add_refeicao('IV','Almoço','2026-07-02', array['Arroz','Feijão','Tilápia assada c/ batata','Inhame refogado']);
select seed_add_refeicao('IV','Lanche da Tarde','2026-07-02', array['Omelete de forno (c/ cenoura)','Tangerina pokan']);

select seed_add_refeicao('IV','Lanche da Manhã','2026-07-03', array['Omelete de forno (c/ cenoura)','Maçã Fuji']);
select seed_add_refeicao('IV','Almoço','2026-07-03', array['Arroz','Feijão','Pernil refogado','Cará refogado']);
select seed_add_refeicao('IV','Lanche da Tarde','2026-07-03', array['Pão bisnaga c/ pernil','Maçã Fuji']);

-- =============================================================================
-- CARDÁPIO V  - CEI 6 a 12 meses (alimentos oferecidos separadamente)
-- =============================================================================
select seed_add_refeicao('V','Desjejum','2026-06-29', array['Leite materno ou fórmula (180 ml)']);
select seed_add_refeicao('V','Colação','2026-06-29', array['Melancia']);
select seed_add_refeicao('V','Almoço','2026-06-29', array['Batata refogada','Arroz','Feijão','Carne moída IQF refogada']);
select seed_add_refeicao('V','Lanche da Tarde','2026-06-29', null, 'Ponto facultativo', true);

select seed_add_refeicao('V','Desjejum','2026-06-30', array['Leite materno ou fórmula (180 ml)']);
select seed_add_refeicao('V','Colação','2026-06-30', array['Melão']);
select seed_add_refeicao('V','Almoço','2026-06-30', array['Quibebe de abóbora seca','Arroz','Feijão','Filé suíno refogado']);
select seed_add_refeicao('V','Lanche da Tarde','2026-06-30', array['Melão']);

select seed_add_refeicao('V','Desjejum','2026-07-01', array['Leite materno ou fórmula (180 ml)']);
select seed_add_refeicao('V','Colação','2026-07-01', array['Melancia']);
select seed_add_refeicao('V','Almoço','2026-07-01', array['Cenoura refogada','Arroz','Feijão','Coxa e sobrecoxa refogada']);
select seed_add_refeicao('V','Lanche da Tarde','2026-07-01', array['Melancia']);

select seed_add_refeicao('V','Desjejum','2026-07-02', array['Leite materno ou fórmula (180 ml)']);
select seed_add_refeicao('V','Colação','2026-07-02', array['Tangerina pokan']);
select seed_add_refeicao('V','Almoço','2026-07-02', array['Inhame refogado','Arroz','Feijão','Tilápia assada']);
select seed_add_refeicao('V','Lanche da Tarde','2026-07-02', array['Tangerina pokan']);

select seed_add_refeicao('V','Desjejum','2026-07-03', array['Leite materno ou fórmula (180 ml)']);
select seed_add_refeicao('V','Colação','2026-07-03', array['Maçã Fuji']);
select seed_add_refeicao('V','Almoço','2026-07-03', array['Cará refogado','Arroz','Feijão','Pernil refogado']);
select seed_add_refeicao('V','Lanche da Tarde','2026-07-03', array['Maçã Fuji']);

-- =============================================================================
-- CARDÁPIO VIII  - Vegetariano (Desjejum / Almoço / Sobremesa)
-- =============================================================================
select seed_add_refeicao('VIII','Desjejum','2026-06-29', array['Pão bisnaga c/ manteiga','Leite c/ cacau']);
select seed_add_refeicao('VIII','Almoço','2026-06-29', array['Arroz','Feijão','Torta de legumes (cenoura e tomate)','Batata refogada']);
select seed_add_refeicao('VIII','Sobremesa','2026-06-29', array['Melancia']);

select seed_add_refeicao('VIII','Desjejum','2026-06-30', array['Bolo de milho','Chocolate quente']);
select seed_add_refeicao('VIII','Almoço','2026-06-30', array['Arroz','Feijão','Ovos mexidos c/ salsa','Quibebe de abóbora seca']);
select seed_add_refeicao('VIII','Sobremesa','2026-06-30', array['Melão']);

select seed_add_refeicao('VIII','Desjejum','2026-07-01', array['Pão bisnaga c/ manteiga','Leite c/ cacau']);
select seed_add_refeicao('VIII','Almoço','2026-07-01', array['Arroz','Feijão','Polenta cremosa','Cenoura refogada']);
select seed_add_refeicao('VIII','Sobremesa','2026-07-01', array['Melancia']);

select seed_add_refeicao('VIII','Desjejum','2026-07-02', array['Pão bisnaga c/ manteiga','Leite c/ cacau']);
select seed_add_refeicao('VIII','Almoço','2026-07-02', array['Arroz','Feijão','Ovos cozidos','Purê de batata','Inhame refogado']);
select seed_add_refeicao('VIII','Sobremesa','2026-07-02', array['Tangerina pokan']);

select seed_add_refeicao('VIII','Desjejum','2026-07-03', array['Omelete de forno (c/ cenoura)']);
select seed_add_refeicao('VIII','Almoço','2026-07-03', array['Arroz','Feijão','Ovos mexidos c/ tomate','Cará refogado']);
select seed_add_refeicao('VIII','Sobremesa','2026-07-03', array['Maçã Fuji']);

-- =============================================================================
-- Categorização básica do catálogo (ajuda o filtro/cor na tela de gestão)
-- =============================================================================
update itens set categoria_id = (select id from categorias_item where nome='Cereais')
  where nome in ('Arroz','Polenta com frango (peito) ao molho','Polenta cremosa','Bolo de milho');
update itens set categoria_id = (select id from categorias_item where nome='Feijões')
  where nome in ('Feijão');
update itens set categoria_id = (select id from categorias_item where nome='Carnes / Ovos')
  where nome in ('Carne moída IQF refogada','Filé mignon suíno refogado','Filé suíno refogado',
    'Frango (peito) ao molho','Tilápia assada c/ batata','Tilápia assada','Pernil refogado',
    'Coxa e sobrecoxa refogada','Omelete de forno (c/ cenoura)','Ovos mexidos c/ salsa',
    'Ovos cozidos','Ovos mexidos c/ tomate');
update itens set categoria_id = (select id from categorias_item where nome='Legumes e Verduras')
  where nome in ('Batata refogada','Cenoura refogada','Inhame refogado','Cará refogado',
    'Quibebe de abóbora seca','Purê de batata','Torta de legumes (cenoura e tomate)');
update itens set categoria_id = (select id from categorias_item where nome='Frutas')
  where nome in ('Melancia','Melão','Tangerina pokan','Maçã Fuji');
update itens set categoria_id = (select id from categorias_item where nome='Bebidas')
  where nome in ('Leite c/ cacau','Chocolate quente','Leite materno ou fórmula (180 ml)');
update itens set categoria_id = (select id from categorias_item where nome='Pães e Massas')
  where nome in ('Pão hot dog c/ manteiga','Pão hot dog c/ pernil','Pão francês c/ pernil',
    'Pão bisnaga c/ manteiga','Pão bisnaga c/ pernil');

-- Itens sem categoria caem em "Outros"
update itens set categoria_id = (select id from categorias_item where nome='Outros')
  where categoria_id is null;

-- Limpa a função auxiliar de seed
drop function if exists seed_add_refeicao(text, text, date, text[], text, boolean);

-- Conferência rápida
-- select cardapio_numero, data, tipo_refeicao, itens from vw_cardapio_completo order by 1,2,tipo_ordem;
