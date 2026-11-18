import { describe, expect, it } from 'vitest'
import { calcularSha256Pacote, sha256Hex } from '../../../shared/campo/canonico.ts'
import { APARELHO_EXEMPLO, pacotePlataforma, registroPlataforma, TECNICO_EXEMPLO } from '../../../shared/campo/exemplos.ts'
import { resumoDoEnvio } from '../../../shared/campo/pacote.ts'
import {
  comecar,
  editar,
  folhaRecebida,
  iniciarAssinaturas,
  lerLeitura,
  recebimentoConfirmado,
  recomecarEnsaios,
} from './folha.ts'
import type { FolhaLocal } from './folha.ts'
import { relogioFixo } from './relogio.ts'
import {
  gravarLeituraPendente,
  leituraPendente,
  podeRepetir,
  repetir,
  tecladoCom,
  tecladoDaLeitura,
  tecladoVazio,
  teclar,
  textoParaConfirmar,
} from './teclado.ts'
import type { EstadoTeclado } from './teclado.ts'

const digitar = (teclas: string[], inicio: EstadoTeclado = tecladoVazio()) => teclas.reduce(teclar, inicio)

describe('teclado do app', () => {
  it('guarda o texto exatamente como digitado (nada é completado com zeros)', () => {
    expect(digitar(['1', '0', '0', ',', '0']).texto).toBe('100,0')
    expect(textoParaConfirmar(digitar(['1', '0', '0', ',', '0']))).toBe('100,0')
    expect(digitar(['1', '5', '0']).texto).toBe('150')
  })

  it('vírgula decimal: uma só; sozinha vira "0,"; o ponto do teclado físico vira vírgula', () => {
    expect(digitar([',', '5']).texto).toBe('0,5')
    expect(digitar(['1', ',', '2', ',', '3']).texto).toBe('1,23')
    expect(digitar(['1', '.', '5']).texto).toBe('1,5')
  })

  it('± põe e tira o sinal na frente, a qualquer momento', () => {
    expect(digitar(['±', '0', ',', '0', '2']).texto).toBe('-0,02')
    expect(digitar(['0', ',', '0', '2', '±']).texto).toBe('-0,02')
    expect(digitar(['5', '±', '±']).texto).toBe('5')
    expect(digitar(['-', '3']).texto).toBe('-3')
  })

  it('⌫ apaga um caractere; "limpar" apaga tudo', () => {
    expect(digitar(['1', '2', ',', '5', '⌫']).texto).toBe('12,')
    expect(digitar(['1', 'Backspace']).texto).toBe('')
    expect(digitar(['⌫']).texto).toBe('')
    expect(digitar(['1', '2', 'limpar']).texto).toBe('')
  })

  it('o zero sozinho vira o algarismo ("05" nunca aparece); limites do formato', () => {
    expect(digitar(['0', '5']).texto).toBe('5')
    expect(digitar(['±', '0', '7']).texto).toBe('-7')
    expect(digitar(Array(15).fill('9')).texto).toBe('9'.repeat(12))
    expect(digitar(['1', ',', ...Array(12).fill('1')]).texto).toBe(`1,${'1'.repeat(9)}`)
    expect(digitar(['x', 'a']).texto).toBe('')
  })

  it('ao confirmar: a vírgula pendurada sai; o sinal sozinho é vazio', () => {
    expect(textoParaConfirmar({ texto: '12,', via: 'teclado' })).toBe('12')
    expect(textoParaConfirmar({ texto: '-', via: 'teclado' })).toBe('')
    expect(textoParaConfirmar({ texto: '', via: 'teclado' })).toBe('')
    expect(textoParaConfirmar({ texto: '1,2,3', via: 'teclado' })).toBeNull()
  })

  it('Repetir: só na repetibilidade e na excentricidade; marca a leitura; digitar depois volta a ser teclado', () => {
    expect(podeRepetir('REPETIBILIDADE')).toBe(true)
    expect(podeRepetir('EXCENTRICIDADE')).toBe(true)
    expect(podeRepetir('INDICACAO_CRESCENTE')).toBe(false)
    expect(podeRepetir('INDICACAO_DECRESCENTE')).toBe(false)
    expect(podeRepetir('TEMPERATURA')).toBe(false)
    const r = repetir('150,00')
    expect(r).toEqual({ texto: '150,00', via: 'repetir' })
    expect(teclar(r, '⌫')).toEqual({ texto: '150,0', via: 'teclado' })
  })
})

describe('o valor do "Repetir"', () => {
  it('a leitura anterior da mesma série; nada no erro de indicação', async () => {
    const { APARELHO_EXEMPLO, pacotePlataforma, TECNICO_EXEMPLO } = await import('../../../shared/campo/exemplos.ts')
    const { registroInicial } = await import('../../../shared/campo/registro.ts')
    const { valorParaRepetir } = await import('./teclado.ts')
    const r = registroInicial(pacotePlataforma(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-11-18T08:00:00-03:00' })
    const id = r.passos.repetibilidade[0].id
    expect(valorParaRepetir(r, `repetibilidade.${id}.leituras.0`)).toBe('')
    r.passos.repetibilidade[0].leituras.push({ valor: '150,05', em: '2026-11-18T08:00:00-03:00', via: 'teclado' })
    expect(valorParaRepetir(r, `repetibilidade.${id}.leituras.1`)).toBe('150,05')
    r.passos.excentricidade.posicoes[0].leitura = { valor: '100,00', em: '2026-11-18T08:00:00-03:00', via: 'teclado' }
    expect(valorParaRepetir(r, 'excentricidade.posicoes.1.leitura')).toBe('100,00')
    expect(valorParaRepetir(r, 'excentricidade.posicoes.0.leitura')).toBe('')
    expect(valorParaRepetir(r, 'indicacao.pontos.p1.crescente')).toBeNull()
    expect(valorParaRepetir(r, 'ambiente.linhas.0.temperatura')).toBeNull()
  })
})

describe('a leitura em foco e o que falta gravar', () => {
  const agora = relogioFixo('2026-11-18T11:00:00.000Z').agora()

  /** Uma folha em preenchimento com o registro completo da plataforma (ainda sem assinar). */
  function folhaEmPreenchimento(): FolhaLocal & { registro: NonNullable<FolhaLocal['registro']> } {
    const p = pacotePlataforma()
    const recebida = folhaRecebida(resumoDoEnvio(p, 'ENVIADA'), p, calcularSha256Pacote(p, sha256Hex), agora)
    const r = registroPlataforma()
    r.assinaturas = { tecnico: null, cliente: null }
    r.correcoesPosAssinatura = []
    r.relogio.finalizadoEm = ''
    return { ...comecar(recebimentoConfirmado(recebida, agora), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora), registro: r }
  }

  it('abrir uma leitura feita com "Repetir" mostra a marca, e só passar por ela não regrava nada', () => {
    const f = folhaEmPreenchimento()
    const campo = `repetibilidade.${f.registro.passos.repetibilidade[0].id}.leituras.1`
    const gravada = lerLeitura(f.registro, campo)!
    expect(gravada.via).toBe('repetir')
    const aberto = tecladoDaLeitura(f.registro, campo)
    expect(aberto).toEqual({ texto: gravada.valor, via: 'repetir' })
    expect(leituraPendente(f.registro, campo, aberto)).toBeNull()
    // Aberto como digitado (o que acontecia antes), "Próxima" ou o voltar regravariam a leitura sem a marca
    expect(leituraPendente(f.registro, campo, tecladoCom(gravada.valor))).toEqual({ campo, texto: gravada.valor, via: 'teclado' })
    // Digitar por cima volta a ser leitura digitada
    expect(leituraPendente(f.registro, campo, teclar(teclar(aberto, '⌫'), '0'))).toMatchObject({ via: 'teclado' })
    // Sem foco ou sem leitura gravada: o teclado vazio
    expect(tecladoDaLeitura(f.registro, null)).toEqual(tecladoVazio())
    expect(tecladoDaLeitura(f.registro, 'indicacao.pontos.nao-existe.crescente')).toEqual(tecladoVazio())
  })

  it('pendente: só o que confirmar gravaria (texto diferente do gravado, apagado ou outra marca)', () => {
    const f = folhaEmPreenchimento()
    const campo = `indicacao.pontos.${f.registro.passos.indicacao.pontos[2].id}.crescente`
    const gravada = lerLeitura(f.registro, campo)!
    expect(leituraPendente(f.registro, null, tecladoCom('1'))).toBeNull()
    expect(leituraPendente(f.registro, campo, tecladoCom(gravada.valor))).toBeNull()
    expect(leituraPendente(f.registro, campo, tecladoCom('150,02'))).toEqual({ campo, texto: '150,02', via: 'teclado' })
    expect(leituraPendente(f.registro, campo, tecladoCom('150,'))).toEqual({ campo, texto: '150', via: 'teclado' })
    expect(leituraPendente(f.registro, campo, tecladoVazio())).toEqual({ campo, texto: '', via: 'teclado' })
    expect(leituraPendente(f.registro, campo, tecladoCom('1,2,3'))).toBeNull()
  })

  it('sair da tela sem "Próxima" grava o digitado como "Próxima" gravaria; de novo, não muda nada', () => {
    const f = folhaEmPreenchimento()
    const campo = `indicacao.pontos.${f.registro.passos.indicacao.pontos[2].id}.crescente`
    const antes = lerLeitura(f.registro, campo)!
    const p = leituraPendente(f.registro, campo, tecladoCom('150,02'))!
    const depois = gravarLeituraPendente(f, p, 0, agora)
    // Corrigir a digitação mantém a hora da observação; a correção vai para a trilha
    expect(lerLeitura(depois.registro!, campo)).toEqual({ valor: '150,02', em: antes.em, via: 'teclado' })
    expect(depois.registro!.trilha.at(-1)).toMatchObject({ campo, de: antes.valor, para: '150,02' })
    // A mesma gravação outra vez (a tela gravou com "Próxima" e saiu logo em seguida): nada muda na leitura nem na trilha
    const outraVez = gravarLeituraPendente(depois, p, 0, agora)
    expect(lerLeitura(outraVez.registro!, campo)).toEqual(lerLeitura(depois.registro!, campo))
    expect(outraVez.registro!.trilha).toEqual(depois.registro!.trilha)
  })

  it('não grava na tentativa nova (recomeçar), nem na folha que já não pode ser mudada, e não lança', async () => {
    const f = folhaEmPreenchimento()
    const campo = `indicacao.pontos.${f.registro.passos.indicacao.pontos[2].id}.crescente`
    const p = leituraPendente(f.registro, campo, tecladoCom('150,02'))!
    // Recomeçar os ensaios tira a tela: o digitado na tentativa de antes não entra na nova, que está vazia
    const recomecada = recomecarEnsaios(f, 'Troca da célula de carga', agora)
    expect(gravarLeituraPendente(recomecada, p, 0, agora)).toBe(recomecada)
    expect(lerLeitura(recomecada.registro!, campo)).toBeNull()
    // Na tentativa nova, o teclado aberto nela grava normalmente
    expect(lerLeitura(gravarLeituraPendente(recomecada, p, 1, agora).registro!, campo)?.valor).toBe('150,02')
    // Em assinatura (ou trancada) e entregue (sem o registro): a folha como está, sem erro
    const emAssinatura = await iniciarAssinaturas(f, sha256Hex, agora)
    expect(gravarLeituraPendente(emAssinatura, p, 0, agora)).toBe(emAssinatura)
    const semRegistro = { ...f, registro: null }
    expect(gravarLeituraPendente(semRegistro, p, 0, agora)).toBe(semRegistro)
    expect(() => editar(emAssinatura, () => undefined, agora)).toThrow()
  })
})
