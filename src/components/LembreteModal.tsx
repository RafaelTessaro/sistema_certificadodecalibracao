import { ArrowRight, BellRing, MailWarning, RotateCcw, Send } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { emailValido, formatarDataBr, listaEmails, preencherModelo } from '#shared/dominio.ts'
import type { Configuracoes, Vencimento } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { PrazoBadge } from './Selos'
import { Button } from './ui/Button'
import { Field, Input, Textarea } from './ui/Form'
import { Modal } from './ui/Modal'

/** Máximo de destinatários aceito pelo servidor numa mensagem. */
const MAX_DESTINATARIOS = 10

/**
 * Lembrete de calibração para o cliente: uma mensagem com as balanças que vencem, montada a partir do
 * modelo das Configurações (assunto e mensagem) e enviada pelo e-mail da empresa.
 */
export function LembreteModal({
  aberto,
  aoFechar,
  clienteId,
  clienteNome,
  email,
  balancas,
}: {
  aberto: boolean
  aoFechar: () => void
  clienteId: string
  clienteNome: string
  /** E-mails do cliente (os que recebem os certificados), separados por vírgula. */
  email: string
  balancas: Vencimento[]
}) {
  const [enviando, setEnviando] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      icone={<BellRing className="h-5 w-5" />}
      titulo="Enviar lembrete de calibração"
      descricao={
        <>
          Para <span className="font-medium text-ink-2">{clienteNome}</span>: avisa que está chegando a hora de calibrar as
          balanças. Confira o texto antes de enviar.
        </>
      }
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button
            variante="primary"
            type="submit"
            form="form-lembrete"
            disabled={enviando || bloqueado}
            icone={<Send className="h-4 w-4" />}
            aria-busy={enviando}
          >
            {enviando ? 'Enviando…' : 'Enviar lembrete'}
          </Button>
        </>
      }
    >
      {aberto && (
        <FormLembrete
          key={`${clienteId}:${balancas.map((b) => b.balancaId).join(',')}`}
          clienteId={clienteId}
          clienteNome={clienteNome}
          email={email}
          balancas={balancas}
          aoFechar={aoFechar}
          setEnviando={setEnviando}
          setBloqueado={setBloqueado}
        />
      )}
    </Modal>
  )
}

/** "• Balança plataforma Toledo 2096 — 30 kg × 5 g — série 123 — vence em 14/11/2026" */
function linhaBalanca(v: Vencimento) {
  const partes = [v.balancaDescricao]
  if (v.numeroSerie) partes.push(`série ${v.numeroSerie}`)
  if (v.identificacao) partes.push(`TAG ${v.identificacao}`)
  partes.push(`${v.dias < 0 ? 'venceu' : 'vence'} em ${formatarDataBr(v.proximaCalibracao)}`)
  return `• ${partes.join(' — ')}`
}

function textosDoModelo(config: Configuracoes, clienteNome: string, balancas: Vencimento[]) {
  const ordenadas = [...balancas].sort((a, b) => a.proximaCalibracao.localeCompare(b.proximaCalibracao))
  const valores = {
    cliente: clienteNome,
    empresa: config.empresa.nomeFantasia || config.empresa.razaoSocial,
    data: ordenadas[0] ? formatarDataBr(ordenadas[0].proximaCalibracao) : '',
    balancas: ordenadas.map(linhaBalanca).join('\n'),
  }
  return { assunto: preencherModelo(config.lembreteAssunto, valores), texto: preencherModelo(config.lembreteMensagem, valores) }
}

function FormLembrete({
  clienteId,
  clienteNome,
  email,
  balancas,
  aoFechar,
  setEnviando,
  setBloqueado,
}: {
  clienteId: string
  clienteNome: string
  email: string
  balancas: Vencimento[]
  aoFechar: () => void
  setEnviando: (v: boolean) => void
  setBloqueado: (v: boolean) => void
}) {
  const podeConfigurar = usePode('configuracoes')
  const { dados: config } = useConsulta('config', () => api.config().then((r) => r.config), ['config'])
  const { dados: configEmail } = useConsulta('config:email', () => api.configEmail(), ['config'])
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(() => new Set(balancas.map((b) => b.balancaId)))
  const [para, setPara] = useState(() => listaEmails(email).join(', '))
  /** O que a pessoa digitou por cima do modelo (null = segue o modelo). */
  const [assuntoEditado, setAssuntoEditado] = useState<string | null>(null)
  const [textoEditado, setTextoEditado] = useState<string | null>(null)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviandoLocal] = useState(false)

  const escolhidas = useMemo(() => balancas.filter((b) => selecionadas.has(b.balancaId)), [balancas, selecionadas])
  const modelo = useMemo(
    () => (config ? textosDoModelo(config, clienteNome, escolhidas) : null),
    [config, clienteNome, escolhidas],
  )
  const assunto = assuntoEditado ?? modelo?.assunto ?? ''
  const texto = textoEditado ?? modelo?.texto ?? ''
  // A lista de balanças está no texto: se a pessoa mexeu na mensagem, ela não acompanha a seleção
  const textoDesatualizado = textoEditado !== null && !!modelo && modelo.texto !== textoEditado

  const semEmail = configEmail !== undefined && !configEmail.configurado
  const enderecos = listaEmails(para)
  const erroPara = !enderecos.length
    ? 'Informe o e-mail de quem vai receber.'
    : enderecos.length > MAX_DESTINATARIOS
      ? `Envie para no máximo ${MAX_DESTINATARIOS} endereços de uma vez.`
      : (enderecos.filter((e) => !emailValido(e)).map((e) => `E-mail inválido: ${e}`)[0] ?? null)
  const erroAssunto = !assunto.trim() ? 'Informe o assunto.' : null
  const erroTexto = !texto.trim() ? 'Escreva a mensagem.' : null
  const erroSelecao = !escolhidas.length ? 'Escolha pelo menos uma balança.' : null

  const bloqueio = semEmail || !config
  // O botão "Enviar" fica no rodapé da janela (fora do formulário)
  useEffect(() => {
    setBloqueado(bloqueio)
    return () => setBloqueado(false)
  }, [bloqueio, setBloqueado])

  const alternar = (id: string) =>
    setSelecionadas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (enviando || bloqueio || erroPara || erroAssunto || erroTexto || erroSelecao) return
    setEnviandoLocal(true)
    setEnviando(true)
    try {
      const r = await api.enviarLembrete({
        clienteId,
        balancas: escolhidas.map((b) => b.balancaId),
        para: enderecos.join(', '),
        assunto: assunto.trim(),
        texto,
      })
      useTempoReal.getState().mudou('calibracao')
      toast.sucesso('Lembrete enviado', `Para ${r.para.join(', ')}`)
      aoFechar()
    } catch (err) {
      avisarErro('Não foi possível enviar o lembrete', err)
    } finally {
      setEnviandoLocal(false)
      setEnviando(false)
    }
  }

  return (
    <form id="form-lembrete" onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <AnimatePresence initial={false}>
        {semEmail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning-soft px-4 py-3">
              <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0 text-[13px]">
                <p className="font-semibold text-warning">O envio de e-mail ainda não foi configurado</p>
                <p className="mt-0.5 text-ink-2">
                  {podeConfigurar
                    ? 'Informe uma vez os dados do e-mail da empresa (servidor, usuário e senha) e os lembretes passam a sair por ele.'
                    : 'Peça ao administrador para configurar o e-mail da empresa em Configurações → E-mail.'}
                </p>
                {podeConfigurar && (
                  <Link
                    to="/configuracoes?secao=email"
                    onClick={aoFechar}
                    className="mt-1.5 inline-flex items-center gap-1 font-medium text-brand-ink underline-offset-2 hover:underline"
                  >
                    Configurar o e-mail <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {balancas.length > 1 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">
            Balanças no lembrete{' '}
            <span className="font-normal text-muted">
              ({escolhidas.length} de {balancas.length})
            </span>
          </legend>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {balancas.map((b) => {
              const marcada = selecionadas.has(b.balancaId)
              return (
                <li key={b.balancaId}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-2/70',
                      !marcada && 'opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(b.balancaId)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{b.balancaDescricao}</span>
                      <span className="block truncate text-xs text-muted">
                        {[b.numeroSerie && `Série ${b.numeroSerie}`, b.identificacao && `TAG ${b.identificacao}`]
                          .filter(Boolean)
                          .join(' · ') || 'Sem número de série'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-[13px] text-ink-2">{formatarDataBr(b.proximaCalibracao)}</span>
                      <PrazoBadge data={b.proximaCalibracao} className="text-xs" />
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {tentou && erroSelecao && <p className="text-xs font-medium text-danger">{erroSelecao}</p>}
        </fieldset>
      )}

      <Field
        label="Para"
        htmlFor="lembrete-para"
        erro={tentou || para ? erroPara : null}
        hint={
          configEmail?.configurado && configEmail.remetenteEmail
            ? `Separe com vírgula. Sai de ${configEmail.remetenteNome ? `${configEmail.remetenteNome} <${configEmail.remetenteEmail}>` : configEmail.remetenteEmail}.`
            : 'Separe os endereços com vírgula.'
        }
      >
        <Input
          id="lembrete-para"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder="compras@cliente.com.br, qualidade@…"
          value={para}
          onChange={(e) => setPara(e.target.value)}
        />
      </Field>

      <Field label="Assunto" htmlFor="lembrete-assunto" erro={tentou ? erroAssunto : null}>
        <Input
          id="lembrete-assunto"
          maxLength={200}
          disabled={!config}
          placeholder={config ? '' : 'Carregando o modelo…'}
          value={assunto}
          onChange={(e) => setAssuntoEditado(e.target.value)}
        />
      </Field>

      <Field
        label="Mensagem"
        htmlFor="lembrete-texto"
        erro={tentou ? erroTexto : null}
        extra={
          (assuntoEditado !== null || textoEditado !== null) && (
            <button
              type="button"
              onClick={() => {
                setAssuntoEditado(null)
                setTextoEditado(null)
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" /> Voltar ao modelo
            </button>
          )
        }
        hint={
          textoDesatualizado ? (
            <span className="text-warning">
              Você mudou a mensagem: a lista de balanças no texto não acompanha a seleção acima. Use “Voltar ao modelo” para
              refazer.
            </span>
          ) : (
            'O modelo desta mensagem fica em Configurações → Vencimentos e lembretes.'
          )
        }
      >
        <Textarea
          id="lembrete-texto"
          rows={11}
          disabled={!config}
          value={texto}
          onChange={(e) => setTextoEditado(e.target.value)}
          className="min-h-[220px] leading-relaxed"
        />
      </Field>
    </form>
  )
}
