// =============================================================================
// Configuração do Supabase
// -----------------------------------------------------------------------------
// 1. Crie um projeto em https://supabase.com
// 2. Vá em  Project Settings > API
// 3. Copie a "Project URL" e a chave "anon public" e cole abaixo.
//
// A chave "anon" é PÚBLICA por natureza (fica visível no navegador). A segurança
// vem das políticas de RLS definidas no 01_schema.sql.
// NUNCA coloque aqui a chave "service_role".
// =============================================================================
window.SAELM_CONFIG = {
  SUPABASE_URL: "https://iqldovwttomkjkoakosc.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxbGRvdnd0dG9ta2prb2Frb3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDU4NzksImV4cCI6MjA5NjA4MTg3OX0.4dYeK5iIEgSD7CEWyLoaqXEXvuITVNVpTlfdmCyJCI0",

  // Schema onde o sistema vive (deve bater com os .sql e estar exposto na API).
  // No Supabase: Project Settings > API > "Exposed schemas" -> adicionar "nutricao".
  SUPABASE_SCHEMA: "nutricao",

  // Mês/ano exibido no cabeçalho da apresentação
  MES_REFERENCIA: "Junho / Julho 2026",
};
