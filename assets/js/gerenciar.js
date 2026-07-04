// =============================================================================
// SAELM - Painel de gerenciamento (admin)
// =============================================================================
import { supabase, isConfigured } from "./supabaseClient.js";

const el = (id) => document.getElementById(id);

const state = {
  cardapios: [],
  escolas: [],
  categorias: [],
  itens: [],           // catálogo
  tipos: [],           // tipos de refeição
  diaRefeicoes: [],    // refeições do cardápio+dia selecionado
};

// ---------------------------------------------------------------------------
boot();

async function boot() {
  if (!isConfigured) {
    document.body.innerHTML =
      `<div class="login-wrap"><div class="card-box"><div class="logo-big">⚙️</div>
      <h3>Configuração necessária</h3><p class="muted">Preencha <code>assets/js/config.js</code> com a URL e a chave anon do Supabase.</p></div></div>`;
    return;
  }

  // Sem controle de acesso por enquanto: abre o painel direto.
  el("loginView").classList.add("hidden");
  el("appView").classList.remove("hidden");

  bindTabs();
  bindRefeicoes();
  bindCardapios();
  bindEscolas();
  bindItens();

  await carregarTudo();
}

// ---------------------------------------------------------------------------
async function carregarTudo() {
  await Promise.all([
    carregarCardapios(),
    carregarEscolas(),
    carregarCategorias(),
    carregarItens(),
    carregarTipos(),
  ]);
  preencherSelectsRefeicoes();
  renderCardapios();
  renderEscolas();
  renderItens();
  // seleciona primeiro cardápio + primeiro dia com dados
  if (state.cardapios.length && !el("rData").value) {
    el("rData").value = "2026-06-29";
    await carregarDia();
  }
}

async function carregarCardapios() {
  const { data } = await supabase.from("cardapios").select("*").order("ordem");
  state.cardapios = data || [];
}
async function carregarEscolas() {
  const { data } = await supabase
    .from("escolas")
    .select("*, escola_cardapio(cardapio_id)")
    .order("nome");
  state.escolas = data || [];
}
async function carregarCategorias() {
  const { data } = await supabase.from("categorias_item").select("*").order("nome");
  state.categorias = data || [];
}
async function carregarItens() {
  const { data } = await supabase
    .from("itens")
    .select("*, categorias_item(nome, cor)")
    .order("nome");
  state.itens = data || [];
}
async function carregarTipos() {
  const { data } = await supabase.from("tipos_refeicao").select("*").order("ordem");
  state.tipos = data || [];
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
// PAINEL: REFEIÇÕES POR DIA
// ===========================================================================
function bindRefeicoes() {
  el("rCardapio").addEventListener("change", carregarDia);
  el("rData").addEventListener("change", carregarDia);
  el("btnCopiarDia").addEventListener("click", copiarDeOutroDia);
}

function preencherSelectsRefeicoes() {
  el("rCardapio").innerHTML = state.cardapios
    .map((c) => `<option value="${c.id}">Cardápio ${c.numero} — ${esc(c.titulo)}</option>`)
    .join("");
}

function cardapioSel() { return el("rCardapio").value; }
function dataSel() { return el("rData").value; }

async function carregarDia() {
  const cardapio_id = cardapioSel();
  const data = dataSel();
  if (!cardapio_id || !data) return;

  const { data: rows, error } = await supabase
    .from("refeicoes")
    .select("id, tipo_refeicao_id, observacao, facultativo, refeicao_itens(id, ordem, texto_livre, item_id, itens(nome))")
    .eq("cardapio_id", cardapio_id)
    .eq("data", data);
  if (error) return toast(error.message, true);
  state.diaRefeicoes = rows || [];
  renderEditorDia();
}

function refeicaoDoTipo(tipoId) {
  return state.diaRefeicoes.find((r) => r.tipo_refeicao_id === tipoId);
}

function renderEditorDia() {
  const cont = el("editorRefeicoes");
  cont.innerHTML = state.tipos.map((t) => {
    const r = refeicaoDoTipo(t.id);
    const itens = (r?.refeicao_itens || []).sort((a, b) => a.ordem - b.ordem);
    const chips = itens.map((ri) => {
      const nome = ri.itens?.nome || ri.texto_livre || "?";
      return `<span class="chip-item">${esc(nome)}<button title="Remover" data-rem="${ri.id}">×</button></span>`;
    }).join("");
    const fac = r?.facultativo ? "checked" : "";
    return `<div class="meal-edit" data-tipo="${t.id}">
      <div class="me-head" style="background:${t.cor}">
        <span>${esc(t.nome)}</span>
        <small style="opacity:.9">${esc(t.horario || "")}</small>
      </div>
      <div class="me-body">
        <div class="chips">${chips || '<span class="muted" style="font-size:.82rem">sem itens</span>'}</div>
        <div class="add-item-row">
          <input type="text" list="dlItens" placeholder="Adicionar item…" data-add="${t.id}" />
          <button class="btn small" data-addbtn="${t.id}">+</button>
        </div>
        <label class="fac-toggle"><input type="checkbox" data-fac="${t.id}" ${fac}/> Ponto facultativo / não oferecido</label>
      </div>
    </div>`;
  }).join("");

  // datalist do catálogo
  if (!el("dlItens")) {
    const dl = document.createElement("datalist");
    dl.id = "dlItens";
    document.body.appendChild(dl);
  }
  el("dlItens").innerHTML = state.itens.map((i) => `<option value="${esc(i.nome)}">`).join("");

  // eventos
  cont.querySelectorAll("[data-rem]").forEach((b) =>
    b.addEventListener("click", () => removerItem(b.dataset.rem)));
  cont.querySelectorAll("[data-addbtn]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = cont.querySelector(`[data-add="${b.dataset.addbtn}"]`);
      adicionarItem(b.dataset.addbtn, input.value);
      input.value = "";
    }));
  cont.querySelectorAll("[data-add]").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { adicionarItem(inp.dataset.add, inp.value); inp.value = ""; }
    }));
  cont.querySelectorAll("[data-fac]").forEach((chk) =>
    chk.addEventListener("change", () => toggleFacultativo(chk.dataset.fac, chk.checked)));
}

// garante que exista a refeição (cardapio+data+tipo) e devolve seu id
async function getOrCreateRefeicao(tipoId) {
  let r = refeicaoDoTipo(tipoId);
  if (r) return r.id;
  const { data, error } = await supabase
    .from("refeicoes")
    .insert({ cardapio_id: cardapioSel(), tipo_refeicao_id: tipoId, data: dataSel() })
    .select("id")
    .single();
  if (error) { toast(error.message, true); return null; }
  return data.id;
}

// garante item no catálogo (por nome) e devolve id
async function getOrCreateItem(nome) {
  nome = nome.trim();
  if (!nome) return null;
  const existente = state.itens.find((i) => i.nome.toLowerCase() === nome.toLowerCase());
  if (existente) return existente.id;
  const { data, error } = await supabase.from("itens").insert({ nome }).select("*, categorias_item(nome,cor)").single();
  if (error) { toast(error.message, true); return null; }
  state.itens.push(data);
  return data.id;
}

async function adicionarItem(tipoId, nome) {
  nome = (nome || "").trim();
  if (!nome) return;
  const refId = await getOrCreateRefeicao(tipoId);
  if (!refId) return;
  const itemId = await getOrCreateItem(nome);
  if (!itemId) return;
  const r = refeicaoDoTipo(tipoId);
  const ordem = ((r?.refeicao_itens || []).reduce((m, x) => Math.max(m, x.ordem), -1)) + 1;
  const { error } = await supabase.from("refeicao_itens").insert({ refeicao_id: refId, item_id: itemId, ordem });
  if (error) return toast(error.message, true);
  toast("Item adicionado");
  await carregarDia();
}

async function removerItem(riId) {
  const { error } = await supabase.from("refeicao_itens").delete().eq("id", riId);
  if (error) return toast(error.message, true);
  await carregarDia();
}

async function toggleFacultativo(tipoId, valor) {
  const refId = await getOrCreateRefeicao(tipoId);
  if (!refId) return;
  const { error } = await supabase
    .from("refeicoes")
    .update({ facultativo: valor, observacao: valor ? "Ponto facultativo" : null })
    .eq("id", refId);
  if (error) return toast(error.message, true);
  toast(valor ? "Marcado como facultativo" : "Desmarcado");
  await carregarDia();
}

async function copiarDeOutroDia() {
  const origem = prompt("Copiar refeições de qual data? (AAAA-MM-DD)", "2026-06-29");
  if (!origem) return;
  const cardapio_id = cardapioSel();
  const { data: rows } = await supabase
    .from("refeicoes")
    .select("tipo_refeicao_id, observacao, facultativo, refeicao_itens(item_id, texto_livre, ordem)")
    .eq("cardapio_id", cardapio_id)
    .eq("data", origem);
  if (!rows || !rows.length) return toast("Nada encontrado na data de origem.", true);

  for (const r of rows) {
    const { data: nova, error } = await supabase
      .from("refeicoes")
      .upsert(
        { cardapio_id, tipo_refeicao_id: r.tipo_refeicao_id, data: dataSel(), observacao: r.observacao, facultativo: r.facultativo },
        { onConflict: "cardapio_id,data,tipo_refeicao_id" }
      )
      .select("id").single();
    if (error) { toast(error.message, true); continue; }
    await supabase.from("refeicao_itens").delete().eq("refeicao_id", nova.id);
    const itens = (r.refeicao_itens || []).map((x) => ({
      refeicao_id: nova.id, item_id: x.item_id, texto_livre: x.texto_livre, ordem: x.ordem,
    }));
    if (itens.length) await supabase.from("refeicao_itens").insert(itens);
  }
  toast("Dia copiado com sucesso");
  await carregarDia();
}

// ===========================================================================
// PAINEL: CARDÁPIOS
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
  el("cId").value = c.id;
  el("cNumero").value = c.numero || "";
  el("cTitulo").value = c.titulo || "";
  el("cPublico").value = c.publico_alvo || "";
  el("cPercentual").value = c.percentual || "";
  el("cOrdem").value = c.ordem ?? 0;
  el("cObs").value = c.observacoes || "";
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
    numero: el("cNumero").value.trim(),
    titulo: el("cTitulo").value.trim(),
    publico_alvo: el("cPublico").value.trim() || null,
    percentual: el("cPercentual").value.trim() || null,
    ordem: parseInt(el("cOrdem").value) || 0,
    observacoes: el("cObs").value.trim() || null,
  };
  if (!payload.numero || !payload.titulo) return toast("Preencha número e título.", true);
  const id = el("cId").value;
  const q = id
    ? supabase.from("cardapios").update(payload).eq("id", id)
    : supabase.from("cardapios").insert(payload);
  const { error } = await q;
  if (error) return toast(error.message, true);
  toast("Cardápio salvo");
  limparFormCardapio();
  await carregarCardapios();
  preencherSelectsRefeicoes();
  renderCardapios();
  renderEscolas();
}
async function excluirCardapio(id) {
  if (!confirm("Excluir este cardápio e TODAS as suas refeições?")) return;
  const { error } = await supabase.from("cardapios").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Cardápio excluído");
  await carregarCardapios();
  preencherSelectsRefeicoes();
  renderCardapios();
}

// ===========================================================================
// PAINEL: ESCOLAS
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
  const q = ligar
    ? supabase.from("escola_cardapio").insert({ escola_id, cardapio_id })
    : supabase.from("escola_cardapio").delete().match({ escola_id, cardapio_id });
  const { error } = await q;
  if (error) return toast(error.message, true);
  await carregarEscolas();
  renderEscolas();
}

function editarEscola(id) {
  const e = state.escolas.find((x) => x.id === id);
  if (!e) return;
  el("eId").value = e.id;
  el("eNome").value = e.nome || "";
  el("eTipo").value = e.tipo || "";
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
  const q = id
    ? supabase.from("escolas").update(payload).eq("id", id).select("id").single()
    : supabase.from("escolas").insert(payload).select("id").single();
  const { data, error } = await q;
  if (error) return toast(error.message, true);
  toast("Escola salva");
  await carregarEscolas();
  if (!id && data) el("eId").value = data.id;   // permite vincular logo após criar
  editarEscola(el("eId").value);
  renderEscolas();
}
async function excluirEscola(id) {
  if (!confirm("Excluir esta escola?")) return;
  const { error } = await supabase.from("escolas").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Escola excluída");
  limparFormEscola();
  await carregarEscolas();
  renderEscolas();
}

// ===========================================================================
// PAINEL: ITENS (catálogo)
// ===========================================================================
function bindItens() {
  el("btnSalvarItem").addEventListener("click", salvarItem);
  el("btnNovoItem").addEventListener("click", limparFormItem);
  el("itBusca").addEventListener("input", renderItens);
  el("iFoto").addEventListener("input", () => setFotoPreview(el("iFoto").value.trim()));
  el("iFotoFile").addEventListener("change", enviarFoto);
}

function setFotoPreview(url) {
  const p = el("iFotoPreview");
  if (url) { p.style.backgroundImage = `url('${url}')`; p.textContent = ""; }
  else { p.style.backgroundImage = ""; p.textContent = "🍽️"; }
}

async function enviarFoto(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  toast("Enviando foto…");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const up = await supabase.storage.from("pratos").upload(path, file, { upsert: true, contentType: file.type });
  if (up.error) {
    toast("Falha no upload: " + up.error.message + " (rodou o 04_fotos.sql?)", true);
    return;
  }
  const { data } = supabase.storage.from("pratos").getPublicUrl(path);
  el("iFoto").value = data.publicUrl;
  setFotoPreview(data.publicUrl);
  toast("Foto enviada");
  e.target.value = "";
}

function renderItens() {
  const catAtual = el("iCategoria").value;  // preserva seleção do form
  el("iCategoria").innerHTML =
    `<option value="">— sem categoria —</option>` +
    state.categorias.map((c) => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join("");
  el("iCategoria").value = catAtual;
  const busca = (el("itBusca").value || "").toLowerCase();
  const lista = state.itens.filter((i) => i.nome.toLowerCase().includes(busca));
  el("itCount").textContent = state.itens.length;
  el("tbItens").innerHTML = lista.map((i) => `
    <tr>
      <td>${i.foto_url ? `<img class="thumb" src="${escHtml(i.foto_url)}" alt="" loading="lazy" />` : ""}</td>
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
  el("iId").value = i.id;
  el("iNome").value = i.nome || "";
  el("iCategoria").value = i.categoria_id || "";
  el("iDescricao").value = i.descricao || "";
  el("iFoto").value = i.foto_url || "";
  setFotoPreview(i.foto_url || "");
  el("itTituloForm").textContent = "Editar item";
  el("btnNovoItem").classList.remove("hidden");
}
function limparFormItem() {
  el("iId").value = ""; el("iNome").value = ""; el("iCategoria").value = ""; el("iDescricao").value = "";
  el("iFoto").value = ""; setFotoPreview("");
  el("itTituloForm").textContent = "Novo item / preparação";
  el("btnNovoItem").classList.add("hidden");
}
async function salvarItem() {
  const payload = {
    nome: el("iNome").value.trim(),
    categoria_id: el("iCategoria").value || null,
    descricao: el("iDescricao").value.trim() || null,
    foto_url: el("iFoto").value.trim() || null,
  };
  if (!payload.nome) return toast("Informe o nome do item.", true);
  const id = el("iId").value;
  const q = id
    ? supabase.from("itens").update(payload).eq("id", id)
    : supabase.from("itens").insert(payload);
  const { error } = await q;
  if (error) return toast(error.message.includes("duplicate") ? "Já existe um item com esse nome." : error.message, true);
  toast("Item salvo");
  limparFormItem();
  await carregarItens();
  renderItens();
}
async function excluirItem(id) {
  if (!confirm("Excluir este item do catálogo?")) return;
  const { error } = await supabase.from("itens").delete().eq("id", id);
  if (error) return toast(error.message, true);
  toast("Item excluído");
  await carregarItens();
  renderItens();
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
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}
