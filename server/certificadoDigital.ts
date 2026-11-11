// O certificado digital ICP-Brasil da empresa (e-CNPJ A1 ou SE-S): o serviço que guarda (cofre), abre na partida, diz a
// situação, entrega a chave para assinar os certificados de calibração e avisa antes de vencer (PLANO §2.3, §2.4, §2.8).
//
// O segredo (a chave, o .pfx, a senha) nunca vai para o banco, as cópias, os registros, os e-mails, as mensagens de erro ou
// as respostas da API: a chave fica cifrada no cofre (server/assinatura/cofre.ts) e, aberta, só na memória (KeyObject). O
// banco guarda só os dados públicos (tabela `certificados_digitais`).
//
// Instalar e trocar pode ser feito de qualquer computador da rede (decisão do dono), só pelo administrador, com a senha
// dele pedida de novo e o limite de tentativas. Como a rede usa HTTP sem criptografia (e o navegador não oferece o
// WebCrypto fora de HTTPS), o navegador cifra o .pfx e as senhas (src/lib/cifraPacote.ts): uma chave AES-256-GCM aleatória
// e essa chave cifrada com RSA-OAEP-SHA256 por uma chave do servidor que vale 10 minutos, uma vez só, e fica só na memória.

import {
  constants,
  createDecipheriv,
  generateKeyPair,
  type KeyObject,
  privateDecrypt,
  randomBytes,
  randomUUID,
  type X509Certificate,
} from 'node:crypto'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { mascaraCnpj, normalizarCnpj } from '#shared/documentos.ts'
import { emailValido } from '#shared/dominio.ts'
import { pode } from '#shared/permissoes.ts'
import type {
  CertificadoDigitalPublico,
  RegistroCertificadoDigital,
  SituacaoCertificadoDigital,
  UsuarioSessao,
} from '#shared/tipos.ts'
import { ipDe } from './acesso.ts'
import {
  abrirCofre,
  apagarCofre,
  arquivoDoCofre,
  type ArquivoCofre,
  ErroCofre,
  gravarCofre,
  lerArquivoCofre,
  type Protetor,
  protetorAesTeste,
  protetorDoServidor,
} from './assinatura/cofre.ts'
import {
  type A1ParaAssinar,
  type DadosCertificadoDigital,
  ErroCertificadoDigital,
  type PublicoParaRemontar,
  type ServicoCertificadoDigital,
} from './assinatura/contrato.ts'
import { type BuscarEndereco, mesmaRaizCnpj } from './assinatura/icp.ts'
import {
  abrirPfx,
  avisoVencimento,
  completarCadeia,
  conferirA1,
  dadosDoCertificado,
  dataHoraBr,
  diasParaVencer,
} from './assinatura/pfx.ts'
import type { Contexto } from './contexto.ts'
import { gravarMeta, lerMeta } from './db.ts'
import { configPublica, lerConfigEmail, type MensagemEmail } from './email.ts'
import { ErroApi } from './erros.ts'
import { ehLoopback } from './usuarios.ts'

const gerarParDeChaves = promisify(generateKeyPair)

/** Onde a tela manda a pessoa resolver. */
const ONDE = 'Configurações → Certificado digital'

/** Faixas dos avisos de vencimento (dias antes): um registro no log e um e-mail por faixa. */
export const FAIXAS_VENCIMENTO = [30, 15, 7, 1] as const

/** A faixa já avisada de cada certificado (`<sha256>|<faixa>`), na tabela meta. */
export const META_AVISO_VENCIMENTO = 'certificado_digital_aviso'

/** O arquivo do certificado não está na pasta de dados, mas o banco diz que há um instalado (não foi removido pela tela). */
export const MSG_SEM_ARQUIVO =
  'O arquivo do certificado digital (certificado-digital.json) não está na pasta de dados. Envie o arquivo .pfx de novo, ou remova o certificado.'

const dataBr = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)

/**
 * A recusa de quem vai emitir (o operador também emite): o fato e que a emissão fica bloqueada até o administrador
 * resolver (`resolver`: o que ele faz; padrão: resolver em Configurações → Certificado digital). `motivo` (o fato, sem o
 * que fazer) e `resolver` vão juntos para o texto do certificado que fica aguardando a assinatura (o mesmo lugar).
 */
const erro409 = (fato: string, resolver = `resolver em ${ONDE}`) =>
  new ErroApi(409, `${fato} A emissão fica bloqueada até o administrador ${resolver}.`, {
    codigo: 'CERTIFICADO_DIGITAL',
    motivo: fato,
    resolver,
  })

/** Os dados públicos de um certificado e quem o instalou. */
interface Publico {
  dados: DadosCertificadoDigital
  instaladoEm: string
  instaladoPor: string
}

type Estado =
  | { tipo: 'abrindo' }
  | { tipo: 'ausente' }
  | { tipo: 'aberto'; a1: A1ParaAssinar; publico: Publico }
  | { tipo: 'nao-abre'; motivo: string; publico: Publico | null }

export interface OpcoesCertificadoDigital {
  /** Quem cifra a chave guardada; padrão: o DPAPI no Windows (protetorDoServidor). */
  protetor?: Protetor
  /** A lista de confiança; padrão: as raízes ICP-Brasil fixadas (os testes passam a raiz de teste). */
  raizes?: X509Certificate[]
  /** A busca das ACs pelo caIssuers (AIA), quando o .pfx não as traz. */
  buscar?: BuscarEndereco
  /** O relógio (os testes trocam). */
  agora?: () => Date
  /** O envio do aviso de vencimento por e-mail (o módulo de e-mail do servidor). */
  enviarEmail?: (m: MensagemEmail) => Promise<unknown>
}

export interface AutorCertificado {
  id: string
  login: string
  nome: string
}

/** O resultado da conferência (nada gravado): os dados públicos, a situação que teria e os avisos. */
export interface ConferenciaCertificado {
  certificado: CertificadoDigitalPublico
}

export interface ServicoCertificadoDigitalCompleto extends ServicoCertificadoDigital {
  /** Abre o .pfx e confere tudo (§2.4), sem gravar nada. Lança ErroCertificadoDigital com a mensagem para a tela. */
  conferir(pfx: Buffer, senha: string, cnpjEmpresa: string, agora?: Date): Promise<ConferenciaCertificado>
  /**
   * Confere de novo, cifra, grava o cofre (reaberto do disco antes de trocar), registra no banco (o anterior fica
   * SUBSTITUIDO) e passa a assinar com ele. `anterior`: o que estava instalado, se era outro.
   */
  instalar(
    pfx: Buffer,
    senha: string,
    autor: AutorCertificado,
    cnpjEmpresa: string,
    agora?: Date,
  ): Promise<{ certificado: CertificadoDigitalPublico; anterior: DadosCertificadoDigital | null }>
  /**
   * Apaga o cofre e marca o instalado como removido: os próximos certificados saem sem assinatura digital. Devolve o que
   * foi removido (null: o arquivo estava ilegível e o banco não o conhecia).
   */
  remover(autor: AutorCertificado, agora?: Date): Promise<DadosCertificadoDigital | null>
  /** Os certificados já instalados (o instalado primeiro). */
  historico(): RegistroCertificadoDigital[]
  /** O aviso de vencimento da faixa em que o certificado entrou (30, 15, 7 e 1 dia), uma vez por faixa. */
  verificarVencimento(agora?: Date): Promise<{ faixa: number; dias: number } | null>
}

/** A situação e os avisos de um certificado, pelo relógio e pelo CNPJ da empresa (o mais grave primeiro). */
export function classificar(
  dados: DadosCertificadoDigital,
  cnpjEmpresa: string,
  agora: Date,
): { situacao: SituacaoCertificadoDigital; avisos: string[] } {
  const de = new Date(dados.validoDe)
  const ate = new Date(dados.validoAte)
  const avisos: string[] = []
  let situacao: SituacaoCertificadoDigital = 'OK'
  const piorar = (s: SituacaoCertificadoDigital) => {
    if (situacao === 'OK') situacao = s
  }
  // Os avisos vão para o cartão de Configurações → Certificado digital (só o administrador vê)
  if (agora < de) {
    piorar('AINDA_NAO_VALE')
    avisos.push(`O certificado digital só vale a partir de ${dataBr(de)}. Confira a data e a hora do servidor.`)
  } else if (agora > ate) {
    piorar('VENCIDO')
    avisos.push(`O certificado digital venceu em ${dataBr(ate)}. Instale o novo (renovado) para voltar a emitir certificados.`)
  }
  const empresa = normalizarCnpj(cnpjEmpresa ?? '')
  if (!empresa) {
    piorar('EMPRESA_SEM_CNPJ')
    avisos.push(
      'O CNPJ da empresa não está preenchido em Configurações → Empresa. Ele é conferido com o do certificado digital: até preencher, o sistema não emite certificados.',
    )
  } else if (empresa !== dados.cnpj) {
    if (mesmaRaizCnpj(empresa, dados.cnpj))
      avisos.push(
        `O certificado é do CNPJ ${mascaraCnpj(dados.cnpj)}, outro estabelecimento da mesma empresa (o de Configurações é ${mascaraCnpj(empresa)}).`,
      )
    else {
      piorar('CNPJ_DIFERENTE')
      avisos.push(
        `O certificado digital é do CNPJ ${mascaraCnpj(dados.cnpj)}, e o da empresa em Configurações → Empresa é ${mascaraCnpj(empresa)}.`,
      )
    }
  }
  const vencimento = avisoVencimento(ate, agora)
  if (vencimento) {
    piorar('VENCENDO')
    avisos.push(`${vencimento} Instale o novo (renovado) antes disso: a partir desse horário, o sistema não emite certificados.`)
  }
  return { situacao, avisos }
}

/**
 * O fato que impede o certificado de assinar agora (para quem emite, o operador também), e o que o administrador faz; null
 * = nenhum impedimento pela situação.
 */
export function impedimentoDaSituacao(
  situacao: SituacaoCertificadoDigital,
  dados: Pick<DadosCertificadoDigital, 'cnpj' | 'validoDe' | 'validoAte'>,
  cnpjEmpresa: string,
): { fato: string; resolver?: string } | null {
  switch (situacao) {
    case 'VENCIDO':
      return { fato: `O certificado digital da empresa venceu em ${dataBr(new Date(dados.validoAte))}.` }
    case 'AINDA_NAO_VALE':
      return {
        fato: `O certificado digital da empresa só vale a partir de ${dataBr(new Date(dados.validoDe))} (confira a data e a hora do servidor).`,
      }
    case 'CNPJ_DIFERENTE':
      return {
        fato: `O certificado digital da empresa é do CNPJ ${mascaraCnpj(dados.cnpj)}, diferente do que está em Configurações → Empresa (${mascaraCnpj(normalizarCnpj(cnpjEmpresa))}).`,
        resolver: `corrigir o CNPJ da empresa ou instalar o certificado digital certo em ${ONDE}`,
      }
    case 'EMPRESA_SEM_CNPJ':
      return {
        fato: 'O CNPJ da empresa não está preenchido em Configurações → Empresa (ele é conferido com o do certificado digital).',
        resolver: 'preencher',
      }
    default:
      return null
  }
}

const mesmaCadeia = (a: Buffer[], b: Buffer[]) => a.length === b.length && a.every((c, i) => c.equals(b[i]))

export function criarServicoCertificadoDigital(
  ctx: Pick<Contexto, 'db' | 'repo' | 'usuarios' | 'pastaDados' | 'log'>,
  opcoes: OpcoesCertificadoDigital = {},
): ServicoCertificadoDigitalCompleto {
  // Nos testes, sem um protetor dado, um AES com a chave só na memória (nenhum arquivo de chave fora da pasta de teste)
  const protetor =
    opcoes.protetor ?? (process.env.VITEST ? protetorAesTeste(randomBytes(32)) : protetorDoServidor(ctx.pastaDados))
  const relogio = opcoes.agora ?? (() => new Date())
  const { raizes, buscar } = opcoes
  let estado: Estado = { tipo: 'abrindo' }

  /** Uma gravação por vez (instalar, trocar, remover). */
  let fila: Promise<unknown> = Promise.resolve()
  function emFila<T>(fn: () => Promise<T>): Promise<T> {
    const r = fila.then(fn, fn)
    fila = r.then(
      () => undefined,
      () => undefined,
    )
    return r
  }

  function publicoDoArquivo(a: ArquivoCofre | null): Publico | null {
    if (!a) return null
    try {
      return {
        dados: dadosDoCertificado(Buffer.from(a.certificado, 'base64')),
        instaladoEm: a.instaladoEm,
        instaladoPor: a.instaladoPor,
      }
    } catch {
      return null
    }
  }

  const publicoDoRegistro = (r: RegistroCertificadoDigital): Publico => ({
    dados: {
      sha256: r.sha256,
      titular: r.titular,
      cnpj: r.cnpj,
      tipo: r.tipo,
      emissor: r.emissor,
      serie: r.serie,
      validoDe: r.validoDe,
      validoAte: r.validoAte,
    },
    instaladoEm: r.instaladoEm,
    instaladoPor: r.instaladoPor,
  })

  /**
   * O banco acompanha o cofre (o que está no cofre é o instalado): a linha que falta (o banco voltou de uma cópia anterior
   * à instalação) é recriada pelo cabeçalho do cofre, e outra marcada como instalada passa a substituída.
   */
  function conciliar(a: ArquivoCofre) {
    try {
      const ativo = ctx.repo.certificadoDigitalAtivo()
      const existe = ctx.repo.certificadoDigitalPublico(a.sha256)
      if (existe && ativo?.sha256 === a.sha256) return
      const publico = publicoDoArquivo(a)
      if (!publico) return
      ctx.repo.registrarCertificadoDigital({
        dados: publico.dados,
        certificadoDer: Buffer.from(a.certificado, 'base64'),
        cadeiaDer: a.cadeia.map((c) => Buffer.from(c, 'base64')),
        instaladoEm: a.instaladoEm || relogio().toISOString(),
        instaladoPor: a.instaladoPor,
      })
      ctx.log.warn(
        existe
          ? '[certificado digital] o banco marcava outro certificado como instalado: vale o do cofre'
          : '[certificado digital] o banco não tinha o certificado do cofre (voltou de uma cópia anterior à instalação): linha recriada',
      )
    } catch (e) {
      ctx.log.error(e, '[certificado digital] falha ao conciliar o banco com o cofre')
    }
  }

  /** A cadeia gravada no banco para este certificado (a que foi nas assinaturas feitas com ele) é a que vale. */
  function comCadeiaDoBanco(a1: A1ParaAssinar): A1ParaAssinar {
    const publico = ctx.repo.certificadoDigitalPublico(a1.dados.sha256)
    return publico && !mesmaCadeia(publico.cadeiaDer, a1.cadeiaDer) ? { ...a1, cadeiaDer: publico.cadeiaDer } : a1
  }

  async function abrir() {
    const r = await abrirCofre(ctx.pastaDados, protetor)
    if (r.situacao === 'aberto') {
      conciliar(r.arquivo)
      estado = { tipo: 'aberto', a1: comCadeiaDoBanco(r.a1), publico: publicoDoArquivo(r.arquivo)! }
      return
    }
    if (r.situacao === 'nao-abre') {
      ctx.log.warn(`[certificado digital] o cofre não abre no servidor: ${r.motivo}${r.detalhe ? ` (${r.detalhe})` : ''}`)
      if (r.arquivo) conciliar(r.arquivo)
      const ativo = ctx.repo.certificadoDigitalAtivo()
      estado = { tipo: 'nao-abre', motivo: r.motivo, publico: publicoDoArquivo(r.arquivo) ?? (ativo && publicoDoRegistro(ativo)) }
      return
    }
    // Sem o arquivo: com um instalado no banco (não removido pela tela), a emissão não sai sem assinatura em silêncio
    const ativo = ctx.repo.certificadoDigitalAtivo()
    estado = ativo ? { tipo: 'nao-abre', motivo: MSG_SEM_ARQUIVO, publico: publicoDoRegistro(ativo) } : { tipo: 'ausente' }
    if (ativo) ctx.log.warn(`[certificado digital] ${MSG_SEM_ARQUIVO}`)
  }

  const inicial = abrir().catch((e) => {
    ctx.log.error(e, '[certificado digital] falha ao abrir o cofre')
    estado = {
      tipo: 'nao-abre',
      motivo: 'Não foi possível abrir o certificado digital guardado. Envie o arquivo .pfx de novo.',
      publico: null,
    }
  })

  function publicoAtual(): Publico | null {
    if (estado.tipo === 'aberto' || estado.tipo === 'nao-abre') return estado.publico
    if (estado.tipo === 'abrindo') {
      const a = publicoDoArquivo(lerArquivoCofre(ctx.pastaDados))
      const ativo = ctx.repo.certificadoDigitalAtivo()
      return a ?? (ativo && publicoDoRegistro(ativo))
    }
    return null
  }

  function paraTela(p: Publico, situacao: SituacaoCertificadoDigital, avisos: string[], agora: Date): CertificadoDigitalPublico {
    return {
      situacao,
      titular: p.dados.titular,
      cnpj: p.dados.cnpj,
      tipo: p.dados.tipo,
      emissor: p.dados.emissor,
      serie: p.dados.serie,
      sha256: p.dados.sha256,
      validoDe: p.dados.validoDe,
      validoAte: p.dados.validoAte,
      diasParaVencer: diasParaVencer(p.dados.validoAte, agora),
      instaladoEm: p.instaladoEm,
      instaladoPor: p.instaladoPor,
      avisos,
    }
  }

  function estadoPublico(cnpjEmpresa: string, agora = relogio()): CertificadoDigitalPublico {
    if (estado.tipo === 'ausente') return { situacao: 'SEM_CERTIFICADO', avisos: [] }
    const p = publicoAtual()
    if (estado.tipo === 'nao-abre') {
      if (!p) return { situacao: 'NAO_ABRE', avisos: [estado.motivo] }
      return paraTela(p, 'NAO_ABRE', [estado.motivo, ...classificar(p.dados, cnpjEmpresa, agora).avisos], agora)
    }
    if (!p) return { situacao: 'SEM_CERTIFICADO', avisos: [] }
    const { situacao, avisos } = classificar(p.dados, cnpjEmpresa, agora)
    return paraTela(
      p,
      situacao,
      estado.tipo === 'abrindo' ? ['O certificado digital ainda está sendo aberto.', ...avisos] : avisos,
      agora,
    )
  }

  // As recusas vão para quem emite (o operador também): o fato e que é com o administrador. O porquê de não abrir e o que
  // fazer ficam no cartão de Configurações → Certificado digital (`estado`), que só o administrador vê
  function paraAssinar(cnpjEmpresa: string, agora = relogio()): A1ParaAssinar | null {
    if (estado.tipo === 'ausente') return null
    if (estado.tipo === 'abrindo')
      throw new ErroApi(409, 'O certificado digital da empresa ainda está sendo aberto. Tente de novo em alguns segundos.', {
        codigo: 'CERTIFICADO_DIGITAL',
        motivo: 'O certificado digital da empresa ainda estava sendo aberto.',
      })
    if (estado.tipo === 'nao-abre') throw erro409('O certificado digital da empresa não abre no servidor.')
    const { situacao } = classificar(estado.a1.dados, cnpjEmpresa, agora)
    const impedimento = impedimentoDaSituacao(situacao, estado.a1.dados, cnpjEmpresa)
    if (impedimento) throw erro409(impedimento.fato, impedimento.resolver)
    try {
      conferirA1(estado.a1, { cnpjEmpresa, agora, raizes })
    } catch (e) {
      if (e instanceof ErroCertificadoDigital) throw erro409(e.message)
      throw e
    }
    return estado.a1
  }

  async function abrirEConferir(pfx: Buffer, senha: string, cnpjEmpresa: string, agora: Date) {
    let a1 = abrirPfx(pfx, senha, { raizes })
    a1 = comCadeiaDoBanco(await completarCadeia(a1, { raizes, buscar }))
    const { avisos } = conferirA1(a1, { cnpjEmpresa, agora, raizes })
    return { a1, avisos }
  }

  /**
   * Os emitidos aguardando a assinatura (ainda sem as partes) que o certificado `dados` não assinaria: só um do CNPJ e do
   * titular congelados na emissão assina (`pdfAssinado`, em server/certificados.ts). O aviso da conferência, antes de
   * instalar ou trocar (o Remover também avisa): depois, Configurações mostra o novo "Em dia" e nada sobre eles.
   */
  function avisoDosPendentes(dados: DadosCertificadoDigital): string[] {
    const presos = ctx.repo.emitidosSemPdf().flatMap((id) => {
      const k = ctx.repo.obterCalibracao(id)
      const d = k?.emissao?.assinaturaDigital
      if (!k || !d || k.emissao?.assinatura) return []
      const assina = normalizarCnpj(d.cnpj) === normalizarCnpj(dados.cnpj) && d.titular.trim() === dados.titular.trim()
      return assina ? [] : [{ numero: k.numero, d }]
    })
    if (!presos.length) return []
    if (presos.length === 1) {
      const [{ numero, d }] = presos
      return [
        `O certificado ${numero} aguarda a assinatura digital, e este certificado digital não o assina: só um de ` +
          `${d.titular} (CNPJ ${mascaraCnpj(d.cnpj)}) pode assiná-lo. Depois de instalar este, para entregá-lo, use ` +
          '“Corrigir certificado” na ficha dele: a correção sai assinada com este.',
      ]
    }
    const numeros = presos.map((p) => p.numero)
    return [
      `Os certificados ${numeros.slice(0, -1).join(', ')} e ${numeros.at(-1)} aguardam a assinatura digital, e este ` +
        'certificado digital não os assina: cada um só pode ser assinado por um do CNPJ e do titular com que foi emitido. ' +
        'Depois de instalar este, para entregá-los, use “Corrigir certificado” na ficha de cada um: a correção sai assinada ' +
        'com este.',
    ]
  }

  async function conferir(pfx: Buffer, senha: string, cnpjEmpresa: string, agora = relogio()): Promise<ConferenciaCertificado> {
    const { a1, avisos } = await abrirEConferir(pfx, senha, cnpjEmpresa, agora)
    const { situacao } = classificar(a1.dados, cnpjEmpresa, agora)
    return {
      certificado: paraTela(
        { dados: a1.dados, instaladoEm: '', instaladoPor: '' },
        situacao,
        [...avisos, ...avisoDosPendentes(a1.dados)],
        agora,
      ),
    }
  }

  function instalar(pfx: Buffer, senha: string, autor: AutorCertificado, cnpjEmpresa: string, agora = relogio()) {
    return emFila(async () => {
      // A abertura da partida termina antes: senão ela poria de volta o cofre anterior por cima do novo
      await inicial
      const { a1 } = await abrirEConferir(pfx, senha, cnpjEmpresa, agora)
      const antes = publicoAtual()
      const instaladoEm = agora.toISOString()
      const instaladoPor = `${autor.nome} (${autor.login})`
      try {
        await gravarCofre(ctx.pastaDados, protetor, a1, { instaladoEm, instaladoPor })
      } catch (e) {
        if (e instanceof ErroCofre && e.detalhe) ctx.log.warn(`[certificado digital] ${e.message} (${e.detalhe})`)
        throw e
      }
      try {
        ctx.repo.registrarCertificadoDigital({
          dados: a1.dados,
          certificadoDer: a1.certificadoDer,
          cadeiaDer: a1.cadeiaDer,
          instaladoEm,
          instaladoPor,
        })
      } catch (e) {
        // O cofre já foi trocado: a linha volta na conciliação da próxima partida
        ctx.log.error(e, '[certificado digital] falha ao registrar o certificado instalado no banco')
      }
      estado = { tipo: 'aberto', a1, publico: { dados: a1.dados, instaladoEm, instaladoPor } }
      ctx.repo.avisar('config')
      const anterior = antes && antes.dados.sha256 !== a1.dados.sha256 ? antes.dados : null
      return { certificado: estadoPublico(cnpjEmpresa, agora), anterior }
    })
  }

  function remover(autor: AutorCertificado, agora = relogio()) {
    return emFila(async () => {
      await inicial
      if (estado.tipo === 'ausente') throw new ErroApi(404, 'Nenhum certificado digital instalado.')
      const ativos = ctx.repo.certificadosDigitais().filter((r) => !r.removidoEm)
      const removido = publicoAtual()?.dados ?? (ativos[0] ? publicoDoRegistro(ativos[0]).dados : null)
      apagarCofre(ctx.pastaDados)
      const em = agora.toISOString()
      const por = `${autor.nome} (${autor.login})`
      for (const r of ativos) ctx.repo.marcarCertificadoDigitalRemovido(r.sha256, em, por, 'REMOVIDO')
      estado = { tipo: 'ausente' }
      ctx.repo.avisar('config')
      return removido
    })
  }

  async function verificarVencimento(agora = relogio()) {
    await inicial
    const p = estado.tipo === 'aberto' ? estado.publico : null
    if (!p) return null
    const ate = new Date(p.dados.validoAte)
    if (agora > ate) return null
    const dias = diasParaVencer(ate, agora)
    const faixa = [...FAIXAS_VENCIMENTO].reverse().find((f) => dias <= f)
    if (faixa === undefined) return null
    const [sha, avisada] = (lerMeta(ctx.db, META_AVISO_VENCIMENTO) ?? '').split('|')
    if (sha === p.dados.sha256 && Number(avisada) <= faixa) return null
    gravarMeta(ctx.db, META_AVISO_VENCIMENTO, `${p.dados.sha256}|${faixa}`)
    const texto = avisoVencimento(ate, agora) ?? ''
    // "… às 20:59 (TITULAR, série X)." — o ponto final do aviso vai para depois do parêntese
    ctx.usuarios.registrar('CERTIFICADO_DIGITAL', {
      detalhe: `${texto.replace(/\.$/, '')} (${p.dados.titular}, série ${p.dados.serie}).`,
    })
    ctx.log.warn(`[certificado digital] ${texto}`)
    const para = ctx.repo.obterConfig().empresa.email.trim()
    if (opcoes.enviarEmail && emailValido(para) && configPublica(lerConfigEmail(ctx)).configurado) {
      const quando = dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`
      try {
        await opcoes.enviarEmail({
          para: [para],
          assunto: `O certificado digital da empresa vence ${quando} — BC Calibração`,
          texto: [
            `O certificado digital ICP-Brasil que assina os certificados de calibração (${p.dados.titular}, CNPJ ${mascaraCnpj(p.dados.cnpj)}) vence ${quando}, em ${dataHoraBr(ate)}.`,
            '',
            `A partir desse horário, o BC Calibração não emite certificados até o novo ser instalado. Instale o certificado novo em ${ONDE}.`,
            '',
            'Mensagem automática do BC Calibração.',
          ].join('\n'),
          anexos: [],
        })
      } catch (e) {
        ctx.log.warn({ err: e }, '[certificado digital] não foi possível enviar o aviso de vencimento por e-mail')
      }
    }
    return { faixa, dias }
  }

  return {
    pronto: () => inicial,
    // Abrindo ainda: há um cofre gravado, ou um instalado no banco (o cofre que sumiu não libera a emissão sem assinatura)
    instalado: () =>
      estado.tipo === 'abrindo'
        ? existsSync(arquivoDoCofre(ctx.pastaDados)) || !!ctx.repo.certificadoDigitalAtivo()
        : estado.tipo !== 'ausente',
    estado: estadoPublico,
    paraAssinar,
    publicoPorSha256: (sha256: string): PublicoParaRemontar | null => {
      const doBanco = ctx.repo.certificadoDigitalPublico(sha256)
      if (doBanco) return doBanco
      return estado.tipo === 'aberto' && estado.a1.dados.sha256 === sha256
        ? { certificadoDer: estado.a1.certificadoDer, cadeiaDer: estado.a1.cadeiaDer }
        : null
    },
    conferir,
    instalar,
    remover,
    historico: () => ctx.repo.certificadosDigitais(),
    verificarVencimento,
  }
}

// ---- O envio cifrado pelo navegador -------------------------------------------------------------------------------

/** Quanto vale a chave de envio (e quantas um administrador pode pedir). */
export const LIMITES_ENVIO = {
  validadeMs: 10 * 60_000,
  /** Chaves vivas por usuário (pedir mais descarta a mais antiga). */
  vivasPorUsuario: 5,
  /** Chaves pedidas por usuário a cada 10 minutos. */
  pedidasPorJanela: 30,
  /** O .pfx (decodificado). */
  bytesPfx: 64 * 1024,
  /** O corpo da requisição (o pacote cifrado, em base64). */
  bytesCorpo: 256 * 1024,
}

const PACOTE_INVALIDO = 'Não foi possível ler os dados enviados. Recarregue a página e tente de novo.'

interface ChaveEnvio {
  privada: KeyObject
  usuarioId: string
  criadaEm: number
}

/** As chaves RSA de envio: em memória, de um uso só, por 10 minutos, presas ao administrador que pediu. */
export class ChavesDeEnvio {
  private chaves = new Map<string, ChaveEnvio>()
  private pedidas = new Map<string, number[]>()
  private agora: () => number

  constructor(agora: () => number = () => Date.now()) {
    this.agora = agora
  }

  private limpar() {
    const agora = this.agora()
    for (const [id, c] of this.chaves) if (agora - c.criadaEm >= LIMITES_ENVIO.validadeMs) this.chaves.delete(id)
    for (const [u, l] of this.pedidas) {
      const recentes = l.filter((t) => agora - t < LIMITES_ENVIO.validadeMs)
      if (recentes.length) this.pedidas.set(u, recentes)
      else this.pedidas.delete(u)
    }
  }

  async nova(usuarioId: string): Promise<{ id: string; publicKeyPem: string; expiraEm: string }> {
    this.limpar()
    const agora = this.agora()
    const pedidas = this.pedidas.get(usuarioId) ?? []
    if (pedidas.length >= LIMITES_ENVIO.pedidasPorJanela || this.chaves.size >= 200)
      throw new ErroApi(429, 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.', {
        codigo: 'MUITAS_TENTATIVAS',
        esperarSegundos: 120,
      })
    this.pedidas.set(usuarioId, [...pedidas, agora])
    const doUsuario = [...this.chaves].filter(([, c]) => c.usuarioId === usuarioId)
    for (const [id] of doUsuario.slice(0, Math.max(0, doUsuario.length - LIMITES_ENVIO.vivasPorUsuario + 1)))
      this.chaves.delete(id)
    const { publicKey, privateKey } = await gerarParDeChaves('rsa', { modulusLength: 2048 })
    const id = randomUUID()
    this.chaves.set(id, { privada: privateKey, usuarioId, criadaEm: agora })
    return {
      id,
      publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }) as string,
      expiraEm: new Date(agora + LIMITES_ENVIO.validadeMs).toISOString(),
    }
  }

  /** Abre o pacote com a chave `id` (que deixa de existir: um uso só). */
  abrir(corpo: unknown, usuarioId: string): Record<string, unknown> {
    this.limpar()
    const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
    const id = typeof c.id === 'string' ? c.id : ''
    const chave = this.chaves.get(id)
    if (chave) this.chaves.delete(id)
    if (!chave || chave.usuarioId !== usuarioId)
      throw new ErroApi(400, 'A chave de envio venceu ou já foi usada. Tente de novo.', { codigo: 'CHAVE_ENVIO' })
    return abrirPacote(c, chave.privada, id)
  }

  get tamanho() {
    return this.chaves.size
  }
}

const base64 = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max && /^[A-Za-z0-9+/]*={0,2}$/.test(v) ? Buffer.from(v, 'base64') : null

/**
 * O pacote do navegador: `chave` (a chave AES-256 cifrada com RSA-OAEP-SHA256), `iv` (12 bytes) e `dados` (o JSON cifrado
 * com AES-256-GCM, com a etiqueta de 16 bytes no fim e o `id` da chave como dado adicional). O erro nunca traz o conteúdo.
 */
export function abrirPacote(c: Record<string, unknown>, privada: KeyObject, id: string): Record<string, unknown> {
  const chave = base64(c.chave, 2048)
  const iv = base64(c.iv, 64)
  const dados = base64(c.dados, LIMITES_ENVIO.bytesCorpo)
  if (!chave || !iv || iv.length !== 12 || !dados || dados.length < 17)
    throw new ErroApi(400, PACOTE_INVALIDO, { codigo: 'PACOTE_INVALIDO' })
  let aes: Buffer | undefined
  let aberto: Buffer | undefined
  try {
    aes = privateDecrypt({ key: privada, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, chave)
    if (aes.length !== 32) throw new Error('chave')
    const d = createDecipheriv('aes-256-gcm', aes, iv)
    d.setAAD(Buffer.from(id, 'utf8'))
    d.setAuthTag(dados.subarray(dados.length - 16))
    aberto = Buffer.concat([d.update(dados.subarray(0, dados.length - 16)), d.final()])
    const json = JSON.parse(aberto.toString('utf8')) as unknown
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('formato')
    return json as Record<string, unknown>
  } catch {
    // Nunca a mensagem original: o JSON.parse cita um pedaço do texto lido
    throw new ErroApi(400, PACOTE_INVALIDO, { codigo: 'PACOTE_INVALIDO' })
  } finally {
    aes?.fill(0)
    aberto?.fill(0)
  }
}

// ---- Rotas -------------------------------------------------------------------------------------------------------

/** O que a tela de quem não cuida das configurações recebe (a faixa do Painel do operador: "vence em N dias"). */
const resumo = (c: CertificadoDigitalPublico) => ({
  situacao: c.situacao,
  ...(c.titular ? { titular: c.titular } : {}),
  ...(c.validoAte ? { validoAte: c.validoAte } : {}),
  ...(c.diasParaVencer !== undefined ? { diasParaVencer: c.diasParaVencer } : {}),
})

const autorDe = (u: UsuarioSessao): AutorCertificado => ({ id: u.id, login: u.login, nome: u.nome })

/** O .pfx e a senha dele do pacote aberto. */
function pfxDoPacote(p: Record<string, unknown>): { pfx: Buffer; senha: string } {
  const pfx = base64(p.pfx, Math.ceil((LIMITES_ENVIO.bytesPfx * 4) / 3) + 4)
  if (!pfx || !pfx.length) throw new ErroApi(400, 'Escolha o arquivo do certificado (.pfx ou .p12), de até 64 KB.')
  const senha = typeof p.senha === 'string' ? p.senha.slice(0, 500) : ''
  if (!senha) throw new ErroApi(400, 'Digite a senha do arquivo do certificado.')
  return { pfx, senha }
}

/** O erro do núcleo para a tela: a mensagem já é segura (sem a senha nem a chave). */
function traduzir(e: unknown, log: FastifyRequest['log']): never {
  if (e instanceof ErroCertificadoDigital) throw new ErroApi(400, e.message, { codigo: 'CERTIFICADO_INVALIDO' })
  if (e instanceof ErroCofre) {
    if (e.detalhe) log.warn(`[certificado digital] ${e.message} (${e.detalhe})`)
    throw new ErroApi(409, e.message, { codigo: 'COFRE' })
  }
  throw e
}

/**
 * As rotas. `aoInstalar`: chamado (sem esperar) depois de instalar ou trocar, para assinar logo os certificados que
 * aguardavam a assinatura, sem esperar a tentativa automática de 15 minutos (app.ts: `tentarPdfsPendentes`).
 */
export async function rotasCertificadoDigital(
  app: FastifyInstance,
  ctx: Pick<Contexto, 'repo' | 'usuarios'> & {
    certificadoDigital: ServicoCertificadoDigitalCompleto
    aoInstalar?: () => Promise<unknown>
  },
  chaves = new ChavesDeEnvio(),
) {
  const servico = ctx.certificadoDigital
  const cnpjEmpresa = () => ctx.repo.obterConfig().empresa.cnpj
  const usuarioDe = (req: FastifyRequest) => {
    if (!req.usuario) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    return req.usuario
  }

  // Todos os níveis veem se os certificados saem assinados; os detalhes e o histórico, só quem cuida das configurações.
  // Falha fechada: sem usuário identificado, a resposta reduzida.
  app.get('/api/certificado-digital', async (req) => {
    await servico.pronto()
    const certificado = servico.estado(cnpjEmpresa())
    if (!req.usuario || !pode(req.usuario.nivel, 'configuracoes')) return { certificado: resumo(certificado) }
    return { certificado, historico: servico.historico(), noServidor: ehLoopback(ipDe(req)) }
  })

  app.get('/api/certificado-digital/chave', async (req) => chaves.nova(usuarioDe(req).id))

  app.post('/api/certificado-digital/conferir', { bodyLimit: LIMITES_ENVIO.bytesCorpo }, async (req) => {
    const usuario = usuarioDe(req)
    const pacote = chaves.abrir(req.body, usuario.id)
    await ctx.usuarios.confirmarPropriaSenha(usuario.id, pacote.senhaAdmin, ipDe(req))
    const { pfx, senha } = pfxDoPacote(pacote)
    await servico.pronto()
    try {
      return await servico.conferir(pfx, senha, cnpjEmpresa())
    } catch (e) {
      traduzir(e, req.log)
    }
  })

  app.post('/api/certificado-digital', { bodyLimit: LIMITES_ENVIO.bytesCorpo }, async (req) => {
    const usuario = usuarioDe(req)
    const pacote = chaves.abrir(req.body, usuario.id)
    await ctx.usuarios.confirmarPropriaSenha(usuario.id, pacote.senhaAdmin, ipDe(req))
    const { pfx, senha } = pfxDoPacote(pacote)
    await servico.pronto()
    try {
      const { certificado, anterior } = await servico.instalar(pfx, senha, autorDe(usuario), cnpjEmpresa())
      const novo = `${certificado.titular} (série ${certificado.serie}, válido até ${dataBr(new Date(certificado.validoAte!))})`
      req.detalheAuditoria = anterior ? `trocado: ${novo}; o anterior era a série ${anterior.serie}` : `instalado: ${novo}`
      ctx.aoInstalar?.().catch((e) => req.log.warn({ err: e }, '[certificado digital] falha ao assinar os pendentes'))
      return { certificado, historico: servico.historico() }
    } catch (e) {
      traduzir(e, req.log)
    }
  })

  app.delete('/api/certificado-digital', { bodyLimit: 16 * 1024 }, async (req) => {
    const usuario = usuarioDe(req)
    const pacote = chaves.abrir(req.body, usuario.id)
    await ctx.usuarios.confirmarPropriaSenha(usuario.id, pacote.senhaAdmin, ipDe(req))
    const removido = await servico.remover(autorDe(usuario))
    req.detalheAuditoria = removido ? `removido: ${removido.titular} (série ${removido.serie})` : 'removido (arquivo ilegível)'
    return { certificado: servico.estado(cnpjEmpresa()), historico: servico.historico() }
  })
}
