// Passo 6 · Repetibilidade: a carga ● (a prevista, ou digitada), "Zere antes de cada vez. Carga no centro.", as leituras
// com o contador ("3 de 5 · mínimo 5"; 10 na classe I; 3 com 100 kg ou mais) e "Repetir 150,00" (uma leitura por toque,
// marcada como repetida; não existe "preencher todas"). Folha sem plano: "+ Acrescentar ensaio".

import type { ReactNode } from 'react'
import { descreverPecas } from '../../../../shared/calibracao.ts'
import { unidadeDoRegistro } from '../../../../shared/campo/importar.ts'
import type { Padrao } from '../../../../shared/tipos.ts'
import { novoId } from '../../../../shared/id.ts'
import { Botao, Cartao, MarcaObrigatorio } from '../../componentes/base.tsx'
import { useGravar } from '../../componentes/CamposDaFolha.tsx'
import { Celula, EditorDeLeituras } from '../../componentes/EditorDeLeituras.tsx'
import type { ContextoTabela } from '../../componentes/EditorDeLeituras.tsx'
import { leiturasPrevistas, ordemRepetibilidade, textoCargaPrevista, textoDaCargaDoItem } from '../../nucleo/ordem.ts'
import type { PropsPasso } from '../Passo.tsx'

export function PassoRepetibilidade({ f, foco, aoFocar }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const r = f.registro
  const pacote = f.pacote
  const u = unidadeDoRegistro(r, pacote)
  const ensaios = r.passos.repetibilidade
  const ordem = ordemRepetibilidade(r, pacote)
  const campos = ensaios.flatMap((e) => [
    ...(!e.cargaPrevista ? [`repetibilidade.${e.id}.cargaAplicada`] : []),
    ...ordem.filter((c) => c.startsWith(`repetibilidade.${e.id}.`)),
  ])
  // A leitura a mais em foco ("+ Mais uma leitura") entra na ordem
  if (foco && /^repetibilidade\.[^.]+\.leituras\.\d+$/.test(foco) && !campos.includes(foco)) {
    const id = foco.split('.')[1]
    const ultima =
      campos
        .map((c, i) => (c.startsWith(`repetibilidade.${id}.`) ? i : -1))
        .filter((i) => i >= 0)
        .at(-1) ?? campos.length - 1
    campos.splice(ultima + 1, 0, foco)
  }
  const cadastro = (pacote?.padroes.cadastro ?? []) as Padrao[]
  const pesos = (id: string) => {
    const i = pacote?.entrada.repetibilidade.findIndex((x) => x.id === id) ?? -1
    const plano = i >= 0 ? pacote?.plano?.repetibilidade[i] : undefined
    return plano?.pesos || (plano ? descreverPecas(plano.pecas, cadastro) : '')
  }

  const descrever = (campo: string): ReactNode => {
    const id = campo.split('.')[1]
    const e = ensaios.find((x) => x.id === id)
    if (!e) return null
    const carga = textoDaCargaDoItem(e, r, pacote)
    return [
      carga ? `Carga ${carga} ${u}` : 'Digite a carga aplicada',
      pesos(id) ? `pesos ${pesos(id)}` : '',
      'zere antes de cada vez',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const tabela = (ctx: ContextoTabela) => (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[15px] text-ink-2">
        Zere antes de cada vez, aplique a carga no centro e anote a indicação. Zero que não voltou: em Anotações.
      </p>
      {ensaios.length === 0 && <p className="text-[16px] text-ink-2">Esta folha não trouxe a carga da repetibilidade.</p>}
      {ensaios.map((e, k) => {
        const previstas = leiturasPrevistas(r, pacote, e.id)
        const n = Math.max(previstas, e.leituras.length)
        return (
          <Cartao key={e.id}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[16px] font-semibold">
                {ensaios.length > 1 ? `Ensaio ${k + 1} · ` : ''}Carga <MarcaObrigatorio />
              </div>
              {e.cargaPrevista ? (
                <div className="text-[18px] font-semibold tabular-nums">
                  {textoCargaPrevista(e.cargaPrevista, r, pacote)} {u}
                </div>
              ) : (
                <div className="w-36">
                  <Celula campo={`repetibilidade.${e.id}.cargaAplicada`} ctx={ctx} registro={r} vazio="digite" />
                </div>
              )}
            </div>
            {pesos(e.id) && <div className="text-[14px] text-ink-2">pesos: {pesos(e.id)}</div>}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {Array.from({ length: n }, (_, j) => (
                <div key={j} className="flex items-center gap-1">
                  <span className="w-5 text-right text-[13px] text-ink-2">{j + 1}</span>
                  <Celula campo={`repetibilidade.${e.id}.leituras.${j}`} ctx={ctx} registro={r} />
                </div>
              ))}
              {foco === `repetibilidade.${e.id}.leituras.${n}` && (
                <div className="flex items-center gap-1">
                  <span className="w-5 text-right text-[13px] text-ink-2">{n + 1}</span>
                  <Celula campo={foco} ctx={ctx} registro={r} />
                </div>
              )}
            </div>
            <div className="mt-2 text-[15px] font-medium">
              {e.leituras.length} de {previstas} leituras · mínimo {previstas}
              {e.leituras.some((l) => l.via === 'repetir') && (
                <span className="font-normal text-ink-2">
                  {' '}
                  · {e.leituras.filter((l) => l.via === 'repetir').length} repetida(s)
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {e.leituras.length >= previstas && (
                <Botao onClick={() => ctx.selecionar(`repetibilidade.${e.id}.leituras.${e.leituras.length}`)}>
                  + Mais uma leitura
                </Botao>
              )}
              {e.leituras.length > 0 && (
                <Botao
                  variante="texto"
                  onClick={() => {
                    aoFocar(null)
                    void gravar((x) => void x.passos.repetibilidade.find((y) => y.id === e.id)?.leituras.pop())
                  }}
                >
                  Apagar a última leitura
                </Botao>
              )}
            </div>
          </Cartao>
        )
      })}
      {!pacote?.plano && (
        <Botao
          onClick={() => {
            const id = `cel-${novoId()}`
            void gravar(
              (x) => void x.passos.repetibilidade.push({ id, cargaPrevista: '', cargaAplicada: null, leituras: [] }),
            ).then((nova) => nova && aoFocar(`repetibilidade.${id}.cargaAplicada`))
          }}
        >
          + Acrescentar ensaio
        </Botao>
      )}
    </div>
  )

  return <EditorDeLeituras folha={f} campos={campos} foco={foco} aoFocar={aoFocar} descrever={descrever} tabela={tabela} />
}
