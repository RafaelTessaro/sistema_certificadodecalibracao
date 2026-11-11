// Configurações → Certificado digital (só o administrador): o certificado digital ICP-Brasil da empresa (e-CNPJ A1 ou
// SE-S) que assina os certificados de calibração emitidos. Instalar e trocar em dois passos (Conferir → Instalar), de
// qualquer computador da rede: o .pfx e as senhas vão cifrados pelo navegador (lib/cifraPacote.ts, carregado só aqui, sob
// demanda), e a tela recomenda fazer no próprio servidor.

import {
  ChevronDown,
  FileKey2,
  FileUp,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { mascaraCnpj } from '#shared/documentos.ts'
import type { CertificadoDigitalPublico, RegistroCertificadoDigital } from '#shared/tipos.ts'
import { api, ErroApi, type CertificadoDigitalAdmin, type RespostaCertificadoDigital } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useConsulta } from '../../lib/consulta'
import { dataCurta, dataHora } from '../../lib/format'
import { useTempoReal } from '../../store/tempoReal'
import { avisarErro, toast } from '../../store/ui'
import { CampoSenha } from '../sessao/CampoSenha'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { avisoAoRemover, diasRestantes, impressaoCurta, seloDaSituacao, TEXTOS_INSTALAR } from './textos'

const TOM_AVISO = {
  aviso: 'border-warning/25 bg-warning-soft text-warning',
  perigo: 'border-danger/25 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
  neutro: 'border-line bg-surface-2/60 text-ink-2',
}

function Aviso({ tom = 'neutro', icone, children }: { tom?: keyof typeof TOM_AVISO; icone?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug', TOM_AVISO[tom])}>
      {icone && <span className="mt-px flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icone}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Os dados do certificado (no cartão e na conferência). */
function Dados({ c }: { c: CertificadoDigitalPublico }) {
  const linhas: Array<[string, ReactNode]> = [
    ['Titular', c.titular],
    [
      'CNPJ',
      c.cnpj ? (
        <span className="tnum" key="c">
          {mascaraCnpj(c.cnpj)}
        </span>
      ) : (
        '—'
      ),
    ],
    ['Tipo', c.tipo === 'SE-S' ? 'SE-S (selo eletrônico)' : c.tipo === 'A1' ? 'A1 (arquivo)' : '—'],
    ['Autoridade certificadora', c.emissor || '—'],
    [
      'Validade',
      <span className="tnum" key="v">
        {dataCurta(c.validoDe)} a {dataCurta(c.validoAte)}
        {c.diasParaVencer !== undefined && <span className="text-muted"> · {diasRestantes(c.diasParaVencer, c.validoAte)}</span>}
      </span>,
    ],
    [
      'Impressão digital',
      <span className="font-mono text-[12.5px]" title={c.sha256} key="i">
        {impressaoCurta(c.sha256)}
      </span>,
    ],
  ]
  if (c.instaladoEm) linhas.push(['Instalado', `${dataHora(c.instaladoEm)}${c.instaladoPor ? ` por ${c.instaladoPor}` : ''}`])
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-xs text-muted">{rotulo}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words text-ink">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Pede a chave de envio e cifra o conteúdo (o módulo de cifra é carregado só agora). */
async function cifrar(conteudo: Record<string, unknown>) {
  const [{ cifrarPacote }, chave] = await Promise.all([import('../../lib/cifraPacote'), api.chaveCertificadoDigital()])
  return cifrarPacote(chave, conteudo)
}

const ehAdmin = (r: RespostaCertificadoDigital | undefined): r is RespostaCertificadoDigital & CertificadoDigitalAdmin =>
  !!r && Array.isArray(r.historico)

export function SecaoCertificadoDigital() {
  const { dados, carregando, erro, recarregar, definir } = useConsulta('certificado-digital', () => api.certificadoDigital(), [
    'config',
  ])
  const [instalando, setInstalando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)

  const atualizar = (r: CertificadoDigitalAdmin) => {
    definir({ ...r, noServidor: dados?.noServidor })
    useTempoReal.getState().mudou('config')
  }

  const c = ehAdmin(dados) ? dados.certificado : null
  const noServidor = dados?.noServidor ?? false
  const anteriores = ehAdmin(dados) ? dados.historico.filter((h) => h.removidoEm) : []
  const selo = c && c.situacao !== 'SEM_CERTIFICADO' ? seloDaSituacao(c) : null

  return (
    <>
      <Card>
        <CardHeader
          icone={<FileKey2 className="h-4 w-4" />}
          titulo="Certificado digital"
          descricao="O certificado digital ICP-Brasil da empresa assina cada certificado de calibração emitido."
          acoes={selo && <Badge tom={selo.tom}>{selo.texto}</Badge>}
        />
        <div className="flex flex-col gap-4 border-t border-line px-5 py-5">
          {carregando ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-3 w-56 animate-pulse rounded-full bg-surface-3" />
              <div className="h-3 w-80 animate-pulse rounded-full bg-surface-2" />
            </div>
          ) : erro && !dados ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-danger">{erro}</p>
              <Button tamanho="sm" icone={<RefreshCw className="h-3.5 w-3.5" />} onClick={recarregar}>
                Tentar de novo
              </Button>
            </div>
          ) : !c || c.situacao === 'SEM_CERTIFICADO' ? (
            <>
              <p className="text-sm text-ink-2">
                Nenhum certificado digital instalado. Os certificados saem sem assinatura digital, com as imagens das assinaturas.
              </p>
              <div>
                <Button variante="primary" icone={<Upload className="h-4 w-4" />} onClick={() => setInstalando(true)}>
                  Instalar certificado
                </Button>
              </div>
            </>
          ) : (
            <>
              {c.titular ? <Dados c={c} /> : null}
              {c.avisos.map((a) => (
                <Aviso
                  key={a}
                  tom={c.situacao === 'OK' || c.situacao === 'VENCENDO' ? 'aviso' : 'perigo'}
                  icone={<TriangleAlert />}
                >
                  {a}
                </Aviso>
              ))}
              {(c.situacao === 'OK' || c.situacao === 'VENCENDO') && (
                <Aviso tom="info" icone={<ShieldCheck />}>
                  Todo certificado emitido sai assinado digitalmente com este certificado, sem as imagens das assinaturas.
                </Aviso>
              )}
              {(c.situacao === 'VENCIDO' ||
                c.situacao === 'NAO_ABRE' ||
                c.situacao === 'CNPJ_DIFERENTE' ||
                c.situacao === 'EMPRESA_SEM_CNPJ' ||
                c.situacao === 'AINDA_NAO_VALE') && (
                <Aviso tom="perigo" icone={<ShieldAlert />}>
                  Enquanto isso não for resolvido, o sistema não emite certificados (nenhum sai sem a assinatura digital).
                </Aviso>
              )}
              <div className="flex flex-wrap gap-2">
                <Button icone={<FileUp className="h-4 w-4" />} onClick={() => setInstalando(true)}>
                  Trocar certificado
                </Button>
                <Button variante="ghost" icone={<Trash2 className="h-4 w-4" />} onClick={() => setRemovendo(true)}>
                  Remover
                </Button>
              </div>
            </>
          )}
        </div>
        {anteriores.length > 0 && (
          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => setVerHistorico((v) => !v)}
              aria-expanded={verHistorico}
              className="flex w-full cursor-pointer items-center gap-2 px-5 py-3 text-left text-[13px] font-medium text-ink-2 hover:bg-surface-2/60"
            >
              <History className="h-4 w-4 text-muted" />
              <span className="flex-1">Certificados anteriores ({anteriores.length})</span>
              <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', verHistorico && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {verHistorico && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="divide-y divide-line overflow-hidden border-t border-line"
                >
                  {anteriores.map((h) => (
                    <ItemHistorico key={h.sha256} h={h} />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </Card>

      <ModalInstalar
        aberto={instalando}
        trocar={!!c && c.situacao !== 'SEM_CERTIFICADO'}
        noServidor={noServidor}
        aoFechar={() => setInstalando(false)}
        aoInstalar={(r) => {
          atualizar(r)
          setInstalando(false)
        }}
      />
      <ModalRemover
        aberto={removendo}
        titular={c?.titular}
        aoFechar={() => setRemovendo(false)}
        aoRemover={(r) => {
          atualizar(r)
          setRemovendo(false)
        }}
      />
    </>
  )
}

function ItemHistorico({ h }: { h: RegistroCertificadoDigital }) {
  return (
    <li className="flex flex-col gap-0.5 px-5 py-3 text-[13px]">
      <p className="font-medium text-ink">
        {h.titular} <span className="font-normal text-muted">· série {h.serie}</span>
      </p>
      <p className="tnum text-xs text-muted">
        Válido de {dataCurta(h.validoDe)} a {dataCurta(h.validoAte)} · instalado em {dataCurta(h.instaladoEm)}
        {h.removidoEm && (
          <>
            {' · '}
            {h.motivo === 'SUBSTITUIDO' ? 'substituído' : 'removido'} em {dataCurta(h.removidoEm)}
            {h.removidoPor ? ` por ${h.removidoPor}` : ''}
          </>
        )}
      </p>
    </li>
  )
}

/** A recomendação de instalar no próprio servidor (a rede usa HTTP sem criptografia). */
function AvisoRede({ noServidor }: { noServidor: boolean }) {
  if (noServidor)
    return (
      <Aviso tom="info" icone={<ShieldCheck />}>
        Você está no próprio servidor: o arquivo não passa pela rede.
      </Aviso>
    )
  const porta = typeof location !== 'undefined' ? location.port : ''
  return (
    <Aviso tom="aviso" icone={<ShieldAlert />}>
      Na rede da empresa a conexão não é criptografada. O arquivo e as senhas vão cifrados pelo navegador, mas o mais seguro é
      instalar no próprio servidor (<span className="font-mono">http://localhost{porta ? `:${porta}` : ''}</span>) ou por acesso
      remoto a ele.
    </Aviso>
  )
}

/** O nome da senha de quem instala ou remove é o do campo ("A sua senha do sistema"), também nas mensagens do servidor. */
const MSG_SEM_SENHA_SISTEMA = 'Digite a sua senha do sistema.'

/** A recusa da senha do sistema (em branco ou errada; não a do .pfx): vai para embaixo do campo dela. */
const eSenhaDoSistema = (e: unknown): e is ErroApi => e instanceof ErroApi && e.dados.codigo === 'SENHA_ATUAL'

function ModalInstalar({
  aberto,
  trocar,
  noServidor,
  aoFechar,
  aoInstalar,
}: {
  aberto: boolean
  trocar: boolean
  noServidor: boolean
  aoFechar: () => void
  aoInstalar: (r: CertificadoDigitalAdmin) => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [senha, setSenha] = useState('')
  const [senhaAdmin, setSenhaAdmin] = useState('')
  const [conferido, setConferido] = useState<CertificadoDigitalPublico | null>(null)
  const [ocupado, setOcupado] = useState<'' | 'conferir' | 'instalar'>('')
  const [erro, setErro] = useState('')
  // A senha do sistema errada (ou em branco) aparece embaixo do campo dela: o modal tem duas senhas
  const [erroSenhaAdmin, setErroSenhaAdmin] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  const limpar = () => {
    setArquivo(null)
    setSenha('')
    setSenhaAdmin('')
    setConferido(null)
    setErro('')
    setErroSenhaAdmin('')
    if (entrada.current) entrada.current.value = ''
  }
  const fechar = () => {
    if (ocupado) return
    limpar()
    aoFechar()
  }
  // O campo do arquivo volta vazio (é montado de novo): o arquivo e a senha dele também, para o próximo "Conferir" não usar
  // um arquivo que a tela não mostra
  const voltar = () => {
    setArquivo(null)
    setSenha('')
    setConferido(null)
    setErro('')
  }

  /** O conteúdo cifrado: o .pfx, a senha dele e a senha de quem está instalando. */
  const pacote = async () => {
    if (!arquivo) throw new ErroApi(400, 'Escolha o arquivo do certificado (.pfx ou .p12).')
    if (arquivo.size > 64 * 1024) throw new ErroApi(400, 'O arquivo passa de 64 KB: não parece um certificado .pfx.')
    const { base64DosBytes } = await import('../../lib/cifraPacote')
    return cifrar({ pfx: base64DosBytes(new Uint8Array(await arquivo.arrayBuffer())), senha, senhaAdmin })
  }

  const conferir = async (e: FormEvent) => {
    e.preventDefault()
    if (!arquivo) return setErro('Escolha o arquivo do certificado (.pfx ou .p12).')
    if (!senha) return setErro('Digite a senha do arquivo do certificado.')
    setErro('')
    if (!senhaAdmin) return setErroSenhaAdmin(MSG_SEM_SENHA_SISTEMA)
    setOcupado('conferir')
    setErroSenhaAdmin('')
    try {
      const r = await api.conferirCertificadoDigital(await pacote())
      setConferido(r.certificado)
    } catch (e) {
      if (eSenhaDoSistema(e)) setErroSenhaAdmin(e.message)
      else setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setOcupado('')
    }
  }

  const instalar = async () => {
    setOcupado('instalar')
    setErro('')
    try {
      const r = await api.instalarCertificadoDigital(await pacote())
      toast.sucesso(
        trocar ? 'Certificado digital trocado' : 'Certificado digital instalado',
        'A partir de agora, todo certificado emitido sai assinado digitalmente com este certificado.',
      )
      limpar()
      aoInstalar(r)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
      if (e instanceof ErroApi && e.status !== 400) avisarErro('Não foi possível instalar o certificado', e)
    } finally {
      setOcupado('')
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      largura="max-w-xl"
      icone={<FileKey2 className="h-5 w-5" />}
      titulo={trocar ? 'Trocar o certificado digital' : 'Instalar o certificado digital'}
      descricao={conferido ? 'Confira os dados. Se estiverem certos, instale.' : TEXTOS_INSTALAR.descricao}
      rodape={
        conferido ? (
          <>
            <Button variante="ghost" onClick={voltar} disabled={!!ocupado}>
              Voltar
            </Button>
            <Button
              variante="primary"
              onClick={() => void instalar()}
              disabled={!!ocupado}
              icone={ocupado === 'instalar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            >
              {ocupado === 'instalar' ? 'Instalando…' : 'Instalar'}
            </Button>
          </>
        ) : (
          <>
            <Button variante="ghost" onClick={fechar} disabled={!!ocupado}>
              Cancelar
            </Button>
            <Button
              variante="primary"
              type="submit"
              form="form-certificado-digital"
              disabled={!!ocupado}
              icone={ocupado === 'conferir' ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {ocupado === 'conferir' ? 'Conferindo…' : 'Conferir'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {conferido ? (
          <>
            <Dados c={conferido} />
            {conferido.avisos.map((a) => (
              <Aviso key={a} tom="aviso" icone={<TriangleAlert />}>
                {a}
              </Aviso>
            ))}
          </>
        ) : (
          <form id="form-certificado-digital" onSubmit={(e) => void conferir(e)} className="flex flex-col gap-4">
            <AvisoRede noServidor={noServidor} />
            <Field
              label="Arquivo do certificado"
              htmlFor="cd-arquivo"
              hint="Arquivo .pfx ou .p12, exportado com a chave privada."
            >
              <input
                id="cd-arquivo"
                ref={entrada}
                type="file"
                accept=".pfx,.p12,application/x-pkcs12"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-xl border border-line-strong/80 bg-surface text-sm text-ink-2 file:mr-3 file:h-10 file:cursor-pointer file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-3"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Nenhuma das duas vai para o gerenciador de senhas do navegador: a do .pfx não é a de entrar no sistema
                  (com "new-password" ao lado de "current-password", o navegador ofereceria guardá-la como a senha nova
                  do BC Calibração), e a do administrador é digitada de novo de propósito */}
              <Field label="Senha do certificado" htmlFor="cd-senha">
                <CampoSenha
                  id="cd-senha"
                  autoComplete="one-time-code"
                  ignorarGerenciadores
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </Field>
              <Field
                label="A sua senha do sistema"
                htmlFor="cd-senha-admin"
                hint="Pedida de novo para confirmar."
                erro={erroSenhaAdmin || null}
              >
                <CampoSenha
                  id="cd-senha-admin"
                  autoComplete="one-time-code"
                  ignorarGerenciadores
                  value={senhaAdmin}
                  onChange={(e) => {
                    setSenhaAdmin(e.target.value)
                    setErroSenhaAdmin('')
                  }}
                />
              </Field>
            </div>
            <p className="text-xs text-muted">
              {TEXTOS_INSTALAR.qual} {TEXTOS_INSTALAR.guardado}
            </p>
          </form>
        )}
        {erro && (
          <Aviso tom="perigo" icone={<TriangleAlert />}>
            {erro}
          </Aviso>
        )}
      </div>
    </Modal>
  )
}

function ModalRemover({
  aberto,
  titular,
  aoFechar,
  aoRemover,
}: {
  aberto: boolean
  titular?: string
  aoFechar: () => void
  aoRemover: (r: CertificadoDigitalAdmin) => void
}) {
  const [senhaAdmin, setSenhaAdmin] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [erroSenhaAdmin, setErroSenhaAdmin] = useState('')
  // Os emitidos que aguardam a assinatura: sem o certificado, ficam presos até instalar um da mesma empresa e titular
  const { dados: aguardando } = useConsulta(
    aberto ? 'calibracoes:assinatura-pendente' : null,
    () => api.calibracoes({ status: 'ASSINATURA_PENDENTE', limite: 1 }).then((r) => r.total),
    ['calibracao', 'config'],
  )
  const fechar = () => {
    if (ocupado) return
    setSenhaAdmin('')
    setErro('')
    setErroSenhaAdmin('')
    aoFechar()
  }
  const remover = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!senhaAdmin) return setErroSenhaAdmin(MSG_SEM_SENHA_SISTEMA)
    setOcupado(true)
    setErroSenhaAdmin('')
    try {
      const r = await api.removerCertificadoDigital(await cifrar({ senhaAdmin }))
      toast.sucesso('Certificado digital removido', 'Os próximos certificados saem sem assinatura digital.')
      setSenhaAdmin('')
      aoRemover(r)
    } catch (e) {
      if (eSenhaDoSistema(e)) setErroSenhaAdmin(e.message)
      else setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      largura="max-w-md"
      icone={<Trash2 className="h-5 w-5" />}
      titulo="Remover o certificado digital?"
      descricao="Os próximos certificados sairão sem assinatura digital. Os que já foram assinados continuam assinados."
      rodape={
        <>
          <Button variante="ghost" onClick={fechar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button
            variante="danger"
            type="submit"
            form="form-remover-certificado-digital"
            disabled={ocupado}
            icone={ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          >
            {ocupado ? 'Removendo…' : 'Remover'}
          </Button>
        </>
      }
    >
      <form id="form-remover-certificado-digital" onSubmit={(e) => void remover(e)} className="flex flex-col gap-4">
        {titular && <p className="text-sm text-ink-2">Certificado de {titular}.</p>}
        {!!aguardando && (
          <Aviso tom="aviso" icone={<TriangleAlert />}>
            {avisoAoRemover(aguardando)}
          </Aviso>
        )}
        <Field label="A sua senha do sistema" htmlFor="cd-remover-senha" erro={erroSenhaAdmin || null}>
          <CampoSenha
            id="cd-remover-senha"
            autoComplete="one-time-code"
            ignorarGerenciadores
            value={senhaAdmin}
            onChange={(e) => {
              setSenhaAdmin(e.target.value)
              setErroSenhaAdmin('')
            }}
          />
        </Field>
        {erro && (
          <Aviso tom="perigo" icone={<TriangleAlert />}>
            {erro}
          </Aviso>
        )}
      </form>
    </Modal>
  )
}
