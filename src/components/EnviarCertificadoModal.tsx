import { CircleAlert, FileImage, FileText, Loader2, Lock, Mail, Paperclip, Send, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIMITE_EMAIL_BYTES, problemaDosAnexos } from '#shared/arquivos.ts'
import { descricaoBalanca, emailValido, formatarDataBr, listaEmails, preencherModelo } from '#shared/dominio.ts'
import type { AnexoEmailDisponivel, Balanca, Calibracao, Cliente } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { tamanhoArquivo } from '../lib/format'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { Button } from './ui/Button'
import { Field, Input, Textarea } from './ui/Form'
import { Modal } from './ui/Modal'

/** "padrão JP-01" / "padrões JP-01 e JP-02" */
function dosPadroes(ids: string[]) {
  if (ids.length <= 1) return `do padrão ${ids[0] ?? ''}`
  return `dos padrões ${ids.slice(0, -1).join(', ')} e ${ids[ids.length - 1]}`
}

/**
 * Envia o PDF do certificado emitido por e-mail, com o assunto e a mensagem do modelo das configurações, e os
 * certificados de calibração dos padrões usados (todos marcados; o PDF do certificado vai sempre).
 */
export function EnviarCertificadoModal({
  aberto,
  aoFechar,
  calibracao,
  cliente,
  balanca,
}: {
  aberto: boolean
  aoFechar: () => void
  calibracao: Calibracao
  cliente: Cliente | undefined
  balanca: Balanca | undefined
}) {
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
    const valores = {
      numero: calibracao.numero,
      empresa: config.empresa.nomeFantasia || config.empresa.razaoSocial,
      cliente: cliente?.nome ?? '',
      balanca: balanca
        ? [descricaoBalanca(balanca), balanca.numeroSerie && `nº de série ${balanca.numeroSerie}`].filter(Boolean).join(', ')
        : '',
      data: formatarDataBr(calibracao.dataCalibracao),
      os: calibracao.ordemServico,
    }
    setPara((p) => p || listaEmails(cliente?.emailCertificados || cliente?.email || '').join(', '))
    setAssunto((a) => a || preencherModelo(config.emailAssunto, valores))
    setTexto((t) => t || preencherModelo(config.emailMensagem, valores))
  }, [aberto, config, calibracao, cliente, balanca])

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
      toast.sucesso(
        'Certificado enviado',
        `Para ${r.para.join(', ')}, com ${r.anexos.length} ${r.anexos.length === 1 ? 'anexo' : 'anexos'}`,
      )
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
        {semEmail && (
          <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              O envio de e-mail ainda não foi configurado.{' '}
              <Link to="/configuracoes?secao=email" className="font-semibold underline underline-offset-2" onClick={aoFechar}>
                Configurar agora
              </Link>
            </p>
          </div>
        )}
        <Field
          label="Para"
          erro={erroPara}
          hint={
            cliente && !cliente.emailCertificados && !cliente.email
              ? 'O cliente não tem e-mail cadastrado.'
              : 'Separe vários e-mails com vírgula.'
          }
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
