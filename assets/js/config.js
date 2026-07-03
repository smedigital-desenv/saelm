// =============================================================================
// Configuração do Supabase
// -----------------------------------------------------------------------------
// 1. Crie um projeto em https://supabase.com
// 2. Vá em  Project Settings > API
// 3. Copie a "Project URL" e a chave "anon public" e cole abaixo.
//
// A chave "anon" é PÚBLICA por natureza (fica visível no navegador). A segurança
// vem das políticas de RLS definidas no 01_schema.sql: qualquer um pode LER,
// mas só usuários autenticados (login na tela Gerenciar) podem GRAVAR.
// NUNCA coloque aqui a chave "service_role".
// =============================================================================
window.SAELM_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA-CHAVE-ANON-PUBLICA",

  // Mês/ano exibido no cabeçalho da apresentação
  MES_REFERENCIA: "Junho / Julho 2026",
};
