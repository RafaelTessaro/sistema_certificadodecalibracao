// Testes da folha impressa assinada (a FOR-CAL-01 preenchida no celular, server/pdf/registroCampo.ts): gera os PDFs dos
// registros de exemplo (shared/campo/exemplos.ts e server/pdf/exemplosRegistroCampo.ts), confere que a geração é
// determinística e, com o pdftotext e o pdfimages (poppler-utils), o texto de cada folha (cabeçalho, os 8 passos com as
// leituras exatamente como digitadas e a hora de cada uma, anotações, avisos, correções, desfecho, anexo das tentativas,
// faixa PILOTO, celular e versão do app, rodapé) e as imagens das assinaturas. Sem código de conferência e sem sha256
// em lugar nenhum.

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { calcularSha256Registro, sha256Hex } from '#shared/campo/canonico.ts'
import {
  APARELHO_EXEMPLO,
  exemplosCampo,
  pacotePlataforma,
  pacoteRodoviaria,
  registroPlataforma,
  registroRodoviaria,
  TECNICO_EXEMPLO,
} from '#shared/campo/exemplos.ts'
import { registroInicial } from '#shared/campo/registro.ts'
import { FRASE_ASSINATURA_CLIENTE } from '#shared/campo/resumoCliente.ts'
import { TITULOS_PASSOS, type PacoteCampo, type RegistroCampo } from '#shared/campo/tipos.ts'
import { EMPRESA_PADRAO } from '#shared/dominio.ts'
import { pngRgbaFiltroInvalido, pngRgbaIdatQueNaoEZlib, pngRgbaValido } from '../campo/__fixtures__/pngTeste.ts'
import { registroEmBrancoIncompleto, registroNaoCalibradaComTentativa } from './exemplosRegistroCampo.ts'
import {
  definicaoRegistroCampo,
  FAIXA_PILOTO,
  gerarPdfRegistroCampo,
  NOTA_ANEXO_TENTATIVAS,
  nomeArquivoRegistroCampo,
  ROTULO_DESFECHO,
  textoRodapeRegistroCampo,
  TITULO_ANEXO_TENTATIVAS,
} from './registroCampo.ts'

const GERADO_EM = '2026-11-18T13:30:00.000Z'
const RODAPE = (numero: string) => `${numero} · FOR-CAL-01 rev. 05 · gerado em 18/11/2026 10:30`

const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error
const temPdfimages = !spawnSync('pdfimages', ['-v'], { stdio: 'ignore' }).error

function textoDoPdf(pdf: Buffer): string {
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`pdftotext falhou: ${r.stderr?.toString()}`)
  return r.stdout.toString('utf8').replace(/[   ]/g, ' ')
}
/** O texto na ordem de leitura (sem -layout): o texto de uma célula que quebra em linhas fica junto. */
function textoSimples(pdf: Buffer): string {
  const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`pdftotext falhou: ${r.stderr?.toString()}`)
  return r.stdout
    .toString('utf8')
    .replace(/[\u00a0\u2009\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
}
const corrido = (t: string) => t.replace(/\s+/g, ' ')
const paginasDe = (t: string) => t.split('\f').filter((p) => p.trim())

/** As imagens do PDF (sem as máscaras de transparência), pelo `pdfimages -list`: página, largura e altura. */
function imagensDoPdf(pdf: Buffer): Array<{ pagina: number; largura: number; altura: number }> {
  const r = spawnSync('pdfimages', ['-list', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  return r.stdout
    .toString('utf8')
    .split('\n')
    .slice(2)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c[2] === 'image')
    .map((c) => ({ pagina: Number(c[0]), largura: Number(c[3]), altura: Number(c[4]) }))
}

const gerar = (registro: RegistroCampo, pacote: PacoteCampo | null, o: Parameters<typeof gerarPdfRegistroCampo>[2] = {}) =>
  gerarPdfRegistroCampo(registro, pacote, { geradoEm: GERADO_EM, ...o })

/** Todos os exemplos: os do contrato e os casos a mais do PDF (folha em branco incompleta, não calibrada com tentativa). */
function todos(): Array<{ nome: string; pacote: PacoteCampo; registro: RegistroCampo }> {
  return [
    ...exemplosCampo(),
    { nome: 'branco', ...registroEmBrancoIncompleto() },
    { nome: 'naoCalibrada', ...registroNaoCalibradaComTentativa() },
  ]
}

describe('folha impressa assinada: geração', () => {
  it('gera um PDF A4 para cada exemplo, igual byte a byte na segunda vez', { timeout: 60_000 }, async () => {
    for (const e of todos()) {
      const a = await gerar(e.registro, e.pacote)
      const b = await gerar(e.registro, e.pacote)
      expect(a.subarray(0, 5).toString('latin1'), e.nome).toBe('%PDF-')
      expect(a.equals(b), `${e.nome}: o mesmo registro deu PDFs diferentes`).toBe(true)
      expect(a.toString('latin1')).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/)
    }
  })

  it('a data do documento e o rodapé são os de `geradoEm`; mudar a hora muda só isso', async () => {
    const d = definicaoRegistroCampo(registroPlataforma(), pacotePlataforma(), { geradoEm: GERADO_EM }) as {
      info: { creationDate: Date; title: string; keywords: string }
    }
    expect(d.info.creationDate.toISOString()).toBe(GERADO_EM)
    expect(d.info.title).toBe('Folha de campo FC-2026-00042 — preenchida no celular')
    expect(d.info.keywords).toContain('piloto')
    expect(textoRodapeRegistroCampo('FC-2026-00042', { codigo: 'FOR-CAL-01', revisao: '05' }, GERADO_EM)).toBe(
      RODAPE('FC-2026-00042'),
    )
    // Sem formulário no registro (registro com problema de formato): o da folha impressa
    expect(textoRodapeRegistroCampo('FC-2026-00042', {}, GERADO_EM)).toBe(RODAPE('FC-2026-00042'))
  })

  it('tolera um registro guardado com problemas de formato (campos faltando) e o órfão sem pacote', async () => {
    const vazio = await gerar({} as RegistroCampo, null)
    expect(vazio.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const r = registroPlataforma() as unknown as Record<string, unknown>
    const quebrado = {
      ...r,
      passos: { ...(r.passos as object), indicacao: { pontos: [null, { id: 'x', crescente: 'texto' }] }, repetibilidade: 'x' },
      anotacoes: null,
      assinaturas: { tecnico: { nome: 'Carlos', png: 'data:image/png;base64,AAAA', em: '' }, cliente: { nome: 'X' } },
    } as unknown as RegistroCampo
    expect((await gerar(quebrado, null)).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('nome do arquivo para baixar', () => {
    expect(nomeArquivoRegistroCampo('FC-2026-00042')).toBe('Folha-de-campo-preenchida-FC-2026-00042.pdf')
    expect(nomeArquivoRegistroCampo('')).toBe('Folha-de-campo-preenchida-registro.pdf')
  })
})

describe.runIf(temPdftotext)('folha impressa assinada: conteúdo (pdftotext)', { timeout: 60_000 }, () => {
  /** O que toda folha tem: cabeçalho e rodapé em toda página, os 8 passos e os blocos do fim; nenhum sha256. */
  function conferirComum(texto: string, r: RegistroCampo) {
    const paginas = paginasDe(texto)
    expect(paginas.length).toBeGreaterThan(1)
    for (const [i, p] of paginas.entries()) {
      const t = corrido(p)
      expect(t, `página ${i + 1}`).toContain('FOLHA DE CAMPO — PREENCHIDA NO CELULAR')
      expect(t).toContain(r.numero)
      expect(t).toContain(`Página ${i + 1} de ${paginas.length}`)
      expect(t).toContain(RODAPE(r.numero))
      expect(t).toContain('BALANÇAS.COM')
    }
    const t = corrido(texto)
    for (const titulo of Object.values(TITULOS_PASSOS)) expect(t).toContain(titulo.toUpperCase())
    for (const bloco of ['IDENTIFICAÇÃO', 'CLIENTE E BALANÇA', 'ANOTAÇÕES', 'AVISOS VISTOS NO LOCAL']) expect(t).toContain(bloco)
    expect(t).toContain('CORREÇÕES ANTES DE ASSINAR')
    expect(t).toContain('CORREÇÕES DEPOIS DA ASSINATURA')
    expect(t).toContain('FOR-CAL-01 rev. 05')
    expect(t).toContain('POP-CAL-01 rev. 00')
    expect(t).toContain(`${APARELHO_EXEMPLO.modelo} · app ${APARELHO_EXEMPLO.versaoApp}`)
    expect(t).toContain(TECNICO_EXEMPLO.nome)
    // Sem código de conferência nem sha256 (05-ajustes-finais §A.2 e §8)
    expect(t).not.toMatch(/[0-9a-f]{64}/i)
    const shas = [
      r.pacoteSha256,
      calcularSha256Registro(r, sha256Hex),
      r.assinaturas.tecnico?.conteudoSha256 ?? '',
      ...r.reaberturas.map((x) => x.sha256Anterior),
    ].filter(Boolean)
    for (const sha of shas) {
      expect(t).not.toContain(sha.slice(0, 8))
      expect(t).not.toContain(sha.slice(0, 8).toUpperCase())
    }
    expect(t.toLowerCase()).not.toContain('código de conferência')
    expect(t).not.toContain(r.envioId)
  }

  it('plataforma classe III (piloto): cabeçalho, identificação, leituras com a hora, correções e as duas assinaturas', async () => {
    const r = registroPlataforma()
    const p = pacotePlataforma()
    const pdf = await gerar(r, p, { recebidoEm: '2026-10-21T12:20:00.000Z' })
    const texto = textoDoPdf(pdf)
    conferirComum(texto, r)
    const t = corrido(texto)
    const s = textoSimples(pdf)
    // Cabeçalho (o nº do certificado reservado ao lado do nº da folha) e identificação
    const primeira = corrido(paginasDe(texto)[0])
    for (const x of ['CERTIFICADO Nº', 'CC-2026-00125', 'reservado na folha', 'FC-2026-00042']) expect(primeira).toContain(x)
    expect(t).toContain('PILOTO · Página 1 de')
    expect(t).toContain(FAIXA_PILOTO)
    expect(t).toContain('Nº da OS OS-2026-0512')
    expect(t).toContain('Tipo de folha Da calibração (balança cadastrada)')
    expect(s).toContain('Enviada ao celular 20/10/2026 17:10 por Ana Paula Souza')
    expect(t).toContain('Começada no celular 21/10/2026 08:05')
    expect(t).toContain('Recebida no servidor 21/10/2026 09:20')
    expect(t).toContain('Desfecho Completa')
    // Cliente e balança (cadastrados)
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toContain('Plataforma · Toledo do Brasil 9091 · nº 9091-118832 · TAG BAL-EXP-07')
    expect(t).toContain('Max 300 kg · d 50 g · e 50 g · classe III (média)')
    // Passo 1: padrões com levado/usado
    expect(t).toMatch(/PP20-01 a 15 Pesos padrão de 20 kg CAL-12345\/2026 10\/03\/2028 Sim Sim/)
    // Passos 2 e 3: os dados impressos conferidos, o diferente marcado
    expect(t).toMatch(/Local de instalação Expedição — doca 2 Algo diferente/)
    expect(t).toContain('Hora de início 21/10/2026 08:30')
    expect(t).toContain('Local da calibração Nas instalações do cliente')
    // Passo 4: ambiente no início e no fim, cada leitura com a hora
    expect(t).toMatch(/Início 08:41 24,6 58 948,7 TH-01, BR-01 08:41:05 08:41:10 08:41:20/)
    expect(t).toMatch(/Fim 09:05 25,1 56 948,3/)
    // Passo 5: as cargas, os pesos do plano, ↑ e ↓ exatamente como digitados e a hora; a correção antes de assinar
    expect(t).toContain('Como aplicar as cargas Crescente e decrescente')
    expect(t).toMatch(/150,00 7 × 20 kg \+ 10 kg 150,05 150,10/)
    expect(t).toContain('08:47:20')
    expect(t).toMatch(/antes 150,50 · corrigido 08:54/)
    expect(t).toMatch(/RETORNO AO ZERO sem carga 0,00 08:54:20/)
    // Passo 6: cinco leituras, duas pela tecla Repetir
    expect(t).toContain('5 anotadas · 5 previstas · 2 pela tecla Repetir')
    expect(t).toContain('08:55:50 · Repetir')
    // Passo 7: a grade das posições; a correção depois da assinatura, com o valor assinado
    expect(t).toContain('Zere vazia e desloque a carga pelas posições')
    expect(t).toMatch(/Trás direita 100,05 09:00:15 100,00 corrigido após a assinatura 09:17/)
    // Passo 8 e assinaturas
    expect(t).toContain('Data da calibração 21/10/2026')
    expect(t).toContain('Hora de término 21/10/2026 09:08')
    expect(t).toContain('CC-2026-00125 (vai na etiqueta)')
    expect(t).toContain('Assinou com o PIN em 21/10/2026 09:11')
    expect(s).toContain('Executei as medições desta folha de 21/10/2026 08:30 a 21/10/2026 09:08.')
    expect(t).toContain('Juliana Prado · Supervisora de qualidade')
    expect(t).toContain('Assinou em 21/10/2026 09:12')
    expect(t).toContain(`“${FRASE_ASSINATURA_CLIENTE}”`)
    // A correção não estava no resumo do cliente: a assinatura dele continua valendo sem ressalva
    expect(t).not.toContain('Assinatura anterior à correção')
    // Anotações
    expect(s).toMatch(/Dado impresso diferente Local de instalação A balança está na doca 3, não na doca 2\./)
    expect(s).toContain('Observação o passo todo Piso da doca molhado; plataforma limpa e seca antes dos ensaios.')
    expect(t).toContain('Nenhum aviso na hora.')
    // Correções: antes de assinar (o valor de antes riscado) e depois da assinatura
    expect(t).toMatch(/Passo 5 · ponto 6 \(150,00 kg\) · indicação ↑ 150,50 150,05 08:54/)
    expect(s).toContain('Passo 7 · excentricidade · Trás direita · indicação')
    expect(t).toMatch(/100,05 100,00 09:17 Anotei a posição errada/)
    // O recado do escritório e as anotações internas não saem na folha
    expect(t).not.toContain(p.folha.recado)
    expect(t).not.toContain(p.folha.anotacoesInternas)
    expect(t).not.toContain(TITULO_ANEXO_TENTATIVAS.toUpperCase())
  })

  it('rodoviária: as etapas de substituição com a ordem pelas horas, o aviso conferido e "Cliente não assinou"', async () => {
    const r = registroRodoviaria()
    const pdf = await gerar(r, pacoteRodoviaria())
    const texto = textoDoPdf(pdf)
    conferirComum(texto, r)
    const t = corrido(texto)
    const s = textoSimples(pdf)
    expect(t).not.toContain('PILOTO')
    expect(s).toContain('Substituições')
    expect(t).toContain('Pesos padrão por cima')
    expect(t).toMatch(/20 000 1 20 × 500 kg 20020 20040/)
    expect(t).toContain('Cargas de substituição — 10 000 kg de pesos padrão em cada etapa (20 × 500 kg)')
    expect(t).toMatch(/1ª 10000 10020 Caminhão basculante com areia 08:32:10 08:42:10/)
    expect(t).toMatch(/3ª 30000 30020 Mais areia no mesmo caminhão/)
    expect(t).toContain('Início (ida)')
    expect(t).toContain('Fim (volta)')
    expect(t).toContain('3 anotadas · 3 previstas · 1 pela tecla Repetir')
    expect(s).toContain('Passo 4 · ambiente início · temperatura Temperatura 31,8 °C: confira a digitação.')
    expect(t).toMatch(/Confira a digitação Conferi, está certo 08:25/)
    expect(t).toContain('Cliente não assinou: Ninguém da usina acompanhou: o responsável estava em reunião.')
    expect(t).toContain('Nenhuma anotação.')
    expect(t).toContain('Nenhuma correção antes de assinar.')
    expect(t).toContain('Nenhuma correção depois da assinatura.')
  })

  it('classe I: a série do ΔT, os pesos no local desde a véspera, o CAL interno e o zero antes de cada posição', async () => {
    const e = exemplosCampo().find((x) => x.nome === 'classeI')!
    const texto = textoDoPdf(await gerar(e.registro, e.pacote))
    conferirComum(texto, e.registro)
    const t = corrido(texto)
    expect(t).toContain('Início (medido de novo) 09:15 21,5')
    expect(t).toMatch(/Classe I: ΔT pesos − ar \(até \d+(,\d+)? °C para começar\)/)
    expect(t).toMatch(/1ª 1,6 TD-01 08:35:50/)
    expect(t).toMatch(/2ª \(última\) 0,6 TD-01 09:16:40/)
    expect(t).toContain('Vale a última medição antes do passo 5.')
    expect(t).toContain('Pesos no local desde 25/10/2026 17:40')
    expect(t).toContain('Pela aclimatação (ΔT0) Não usado')
    expect(t).toContain('Ajuste interno (CAL) Feito antes dos ensaios · às 09:18')
    expect(t).toContain('Crescente com descarga')
    expect(t).toMatch(/160,0000 100 g \+ 50 g \+ 10 g 160,0002/)
    expect(t).toContain('10 anotadas · 10 previstas')
    expect(t).toContain('Zere antes de cada posição')
    expect(t).toMatch(/Frente \(0°\) 0,0000 100,0001/)
    expect(t).toContain('Camila Torres · Analista da garantia da qualidade')
  })

  it('folha só do cliente: a balança informada no local, os pontos acrescentados e a calibração no laboratório', async () => {
    const e = exemplosCampo().find((x) => x.nome === 'cliente')!
    const texto = textoDoPdf(await gerar(e.registro, e.pacote))
    conferirComum(texto, e.registro)
    const t = corrido(texto)
    expect(t).toContain('Só do cliente (balança informada no local)')
    expect(t).toContain('Plataforma · Filizola ID-M 150 · nº FZ-55120 · TAG BAL-EXP-09 (informada no local)')
    expect(t).toContain('Max 150 kg · d 0,05 kg · classe III')
    expect(t).toContain('balança informada no local')
    expect(t).toContain('Classe de exatidão III (média)')
    expect(t).toContain('Receptor de carga Retangular / quadrado (até 4 apoios)')
    expect(t).toMatch(/1 150 0,05 0,05/)
    expect(t).toContain('acrescentado no local')
    expect(t).toMatch(/PP500-01 a 20 Pesos padrão de 500 kg \(bloco\) CAL-20877\/2025 04\/11\/2027 Não Não/)
    expect(t).toContain('Local da calibração No laboratório da empresa')
    expect(t).toContain('Calibração no laboratório: sem assinatura do cliente.')
    expect(t).toContain('Posição 1')
  })

  it('folha em branco encerrada sem completar: o desfecho, o cliente escrito no local, o aviso que impede, a reabertura e a assinatura do cliente anterior à correção', async () => {
    const { registro: r, pacote } = registroEmBrancoIncompleto()
    const pdf = await gerar(r, pacote)
    const texto = textoDoPdf(pdf)
    conferirComum(texto, r)
    const t = corrido(texto)
    const s = textoSimples(pdf)
    const primeira = corrido(paginasDe(texto)[0])
    expect(primeira).toContain(
      'Encerrada sem completar: incompleta. Motivo: O indicador desligou durante o erro de indicação; o cliente vai consertar a fonte. As leituras em branco não foram medidas.',
    )
    expect(t).toContain(`Desfecho ${ROTULO_DESFECHO.INCOMPLETA} · O indicador desligou`)
    expect(t).toContain('Em branco (cliente e balança informados no local)')
    expect(t).toContain('Padaria Pão Dourado Ltda (informado no local)')
    expect(t).toContain('Endereço do cliente O mesmo do endereço da calibração')
    expect(t).toContain('OS-2026-0601 (escrito no local)')
    expect(t).toContain('Rua 5, 1200 – Centro – Rio Claro/SP (escrito no local)')
    expect(t).toContain('Classe de exatidão IIII (ordinária)')
    expect(t).toContain('Nenhum ensaio anotado.')
    expect(t).toContain('Ensaio Não feito Por quê Não feito: a balança desligou antes do ensaio.')
    expect(s).toContain('Anomalia o passo todo O indicador apagou duas vezes com 10 kg no prato; fonte com mau contato.')
    expect(s).toContain(
      'A balança não pesa corretamente: isto impede o certificado. Isto impede o certificado Motivo: O indicador apagou; vou encerrar sem completar e voltar depois do conserto.',
    )
    // A correção antes de assinar de uma opção de marcar sai por extenso
    expect(s).toContain('Passo 2 · Local da calibração Antes Depois No laboratório da empresa Nas instalações do cliente')
    expect(t).toContain('Toquei na opção errada.')
    expect(t).not.toContain('LABORATORIO')
    // A correção depois da assinatura num item do resumo do cliente: a assinatura dele fica anterior à correção
    expect(t).toMatch(/Início 08:30 27,4 63/)
    expect(s).toContain('24,7 corrigido após a assinatura 08:53')
    expect(s).toContain('Assinatura anterior à correção de 22/10/2026 08:53 (Passo 4 · ambiente início · temperatura).')
    expect(s).toContain('estava no resumo do cliente: a assinatura dele fica anterior à correção')
    expect(t).toContain('REABERTURAS')
    expect(t).toContain('22/10/2026 08:41 Faltava a anotação da anomalia.')
    expect(t).toContain('Márcia Ribeiro · Gerente da loja')
  })

  it('não calibrada com os ensaios recomeçados: a tentativa anterior no anexo (só consulta) e "O cliente assinou só o papel"', async () => {
    const { registro: r, pacote } = registroNaoCalibradaComTentativa()
    const texto = textoDoPdf(await gerar(r, pacote))
    conferirComum(texto, r)
    const t = corrido(texto)
    expect(t).toContain(FAIXA_PILOTO)
    expect(t).toContain(`${ROTULO_DESFECHO.NAO_CALIBRADA}. Motivo: A balança continuou fora do limite`)
    expect(t).toContain('O cliente assinou só o papel (piloto).')
    expect(t).toContain('0 anotadas · 5 previstas')
    expect(t).toContain('Nenhuma leitura anotada.')
    expect(t).toContain('Por quê Não feito: a balança não foi calibrada.')
    // O anexo começa numa página nova, depois das assinaturas e dos blocos do fim
    const paginas = paginasDe(texto).map(corrido)
    const iAnexo = paginas.findIndex((p) => p.includes(TITULO_ANEXO_TENTATIVAS.toUpperCase()))
    const iAssinaturas = paginas.findIndex((p) => p.includes('TÉCNICO QUE EXECUTOU'))
    expect(iAnexo).toBeGreaterThan(iAssinaturas)
    expect(paginas[iAnexo].indexOf(TITULO_ANEXO_TENTATIVAS.toUpperCase())).toBeLessThan(paginas[iAnexo].indexOf('Tentativa 1'))
    const anexo = paginas.slice(iAnexo).join(' ')
    expect(anexo).toContain(NOTA_ANEXO_TENTATIVAS)
    expect(anexo).toContain(
      'Tentativa 1 · encerrada em 21/10/2026 10:30 · motivo: Erro de 2 d em 300 kg: a célula de carga do canto trás direito foi trocada.',
    )
    // As leituras da tentativa anterior, com a hora, nos quatro passos de medição
    expect(anexo).toContain('4. Ambiente')
    expect(anexo).toMatch(/150,00 7 × 20 kg \+ 10 kg 150,05 150,10/)
    expect(anexo).toContain('5 anotadas · 5 previstas · 2 pela tecla Repetir')
    expect(anexo).toMatch(/Trás direita 100,05 09:00:15/)
  })

  it('a faixa PILOTO segue a opção da rota (o envio ou o registro); o selo do relógio só passa de 5 min', async () => {
    const semPiloto = corrido(textoDoPdf(await gerar(registroPlataforma(), pacotePlataforma(), { piloto: false })))
    expect(semPiloto).not.toContain('PILOTO')
    const comPiloto = corrido(textoDoPdf(await gerar(registroRodoviaria(), pacoteRodoviaria(), { piloto: true })))
    expect(comPiloto).toContain(FAIXA_PILOTO)
    expect(comPiloto).toContain('PILOTO · Página 1 de')
    const relogio = (s: number | null) =>
      gerar(registroRodoviaria(), pacoteRodoviaria(), { recebidoEm: '2026-10-27T12:50:00.000Z', relogioDiferencaS: s })
    expect(corrido(textoDoPdf(await relogio(-600)))).toContain(
      'Recebida no servidor 27/10/2026 09:50 · Relógio do celular diferente (10 min)',
    )
    expect(corrido(textoDoPdf(await relogio(120)))).not.toContain('Relógio do celular diferente')
    expect(corrido(textoDoPdf(await relogio(null)))).not.toContain('Relógio do celular diferente')
  })

  it('a empresa do cabeçalho vem das Configurações', async () => {
    const t = corrido(
      textoDoPdf(
        await gerar(registroRodoviaria(), pacoteRodoviaria(), {
          empresa: { ...EMPRESA_PADRAO, nomeFantasia: 'Outra Balança', razaoSocial: 'OUTRA BALANÇA LTDA' },
        }),
      ),
    )
    expect(t).toContain('OUTRA BALANÇA')
    expect(t).not.toContain('BALANÇAS.COM')
  })

  it('o registro órfão (sem o pacote do envio) sai com o que ele mesmo traz', async () => {
    const r = registroPlataforma()
    const texto = textoDoPdf(await gerar(r, null))
    const t = corrido(texto)
    expect(t).toContain('FC-2026-00042')
    expect(t).not.toContain('CERTIFICADO Nº')
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toMatch(/Local de instalação Expedição — doca 2 Algo diferente/)
    expect(t).toContain('150,05')
    expect(t).toContain(RODAPE('FC-2026-00042'))
  })

  it('folha recém-começada (sem leituras nem assinaturas): traços no que falta', async () => {
    const p = pacotePlataforma()
    const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-10-21T08:05:00-03:00' })
    const t = corrido(textoDoPdf(await gerar(r, p)))
    expect(t).toContain('Sem assinatura do técnico.')
    expect(t).toContain('Sem assinatura do cliente.')
    expect(t).toMatch(/Tipo de balança Plataforma Não conferido/)
  })
})

describe.runIf(temPdfimages)('folha impressa assinada: imagens das assinaturas (pdfimages)', { timeout: 60_000 }, () => {
  it('as assinaturas PNG entram no PDF no tamanho original, na página das assinaturas', async () => {
    const plataforma = imagensDoPdf(await gerar(registroPlataforma(), pacotePlataforma()))
    expect(plataforma).toHaveLength(2)
    expect(plataforma.every((x) => x.largura === 260 && x.altura === 75)).toBe(true)
    expect(new Set(plataforma.map((x) => x.pagina)).size).toBe(1)
    // Cliente não assinou, calibração no laboratório e só no papel: só a do técnico
    expect(imagensDoPdf(await gerar(registroRodoviaria(), pacoteRodoviaria()))).toHaveLength(1)
    const cliente = exemplosCampo().find((x) => x.nome === 'cliente')!
    expect(imagensDoPdf(await gerar(cliente.registro, cliente.pacote))).toHaveLength(1)
    const naoCal = registroNaoCalibradaComTentativa()
    expect(imagensDoPdf(await gerar(naoCal.registro, naoCal.pacote))).toHaveLength(1)
    const branco = registroEmBrancoIncompleto()
    expect(imagensDoPdf(await gerar(branco.registro, branco.pacote))).toHaveLength(2)
  })

  it('PNG inválido não entra (a folha diz que a imagem está ilegível); sem assinaturas, nenhuma imagem', async () => {
    const r = registroPlataforma()
    r.assinaturas.tecnico = { ...r.assinaturas.tecnico!, png: 'data:image/png;base64,AAAA' }
    const pdf = await gerar(r, pacotePlataforma())
    expect(imagensDoPdf(pdf)).toHaveLength(1)
    if (temPdftotext) expect(corrido(textoDoPdf(pdf))).toContain('Imagem da assinatura ilegível.')
    const p = pacotePlataforma()
    const vazio = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-10-21T08:05:00-03:00' })
    expect(imagensDoPdf(await gerar(vazio, p))).toHaveLength(0)
  })

  it('PNG com o cabeçalho certo e os dados estragados não vai para o pdfkit (derrubaria o servidor): "ilegível"', async () => {
    const r = registroPlataforma()
    r.assinaturas.tecnico = { ...r.assinaturas.tecnico!, png: pngRgbaIdatQueNaoEZlib() }
    const c = r.assinaturas.cliente as { png: string }
    c.png = pngRgbaFiltroInvalido()
    const pdf = await gerar(r, pacotePlataforma())
    expect(imagensDoPdf(pdf)).toHaveLength(0)
    if (temPdftotext) expect(corrido(textoDoPdf(pdf)).match(/Imagem da assinatura ilegível\./g)).toHaveLength(2)
    // A do canvas (RGBA) entra
    r.assinaturas.tecnico.png = pngRgbaValido()
    expect(imagensDoPdf(await gerar(r, pacotePlataforma()))).toEqual([expect.objectContaining({ largura: 120, altura: 40 })])
  })
})
