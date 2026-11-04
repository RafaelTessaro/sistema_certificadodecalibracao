// Os certificados de antes do POP de calibração (ajuste externo com "como encontrado", reparo, verificação preliminar
// "não"; e o "como encontrado" da classe I com o ajuste interno) saem exatamente como saíam: o texto do PDF é o
// gravado em __fixtures__ (gerado pela versão 1.0.2, antes da etapa "Balança e ajuste" seguir o POP), depois de os
// dados passarem pela gravação do servidor (normalizarCalibracao) e pelo cálculo de novo. Se o certificado mudar de
// propósito, gere os arquivos de novo com o pdftotext -layout (os exemplos de exemplosCertificado.ts).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { normalizarCalibracao, registroAnterior, type RegistroAnterior } from '#shared/dominio.ts'
import type { Calibracao } from '#shared/tipos.ts'
import { gerarCertificadoPdf } from './certificado.ts'
import { exemploClasseI, exemploPiorCaso, exemploPlataforma } from './exemplosCertificado.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error

/** Texto corrido do PDF (sem as quebras e os espaços do layout, que dependem da versão do poppler). */
const corrido = (t: string) => t.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim()
const textoDoPdf = (pdf: Buffer) =>
  corrido(spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf }).stdout.toString('utf8'))
const fixture = (nome: string) =>
  corrido(readFileSync(new URL(`./__fixtures__/certificado-legado-${nome}.txt`, import.meta.url), 'utf8'))

/** O que a gravação do servidor faz com o registro (PUT /api/calibracoes/:id) e o cálculo de novo. */
function gravadoDeNovo(d: DadosCertificadoPdf): DadosCertificadoPdf {
  const { valor, erros } = normalizarCalibracao(d.calibracao)
  expect(erros).toEqual([])
  const calibracao: Calibracao = { ...d.calibracao, ...valor }
  const { resultado, comoEncontrado } = calcularCalibracao(calibracao, d.emissao.balanca, d.emissao.padroes)
  return { ...d, calibracao, resultado, comoEncontrado }
}

const CASOS: Array<{ nome: string; dados: () => DadosCertificadoPdf; anterior: Partial<RegistroAnterior> }> = [
  // Ajuste externo com "como encontrado" e reparo
  { nome: 'plataforma', dados: exemploPlataforma, anterior: { ajusteExterno: true, comoEncontrado: true, reparo: true } },
  // Tudo junto, com a pré-carga "não" (a linha da verificação preliminar)
  {
    nome: 'pior',
    dados: exemploPiorCaso,
    anterior: { ajusteExterno: true, comoEncontrado: true, reparo: true, preliminar: ['pré-carga aplicada'] },
  },
  // Classe I: ajuste interno com o "como encontrado" medido antes
  { nome: 'classei', dados: exemploClasseI, anterior: { ajusteExterno: false, comoEncontrado: true } },
]

describe('certificado de um registro de antes do POP (legado)', { timeout: 60_000 }, () => {
  it.each(CASOS)('$nome: é registro de antes', ({ dados, anterior }) => {
    expect(registroAnterior(dados().calibracao)).toMatchObject(anterior)
  })

  it.skipIf(!temPdftotext).each(CASOS)('$nome: sai igual ao de antes, depois de gravado de novo', async ({ nome, dados }) => {
    const texto = textoDoPdf(await gerarCertificadoPdf(gravadoDeNovo(dados())))
    expect(texto).toBe(fixture(nome))
  })
})
