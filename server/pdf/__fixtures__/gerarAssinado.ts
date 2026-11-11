// Gera a amostra CONGELADA de um PDF assinado pelo sistema (server/pdf/__fixtures__/assinado-formato-<n>.pdf e .json), que
// assinaturaPdf.test.ts usa para conferir, byte a byte, que o código de hoje ainda remonta e adota os PDFs assinados pelas
// versões anteriores (o arquivo e o hash do PDF entregue ao cliente não podem mudar).
//
// NUNCA regenere uma amostra que já existe para fazer o teste passar: se ele falhou, o código mudou a codificação da
// camada da assinatura (escreverAtualizacao, idDaAtualizacao, o campo, a ordem do CMS, o pkijs/asn1js…) e os PDFs já
// assinados deixariam de remontar. O certo é desfazer a mudança ou criar um `formato` novo em PartesAssinaturaPdf, com o
// código do formato antigo mantido, e gerar a amostra do formato novo ao lado da antiga. Por isso este script recusa
// sobrescrever.
//
// Uso (da raiz do projeto): node --experimental-strip-types server/pdf/__fixtures__/gerarAssinado.ts

import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { arquivoPki, raizesTeste, SENHA } from '../../assinatura/__fixtures__/pki.ts'
import { abrirPfx } from '../../assinatura/pfx.ts'
import { assinarPdf } from '../assinaturaPdf.ts'
import { gerarCertificadoPdf } from '../certificado.ts'
import { exemploAssinadoUmaPessoa } from '../exemplosCertificado.ts'

/** As opções da amostra: a chave de teste (pki/ecnpj-aes.pfx) e um /M fixo. */
export const OPCOES_AMOSTRA = {
  m: new Date('2026-11-11T14:30:15.000Z'),
  nome: 'BALANÇAS TESTE LTDA',
  local: 'Rio Claro/SP',
  motivo: 'Emissão do certificado de calibração nº CC-2026-00140',
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

async function gerar() {
  const base = await gerarCertificadoPdf(exemploAssinadoUmaPessoa())
  const a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
  const { pdf, partes } = await assinarPdf(base, a1, OPCOES_AMOSTRA)
  const nome = new URL(`./assinado-formato-${partes.formato}`, import.meta.url)
  const [arquivoPdf, arquivoJson] = [new URL(`${nome.href}.pdf`), new URL(`${nome.href}.json`)]
  if (existsSync(arquivoPdf) || existsSync(arquivoJson))
    throw new Error(`A amostra do formato ${partes.formato} já existe e não pode ser trocada (veja o começo deste arquivo).`)
  writeFileSync(arquivoPdf, pdf)
  writeFileSync(
    arquivoJson,
    `${JSON.stringify(
      {
        tamanhoBase: base.length,
        sha256: sha256(pdf),
        partes,
        opcoes: OPCOES_AMOSTRA,
        // A parte pública (o que a tabela certificados_digitais guarda): a remontagem não depende da PKI de teste
        publico: {
          certificadoDer: a1.certificadoDer.toString('base64'),
          cadeiaDer: a1.cadeiaDer.map((c) => c.toString('base64')),
        },
      },
      null,
      2,
    )}\n`,
  )
  console.log(`Gravado: ${arquivoPdf.pathname} (${sha256(pdf)})`)
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) await gerar()
