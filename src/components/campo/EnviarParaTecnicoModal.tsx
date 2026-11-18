// "Enviar para o técnico" (1.1.0): a folha de campo vai para o celular do técnico (o app BC Calibração), ao lado de cada
// "Imprimir folha de campo". A janela escolhe o técnico (só quem tem celular cadastrado; os outros com o atalho para
// cadastrar), a data prevista e o recado, e diz o que vale: no piloto, "a folha de papel continua sendo o registro
// original"; com o registro no celular, "as leituras ficam só para leitura aqui". Depois de enviar: "Imprimir também
// (reserva)" (o mesmo nº, a mesma folha).

import { CircleCheck, Info, Loader2, Printer, Send, Smartphone, TriangleAlert, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { novoId } from '#shared/id.ts'
import type { RegistroOriginal } from '#shared/campo/tipos.ts'
import type { ResultadoEnvioCampo, TecnicoParaEnvio } from '#shared/tipos.ts'
import { api, ErroApi } from '../../lib/api'
import { avisoDoEnvio, primeiroNome, quando } from '../../lib/campo'
import { abrirFolhaCampo } from '../../lib/folhaCampo'
import { usePode } from '../../store/sessao'
import { useTempoReal } from '../../store/tempoReal'
import { avisarErro } from '../../store/ui'
import { Button } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { GrupoEscolha, OpcaoEscolha } from './OpcaoEscolha'

/** O que vai para o celular: a folha da calibração, a avulsa (da balança, só do cliente ou em branco) ou uma já impressa. */
export type AlvoEnvio =
  | { tipo: 'calibracao'; calibracaoId: string }
  | { tipo: 'avulsa'; balancaId?: string; clienteId?: string; os?: string; data?: string }
  | { tipo: 'numero'; numero: string }

export function EnviarParaTecnicoModal({
  alvo,
  aoFechar,
  resumo,
  dataPrevista = '',
  antesDeEnviar,
  aoEnviado,
}: {
  /** null = fechada. */
  alvo: AlvoEnvio | null
  aoFechar: () => void
  /** A linha do alto: "Mercado Bom Preço · Toledo 9094 30 kg". */
  resumo?: string
  dataPrevista?: string
  /**
   * O editor da calibração grava o que está pendente antes e devolve a versão (o envio sobe a versão: 409 CONFLITO se o
   * editor estiver velho). false = não enviar (a gravação falhou).
   */
  antesDeEnviar?: () => Promise<number | undefined | false>
  aoEnviado?: (r: ResultadoEnvioCampo) => void
}) {
  return (
    <Modal
      aberto={!!alvo}
      aoFechar={aoFechar}
      largura="max-w-xl"
      icone={<Send className="h-5 w-5" />}
      titulo="Enviar para o técnico"
      descricao={resumo || 'A folha de campo vai para o celular do técnico.'}
    >
      {alvo && (
        <Conteudo
          alvo={alvo}
          dataPrevista={dataPrevista}
          antesDeEnviar={antesDeEnviar}
          aoEnviado={aoEnviado}
          aoFechar={aoFechar}
        />
      )}
    </Modal>
  )
}

function Conteudo({
  alvo,
  dataPrevista: dataInicial,
  antesDeEnviar,
  aoEnviado,
  aoFechar,
}: {
  alvo: AlvoEnvio
  dataPrevista: string
  antesDeEnviar?: () => Promise<number | undefined | false>
  aoEnviado?: (r: ResultadoEnvioCampo) => void
  aoFechar: () => void
}) {
  const navegar = useNavigate()
  const podeCadastrar = usePode('usuarios')
  const [tecnicos, setTecnicos] = useState<TecnicoParaEnvio[] | null>(null)
  const [registroOriginal, setRegistroOriginal] = useState<RegistroOriginal | null>(null)
  const [erro, setErro] = useState('')
  const [tecnicoId, setTecnicoId] = useState('')
  const [data, setData] = useState(dataInicial)
  const [recado, setRecado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<ResultadoEnvioCampo | null>(null)
  // A folha avulsa: a mesma chave nesta janela é a mesma folha (o clique duplo não gasta outro nº)
  const chave = useMemo(() => novoId(), [])

  useEffect(() => {
    let valendo = true
    Promise.all([api.tecnicosParaEnvio(), api.configuracaoCampo()]).then(
      ([t, c]) => {
        if (!valendo) return
        setTecnicos(t.tecnicos)
        setRegistroOriginal(c.config.registroOriginal)
        // Um técnico só com celular: já vem escolhido
        const comCelular = t.tecnicos.filter((x) => x.celulares.length)
        if (comCelular.length === 1) setTecnicoId(comCelular[0].id)
      },
      (e: unknown) => valendo && setErro(e instanceof Error ? e.message : 'Erro inesperado.'),
    )
    return () => {
      valendo = false
    }
  }, [])

  const escolhido = tecnicos?.find((t) => t.id === tecnicoId)
  const comCelular = (tecnicos ?? []).filter((t) => t.celulares.length > 0)

  const enviar = async () => {
    if (!escolhido) return
    setEnviando(true)
    try {
      const pedido = { tecnicoId: escolhido.id, dataPrevista: data, recado: recado.trim() }
      let r: ResultadoEnvioCampo
      if (alvo.tipo === 'calibracao') {
        const versao = antesDeEnviar ? await antesDeEnviar() : undefined
        if (versao === false) return
        r = await api.enviarParaTecnico(alvo.calibracaoId, { ...pedido, ...(versao !== undefined ? { versao } : {}) })
      } else if (alvo.tipo === 'avulsa') {
        r = await api.enviarFolhaAvulsaParaTecnico({
          ...pedido,
          ...(alvo.balancaId ? { balancaId: alvo.balancaId } : {}),
          ...(alvo.clienteId ? { clienteId: alvo.clienteId } : {}),
          ...(alvo.os ? { os: alvo.os } : {}),
          ...(alvo.data ? { data: alvo.data } : {}),
          chave,
        })
      } else r = await api.enviarFolhaParaTecnico(alvo.numero, pedido)
      setEnviado(r)
      useTempoReal.getState().mudou('calibracao')
      aoEnviado?.(r)
    } catch (e) {
      avisarErro('Não foi possível enviar a folha', e)
      if (e instanceof ErroApi && e.dados.codigo === 'SEM_CELULAR')
        void api.tecnicosParaEnvio().then(
          (t) => setTecnicos(t.tecnicos),
          () => {},
        )
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    const nome = primeiroNome(enviado.envio.tecnico) || 'o técnico'
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-success/25 bg-success-soft px-5 py-6 text-center">
          <CircleCheck className="h-9 w-9 text-success" />
          <p className="text-base font-semibold text-ink" role="status">
            <span className="tnum whitespace-nowrap">{enviado.envio.numero}</span> enviada para {enviado.envio.tecnico}
          </p>
          <p className="max-w-md text-[13px] text-ink-2">
            Ela chega quando {nome} abrir o app BC Calibração no Wi-Fi da empresa. A folha aparece na aba “Folhas de campo” com a
            situação do celular.
          </p>
        </div>
        {enviado.aviso && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {enviado.aviso}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <Button
            icone={<Printer className="h-4 w-4" />}
            onClick={() => void abrirFolhaCampo(api.urlReimprimirFolha(enviado.envio.numero))}
            title="A mesma folha, com o mesmo nº, para o técnico levar de reserva"
          >
            Imprimir também (reserva)
          </Button>
          <Button variante="primary" onClick={aoFechar}>
            Concluir
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-ink-2">Técnico</p>
        {erro ? (
          <p className="text-sm text-danger">{erro}</p>
        ) : !tecnicos ? (
          <div className="flex h-16 items-center justify-center gap-2 rounded-xl bg-surface-2 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando os técnicos…
          </div>
        ) : tecnicos.length === 0 ? (
          <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            Ninguém ativo está marcado como técnico (Usuários).
          </p>
        ) : (
          <GrupoEscolha rotulo="Técnico">
            {tecnicos.map((t, i) => {
              const cel = t.celulares[0]
              const sem = !cel
              return (
                <OpcaoEscolha
                  key={t.id}
                  marcada={t.id === tecnicoId}
                  parada={t.id === tecnicoId || (!escolhido && i === tecnicos.findIndex((x) => x.celulares.length))}
                  desabilitada={sem}
                  aoEscolher={() => setTecnicoId(t.id)}
                  icone={<Smartphone className="h-4 w-4" />}
                  titulo={t.nome}
                  texto={
                    sem
                      ? 'Sem celular cadastrado'
                      : [cel.modelo || cel.nome, cel.ultimoContato ? `visto ${quando(cel.ultimoContato)}` : '']
                          .filter(Boolean)
                          .join(' · ')
                  }
                  extra={
                    sem &&
                    (podeCadastrar ? (
                      <Button
                        tamanho="sm"
                        variante="ghost"
                        icone={<UserPlus className="h-3.5 w-3.5" />}
                        onClick={() => {
                          aoFechar()
                          navegar('/usuarios')
                        }}
                      >
                        Cadastrar celular
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">Peça ao administrador</span>
                    ))
                  }
                />
              )
            })}
          </GrupoEscolha>
        )}
        {tecnicos && tecnicos.length > 0 && comCelular.length === 0 && (
          <p className="text-[13px] text-muted">
            Nenhum técnico tem celular cadastrado. O administrador cadastra em Usuários → Celulares dos técnicos.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
        <Field label="Data prevista" htmlFor="envio-data" opcional>
          <Input id="envio-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Recado para o técnico" htmlFor="envio-recado" opcional hint="Só o técnico vê. Não aparece para o cliente.">
          <Textarea
            id="envio-recado"
            value={recado}
            maxLength={500}
            onChange={(e) => setRecado(e.target.value)}
            placeholder="Ex.: levar o jogo M1 e a escada."
            className="min-h-[64px]"
          />
        </Field>
      </div>

      {registroOriginal && (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {avisoDoEnvio(registroOriginal)}{' '}
            {escolhido
              ? `Ela chega quando ${primeiroNome(escolhido.nome)} abrir o app BC Calibração na rede da empresa.`
              : 'Ela chega quando o técnico abrir o app BC Calibração na rede da empresa.'}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <Button onClick={aoFechar}>Cancelar</Button>
        <Button
          variante="primary"
          icone={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          disabled={!escolhido || enviando}
          title={escolhido ? undefined : 'Escolha o técnico que vai receber a folha'}
          onClick={() => void enviar()}
        >
          Enviar para o técnico
        </Button>
      </div>
    </div>
  )
}
