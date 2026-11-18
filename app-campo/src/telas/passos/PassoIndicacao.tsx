// Passo 5 · Erro de indicação: a tabela do passo em cima (Nº, carga, ↑, ↓), a leitura em foco no meio e o teclado
// embaixo, SEM "Repetir". A "Próxima" segue a ordem física: sobe até Max e desce a partir do ponto mais alto; com
// substituição, as etapas entram intercaladas. Classe I: o ajuste interno (CAL) com a hora. Linha de reserva: "+
// Acrescentar ponto" (a carga é digitada).

import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { descreverPecas } from '../../../../shared/calibracao.ts'
import { METODOS_CARREGAMENTO } from '../../../../shared/dominio.ts'
import type { PontoCampo } from '../../../../shared/campo/tipos.ts'
import type { Padrao } from '../../../../shared/tipos.ts'
import { novoId } from '../../../../shared/id.ts'
import { Botao, Marcar } from '../../componentes/base.tsx'
import { CampoTextoDaFolha, useGravar } from '../../componentes/CamposDaFolha.tsx'
import { Celula, EditorDeLeituras } from '../../componentes/EditorDeLeituras.tsx'
import type { ContextoTabela } from '../../componentes/EditorDeLeituras.tsx'
import { formatarInstante } from '../../../../shared/campo/registro.ts'
import { cargaDoPonto, colunasDaIndicacao, metodoDaFolha, ordemIndicacao, pontoComDescida } from '../../nucleo/ordem.ts'
import { unidadeDoRegistro } from '../../../../shared/campo/importar.ts'
import { relogioDoAparelho } from '../../nucleo/relogio.ts'
import type { PropsPasso } from '../Passo.tsx'

export function PassoIndicacao({ f, foco, aoFocar }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const r = f.registro
  const ind = r.passos.indicacao
  const pacote = f.pacote
  const u = unidadeDoRegistro(r, pacote)
  const { sobe, desce } = colunasDaIndicacao(pacote)
  const metodo = METODOS_CARREGAMENTO[metodoDaFolha(pacote)]
  const ordem = ordemIndicacao(r, pacote)
  // Os pontos acrescentados: primeiro a carga, depois a leitura
  const campos = ordem.flatMap((c) => {
    const m = /^indicacao\.pontos\.([^.]+)\.crescente$/.exec(c)
    const p = m && ind.pontos.find((x) => x.id === m[1])
    return p?.acrescentado ? [`indicacao.pontos.${p.id}.cargaAplicada`, c] : [c]
  })
  const pontos = ind.pontos
    .map((p, i) => ({ p, i, carga: cargaDoPonto(p) }))
    .sort((a, b) => (a.carga ?? Infinity) - (b.carga ?? Infinity) || a.i - b.i)
  const etapas = ind.substituicao?.etapas ?? []
  const cadastro = (pacote?.padroes.cadastro ?? []) as Padrao[]

  const pesosDoPonto = (p: PontoCampo): string => {
    if (p.pecasTrocadas || !pacote?.plano) return descreverPecas(p.pecas, cadastro)
    const i = pacote.entrada.indicacao.pontos.findIndex((x) => x.id === p.id)
    return pacote.plano.pontos[i]?.pesos || descreverPecas(p.pecas, cadastro)
  }

  const descrever = (campo: string): ReactNode => {
    const m = /^indicacao\.pontos\.([^.]+)\./.exec(campo)
    const p = m && ind.pontos.find((x) => x.id === m[1])
    if (p) {
      const carga = p.cargaAplicada?.valor ?? p.cargaPrevista
      const pesos = pesosDoPonto(p)
      return [
        carga ? `Carga ${carga} ${u}` : 'Digite a carga aplicada',
        p.nivelSubstituicao ? `${p.nivelSubstituicao} substituição(ões) por baixo` : '',
        pesos ? `pesos ${pesos}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    }
    if (campo.startsWith('indicacao.substituicao'))
      return 'Anote com os pesos padrão; troque-os pela substituição até a mesma indicação e anote de novo.'
    if (campo === 'indicacao.retornoZero') return 'Retire toda a carga e anote o zero.'
    return null
  }

  const acrescentarPonto = () => {
    const id = `cel-${novoId()}`
    void gravar(
      (x) =>
        void x.passos.indicacao.pontos.push({
          id,
          acrescentado: true,
          cargaPrevista: '',
          cargaAplicada: null,
          pecas: [],
          pecasTrocadas: false,
          nivelSubstituicao: 0,
          crescente: null,
          decrescente: null,
        }),
    ).then((nova) => nova && aoFocar(`indicacao.pontos.${id}.cargaAplicada`))
  }

  const linhaPonto = (p: PontoCampo, n: number, ctx: ContextoTabela) => (
    <tr key={p.id} className="border-b border-line">
      <td className="py-1 pl-3 text-[15px] text-ink-2">{n}</td>
      <td className="py-1 pr-1 text-right text-[16px] tabular-nums">
        {p.acrescentado ? (
          <Celula campo={`indicacao.pontos.${p.id}.cargaAplicada`} ctx={ctx} registro={r} vazio="carga?" />
        ) : (
          p.cargaPrevista
        )}
      </td>
      {sobe && (
        <td className="py-1">
          <Celula campo={`indicacao.pontos.${p.id}.crescente`} ctx={ctx} registro={r} />
        </td>
      )}
      {desce && (
        <td className="py-1 pr-2">
          {pontoComDescida(p, r, pacote) ? (
            <Celula campo={`indicacao.pontos.${p.id}.decrescente`} ctx={ctx} registro={r} />
          ) : (
            <div className="text-center text-muted">—</div>
          )}
        </td>
      )}
    </tr>
  )

  const linhaEtapa = (k: number, ctx: ContextoTabela) => (
    <tr key={`etapa-${k}`} className="border-b border-line bg-surface-2">
      <td colSpan={sobe && desce ? 4 : 3} className="px-3 py-2">
        <div className="text-[14px] font-semibold text-ink-2">Substituição · etapa {k + 1}</div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[13px] text-ink-2">Com os pesos</div>
            <Celula campo={`indicacao.substituicao.etapas.${k}.padroes`} ctx={ctx} registro={r} />
          </div>
          <div>
            <div className="text-[13px] text-ink-2">Com a substituição</div>
            <Celula campo={`indicacao.substituicao.etapas.${k}.substituicao`} ctx={ctx} registro={r} />
          </div>
        </div>
        <div className="mt-2">
          <CampoTextoDaFolha
            rotulo="Material da substituição"
            valor={etapas[k].material}
            maximo={240}
            aoGravar={(v) =>
              void gravar((x) => {
                const e = x.passos.indicacao.substituicao?.etapas[k]
                if (e) e.material = v
              })
            }
          />
        </div>
      </td>
    </tr>
  )

  const tabela = (ctx: ContextoTabela) => {
    const linhas: ReactNode[] = []
    const maiorNivel = Math.max(0, ...pontos.map((x) => x.p.nivelSubstituicao), etapas.length)
    for (let nivel = 0; nivel <= maiorNivel; nivel++) {
      for (const { p, i } of pontos) if (p.nivelSubstituicao === nivel) linhas.push(linhaPonto(p, i + 1, ctx))
      if (nivel < etapas.length) linhas.push(linhaEtapa(nivel, ctx))
    }
    return (
      <div className="pb-3">
        <p className="px-4 pt-2 text-[15px] text-ink-2">
          {metodo.label}: {metodo.descricao}
        </p>
        {ind.calInterno && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
            <Marcar
              marcado={ind.calInterno.feito}
              aoMudar={(v) =>
                void gravar((x) => {
                  if (x.passos.indicacao.calInterno)
                    x.passos.indicacao.calInterno = { feito: v, em: v ? relogioDoAparelho.agora() : '' }
                })
              }
            >
              Ajuste interno (CAL) de rotina feito antes dos ensaios
            </Marcar>
            {ind.calInterno.feito && <span className="text-[14px] text-ink-2">{formatarInstante(ind.calInterno.em)}</span>}
          </div>
        )}
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="border-b border-line-strong text-left text-[13px] font-semibold uppercase tracking-wide text-ink-2">
              <th className="py-2 pl-3">Nº</th>
              <th className="py-2 pr-1 text-right">Carga {u}</th>
              {sobe && <th className="py-2 pr-2 text-right">↑ {u}</th>}
              {desce && <th className="py-2 pr-3 text-right">↓ {u}</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, k) => (
              <Fragment key={k}>{l}</Fragment>
            ))}
            <tr className="bg-surface-2">
              <td colSpan={2} className="py-2 pl-3 text-[15px] font-semibold">
                Retorno ao zero <span className="text-brand-ink">●</span>
              </td>
              <td colSpan={sobe && desce ? 2 : 1} className="py-1 pr-2">
                <Celula campo="indicacao.retornoZero" ctx={ctx} registro={r} />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="px-4 pt-3">
          <Botao onClick={acrescentarPonto}>+ Acrescentar ponto</Botao>
        </div>
      </div>
    )
  }

  return <EditorDeLeituras folha={f} campos={campos} foco={foco} aoFocar={aoFocar} descrever={descrever} tabela={tabela} />
}
