// Campo de um arquivo guardado no sistema (o certificado de um padrão, o POP): escolher ou arrastar, ver o
// nome e o tamanho, abrir, trocar e remover. O arquivo escolhido só é enviado quando o formulário é salvo
// (quem chama envia com `api.enviarArquivo`); o tipo é conferido pelo conteúdo antes, na hora.

import { ExternalLink, FileImage, FileText, FileType2, RefreshCw, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  acceptDa,
  detectarTipoArquivo,
  problemaDoArquivo,
  ROTULO_TIPO_ARQUIVO,
  tipoDoMime,
  tiposAceitos,
  type FinalidadeArquivo,
  type TipoArquivo,
} from '#shared/arquivos.ts'
import type { ArquivoAnexo } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { dataCurta, tamanhoArquivo } from '../lib/format'
import { Button } from './ui/Button'

/** Confere um arquivo escolhido na tela (tamanho e os primeiros bytes); devolve o problema, ou null. */
async function conferirArquivoLocal(arquivo: File, finalidade: FinalidadeArquivo): Promise<string | null> {
  let tipo: TipoArquivo | null = null
  try {
    tipo = detectarTipoArquivo(new Uint8Array(await arquivo.slice(0, 2048).arrayBuffer()), true)
  } catch {
    return 'Não foi possível ler o arquivo. Tente de novo.'
  }
  return problemaDoArquivo(arquivo.size, tipo, finalidade)
}

const ICONE: Record<TipoArquivo, typeof FileText> = { pdf: FileText, jpg: FileImage, png: FileImage, docx: FileType2 }

function tipoLocal(f: File): TipoArquivo | null {
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'png') return 'png'
  if (ext === 'docx') return 'docx'
  return tipoDoMime(f.type)
}

export function CampoArquivo({
  id,
  finalidade,
  valor,
  aoMudar,
  desabilitado,
  rotulo = 'Anexar o arquivo',
  semRemover,
  className,
}: {
  id?: string
  finalidade: FinalidadeArquivo
  /** O arquivo guardado, o escolhido agora (ainda não enviado) ou nenhum. */
  valor: ArquivoAnexo | File | null
  /** Arquivo escolhido (já conferido) ou null para remover. */
  aoMudar: (v: File | null) => void
  desabilitado?: boolean
  /** Texto do campo vazio, ex.: "Anexar o certificado". */
  rotulo?: string
  /** Sem o botão de remover (o arquivo só pode ser trocado). */
  semRemover?: boolean
  className?: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const [conferindo, setConferindo] = useState(false)

  const receber = async (arquivo: File | undefined) => {
    if (!arquivo || desabilitado) return
    setConferindo(true)
    try {
      const problema = await conferirArquivoLocal(arquivo, finalidade)
      setErro(problema ?? '')
      if (!problema) aoMudar(arquivo)
    } finally {
      setConferindo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    void receber(e.dataTransfer.files[0])
  }
  const arrastar = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      if (!desabilitado) setArrastando(true)
    },
    onDragLeave: () => setArrastando(false),
    onDrop: soltar,
  }

  // O arquivo escolhido (ainda não enviado) abre pelo endereço local do navegador
  const local = valor instanceof File ? valor : null
  const urlLocal = useMemo(() => (local ? URL.createObjectURL(local) : ''), [local])
  useEffect(() => () => (urlLocal ? URL.revokeObjectURL(urlLocal) : undefined), [urlLocal])

  const seletor = (
    <input
      ref={entrada}
      id={id}
      type="file"
      accept={acceptDa(finalidade)}
      className="hidden"
      onChange={(e) => void receber(e.target.files?.[0])}
    />
  )
  const ajuda = `${tiposAceitos(finalidade)}, até 10 MB.`

  if (!valor)
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <button
          type="button"
          {...arrastar}
          onClick={() => entrada.current?.click()}
          disabled={desabilitado || conferindo}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors',
            'focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            arrastando
              ? 'border-brand bg-brand-soft/40'
              : 'border-line-strong bg-surface hover:border-brand/60 hover:bg-surface-2/60',
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
            <Upload className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink">{conferindo ? 'Conferindo o arquivo…' : rotulo}</span>
            <span className="block text-xs text-muted">Clique para escolher ou arraste o arquivo aqui. {ajuda}</span>
          </span>
        </button>
        {seletor}
        {erro && (
          <p role="alert" className="text-xs font-medium text-danger">
            {erro}
          </p>
        )}
      </div>
    )

  const salvo = local ? null : (valor as ArquivoAnexo)
  const tipo = local ? tipoLocal(local) : tipoDoMime(salvo!.tipo)
  const Icone = tipo ? ICONE[tipo] : FileText
  const nome = local ? local.name : salvo!.nome
  const tamanho = local ? local.size : salvo!.tamanho
  const enviadoEm = salvo?.enviadoEm ?? ''
  const url = local ? urlLocal : api.urlArquivo(salvo!.sha256)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        {...arrastar}
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 transition-colors',
          arrastando ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface-2/50',
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tipo === 'pdf'
              ? 'bg-danger-soft text-danger'
              : tipo === 'docx'
                ? 'bg-info-soft text-info'
                : 'bg-brand-soft text-brand-ink',
          )}
        >
          <Icone className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink" title={nome}>
            {nome}
          </span>
          <span className="tnum block truncate text-xs text-muted">
            {[tipo && ROTULO_TIPO_ARQUIVO[tipo], tamanho > 0 && tamanhoArquivo(tamanho)].filter(Boolean).join(' · ')}
            {local ? (
              <span className="text-warning"> · será enviado ao salvar</span>
            ) : (
              enviadoEm && ` · anexado em ${dataCurta(enviadoEm.slice(0, 10))}`
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir
            </a>
          )}
          <Button
            tamanho="sm"
            variante="ghost"
            icone={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => entrada.current?.click()}
            disabled={desabilitado || conferindo}
          >
            Trocar
          </Button>
          {!semRemover && (
            <Button
              tamanho="icon-sm"
              variante="ghost"
              aria-label="Remover o arquivo"
              title="Remover o arquivo"
              onClick={() => {
                setErro('')
                aoMudar(null)
              }}
              disabled={desabilitado}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </span>
        {seletor}
      </div>
      {erro && (
        <p role="alert" className="text-xs font-medium text-danger">
          {erro}
        </p>
      )}
    </div>
  )
}

/**
 * Botão compacto que escolhe um arquivo (conferido como no campo inteiro) para enviar na hora, numa linha de
 * lista: o arquivo que faltou numa revisão antiga do POP, por exemplo. O erro sai ao lado do botão.
 */
export function BotaoAnexarArquivo({
  finalidade,
  aoEscolher,
  desabilitado,
  rotulo = 'Anexar o arquivo',
  titulo,
}: {
  finalidade: FinalidadeArquivo
  /** Arquivo escolhido, já conferido. */
  aoEscolher: (arquivo: File) => void
  desabilitado?: boolean
  rotulo?: string
  /** Dica do botão (ex.: para que serve o arquivo). */
  titulo?: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [conferindo, setConferindo] = useState(false)

  const receber = async (arquivo: File | undefined) => {
    if (!arquivo || desabilitado) return
    setConferindo(true)
    try {
      const problema = await conferirArquivoLocal(arquivo, finalidade)
      setErro(problema ?? '')
      if (!problema) aoEscolher(arquivo)
    } finally {
      setConferindo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {erro && (
        <span role="alert" className="text-xs font-medium text-danger">
          {erro}
        </span>
      )}
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={desabilitado || conferindo}
        title={titulo ?? `${tiposAceitos(finalidade)}, até 10 MB.`}
        className={cn(
          'inline-flex h-[24px] items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-soft',
          'focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Upload className="h-3.5 w-3.5" />
        {conferindo ? 'Conferindo…' : rotulo}
      </button>
      <input
        ref={entrada}
        type="file"
        accept={acceptDa(finalidade)}
        className="hidden"
        onChange={(e) => void receber(e.target.files?.[0])}
      />
    </span>
  )
}
