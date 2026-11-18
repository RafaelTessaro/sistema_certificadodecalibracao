// Passo 3 · Identificação da balança: "Confere" ou "Algo diferente…" em cada dado impresso; nos metrológicos (d, e, Max,
// Min, classe, unidade), o valor visto em campo, que os avisos passam a usar. Folha só do cliente ou em branco: a
// "Balança informada", com os mesmos campos da folha em branco impressa (classes II a IIII), guardados como texto.

import { RECEPTORES, ROTULO_CLASSE } from '../../../../shared/dominio.ts'
import {
  CAMPOS_METROLOGICOS,
  CLASSES_INFORMADAS,
  RECEPTORES_INFORMADOS,
  TIPOS_FAIXAS_INFORMADOS,
} from '../../../../shared/campo/tipos.ts'
import type { BalancaInformadaCampo, CampoConferir } from '../../../../shared/campo/tipos.ts'
import { Botao, Cartao, Escolha, SecaoTitulo } from '../../componentes/base.tsx'
import { CampoTextoDaFolha, useGravar } from '../../componentes/CamposDaFolha.tsx'
import { ConfereOuDiferente } from '../../componentes/Folhas.tsx'
import type { PropsPasso } from '../Passo.tsx'

type TextoInformado =
  | 'tipo'
  | 'fabricante'
  | 'modelo'
  | 'numeroSerie'
  | 'identificacao'
  | 'localInstalacao'
  | 'anoFabricacao'
  | 'apoios'
  | 'plataforma'
  | 'portariaAprovacao'
  | 'min'

const TIPOS_FAIXAS: Record<string, string> = {
  UNICA: 'Faixa única',
  MULTI_INTERVALO: 'Multi-intervalo',
  MULTIPLAS_FAIXAS: 'Múltiplas faixas',
}

export function PassoBalanca({ f, anotar }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const b = f.registro.passos.balanca
  const bi = b.informada
  const mudarInformada = (mudar: (x: BalancaInformadaCampo) => void) =>
    void gravar((r) => {
      if (r.passos.balanca.informada) mudar(r.passos.balanca.informada)
    })
  const texto = (campo: TextoInformado, rotulo: string, extra: { numero?: boolean; obrigatorio?: boolean } = {}) =>
    bi && (
      <CampoTextoDaFolha
        rotulo={rotulo}
        obrigatorio={extra.obrigatorio}
        valor={bi[campo]}
        modoTeclado={extra.numero ? 'decimal' : 'text'}
        aoGravar={(v) => mudarInformada((x) => void (x[campo] = v))}
        maximo={240}
      />
    )
  return (
    <div className="flex flex-col gap-1 pb-4">
      {b.conferencias.length > 0 && (
        <>
          <SecaoTitulo>Do sistema · confira na plaqueta</SecaoTitulo>
          <div className="px-4">
            <Cartao>
              {b.conferencias.map((c) => (
                <ConfereOuDiferente
                  key={c.campo}
                  item={c}
                  metrologico={CAMPOS_METROLOGICOS.includes(c.campo as CampoConferir)}
                  aoMudar={(x) =>
                    void gravar((r) => {
                      const alvo = r.passos.balanca.conferencias.find((y) => y.campo === c.campo)
                      if (!alvo) return
                      alvo.confere = x.confere
                      if (x.observado === undefined) delete alvo.observado
                      else alvo.observado = x.observado
                    })
                  }
                  aoAnotar={() => anotar(c.campo, 'DADO_DIFERENTE')}
                />
              ))}
            </Cartao>
          </div>
        </>
      )}
      {bi && (
        <>
          <SecaoTitulo>Balança informada (escreva como na plaqueta)</SecaoTitulo>
          <div className="flex flex-col gap-3 px-4">
            {texto('tipo', 'Tipo (plataforma, bancada, rodoviária…)')}
            {texto('fabricante', 'Fabricante')}
            {texto('modelo', 'Modelo')}
            {texto('numeroSerie', 'Nº de série')}
            {texto('identificacao', 'Identificação / TAG do cliente')}
            {texto('localInstalacao', 'Local de instalação')}
            {texto('anoFabricacao', 'Ano de fabricação', { numero: true })}
            {texto('apoios', 'Nº de apoios', { numero: true })}
            {texto('plataforma', 'Plataforma (fabricante, modelo e série)')}
            {texto('portariaAprovacao', 'Portaria de aprovação')}
            <Escolha
              rotulo="Classe"
              opcoes={CLASSES_INFORMADAS.map((c) => ({ valor: c || 'NENHUMA', texto: ROTULO_CLASSE[c] }))}
              valor={bi.classe || null}
              aoEscolher={(v) =>
                mudarInformada((x) => void (x.classe = v === 'NENHUMA' ? '' : (v as BalancaInformadaCampo['classe'])))
              }
            />
            <Escolha
              rotulo="Receptor de carga"
              opcoes={RECEPTORES_INFORMADOS.filter(Boolean).map((r) => ({
                valor: r,
                texto: RECEPTORES[r as keyof typeof RECEPTORES].replace(/ \(.*\)$/, ''),
              }))}
              valor={bi.receptor}
              aoEscolher={(v) => mudarInformada((x) => void (x.receptor = v))}
            />
            <Escolha
              rotulo="Faixas"
              opcoes={TIPOS_FAIXAS_INFORMADOS.filter(Boolean).map((t) => ({ valor: t, texto: TIPOS_FAIXAS[t] }))}
              valor={bi.tipoFaixas}
              aoEscolher={(v) => mudarInformada((x) => void (x.tipoFaixas = v))}
            />
            <Escolha
              rotulo={
                <>
                  Unidade (vale para Max, e, d e Min) <span className="text-brand-ink">●</span>
                </>
              }
              opcoes={(['g', 'kg', 't', 'mg'] as const).map((u) => ({ valor: u, texto: u }))}
              valor={bi.unidade}
              aoEscolher={(v) => mudarInformada((x) => void (x.unidade = v))}
            />
            {bi.faixas.map((fx, i) => (
              <Cartao key={i}>
                <div className="mb-2 text-[15px] font-semibold">
                  {bi.faixas.length > 1 ? `Faixa ${i + 1}` : 'Faixa'} {bi.unidade ? `(${bi.unidade})` : ''}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['max', 'e', 'd'] as const).map((k) => (
                    <CampoTextoDaFolha
                      key={k}
                      rotulo={k === 'max' ? 'Max' : k}
                      obrigatorio={k !== 'e'}
                      valor={fx[k]}
                      modoTeclado="decimal"
                      maximo={40}
                      aoGravar={(v) => mudarInformada((x) => void (x.faixas[i][k] = v))}
                    />
                  ))}
                </div>
              </Cartao>
            ))}
            <div className="flex gap-2">
              {bi.faixas.length < 3 && (
                <Botao onClick={() => mudarInformada((x) => void x.faixas.push({ max: '', e: '', d: '' }))}>+ Outra faixa</Botao>
              )}
              {bi.faixas.length > 1 && (
                <Botao onClick={() => mudarInformada((x) => void x.faixas.pop())}>Tirar a última faixa</Botao>
              )}
            </div>
            {texto('min', `Min${bi.unidade ? ` (${bi.unidade})` : ''}`, { numero: true })}
          </div>
        </>
      )}
      {!bi && b.conferencias.length === 0 && (
        <p className="p-4 text-[16px] text-ink-2">Esta folha não tem dados da balança para conferir.</p>
      )}
    </div>
  )
}
