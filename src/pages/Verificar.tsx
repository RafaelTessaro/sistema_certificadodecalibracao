// Conferência pública de autenticidade (QR code do certificado): fica fora do login. Mostra só o
// essencial que o servidor devolve para o código: número, situação, datas, cliente, instrumento e o
// hash do PDF emitido.

import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  FileCheck2,
  FileSearch,
  FileX2,
  Fingerprint,
  Loader2,
  LogIn,
  RotateCw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { STATUS_CALIBRACAO } from '#shared/dominio.ts'
import type { StatusCalibracao } from '#shared/tipos.ts'
import { SeletorTema } from '../components/layout/Sidebar'
import { Logo } from '../components/Logo'
import { StatusCalibracaoBadge } from '../components/Selos'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Form'
import { api, ErroApi, type VerificacaoCertificado } from '../lib/api'
import { cn } from '../lib/cn'

/** Formato do código impresso no certificado: "AB12-CD34". */
const FORMATO_CODIGO = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/

/** Maiúsculas, só letras e números, com o hífen no meio ("ab12cd34" → "AB12-CD34"). */
function normalizarCodigo(v: string) {
  const s = v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'ok'; dados: VerificacaoCertificado }
  | { tipo: 'naoEncontrado' }
  | { tipo: 'erro'; mensagem: string; semConexao: boolean }
  | { tipo: 'invalido' }

export function Verificar({ codigo }: { codigo: string }) {
  const [atual, setAtual] = useState(() => normalizarCodigo(codigo))
  // O App passa o código do endereço; se ele mudar, a página acompanha
  const [codigoRecebido, setCodigoRecebido] = useState(codigo)
  if (codigo !== codigoRecebido) {
    setCodigoRecebido(codigo)
    setAtual(normalizarCodigo(codigo))
  }
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<{ chave: string; estado: Estado } | null>(null)
  const valido = FORMATO_CODIGO.test(atual)
  const chave = `${atual}|${tentativa}`

  useEffect(() => {
    const anterior = document.title
    document.title = 'Conferir certificado · Balanças.com'
    return () => {
      document.title = anterior
    }
  }, [])

  useEffect(() => {
    if (!valido) return
    let ativo = true
    api.verificar(atual).then(
      (dados) => {
        if (ativo) setResultado({ chave, estado: { tipo: 'ok', dados } })
      },
      (e: unknown) => {
        if (!ativo) return
        if (e instanceof ErroApi && e.status === 404) return setResultado({ chave, estado: { tipo: 'naoEncontrado' } })
        setResultado({
          chave,
          estado: {
            tipo: 'erro',
            mensagem: e instanceof Error ? e.message : 'Erro inesperado.',
            semConexao: e instanceof ErroApi && e.semConexao,
          },
        })
      },
    )
    return () => {
      ativo = false
    }
  }, [atual, valido, chave])

  const estado: Estado = !valido ? { tipo: 'invalido' } : resultado?.chave === chave ? resultado.estado : { tipo: 'carregando' }

  const conferir = (novo: string) => {
    if (novo === atual) setTentativa((t) => t + 1)
    else location.hash = `#/verificar/${novo}`
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-bg px-4 py-10 sm:py-14">
      {/* Brilho suave atrás do cartão */}
      <div className="pointer-events-none absolute top-[-18%] left-1/2 -z-10 h-[460px] w-[680px] max-w-[160vw] -translate-x-1/2 rounded-full bg-brand-soft opacity-80 blur-3xl dark:opacity-60" />
      <div className="absolute top-4 right-4">
        <SeletorTema compacto />
      </div>

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[580px]"
      >
        <header className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-14 w-14 drop-shadow-sm" />
          <p className="mt-3 text-[17px] font-semibold tracking-[-0.015em] text-ink">Balanças.com</p>
          <p className="text-[13px] text-muted">Conferência de certificado de calibração</p>
        </header>

        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={estado.tipo === 'ok' ? `ok-${atual}` : estado.tipo}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {estado.tipo === 'carregando' && <Carregando />}
              {estado.tipo === 'ok' && <Resultado dados={estado.dados} codigo={atual} />}
              {estado.tipo === 'naoEncontrado' && <NaoEncontrado codigo={atual} />}
              {estado.tipo === 'invalido' && (
                <Aviso
                  icone={<FileSearch className="h-7 w-7" />}
                  tom="neutro"
                  titulo="Digite o código do certificado"
                  texto={
                    <>
                      O código de autenticidade tem 8 letras e números, como <Codigo>AB12-CD34</Codigo>. Ele fica no certificado,
                      perto do QR code.
                    </>
                  }
                />
              )}
              {estado.tipo === 'erro' && (
                <Aviso
                  icone={estado.semConexao ? <WifiOff className="h-7 w-7" /> : <CircleAlert className="h-7 w-7" />}
                  tom="neutro"
                  titulo="Não foi possível conferir agora"
                  texto={
                    estado.semConexao
                      ? 'O sistema da Balanças.com não respondeu. Verifique a internet e tente de novo.'
                      : estado.mensagem
                  }
                  acao={
                    <Button icone={<RotateCw className="h-4 w-4" />} onClick={() => setTentativa((t) => t + 1)}>
                      Tentar de novo
                    </Button>
                  }
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <OutroCodigo key={atual} inicial={valido ? '' : atual} aoConferir={conferir} />

        <footer className="mt-6 space-y-2 px-2 text-center text-xs leading-relaxed text-muted">
          <p>
            Esta página mostra os dados guardados no sistema da Balanças.com quando o certificado foi emitido. Em caso de dúvida,
            fale com a empresa.
          </p>
          <p>
            <a
              href="#/"
              className="inline-flex items-center gap-1 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              <LogIn className="h-3.5 w-3.5" /> Entrar no BC Calibração
            </a>
          </p>
        </footer>
      </motion.main>
    </div>
  )
}

// ---- Estados ---------------------------------------------------------------------

function Carregando() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" aria-busy="true">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
      <p className="mt-4 text-sm font-medium text-ink">Conferindo o certificado…</p>
      <div className="mt-6 w-full max-w-sm space-y-2.5">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-3" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-2" />
        <div className="h-3 w-3/5 animate-pulse rounded-full bg-surface-2" />
      </div>
    </div>
  )
}

const TOM_AVISO = {
  sucesso: 'bg-success-soft text-success',
  perigo: 'bg-danger-soft text-danger',
  alerta: 'bg-warning-soft text-warning',
  neutro: 'bg-surface-2 text-ink-2',
}

function Aviso({
  icone,
  tom,
  titulo,
  texto,
  acao,
}: {
  icone: ReactNode
  tom: keyof typeof TOM_AVISO
  titulo: string
  texto: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', TOM_AVISO[tom])}
      >
        {icone}
      </motion.div>
      <h1 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink">{titulo}</h1>
      <div className="mt-1.5 max-w-md text-sm text-ink-2">{texto}</div>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}

function NaoEncontrado({ codigo }: { codigo: string }) {
  return (
    <Aviso
      icone={<SearchX className="h-7 w-7" />}
      tom="alerta"
      titulo="Certificado não encontrado"
      texto={
        <>
          <p>
            Não há nenhum certificado com o código <Codigo>{codigo}</Codigo> no sistema da Balanças.com.
          </p>
          <ul className="mt-4 space-y-2 rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-left text-[13px]">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
              Confira o código impresso no certificado, perto do QR code: letras parecidas, como O e 0, confundem.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-dot" />
              <span>
                Se o código estiver certo, <b className="font-semibold text-ink">o documento pode não ser verdadeiro</b>. Fale com
                a Balanças.com antes de usá-lo.
              </span>
            </li>
          </ul>
        </>
      }
    />
  )
}

function Resultado({ dados, codigo }: { dados: VerificacaoCertificado; codigo: string }) {
  const status = (dados.status in STATUS_CALIBRACAO ? dados.status : 'EMITIDO') as StatusCalibracao
  const emVigor = status === 'EMITIDO'
  const cancelado = status === 'CANCELADO'
  return (
    <>
      <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center sm:px-10">
        <motion.div
          initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-2xl',
            emVigor ? 'bg-success-soft text-success' : cancelado ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
          )}
        >
          {emVigor ? <ShieldCheck className="h-8 w-8" /> : <ShieldAlert className="h-8 w-8" />}
        </motion.div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-ink">Certificado autêntico</h1>
        <p className="mt-1 max-w-md text-sm text-ink-2">
          {emVigor
            ? 'Este certificado foi emitido pela Balanças.com e está registrado no sistema da empresa.'
            : cancelado
              ? 'Foi emitido pela Balanças.com, mas depois cancelado. Ele não vale mais.'
              : 'Foi emitido pela Balanças.com, mas depois substituído por uma versão corrigida.'}
        </p>
      </div>

      {!emVigor && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={cn(
            'mx-5 mb-6 flex items-start gap-3 rounded-2xl border p-4 sm:mx-8',
            cancelado ? 'border-danger/30 bg-danger-soft' : 'border-warning/30 bg-warning-soft',
          )}
        >
          <FileX2 className={cn('mt-0.5 h-5 w-5 shrink-0', cancelado ? 'text-danger' : 'text-warning')} />
          <div className="min-w-0 text-[13px]">
            <p className={cn('text-sm font-semibold', cancelado ? 'text-danger' : 'text-warning')}>
              {cancelado ? 'Atenção: certificado CANCELADO' : 'Atenção: certificado SUBSTITUÍDO'}
            </p>
            <p className="mt-1 text-ink-2">
              {cancelado
                ? 'A Balanças.com cancelou este certificado depois de emiti-lo. Ele não serve como comprovante da calibração. Peça à empresa o documento correto.'
                : 'Este certificado foi trocado por uma revisão, um novo certificado que corrige este. Use sempre o mais novo: peça à Balanças.com.'}
            </p>
          </div>
        </motion.div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line px-6 py-6 sm:grid-cols-2 sm:px-8">
        <Dado rotulo="Número do certificado">
          <span className={cn('tnum text-[17px] font-semibold text-ink', !emVigor && 'line-through decoration-2 opacity-80')}>
            {dados.numero}
          </span>
        </Dado>
        <Dado rotulo="Situação">
          <StatusCalibracaoBadge status={status} />
        </Dado>
        <Dado rotulo="Data da calibração">
          <span className="tnum">{dados.dataCalibracao || '—'}</span>
        </Dado>
        <Dado rotulo="Data de emissão">
          <span className="tnum">{dados.dataEmissao || '—'}</span>
        </Dado>
        <Dado rotulo="Cliente" className="sm:col-span-2">
          {dados.cliente}
        </Dado>
        <Dado rotulo="Instrumento calibrado" className="sm:col-span-2">
          {dados.balanca}
        </Dado>
        <Dado rotulo="Número de série">
          <span className="tnum">{dados.numeroSerie || '—'}</span>
        </Dado>
        <Dado rotulo="Código de autenticidade">
          <Codigo>{codigo}</Codigo>
        </Dado>
      </dl>

      {dados.hashPdf && <HashPdf hash={dados.hashPdf} />}
    </>
  )
}

function Dado({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs font-medium text-muted">{rotulo}</dt>
      <dd className="mt-1 text-sm break-words text-ink">{children}</dd>
    </div>
  )
}

function Codigo({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.95em] font-semibold tracking-[0.04em] text-ink">
      {children}
    </span>
  )
}

// ---- Hash do PDF -------------------------------------------------------------------

/**
 * Copia para a área de transferência. Sem conexão segura (http na rede), o navegador pode bloquear
 * `navigator.clipboard`: aí usa o método antigo.
 */
async function copiarTexto(texto: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* tenta o método antigo */
  }
  const campo = document.createElement('textarea')
  campo.value = texto
  campo.setAttribute('readonly', '')
  campo.style.position = 'fixed'
  campo.style.opacity = '0'
  document.body.appendChild(campo)
  campo.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  campo.remove()
  return ok
}

async function sha256(arquivo: File) {
  const resumo = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function HashPdf({ hash }: { hash: string }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const grupos = hash.toLowerCase().match(/.{1,8}/g) ?? [hash]
  // O cálculo no navegador só existe em conexão segura (https ou o próprio computador)
  const podeCalcular = typeof crypto !== 'undefined' && !!crypto.subtle

  const copiar = async () => {
    if (!(await copiarTexto(hash))) return
    setCopiado(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <section className="border-t border-line bg-surface-2/50 px-6 py-5 sm:px-8">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Fingerprint className="h-3.5 w-3.5" />
        Impressão digital do arquivo PDF (SHA-256)
      </h2>
      <div className="mt-2 flex items-start gap-2">
        <code className="min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed break-all text-ink-2">
          {grupos.map((g, i) => (
            <span key={i} className="mr-1.5 inline-block">
              {g}
            </span>
          ))}
        </code>
        <Button
          variante="ghost"
          tamanho="icon-sm"
          onClick={() => void copiar()}
          aria-label={copiado ? 'Copiado' : 'Copiar o código'}
          title={copiado ? 'Copiado' : 'Copiar'}
        >
          {copiado ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Serve para conferir se o arquivo PDF que você recebeu não foi alterado. Esse código é calculado a partir do arquivo
        inteiro: se uma única letra ou número do PDF mudar, o código fica completamente diferente.
      </p>
      {podeCalcular && <ConferirArquivo hash={hash.toLowerCase()} />}
      <details className="group mt-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink-2 select-none hover:text-ink">
          Como conferir no computador
        </summary>
        <p className="mt-2 leading-relaxed">
          No Windows, abra o “Prompt de Comando” na pasta do arquivo e digite{' '}
          <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11.5px] text-ink-2">
            certutil -hashfile Certificado.pdf SHA256
          </code>
          . Se o código que aparecer for igual ao de cima, o arquivo é exatamente o que a Balanças.com emitiu.
        </p>
      </details>
    </section>
  )
}

/** Escolhe o PDF recebido e compara o SHA-256 dele com o registrado. */
function ConferirArquivo({ hash }: { hash: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<
    { tipo: 'nada' } | { tipo: 'calculando' } | { tipo: 'pronto'; igual: boolean; nome: string }
  >({
    tipo: 'nada',
  })

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setEstado({ tipo: 'calculando' })
    try {
      const calculado = await sha256(arquivo)
      setEstado({ tipo: 'pronto', igual: calculado === hash, nome: arquivo.name })
    } catch {
      setEstado({ tipo: 'nada' })
    } finally {
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div className="mt-3">
      <Button
        tamanho="sm"
        icone={
          estado.tipo === 'calculando' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />
        }
        onClick={() => entrada.current?.click()}
        disabled={estado.tipo === 'calculando'}
      >
        Conferir o meu arquivo PDF
      </Button>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void escolher(e.target.files?.[0])}
      />
      <AnimatePresence>
        {estado.tipo === 'pronto' && (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              'mt-2.5 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]',
              estado.igual ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
            )}
          >
            {estado.igual ? <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" /> : <FileX2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="min-w-0 break-words">
              <b className="font-semibold">{estado.igual ? 'Arquivo original.' : 'Arquivo diferente do emitido.'}</b>{' '}
              {estado.igual
                ? `“${estado.nome}” é exatamente o PDF emitido, sem nenhuma alteração.`
                : `“${estado.nome}” não é o PDF deste certificado ou foi alterado depois da emissão.`}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      {/* O arquivo é lido só neste navegador: nada é enviado */}
      <p className="mt-1.5 text-[11.5px] text-muted">O arquivo é conferido aqui mesmo, sem ser enviado para lugar nenhum.</p>
    </div>
  )
}

// ---- Outro código ------------------------------------------------------------------

function OutroCodigo({ inicial, aoConferir }: { inicial: string; aoConferir: (codigo: string) => void }) {
  const [valor, setValor] = useState(inicial)
  const [erro, setErro] = useState('')

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const c = normalizarCodigo(valor)
    if (!FORMATO_CODIGO.test(c)) {
      setErro('O código tem 8 letras e números, como AB12-CD34.')
      return
    }
    setErro('')
    aoConferir(c)
  }

  return (
    <form onSubmit={enviar} className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-xs" noValidate>
      <label htmlFor="verificar-codigo" className="text-[13px] font-medium text-ink-2">
        Conferir outro certificado
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id="verificar-codigo"
          value={valor}
          onChange={(e) => {
            setValor(normalizarCodigo(e.target.value))
            setErro('')
          }}
          placeholder="AB12-CD34"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          aria-invalid={!!erro}
          aria-describedby="verificar-codigo-ajuda"
          className={cn('font-mono tracking-[0.08em] uppercase placeholder:tracking-[0.08em]', erro && 'border-danger!')}
        />
        <Button type="submit" variante="primary" icone={<ArrowRight className="h-4 w-4" />} className="flex-row-reverse">
          Conferir
        </Button>
      </div>
      <p id="verificar-codigo-ajuda" className={cn('mt-1.5 text-xs', erro ? 'font-medium text-danger' : 'text-muted')}>
        {erro || 'O código fica no certificado, perto do QR code.'}
      </p>
    </form>
  )
}
