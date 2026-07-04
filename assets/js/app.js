// =============================================================================
// SAELM - Tela pública de apresentação do cardápio
//   Modo "cardapio": escolhe 1 cardápio e vê a semana (grade/cards).
//   Modo "dia":      escolhe 1 dia e vê TODOS os cardápios daquele dia.
// =============================================================================
import { supabase, isConfigured, formatarData } from "./supabaseClient.js";

const el = (id) => document.getElementById(id);
const cfg = window.SAELM_CONFIG || {};

// Emoji por tipo de refeição (fallback 🍽️)
const EMOJI = {
  "Desjejum": "☕", "Colação": "🍊", "Lanche da Manhã": "🥪",
  "Almoço": "🍛", "Leite": "🍼", "Lanche da Tarde": "🧁",
  "Sobremesa": "🍨", "Fruta": "🍉", "Jantar": "🌙",
};
const emojiDe = (nome) => EMOJI[nome] || "🍽️";

// Chips de alimentos coloridos pela cor do tipo de refeição
function chipsDeItens(itensStr, cor) {
  const itens = (itensStr || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!itens.length) return "";
  return `<div class="ichips">${itens
    .map((i) => `<span class="ichip" style="--chip-bg:${cor}1c; --chip-fg:${cor}">${escapeHtml(i)}</span>`)
    .join("")}</div>`;
}

let cardapios = [];
let cardapioAtual = null;
let refeicoesAtual = [];   // linhas da vw_cardapio_completo (modo cardapio)
let datas = [];            // todas as datas disponíveis
let diaSel = null;         // data selecionada (modo dia)
let diaRows = [];          // linhas da vw para o dia (modo dia)
let view = "grade";        // grade | cards (modo cardapio)
let mode = "cardapio";     // cardapio | dia

// ---------------------------------------------------------------------------
init();

async function init() {
  el("badgeMes").textContent = cfg.MES_REFERENCIA || "";

  if (!isConfigured) {
    el("conteudo").innerHTML = avisoConfig();
    el("selCardapio").innerHTML = "<option>—</option>";
    return;
  }

  bindToolbar();

  try {
    await Promise.all([carregarCardapios(), carregarEscolas(), carregarDatas()]);
    if (cardapios.length) {
      await selecionarCardapio(cardapios[0].id);
    } else {
      el("conteudo").innerHTML =
        `<div class="notice">Nenhum cardápio cadastrado ainda. Acesse <a href="gerenciar.html">Gerenciar</a> para começar.</div>`;
    }
  } catch (e) {
    console.error(e);
    el("conteudo").innerHTML = `<div class="notice warn">Erro ao carregar dados: ${e.message}</div>`;
  }
}

function bindToolbar() {
  el("modeToggle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setMode(b.dataset.mode);
  });
  el("selCardapio").addEventListener("change", (e) => selecionarCardapio(e.target.value));
  el("selDia").addEventListener("change", (e) => selecionarDia(e.target.value));
  el("viewToggle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    view = b.dataset.view;
    [...el("viewToggle").children].forEach((c) => c.classList.toggle("active", c === b));
    render();
  });
  el("btnImprimir").addEventListener("click", () => window.print());
  el("txtEscola").addEventListener("change", onBuscaEscola);

  // Modal de fotos: delegação de clique no container de conteúdo
  el("conteudo").addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-refeicao-id]");
    if (alvo) abrirModal(alvo.dataset);
  });
  el("modalClose").addEventListener("click", fecharModal);
  el("modal").addEventListener("click", (e) => { if (e.target.id === "modal") fecharModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
}

// ===========================================================================
// MODAL de fotos dos pratos
// ===========================================================================
async function abrirModal(ds) {
  const cor = ds.cor || "var(--azul)";
  el("modalEmoji").textContent = emojiDe(ds.tipo);
  el("modalEmoji").style.background = `${cor}22`;
  el("modalTitulo").textContent = ds.tipo || "Refeição";
  el("modalSub").textContent = ds.horario || "";
  el("modalGallery").innerHTML = `<div class="notice" style="grid-column:1/-1">Carregando pratos…</div>`;
  el("modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // tenta com foto_url; se a coluna ainda não existir, refaz sem ela
  let sel = "ordem, texto_livre, itens(nome, foto_url)";
  let res = await supabase.from("refeicao_itens").select(sel).eq("refeicao_id", ds.refeicaoId).order("ordem");
  if (res.error) {
    res = await supabase.from("refeicao_itens").select("ordem, texto_livre, itens(nome)").eq("refeicao_id", ds.refeicaoId).order("ordem");
  }
  if (res.error) { el("modalGallery").innerHTML = `<div class="notice warn" style="grid-column:1/-1">${res.error.message}</div>`; return; }

  const itens = (res.data || []).map((ri) => ({
    nome: ri.itens?.nome || ri.texto_livre || "Item",
    foto: ri.itens?.foto_url || null,
  }));
  el("modalGallery").innerHTML = itens.length
    ? itens.map((it) => tilePrato(it, cor, ds.tipo)).join("")
    : `<div class="notice" style="grid-column:1/-1">Sem itens cadastrados.</div>`;
}

function tilePrato(it, cor, tipo) {
  const media = it.foto
    ? `<div class="prato-foto" style="background-image:url('${encodeURI(it.foto)}')"></div>`
    : `<div class="prato-foto sem" style="background:${cor}1f;color:${cor}">${emojiDe(tipo)}</div>`;
  return `<div class="prato">${media}<div class="prato-nome">${escapeHtml(it.nome)}</div></div>`;
}

function fecharModal() {
  el("modal").classList.add("hidden");
  document.body.style.overflow = "";
}

function setMode(m) {
  if (m === mode) return;
  mode = m;
  [...el("modeToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  el("fieldCardapio").classList.toggle("hidden", m !== "cardapio");
  el("fieldEscola").classList.toggle("hidden", m !== "cardapio");
  el("viewToggle").classList.toggle("hidden", m !== "cardapio");
  el("fieldDia").classList.toggle("hidden", m !== "dia");

  if (m === "cardapio") {
    if (cardapioAtual) selecionarCardapio(cardapioAtual.id);
  } else {
    const d = el("selDia").value || datas[0];
    if (d) { el("selDia").value = d; selecionarDia(d); }
    else el("conteudo").innerHTML = `<div class="notice">Nenhum dia disponível.</div>`;
  }
}

// ---------------------------------------------------------------------------
async function carregarCardapios() {
  const { data, error } = await supabase
    .from("cardapios")
    .select("*")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  cardapios = data || [];
  el("selCardapio").innerHTML = cardapios
    .map((c) => `<option value="${c.id}">Cardápio ${c.numero} — ${escapeHtml(c.titulo)}</option>`)
    .join("");
}

async function carregarDatas() {
  const { data } = await supabase.from("refeicoes").select("data");
  datas = [...new Set((data || []).map((r) => r.data))].sort();
  el("selDia").innerHTML = datas
    .map((d) => {
      const f = formatarData(d);
      return `<option value="${d}">${f.curto} — ${f.semana}</option>`;
    })
    .join("");
}

async function carregarEscolas() {
  const { data } = await supabase
    .from("escolas")
    .select("nome, escola_cardapio(cardapio_id)")
    .eq("ativo", true)
    .order("nome");
  const dl = el("listaEscolas");
  dl.innerHTML = (data || []).map((e) => `<option value="${escapeHtml(e.nome)}">`).join("");
  window.__escolas = (data || []).reduce((acc, e) => {
    acc[e.nome.toLowerCase()] = (e.escola_cardapio || []).map((x) => x.cardapio_id);
    return acc;
  }, {});
}

function onBuscaEscola(e) {
  const nome = e.target.value.trim().toLowerCase();
  const ids = (window.__escolas || {})[nome];
  if (ids && ids.length) {
    const alvo = cardapios.find((c) => ids.includes(c.id));
    if (alvo) { el("selCardapio").value = alvo.id; selecionarCardapio(alvo.id); return; }
  }
  if (nome) toast("Escola sem cardápio vinculado.", true);
}

// ===========================================================================
// MODO CARDÁPIO (semana de 1 cardápio)
// ===========================================================================
async function selecionarCardapio(id) {
  cardapioAtual = cardapios.find((c) => c.id === id);
  if (!cardapioAtual) return;
  el("selCardapio").value = id;
  el("conteudo").innerHTML = `<div class="notice">Carregando cardápio…</div>`;

  const { data, error } = await supabase
    .from("vw_cardapio_completo")
    .select("*")
    .eq("cardapio_id", id)
    .order("data")
    .order("tipo_ordem");
  if (error) { el("conteudo").innerHTML = `<div class="notice warn">${error.message}</div>`; return; }

  refeicoesAtual = data || [];
  render();
}

function render() {
  renderHead();
  renderLegendaFrom(refeicoesAtual);
  if (!refeicoesAtual.length) {
    el("conteudo").innerHTML =
      `<div class="notice">Este cardápio ainda não possui refeições cadastradas.</div>`;
    return;
  }
  el("conteudo").innerHTML = view === "grade" ? renderGrade() : renderCards();
}

function renderHead() {
  const c = cardapioAtual;
  el("cardapioHead").innerHTML = `
    <div class="cardapio-head">
      <h2>Cardápio ${escapeHtml(c.numero)} — ${escapeHtml(c.titulo)}</h2>
      <div class="meta">
        ${c.publico_alvo ? `<span class="chip">${escapeHtml(c.publico_alvo)}</span>` : ""}
        ${c.percentual ? `<span class="chip">${escapeHtml(c.percentual)}</span>` : ""}
        <span>${cfg.MES_REFERENCIA || ""}</span>
      </div>
      ${c.observacoes ? `<p class="obs">${escapeHtml(c.observacoes)}</p>` : ""}
    </div>`;
}

function tiposDe(rows) {
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.tipo_refeicao_id))
      map.set(r.tipo_refeicao_id, { nome: r.tipo_refeicao, horario: r.horario, cor: r.tipo_cor, ordem: r.tipo_ordem });
  });
  return [...map.values()].sort((a, b) => a.ordem - b.ordem);
}

function datasDoCardapio() {
  return [...new Set(refeicoesAtual.map((r) => r.data))].sort();
}

function celula(data, tipoNome) {
  return refeicoesAtual.find((r) => r.data === data && r.tipo_refeicao === tipoNome);
}

// ---------- GRADE ----------
function renderGrade() {
  const tipos = tiposDe(refeicoesAtual);
  const dts = datasDoCardapio();

  const thead = `<thead><tr>
    <th style="background:var(--azul)">Dia</th>
    ${tipos.map((t) => `<th style="background:${t.cor}">${escapeHtml(t.nome)}<span class="horario">${escapeHtml(t.horario || "")}</span></th>`).join("")}
  </tr></thead>`;

  const tbody = `<tbody>${dts.map((d) => {
    const f = formatarData(d);
    return `<tr>
      <th><span class="dia-num">${f.dia}</span><div class="dia-semana">${f.semana}</div></th>
      ${tipos.map((t) => {
        const r = celula(d, t.nome);
        const clic = r && r.itens ? `class="clickable" ${attrsModal(r)}` : "";
        return `<td ${clic}>${conteudoRefeicao(r)}</td>`;
      }).join("")}
    </tr>`;
  }).join("")}</tbody>`;

  return `<div class="grade-scroll"><table class="grade">${thead}${tbody}</table></div>`;
}

function conteudoRefeicao(r) {
  if (!r) return `<span class="fac">—</span>`;
  if (r.facultativo && !r.itens) return `<span class="fac">${escapeHtml(r.observacao || "Ponto facultativo")}</span>`;
  const chips = chipsDeItens(r.itens, r.tipo_cor);
  if (!chips) return `<span class="fac">${escapeHtml(r.observacao || "—")}</span>`;
  return chips;
}

// ---------- CARDS (por dia, dentro de 1 cardápio) ----------
function renderCards() {
  const tipos = tiposDe(refeicoesAtual);
  const dts = datasDoCardapio();
  return `<div class="cards">${dts.map((d) => {
    const f = formatarData(d);
    const meals = tipos.map((t) => {
      const r = celula(d, t.nome);
      return r ? blocoRefeicao(r) : "";
    }).join("");
    return `<div class="day-card">
      <div class="head"><div class="n">${f.dia}</div>
        <div class="s"><small>${f.curto}</small><strong>${f.semana}</strong></div></div>
      ${meals}
    </div>`;
  }).join("")}</div>`;
}

// ===========================================================================
// MODO DIA (todos os cardápios de 1 dia)
// ===========================================================================
async function selecionarDia(data) {
  if (!data) return;
  diaSel = data;
  el("selDia").value = data;
  el("conteudo").innerHTML = `<div class="notice">Carregando dia…</div>`;

  const { data: rows, error } = await supabase
    .from("vw_cardapio_completo")
    .select("*")
    .eq("data", data)
    .order("tipo_ordem");
  if (error) { el("conteudo").innerHTML = `<div class="notice warn">${error.message}</div>`; return; }

  diaRows = rows || [];
  renderDiaView();
}

function renderDiaView() {
  const f = formatarData(diaSel);
  el("cardapioHead").innerHTML = `
    <div class="cardapio-head">
      <h2>${f.semana}, ${f.dia}/${f.mes}</h2>
      <div class="meta">
        <span class="chip">Todos os cardápios do dia</span>
        <span>${cfg.MES_REFERENCIA || ""}</span>
      </div>
    </div>`;

  renderLegendaFrom(diaRows);

  if (!diaRows.length) {
    el("conteudo").innerHTML = `<div class="notice">Nenhuma refeição cadastrada neste dia.</div>`;
    return;
  }

  // um card por cardápio (na ordem oficial), com as refeições daquele dia
  const cards = cardapios.map((c) => {
    const rows = diaRows
      .filter((r) => r.cardapio_id === c.id)
      .sort((a, b) => a.tipo_ordem - b.tipo_ordem);
    if (!rows.length) return "";
    const meals = rows.map((r) => blocoRefeicao(r)).join("");
    return `<div class="day-card">
      <div class="head">
        <div class="n">${escapeHtml(c.numero)}</div>
        <div class="s"><small>Cardápio ${escapeHtml(c.numero)}</small><strong>${escapeHtml(c.titulo)}</strong></div>
      </div>
      ${meals}
    </div>`;
  }).join("");

  el("conteudo").innerHTML = `<div class="cards">${cards}</div>`;
}

// bloco visual de uma refeição (usado em cards e no modo dia)
function blocoRefeicao(r) {
  const chips = chipsDeItens(r.itens, r.tipo_cor);
  const corpo = (r.facultativo && !r.itens)
    ? `<div class="itens fac">${escapeHtml(r.observacao || "Ponto facultativo")}</div>`
    : (chips || `<div class="itens fac">${escapeHtml(r.observacao || "—")}</div>`);
  const clic = r.itens ? `class="meal clickable" ${attrsModal(r)}` : `class="meal"`;
  return `<div ${clic}>
    <div class="meal-title"><span class="emoji">${emojiDe(r.tipo_refeicao)}</span>
      <span style="color:${r.tipo_cor}">${escapeHtml(r.tipo_refeicao)}</span>
      ${r.horario ? `<span class="horario">· ${escapeHtml(r.horario)}</span>` : ""}</div>
    ${corpo}
  </div>`;
}

// atributos usados pelo modal ao clicar numa refeição
function attrsModal(r) {
  return `data-refeicao-id="${r.refeicao_id}" data-tipo="${escapeHtml(r.tipo_refeicao)}" data-cor="${r.tipo_cor}" data-horario="${escapeHtml(r.horario || "")}"`;
}

// ---------- Legenda ----------
function renderLegendaFrom(rows) {
  const tipos = tiposDe(rows);
  el("legenda").innerHTML = tipos
    .map((t) => `<span>${emojiDe(t.nome)} <span class="dot" style="background:${t.cor}"></span>${escapeHtml(t.nome)}${t.horario ? ` (${escapeHtml(t.horario)})` : ""}</span>`)
    .join("");
}

// ---------------------------------------------------------------------------
function avisoConfig() {
  return `<div class="notice warn">
    <h3>⚙️ Configuração necessária</h3>
    <p>Abra <code>assets/js/config.js</code> e informe a <strong>URL</strong> e a <strong>chave anon</strong> do seu projeto Supabase.</p>
    <p class="muted">Depois recarregue esta página.</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer;
function toast(msg, err = false) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "show" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}
