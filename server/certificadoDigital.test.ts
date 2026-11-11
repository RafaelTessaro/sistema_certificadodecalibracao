// O certificado digital da empresa (server/certificadoDigital.ts): as situações (em dia, vencendo, vencido, ainda não vale,
// não abre, CNPJ diferente), a troca e o histórico, a conciliação com o banco, os avisos de vencimento por faixa, as rotas
// (o resumo para quem não é administrador, a senha do administrador, a chave de envio de um uso só, o pacote cifrado pelo
// módulo do navegador rodando no Node) e que nada do segredo vai para o banco nem para as cópias.

import { randomBytes, X509Certificate } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CertificadoDigitalPublico, RegistroCertificadoDigital } from '#shared/tipos.ts'
import { BLOQUEIO_CONFIRMAR_SENHA } from '#shared/usuarios.ts'
import { cifrarPacote, base64DosBytes } from '../src/lib/cifraPacote.ts'
import { AGORA, arquivoPki, CNPJ_EMPRESA, raizesTeste, RESPONSAVEL, SENHA, sha256 } from './assinatura/__fixtures__/pki.ts'
import { arquivoDoCofre, type Protetor, protetorAesTeste } from './assinatura/cofre.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin, SENHA_ADMIN } from './auxiliaresTeste.ts'
import {
  ChavesDeEnvio,
  criarServicoCertificadoDigital,
  LIMITES_ENVIO,
  META_AVISO_VENCIMENTO,
  MSG_SEM_ARQUIVO,
  type OpcoesCertificadoDigital,
  type ServicoCertificadoDigitalCompleto,
} from './certificadoDigital.ts'
import { abrirBanco, lerMeta } from './db.ts'
import { apagarConfigEmail, gravarConfigEmail } from './email.ts'
import type { ErroApi } from './erros.ts'
import { passarCertificadosDigitais, transplantarRegistros } from './usuarios.ts'

const ADMIN = { id: 'u1', login: 'admin', nome: 'Admin Teste' }
const pfx = (nome = 'ecnpj-aes') => arquivoPki(`${nome}.pfx`)
const SHA_ECNPJ = sha256(Buffer.from(new X509Certificate(arquivoPki('ecnpj.crt')).raw))
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`)

const abertos: AppComLogin[] = []
afterEach(async () => {
  vi.useRealTimers()
  while (abertos.length) await abertos.pop()!.fechar()
})

/** App com login, a PKI de teste, o relógio dos testes e o CNPJ da empresa preenchido. */
async function app(o: Partial<OpcoesCertificadoDigital> & { arquivoBanco?: string; cnpj?: string } = {}) {
  const { arquivoBanco, cnpj, ...certificadoDigital } = o
  const protetor = certificadoDigital.protetor ?? protetorAesTeste(randomBytes(32))
  const t = await criarAppComLogin({
    ...(arquivoBanco ? { arquivoBanco } : {}),
    certificadoDigital: { raizes: raizesTeste(), agora: () => AGORA, ...certificadoDigital, protetor },
  })
  abertos.push(t)
  protetores.set(t, protetor)
  const config = t.ctx.repo.obterConfig()
  t.ctx.repo.salvarConfig({
    ...config,
    empresa: { ...config.empresa, cnpj: cnpj ?? CNPJ_EMPRESA, email: 'qualidade@empresa.com.br' },
  })
  return t
}

/** O protetor do cofre de cada app (o mesmo "computador"). */
const protetores = new WeakMap<AppComLogin, Protetor>()

/** Outro serviço sobre a mesma pasta, o mesmo banco e o mesmo protetor: o que acontece quando o servidor reinicia. */
function reiniciar(t: AppComLogin, o: Partial<OpcoesCertificadoDigital> = {}) {
  return criarServicoCertificadoDigital(t.ctx, { raizes: raizesTeste(), agora: () => AGORA, protetor: protetores.get(t), ...o })
}

const cnpj = (t: AppComLogin) => t.ctx.repo.obterConfig().empresa.cnpj
/** O serviço do app (o contexto o tipa pelo contrato). */
const servico = (t: AppComLogin) => t.ctx.certificadoDigital as ServicoCertificadoDigitalCompleto

async function erroDe(p: Promise<unknown> | (() => unknown)): Promise<ErroApi> {
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    return e as ErroApi
  }
  throw new Error('não lançou')
}

describe('o serviço: situações, troca e conciliação', () => {
  it('sem certificado: SEM_CERTIFICADO e os certificados saem sem assinatura (paraAssinar = null)', async () => {
    const t = await app()
    const s = servico(t)
    expect(s.instalado()).toBe(false)
    await s.pronto()
    expect(s.instalado()).toBe(false)
    expect(s.estado(cnpj(t))).toEqual({ situacao: 'SEM_CERTIFICADO', avisos: [] })
    expect(s.paraAssinar(cnpj(t))).toBeNull()
  })

  it('instala, assina com a chave em memória, registra só o público e reabre na partida', async () => {
    const protetor = protetorAesTeste(randomBytes(32))
    const t = await app({ protetor })
    const s = reiniciar(t, { protetor })
    await s.pronto()
    const { certificado, anterior } = await s.instalar(pfx(), SENHA, ADMIN, cnpj(t))
    expect(anterior).toBeNull()
    expect(certificado).toMatchObject({
      situacao: 'OK',
      titular: 'BALANÇAS TESTE LTDA',
      cnpj: '12345678000195',
      tipo: 'A1',
      sha256: SHA_ECNPJ,
      instaladoPor: 'Admin Teste (admin)',
      instaladoEm: AGORA.toISOString(),
      avisos: [],
    })
    expect(certificado.diasParaVencer).toBeGreaterThan(7000)
    const a1 = s.paraAssinar(cnpj(t))!
    expect(a1.dados.sha256).toBe(SHA_ECNPJ)
    expect(s.instalado()).toBe(true)
    // O banco: só o público, com a mesma cadeia que vai nas assinaturas
    const [linha] = s.historico()
    expect(linha).toMatchObject({ sha256: SHA_ECNPJ, removidoEm: '', motivo: '', instaladoPor: 'Admin Teste (admin)' })
    const publico = s.publicoPorSha256(SHA_ECNPJ)!
    expect(publico.certificadoDer.equals(a1.certificadoDer)).toBe(true)
    expect(publico.cadeiaDer.map((c) => c.toString('hex'))).toEqual(a1.cadeiaDer.map((c) => c.toString('hex')))
    // Reiniciado: abre o cofre em segundo plano e volta a assinar
    const depois = reiniciar(t, { protetor })
    expect(depois.instalado()).toBe(true)
    expect(depois.estado(cnpj(t)).avisos[0]).toBe('O certificado digital ainda está sendo aberto.')
    expect(() => depois.paraAssinar(cnpj(t))).toThrow(/ainda está sendo aberto/)
    await depois.pronto()
    expect(depois.estado(cnpj(t))).toMatchObject({ situacao: 'OK', sha256: SHA_ECNPJ, avisos: [] })
    expect(depois.paraAssinar(cnpj(t))?.chave.equals(a1.chave)).toBe(true)
  })

  it.each<[string, Date, string, CertificadoDigitalPublico['situacao'], RegExp, RegExp?]>([
    [
      'vencendo (30 dias ou menos)',
      dia('2046-12-10'),
      CNPJ_EMPRESA,
      'VENCENDO',
      // A emissão para na hora do vencimento, não no fim do dia
      /^O certificado digital vence em 21 dias, em 31\/12\/2046 às 20:59\. Instale o novo \(renovado\) antes disso: a partir desse horário, o sistema não emite certificados\.$/,
    ],
    [
      'vencido',
      dia('2047-01-02'),
      CNPJ_EMPRESA,
      'VENCIDO',
      /venceu em 31\/12\/2046/,
      /^O certificado digital da empresa venceu em 31\/12\/2046\. A emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital\.$/,
    ],
    [
      'ainda não vale',
      dia('2025-12-01'),
      CNPJ_EMPRESA,
      'AINDA_NAO_VALE',
      /só vale a partir de/,
      /^O certificado digital da empresa só vale a partir de 31\/12\/2025 \(confira a data e a hora do servidor\)\. A emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital\.$/,
    ],
    [
      'CNPJ de outra empresa',
      AGORA,
      '11.444.777/0001-61',
      'CNPJ_DIFERENTE',
      /CNPJ 12\.345\.678\/0001-95.*11\.444\.777\/0001-61/,
      /^O certificado digital da empresa é do CNPJ 12\.345\.678\/0001-95, diferente do que está em Configurações → Empresa \(11\.444\.777\/0001-61\)\. A emissão fica bloqueada até o administrador corrigir o CNPJ da empresa ou instalar o certificado digital certo em Configurações → Certificado digital\.$/,
    ],
    [
      'CNPJ da empresa em branco',
      AGORA,
      '',
      'EMPRESA_SEM_CNPJ',
      /^O CNPJ da empresa não está preenchido em Configurações → Empresa\./,
      /^O CNPJ da empresa não está preenchido em Configurações → Empresa \(ele é conferido com o do certificado digital\)\. A emissão fica bloqueada até o administrador preencher\.$/,
    ],
  ])(
    '%s: a situação, o aviso e a emissão recusada (409 antes de gastar o nº)',
    async (_, agora, cnpjEmpresa, situacao, aviso, recusa) => {
      const t = await app()
      const s = servico(t)
      await s.instalar(pfx(), SENHA, ADMIN, CNPJ_EMPRESA, AGORA)
      const e = s.estado(cnpjEmpresa, agora)
      expect(e.situacao).toBe(situacao)
      expect(e.avisos.join(' ')).toMatch(aviso)
      if (situacao === 'VENCENDO') {
        expect(e.diasParaVencer).toBe(21)
        expect(s.paraAssinar(cnpjEmpresa, agora)).not.toBeNull()
        return
      }
      const erro = await erroDe(() => s.paraAssinar(cnpjEmpresa, agora))
      expect(erro).toMatchObject({ status: 409, dados: { codigo: 'CERTIFICADO_DIGITAL' } })
      // Quem emite pode ser o operador: o texto diz o fato e que é com o administrador
      expect(erro.message).toMatch(recusa!)
      // O motivo sem o que fazer (a ficha do que fica aguardando a assinatura monta o resto)
      expect((erro.dados as { motivo: string }).motivo).toBe(erro.message.slice(0, erro.message.indexOf(' A emissão fica')))
    },
  )

  it('outro estabelecimento da mesma empresa (filial): em dia, com o aviso', async () => {
    const t = await app()
    const s = servico(t)
    const { certificado } = await s.instalar(pfx('filial'), SENHA, ADMIN, cnpj(t))
    expect(certificado.situacao).toBe('OK')
    expect(certificado.avisos).toEqual([expect.stringMatching(/outro estabelecimento da mesma empresa/)])
    expect(s.paraAssinar(cnpj(t))).not.toBeNull()
  })

  it('o cofre de outro computador: NAO_ABRE com os dados do cabeçalho, e a emissão recusada', async () => {
    const t = await app()
    await servico(t).instalar(pfx(), SENHA, ADMIN, cnpj(t))
    const outro = reiniciar(t, { protetor: protetorAesTeste(randomBytes(32)) })
    await outro.pronto()
    expect(outro.instalado()).toBe(true)
    const e = outro.estado(cnpj(t))
    expect(e).toMatchObject({ situacao: 'NAO_ABRE', titular: 'BALANÇAS TESTE LTDA', sha256: SHA_ECNPJ })
    // Não afirma uma causa só: a mesma recusa vem do antivírus barrando o PowerShell ou do segredo ausente
    expect(e.avisos[0]).toBe(
      'O certificado guardado não abre neste servidor (instalado em outro servidor, Windows reinstalado ou proteção do ' +
        'Windows bloqueada). Envie o arquivo .pfx de novo; se o erro continuar, veja o registro do servidor.',
    )
    const erro = await erroDe(() => outro.paraAssinar(cnpj(t)))
    expect(erro).toMatchObject({ status: 409, dados: { codigo: 'CERTIFICADO_DIGITAL' } })
    expect(erro.message).toBe(
      'O certificado digital da empresa não abre no servidor. A emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital.',
    )
    // O porquê e o que fazer (enviar o .pfx de novo) ficam no cartão de Configurações, para o administrador
    expect(erro.message).not.toMatch(/Envie o arquivo/)
  })

  it('o arquivo do cofre sumiu (sem o Remover): NAO_ABRE, nada sai sem assinatura em silêncio; o Remover libera', async () => {
    const t = await app()
    await servico(t).instalar(pfx(), SENHA, ADMIN, cnpj(t))
    rmSync(arquivoDoCofre(t.pasta))
    const s = reiniciar(t)
    await s.pronto()
    expect(s.estado(cnpj(t))).toMatchObject({ situacao: 'NAO_ABRE', avisos: [MSG_SEM_ARQUIVO], sha256: SHA_ECNPJ })
    // Para quem emite, o fato; o porquê (o arquivo sumiu) fica no cartão do administrador
    expect(() => s.paraAssinar(cnpj(t))).toThrow(/^O certificado digital da empresa não abre no servidor\./)
    const removido = await s.remover(ADMIN)
    expect(removido?.sha256).toBe(SHA_ECNPJ)
    expect(s.estado(cnpj(t)).situacao).toBe('SEM_CERTIFICADO')
    expect(s.paraAssinar(cnpj(t))).toBeNull()
    expect(s.historico()).toEqual([expect.objectContaining({ motivo: 'REMOVIDO', removidoPor: 'Admin Teste (admin)' })])
  })

  it('a troca: o novo assina, o anterior fica no histórico como substituído (e continua remontável)', async () => {
    const t = await app()
    const s = servico(t)
    await s.instalar(pfx(), SENHA, ADMIN, cnpj(t), dia('2026-11-01'))
    const { certificado, anterior } = await s.instalar(pfx('filial'), SENHA, ADMIN, cnpj(t), dia('2026-11-10'))
    expect(anterior?.sha256).toBe(SHA_ECNPJ)
    expect(s.paraAssinar(cnpj(t))?.dados.sha256).toBe(certificado.sha256)
    const historico = s.historico()
    expect(historico.map((h: RegistroCertificadoDigital) => [h.cnpj, h.motivo])).toEqual([
      ['12345678000276', ''],
      ['12345678000195', 'SUBSTITUIDO'],
    ])
    expect(historico[1].removidoEm).toBe(dia('2026-11-10').toISOString())
    expect(s.publicoPorSha256(SHA_ECNPJ)).not.toBeNull()
  })

  it('o banco voltou de uma cópia de antes da instalação: a linha é recriada pelo cabeçalho do cofre', async () => {
    const t = await app()
    await servico(t).instalar(pfx(), SENHA, ADMIN, cnpj(t))
    t.ctx.db.exec('DELETE FROM certificados_digitais')
    const s = reiniciar(t)
    await s.pronto()
    expect(s.estado(cnpj(t)).situacao).toBe('OK')
    expect(s.historico()).toEqual([
      expect.objectContaining({ sha256: SHA_ECNPJ, removidoEm: '', instaladoPor: 'Admin Teste (admin)' }),
    ])
    expect(s.publicoPorSha256(SHA_ECNPJ)).not.toBeNull()
  })

  it('a conferência não grava nada e recusa o .pfx que não serve, sem a senha nem o CPF do responsável na mensagem', async () => {
    const t = await app()
    const s = servico(t)
    const { certificado } = await s.conferir(pfx(), SENHA, cnpj(t))
    expect(certificado).toMatchObject({ situacao: 'OK', titular: 'BALANÇAS TESTE LTDA', instaladoEm: '' })
    expect(JSON.stringify(certificado)).not.toContain(RESPONSAVEL)
    expect(existsSync(arquivoDoCofre(t.pasta))).toBe(false)
    expect(s.historico()).toEqual([])
    await expect(s.conferir(pfx(), 'errada', cnpj(t))).rejects.toThrow('A senha não confere com o arquivo do certificado.')
    await expect(s.conferir(pfx('outro'), SENHA, cnpj(t))).rejects.toThrow(/CNPJ/)
    await expect(s.conferir(pfx('vencido'), SENHA, cnpj(t))).rejects.toThrow(/venceu/)
  })
})

describe('os avisos de vencimento (30, 15, 7 e 1 dia)', () => {
  it('um registro de atividades e um e-mail por faixa, para o e-mail da empresa, só com o SMTP configurado', async () => {
    const t = await app()
    const enviados: Array<{ para: string[]; assunto: string; texto: string }> = []
    const s = reiniciar(t, { enviarEmail: async (m) => enviados.push(m) })
    await s.instalar(pfx(), SENHA, ADMIN, cnpj(t))
    const registros = () =>
      t.usuarios
        .listarAuditoria({ limite: 50 })
        .filter((r) => r.acao === 'CERTIFICADO_DIGITAL')
        .map((r) => r.detalhe)
    expect(await s.verificarVencimento(dia('2046-11-20'))).toBeNull() // 41 dias
    // Sem o SMTP: só o registro
    expect(await s.verificarVencimento(dia('2046-12-01'))).toEqual({ faixa: 30, dias: 30 })
    expect(enviados).toEqual([])
    expect(registros()).toEqual([
      expect.stringMatching(
        /^O certificado digital vence em 30 dias, em 31\/12\/2046 às 20:59 \(BALANÇAS TESTE LTDA, série [0-9A-F]+\)\.$/,
      ),
    ])
    expect(lerMeta(t.ctx.db, META_AVISO_VENCIMENTO)).toBe(`${SHA_ECNPJ}|30`)
    expect(await s.verificarVencimento(dia('2046-12-02'))).toBeNull() // mesma faixa
    gravarConfigEmail(t.ctx, {
      servidor: 'smtp.empresa.com.br',
      porta: 587,
      seguranca: 'STARTTLS',
      usuario: 'avisos@empresa.com.br',
      senha: 'x',
      remetenteNome: 'Empresa',
      remetenteEmail: 'avisos@empresa.com.br',
    })
    expect(await s.verificarVencimento(dia('2046-12-17'))).toEqual({ faixa: 15, dias: 14 })
    // Desligado alguns dias: pula direto para a faixa de agora (um aviso só)
    expect(await s.verificarVencimento(dia('2046-12-28'))).toEqual({ faixa: 7, dias: 3 })
    expect(await s.verificarVencimento(dia('2046-12-31'))).toEqual({ faixa: 1, dias: 0 })
    expect(await s.verificarVencimento(dia('2047-01-02'))).toBeNull() // vencido: a situação diz
    expect(registros()).toHaveLength(4)
    expect(enviados.map((m) => [m.para, m.assunto])).toEqual([
      [['qualidade@empresa.com.br'], 'O certificado digital da empresa vence em 14 dias — BC Calibração'],
      [['qualidade@empresa.com.br'], 'O certificado digital da empresa vence em 3 dias — BC Calibração'],
      [['qualidade@empresa.com.br'], 'O certificado digital da empresa vence hoje — BC Calibração'],
    ])
    expect(enviados[0].texto).toContain('Configurações → Certificado digital')
    expect(enviados[0].texto).toContain(') vence em 14 dias, em 31/12/2046 às 20:59.')
    expect(enviados[0].texto).toContain(
      'A partir desse horário, o BC Calibração não emite certificados até o novo ser instalado.',
    )
    expect(enviados[0].texto).not.toMatch(/[Dd]epois dessa data/)
    expect(enviados[0].texto).not.toContain(SENHA)
  })

  it('o e-mail da faixa só conta depois de sair: a falha tenta de novo na verificação seguinte; sem o SMTP, não tenta', async () => {
    const t = await app()
    let falhar = true
    const tentativas: string[] = []
    const s = reiniciar(t, {
      enviarEmail: async (m) => {
        tentativas.push(m.assunto)
        if (falhar) throw new Error('o servidor de e-mail não respondeu')
      },
    })
    await s.instalar(pfx(), SENHA, ADMIN, cnpj(t))
    const registros = () => t.usuarios.listarAuditoria({ limite: 50 }).filter((r) => r.acao === 'CERTIFICADO_DIGITAL')
    const smtp = () =>
      gravarConfigEmail(t.ctx, {
        servidor: 'smtp.empresa.com.br',
        porta: 587,
        seguranca: 'STARTTLS',
        usuario: 'avisos@empresa.com.br',
        senha: 'x',
        remetenteNome: 'Empresa',
        remetenteEmail: 'avisos@empresa.com.br',
      })
    // Sem o SMTP na faixa dos 30 dias: só o registro; configurado depois, a faixa não manda o e-mail (não tenta de novo)
    expect(await s.verificarVencimento(dia('2046-12-01'))).toEqual({ faixa: 30, dias: 30 })
    smtp()
    expect(await s.verificarVencimento(dia('2046-12-02'))).toBeNull()
    expect(tentativas).toEqual([])
    // Na faixa dos 15 dias, o envio falha: o registro fica (um só) e a próxima verificação tenta de novo, uma vez cada
    expect(await s.verificarVencimento(dia('2046-12-17'))).toEqual({ faixa: 15, dias: 14 })
    expect(tentativas).toHaveLength(1)
    expect(lerMeta(t.ctx.db, META_AVISO_VENCIMENTO)).not.toBe(`${SHA_ECNPJ}|15`)
    expect(await s.verificarVencimento(dia('2046-12-17'))).toBeNull()
    expect(tentativas).toHaveLength(2)
    falhar = false
    expect(await s.verificarVencimento(dia('2046-12-18'))).toBeNull()
    expect(tentativas).toEqual([
      'O certificado digital da empresa vence em 14 dias — BC Calibração',
      'O certificado digital da empresa vence em 14 dias — BC Calibração',
      'O certificado digital da empresa vence em 13 dias — BC Calibração',
    ])
    expect(lerMeta(t.ctx.db, META_AVISO_VENCIMENTO)).toBe(`${SHA_ECNPJ}|15`)
    // Enviado: não manda de novo na mesma faixa
    expect(await s.verificarVencimento(dia('2046-12-19'))).toBeNull()
    expect(tentativas).toHaveLength(3)
    expect(registros()).toHaveLength(2)
    // A falha na faixa dos 7 dias e o SMTP desconfigurado em seguida: não tenta mais
    falhar = true
    expect(await s.verificarVencimento(dia('2046-12-28'))).toEqual({ faixa: 7, dias: 3 })
    expect(tentativas).toHaveLength(4)
    apagarConfigEmail(t.ctx)
    expect(await s.verificarVencimento(dia('2046-12-29'))).toBeNull()
    expect(await s.verificarVencimento(dia('2046-12-29'))).toBeNull()
    expect(tentativas).toHaveLength(4)
    expect(lerMeta(t.ctx.db, META_AVISO_VENCIMENTO)).toBe(`${SHA_ECNPJ}|7`)
    expect(registros()).toHaveLength(3)
  })

  it('o rascunho segue o relógio do serviço (o mesmo da emissão): aviso de vence em N dias e, vencido, pendência', async () => {
    let agora = dia('2046-12-10')
    const t = await app({ agora: () => agora })
    await servico(t).instalar(pfx(), SENHA, ADMIN, cnpj(t), dia('2046-11-01'))
    const c = await cenarioCalibracao(t)
    const k = await c.calibracaoPronta()
    const doCertificado = async (campo: 'avisos' | 'pendencias') =>
      ((await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()[campo] as string[]).filter((a) =>
        a.includes('certificado digital'),
      )
    expect(await doCertificado('avisos')).toEqual([
      'O certificado digital da empresa vence em 21 dias (31/12/2046 às 20:59). A partir desse horário, a emissão fica bloqueada até o administrador instalar o novo.',
    ])
    expect(await doCertificado('pendencias')).toEqual([])
    // Vencido: impede a emissão (pendência, como a tela mostra), não é só aviso
    agora = dia('2047-01-02')
    expect(await doCertificado('avisos')).toEqual([])
    expect(await doCertificado('pendencias')).toEqual([
      'O certificado digital da empresa venceu: a emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital.',
    ])
    const r = await c.emitir(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().codigo).toBe('CERTIFICADO_DIGITAL')
  })
})

describe('a chave de envio', () => {
  it('de um uso só, presa a quem pediu e vale 10 minutos', async () => {
    let agora = 1_000_000
    const chaves = new ChavesDeEnvio(() => agora)
    const k = await chaves.nova('u1')
    expect(k.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    const pacote = cifrarPacote(k, { senhaAdmin: 'x' })
    expect(() => chaves.abrir(pacote, 'u2')).toThrow(/venceu ou já foi usada/)
    // A de outro usuário foi gasta na tentativa
    expect(() => chaves.abrir(pacote, 'u1')).toThrow(/venceu ou já foi usada/)
    const k2 = await chaves.nova('u1')
    expect(chaves.abrir(cifrarPacote(k2, { senhaAdmin: 'Ação' }), 'u1')).toEqual({ senhaAdmin: 'Ação' })
    const k3 = await chaves.nova('u1')
    agora += LIMITES_ENVIO.validadeMs
    expect(() => chaves.abrir(cifrarPacote(k3, {}), 'u1')).toThrow(/venceu ou já foi usada/)
    // Pedidas demais seguidas: 429
    for (let i = chaves.tamanho; i < 40; i++) {
      try {
        await chaves.nova('u3')
      } catch (e) {
        expect(e).toMatchObject({ status: 429 })
        break
      }
    }
    expect(chaves.tamanho).toBeLessThanOrEqual(LIMITES_ENVIO.vivasPorUsuario)
  })
})

describe('as rotas', () => {
  /** Pede a chave e cifra o conteúdo com o módulo do navegador (rodando no Node). */
  async function pacote(t: AppComLogin, conteudo: Record<string, unknown>, cookie = t.cookieAdmin) {
    const r = await t.chamar('GET', '/api/certificado-digital/chave', { cookie })
    expect(r.statusCode).toBe(200)
    return cifrarPacote(r.json(), conteudo)
  }
  const conteudoPfx = (o: { senha?: string; senhaAdmin?: string; arquivo?: string } = {}) => ({
    pfx: base64DosBytes(new Uint8Array(pfx(o.arquivo))),
    senha: o.senha ?? SENHA,
    senhaAdmin: o.senhaAdmin ?? SENHA_ADMIN,
  })

  it('conferir e instalar pela rede com o pacote cifrado; o resumo para quem não é administrador', async () => {
    const t = await app()
    // Antes: o comum vê só a situação; o administrador vê tudo e o histórico
    expect((await t.chamar('GET', '/api/certificado-digital', { cookie: t.cookieComum })).json()).toEqual({
      certificado: { situacao: 'SEM_CERTIFICADO' },
    })
    expect((await t.chamar('GET', '/api/certificado-digital', { cookie: t.cookieAdmin })).json()).toEqual({
      certificado: { situacao: 'SEM_CERTIFICADO', avisos: [] },
      historico: [],
      noServidor: true,
    })
    // Conferir: os dados para a tela, nada gravado
    const conferido = await t.chamar('POST', '/api/certificado-digital/conferir', {
      cookie: t.cookieAdmin,
      payload: await pacote(t, conteudoPfx()),
    })
    expect(conferido.statusCode, conferido.body).toBe(200)
    expect(conferido.json().certificado).toMatchObject({ situacao: 'OK', titular: 'BALANÇAS TESTE LTDA', cnpj: '12345678000195' })
    expect(conferido.body).not.toContain(RESPONSAVEL)
    expect(existsSync(arquivoDoCofre(t.pasta))).toBe(false)
    // Instalar
    const instalado = await t.chamar('POST', '/api/certificado-digital', {
      cookie: t.cookieAdmin,
      payload: await pacote(t, conteudoPfx()),
    })
    expect(instalado.statusCode, instalado.body).toBe(200)
    expect(instalado.json().certificado).toMatchObject({ situacao: 'OK', instaladoPor: 'Admin Teste (admin)' })
    expect(instalado.json().historico).toHaveLength(1)
    expect(instalado.json().trocado).toBe(false)
    expect(servico(t).paraAssinar(cnpj(t))?.dados.sha256).toBe(SHA_ECNPJ)
    // O comum: só a situação, o titular e a validade
    expect((await t.chamar('GET', '/api/certificado-digital', { cookie: t.cookieComum })).json()).toEqual({
      certificado: {
        situacao: 'OK',
        titular: 'BALANÇAS TESTE LTDA',
        validoAte: '2046-12-31T23:59:59.000Z',
        // Para a faixa do Painel do operador ("vence em N dias")
        diasParaVencer: expect.any(Number),
      },
    })
    // Pela rede (outro computador): o administrador vê que não está no servidor
    const daRede = await t.chamar('GET', '/api/certificado-digital', { cookie: t.cookieAdmin, remoteAddress: '192.168.0.20' })
    expect(daRede.json().noServidor).toBe(false)
    // O registro de atividades: instalado, com o titular e a série; a conferência não entra
    const registros = t.usuarios.listarAuditoria({ limite: 50 }).filter((r) => r.detalhe.includes('certificado-digital'))
    expect(registros.map((r) => [r.acao, r.detalhe.replace(/série [0-9A-F]+/, 'série X')])).toEqual([
      ['CERTIFICADO_DIGITAL', 'POST /api/certificado-digital | instalado: BALANÇAS TESTE LTDA (série X, válido até 31/12/2046)'],
    ])
    // Remover, com a senha de novo
    const removido = await t.chamar('DELETE', '/api/certificado-digital', {
      cookie: t.cookieAdmin,
      payload: await pacote(t, { senhaAdmin: SENHA_ADMIN }),
    })
    expect(removido.statusCode, removido.body).toBe(200)
    expect(removido.json().certificado).toEqual({ situacao: 'SEM_CERTIFICADO', avisos: [] })
    expect(existsSync(arquivoDoCofre(t.pasta))).toBe(false)
    expect(t.usuarios.listarAuditoria({ limite: 1 })[0]).toMatchObject({
      acao: 'CERTIFICADO_DIGITAL',
      detalhe: expect.stringMatching(/^DELETE \/api\/certificado-digital \| removido: BALANÇAS TESTE LTDA/),
    })
  })

  it('a resposta diz se foi troca (outro certificado), como o registro de atividades, para o aviso da tela', async () => {
    const t = await app()
    const instalar = async (arquivo?: string) => {
      const r = await t.chamar('POST', '/api/certificado-digital', {
        cookie: t.cookieAdmin,
        payload: await pacote(t, conteudoPfx({ arquivo })),
      })
      expect(r.statusCode, r.body).toBe(200)
      return r.json().trocado
    }
    expect(await instalar()).toBe(false)
    // O mesmo arquivo de novo (o "Enviar o certificado de novo" do que não abre): não é troca
    expect(await instalar()).toBe(false)
    // Outro (o renovado): troca
    expect(await instalar('ses')).toBe(true)
    const detalhes = t.usuarios
      .listarAuditoria({ limite: 50 })
      .filter((r) => r.detalhe.startsWith('POST /api/certificado-digital |'))
      .map((r) => r.detalhe.split(' | ')[1].split(':')[0])
    expect(detalhes).toEqual(['trocado', 'instalado', 'instalado'])
  })

  it('instalar de novo assina logo os que aguardavam a assinatura (sem esperar a tentativa automática); a lista deles', async () => {
    const t = await app()
    const instalar = async () =>
      t.chamar('POST', '/api/certificado-digital', { cookie: t.cookieAdmin, payload: await pacote(t, conteudoPfx()) })
    expect((await instalar()).statusCode).toBe(200)
    const c = await cenarioCalibracao(t)
    const k = await c.calibracaoPronta()
    expect((await c.emitir(k)).statusCode).toBe(200)
    // Aguardando a assinatura (como se o certificado não abrisse na hora de assinar): sem as partes, o hash e o arquivo
    const emitida = t.ctx.repo.obterCalibracao(k.id)!
    rmSync(join(t.pasta, 'certificados', emitida.emissao!.arquivo))
    t.ctx.db
      .prepare(
        `UPDATE calibracoes SET dados = json_set(json_remove(dados, '$.emissao.assinatura'), '$.emissao.hashPdf', '', '$.emissao.arquivo', '') WHERE id = ?`,
      )
      .run(k.id)
    const aguardando = async () =>
      (await t.chamar('GET', '/api/painel', { cookie: t.cookieAdmin })).json().painel.aguardandoAssinatura
    const lista = async (cookie: string) =>
      (await t.chamar('GET', '/api/calibracoes?status=ASSINATURA_PENDENTE', { cookie })).json() as {
        itens: Array<{ id: string }>
        total: number
      }
    expect(await aguardando()).toBe(1)
    // Quais são (o operador também vê: é ele quem envia os certificados)
    expect((await lista(t.cookieComum)).itens.map((x) => x.id)).toEqual([k.id])
    expect((await lista(t.cookieAdmin)).total).toBe(1)
    // O administrador instala de novo: a assinatura sai logo depois, sem esperar os 15 minutos
    expect((await instalar()).statusCode).toBe(200)
    await vi.waitFor(async () => expect(await aguardando()).toBe(0), { timeout: 10_000, interval: 100 })
    expect((await lista(t.cookieAdmin)).total).toBe(0)
    expect(t.ctx.repo.obterCalibracao(k.id)!.emissao!.assinatura).toBeTruthy()
  })

  it('aguardando a assinatura pelo CNPJ da empresa: o texto manda resolver em Configurações → Empresa, como o 409', async () => {
    const t = await app()
    const instalar = async () =>
      t.chamar('POST', '/api/certificado-digital', { cookie: t.cookieAdmin, payload: await pacote(t, conteudoPfx()) })
    expect((await instalar()).statusCode).toBe(200)
    const c = await cenarioCalibracao(t)
    const k = await c.calibracaoPronta()
    expect((await c.emitir(k)).statusCode).toBe(200)
    // Aguardando a assinatura: sem as partes, o hash e o arquivo
    const emitida = t.ctx.repo.obterCalibracao(k.id)!
    rmSync(join(t.pasta, 'certificados', emitida.emissao!.arquivo))
    t.ctx.db
      .prepare(
        `UPDATE calibracoes SET dados = json_set(json_remove(dados, '$.emissao.assinatura'), '$.emissao.hashPdf', '', '$.emissao.arquivo', '') WHERE id = ?`,
      )
      .run(k.id)
    const comCnpj = (cnpjEmpresa: string) => {
      const config = t.ctx.repo.obterConfig()
      t.ctx.repo.salvarConfig({ ...config, empresa: { ...config.empresa, cnpj: cnpjEmpresa } })
    }
    const baixar = async () => (await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })).json().erro
    const inicio = `O certificado ${emitida.numero} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. Motivo: `
    const automatico = 'Ele é assinado sozinho (ao abrir o PDF ou na tentativa automática) depois que o administrador'
    comCnpj('')
    expect(await baixar()).toBe(
      `${inicio}o CNPJ da empresa não está preenchido em Configurações → Empresa (ele é conferido com o do certificado digital). ${automatico} preencher.`,
    )
    comCnpj('11.444.777/0001-61')
    expect(await baixar()).toBe(
      `${inicio}o certificado digital da empresa é do CNPJ 12.345.678/0001-95, diferente do que está em Configurações → Empresa (11.444.777/0001-61). ` +
        // O instalado é o desta emissão: instalar outro não o assinaria (só o do CNPJ e do titular congelados)
        `${automatico} corrigir o CNPJ da empresa em Configurações → Empresa.`,
    )
    // O certificado digital que não pode assinar por ele mesmo (vencido, não abre…) continua em Certificado digital
    comCnpj(CNPJ_EMPRESA)
    const vencido = reiniciar(t, { agora: () => dia('2047-01-02') })
    await vencido.pronto()
    t.ctx.certificadoDigital = vencido
    expect(await baixar()).toBe(
      `${inicio}o certificado digital da empresa venceu em 31/12/2046. ${automatico} resolver em Configurações → Certificado digital.`,
    )
  })

  it('trocar por um certificado que não assina os emitidos aguardando a assinatura: a conferência avisa qual e a saída', async () => {
    const t = await app()
    const conferir = async (arquivo: string) =>
      (
        await t.chamar('POST', '/api/certificado-digital/conferir', {
          cookie: t.cookieAdmin,
          payload: await pacote(t, conteudoPfx({ arquivo })),
        })
      ).json().certificado as CertificadoDigitalPublico
    expect(
      (await t.chamar('POST', '/api/certificado-digital', { cookie: t.cookieAdmin, payload: await pacote(t, conteudoPfx()) }))
        .statusCode,
    ).toBe(200)
    const c = await cenarioCalibracao(t)
    const k = await c.calibracaoPronta()
    expect((await c.emitir(k)).statusCode).toBe(200)
    // Sem pendentes: a conferência do de outro estabelecimento só traz o aviso do CNPJ
    expect((await conferir('filial')).avisos.join(' ')).not.toContain('aguarda')
    // Aguardando a assinatura: sem as partes, o hash e o arquivo
    const pendente = (id: string) => {
      const e = t.ctx.repo.obterCalibracao(id)!
      rmSync(join(t.pasta, 'certificados', e.emissao!.arquivo))
      t.ctx.db
        .prepare(
          `UPDATE calibracoes SET dados = json_set(json_remove(dados, '$.emissao.assinatura'), '$.emissao.hashPdf', '', '$.emissao.arquivo', '') WHERE id = ?`,
        )
        .run(id)
      return e
    }
    const emitida = pendente(k.id)
    const aviso =
      `O certificado ${emitida.numero} aguarda a assinatura digital, e este certificado digital não o assina: só um de ` +
      'BALANÇAS TESTE LTDA (CNPJ 12.345.678/0001-95) pode assiná-lo. Depois de instalar este, para entregá-lo, use ' +
      '“Corrigir certificado” na ficha dele: a correção sai assinada com este.'
    expect((await conferir('filial')).avisos).toContain(aviso)
    // O do mesmo CNPJ e titular (a renovação) assina: nada a avisar
    expect((await conferir('ses')).avisos).toEqual([])
    expect((await conferir('ecnpj-aes')).avisos).toEqual([])
    // Dois
    const k2 = await c.calibracaoPronta()
    expect((await c.emitir(k2)).statusCode).toBe(200)
    const segunda = pendente(k2.id)
    expect((await conferir('filial')).avisos).toContain(
      `Os certificados ${emitida.numero} e ${segunda.numero} aguardam a assinatura digital, e este certificado digital não ` +
        'os assina: cada um só pode ser assinado por um do CNPJ e do titular com que foi emitido. Depois de instalar este, ' +
        'para entregá-los, use “Corrigir certificado” na ficha de cada um: a correção sai assinada com este.',
    )
  })

  it('quem não é administrador não pede a chave, não confere, não instala e não remove (sem ler o corpo)', async () => {
    const t = await app()
    const corpo = await pacote(t, conteudoPfx())
    for (const [metodo, url] of [
      ['GET', '/api/certificado-digital/chave'],
      ['POST', '/api/certificado-digital/conferir'],
      ['POST', '/api/certificado-digital'],
      ['DELETE', '/api/certificado-digital'],
    ] as const) {
      const r = await t.chamar(metodo, url, { cookie: t.cookieComum, ...(metodo === 'GET' ? {} : { payload: corpo }) })
      expect(r.statusCode, url).toBe(403)
    }
    // Sem sessão: 401; sem o cabeçalho do app (outro site): 403
    expect((await t.chamar('GET', '/api/certificado-digital')).statusCode).toBe(401)
    const semCabecalho = await t.app.inject({ method: 'POST', url: '/api/certificado-digital', payload: corpo })
    expect(semCabecalho.statusCode).toBe(403)
    expect(existsSync(arquivoDoCofre(t.pasta))).toBe(false)
  })

  it('a senha do administrador errada, a do .pfx errada, a chave usada de novo, vencida ou o pacote alterado', async () => {
    const t = await app()
    const instalar = (payload: unknown) => t.chamar('POST', '/api/certificado-digital', { cookie: t.cookieAdmin, payload })
    const errada = await instalar(await pacote(t, conteudoPfx({ senhaAdmin: 'nao-e-esta' })))
    expect(errada.statusCode).toBe(400)
    expect(errada.json()).toMatchObject({ codigo: 'SENHA_ATUAL', erro: 'A sua senha do sistema não confere.' })
    const pfxErrado = await instalar(await pacote(t, conteudoPfx({ senha: 'Senha@999' })))
    expect(pfxErrado.statusCode).toBe(400)
    expect(pfxErrado.json()).toMatchObject({
      codigo: 'CERTIFICADO_INVALIDO',
      erro: 'A senha não confere com o arquivo do certificado.',
    })
    expect(pfxErrado.body).not.toContain('Senha@999')
    // A mesma chave de novo (o pacote repetido): recusado
    const corpo = await pacote(t, conteudoPfx())
    expect((await instalar(corpo)).statusCode).toBe(200)
    expect((await instalar(corpo)).json()).toMatchObject({ codigo: 'CHAVE_ENVIO' })
    // Alterado no caminho: não abre (e a chave foi gasta)
    const outro = await pacote(t, conteudoPfx())
    const dados = Buffer.from(outro.dados, 'base64')
    dados[5] ^= 1
    const alterado = await instalar({ ...outro, dados: dados.toString('base64') })
    expect(alterado.json()).toMatchObject({ codigo: 'PACOTE_INVALIDO' })
    expect((await instalar(outro)).json()).toMatchObject({ codigo: 'CHAVE_ENVIO' })
    // Vencida (10 minutos)
    const velho = await pacote(t, conteudoPfx())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + LIMITES_ENVIO.validadeMs + 1000)
    expect((await instalar(velho)).json()).toMatchObject({ codigo: 'CHAVE_ENVIO' })
    vi.useRealTimers()
    // Grande demais: 413 antes de ler
    const grande = await instalar({ ...(await pacote(t, {})), dados: 'A'.repeat(LIMITES_ENVIO.bytesCorpo + 10) })
    expect(grande.statusCode).toBe(413)
    // Nenhuma das recusas mexeu no instalado
    expect(servico(t).historico()).toHaveLength(1)
  })

  it('a senha do administrador errada várias vezes: espera (limite de tentativas)', async () => {
    const t = await app()
    let r = { statusCode: 0, json: () => ({}) as Record<string, unknown> }
    for (let i = 0; i < 6; i++)
      r = await t.chamar('POST', '/api/certificado-digital/conferir', {
        cookie: t.cookieAdmin,
        payload: await pacote(t, conteudoPfx({ senhaAdmin: `errada-${i}` })),
      })
    expect(r.statusCode).toBe(429)
    expect(r.json()).toMatchObject({ codigo: 'MUITAS_TENTATIVAS' })
    // O registro diz o que foi (não a troca de senha), e o contador é outro: trocar a própria senha continua liberado
    expect(
      t.usuarios
        .listarAuditoria({ limite: 50 })
        .filter((x) => x.acao === 'BLOQUEIO')
        .map((x) => x.detalhe),
    ).toEqual([BLOQUEIO_CONFIRMAR_SENHA])
    const troca = await t.chamar('PUT', '/api/minha-senha', {
      cookie: t.cookieAdmin,
      payload: { senhaAtual: 'errada-de-novo', senhaNova: 'Outra@Senha#2026' },
    })
    expect(troca.statusCode).toBe(400)
  })

  it('nada do certificado (chave, .pfx, senha) dentro do banco, do -wal nem das cópias', async () => {
    const pastaBanco = mkdtempSync(join(tmpdir(), 'bcf-banco-a1-'))
    try {
      const t = await app({ arquivoBanco: join(pastaBanco, 'bc-calibracao.db') })
      const instalado = await t.chamar('POST', '/api/certificado-digital', {
        cookie: t.cookieAdmin,
        payload: await pacote(t, conteudoPfx()),
      })
      expect(instalado.statusCode).toBe(200)
      const copia = await t.ctx.backups.copiar('manual')
      const a1 = servico(t).paraAssinar(cnpj(t))!
      const pkcs8 = a1.chave.export({ format: 'der', type: 'pkcs8' }) as Buffer
      const original = pfx()
      const arquivos = [
        ...readdirSync(pastaBanco).map((n) => join(pastaBanco, n)),
        copia,
        arquivoDoCofre(t.pasta), // o cofre: só cifrado
      ]
      for (const arquivo of arquivos) {
        const b = readFileSync(arquivo)
        expect(b.includes(pkcs8), arquivo).toBe(false)
        expect(b.includes(pkcs8.subarray(0, 64)), arquivo).toBe(false)
        expect(b.includes(Buffer.from(pkcs8.toString('base64').slice(0, 64))), arquivo).toBe(false)
        expect(b.includes(original.subarray(0, 64)), arquivo).toBe(false)
        expect(b.includes(Buffer.from(original.toString('base64').slice(0, 64))), arquivo).toBe(false)
        expect(b.includes(Buffer.from(SENHA)), arquivo).toBe(false)
      }
      // O público está no banco (para remontar os PDFs): o certificado inteiro, como vai dentro de cada PDF assinado (o
      // e-CNPJ do perfil antigo traz ali o CPF do responsável; a tela e a API nunca o mostram)
      expect(readFileSync(copia).includes(a1.certificadoDer)).toBe(true)
    } finally {
      rmSync(pastaBanco, { recursive: true, force: true })
    }
  })

  it('o módulo do navegador: só o pacote vai pela rede (nada em claro)', async () => {
    const t = await app()
    const conteudo = conteudoPfx()
    const p = await pacote(t, conteudo)
    const texto = JSON.stringify(p)
    expect(Object.keys(p).sort()).toEqual(['chave', 'dados', 'id', 'iv'])
    expect(texto).not.toContain(SENHA)
    expect(texto).not.toContain(SENHA_ADMIN)
    expect(texto).not.toContain(conteudo.pfx.slice(0, 40))
    expect(Buffer.from(p.chave, 'base64')).toHaveLength(256)
    expect(Buffer.from(p.iv, 'base64')).toHaveLength(12)
  })
})

describe('voltar uma cópia do banco (transplantar)', () => {
  it('os certificados digitais instalados depois da cópia passam para ela, com a situação do banco atual', async () => {
    const t = await app()
    const copia = abrirBanco(':memory:')
    try {
      await servico(t).instalar(pfx(), SENHA, ADMIN, cnpj(t), dia('2026-11-01'))
      await servico(t).instalar(pfx('filial'), SENHA, ADMIN, cnpj(t), dia('2026-11-10'))
      transplantarRegistros(t.ctx.db, copia)
      const linhas = copia.prepare('SELECT sha256, motivo, removido_em FROM certificados_digitais ORDER BY instalado_em').all()
      expect(linhas).toEqual([
        { sha256: SHA_ECNPJ, motivo: 'SUBSTITUIDO', removido_em: dia('2026-11-10').toISOString() },
        { sha256: expect.any(String), motivo: '', removido_em: '' },
      ])
      // Repetir não duplica
      expect(passarCertificadosDigitais(t.ctx.db, copia)).toBe(0)
    } finally {
      copia.close()
    }
  })
})
