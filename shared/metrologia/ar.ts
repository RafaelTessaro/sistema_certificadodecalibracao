// Densidade do ar e empuxo com a densidade do ar medida (EURAMET cg-18 v4.0, Anexo A e 7.1.2.2).
// Usado na classe I: o empuxo deixa de ser só estimado (5c/5d/5e) e passa a ser corrigido (7.1.2-4), com a
// incerteza pela 7.1.2-5a. Puro, sem dependências.

/** Densidade do ar de referência ρ0 e dos pesos de referência ρc, kg/m³ (OIML R 111; cg-18 7.1.2). */
export const RHO_0 = 1.2
export const RHO_C = 8000
/** Incerteza relativa da própria fórmula A1.1-1 (cg-18 A1.1). */
export const U_FORMULA_AR = 2.4e-4
/**
 * Incertezas padrão das medições no local (situação B, A3-1), para os instrumentos do POP 6.2 (termo-higrômetro
 * com resolução de 0,5 °C e 1 % UR; barômetro de 1 hPa, ou 5 hPa em campo → 5/√12 = 1,4 hPa). Pressão e UR têm
 * folga. A temperatura (0,5 K) é um pouco menor que 1 °C/√3 = 0,58 K da checagem intermediária do POP; o efeito é
 * desprezível (u(ρa)/ρa 2,87e-3 → 3,10e-3). Pressão: a absoluta do local (nunca a reduzida ao nível do mar).
 */
export const INCERTEZA_AR_MEDIDO = { pressaoHpa: 2, temperaturaK: 0.5, umidadePct: 5 } as const
/** ΔT do local quando não informado: laboratório fechado, com janelas, 17–27 °C (cg-18 A2.2). */
export const DELTA_T_LOCAL_PADRAO = 10
/** u(ρ) quando o jogo não tem densidade ou incerteza cadastrada (a maior da Tabela E1 para aço e ferro). */
export const U_DENSIDADE_DESCONHECIDA = 300
/**
 * Faixa física da densidade dos pesos, kg/m³: a Tabela B.7 da OIML R 111-1 e a Tabela E1 do cg-18 vão de 2 700
 * (alumínio) a 21 400 (platina). Fora dela, quase sempre a densidade foi digitada em g/cm³ (7,95 em vez de 7 950),
 * e o empuxo pela densidade do ar medida somaria ao valor de referência uma correção de mais de 1 %.
 */
export const DENSIDADE_PESOS_KG_M3 = { min: 2000, max: 22000 } as const
export const densidadePesosPlausivel = (rho: number): boolean =>
  rho >= DENSIDADE_PESOS_KG_M3.min && rho <= DENSIDADE_PESOS_KG_M3.max
/** cg-18 Tabela E1: densidade e incerteza padrão (k = 1) por material, kg/m³ (para o cadastro do padrão). */
export const TABELA_E1 = [
  { material: 'Aço inoxidável', rho: 7950, u: 70 },
  { material: 'Latão / bronze', rho: 8400, u: 85 },
  { material: 'Alpaca (níquel-prata)', rho: 8600, u: 85 },
  { material: 'Aço carbono', rho: 7700, u: 100 },
  { material: 'Ferro', rho: 7800, u: 100 },
  { material: 'Ferro fundido branco', rho: 7700, u: 200 },
  { material: 'Ferro fundido cinzento', rho: 7100, u: 300 },
  { material: 'Alumínio', rho: 2700, u: 65 },
] as const

/**
 * A linha da Tabela E1 do cg-18 (densidade e incerteza padrão) para o material digitado, ou null. "Latão" e
 * "bronze" são a mesma linha; ferro fundido sem dizer qual fica com o cinzento (a maior incerteza).
 */
export function linhaTabelaE1(material: string): (typeof TABELA_E1)[number] | null {
  const m = material
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const linha = (nome: string) => TABELA_E1.find((x) => x.material === nome) ?? null
  if (/inox/.test(m)) return linha('Aço inoxidável')
  if (/latao|bronze/.test(m)) return linha('Latão / bronze')
  if (/alpaca|niquel/.test(m)) return linha('Alpaca (níquel-prata)')
  if (/aluminio/.test(m)) return linha('Alumínio')
  if (/ferro fundido/.test(m)) return linha(/branco/.test(m) ? 'Ferro fundido branco' : 'Ferro fundido cinzento')
  if (/aco carbono/.test(m)) return linha('Aço carbono')
  if (/^ferro$/.test(m.trim())) return linha('Ferro')
  return null
}

/** (A1.1-1) ρa = (0,348 48·p − 0,009·UR·e^(0,061·t)) / (273,15 + t); p em hPa, UR em %, t em °C → kg/m³. */
export function densidadeAr(temperaturaC: number, umidadePct: number, pressaoHpa: number): number {
  return (0.34848 * pressaoHpa - 0.009 * umidadePct * Math.exp(0.061 * temperaturaC)) / (273.15 + temperaturaC)
}

/** Faixa de validade da A1.1-1: 600–1 100 hPa, 20–80 % UR, 15–27 °C (inclusive). */
export function densidadeArValida(temperaturaC: number, umidadePct: number, pressaoHpa: number): boolean {
  return (
    pressaoHpa >= 600 && pressaoHpa <= 1100 && umidadePct >= 20 && umidadePct <= 80 && temperaturaC >= 15 && temperaturaC <= 27
  )
}

/**
 * (A3-1) u(ρa)/ρa = √[(1e-5·u(p)[Pa])² + (4e-3·u(t))² + (9e-3·u(UR)[fração])² + U_FORMULA_AR²].
 * Entradas: u(p) em hPa (×100 → Pa), u(t) em K, u(UR) em % (÷100 → fração).
 */
export function incertezaRelativaDensidadeAr(uPressaoHpa: number, uTemperaturaK: number, uUmidadePct: number): number {
  return Math.sqrt(
    (1e-5 * uPressaoHpa * 100) ** 2 + (4e-3 * uTemperaturaK) ** 2 + (9e-3 * (uUmidadePct / 100)) ** 2 + U_FORMULA_AR ** 2,
  )
}

/** (A3-2) u(ρa)/ρa = √(1,07e-4 + 1,33e-6·ΔT²), ΔT = variação de temperatura do local (K). */
export function incertezaRelativaDensidadeArLocal(deltaTLocalK: number): number {
  return Math.sqrt(1.07e-4 + 1.33e-6 * deltaTLocalK ** 2)
}

/** (7.1.2-4) δm_B/m_N = −(ρa − ρ0)(1/ρ − 1/ρc). */
export function correcaoEmpuxoRelativa(rhoAr: number, rhoPeso: number): number {
  return -(rhoAr - RHO_0) * (1 / rhoPeso - 1 / RHO_C)
}

/** (7.1.2-5a) u_rel(δm_B) = √[u²(ρa)(1/ρ − 1/ρc)² + (ρa − ρ0)²·u²(ρ)/ρ⁴]. */
export function incertezaRelativaEmpuxoMedido(rhoAr: number, uRhoAr: number, rhoPeso: number, uRhoPeso: number): number {
  return Math.sqrt(uRhoAr ** 2 * (1 / rhoPeso - 1 / RHO_C) ** 2 + ((rhoAr - RHO_0) ** 2 * uRhoPeso ** 2) / rhoPeso ** 4)
}
