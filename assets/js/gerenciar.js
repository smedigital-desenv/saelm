// =============================================================================
// SAELM - Painel de gerenciamento (admin) — modelo com Combinações
// =============================================================================
import { supabase, isConfigured } from "./supabaseClient.js";

const el = (id) => document.getElementById(id);

const state = {
  cardapios: [], escolas: [], categorias: [], itens: [], tipos: [], combinacoes: [],
  montarRows: [],  // refeições do dia/tipo por cardápio
};

boot();

async function boot() {
  if (!isConfigured) {
    document.body.innerHTML =
      `<div class="login-wrap"><div class="card-box"><div class="logo-big">⚙️</div>
      <h3>Configuração necessária</h3><p class="muted">Preencha <code>assets/js/config.js</code>.</p></div></div>`;
    return;
  }
  el("loginView").classList.add("hidden");
  el("appView").classList.remove("hidden");

  bindTabs();
  bindMontar();
  bindCombos();
  bindCardapios();
  bindEscolas();
  bindItens();

  await carregarTudo();
}

async function carregarTudo() {
  await Promise.all([
    carregarCardapios(), carregarEscolas(), carregarCategorias(),
    carregarItens(), carregarTipos(), carregarCombinacoes(),
  ]);
  preencherMontar();
  renderCombos();
  renderCardapios();
  renderEscolas();
  renderItens();
  if (!el("mData").value) el("mData").value = "2026-06-29";
  await carregarMontar();
}

async function carregarCardapios() {
  const { data } = await supabase.from("cardapios").select("*").order("ordem");
  state.cardapios = data || [];
}
async function carregarEscolas() {
  const { data } = await supabase.from("escolas").select("*, escola_cardapio(cardapio_id)").order("nome");
  state.escolas = data || [];
}
async function carregarCategorias() {
  const { data } = await supabase.from("categorias_item").select("*").order("nome");
  state.categorias = data || [];
}
async function carregarItens() {
  const { data } = await supabase.from("itens").select("*, categorias_item(nome, cor)").order("nome");
  state.itens = data || [];
}
async function carregarTipos() {
  const { data } = await supabase.from("tipos_refeicao").select("*").order("ordem");
  state.tipos = data || [];
}
async function carregarCombinacoes() {
  const { data } = await supabase
    .from("combinacoes")
    .select("*, tipos_refeicao(nome, cor)")
    .order("nome");
  state.combinacoes = data || [];
}

// ===========================================================================
// TABS
// ===========================================================================
function bindTabs() {
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".panel").forEach((p) =>
      p.classList.toggle("active", p.id === "panel-" + b.dataset.tab));
  });
}

// ===========================================================================
// MONTAR O DIA
// ===========================================================================
function bindMontar() {
  el("mData").addEventListener("change", carregarMontar);
  el("mTipo").addEventListener("change", () => { preencherComboSelect(); carregarMontar(); });
  el("mTodos").addEventListener("click", () => marcarTodos(true));
  el("mNenhum").addEventListener("click", () => marcarTodos(false));
  el("mAplicar").addEventListener("click", aplicarCombo);
  el("mRemover").addEventListener("click", removerDosMarcados);
}

function preencherMontar() {
  el("mTipo").innerHTML = state.tipos
    .map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join("");
  // tenta pré-selecionar Almoço
  const almoco = state.tipos.find((t) => /almo/i.test(t.nome));
  if (almoco) el("mTipo").value = almoco.id;
  preencherComboSelect();
}

function preencherComboSelect() {
  const tipoId = el("mTipo").value;
  const combos = state.combinacoes.filter((c) => !c.tipo_refeicao_id || c.tipo_refeicao_id === tipoId);
  el("mCombo").innerHTML =
    `<option value="">— escolha uma combinação —</option>` +
    combos.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
}

async function carregarMontar() {
  const data = el("mData").value, tipoId = el("mTipo").value;
  if (!data || !tipoId) return;
  const { data: rows, error } = await supabase
    .from("refeicoes")
    .select("id, cardapio_id, combinacao_id, facultativo, observacao, combinacoes(nome)")
    .eq("data", data).eq("tipo_refeicao_id", tipoId);
  if (error) return toast(error.message, true);
  state.montarRows = rows || [];
  renderMontar();
}

function refeicaoDoCardapio(cardapioId) {
  return state.montarRows.find((r) => r.cardapio_id === cardapioId);
}

function renderMontar() {
  el("mLista").innerHTML = state.cardapios.map((c) => {
    const r = refeicaoDoCardapio(c.id);
    const atual = r?.combinacoes?.nome
      ? `<span class="tag">${esc(r.combinacoes.nome)}</span>`
      : (r?.facultativo ? `<span class="muted">Ponto facultativo</span>` : `<span class="muted">— vazio —</span>`);
    return `<tr>
      <td style="width:34px;"><input type="checkbox" data-card="${c.id}" /></td>
      <td><strong>Cardápio ${esc(c.numero)}</strong><div class="muted" style="font-size:.78rem">${esc(c.titulo)}</div></td>
      <td>${atual}</td>
    </tr>`;
  }).join("");
}

function marcarTodos(v) {
  el("mLista").querySelectorAll("[data-card]").forEach((c) => (c.checked = v));
}
function cardapiosMarcados() {
  return [...el("mLista").querySelectorAll("[data-card]:checked")].map((c) => c.dataset.card);
}

async function aplicarCombo() {
  const comboId = el("mCombo").value;
  if (!comboId) return toast("Escolha uma combinação.", true);
  const alvos = cardapiosMarcados();
  if (!alvos.length) return toast("Marque ao menos um cardápio.", true);
  const data = el("mData").value, tipoId = el("mTipo").value;

  const linhas = alvos.map((cardapio_id) => ({
    cardapio_id, tipo_refeicao_id: tipoId, data, combinacao_id: comboId, facultativo: false, observacao: null,
  }));
  const { error } = await supabase
    .from("refeicoes")
    .upsert(linhas, { onConflict: "cardapio_id,data,tipo_refeicao_id" });
  if (error) return toast(error.message, true);
  toast(`Combinação aplicada em ${alvos.length} cardápio(s)`);
  await carregarMontar();
}

async function removerDosMarcados() {
  const alvos = cardapiosMarcados();
  if (!alvos.length) return toast("Marque ao menos um cardápio.", true);
  if (!confirm("Remover esta refeição dos cardápios marcados?")) return;
  const data = el("mData").value, tipoId = el("mTipo").value;
  const { error } = await supabase
    .from("refeicoes").delete()
    .eq("data", data).eq("tipo_refeicao_id", tipoId).in("cardapio_id", alvos);
  if (error) return toast(error.message, true);
  toast("Refeição removida dos marcados");
  await carregarMontar();
}

// ===========================================================================
// COMBINAÇÕES
// ===========================================================================
function bindCombos() {
  el("btnSalvarCombo").addEventListener("click", salvarCombo);
  el("btnNovaCombo").addEventListener("click", limparFormCombo);
  el("coBusca").addEventListener("input", renderCombos);
  el("coFoto").addEventListener("input", () => setPreview("coFotoPreview", el("coFoto").value.trim()));
  el("coFotoFile").addEventListener("change", (e) => enviarFoto(e, "coFoto", "coFotoPreview"));
  el("coAddBtn").addEventListener("click", () => { adicionarItemCombo(el("coAddItem").value); el("coAddItem").value = ""; });
  el("coAddItem").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { adicionarItemCombo(el("coAddItem").value); el("coAddItem").value = ""; }
  });
}

function preencherTiposCombo() {
  el("coTipo").innerHTML = `<option value="">— qualquer refeição —</option>` +
    state.tipos.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join("");
  el("dlItensCombo").innerHTML = state.itens.map((i) => `<option value="${esc(i.nome)}">`).join("");
}

function renderCombos() {
  preencherTiposCombo();
  const busca = (el("coBusca").value || "").toLowerCase();
  const lista = state.combinacoes.filter((c) => c.nome.toLowerCase().includes(busca));
  el("coCount").textContent = state.combinacoes.length;
  el("tbCombos").innerHTML = lista.map((c) => `
    <tr>
      <td style="width:52px;">${c.foto_url ? `<img class="thumb" src="${esc(c.foto_url)}" alt="" loading="lazy" />` : `<span class="thumb" style="display:inline-grid;place-items:center;">🍽️</span>`}</td>
      <td>${esc(c.nome)}${c.tipos_refeicao ? `<div class="muted" style="font-size:.75rem">${esc(c.tipos_refeicao.nome)}</div>` : ""}</td>
      <td class="row-actions">
        <button class="btn small secondary" data-edit-co="${c.id}">Editar</button>
        <button class="btn small danger" data-del-co="${c.id}">Excluir</button>
      </td>
    </tr>`).join("");
  el("tbCombos").querySelectorAll("[data-edit-co]").forEach((b) =>
    b.addEventListener("click", () => editarCombo(b.dataset.editCo)));
  el("tbCombos").querySelectorAll("[data-del-co]").forEach((b) =>
    b.addEventListener("click", () => excluirCombo(b.dataset.delCo)));
}

function limparFormCombo() {
  el("coId").value = ""; el("coNome").value = ""; el("coTipo").value = "";
  el("coFoto").value = ""; setPreview("coFotoPreview", "");
  el("coTituloForm").textContent = "Nova combinação";
  el("btnNovaCombo").classList.add("hidden");
  el("coItensBox").classList.add("hidden");
  el("coItens").innerHTML = "";
}

async function editarCombo(id) {
  const c = state.combinacoes.find((x) => x.id === id);
  if (!c) return;
  el("coId").value = c.id;
  el("coNome").value = c.nome || "";
  el("coTipo").value = c.tipo_refeicao_id || "";
  el("coFoto").value = c.foto_url || "";
  setPreview("coFotoPreview", c.foto_url || "");
  el("coTituloForm").textContent = "Editar combinação";
  el("btnNovaCombo").classList.remove("hidden");
  el("coItensBox").classList.remove("hidden");
  await renderComboItens(id);
}

async function salvarCombo() {
  const payload = {
    nome: el("coNome").value.trim(),
    tipo_refeicao_id: el("coTipo").value || null,
    foto_url: el("coFoto").value.trim() || null,
  };
  if (!payload.nome) return toast("Dê um nome à combinação.", true);
  const id = el("coId").value;
  const q = id
    ? supabase.from("combinacoes").update(payload).eq("id", id).select("id").single()
    : supabase.from("combinacoes").insert(payload).select("id").single();
  const { data, error } = await q;
  if (error) return toast(error.message, true);
  toast("Combinação salva");
  await carregarCombinacoes();
  if (!id && data) el("coId").value = data.id;
  el("coTituloForm").textContent = "Editar combinação";
  el("btnNovaCombo").classList.remove("hidden");
  el("coItensBox").classList.remove("hidden");
  await renderComboItens(el("coId").value);
  renderCombos();
  preencherComboSelect();
}

async function excluirCombo(id) {
  if (!confirm("Excluir esta combinação? As refeições que a usam ficarão vazias.")) return;
  const { error } = await supabase.from("combinacoes").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Combinação excluída");
  limparFormCombo();
  await carregarCombinacoes();
  renderCombos();
  preencherComboSelect();
  await carregarMontar();
}

async function renderComboItens(comboId) {
  const { data } = await supabase
    .from("combinacao_itens")
    .select("id, ordem, itens(nome)")
    .eq("combinacao_id", comboId).order("ordem");
  el("coItens").innerHTML = (data || []).map((ci) =>
    `<span class="chip-item">${esc(ci.itens?.nome || "?")}<button title="Remover" data-rem-ci="${ci.id}">×</button></span>`
  ).join("") || `<span class="muted" style="font-size:.82rem">Sem itens ainda.</span>`;
  el("coItens").querySelectorAll("[data-rem-ci]").forEach((b) =>
    b.addEventListener("click", () => removerItemCombo(b.dataset.remCi)));
}

async function adicionarItemCombo(nome) {
  nome = (nome || "").trim();
  if (!nome) return;
  const comboId = el("coId").value;
  if (!comboId) return toast("Salve a combinação antes de adicionar itens.", true);
  const itemId = await getOrCreateItem(nome);
  if (!itemId) return;
  const { data: max } = await supabase
    .from("combinacao_itens").select("ordem").eq("combinacao_id", comboId).order("ordem", { ascending: false }).limit(1);
  const ordem = (max && max[0] ? max[0].ordem : -1) + 1;
  const { error } = await supabase.from("combinacao_itens").insert({ combinacao_id: comboId, item_id: itemId, ordem });
  if (error) return toast(error.message, true);
  await renderComboItens(comboId);
}

async function removerItemCombo(ciId) {
  const { error } = await supabase.from("combinacao_itens").delete().eq("id", ciId);
  if (error) return toast(error.message, true);
  await renderComboItens(el("coId").value);
}

async function getOrCreateItem(nome) {
  nome = nome.trim();
  const existente = state.itens.find((i) => i.nome.toLowerCase() === nome.toLowerCase());
  if (existente) return existente.id;
  const { data, error } = await supabase.from("itens").insert({ nome }).select("*, categorias_item(nome,cor)").single();
  if (error) { toast(error.message, true); return null; }
  state.itens.push(data);
  return data.id;
}

// ===========================================================================
// FOTOS (upload para o Storage) — usado pelas combinações
// ===========================================================================
function setPreview(previewId, url) {
  const p = el(previewId);
  if (url) { p.style.backgroundImage = `url('${url}')`; p.textContent = ""; }
  else { p.style.backgroundImage = ""; p.textContent = "🍽️"; }
}

async function enviarFoto(e, inputId, previewId) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  toast("Enviando foto…");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const up = await supabase.storage.from("pratos").upload(path, file, { upsert: true, contentType: file.type });
  if (up.error) { toast("Falha no upload: " + up.error.message + " (rodou o 04_fotos.sql?)", true); return; }
  const { data } = supabase.storage.from("pratos").getPublicUrl(path);
  el(inputId).value = data.publicUrl;
  setPreview(previewId, data.publicUrl);
  toast("Foto enviada");
  e.target.value = "";
}

// ===========================================================================
// CARDÁPIOS
// ===========================================================================
function bindCardapios() {
  el("btnSalvarCardapio").addEventListener("click", salvarCardapio);
  el("btnNovoCardapio").addEventListener("click", limparFormCardapio);
}
function renderCardapios() {
  el("tbCardapios").innerHTML = state.cardapios.map((c) => `
    <tr>
      <td><span class="tag">${esc(c.numero)}</span></td>
      <td>${esc(c.titulo)}<div class="muted" style="font-size:.78rem">${esc(c.percentual || "")}</div></td>
      <td class="row-actions">
        <button class="btn small secondary" data-edit-c="${c.id}">Editar</button>
        <button class="btn small danger" data-del-c="${c.id}">Excluir</button>
      </td>
    </tr>`).join("");
  el("tbCardapios").querySelectorAll("[data-edit-c]").forEach((b) =>
    b.addEventListener("click", () => editarCardapio(b.dataset.editC)));
  el("tbCardapios").querySelectorAll("[data-del-c]").forEach((b) =>
    b.addEventListener("click", () => excluirCardapio(b.dataset.delC)));
}
function editarCardapio(id) {
  const c = state.cardapios.find((x) => x.id === id);
  if (!c) return;
  el("cId").value = c.id; el("cNumero").value = c.numero || ""; el("cTitulo").value = c.titulo || "";
  el("cPublico").value = c.publico_alvo || ""; el("cPercentual").value = c.percentual || "";
  el("cOrdem").value = c.ordem ?? 0; el("cObs").value = c.observacoes || "";
  el("cardTituloForm").textContent = "Editar cardápio " + c.numero;
  el("btnNovoCardapio").classList.remove("hidden");
}
function limparFormCardapio() {
  ["cId","cNumero","cTitulo","cPublico","cPercentual","cObs"].forEach((i) => (el(i).value = ""));
  el("cOrdem").value = 0;
  el("cardTituloForm").textContent = "Novo cardápio";
  el("btnNovoCardapio").classList.add("hidden");
}
async function salvarCardapio() {
  const payload = {
    numero: el("cNumero").value.trim(), titulo: el("cTitulo").value.trim(),
    publico_alvo: el("cPublico").value.trim() || null, percentual: el("cPercentual").value.trim() || null,
    ordem: parseInt(el("cOrdem").value) || 0, observacoes: el("cObs").value.trim() || null,
  };
  if (!payload.numero || !payload.titulo) return toast("Preencha número e título.", true);
  const id = el("cId").value;
  const { error } = id
    ? await supabase.from("cardapios").update(payload).eq("id", id)
    : await supabase.from("cardapios").insert(payload);
  if (error) return toast(error.message, true);
  toast("Cardápio salvo");
  limparFormCardapio();
  await carregarCardapios();
  renderCardapios(); renderEscolas(); renderMontar();
}
async function excluirCardapio(id) {
  if (!confirm("Excluir este cardápio e TODAS as suas refeições?")) return;
  const { error } = await supabase.from("cardapios").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Cardápio excluído");
  await carregarCardapios();
  renderCardapios(); renderMontar();
}

// ===========================================================================
// ESCOLAS
// ===========================================================================
function bindEscolas() {
  el("btnSalvarEscola").addEventListener("click", salvarEscola);
  el("btnNovaEscola").addEventListener("click", limparFormEscola);
}
function renderEscolas() {
  el("tbEscolas").innerHTML = state.escolas.map((e) => {
    const n = (e.escola_cardapio || []).length;
    return `<tr>
      <td>${esc(e.nome)}<div class="muted" style="font-size:.78rem">${esc(e.tipo || "")}</div></td>
      <td>${n ? `<span class="tag">${n} cardápio(s)</span>` : '<span class="muted">—</span>'}</td>
      <td class="row-actions">
        <button class="btn small secondary" data-edit-e="${e.id}">Editar</button>
        <button class="btn small danger" data-del-e="${e.id}">Excluir</button>
      </td>
    </tr>`;
  }).join("");
  el("tbEscolas").querySelectorAll("[data-edit-e]").forEach((b) =>
    b.addEventListener("click", () => editarEscola(b.dataset.editE)));
  el("tbEscolas").querySelectorAll("[data-del-e]").forEach((b) =>
    b.addEventListener("click", () => excluirEscola(b.dataset.delE)));
  renderVinculos();
}
function renderVinculos() {
  const eid = el("eId").value;
  const escola = state.escolas.find((x) => x.id === eid);
  const vinc = new Set((escola?.escola_cardapio || []).map((v) => v.cardapio_id));
  el("eVinculos").innerHTML = state.cardapios.map((c) => `
    <label class="fac-toggle" style="display:block;margin:3px 0">
      <input type="checkbox" data-vinc="${c.id}" ${vinc.has(c.id) ? "checked" : ""} ${eid ? "" : "disabled"}/>
      Cardápio ${c.numero} — ${escHtml(c.titulo)}
    </label>`).join("");
  el("eVinculos").querySelectorAll("[data-vinc]").forEach((chk) =>
    chk.addEventListener("change", () => toggleVinculo(eid, chk.dataset.vinc, chk.checked)));
  if (!eid) el("eVinculos").insertAdjacentHTML("afterbegin", '<div class="muted" style="font-size:.8rem">Salve a escola para vincular cardápios.</div>');
}
async function toggleVinculo(escola_id, cardapio_id, ligar) {
  if (!escola_id) return;
  const { error } = ligar
    ? await supabase.from("escola_cardapio").insert({ escola_id, cardapio_id })
    : await supabase.from("escola_cardapio").delete().match({ escola_id, cardapio_id });
  if (error) return toast(error.message, true);
  await carregarEscolas(); renderEscolas();
}
function editarEscola(id) {
  const e = state.escolas.find((x) => x.id === id);
  if (!e) return;
  el("eId").value = e.id; el("eNome").value = e.nome || ""; el("eTipo").value = e.tipo || "";
  el("escTituloForm").textContent = "Editar escola";
  el("btnNovaEscola").classList.remove("hidden");
  renderVinculos();
}
function limparFormEscola() {
  el("eId").value = ""; el("eNome").value = ""; el("eTipo").value = "";
  el("escTituloForm").textContent = "Nova escola";
  el("btnNovaEscola").classList.add("hidden");
  renderVinculos();
}
async function salvarEscola() {
  const payload = { nome: el("eNome").value.trim(), tipo: el("eTipo").value.trim() || null };
  if (!payload.nome) return toast("Informe o nome da escola.", true);
  const id = el("eId").value;
  const { data, error } = id
    ? await supabase.from("escolas").update(payload).eq("id", id).select("id").single()
    : await supabase.from("escolas").insert(payload).select("id").single();
  if (error) return toast(error.message, true);
  toast("Escola salva");
  await carregarEscolas();
  if (!id && data) el("eId").value = data.id;
  editarEscola(el("eId").value);
  renderEscolas();
}
async function excluirEscola(id) {
  if (!confirm("Excluir esta escola?")) return;
  const { error } = await supabase.from("escolas").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Escola excluída");
  limparFormEscola();
  await carregarEscolas(); renderEscolas();
}

// ===========================================================================
// CATÁLOGO DE ITENS
// ===========================================================================
function bindItens() {
  el("btnSalvarItem").addEventListener("click", salvarItem);
  el("btnNovoItem").addEventListener("click", limparFormItem);
  el("itBusca").addEventListener("input", renderItens);
}
function renderItens() {
  const catAtual = el("iCategoria").value;
  el("iCategoria").innerHTML = `<option value="">— sem categoria —</option>` +
    state.categorias.map((c) => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join("");
  el("iCategoria").value = catAtual;
  const busca = (el("itBusca").value || "").toLowerCase();
  const lista = state.itens.filter((i) => i.nome.toLowerCase().includes(busca));
  el("itCount").textContent = state.itens.length;
  el("tbItens").innerHTML = lista.map((i) => `
    <tr>
      <td>${escHtml(i.nome)}</td>
      <td>${i.categorias_item ? `<span class="tag" style="background:${i.categorias_item.cor}22;color:${i.categorias_item.cor}">${escHtml(i.categorias_item.nome)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="row-actions">
        <button class="btn small secondary" data-edit-i="${i.id}">Editar</button>
        <button class="btn small danger" data-del-i="${i.id}">Excluir</button>
      </td>
    </tr>`).join("");
  el("tbItens").querySelectorAll("[data-edit-i]").forEach((b) =>
    b.addEventListener("click", () => editarItem(b.dataset.editI)));
  el("tbItens").querySelectorAll("[data-del-i]").forEach((b) =>
    b.addEventListener("click", () => excluirItem(b.dataset.delI)));
}
function editarItem(id) {
  const i = state.itens.find((x) => x.id === id);
  if (!i) return;
  el("iId").value = i.id; el("iNome").value = i.nome || "";
  el("iCategoria").value = i.categoria_id || ""; el("iDescricao").value = i.descricao || "";
  el("itTituloForm").textContent = "Editar item";
  el("btnNovoItem").classList.remove("hidden");
}
function limparFormItem() {
  el("iId").value = ""; el("iNome").value = ""; el("iCategoria").value = ""; el("iDescricao").value = "";
  el("itTituloForm").textContent = "Novo item / preparação";
  el("btnNovoItem").classList.add("hidden");
}
async function salvarItem() {
  const payload = {
    nome: el("iNome").value.trim(),
    categoria_id: el("iCategoria").value || null,
    descricao: el("iDescricao").value.trim() || null,
  };
  if (!payload.nome) return toast("Informe o nome do item.", true);
  const id = el("iId").value;
  const { error } = id
    ? await supabase.from("itens").update(payload).eq("id", id)
    : await supabase.from("itens").insert(payload);
  if (error) return toast(error.message.includes("duplicate") ? "Já existe um item com esse nome." : error.message, true);
  toast("Item salvo");
  limparFormItem();
  await carregarItens(); renderItens();
}
async function excluirItem(id) {
  if (!confirm("Excluir este item do catálogo?")) return;
  const { error } = await supabase.from("itens").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Item excluído");
  await carregarItens(); renderItens();
}

// ===========================================================================
// util
// ===========================================================================
function esc(s) { return escHtml(s); }
function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer;
function toast(msg, err = false) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "show" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2800);
}
