// Fluxo completo pela API: cadastros → calibração → emissão (PDF guardado e imutável) → verificação
// pública → revisão (substitui) → cancelamento, com as travas de quem pode fazer o quê.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO, PENDENCIA_REVISADO_CANCELADO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao } from '#shared/tipos.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { anexosDoCertificado, gerarPdf } from './certificados.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from './pdf/assinaturasExemplo.ts'
import { comImagensNaOrdemInversa } from './pdf/base.ts'
import { textoPdf } from './pdf/carimbo.ts'
import { MSG_CANCELAR_COM_REVISAO } from './repositorio.ts'

/** O texto do PDF (pdftotext, do poppler-utils; sem ele, as conferências pelo texto ficam de fora). */
const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error
const textoDoPdf = (pdf: Buffer) =>
  spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 }).stdout.toString('utf8')
const contar = (texto: string, trecho: string) => texto.split(trecho).length - 1

let t: AppComLogin
let cliente: Cliente
let balanca: Balanca
let pesos: Padrao

beforeEach(async () => {
  t = await criarAppComLogin()
  // O administrador da ferramenta local não nasce signatário: passa a ser aqui
  const r = await t.chamar('PUT', `/api/usuarios/${t.adminId}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
  expect(r.statusCode).toBe(200)

  cliente = (
    await criar('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Mercado Bom Preço',
      razaoSocial: 'MERCADO BOM PRECO LTDA',
      documento: '11.444.777/0001-61',
      logradouro: 'Avenida 1',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Rio Claro',
      uf: 'SP',
      cep: '13500-000',
      emailCertificados: 'qualidade@mercado.com.br',
    })
  ).cliente
  balanca = (
    await criar('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Toledo',
      modelo: '9094',
      numeroSerie: 'TL-2231',
      portariaAprovacao: 'Portaria Inmetro 236/1994',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    })
  ).balanca
  pesos = (
    await criar('/api/padroes', {
      ...PADRAO_VAZIO,
      identificacao: 'JP-01',
      descricao: 'Jogo de pesos M1 1 kg a 10 kg',
      classe: 'M1',
      certificado: 'LAB-0456/2026',
      laboratorio: 'Laboratório de Massa Exemplo',
      acreditacao: 'CAL 0123',
      dataCalibracao: '2026-01-10',
      validade: '2099-01-10',
      pesos: [
        { id: 'p10a', marca: 'A', nominal: 10000, correcao: 40, incerteza: 160, k: 2 },
        { id: 'p10b', marca: 'B', nominal: 10000, correcao: -30, incerteza: 160, k: 2 },
        { id: 'p10c', marca: 'C', nominal: 10000, correcao: 10, incerteza: 160, k: 2 },
        { id: 'p5', marca: '', nominal: 5000, correcao: 20, incerteza: 80, k: 2 },
      ],
    })
  ).padrao
})
afterEach(async () => {
  await t.fechar()
})

async function criar(url: string, payload: unknown, cookie = t.cookieAdmin) {
  const r = await t.chamar('POST', url, { cookie, payload })
  if (r.statusCode !== 201 && r.statusCode !== 200) throw new Error(`${url}: ${r.statusCode} ${r.body}`)
  return r.json()
}

const peca = (pesoId: string) => ({ padraoId: pesos.id, pesoId, quantidade: 1 })

/** Rascunho preenchido com leituras plausíveis (erros de 0 a 10 g). */
async function calibracaoPronta(cookie = t.cookieAdmin): Promise<Calibracao> {
  const { calibracao: k } = (await criar(
    '/api/calibracoes',
    { clienteId: cliente.id, balancaId: balanca.id, ordemServico: 'OS 4471' },
    cookie,
  )) as {
    calibracao: Calibracao
  }
  expect(k).toMatchObject({ status: 'RASCUNHO', numero: '', padroesIds: [pesos.id], ordemServico: 'OS 4471' })
  expect(k.localEndereco).toContain('Rio Claro')
  const dados: CalibracaoInput = {
    ...k,
    ambiente: { temperaturaInicial: 22.1, temperaturaFinal: 22.6, umidadeInicial: 55, umidadeFinal: 57, pressao: null },
    repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 15.01, 15, 15, 15] }],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: 10,
      metodo: 1,
      posicoes: ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita'].map((rotulo, i) => ({
        rotulo,
        leitura: i === 2 ? 10.01 : 10,
        referencia: null,
      })),
    },
    indicacao: {
      metodo: 'CRESCENTE_DECRESCENTE',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      // Os 5 pontos do POP (7.7), contando o zero
      pontos: [
        { id: 'z', carga: 0, pecas: [], pecasManuais: false, crescente: 0, decrescente: 0, nivelSubstituicao: 0 },
        { id: 'a', carga: 5, pecas: [peca('p5')], pecasManuais: true, crescente: 5, decrescente: 5, nivelSubstituicao: 0 },
        {
          id: 'b',
          carga: 10,
          pecas: [peca('p10a')],
          pecasManuais: true,
          crescente: 10,
          decrescente: 10.01,
          nivelSubstituicao: 0,
        },
        {
          id: 'c',
          carga: 20,
          pecas: [peca('p10a'), peca('p10b')],
          pecasManuais: true,
          crescente: 20.01,
          decrescente: 20.01,
          nivelSubstituicao: 0,
        },
        {
          id: 'd',
          carga: 30,
          pecas: [peca('p10a'), peca('p10b'), peca('p10c')],
          pecasManuais: true,
          crescente: 30.01,
          decrescente: 30.01,
          nivelSubstituicao: 0,
        },
      ],
    },
  }
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie, payload: { ...dados, versao: k.versao } })
  expect(r.statusCode, r.body).toBe(200)
  expect(r.json().pendencias).toEqual([])
  return r.json().calibracao
}

const emitir = (k: Calibracao, cookie = t.cookieAdmin) =>
  t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, { cookie, payload: { versao: k.versao } })

describe('emissão do certificado', () => {
  it('a gravação do PDF falha depois da emissão: 200 com o aviso, o registro de atividades guarda a emissão e o PDF sai ao abrir', async () => {
    const k = await calibracaoPronta()
    // A folha de campo reserva o nº (o registro de atividades diz de qual folha)
    const folha = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(folha.statusCode, folha.body).toBe(200)
    const ano = new Date().getFullYear()
    const numero = `CC-${ano}-00001`
    // A gravação falha (disco cheio, antivírus travando o arquivo): uma pasta no lugar do arquivo temporário
    const parcial = join(t.pasta, 'certificados', String(ano), `Certificado-${numero}.pdf.parcial`)
    mkdirSync(parcial, { recursive: true })
    const atual = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().calibracao as Calibracao
    const r = await emitir(atual)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      calibracao: { status: 'EMITIDO', numero },
      aviso: 'O certificado foi emitido, mas o PDF não pôde ser gravado agora. Ele é gerado de novo ao abrir.',
    })
    expect(t.ctx.repo.obterCalibracao(k.id)!.emissao!.hashPdf).toBe('')
    const emissoes = t.ctx.db.prepare("SELECT alvo, detalhe FROM auditoria WHERE acao = 'CERTIFICADO_EMITIDO'").all() as Array<{
      alvo: string
      detalhe: string
    }>
    expect(emissoes).toEqual([
      {
        alvo: k.id,
        detalhe: `POST /api/calibracoes/:id/emitir | ${numero}, reservado na folha de campo ${folha.headers['x-folha-campo']}; o PDF não foi gravado na emissão (é gerado ao abrir)`,
      },
    ])
    // Tentar de novo não emite outra vez
    expect((await emitir(atual)).statusCode).toBe(409)
    // Resolvida a causa, o PDF é gerado e gravado ao abrir, com o hash registrado
    rmSync(parcial, { recursive: true })
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
    expect(pdf.statusCode).toBe(200)
    const hash = t.ctx.repo.obterCalibracao(k.id)!.emissao!.hashPdf
    expect(hash).toBe(createHash('sha256').update(pdf.rawPayload).digest('hex'))
    expect(existsSync(join(t.pasta, 'certificados', String(ano), `Certificado-${numero}.pdf`))).toBe(true)
  })

  it('numera, congela os dados, guarda o PDF e não deixa mais alterar', async () => {
    const k = await calibracaoPronta()
    const r = await emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().aviso).toBeUndefined()
    const emitida: Calibracao = r.json().calibracao
    // Uma linha só no registro de atividades
    expect(t.ctx.db.prepare("SELECT alvo FROM auditoria WHERE acao = 'CERTIFICADO_EMITIDO'").all()).toEqual([{ alvo: k.id }])
    const ano = new Date().getFullYear()
    expect(emitida.status).toBe('EMITIDO')
    expect(emitida.numero).toBe(`CC-${ano}-00001`)
    expect(emitida.emissao).toMatchObject({
      emitidoPor: 'Admin Teste',
      cliente: { razaoSocial: 'MERCADO BOM PRECO LTDA' },
      balanca: { numeroSerie: 'TL-2231' },
      signatario: { id: t.adminId },
      tecnico: { id: t.adminId },
    })
    expect(emitida.emissao?.codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)

    // O PDF servido é o guardado: o mesmo SHA-256 da emissão
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(createHash('sha256').update(pdf.rawPayload).digest('hex')).toBe(emitida.emissao?.hashPdf)
    const baixar = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf?baixar=1`, { cookie: t.cookieAdmin })
    expect(baixar.headers['content-disposition']).toMatch(/^attachment; filename="Certificado-CC-\d{4}-00001\.pdf"$/)

    // Mudar o cadastro depois não muda o certificado emitido
    await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, numeroSerie: 'OUTRO', versao: balanca.versao },
    })
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.balanca.numeroSerie).toBe('TL-2231')
    expect(detalhe.revisoes).toEqual([])

    // Emitido não se edita, não se exclui e não se emite de novo
    expect((await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: k })).statusCode).toBe(409)
    expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(409)
    expect((await emitir(emitida)).statusCode).toBe(409)

    // A próxima emissão segue a sequência do ano
    const outra = await calibracaoPronta()
    expect((await emitir(outra)).json().calibracao.numero).toBe(`CC-${ano}-00002`)
  })

  it('verificação pública pelo código, sem login', async () => {
    const k = await calibracaoPronta()
    const emitida: Calibracao = (await emitir(k)).json().calibracao
    const codigo = emitida.emissao!.codigo
    const r = await t.app.inject({ method: 'GET', url: `/api/verificar/${codigo.toLowerCase()}` })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      numero: emitida.numero,
      status: 'EMITIDO',
      cliente: 'MERCADO BOM PRECO LTDA',
      numeroSerie: 'TL-2231',
      hashPdf: emitida.emissao!.hashPdf,
    })
    // Só o essencial: nada de leituras, endereço ou e-mail
    expect(Object.keys(r.json()).sort()).toEqual(
      ['balanca', 'cliente', 'dataCalibracao', 'dataEmissao', 'hashPdf', 'numero', 'numeroSerie', 'status'].sort(),
    )
    expect((await t.app.inject({ method: 'GET', url: '/api/verificar/AAAA-BBBB' })).statusCode).toBe(404)
    expect((await t.app.inject({ method: 'GET', url: '/api/verificar/qualquer-coisa' })).statusCode).toBe(404)
  })

  it('o técnico que não é signatário envia para revisão; só o signatário emite', async () => {
    const k = await calibracaoPronta(t.cookieComum)
    expect(k.tecnicoId).toBe(t.comumId)
    const negado = await emitir(k, t.cookieComum)
    expect(negado.statusCode).toBe(403)
    expect(negado.json().erro).toMatch(/signatário/)

    const revisao = await t.chamar('POST', `/api/calibracoes/${k.id}/situacao`, {
      cookie: t.cookieComum,
      payload: { status: 'REVISAO', versao: k.versao },
    })
    expect(revisao.statusCode).toBe(200)
    const aguardando: Calibracao = revisao.json().calibracao
    expect(aguardando.status).toBe('REVISAO')

    const ok = await emitir(aguardando)
    expect(ok.statusCode).toBe(200)
    expect(ok.json().calibracao.emissao).toMatchObject({ tecnico: { id: t.comumId }, signatario: { id: t.adminId } })
  })

  describe('quem assina o certificado (congelado na emissão)', () => {
    async function revisorObrigatorio(ligado: boolean) {
      const config = (await t.chamar('GET', '/api/config', { cookie: t.cookieAdmin })).json().config
      const r = await t.chamar('PUT', '/api/config', { cookie: t.cookieAdmin, payload: { ...config, exigirRevisor: ligado } })
      expect(r.statusCode).toBe(200)
    }
    /** O técnico (o usuário comum) digita a calibração; o administrador, signatário, emite. */
    async function doTecnico(): Promise<Calibracao> {
      const k = await calibracaoPronta(t.cookieComum)
      expect(k.tecnicoId).toBe(t.comumId)
      return k
    }

    it('desligada: só a assinatura de quem executou, mesmo emitido por outra pessoa (quem emitiu fica registrado)', async () => {
      await revisorObrigatorio(false)
      const r = await emitir(await doTecnico())
      expect(r.statusCode, r.body).toBe(200)
      const k: Calibracao = r.json().calibracao
      expect(k.emissao).toMatchObject({
        assinaturas: 'TECNICO',
        tecnico: { id: t.comumId, nome: 'Comum Teste' },
        signatario: { id: t.adminId },
        emitidoPor: 'Admin Teste',
      })
      if (temPdftotext) {
        const texto = textoDoPdf(readFileSync(join(t.pasta, 'certificados', k.emissao!.arquivo)))
        expect(texto).toContain('EXECUTADO POR')
        expect(texto).toContain('Comum Teste')
        expect(texto).not.toContain('AUTORIZADO POR')
        expect(texto).not.toContain('Admin Teste')
      }
      // A configuração mudada depois não muda o emitido (o PDF refeito dos dados congelados é o mesmo)
      await revisorObrigatorio(true)
      const k2 = t.ctx.repo.obterCalibracao(k.id)!
      const refeito = await gerarPdf(k2, k2.emissao!, '')
      expect(createHash('sha256').update(refeito).digest('hex')).toBe(k2.emissao!.hashPdf)
    })

    it('desligada e o técnico emite a própria calibração: "Executado por", uma assinatura só', async () => {
      await revisorObrigatorio(false)
      const r = await emitir(await calibracaoPronta())
      const k: Calibracao = r.json().calibracao
      expect(k.emissao).toMatchObject({ assinaturas: 'TECNICO', tecnico: { id: t.adminId }, signatario: { id: t.adminId } })
      if (temPdftotext) {
        const texto = textoDoPdf(readFileSync(join(t.pasta, 'certificados', k.emissao!.arquivo)))
        expect(texto).toContain('EXECUTADO POR')
        expect(texto).not.toContain('AUTORIZADO')
      }
    })

    it('ligada: as duas assinaturas, de quem executou e de quem autorizou', async () => {
      await revisorObrigatorio(true)
      const r = await emitir(await doTecnico())
      expect(r.statusCode, r.body).toBe(200)
      const k: Calibracao = r.json().calibracao
      expect(k.emissao).toMatchObject({
        assinaturas: 'TECNICO_E_SIGNATARIO',
        tecnico: { id: t.comumId },
        signatario: { id: t.adminId },
      })
      if (temPdftotext) {
        const texto = textoDoPdf(readFileSync(join(t.pasta, 'certificados', k.emissao!.arquivo)))
        for (const x of ['EXECUTADO POR', 'AUTORIZADO POR', 'Comum Teste', 'Admin Teste']) expect(texto).toContain(x)
      }
    })

    it('a prévia segue a configuração de agora', async () => {
      const k = await doTecnico()
      for (const ligado of [false, true]) {
        await revisorObrigatorio(ligado)
        const previa = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
        expect(previa.statusCode).toBe(200)
        if (temPdftotext) expect(textoDoPdf(previa.rawPayload).includes('AUTORIZADO POR')).toBe(ligado)
      }
    })
  })

  it('com revisor obrigatório, quem executou não emite o próprio certificado', async () => {
    const config = (await t.chamar('GET', '/api/config', { cookie: t.cookieAdmin })).json().config
    expect(
      (await t.chamar('PUT', '/api/config', { cookie: t.cookieAdmin, payload: { ...config, exigirRevisor: true } })).statusCode,
    ).toBe(200)
    const k = await calibracaoPronta()
    const r = await emitir(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toMatch(/outra pessoa/)
  })

  describe('com revisor obrigatório, trocar o técnico não contorna a regra', () => {
    async function exigirRevisor(ligado = true) {
      const config = (await t.chamar('GET', '/api/config', { cookie: t.cookieAdmin })).json().config
      const r = await t.chamar('PUT', '/api/config', { cookie: t.cookieAdmin, payload: { ...config, exigirRevisor: ligado } })
      expect(r.statusCode).toBe(200)
    }
    async function tornarSignatario(id: string) {
      const r = await t.chamar('PUT', `/api/usuarios/${id}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
      expect(r.statusCode, r.body).toBe(200)
    }
    /** Um terceiro usuário, signatário: o revisor. */
    async function revisor(): Promise<{ id: string; cookie: string }> {
      const senha = 'tucano-roxo-cantando'
      const { usuario } = await t.usuarios.definirSenhaLocal({ login: 'revisor', nome: 'Revisor Teste', senha })
      await tornarSignatario(usuario.id)
      return { id: usuario.id, cookie: await t.cookieDe('revisor', senha) }
    }
    async function salvar(k: Calibracao, cookie: string, mudar: Partial<CalibracaoInput> & Record<string, unknown>) {
      const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie, payload: { ...k, ...mudar, versao: k.versao } })
      expect(r.statusCode, r.body).toBe(200)
      return r.json().calibracao as Calibracao
    }
    const registros = (alvo: string) =>
      (
        t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'ALTERACAO' AND alvo = ? ORDER BY id").all(alvo) as Array<{
          detalhe: string
        }>
      ).map((r) => r.detalhe)

    it('o signatário que executou troca o técnico para um colega e mesmo assim não emite; outro signatário emite', async () => {
      await exigirRevisor()
      await tornarSignatario(t.comumId)
      const k = await calibracaoPronta(t.cookieComum)
      expect(k).toMatchObject({ tecnicoId: t.comumId, tecnicoDefinidoPorId: t.comumId })
      expect((await emitir(k, t.cookieComum)).statusCode).toBe(409)

      const trocado = await salvar(k, t.cookieComum, { tecnicoId: t.adminId })
      expect(trocado).toMatchObject({ tecnicoId: t.adminId, tecnicoDefinidoPorId: t.comumId })
      const negado = await emitir(trocado, t.cookieComum)
      expect(negado.statusCode).toBe(409)
      expect(negado.json().erro).toBe(
        'A empresa exige que outra pessoa revise e autorize: quem indicou o técnico desta calibração não pode emitir o certificado.',
      )
      // O registro de atividades diz a troca
      expect(registros(k.id)).toContain('PUT /api/calibracoes/:id | técnico: Comum Teste → Admin Teste')
      // O técnico indicado (admin) também não emite: é o dele
      expect((await emitir(trocado, t.cookieAdmin)).json().erro).toMatch(/técnico que executou/)

      const r = await revisor()
      const ok = await emitir(trocado, r.cookie)
      expect(ok.statusCode, ok.body).toBe(200)
      expect(ok.json().calibracao.emissao).toMatchObject({ tecnico: { id: t.adminId }, signatario: { id: r.id } })
    })

    it('o revisor que só corrige a digitação emite; o técnico indicado que grava a própria calibração confirma', async () => {
      await exigirRevisor()
      // O técnico (sem ser signatário) digita a folha; o signatário confere, corrige uma observação e emite
      const k = await calibracaoPronta(t.cookieComum)
      const corrigido = await salvar(k, t.cookieAdmin, { observacoes: 'Balança conferida no local de uso.' })
      expect(corrigido.tecnicoDefinidoPorId).toBe(t.comumId)
      expect(registros(k.id).filter((d) => d.includes('técnico:'))).toEqual([])
      const ok = await emitir(corrigido, t.cookieAdmin)
      expect(ok.statusCode, ok.body).toBe(200)

      // O admin digita a calibração do colega e indica o técnico: não emite. O técnico indicado grava a calibração
      // (confere os dados): a indicação passa a ser dele, e o admin emite
      await tornarSignatario(t.comumId)
      const outra = await calibracaoPronta(t.cookieAdmin)
      const doColega = await salvar(outra, t.cookieAdmin, { tecnicoId: t.comumId })
      expect(doColega.tecnicoDefinidoPorId).toBe(t.adminId)
      expect((await emitir(doColega, t.cookieAdmin)).json().erro).toMatch(/quem indicou o técnico/)
      const conferido = await salvar(doColega, t.cookieComum, { observacoes: 'Conferido pelo técnico.' })
      expect(conferido.tecnicoDefinidoPorId).toBe(t.comumId)
      expect((await emitir(conferido, t.cookieAdmin)).statusCode).toBe(200)
    })

    it('quem indicou o técnico vem só do servidor: o enviado pela tela é ignorado', async () => {
      const criado = await t.chamar('POST', '/api/calibracoes', {
        cookie: t.cookieComum,
        payload: { clienteId: cliente.id, balancaId: balanca.id, tecnicoDefinidoPorId: t.adminId },
      })
      const k: Calibracao = criado.json().calibracao
      expect(k.tecnicoDefinidoPorId).toBe(t.comumId)
      const salvo = await salvar(k, t.cookieAdmin, { tecnicoDefinidoPorId: 'outro' })
      expect(salvo.tecnicoDefinidoPorId).toBe(t.comumId)
      expect(t.ctx.repo.obterCalibracao(k.id)!.tecnicoDefinidoPorId).toBe(t.comumId)
    })

    it('a revisão do certificado mantém quem indicou o técnico: o signatário que revisa emite', async () => {
      await exigirRevisor()
      const emitida: Calibracao = (await emitir(await calibracaoPronta(t.cookieComum))).json().calibracao
      const { calibracao: rev } = (await criar(`/api/calibracoes/${emitida.id}/revisar`, {
        motivo: 'Correção da identificação da balança',
      })) as { calibracao: Calibracao }
      expect(rev).toMatchObject({ tecnicoId: t.comumId, tecnicoDefinidoPorId: t.comumId })
      const r = await emitir(rev)
      expect(r.statusCode, r.body).toBe(200)
      // Calibrar de novo: o técnico é quem pediu
      const nova = await criar(`/api/calibracoes/${emitida.id}/recalibrar`, {}, t.cookieComum)
      expect(nova.calibracao).toMatchObject({ tecnicoId: t.comumId, tecnicoDefinidoPorId: t.comumId })
    })

    it('desligado, nada muda: quem troca o técnico emite (e a troca fica no registro)', async () => {
      await exigirRevisor(false)
      const k = await calibracaoPronta(t.cookieAdmin)
      const trocado = await salvar(k, t.cookieAdmin, { tecnicoId: t.comumId })
      expect(registros(k.id)).toContain('PUT /api/calibracoes/:id | técnico: Admin Teste → Comum Teste')
      expect((await emitir(trocado, t.cookieAdmin)).statusCode).toBe(200)
    })
  })

  it('padrão vencido na data da calibração bloqueia a emissão', async () => {
    const k = await calibracaoPronta()
    const r = await t.chamar('PUT', `/api/padroes/${pesos.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...pesos, validade: '2026-01-11', versao: pesos.versao },
    })
    expect(r.statusCode).toBe(200)
    const negado = await emitir(k)
    expect(negado.statusCode).toBe(409)
    expect(negado.json().erro).toMatch(/JP-01 estava vencido/)
    expect(negado.json().pendencias.length).toBeGreaterThan(0)
  })

  it('sem leituras não emite: as pendências dizem o que falta', async () => {
    const { calibracao: k } = await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })
    const r = await emitir(k)
    expect(r.statusCode).toBe(409)
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pendencias).toEqual(expect.arrayContaining([expect.stringMatching(/temperatura/)]))
  })

  it('prévia do rascunho sai com marca d’água, sem gravar nada', async () => {
    const k = await calibracaoPronta()
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
    expect(r.statusCode).toBe(200)
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    const depois = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().calibracao
    expect(depois).toMatchObject({ status: 'RASCUNHO', numero: '', versao: k.versao })
  })

  it('prévia sem as imagens das assinaturas (ninguém autorizou ainda); o emitido, com elas', async () => {
    // Técnico e signatário com a assinatura digitalizada
    t.ctx.db.prepare('UPDATE usuarios SET assinatura = ?').run(ASSINATURA_EXEMPLO_1)
    const k = await calibracaoPronta()
    const imagens = (pdf: Buffer) => pdf.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0
    const previa = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
    expect(previa.statusCode).toBe(200)
    expect(imagens(previa.rawPayload)).toBe(0)
    const emitida = await emitir(k)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
    expect(imagens(pdf.rawPayload)).toBeGreaterThan(0)
  })
})

describe('PDF do certificado emitido: o arquivo guardado é o documento (o hash da emissão nunca muda)', () => {
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
  const caminhoDo = (k: Calibracao) => join(t.pasta, 'certificados', k.emissao!.arquivo)
  const hashNoBanco = (k: Calibracao) => t.ctx.repo.obterCalibracao(k.id)!.emissao!.hashPdf
  const verificar = async (k: Calibracao) =>
    (await t.app.inject({ method: 'GET', url: `/api/verificar/${k.emissao!.codigo}` })).json().hashPdf as string
  const baixar = (k: Calibracao) => t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })

  /**
   * Um certificado emitido por uma versão anterior do gerador (outro layout): o hash registrado é o do PDF
   * daquela versão, que o gerador de hoje não refaz igual.
   */
  function emitidoPorOutraVersao(k: Calibracao, hashAntigo: string) {
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const dados = { ...atual, emissao: { ...atual.emissao!, hashPdf: hashAntigo } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(dados), k.id)
  }

  it('arquivo sumido e o PDF refeito agora sai outro (versão anterior): 409, nada é regravado e o hash continua', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const antigo = 'a'.repeat(64)
    emitidoPorOutraVersao(k, antigo)
    unlinkSync(caminhoDo(k))
    expect(await verificar(k)).toBe(antigo)

    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe(
      `O PDF do certificado ${k.numero} não está na pasta de dados (certificados/${k.emissao!.arquivo}). Volte essa pasta da cópia de segurança externa: um PDF refeito agora não seria o mesmo documento.`,
    )
    // Nada foi gravado no lugar do original nem no registro da emissão; a página pública continua com o hash
    expect(existsSync(caminhoDo(k))).toBe(false)
    expect(hashNoBanco(k)).toBe(antigo)
    expect(await verificar(k)).toBe(antigo)
    // Nem o e-mail (que anexa o PDF) refaz o certificado
    const anexos = await t.chamar('GET', `/api/calibracoes/${k.id}/anexos`, { cookie: t.cookieAdmin })
    expect(anexos.statusCode).toBe(409)
    const email = await t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
      cookie: t.cookieAdmin,
      payload: { para: 'qualidade@mercado.com.br' },
    })
    expect(email.statusCode).toBe(409)
    expect(existsSync(caminhoDo(k))).toBe(false)
    expect(hashNoBanco(k)).toBe(antigo)
  })

  it('arquivo sumido e o PDF refeito sai idêntico (mesma versão): volta para a pasta e é servido', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const original = readFileSync(caminhoDo(k))
    expect(sha(original)).toBe(k.emissao!.hashPdf)
    unlinkSync(caminhoDo(k))
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(sha(r.rawPayload)).toBe(k.emissao!.hashPdf)
    expect(readFileSync(caminhoDo(k)).equals(original)).toBe(true)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
  })

  it('emitido antes da 1.0.4 com duas assinaturas, gravado com as imagens em qualquer ordem: o arquivo sumido volta igual', async () => {
    // A 1.0.3 gravava as imagens das assinaturas na ordem em que cada PNG terminava de descomprimir: com o PNG do
    // técnico maior que o do signatário, a do signatário entrava antes (a ordem inversa à do pedido)
    t.ctx.db.prepare('UPDATE usuarios SET assinatura = ? WHERE id = ?').run(ASSINATURA_EXEMPLO_1, t.comumId)
    t.ctx.db.prepare('UPDATE usuarios SET assinatura = ? WHERE id = ?').run(ASSINATURA_EXEMPLO_2, t.adminId)
    expect(ASSINATURA_EXEMPLO_1.length).toBeGreaterThan(ASSINATURA_EXEMPLO_2.length)
    const emitida: Calibracao = (await emitir(await calibracaoPronta(t.cookieComum))).json().calibracao
    expect(emitida.emissao).toMatchObject({ tecnico: { id: t.comumId }, signatario: { id: t.adminId } })
    // Como a 1.0.3 congelava: sem `assinaturas` (as duas, "Executado por" e "Autorizado por")
    const { assinaturas: _, ...legado } = emitida.emissao!
    const naOrdem = await gerarPdf(emitida, legado, '')
    const invertido = await comImagensNaOrdemInversa(() => gerarPdf(emitida, legado, ''))
    expect(sha(invertido)).not.toBe(sha(naOrdem))
    const imagens = (pdf: Buffer) => pdf.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0
    expect(imagens(naOrdem)).toBe(4) // as duas imagens e as duas máscaras da transparência
    for (const gravado of [invertido, naOrdem]) {
      const k = { ...emitida, emissao: { ...legado, hashPdf: sha(gravado) } }
      t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(k), k.id)
      rmSync(caminhoDo(k), { force: true })
      const r = await baixar(k)
      expect(r.statusCode, r.body).toBe(200)
      expect(r.rawPayload.equals(gravado)).toBe(true)
      expect(readFileSync(caminhoDo(k)).equals(gravado)).toBe(true)
      expect(hashNoBanco(k)).toBe(sha(gravado))
    }
    // O emitido a partir da 1.0.4 (com `assinaturas`) sai sempre na ordem do pedido: a outra não é o documento emitido
    const novo = { ...emitida, emissao: { ...legado, assinaturas: 'TECNICO_E_SIGNATARIO' as const, hashPdf: sha(invertido) } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(novo), novo.id)
    unlinkSync(caminhoDo(novo))
    expect((await baixar(novo)).statusCode).toBe(409)
    expect(existsSync(caminhoDo(novo))).toBe(false)
  })

  it('arquivo alterado depois da emissão: 409, e o arquivo e o hash ficam como estão', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const alterado = readFileSync(caminhoDo(k))
    alterado[alterado.length - 20] ^= 0x01
    writeFileSync(caminhoDo(k), alterado)
    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe(
      `O PDF do certificado ${k.numero} (certificados/${k.emissao!.arquivo}) foi alterado depois da emissão. Volte o original da cópia de segurança externa.`,
    )
    expect(readFileSync(caminhoDo(k)).equals(alterado)).toBe(true)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
  })

  /** A emissão gravada sem o PDF registrado (o servidor caiu entre a emissão e a gravação do arquivo). */
  function semPdfRegistrado(k: Calibracao) {
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const dados = { ...atual, emissao: { ...atual.emissao!, hashPdf: '', arquivo: '' } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(dados), k.id)
  }

  it('emissão sem o PDF registrado e sem arquivo: o PDF é gerado, gravado e registrado', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    unlinkSync(caminhoDo(k))
    semPdfRegistrado(k)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(readFileSync(caminhoDo(k)).equals(r.rawPayload)).toBe(true)
    expect(t.ctx.repo.obterCalibracao(k.id)!.emissao).toMatchObject({ arquivo: k.emissao!.arquivo, hashPdf: sha(r.rawPayload) })
  })

  it('emissão sem o PDF registrado e outro PDF com o mesmo nome na pasta: nunca é sobrescrito; o novo ganha outro nome', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    // Outro documento com o mesmo nº na pasta (por exemplo, de um banco que voltou de uma cópia)
    const outro = Buffer.from('%PDF-1.7\n% outro certificado com o mesmo nº\n%%EOF\n', 'latin1')
    writeFileSync(caminhoDo(k), outro)
    semPdfRegistrado(k)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(readFileSync(caminhoDo(k)).equals(outro)).toBe(true)
    const novo = `${k.ano}/Certificado-${k.numero}-${sha(r.rawPayload).slice(0, 12)}.pdf`
    expect(t.ctx.repo.obterCalibracao(k.id)!.emissao).toMatchObject({ arquivo: novo, hashPdf: sha(r.rawPayload) })
    expect(readFileSync(join(t.pasta, 'certificados', novo)).equals(r.rawPayload)).toBe(true)
    // Nenhum arquivo pela metade fica na pasta, e o registro de atividades diz onde cada um ficou
    expect(existsSync(`${join(t.pasta, 'certificados', novo)}.parcial`)).toBe(false)
    const registro = t.ctx.db
      .prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id DESC LIMIT 1")
      .get() as { detalhe: string }
    expect(registro.detalhe).toBe(
      `O PDF do certificado ${k.numero} foi gravado em certificados/${novo}: já havia outro arquivo com o mesmo nome (certificados/${k.emissao!.arquivo}), que ficou como estava.`,
    )
    // Daqui em diante, o registrado é o servido
    const deNovo = await baixar(k)
    expect(deNovo.rawPayload.equals(r.rawPayload)).toBe(true)
  })

  it('o registro do PDF não troca o hash de uma emissão já registrada', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    expect(() => t.ctx.repo.registrarPdf(k.id, k.emissao!.arquivo, 'b'.repeat(64))).toThrow(/não muda/)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
    // O mesmo hash (gravar de novo o mesmo arquivo) continua valendo
    t.ctx.repo.registrarPdf(k.id, k.emissao!.arquivo, k.emissao!.hashPdf)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
  })

  const cancelar = async (k: Calibracao) => {
    const ok = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: k.versao },
    })
    expect(ok.statusCode, ok.body).toBe(200)
    return ok.json().calibracao as Calibracao
  }

  /**
   * O motor mudou depois da emissão (uma atualização do programa): o certificado entregue tem a descida (colunas
   * "Indicação ↓" e "Erro ↓"), e o cálculo de hoje, com os mesmos dados, deixa só a subida (como a coluna escondida
   * pelo método, que passou a ficar de fora). O PDF refeito agora sai outro documento.
   */
  async function motorMudou(k: Calibracao) {
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const dados = { ...atual, indicacao: { ...atual.indicacao, metodo: 'CONTINUO' } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(dados), k.id)
    const refeito = await gerarPdf(t.ctx.repo.obterCalibracao(k.id)!, k.emissao!, '')
    expect(sha(refeito)).not.toBe(k.emissao!.hashPdf)
    if (temPdftotext) expect(textoDoPdf(refeito)).not.toContain('Erro ↓')
  }

  /** A cópia parte do PDF entregue: os bytes dele, intactos, no começo, e a marca d'água acrescentada depois. */
  function confereCopiaDoEntregue(copia: Buffer, entregue: Buffer, marca: string) {
    expect(sha(entregue)).not.toBe(sha(copia))
    expect(copia.length).toBeGreaterThan(entregue.length)
    expect(sha(copia.subarray(0, entregue.length))).toBe(sha(entregue))
    // A marca desenhada no que foi acrescentado (o pdftotext não lê o texto inclinado)
    expect(copia.subarray(entregue.length).toString('latin1')).toContain(`(${textoPdf(marca)}) Tj`)
    if (!temPdftotext) return
    const texto = textoDoPdf(copia)
    // Os números do certificado entregue (a descida que o cálculo de hoje deixaria de fora)
    const doEntregue = textoDoPdf(entregue)
    expect(doEntregue).toContain('Erro ↓')
    for (const trecho of ['Erro ↓', 'Indicação ↓', '+0,010']) expect(contar(texto, trecho)).toBe(contar(doEntregue, trecho))
  }

  it('cancelado: a cópia é o PDF entregue com a marca d’água, mesmo se o cálculo de hoje sair outro', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const entregue = readFileSync(caminhoDo(k))
    const cancelado = await cancelar(k)
    await motorMudou(k)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.headers['content-type']).toBe('application/pdf')
    confereCopiaDoEntregue(r.rawPayload, entregue, 'CANCELADO')
    // O anexo do certificado (e-mail) é a mesma cópia
    const { anexos } = await anexosDoCertificado(t.ctx, t.ctx.repo.obterCalibracao(cancelado.id)!)
    expect(anexos[0].id).toBe('certificado')
    expect(anexos[0].ler().equals(r.rawPayload)).toBe(true)
    expect(anexos[0].tamanho).toBe(r.rawPayload.length)
    // O arquivo guardado e o hash da emissão ficam como estão
    expect(readFileSync(caminhoDo(k)).equals(entregue)).toBe(true)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
  })

  it('substituído: a cópia do revisado é o PDF entregue dele com a marca d’água, não um PDF refeito', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const entregue = readFileSync(caminhoDo(original))
    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Erro de indicação da descida',
    })) as { calibracao: Calibracao }
    const r1 = await emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
    expect(t.ctx.repo.obterCalibracao(original.id)!.status).toBe('SUBSTITUIDO')
    await motorMudou(original)
    const r = await baixar(original)
    expect(r.statusCode, r.body).toBe(200)
    confereCopiaDoEntregue(r.rawPayload, entregue, 'SUBSTITUÍDO')
    expect(readFileSync(caminhoDo(original)).equals(entregue)).toBe(true)
    expect(hashNoBanco(original)).toBe(original.emissao!.hashPdf)
  })

  it('cancelado com o arquivo sumido e o PDF refeito idêntico: o original volta para a pasta e a cópia sai com a marca', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const entregue = readFileSync(caminhoDo(k))
    await cancelar(k)
    unlinkSync(caminhoDo(k))
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(sha(r.rawPayload.subarray(0, entregue.length))).toBe(k.emissao!.hashPdf)
    expect(r.rawPayload.subarray(entregue.length).toString('latin1')).toContain('(CANCELADO) Tj')
    expect(readFileSync(caminhoDo(k)).equals(entregue)).toBe(true)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
  })

  it('cancelado com o arquivo sumido e o PDF refeito outro: 409, sem cópia com outros números', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await cancelar(k)
    await motorMudou(k)
    unlinkSync(caminhoDo(k))
    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe(
      `O PDF do certificado ${k.numero} não está na pasta de dados (certificados/${k.emissao!.arquivo}). Volte essa pasta da cópia de segurança externa: um PDF refeito agora não seria o mesmo documento.`,
    )
    expect(existsSync(caminhoDo(k))).toBe(false)
    expect(hashNoBanco(k)).toBe(k.emissao!.hashPdf)
  })

  it('cancelado com o arquivo alterado: 409, e o arquivo e o hash ficam como estão', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await cancelar(k)
    const alterado = readFileSync(caminhoDo(k))
    alterado[alterado.length - 20] ^= 0x01
    writeFileSync(caminhoDo(k), alterado)
    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe(
      `O PDF do certificado ${k.numero} (certificados/${k.emissao!.arquivo}) foi alterado depois da emissão. Volte o original da cópia de segurança externa.`,
    )
    expect(readFileSync(caminhoDo(k)).equals(alterado)).toBe(true)
  })

  it('cancelado com um PDF guardado que não recebe a marca (outro formato): 409, nunca a cópia sem a marca', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await cancelar(k)
    // Um PDF de outro programa no lugar, registrado como o emitido (o hash confere)
    const outro = Buffer.from('%PDF-1.7\n% outro gerador\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1')
    writeFileSync(caminhoDo(k), outro)
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const dados = { ...atual, emissao: { ...atual.emissao!, hashPdf: sha(outro) } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(dados), k.id)
    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toMatch(
      new RegExp(`^Não foi possível pôr a marca d'água "CANCELADO" no PDF do certificado ${k.numero} \\(certificados/`),
    )
    expect(readFileSync(caminhoDo(k)).equals(outro)).toBe(true)
  })

  it('cancelado sem o PDF registrado (o servidor caiu antes da gravação): sem documento entregue, sai o refeito com a marca', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await cancelar(k)
    unlinkSync(caminhoDo(k))
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const dados = { ...atual, emissao: { ...atual.emissao!, hashPdf: '', arquivo: '' } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(dados), k.id)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    const k2 = t.ctx.repo.obterCalibracao(k.id)!
    expect(r.rawPayload.equals(await gerarPdf(k2, k2.emissao!, 'CANCELADO'))).toBe(true)
    // Nada é gravado nem registrado: o cancelado não ganha um "emitido" novo
    expect(existsSync(caminhoDo(k))).toBe(false)
    expect(t.ctx.repo.obterCalibracao(k.id)!.emissao).toMatchObject({ hashPdf: '', arquivo: '' })
  })
})

describe('revisão e cancelamento', () => {
  it('a correção sai com o mesmo nº e substitui o original, que fica guardado só no sistema como versão anterior', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const ano = original.ano!
    const pasta = join(t.pasta, 'certificados', String(ano))
    const pdfOriginal = readFileSync(join(pasta, `Certificado-${original.numero}.pdf`))
    const semMotivo = await t.chamar('POST', `/api/calibracoes/${original.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: '' },
    })
    expect(semMotivo.statusCode).toBe(400)
    expect(semMotivo.json().erro).toBe('Explique o que vai ser corrigido (fica registrado no sistema).')

    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Correção da identificação da balança',
    })) as { calibracao: Calibracao }
    expect(rev).toMatchObject({
      status: 'RASCUNHO',
      substituiId: original.id,
      revisao: 1,
      motivoRevisao: 'Correção da identificação da balança',
    })
    // Leituras copiadas
    expect(rev.indicacao.pontos.map((p) => p.crescente)).toEqual(original.indicacao.pontos.map((p) => p.crescente))
    // Uma correção por vez
    expect(
      (
        await t.chamar('POST', `/api/calibracoes/${original.id}/revisar`, {
          cookie: t.cookieAdmin,
          payload: { motivo: 'outra revisão' },
        })
      ).statusCode,
    ).toBe(409)
    const andamento = (await t.chamar('GET', `/api/calibracoes/${original.id}`, { cookie: t.cookieAdmin })).json()
    expect(andamento.revisoes).toEqual([{ id: rev.id, numero: '', status: 'RASCUNHO' }])
    // Na lista, a correção em andamento mostra o nº que vai manter, sem a data de emissão do certificado corrigido
    expect(rev.dataEmissao).toBe('')
    const abertas = (await t.chamar('GET', '/api/calibracoes?status=ABERTAS', { cookie: t.cookieAdmin })).json()
    expect(abertas.itens).toEqual([
      expect.objectContaining({ id: rev.id, numero: '', dataEmissao: '', numeroCorrigido: original.numero }),
    ])
    expect(t.ctx.repo.resumoCalibracao(rev.id)).toMatchObject({ dataEmissao: '', numeroCorrigido: original.numero })
    expect(t.ctx.repo.resumoCalibracao(original.id)!.numeroCorrigido).toBeUndefined()
    // A tela mostra antes o nº com que a correção sai: o mesmo
    expect((await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json().numeroRevisao).toBe(
      original.numero,
    )

    const emitida = await emitir(rev)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const nova: Calibracao = emitida.json().calibracao
    // O mesmo nº, sem "-R"; por dentro, a versão seguinte (a unicidade no banco) e o PDF em outro arquivo
    expect(nova).toMatchObject({ numero: original.numero, ano, sequencia: original.sequencia, revisao: 1 })
    expect(nova.emissao).toMatchObject({
      mesmoNumero: true,
      substituiNumero: original.numero,
      substituiEmissao: original.dataEmissao,
      arquivo: `${ano}/Certificado-${original.numero}-versao-2.pdf`,
    })
    expect(nova.emissao!.codigo).not.toBe(original.emissao!.codigo)
    // O PDF da versão anterior continua na pasta, como foi entregue; o da correção, ao lado
    expect(readFileSync(join(pasta, `Certificado-${original.numero}.pdf`)).equals(pdfOriginal)).toBe(true)
    const pdfNovo = await t.chamar('GET', `/api/calibracoes/${nova.id}/pdf?baixar=1`, { cookie: t.cookieAdmin })
    expect(pdfNovo.rawPayload.equals(readFileSync(join(pasta, `Certificado-${original.numero}-versao-2.pdf`)))).toBe(true)
    // O download sai com o nº, sem a versão
    expect(pdfNovo.headers['content-disposition']).toBe(`attachment; filename="Certificado-${original.numero}.pdf"`)
    if (temPdftotext) {
      const texto = textoDoPdf(pdfNovo.rawPayload)
      expect(texto).toContain(`Fim do Certificado de Calibração nº ${original.numero} —`)
      expect(texto).not.toMatch(/-R\d|Revisão:|substitui integralmente|Motivo:|identificação da balança/)
    }

    const antigo = (await t.chamar('GET', `/api/calibracoes/${original.id}`, { cookie: t.cookieAdmin })).json()
    expect(antigo.calibracao.status).toBe('SUBSTITUIDO')
    expect(antigo.revisoes).toEqual([{ id: rev.id, numero: nova.numero, status: 'EMITIDO' }])
    // O histórico interno das versões, igual nas duas páginas: quando, quem e o motivo (só no sistema)
    const versoes = [
      {
        id: original.id,
        versao: 1,
        status: 'SUBSTITUIDO',
        emitidoEm: original.emissao!.emitidoEm,
        emitidoPor: 'Admin Teste',
        motivo: '',
      },
      {
        id: nova.id,
        versao: 2,
        status: 'EMITIDO',
        emitidoEm: nova.emissao!.emitidoEm,
        emitidoPor: 'Admin Teste',
        motivo: 'Correção da identificação da balança',
      },
    ]
    expect(antigo.versoes).toEqual(versoes)
    expect((await t.chamar('GET', `/api/calibracoes/${nova.id}`, { cookie: t.cookieAdmin })).json().versoes).toEqual(versoes)
    // A conferência pública: a versão anterior diz que foi trocada (com a data da que vale); a nova vale
    const verificacao = await t.app.inject({ method: 'GET', url: `/api/verificar/${original.emissao!.codigo}` })
    expect(verificacao.json()).toMatchObject({
      numero: original.numero,
      status: 'SUBSTITUIDO',
      versaoAtualEmitidaEm: nova.dataEmissao.split('-').reverse().join('/'),
    })
    const vale = (await t.app.inject({ method: 'GET', url: `/api/verificar/${nova.emissao!.codigo}` })).json()
    expect(vale).toMatchObject({ numero: original.numero, status: 'EMITIDO' })
    expect(vale.versaoAtualEmitidaEm).toBeUndefined()
    // A versão anterior continua com o PDF entregue, servido com a marca "substituído" por cima
    const pdf = await t.chamar('GET', `/api/calibracoes/${original.id}/pdf`, { cookie: t.cookieAdmin })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.subarray(0, pdfOriginal.length).equals(pdfOriginal)).toBe(true)
    expect(pdf.rawPayload.toString('latin1')).toContain(textoPdf('SUBSTITUÍDO'))

    // A lista: uma linha só para o nº (a versão atual), com a anotação "editado"; a busca pelo nº acha a atual
    const lista = (await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json()
    expect(lista.total).toBe(1)
    expect(lista.itens).toEqual([
      expect.objectContaining({ id: nova.id, numero: original.numero, status: 'EMITIDO', editadoEm: nova.emissao!.emitidoEm }),
    ])
    const busca = (
      await t.chamar('GET', `/api/calibracoes?busca=${encodeURIComponent(original.numero)}`, { cookie: t.cookieAdmin })
    ).json()
    expect(busca.itens.map((x: { id: string }) => x.id)).toEqual([nova.id])
    // Só a aba "Substituídos" mostra a versão anterior, marcada como tal
    const substituidos = (await t.chamar('GET', '/api/calibracoes?status=SUBSTITUIDO', { cookie: t.cookieAdmin })).json()
    expect(substituidos.total).toBe(1)
    expect(substituidos.itens).toEqual([
      expect.objectContaining({ id: original.id, numero: original.numero, status: 'SUBSTITUIDO', versaoAnterior: true }),
    ])
    expect(lista.itens[0].versaoAnterior).toBeUndefined()
    // O painel conta o certificado uma vez só
    expect(t.ctx.repo.painel().emitidosAno).toBe(1)

    // O registro de atividades guarda a correção e o motivo
    const registro = (acao: string) =>
      (t.ctx.db.prepare('SELECT detalhe FROM auditoria WHERE acao = ? ORDER BY id').all(acao) as Array<{ detalhe: string }>).map(
        (r) => r.detalhe,
      )
    expect(registro('ALTERACAO')).toContain(
      `POST /api/calibracoes/:id/revisar | ${original.numero}: Correção da identificação da balança`,
    )
    expect(registro('CERTIFICADO_EMITIDO').at(-1)).toBe(
      `POST /api/calibracoes/:id/emitir | ${original.numero} corrigido (a versão anterior fica guardada como substituída): Correção da identificação da balança`,
    )

    // A numeração dos certificados novos não muda
    const outro: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    expect(outro.numero).toBe(`CC-${ano}-00002`)
  })

  it('a correção da correção (3ª versão) também mantém o nº, mesmo com o formato da numeração mudado depois', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const ano = original.ano!
    expect(original.numero).toBe(`CC-${ano}-00001`)
    const revisar = async (k: Calibracao, motivo: string) =>
      ((await criar(`/api/calibracoes/${k.id}/revisar`, { motivo })) as { calibracao: Calibracao }).calibracao
    const rev = await revisar(original, 'Correção da identificação da balança')
    // A troca do formato depois de aberta a correção (vale para os certificados novos, não para os já emitidos)
    t.ctx.repo.salvarConfig({ ...t.ctx.repo.obterConfig(), numeracao: { formato: 'BC {seq}/{aa}', digitos: 4 } })
    const andamento = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    expect(andamento.numeroRevisao).toBe(original.numero)
    expect((await t.chamar('GET', `/api/calibracoes/${original.id}`, { cookie: t.cookieAdmin })).json().numeroRevisao).toBeNull()
    const v2: Calibracao = (await emitir(rev)).json().calibracao
    expect(v2.numero).toBe(original.numero)

    t.ctx.repo.salvarConfig({ ...t.ctx.repo.obterConfig(), numeracao: { formato: '{seq}/{ano}', digitos: 3 } })
    const r3 = await emitir(await revisar(v2, 'Correção do endereço do cliente'))
    expect(r3.statusCode, r3.body).toBe(200)
    const v3: Calibracao = r3.json().calibracao
    expect(v3).toMatchObject({ numero: original.numero, revisao: 2, substituiId: v2.id })
    expect(v3.emissao).toMatchObject({
      mesmoNumero: true,
      substituiNumero: original.numero,
      arquivo: `${ano}/Certificado-${original.numero}-versao-3.pdf`,
    })
    expect(existsSync(join(t.pasta, 'certificados', v3.emissao!.arquivo))).toBe(true)
    expect(t.ctx.repo.obterCalibracao(v2.id)!.status).toBe('SUBSTITUIDO')
    // As três versões no histórico, de qualquer uma delas; a lista com uma linha só
    const versoes = (await t.chamar('GET', `/api/calibracoes/${v2.id}`, { cookie: t.cookieAdmin })).json().versoes
    expect(
      versoes.map((v: { id: string; versao: number; status: string; motivo: string }) => [v.id, v.versao, v.status, v.motivo]),
    ).toEqual([
      [original.id, 1, 'SUBSTITUIDO', ''],
      [v2.id, 2, 'SUBSTITUIDO', 'Correção da identificação da balança'],
      [v3.id, 3, 'EMITIDO', 'Correção do endereço do cliente'],
    ])
    const lista = (await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json()
    expect(lista.itens.map((x: { id: string }) => x.id)).toEqual([v3.id])
    // Os certificados novos seguem o formato atual, na sequência de sempre
    const outro = await emitir(await calibracaoPronta())
    expect(outro.json().calibracao.numero).toBe(`002/${ano}`)
  })

  it('verificação pública de uma versão anterior quando a versão atual foi cancelada: nenhuma versão vale', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const revisar = async (k: Calibracao, motivo: string) =>
      (
        await emitir(((await criar(`/api/calibracoes/${k.id}/revisar`, { motivo })) as { calibracao: Calibracao }).calibracao)
      ).json().calibracao as Calibracao
    const v2 = await revisar(original, 'Correção da identificação da balança')
    const v3 = await revisar(v2, 'Correção do endereço do cliente')
    const verificar = async (k: Calibracao) =>
      (await t.app.inject({ method: 'GET', url: `/api/verificar/${k.emissao!.codigo}` })).json()
    // Antes do cancelamento: as anteriores apontam para a atual (com a data dela)
    expect(await verificar(original)).toMatchObject({ status: 'SUBSTITUIDO', versaoAtualEmitidaEm: expect.any(String) })
    expect((await verificar(original)).substitutoCancelado).toBeUndefined()
    const ok = await t.chamar('POST', `/api/calibracoes/${v3.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: v3.versao },
    })
    expect(ok.statusCode, ok.body).toBe(200)
    // Depois: a versão 1 e a 2 não mandam procurar "a mais nova" (ela foi cancelada)
    for (const k of [original, v2]) {
      const v = await verificar(k)
      expect(v).toMatchObject({ numero: original.numero, status: 'SUBSTITUIDO', substitutoCancelado: true })
      expect(v.versaoAtualEmitidaEm).toBeUndefined()
    }
    expect(await verificar(v3)).toMatchObject({ status: 'CANCELADO' })
    expect((await verificar(v3)).substitutoCancelado).toBeUndefined()
  })

  it('o painel conta como a aba Emitidos e as páginas do cliente e da balança: o corrigido e depois cancelado não conta', async () => {
    const revisar = async (k: Calibracao, motivo: string) =>
      (
        await emitir(((await criar(`/api/calibracoes/${k.id}/revisar`, { motivo })) as { calibracao: Calibracao }).calibracao)
      ).json().calibracao as Calibracao
    const cancelar = async (k: Calibracao) => {
      const ok = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
        cookie: t.cookieAdmin,
        payload: { motivo: 'Emitido por engano', versao: k.versao },
      })
      expect(ok.statusCode, ok.body).toBe(200)
    }
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const v2 = await revisar(original, 'Correção da identificação da balança')
    const v3 = await revisar(v2, 'Correção do endereço do cliente')
    const semCorrecao: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await emitir(await calibracaoPronta())
    const contagens = () => {
      const p = t.ctx.repo.painel()
      return {
        mes: p.emitidosMes,
        ano: p.emitidosAno,
        grafico: p.porMes.at(-1)!.quantidade,
        abaEmitidos: t.ctx.repo.listarCalibracoes({ status: 'EMITIDO' }).total,
        cliente: t.ctx.repo.listarClientes().find((c) => c.id === original.clienteId)!.certificados,
        balanca: t.ctx.repo.listarBalancas().find((b) => b.id === original.balancaId)!.certificados,
      }
    }
    // Três certificados (o corrigido conta uma vez só)
    expect(contagens()).toEqual({ mes: 3, ano: 3, grafico: 3, abaEmitidos: 3, cliente: 3, balanca: 3 })
    // Cancelados: o corrigido (a versão atual) e o que nunca foi corrigido; sobra um
    await cancelar(v3)
    await cancelar(semCorrecao)
    expect(contagens()).toEqual({ mes: 1, ano: 1, grafico: 1, abaEmitidos: 1, cliente: 1, balanca: 1 })
  })

  it('a revisão "-R1" emitida antes da 1.0.4 continua como saiu; corrigida agora, mantém o nº dela', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const ano = original.ano!
    // A revisão como a 1.0.3 a emitia: "-R1", sem a marca do mesmo nº e com o próprio PDF (com o quadro da revisão)
    const rev = (
      (await criar(`/api/calibracoes/${original.id}/revisar`, { motivo: 'Correção do endereço do cliente' })) as {
        calibracao: Calibracao
      }
    ).calibracao
    const emitida: Calibracao = (await emitir(rev)).json().calibracao
    const { mesmoNumero: _m, ...emissao103 } = emitida.emissao!
    const legado: Calibracao = {
      ...emitida,
      numero: `${original.numero}-R1`,
      emissao: { ...emissao103, hashPdf: '', arquivo: '', assinaturas: undefined },
    }
    t.ctx.db
      .prepare('UPDATE calibracoes SET numero = ?, dados = ? WHERE id = ?')
      .run(legado.numero, JSON.stringify(legado), legado.id)
    rmSync(join(t.pasta, 'certificados', emitida.emissao!.arquivo))
    const pdf = await t.chamar('GET', `/api/calibracoes/${legado.id}/pdf`, { cookie: t.cookieAdmin })
    expect(pdf.statusCode, pdf.body).toBe(200)
    expect(t.ctx.repo.obterCalibracao(legado.id)!.emissao!.arquivo).toBe(`${ano}/Certificado-${original.numero}-R1.pdf`)
    if (temPdftotext) {
      const texto = textoDoPdf(pdf.rawPayload).replace(/\s+/g, ' ')
      expect(texto).toContain(`Revisão: este certificado substitui integralmente o Certificado nº ${original.numero}`)
      expect(texto).toContain('Motivo: Correção do endereço do cliente.')
    }
    // As duas linhas, como antes (são nºs diferentes), sem histórico de versões
    const nums = async () =>
      (await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json().itens.map((x: { numero: string }) => x.numero)
    expect((await nums()).sort()).toEqual([original.numero, `${original.numero}-R1`])
    expect((await t.chamar('GET', `/api/calibracoes/${legado.id}`, { cookie: t.cookieAdmin })).json().versoes).toEqual([])

    // Corrigida agora: sai com o nº dela ("-R1"), sem quadro; a anterior sai da lista
    const r = await emitir(
      ((await criar(`/api/calibracoes/${legado.id}/revisar`, { motivo: 'Correção da OS' })) as { calibracao: Calibracao })
        .calibracao,
    )
    expect(r.statusCode, r.body).toBe(200)
    const v3: Calibracao = r.json().calibracao
    expect(v3).toMatchObject({ numero: `${original.numero}-R1`, revisao: 2 })
    expect(v3.emissao).toMatchObject({ mesmoNumero: true, arquivo: `${ano}/Certificado-${original.numero}-R1-versao-3.pdf` })
    expect((await nums()).sort()).toEqual([original.numero, `${original.numero}-R1`])
    expect(
      (await t.chamar('GET', `/api/calibracoes/${v3.id}`, { cookie: t.cookieAdmin }))
        .json()
        .versoes.map((v: { id: string }) => v.id),
    ).toEqual([legado.id, v3.id])
    // O painel conta o certificado uma vez; cancelada a versão atual, não conta mais (como a aba Emitidos)
    expect(t.ctx.repo.painel().emitidosAno).toBe(1)
    const cancelado = await t.chamar('POST', `/api/calibracoes/${v3.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: v3.versao },
    })
    expect(cancelado.statusCode, cancelado.body).toBe(200)
    expect(t.ctx.repo.painel().emitidosAno).toBe(0)
    expect(t.ctx.repo.listarCalibracoes({ status: 'EMITIDO' }).total).toBe(0)
  })

  it('só o administrador cancela, com motivo; a verificação passa a mostrar "cancelado"', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const tecnico = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Emitido por engano' },
    })
    expect(tecnico.statusCode).toBe(403)
    const semMotivo = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'x' },
    })
    expect(semMotivo.statusCode).toBe(400)
    const ok = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: k.versao },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().calibracao).toMatchObject({
      status: 'CANCELADO',
      cancelamento: { motivo: 'Emitido por engano', por: 'Admin Teste' },
    })
    const v = await t.app.inject({ method: 'GET', url: `/api/verificar/${k.emissao!.codigo}` })
    expect(v.json().status).toBe('CANCELADO')
    // Cancelado não se revisa nem se envia
    expect(
      (
        await t.chamar('POST', `/api/calibracoes/${k.id}/revisar`, {
          cookie: t.cookieAdmin,
          payload: { motivo: 'corrigir algo' },
        })
      ).statusCode,
    ).toBe(409)
    const email = await t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
      cookie: t.cookieAdmin,
      payload: { para: 'a@b.com' },
    })
    expect(email.statusCode).toBe(409)
  })

  it('com a revisão em andamento, o certificado não é cancelado (emita ou exclua a revisão antes)', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Correção do endereço do cliente',
    })) as { calibracao: Calibracao }
    const recusado = await t.chamar('POST', `/api/calibracoes/${original.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: original.versao },
    })
    expect(recusado.statusCode).toBe(409)
    expect(recusado.json().erro).toBe(MSG_CANCELAR_COM_REVISAO)
    const depois = (await t.chamar('GET', `/api/calibracoes/${original.id}`, { cookie: t.cookieAdmin })).json()
    expect(depois.calibracao).toMatchObject({ status: 'EMITIDO', versao: original.versao, cancelamento: null })
    // A correção continua pronta para emitir, com o nº do certificado corrigido
    const revisao = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    expect(revisao.pendencias).toEqual([])
    expect(revisao.numeroRevisao).toBe(original.numero)

    // Sem a revisão, o cancelamento passa
    expect((await t.chamar('DELETE', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
    const ok = await t.chamar('POST', `/api/calibracoes/${original.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: original.versao },
    })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json().calibracao.status).toBe('CANCELADO')
  })

  it('revisão de um certificado cancelado antes da trava (dado antigo): pendência, sem nº e sem emissão', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Correção do endereço do cliente',
    })) as { calibracao: Calibracao }
    // Cancelado por fora (como acontecia antes da trava do cancelamento)
    const cancelado = {
      ...original,
      status: 'CANCELADO',
      cancelamento: { motivo: 'Emitido por engano', por: 'Admin Teste', em: '2026-11-04T10:00:00.000Z' },
    }
    t.ctx.db
      .prepare("UPDATE calibracoes SET status = 'CANCELADO', dados = ? WHERE id = ?")
      .run(JSON.stringify(cancelado), original.id)

    const PENDENCIA = PENDENCIA_REVISADO_CANCELADO
    const revisao = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    expect(revisao.pendencias).toContain(PENDENCIA)
    // A tela não mostra o nº do certificado revisado (ele não sai)
    expect(revisao.numeroRevisao).toBeNull()
    // Gravar continua (para não perder o que foi digitado), com a pendência
    const salvar = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin, payload: revisao.calibracao })
    expect(salvar.statusCode, salvar.body).toBe(200)
    expect(salvar.json().pendencias).toContain(PENDENCIA)
    // Nem vai para revisão de um signatário, nem é emitida
    const situacao = await t.chamar('POST', `/api/calibracoes/${rev.id}/situacao`, {
      cookie: t.cookieAdmin,
      payload: { status: 'REVISAO' },
    })
    expect(situacao.statusCode).toBe(409)
    const emissao = await emitir(salvar.json().calibracao)
    expect(emissao.statusCode).toBe(409)
    expect(emissao.json().erro).toBe(PENDENCIA)
    // Excluir a revisão é a saída
    expect((await t.chamar('DELETE', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
  })

  it('calibrar de novo aproveita pontos e padrões, sem as leituras', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const { calibracao: nova } = (await criar(`/api/calibracoes/${k.id}/recalibrar`, {})) as { calibracao: Calibracao }
    expect(nova).toMatchObject({
      status: 'RASCUNHO',
      clienteId: cliente.id,
      balancaId: balanca.id,
      padroesIds: [pesos.id],
      substituiId: '',
    })
    expect(nova.indicacao.pontos.map((p) => p.carga)).toEqual([0, 5, 10, 20, 30])
    expect(nova.indicacao.pontos.every((p) => p.crescente === null && p.decrescente === null)).toBe(true)
    expect(nova.repetibilidade.flatMap((r) => r.leituras).every((l) => l === null)).toBe(true)
    // Uma calibração nova da mesma balança também já vem com os pontos da última emitida
    const { calibracao: outra } = (await criar('/api/calibracoes', { balancaId: balanca.id })) as { calibracao: Calibracao }
    expect(outra.clienteId).toBe(cliente.id)
    expect(outra.indicacao.pontos.map((p) => p.carga)).toEqual([0, 5, 10, 20, 30])
  })
})

describe('troca da unidade da indicação da balança', () => {
  it('as calibrações abertas acompanham (30 kg → 30 000 g); a emitida não muda', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const aberta = await calibracaoPronta()
    // A mesma balança, cadastrada em g: 30 000 g × 10 g
    const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }], versao: balanca.versao },
    })
    expect(r.statusCode, r.body).toBe(200)

    const k: Calibracao = (await t.chamar('GET', `/api/calibracoes/${aberta.id}`, { cookie: t.cookieAdmin })).json().calibracao
    // A versão sobe: uma tela com o rascunho antigo aberto não grava por cima os números em kg
    expect(k.versao).toBe(aberta.versao + 1)
    expect(k.repetibilidade[0]).toMatchObject({ carga: 15000, leituras: [15000, 15000, 15010, 15000, 15000, 15000] })
    expect(k.excentricidade.carga).toBe(10000)
    expect(k.excentricidade.posicoes.map((p) => p.leitura)).toEqual([10000, 10000, 10010, 10000, 10000])
    expect(k.indicacao.pontos.map((p) => [p.carga, p.crescente, p.decrescente])).toEqual([
      [0, 0, 0],
      [5000, 5000, 5000],
      [10000, 10000, 10010],
      [20000, 20010, 20010],
      [30000, 30010, 30010],
    ])
    expect(k.indicacao.retornoZero).toBe(0)
    // Os pesos padrão continuam os mesmos
    expect(k.indicacao.pontos[4].pecas).toEqual(aberta.indicacao.pontos[4].pecas)
    const salvar = await t.chamar('PUT', `/api/calibracoes/${aberta.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...aberta, versao: aberta.versao },
    })
    expect(salvar.statusCode).toBe(409)

    // O certificado emitido guarda a balança e as leituras de quando foi emitido
    const e: Calibracao = (await t.chamar('GET', `/api/calibracoes/${emitida.id}`, { cookie: t.cookieAdmin })).json().calibracao
    expect(e.versao).toBe(emitida.versao)
    expect(e.repetibilidade[0].carga).toBe(15)
    expect(e.emissao?.balanca).toMatchObject({ unidade: 'kg', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
  })

  it('o que é copiado de um certificado emitido vem na unidade nova (nova calibração, calibrar de novo, revisão)', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }], versao: balanca.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const cargas = (k: Calibracao) => ({
      indicacao: k.indicacao.pontos.map((p) => p.carga),
      repetibilidade: k.repetibilidade.map((x) => x.carga),
      excentricidade: k.excentricidade.carga,
    })
    const emG = { indicacao: [0, 5000, 10000, 20000, 30000], repetibilidade: [15000], excentricidade: 10000 }

    // Nova calibração (aproveita os pontos da última emitida)
    const { calibracao: nova } = (await criar('/api/calibracoes', { balancaId: balanca.id })) as { calibracao: Calibracao }
    expect(cargas(nova)).toEqual(emG)
    await t.chamar('DELETE', `/api/calibracoes/${nova.id}`, { cookie: t.cookieAdmin })

    // Calibrar de novo
    const { calibracao: denovo } = (await criar(`/api/calibracoes/${emitida.id}/recalibrar`, {})) as { calibracao: Calibracao }
    expect(cargas(denovo)).toEqual(emG)
    expect(denovo.indicacao.pontos.every((p) => p.crescente === null)).toBe(true)
    await t.chamar('DELETE', `/api/calibracoes/${denovo.id}`, { cookie: t.cookieAdmin })

    // Revisão: cargas e leituras convertidas; as pendências são as da unidade certa
    const { calibracao: rev } = (await criar(`/api/calibracoes/${emitida.id}/revisar`, {
      motivo: 'Unidade da indicação corrigida',
    })) as { calibracao: Calibracao }
    expect(cargas(rev)).toEqual(emG)
    expect(rev.indicacao.pontos.map((p) => [p.crescente, p.decrescente])).toEqual([
      [0, 0],
      [5000, 5000],
      [10000, 10010],
      [20010, 20010],
      [30010, 30010],
    ])
    expect(rev.repetibilidade[0].leituras).toEqual([15000, 15000, 15010, 15000, 15000, 15000])
    expect(rev.excentricidade.posicoes.map((p) => p.leitura)).toEqual([10000, 10000, 10010, 10000, 10000])
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pendencias).toEqual([])
    const nova2 = await emitir(rev)
    expect(nova2.statusCode, nova2.body).toBe(200)
    expect(nova2.json().calibracao.emissao.balanca).toMatchObject({ unidade: 'g' })
  })
})

describe('troca do cliente dono da balança', () => {
  const outroCliente = () =>
    criar('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Padaria Nova',
      documento: '11.222.333/0001-81',
      logradouro: 'Rua 2',
      numero: '20',
      cidade: 'Limeira',
      uf: 'SP',
    }).then((r) => r.cliente as Cliente)
  const abertasDe = async (c: Cliente) =>
    (await t.chamar('GET', `/api/calibracoes?status=ABERTAS&clienteId=${c.id}`, { cookie: t.cookieAdmin }))
      .json()
      .itens.map((k: { id: string }) => k.id)

  for (const comUnidade of [false, true]) {
    it(`os rascunhos passam para o novo cliente e continuam gravando${comUnidade ? ' (com a troca da unidade junto)' : ''}`, async () => {
      const aberta = await calibracaoPronta()
      const novo = await outroCliente()
      const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
        cookie: t.cookieAdmin,
        payload: {
          ...balanca,
          clienteId: novo.id,
          ...(comUnidade ? { unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }] } : {}),
          versao: balanca.versao,
        },
      })
      expect(r.statusCode, r.body).toBe(200)
      expect(await abertasDe(novo)).toEqual([aberta.id])
      expect(await abertasDe(cliente)).toEqual([])
      const k: Calibracao = (await t.chamar('GET', `/api/calibracoes/${aberta.id}`, { cookie: t.cookieAdmin })).json().calibracao
      expect(k.clienteId).toBe(novo.id)
      expect(k.versao).toBe(aberta.versao + 1)
      // O endereço era o do cliente antigo: passa a ser o do novo
      expect(k.localEndereco).toContain('Limeira')
      expect(k.repetibilidade[0].carga).toBe(comUnidade ? 15000 : 15)
      const salvar = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: k })
      expect(salvar.statusCode, salvar.body).toBe(200)
      expect(salvar.json().pendencias).toEqual([])
    })
  }

  const moverBalanca = async (para: Cliente, extra: Partial<Balanca> = {}) => {
    const atual: Balanca = (await t.chamar('GET', `/api/balancas/${balanca.id}`, { cookie: t.cookieAdmin })).json().balanca
    const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, clienteId: para.id, ...extra, versao: atual.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
  }

  it('o certificado emitido antes da troca continua corrigível: a revisão é do cliente do certificado revisado', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const novo = await outroCliente()
    await moverBalanca(novo)

    const r = await t.chamar('POST', `/api/calibracoes/${original.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Correção da ordem de serviço' },
    })
    expect(r.statusCode, r.body).toBe(201)
    const rev: Calibracao = r.json().calibracao
    expect(rev).toMatchObject({ clienteId: cliente.id, balancaId: balanca.id, substituiId: original.id })
    expect(rev.localEndereco).toContain('Rio Claro')
    // Gravar a revisão continua valendo, sem pendência
    const salvar = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...rev, ordemServico: 'OS 4472' },
    })
    expect(salvar.statusCode, salvar.body).toBe(200)
    expect(salvar.json().pendencias).toEqual([])
    // Sai em nome do cliente do certificado corrigido, com o mesmo nº
    const emitida = await emitir(salvar.json().calibracao)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const nova: Calibracao = emitida.json().calibracao
    expect(nova.numero).toBe(original.numero)
    expect(nova.clienteId).toBe(cliente.id)
    expect(nova.emissao?.cliente).toMatchObject({ id: cliente.id, nome: 'Mercado Bom Preço' })
    // Calibrar de novo segue o dono de hoje
    const { calibracao: denovo } = (await criar(`/api/calibracoes/${nova.id}/recalibrar`, {})) as { calibracao: Calibracao }
    expect(denovo.clienteId).toBe(novo.id)
  })

  for (const comUnidade of [false, true]) {
    it(`a revisão aberta antes da troca continua do cliente do certificado revisado${comUnidade ? ' (a unidade acompanha)' : ''}`, async () => {
      const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
      const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
        motivo: 'Correção da ordem de serviço',
      })) as { calibracao: Calibracao }
      const rascunho = await calibracaoPronta()
      const novo = await outroCliente()
      await moverBalanca(novo, comUnidade ? { unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }] } : {})

      // O rascunho comum passa para o novo dono; a revisão, não
      expect(await abertasDe(novo)).toEqual([rascunho.id])
      expect(await abertasDe(cliente)).toEqual([rev.id])
      const k: Calibracao = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json().calibracao
      expect(k.clienteId).toBe(cliente.id)
      expect(k.localEndereco).toBe(rev.localEndereco)
      // Só a troca da unidade mexe nela (e então a versão sobe)
      expect(k.versao).toBe(comUnidade ? rev.versao + 1 : rev.versao)
      expect(k.repetibilidade[0].carga).toBe(comUnidade ? 15000 : 15)
      const emitida = await emitir(k)
      expect(emitida.statusCode, emitida.body).toBe(200)
      expect(emitida.json().calibracao.emissao.cliente).toMatchObject({ id: cliente.id, nome: 'Mercado Bom Preço' })
    })
  }

  it('a revisão não troca de cliente nem de balança', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Correção da ordem de serviço',
    })) as { calibracao: Calibracao }
    const novo = await outroCliente()
    const outra: Balanca = (
      await criar('/api/balancas', {
        ...BALANCA_VAZIA,
        clienteId: novo.id,
        fabricante: 'Filizola',
        modelo: 'BP-15',
        numeroSerie: 'FZ-77',
        faixas: [{ max: 30, e: 0.01, d: 0.01 }],
      })
    ).balanca
    for (const troca of [{ clienteId: novo.id, balancaId: outra.id }, { clienteId: novo.id }]) {
      const r = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin, payload: { ...rev, ...troca } })
      expect(r.statusCode, r.body).toBe(400)
      expect(r.json().erro).toBe('A correção é do mesmo cliente e da mesma balança do certificado corrigido.')
    }
    // A balança movida para outro cliente também não vale para o rascunho comum
    const { calibracao: comum } = (await criar('/api/calibracoes', { balancaId: balanca.id })) as { calibracao: Calibracao }
    const r = await t.chamar('PUT', `/api/calibracoes/${comum.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...comum, balancaId: outra.id },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toBe('A balança escolhida é de outro cliente.')
  })
})

describe('listas e painel', () => {
  it('a lista filtra por situação e busca; o painel conta', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await calibracaoPronta()
    const todas = (await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json()
    expect(todas.total).toBe(2)
    const abertas = (await t.chamar('GET', '/api/calibracoes?status=ABERTAS', { cookie: t.cookieAdmin })).json()
    expect(abertas.itens.map((i: { status: string }) => i.status)).toEqual(['RASCUNHO'])
    const busca = (
      await t.chamar('GET', `/api/calibracoes?busca=${encodeURIComponent('tl-2231')}`, { cookie: t.cookieAdmin })
    ).json()
    expect(busca.total).toBe(2)
    const porNumero = (
      await t.chamar('GET', `/api/calibracoes?busca=${encodeURIComponent(emitida.numero)}`, { cookie: t.cookieAdmin })
    ).json()
    expect(porNumero.itens.map((i: { id: string }) => i.id)).toEqual([emitida.id])
    const painel = (await t.chamar('GET', '/api/painel', { cookie: t.cookieAdmin })).json().painel
    expect(painel).toBeTruthy()
  })
})

describe('balança classe I: o rascunho novo', () => {
  async function analitica() {
    return (
      await criar('/api/balancas', {
        ...BALANCA_VAZIA,
        clienteId: cliente.id,
        tipo: 'ANALITICA',
        unidade: 'g',
        classe: 'I',
        fabricante: 'Shimadzu',
        modelo: 'AUW220',
        numeroSerie: 'D4501',
        faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
      })
    ).balanca as Balanca
  }
  async function jogoE2() {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        identificacao: 'JP-E2',
        descricao: 'Jogo de pesos E2 1 mg a 200 g',
        classe: 'E2',
        densidade: 7950,
        incertezaDensidade: 70,
        certificado: 'LAB-0999/2026',
        laboratorio: 'Laboratório de Massa Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [{ id: 'g200', marca: '', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 }],
      })
    ).padrao as Padrao
  }

  it('sem histórico, nasce com o empuxo pela densidade do ar medida, a convecção e só os jogos E1/E2/F1', async () => {
    const b = await analitica()
    const e2 = await jogoE2()
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    expect(k.opcoes).toMatchObject({ empuxo: 'MEDIDO', conveccao: 'CALCULAR' })
    // O jogo M1 (do beforeEach) fica de fora; o E2 entra
    expect(k.padroesIds).toEqual([e2.id])
    // O u(ρ) gravado no cadastro do padrão
    const r = await t.chamar('GET', `/api/padroes`, { cookie: t.cookieAdmin })
    expect((r.json().padroes as Padrao[]).find((p) => p.id === e2.id)?.incertezaDensidade).toBe(70)
  })

  /** Instrumento auxiliar rastreável (barômetro, termômetro de duas entradas…). */
  async function auxiliar(tipo: Padrao['tipo'], identificacao: string) {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        tipo,
        identificacao,
        descricao: identificacao,
        certificado: `LAB-${identificacao}/2026`,
        laboratorio: 'Laboratório Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [],
      })
    ).padrao as Padrao
  }

  it('sem histórico: o termômetro de duas entradas ("Outro") entra; excentricidade pelo método 3 e cargas com descarga', async () => {
    const b = await analitica()
    const e2 = await jogoE2()
    const td = await auxiliar('OUTRO', 'TD-01')
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    expect([...k.padroesIds].sort()).toEqual([e2.id, td.id].sort())
    expect(k.excentricidade.metodo).toBe(3)
    expect(k.indicacao.metodo).toBe('DESCONTINUO')
    // Classe III: o "outro" fica de fora e os métodos de sempre
    const { calibracao: iii } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })) as {
      calibracao: Calibracao
    }
    expect(iii.padroesIds).not.toContain(td.id)
    expect(iii.excentricidade.metodo).toBe(1)
    expect(iii.indicacao.metodo).toBe('CRESCENTE_DECRESCENTE')
  })

  it('classe III: os dois jogos, e as opções do padrão da empresa (como sempre)', async () => {
    await jogoE2()
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })) as {
      calibracao: Calibracao
    }
    expect(k.padroesIds).toHaveLength(2)
    expect(k.opcoes).toMatchObject({ empuxo: 'NAO_AJUSTADO', deriva: 'EMA', conveccao: 'NAO_CONSIDERAR' })
  })

  it('a pressão e o ΔT pesos − ar gravados no rascunho; sem o ΔT, a pendência da convecção', async () => {
    const b = await analitica()
    const e2 = await jogoE2()
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    const ambiente = { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 55, umidadeFinal: 56, pressao: 941.5 }
    // Um ponto lido (a convecção é conferida nos pontos com leitura)
    const indicacao = {
      ...k.indicacao,
      pontos: [
        {
          id: 'p',
          carga: 200,
          pecas: [{ padraoId: e2.id, pesoId: 'g200', quantidade: 1 }],
          pecasManuais: true,
          crescente: 200.0003,
          decrescente: null,
          nivelSubstituicao: 0,
        },
      ],
    }
    let versao = k.versao
    const salvar = async (amb: object) => {
      const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
        cookie: t.cookieAdmin,
        payload: { ...k, versao, indicacao, ambiente: amb },
      })
      expect(r.statusCode).toBe(200)
      versao = r.json().calibracao.versao
      return r
    }
    const sem = await salvar(ambiente)
    expect(sem.json().pendencias).toContain(
      'Convecção: registre a diferença de temperatura entre os pesos e o ar antes do 1º ensaio, ou a aclimatação dos pesos (etapa Padrões e ambiente).',
    )
    const com = await salvar({ ...ambiente, deltaTPesos: 0.3 })
    expect(com.json().calibracao.ambiente).toMatchObject({ pressao: 941.5, deltaTPesos: 0.3, aclimatacao: null })
    expect((com.json().pendencias as string[]).some((p) => p.startsWith('Convecção'))).toBe(false)
    const acl = await salvar({ ...ambiente, aclimatacao: { deltaT0: -4, minutos: 120 } })
    expect(acl.json().calibracao.ambiente).toMatchObject({ deltaTPesos: null, aclimatacao: { deltaT0: -4, minutos: 120 } })
  })

  /** Calibração classe I pronta para emitir: ajuste interno, "como encontrado" e o ensaio final em 100 g e 200 g. */
  async function classeIPronta(b: Balanca, e2: Padrao, opcoes: Partial<Calibracao['opcoes']> = {}) {
    await auxiliar('BAROMETRO', 'BR-01')
    await auxiliar('OUTRO', 'TD-01')
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    const p = (id: string, carga: number, leitura: number, pesoId?: string) => ({
      id,
      carga,
      pecas: pesoId ? [{ padraoId: e2.id, pesoId, quantidade: 1 }] : [],
      pecasManuais: true,
      crescente: leitura,
      decrescente: null,
      nivelSubstituicao: 0,
    })
    const ensaio = (antes: boolean) => ({
      ...k.indicacao,
      retornoZero: 0,
      // Os 5 pontos do POP (7.7), contando o zero
      pontos: [
        p('z', 0, 0),
        p('c', 100, antes ? 100.0004 : 100.0001, 'g100'),
        p('m', 200, antes ? 200.0007 : 200.0002, 'g200'),
        p('a', 20, 20.0001, 'g20'),
        p('b', 50, 50.0001, 'g50'),
      ],
    })
    const dados = {
      ...k,
      opcoes: { ...k.opcoes, ...opcoes },
      ajuste: { realizado: 'INTERNO', descricao: '' },
      ambiente: {
        temperaturaInicial: 22.4,
        temperaturaFinal: 23.0,
        umidadeInicial: 58,
        umidadeFinal: 60,
        pressao: 941.5,
        deltaTPesos: 0.4,
        aclimatacao: null,
      },
      repetibilidade: [{ id: 'r', carga: 200, leituras: Array.from({ length: 10 }, (_, i) => (i % 2 ? 200.0003 : 200.0002)) }],
      // Método 3 (zera antes de cada posição), com uma peça de 100 g (POP 7.10)
      excentricidade: {
        aplicavel: true,
        motivo: '',
        carga: 100,
        metodo: 3,
        posicoes: ['Centro', 'Frente (0°)', 'Direita (90°)', 'Trás (180°)', 'Esquerda (270°)'].map((rotulo) => ({
          rotulo,
          leitura: 100.0001,
          referencia: 0,
        })),
      },
      comoEncontrado: ensaio(true),
      indicacao: ensaio(false),
    }
    const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...dados, versao: k.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().pendencias).toEqual([])
    return r.json().calibracao as Calibracao
  }

  async function jogoE2Completo() {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        identificacao: 'JP-E2',
        descricao: 'Jogo de pesos E2 100 g e 200 g',
        classe: 'E2',
        densidade: 7950,
        incertezaDensidade: 70,
        certificado: 'LAB-0999/2026',
        laboratorio: 'Laboratório de Massa Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [
          { id: 'g200', marca: '', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 },
          { id: 'g100', marca: '', nominal: 100, correcao: -0.05, incerteza: 0.05, k: 2 },
          { id: 'g50', marca: '', nominal: 50, correcao: 0.02, incerteza: 0.03, k: 2 },
          { id: 'g20', marca: '', nominal: 20, correcao: 0.01, incerteza: 0.025, k: 2 },
        ],
      })
    ).padrao as Padrao
  }

  it('"ajustada logo antes" com ajuste interno: o "como encontrado" vai pela densidade do ar medida', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const k = await classeIPronta(b, e2, { empuxo: 'AJUSTADO' })
    const { resultado, comoEncontrado } = calcularCalibracao(k, b, [e2])
    expect(comoEncontrado!.pontos[2].crescente!.correcaoEmpuxo).toBeGreaterThan(0)
    expect(comoEncontrado!.avisos.map((a) => a.mensagem).join('\n')).not.toMatch(/empuxo estimado sem a densidade do ar/)
    expect(comoEncontrado!.pontos[2].crescente!.U / resultado.pontos[2].crescente!.U).toBeLessThan(1.1)
  })

  it('padrão gravado antes da conferência da densidade (7,85 em g/cm³): desativa e grava o resto; a densidade nova é conferida', async () => {
    const criado = (await criar('/api/padroes', {
      ...PADRAO_VAZIO,
      identificacao: 'JP-M1',
      classe: 'M1',
      uso: 'NOMINAL',
      pesos: [{ id: 'k20', marca: '', nominal: 20000, correcao: 0, incerteza: 0, k: 2 }],
    })) as { padrao: Padrao }
    const antigo = { ...criado.padrao, densidade: 7.85 }
    t.ctx.db.prepare('UPDATE padroes SET dados = ? WHERE id = ?').run(JSON.stringify(antigo), antigo.id)
    // "Desativar" no menu do cartão manda o cadastro inteiro
    const desativado = await t.chamar('PUT', `/api/padroes/${antigo.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...antigo, ativo: false, versao: antigo.versao },
    })
    expect(desativado.statusCode, desativado.body).toBe(200)
    expect(desativado.json().padrao).toMatchObject({ ativo: false, densidade: 7.85 })
    const atual = desativado.json().padrao as Padrao
    // Outro valor fora da faixa não grava; o valor corrigido grava
    const outro = await t.chamar('PUT', `/api/padroes/${antigo.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, densidade: 7.95, versao: atual.versao },
    })
    expect(outro.statusCode).toBe(400)
    expect(outro.json().erro).toMatch(/Densidade de 7,95 kg\/m³ fora da faixa/)
    const corrigido = await t.chamar('PUT', `/api/padroes/${antigo.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, densidade: 7850, versao: atual.versao },
    })
    expect(corrigido.statusCode, corrigido.body).toBe(200)
    // Cadastro novo com a densidade fora da faixa: não grava
    const novo = await t.chamar('POST', '/api/padroes', {
      cookie: t.cookieAdmin,
      payload: { ...PADRAO_VAZIO, identificacao: 'JP-M2', densidade: 7.85, pesos: antigo.pesos },
    })
    expect(novo.statusCode).toBe(400)
  })

  it('"ajustada logo antes" com ajuste: a densidade dos pesos do "como encontrado" é conferida e bloqueia a emissão', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const k = await classeIPronta(b, e2, { empuxo: 'AJUSTADO' })
    // Cadastro gravado antes da conferência da unidade: 7,95 (g/cm³) como kg/m³
    t.ctx.db
      .prepare('UPDATE padroes SET dados = ? WHERE id = ?')
      .run(JSON.stringify({ ...e2, densidade: 7.95, incertezaDensidade: 0.035 }), e2.id)
    const pendencias = async () =>
      (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().pendencias
    expect(await pendencias()).toEqual([
      'Como encontrado: Empuxo pela densidade do ar medida: o jogo JP-E2 está com densidade de 7,95 kg/m³, fora da faixa dos pesos; confira a unidade no cadastro do padrão (7,95 g/cm³ = 7 950 kg/m³).',
    ])
    const negado = await emitir(k)
    expect(negado.statusCode).toBe(409)
    // Sem densidade nem u(ρ) (o cadastro aceita: são opcionais)
    const atual = t.ctx.repo.obterPadrao(e2.id)!
    const semDensidade = await t.chamar('PUT', `/api/padroes/${e2.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, densidade: 0, incertezaDensidade: 0, versao: atual.versao },
    })
    expect(semDensidade.statusCode, semDensidade.body).toBe(200)
    expect(await pendencias()).toEqual([
      'Como encontrado: Empuxo pela densidade do ar medida: o jogo JP-E2 está sem a densidade ou a incerteza da densidade (cadastro do padrão).',
    ])
    expect((await emitir(k)).statusCode).toBe(409)
  })

  it('revisão de certificado classe I emitido antes do cálculo da classe I: mantém o cálculo e as exigências da época', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const pronta = await classeIPronta(b, e2, { empuxo: 'AJUSTADO' })
    const emitida = await emitir(pronta)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const original = emitida.json().calibracao as Calibracao
    // Gravado no formato antigo (versão 1.0.x): sem a convecção nas opções, sem o ΔT pesos − ar e a aclimatação, e a
    // emissão sem as regras do POP (`regrasDoPop` veio na 1.0.3)
    const { conveccao: _c, ...opcoesAntigas } = original.opcoes
    const { deltaTPesos: _d, aclimatacao: _a, ...ambienteAntigo } = original.ambiente
    const { regrasDoPop: _r, ...emissaoAntiga } = original.emissao!
    const antigo = { ...original, opcoes: opcoesAntigas, ambiente: ambienteAntigo, emissao: emissaoAntiga }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(antigo), original.id)
    const naEpoca = calcularCalibracao(antigo, b, [e2]).comoEncontrado!

    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Corrigir o endereço do cliente',
    })) as { calibracao: Calibracao }
    expect(rev.calculoLegado).toBe(true)
    const aberta = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    // Sem as pendências novas da classe I (convecção, ΔT) e o mesmo "como encontrado" do certificado original
    expect(aberta.pendencias).toEqual([])
    expect(calcularCalibracao(aberta.calibracao, b, [e2]).comoEncontrado!.pontos).toEqual(naEpoca.pontos)
    // A tela não muda o que é legado: o PUT mantém a marca
    const salvo = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...rev, calculoLegado: false, versao: rev.versao },
    })
    expect(salvo.json().calibracao.calculoLegado).toBe(true)
    expect(salvo.json().pendencias).toEqual([])
    // A revisão emitida e a revisão dela continuam legadas
    const r1 = await emitir(salvo.json().calibracao)
    expect(r1.statusCode, r1.body).toBe(200)
    const { calibracao: r2 } = (await criar(`/api/calibracoes/${rev.id}/revisar`, { motivo: 'Outra correção' })) as {
      calibracao: Calibracao
    }
    expect(r2.calculoLegado).toBe(true)
  })

  it('revisão de certificado classe I emitido nesta versão: as regras novas, sem a marca de legado', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const original = (await emitir(await classeIPronta(b, e2))).json().calibracao as Calibracao
    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Corrigir o endereço do cliente',
    })) as { calibracao: Calibracao }
    expect(rev.calculoLegado).toBeUndefined()
    // Sem o ΔT pesos − ar, a pendência da convecção volta
    const semDeltaT = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...rev, ambiente: { ...rev.ambiente, deltaTPesos: null }, versao: rev.versao },
    })
    expect(semDeltaT.json().pendencias).toContain(
      'Convecção: registre a diferença de temperatura entre os pesos e o ar antes do 1º ensaio, ou a aclimatação dos pesos (etapa Padrões e ambiente).',
    )
  })
})

// ---- Peças dos pontos fora dos padrões, pesos que não fecham a carga, e o plano copiado ---------------------

describe('peças dos pontos e a carga digitada (bloqueiam a emissão)', () => {
  const pendenciasDe = async (k: Calibracao) =>
    (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().pendencias as string[]
  const salvar = async (k: Calibracao, mudar: (k: Calibracao) => Partial<Calibracao>) => {
    const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: { ...k, ...mudar(k) } })
    expect(r.statusCode, r.body).toBe(200)
    return r.json() as { calibracao: Calibracao; pendencias: string[] }
  }
  async function jogo2() {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        identificacao: 'JP-02',
        descricao: 'Jogo de pesos M1 que entrou no lugar do JP-01',
        classe: 'M1',
        certificado: 'LAB-0789/2026',
        laboratorio: 'Laboratório de Massa Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [
          { id: 'q10a', marca: 'A', nominal: 10000, correcao: 0, incerteza: 160, k: 2 },
          { id: 'q10b', marca: 'B', nominal: 10000, correcao: 0, incerteza: 160, k: 2 },
          { id: 'q10c', marca: 'C', nominal: 10000, correcao: 0, incerteza: 160, k: 2 },
          { id: 'q5', marca: '', nominal: 5000, correcao: 0, incerteza: 80, k: 2 },
        ],
      })
    ).padrao as Padrao
  }

  it('jogo desmarcado com as peças à mão nos pontos: pendência em cada ponto e a emissão recusada', async () => {
    const k = await calibracaoPronta()
    const outro = await jogo2()
    const { calibracao, pendencias } = await salvar(k, (x) => ({ padroesIds: [outro.id], versao: x.versao }))
    expect(pendencias).toContain(
      'Erro de indicação, ponto de 5,00 kg: pesos de um jogo que não está entre os padrões escolhidos; escolha os pesos do ponto de novo.',
    )
    expect(pendencias.filter((p) => p.includes('não está entre os padrões escolhidos'))).toHaveLength(4)
    const r = await emitir(calibracao)
    expect(r.statusCode).toBe(409)
  })

  it('pesos tirados à mão do ponto (nenhum peso padrão): pendência e a emissão recusada', async () => {
    const k = await calibracaoPronta()
    const { calibracao, pendencias } = await salvar(k, (x) => ({
      versao: x.versao,
      indicacao: {
        ...x.indicacao,
        pontos: x.indicacao.pontos.map((p) => (p.id === 'b' ? { ...p, pecas: [], pecasManuais: true } : p)),
      },
    }))
    expect(pendencias).toEqual([
      'Erro de indicação, ponto de 10,00 kg: nenhum peso padrão no ponto; escolha os pesos do ponto ou, nos padrões, um jogo que faça essa carga.',
    ])
    expect((await emitir(calibracao)).statusCode).toBe(409)
  })

  it('peça tirada do cadastro do jogo: o rascunho com ela fica com pendência', async () => {
    const k = await calibracaoPronta()
    const atual = (await t.chamar('GET', `/api/padroes`, { cookie: t.cookieAdmin }))
      .json()
      .padroes.find((p: Padrao) => p.id === pesos.id) as Padrao
    const r = await t.chamar('PUT', `/api/padroes/${pesos.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, pesos: atual.pesos.filter((w) => w.id !== 'p10c'), versao: atual.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(await pendenciasDe(k)).toContain(
      'Erro de indicação, ponto de 30,00 kg: peça tirada do cadastro do jogo JP-01; escolha os pesos do ponto de novo.',
    )
    expect((await emitir(k)).statusCode).toBe(409)
  })

  it('pesos que não fecham a carga do ponto: a pendência com o que falta, e a emissão recusada', async () => {
    const k = await calibracaoPronta()
    const { calibracao, pendencias } = await salvar(k, (x) => ({
      versao: x.versao,
      indicacao: {
        ...x.indicacao,
        pontos: x.indicacao.pontos.map((p) =>
          p.id === 'd' ? { ...p, pecas: [peca('p10a'), peca('p10b')], pecasManuais: false } : p,
        ),
      },
    }))
    expect(pendencias).toEqual([
      'Erro de indicação, ponto de 30,00 kg: os pesos somam 20,00 kg; faltam 10,00 kg. Escolha nos padrões o jogo que completa a carga ou acerte os pesos do ponto.',
    ])
    expect((await emitir(calibracao)).statusCode).toBe(409)
    // A revisão também fica parada
    const revisao = await t.chamar('POST', `/api/calibracoes/${k.id}/situacao`, {
      cookie: t.cookieAdmin,
      payload: { status: 'REVISAO', versao: calibracao.versao },
    })
    expect(revisao.statusCode).toBe(409)
  })

  it('rascunho novo e "calibrar de novo" depois de desativar o jogo: os pontos voltam sem as peças dele, automáticos', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const atual = (await t.chamar('GET', `/api/padroes`, { cookie: t.cookieAdmin }))
      .json()
      .padroes.find((p: Padrao) => p.id === pesos.id) as Padrao
    const r = await t.chamar('PUT', `/api/padroes/${pesos.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, ativo: false, versao: atual.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const semPecas = (k: Calibracao) => {
      expect(k.padroesIds).toEqual([])
      expect(k.indicacao.pontos.map((p) => p.carga)).toEqual([0, 5, 10, 20, 30])
      expect(k.indicacao.pontos.every((p) => p.pecas.length === 0 && !p.pecasManuais)).toBe(true)
    }
    const { calibracao: nova } = (await criar('/api/calibracoes', { balancaId: balanca.id })) as { calibracao: Calibracao }
    semPecas(nova)
    const { calibracao: denovo } = (await criar(`/api/calibracoes/${emitida.id}/recalibrar`, {})) as {
      calibracao: Calibracao
    }
    semPecas(denovo)
  })
})

describe('rascunho sem histórico: jogos pela classe da balança (POP 6.1)', () => {
  it('classe II de 3200 g / 0,1 g: o jogo M1 fica de fora quando E2 e F1 montam Max; classe III: entra', async () => {
    const finos = [1000, 500, 200, 200, 100].map((nominal, i) => ({
      marca: '',
      nominal,
      correcao: 0,
      incerteza: 1,
      k: 2,
      id: `f${i}`,
    }))
    const jogo = async (identificacao: string, classe: Padrao['classe']) =>
      (
        await criar('/api/padroes', {
          ...PADRAO_VAZIO,
          identificacao,
          descricao: `Jogo ${classe}`,
          classe,
          certificado: `LAB-${identificacao}`,
          laboratorio: 'Laboratório de Massa Exemplo',
          acreditacao: 'CAL 0123',
          dataCalibracao: '2026-01-10',
          validade: '2099-01-10',
          pesos: finos,
        })
      ).padrao as Padrao
    const e2 = await jogo('JP-E2', 'E2')
    const f1 = await jogo('JP-F1', 'F1')
    const marte = (
      await criar('/api/balancas', {
        ...BALANCA_VAZIA,
        clienteId: cliente.id,
        tipo: 'BALCAO',
        fabricante: 'Marte',
        modelo: 'AD3300',
        numeroSerie: 'M-1',
        unidade: 'g',
        classe: 'II',
        faixas: [{ max: 3200, e: 0.1, d: 0.01 }],
      })
    ).balanca as Balanca
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: marte.id })) as {
      calibracao: Calibracao
    }
    expect([...k.padroesIds].sort()).toEqual([e2.id, f1.id].sort())
    // A balança de 30 kg (classe III, mínima M2): o M1 (do beforeEach) entra
    const { calibracao: iii } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })) as {
      calibracao: Calibracao
    }
    expect(iii.padroesIds).toContain(pesos.id)
  })
})
