// O comprovante da folha finalizada: ✓, o nº da folha (o que bate o celular com o computador), a data e a hora, quem
// assinou, o desfecho, "⊘ Trancada. Aguardando entrega" e a etiqueta. "Ver a folha", "Corrigir…" (correção depois da
// assinatura: PIN e motivo; avisa se o item foi mostrado ao cliente) e "Reabrir…" (apaga as duas assinaturas). Depois
// da entrega: a hora em que o servidor recebeu.

import { useMemo, useState } from 'react'
import { leiturasDoRegistro } from '../../../shared/campo/avisos.ts'
import { registroCorrigido } from '../../../shared/campo/importar.ts'
import { formatarInstante, instanteLocal, leituraTextoValida, tipoAssinaturaCliente } from '../../../shared/campo/registro.ts'
import type { AssinaturaClienteCampo, ClienteNaoAssinouCampo } from '../../../shared/campo/tipos.ts'
import { ir, irDaLista, mudarFolha, sha, trocar } from '../app/acoes.ts'
import { useFolha } from '../app/loja.ts'
import { AreaTexto, Botao, Cabecalho, Cartao, CampoTexto, Folha, Linha, SecaoTitulo, Tela } from '../componentes/base.tsx'
import { FolhaDePin } from '../componentes/PedidoDePin.tsx'
import { campoMostradoAoCliente, corrigirDepoisDaAssinatura, reabrir, valorParaCorrigir } from '../nucleo/folha.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'
import { rotuloDoCampo, unidadeDoCampo, valorLegivel } from '../nucleo/rotulos.ts'

const agora = () => relogioDoAparelho.agora()
const DESFECHO = { COMPLETA: 'Completa', INCOMPLETA: 'Incompleta', NAO_CALIBRADA: 'Não calibrada' } as const

/** Quem assinou (o técnico e o cliente, ou a alternativa). */
export function assinantes(f: FolhaLocal): string[] {
  const a = f.registro?.assinaturas
  if (!a) return []
  const linhas = a.tecnico ? [`${a.tecnico.nome} (técnico)`] : []
  const c = a.cliente
  switch (tipoAssinaturaCliente(c)) {
    case 'ASSINOU':
      linhas.push(`${(c as AssinaturaClienteCampo).nome} (${(c as AssinaturaClienteCampo).funcao})`)
      break
    case 'NAO_ASSINOU':
      linhas.push(`Cliente não assinou: ${(c as ClienteNaoAssinouCampo).motivo}`)
      break
    case 'DISPENSADA':
      linhas.push('Calibração no laboratório (sem assinatura do cliente)')
      break
    case 'SO_NO_PAPEL':
      linhas.push('O cliente assinou só o papel')
      break
  }
  return linhas
}

/** Os campos que dá para corrigir depois de assinar: as leituras e alguns textos e datas. */
function corrigiveis(f: FolhaLocal) {
  const r = registroCorrigido(f.registro!)
  const campos = [
    ...leiturasDoRegistro(r).map((x) => x.campo),
    'final.dataCalibracao',
    'final.termino',
    'chegada.inicio',
    'chegada.localEndereco',
    'chegada.os',
    'excentricidade.motivo',
  ]
  return campos
    .map((campo) => ({
      campo,
      atual: valorParaCorrigir(f.registro!, campo),
      rotulo: rotuloDoCampo(f.registro!, f.pacote, campo),
    }))
    .filter((x) => x.atual !== null)
}

function FolhaCorrigir({ f, aoFechar }: { f: FolhaLocal; aoFechar: () => void }) {
  const opcoes = useMemo(() => corrigiveis(f), [f])
  const [campo, setCampo] = useState('')
  const [para, setPara] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pin, setPin] = useState(false)
  const escolhido = opcoes.find((o) => o.campo === campo)
  const tipo = escolhido?.atual?.tipo
  const valido =
    !!escolhido && motivo.trim() && para !== escolhido.atual!.valor && (tipo !== 'leitura' || !para || leituraTextoValida(para))
  return (
    <Folha
      titulo="Corrigir depois da assinatura"
      rodape={
        <>
          <Botao className="flex-1" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="principal" className="flex-1" disabled={!valido} onClick={() => setPin(true)}>
            Corrigir
          </Botao>
        </>
      }
    >
      <p className="mb-3 text-[15px] text-ink-2">
        A correção entra por acréscimo: o valor assinado continua visível na folha, com o novo, o motivo e a hora.
      </p>
      {!escolhido ? (
        <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
          {opcoes.map((o) => (
            <button
              key={o.campo}
              type="button"
              onClick={() => {
                setCampo(o.campo)
                setPara(o.atual!.valor)
              }}
              className="flex min-h-[48px] items-center justify-between gap-2 rounded-xl px-3 text-left text-[15px] active:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
              <span className="font-medium tabular-nums">{valorLegivel(o.atual!.valor)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Linha rotulo={escolhido.rotulo}>
            {valorLegivel(escolhido.atual!.valor)} {tipo === 'leitura' ? unidadeDoCampo(f.registro!, f.pacote, campo) : ''}
          </Linha>
          {tipo === 'instante' ? (
            <input
              type="datetime-local"
              aria-label="Valor certo"
              onChange={(e) =>
                setPara(Number.isFinite(Date.parse(e.target.value)) ? instanteLocal(new Date(e.target.value)) : '')
              }
              className="min-h-[52px] rounded-xl border-2 border-campo bg-surface px-3 text-[17px]"
            />
          ) : (
            <CampoTexto
              rotulo="Valor certo"
              valor={para}
              aoMudar={(v) => setPara(tipo === 'leitura' ? v.replace('.', ',').replace(/\s/g, '') : v)}
              modoTeclado={tipo === 'leitura' ? 'decimal' : 'text'}
              tipo={campo === 'final.dataCalibracao' ? 'date' : 'text'}
            />
          )}
          <AreaTexto rotulo="Motivo" valor={motivo} aoMudar={setMotivo} obrigatorio />
          {campoMostradoAoCliente(campo) && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-[15px] text-warning-ink">
              ▲ Este item estava no resumo que o cliente viu: a assinatura dele fica marcada como anterior à correção.
            </p>
          )}
          <Botao variante="texto" onClick={() => setCampo('')} className="self-start">
            Escolher outro item
          </Botao>
        </div>
      )}
      {pin && (
        <FolhaDePin
          titulo="PIN do técnico"
          aoCancelar={() => setPin(false)}
          aoConfirmar={() => {
            setPin(false)
            void mudarFolha(f.envioId, (x) => corrigirDepoisDaAssinatura(x, { campo, para, motivo }, agora())).then(
              (n) => n && aoFechar(),
            )
          }}
        />
      )}
    </Folha>
  )
}

export function TelaComprovante({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  const [corrigindo, setCorrigindo] = useState(false)
  const [reabrindo, setReabrindo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pin, setPin] = useState(false)
  if (!f) return null
  const folha = f.pacote?.folha

  if (f.estado === 'ENTREGUE')
    return (
      <Tela>
        <Cabecalho titulo="Folha entregue" aoVoltar={() => irDaLista()} />
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-brand-soft text-[32px] text-brand-ink">✓</div>
          <div className="numero-fc text-[22px] font-semibold">{f.numero}</div>
          <div className="text-[16px]">{f.resumo.cliente}</div>
          <p className="text-[16px] text-ink-2">
            Recebida pelo servidor em{' '}
            {formatarInstante(f.recibo?.recebidoEm ? instanteLocal(new Date(f.recibo.recebidoEm)) : f.entregueEm)}.
          </p>
          <p className="text-[14px] text-ink-2">As leituras e as assinaturas já saíram do celular. Este resumo some em 7 dias.</p>
        </div>
      </Tela>
    )
  if (!f.registro) return null
  const r = f.registro
  return (
    <Tela
      rodape={
        f.estado === 'FINALIZADA' ? (
          <div className="flex flex-col gap-2">
            <Botao onClick={() => ir({ nome: 'verFolha', envioId })}>Ver a folha</Botao>
            <div className="flex gap-2">
              <Botao className="flex-1" onClick={() => setCorrigindo(true)}>
                Corrigir…
              </Botao>
              <Botao className="flex-1" onClick={() => setReabrindo(true)}>
                Reabrir…
              </Botao>
            </div>
          </div>
        ) : undefined
      }
    >
      <Cabecalho titulo="Minhas folhas" aoVoltar={() => irDaLista()} />
      <div className="flex flex-col items-center gap-1 px-5 pt-8 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-brand-soft text-[32px] text-brand-ink">✓</div>
        <h1 className="text-[22px] font-semibold">Folha finalizada</h1>
        <div className="numero-fc text-[20px] font-semibold">{f.numero}</div>
        <div className="text-[16px] text-ink-2">{formatarInstante(r.assinaturas.tecnico?.em || r.relogio.finalizadoEm)}</div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Cartao>
          <div className="text-[15px] text-ink-2">Assinada por</div>
          {assinantes(f).map((a) => (
            <div key={a} className="text-[17px] font-medium">
              {a}
            </div>
          ))}
          <div className="mt-2 text-[15px] text-ink-2">
            Desfecho: <span className="font-medium text-ink">{DESFECHO[r.desfecho]}</span>
            {r.motivoDesfecho ? ` · ${r.motivoDesfecho}` : ''}
          </div>
        </Cartao>
        <div className="rounded-2xl bg-surface-3 px-4 py-3 text-[16px]">
          <span className="font-semibold">⊘ Trancada. Aguardando entrega:</span> vai sozinha quando o celular estiver na rede da
          empresa.
          {f.entrega.erro && <p className="mt-1 text-[15px] text-warning-ink">▲ {f.entrega.erro}</p>}
        </div>
        {folha?.numeroCertificado && (
          <Cartao>
            Etiqueta: copie <span className="numero-fc font-semibold">{folha.numeroCertificado}</span> no campo CERTIFICADO Nº.
          </Cartao>
        )}
        {r.correcoesPosAssinatura.length > 0 && (
          <>
            <SecaoTitulo>Corrigido depois da assinatura</SecaoTitulo>
            {r.correcoesPosAssinatura.map((c, i) => (
              <div key={i} className="rounded-xl bg-surface px-3 py-2 text-[15px]">
                <div className="font-medium">{rotuloDoCampo(r, f.pacote, c.campo)}</div>
                <div>
                  <s className="text-ink-2">{valorLegivel(c.de)}</s> → <b>{valorLegivel(c.para)}</b> · {formatarInstante(c.em)}
                </div>
                <div className="text-ink-2">
                  {c.motivo}
                  {c.mostradoAoCliente ? ' · item mostrado ao cliente' : ''}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {corrigindo && <FolhaCorrigir f={f} aoFechar={() => setCorrigindo(false)} />}
      {reabrindo && (
        <Folha
          titulo="Reabrir a folha"
          rodape={
            <>
              <Botao className="flex-1" onClick={() => setReabrindo(false)}>
                Cancelar
              </Botao>
              <Botao variante="perigo" className="flex-1" disabled={!motivo.trim()} onClick={() => setPin(true)}>
                Reabrir
              </Botao>
            </>
          }
        >
          <p className="mb-3 text-[16px]">
            Reabrir apaga as duas assinaturas. Você vai precisar colher a assinatura do cliente de novo. Para corrigir um valor
            só, use "Corrigir…".
          </p>
          <AreaTexto rotulo="Por que reabrir?" valor={motivo} aoMudar={setMotivo} obrigatorio autoFoco />
        </Folha>
      )}
      {pin && (
        <FolhaDePin
          titulo="PIN do técnico"
          aoCancelar={() => setPin(false)}
          aoConfirmar={() => {
            setPin(false)
            setReabrindo(false)
            void mudarFolha(envioId, (x) => reabrir(x, motivo, sha, agora())).then(
              (n) => n && trocar({ nome: 'revisao', envioId }),
            )
          }}
        />
      )}
    </Tela>
  )
}
