// POP — Procedimento Operacional Padrão (Configurações → Certificado): a revisão vigente (código, revisão,
// data e o arquivo), o registro de uma revisão nova e as revisões anteriores, substituídas. O código e a
// revisão saem em todas as páginas do certificado; o arquivo é o que a empresa mostra a quem pedir. Uma
// revisão registrada sem o arquivo recebe o arquivo depois, também quando já foi substituída: os certificados
// emitidos com ela são mostrados com ele. Anexar é do administrador (a página já é só dele; o servidor confere).

import { BookOpenText, Download, ExternalLink, FileText, History, Loader2, Plus, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { normalizarPop, revisaoPop, ROTULO_TIPO_ARQUIVO, textoPop, tipoDoMime } from '#shared/arquivos.ts'
import { formatarDataBr } from '#shared/dominio.ts'
import type { VersaoPop } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { dataHora, hojeISO, tamanhoArquivo } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { BotaoAnexarArquivo, CampoArquivo } from './CampoArquivo'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { confirmar } from './ui/Feedback'
import { Field, Input } from './ui/Form'
import { Modal } from './ui/Modal'

/** Próxima revisão sugerida: "00" → "01". */
const proximaRevisao = (r: string) => (/^\d+$/.test(r) ? String(Number(r) + 1).padStart(2, '0') : '')

export function CartaoPop() {
  const { dados, carregando, erro } = useConsulta('pop', () => api.pop(), ['config'])
  const podeAnexar = usePode('configuracoes')
  const [registrando, setRegistrando] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const atual = dados?.atual ?? null
  const anteriores = dados?.versoes.slice(1) ?? []
  const anterioresSemArquivo = anteriores.filter((v) => !v.arquivo).length

  const anexar = async (v: VersaoPop, arquivo: File | null) => {
    if (!arquivo) return
    if (
      v.arquivo &&
      !(await confirmar({
        titulo: `Trocar o arquivo do ${textoPop(v)}?`,
        descricao:
          'Use só para corrigir um arquivo errado da mesma revisão. Se o POP mudou, registre uma revisão nova (o histórico fica certo).',
        confirmar: 'Trocar o arquivo',
      }))
    )
      return
    setAnexando(true)
    try {
      const ref = await api.enviarArquivo(arquivo, arquivo.name, 'pop')
      await api.anexarArquivoPop(v.id, ref.sha256)
      useTempoReal.getState().mudou('config')
      toast.sucesso('Arquivo do POP anexado', `${textoPop(v)} · ${ref.nome}`)
    } catch (e) {
      avisarErro('Não foi possível anexar o arquivo do POP', e)
    } finally {
      setAnexando(false)
    }
  }

  if (carregando && !dados)
    return <div className="h-[132px] animate-pulse rounded-xl bg-surface-2" aria-label="Carregando o POP" />
  if (erro && !dados) return <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger">{erro}</p>

  return (
    <div className="flex flex-col gap-3">
      {!atual ? (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3.5 sm:flex-row sm:items-center">
          <ShieldAlert className="h-5 w-5 shrink-0 text-warning max-sm:hidden" />
          <div className="min-w-0 flex-1 text-[13px] leading-snug">
            <p className="font-semibold text-warning">Nenhum POP registrado</p>
            <p className="text-ink-2">
              Sem o POP, os certificados não podem ser emitidos: o código e a revisão saem em todas as páginas.
            </p>
          </div>
          <Button variante="primary" tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setRegistrando(true)}>
            Registrar o POP
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink max-sm:hidden">
              <BookOpenText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Revisão vigente</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="tnum truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">{atual.codigo}</span>
                {atual.revisao && (
                  <Badge tom="brand" ponto={false} className="tnum">
                    rev. {atual.revisao}
                  </Badge>
                )}
              </p>
              <p className="tnum mt-1 text-xs text-muted">
                {atual.data && `Revisão de ${formatarDataBr(atual.data)} · `}registrada em {dataHora(atual.criadoEm)}
                {atual.criadoPor && ` por ${atual.criadoPor}`}
              </p>
              {atual.observacao && <p className="mt-1 text-[13px] text-ink-2">{atual.observacao}</p>}
            </div>
            <Button
              tamanho="sm"
              icone={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setRegistrando(true)}
              className="self-start"
            >
              Registrar nova revisão
            </Button>
          </div>
          <div className="flex flex-col gap-2 border-t border-line bg-surface-2/40 px-4 py-3">
            {!atual.arquivo && (
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-warning">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Arquivo do POP não anexado
              </p>
            )}
            <CampoArquivo
              finalidade="pop"
              rotulo={anexando ? 'Enviando o arquivo…' : 'Anexar o arquivo do POP'}
              valor={atual.arquivo}
              aoMudar={(f) => void anexar(atual, f)}
              desabilitado={anexando || !podeAnexar}
              semRemover
            />
          </div>
        </div>
      )}

      {anteriores.length > 0 && (
        <details className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-ink-2 select-none hover:text-ink">
            <History className="h-4 w-4 text-muted" />
            Revisões anteriores ({anteriores.length})
            {anterioresSemArquivo > 0 && (
              <Badge tom="warning" ponto={false}>
                {anterioresSemArquivo === 1 ? '1 sem arquivo' : `${anterioresSemArquivo} sem arquivo`}
              </Badge>
            )}
            <span className="ml-auto text-xs font-normal text-muted group-open:hidden">mostrar</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {anteriores.map((v) => (
              <LinhaRevisao key={v.id} v={v} anexando={anexando} podeAnexar={podeAnexar} aoAnexar={(f) => void anexar(v, f)} />
            ))}
          </ul>
        </details>
      )}

      <RegistrarPopModal aberto={registrando} aoFechar={() => setRegistrando(false)} atual={atual} />
    </div>
  )
}

/**
 * Uma revisão substituída. Sem o arquivo (registrada antes de ele ficar pronto), dá para anexar aqui: é o
 * documento dos certificados emitidos com ela, que um órgão pode pedir.
 */
export function LinhaRevisao({
  v,
  anexando = false,
  podeAnexar = true,
  aoAnexar,
}: {
  v: VersaoPop
  anexando?: boolean
  /** Só o administrador anexa (sem a permissão, a linha só avisa que falta o arquivo). */
  podeAnexar?: boolean
  aoAnexar: (arquivo: File) => void
}) {
  const tipo = v.arquivo ? tipoDoMime(v.arquivo.tipo) : null
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
      <span className="tnum min-w-0 font-medium text-ink">{textoPop(v)}</span>
      <Badge tom="neutral" ponto={false}>
        substituída
      </Badge>
      <span className="tnum text-xs text-muted">{v.data && formatarDataBr(v.data)}</span>
      <span className="ml-auto flex items-center gap-1">
        {v.arquivo ? (
          <>
            <a
              href={api.urlArquivo(v.arquivo.sha256)}
              target="_blank"
              rel="noopener"
              title={v.arquivo.nome}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-ink hover:bg-brand-soft"
            >
              {tipo === 'docx' ? <Download className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
              {tipo ? ROTULO_TIPO_ARQUIVO[tipo] : 'Arquivo'} · {tamanhoArquivo(v.arquivo.tamanho)}
            </a>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-warning">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              sem arquivo
            </span>
            {podeAnexar && (
              <BotaoAnexarArquivo
                finalidade="pop"
                rotulo={anexando ? 'Enviando…' : 'Anexar o arquivo'}
                titulo={`Anexar o arquivo do ${textoPop(v)}, o dos certificados emitidos com esta revisão`}
                desabilitado={anexando}
                aoEscolher={aoAnexar}
              />
            )}
          </>
        )}
      </span>
    </li>
  )
}

/** Registrar uma revisão nova do POP (o arquivo é opcional: dá para anexar depois). */
export function RegistrarPopModal({
  aberto,
  aoFechar,
  atual,
}: {
  aberto: boolean
  aoFechar: () => void
  atual: VersaoPop | null
}) {
  const inicial = () => ({
    codigo: atual?.codigo ?? '',
    revisao: atual ? proximaRevisao(atual.revisao) : '00',
    data: hojeISO(),
    observacao: '',
  })
  const [f, setF] = useState(inicial)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState<false | 'arquivo' | 'dados'>(false)
  // Ao abrir, começa do zero (com a sugestão da próxima revisão)
  const [abertoAntes, setAbertoAntes] = useState(aberto)
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto)
    if (aberto) {
      setF(inicial())
      setArquivo(null)
      setTentou(false)
    }
  }

  const { valor, erros } = normalizarPop({ ...f, arquivo: '' })
  const erroDe = (re: RegExp) => (tentou ? erros.find((e) => re.test(e)) : undefined)
  const erroCodigo = erroDe(/código/)
  const erroRevisao = erroDe(/revisão do POP com/)
  const erroData = erroDe(/data/)

  const registrar = async (e?: FormEvent) => {
    // A janela fica dentro do formulário das configurações (na árvore do React): não deixa o envio subir
    e?.preventDefault()
    e?.stopPropagation()
    setTentou(true)
    if (erros.length) return
    try {
      let sha = ''
      if (arquivo) {
        setSalvando('arquivo')
        sha = (await api.enviarArquivo(arquivo, arquivo.name, 'pop')).sha256
      }
      setSalvando('dados')
      const { versao } = await api.registrarPop({ ...valor, arquivo: sha })
      useTempoReal.getState().mudou('config')
      toast.sucesso(
        'Revisão do POP registrada',
        `${textoPop(versao)} vale para os próximos certificados${versao.arquivo ? '' : '. Anexe o arquivo assim que ficar pronto'}.`,
      )
      aoFechar()
    } catch (err) {
      avisarErro('Não foi possível registrar a revisão do POP', err)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !salvando && aoFechar()}
      icone={<BookOpenText className="h-5 w-5" />}
      titulo={atual ? 'Registrar nova revisão do POP' : 'Registrar o POP'}
      descricao="Vale para os próximos certificados. Os já emitidos continuam com a revisão de quando foram emitidos."
      largura="max-w-lg"
      rodape={
        <>
          <Button onClick={aoFechar} disabled={!!salvando}>
            Cancelar
          </Button>
          <Button
            variante="primary"
            type="submit"
            form="form-pop"
            disabled={!!salvando}
            icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {salvando === 'arquivo' ? 'Enviando o arquivo…' : salvando ? 'Registrando…' : 'Registrar revisão'}
          </Button>
        </>
      }
    >
      <form id="form-pop" onSubmit={(e) => void registrar(e)} className="flex flex-col gap-4" noValidate>
        {atual && !atual.arquivo && (
          <p role="note" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="font-semibold">
                A revisão atual (<span className="tnum">{textoPop(atual)}</span>) ainda não tem o arquivo;
              </b>{' '}
              os certificados emitidos com ela ficarão sem o documento. Anexe antes ou depois em Revisões anteriores.
            </span>
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_112px]">
          <Field label="Código do POP" htmlFor="pop-codigo" erro={erroCodigo} hint="Como está no documento.">
            <Input
              id="pop-codigo"
              value={f.codigo}
              onChange={(e) => setF((x) => ({ ...x, codigo: e.target.value }))}
              placeholder="BALANÇAS-POP-123"
              autoComplete="off"
              maxLength={60}
              autoFocus
              aria-invalid={erroCodigo ? true : undefined}
              className={cn('tnum', erroCodigo && 'border-danger!')}
            />
          </Field>
          <Field label="Revisão" htmlFor="pop-revisao" erro={erroRevisao} hint="00, 01, 02…">
            <Input
              id="pop-revisao"
              value={f.revisao}
              onChange={(e) => setF((x) => ({ ...x, revisao: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
              onBlur={() => setF((x) => ({ ...x, revisao: revisaoPop(x.revisao) || x.revisao }))}
              inputMode="numeric"
              placeholder="00"
              autoComplete="off"
              aria-invalid={erroRevisao ? true : undefined}
              className={cn('tnum text-center', erroRevisao && 'border-danger!')}
            />
          </Field>
        </div>
        <Field label="Data da revisão" htmlFor="pop-data" erro={erroData} className="sm:max-w-[220px]">
          <Input
            id="pop-data"
            type="date"
            value={f.data}
            onChange={(e) => setF((x) => ({ ...x, data: e.target.value }))}
            aria-invalid={erroData ? true : undefined}
            className={cn('tnum', erroData && 'border-danger!')}
          />
        </Field>
        <Field label="Arquivo do POP (opcional)">
          <CampoArquivo finalidade="pop" rotulo="Anexar o arquivo do POP" valor={arquivo} aoMudar={setArquivo} />
        </Field>
        {!arquivo && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="font-semibold">Arquivo do POP não anexado.</b> Dá para registrar assim e emitir os certificados; anexe
              o arquivo assim que a revisão ficar pronta.
            </span>
          </p>
        )}
        <Field label="O que mudou (opcional)" htmlFor="pop-obs">
          <Input
            id="pop-obs"
            value={f.observacao}
            onChange={(e) => setF((x) => ({ ...x, observacao: e.target.value }))}
            placeholder="Ex.: revisão geral do texto e das figuras"
            maxLength={300}
          />
        </Field>
        {atual && valor.codigo && valor.revisao && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span>
              Os próximos certificados saem com <b className="tnum font-semibold text-ink-2">{textoPop(valor)}</b> no lugar de{' '}
              <span className="tnum">{textoPop(atual)}</span>.
            </span>
          </p>
        )}
      </form>
    </Modal>
  )
}
