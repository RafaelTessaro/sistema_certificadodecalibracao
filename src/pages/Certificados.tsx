import { ClipboardList, Download, FileBadge2, FilePlus2, Printer } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent as TeclaReact } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { rotuloDaSituacao } from '#shared/dominio.ts'
import { BotaoPop } from '../components/BotaoPop'
import { CertificadosTabela } from '../components/CertificadosTabela'
import { FolhasCampoLista } from '../components/FolhasCampoLista'
import { NumerosNaoUtilizados } from '../components/NumerosNaoUtilizados'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Form'
import { EmptyState, PageHeader, SearchInput, Segmented } from '../components/ui/Misc'
import { RodapeTabela } from '../components/ui/Table'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { exportarCSV } from '../lib/csv'
import { abrirFolhaCampo } from '../lib/folhaCampo'
import { dataCurta, numero } from '../lib/format'
import { type AbaCertificados, abaDaPagina, guardarAba, lerAbaGuardada, paramsDaAba } from '../lib/listaFolhas'
import { useSessao } from '../store/sessao'
import { EsqueletoTabela } from './Clientes'

type Filtro = '' | 'ABERTAS' | 'AUTORIZAR' | 'ASSINATURA_PENDENTE' | 'EMITIDO' | 'CANCELADO' | 'SUBSTITUIDO'
const POR_PAGINA = 50

export function Certificados() {
  const navegar = useNavigate()
  // "?situacao=autorizar" (o aviso do painel) abre já em "Para você autorizar"; "?situacao=assinatura", nos emitidos que
  // aguardam a assinatura digital
  const [parametros, setParametros] = useSearchParams()
  // As abas "Certificados" e "Folhas de campo": a do endereço (?aba=folhas) ou a última escolhida neste navegador
  const [abaGuardada, setAbaGuardada] = useState(lerAbaGuardada)
  const aba = abaDaPagina(parametros, abaGuardada)
  // A aba vista é a lembrada (também a que veio pelo endereço): voltar à página abre nela
  if (aba !== abaGuardada) setAbaGuardada(aba)
  useEffect(() => guardarAba(aba), [aba])
  const mudarAba = (a: AbaCertificados) => {
    setAbaGuardada(a)
    setParametros((p) => paramsDaAba(p, a), { replace: true })
  }
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const situacao = parametros.get('situacao')
    return situacao === 'autorizar' ? 'AUTORIZAR' : situacao === 'assinatura' ? 'ASSINATURA_PENDENTE' : ''
  })
  const signatario = useSessao((s) => !!s.usuario?.signatario)
  // As que aguardam a autorização de quem está vendo (atualiza em tempo real, como a lista)
  // (nenhuma com a revisão por outra pessoa desligada: o servidor confere a configuração)
  const { dados: paraAutorizar } = useConsulta(
    signatario ? 'calibracoes:autorizar' : null,
    () => api.calibracoes({ status: 'AUTORIZAR', limite: 1 }).then((r) => r.total),
    ['calibracao', 'config'],
  )
  // Os emitidos com a assinatura digital que ainda não foram assinados (o PDF não é entregue até assinar)
  const { dados: aguardandoAssinatura } = useConsulta(
    'calibracoes:assinatura-pendente',
    () => api.calibracoes({ status: 'ASSINATURA_PENDENTE', limite: 1 }).then((r) => r.total),
    ['calibracao', 'config'],
  )
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
    // A configuração também: "Enviada para revisão" ou "Aguardando autorização" (`semAutorizacao`)
    ['calibracao', 'cliente', 'balanca', 'config'],
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
        'Editado',
        'Técnico',
        'Próxima calibração',
      ],
      itens.map((k) => [
        k.numero || (k.numeroReservado ? `${k.numeroReservado} (reservado)` : ''),
        rotuloDaSituacao(k.status, k.semAutorizacao),
        k.clienteNome,
        k.balancaDescricao,
        k.balancaSerie,
        k.ordemServico,
        dataCurta(k.dataCalibracao),
        k.dataEmissao ? dataCurta(k.dataEmissao) : '',
        k.editadoEm ? 'sim' : '',
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
            {aba === 'certificados' && (
              <Button icone={<Download className="h-4 w-4" />} onClick={exportar} disabled={!itens.length}>
                Exportar
              </Button>
            )}
            <Button
              icone={<Printer className="h-4 w-4" />}
              onClick={() => void abrirFolhaCampo(api.urlFolhaCampoAvulsa())}
              title="Folha de campo sem cliente nem balança, para preencher à mão (balança ainda não cadastrada)"
            >
              Folha em branco
            </Button>
            <BotaoPop />
            <Button variante="primary" icone={<FilePlus2 className="h-4 w-4" />} onClick={() => navegar('/calibracoes/nova')}>
              Nova calibração
            </Button>
          </>
        }
      />

      <Card id="lista-certificados" className="scroll-mt-4 overflow-hidden">
        <AbasDaLista aba={aba} aoMudar={mudarAba} />
        {aba === 'folhas' ? (
          <div role="tabpanel" id="painel-folhas" aria-labelledby="aba-folhas">
            <FolhasCampoLista />
          </div>
        ) : (
          <div role="tabpanel" id="painel-certificados" aria-labelledby="aba-certificados">
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
                  // Só para quem pode receber o pedido, quando há algum (ou o filtro já está escolhido)
                  ...(signatario && (!!paraAutorizar || filtro === 'AUTORIZAR')
                    ? [{ valor: 'AUTORIZAR' as const, label: `Para você autorizar (${numero(paraAutorizar ?? 0)})` }]
                    : []),
                  { valor: 'EMITIDO', label: 'Emitidos' },
                  // Só quando há algum (ou o filtro já está escolhido)
                  ...(!!aguardandoAssinatura || filtro === 'ASSINATURA_PENDENTE'
                    ? [
                        {
                          valor: 'ASSINATURA_PENDENTE' as const,
                          label: `Aguardando assinatura (${numero(aguardandoAssinatura ?? 0)})`,
                        },
                      ]
                    : []),
                  { valor: 'CANCELADO', label: 'Cancelados' },
                  { valor: 'SUBSTITUIDO', label: 'Substituídos' },
                ]}
              />
              {/* No celular, as duas datas dividem a largura (sem passar da borda) */}
              <div className="flex shrink-0 items-center gap-2 max-sm:w-full lg:ml-auto">
                <Input
                  type="date"
                  value={de}
                  onChange={(e) => {
                    setDe(e.target.value)
                    setPagina(1)
                  }}
                  aria-label="De"
                  className="w-[150px] max-sm:w-0 max-sm:min-w-0 max-sm:flex-1"
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
                  className="w-[150px] max-sm:w-0 max-sm:min-w-0 max-sm:flex-1"
                />
              </div>
            </div>

            {carregando ? (
              <EsqueletoTabela />
            ) : itens.length === 0 ? (
              <EmptyState
                icone={<FileBadge2 className="h-6 w-6" />}
                titulo={
                  filtro === 'ASSINATURA_PENDENTE' && !buscaAplicada && !de && !ate
                    ? 'Nenhum certificado aguarda a assinatura digital'
                    : filtro === 'AUTORIZAR' && !buscaAplicada && !de && !ate
                      ? 'Nada aguarda a sua autorização'
                      : buscaAplicada || filtro || de || ate
                        ? 'Nada encontrado'
                        : 'Nenhuma calibração ainda'
                }
                descricao={
                  filtro === 'ASSINATURA_PENDENTE' && !buscaAplicada && !de && !ate
                    ? 'Os emitidos para assinatura digital já foram todos assinados.'
                    : filtro === 'AUTORIZAR' && !buscaAplicada && !de && !ate
                      ? 'Quando alguém enviar uma calibração para você autorizar, ela aparece aqui.'
                      : buscaAplicada || filtro || de || ate
                        ? 'Tente outra busca ou mude os filtros.'
                        : 'Comece uma calibração: escolha o cliente e a balança, registre os ensaios e emita o certificado.'
                }
                acao={
                  !(buscaAplicada || filtro || de || ate) && (
                    <Button
                      variante="primary"
                      icone={<FilePlus2 className="h-4 w-4" />}
                      onClick={() => navegar('/calibracoes/nova')}
                    >
                      Nova calibração
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <CertificadosTabela itens={itens} />
                <RodapeTabela total={total} pagina={pagina} paginas={paginas} aoMudarPagina={setPagina} formatar={numero} />
              </>
            )}
          </div>
        )}
      </Card>
      <NumerosNaoUtilizados
        aoVerFolhas={
          aba === 'folhas'
            ? undefined
            : () => {
                mudarAba('folhas')
                document.getElementById('lista-certificados')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
        }
      />
    </>
  )
}

const ABAS: Array<{ valor: AbaCertificados; label: string; icone: typeof FileBadge2 }> = [
  { valor: 'certificados', label: 'Certificados', icone: FileBadge2 },
  { valor: 'folhas', label: 'Folhas de campo', icone: ClipboardList },
]

/**
 * As abas no alto da lista: "Certificados" e "Folhas de campo". Uma parada só do Tab, na escolhida; as setas ← e →
 * (e Home/End) trocam de aba.
 */
function AbasDaLista({ aba, aoMudar }: { aba: AbaCertificados; aoMudar: (a: AbaCertificados) => void }) {
  const botoes = useRef<Array<HTMLButtonElement | null>>([])
  const mover = (e: TeclaReact<HTMLButtonElement>, i: number) => {
    const n = ABAS.length
    const destino =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1
    if (destino < 0 || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    botoes.current[destino]?.focus()
    aoMudar(ABAS[destino].valor)
  }
  return (
    <div role="tablist" aria-label="O que listar" className="flex items-stretch gap-1 border-b border-line px-2.5 sm:px-3">
      {ABAS.map((a, i) => {
        const ativa = a.valor === aba
        return (
          <button
            type="button"
            key={a.valor}
            ref={(el) => {
              botoes.current[i] = el
            }}
            role="tab"
            id={`aba-${a.valor}`}
            aria-controls={`painel-${a.valor}`}
            aria-selected={ativa}
            tabIndex={ativa ? 0 : -1}
            onKeyDown={(e) => mover(e, i)}
            onClick={() => aoMudar(a.valor)}
            className={cn(
              'relative flex h-12 cursor-pointer items-center gap-2 rounded-t-lg px-2.5 text-[14px] font-medium whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
              ativa ? 'text-ink' : 'text-muted hover:text-ink-2',
            )}
          >
            <a.icone className={cn('h-4 w-4', ativa ? 'text-brand' : 'text-muted')} />
            {a.label}
            {ativa && (
              <motion.span
                layoutId="aba-certificados-ativa"
                className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-brand"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
