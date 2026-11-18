import { describe, expect, it } from 'vitest'
import {
  calcularConteudoSha256,
  calcularSha256Pacote,
  calcularSha256Registro,
  sha256Hex,
} from '../../../shared/campo/canonico.ts'
import {
  APARELHO_EXEMPLO,
  pacoteClasseI,
  pacoteDoCliente,
  pacotePlataforma,
  pacoteRodoviaria,
  registroClasseI,
  registroPlataforma,
  registroRodoviaria,
  TECNICO_EXEMPLO,
} from '../../../shared/campo/exemplos.ts'
import { deltaTValido, indiceDeltaTValido, indiceInicioValido } from '../../../shared/campo/importar.ts'
import { resumoDoEnvio } from '../../../shared/campo/pacote.ts'
import { conferirAssinaturas, validarRegistro } from '../../../shared/campo/registro.ts'
import type { PacoteCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from '../../../server/pdf/assinaturasExemplo.ts'
import {
  assinarCliente,
  assinarTecnico,
  campoMostradoAoCliente,
  cancelarAssinaturas,
  clienteAssinouSoOPapel,
  clienteNaoAssinou,
  comecar,
  confirmarLeitura,
  corrigirDepoisDaAssinatura,
  desfazerAssinaturaTecnico,
  editar,
  emAssinatura,
  encerrarSemCompletar,
  ErroFolha,
  folhaRecebida,
  folhaRetirada,
  gravarLeitura,
  iniciarAssinaturas,
  lerLeitura,
  marcarEntregue,
  podeEditar,
  reabrir,
  recebimentoConfirmado,
  recomecarEnsaios,
  sairDoModoEntrega,
  voltarACompletar,
} from './folha.ts'
import type { FolhaLocal } from './folha.ts'
import { relogioFixo } from './relogio.ts'
import { RepositorioMemoria } from './repositorio.ts'

const relogio = relogioFixo('2026-11-18T11:00:00.000Z')
const agora = () => relogio.agora()
const l = (valor: string, via: 'teclado' | 'repetir' = 'teclado') => ({ valor, em: agora(), via })

function folhaNova(pacote: PacoteCampo = pacotePlataforma()): FolhaLocal {
  const recebida = folhaRecebida(resumoDoEnvio(pacote, 'ENVIADA'), pacote, calcularSha256Pacote(pacote, sha256Hex), agora())
  return recebimentoConfirmado(recebida, agora())
}

/** Uma folha em preenchimento com o registro completo dos exemplos, ainda sem assinar. */
function folhaCompleta(registro: RegistroCampo = registroPlataforma(), pacote: PacoteCampo = pacotePlataforma()): FolhaLocal {
  const r = structuredClone(registro)
  r.assinaturas = { tecnico: null, cliente: null }
  r.correcoesPosAssinatura = []
  r.relogio.finalizadoEm = ''
  return { ...comecar(folhaNova(pacote), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora()), registro: r }
}

describe('recebimento e começo', () => {
  it('a folha baixada só pode ser começada depois da confirmação do servidor', () => {
    const p = pacotePlataforma()
    const f = folhaRecebida(resumoDoEnvio(p, 'ENVIADA'), p, calcularSha256Pacote(p, sha256Hex), agora())
    expect(f.estado).toBe('RECEBENDO')
    expect(() => comecar(f, TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())).toThrow(/Conecte-se à rede da empresa/)
    const nova = recebimentoConfirmado(f, agora())
    expect(nova.estado).toBe('NOVA')
    const comecada = comecar(nova, TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    expect(comecada.estado).toBe('EM_PREENCHIMENTO')
    expect(comecada.registro!.numero).toBe(p.folha.numero)
    expect(comecada.registro!.pacoteSha256).toBe(f.pacoteSha256)
    // Nada é preenchido sem um toque do técnico
    expect(comecada.registro!.passos.indicacao.pontos.every((x) => x.crescente === null && x.decrescente === null)).toBe(true)
    expect(() => comecar(comecada, TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())).toThrow(/já foi começada/)
  })

  it('retirar: só a não começada sai do celular', () => {
    const nova = folhaNova()
    const retirada = folhaRetirada(nova, 'RECOLHIDA', agora())
    expect(retirada).toMatchObject({
      estado: 'RETIRADA',
      pacote: null,
      registro: null,
      motivoRetirada: 'RECOLHIDA',
      avisoRetiradaVisto: false,
    })
    expect(folhaRetirada(nova, 'DESCONHECIDO', agora()).avisoRetiradaVisto).toBe(true)
    const comecada = comecar(nova, TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    expect(() => folhaRetirada(comecada, 'RECOLHIDA', agora())).toThrow(ErroFolha)
  })
})

describe('trilha de correções (o risco único do papel)', () => {
  it('anota só a mudança de um valor já confirmado', () => {
    let f = comecar(folhaNova(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    const campo = 'indicacao.pontos.p4.crescente'
    f = editar(f, (r) => gravarLeitura(r, campo, l('150,50')), agora())
    expect(f.registro!.trilha).toEqual([])
    expect(lerLeitura(f.registro!, campo)?.valor).toBe('150,50')
    f = editar(f, (r) => gravarLeitura(r, campo, l('150,50')), agora())
    expect(f.registro!.trilha).toEqual([])
    relogio.avancar(20_000)
    f = editar(f, (r) => gravarLeitura(r, campo, l('150,05')), agora())
    expect(f.registro!.trilha).toEqual([{ campo, de: '150,50', para: '150,05', em: agora(), motivo: '' }])
    // Apagar uma leitura confirmada também é correção
    f = editar(f, (r) => gravarLeitura(r, campo, null), agora())
    expect(f.registro!.trilha.at(-1)).toMatchObject({ campo, de: '150,05', para: '' })
  })

  it('textos livres, anotações e medir o ΔT de novo não são correções', () => {
    let f = comecar(folhaNova(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    f = editar(
      f,
      (r) => {
        r.anotacoes.push({ id: 'a1', passo: 2, tipo: 'OBSERVACAO', campo: '', texto: 'Portaria pede EPI', em: agora() })
        r.passos.chegada.localEndereco = 'Rua A'
      },
      agora(),
    )
    f = editar(f, (r) => (r.passos.chegada.localEndereco = 'Rua A, 100'), agora())
    f = editar(f, (r) => gravarLeitura(r, 'ambiente.deltaT.0.valor', l('1,4')), agora())
    f = editar(f, (r) => gravarLeitura(r, 'ambiente.deltaT.1.valor', l('0,6')), agora())
    expect(f.registro!.passos.ambiente.deltaT.map((m) => m.valor.valor)).toEqual(['1,4', '0,6'])
    expect(f.registro!.trilha).toEqual([])
  })

  it('a conferência de um dado impresso trocada vira correção', () => {
    let f = comecar(folhaNova(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    f = editar(f, (r) => (r.passos.balanca.conferencias.find((c) => c.campo === 'balanca.d')!.confere = true), agora())
    f = editar(
      f,
      (r) => {
        const c = r.passos.balanca.conferencias.find((x) => x.campo === 'balanca.d')!
        c.confere = false
        c.observado = '0,01 kg'
      },
      agora(),
    )
    expect(f.registro!.trilha).toEqual([
      { campo: 'balanca.d', de: 'Confere', para: 'Algo diferente: 0,01 kg', em: agora(), motivo: '' },
    ])
  })

  it('gravarLeitura: a próxima posição acrescenta; só a última sai; caminho inexistente lança', () => {
    let f = comecar(folhaNova(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    const rep = f.registro!.passos.repetibilidade[0].id
    f = editar(f, (r) => gravarLeitura(r, `repetibilidade.${rep}.leituras.0`, l('150,00')), agora())
    f = editar(f, (r) => gravarLeitura(r, `repetibilidade.${rep}.leituras.1`, l('150,00', 'repetir')), agora())
    expect(f.registro!.passos.repetibilidade[0].leituras.map((x) => [x.valor, x.via])).toEqual([
      ['150,00', 'teclado'],
      ['150,00', 'repetir'],
    ])
    expect(() => editar(f, (r) => gravarLeitura(r, `repetibilidade.${rep}.leituras.0`, null), agora())).toThrow(/última/)
    expect(() => editar(f, (r) => gravarLeitura(r, `repetibilidade.${rep}.leituras.5`, l('1')), agora())).toThrow()
    expect(() => editar(f, (r) => gravarLeitura(r, 'indicacao.pontos.nao-existe.crescente', l('1')), agora())).toThrow()
    expect(() => editar(f, (r) => gravarLeitura(r, 'chegada.os', l('1')), agora())).toThrow()
    expect(() => editar(f, (r) => gravarLeitura(r, 'indicacao.retornoZero', l('1.0')), agora())).toThrow(/formato/)
    f = editar(f, (r) => gravarLeitura(r, 'ambiente.deltaT0.origem', l('22,0')), agora())
    expect(f.registro!.passos.ambiente.deltaT0).toMatchObject({ origem: { valor: '22,0' }, sala: null })
  })

  it('corrigir a digitação mantém a hora da observação: o ΔT e a linha do início que valem não mudam', () => {
    // Classe I: ΔT 1,6 (antes da aclimatação) e 0,6 (medido de novo), os dois antes do 1º ensaio; corrigido bem depois
    const original = registroClasseI()
    const segundo = original.passos.ambiente.deltaT[1].valor
    let f = folhaCompleta(original, pacoteClasseI())
    expect(indiceDeltaTValido(f.registro!)).toBe(1)
    f = editar(f, (r) => confirmarLeitura(r, 'ambiente.deltaT.1.valor', '0,7', 'teclado', agora()), agora())
    expect(f.registro!.passos.ambiente.deltaT[1].valor).toEqual({ valor: '0,7', em: segundo.em, via: 'teclado' })
    expect(indiceDeltaTValido(f.registro!)).toBe(1)
    expect(deltaTValido(f.registro!)!.valor.valor).toBe('0,7')
    // A correção fica na trilha, com a hora da correção
    expect(f.registro!.trilha.at(-1)).toMatchObject({ campo: 'ambiente.deltaT.1.valor', de: '0,6', para: '0,7', em: agora() })
    // A linha "início, medido de novo" sem "Data e hora": corrigida a temperatura, ela continua sendo a do início
    f = editar(f, (r) => void (r.passos.ambiente.linhas[1].em = ''), agora())
    expect(indiceInicioValido(f.registro!)).toBe(1)
    f = editar(f, (r) => confirmarLeitura(r, 'ambiente.linhas.1.temperatura', '21,6', 'teclado', agora()), agora())
    expect(indiceInicioValido(f.registro!)).toBe(1)
    // Apagada e digitada de novo, é uma observação nova (a hora de agora)
    f = editar(f, (r) => confirmarLeitura(r, 'ambiente.deltaT.1.valor', '', 'teclado', agora()), agora())
    f = editar(f, (r) => confirmarLeitura(r, 'ambiente.deltaT.1.valor', '0,6', 'teclado', agora()), agora())
    expect(f.registro!.passos.ambiente.deltaT[1].valor.em).toBe(agora())
  })
})

describe('finalizar e assinar', () => {
  it('não finaliza com item ● em branco (o motivo escrito, nunca um botão mudo)', async () => {
    const f = comecar(folhaNova(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    await expect(iniciarAssinaturas(f, sha256Hex, agora())).rejects.toThrow('Preencha os itens com ● para assinar.')
  })

  it('o dia completo: finalizar → técnico (PIN + desenho) → modo entrega → cliente → trancada', async () => {
    let f = await iniciarAssinaturas(folhaCompleta(), sha256Hex, agora())
    expect(f.registro!.relogio.finalizadoEm).toBe(agora())
    expect(f.conteudoSha256).toBe(calcularConteudoSha256(f.registro!, sha256Hex))
    expect(emAssinatura(f)).toBe(true)
    expect(podeEditar(f)).toBe(false)
    expect(() => editar(f, (r) => (r.passos.chegada.os = '1'), agora())).toThrow(/sendo assinada/)

    f = await assinarTecnico(f, ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    expect(f.registro!.assinaturas.tecnico).toMatchObject({ nome: TECNICO_EXEMPLO.nome, conteudoSha256: f.conteudoSha256 })
    expect(f.modoEntrega).toMatchObject({ tela: 'DADOS', nome: '', funcao: '' })
    expect(f.estado).toBe('EM_PREENCHIMENTO')
    expect(() => assinarCliente(f, { nome: ' ', funcao: 'x', png: ASSINATURA_EXEMPLO_2 }, agora())).toThrow(/nome/)

    f = assinarCliente(f, { nome: '  Juliana   Prado ', funcao: 'Supervisora', png: ASSINATURA_EXEMPLO_2 }, agora())
    expect(f.estado).toBe('FINALIZADA')
    expect(f.modoEntrega?.tela).toBe('PRONTO')
    expect(f.registro!.assinaturas.cliente).toMatchObject({ nome: 'Juliana Prado', funcao: 'Supervisora' })
    expect(validarRegistro(f.registro, { pacote: f.pacote, momento: 'ENTREGA' })).toEqual([])
    expect(await conferirAssinaturas(f.registro!, sha256Hex)).toEqual([])
    f = sairDoModoEntrega(f, agora())
    expect(f.modoEntrega).toBeNull()
    expect(() => editar(f, (r) => (r.passos.chegada.os = '1'), agora())).toThrow(/trancada/)
  })

  it('o modo entrega fica gravado: o app reabre nele', async () => {
    const repo = new RepositorioMemoria()
    let f = await iniciarAssinaturas(folhaCompleta(), sha256Hex, agora())
    f = await assinarTecnico(f, ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    await repo.gravar(f)
    const lida = await repo.obter(f.envioId)
    expect(lida?.modoEntrega).toEqual(f.modoEntrega)
  })

  it('a folha mudou depois de Finalizar: a assinatura do técnico é recusada', async () => {
    const f = await iniciarAssinaturas(folhaCompleta(), sha256Hex, agora())
    const mexida = { ...f, registro: { ...f.registro!, motivoDesfecho: 'x' } }
    await expect(assinarTecnico(mexida, ASSINATURA_EXEMPLO_1, sha256Hex, agora())).rejects.toThrow(/mudou/)
    await expect(assinarTecnico(f, 'data:image/png;base64,AAAA', sha256Hex, agora())).rejects.toThrow(ErroFolha)
  })

  it('no laboratório, a assinatura do cliente fica dispensada e a folha tranca na hora', async () => {
    const base = folhaCompleta()
    base.registro!.passos.chegada.local = 'LABORATORIO'
    let f = await iniciarAssinaturas(base, sha256Hex, agora())
    f = await assinarTecnico(f, ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    expect(f.estado).toBe('FINALIZADA')
    expect(f.modoEntrega).toBeNull()
    expect(f.registro!.assinaturas.cliente).toEqual({ dispensada: 'LABORATORIO' })
    expect(validarRegistro(f.registro, { pacote: f.pacote })).toEqual([])
  })

  it('cliente não assinou (motivo) e, no piloto, "O cliente assinou só o papel"', async () => {
    let f = await assinarTecnico(
      await iniciarAssinaturas(folhaCompleta(), sha256Hex, agora()),
      ASSINATURA_EXEMPLO_1,
      sha256Hex,
      agora(),
    )
    expect(() => clienteNaoAssinou(f, ' ', agora())).toThrow(/por que/)
    const naoAssinou = clienteNaoAssinou(f, 'Ninguém acompanhou', agora())
    expect(naoAssinou).toMatchObject({ estado: 'FINALIZADA', modoEntrega: null })
    expect(validarRegistro(naoAssinou.registro, { pacote: naoAssinou.pacote })).toEqual([])
    const papel = clienteAssinouSoOPapel(f, agora())
    expect(papel.registro!.assinaturas.cliente).toEqual({ soNoPapel: true })

    // Fora do piloto, "só o papel" não existe
    f = folhaCompleta(registroRodoviaria(), pacoteRodoviaria())
    f = await assinarTecnico(await iniciarAssinaturas(f, sha256Hex, agora()), ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    expect(() => clienteAssinouSoOPapel(f, agora())).toThrow(/piloto/)
  })

  it('ponto acrescentado e deixado em branco sai da folha ao finalizar; com leitura e sem carga, a frase do que fazer', async () => {
    const vazio = (id: string) => ({
      id,
      acrescentado: true,
      cargaPrevista: '',
      cargaAplicada: null,
      pecas: [],
      pecasTrocadas: false,
      nivelSubstituicao: 0,
      crescente: null,
      decrescente: null,
    })
    const base = folhaCompleta()
    const n = base.registro!.passos.indicacao.pontos.length
    let f = editar(base, (r) => void r.passos.indicacao.pontos.push(vazio('cel-vazio')), agora())
    f = await iniciarAssinaturas(f, sha256Hex, agora())
    expect(f.registro!.passos.indicacao.pontos.map((p) => p.id)).toEqual(base.registro!.passos.indicacao.pontos.map((p) => p.id))
    expect(f.conteudoSha256).toBe(calcularConteudoSha256(f.registro!, sha256Hex))
    expect(validarRegistro(f.registro!, { pacote: f.pacote, momento: 'FINALIZAR' })).toEqual([])
    // "Encerrar sem completar" passa pelo mesmo Finalizar
    let e = editar(base, (r) => void r.passos.indicacao.pontos.push(vazio('cel-vazio')), agora())
    e = encerrarSemCompletar(e, 'INCOMPLETA', 'Faltou energia no local.', agora())
    expect((await iniciarAssinaturas(e, sha256Hex, agora())).registro!.passos.indicacao.pontos).toHaveLength(n)
    // Com a leitura e sem a carga: nada de "problema de formato"
    const lido = editar(
      base,
      (r) => void r.passos.indicacao.pontos.push({ ...vazio('cel-lido'), crescente: l('150,00') }),
      agora(),
    )
    await expect(iniciarAssinaturas(encerrarSemCompletar(lido, 'INCOMPLETA', 'x', agora()), sha256Hex, agora())).rejects.toThrow(
      `Falta a carga do ponto ${n + 1}, acrescentado no passo 5`,
    )
  })

  it('voltar da assinatura e desfazer a do técnico devolvem a folha para edição', async () => {
    let f = await iniciarAssinaturas(folhaCompleta(), sha256Hex, agora())
    f = cancelarAssinaturas(f, agora())
    expect(podeEditar(f)).toBe(true)
    expect(f.registro!.relogio.finalizadoEm).toBe('')
    f = await assinarTecnico(await iniciarAssinaturas(f, sha256Hex, agora()), ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    f = desfazerAssinaturaTecnico(f, agora())
    expect(f.registro!.assinaturas).toEqual({ tecnico: null, cliente: null })
    expect(podeEditar(f)).toBe(true)
  })
})

describe('encerrar sem completar e recomeçar os ensaios', () => {
  it('encerrar sem completar: um motivo só; depois, assina como sempre', async () => {
    let f = comecar(folhaNova(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    expect(() => encerrarSemCompletar(f, 'INCOMPLETA', ' ', agora())).toThrow(/motivo/)
    f = encerrarSemCompletar(f, 'NAO_CALIBRADA', 'Balança não pesa corretamente (POP 7.8)', agora())
    f = await iniciarAssinaturas(f, sha256Hex, agora())
    f = await assinarTecnico(f, ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    f = clienteNaoAssinou(f, 'Encarregado ausente', agora())
    expect(f.registro).toMatchObject({ desfecho: 'NAO_CALIBRADA', motivoDesfecho: 'Balança não pesa corretamente (POP 7.8)' })
    expect(validarRegistro(f.registro, { pacote: f.pacote })).toEqual([])
    const volta = voltarACompletar(encerrarSemCompletar(folhaCompleta(), 'INCOMPLETA', 'x', agora()), agora())
    expect(volta.registro).toMatchObject({ desfecho: 'COMPLETA', motivoDesfecho: '' })
  })

  it('recomeçar: a tentativa fica só para consulta, os passos 5 a 7 recomeçam vazios, sem virar correção', () => {
    const f = folhaCompleta()
    const antes = f.registro!
    const depois = recomecarEnsaios(f, 'Troca da célula de carga', agora())
    const r = depois.registro!
    expect(r.tentativas).toHaveLength(1)
    expect(r.tentativas[0]).toMatchObject({ n: 1, motivo: 'Troca da célula de carga', encerradaEm: agora() })
    expect(r.tentativas[0].indicacao).toEqual(antes.passos.indicacao)
    expect(r.passos.indicacao.pontos.every((p) => !p.crescente && !p.decrescente)).toBe(true)
    expect(r.passos.repetibilidade.every((x) => x.leituras.length === 0)).toBe(true)
    expect(r.passos.ambiente.linhas.every((x) => !x.temperatura)).toBe(true)
    expect(r.passos.padroes).toEqual(antes.passos.padroes)
    expect(r.trilha).toEqual(antes.trilha)
    expect(depois.etapaAtual).toBe('ambiente')
    expect(() => recomecarEnsaios(f, '', agora())).toThrow(/motivo/)
  })
})

describe('depois de assinar: corrigir e reabrir', () => {
  async function finalizada() {
    let f = await iniciarAssinaturas(folhaCompleta(), sha256Hex, agora())
    f = await assinarTecnico(f, ASSINATURA_EXEMPLO_1, sha256Hex, agora())
    return sairDoModoEntrega(
      assinarCliente(f, { nome: 'Juliana Prado', funcao: 'Supervisora', png: ASSINATURA_EXEMPLO_2 }, agora()),
      agora(),
    )
  }

  it('correção depois da assinatura: por acréscimo; as assinaturas continuam valendo', async () => {
    const f = await finalizada()
    const campo = 'excentricidade.posicoes.3.leitura'
    const de = f.registro!.passos.excentricidade.posicoes[3].leitura!.valor
    expect(() => corrigirDepoisDaAssinatura(f, { campo, para: '100,00', motivo: '' }, agora())).toThrow(/motivo/)
    expect(() => corrigirDepoisDaAssinatura(f, { campo, para: de, motivo: 'x' }, agora())).toThrow(/igual/)
    expect(() => corrigirDepoisDaAssinatura(f, { campo, para: '100.00', motivo: 'x' }, agora())).toThrow(/vírgula/)
    const c = corrigirDepoisDaAssinatura(f, { campo, para: '100,00', motivo: 'Posição anotada errada' }, agora())
    expect(c.registro!.passos.excentricidade.posicoes[3].leitura!.valor).toBe(de)
    expect(c.registro!.correcoesPosAssinatura).toEqual([
      { campo, de, para: '100,00', em: agora(), motivo: 'Posição anotada errada', mostradoAoCliente: false },
    ])
    expect(await conferirAssinaturas(c.registro!, sha256Hex)).toEqual([])
    expect(calcularSha256Registro(c.registro!, sha256Hex)).not.toBe(calcularSha256Registro(f.registro!, sha256Hex))
    // Item do resumo mostrado ao cliente
    const amb = corrigirDepoisDaAssinatura(
      f,
      { campo: 'ambiente.linhas.0.temperatura', para: '24,8', motivo: 'Termômetro lido de novo' },
      agora(),
    )
    expect(amb.registro!.correcoesPosAssinatura[0]).toMatchObject({ de: '24,6', mostradoAoCliente: true })
    expect(campoMostradoAoCliente('chegada.localEndereco')).toBe(true)
    expect(campoMostradoAoCliente('indicacao.retornoZero')).toBe(false)
    // Na folha ainda não finalizada, não
    expect(() => corrigirDepoisDaAssinatura(folhaCompleta(), { campo, para: '1', motivo: 'x' }, agora())).toThrow(/finalizada/)
  })

  it('reabrir apaga as duas assinaturas e guarda o sha256 da versão anterior', async () => {
    let f = await finalizada()
    f = corrigirDepoisDaAssinatura(f, { campo: 'indicacao.retornoZero', para: '0,05', motivo: 'Retorno relido' }, agora())
    const sha = calcularSha256Registro(f.registro!, sha256Hex)
    const r = await reabrir(f, 'Refazer a excentricidade', sha256Hex, agora())
    expect(r.estado).toBe('REABERTA')
    expect(r.registro!.assinaturas).toEqual({ tecnico: null, cliente: null })
    expect(r.registro!.relogio.finalizadoEm).toBe('')
    expect(r.registro!.reaberturas).toEqual([{ em: agora(), motivo: 'Refazer a excentricidade', sha256Anterior: sha }])
    // A correção passou para os passos e para a trilha
    expect(r.registro!.correcoesPosAssinatura).toEqual([])
    expect(r.registro!.passos.indicacao.retornoZero?.valor).toBe('0,05')
    expect(r.registro!.trilha.at(-1)).toMatchObject({ campo: 'indicacao.retornoZero', para: '0,05', motivo: 'Retorno relido' })
    expect(podeEditar(r)).toBe(true)
    expect(validarRegistro(r.registro, { pacote: r.pacote, momento: 'FINALIZAR' })).toEqual([])
    await expect(reabrir(folhaCompleta(), 'x', sha256Hex, agora())).rejects.toThrow(/finalizada/)
  })

  it('entregue: as leituras e as assinaturas saem; fica o resumo e o recibo', async () => {
    const f = await finalizada()
    const recibo = {
      numero: f.numero,
      envioId: f.envioId,
      sha256: 'a'.repeat(64),
      recebidoEm: '2026-11-18T20:00:00.000Z',
      situacao: 'VALIDO' as const,
      marcas: [],
    }
    const e = marcarEntregue(f, recibo, agora())
    expect(e).toMatchObject({ estado: 'ENTREGUE', pacote: null, registro: null, recibo, entregueEm: agora() })
    expect(e.resumo.cliente).toBe(f.resumo.cliente)
    expect(() => marcarEntregue(folhaCompleta(), recibo, agora())).toThrow()
  })
})

describe('folhas só do cliente', () => {
  it('a balança informada vem vazia e é preenchida no local', () => {
    const f = comecar(folhaNova(pacoteDoCliente()), TECNICO_EXEMPLO, APARELHO_EXEMPLO, agora())
    expect(f.registro!.passos.balanca.informada).toBeDefined()
    const g = editar(f, (r) => (r.passos.balanca.informada!.fabricante = 'Toledo'), agora())
    expect(g.registro!.passos.balanca.informada!.fabricante).toBe('Toledo')
    expect(g.registro!.trilha).toEqual([])
  })
})
