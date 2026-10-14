import { FileBadge2, ImageUp, Loader2, PenLine, Signature, Trash2, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState, type DragEvent } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Form'
import { prepararAssinatura } from './assinatura'

/** O que sai no certificado sobre a pessoa (cadastro e edição do usuário). */
export interface DadosNoCertificado {
  signatario: boolean
  cargo: string
  registro: string
  /** PNG em data URL ou ''. */
  assinatura: string
}

const SUGESTOES_CARGO = [
  'Técnico em metrologia',
  'Técnico de calibração',
  'Responsável técnico',
  'Técnico em eletrônica',
  'Engenheiro mecânico',
  'Engenheiro eletricista',
]

/**
 * Bloco "No certificado" dos formulários de usuário: cargo, registro profissional, a marcação de
 * signatário (quem pode autorizar a emissão) e a assinatura digitalizada.
 */
export function DadosCertificado({
  valor,
  aoMudar,
  nome,
  prefixo,
}: {
  valor: DadosNoCertificado
  aoMudar: (v: Partial<DadosNoCertificado>) => void
  /** Nome da pessoa (para a prévia da assinatura). */
  nome: string
  /** Prefixo dos ids dos campos (dois formulários podem existir na página). */
  prefixo: string
}) {
  const semCargo = valor.signatario && !valor.cargo.trim()
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-2/40 p-4">
      <header className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3/80 text-ink-2">
          <FileBadge2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">No certificado</h3>
          <p className="text-[13px] text-muted">Como a pessoa aparece nos certificados que fizer ou autorizar.</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cargo ou função" htmlFor={`${prefixo}-cargo`} hint="Sai no certificado, abaixo do nome.">
          <Input
            id={`${prefixo}-cargo`}
            list={`${prefixo}-cargos`}
            maxLength={80}
            autoComplete="off"
            placeholder="Ex.: Técnico em metrologia"
            value={valor.cargo}
            onChange={(e) => aoMudar({ cargo: e.target.value })}
          />
          <datalist id={`${prefixo}-cargos`}>
            {SUGESTOES_CARGO.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field
          label={
            <>
              Registro profissional <span className="font-normal text-muted">(opcional)</span>
            </>
          }
          htmlFor={`${prefixo}-registro`}
          hint="Conselho e número, se a pessoa tiver."
        >
          <Input
            id={`${prefixo}-registro`}
            maxLength={60}
            autoComplete="off"
            placeholder="Ex.: CREA-SP 123456/D ou CFT 12345678"
            value={valor.registro}
            onChange={(e) => aoMudar({ registro: e.target.value })}
          />
        </Field>
      </div>

      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-150',
          'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]',
          valor.signatario
            ? 'border-brand bg-brand-soft/50 ring-4 ring-[var(--ring)]/40'
            : 'border-line-strong/80 bg-surface hover:border-line-strong',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            valor.signatario ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2',
          )}
        >
          <PenLine className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Signatário: pode autorizar a emissão de certificados</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">
            O signatário revisa a calibração e autoriza o certificado, que sai com o nome dele. Marque só quem tem conhecimento
            técnico para responder pelos resultados, como o responsável técnico.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={valor.signatario}
          onChange={(e) => aoMudar({ signatario: e.target.checked })}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
            valor.signatario ? 'bg-brand' : 'bg-line-strong',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-xs transition-[transform,background-color] duration-150',
              valor.signatario ? 'translate-x-4 bg-on-brand' : 'bg-surface dark:bg-muted',
            )}
          />
        </span>
      </label>

      <AnimatePresence initial={false}>
        {semCargo && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="-mt-1 flex items-start gap-2 overflow-hidden rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Informe o cargo: ele sai no certificado junto do nome de quem autoriza.
          </motion.p>
        )}
      </AnimatePresence>

      <CampoAssinatura
        valor={valor.assinatura}
        aoMudar={(assinatura) => aoMudar({ assinatura })}
        nome={nome}
        cargo={valor.cargo}
        registro={valor.registro}
      />
    </section>
  )
}

/** Envio da imagem da assinatura, com a prévia e o botão de remover. */
function CampoAssinatura({
  valor,
  aoMudar,
  nome,
  cargo,
  registro,
}: {
  valor: string
  aoMudar: (v: string) => void
  nome: string
  cargo: string
  registro: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [preparando, setPreparando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)

  const receber = async (arquivo: File | undefined) => {
    if (!arquivo || preparando) return
    setErro('')
    setPreparando(true)
    try {
      aoMudar(await prepararAssinatura(arquivo))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível usar esta imagem.')
    } finally {
      setPreparando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    void receber(e.dataTransfer.files[0])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium text-ink-2">
        Assinatura digitalizada <span className="font-normal text-muted">(opcional)</span>
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={cn(
          'flex flex-col gap-3 rounded-xl border border-dashed p-3 transition-colors sm:flex-row sm:items-center',
          arrastando ? 'border-brand bg-brand-soft/40' : 'border-line-strong bg-surface',
        )}
      >
        {/* Prévia: no tema escuro a tinta é invertida para continuar visível */}
        <div className="flex min-h-[112px] min-w-0 flex-1 flex-col items-center justify-end rounded-lg bg-surface-2/60 px-4 pt-3 pb-2.5 text-center">
          {preparando ? (
            <span className="m-auto flex items-center gap-2 text-[13px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparando a imagem…
            </span>
          ) : valor ? (
            <img
              src={valor}
              alt={`Assinatura de ${nome || 'usuário'}`}
              className="max-h-16 max-w-full object-contain dark:[filter:invert(1)_hue-rotate(180deg)]"
            />
          ) : (
            <span className="m-auto flex flex-col items-center gap-1 text-[13px] text-muted">
              <Signature className="h-6 w-6" strokeWidth={1.6} />
              Nenhuma assinatura enviada
            </span>
          )}
          <span className="mt-1.5 w-full max-w-[260px] border-t border-ink/30 pt-1.5">
            <span className="block truncate text-[12px] font-medium text-ink">{nome.trim() || 'Nome da pessoa'}</span>
            <span className="block truncate text-[11px] text-muted">
              {[cargo.trim() || 'Cargo', registro.trim()].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
          <Button
            tamanho="sm"
            icone={<ImageUp className="h-3.5 w-3.5" />}
            onClick={() => entrada.current?.click()}
            disabled={preparando}
          >
            {valor ? 'Trocar imagem' : 'Enviar imagem'}
          </Button>
          {valor && (
            <Button
              tamanho="sm"
              variante="ghost"
              icone={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                aoMudar('')
                setErro('')
              }}
              disabled={preparando}
            >
              Remover
            </Button>
          )}
        </div>
        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => void receber(e.target.files?.[0])}
        />
      </div>
      {erro ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {erro}
        </p>
      ) : (
        <p className="text-xs text-muted">
          PNG ou JPG. Assine com caneta escura numa folha branca e tire uma foto bem de perto (ou escaneie). O sistema recorta,
          tira o fundo do papel e reduz a imagem sozinho. Sem imagem, o certificado sai só com o nome.
        </p>
      )}
    </div>
  )
}
