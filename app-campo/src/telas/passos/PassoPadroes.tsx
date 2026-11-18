// Passo 1 · Padrões: "Levado" e "Usado" de cada padrão da folha, a validade na data (▲ vermelho se vencido) e "Usei
// outro", a partir dos ativos que vieram no pacote.

import { useState } from 'react'
import { situacaoValidade } from '../../../../shared/dominio.ts'
import { AvisoNaHora } from '../../componentes/Avisos.tsx'
import { Botao, Cartao, Folha, Marcar, SecaoTitulo, Selo } from '../../componentes/base.tsx'
import { useGravar } from '../../componentes/CamposDaFolha.tsx'
import { dataBr } from '../../nucleo/datas.ts'
import type { PropsPasso } from '../Passo.tsx'

export function PassoPadroes({ f, analise }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const [escolhendo, setEscolhendo] = useState(false)
  const lista = f.registro.passos.padroes
  const cadastro = f.pacote?.padroes.cadastro ?? []
  const previstos = f.pacote?.padroes.previstos ?? []
  const data = f.pacote?.folha.dataDosPadroes || f.pacote?.folha.dataPrevista || ''
  const outros = cadastro.filter((p) => !lista.some((x) => x.id === p.id))
  const avisos = (analise?.avisos ?? []).filter((a) => a.passo === 1)
  const situacao = (id: string) => {
    const prev = previstos.find((p) => p.id === id)?.situacao
    if (prev) return prev
    const p = cadastro.find((x) => x.id === id)
    return p && data ? situacaoValidade(p.validade, data) : 'SEM_DATA'
  }
  const mudar = (id: string, campo: 'levado' | 'usado', v: boolean) =>
    void gravar((r) => {
      const p = r.passos.padroes.find((x) => x.id === id)
      if (p) p[campo] = v
    })

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[16px] text-ink-2">
        Marque o que levou e o que usou. Validade conferida para {data ? dataBr(data) : 'o dia da calibração'}.
      </p>
      {lista.length === 0 && <p className="text-[16px] text-ink-2">A folha não trouxe padrões. Use "Usei outro padrão".</p>}
      {lista.map((p) => {
        const s = situacao(p.id)
        const cad = cadastro.find((x) => x.id === p.id)
        return (
          <Cartao key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[17px] font-semibold">{p.identificacao}</div>
                <div className="text-[14px] text-ink-2">
                  {[cad?.descricao, previstos.find((x) => x.id === p.id)?.separar].filter(Boolean).join(' · ')}
                  {cad?.validade ? ` · validade ${dataBr(cad.validade)}` : ''}
                </div>
              </div>
              {s === 'VENCIDO' && <Selo tom="vermelho">▲ Vencido</Selo>}
              {s === 'VENCENDO' && <Selo tom="ambar">▲ Vence logo</Selo>}
              {p.outro && <Selo>Outro</Selo>}
            </div>
            <div className="mt-3 flex gap-2">
              <Marcar marcado={p.levado} aoMudar={(v) => mudar(p.id, 'levado', v)}>
                Levado
              </Marcar>
              <Marcar marcado={p.usado} aoMudar={(v) => mudar(p.id, 'usado', v)}>
                Usado
              </Marcar>
            </div>
          </Cartao>
        )
      })}
      {avisos.map((a) => (
        <AvisoNaHora key={`${a.codigo}|${a.campo}|${a.texto}`} aviso={a} compacto />
      ))}
      {outros.length > 0 && <Botao onClick={() => setEscolhendo(true)}>+ Usei outro padrão</Botao>}
      {escolhendo && (
        <Folha
          titulo="Usei outro padrão"
          aoFechar={() => setEscolhendo(false)}
          rodape={
            <Botao className="flex-1" onClick={() => setEscolhendo(false)}>
              Fechar
            </Botao>
          }
        >
          <SecaoTitulo>Padrões ativos da empresa</SecaoTitulo>
          <div className="flex flex-col gap-2">
            {outros.map((p) => (
              <Botao
                key={p.id}
                className="justify-between"
                onClick={() => {
                  setEscolhendo(false)
                  void gravar(
                    (r) =>
                      void r.passos.padroes.push({
                        id: p.id,
                        identificacao: p.identificacao,
                        levado: true,
                        usado: true,
                        outro: true,
                      }),
                  )
                }}
              >
                <span className="text-left">
                  {p.identificacao}
                  <span className="block text-[13px] font-normal text-ink-2">{p.descricao}</span>
                </span>
                {data && situacaoValidade(p.validade, data) === 'VENCIDO' && <Selo tom="vermelho">▲ Vencido</Selo>}
              </Botao>
            ))}
          </div>
        </Folha>
      )}
    </div>
  )
}
