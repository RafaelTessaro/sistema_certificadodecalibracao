// A moldura de todo passo: "◂ FC-… · Salvo ✓ · ⋯", "Passo n de 8 · título", a fileira de bolinhas tocável, o conteúdo e,
// embaixo, "✎ Anotação" e "Próximo passo ▸" (nos passos de leitura, o teclado do app ocupa o lugar enquanto há uma
// leitura em foco). Depois do passo 7, o app abre sozinho o ambiente do fim. Voltar nunca descarta nada.

import { useEffect, useState } from 'react'
import { faixaDosAvisos } from '../../../shared/campo/avisos.ts'
import { ETAPAS_DA_FOLHA, passoDaEtapa, TITULOS_ETAPAS } from '../../../shared/campo/progresso.ts'
import type { EtapaFolha } from '../../../shared/campo/progresso.ts'
import type { RegistroCampo, TipoAnotacao } from '../../../shared/campo/tipos.ts'
import { ir, irDaLista, mudarFolha, trocar, voltar } from '../app/acoes.ts'
import { useAnalise } from '../app/analise.ts'
import type { AnaliseFolha } from '../app/analise.ts'
import { useFolha } from '../app/loja.ts'
import { Nota } from '../componentes/Avisos.tsx'
import { AreaTexto, Botao, Cabecalho, Folha, Tela } from '../componentes/base.tsx'
import { useGravar } from '../componentes/CamposDaFolha.tsx'
import { Bolinhas, FolhaAnotacao } from '../componentes/Folhas.tsx'
import { IconeLapis } from '../componentes/Icones.tsx'
import { definirEtapaAtual, emAssinatura, podeEditar, recomecarEnsaios } from '../nucleo/folha.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'
import { TelaComprovante } from './Comprovante.tsx'
import { PassoAmbiente } from './passos/PassoAmbiente.tsx'
import { PassoBalanca } from './passos/PassoBalanca.tsx'
import { PassoChegada } from './passos/PassoChegada.tsx'
import { PassoExcentricidade } from './passos/PassoExcentricidade.tsx'
import { PassoFinal } from './passos/PassoFinal.tsx'
import { PassoIndicacao } from './passos/PassoIndicacao.tsx'
import { PassoPadroes } from './passos/PassoPadroes.tsx'
import { PassoRepetibilidade } from './passos/PassoRepetibilidade.tsx'

export type FolhaComRegistro = FolhaLocal & { registro: RegistroCampo }

export interface PropsPasso {
  f: FolhaComRegistro
  analise: AnaliseFolha | null
  foco: string | null
  aoFocar: (campo: string | null) => void
  irProximo: () => void
  irPara: (etapa: EtapaFolha, foco?: string) => void
  anotar: (campo?: string, tipo?: TipoAnotacao) => void
}

const DE_LEITURA: readonly EtapaFolha[] = ['ambiente', 'ambienteFim', 'indicacao', 'repetibilidade', 'excentricidade']

export function TelaPasso({ envioId, etapa, foco: focoInicial }: { envioId: string; etapa: EtapaFolha; foco?: string }) {
  const f = useFolha(envioId)
  const analise = useAnalise(f?.registro, f?.pacote)
  const [foco, setFoco] = useState<string | null>(focoInicial ?? null)
  const [anotacao, setAnotacao] = useState<{ campo: string; tipo: TipoAnotacao } | null>(null)
  const [menu, setMenu] = useState(false)
  const [recomecar, setRecomecar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const gravar = useGravar(envioId)

  useEffect(() => {
    setFoco(focoInicial ?? null)
  }, [etapa, focoInicial])
  useEffect(() => {
    if (f && podeEditar(f) && f.etapaAtual !== etapa) void mudarFolha(envioId, (x) => definirEtapaAtual(x, etapa))
  }, [etapa]) // oxlint-disable-line react-hooks/exhaustive-deps

  // Entregue enquanto a tela estava aberta (a sincronia apaga as leituras): o resumo da entrega, não a tela em branco
  if (f && !f.registro) return <TelaComprovante envioId={envioId} />
  if (!f?.registro) return null
  if (!podeEditar(f)) {
    return (
      <Tela>
        <Cabecalho titulo={<span className="numero-fc">{f.numero}</span>} aoVoltar={voltar} />
        <div className="flex flex-col gap-3 p-5">
          <p className="text-[17px]">
            {f.estado === 'FINALIZADA'
              ? 'A folha está trancada (finalizada). Para mudar algo, use "Corrigir…" ou "Reabrir…" no comprovante.'
              : emAssinatura(f)
                ? 'A folha está sendo assinada. Volte para a assinatura para continuar.'
                : 'Esta folha não pode ser mudada.'}
          </p>
          {f.estado === 'FINALIZADA' && <Botao onClick={() => trocar({ nome: 'comprovante', envioId })}>Ver o comprovante</Botao>}
          {emAssinatura(f) && (
            <Botao
              variante="principal"
              onClick={() =>
                trocar(
                  f.registro!.assinaturas.tecnico ? { nome: 'clientePendente', envioId } : { nome: 'assinaturaTecnico', envioId },
                )
              }
            >
              Voltar à assinatura
            </Botao>
          )}
        </div>
      </Tela>
    )
  }

  const fr = f as FolhaComRegistro
  const i = ETAPAS_DA_FOLHA.indexOf(etapa)
  const irPara = (e: EtapaFolha, campo?: string) =>
    trocar({ nome: 'passo', envioId, etapa: e, ...(campo ? { foco: campo } : {}) })
  const irProximo = () => {
    const proxima = ETAPAS_DA_FOLHA[i + 1]
    if (proxima) irPara(proxima)
    else ir({ nome: 'revisao', envioId })
  }
  const props: PropsPasso = {
    f: fr,
    analise,
    foco,
    aoFocar: setFoco,
    irProximo,
    irPara,
    anotar: (campo = '', tipo = 'OBSERVACAO') => setAnotacao({ campo, tipo }),
  }
  const deLeitura = DE_LEITURA.includes(etapa)
  const faixa = deLeitura ? faixaDosAvisos(fr.registro, fr.pacote) : []
  const rodape = (
    <div className="flex gap-3">
      <Botao onClick={() => props.anotar()} aria-label="Anotação">
        <IconeLapis /> Anotação
      </Botao>
      <Botao variante="principal" className="flex-1" onClick={irProximo}>
        {etapa === 'final' ? 'Revisão e assinaturas ▸' : 'Próximo passo ▸'}
      </Botao>
    </div>
  )

  const conteudo = (() => {
    switch (etapa) {
      case 'padroes':
        return <PassoPadroes {...props} />
      case 'chegada':
        return <PassoChegada {...props} />
      case 'balanca':
        return <PassoBalanca {...props} />
      case 'ambiente':
        return <PassoAmbiente {...props} momento="INICIO" />
      case 'ambienteFim':
        return <PassoAmbiente {...props} momento="FIM" />
      case 'indicacao':
        return <PassoIndicacao {...props} />
      case 'repetibilidade':
        return <PassoRepetibilidade {...props} />
      case 'excentricidade':
        return <PassoExcentricidade {...props} />
      case 'final':
        return <PassoFinal {...props} />
    }
  })()

  const cabecalho = (
    <>
      <Cabecalho
        titulo={<span className="numero-fc">{f.numero}</span>}
        subtitulo={`Passo ${passoDaEtapa(etapa)} de 8 · ${TITULOS_ETAPAS[etapa]}`}
        aoVoltar={voltar}
        salvo
        direita={
          <button
            type="button"
            aria-label="Mais opções"
            onClick={() => setMenu(true)}
            className="grid size-12 place-items-center rounded-xl text-[22px] active:bg-surface-2"
          >
            ⋯
          </button>
        }
      />
      {analise && <Bolinhas etapas={analise.etapas} atual={etapa} aoIr={(e) => irPara(e)} />}
      {faixa.map((t) => (
        <div key={t} className="px-4 pb-2">
          <Nota>{t}</Nota>
        </div>
      ))}
    </>
  )

  return (
    <>
      {deLeitura ? (
        <div className="fundo-app flex h-full flex-col bg-bg" style={{ paddingTop: 'var(--topo)' }}>
          {cabecalho}
          {conteudo}
          {foco === null && (
            <div className="border-t border-line bg-surface px-4 pt-3" style={{ paddingBottom: 'calc(12px + var(--base))' }}>
              {rodape}
            </div>
          )}
        </div>
      ) : (
        <Tela rodape={rodape}>
          {cabecalho}
          {conteudo}
        </Tela>
      )}
      {anotacao && (
        <FolhaAnotacao
          passo={passoDaEtapa(etapa)}
          campo={anotacao.campo}
          tipoInicial={anotacao.tipo}
          tecnico={fr.registro.tecnico.nome}
          agora={() => relogioDoAparelho.agora()}
          aoCancelar={() => setAnotacao(null)}
          aoSalvar={(a) => {
            setAnotacao(null)
            void gravar((r) => void r.anotacoes.push(a))
          }}
        />
      )}
      {menu && (
        <Folha
          titulo="Opções"
          aoFechar={() => setMenu(false)}
          rodape={
            <Botao className="flex-1" onClick={() => setMenu(false)}>
              Fechar
            </Botao>
          }
        >
          <div className="flex flex-col gap-2">
            <Botao onClick={() => (setMenu(false), ir({ nome: 'revisao', envioId }))}>Revisão e assinaturas</Botao>
            <Botao onClick={() => (setMenu(false), ir({ nome: 'verFolha', envioId }))}>Ver a folha</Botao>
            <Botao onClick={() => (setMenu(false), props.anotar())}>✎ Anotação</Botao>
            {['ambiente', 'indicacao', 'repetibilidade', 'excentricidade', 'ambienteFim'].includes(etapa) && (
              <Botao variante="perigo" onClick={() => (setMenu(false), setRecomecar(true))}>
                A balança precisou de manutenção: recomeçar os ensaios
              </Botao>
            )}
            <Botao variante="texto" onClick={() => irDaLista()}>
              Voltar para Minhas folhas
            </Botao>
          </div>
        </Folha>
      )}
      {recomecar && (
        <Folha
          titulo="Recomeçar os ensaios"
          aoFechar={() => setRecomecar(false)}
          rodape={
            <>
              <Botao className="flex-1" onClick={() => setRecomecar(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="perigo"
                className="flex-1"
                disabled={!motivo.trim()}
                onClick={() => {
                  setRecomecar(false)
                  void mudarFolha(envioId, (x) => recomecarEnsaios(x, motivo, relogioDoAparelho.agora())).then(
                    (nova) => nova && irPara('ambiente'),
                  )
                }}
              >
                Recomeçar
              </Botao>
            </>
          }
        >
          <p className="mb-3 text-[16px] text-ink-2">
            O ambiente do início e os passos 5, 6 e 7 recomeçam vazios. As leituras de agora ficam guardadas na folha só para
            consulta (não vão para a calibração). Se a manutenção não for hoje, use "Encerrar sem completar" na Revisão.
          </p>
          <AreaTexto
            rotulo="Motivo (por exemplo, troca da célula de carga)"
            valor={motivo}
            aoMudar={setMotivo}
            obrigatorio
            autoFoco
          />
        </Folha>
      )}
    </>
  )
}
