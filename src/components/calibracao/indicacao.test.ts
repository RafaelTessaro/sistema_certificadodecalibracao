import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { CONFIG_PADRAO } from '#shared/dominio.ts'
import type { CalibracaoInput, EnsaioIndicacao, PontoIndicacao } from '#shared/tipos.ts'
import { exemploRodoviaria } from '../../../server/pdf/exemplosCertificado.ts'
import type { ContextoEtapa } from './contexto'
import { PainelDaAba } from './EtapaIndicacao'
import {
  type AbaIndicacao,
  ensaioEmOrdemDeCarga,
  leiturasDigitadas,
  leiturasEscondidasPelaTroca,
  comMetodoMedidoDaClasse,
  metodoNaEtapa,
  mudarEnsaioDaAba,
  noMetodoDaClasse,
  podeRefazerPontos,
  textoMetodoDaClasse,
  textoMetodoForaDoPop,
  semMetodoMedido,
  textoRefazerPontos,
  textoTrocarMetodo,
  textoVoltarMetodo,
  trocarParaMetodoDoPop,
  voltarParaMetodoMedido,
} from './indicacao'

// Sem DOM: a janela (portal no document.body) não é desenhada; fechada, ela não mostra nada
vi.mock('../ui/Modal', () => ({ Modal: () => null }))

/** Rodoviária com substituição, ajuste interno e o "como encontrado" igual ao ensaio final (mesmas leituras). */
function comAjuste(): { k: CalibracaoInput; d: ReturnType<typeof exemploRodoviaria> } {
  const d = exemploRodoviaria()
  const k: CalibracaoInput = {
    ...d.calibracao,
    ajuste: { ...d.calibracao.ajuste, realizado: 'INTERNO' },
    comoEncontrado: { ...structuredClone(d.calibracao.indicacao), retornoZero: null },
  }
  return { k, d }
}

describe('mudarEnsaioDaAba', () => {
  it('o retorno ao zero de cada aba vai para o ensaio dela (como na folha de campo, uma célula por coluna)', () => {
    const { k } = comAjuste()
    const antes = mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, retornoZero: 20 }))
    expect(antes.comoEncontrado?.retornoZero).toBe(20)
    expect(antes.indicacao.retornoZero).toBe(k.indicacao.retornoZero)
    const depois = mudarEnsaioDaAba(k, 'depois', (e) => ({ ...e, retornoZero: -20 }))
    expect(depois.indicacao.retornoZero).toBe(-20)
    expect(depois.comoEncontrado?.retornoZero).toBeNull()
  })

  it('cada aba tem o seu método de carregamento', () => {
    const { k } = comAjuste()
    const r = mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, metodo: 'CONTINUO' }))
    expect(r.comoEncontrado?.metodo).toBe('CONTINUO')
    expect(r.indicacao.metodo).toBe(k.indicacao.metodo)
  })

  it('sem o "como encontrado" (não houve ajuste), muda o ensaio final', () => {
    const { k } = comAjuste()
    const r = mudarEnsaioDaAba({ ...k, comoEncontrado: null }, 'antes', (e) => ({ ...e, retornoZero: 40 }))
    expect(r.indicacao.retornoZero).toBe(40)
    expect(r.comoEncontrado).toBeNull()
  })

  it('com substituição, o retorno ao zero "como encontrado" entra na incerteza desse ensaio', () => {
    const { k, d } = comAjuste()
    const { balanca, padroes } = d.emissao
    const maior = (x: CalibracaoInput) => {
      const r = calcularCalibracao(x, balanca, padroes).comoEncontrado!
      const p = r.pontos.reduce((a, b) => (b.carga > a.carga ? b : a))
      return p.crescente!
    }
    const sem = maior(k)
    const com = maior(mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, retornoZero: 20 })))
    expect(sem.uTempo).toBe(0)
    expect(com.uTempo).toBeGreaterThan(0)
    expect(com.U).toBeGreaterThan(sem.U)
  })
})

describe('etapa "Erro de indicação": retorno ao zero nas duas abas', () => {
  /** Desenha a aba (sem DOM): o campo do retorno ao zero mostra o valor do ensaio dela. */
  function desenhar(k: CalibracaoInput, aba: AbaIndicacao, d: ReturnType<typeof exemploRodoviaria>): string {
    const { balanca, padroes, cliente } = d.emissao
    const ctx: ContextoEtapa = {
      f: k,
      alterar: () => {},
      balanca,
      cliente,
      padroes,
      selecionados: padroes,
      calc: calcularCalibracao(k, balanca, padroes),
      config: CONFIG_PADRAO,
      equipe: [],
      status: 'RASCUNHO',
      editarBalanca: () => {},
      folhaCampo: null,
      vincularFolha: async () => false,
      novaFolha: () => {},
    }
    return renderToStaticMarkup(createElement(PainelDaAba, { ctx, aba }))
  }
  /** O <input> do retorno ao zero (pelo rótulo acessível) e o valor nele. */
  const campo = (html: string, rotulo: string) => {
    const tag = [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`aria-label="${rotulo}"`))
    return tag ? (/value="([^"]*)"/.exec(tag)?.[1] ?? '') : null
  }

  it('cada aba tem o campo, com o valor do ensaio dela ("como encontrado" e depois do ajuste)', () => {
    const { k, d } = comAjuste()
    k.indicacao.retornoZero = -20
    k.comoEncontrado!.retornoZero = 40
    const antes = desenhar(k, 'antes', d)
    expect(antes).toContain('Retorno ao zero antes do ajuste')
    expect(campo(antes, 'Indicação no retorno ao zero antes do ajuste')).toBe('40')
    expect(campo(antes, 'Indicação no retorno ao zero')).toBeNull()
    const depois = desenhar(k, 'depois', d)
    expect(campo(depois, 'Indicação no retorno ao zero')).toBe('-20')
    expect(campo(depois, 'Indicação no retorno ao zero antes do ajuste')).toBeNull()
    // Sem o "como encontrado", a aba mostra o ensaio final
    expect(campo(desenhar({ ...k, comoEncontrado: null }, 'antes', d), 'Indicação no retorno ao zero')).toBe('-20')
  })
})

// ---- "Refazer pontos" e a ordem dos pontos ---------------------------------------------------------------------

/** O ensaio do Prix (0/10/20/30 kg) com as leituras digitadas e o ponto de 5 kg acrescentado no fim. */
function ensaioDigitado(metodo: EnsaioIndicacao['metodo'] = 'CRESCENTE_DECRESCENTE'): EnsaioIndicacao {
  const ponto = (id: string, carga: number, crescente: number | null, decrescente: number | null = null): PontoIndicacao => ({
    id,
    carga,
    pecas: [],
    pecasManuais: false,
    crescente,
    decrescente,
    nivelSubstituicao: 0,
  })
  return {
    metodo,
    retornoZero: 0,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [
      ponto('z', 0, 0, 0),
      ponto('a', 10, 9.995, 9.995),
      ponto('b', 20, 19.99),
      ponto('c', 30, 29.99, 29.99),
      ponto('d', 5, 4.998),
    ],
  }
}

describe('"Refazer pontos" com leituras digitadas', () => {
  it('conta as leituras dos pontos com carga, nas colunas do método (o zero não conta)', () => {
    expect(leiturasDigitadas(ensaioDigitado())).toBe(6)
    // Crescente contínuo: a coluna ↓ escondida não conta (nem sai no certificado)
    expect(leiturasDigitadas(ensaioDigitado('CONTINUO'))).toBe(4)
    const sugeridos = {
      ...ensaioDigitado(),
      pontos: ensaioDigitado().pontos.map((p) => ({ ...p, crescente: p.carga ? null : 0 })),
    }
    expect(
      leiturasDigitadas({ ...sugeridos, pontos: sugeridos.pontos.map((p) => ({ ...p, decrescente: p.carga ? null : 0 })) }),
    ).toBe(0)
  })

  it('com leituras, só refaz depois da confirmação; sem leituras, direto (sem perguntar)', async () => {
    const pergunta = vi.fn(async () => false)
    expect(await podeRefazerPontos(ensaioDigitado(), pergunta)).toBe(false)
    expect(pergunta).toHaveBeenCalledWith(6)
    expect(await podeRefazerPontos(ensaioDigitado(), async () => true)).toBe(true)
    const semLeituras = {
      ...ensaioDigitado(),
      pontos: ensaioDigitado().pontos.map((p) => ({ ...p, crescente: null, decrescente: null })),
    }
    const nunca = vi.fn(async () => false)
    expect(await podeRefazerPontos(semLeituras, nunca)).toBe(true)
    expect(nunca).not.toHaveBeenCalled()
  })

  it('o texto da confirmação diz quantas leituras se perdem', () => {
    expect(textoRefazerPontos(7)).toBe('Refazer os pontos apaga as 7 leituras já digitadas. Continuar?')
    expect(textoRefazerPontos(1)).toBe('Refazer os pontos apaga a leitura já digitada. Continuar?')
  })
})

describe('ponto acrescentado no fim com carga menor', () => {
  it('ao sair do campo da carga, os pontos vão para a ordem crescente, com os mesmos ids e leituras', () => {
    const e = ensaioDigitado('CONTINUO')
    const ordenado = ensaioEmOrdemDeCarga(e)
    expect(ordenado.pontos.map((p) => p.id)).toEqual(['z', 'd', 'a', 'b', 'c'])
    expect(ordenado.pontos[1]).toEqual(e.pontos[4])
    // Já em ordem: o mesmo ensaio (nada a gravar)
    expect(ensaioEmOrdemDeCarga(ordenado)).toBe(ordenado)
    // O "Decrescente" (só num registro de antes) fica como está
    const decrescente = ensaioDigitado('DECRESCENTE')
    expect(ensaioEmOrdemDeCarga(decrescente)).toBe(decrescente)
  })
})

// ---- Método de carregamento fixo pela classe (POP 7.7) -------------------------------------------------------------

describe('método do erro de indicação fixo pela classe', () => {
  /** O ensaio sem leituras de carga: os pontos sugeridos, com o zero lido. */
  const sugerido = (metodo: EnsaioIndicacao['metodo']): EnsaioIndicacao => ({
    ...ensaioDigitado(metodo),
    pontos: ensaioDigitado().pontos.map((p) => ({ ...p, crescente: p.carga ? null : 0, decrescente: p.carga ? null : 0 })),
  })

  it('a linha do POP: "crescente e decrescente" nas classes II a IIII e sem classe; "crescente com descarga" na I', () => {
    expect(textoMetodoDaClasse('III')).toBe('Pelo POP (7.7), nesta classe: “Crescente e decrescente”.')
    expect(textoMetodoDaClasse('II')).toBe('Pelo POP (7.7), nesta classe: “Crescente e decrescente”.')
    expect(textoMetodoDaClasse('')).toBe('Pelo POP (7.7), nesta classe: “Crescente e decrescente”.')
    expect(textoMetodoDaClasse('I')).toBe('Pelo POP (7.7), nesta classe: “Crescente com descarga”.')
  })

  it('sem leituras de carga, a etapa mostra (e grava) o da classe; com leituras de outro método, ele fica, com o aviso', () => {
    expect(metodoNaEtapa(sugerido('CRESCENTE_DECRESCENTE'), 'III')).toEqual({
      metodo: 'CRESCENTE_DECRESCENTE',
      foraDoPop: false,
      automatico: false,
      voltarPara: null,
    })
    expect(metodoNaEtapa(sugerido('CONTINUO'), 'III')).toEqual({
      metodo: 'CRESCENTE_DECRESCENTE',
      foraDoPop: false,
      automatico: true,
      voltarPara: null,
    })
    // A classe trocada antes das leituras: segue a nova
    expect(metodoNaEtapa(sugerido('CRESCENTE_DECRESCENTE'), 'I')).toEqual({
      metodo: 'DESCONTINUO',
      foraDoPop: false,
      automatico: true,
      voltarPara: null,
    })
    // Medido antes da regra (o caso real: "crescente contínuo" numa classe III)
    expect(metodoNaEtapa(ensaioDigitado('CONTINUO'), 'III')).toEqual({
      metodo: 'CONTINUO',
      foraDoPop: true,
      automatico: false,
      voltarPara: null,
    })
    expect(metodoNaEtapa(ensaioDigitado('DECRESCENTE'), 'III').foraDoPop).toBe(true)
    // Só a coluna que o método esconde lida também conta: a leitura existe
    const soDescida = {
      ...sugerido('CONTINUO'),
      pontos: sugerido('CONTINUO').pontos.map((p) => (p.carga === 10 ? { ...p, decrescente: 10 } : p)),
    }
    expect(metodoNaEtapa(soDescida, 'III').foraDoPop).toBe(true)
    // Uma etapa de substituição lida também
    const comEtapa = {
      ...sugerido('CONTINUO'),
      substituicao: { ativa: true, pecas: [], etapas: [{ leituraPadroes: 1000, leituraSubstituicao: null }] },
    }
    expect(metodoNaEtapa(comEtapa, 'III').foraDoPop).toBe(true)
  })

  it('o aviso do ensaio medido com outro método vale para os dois casos (medido antes da regra, ou a classe trocada)', () => {
    expect(textoMetodoForaDoPop(ensaioDigitado('CONTINUO'), 'III')).toBe(
      'Medido como “Crescente contínuo”, que não é o método do POP nesta classe (“Crescente e decrescente”). As leituras ficam como estão, e o certificado sai com o método usado.',
    )
    // A classe corrigida para I depois de um "crescente e decrescente" medido hoje: nada de "antes do método fixo"
    expect(textoMetodoForaDoPop(ensaioDigitado(), 'I')).toBe(
      'Medido como “Crescente e decrescente”, que não é o método do POP nesta classe (“Crescente com descarga”). As leituras ficam como estão, e o certificado sai com o método usado.',
    )
  })

  it('visita feita antes desta regra (a folha de antes impressa), ainda sem leituras: o método gravado fica, com o aviso', () => {
    // O caso da conferência: classe III com "crescente com descarga", o que a folha da 1.0.3 imprimiu, nada digitado
    const daVisita = sugerido('DESCONTINUO')
    expect(metodoNaEtapa(daVisita, 'III', true)).toEqual({
      metodo: 'DESCONTINUO',
      foraDoPop: true,
      automatico: false,
      voltarPara: null,
    })
    expect(textoMetodoForaDoPop(daVisita, 'III')).toBe(
      'Começada antes desta versão com “Crescente com descarga”, que não é o método do POP nesta classe (“Crescente e decrescente”). Se as cargas foram aplicadas assim, digite as leituras: o certificado sai com o método usado. Se não, use o do POP.',
    )
    // Sem a marca da visita (a calibração nova, a de antes sem nada medido e sem folha): o da classe
    expect(metodoNaEtapa(daVisita, 'III').metodo).toBe('CRESCENTE_DECRESCENTE')
  })

  it('visita feita antes desta regra: "Usar o método do POP" pergunta, guarda o gravado e deixa voltar para ele', async () => {
    const daVisita = sugerido('DESCONTINUO')
    const pergunta = vi.fn(async () => true)
    const trocado = await trocarParaMetodoDoPop(daVisita, 'III', pergunta, true)
    expect(pergunta).toHaveBeenCalledWith(
      '“Crescente e decrescente” pede a leitura de subida e de descida em cada carga, menos Max: sem ela, o certificado não sai. Troque só se as cargas foram aplicadas assim, ou se for medir de novo com esse método: é o que sai no certificado. Dá para voltar para “Crescente com descarga”.',
    )
    // Na classe I, "crescente com descarga": só a subida
    expect(textoTrocarMetodo(sugerido('CRESCENTE_DECRESCENTE'), 'DESCONTINUO')).toMatch(
      /^“Crescente com descarga” pede a leitura de subida em cada carga: sem ela, o certificado não sai\. Troque só se as cargas foram aplicadas assim/,
    )
    expect(trocado).toEqual({ ...daVisita, metodo: 'CRESCENTE_DECRESCENTE', metodoMedido: 'DESCONTINUO' })
    expect(metodoNaEtapa(trocado!, 'III', true)).toEqual({
      metodo: 'CRESCENTE_DECRESCENTE',
      foraDoPop: false,
      automatico: false,
      voltarPara: 'DESCONTINUO',
    })
    expect(await voltarParaMetodoMedido(trocado!, vi.fn(async () => false))).toEqual(daVisita)
    // Desistiu: nada muda
    expect(await trocarParaMetodoDoPop(daVisita, 'III', async () => false, true)).toBeNull()
  })

  it('trocado depois das leituras e a classe trocada depois: o aviso diz o medido e o de agora, e pede a volta', () => {
    // "Crescente e decrescente" medido na classe III → classe I → "Usar o método do POP" → classe III de novo
    const e = { ...ensaioDigitado(), metodo: 'DESCONTINUO' as const, metodoMedido: 'CRESCENTE_DECRESCENTE' as const }
    expect(metodoNaEtapa(e, 'III')).toEqual({
      metodo: 'DESCONTINUO',
      foraDoPop: true,
      automatico: false,
      voltarPara: 'CRESCENTE_DECRESCENTE',
    })
    expect(textoMetodoForaDoPop(e, 'III')).toBe(
      'Medido como “Crescente e decrescente” e trocado depois para “Crescente com descarga”, que não é o método do POP nesta classe. Volte para o medido: do jeito que está, o certificado não sai.',
    )
    // O medido também não é o do POP (o "crescente contínuo" de antes, trocado na classe I e voltado para a III)
    const continuo = { ...e, metodoMedido: 'CONTINUO' as const }
    expect(textoMetodoForaDoPop(continuo, 'III')).toBe(
      'Medido como “Crescente contínuo” e trocado depois para “Crescente com descarga”, que não é o método do POP nesta classe (“Crescente e decrescente”). Use o do POP ou volte para o medido: do jeito que está, o certificado não sai.',
    )
  })

  it('a classe trocada no formulário volta o ensaio trocado depois das leituras para o medido, quando ele é o da classe', () => {
    const e = { ...ensaioDigitado(), metodo: 'DESCONTINUO' as const, metodoMedido: 'CRESCENTE_DECRESCENTE' as const }
    expect(comMetodoMedidoDaClasse(e, 'III')).toEqual(ensaioDigitado())
    expect(comMetodoMedidoDaClasse(e, 'III')).not.toHaveProperty('metodoMedido')
    expect(comMetodoMedidoDaClasse(e, '')).toEqual(ensaioDigitado())
    // A classe I (o método de agora é o do POP) e o medido que não é o da classe: o mesmo ensaio
    expect(comMetodoMedidoDaClasse(e, 'I')).toBe(e)
    const continuo = { ...e, metodoMedido: 'CONTINUO' as const }
    expect(comMetodoMedidoDaClasse(continuo, 'III')).toBe(continuo)
    const semMarca = ensaioDigitado()
    expect(comMetodoMedidoDaClasse(semMarca, 'III')).toBe(semMarca)
  })

  it('o ensaio sem leituras com outro método passa para o da classe na primeira mudança (abrir a etapa não grava)', () => {
    const digitar = (e: EnsaioIndicacao) => ({
      ...e,
      pontos: e.pontos.map((p) => (p.carga === 10 ? { ...p, crescente: 10 } : p)),
    })
    // O rascunho de antes, sem leituras de carga: a primeira leitura já entra no da classe
    const continuo = sugerido('CONTINUO')
    const r = noMetodoDaClasse(digitar, 'III')(continuo)
    expect(r.metodo).toBe('CRESCENTE_DECRESCENTE')
    expect(r.pontos.find((p) => p.carga === 10)?.crescente).toBe(10)
    expect(noMetodoDaClasse(digitar, 'I')(continuo).metodo).toBe('DESCONTINUO')
    // Com leituras de carga, ou na visita feita antes desta regra, fica o método do ensaio
    expect(noMetodoDaClasse(digitar, 'III')(ensaioDigitado('CONTINUO')).metodo).toBe('CONTINUO')
    expect(noMetodoDaClasse(digitar, 'III', true)(continuo).metodo).toBe('CONTINUO')
    // "Refazer pontos" que apaga as leituras: o ensaio sem leituras passa para o da classe
    const apagar = (e: EnsaioIndicacao) => ({ ...e, pontos: e.pontos.map((p) => ({ ...p, crescente: null, decrescente: null })) })
    expect(noMetodoDaClasse(apagar, 'III')(ensaioDigitado('CONTINUO')).metodo).toBe('CRESCENTE_DECRESCENTE')
    expect(noMetodoDaClasse(apagar, 'III', true)(ensaioDigitado('CONTINUO')).metodo).toBe('CONTINUO')
    // Já no da classe: a mudança como veio
    const doPop = sugerido('CRESCENTE_DECRESCENTE')
    expect(noMetodoDaClasse((e) => e, 'III')(doPop)).toBe(doPop)
  })

  it('a troca para o do POP sempre pergunta, diz o que o método novo pede e guarda o método medido', async () => {
    // O caso real: "crescente contínuo" com leituras numa classe III. A troca não esconde nada, mas passa a pedir a descida
    const continuo = { ...ensaioDigitado('CONTINUO'), pontos: ensaioDigitado().pontos.map((p) => ({ ...p, decrescente: null })) }
    expect(leiturasEscondidasPelaTroca(continuo, 'CRESCENTE_DECRESCENTE')).toBe(0)
    expect(textoTrocarMetodo(continuo, 'CRESCENTE_DECRESCENTE')).toBe(
      '“Crescente e decrescente” pede a leitura de descida em cada carga, menos Max: sem ela, o certificado não sai. Troque só se for medir de novo com esse método, que é o que sai no certificado. Dá para voltar para “Crescente contínuo”.',
    )
    const desiste = vi.fn(async () => false)
    expect(await trocarParaMetodoDoPop(continuo, 'III', desiste)).toBeNull()
    expect(desiste).toHaveBeenCalledWith(textoTrocarMetodo(continuo, 'CRESCENTE_DECRESCENTE'))
    const trocado = await trocarParaMetodoDoPop(continuo, 'III', async () => true)
    expect(trocado).toEqual({ ...continuo, metodo: 'CRESCENTE_DECRESCENTE', metodoMedido: 'CONTINUO' })
    // Depois da troca: sem o aviso, com a volta para o medido
    expect(metodoNaEtapa(trocado!, 'III')).toEqual({
      metodo: 'CRESCENTE_DECRESCENTE',
      foraDoPop: false,
      automatico: false,
      voltarPara: 'CONTINUO',
    })
    // "Crescente e decrescente" numa classe I → "crescente com descarga": as 2 descidas de carga somem (o zero não conta)
    expect(leiturasEscondidasPelaTroca(ensaioDigitado(), 'DESCONTINUO')).toBe(2)
    expect(textoTrocarMetodo(ensaioDigitado(), 'DESCONTINUO')).toBe(
      'As 2 leituras de descida já digitadas saem do cálculo e do certificado (ficam guardadas). Troque só se for medir de novo com esse método, que é o que sai no certificado. Dá para voltar para “Crescente e decrescente”.',
    )
    const comDescarga = await trocarParaMetodoDoPop(ensaioDigitado(), 'I', async () => true)
    expect(comDescarga?.metodo).toBe('DESCONTINUO')
    expect(comDescarga?.metodoMedido).toBe('CRESCENTE_DECRESCENTE')
    // "Decrescente" (só a descida) → "crescente e decrescente": pede a subida e a descida que faltam
    const soDescida = {
      ...ensaioDigitado('DECRESCENTE'),
      pontos: ensaioDigitado().pontos.map((p) => ({ ...p, crescente: p.carga ? null : 0, decrescente: p.carga ? p.carga : 0 })),
    }
    expect(textoTrocarMetodo(soDescida, 'CRESCENTE_DECRESCENTE')).toBe(
      '“Crescente e decrescente” pede a leitura de subida em cada carga: sem ela, o certificado não sai. Troque só se for medir de novo com esse método, que é o que sai no certificado. Dá para voltar para “Decrescente”.',
    )
    // Faltando as duas (a subida em 10 kg, a descida em 20 kg)
    const misto = {
      ...soDescida,
      pontos: soDescida.pontos.map((p) => (p.carga === 20 ? { ...p, crescente: 19.99, decrescente: null } : p)),
    }
    expect(textoTrocarMetodo(misto, 'CRESCENTE_DECRESCENTE')).toMatch(
      /^“Crescente e decrescente” pede a leitura de subida e de descida em cada carga, menos Max: sem ela, o certificado não sai\. /,
    )
    // Já no método da classe: nada a trocar; sem leituras de carga, troca sem perguntar e sem guardar o método
    const nunca = vi.fn(async () => false)
    expect(await trocarParaMetodoDoPop(ensaioDigitado(), 'III', nunca)).toBeNull()
    const semLeituras = { ...continuo, pontos: continuo.pontos.map((p) => ({ ...p, crescente: p.carga ? null : 0 })) }
    expect(await trocarParaMetodoDoPop(semLeituras, 'III', nunca)).toEqual({ ...semLeituras, metodo: 'CRESCENTE_DECRESCENTE' })
    expect(nunca).not.toHaveBeenCalled()
  })

  it('volta para o método medido: tira a marca; pergunta antes quando esconde a descida digitada depois da troca', async () => {
    const continuo = { ...ensaioDigitado('CONTINUO'), pontos: ensaioDigitado().pontos.map((p) => ({ ...p, decrescente: null })) }
    const trocado = (await trocarParaMetodoDoPop(continuo, 'III', async () => true))!
    const nunca = vi.fn(async () => false)
    expect(await voltarParaMetodoMedido(trocado, nunca)).toEqual(continuo)
    expect(nunca).not.toHaveBeenCalled()
    // Com a descida digitada depois da troca, a volta a esconde: pergunta antes
    const comDescida = { ...trocado, pontos: trocado.pontos.map((p) => (p.carga === 10 ? { ...p, decrescente: 9.995 } : p)) }
    const pergunta = vi.fn(async () => false)
    expect(await voltarParaMetodoMedido(comDescida, pergunta)).toBeNull()
    expect(pergunta).toHaveBeenCalledWith(textoVoltarMetodo(1, 'CONTINUO'))
    expect(textoVoltarMetodo(1, 'CONTINUO')).toBe(
      'Com “Crescente contínuo”, a leitura de descida já digitada sai do cálculo e do certificado (fica guardada). Continuar?',
    )
    expect(textoVoltarMetodo(2, 'CONTINUO')).toBe(
      'Com “Crescente contínuo”, as 2 leituras de descida já digitadas saem do cálculo e do certificado (ficam guardadas). Continuar?',
    )
    expect((await voltarParaMetodoMedido(comDescida, async () => true))?.metodo).toBe('CONTINUO')
    // Sem troca: nada a voltar; "Refazer pontos" (sem leituras) tira a marca
    expect(await voltarParaMetodoMedido(continuo, nunca)).toBeNull()
    expect(semMetodoMedido(trocado)).not.toHaveProperty('metodoMedido')
    // A marca sem leituras de carga não aparece na etapa
    const semLeituras = { ...trocado, pontos: trocado.pontos.map((p) => ({ ...p, crescente: p.carga ? null : 0 })) }
    expect(metodoNaEtapa(semLeituras, 'III').voltarPara).toBeNull()
  })
})
