// Passo 7 · Excentricidade: o desenho do receptor com a posição atual em verde e ✓ nas feitas; na classe I, o zero
// antes e a indicação de cada posição; "Repetir" com a mesma marca. Previsto como não aplicável: "Não se aplica,
// confirmo" ou "Fazer o ensaio". Depois da última posição, o app abre sozinho o ambiente do fim.

import type { ReactNode } from 'react'
import { descreverPecas } from '../../../../shared/calibracao.ts'
import { unidadeDoRegistro } from '../../../../shared/campo/importar.ts'
import type { Padrao } from '../../../../shared/tipos.ts'
import { Botao, Cartao, cn, MarcaObrigatorio } from '../../componentes/base.tsx'
import { CampoTextoDaFolha, useGravar } from '../../componentes/CamposDaFolha.tsx'
import { Celula, EditorDeLeituras } from '../../componentes/EditorDeLeituras.tsx'
import type { ContextoTabela } from '../../componentes/EditorDeLeituras.tsx'
import { excentricidadeComZero, lidoNoCaminho, ordemExcentricidade } from '../../nucleo/ordem.ts'
import type { PropsPasso } from '../Passo.tsx'

/** Onde desenhar cada posição (x, y de 0 a 1): centro e 4 cantos; senão, em volta do centro. */
function lugares(rotulos: string[]): Array<{ x: number; y: number }> {
  const n = rotulos.length
  const centro = rotulos.findIndex((r) => /centro/i.test(r))
  if (n === 5 && centro === 0)
    return [
      { x: 0.5, y: 0.5 },
      { x: 0.15, y: 0.82 },
      { x: 0.15, y: 0.18 },
      { x: 0.85, y: 0.18 },
      { x: 0.85, y: 0.82 },
    ]
  return rotulos.map((r, i) =>
    /centro/i.test(r)
      ? { x: 0.5, y: 0.5 }
      : {
          x: 0.5 + 0.38 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
          y: 0.5 + 0.36 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
        },
  )
}

export function PassoExcentricidade({ f, foco, aoFocar, irPara }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const r = f.registro
  const pacote = f.pacote
  const e = r.passos.excentricidade
  const u = unidadeDoRegistro(r, pacote)
  const comZero = excentricidadeComZero(r, pacote)
  const campos = [...(e.aplicavel && !e.cargaPrevista ? ['excentricidade.cargaAplicada'] : []), ...ordemExcentricidade(r, pacote)]
  const cadastro = (pacote?.padroes.cadastro ?? []) as Padrao[]
  const plano = pacote?.plano?.excentricidade
  const pesos = plano?.pesos || (plano ? descreverPecas(plano.pecas, cadastro) : '')
  const posicaoEmFoco = foco ? Number(/^excentricidade\.posicoes\.(\d+)/.exec(foco)?.[1] ?? -1) : -1

  if (e.aplicavel === null)
    return (
      <div className="flex flex-col gap-3 p-4">
        <Cartao>
          <p className="text-[17px] font-medium">Ensaio previsto como não aplicável. Confirme no local.</p>
          {e.motivo && <p className="mt-1 text-[16px] text-ink-2">Motivo previsto: {e.motivo}</p>}
        </Cartao>
        <Botao variante="principal" onClick={() => void gravar((x) => void (x.passos.excentricidade.aplicavel = false))}>
          Não se aplica, confirmo
        </Botao>
        <Botao onClick={() => void gravar((x) => void (x.passos.excentricidade.aplicavel = true))}>Fazer o ensaio</Botao>
      </div>
    )

  if (e.aplicavel === false)
    return (
      <div className="flex flex-col gap-3 p-4">
        <CampoTextoDaFolha
          rotulo="Por que a excentricidade não foi feita (sai no certificado)"
          obrigatorio
          valor={e.motivo}
          maximo={2000}
          aoGravar={(v) => void gravar((x) => void (x.passos.excentricidade.motivo = v))}
        />
        <Botao onClick={() => void gravar((x) => void (x.passos.excentricidade.aplicavel = true))}>Fazer o ensaio</Botao>
      </div>
    )

  const descrever = (campo: string): ReactNode => {
    const carga = e.cargaAplicada?.valor ?? e.cargaPrevista
    if (campo === 'excentricidade.cargaAplicada') return 'A carga usada nas posições'
    return [
      carga ? `Carga ${carga} ${u}` : '',
      pesos ? `pesos ${pesos}` : '',
      campo.endsWith('zeroAntes') ? 'zere antes da posição' : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const pos = lugares(e.posicoes.map((p) => p.rotulo))
  const tabela = (ctx: ContextoTabela) => (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[16px] font-semibold">
          Carga <MarcaObrigatorio />
        </span>
        {e.cargaPrevista ? (
          <span className="text-[18px] font-semibold tabular-nums">
            {e.cargaPrevista} {u}
            {pesos && <span className="block text-right text-[14px] font-normal text-ink-2">{pesos}</span>}
          </span>
        ) : (
          <div className="w-36">
            <Celula campo="excentricidade.cargaAplicada" ctx={ctx} registro={r} vazio="digite" />
          </div>
        )}
      </div>
      <p className="text-[15px] text-ink-2">
        {comZero ? 'Zere antes de cada posição.' : 'Zere vazia e desloque a carga pelas posições.'}
      </p>
      <div className="relative mx-auto aspect-[4/3] w-full max-w-[320px]">
        <div className="absolute inset-[6%] rounded-xl border-2 border-campo" />
        <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[12px] font-semibold text-ink-2">TRÁS</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[12px] font-semibold text-ink-2">FRENTE</span>
        {e.posicoes.map((p, i) => {
          const feita = lidoNoCaminho(r, `excentricidade.posicoes.${i}.leitura`)
          const atual = i === posicaoEmFoco
          return (
            <button
              key={i}
              type="button"
              onClick={() =>
                ctx.selecionar(
                  comZero && !lidoNoCaminho(r, `excentricidade.posicoes.${i}.zeroAntes`)
                    ? `excentricidade.posicoes.${i}.zeroAntes`
                    : `excentricidade.posicoes.${i}.leitura`,
                )
              }
              aria-label={`Posição ${p.rotulo}${feita ? ', feita' : ''}`}
              className={cn(
                'absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[15px] font-semibold',
                atual
                  ? 'border-brand bg-brand text-on-brand'
                  : feita
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-campo bg-surface',
              )}
              style={{ left: `${pos[i].x * 100}%`, top: `${pos[i].y * 100}%` }}
            >
              {feita && !atual ? '✓' : i + 1}
            </button>
          )
        })}
      </div>
      <div>
        {e.posicoes.map((p, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-line py-1 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[15px]">
              {i + 1} · {p.rotulo}
            </span>
            {comZero && (
              <div className="w-28">
                <Celula campo={`excentricidade.posicoes.${i}.zeroAntes`} ctx={ctx} registro={r} vazio="zero" />
              </div>
            )}
            <div className="w-32">
              <Celula campo={`excentricidade.posicoes.${i}.leitura`} ctx={ctx} registro={r} />
            </div>
          </div>
        ))}
      </div>
      <Botao
        variante="texto"
        onClick={() => void gravar((x) => void (x.passos.excentricidade.aplicavel = false))}
        className="self-start"
      >
        Não foi possível fazer o ensaio
      </Botao>
    </div>
  )

  return (
    <EditorDeLeituras
      folha={f}
      campos={campos}
      foco={foco}
      aoFocar={aoFocar}
      descrever={descrever}
      tabela={tabela}
      rotuloFim="Ambiente fim"
      aoTerminar={() => irPara('ambienteFim')}
    />
  )
}
