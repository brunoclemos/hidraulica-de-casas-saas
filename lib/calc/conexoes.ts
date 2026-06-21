// AUTOGERADO da planilha "02. [DIMENSIONAMENTO] PVC, CPVC, BOMBAS E PRESSURIZAÇÃO.xlsm"
// (aba oculta "Dados e Planilhas": PVC B62:Q72, CPVC B94:AH104).
// Comprimento equivalente (m) por conexão x diâmetro comercial. Valores REAIS da planilha
// do curso — NÃO editar à mão; regerar pelo script se a planilha mudar.
// PVC: 16 conexões · CPVC: 32 conexões.

import type { Material } from "./pvc-cpvc-pressao";

export interface ConexaoDef {
  id: string;
  nome: string;
  valores: Record<number, number>; // comp. equivalente (m) por diâmetro comercial (mm)
}

export const CONEXOES_PVC: ConexaoDef[] = [
  { id: "joelho90", nome: "Joelho 90°", valores: { 20: 1.1, 25: 1.2, 32: 1.5, 40: 2.0, 50: 3.2, 60: 3.4, 75: 3.7, 85: 3.9, 110: 4.3 } },
  { id: "joelho_45", nome: "Joelho 45", valores: { 20: 0.4, 25: 0.5, 32: 0.7, 40: 1.0, 50: 1.0, 60: 1.3, 75: 1.7, 85: 1.8, 110: 1.9 } },
  { id: "curva90", nome: "Curva 90°", valores: { 20: 0.4, 25: 0.5, 32: 0.6, 40: 0.7, 50: 1.2, 60: 1.3, 75: 1.4, 85: 1.5, 110: 1.6 } },
  { id: "curva_45", nome: "Curva 45°", valores: { 20: 0.2, 25: 0.3, 32: 0.4, 40: 0.5, 50: 0.6, 60: 0.7, 75: 0.8, 85: 0.9, 110: 1.0 } },
  { id: "te_direta", nome: "Tê passagem direta", valores: { 20: 0.7, 25: 0.8, 32: 0.9, 40: 1.5, 50: 2.2, 60: 2.3, 75: 2.4, 85: 2.5, 110: 2.6 } },
  { id: "te_lateral", nome: "Tê passagem lateral", valores: { 20: 2.3, 25: 2.4, 32: 3.1, 40: 4.6, 50: 7.3, 60: 7.6, 75: 7.8, 85: 8.0, 110: 8.3 } },
  { id: "te_saida_bilateral", nome: "Tê saída bilateral", valores: { 20: 2.3, 25: 2.4, 32: 3.1, 40: 4.6, 50: 7.3, 60: 7.6, 75: 7.8, 85: 8.0, 110: 8.3 } },
  { id: "luva", nome: "Entrada normal", valores: { 20: 0.3, 25: 0.4, 32: 0.5, 40: 0.6, 50: 1.0, 60: 1.5, 75: 1.6, 85: 2.0, 110: 2.2 } },
  { id: "entrada_de_borda", nome: "Entrada de borda", valores: { 20: 0.9, 25: 1.0, 32: 1.2, 40: 1.8, 50: 2.3, 60: 2.8, 75: 3.3, 85: 3.7, 110: 4.0 } },
  { id: "saida_de_canalizacao", nome: "Saída de canalização", valores: { 20: 0.8, 25: 0.9, 32: 1.3, 40: 1.4, 50: 3.2, 60: 3.3, 75: 3.5, 85: 3.7, 110: 3.9 } },
  { id: "valvula_de_pe_e_crivo", nome: "Válvula de pé e crivo", valores: { 20: 8.1, 25: 9.5, 32: 13.3, 40: 15.5, 50: 18.3, 60: 23.7, 75: 25.0, 85: 26.8, 110: 28.6 } },
  { id: "valv_retencao", nome: "Válvula de retenção tipo leve", valores: { 20: 2.5, 25: 2.7, 32: 3.8, 40: 4.9, 50: 6.8, 60: 7.1, 75: 8.2, 85: 9.3, 110: 10.4 } },
  { id: "valvula_de_retencao_tipo_pesado", nome: "Válvula de retenção tipo pesado", valores: { 20: 3.6, 25: 4.1, 32: 5.8, 40: 7.4, 50: 9.1, 60: 10.8, 75: 12.5, 85: 14.2, 110: 16.0 } },
  { id: "registro_de_globo_aberto", nome: "Registro de globo aberto", valores: { 20: 11.1, 25: 11.4, 32: 15.0, 40: 22.0, 50: 35.8, 60: 37.9, 75: 38.0, 85: 40.0, 110: 42.3 } },
  { id: "reg_gaveta", nome: "Registro de gaveta aberto", valores: { 20: 0.1, 25: 0.2, 32: 0.3, 40: 0.4, 50: 0.7, 60: 0.8, 75: 0.9, 85: 0.9, 110: 1.0 } },
  { id: "registro_de_angulo_aberto", nome: "Registro de ângulo aberto", valores: { 20: 5.9, 25: 6.1, 32: 8.4, 40: 10.5, 50: 17.0, 60: 18.5, 75: 19.0, 85: 20.0, 110: 22.1 } },
];

export const CONEXOES_CPVC: ConexaoDef[] = [
  { id: "adaptador_de_transicao", nome: "Adaptador de Transição", valores: { 15: 0.176, 22: 0.303, 28: 0.41, 35: 0.528, 42: 0.657, 54: 0.911, 73: 1.331, 89: 1.686, 114: 2.281 } },
  { id: "bucha_de_reducao_ate_2_dn", nome: "Bucha de Redução até 2 DN", valores: { 15: 0.242, 22: 0.416, 28: 0.563, 35: 0.726, 42: 0.904, 54: 1.253, 73: 1.83, 89: 2.318, 114: 3.137 } },
  { id: "bucha_de_reducao_acima_de_2_dn", nome: "Bucha de Redução acima de 2 DN", valores: { 15: 0.374, 22: 0.643, 28: 0.871, 35: 1.122, 42: 1.397, 54: 1.936, 73: 2.829, 89: 3.582, 114: 4.848 } },
  { id: "curva90", nome: "Curva 90°", valores: { 15: 0.396, 22: 0.681, 28: 0.922, 35: 1.188, 42: 1.479, 54: 2.05, 73: 2.995, 89: 3.793, 114: 5.133 } },
  { id: "joelho90", nome: "Joelho 90°", valores: { 15: 0.88, 22: 1.513, 28: 2.049, 35: 2.639, 42: 3.287, 54: 4.555, 73: 6.656, 89: 8.429, 114: 11.406 } },
  { id: "joelho_45", nome: "Joelho 45°", valores: { 15: 0.264, 22: 0.454, 28: 0.615, 35: 0.792, 42: 0.986, 54: 1.367, 73: 1.997, 89: 2.529, 114: 3.422 } },
  { id: "joelho_90_c_latao", nome: "Joelho 90° c/  latão", valores: { 15: 0.968, 22: 1.664, 28: 2.254, 35: 2.903, 42: 3.615, 54: 5.011, 73: 7.321, 89: 9.272, 114: 12.547 } },
  { id: "joelho_90_c_reducao_e_latao", nome: "Joelho 90° c/  redução e latão", valores: { 15: 1.54, 22: 2.647, 28: 3.585, 35: 4.618, 42: 5.752, 54: 7.971, 73: 11.647, 89: 14.751, 114: 19.961 } },
  { id: "luva", nome: "Luva Simples", valores: { 15: 0.11, 22: 0.189, 28: 0.256, 35: 0.33, 42: 0.411, 54: 0.569, 73: 0.832, 89: 1.054, 114: 1.426 } },
  { id: "luva_de_correr", nome: "Luva de Correr", valores: { 15: 0.132, 22: 0.227, 28: 0.307, 35: 0.396, 42: 0.493, 54: 0.683, 73: 0.998, 89: 1.264, 114: 1.711 } },
  { id: "luva_de_reducao", nome: "Luva de Redução", valores: { 15: 0.374, 22: 0.643, 28: 0.871, 35: 1.122, 42: 1.397, 54: 1.936, 73: 2.829, 89: 3.582, 114: 4.848 } },
  { id: "misturador", nome: "Misturador", valores: { 15: 0.88, 22: 1.513, 28: 2.049, 35: 2.639, 42: 3.287, 54: 4.555, 73: 6.656, 89: 8.429, 114: 11.406 } },
  { id: "te_direta", nome: "Tê passagem direta e saída lateral", valores: { 15: 0.792, 22: 1.361, 28: 1.844, 35: 2.375, 42: 2.958, 54: 4.1, 73: 5.99, 89: 7.586, 114: 10.265 } },
  { id: "te_mesma_direcao_e_acrescimo", nome: "Tê mesma direção e acréscimo", valores: { 15: 0.572, 22: 0.983, 28: 1.332, 35: 1.715, 42: 2.136, 54: 2.961, 73: 4.326, 89: 5.479, 114: 7.414 } },
  { id: "te_lateral", nome: "Tê saída bilateral", valores: { 15: 0.968, 22: 1.664, 28: 2.254, 35: 2.903, 42: 3.615, 54: 5.011, 73: 7.321, 89: 9.272, 114: 12.547 } },
  { id: "te_chegada_contraria", nome: "Tê chegada contrária", valores: { 15: 1.848, 22: 3.177, 28: 4.302, 35: 5.542, 42: 6.902, 54: 9.566, 73: 13.977, 89: 17.701, 114: 23.953 } },
  { id: "te_saida_bilateral_de_reducao_central", nome: "Tê saída bilateral de Redução central", valores: { 15: 2.2, 22: 3.782, 28: 5.122, 35: 6.598, 42: 8.217, 54: 11.388, 73: 16.639, 89: 21.073, 114: 28.515 } },
  { id: "te_chegada_contraria_de_reducao_central", nome: "Tê chegada contrária de Redução central", valores: { 15: 3.961, 22: 6.807, 28: 9.219, 35: 11.876, 42: 14.791, 54: 20.498, 73: 29.951, 89: 37.931, 114: 51.327 } },
  { id: "te_passagem_direta_e_saida_lateral_de_reducao_central", nome: "Tê passagem direta e saída lateral de Redução central", valores: { 15: 1.584, 22: 2.723, 28: 3.688, 35: 4.75, 42: 5.916, 54: 8.199, 73: 11.98, 89: 15.172, 114: 20.531 } },
  { id: "te_mesma_direcao_e_acrescimo_de_reducao_central", nome: "Tê mesma direção e acréscimo de Redução central", valores: { 15: 1.144, 22: 1.967, 28: 2.663, 35: 3.431, 42: 4.273, 54: 5.922, 73: 8.652, 89: 10.958, 114: 14.828 } },
  { id: "te_de_latao", nome: "Tê de latão", valores: { 15: 0.352, 22: 0.605, 28: 0.819, 35: 1.056, 42: 1.315, 54: 1.822, 73: 2.662, 89: 3.372, 114: 4.562 } },
  { id: "luva_de_transposicao", nome: "Luva de Transposição", valores: { 15: 0.528, 22: 0.908, 28: 1.229, 35: 1.583, 42: 1.972, 54: 2.733, 73: 3.993, 89: 5.057, 114: 6.844 } },
  { id: "uniao", nome: "União", valores: { 15: 0.132, 22: 0.227, 28: 0.307, 35: 0.396, 42: 0.493, 54: 0.683, 73: 0.998, 89: 1.264, 114: 1.711 } },
  { id: "entrada_normal", nome: "Entrada normal", valores: { 15: 0.3, 22: 0.4, 28: 0.5, 35: 0.6, 42: 1.0, 54: 1.5, 73: 1.6, 89: 2.0, 114: 2.2 } },
  { id: "entrada_de_borda", nome: "Entrada de borda", valores: { 15: 0.9, 22: 1.0, 28: 1.2, 35: 1.8, 42: 2.3, 54: 2.8, 73: 3.3, 89: 3.7, 114: 4.0 } },
  { id: "saida_de_canalizacao", nome: "Saída de canalização", valores: { 15: 0.8, 22: 0.9, 28: 1.3, 35: 1.4, 42: 3.2, 54: 3.3, 73: 3.5, 89: 3.7, 114: 3.9 } },
  { id: "valvula_de_pe_e_crivo", nome: "Válvula de pé e crivo", valores: { 15: 8.1, 22: 9.5, 28: 13.3, 35: 15.5, 42: 18.3, 54: 23.7, 73: 25.0, 89: 26.8, 114: 28.6 } },
  { id: "valv_retencao", nome: "Válvula de retenção tipo leve", valores: { 15: 2.5, 22: 2.7, 28: 3.8, 35: 4.9, 42: 6.8, 54: 7.1, 73: 8.2, 89: 9.3, 114: 10.4 } },
  { id: "valvula_de_retencao_tipo_pesado", nome: "Válvula de retenção tipo pesado", valores: { 15: 3.6, 22: 4.1, 28: 5.8, 35: 7.4, 42: 9.1, 54: 10.8, 73: 12.5, 89: 14.2, 114: 16.0 } },
  { id: "registro_de_globo_aberto", nome: "Registro de globo aberto", valores: { 15: 11.1, 22: 11.4, 28: 15.0, 35: 22.0, 42: 35.8, 54: 37.9, 73: 38.0, 89: 40.0, 114: 42.3 } },
  { id: "reg_gaveta", nome: "Registro de gaveta aberto", valores: { 15: 0.1, 22: 0.2, 28: 0.3, 35: 0.4, 42: 0.7, 54: 0.8, 73: 0.9, 89: 0.9, 114: 1.0 } },
  { id: "registro_de_angulo_aberto", nome: "Registro de ângulo aberto", valores: { 15: 5.9, 22: 6.1, 28: 8.4, 35: 10.5, 42: 17.0, 54: 18.5, 73: 19.0, 89: 20.0, 114: 22.1 } },
];

export function conexoesDe(material: Material): ConexaoDef[] {
  return material === "PVC" ? CONEXOES_PVC : CONEXOES_CPVC;
}
