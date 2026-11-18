// "Registro de campo" (1.1.0): a folha FOR-CAL-01 como voltou do celular, nos 8 passos, com cada leitura como foi digitada
// e a hora do celular; as anotações, os avisos vistos no local com a escolha do técnico, as correções antes e depois da
// assinatura, os ensaios recomeçados (só consulta), o desfecho, as assinaturas, o aparelho e as marcas. "Baixar a folha
// impressa assinada" (o PDF gerado na hora). O órfão (envio que o sistema não conhece): "Ligar à folha…" e "Descartar".
// O nº da folha identifica o registro: não há código de conferência (o sha256 é interno e nunca aparece).

import {
  ArrowDownToLine,
  Ban,
  ClipboardList,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  PenLine,
  Scale,
  TriangleAlert,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { balancaDoCampo } from '#shared/campo/importar.ts'
import { numeroDaFolha } from '#shared/folhaCampo.ts'
import { textoRelogioDiferente } from '#shared/campo/protocolo.ts'
import { formatarInstante, partesDoInstante, textoDoPeriodo, tipoAssinaturaCliente } from '#shared/campo/registro.ts'
import {
  type LeituraCampo,
  type RegistroCampo,
  ROTULO_TIPO_ANOTACAO,
  TITULOS_PASSOS,
  type ChavePasso,
  PASSOS_FOLHA,
} from '#shared/campo/tipos.ts'
import { LOCAIS } from '#shared/dominio.ts'
import type { Balanca, RegistroCampoDetalhe } from '#shared/tipos.ts'
import { BalancaFormModal } from '../BalancaFormModal'
import { api, ErroApi } from '../../lib/api'
import { celularDe, MARCA_REGISTRO, quando, rotuloDoCampo, rotuloDoDesfecho, selosDasMarcas } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { dataHora } from '../../lib/format'
import { useTempoReal } from '../../store/tempoReal'
import { avisarErro, toast } from '../../store/ui'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Form'
import { Modal } from '../ui/Modal'

const lista = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])
const hora = (v: unknown) => partesDoInstante(v)?.hora ?? ''

export function RegistroCampoModal({
  registroId,
  aoFechar,
  calibracaoAtual,
}: {
  registroId: string | null
  aoFechar: () => void
  /** Aberto de dentro desta calibração: sem o "Abrir a calibração" dela. */
  calibracaoAtual?: string
}) {
  const [d, setD] = useState<RegistroCampoDetalhe | null>(null)
  // O erro é do registro pedido (outro registro aberto depois não mostra o erro do anterior)
  const [falha, setFalha] = useState<{ id: string; mensagem: string } | null>(null)
  const [rodada, setRodada] = useState(0)
  useEffect(() => {
    if (!registroId) return
    let valendo = true
    api.registroCampo(registroId).then(
      (r) => valendo && setD(r),
      (e: unknown) => valendo && setFalha({ id: registroId, mensagem: e instanceof Error ? e.message : 'Erro inesperado.' }),
    )
    return () => {
      valendo = false
    }
  }, [registroId, rodada])
  const atual = d && d.registro.id === registroId ? d : null
  const erro = !atual && falha?.id === registroId ? falha.mensagem : ''
  const numero = atual ? atual.registro.ligadoA || atual.registro.numero : ''
  return (
    <Modal
      aberto={!!registroId}
      aoFechar={aoFechar}
      largura="max-w-4xl"
      icone={<ClipboardList className="h-5 w-5" />}
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          Registro de campo
          {numero && <span className="tnum font-medium whitespace-nowrap text-ink-2">{numero}</span>}
        </span>
      }
      descricao={
        atual
          ? `Voltou do ${celularDe(atual.registro.tecnico)} ${quando(atual.registro.recebidoEm)}${
              atual.registro.celular ? ` · ${atual.registro.celular}` : ''
            }`
          : 'Carregando…'
      }
    >
      {erro ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{erro}</p>
      ) : !atual ? (
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o registro…
        </div>
      ) : (
        <Detalhe d={atual} aoMudar={() => setRodada((n) => n + 1)} aoFechar={aoFechar} calibracaoAtual={calibracaoAtual} />
      )}
    </Modal>
  )
}

function Detalhe({
  d,
  aoMudar,
  aoFechar,
  calibracaoAtual,
}: {
  d: RegistroCampoDetalhe
  aoMudar: () => void
  aoFechar: () => void
  calibracaoAtual?: string
}) {
  const { registro: meta, conteudo: r } = d
  const p = r.passos
  const selos = selosDasMarcas(meta.marcas, meta.desfecho)
  const orfao = meta.marcas.includes('ORFAO') && !meta.ligadoA
  const descartado = meta.situacao === 'DESCARTADO'
  /** "Ligar à folha…" ou "Descartar" aberto (o formulário com o motivo, abaixo do alto). */
  const [acao, setAcao] = useState<'' | 'ligar' | 'descartar'>('')
  const podeAgir = !descartado && (orfao || meta.situacao === 'VALIDO')
  return (
    <div className="flex flex-col gap-5">
      {/* Situação, marcas e ações */}
      <div className="flex flex-wrap items-center gap-2">
        {descartado ? (
          <Badge tom="danger">Descartado</Badge>
        ) : meta.situacao === 'SUPERADO' ? (
          <Badge tom="neutral">Substituído por uma versão mais nova</Badge>
        ) : (
          <Badge tom="success">Vale</Badge>
        )}
        {selos.map((s) => (
          <span key={s.rotulo} title={s.dica}>
            <Badge tom={s.tom} ponto={false}>
              {s.rotulo}
            </Badge>
          </span>
        ))}
        <a
          href={api.urlPdfRegistroCampo(meta.id)}
          target="_blank"
          rel="noopener"
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong/80 bg-surface px-3 text-[13px] font-medium text-ink shadow-xs transition-colors hover:bg-surface-2"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar a folha impressa assinada
        </a>
        {podeAgir && !acao && !orfao && (
          <Button tamanho="sm" variante="ghost" icone={<Ban className="h-3.5 w-3.5" />} onClick={() => setAcao('descartar')}>
            Descartar
          </Button>
        )}
      </div>

      {descartado && meta.situacaoMotivo && (
        <Faixa tom="danger" icone={<Ban className="h-4 w-4" />}>
          Descartado por {meta.situacaoPor} em {dataHora(meta.situacaoEm)}: {meta.situacaoMotivo}
        </Faixa>
      )}
      {meta.marcas.includes('RELOGIO') && meta.relogioDiferencaS !== null && (
        <Faixa tom="warning" icone={<TriangleAlert className="h-4 w-4" />}>
          {textoRelogioDiferente(meta.relogioDiferencaS * 1000)}
        </Faixa>
      )}
      {meta.problemas.length > 0 && (
        <Faixa tom="danger" icone={<TriangleAlert className="h-4 w-4" />}>
          <span className="block font-semibold">{MARCA_REGISTRO.FORMATO.dica}</span>
          <ul className="mt-1 list-disc pl-5">
            {meta.problemas.slice(0, 20).map((x, i) => (
              <li key={i}>{x.mensagem}</li>
            ))}
          </ul>
        </Faixa>
      )}
      {r.desfecho && r.desfecho !== 'COMPLETA' && (
        <Faixa tom="warning" icone={<TriangleAlert className="h-4 w-4" />}>
          {/* O registro com a marca FORMATO pode trazer um desfecho fora da lista: aparece como veio, sem quebrar a tela */}
          <b className="font-semibold">Encerrada sem completar ({rotuloDoDesfecho(r.desfecho).toLowerCase()}).</b>{' '}
          {r.motivoDesfecho}
        </Faixa>
      )}

      {!descartado && meta.situacao === 'VALIDO' && !orfao && !(calibracaoAtual && d.envio?.calibracaoId === calibracaoAtual) && (
        <UsarNaCalibracao d={d} aoFechar={aoFechar} />
      )}
      {podeAgir && (orfao || acao) && <AcoesDoRegistro d={d} orfao={orfao} modo={acao} setModo={setAcao} aoMudar={aoMudar} />}

      {/* Identificação */}
      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-2/60 p-4 text-[13px] sm:grid-cols-4">
        <Dado rotulo="Técnico">{r.tecnico?.nome || meta.tecnico || '—'}</Dado>
        <Dado rotulo="Aparelho">
          {[r.aparelho?.modelo, r.aparelho?.versaoApp && `app ${r.aparelho.versaoApp}`].filter(Boolean).join(' · ') || '—'}
        </Dado>
        <Dado rotulo="No cliente">{textoDoPeriodo(p?.chegada?.inicio, p?.final?.termino) || '—'}</Dado>
        <Dado rotulo="Recebido pelo servidor">{dataHora(meta.recebidoEm)}</Dado>
      </dl>

      <Passo chave="padroes">
        <ul className="flex flex-wrap gap-1.5">
          {lista(p?.padroes).map((x) => (
            <li key={x.id}>
              <Badge tom={x.usado ? 'brand' : 'neutral'} ponto={false}>
                {x.identificacao}
                {x.usado ? ' · usado' : x.levado ? ' · levado' : ' · não levado'}
                {x.outro ? ' (outro)' : ''}
              </Badge>
            </li>
          ))}
          {!lista(p?.padroes).length && <li className="text-[13px] text-muted">Nenhum padrão marcado.</li>}
        </ul>
      </Passo>

      <Passo chave="chegada">
        <Conferencias itens={lista(p?.chegada?.conferencias)} />
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          <Dado rotulo="Início">{formatarInstante(p?.chegada?.inicio) || '—'}</Dado>
          <Dado rotulo="Local">{p?.chegada?.local ? LOCAIS[p.chegada.local] : '—'}</Dado>
          {p?.chegada?.os && <Dado rotulo="OS escrita no local">{p.chegada.os}</Dado>}
          {p?.chegada?.localEndereco && <Dado rotulo="Endereço">{p.chegada.localEndereco}</Dado>}
        </dl>
        {p?.chegada?.clienteInformado && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
            <Dado rotulo="Cliente informado">{p.chegada.clienteInformado.razaoSocial || '—'}</Dado>
            <Dado rotulo="CNPJ/CPF">{p.chegada.clienteInformado.documento || '—'}</Dado>
            <Dado rotulo="Contato">{p.chegada.clienteInformado.contato || '—'}</Dado>
          </dl>
        )}
      </Passo>

      <Passo chave="balanca">
        {p?.balanca?.informada ? (
          <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
            <Dado rotulo="Tipo">{p.balanca.informada.tipo || '—'}</Dado>
            <Dado rotulo="Fabricante / modelo">
              {[p.balanca.informada.fabricante, p.balanca.informada.modelo].filter(Boolean).join(' ') || '—'}
            </Dado>
            <Dado rotulo="Nº de série">{p.balanca.informada.numeroSerie || '—'}</Dado>
            <Dado rotulo="Classe">{p.balanca.informada.classe || 'não marcada'}</Dado>
            <Dado rotulo="Faixas">
              {lista(p.balanca.informada.faixas)
                .map((f) => [f.max && `Max ${f.max}`, f.e && `e ${f.e}`, f.d && `d ${f.d}`].filter(Boolean).join(' · '))
                .filter(Boolean)
                .join(' / ') || '—'}{' '}
              {p.balanca.informada.unidade}
            </Dado>
            <Dado rotulo="Min">{p.balanca.informada.min || '—'}</Dado>
            <Dado rotulo="Identificação">{p.balanca.informada.identificacao || '—'}</Dado>
            <Dado rotulo="Local de instalação">{p.balanca.informada.localInstalacao || '—'}</Dado>
          </dl>
        ) : (
          <Conferencias itens={lista(p?.balanca?.conferencias)} />
        )}
      </Passo>

      <Passo chave="ambiente">
        <TabelaSimples
          cabecalho={['', 'Hora', 'Temperatura (°C)', 'Umidade (%)', 'Pressão (hPa)']}
          linhas={lista(p?.ambiente?.linhas).map((l) => [
            { INICIO: 'Início', INICIO_REPETIDA: 'Início (repetido)', FIM: 'Fim' }[l.momento] ?? l.momento,
            hora(l.em) || '—',
            <Leitura key="t" l={l.temperatura} />,
            <Leitura key="u" l={l.umidade} />,
            <Leitura key="p" l={l.pressao} />,
          ])}
        />
        {lista(p?.ambiente?.deltaT).length > 0 && (
          <p className="mt-2 text-[13px] text-ink-2">
            ΔT pesos − ar:{' '}
            {lista(p?.ambiente?.deltaT).map((x, i) => (
              <span key={i} className="mr-2">
                <Leitura l={x.valor} />
              </span>
            ))}
          </p>
        )}
        {p?.ambiente?.pesosNoLocalDesde && (
          <p className="mt-1 text-[13px] text-ink-2">Pesos no local desde {formatarInstante(p.ambiente.pesosNoLocalDesde)}</p>
        )}
      </Passo>

      <Passo chave="indicacao">
        {p?.indicacao?.calInterno && (
          <p className="mb-2 text-[13px] text-ink-2">
            Ajuste interno (CAL): {p.indicacao.calInterno.feito ? `feito às ${hora(p.indicacao.calInterno.em)}` : 'não feito'}
          </p>
        )}
        <TabelaSimples
          cabecalho={['Carga', 'Subida', 'Descida', '']}
          linhas={lista(p?.indicacao?.pontos).map((pt) => [
            <span key="c" className="tnum">
              {pt.cargaAplicada?.valor || pt.cargaPrevista || '—'}
            </span>,
            <Leitura key="s" l={pt.crescente} />,
            <Leitura key="d" l={pt.decrescente} />,
            pt.acrescentado ? 'acrescentado no local' : pt.nivelSubstituicao ? `substituição ${pt.nivelSubstituicao}` : '',
          ])}
        />
        <p className="mt-2 text-[13px] text-ink-2">
          Retorno ao zero: <Leitura l={p?.indicacao?.retornoZero ?? null} />
        </p>
        {lista(p?.indicacao?.substituicao?.etapas).length > 0 && (
          <TabelaSimples
            className="mt-3"
            cabecalho={['Etapa', 'Com os pesos', 'Com a substituição', 'Material']}
            linhas={lista(p?.indicacao?.substituicao?.etapas).map((e, i) => [
              String(i + 1),
              <Leitura key="p" l={e.padroes} />,
              <Leitura key="s" l={e.substituicao} />,
              e.material || '—',
            ])}
          />
        )}
      </Passo>

      <Passo chave="repetibilidade">
        {lista(p?.repetibilidade).map((e) => (
          <div key={e.id} className="mb-2 last:mb-0">
            <p className="text-xs text-muted">Carga {e.cargaAplicada?.valor || e.cargaPrevista || '—'}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
              {lista(e.leituras).map((l, i) => (
                <Leitura key={i} l={l} />
              ))}
              {!lista(e.leituras).length && <span className="text-muted">Sem leituras.</span>}
            </p>
          </div>
        ))}
      </Passo>

      <Passo chave="excentricidade">
        {p?.excentricidade?.aplicavel === false ? (
          <p className="text-[13px] text-ink-2">Não feito: {p.excentricidade.motivo || '—'}</p>
        ) : (
          <>
            <p className="mb-1 text-xs text-muted">
              Carga {p?.excentricidade?.cargaAplicada?.valor || p?.excentricidade?.cargaPrevista || '—'}
            </p>
            <TabelaSimples
              cabecalho={['Posição', 'Zero antes', 'Indicação']}
              linhas={lista(p?.excentricidade?.posicoes).map((x) => [
                x.rotulo,
                <Leitura key="z" l={x.zeroAntes} />,
                <Leitura key="l" l={x.leitura} />,
              ])}
            />
          </>
        )}
      </Passo>

      <Passo chave="final">
        <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          <Dado rotulo="Data da calibração">
            {p?.final?.dataCalibracao ? p.final.dataCalibracao.split('-').reverse().join('/') : '—'}
          </Dado>
          <Dado rotulo="Término">{formatarInstante(p?.final?.termino) || '—'}</Dado>
        </dl>
        <Assinaturas r={r} />
      </Passo>

      {lista(r.anotacoes).length > 0 && (
        <Bloco titulo="Anotações">
          <ul className="flex flex-col gap-2">
            {lista(r.anotacoes).map((a) => (
              <li key={a.id} className="rounded-xl bg-surface-2/60 px-3.5 py-2.5 text-[13px]">
                <span className="text-xs font-medium text-muted">
                  {ROTULO_TIPO_ANOTACAO[a.tipo] ?? a.tipo} · passo {a.passo}
                  {a.campo ? ` · ${rotuloDoCampo(r, a.campo)}` : ''} · {hora(a.em)}
                </span>
                <span className="mt-0.5 block whitespace-pre-line text-ink">{a.texto}</span>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {lista(r.avisosConferidos).length > 0 && (
        <Bloco titulo="Avisos vistos no local">
          <ul className="flex flex-col gap-2">
            {lista(r.avisosConferidos).map((a, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-xl px-3.5 py-2.5 text-[13px]',
                  a.classe === 'IMPEDE' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                )}
              >
                <span className="text-xs font-semibold">
                  {a.classe === 'IMPEDE' ? 'Isto impede o certificado' : 'Confira a digitação'}
                  {a.campo ? ` · ${rotuloDoCampo(r, a.campo)}` : ''} · {hora(a.em)}
                </span>
                <span className="mt-0.5 block font-medium">{a.texto}</span>
                <span className="mt-0.5 block text-ink-2">
                  {a.motivo ? `Motivo do técnico: ${a.motivo}` : 'O técnico conferiu: está certo.'}
                </span>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {(lista(r.trilha).length > 0 || lista(r.correcoesPosAssinatura).length > 0) && (
        <Bloco titulo="Correções">
          <TabelaSimples
            cabecalho={['Campo', 'De', 'Para', 'Quando', 'Motivo']}
            linhas={[
              ...lista(r.trilha).map((c) => [
                rotuloDoCampo(r, c.campo),
                <s key="de" className="text-muted">
                  {c.de || '—'}
                </s>,
                c.para || '—',
                formatarInstante(c.em),
                c.motivo || '—',
              ]),
              ...lista(r.correcoesPosAssinatura).map((c) => [
                <span key="c">
                  {rotuloDoCampo(r, c.campo)}{' '}
                  <Badge tom="warning" ponto={false} className="ml-1 h-5 px-2 text-[11px]">
                    depois da assinatura
                  </Badge>
                </span>,
                <s key="de" className="text-muted">
                  {c.de || '—'}
                </s>,
                c.para || '—',
                formatarInstante(c.em),
                c.motivo || '—',
              ]),
            ]}
          />
        </Bloco>
      )}

      {lista(r.reaberturas).length > 0 && (
        <Bloco titulo="Reaberturas">
          <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
            {lista(r.reaberturas).map((x, i) => (
              <li key={i}>
                {formatarInstante(x.em)}: {x.motivo || '—'} (as assinaturas foram colhidas de novo)
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {lista(r.tentativas).length > 0 && (
        <Bloco titulo="Ensaios recomeçados (só consulta)">
          <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
            {lista(r.tentativas).map((x) => (
              <li key={x.n}>
                Tentativa {x.n}, encerrada {formatarInstante(x.encerradaEm)}: {x.motivo || '—'}. As leituras dela ficam no PDF e
                nunca vão para a calibração.
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {d.importacoes.length > 0 && (
        <Bloco titulo="Usado na calibração">
          <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
            {d.importacoes.map((i) => (
              <li key={i.id}>
                {i.tipo === 'PUXAR' ? 'Dados puxados' : 'Comparado'} em {dataHora(i.feitoEm)} por {i.feitoPor}
                {i.observacao ? `: ${i.observacao}` : ''}
              </li>
            ))}
          </ul>
        </Bloco>
      )}
    </div>
  )
}

/**
 * Levar o registro a uma calibração: a da folha (abrir); a folha avulsa sem calibração, com o registro original no
 * celular: "Criar calibração com os dados do campo" ou, com a balança informada no local, antes "Cadastrar a balança com
 * os dados do campo" (o formulário da balança preenchido com o que o técnico escreveu, para conferir).
 */
function UsarNaCalibracao({ d, aoFechar }: { d: RegistroCampoDetalhe; aoFechar: () => void }) {
  const navegar = useNavigate()
  const [registroOriginal, setRegistroOriginal] = useState<'PAPEL' | 'CELULAR' | null>(null)
  const [criando, setCriando] = useState(false)
  const [cadastrando, setCadastrando] = useState(false)
  useEffect(() => {
    let valendo = true
    api.configuracaoCampo().then(
      (r) => valendo && setRegistroOriginal(r.config.registroOriginal),
      () => {},
    )
    return () => {
      valendo = false
    }
  }, [])
  const numero = d.registro.ligadoA || d.registro.numero
  const calibracaoId = d.envio?.calibracaoId ?? ''
  const abrir = (id: string) => {
    aoFechar()
    navegar(`/calibracoes/${id}/editar`)
  }
  const criar = async (balancaId?: string) => {
    setCriando(true)
    try {
      const r = await api.criarCalibracaoDoCampo(d.registro.id, balancaId)
      useTempoReal.getState().mudou('calibracao', 'balanca')
      toast.sucesso('Calibração criada com os dados do campo', r.resumo.texto, { inteiros: [numero] })
      abrir(r.calibracao.id)
    } catch (e) {
      if (e instanceof ErroApi && e.dados.codigo === 'TEM_CALIBRACAO' && typeof e.dados.calibracaoId === 'string') {
        toast.aviso('A folha já tem calibração', e.message)
        abrir(e.dados.calibracaoId)
      } else avisarErro('Não foi possível criar a calibração', e)
    } finally {
      setCriando(false)
    }
  }
  if (calibracaoId)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4 text-[13px] text-ink-2">
        <span className="flex-1">A folha {numero} é de uma calibração: compare ou puxe os dados por ela.</span>
        <Button tamanho="sm" icone={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => abrir(calibracaoId)}>
          Abrir a calibração
        </Button>
      </div>
    )
  if (!registroOriginal) return null
  if (registroOriginal === 'PAPEL')
    return (
      <p className="rounded-2xl border border-line p-4 text-[13px] text-ink-2">
        Piloto: comece a calibração desta balança e digite do papel. Depois, ligue a folha {numero} e use “Comparar com o campo”.
      </p>
    )
  const temBalanca = !!d.pacote?.balanca
  const inicial: Balanca | undefined = temBalanca ? undefined : (balancaDoCampoSeguro(d) ?? undefined)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/25 bg-brand-soft/50 p-4 text-[13px] text-ink-2">
      <span className="min-w-0 flex-1">
        {temBalanca
          ? `A folha ${numero} ainda não tem calibração. Crie a calibração já com o que o técnico anotou.`
          : `A balança da folha ${numero} foi informada no local. Cadastre a balança com os dados do campo (confira antes de salvar) e a calibração nasce com eles.`}
      </span>
      {temBalanca ? (
        <Button
          tamanho="sm"
          variante="primary"
          disabled={criando}
          icone={criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
          onClick={() => void criar()}
        >
          Criar calibração com os dados do campo
        </Button>
      ) : (
        <Button
          tamanho="sm"
          variante="primary"
          disabled={criando}
          icone={criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
          onClick={() => setCadastrando(true)}
        >
          Cadastrar a balança com os dados do campo
        </Button>
      )}
      <BalancaFormModal
        aberto={cadastrando}
        aoFechar={() => setCadastrando(false)}
        clienteId={d.pacote?.cliente?.id || undefined}
        inicial={inicial}
        descricao="Preenchido com o que o técnico escreveu no celular. Confira com a plaqueta (sai no certificado)."
        aoSalvar={async (b) => {
          setCadastrando(false)
          await criar(b.id)
        }}
      />
    </div>
  )
}

/** A balança como o técnico a escreveu (null se o registro não deu para ler). */
function balancaDoCampoSeguro(d: RegistroCampoDetalhe): Balanca | null {
  try {
    return balancaDoCampo(d.conteudo, d.pacote)
  } catch {
    return null
  }
}

/** "Ligar à folha…" (o órfão) e "Descartar" (com o motivo). */
function AcoesDoRegistro({
  d,
  orfao,
  modo,
  setModo,
  aoMudar,
}: {
  d: RegistroCampoDetalhe
  orfao: boolean
  modo: '' | 'ligar' | 'descartar'
  setModo: (m: '' | 'ligar' | 'descartar') => void
  aoMudar: () => void
}) {
  const [numero, setNumero] = useState(d.registro.numero)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const lido = numeroDaFolha(numero)
  const feito = useCallback(
    (titulo: string) => {
      toast.sucesso(titulo)
      useTempoReal.getState().mudou('calibracao')
      setModo('')
      aoMudar()
    },
    [aoMudar, setModo],
  )
  const ligar = async () => {
    if (!lido) return
    setSalvando(true)
    try {
      await api.ligarRegistroCampo(d.registro.id, lido, motivo.trim())
      feito(`Registro ligado à folha ${lido}`)
    } catch (e) {
      avisarErro('Não foi possível ligar o registro', e)
    } finally {
      setSalvando(false)
    }
  }
  const descartar = async () => {
    if (!motivo.trim()) return
    setSalvando(true)
    try {
      await api.descartarRegistroCampo(d.registro.id, motivo.trim())
      feito('Registro descartado')
    } catch (e) {
      avisarErro('Não foi possível descartar', e)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <div className="rounded-2xl border border-line p-4">
      {orfao && !modo && <p className="mb-3 text-[13px] text-ink-2">{MARCA_REGISTRO.ORFAO.dica}</p>}
      {!modo ? (
        <div className="flex flex-wrap gap-2">
          {orfao && (
            <Button tamanho="sm" icone={<Link2 className="h-3.5 w-3.5" />} onClick={() => setModo('ligar')}>
              Ligar à folha…
            </Button>
          )}
          <Button tamanho="sm" variante="ghost" icone={<Ban className="h-3.5 w-3.5" />} onClick={() => setModo('descartar')}>
            Descartar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {modo === 'ligar' && (
            <Field label="Nº da folha de campo" htmlFor="ligar-numero" hint="Como está no alto da folha (ex.: FC-2026-00042).">
              <Input id="ligar-numero" autoFocus value={numero} onChange={(e) => setNumero(e.target.value)} />
            </Field>
          )}
          <Field
            label={modo === 'ligar' ? 'Por que ligar a esta folha' : 'Por que descartar'}
            htmlFor="registro-motivo"
            opcional={modo === 'ligar'}
            obrigatorio={modo === 'descartar'}
          >
            <Textarea
              id="registro-motivo"
              autoFocus={modo === 'descartar'}
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
              className="min-h-[60px]"
              placeholder={modo === 'ligar' ? 'Ex.: o envio sumiu depois de “Apagar os testes”' : 'Ex.: folha de teste'}
            />
          </Field>
          <p className="text-xs text-muted">
            {modo === 'descartar'
              ? 'O registro nunca é apagado: fica guardado como descartado, com o motivo.'
              : 'O registro passa a valer para a folha escolhida.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button tamanho="sm" onClick={() => setModo('')}>
              Cancelar
            </Button>
            {modo === 'ligar' ? (
              <Button tamanho="sm" variante="primary" disabled={!lido || salvando} onClick={() => void ligar()}>
                Ligar à {lido || 'folha'}
              </Button>
            ) : (
              <Button tamanho="sm" variante="danger" disabled={!motivo.trim() || salvando} onClick={() => void descartar()}>
                Descartar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Assinaturas({ r }: { r: RegistroCampo }) {
  const t = r.assinaturas?.tecnico
  const c = r.assinaturas?.cliente
  const tipo = tipoAssinaturaCliente(c)
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <PenLine className="h-3.5 w-3.5" /> Técnico
        </p>
        {t ? (
          <>
            {t.png && (
              <img src={t.png} alt={`Assinatura de ${t.nome}`} className="mt-1 h-16 max-w-full rounded bg-white object-contain" />
            )}
            <p className="mt-1 text-[13px] text-ink">
              {t.nome} <span className="text-muted">· {formatarInstante(t.em)}</span>
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted">Sem assinatura.</p>
        )}
      </div>
      <div className="rounded-xl border border-line p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <PenLine className="h-3.5 w-3.5" /> Quem acompanhou pelo cliente
        </p>
        {tipo === 'ASSINOU' && c && 'png' in c ? (
          <>
            {c.png && (
              <img src={c.png} alt={`Assinatura de ${c.nome}`} className="mt-1 h-16 max-w-full rounded bg-white object-contain" />
            )}
            <p className="mt-1 text-[13px] text-ink">
              {c.nome}
              {c.funcao ? ` (${c.funcao})` : ''} <span className="text-muted">· {formatarInstante(c.em)}</span>
            </p>
            {lista(r.correcoesPosAssinatura).some((x) => x.mostradoAoCliente) && (
              <p className="mt-1 text-xs text-warning">Anterior à correção feita depois da assinatura.</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-[13px] text-ink-2">
            {tipo === 'NAO_ASSINOU' && c && 'motivo' in c
              ? `Não assinou: ${c.motivo || 'sem motivo'}`
              : tipo === 'DISPENSADA'
                ? 'Calibração no laboratório: sem assinatura do cliente.'
                : tipo === 'SO_NO_PAPEL'
                  ? 'Piloto: o cliente assinou só o papel.'
                  : 'Sem assinatura.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Conferencias({ itens }: { itens: RegistroCampo['passos']['chegada']['conferencias'] }) {
  if (!itens.length) return <p className="text-[13px] text-muted">Nada a conferir.</p>
  return (
    <TabelaSimples
      cabecalho={['Dado impresso', 'Na folha', 'No local']}
      linhas={itens.map((c) => [
        c.rotulo,
        c.mostrado || '—',
        c.confere === true ? (
          <Badge key="ok" tom="success" ponto={false}>
            Confere
          </Badge>
        ) : c.confere === false ? (
          <span key="dif" className="inline-flex flex-wrap items-center gap-1.5">
            <Badge tom="warning" ponto={false}>
              Algo diferente
            </Badge>
            {c.observado && <span className="text-[13px] font-medium text-ink">{c.observado}</span>}
          </span>
        ) : (
          <span key="nao" className="text-muted">
            Não conferido
          </span>
        ),
      ])}
    />
  )
}

function Leitura({ l }: { l: LeituraCampo | null | undefined }) {
  if (!l || typeof l.valor !== 'string' || !l.valor.trim()) return <span className="text-muted">—</span>
  const h = hora(l.em)
  return (
    <span
      className="tnum whitespace-nowrap"
      title={l.em ? `Anotado às ${formatarInstante(l.em)}${l.via === 'repetir' ? ' (Repetir)' : ''}` : undefined}
    >
      <span className="font-medium text-ink">{l.valor}</span>
      {h && <span className="ml-1 text-[11px] text-muted">{h}</span>}
    </span>
  )
}

function Passo({ chave, children }: { chave: ChavePasso; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="tnum flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">
          {PASSOS_FOLHA[chave]}
        </span>
        {TITULOS_PASSOS[chave]}
      </h3>
      {children}
    </section>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">{titulo}</h3>
      {children}
    </section>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  )
}

function Faixa({ tom, icone, children }: { tom: 'warning' | 'danger'; icone: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]',
        tom === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
      )}
    >
      <span className="mt-0.5 shrink-0">{icone}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function TabelaSimples({ cabecalho, linhas, className }: { cabecalho: string[]; linhas: ReactNode[][]; className?: string }) {
  if (!linhas.length) return <p className={cn('text-[13px] text-muted', className)}>Nada anotado.</p>
  return (
    <div className={cn('scroll-fino overflow-x-auto rounded-xl border border-line', className)}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-surface-2/70 text-left text-xs text-muted">
            {cabecalho.map((c, i) => (
              <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-line">
              {l.map((c, j) => (
                <td key={j} className="px-3 py-1.5 align-top text-ink-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
