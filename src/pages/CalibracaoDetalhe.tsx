import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarCheck,
  Check,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileBadge2,
  FilePen,
  Fingerprint,
  History,
  Loader2,
  Mail,
  MoreHorizontal,
  Printer,
  RefreshCcw,
  Repeat,
  Scale,
  Send,
  ShieldCheck,
  StickyNote,
  Weight,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { capacidadeTexto, LOCAIS, TIPOS_BALANCA } from '#shared/dominio.ts'
import type { Calibracao } from '#shared/tipos.ts'
import { GraficoErro } from '../components/calibracao/GraficoErro'
import { casasDe } from '../components/calibracao/util'
import { EnviarCertificadoModal } from '../components/EnviarCertificadoModal'
import { StatusCalibracaoBadge } from '../components/Selos'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Field, Textarea } from '../components/ui/Form'
import { EmptyState, Menu, PageHeader } from '../components/ui/Misc'
import { Modal } from '../components/ui/Modal'
import { api, type DetalheCalibracao } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { abrirFolhaCampo } from '../lib/folhaCampo'
import { dataCurta, dataHora } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'

export function CalibracaoDetalhe() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { dados, carregando, erro } = useConsulta(`calibracao:${id}`, () => api.calibracao(id), [
    'calibracao',
    'cliente',
    'balanca',
  ])

  if (carregando && !dados) return <Carregando />
  if (!dados)
    return (
      <EmptyState
        icone={<FileBadge2 className="h-6 w-6" />}
        titulo="Certificado não encontrado"
        descricao={erro}
        acao={<Button onClick={() => navegar('/certificados')}>Voltar para certificados</Button>}
      />
    )
  // Em andamento: a tela é o editor
  const k = dados.calibracao
  if (k.status === 'RASCUNHO' || k.status === 'REVISAO') return <Navigate to={`/calibracoes/${k.id}/editar`} replace />
  return <Certificado dados={dados} />
}

function Certificado({ dados }: { dados: DetalheCalibracao }) {
  const navegar = useNavigate()
  const podeCancelar = usePode('cancelarCertificado')
  const { calibracao: k, cliente, balanca, padroes, envios, revisoes, folhaCampo } = dados
  const emissao = k.emissao
  const [enviando, setEnviando] = useState(false)
  const [pedido, setPedido] = useState<'revisar' | 'cancelar' | null>(null)
  const [criando, setCriando] = useState(false)
  const [versaoPdf] = useState(() => Date.now())
  const revisaoAberta = revisoes.find((r) => r.status === 'RASCUNHO' || r.status === 'REVISAO')
  const substituta = revisoes.find((r) => r.status === 'EMITIDO' || r.status === 'SUBSTITUIDO' || r.status === 'CANCELADO')
  const emitido = k.status === 'EMITIDO'
  const urlPdf = `${api.urlPdf(k.id)}${api.urlPdf(k.id).includes('?') ? '&' : '?'}v=${k.versao}-${versaoPdf}`

  const recalibrar = async () => {
    setCriando(true)
    try {
      const r = await api.recalibrar(k.id)
      useTempoReal.getState().mudou('calibracao')
      navegar(`/calibracoes/${r.calibracao.id}/editar`)
    } catch (e) {
      avisarErro('Não foi possível começar a calibração', e)
    } finally {
      setCriando(false)
    }
  }

  const itensMenu: Array<{ label: string; icone?: ReactNode; aoClicar: () => void; perigo?: boolean } | 'sep'> = [
    { label: 'Calibrar de novo esta balança', icone: <Repeat className="h-4 w-4" />, aoClicar: recalibrar },
    // Só a reimpressão da folha que a calibração teve: uma folha nova depois da emissão não seria o registro dela
    ...(folhaCampo
      ? [
          {
            label: `Reimprimir folha de campo (${folhaCampo.numero})`,
            icone: <Printer className="h-4 w-4" />,
            aoClicar: () => void abrirFolhaCampo(api.urlFolhaCampo(k.id)),
          },
        ]
      : []),
  ]
  if (emitido && !revisaoAberta)
    itensMenu.push({
      label: 'Corrigir (emitir revisão)',
      icone: <FilePen className="h-4 w-4" />,
      aoClicar: () => setPedido('revisar'),
    })
  if (emitido && podeCancelar)
    itensMenu.push('sep', {
      label: 'Cancelar certificado',
      icone: <Ban className="h-4 w-4" />,
      aoClicar: () => setPedido('cancelar'),
      perigo: true,
    })

  return (
    <div>
      <PageHeader
        voltar={
          <Link
            to="/certificados"
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Certificados
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tnum">Certificado {k.numero}</span>
            <StatusCalibracaoBadge status={k.status} className="text-xs" />
          </span>
        }
        descricao={
          <>
            {cliente?.nome ?? 'Cliente'} ·{' '}
            {balanca ? `${TIPOS_BALANCA[balanca.tipo] ?? 'Balança'} ${capacidadeTexto(balanca)}` : 'Balança'}
            {k.ordemServico && <> · OS {k.ordemServico}</>}
          </>
        }
        acoes={
          <>
            <a href={api.urlPdf(k.id, true)} download>
              <Button icone={<Download className="h-4 w-4" />} tabIndex={-1}>
                Baixar PDF
              </Button>
            </a>
            <Button icone={<Printer className="h-4 w-4" />} onClick={() => imprimir(urlPdf)} className="hidden sm:inline-flex">
              Imprimir
            </Button>
            {emitido && (
              <Button variante="primary" icone={<Send className="h-4 w-4" />} onClick={() => setEnviando(true)}>
                Enviar por e-mail
              </Button>
            )}
            <Menu
              gatilho={(abrir) => (
                <Button tamanho="icon" onClick={abrir} aria-label="Mais ações" disabled={criando}>
                  {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              )}
              itens={itensMenu}
            />
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {k.status === 'CANCELADO' && k.cancelamento && (
          <Faixa tom="danger" icone={<Ban className="h-4 w-4" />}>
            <strong>Certificado cancelado</strong> em {dataHora(k.cancelamento.em)} por {k.cancelamento.por}. Motivo:{' '}
            {k.cancelamento.motivo}
          </Faixa>
        )}
        {k.status === 'SUBSTITUIDO' && (
          <Faixa tom="info" icone={<RefreshCcw className="h-4 w-4" />}>
            Este certificado foi <strong>substituído</strong>
            {substituta ? (
              <>
                {' '}
                pelo nº{' '}
                <Link to={`/calibracoes/${substituta.id}`} className="font-semibold underline underline-offset-2">
                  {substituta.numero}
                </Link>
              </>
            ) : null}
            . Ele continua guardado, com a marca “substituído”.
          </Faixa>
        )}
        {revisaoAberta && (
          <Faixa tom="warning" icone={<FilePen className="h-4 w-4" />}>
            Há uma revisão deste certificado em andamento.{' '}
            <Link to={`/calibracoes/${revisaoAberta.id}/editar`} className="font-semibold underline underline-offset-2">
              Continuar a revisão
            </Link>
          </Faixa>
        )}
        {k.substituiId && emissao?.substituiNumero && (
          <Faixa tom="neutro" icone={<History className="h-4 w-4" />}>
            Revisão que substitui o certificado nº{' '}
            <Link to={`/calibracoes/${k.substituiId}`} className="font-semibold underline underline-offset-2">
              {emissao.substituiNumero}
            </Link>
            {k.motivoRevisao && <> — {k.motivoRevisao}</>}
          </Faixa>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <FileBadge2 className="h-4 w-4 text-brand" />
                Certificado em PDF
              </p>
              <a
                href={urlPdf}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-ink hover:underline"
              >
                Abrir em outra aba
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {/* Navegadores de celular não mostram PDF dentro da página: lá, um botão para abrir */}
            <iframe
              title={`Certificado ${k.numero}`}
              src={urlPdf}
              className="hidden h-[78vh] min-h-[520px] w-full bg-surface-2 md:block"
            />
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center md:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
                <FileBadge2 className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted">Certificado nº {k.numero}</p>
              <a href={urlPdf} target="_blank" rel="noreferrer">
                <Button variante="primary" icone={<ExternalLink className="h-4 w-4" />} tabIndex={-1}>
                  Abrir o PDF
                </Button>
              </a>
            </div>
          </Card>
          <Resultados k={k} dados={dados} />
        </div>

        <div className="flex flex-col gap-6">
          {emissao && <CartaoEmissao k={k} />}

          <Card>
            <CardHeader icone={<ClipboardList className="h-4 w-4" />} titulo="Calibração" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-5 pb-5 text-sm">
              <Dado rotulo="Data da calibração">{dataCurta(k.dataCalibracao)}</Dado>
              <Dado rotulo="Emissão">{dataCurta(k.dataEmissao)}</Dado>
              <Dado rotulo="Ordem de serviço">{k.ordemServico}</Dado>
              <Dado rotulo="Local">{LOCAIS[k.local]?.replace(/^(Nas|No) /, '')}</Dado>
              <Dado rotulo="Executado por">{emissao?.tecnico.nome}</Dado>
              <Dado rotulo="Autorizado por">{emissao?.signatario.nome}</Dado>
              {folhaCampo && (
                <Dado rotulo="Folha de campo" largo>
                  <button
                    type="button"
                    onClick={() => void abrirFolhaCampo(api.urlFolhaCampo(k.id))}
                    className="tnum inline-flex cursor-pointer items-center gap-1.5 font-medium text-brand-ink hover:underline"
                    title="Imprime de novo a folha de campo, igual à primeira impressão (sem as leituras)"
                  >
                    {folhaCampo.numero}
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-muted"> · impressa em {dataHora(folhaCampo.impressaEm)}</span>
                  {folhaCampo.impressaPor && <span className="text-muted"> por {folhaCampo.impressaPor}</span>}
                </Dado>
              )}
              <Dado rotulo="Próxima calibração" largo>
                {k.proximaCalibracao ? (
                  <>
                    {dataCurta(k.proximaCalibracao)}
                    <span className="ml-1.5 text-xs text-muted">
                      {k.proximaNoCertificado ? '(sai no certificado)' : '(só lembrete interno)'}
                    </span>
                  </>
                ) : null}
              </Dado>
            </dl>
          </Card>

          <Card>
            <CardHeader icone={<Building2 className="h-4 w-4" />} titulo="Cliente" />
            <div className="px-5 pb-5 text-sm">
              {cliente ? (
                <Link
                  to={`/clientes/${cliente.id}`}
                  className="group block rounded-xl border border-line px-4 py-3 transition-colors hover:bg-surface-2/60"
                >
                  <p className="font-medium text-ink group-hover:text-brand-ink">{cliente.nome}</p>
                  {cliente.razaoSocial && cliente.razaoSocial !== cliente.nome && (
                    <p className="text-[13px] text-ink-2">{cliente.razaoSocial}</p>
                  )}
                  <p className="tnum mt-0.5 text-[13px] text-muted">{cliente.documento}</p>
                </Link>
              ) : (
                <p className="text-muted">—</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icone={<Scale className="h-4 w-4" />} titulo="Balança" />
            <div className="px-5 pb-5 text-sm">
              {balanca ? (
                <Link
                  to={`/balancas/${balanca.id}`}
                  className="group block rounded-xl border border-line px-4 py-3 transition-colors hover:bg-surface-2/60"
                >
                  <p className="font-medium text-ink group-hover:text-brand-ink">
                    {[balanca.fabricante, balanca.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[balanca.tipo]}
                  </p>
                  <p className="tnum text-[13px] text-ink-2">{capacidadeTexto(balanca)}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {[
                      balanca.numeroSerie && `Série ${balanca.numeroSerie}`,
                      balanca.identificacao && `Id. ${balanca.identificacao}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sem número de série'}
                  </p>
                </Link>
              ) : (
                <p className="text-muted">—</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icone={<Weight className="h-4 w-4" />} titulo="Padrões utilizados" />
            <ul className="flex flex-col gap-2 px-5 pb-5 text-sm">
              {padroes.length === 0 && <li className="text-muted">—</li>}
              {padroes.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-ink-2">
                    <span className="font-medium text-ink">{p.identificacao}</span> {p.descricao}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{p.certificado ? `Cert. ${p.certificado}` : ''}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              icone={<Mail className="h-4 w-4" />}
              titulo="Envios por e-mail"
              acoes={
                emitido ? (
                  <Button
                    tamanho="sm"
                    variante="ghost"
                    icone={<Send className="h-3.5 w-3.5" />}
                    onClick={() => setEnviando(true)}
                  >
                    Enviar
                  </Button>
                ) : undefined
              }
            />
            {envios.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted">Este certificado ainda não foi enviado por e-mail.</p>
            ) : (
              <ol className="flex flex-col px-5 pb-4">
                {envios.map((e) => (
                  <li key={e.id} className="flex gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 text-[13px]">
                      <p className="truncate font-medium text-ink" title={e.para}>
                        {e.para}
                      </p>
                      <p className="text-muted">
                        {dataHora(e.em)} · {e.usuarioNome}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {k.anotacoesInternas && (
            <Card>
              <CardHeader
                icone={<StickyNote className="h-4 w-4" />}
                titulo="Anotações internas"
                descricao="Não saem no certificado"
              />
              <p className="px-5 pb-5 text-sm whitespace-pre-line text-ink-2">{k.anotacoesInternas}</p>
            </Card>
          )}
        </div>
      </div>

      <EnviarCertificadoModal
        aberto={enviando}
        aoFechar={() => setEnviando(false)}
        calibracao={k}
        cliente={cliente}
        balanca={balanca}
      />
      <MotivoModal
        pedido={pedido}
        numero={k.numero}
        aoFechar={() => setPedido(null)}
        aoConfirmar={async (motivo) => {
          try {
            if (pedido === 'revisar') {
              const r = await api.revisar(k.id, motivo)
              useTempoReal.getState().mudou('calibracao')
              toast.sucesso('Revisão criada', 'Corrija o que for preciso e emita: o número ganha o sufixo de revisão.')
              navegar(`/calibracoes/${r.calibracao.id}/editar`)
            } else {
              await api.cancelar(k.id, motivo, k.versao)
              useTempoReal.getState().mudou('calibracao')
              toast.sucesso('Certificado cancelado')
            }
            setPedido(null)
          } catch (e) {
            avisarErro(pedido === 'revisar' ? 'Não foi possível criar a revisão' : 'Não foi possível cancelar', e)
          }
        }}
      />
    </div>
  )
}

/** Imprime o PDF sem sair da tela (num quadro escondido); se o navegador bloquear, abre numa aba. */
function imprimir(url: string) {
  const quadro = document.createElement('iframe')
  quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  quadro.src = url
  quadro.onload = () => {
    try {
      quadro.contentWindow?.focus()
      quadro.contentWindow?.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
    setTimeout(() => quadro.remove(), 60_000)
  }
  document.body.appendChild(quadro)
}

function CartaoEmissao({ k }: { k: Calibracao }) {
  const emissao = k.emissao!
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(emissao.hashPdf)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      toast.info('Não foi possível copiar', 'Selecione o código e copie com Ctrl+C.')
    }
  }
  return (
    <Card className="overflow-hidden">
      <div className="relative isolate overflow-hidden bg-brand px-5 py-4 text-on-brand">
        <ShieldCheck className="absolute -top-3 -right-3 -z-10 h-24 w-24 opacity-15" />
        <p className="text-xs font-medium opacity-85">Certificado emitido</p>
        <p className="tnum mt-0.5 text-[24px] leading-tight font-semibold">{k.numero}</p>
        <p className="mt-1 text-xs opacity-85">
          Em {dataHora(emissao.emitidoEm)} por {emissao.emitidoPor}
        </p>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Fingerprint className="h-3.5 w-3.5" />
            Impressão digital do PDF (SHA-256)
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-[11.5px] text-ink-2"
              title={emissao.hashPdf}
            >
              {emissao.hashPdf}
            </code>
            <Button tamanho="icon-sm" variante="ghost" onClick={copiar} aria-label="Copiar">
              {copiado ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted">Confere se um arquivo PDF é exatamente o que foi emitido pelo sistema.</p>
      </div>
    </Card>
  )
}

function Resultados({ k, dados }: { k: Calibracao; dados: DetalheCalibracao }) {
  const { balanca, padroes } = dados
  const calc = useMemo(() => (balanca ? calcularCalibracao(k, balanca, padroes) : null), [k, balanca, padroes])
  const r = calc?.resultado
  if (!balanca || !r || r.pontos.length === 0) return null
  const casas = casasDe(balanca)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icone={<CalendarCheck className="h-4 w-4" />}
        titulo="Resultados"
        descricao={k.ajuste.realizado === 'NAO' ? 'Sem ajuste' : 'Depois do ajuste'}
        acoes={
          k.conformidade.solicitada && r.conformidade ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                r.conformidade === 'CONFORME' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
              )}
            >
              {r.conformidade === 'CONFORME' ? 'Conforme' : 'Não conforme'}
            </span>
          ) : undefined
        }
      />
      <div className="px-3 pb-2">
        <GraficoErro resultado={r} unidade={balanca.unidade} casas={casas} altura={220} />
      </div>
      <div className="scroll-fino overflow-x-auto border-t border-line">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-surface-2/70 text-left text-xs whitespace-nowrap text-muted">
              <th className="px-5 py-2.5 font-medium">Carga ({balanca.unidade})</th>
              <th className="px-3 py-2.5 text-right font-medium">Indicação</th>
              <th className="px-3 py-2.5 text-right font-medium">Erro</th>
              <th className="px-3 py-2.5 text-right font-medium">U</th>
              <th className="px-3 py-2.5 text-right font-medium">k</th>
              <th className="px-5 py-2.5 text-right font-medium">νeff</th>
            </tr>
          </thead>
          <tbody>
            {r.pontos.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="tnum px-5 py-2 text-ink">{p.texto.carga}</td>
                <td className="tnum px-3 py-2 text-right text-ink-2">
                  {[p.texto.crescente, p.texto.decrescente].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="tnum px-3 py-2 text-right text-ink">
                  {k.opcoes.histerese === 'MEDIA' && p.texto.erroMedio
                    ? p.texto.erroMedio
                    : [p.texto.erroCrescente, p.texto.erroDecrescente].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="tnum px-3 py-2 text-right text-ink">{p.texto.U || '—'}</td>
                <td className="tnum px-3 py-2 text-right text-ink-2">{p.texto.k || '—'}</td>
                <td className="tnum px-5 py-2 text-right text-ink-2">{p.texto.nuEff || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function MotivoModal({
  pedido,
  numero,
  aoFechar,
  aoConfirmar,
}: {
  pedido: 'revisar' | 'cancelar' | null
  numero: string
  aoFechar: () => void
  aoConfirmar: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [ultimo, setUltimo] = useState(pedido)
  // Guarda o último pedido para o texto não sumir durante a animação de saída
  if (pedido && pedido !== ultimo) {
    setUltimo(pedido)
    setMotivo('')
  }
  const tipo = pedido ?? ultimo
  const revisar = tipo === 'revisar'
  const valido = motivo.trim().length >= 5
  return (
    <Modal
      aberto={!!pedido}
      aoFechar={() => !salvando && aoFechar()}
      titulo={revisar ? 'Corrigir o certificado' : `Cancelar o certificado ${numero}?`}
      descricao={
        revisar
          ? `Abre uma revisão com os mesmos dados. Ao ser emitida, ela substitui o nº ${numero} e informa o motivo.`
          : 'O certificado continua guardado no sistema, com a marca “cancelado”, e não pode mais ser enviado.'
      }
      icone={revisar ? <FilePen className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
      rodape={
        <>
          <Button onClick={aoFechar} disabled={salvando}>
            Voltar
          </Button>
          <Button
            variante={revisar ? 'primary' : 'danger'}
            disabled={!valido || salvando}
            icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            onClick={async () => {
              setSalvando(true)
              try {
                await aoConfirmar(motivo.trim())
              } finally {
                setSalvando(false)
              }
            }}
          >
            {revisar ? 'Abrir revisão' : 'Cancelar certificado'}
          </Button>
        </>
      }
    >
      <Field
        label={revisar ? 'O que será corrigido' : 'Motivo do cancelamento'}
        hint={
          revisar ? 'Sai no certificado novo. Ex.: “Correção do número de série da balança”.' : 'Fica registrado no histórico.'
        }
      >
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} autoFocus />
      </Field>
    </Modal>
  )
}

function Faixa({
  tom,
  icone,
  children,
}: {
  tom: 'danger' | 'info' | 'warning' | 'neutro'
  icone: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[13.5px]',
        tom === 'danger' && 'bg-danger-soft text-danger',
        tom === 'info' && 'bg-info-soft text-info',
        tom === 'warning' && 'bg-warning-soft text-warning',
        tom === 'neutro' && 'border border-line bg-surface text-ink-2',
      )}
    >
      <span className="mt-0.5 shrink-0">{icone}</span>
      <p className="min-w-0">{children}</p>
    </div>
  )
}

function Dado({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={cn('min-w-0', largo && 'col-span-2')}>
      <dt className="text-xs font-medium text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-ink">{children || <span className="text-muted">—</span>}</dd>
    </div>
  )
}

function Carregando() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 w-80 animate-pulse rounded-2xl bg-surface-2" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[70vh] animate-pulse rounded-2xl bg-surface-2" />
        <div className="flex flex-col gap-6">
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
          <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
        </div>
      </div>
    </div>
  )
}
