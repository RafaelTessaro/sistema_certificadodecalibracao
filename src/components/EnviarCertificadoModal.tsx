import { CircleAlert, FileText, Loader2, Mail, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { descricaoBalanca, emailValido, formatarDataBr, listaEmails, nomeArquivoCertificado, preencherModelo } from '#shared/dominio.ts'
import type { Balanca, Calibracao, Cliente } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { Button } from './ui/Button'
import { Field, Input, Textarea } from './ui/Form'
import { Modal } from './ui/Modal'

/** Envia o PDF do certificado emitido por e-mail, com o assunto e a mensagem do modelo das configurações. */
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
  const [para, setPara] = useState('')
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroPara, setErroPara] = useState('')

  // Preenche ao abrir (e quando as configurações chegam), sem apagar o que já foi digitado
  useEffect(() => {
    if (!aberto || !config) return
    const valores = {
      numero: calibracao.numero,
      empresa: config.empresa.nomeFantasia || config.empresa.razaoSocial,
      cliente: cliente?.nome ?? '',
      balanca: balanca ? [descricaoBalanca(balanca), balanca.numeroSerie && `nº de série ${balanca.numeroSerie}`].filter(Boolean).join(', ') : '',
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
  }, [aberto])

  const enviar = async () => {
    const lista = listaEmails(para)
    if (!lista.length) return setErroPara('Informe ao menos um e-mail (separe vários com vírgula).')
    const invalido = lista.find((e) => !emailValido(e))
    if (invalido) return setErroPara(`E-mail inválido: ${invalido}`)
    setEnviando(true)
    try {
      const r = await api.enviarCertificado(calibracao.id, { para: lista.join(', '), assunto, texto })
      useTempoReal.getState().mudou('calibracao')
      toast.sucesso('Certificado enviado', `Para ${r.para.join(', ')}`)
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
            disabled={enviando || !!semEmail || !config}
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
              <Link to="/configuracoes" className="font-semibold underline underline-offset-2" onClick={aoFechar}>
                Configurar agora
              </Link>
            </p>
          </div>
        )}
        <Field
          label="Para"
          erro={erroPara}
          hint={cliente && !cliente.emailCertificados && !cliente.email ? 'O cliente não tem e-mail cadastrado.' : 'Separe vários e-mails com vírgula.'}
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
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} />
        </Field>
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-[13px] text-ink-2">
          <FileText className="h-4 w-4 shrink-0 text-danger" />
          <span className="truncate">{nomeArquivoCertificado(calibracao.numero)}</span>
          <span className="ml-auto shrink-0 text-xs text-muted">anexo</span>
        </div>
      </div>
    </Modal>
  )
}
