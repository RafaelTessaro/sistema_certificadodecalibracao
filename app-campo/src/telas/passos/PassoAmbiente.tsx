// Passo 4 · Ambiente, no início e no fim (o do fim abre sozinho depois do passo 7, com o mesmo instrumento): data e hora,
// temperatura ●, umidade (● na classe I), pressão ● em hPa e o instrumento. Classe I: o ΔT pesos − ar ● com "Medir de
// novo" (cada medição é uma observação própria; vale a última antes do 1º ensaio), "Pesos no local desde…", o ΔT0 pela
// aclimatação e a linha do início medida de novo depois de aguardar.

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Botao, Cartao, cn, MarcaObrigatorio } from '../../componentes/base.tsx'
import { CampoInstante, useGravar } from '../../componentes/CamposDaFolha.tsx'
import { Celula, EditorDeLeituras } from '../../componentes/EditorDeLeituras.tsx'
import type { ContextoTabela } from '../../componentes/EditorDeLeituras.tsx'
import { rotuloDaLinha } from '../../nucleo/rotulos.ts'
import type { PropsPasso } from '../Passo.tsx'

function LinhaLeitura({
  rotulo,
  obrigatorio,
  campo,
  unidade,
  ctx,
  f,
}: {
  rotulo: string
  obrigatorio?: boolean
  campo: string
  unidade: string
  ctx: ContextoTabela
  f: PropsPasso['f']
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line py-1 last:border-0">
      <span className="w-32 shrink-0 text-[16px]">
        {rotulo} {obrigatorio && <MarcaObrigatorio />}
      </span>
      <div className="flex-1">
        <Celula campo={campo} ctx={ctx} registro={f.registro} vazio="—" />
      </div>
      <span className="w-10 text-[15px] text-ink-2">{unidade}</span>
    </div>
  )
}

function Instrumentos({
  ids,
  opcoes,
  aoMudar,
  rotulo = 'Instrumento',
}: {
  ids: string[]
  opcoes: Array<{ id: string; identificacao: string }>
  aoMudar: (ids: string[]) => void
  rotulo?: string
}) {
  if (!opcoes.length) return null
  return (
    <div className="pt-2">
      <div className="mb-1 text-[15px] font-medium text-ink-2">{rotulo}</div>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const marcado = ids.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={marcado}
              onClick={() => aoMudar(marcado ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
              className={cn(
                'min-h-[48px] rounded-xl border-2 px-3 text-[15px] font-medium',
                marcado ? 'border-brand bg-brand-soft text-brand-ink' : 'border-campo bg-surface',
              )}
            >
              {marcado ? '✓ ' : ''}
              {o.identificacao}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function PassoAmbiente({ f, foco, aoFocar, momento }: PropsPasso & { momento: 'INICIO' | 'FIM' }) {
  const gravar = useGravar(f.envioId)
  const amb = f.registro.passos.ambiente
  const classeI = f.registro.passos.indicacao.calInterno !== null
  const iFim =
    amb.linhas
      .map((l, i) => (l.momento === 'FIM' ? i : -1))
      .filter((i) => i >= 0)
      .at(-1) ?? -1
  const indices =
    momento === 'FIM' ? (iFim >= 0 ? [iFim] : []) : amb.linhas.map((l, i) => (l.momento !== 'FIM' ? i : -1)).filter((i) => i >= 0)
  const iInicio = amb.linhas.findIndex((l) => l.momento === 'INICIO')
  const cadastro = f.pacote?.padroes.cadastro ?? []
  const instrumentos = cadastro.filter((p) => p.tipo === 'TERMOHIGROMETRO' || p.tipo === 'BAROMETRO' || p.tipo === 'OUTRO')
  const limite = f.pacote?.plano?.limiteDeltaTPesos

  // O fim abre com o mesmo instrumento do início
  useEffect(() => {
    if (momento !== 'FIM' || iFim < 0 || iInicio < 0) return
    if (!amb.linhas[iFim].instrumentos.length && amb.linhas[iInicio].instrumentos.length)
      void gravar((r) => void (r.passos.ambiente.linhas[iFim].instrumentos = [...r.passos.ambiente.linhas[iInicio].instrumentos]))
  }, [momento]) // oxlint-disable-line react-hooks/exhaustive-deps

  const campos: string[] = indices.flatMap((i) => [
    `ambiente.linhas.${i}.temperatura`,
    `ambiente.linhas.${i}.umidade`,
    `ambiente.linhas.${i}.pressao`,
  ])
  if (classeI && momento === 'INICIO') {
    campos.push(`ambiente.deltaT.${Math.max(0, amb.deltaT.length - 1)}.valor`)
    if (foco && /^ambiente\.deltaT\.\d+\.valor$/.test(foco) && !campos.includes(foco)) campos.push(foco)
  }

  const tabela = (ctx: ContextoTabela): ReactNode => (
    <div className="flex flex-col gap-3 p-4">
      {momento === 'FIM' && <p className="text-[16px] text-ink-2">Agora, o ambiente no fim: mesmo lugar, mesmo instrumento.</p>}
      {indices.map((i) => {
        const l = amb.linhas[i]
        return (
          <Cartao key={i}>
            <div className="mb-2 text-[16px] font-semibold">
              {rotuloDaLinha(f.registro, i)}
              {l.momento === 'INICIO' && <span className="font-normal text-ink-2"> · 15 min depois de chegar</span>}
            </div>
            <CampoInstante
              rotulo="Data e hora"
              valor={l.em}
              aoMudar={(v) => void gravar((r) => void (r.passos.ambiente.linhas[i].em = v))}
            />
            <div className="mt-2">
              <LinhaLeitura
                f={f}
                ctx={ctx}
                rotulo="Temperatura"
                obrigatorio
                campo={`ambiente.linhas.${i}.temperatura`}
                unidade="°C"
              />
              <LinhaLeitura
                f={f}
                ctx={ctx}
                rotulo="Umidade"
                obrigatorio={classeI && momento === 'INICIO'}
                campo={`ambiente.linhas.${i}.umidade`}
                unidade="%"
              />
              <LinhaLeitura
                f={f}
                ctx={ctx}
                rotulo="Pressão"
                obrigatorio={momento === 'INICIO'}
                campo={`ambiente.linhas.${i}.pressao`}
                unidade="hPa"
              />
            </div>
            <Instrumentos
              ids={l.instrumentos}
              opcoes={instrumentos}
              aoMudar={(ids) => void gravar((r) => void (r.passos.ambiente.linhas[i].instrumentos = ids))}
            />
          </Cartao>
        )
      })}
      {classeI && momento === 'INICIO' && (
        <>
          <Cartao>
            <div className="mb-1 text-[16px] font-semibold">
              ΔT pesos − ar <MarcaObrigatorio />
            </div>
            <p className="mb-2 text-[15px] text-ink-2">
              Antes do 1º ensaio{limite ? ` · até ${String(limite).replace('.', ',')} °C` : ''}. Vale a última medição.
            </p>
            {(amb.deltaT.length ? amb.deltaT : [null]).map((_, k) => (
              <LinhaLeitura
                key={k}
                f={f}
                ctx={ctx}
                rotulo={`Medição ${k + 1}`}
                campo={`ambiente.deltaT.${k}.valor`}
                unidade="°C"
              />
            ))}
            {foco === `ambiente.deltaT.${amb.deltaT.length}.valor` && amb.deltaT.length > 0 && (
              <LinhaLeitura f={f} ctx={ctx} rotulo={`Medição ${amb.deltaT.length + 1}`} campo={foco} unidade="°C" />
            )}
            {amb.deltaT.length > 0 && (
              <Botao className="mt-2" onClick={() => ctx.selecionar(`ambiente.deltaT.${amb.deltaT.length}.valor`)}>
                Medir de novo
              </Botao>
            )}
            {amb.deltaT.length > 0 && (
              <Instrumentos
                rotulo="Instrumento da última medição"
                ids={amb.deltaT.at(-1)!.instrumento ? [amb.deltaT.at(-1)!.instrumento] : []}
                opcoes={instrumentos}
                aoMudar={(ids) =>
                  void gravar((r) => {
                    const m = r.passos.ambiente.deltaT.at(-1)
                    if (m) m.instrumento = ids.at(-1) ?? ''
                  })
                }
              />
            )}
          </Cartao>
          <Cartao>
            <CampoInstante
              rotulo="Pesos no local desde"
              valor={amb.pesosNoLocalDesde}
              aoMudar={(v) => void gravar((r) => void (r.passos.ambiente.pesosNoLocalDesde = v))}
            />
            <div className="mt-3 text-[15px] font-medium text-ink-2">Sem termômetro de duas entradas: ΔT0 pela aclimatação</div>
            <LinhaLeitura f={f} ctx={ctx} rotulo="Pesos na origem" campo="ambiente.deltaT0.origem" unidade="°C" />
            <LinhaLeitura f={f} ctx={ctx} rotulo="Sala" campo="ambiente.deltaT0.sala" unidade="°C" />
          </Cartao>
          <Botao
            onClick={() =>
              void gravar((r) => {
                const base = r.passos.ambiente.linhas[iInicio]
                const nova = {
                  momento: 'INICIO_REPETIDA' as const,
                  em: '',
                  temperatura: null,
                  umidade: null,
                  pressao: null,
                  instrumentos: [...(base?.instrumentos ?? [])],
                }
                // No fim da lista (as posições das outras linhas não mudam: a trilha e os avisos usam a posição)
                r.passos.ambiente.linhas.push(nova)
              })
            }
          >
            Medir de novo a linha do início (depois da aclimatação)
          </Botao>
        </>
      )}
    </div>
  )

  return <EditorDeLeituras folha={f} campos={campos} foco={foco} aoFocar={aoFocar} tabela={tabela} />
}
