// Arquivos guardados (certificado de cada padrão e POP) e as revisões do POP pela API: tipo conferido pelo
// conteúdo, limite de 10 MB, o mesmo arquivo guardado uma vez, quem pode o quê, o arquivo do padrão no
// cadastro, a pendência de emissão sem POP e o POP congelado no certificado emitido.

import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { LIMITE_ARQUIVO_BYTES } from '#shared/arquivos.ts'
import type { ArquivoAnexo, Calibracao, Padrao, VersaoPop } from '#shared/tipos.ts'
import { ARQUIVOS_TESTE, cenarioCalibracao, criarAppComLogin, POP_TESTE, type AppComLogin } from './auxiliaresTeste.ts'
import { montarEmissao, PENDENCIA_POP, PREVIA_SEM_POP } from './certificados.ts'

const EXTRA = { numero: 'PRÉVIA', codigo: 'XXXX-XXXX', emitidoPor: '', signatarioId: '' }

let t: AppComLogin
afterEach(async () => {
  await t?.fechar()
})

const OCTETO = { 'content-type': 'application/octet-stream' }
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function enviar(conteudo: Buffer, consulta: string, cookie: string | null = t.cookieAdmin) {
  return t.chamar('POST', `/api/arquivos?${consulta}`, { cookie, payload: conteudo, headers: OCTETO })
}

const atividades = () =>
  t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'ALTERACAO' ORDER BY id").all() as Array<{ detalhe: string }>

describe('envio e download de arquivos', () => {
  it('guarda pelo conteúdo: o mesmo arquivo enviado de novo é a mesma linha; o nome é o de cada envio', async () => {
    t = await criarAppComLogin()
    const pdf = ARQUIVOS_TESTE.pdf()
    const r = await enviar(pdf, `finalidade=padrao&nome=${encodeURIComponent('Certificado RBC 0456/2026 – pesos.pdf')}`)
    expect(r.statusCode, r.body).toBe(201)
    const a: ArquivoAnexo = r.json().arquivo
    expect(a).toMatchObject({ sha256: sha(pdf), nome: '2026 – pesos.pdf', tamanho: pdf.length, tipo: 'application/pdf' })
    expect(Date.parse(a.enviadoEm)).not.toBeNaN()

    const denovo = await enviar(pdf, 'finalidade=padrao&nome=outro.pdf', t.cookieComum)
    expect(denovo.statusCode).toBe(201)
    expect(denovo.json().arquivo).toMatchObject({ sha256: a.sha256, nome: 'outro.pdf' })
    expect(t.ctx.db.prepare('SELECT COUNT(*) AS n, nome, criado_por FROM arquivos').get()).toEqual({
      n: 1,
      nome: '2026 – pesos.pdf',
      criado_por: 'Admin Teste',
    })

    // Baixar: o conteúdo igual, o tipo conferido e o nome com acentos (filename* em UTF-8)
    const baixado = await t.chamar('GET', `/api/arquivos/${a.sha256}`, { cookie: t.cookieComum })
    expect(baixado.statusCode).toBe(200)
    expect(baixado.rawPayload.equals(pdf)).toBe(true)
    expect(baixado.headers['content-type']).toBe('application/pdf')
    expect(baixado.headers['content-disposition']).toBe(
      `inline; filename="2026 _ pesos.pdf"; filename*=UTF-8''2026%20%E2%80%93%20pesos.pdf`,
    )
    expect(baixado.headers['x-content-type-options']).toBe('nosniff')
    const comNome = await t.chamar('GET', `/api/arquivos/${a.sha256}?baixar=1&nome=Certificado-JP-01.pdf`, {
      cookie: t.cookieComum,
    })
    expect(comNome.headers['content-disposition']).toMatch(/^attachment; filename="Certificado-JP-01\.pdf"/)
    expect((await t.chamar('GET', `/api/arquivos/${'0'.repeat(64)}`, { cookie: t.cookieAdmin })).statusCode).toBe(404)
    expect((await t.chamar('GET', '/api/arquivos/..%2Fbc-calibracao.db', { cookie: t.cookieAdmin })).statusCode).toBe(404)
    // O envio fica no registro de atividades (sem o nome digitado)
    expect(atividades().map((x) => x.detalhe)).toEqual([
      'POST /api/arquivos | certificado de padrão (PDF)',
      'POST /api/arquivos | certificado de padrão (PDF)',
    ])
  })

  it('o tipo é conferido pelo conteúdo e pela finalidade (padrão: PDF, JPG, PNG; POP: PDF ou Word)', async () => {
    t = await criarAppComLogin()
    expect((await enviar(ARQUIVOS_TESTE.jpg(), 'finalidade=padrao&nome=a.jpg')).json().arquivo.tipo).toBe('image/jpeg')
    expect((await enviar(ARQUIVOS_TESTE.png(), 'finalidade=padrao&nome=a.png')).json().arquivo.tipo).toBe('image/png')
    const docx = await enviar(ARQUIVOS_TESTE.docx(), 'finalidade=pop&nome=POP.docx')
    expect(docx.json().arquivo.tipo).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    // Word sempre baixa (o navegador não abre)
    const baixado = await t.chamar('GET', `/api/arquivos/${docx.json().arquivo.sha256}`, { cookie: t.cookieAdmin })
    expect(baixado.headers['content-disposition']).toMatch(/^attachment; filename="POP\.docx"/)

    const recusas: Array<[Buffer, string, RegExp]> = [
      [ARQUIVOS_TESTE.docx(), 'finalidade=padrao&nome=a.docx', /PDF, JPG ou PNG/],
      [ARQUIVOS_TESTE.png(), 'finalidade=pop&nome=a.png', /PDF ou Word/],
      // O nome não conta: texto com ".pdf" no nome, executável, ZIP que não é Word
      [Buffer.from('não sou um PDF'), 'finalidade=padrao&nome=falso.pdf', /PDF, JPG ou PNG/],
      [Buffer.from([0x4d, 0x5a, 0x90, 0]), 'finalidade=padrao&nome=x.pdf', /PDF, JPG ou PNG/],
      [Buffer.from('PK\x03\x04qualquer.txt', 'latin1'), 'finalidade=pop&nome=x.docx', /PDF ou Word/],
      [Buffer.alloc(0), 'finalidade=padrao&nome=vazio.pdf', /vazio/],
      [ARQUIVOS_TESTE.pdf(), 'finalidade=qualquer&nome=a.pdf', /inválido/],
      [ARQUIVOS_TESTE.pdf(), 'nome=a.pdf', /inválido/],
    ]
    for (const [conteudo, consulta, erro] of recusas) {
      const r = await enviar(conteudo, consulta)
      expect(r.statusCode, consulta).toBe(400)
      expect(r.json().erro).toMatch(erro)
    }
    expect(t.ctx.db.prepare('SELECT COUNT(*) AS n FROM arquivos').get()).toEqual({ n: 3 })
  })

  it('até 10 MB; acima, 413 com o tamanho e o limite (e bem acima, sem ler tudo)', async () => {
    t = await criarAppComLogin()
    const limite = Buffer.concat([ARQUIVOS_TESTE.pdf(), Buffer.alloc(LIMITE_ARQUIVO_BYTES - ARQUIVOS_TESTE.pdf().length)])
    expect((await enviar(limite, 'finalidade=padrao&nome=grande.pdf')).statusCode).toBe(201)
    const passou = await enviar(Buffer.concat([limite, Buffer.alloc(300 * 1024)]), 'finalidade=padrao&nome=grande.pdf')
    expect(passou.statusCode).toBe(413)
    expect(passou.json().erro).toMatch(/^O arquivo tem 10,3 MB; o limite é 10 MB/)
    const muito = await enviar(Buffer.concat([limite, Buffer.alloc(2 * 1024 * 1024)]), 'finalidade=padrao&nome=grande.pdf')
    expect(muito.statusCode).toBe(413)
    expect(muito.json().erro).toBe('Arquivo muito grande.')
  })

  it('só com sessão; o envio exige o cabeçalho do app; só JSON fora dos envios de arquivo', async () => {
    t = await criarAppComLogin()
    const pdf = ARQUIVOS_TESTE.pdf()
    expect((await enviar(pdf, 'finalidade=padrao&nome=a.pdf', null)).statusCode).toBe(401)
    const a = (await enviar(pdf, 'finalidade=padrao&nome=a.pdf')).json().arquivo as ArquivoAnexo
    expect((await t.chamar('GET', `/api/arquivos/${a.sha256}`)).statusCode).toBe(401)
    // Sem o cabeçalho x-bc-calibracao (um site de fora tentando gravar)
    const csrf = await t.app.inject({
      method: 'POST',
      url: '/api/arquivos?finalidade=padrao&nome=a.pdf',
      headers: OCTETO,
      cookies: { [t.nomeCookie]: t.cookieAdmin },
      payload: pdf,
    })
    expect(csrf.statusCode).toBe(403)
    // Outras rotas não aceitam o arquivo puro
    const outra = await t.chamar('POST', '/api/clientes', { cookie: t.cookieAdmin, payload: pdf, headers: OCTETO })
    expect(outra.statusCode).toBe(415)
  })
})

describe('arquivo do certificado no cadastro do padrão', () => {
  it('anexa, mantém sem o campo (tela antiga), troca (o anterior continua guardado) e remove', async () => {
    t = await criarAppComLogin()
    const c = await cenarioCalibracao(t)
    const primeiro = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('primeiro'), 'Certificado JP-01.pdf', 'padrao', t.cookieComum)
    const comArquivo = async (p: Padrao, certificadoArquivo: unknown, cookie = t.cookieComum) =>
      t.chamar('PUT', `/api/padroes/${p.id}`, { cookie, payload: { ...p, certificadoArquivo, versao: p.versao } })

    // O técnico anexa; tamanho e tipo vêm do arquivo guardado (não do que a tela mandou)
    const r1 = await comArquivo(c.pesos, { ...primeiro, tamanho: 1, tipo: 'image/png' })
    expect(r1.statusCode, r1.body).toBe(200)
    const p1: Padrao = r1.json().padrao
    expect(p1.certificadoArquivo).toEqual({ ...primeiro, enviadoEm: expect.any(String) })

    // Sem o campo (tela de antes desta versão): continua o mesmo, com a mesma data
    const { certificadoArquivo: _fora, ...semCampo } = p1
    const r2 = await t.chamar('PUT', `/api/padroes/${p1.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...semCampo, descricao: 'Outra descrição', versao: p1.versao },
    })
    const p2: Padrao = r2.json().padrao
    expect(p2.certificadoArquivo).toEqual(p1.certificadoArquivo)

    // Troca: o anterior continua guardado (os certificados já emitidos apontam para ele)
    const segundo = await c.enviarArquivo(ARQUIVOS_TESTE.jpg('segundo'), 'scan.jpg')
    const p3: Padrao = (await comArquivo(p2, segundo)).json().padrao
    expect(p3.certificadoArquivo).toMatchObject({ sha256: segundo.sha256, tipo: 'image/jpeg' })
    expect(t.ctx.repo.infoArquivo(primeiro.sha256)).toBeTruthy()

    // Remove
    const p4: Padrao = (await comArquivo(p3, null)).json().padrao
    expect(p4.certificadoArquivo).toBeNull()
    expect(t.ctx.repo.infoArquivo(segundo.sha256)).toBeTruthy()

    expect(
      atividades()
        .filter((x) => x.detalhe.startsWith('PUT /api/padroes/:id'))
        .map((x) => x.detalhe),
    ).toEqual([
      'PUT /api/padroes/:id | arquivo do certificado anexado',
      'PUT /api/padroes/:id',
      'PUT /api/padroes/:id | arquivo do certificado trocado',
      'PUT /api/padroes/:id | arquivo do certificado removido',
    ])
  })

  it('recusa arquivo que não está guardado e o POP em Word como certificado de padrão', async () => {
    t = await criarAppComLogin()
    const c = await cenarioCalibracao(t)
    const inexistente = await t.chamar('POST', '/api/padroes', {
      cookie: t.cookieAdmin,
      payload: c.padraoPesos('JP-02', { certificadoArquivo: { sha256: 'b'.repeat(64), nome: 'x.pdf' } }),
    })
    expect(inexistente.statusCode).toBe(400)
    expect(inexistente.json().erro).toMatch(/não foi encontrado no servidor/)
    const word = await c.enviarArquivo(ARQUIVOS_TESTE.docx(), 'POP.docx', 'pop')
    const r = await t.chamar('POST', '/api/padroes', {
      cookie: t.cookieAdmin,
      payload: c.padraoPesos('JP-02', { certificadoArquivo: word }),
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toMatch(/não serve/)
    // Cadastro novo já com o arquivo
    const pdf = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('jp02'), 'jp02.pdf')
    const novo = await t.chamar('POST', '/api/padroes', {
      cookie: t.cookieAdmin,
      payload: c.padraoPesos('JP-02', { certificadoArquivo: pdf }),
    })
    expect(novo.statusCode).toBe(201)
    expect(novo.json().padrao.certificadoArquivo).toMatchObject({ sha256: pdf.sha256, nome: 'jp02.pdf' })
    expect(atividades().at(-1)?.detalhe).toBe('POST /api/padroes | com o arquivo do certificado')
  })
})

describe('POP: revisões, quem registra e o certificado', () => {
  it('sem POP, a emissão fica pendente; registrado, o código e a revisão saem no certificado e ficam congelados', async () => {
    t = await criarAppComLogin({ semPop: true })
    const c = await cenarioCalibracao(t)
    expect((await t.chamar('GET', '/api/pop', { cookie: t.cookieComum })).json()).toEqual({ atual: null, versoes: [] })
    expect((await t.chamar('GET', '/api/config', { cookie: t.cookieAdmin })).json().config.textos.procedimento).toBe('')

    const k = await c.calibracaoPronta()
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pendencias).toEqual([PENDENCIA_POP])
    // A prévia sai assim mesmo (com a marca d'água), avisando no lugar do código
    const previa = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
    expect(previa.statusCode).toBe(200)
    expect(previa.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(montarEmissao(t.ctx, k, t.ctx.repo.obterConfig(), EXTRA).textos.procedimento).toBe(PREVIA_SEM_POP)
    expect(detalhe.pop).toBeNull()
    const negada = await c.emitir(k)
    expect(negada.statusCode).toBe(409)
    expect(negada.json().erro).toBe(PENDENCIA_POP)
    // Nem vai para revisão sem o POP
    const revisao = await t.chamar('POST', `/api/calibracoes/${k.id}/situacao`, {
      cookie: t.cookieAdmin,
      payload: { status: 'REVISAO', versao: k.versao },
    })
    expect(revisao.statusCode).toBe(409)

    // O administrador registra a revisão 00, ainda sem o arquivo
    const r = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { codigo: 'BALANÇAS-POP-123', revisao: '0', data: '2026-10-28', observacao: 'Primeira emissão' },
    })
    expect(r.statusCode, r.body).toBe(201)
    const v0: VersaoPop = r.json().versao
    expect(v0).toMatchObject({ codigo: 'BALANÇAS-POP-123', revisao: '00', data: '2026-10-28', arquivo: null, vigente: true })
    expect(v0.criadoPor).toBe('Admin Teste')
    expect((await t.chamar('GET', '/api/config', { cookie: t.cookieComum })).json().config.textos.procedimento).toBe(
      'BALANÇAS-POP-123 rev. 00',
    )
    // O código não se muda pelas configurações (vem sempre da revisão vigente do POP)
    const config = (await t.chamar('GET', '/api/config', { cookie: t.cookieAdmin })).json().config
    const salva = await t.chamar('PUT', '/api/config', {
      cookie: t.cookieAdmin,
      payload: { ...config, textos: { ...config.textos, procedimento: 'OUTRO rev. 9' } },
    })
    expect(salva.json().config.textos.procedimento).toBe('BALANÇAS-POP-123 rev. 00')
    expect(t.ctx.repo.obterConfig().textos.procedimento).toBe('BALANÇAS-POP-123 rev. 00')

    const emitida = await c.emitir(k)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const e: Calibracao = emitida.json().calibracao
    expect(e.emissao?.textos.procedimento).toBe('BALANÇAS-POP-123 rev. 00')
    expect(e.emissao?.pop).toEqual({ id: v0.id, codigo: 'BALANÇAS-POP-123', revisao: '00', data: '2026-10-28', arquivo: null })

    // O arquivo anexado depois à mesma revisão aparece na ficha do certificado; a revisão nova não muda o emitido
    const pdf = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('pop'), 'POP Balanças rev 00.pdf', 'pop')
    const anexado = await t.chamar('PUT', `/api/pop/${v0.id}/arquivo`, {
      cookie: t.cookieAdmin,
      payload: { arquivo: pdf.sha256 },
    })
    expect(anexado.statusCode, anexado.body).toBe(200)
    expect(anexado.json().versao.arquivo).toMatchObject({ sha256: pdf.sha256, nome: 'POP Balanças rev 00.pdf' })
    const v1 = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { codigo: 'BALANÇAS-POP-123', revisao: '1', data: '2026-11-03', arquivo: pdf.sha256 },
    })
    expect(v1.statusCode).toBe(201)
    const ficha = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum })).json()
    expect(ficha.calibracao.emissao.textos.procedimento).toBe('BALANÇAS-POP-123 rev. 00')
    expect(ficha.pop).toMatchObject({ id: v0.id, revisao: '00', vigente: false, arquivo: { sha256: pdf.sha256 } })
    const lista = (await t.chamar('GET', '/api/pop', { cookie: t.cookieComum })).json()
    expect(lista.atual).toMatchObject({ revisao: '01', vigente: true })
    expect(lista.versoes.map((v: VersaoPop) => [v.revisao, v.vigente])).toEqual([
      ['01', true],
      ['00', false],
    ])
    // A próxima emissão sai com a revisão 01
    const outra = await c.emitido()
    expect(outra.emissao?.textos.procedimento).toBe('BALANÇAS-POP-123 rev. 01')
    expect(outra.emissao?.pop?.arquivo?.sha256).toBe(pdf.sha256)

    expect(
      atividades()
        .filter((x) => x.detalhe.includes('/api/pop'))
        .map((x) => x.detalhe),
    ).toEqual(['POST /api/pop | sem o arquivo (anexar depois)', 'PUT /api/pop/:id/arquivo', 'POST /api/pop | com o arquivo'])
  })

  it('revisão registrada sem o arquivo e já substituída: o arquivo anexado depois vai para os certificados emitidos com ela', async () => {
    t = await criarAppComLogin({ semPop: true })
    const c = await cenarioCalibracao(t)
    const registrar = (payload: object) => t.chamar('POST', '/api/pop', { cookie: t.cookieAdmin, payload })
    // Rev. 00 sem o arquivo (o documento final ainda não estava pronto) e um certificado emitido com ela
    const v0: VersaoPop = (await registrar({ codigo: 'BALANÇAS-POP-123', revisao: '00', data: '2026-10-28' })).json().versao
    const k = await c.calibracaoPronta()
    expect((await c.emitir(k)).statusCode).toBe(200)
    // Rev. 01 já com o arquivo: a 00 fica substituída, ainda sem o dela
    const pdf01 = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('pop-01'), 'POP rev 01.pdf', 'pop')
    expect(
      (await registrar({ codigo: 'BALANÇAS-POP-123', revisao: '01', data: '2026-11-03', arquivo: pdf01.sha256 })).statusCode,
    ).toBe(201)
    const ficha = () => t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum }).then((r) => r.json())
    expect((await ficha()).pop).toMatchObject({ id: v0.id, vigente: false, arquivo: null })
    // O arquivo da 00 anexado depois (Configurações → Revisões anteriores)
    const pdf00 = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('pop-00'), 'POP rev 00.pdf', 'pop')
    const anexado = await t.chamar('PUT', `/api/pop/${v0.id}/arquivo`, {
      cookie: t.cookieAdmin,
      payload: { arquivo: pdf00.sha256 },
    })
    expect(anexado.statusCode, anexado.body).toBe(200)
    expect(anexado.json().versao).toMatchObject({ id: v0.id, vigente: false, arquivo: { sha256: pdf00.sha256 } })
    expect((await ficha()).pop).toMatchObject({
      id: v0.id,
      revisao: '00',
      arquivo: { sha256: pdf00.sha256, nome: 'POP rev 00.pdf' },
    })
    // A vigente continua a 01, com o arquivo dela
    const lista = (await t.chamar('GET', '/api/pop', { cookie: t.cookieComum })).json()
    expect(lista.atual).toMatchObject({ revisao: '01', arquivo: { sha256: pdf01.sha256 } })
  })

  it('só o administrador registra e anexa; o técnico vê e baixa', async () => {
    t = await criarAppComLogin()
    const v = (await t.chamar('GET', '/api/pop', { cookie: t.cookieComum })).json().atual as VersaoPop
    expect(v).toMatchObject({ codigo: POP_TESTE.codigo, revisao: '00' })
    const tecnico = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieComum,
      payload: { codigo: 'X-1', revisao: '01', data: '2026-10-28' },
    })
    expect(tecnico.statusCode).toBe(403)
    const pdf = (await enviar(ARQUIVOS_TESTE.pdf('pop'), 'finalidade=pop&nome=pop.pdf', t.cookieComum)).json().arquivo
    expect(
      (await t.chamar('PUT', `/api/pop/${v.id}/arquivo`, { cookie: t.cookieComum, payload: { arquivo: pdf.sha256 } })).statusCode,
    ).toBe(403)
    expect((await t.chamar('GET', '/api/pop')).statusCode).toBe(401)
  })

  it('confere o que é registrado: revisão repetida, código com "rev.", data, arquivo de outro tipo', async () => {
    t = await criarAppComLogin()
    const registrar = (payload: object) => t.chamar('POST', '/api/pop', { cookie: t.cookieAdmin, payload })
    const repetida = await registrar({ ...POP_TESTE, codigo: POP_TESTE.codigo.toLowerCase() })
    expect(repetida.statusCode).toBe(409)
    expect(repetida.json().erro).toMatch(/já está registrada/)
    expect((await registrar({ codigo: 'POP-9 rev. 1', revisao: '1', data: '2026-10-28' })).statusCode).toBe(400)
    expect((await registrar({ codigo: 'POP-9', revisao: 'A', data: '2026-10-28' })).statusCode).toBe(400)
    expect((await registrar({ codigo: 'POP-9', revisao: '1', data: '28/10/2026' })).statusCode).toBe(400)
    const png = (await enviar(ARQUIVOS_TESTE.png(), 'finalidade=padrao&nome=a.png')).json().arquivo
    const imagem = await registrar({ codigo: 'POP-9', revisao: '1', data: '2026-10-28', arquivo: png.sha256 })
    expect(imagem.statusCode).toBe(400)
    expect(imagem.json().erro).toMatch(/não serve/)
    const semArquivo = await registrar({ codigo: 'POP-9', revisao: '1', data: '2026-10-28', arquivo: 'c'.repeat(64) })
    expect(semArquivo.statusCode).toBe(400)
    expect(
      (await t.chamar('PUT', '/api/pop/999/arquivo', { cookie: t.cookieAdmin, payload: { arquivo: png.sha256 } })).statusCode,
    ).toBe(404)
    expect((await t.chamar('PUT', '/api/pop/abc/arquivo', { cookie: t.cookieAdmin, payload: {} })).statusCode).toBe(404)
    expect(t.ctx.repo.versoesPop()).toHaveLength(1)
  })
})
