// Cliente Supabase compartilhado (carregado como módulo ES via CDN).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.SAELM_CONFIG || {};

const configurado =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("SEU-PROJETO") &&
  !cfg.SUPABASE_ANON_KEY.includes("SUA-CHAVE");

export const isConfigured = configurado;

export const supabase = configurado
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

// Formata "2026-06-29" -> { dia: "29", semana: "Segunda-feira", curto: "29/06" }
export function formatarData(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const semana = dt.toLocaleDateString("pt-BR", { weekday: "long" });
  return {
    dia: String(d).padStart(2, "0"),
    mes: String(m).padStart(2, "0"),
    curto: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
    semana: semana.charAt(0).toUpperCase() + semana.slice(1),
    semanaCurta: dt
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", ""),
  };
}
