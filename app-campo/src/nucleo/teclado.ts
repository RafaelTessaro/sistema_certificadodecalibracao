// O teclado do app (7 8 9 ⌫ / 4 5 6 / 1 2 3 / ± 0 , Próxima), como um redutor puro: a leitura fica EXATAMENTE como foi
// digitada ("100,0" continua "100,0"; nada é completado com zeros), com a vírgula decimal, o sinal na frente e o ⌫. A
// tecla "Repetir" (a leitura anterior da mesma carga) existe só na repetibilidade e na excentricidade, uma leitura por
// toque, e marca a leitura com `via: 'repetir'`. Um teclado físico também serve: o ponto vira vírgula. Também o que está
// digitado e ainda não foi gravado (a tela grava ao sair, como "Próxima" gravaria). Puro.

import { REGEX_LEITURA } from '../../../shared/campo/registro.ts'
import type { Instante, RegistroCampo, ViaLeitura } from '../../../shared/campo/tipos.ts'
import type { TipoLeituraCampo } from '../../../shared/campo/avisos.ts'
import { confirmarLeitura, editar, lerLeitura, podeEditar } from './folha.ts'
import type { FolhaLocal } from './folha.ts'

export interface EstadoTeclado {
  /** O texto como está na tela ("100,0", "-0,", ""). */
  texto: string
  via: ViaLeitura
}

export type Tecla = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | '±' | '⌫' | 'limpar'

/** Os limites do formato do registro (REGEX_LEITURA): até 12 algarismos inteiros e 9 casas. */
const MAX_INTEIROS = 12
const MAX_CASAS = 9

export const tecladoVazio = (): EstadoTeclado => ({ texto: '', via: 'teclado' })

/** O teclado com uma leitura que já estava gravada (para corrigir). */
export const tecladoCom = (texto: string, via: ViaLeitura = 'teclado'): EstadoTeclado => ({ texto, via })

/**
 * O teclado ao abrir uma leitura (o foco foi para ela): a leitura gravada como está, com a marca de repetida se foi feita
 * com "Repetir" (só passar por ela não a regrava como digitada), ou vazio.
 */
export function tecladoDaLeitura(registro: RegistroCampo, campo: string | null): EstadoTeclado {
  const l = campo ? lerLeitura(registro, campo) : null
  return tecladoCom(l?.valor ?? '', l?.via ?? 'teclado')
}

/** Uma tecla. Teclas que não cabem (segunda vírgula, algarismo além do limite) são ignoradas. */
export function teclar(e: EstadoTeclado, tecla: Tecla | string): EstadoTeclado {
  const t = tecla === '.' ? ',' : tecla === '-' ? '±' : tecla === 'Backspace' ? '⌫' : tecla
  const negativo = e.texto.startsWith('-')
  const corpo = negativo ? e.texto.slice(1) : e.texto
  const comSinal = (c: string) => ({ texto: (negativo ? '-' : '') + c, via: 'teclado' as const })
  if (t === 'limpar') return tecladoVazio()
  if (t === '⌫') {
    if (!e.texto) return e
    return { texto: e.texto.slice(0, -1), via: 'teclado' }
  }
  if (t === '±') return { texto: negativo ? corpo : `-${corpo}`, via: 'teclado' }
  if (t === ',') {
    if (corpo.includes(',')) return e
    return comSinal(corpo ? `${corpo},` : '0,')
  }
  if (/^\d$/.test(t)) {
    const [inteiros, casas] = corpo.split(',')
    if (casas !== undefined) return casas.length >= MAX_CASAS ? e : comSinal(`${corpo}${t}`)
    // Um "0" sozinho vira o algarismo (como numa calculadora): "05" nunca aparece
    if (inteiros === '0') return comSinal(t)
    return inteiros.length >= MAX_INTEIROS ? e : comSinal(`${corpo}${t}`)
  }
  return e
}

/** "Repetir": a leitura anterior da mesma série, inteira, marcada como repetida (só onde a regra deixa). */
export function repetir(valor: string): EstadoTeclado {
  return { texto: valor, via: 'repetir' }
}

/** A tecla "Repetir" existe só na repetibilidade e na excentricidade (nunca no erro de indicação, PLANO §1.11). */
export const podeRepetir = (tipo: TipoLeituraCampo | null | undefined) =>
  tipo === 'REPETIBILIDADE' || tipo === 'EXCENTRICIDADE' || tipo === 'ZERO_EXCENTRICIDADE'

/**
 * O texto que vai para o registro ao confirmar ("Próxima"): o digitado, só sem a vírgula pendurada ("12," → "12") e sem
 * o sinal sozinho ("-" → vazio). '' = nada digitado. null = não é uma leitura (não confirma).
 */
export function textoParaConfirmar(e: EstadoTeclado): string | null {
  let t = e.texto
  if (t.endsWith(',')) t = t.slice(0, -1)
  if (t === '-' || t === '') return ''
  return REGEX_LEITURA.test(t) ? t : null
}

/** Para o leitor de tela: o nome de cada tecla. */
export const NOME_DA_TECLA: Record<Tecla, string> = {
  '0': 'zero',
  '1': 'um',
  '2': 'dois',
  '3': 'três',
  '4': 'quatro',
  '5': 'cinco',
  '6': 'seis',
  '7': 'sete',
  '8': 'oito',
  '9': 'nove',
  ',': 'vírgula',
  '±': 'mais ou menos',
  '⌫': 'apagar',
  limpar: 'limpar',
}

/**
 * O valor que "Repetir" insere no campo: a leitura anterior da mesma série (repetibilidade: a leitura de antes; na
 * excentricidade, a mesma linha da posição anterior). null = o campo não tem a tecla (erro de indicação, ambiente,
 * cargas); '' = a tecla existe mas está apagada (nada a repetir ainda).
 */
export function valorParaRepetir(registro: RegistroCampo, campo: string): string | null {
  const rep = /^repetibilidade\.([^.]+)\.leituras\.(\d+)$/.exec(campo)
  if (rep) {
    const leituras = registro.passos.repetibilidade.find((x) => x.id === rep[1])?.leituras ?? []
    return leituras[Number(rep[2]) - 1]?.valor ?? ''
  }
  const exc = /^excentricidade\.posicoes\.(\d+)\.(leitura|zeroAntes)$/.exec(campo)
  if (exc) return registro.passos.excentricidade.posicoes[Number(exc[1]) - 1]?.[exc[2] as 'leitura' | 'zeroAntes']?.valor ?? ''
  return null
}

/** O que está no teclado e ainda não foi gravado na leitura em foco. */
export interface LeituraPendente {
  campo: string
  texto: string
  via: ViaLeitura
}

/**
 * O que confirmar a leitura em foco gravaria: o texto a confirmar é outro que o gravado (ou a marca de repetida mudou).
 * null = nada a gravar (sem foco, igual ao gravado ou não é uma leitura).
 */
export function leituraPendente(registro: RegistroCampo, campo: string | null, e: EstadoTeclado): LeituraPendente | null {
  if (!campo) return null
  const texto = textoParaConfirmar(e)
  if (texto === null) return null
  const gravada = lerLeitura(registro, campo)
  const mudou = texto !== (gravada?.valor ?? '') || (!!texto && e.via !== (gravada?.via ?? 'teclado'))
  return mudou ? { campo, texto, via: e.via } : null
}

/**
 * Saiu da tela com uma leitura digitada e ainda não confirmada (◂ do cabeçalho, bolinhas, ⋯): grava como "Próxima"
 * gravaria. Só se a folha ainda pode ser mudada e está na mesma tentativa dos ensaios em que o teclado abriu
 * (`tentativas`): recomeçar os ensaios também tira a tela, e o digitado na tentativa de antes não entra na nova. Senão,
 * a folha como está (sem gravar nada e sem erro: a folha pode ter sido entregue ou trancada nesse meio-tempo).
 */
export function gravarLeituraPendente(f: FolhaLocal, p: LeituraPendente, tentativas: number, agora: Instante): FolhaLocal {
  if (!f.registro || !podeEditar(f) || f.registro.tentativas.length !== tentativas) return f
  return editar(f, (r) => confirmarLeitura(r, p.campo, p.texto, p.via, agora), agora)
}
