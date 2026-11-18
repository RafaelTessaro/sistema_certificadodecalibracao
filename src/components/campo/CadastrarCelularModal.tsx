// "Cadastrar celular" (Usuários → Celulares dos técnicos; só o administrador), em dois passos:
// 1. Instalar o app BC Calibração: pelo cabo USB (adb install -r) ou pelo navegador do celular (o QR do endereço do APK
//    que este computador serve, com o aviso de "download inseguro" do Android);
// 2. Ligar ao sistema: o QR com o endereço do servidor e o código de 6 dígitos (os dois também em texto, para digitar se a
//    câmera falhar), a escolha do endereço quando o computador tem mais de um, a contagem dos 10 minutos e a situação ao
//    vivo ("Aguardando o celular…" → "Pareado: Samsung A54 · Maurício"). O QR some quando o celular pareia.
// "Parear de novo" abre direto no passo 2, com o mesmo aparelho (as folhas do celular ficam).

import { CircleCheck, Globe, Link2, Loader2, RefreshCw, Smartphone, TriangleAlert, Usb } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { InfoApk } from '#shared/campo/protocolo.ts'
import type { CelularListado, PareamentoIniciado, SituacaoPareamento, Usuario } from '#shared/tipos.ts'
import { api } from '../../lib/api'
import { contagemRegressiva, textoPareamento } from '../../lib/campo'
import { enderecoDoApk, qrComEndereco } from '../../lib/pareamento'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Field, Select } from '../ui/Form'
import { Segmented } from '../ui/Misc'
import { Modal } from '../ui/Modal'
import { QrCode } from './QrCode'

type Passo = 'instalar' | 'ligar'
type Via = 'cabo' | 'navegador'

/** De quanto em quanto tempo a tela pergunta ao servidor se o celular já pareou. */
const ACOMPANHAR_MS = 2000

export function CadastrarCelularModal({
  aberto,
  aoFechar,
  tecnicos,
  pareandoDeNovo,
  aoPareado,
}: {
  aberto: boolean
  aoFechar: () => void
  /** Os técnicos ativos (com a marca de técnico). */
  tecnicos: Pick<Usuario, 'id' | 'nome'>[]
  /** "Parear de novo": o celular (o mesmo aparelho), direto no passo 2. */
  pareandoDeNovo?: CelularListado | null
  aoPareado: (c: CelularListado | undefined) => void
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      icone={<Smartphone className="h-5 w-5" />}
      titulo={pareandoDeNovo ? `Parear de novo: ${pareandoDeNovo.nome}` : 'Cadastrar celular'}
      descricao={
        pareandoDeNovo
          ? 'Um código novo para o mesmo aparelho. As folhas que estão no celular continuam lá.'
          : 'O app BC Calibração no celular de quem vai a campo, ligado a este sistema.'
      }
    >
      {aberto && (
        <Conteudo
          key={pareandoDeNovo?.id ?? 'novo'}
          tecnicos={tecnicos}
          pareandoDeNovo={pareandoDeNovo ?? null}
          aoFechar={aoFechar}
          aoPareado={aoPareado}
        />
      )}
    </Modal>
  )
}

function Conteudo({
  tecnicos,
  pareandoDeNovo,
  aoFechar,
  aoPareado,
}: {
  tecnicos: Pick<Usuario, 'id' | 'nome'>[]
  pareandoDeNovo: CelularListado | null
  aoFechar: () => void
  aoPareado: (c: CelularListado | undefined) => void
}) {
  const [passo, setPasso] = useState<Passo>(pareandoDeNovo ? 'ligar' : 'instalar')
  const [tecnicoId, setTecnicoId] = useState(pareandoDeNovo?.tecnicoId ?? (tecnicos.length === 1 ? tecnicos[0].id : ''))
  const [via, setVia] = useState<Via>('navegador')
  const [enderecos, setEnderecos] = useState<string[]>([])
  const [endereco, setEndereco] = useState('')
  const [apk, setApk] = useState<InfoApk | null | 'sem'>(null)

  // Os endereços deste computador na rede (o do QR e os outros) e o APK que veio no instalador
  useEffect(() => {
    let valendo = true
    api.enderecoServidor().then(
      (r) => {
        if (!valendo) return
        setEnderecos(r.enderecos.length ? r.enderecos : r.endereco ? [r.endereco] : [])
        setEndereco((atual) => atual || r.endereco)
      },
      () => {},
    )
    api.infoApk().then(
      (r) => valendo && setApk(r.disponivel === false ? 'sem' : r),
      () => valendo && setApk('sem'),
    )
    return () => {
      valendo = false
    }
  }, [])

  const tecnico = tecnicos.find((t) => t.id === tecnicoId)
  return (
    <div className="flex flex-col gap-5">
      {!pareandoDeNovo && <Passos passo={passo} />}
      {passo === 'instalar' ? (
        <>
          <Field label="Técnico dono do celular" htmlFor="celular-tecnico" obrigatorio>
            <Select id="celular-tecnico" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">{tecnicos.length ? 'Escolha o técnico…' : 'Nenhum técnico ativo'}</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </Field>
          {tecnicos.length === 0 && (
            <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              Ninguém ativo está marcado como técnico. Edite quem vai a campo e marque <b>Técnico</b>.
            </p>
          )}
          <Instalar via={via} setVia={setVia} endereco={endereco} enderecos={enderecos} setEndereco={setEndereco} apk={apk} />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <Button onClick={aoFechar}>Cancelar</Button>
            <Button
              variante="primary"
              icone={<Link2 className="h-4 w-4" />}
              disabled={!tecnico}
              title={tecnico ? undefined : 'Escolha o técnico dono do celular'}
              onClick={() => setPasso('ligar')}
            >
              O app já está instalado: ligar ao sistema
            </Button>
          </div>
        </>
      ) : (
        <Ligar
          tecnicoId={tecnicoId}
          tecnicoNome={tecnico?.nome ?? pareandoDeNovo?.tecnicoNome ?? ''}
          pareandoDeNovo={pareandoDeNovo}
          endereco={endereco}
          enderecos={enderecos}
          setEndereco={setEndereco}
          aoVoltar={pareandoDeNovo ? undefined : () => setPasso('instalar')}
          aoFechar={aoFechar}
          aoPareado={aoPareado}
        />
      )}
    </div>
  )
}

function Passos({ passo }: { passo: Passo }) {
  const itens: Array<{ id: Passo; rotulo: string }> = [
    { id: 'instalar', rotulo: 'Instalar o app' },
    { id: 'ligar', rotulo: 'Ligar ao sistema' },
  ]
  return (
    <ol className="flex items-center gap-2 text-[13px]" aria-label="Passos">
      {itens.map((p, i) => {
        const ativo = p.id === passo
        const feito = passo === 'ligar' && p.id === 'instalar'
        return (
          <li key={p.id} className="flex items-center gap-2" aria-current={ativo ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-8 bg-line-strong" aria-hidden />}
            <span
              className={cn(
                'tnum flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-semibold',
                ativo ? 'bg-brand text-on-brand' : feito ? 'bg-success-soft text-success' : 'bg-surface-3 text-muted',
              )}
            >
              {i + 1}
            </span>
            <span className={cn('font-medium', ativo ? 'text-ink' : 'text-muted')}>{p.rotulo}</span>
          </li>
        )
      })}
    </ol>
  )
}

function EscolhaEndereco({
  endereco,
  enderecos,
  setEndereco,
}: {
  endereco: string
  enderecos: string[]
  setEndereco: (e: string) => void
}) {
  if (enderecos.length < 2) return null
  return (
    <Field
      label="Endereço deste computador na rede"
      htmlFor="celular-endereco"
      hint="Este computador tem mais de um endereço. Use o da rede Wi-Fi em que o celular vai entrar."
    >
      <Select id="celular-endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)}>
        {enderecos.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function Instalar({
  via,
  setVia,
  endereco,
  enderecos,
  setEndereco,
  apk,
}: {
  via: Via
  setVia: (v: Via) => void
  endereco: string
  enderecos: string[]
  setEndereco: (e: string) => void
  apk: InfoApk | null | 'sem'
}) {
  const nomeArquivo = apk && apk !== 'sem' ? apk.nomeArquivo : 'BC-Calibracao-<versão>.apk'
  return (
    <section className="flex flex-col gap-3" aria-label="Instalar o app">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">1. Instale o app BC Calibração no celular</h3>
        <Segmented
          tamanho="sm"
          valor={via}
          aoMudar={setVia}
          opcoes={[
            {
              valor: 'navegador',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Pelo navegador
                </span>
              ),
            },
            {
              valor: 'cabo',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Usb className="h-3.5 w-3.5" /> Pelo cabo USB
                </span>
              ),
            },
          ]}
        />
      </div>
      {apk === 'sem' && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Este computador não tem o app do celular (a pasta <span className="font-mono">campo</span> da instalação). Instale
            pelo cabo com o arquivo que veio junto da atualização, ou atualize o sistema.
          </span>
        </p>
      )}
      {via === 'navegador' ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-2/50 p-4 sm:flex-row sm:items-start">
          {endereco && apk !== 'sem' ? (
            <QrCode
              texto={enderecoDoApk(endereco)}
              tamanho={152}
              rotulo="QR do endereço do app"
              className="shrink-0 self-center"
            />
          ) : (
            <div className="flex h-[152px] w-[152px] shrink-0 items-center justify-center self-center rounded-xl bg-surface-3 text-muted">
              {apk === null || !endereco ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-6 w-6" />}
            </div>
          )}
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
            <li>Com o celular no Wi-Fi da empresa, abra a câmera e leia o QR (ou digite o endereço abaixo no navegador).</li>
            <li>
              O Android avisa que o arquivo pode ser perigoso (“download inseguro”): é o app da própria empresa, servido por este
              computador. Toque em <b className="font-semibold text-ink">Baixar mesmo assim</b>.
            </li>
            <li>
              Abra o arquivo e toque em <b className="font-semibold text-ink">Instalar</b>. Se pedir, permita “instalar apps
              desconhecidos” para o navegador.
            </li>
            {endereco && (
              <li className="list-none pt-1">
                <span className="tnum rounded-lg bg-surface px-2 py-1 font-mono text-[12px] text-ink select-all">
                  {enderecoDoApk(endereco)}
                </span>
              </li>
            )}
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
            <li>
              No celular: Configurações → Sobre o telefone → toque 7 vezes em “Número da versão”. Depois, em Opções do
              desenvolvedor, ligue a <b className="font-semibold text-ink">Depuração USB</b>.
            </li>
            <li>
              No computador, baixe o <b className="font-semibold text-ink">Android SDK Platform-Tools</b> (no site
              developer.android.com) e descompacte. O adb vem nele; o sistema não instala o adb.
            </li>
            <li>Ligue o celular neste computador pelo cabo e aceite “Permitir depuração USB” no celular.</li>
            <li>
              No Prompt de Comando, na pasta do Platform-Tools (troque o caminho se o sistema foi instalado em outra pasta):
              <span className="mt-1 block w-fit rounded-lg bg-surface px-2 py-1 font-mono text-[12px] text-ink select-all">
                adb install -r "C:\Program Files\BC Calibracao\campo\{nomeArquivo}"
              </span>
            </li>
            <li>
              O <span className="font-mono">-r</span> instala por cima, sem apagar as folhas que estão no celular (vale também
              para atualizar).
            </li>
          </ol>
        </div>
      )}
      <EscolhaEndereco endereco={endereco} enderecos={enderecos} setEndereco={setEndereco} />
    </section>
  )
}

function Ligar({
  tecnicoId,
  tecnicoNome,
  pareandoDeNovo,
  endereco,
  enderecos,
  setEndereco,
  aoVoltar,
  aoFechar,
  aoPareado,
}: {
  tecnicoId: string
  tecnicoNome: string
  pareandoDeNovo: CelularListado | null
  endereco: string
  enderecos: string[]
  setEndereco: (e: string) => void
  aoVoltar?: () => void
  aoFechar: () => void
  aoPareado: (c: CelularListado | undefined) => void
}) {
  const [pareamento, setPareamento] = useState<PareamentoIniciado | null>(null)
  const [situacao, setSituacao] = useState<SituacaoPareamento | null>(null)
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(() => Date.now())
  const avisado = useRef(false)
  const atual = useRef<PareamentoIniciado | null>(null)
  const aoPareadoRef = useRef(aoPareado)
  useEffect(() => {
    aoPareadoRef.current = aoPareado
  })
  const sit = situacao?.situacao ?? 'AGUARDANDO'

  /** Pede o código (novo, ou para o mesmo aparelho em "Parear de novo"). */
  const pedir = useCallback(
    async () => (pareandoDeNovo ? await api.parearDeNovo(pareandoDeNovo.id) : await api.iniciarPareamento(tecnicoId)).pareamento,
    [pareandoDeNovo, tecnicoId],
  )
  const receber = useCallback((p: PareamentoIniciado) => {
    atual.current = p
    setAgora(Date.now())
    setPareamento(p)
  }, [])
  const falhou = (e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível gerar o código.')

  useEffect(() => {
    let valendo = true
    pedir().then(
      (p) => valendo && receber(p),
      (e: unknown) => valendo && falhou(e),
    )
    return () => {
      valendo = false
    }
  }, [pedir, receber])

  /** "Gerar outro código" (o anterior venceu ou foi invalidado). */
  const gerar = async () => {
    setErro('')
    setSituacao(null)
    setPareamento(null)
    try {
      receber(await pedir())
    } catch (e) {
      falhou(e)
    }
  }

  // Fechar a janela com o código em aberto: ele deixa de valer
  useEffect(
    () => () => {
      const p = atual.current
      if (p && !avisado.current) void api.cancelarPareamento(p.id).catch(() => {})
    },
    [],
  )

  // A situação ao vivo e a contagem dos 10 minutos
  useEffect(() => {
    if (!pareamento || sit !== 'AGUARDANDO') return
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    const acompanhar = setInterval(() => {
      api.situacaoPareamento(pareamento.id).then(
        (r) => {
          setSituacao(r.pareamento)
          if (r.pareamento.situacao === 'PAREADO' && !avisado.current) {
            avisado.current = true
            aoPareadoRef.current(r.pareamento.celular)
          }
        },
        (e) => {
          if (e instanceof Error && /não existe mais/.test(e.message)) setSituacao({ ...r0(pareamento), situacao: 'EXPIRADO' })
        },
      )
    }, ACOMPANHAR_MS)
    return () => {
      clearInterval(relogio)
      clearInterval(acompanhar)
    }
  }, [pareamento, sit])

  const qr = pareamento
    ? endereco && endereco !== pareamento.endereco
      ? qrComEndereco(endereco, pareamento.codigo)
      : pareamento.qr
    : ''
  const enderecoNoQr = pareamento ? endereco || pareamento.endereco : endereco
  const venceu = !!pareamento && sit === 'AGUARDANDO' && Date.parse(pareamento.expiraEm) <= agora
  const encerrado = sit === 'EXPIRADO' || sit === 'INVALIDADO' || sit === 'CANCELADO' || venceu
  const codigo = pareamento ? `${pareamento.codigo.slice(0, 3)} ${pareamento.codigo.slice(3)}` : '—'

  return (
    <section className="flex flex-col gap-4" aria-label="Ligar ao sistema">
      <h3 className="text-sm font-semibold text-ink">
        {pareandoDeNovo ? 'Ligue o celular ao sistema de novo' : '2. Ligue o celular ao sistema'}
        {tecnicoNome && <span className="font-normal text-muted"> · celular de {tecnicoNome}</span>}
      </h3>
      {sit === 'PAREADO' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-success/25 bg-success-soft px-5 py-8 text-center">
          <CircleCheck className="h-10 w-10 text-success" />
          <p className="text-base font-semibold text-ink" role="status">
            {textoPareamento(situacao!)}
          </p>
          <p className="max-w-md text-[13px] text-ink-2">
            O celular já pode receber folhas. Para mandar uma folha, use “Enviar para o técnico” ao lado de “Imprimir folha de
            campo”.
          </p>
        </div>
      ) : erro ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <p>{erro}</p>
          <Button tamanho="sm" icone={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void gerar()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-2/50 p-4 sm:flex-row sm:items-center">
          <div className="relative shrink-0 self-center">
            {pareamento && qr && !encerrado ? (
              <QrCode texto={qr} tamanho={208} rotulo="QR para ligar o celular ao sistema" />
            ) : (
              <div className="flex h-[208px] w-[208px] items-center justify-center rounded-xl bg-surface-3 text-muted">
                {encerrado ? <RefreshCw className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-[13px] text-ink-2">
              No app do celular, toque em <b className="font-semibold text-ink">Ler o QR do sistema</b> e aponte para o código. Se
              a câmera não ler, digite o endereço e o código:
            </p>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
              <dt className="text-xs text-muted">Endereço</dt>
              <dd className="tnum font-mono text-[13px] break-all text-ink select-all">{enderecoNoQr || '—'}</dd>
              <dt className="text-xs text-muted">Código</dt>
              <dd className="tnum text-2xl font-semibold tracking-[0.12em] text-ink select-all" aria-label="Código de 6 dígitos">
                {codigo}
              </dd>
            </dl>
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium',
                encerrado ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info',
              )}
              role="status"
              aria-live="polite"
            >
              {encerrado ? <TriangleAlert className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
              <span className="flex-1">
                {venceu ? textoPareamento({ situacao: 'EXPIRADO' }) : textoPareamento({ situacao: sit })}
              </span>
              {pareamento && !encerrado && (
                <span className="tnum text-xs font-normal">vale por {contagemRegressiva(pareamento.expiraEm, agora)}</span>
              )}
            </div>
            {encerrado && (
              <Button
                tamanho="sm"
                icone={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => void gerar()}
                className="self-start"
              >
                Gerar outro código
              </Button>
            )}
          </div>
        </div>
      )}
      {sit !== 'PAREADO' && <EscolhaEndereco endereco={endereco} enderecos={enderecos} setEndereco={setEndereco} />}
      {sit !== 'PAREADO' && (
        <p className="text-xs text-muted">
          O celular grava este endereço e usa sempre ele. Reserve o IP deste computador no roteador para ele não mudar.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {aoVoltar && sit !== 'PAREADO' && (
          <Button variante="ghost" onClick={aoVoltar} className="mr-auto">
            Voltar para a instalação
          </Button>
        )}
        <Button variante={sit === 'PAREADO' ? 'primary' : 'secondary'} onClick={aoFechar}>
          {sit === 'PAREADO' ? 'Concluir' : 'Cancelar'}
        </Button>
      </div>
    </section>
  )
}

/** A situação inicial de um pareamento (para marcar "venceu" quando o servidor já esqueceu o código). */
const r0 = (p: PareamentoIniciado): SituacaoPareamento => ({ id: p.id, situacao: 'AGUARDANDO', expiraEm: p.expiraEm })
