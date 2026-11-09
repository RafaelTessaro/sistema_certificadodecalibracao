// Página Certificados, aba "Folhas de campo": todas as folhas impressas, da mais nova para a mais antiga — para quem
// cada uma foi impressa, o nº de certificado impresso nela (o que o técnico copia na etiqueta), quando e por quem, a
// situação (ligada a uma calibração, não ligada, substituída por uma folha nova, não vai ser usada) e o botão de
// reimprimir: o PDF da primeira impressão, com os mesmos nºs (nunca um nº novo). Atualiza em tempo real.

import { Ban, CircleDashed, ClipboardList, Link2, Printer, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FolhaCampoListada, SituacaoFolhaCampo } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { abrirFolhaCampo, textoReimprimir } from '../lib/folhaCampo'
import { balancaNaLista, numero as formatarNumero } from '../lib/format'
import {
  FILTROS_FOLHAS,
  type FiltroFolhas,
  paraQuemEaFolha,
  preNumeroDaFolha,
  quandoFoiImpressa,
  situacaoDaFolha,
} from '../lib/listaFolhas'
import { cn } from '../lib/cn'
import { EsqueletoTabela } from '../pages/Clientes'
import { rotaCalibracao } from './CertificadosTabela'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Input } from './ui/Form'
import { EmptyState, SearchInput, Segmented } from './ui/Misc'
import { Linha, RodapeTabela, Tabela, Td, Th } from './ui/Table'

const POR_PAGINA = 50

const ICONE_SITUACAO: Record<SituacaoFolhaCampo, typeof Link2> = {
  ligada: Link2,
  nao_ligada: CircleDashed,
  substituida: RefreshCcw,
  descartada: Ban,
}

export function FolhasCampoLista() {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [filtro, setFiltro] = useState<FiltroFolhas>('')
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

  const consulta = { situacao: filtro, busca: buscaAplicada, de, ate, pagina, limite: POR_PAGINA }
  // Imprimir, ligar, descartar e reimprimir avisam como mudança de calibração; o cliente e a balança dão os nomes
  const { dados, carregando, erro } = useConsulta(`folhas-campo:${JSON.stringify(consulta)}`, () => api.folhasCampo(consulta), [
    'calibracao',
    'cliente',
    'balanca',
  ])
  const itens = dados?.itens ?? []
  const total = dados?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const filtrado = !!(buscaAplicada || filtro || de || ate)

  return (
    <>
      {/* Em telas de notebook (1280, 1366) as datas passam para a linha de baixo, sem cortar o filtro */}
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput
          valor={busca}
          aoMudar={setBusca}
          placeholder="Folha, certificado, cliente ou OS…"
          className="lg:max-w-80 lg:min-w-60 lg:flex-1"
        />
        <Segmented
          className="shrink-0"
          valor={filtro}
          aoMudar={(f) => {
            setFiltro(f)
            setPagina(1)
          }}
          opcoes={FILTROS_FOLHAS}
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
            aria-label="Impressas de"
            title="Impressas a partir deste dia"
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
            aria-label="Impressas até"
            title="Impressas até este dia"
            className="w-[150px] max-sm:w-0 max-sm:min-w-0 max-sm:flex-1"
          />
        </div>
      </div>

      {carregando ? (
        <EsqueletoTabela />
      ) : erro && !dados ? (
        <EmptyState icone={<ClipboardList className="h-6 w-6" />} titulo="Não foi possível carregar as folhas" descricao={erro} />
      ) : itens.length === 0 ? (
        <EmptyState
          icone={<ClipboardList className="h-6 w-6" />}
          titulo={filtrado ? 'Nada encontrado' : 'Nenhuma folha de campo impressa ainda'}
          descricao={
            filtrado
              ? 'Tente outra busca ou mude os filtros.'
              : 'Toda folha impressa (da calibração, da balança, do cliente ou em branco) aparece aqui, para reimprimir igual quando precisar.'
          }
        />
      ) : (
        <>
          <TabelaFolhas itens={itens} />
          <RodapeTabela
            total={total}
            pagina={pagina}
            paginas={paginas}
            aoMudarPagina={setPagina}
            esquerda={`${formatarNumero(total)} ${total === 1 ? 'folha' : 'folhas'}`}
          />
        </>
      )}
    </>
  )
}

/** A tabela das folhas (sem os filtros), da mais nova para a mais antiga. */
export function TabelaFolhas({ itens }: { itens: FolhaCampoListada[] }) {
  return (
    <Tabela>
      <thead>
        <tr>
          <Th>Folha</Th>
          {/* Cliente e Balança ficam com o espaço que sobra e cortam o texto comprido com "…" */}
          <Th className="w-full md:w-[45%]">Cliente</Th>
          <Th className="w-[55%] max-md:hidden">Balança</Th>
          <Th className="max-sm:hidden">Nº do certificado</Th>
          <Th className="max-sm:hidden">Situação</Th>
          <Th className="w-8">
            <span className="sr-only">Reimprimir</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {itens.map((f, i) => (
          <LinhaFolha key={f.numero} f={f} indice={i} />
        ))}
      </tbody>
    </Tabela>
  )
}

function LinhaFolha({ f, indice }: { f: FolhaCampoListada; indice: number }) {
  // A primeira impressão não terminou: não há PDF para reimprimir (a situação diz o que fazer)
  const semPdf = !!f.impressaoInterrompida
  const para = paraQuemEaFolha(f)
  const pre = preNumeroDaFolha(f)
  const impressa = quandoFoiImpressa(f)
  return (
    <Linha indice={indice}>
      <Td>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2 max-sm:hidden">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="tnum font-medium whitespace-nowrap text-ink">{f.numero}</p>
            <p
              className="tnum text-xs whitespace-nowrap text-muted"
              title={`Impressa a primeira vez em ${impressa}${f.impressoes > 1 ? ` (${f.impressoes} impressões)` : ''}`}
            >
              {impressa}
            </p>
            {/* No celular, o nº do certificado e a situação ficam aqui (as colunas deles somem) */}
            {pre.numero && <p className="tnum text-xs whitespace-nowrap text-ink-2 sm:hidden">{pre.numero}</p>}
            <SituacaoFolha f={f} compacta className="mt-1.5 sm:hidden" />
          </div>
        </div>
      </Td>
      <Td className="max-w-0 min-w-28">
        <p className={cn('truncate', para.vazio ? 'text-muted' : 'text-ink-2')} title={para.cliente}>
          {para.cliente}
        </p>
        {para.detalhe && (
          <p className="truncate text-xs text-muted" title={para.detalhe}>
            {para.detalhe}
          </p>
        )}
      </Td>
      <Td className="max-w-0 min-w-40 max-md:hidden">
        {f.balancaDescricao ? (
          <>
            <p className="truncate text-ink-2" title={f.balancaDescricao}>
              {balancaNaLista(f.balancaDescricao)}
            </p>
            {f.balancaSerie && <p className="tnum truncate text-xs text-muted">Série {f.balancaSerie}</p>}
          </>
        ) : (
          <span className="text-muted">{f.origem === 'recuperada' ? '—' : 'Em branco'}</span>
        )}
      </Td>
      <Td className="tnum whitespace-nowrap max-sm:hidden">
        {pre.numero ? (
          <>
            <p className="text-ink-2">{pre.numero}</p>
            <p className={cn('text-xs', pre.situacao === 'não utilizado' ? 'text-warning' : 'text-muted')}>{pre.situacao}</p>
          </>
        ) : (
          <span className="text-muted" title="Folha impressa antes de o sistema reservar o nº do certificado na folha">
            —
          </span>
        )}
      </Td>
      <Td className="whitespace-nowrap max-sm:hidden">
        <SituacaoFolha f={f} />
      </Td>
      <Td className="pl-0">
        <Button
          tamanho="sm"
          variante="ghost"
          icone={<Printer className="h-3.5 w-3.5" />}
          title={semPdf ? situacaoDaFolha(f).titulo : textoReimprimir(f)}
          aria-label={`Reimprimir a folha ${f.numero}`}
          disabled={semPdf}
          onClick={() => void abrirFolhaCampo(api.urlReimprimirFolha(f.numero))}
          className="max-lg:w-8 max-lg:px-0"
        >
          <span className="max-lg:hidden">Reimprimir</span>
        </Button>
      </Td>
    </Linha>
  )
}

/**
 * A situação da folha: a pílula e, embaixo, o link da calibração a que ela está ligada e (fora do modo `compacta`, o do
 * celular) a folha que ficou no lugar dela ou o motivo de não ser usada.
 */
function SituacaoFolha({ f, compacta, className }: { f: FolhaCampoListada; compacta?: boolean; className?: string }) {
  const s = situacaoDaFolha(f)
  const Icone = ICONE_SITUACAO[f.situacao]
  return (
    <span className={cn('flex flex-col items-start gap-1', className)}>
      <Badge tom={s.tom} ponto={false} className="gap-1">
        <Icone className="h-3 w-3" />
        {s.rotulo}
      </Badge>
      {s.calibracao && f.calibracao && (
        <Link
          to={rotaCalibracao(f.calibracao)}
          className="tnum text-xs font-medium text-brand-ink hover:underline"
          title="Abrir a calibração"
        >
          {s.calibracao}
        </Link>
      )}
      {s.detalhe && !compacta && (
        <span className="max-w-48 truncate text-xs text-muted" title={s.titulo || s.detalhe}>
          {s.detalhe}
        </span>
      )}
    </span>
  )
}
