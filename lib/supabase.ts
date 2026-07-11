// Cliente Supabase (lazy). Sem as envs configuradas, tudo que depende do banco vira
// no-op silencioso — o app continua funcionando 100% com localStorage (modo protótipo).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: SupabaseClient | null = null;

/** Retorna o cliente Supabase, ou null se as envs não estiverem configuradas. */
export function supabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (!client) client = createClient(url, anon);
  return client;
}

export const supabaseConfigurado = Boolean(url && anon);
