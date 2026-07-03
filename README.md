# 🍎 SAELM — Sistema de Apresentação de Cardápio Escolar

Nova forma de apresentar o cardápio da **Gerência de Nutrição Escolar**, com:

- **Tela pública** de apresentação — grade semanal + cards, com filtro por cardápio e busca por escola.
- **Tela de gerenciamento** — CRUD de refeições por dia, cardápios, escolas e catálogo de itens/preparações.
- **Banco de dados** no Supabase (PostgreSQL).
- **Hospedagem** estática no GitHub Pages (sem servidor próprio).

```
saelm/
├── index.html            # apresentação pública
├── gerenciar.html        # painel administrativo
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── config.js         # ← preencher URL e chave do Supabase
│       ├── supabaseClient.js
│       ├── app.js            # lógica da tela pública
│       └── gerenciar.js      # lógica do painel admin
└── db/
    ├── 01_schema.sql     # estrutura do banco (+ RLS)
    └── 02_seed.sql       # dados de exemplo (JUNHO 2026)
```

---

## 1) Criar o banco no Supabase

1. Crie uma conta e um projeto em **https://supabase.com** (plano gratuito serve).
2. No projeto, abra **SQL Editor → New query**.
3. Cole e execute o conteúdo de [`db/01_schema.sql`](db/01_schema.sql) — ele cria o schema
   **`nutricao`**, as tabelas e as regras de segurança.
4. Abra outra query, cole e execute [`db/02_seed.sql`](db/02_seed.sql) (popula com os cardápios I–VIII da semana de exemplo).

> Todo o sistema fica no schema **`nutricao`** (não no `public`), para manter o banco organizado.

## 2) Expor o schema para a API

Como o sistema usa um schema próprio, é preciso liberá-lo na API:

1. Vá em **Project Settings → API → Data API** (ou "API Settings").
2. Em **Exposed schemas**, adicione **`nutricao`** e salve.

Sem esse passo, o `supabase-js` retorna erro de "schema must be one of the following".

## 3) Pegar as chaves de API

Em **Project Settings → API**, copie:

- **Project URL** (ex.: `https://xxxx.supabase.co`)
- **anon public** key

Abra [`assets/js/config.js`](assets/js/config.js) e confira:
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SCHEMA` (já vem como `"nutricao"`).

> A chave **anon** é pública por natureza (fica visível no navegador).
> **Nunca** use aqui a chave `service_role`.

> ⚠️ **Sem controle de acesso (por enquanto):** as políticas RLS do `01_schema.sql` estão
> liberadas para leitura **e** escrita pela chave anônima — ou seja, qualquer pessoa com o
> link de `gerenciar.html` pode editar. Para proteger depois, veja "Ativar login" abaixo.

## 4) Publicar no GitHub Pages

1. Faça commit e push deste repositório para o GitHub.
2. No repositório: **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`. Salve.
4. Em ~1 min o site fica no ar em `https://SEU-USUARIO.github.io/saelm/`.

- Apresentação pública: `.../saelm/`
- Gerenciamento: `.../saelm/gerenciar.html`

---

## Como usar

### Apresentação (`index.html`)
- Selecione o **Cardápio** (I a VIII) no topo.
- Ou digite o nome de uma **escola** para ir direto ao cardápio dela.
- Alterne entre **Grade** (tabela semanal) e **Cards** (ideal para celular).
- Botão **Imprimir** gera uma versão limpa para papel/PDF.

### Gerenciar (`gerenciar.html`)
- **Refeições por dia:** escolha cardápio + data e monte cada refeição adicionando itens
  (do catálogo, com autocomplete, ou digitando um novo — que já entra no catálogo).
  Marque "Ponto facultativo" quando não houver oferta. Use **Copiar de…** para reaproveitar outro dia.
- **Cardápios & Escolas:** cadastre/edite cardápios e escolas e vincule cada escola aos seus cardápios.
- **Catálogo de itens:** gerencie as preparações reutilizáveis e suas categorias.

---

## Modelo de dados (resumo)

| Tabela | Papel |
|---|---|
| `cardapios` | Modelos I–VIII por tipo de unidade/faixa etária |
| `escolas` + `escola_cardapio` | Unidades e vínculo (N:N) com cardápios |
| `tipos_refeicao` | Desjejum, Almoço, Fruta, Jantar… (com horário e cor) |
| `categorias_item` / `itens` | Catálogo de preparações reutilizáveis |
| `refeicoes` | Refeição = cardápio + data + tipo |
| `refeicao_itens` | Itens que compõem cada refeição |
| `vw_cardapio_completo` | View pronta para a tela pública |

## Ativar login (quando quiser proteger o painel)

1. No `db/01_schema.sql`, na política **"escrita liberada"**, troque `for all using (true)`
   por `for all to authenticated using (true)` e reexecute (ou ajuste no SQL Editor).
   Ajuste também o grant final para `grant insert, update, delete ... to authenticated`.
2. Em **Authentication → Users → Add user**, crie o usuário administrador.
3. Reative a tela de login em `assets/js/gerenciar.js` (a função `boot()` traz um comentário
   indicando onde estava a verificação de sessão do Supabase Auth).

## Observações técnicas
- Front-end 100% estático (HTML/CSS/JS puro, sem build). O `supabase-js` é carregado via CDN (ESM).
- Requer navegador moderno (ES modules).
- Datas de exemplo: **29/06 a 03/07/2026** ("5ª semana" do PDF de origem).
