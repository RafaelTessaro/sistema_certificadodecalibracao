import { BadgeCheck, CircleAlert, FileImage, FileText, Loader2, Lock, Mail, Paperclip, Send, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIMITE_EMAIL_BYTES, problemaDosAnexos } from '#shared/arquivos.ts'
import { emailValido, listaEmails, paraSugerido, preencherModelo, textoAssinaturaDigitalEmail } from '#shared/dominio.ts'
import type { AnexoEmailDisponivel, Balanca, Calibracao, Cliente } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { comParagrafoAntesDoFim, valoresDoEmail } from '../lib/emailCertificado'
import { mostrarEnvio } from '../lib/envioEmail'
import { tamanhoArquivo } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { assinadoDigitalmente } from './certificadoDigital/textos'
import { Button } from './ui/Button'
import { Field, Input, Textarea } from './ui/Form'
import { Modal } from './ui/Modal'

/**
 * O envio de e-mail ainda não foi configurado: quem pode abrir as Configurações (o administrador) vai direto para a seção
 * E-mail; o operador, que não abre Configurações, é avisado para pedir ao administrador (como no lembrete).
 */
export function AvisoEmailNaoConfigurado({ podeConfigurar, aoFechar }: { podeConfigurar: boolean; aoFechar?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        O envio de e-mail ainda não foi configurado.{' '}
        {podeConfigurar ? (
          <Link to="/configuracoes?secao=email" className="font-semibold underline underline-offset-2" onClick={aoFechar}>
            Configurar agora
          </Link>
        ) : (
          'Peça ao administrador para configurar o e-mail da empresa em Configurações → E-mail.'
        )}
      </p>
    </div>
  )
}

/**
 * Certificado assinado digitalmente com o modelo da mensagem sem {assinaturaDigital} (mudado pela empresa antes da 1.0.7):
 * a dica, com o botão que põe o parágrafo de como conferir a assinatura nesta mensagem. Quem pode abrir as Configurações
 * vai ao modelo; o operador é avisado para pedir ao administrador.
 */
export function DicaAssinaturaDigital({
  calibracao,
  modelo,
  texto,
  podeConfigurar,
  aoIncluir,
  aoFechar,
}: {
  calibracao: Pick<Calibracao, 'emissao'>
  /** O modelo da mensagem nas configurações. */
  modelo: string
  /** A mensagem como está agora. */
  texto: string
  podeConfigurar: boolean
  aoIncluir: (paragrafo: string) => void
  aoFechar?: () => void
}) {
  const assinatura = calibracao.emissao?.assinaturaDigital
  // Só o já assinado (o que aguarda a assinatura nem pode ser enviado, e "está assinado" não seria verdade)
  if (!assinatura || !assinadoDigitalmente(calibracao.emissao!) || modelo.includes('{assinaturaDigital}')) return null
  const paragrafo = textoAssinaturaDigitalEmail(assinatura)
  if (texto.includes(paragrafo)) return null
  return (
    <div className="-mt-2 flex items-start gap-2.5 rounded-xl bg-brand-soft/60 px-3.5 py-2.5 text-[13px] text-ink-2">
      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" />
      <div className="min-w-0">
        <p>
          Este certificado está assinado digitalmente, mas a mensagem não diz ao cliente como conferir a assinatura.{' '}
          <button
            type="button"
            onClick={() => aoIncluir(paragrafo)}
            className="cursor-pointer font-semibold text-brand-ink underline underline-offset-2"
          >
            Incluir na mensagem
          </button>
        </p>
        <p className="mt-1 text-xs text-muted">
          {podeConfigurar ? (
            <>
              Para os próximos, inclua <code className="font-mono">{'{assinaturaDigital}'}</code> no modelo, em{' '}
              <Link to="/configuracoes?secao=vencimentos" className="font-medium underline underline-offset-2" onClick={aoFechar}>
                Configurações → Vencimentos e lembretes
              </Link>
              .
            </>
          ) : (
            <>
              Peça ao administrador para incluir <code className="font-mono">{'{assinaturaDigital}'}</code> no modelo do e-mail.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

/** "padrão JP-01" / "padrões JP-01 e JP-02" */
function dosPadroes(ids: string[]) {
  if (ids.length <= 1) return `do padrão ${ids[0] ?? ''}`
  return `dos padrões ${ids.slice(0, -1).join(', ')} e ${ids[ids.length - 1]}`
}

/**
 * Envia o PDF do certificado emitido por e-mail, com o assunto e a mensagem do modelo das configurações, e os
 * certificados de calibração dos padrões usados (todos marcados; o PDF do certificado vai sempre). O "Para" vem
 * dos e-mails do cadastro atual do cliente (`emailsCliente`); o resto da mensagem, do certificado (`cliente`).
 */
export function EnviarCertificadoModal({
  aberto,
  aoFechar,
  calibracao,
  cliente,
  emailsCliente,
  balanca,
}: {
  aberto: boolean
  aoFechar: () => void
  calibracao: Calibracao
  cliente: Cliente | undefined
  /** Os e-mails do cadastro atual do cliente; ausente, os de `cliente`. */
  emailsCliente?: Pick<Cliente, 'email' | 'emailCertificados'> | null
  balanca: Balanca | undefined
}) {
  const contatos = emailsCliente ?? cliente
  const podeConfigurar = usePode('configuracoes')
  const sugerido = paraSugerido(contatos)
  const { dados: config } = useConsulta(aberto ? 'config' : null, () => api.config().then((r) => r.config), ['config'])
  const { dados: email } = useConsulta(aberto ? 'config:email' : null, () => api.configEmail(), ['config'])
  const {
    dados: dadosAnexos,
    carregando: carregandoAnexos,
    erro: erroAnexos,
  } = useConsulta(aberto ? `anexos:${calibracao.id}` : null, () => api.anexosEmail(calibracao.id), ['calibracao', 'padrao'])
  const [para, setPara] = useState('')
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroPara, setErroPara] = useState('')
  /** Anexos que a pessoa desmarcou (todos começam marcados). */
  const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(() => new Set())

  // Preenche ao abrir (e quando as configurações chegam), sem apagar o que já foi digitado
  useEffect(() => {
    if (!aberto || !config) return
    const valores = valoresDoEmail(config, calibracao, cliente, balanca)
    setPara((p) => p || sugerido)
    setAssunto((a) => a || preencherModelo(config.emailAssunto, valores))
    setTexto((t) => t || preencherModelo(config.emailMensagem, valores))
  }, [aberto, config, calibracao, cliente, balanca, sugerido])

  useEffect(() => {
    if (aberto) return
    setPara('')
    setAssunto('')
    setTexto('')
    setErroPara('')
    setDesmarcados(new Set())
  }, [aberto])

  const anexos = dadosAnexos?.anexos ?? []
  const escolhidos = anexos.filter((a) => a.obrigatorio || !desmarcados.has(a.id))
  const total = escolhidos.reduce((s, a) => s + a.tamanho, 0)
  const problemaAnexos = dadosAnexos ? problemaDosAnexos(escolhidos.length, total) : null
  const semArquivo = dadosAnexos?.semArquivo ?? []

  const alternar = (id: string) =>
    setDesmarcados((d) => {
      const novo = new Set(d)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const enviar = async () => {
    const lista = listaEmails(para)
    if (!lista.length) return setErroPara('Informe ao menos um e-mail (separe vários com vírgula).')
    const invalido = lista.find((e) => !emailValido(e))
    if (invalido) return setErroPara(`E-mail inválido: ${invalido}`)
    if (problemaAnexos) return toast.erro('Confira os anexos', problemaAnexos)
    setEnviando(true)
    try {
      const r = await api.enviarCertificado(calibracao.id, {
        para: lista.join(', '),
        assunto,
        texto,
        anexos: escolhidos.map((a) => a.id),
      })
      useTempoReal.getState().mudou('calibracao')
      // O servidor de e-mail pode recusar parte dos endereços (e entregar aos outros): aviso, não sucesso
      mostrarEnvio(r, {
        titulo: 'Certificado enviado',
        detalhe: `com ${r.anexos.length} ${r.anexos.length === 1 ? 'anexo' : 'anexos'}`,
      })
      aoFechar()
    } catch (e) {
      avisarErro('Não foi possível enviar o e-mail', e)
    } finally {
      setEnviando(false)
    }
  }

  const semEmail = email && !email.configurado
  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !enviando && aoFechar()}
      titulo="Enviar certificado por e-mail"
      descricao={`Certificado nº ${calibracao.numero}`}
      icone={<Mail className="h-5 w-5" />}
      largura="max-w-xl"
      rodape={
        <>
          <Button onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variante="primary"
            icone={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            onClick={enviar}
            disabled={enviando || !!semEmail || !config || !dadosAnexos || !!problemaAnexos}
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {semEmail && <AvisoEmailNaoConfigurado podeConfigurar={podeConfigurar} aoFechar={aoFechar} />}
        <Field
          label="Para"
          erro={erroPara}
          hint={contatos && !sugerido ? 'O cliente não tem e-mail cadastrado.' : 'Separe vários e-mails com vírgula.'}
        >
          <Input
            value={para}
            onChange={(e) => {
              setPara(e.target.value)
              setErroPara('')
            }}
            placeholder="cliente@empresa.com.br"
            autoFocus
          />
        </Field>
        <Field label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Mensagem">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} />
        </Field>
        {config && (
          <DicaAssinaturaDigital
            calibracao={calibracao}
            modelo={config.emailMensagem}
            texto={texto}
            podeConfigurar={podeConfigurar}
            aoIncluir={(p) => setTexto((t) => comParagrafoAntesDoFim(t, p))}
            aoFechar={aoFechar}
          />
        )}

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 flex w-full items-center justify-between gap-3 text-[13px] font-medium text-ink-2">
            <span className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-muted" />
              Anexos
            </span>
            {dadosAnexos && (
              <span className={cn('tnum text-xs font-normal', problemaAnexos ? 'font-medium text-danger' : 'text-muted')}>
                {escolhidos.length} de {anexos.length} · {tamanhoArquivo(total)} de {tamanhoArquivo(LIMITE_EMAIL_BYTES)}
              </span>
            )}
          </legend>
          {carregandoAnexos && !dadosAnexos ? (
            <div className="flex items-center gap-2 rounded-xl border border-line px-3.5 py-3 text-[13px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparando os anexos…
            </div>
          ) : erroAnexos && !dadosAnexos ? (
            <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger">{erroAnexos}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {anexos.map((a) => (
                <LinhaAnexo
                  key={a.id}
                  anexo={a}
                  marcado={a.obrigatorio || !desmarcados.has(a.id)}
                  aoAlternar={() => alternar(a.id)}
                  desabilitado={enviando}
                />
              ))}
            </ul>
          )}
          {semArquivo.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0">
                {semArquivo.length === 1
                  ? 'Sem o arquivo do certificado do padrão '
                  : 'Sem o arquivo do certificado dos padrões '}
                <b className="font-semibold">
                  {semArquivo
                    .map((p) => (p.certificado ? `${p.identificacao} (nº ${p.certificado})` : p.identificacao))
                    .join(', ')}
                </b>
                : {semArquivo.length === 1 ? 'ele não vai' : 'eles não vão'} no e-mail.{' '}
                <Link to="/padroes" className="font-semibold underline underline-offset-2" onClick={aoFechar}>
                  Anexar em Padrões
                </Link>
              </p>
            </div>
          )}
          {problemaAnexos && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              {problemaAnexos}
            </p>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}

function LinhaAnexo({
  anexo: a,
  marcado,
  aoAlternar,
  desabilitado,
}: {
  anexo: AnexoEmailDisponivel
  marcado: boolean
  aoAlternar: () => void
  desabilitado: boolean
}) {
  const Icone = a.tipo.startsWith('image/') ? FileImage : FileText
  return (
    <li>
      <label
        className={cn(
          'flex items-center gap-3 px-3.5 py-2.5 transition-colors',
          a.obrigatorio ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2/70',
          !marcado && 'opacity-60',
        )}
      >
        <input
          type="checkbox"
          checked={marcado}
          disabled={a.obrigatorio || desabilitado}
          onChange={aoAlternar}
          className="h-4 w-4 shrink-0 accent-[var(--brand)] disabled:opacity-60"
        />
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            a.obrigatorio ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-2',
          )}
        >
          <Icone className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink" title={a.nome}>
            {a.nome}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-muted">
            {a.obrigatorio ? (
              <>
                <Lock className="h-3 w-3 shrink-0" /> Certificado de calibração · vai sempre
              </>
            ) : (
              `Certificado de calibração ${dosPadroes(a.padroes)}`
            )}
          </span>
        </span>
        <span className="tnum shrink-0 text-xs text-muted">{tamanhoArquivo(a.tamanho)}</span>
      </label>
    </li>
  )
}
