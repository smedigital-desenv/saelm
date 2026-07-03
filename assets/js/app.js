// =============================================================================
// SAELM - Tela pública de apresentação do cardápio
// =============================================================================
import { supabase, isConfigured, formatarData } from "./supabaseClient.js";

const el = (id) => document.getElementById(id);
const cfg = window.SAELM_CONFIG || {};

let cardapios = [];
let cardapioAtual = null;
let refeicoesAtual = [];   // linhas da vw_cardapio_completo
let view = "grade";

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
    await carregarCardapios();
    await carregarEscolas();
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
  el("selCardapio").addEventListener("change", (e) => selecionarCardapio(e.target.value));
  el("viewToggle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    view = b.dataset.view;
    [...el("viewToggle").children].forEach((c) => c.classList.toggle("active", c === b));
    render();
  });
  el("btnImprimir").addEventListener("click", () => window.print());
  el("txtEscola").addEventListener("change", onBuscaEscola);
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

async function carregarEscolas() {
  const { data } = await supabase
    .from("escolas")
    .select("nome, escola_cardapio(cardapio_id)")
    .eq("ativo", true)
    .order("nome");
  const dl = el("listaEscolas");
  dl.innerHTML = (data || []).map((e) => `<option value="${escapeHtml(e.nome)}">`).join("");
  // guarda mapa escola->cardapio para busca
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
function render() {
  renderHead();
  renderLegenda();
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

// tipos presentes neste cardápio, na ordem do dia
function tiposDoCardapio() {
  const map = new Map();
  refeicoesAtual.forEach((r) => {
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
  const tipos = tiposDoCardapio();
  const datas = datasDoCardapio();

  const thead = `<thead><tr>
    <th style="background:var(--verde)">Dia</th>
    ${tipos.map((t) => `<th style="background:${t.cor}">${escapeHtml(t.nome)}<span class="horario">${escapeHtml(t.horario || "")}</span></th>`).join("")}
  </tr></thead>`;

  const tbody = `<tbody>${datas.map((d) => {
    const f = formatarData(d);
    return `<tr>
      <th><span class="dia-num">${f.dia}</span><div class="dia-semana">${f.semana}</div></th>
      ${tipos.map((t) => {
        const r = celula(d, t.nome);
        return `<td>${conteudoRefeicao(r)}</td>`;
      }).join("")}
    </tr>`;
  }).join("")}</tbody>`;

  return `<div class="grade-scroll"><table class="grade">${thead}${tbody}</table></div>`;
}

function conteudoRefeicao(r) {
  if (!r) return `<span class="fac">—</span>`;
  if (r.facultativo && !r.itens) return `<span class="fac">${escapeHtml(r.observacao || "Ponto facultativo")}</span>`;
  const itens = (r.itens || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!itens.length) return `<span class="fac">${escapeHtml(r.observacao || "—")}</span>`;
  return `<ul>${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

// ---------- CARDS ----------
function renderCards() {
  const tipos = tiposDoCardapio();
  const datas = datasDoCardapio();
  return `<div class="cards">${datas.map((d) => {
    const f = formatarData(d);
    const meals = tipos.map((t) => {
      const r = celula(d, t.nome);
      if (!r) return "";
      const corpo = (r.facultativo && !r.itens)
        ? `<div class="itens fac">${escapeHtml(r.observacao || "Ponto facultativo")}</div>`
        : `<div class="itens">${escapeHtml(r.itens || r.observacao || "—")}</div>`;
      return `<div class="meal">
        <div class="meal-title"><span class="dot" style="background:${t.cor}"></span>${escapeHtml(t.nome)}
          ${t.horario ? `<span class="horario">· ${escapeHtml(t.horario)}</span>` : ""}</div>
        ${corpo}
      </div>`;
    }).join("");
    return `<div class="day-card">
      <div class="head"><div class="n">${f.dia}</div>
        <div class="s"><small>${f.curto}</small><strong>${f.semana}</strong></div></div>
      ${meals}
    </div>`;
  }).join("")}</div>`;
}

// ---------- Legenda ----------
function renderLegenda() {
  const tipos = tiposDoCardapio();
  el("legenda").innerHTML = tipos
    .map((t) => `<span><span class="dot" style="background:${t.cor}"></span>${escapeHtml(t.nome)}${t.horario ? ` (${escapeHtml(t.horario)})` : ""}</span>`)
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
