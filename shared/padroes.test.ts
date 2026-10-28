// Arquivo do certificado de cada padrão: o nº do certificado decide de que certificado é o arquivo.
import { describe, expect, it } from 'vitest'
import {
  arquivoDoCertificado,
  arquivoDoCertificadoAnterior,
  certificadosAnterioresApos,
  chaveCertificado,
  MAX_CERTIFICADOS_ANTERIORES,
} from './dominio.ts'
import type { ArquivoAnexo } from './tipos.ts'

const arquivo = (sha: string): ArquivoAnexo => ({
  sha256: sha.repeat(64).slice(0, 64),
  nome: `${sha}.pdf`,
  tamanho: 10,
  tipo: 'application/pdf',
  enviadoEm: '2026-10-01T12:00:00.000Z',
})
const [A, B, C] = [arquivo('a'), arquivo('b'), arquivo('c')]

describe('nº do certificado do padrão', () => {
  it('compara sem espaços e sem diferença de maiúsculas', () => {
    expect(chaveCertificado(' lab-0456 / 2026 ')).toBe('LAB-0456/2026')
    expect(chaveCertificado('')).toBe('')
  })

  it('outro nº com o mesmo arquivo: é o arquivo do certificado anterior', () => {
    const antes = { certificado: 'LAB-0456/2026', certificadoArquivo: A }
    expect(arquivoDoCertificadoAnterior(antes, { certificado: 'LAB-0999/2027', sha256: A.sha256 })).toBe(true)
    // Arquivo novo, sem arquivo, mesmo nº escrito de outro jeito, nº preenchido ou apagado: não
    expect(arquivoDoCertificadoAnterior(antes, { certificado: 'LAB-0999/2027', sha256: B.sha256 })).toBe(false)
    expect(arquivoDoCertificadoAnterior(antes, { certificado: 'LAB-0999/2027', sha256: null })).toBe(false)
    expect(arquivoDoCertificadoAnterior(antes, { certificado: 'lab-0456/2026 ', sha256: A.sha256 })).toBe(false)
    expect(
      arquivoDoCertificadoAnterior({ certificado: '', certificadoArquivo: A }, { certificado: 'X-1', sha256: A.sha256 }),
    ).toBe(false)
    expect(arquivoDoCertificadoAnterior(antes, { certificado: '', sha256: A.sha256 })).toBe(false)
    expect(
      arquivoDoCertificadoAnterior({ certificado: 'X-1', certificadoArquivo: null }, { certificado: 'X-2', sha256: null }),
    ).toBe(false)
  })

  it('ao mudar o nº, o arquivo do nº de antes fica guardado (o mais recente primeiro, um por nº)', () => {
    const p = { certificado: 'LAB-1/2025', certificadoArquivo: A }
    const uma = certificadosAnterioresApos(p, 'LAB-2/2026')
    expect(uma).toEqual([{ certificado: 'LAB-1/2025', arquivo: A }])
    // Mesmo nº (ou sem arquivo, ou sem nº antes): nada muda
    expect(certificadosAnterioresApos(p, ' lab-1/2025')).toEqual([])
    expect(certificadosAnterioresApos({ ...p, certificadoArquivo: null, certificadosAnteriores: uma }, 'X')).toBe(uma)
    expect(certificadosAnterioresApos({ ...p, certificado: '' }, 'X')).toEqual([])
    // Voltando a um nº já guardado (correção de digitação desfeita): fica só o registro mais novo dele
    const duas = certificadosAnterioresApos(
      { certificado: 'LAB-2/2026', certificadoArquivo: B, certificadosAnteriores: uma },
      'LAB-1/2025',
    )
    expect(duas).toEqual([
      { certificado: 'LAB-2/2026', arquivo: B },
      { certificado: 'LAB-1/2025', arquivo: A },
    ])
    const tres = certificadosAnterioresApos(
      { certificado: 'lab-1/2025', certificadoArquivo: C, certificadosAnteriores: duas },
      'LAB-3',
    )
    expect(tres).toEqual([
      { certificado: 'lab-1/2025', arquivo: C },
      { certificado: 'LAB-2/2026', arquivo: B },
    ])
    // Limite de registros guardados
    let q = { certificado: 'N-0', certificadoArquivo: A, certificadosAnteriores: [] as typeof uma }
    for (let i = 1; i <= MAX_CERTIFICADOS_ANTERIORES + 5; i++)
      q = { ...q, certificado: `N-${i}`, certificadosAnteriores: certificadosAnterioresApos(q, `N-${i}`) }
    expect(q.certificadosAnteriores).toHaveLength(MAX_CERTIFICADOS_ANTERIORES)
    expect(q.certificadosAnteriores[0].certificado).toBe(`N-${MAX_CERTIFICADOS_ANTERIORES + 4}`)
  })

  it('arquivo do cadastro para um nº: o atual se for o mesmo nº, senão o guardado daquele nº', () => {
    const p = {
      certificado: 'LAB-3/2027',
      certificadoArquivo: C,
      certificadosAnteriores: [
        { certificado: 'LAB-2/2026', arquivo: B },
        { certificado: 'LAB-1/2025', arquivo: A },
      ],
    }
    expect(arquivoDoCertificado(p, 'lab-3/2027')).toBe(C)
    expect(arquivoDoCertificado(p, 'LAB-2/2026')).toBe(B)
    expect(arquivoDoCertificado(p, ' LAB-1/2025')).toBe(A)
    expect(arquivoDoCertificado(p, 'LAB-0/2024')).toBeNull()
    expect(arquivoDoCertificado(p, '')).toBeNull()
    expect(arquivoDoCertificado({ certificado: 'LAB-3/2027', certificadoArquivo: null }, 'LAB-3/2027')).toBeNull()
    expect(arquivoDoCertificado({ certificado: 'LAB-3/2027' }, 'LAB-2/2026')).toBeNull()
  })
})
