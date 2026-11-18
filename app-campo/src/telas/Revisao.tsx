// Revisão (antes de assinar): "Falta para assinar" (● em branco, com "Ir ▸"), "Isto impede o certificado" (vermelho:
// "Resolver agora" ou "Registrar motivo"), "Confira a digitação" ("Conferi, está certo") e "Tudo certo". "Finalizar e
// colher assinaturas" fica ativo quando não falta ● (o motivo escrito embaixo, nunca um botão mudo); "Encerrar sem
// completar" está sempre disponível (incompleta ou não calibrada, com um motivo).

import { useState } from 'react'
import { avisoConferido, conferirAviso } from '../../../shared/campo/avisos.ts'
import type { AvisoCampo } from '../../../shared/campo/avisos.ts'
import { ETAPAS_DA_FOLHA, passoDaEtapa, podeFinalizar, TITULOS_ETAPAS } from '../../../shared/campo/progresso.ts'
import type { EtapaFolha } from '../../../shared/campo/progresso.ts'
import { ROTULO_TIPO_ANOTACAO } from '../../../shared/campo/tipos.ts'
import { ir, mudarFolha, sha, trocar, voltar } from '../app/acoes.ts'
import { useRevisao } from '../app/analise.ts'
import { useFolha } from '../app/loja.ts'
import { AvisoNaHora } from '../componentes/Avisos.tsx'
import { AreaTexto, Botao, Cabecalho, Cartao, Escolha, Folha, SecaoTitulo, Tela } from '../componentes/base.tsx'
import { editar, encerrarSemCompletar, iniciarAssinaturas, podeEditar, voltarACompletar } from '../nucleo/folha.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'

const DESFECHO = { INCOMPLETA: 'Incompleta', NAO_CALIBRADA: 'Não calibrada' } as const

/** A etapa de um campo (para o "Ir ▸"). */
function etapaDoCampo(campo: string, passo: number, iFim: number): EtapaFolha {
  if (passo === 4 && iFim >= 0 && campo.startsWith(`ambiente.linhas.${iFim}.`)) return 'ambienteFim'
  return ETAPAS_DA_FOLHA.find((e) => e !== 'ambienteFim' && passoDaEtapa(e) === passo) ?? 'final'
}
const ehLeitura = (campo: string) =>
  /^(indicacao\.(pontos\.[^.]+\.(crescente|decrescente|cargaAplicada)|retornoZero|substituicao\.etapas\.\d+\.(padroes|substituicao))|repetibilidade\.[^.]+\.(leituras\.\d+|cargaAplicada)|excentricidade\.(posicoes\.\d+\.(leitura|zeroAntes)|cargaAplicada)|ambiente\.(linhas\.\d+\.(temperatura|umidade|pressao)|deltaT\.\d+\.valor|deltaT0\.(origem|sala)))$/.test(
    campo,
  )

export function TelaRevisao({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  const rev = useRevisao(f?.registro, f?.pacote)
  const [encerrando, setEncerrando] = useState(false)
  const [desfecho, setDesfecho] = useState<'INCOMPLETA' | 'NAO_CALIBRADA' | ''>('')
  const [motivo, setMotivo] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  if (!f?.registro || !rev) return null
  const r = f.registro
  const editavel = podeEditar(f)
  const iFim =
    r.passos.ambiente.linhas
      .map((l, i) => (l.momento === 'FIM' ? i : -1))
      .filter((i) => i >= 0)
      .at(-1) ?? -1
  const irPara = (campo: string, passo: number, etapa?: EtapaFolha) =>
    trocar({
      nome: 'passo',
      envioId,
      etapa: etapa ?? etapaDoCampo(campo, passo, iFim),
      ...(ehLeitura(campo) ? { foco: campo } : {}),
    })
  const conferir = (a: AvisoCampo, m = '') => {
    const agora = relogioDoAparelho.agora()
    void mudarFolha(envioId, (x) => editar(x, (y) => void y.avisosConferidos.push(conferirAviso(a, agora, m)), agora))
  }
  const pf = podeFinalizar(r, f.pacote)
  const finalizar = async () => {
    setFinalizando(true)
    const nova = await mudarFolha(envioId, (x) => iniciarAssinaturas(x, sha, relogioDoAparelho.agora()))
    setFinalizando(false)
    if (nova) ir({ nome: 'assinaturaTecnico', envioId })
  }

  return (
    <Tela
      rodape={
        editavel ? (
          <div className="flex flex-col gap-2">
            <Botao variante="principal" grande disabled={!pf.pode || finalizando} onClick={() => void finalizar()}>
              Finalizar e colher assinaturas
            </Botao>
            {!pf.pode && <p className="text-center text-[15px] text-ink-2">{pf.motivo}</p>}
            {r.desfecho === 'COMPLETA' && (
              <Botao variante="texto" onClick={() => setEncerrando(true)}>
                Encerrar sem completar…
              </Botao>
            )}
          </div>
        ) : undefined
      }
    >
      <Cabecalho titulo="Revisão" subtitulo={<span className="numero-fc">{f.numero}</span>} aoVoltar={voltar} salvo />
      {r.desfecho !== 'COMPLETA' && (
        <div className="mx-4 mt-3 rounded-2xl bg-warning-soft px-4 py-3">
          <p className="text-[16px] font-semibold text-warning-ink">Encerrada sem completar · {DESFECHO[r.desfecho]}</p>
          <p className="mt-1 text-[15px]">{r.motivoDesfecho}</p>
          {editavel && (
            <Botao
              className="mt-2"
              onClick={() => void mudarFolha(envioId, (x) => voltarACompletar(x, relogioDoAparelho.agora()))}
            >
              Voltar a completar
            </Botao>
          )}
        </div>
      )}
      {rev.falta.length > 0 && (
        <>
          <SecaoTitulo>Falta para assinar ({rev.falta.length})</SecaoTitulo>
          <div className="flex flex-col gap-2 px-4">
            {rev.falta.map((x, i) => (
              <Cartao key={`${x.codigo}-${i}`} onClick={() => irPara(x.campo, x.passo, x.etapa)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[16px]">
                    <span className="text-brand-ink">●</span> {TITULOS_ETAPAS[x.etapa]}: {x.texto}
                  </span>
                  <span className="shrink-0 text-[15px] font-semibold text-brand-ink">Ir ▸</span>
                </div>
              </Cartao>
            ))}
          </div>
        </>
      )}
      {rev.impede.length > 0 && (
        <>
          <SecaoTitulo>Isto impede o certificado ({rev.impede.length})</SecaoTitulo>
          <div className="flex flex-col gap-2 px-4">
            {rev.impede.map((a) => {
              const c = avisoConferido(a, r)
              return c ? (
                <div key={`${a.codigo}|${a.campo}|${a.texto}`} className="rounded-xl bg-surface-2 px-3 py-2 text-[15px]">
                  ▲ {a.texto}
                  <div className="text-ink-2">Motivo registrado: {c.motivo || '—'}</div>
                </div>
              ) : (
                <AvisoNaHora
                  key={`${a.codigo}|${a.campo}|${a.texto}`}
                  aviso={a}
                  aoCorrigir={() => irPara(a.campo, a.passo)}
                  aoMotivo={editavel ? (m) => conferir(a, m) : undefined}
                />
              )
            })}
          </div>
        </>
      )}
      {rev.digitacao.length > 0 && (
        <>
          <SecaoTitulo>Confira a digitação ({rev.digitacao.length})</SecaoTitulo>
          <div className="flex flex-col gap-2 px-4">
            {rev.digitacao.map((a) =>
              avisoConferido(a, r) ? (
                <div
                  key={`${a.codigo}|${a.campo}|${a.texto}`}
                  className="rounded-xl bg-surface-2 px-3 py-2 text-[15px] text-ink-2"
                >
                  ✓ Conferido: {a.texto}
                </div>
              ) : (
                <AvisoNaHora
                  key={`${a.codigo}|${a.campo}|${a.texto}`}
                  aviso={a}
                  aoConferir={editavel ? () => conferir(a) : undefined}
                  aoCorrigir={() => irPara(a.campo, a.passo)}
                />
              ),
            )}
          </div>
        </>
      )}
      {rev.tudoCerto.length > 0 && (
        <>
          <SecaoTitulo>Tudo certo</SecaoTitulo>
          <p className="px-4 text-[16px] text-brand-ink">✓ {rev.tudoCerto.map((e) => TITULOS_ETAPAS[e]).join(' · ')}</p>
        </>
      )}
      {r.anotacoes.length > 0 && (
        <>
          <SecaoTitulo>Anotações ({r.anotacoes.length})</SecaoTitulo>
          <div className="flex flex-col gap-2 px-4">
            {r.anotacoes.map((a) => (
              <div key={a.id} className="rounded-xl bg-surface px-3 py-2 text-[15px]">
                <span className="font-semibold">
                  Passo {a.passo} · {ROTULO_TIPO_ANOTACAO[a.tipo]}:
                </span>{' '}
                {a.texto}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="h-6" />
      {encerrando && (
        <Folha
          titulo="Encerrar sem completar"
          rodape={
            <>
              <Botao className="flex-1" onClick={() => setEncerrando(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="principal"
                className="flex-1"
                disabled={!desfecho || !motivo.trim()}
                onClick={() => {
                  setEncerrando(false)
                  if (desfecho)
                    void mudarFolha(envioId, (x) => encerrarSemCompletar(x, desfecho, motivo, relogioDoAparelho.agora()))
                }}
              >
                Encerrar
              </Botao>
            </>
          }
        >
          <p className="mb-3 text-[16px] text-ink-2">
            O que ficou em branco fica em branco, com o motivo. Ninguém precisa inventar um valor para assinar. Depois, você e o
            cliente assinam como sempre.
          </p>
          <div className="flex flex-col gap-3">
            <Escolha
              rotulo="Como a folha termina"
              opcoes={[
                { valor: 'INCOMPLETA', texto: 'Incompleta' },
                { valor: 'NAO_CALIBRADA', texto: 'Não calibrada' },
              ]}
              valor={desfecho}
              aoEscolher={setDesfecho}
            />
            <AreaTexto
              rotulo="Motivo (por exemplo, barômetro com defeito; cliente interrompeu; balança não pesa corretamente, POP 7.8)"
              valor={motivo}
              aoMudar={setMotivo}
              obrigatorio
            />
          </div>
        </Folha>
      )}
    </Tela>
  )
}
