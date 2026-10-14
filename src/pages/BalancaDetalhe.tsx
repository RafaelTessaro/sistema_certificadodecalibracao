import {
  ArrowLeft,
  BellRing,
  Building2,
  CalendarCheck,
  FileBadge2,
  FilePlus2,
  Gauge,
  MapPin,
  Monitor,
  Pencil,
  Ruler,
  Scale,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  capacidadeTexto,
  divisaoLegivel,
  FINALIDADES,
  numeroBr,
  RECEPTORES,
  ROTULO_CLASSE,
  TIPOS_BALANCA,
  TIPOS_FAIXAS,
} from '#shared/dominio.ts'
import { posicoesExcentricidade } from '#shared/metrologia/index.ts'
import type { ClasseExatidao, Faixa, Unidade } from '#shared/tipos.ts'
import { BalancaFormModal } from '../components/BalancaFormModal'
import { CertificadosTabela } from '../components/CertificadosTabela'
import { PrazoBadge } from '../components/Selos'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { confirmar } from '../components/ui/Feedback'
import { EmptyState, PageHeader, StatCard } from '../components/ui/Misc'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { dataCurta } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { Dado } from './ClienteDetalhe'

/** Valor com unidade, convertendo divisões pequenas para uma unidade mais legível (0,005 kg → 5 g). */
function divisao(v: number, unidade: Unidade) {
  const r = divisaoLegivel([v], unidade)
  return `${numeroBr(r.valores[0])} ${r.unidade}`
}

const nValor = (f: Faixa) => (f.e > 0 ? numeroBr(f.max / f.e, 0) : '—')

const NOME_CLASSE: Record<ClasseExatidao, string> = {
  I: 'Especial (laboratório)',
  II: 'Fina (precisão)',
  III: 'Média (comércio e indústria)',
  IIII: 'Ordinária',
  '': 'Não marcada na plaqueta',
}

export function BalancaDetalhe() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const podeExcluir = usePode('excluirBalanca')
  const [editando, setEditando] = useState(false)
  const { dados, carregando, erro } = useConsulta(`balanca-detalhe:${id}`, () => api.balanca(id), [
    'balanca',
    'cliente',
    'calibracao',
  ])
  const { dados: diasAviso = 30 } = useConsulta(
    'config:diasAviso',
    () => api.config().then((r) => r.config.diasAvisoVencimento),
    ['config'],
  )
  const balanca = dados?.balanca
  const cliente = dados?.cliente
  const calibracoes = useMemo(() => dados?.calibracoes ?? [], [dados])
  const emitidos = useMemo(
    () =>
      calibracoes
        .filter((k) => k.status === 'EMITIDO')
        .sort((a, b) => b.dataCalibracao.localeCompare(a.dataCalibracao) || b.dataEmissao.localeCompare(a.dataEmissao)),
    [calibracoes],
  )

  if (carregando) return <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
  if (!balanca)
    return (
      <EmptyState
        icone={<Scale className="h-6 w-6" />}
        titulo="Balança não encontrada"
        descricao={erro || 'Ela pode ter sido excluída.'}
        acao={<Button onClick={() => navegar('/balancas')}>Voltar para balanças</Button>}
      />
    )

  const nome = [balanca.fabricante, balanca.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[balanca.tipo]
  const ultima = emitidos[0]
  const proxima = ultima?.proximaCalibracao ?? ''
  const novaCalibracao = () => navegar(`/calibracoes/nova?balanca=${balanca.id}`)

  const excluir = async () => {
    const ok = await confirmar({
      titulo: `Excluir ${nome}?`,
      descricao: 'Esta ação não pode ser desfeita. Balanças com calibrações não podem ser excluídas (desative-as na edição).',
      confirmar: 'Excluir balança',
      perigo: true,
    })
    if (!ok) return
    try {
      await api.excluirBalanca(balanca.id)
      useTempoReal.getState().mudou('balanca')
      toast.sucesso('Balança excluída')
      navegar('/balancas', { replace: true })
    } catch (e) {
      avisarErro('Não foi possível excluir', e)
    }
  }

  const faixas = balanca.faixas
  const multi = faixas.length > 1
  const posicoes = posicoesExcentricidade(balanca.receptor, balanca.apoios)
  const temIndicador = !!(balanca.indicadorFabricante || balanca.indicadorModelo || balanca.indicadorSerie)

  return (
    <>
      <PageHeader
        voltar={
          <button
            type="button"
            onClick={() => navegar('/balancas')}
            className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" /> Balanças
          </button>
        }
        titulo={
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
              <Scale className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">{nome}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-normal tracking-normal text-muted">
                <Badge tom="neutral" ponto={false}>
                  {TIPOS_BALANCA[balanca.tipo]}
                </Badge>
                {!balanca.ativo && <Badge tom="neutral">Desativada</Badge>}
                {cliente && (
                  <button
                    type="button"
                    onClick={() => navegar(`/clientes/${cliente.id}`)}
                    className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-brand-ink hover:underline"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {cliente.nome}
                  </button>
                )}
                {balanca.numeroSerie && <span className="tnum">Série {balanca.numeroSerie}</span>}
                {balanca.identificacao && <span className="tnum">{balanca.identificacao}</span>}
              </span>
            </span>
          </span>
        }
        acoes={
          <>
            {podeExcluir && (
              <Button variante="ghost" icone={<Trash2 className="h-4 w-4" />} onClick={() => void excluir()}>
                Excluir
              </Button>
            )}
            <Button icone={<Pencil className="h-4 w-4" />} onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              variante="primary"
              icone={<FilePlus2 className="h-4 w-4" />}
              onClick={novaCalibracao}
              disabled={!balanca.ativo}
              title={balanca.ativo ? undefined : 'Balança desativada: reative em Editar para calibrar'}
            >
              Nova calibração
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          key={`c-${capacidadeTexto(balanca)}`}
          rotulo="Capacidade"
          valor={0}
          formatar={() => capacidadeTexto(balanca) || '—'}
          icone={<Scale className="h-4 w-4" />}
          detalhe={
            <span className="tnum">
              n = {faixas.map(nValor).join('/')}
              {balanca.min > 0 && ` · Min ${numeroBr(balanca.min)} ${balanca.unidade}`}
            </span>
          }
          destaque
        />
        <StatCard
          key={`k-${balanca.classe}`}
          rotulo="Classe de exatidão"
          valor={0}
          formatar={() => (balanca.classe ? `Classe ${balanca.classe}` : 'Sem classe')}
          icone={<Gauge className="h-4 w-4" />}
          detalhe={NOME_CLASSE[balanca.classe]}
          delay={0.04}
        />
        <StatCard
          key={`u-${ultima?.id ?? ''}`}
          rotulo="Última calibração"
          valor={0}
          formatar={() => (ultima ? dataCurta(ultima.dataCalibracao) : '—')}
          icone={<CalendarCheck className="h-4 w-4" />}
          detalhe={ultima ? <span className="tnum">Certificado {ultima.numero}</span> : 'Ainda não calibrada'}
          delay={0.08}
        />
        <StatCard
          key={`p-${proxima}`}
          rotulo="Próxima calibração"
          valor={0}
          formatar={() => (proxima ? dataCurta(proxima) : '—')}
          icone={<BellRing className="h-4 w-4" />}
          detalhe={proxima ? <PrazoBadge data={proxima} diasAviso={diasAviso} /> : 'Sem data combinada'}
          delay={0.12}
        />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            icone={<Ruler className="h-4 w-4" />}
            titulo="Características"
            descricao="Dados da plaqueta, como saem no certificado"
            acoes={
              <Button tamanho="sm" variante="ghost" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(true)}>
                Editar
              </Button>
            }
          />
          <div className="space-y-6 px-5 pb-5">
            {/* Faixas de pesagem: o coração da balança */}
            {multi ? (
              <div className="overflow-hidden rounded-xl border border-line">
                <p className="border-b border-line bg-surface-2/70 px-4 py-2 text-[12px] font-medium text-muted">
                  {TIPOS_FAIXAS[balanca.tipoFaixas]}
                </p>
                <div className="scroll-fino overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[12px] text-muted">
                        <th className="px-4 py-2 text-left font-medium">
                          {balanca.tipoFaixas === 'MULTI_INTERVALO' ? 'Intervalo' : 'Faixa'}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">Capacidade (Max)</th>
                        <th className="px-4 py-2 text-right font-medium">Divisão (d)</th>
                        <th className="px-4 py-2 text-right font-medium">Verificação (e)</th>
                        <th className="px-4 py-2 text-right font-medium">n = Max/e</th>
                      </tr>
                    </thead>
                    <tbody className="tnum">
                      {faixas.map((f, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-4 py-2.5">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold text-brand-ink">
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-ink">
                            {numeroBr(f.max)} {balanca.unidade}
                          </td>
                          <td className="px-4 py-2.5 text-right text-ink-2">{divisao(f.d, balanca.unidade)}</td>
                          <td className="px-4 py-2.5 text-right text-ink-2">{divisao(f.e, balanca.unidade)}</td>
                          <td className="px-4 py-2.5 text-right text-ink-2">{nValor(f)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              faixas[0] && (
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                  <Medida rotulo="Capacidade máxima (Max)" destaque>
                    {numeroBr(faixas[0].max)} {balanca.unidade}
                  </Medida>
                  <Medida rotulo="Divisão (d)">{divisao(faixas[0].d, balanca.unidade)}</Medida>
                  <Medida rotulo="Divisão de verificação (e)">{divisao(faixas[0].e, balanca.unidade)}</Medida>
                  <Medida rotulo="Divisões (n = Max/e)">{nValor(faixas[0])}</Medida>
                </dl>
              )
            )}

            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-3">
              <Grupo titulo="Identificação">
                <Dado rotulo="Fabricante e modelo">{[balanca.fabricante, balanca.modelo].filter(Boolean).join(' · ')}</Dado>
                <Dado rotulo="Nº de série">{balanca.numeroSerie && <span className="tnum">{balanca.numeroSerie}</span>}</Dado>
                <Dado rotulo="Identificação no cliente">
                  {balanca.identificacao && <span className="tnum">{balanca.identificacao}</span>}
                </Dado>
                <Dado rotulo="Ano de fabricação">
                  {balanca.anoFabricacao && <span className="tnum">{balanca.anoFabricacao}</span>}
                </Dado>
                <Dado rotulo="Para que é usada">{balanca.finalidade ? FINALIDADES[balanca.finalidade] : ''}</Dado>
                <Dado rotulo="Local de instalação" icone={<MapPin className="h-3.5 w-3.5" />}>
                  {balanca.localInstalacao}
                </Dado>
              </Grupo>

              <Grupo titulo="Metrologia">
                <Dado rotulo="Classe de exatidão">{ROTULO_CLASSE[balanca.classe]}</Dado>
                <Dado rotulo="Carga mínima (Min)">
                  {balanca.min > 0 && (
                    <span className="tnum">
                      {numeroBr(balanca.min)} {balanca.unidade}
                    </span>
                  )}
                </Dado>
                <Dado rotulo="Faixas de pesagem">{TIPOS_FAIXAS[balanca.tipoFaixas]}</Dado>
                <Dado rotulo="Unidade">{balanca.unidade}</Dado>
                <Dado rotulo="Portaria de aprovação de modelo">{balanca.portariaAprovacao}</Dado>
              </Grupo>

              <Grupo titulo="Receptor de carga">
                <Dado rotulo="Formato">{RECEPTORES[balanca.receptor]}</Dado>
                {(balanca.receptor === 'APOIOS' || balanca.receptor === 'RODOVIARIA' || balanca.receptor === 'TANQUE') && (
                  <Dado rotulo="Apoios (células de carga)">
                    {balanca.apoios > 0 && <span className="tnum">{balanca.apoios}</span>}
                  </Dado>
                )}
                <Dado rotulo="Dimensões">{balanca.dimensoes}</Dado>
                <Dado rotulo="Excentricidade">
                  {posicoes.length ? (
                    <span className="flex flex-wrap gap-1">
                      {posicoes.map((p) => (
                        <span key={p} className="rounded-md border border-line bg-surface-2/60 px-1.5 py-px text-xs text-ink-2">
                          {p}
                        </span>
                      ))}
                    </span>
                  ) : (
                    'Não se aplica (balança suspensa)'
                  )}
                </Dado>
                {temIndicador && (
                  <Dado rotulo="Indicador separado" icone={<Monitor className="h-3.5 w-3.5" />}>
                    {[balanca.indicadorFabricante, balanca.indicadorModelo].filter(Boolean).join(' ')}
                    {balanca.indicadorSerie && (
                      <span className="tnum block text-xs text-muted">Série {balanca.indicadorSerie}</span>
                    )}
                  </Dado>
                )}
              </Grupo>
            </div>

            {balanca.observacoes && (
              <div className="rounded-xl bg-surface-2/60 px-4 py-3">
                <p className="text-xs font-medium text-muted">Observações</p>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{balanca.observacoes}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            icone={<FileBadge2 className="h-4 w-4" />}
            titulo="Histórico de calibrações"
            descricao={
              calibracoes.length
                ? `${calibracoes.length} ${calibracoes.length === 1 ? 'calibração' : 'calibrações'} · ${emitidos.length} ${emitidos.length === 1 ? 'certificado emitido' : 'certificados emitidos'}`
                : 'Nenhuma calibração ainda'
            }
            acoes={
              calibracoes.length > 0 &&
              balanca.ativo && (
                <Button tamanho="sm" icone={<FilePlus2 className="h-3.5 w-3.5" />} onClick={novaCalibracao}>
                  Nova calibração
                </Button>
              )
            }
          />
          {calibracoes.length ? (
            <div className="border-t border-line">
              <CertificadosTabela itens={calibracoes} ocultarCliente ocultarBalanca />
            </div>
          ) : (
            <EmptyState
              icone={<FileBadge2 className="h-6 w-6" />}
              titulo="Nenhuma calibração desta balança"
              descricao="Comece a primeira calibração: os dados da balança já vêm preenchidos."
              acao={
                balanca.ativo && (
                  <Button variante="primary" icone={<FilePlus2 className="h-4 w-4" />} onClick={novaCalibracao}>
                    Nova calibração
                  </Button>
                )
              }
            />
          )}
          {emitidos.length >= 2 && (
            <div className="flex items-start gap-3 border-t border-line bg-surface-2/50 px-5 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                <TrendingUp className="h-4 w-4" />
              </span>
              <p className="text-[13px] text-ink-2">
                <b className="font-medium text-ink">Acompanhe a tendência.</b> Com {emitidos.length} certificados emitidos, dá
                para comparar os erros de uma calibração para a outra. Se o erro cresce a cada ano, a balança pode precisar de
                manutenção antes de sair do limite.
              </p>
            </div>
          )}
        </Card>
      </div>

      <BalancaFormModal aberto={editando} balanca={balanca} aoFechar={() => setEditando(false)} />
    </>
  )
}

/** Bloco de dados com subtítulo discreto (lista de definições). */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo}>
      <h4 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{titulo}</h4>
      <dl className="flex flex-col gap-3.5 text-sm">{children}</dl>
    </section>
  )
}

/** Medida em destaque (Max, d, e, n), com número tabular. */
function Medida({ rotulo, children, destaque }: { rotulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className={cn('tnum mt-1 text-lg font-semibold tracking-[-0.01em]', destaque ? 'text-brand-ink' : 'text-ink')}>
        {children}
      </dd>
    </div>
  )
}
