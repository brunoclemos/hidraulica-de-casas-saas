// Conexões favoritas (áudio do cliente 22/jul): as marcadas com estrela sobem pro
// topo dos grids de conexões. Preferência do usuário no aparelho (localStorage),
// não faz parte do projeto salvo.
const KEY = "hdc:conexoes-favoritas";

export function lerFavoritas(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    // valor corrompido no storage: recomeça sem favoritas (preferência, não dado crítico)
    return new Set();
  }
}

export function alternarFavorita(chave: string): Set<string> {
  const fav = lerFavoritas();
  if (fav.has(chave)) fav.delete(chave);
  else fav.add(chave);
  localStorage.setItem(KEY, JSON.stringify(Array.from(fav)));
  return fav;
}
