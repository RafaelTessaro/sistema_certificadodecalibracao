// "Minhas folhas": a faixa de entrega no alto, o contador sempre visível das folhas para entregar, o aviso de versão
// nova, as seções (Atrasadas → Hoje → Amanhã → Depois → Sem data → Finalizadas · aguardando entrega → Entregues),
// agrupadas por cliente, e "Atualizar agora" embaixo. Sem rede é o normal: cinza e frase neutra, nunca "erro".

import { useState } from 'react'
import { versaoMaisNova } from '../../../shared/campo/protocolo.ts'
import { formatarInstante, instanteLocal } from '../../../shared/campo/registro.ts'
import { atualizarApp, avisar, avisosRetiradaVistos, ir, sincronizar } from '../app/acoes.ts'
import { analiseEmCache } from '../app/analise.ts'
import { useApp } from '../app/loja.ts'
import type { EstadoApp } from '../app/loja.ts'
import { Botao, Cabecalho, Cartao, Folha, SecaoTitulo, Selo, Tela } from '../componentes/base.tsx'
import { IconeAtualizar, IconeMenu } from '../componentes/Icones.tsx'
import { Logo } from '../componentes/Logo.tsx'
import { faltaOCliente } from '../nucleo/folha.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { agruparFolhas, folhas as nFolhas, naoEntregues, paraEntregar, retiradasSemAviso } from '../nucleo/lista.ts'
import { relogioDoAparelho, horaDoInstante } from '../nucleo/relogio.ts'
import { TITULOS_ETAPAS, passoDaEtapa } from '../../../shared/campo/progresso.ts'
import { MENSAGENS_ERRO_CAMPO } from '../../../shared/campo/protocolo.ts'

/** A folha "Entrega": o resultado da última rodada (servidor, folhas entregues, recebidas, retiradas e o que falhou). */
function DetalhesDaEntrega({ aoFechar }: { aoFechar: () => void }) {
  const { ultima, ultimaEntrega, pareamento } = useApp((e) => e)
  if (!ultima) return null
  return (
    <Folha
      titulo="Entrega"
      aoFechar={aoFechar}
      rodape={
        <Botao className="flex-1" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="flex flex-col gap-3 text-[16px]">
        <p>
          {ultima.conectou ? '✓ Servidor da empresa encontrado' : '○ Servidor da empresa não encontrado'}
          <span className="block text-[14px] text-ink-2">
            {[ultima.servidor?.nome ?? pareamento?.servidor.nome, pareamento?.endereco.replace(/^http:\/\//, '')]
              .filter(Boolean)
              .join(' · ')}{' '}
            · {formatarInstante(ultima.em)}
          </span>
        </p>
        {ultima.falha && <p className="text-[15px] text-warning-ink">▲ {ultima.falha.mensagem}</p>}
        {ultima.entregues.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Entregues</div>
            {ultima.entregues.map((e) => (
              <p key={e.numero}>
                ✓ <span className="numero-fc font-semibold">{e.numero}</span> · recebida às{' '}
                {horaDoInstante(instanteLocal(new Date(e.recebidoEm)))}
              </p>
            ))}
          </div>
        )}
        {ultima.naoEntregues.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Não entregues (vou tentar de novo)</div>
            {ultima.naoEntregues.map((e) => (
              <p key={e.numero} className="text-warning-ink">
                ▲ <span className="numero-fc font-semibold">{e.numero}</span> · {e.motivo}
              </p>
            ))}
          </div>
        )}
        {(ultima.novas.length > 0 || ultima.aguardando.length > 0) && (
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Recebidas</div>
            {ultima.novas.length > 0 && (
              <p>
                + {nFolhas(ultima.novas.length)} do escritório: {ultima.novas.join(', ')}
              </p>
            )}
            {ultima.aguardando.length > 0 && <p className="text-ink-2">Aguardando confirmação: {ultima.aguardando.join(', ')}</p>}
          </div>
        )}
        {ultima.retiradas.length > 0 && <p>Retiradas pelo escritório: {ultima.retiradas.join(', ')}</p>}
        {ultima.avisos.map((a) => (
          <p key={a} className="text-[15px] text-ink-2">
            {a}
          </p>
        ))}
        {ultimaEntrega && <p className="text-[14px] text-ink-2">Última entrega: {formatarInstante(ultimaEntrega)}</p>}
      </div>
    </Folha>
  )
}

function FaixaEntrega() {
  const { sincronizando, ultima, ultimaEntrega, folhas } = useApp((e) => e)
  const [detalhes, setDetalhes] = useState(false)
  const pendentes = paraEntregar(folhas).length
  const hoje = relogioDoAparelho.hoje()
  const quando = (iso: string) => (iso.slice(0, 10) === hoje ? `hoje às ${horaDoInstante(iso)}` : formatarInstante(iso))
  let tom = 'bg-neutral-soft text-ink-2'
  let simbolo = '○'
  let titulo = ''
  let detalhe = ''
  if (sincronizando) {
    simbolo = '◌'
    titulo = pendentes ? `Entregando ${nFolhas(pendentes)}…` : 'Procurando o servidor da empresa…'
  } else if (!ultima) {
    titulo = pendentes ? `${nFolhas(pendentes)} para entregar` : 'Toque em "Atualizar agora" na rede da empresa.'
  } else if (!ultima.conectou) {
    titulo = 'Fora da rede da empresa'
    detalhe = pendentes
      ? `${nFolhas(pendentes)} para entregar. Estão salvas no celular. Entrego quando você voltar à empresa.`
      : (ultima.falha?.mensagem ?? '')
  } else if (ultima.naoEntregues.length) {
    tom = 'bg-warning-soft text-warning-ink'
    simbolo = '▲'
    titulo = `Não consegui entregar a ${ultima.naoEntregues[0].numero}. Vou tentar de novo.`
    detalhe = ultima.naoEntregues[0].motivo
  } else if (ultima.falha) {
    tom = 'bg-warning-soft text-warning-ink'
    simbolo = '▲'
    titulo = ultima.falha.mensagem
  } else if (!pendentes) {
    tom = 'bg-brand-soft text-brand-ink'
    simbolo = '✓'
    titulo = `Tudo entregue${ultimaEntrega ? ` · ${quando(ultimaEntrega)}` : ''}`
    if (ultima.novas.length)
      detalhe = `+ ${ultima.novas.length === 1 ? '1 folha nova' : `${ultima.novas.length} folhas novas`} do escritório.`
  } else titulo = `${nFolhas(pendentes)} para entregar`
  return (
    <>
      <button
        type="button"
        onClick={() => ultima && setDetalhes(true)}
        className={`mx-4 mt-3 block w-[calc(100%-2rem)] rounded-2xl px-4 py-3 text-left ${tom}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-2 text-[16px] font-semibold">
          <span className={sincronizando ? 'animate-pulse' : ''}>{simbolo}</span>
          <span>{titulo}</span>
        </div>
        {detalhe && <p className="mt-1 text-[15px] leading-snug">{detalhe}</p>}
        {ultima?.relogioDiferencaMs !== null &&
          ultima?.relogioDiferencaMs !== undefined &&
          Math.abs(ultima.relogioDiferencaMs) > 5 * 60_000 && (
            <p className="mt-1 text-[15px] text-warning-ink">
              ▲ O relógio do celular está {Math.round(Math.abs(ultima.relogioDiferencaMs) / 60_000)} min diferente do servidor.
              Ligue "Data e hora automáticas" nos ajustes do Android.
            </p>
          )}
        {ultima && !sincronizando && <p className="mt-1 text-[14px] underline underline-offset-2">Detalhes</p>}
      </button>
      {detalhes && <DetalhesDaEntrega aoFechar={() => setDetalhes(false)} />}
    </>
  )
}

/** O selo e a linha de situação de uma folha no cartão. */
function situacao(f: FolhaLocal): {
  selo: string
  tom: 'neutro' | 'verde' | 'ambar' | 'grafite'
  linha: string
  percentual: number | null
} {
  switch (f.estado) {
    case 'RECEBENDO':
      return {
        selo: 'Aguardando confirmação',
        tom: 'neutro',
        linha: 'Conecte-se à rede da empresa para confirmar.',
        percentual: null,
      }
    case 'NOVA':
      return { selo: 'Nova', tom: 'neutro', linha: 'Pronta para o campo · não começada', percentual: 0 }
    case 'FINALIZADA': {
      const d = f.registro?.desfecho
      return {
        selo: '⊘ Finalizada',
        tom: 'grafite',
        linha: `Trancada · aguardando entrega${d === 'INCOMPLETA' ? ' · incompleta' : d === 'NAO_CALIBRADA' ? ' · não calibrada' : ''}`,
        percentual: null,
      }
    }
    case 'ENTREGUE':
      return { selo: 'Entregue ✓', tom: 'verde', linha: `Entregue ${formatarInstante(f.entregueEm)}`, percentual: null }
    default: {
      if (!f.registro) return { selo: 'Em andamento', tom: 'verde', linha: '', percentual: 0 }
      const p = analiseEmCache(f.registro, f.pacote).progresso
      const reaberta = f.estado === 'REABERTA'
      if (faltaOCliente(f))
        return { selo: 'Assinatura do cliente', tom: 'ambar', linha: 'Falta a assinatura de quem acompanhou', percentual: 100 }
      // Onde o técnico parou (o "Continuar do passo n"); sem isso, a primeira etapa incompleta
      const etapa = f.etapaAtual ?? p.proxima
      return {
        selo: reaberta ? 'Reaberta' : p.proxima ? 'Em andamento' : 'Pronta para assinar',
        tom: reaberta ? 'ambar' : 'verde',
        linha: !p.proxima ? 'Tudo preenchido' : etapa ? `Passo ${passoDaEtapa(etapa)} de 8 · ${TITULOS_ETAPAS[etapa]}` : '',
        percentual: p.percentual,
      }
    }
  }
}

function CartaoFolha({ f }: { f: FolhaLocal }) {
  const s = situacao(f)
  const abrir = () => {
    if (f.modoEntrega) return ir({ nome: 'entregaCliente', envioId: f.envioId })
    if (f.estado === 'FINALIZADA' || f.estado === 'ENTREGUE') return ir({ nome: 'comprovante', envioId: f.envioId })
    if (faltaOCliente(f)) return ir({ nome: 'clientePendente', envioId: f.envioId })
    if ((f.estado === 'EM_PREENCHIMENTO' || f.estado === 'REABERTA') && f.etapaAtual)
      return ir({ nome: 'passo', envioId: f.envioId, etapa: f.etapaAtual })
    ir({ nome: 'capa', envioId: f.envioId })
  }
  return (
    <Cartao onClick={abrir} className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <span className="numero-fc text-[17px] font-semibold">{f.numero}</span>
        <Selo tom={s.tom}>{s.selo}</Selo>
      </div>
      {f.resumo.balanca && <div className="mt-1 truncate text-[16px] text-ink">{f.resumo.balanca}</div>}
      {f.resumo.piloto && f.estado !== 'ENTREGUE' && (
        <div className="mt-1 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Piloto</div>
      )}
      {s.percentual !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${s.percentual}%` }} />
        </div>
      )}
      {s.linha && <div className="mt-1.5 text-[15px] text-ink-2">{s.linha}</div>}
      {f.estado === 'FINALIZADA' && f.entrega.erro && <div className="mt-1 text-[14px] text-warning-ink">▲ {f.entrega.erro}</div>}
    </Cartao>
  )
}

function Bloqueio({ e }: { e: Pick<EstadoApp, 'descadastrado' | 'naoPareado'> }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl border-2 border-danger bg-danger-soft px-4 py-3">
      <p className="text-[16px] font-semibold text-danger">
        {e.descadastrado ? 'Este celular foi descadastrado no sistema.' : 'Este celular não está cadastrado neste servidor.'}
      </p>
      <p className="mt-1 text-[15px] text-ink">
        {e.descadastrado
          ? 'As folhas preenchidas continuam guardadas aqui e são entregues quando você estiver na empresa. Folhas novas não chegam.'
          : `${MENSAGENS_ERRO_CAMPO.NAO_PAREADO} As folhas continuam no celular.`}
      </p>
      <Botao className="mt-2" onClick={() => ir({ nome: 'pareamento', motivo: 'DE_NOVO' })}>
        Ler o QR de novo
      </Botao>
    </div>
  )
}

export function TelaMinhasFolhas() {
  const e = useApp((s) => s)
  const hoje = relogioDoAparelho.hoje()
  const secoes = agruparFolhas(e.folhas, hoje)
  const pendentes = paraEntregar(e.folhas).length
  const retiradas = retiradasSemAviso(e.folhas)
  const app = e.ultima?.appDisponivel
  const versaoNova = app && versaoMaisNova(app.versao, e.versaoApp) ? app : null
  const semServidor = e.ultima && !e.ultima.conectou
  return (
    <Tela
      rodape={
        <div className="flex flex-col gap-2">
          <Botao variante="principal" grande onClick={() => void sincronizar()} disabled={e.sincronizando}>
            <IconeAtualizar girando={e.sincronizando} /> Atualizar agora
          </Botao>
          {semServidor && (
            <div className="flex justify-center gap-4">
              <Botao variante="texto" onClick={() => ir({ nome: 'pareamento', motivo: 'DE_NOVO' })}>
                Ler o QR de novo
              </Botao>
              <Botao variante="texto" onClick={() => ir({ nome: 'menu' })}>
                Endereço do servidor
              </Botao>
            </div>
          )}
        </div>
      }
    >
      <Cabecalho
        titulo={
          <span className="flex items-center gap-2">
            <Logo tamanho={28} /> Minhas folhas
          </span>
        }
        direita={
          <>
            {pendentes > 0 && (
              <span
                className="mr-1 rounded-full bg-surface-3 px-2.5 py-1 text-[14px] font-semibold"
                aria-label={`${nFolhas(pendentes)} para entregar`}
              >
                ⊘ {pendentes}
              </span>
            )}
            <button
              type="button"
              aria-label="Menu"
              onClick={() => ir({ nome: 'menu' })}
              className="grid size-12 place-items-center rounded-xl active:bg-surface-2"
            >
              <IconeMenu />
            </button>
          </>
        }
      />
      {(e.descadastrado || e.naoPareado) && <Bloqueio e={e} />}
      <FaixaEntrega />
      {versaoNova && (
        <div className="mx-4 mt-3 rounded-2xl border border-brand bg-brand-soft px-4 py-3">
          <p className="text-[16px] font-semibold text-brand-ink">Há uma versão nova do BC Calibração ({versaoNova.versao}).</p>
          <p className="mt-1 text-[15px] text-ink-2">O Android instala por cima, sem perder os dados.</p>
          <Botao
            className="mt-2"
            onClick={() => {
              const problema = atualizarApp(versaoNova.url)
              if (problema) avisar(problema, 'aviso')
            }}
          >
            Atualizar
          </Botao>
          {naoEntregues(e.folhas).length > 0 && (
            <p className="mt-1 text-[14px] text-ink-2">Entregue as folhas começadas antes de atualizar.</p>
          )}
        </div>
      )}
      {retiradas.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl bg-neutral-soft px-4 py-3">
          {retiradas.map((f) => (
            <p key={f.envioId} className="text-[16px]">
              A <span className="numero-fc font-semibold">{f.numero}</span> foi retirada pelo escritório.
            </p>
          ))}
          <Botao variante="texto" onClick={() => void avisosRetiradaVistos()} className="mt-1 px-0">
            Entendi
          </Botao>
        </div>
      )}
      {!secoes.length && (
        <p className="px-6 py-10 text-center text-[17px] leading-relaxed text-ink-2">
          Nenhuma folha por enquanto. Quando o escritório enviar uma folha para você, ela aparece aqui na próxima vez que o
          celular estiver na rede da empresa.
        </p>
      )}
      {secoes.map((s) => (
        <section key={s.secao}>
          <SecaoTitulo>
            <span className={s.secao === 'ATRASADAS' ? 'text-warning-ink' : ''}>
              {s.secao === 'ATRASADAS' ? '▲ ' : ''}
              {s.titulo}
            </span>
          </SecaoTitulo>
          <div className="px-4">
            {s.grupos.map((g) => (
              <div key={g.cliente}>
                <div className="flex items-baseline justify-between pb-1.5 pt-1">
                  <span className="truncate text-[16px] font-semibold">{g.cliente}</span>
                  <span className="text-[14px] text-ink-2">{g.folhas.length}</span>
                </div>
                {g.folhas.map((f) => (
                  <CartaoFolha key={f.envioId} f={f} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="h-6" />
    </Tela>
  )
}
