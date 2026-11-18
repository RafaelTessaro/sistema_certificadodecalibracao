// Registros de campo de exemplo para a folha impressa assinada (server/pdf/registroCampo.ts), além dos de
// shared/campo/exemplos.ts: os casos que o PDF precisa mostrar e que lá não aparecem.
//
//   - folha em branco encerrada sem completar (INCOMPLETA): o cliente e a balança escritos no local (classe IIII),
//     só parte das leituras, uma anomalia, um aviso "Isto impede o certificado" com o motivo, uma reabertura, a
//     assinatura do cliente e uma correção depois da assinatura num item do resumo dele (a assinatura do cliente fica
//     "anterior à correção");
//   - plataforma do piloto NÃO CALIBRADA: a 1ª tentativa recomeçada depois da manutenção (vai para o anexo, só
//     consulta), a 2ª só com o ambiente e dois pontos, a excentricidade não feita e "O cliente assinou só o papel".
//
// Só para testes e amostras. Determinísticos (horários fixos em Brasília, −03:00).

import { calcularConteudoSha256, calcularSha256Pacote, sha256Hex } from '#shared/campo/canonico.ts'
import {
  APARELHO_EXEMPLO,
  pacoteEmBranco,
  pacotePlataforma,
  registroPlataforma,
  TECNICO_EXEMPLO,
} from '#shared/campo/exemplos.ts'
import { registroInicial } from '#shared/campo/registro.ts'
import type { Instante, LeituraCampo, PacoteCampo, RegistroCampo } from '#shared/campo/tipos.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from './assinaturasExemplo.ts'

/** Relógio dos exemplos: começa num horário de Brasília e anda `s` segundos a cada chamada. */
function relogio(inicio: string) {
  let ms = Date.parse(`${inicio}-03:00`)
  return (s = 0): Instante => {
    ms += s * 1000
    const d = new Date(ms - 3 * 3600_000)
    return `${d.toISOString().slice(0, 19)}-03:00`
  }
}

const le = (valor: string, em: Instante, via: LeituraCampo['via'] = 'teclado'): LeituraCampo => ({ valor, em, via })

/** Folha em branco encerrada sem completar: a balança parou de responder no meio do erro de indicação. */
export function registroEmBrancoIncompleto(): { pacote: PacoteCampo; registro: RegistroCampo } {
  const pacote = pacoteEmBranco()
  const t = relogio('2026-10-22T08:00:00')
  const r = registroInicial(pacote, TECNICO_EXEMPLO, APARELHO_EXEMPLO, {
    pacoteSha256: calcularSha256Pacote(pacote, sha256Hex),
    agora: t(),
  })
  const ps = r.passos
  ps.padroes.forEach((x) =>
    Object.assign(x, { levado: x.identificacao !== 'PP500-01 a 20', usado: ['JP-01', 'TH-01'].includes(x.identificacao) }),
  )
  ps.chegada.clienteInformado = {
    razaoSocial: 'Padaria Pão Dourado Ltda',
    documento: '12.345.678/0001-95',
    endereco: '',
    enderecoIgualAoLocal: true,
    contato: 'Márcia (gerente)',
    email: 'compras@paodourado.example',
  }
  ps.chegada.os = 'OS-2026-0601'
  ps.chegada.local = 'CLIENTE'
  ps.chegada.localEndereco = 'Rua 5, 1200 – Centro – Rio Claro/SP'
  ps.chegada.inicio = t(900)
  ps.balanca.informada = {
    tipo: 'Balcão',
    fabricante: 'Urano',
    modelo: 'POP-S 15',
    numeroSerie: 'UR-7731',
    identificacao: '',
    localInstalacao: 'Caixa da frente',
    anoFabricacao: '2012',
    apoios: '4',
    plataforma: '',
    portariaAprovacao: '',
    classe: 'IIII',
    tipoFaixas: 'UNICA',
    receptor: 'RETANGULAR',
    unidade: 'kg',
    faixas: [{ max: '15', e: '0,005', d: '0,005' }],
    min: '0,1',
  }
  Object.assign(ps.ambiente.linhas[0], {
    em: t(900),
    temperatura: le('27,4', t(5)),
    umidade: le('63', t(5)),
    pressao: null,
    instrumentos: ['pad-th01'],
  })
  r.anotacoes.push({
    id: 'an-1',
    passo: 5,
    tipo: 'ANOMALIA',
    campo: '',
    texto: 'O indicador apagou duas vezes com 10 kg no prato; fonte com mau contato.',
    em: t(400),
  })
  ps.indicacao.pontos = [0, 5, 10].map((carga, i) => ({
    id: `cel-p${i}`,
    acrescentado: true,
    cargaPrevista: '',
    cargaAplicada: le(String(carga), t(20)),
    pecas: [],
    pecasTrocadas: false,
    nivelSubstituicao: 0,
    crescente: i < 2 ? le(i === 0 ? '0,000' : '5,005', t(40)) : null,
    decrescente: null,
  }))
  r.avisosConferidos.push({
    codigo: 'NAO_PESA_CORRETAMENTE',
    classe: 'IMPEDE',
    campo: 'indicacao.pontos.cel-p1.crescente',
    texto: 'A balança não pesa corretamente: isto impede o certificado.',
    em: t(10),
    motivo: 'O indicador apagou; vou encerrar sem completar e voltar depois do conserto.',
  })
  ps.excentricidade.aplicavel = false
  ps.excentricidade.motivo = 'Não feito: a balança desligou antes do ensaio.'
  r.desfecho = 'INCOMPLETA'
  r.motivoDesfecho = 'O indicador desligou durante o erro de indicação; o cliente vai consertar a fonte.'
  r.trilha.push({ campo: 'chegada.local', de: 'LABORATORIO', para: 'CLIENTE', em: t(30), motivo: 'Toquei na opção errada.' })
  r.reaberturas.push({
    em: t(120),
    motivo: 'Faltava a anotação da anomalia.',
    sha256Anterior: '0'.repeat(64),
  })
  ps.final.dataCalibracao = '2026-10-22'
  ps.final.termino = t(300)
  r.relogio.finalizadoEm = t(60)
  const conteudo = calcularConteudoSha256(r, sha256Hex)
  r.assinaturas.tecnico = { nome: r.tecnico.nome, png: ASSINATURA_EXEMPLO_1, em: t(30), conteudoSha256: conteudo }
  r.assinaturas.cliente = {
    nome: 'Márcia Ribeiro',
    funcao: 'Gerente da loja',
    png: ASSINATURA_EXEMPLO_2,
    em: t(60),
    conteudoSha256: conteudo,
  }
  r.correcoesPosAssinatura.push({
    campo: 'ambiente.linhas.0.temperatura',
    de: '27,4',
    para: '24,7',
    em: t(240),
    motivo: 'Inverti os algarismos; o termo-higrômetro marcava 24,7 °C.',
    mostradoAoCliente: true,
  })
  return { pacote, registro: r }
}

/** Plataforma do piloto não calibrada: os ensaios recomeçados depois da manutenção, e a balança continuou sem pesar. */
export function registroNaoCalibradaComTentativa(): { pacote: PacoteCampo; registro: RegistroCampo } {
  const pacote = pacotePlataforma()
  const r = registroPlataforma()
  const t = relogio('2026-10-21T10:30:00')
  const ps = r.passos
  // A 1ª tentativa (os ensaios completos do exemplo da plataforma) fica guardada só para consulta
  r.tentativas.push({
    n: 1,
    motivo: 'Erro de 2 d em 300 kg: a célula de carga do canto trás direito foi trocada.',
    encerradaEm: t(),
    ambiente: structuredClone(ps.ambiente),
    indicacao: structuredClone(ps.indicacao),
    repetibilidade: structuredClone(ps.repetibilidade),
    excentricidade: structuredClone(ps.excentricidade),
  })
  // A 2ª: o ambiente de novo e dois pontos; o erro continuou e a folha foi encerrada como não calibrada
  ps.ambiente.linhas = [
    {
      momento: 'INICIO',
      em: t(3600),
      temperatura: le('25,8', t(5)),
      umidade: le('55', t(5)),
      pressao: le('948,1', t(10)),
      instrumentos: ['pad-th01', 'pad-br01'],
    },
    { momento: 'FIM', em: '', temperatura: null, umidade: null, pressao: null, instrumentos: [] },
  ]
  ps.indicacao.pontos.forEach((p, i) => {
    p.crescente = i < 2 ? le(i === 0 ? '0,00' : '1,00', t(50)) : null
    p.decrescente = null
  })
  ps.indicacao.retornoZero = null
  ps.repetibilidade.forEach((e) => (e.leituras = []))
  ps.excentricidade.aplicavel = false
  ps.excentricidade.motivo = 'Não feito: a balança não foi calibrada.'
  ps.excentricidade.posicoes.forEach((p) => (p.leitura = null))
  r.avisosConferidos = [
    {
      codigo: 'NAO_PESA_CORRETAMENTE',
      classe: 'IMPEDE',
      campo: 'indicacao.pontos.p1.crescente',
      texto: 'A balança não pesa corretamente: isto impede o certificado.',
      em: t(5),
      motivo: 'Mesmo depois da troca da célula, o erro passou do limite; o cliente vai chamar a assistência.',
    },
  ]
  r.trilha = []
  r.correcoesPosAssinatura = []
  r.desfecho = 'NAO_CALIBRADA'
  r.motivoDesfecho = 'A balança continuou fora do limite depois da manutenção; o cliente vai chamar a assistência do fabricante.'
  ps.final.termino = t(300)
  r.relogio.finalizadoEm = t(60)
  const conteudo = calcularConteudoSha256(r, sha256Hex)
  r.assinaturas.tecnico = { nome: r.tecnico.nome, png: ASSINATURA_EXEMPLO_1, em: t(30), conteudoSha256: conteudo }
  r.assinaturas.cliente = { soNoPapel: true }
  return { pacote, registro: r }
}
