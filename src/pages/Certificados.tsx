import { ChevronLeft, ChevronRight, Download, FileBadge2, FilePlus2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_CALIBRACAO } from '#shared/dominio.ts'
import { CertificadosTabela } from '../components/CertificadosTabela'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Form'
import { EmptyState, PageHeader, SearchInput, Segmented } from '../components/ui/Misc'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { exportarCSV } from '../lib/csv'
import { dataCurta, numero } from '../lib/format'
import { EsqueletoTabela } from './Clientes'

type Filtro = '' | 'ABERTAS' | 'EMITIDO' | 'CANCELADO' | 'SUBSTITUIDO'
const POR_PAGINA = 50

export function Certificados() {
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [pagina, setPagina] = useState(1)

  // A busca vai ao servidor com uma pequena espera enquanto a pessoa digita
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  const filtroConsulta = { status: filtro, busca: buscaAplicada, de, ate, pagina, limite: POR_PAGINA }
  const { dados, carregando } = useConsulta(
    `calibracoes:${JSON.stringify(filtroConsulta)}`,
    () => api.calibracoes(filtroConsulta),
    ['calibracao', 'cliente', 'balanca'],
  )
  const itens = dados?.itens ?? []
  const total = dados?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const exportar = () =>
    exportarCSV(
      'certificados.csv',
      [
        'Número',
        'Situação',
        'Cliente',
        'Balança',
        'Nº de série',
        'OS',
        'Data da calibração',
        'Data de emissão',
        'Técnico',
        'Próxima calibração',
      ],
      itens.map((k) => [
        k.numero,
        STATUS_CALIBRACAO[k.status].label,
        k.clienteNome,
        k.balancaDescricao,
        k.balancaSerie,
        k.ordemServico,
        dataCurta(k.dataCalibracao),
        k.dataEmissao ? dataCurta(k.dataEmissao) : '',
        k.tecnicoNome,
        k.proximaCalibracao ? dataCurta(k.proximaCalibracao) : '',
      ]),
    )

  const mudarFiltro = (f: Filtro) => {
    setFiltro(f)
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Certificados"
        descricao="Calibrações em andamento e certificados emitidos"
        acoes={
          <>
            <Button icone={<Download className="h-4 w-4" />} onClick={exportar} disabled={!itens.length}>
              Exportar
            </Button>
            <Button variante="primary" icone={<FilePlus2 className="h-4 w-4" />} onClick={() => navegar('/calibracoes/nova')}>
              Nova calibração
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        {/* Em telas de notebook (1280, 1366) as datas passam para a linha de baixo, sem cortar o filtro */}
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            valor={busca}
            aoMudar={setBusca}
            placeholder="Nº do certificado, cliente, série, OS…"
            className="lg:max-w-80 lg:min-w-60 lg:flex-1"
          />
          <Segmented
            className="shrink-0"
            valor={filtro}
            aoMudar={mudarFiltro}
            opcoes={[
              { valor: '', label: 'Todos' },
              { valor: 'ABERTAS', label: 'Em andamento' },
              { valor: 'EMITIDO', label: 'Emitidos' },
              { valor: 'CANCELADO', label: 'Cancelados' },
              { valor: 'SUBSTITUIDO', label: 'Substituídos' },
            ]}
          />
          <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
            <Input
              type="date"
              value={de}
              onChange={(e) => {
                setDe(e.target.value)
                setPagina(1)
              }}
              aria-label="De"
              className="w-[150px]"
            />
            <span className="text-xs text-muted">até</span>
            <Input
              type="date"
              value={ate}
              onChange={(e) => {
                setAte(e.target.value)
                setPagina(1)
              }}
              aria-label="Até"
              className="w-[150px]"
            />
          </div>
        </div>

        {carregando ? (
          <EsqueletoTabela />
        ) : itens.length === 0 ? (
          <EmptyState
            icone={<FileBadge2 className="h-6 w-6" />}
            titulo={buscaAplicada || filtro || de || ate ? 'Nada encontrado' : 'Nenhuma calibração ainda'}
            descricao={
              buscaAplicada || filtro || de || ate
                ? 'Tente outra busca ou mude os filtros.'
                : 'Comece uma calibração: escolha o cliente e a balança, registre os ensaios e emita o certificado.'
            }
            acao={
              !(buscaAplicada || filtro || de || ate) && (
                <Button variante="primary" icone={<FilePlus2 className="h-4 w-4" />} onClick={() => navegar('/calibracoes/nova')}>
                  Nova calibração
                </Button>
              )
            }
          />
        ) : (
          <>
            <CertificadosTabela itens={itens} />
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
              <span>
                {numero(total)} {total === 1 ? 'resultado' : 'resultados'}
              </span>
              {paginas > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    tamanho="icon-sm"
                    variante="ghost"
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={pagina <= 1}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="tnum">
                    {pagina} de {paginas}
                  </span>
                  <Button
                    tamanho="icon-sm"
                    variante="ghost"
                    onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                    disabled={pagina >= paginas}
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </>
  )
}
