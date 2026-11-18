// As assinaturas: a do técnico (PIN "Assinar como <nome>" e o desenho, deitado), o modo entrega ("Entregue o celular a
// quem acompanhou": o resumo das condições, nome, função, a frase e a nota de LGPD; a assinatura deitada; "Pronto.
// Devolva o celular ao técnico."), a folha esperando o cliente (depois de "Devolver ao técnico") e as saídas com o PIN
// do técnico: "Cliente não assinou" e, no piloto, "O cliente assinou só o papel". No laboratório não há cliente.

import { useEffect, useState } from 'react'
import { textoDoPeriodo } from '../../../shared/campo/registro.ts'
import { FRASE_ASSINATURA_CLIENTE, resumoDoCliente } from '../../../shared/campo/resumoCliente.ts'
import { irDaLista, mudarFolha, sha, sincronizar, trocar, voltar } from '../app/acoes.ts'
import { useFolha } from '../app/loja.ts'
import { AreaAssinatura } from '../componentes/AreaAssinatura.tsx'
import { AreaTexto, Botao, Cabecalho, CampoTexto, Folha, Tela } from '../componentes/base.tsx'
import { ResumoCliente } from '../componentes/Folhas.tsx'
import { FolhaDePin, PedidoDePin } from '../componentes/PedidoDePin.tsx'
import {
  assinarCliente,
  assinarTecnico,
  atualizarModoEntrega,
  cancelarAssinaturas,
  clienteAssinouSoOPapel,
  clienteNaoAssinou,
  desfazerAssinaturaTecnico,
  entregarAoCliente,
  faltaOCliente,
  sairDoModoEntrega,
} from '../nucleo/folha.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'
import { TelaComprovante } from './Comprovante.tsx'

const agora = () => relogioDoAparelho.agora()

/** "Executei as medições desta folha em 18/11/2026, das 08:42 às 15:58." (ou "de … a …", em dois dias). */
export function fraseDoTecnico(f: FolhaLocal): string {
  const r = f.registro!
  const inicio = r.passos.chegada.inicio || r.relogio.iniciadoEm
  const fim = r.passos.final.termino || r.relogio.finalizadoEm
  const periodo = textoDoPeriodo(inicio, fim)
  if (!periodo) return 'Executei as medições desta folha.'
  return periodo.includes(', das ')
    ? `Executei as medições desta folha em ${periodo}.`
    : `Executei as medições desta folha de ${periodo}.`
}

export function TelaAssinaturaTecnico({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  const [pinOk, setPinOk] = useState(false)
  // Entregue enquanto a tela estava aberta (a sincronia apaga as leituras): o resumo da entrega, não a tela em branco
  if (f && !f.registro) return <TelaComprovante envioId={envioId} />
  if (!f?.registro) return null
  const nome = f.registro.tecnico.nome
  const laboratorio = f.registro.passos.chegada.local === 'LABORATORIO'
  const desistir = () => {
    void mudarFolha(envioId, (x) => cancelarAssinaturas(x, agora()))
    voltar()
  }
  if (!pinOk)
    return (
      <Tela>
        <Cabecalho titulo="Assinatura do técnico" subtitulo={<span className="numero-fc">{f.numero}</span>} aoVoltar={desistir} />
        <div className="px-5 py-6">
          <PedidoDePin
            titulo={`Assinar como ${nome}`}
            explicacao="Digite o seu PIN. Depois, assine com o dedo."
            aoConfirmar={() => setPinOk(true)}
            aoCancelar={desistir}
            rotuloCancelar="Não sou eu / voltar"
          />
          <p className="mt-4 text-center text-[14px] text-ink-2">
            Este celular e o PIN são pessoais. Se você não é {nome}, use o papel ou o seu celular.
          </p>
        </div>
      </Tela>
    )
  return (
    <AreaAssinatura
      titulo={`Assinatura do técnico · ${f.numero}`}
      passo={laboratorio ? undefined : '1 de 2'}
      legenda={`${nome} · técnico que executou`}
      frase={fraseDoTecnico(f)}
      aoVoltar={() => setPinOk(false)}
      aoConfirmar={(png) =>
        void mudarFolha(envioId, (x) => assinarTecnico(x, png, sha, agora())).then((nova) => {
          if (!nova) return
          if (nova.estado === 'FINALIZADA') {
            trocar({ nome: 'comprovante', envioId })
            void sincronizar()
          } else trocar({ nome: 'entregaCliente', envioId })
        })
      }
    />
  )
}

type SaidaComPin = 'DEVOLVER' | 'NAO_ASSINOU' | 'SO_PAPEL' | 'CONTINUAR' | null

/** O modo entrega: o celular com quem acompanhou. Sem lista, sem voltar; toda saída pede o PIN do técnico. */
export function TelaEntregaCliente({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  const [nome, setNome] = useState(f?.modoEntrega?.nome ?? '')
  const [funcao, setFuncao] = useState(f?.modoEntrega?.funcao ?? '')
  const [saida, setSaida] = useState<SaidaComPin>(null)
  const [motivo, setMotivo] = useState('')
  const [pedindoMotivo, setPedindoMotivo] = useState(false)
  const [lgpd, setLgpd] = useState(false)
  const m = f?.modoEntrega

  useEffect(() => {
    // Folha sem modo entrega (já saiu, ou foi entregue com o "Pronto" na tela): volta para o que couber
    if (f && !f.modoEntrega)
      trocar(
        f.estado === 'FINALIZADA' || f.estado === 'ENTREGUE'
          ? { nome: 'comprovante', envioId }
          : { nome: 'clientePendente', envioId },
      )
  }, [f, envioId])
  if (f && !f.registro) return <TelaComprovante envioId={envioId} />
  if (!f?.registro || !m) return null

  const gravarDados = () =>
    void mudarFolha(envioId, (x) => (x.modoEntrega ? atualizarModoEntrega(x, { nome, funcao }, agora()) : x))
  const depoisDoPin = () => {
    const s = saida
    setSaida(null)
    if (s === 'DEVOLVER')
      void mudarFolha(envioId, (x) => sairDoModoEntrega(x, agora())).then(
        (n) => n && trocar({ nome: 'clientePendente', envioId }),
      )
    if (s === 'CONTINUAR')
      void mudarFolha(envioId, (x) => sairDoModoEntrega(x, agora())).then(
        (n) => n && (trocar({ nome: 'comprovante', envioId }), void sincronizar()),
      )
    if (s === 'SO_PAPEL')
      void mudarFolha(envioId, (x) => clienteAssinouSoOPapel(x, agora())).then(
        (n) => n && (trocar({ nome: 'comprovante', envioId }), void sincronizar()),
      )
    if (s === 'NAO_ASSINOU') setPedindoMotivo(true)
  }

  if (m.tela === 'ASSINATURA')
    return (
      <AreaAssinatura
        titulo="Assinatura de quem acompanhou"
        passo="2 de 2"
        legenda={`${m.nome} · ${m.funcao}`}
        frase={FRASE_ASSINATURA_CLIENTE}
        aoVoltar={() => void mudarFolha(envioId, (x) => atualizarModoEntrega(x, { tela: 'DADOS' }, agora()))}
        aoConfirmar={(png) =>
          void mudarFolha(envioId, (x) => assinarCliente(x, { nome: m.nome, funcao: m.funcao, png }, agora()))
        }
      />
    )

  if (m.tela === 'PRONTO')
    return (
      <Tela>
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="grid size-20 place-items-center rounded-full bg-brand-soft text-[40px] text-brand-ink">✓</div>
          <h1 className="text-[24px] font-semibold">Pronto. Devolva o celular ao técnico.</h1>
          <p className="text-[16px] text-ink-2">Obrigado, {m.nome}.</p>
          <Botao variante="principal" grande className="w-full" onClick={() => setSaida('CONTINUAR')}>
            Sou o técnico, continuar
          </Botao>
        </div>
        {saida && <FolhaDePin titulo="PIN do técnico" aoConfirmar={depoisDoPin} aoCancelar={() => setSaida(null)} />}
      </Tela>
    )

  const resumo = resumoDoCliente(f.registro)
  return (
    <Tela
      rodape={
        <Botao
          variante="principal"
          grande
          className="w-full"
          disabled={!nome.trim() || !funcao.trim()}
          onClick={() =>
            void mudarFolha(envioId, (x) =>
              atualizarModoEntrega(x, { nome: nome.trim(), funcao: funcao.trim(), tela: 'ASSINATURA' }, agora()),
            )
          }
        >
          Assinar ▸
        </Botao>
      }
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <h1 className="text-[22px] font-semibold leading-tight">Entregue o celular a quem acompanhou o serviço.</h1>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <ResumoCliente resumo={resumo} numero={f.numero} />
        <div onBlur={gravarDados} className="flex flex-col gap-3">
          <CampoTexto rotulo="Seu nome" obrigatorio valor={nome} aoMudar={setNome} maiusculas="words" maximo={120} />
          <CampoTexto
            rotulo="Sua função"
            obrigatorio
            valor={funcao}
            aoMudar={setFuncao}
            dica="Por exemplo, encarregado da balança."
            maximo={120}
          />
        </div>
        <p className="text-[16px] leading-relaxed">
          Ao assinar, você declara que acompanhou o serviço e está ciente das condições, não dos resultados. O certificado será
          emitido pela Balanças.com depois da conferência.
        </p>
        <p className="text-[14px] text-ink-2">
          Seu nome e sua assinatura ficam só nesta folha de campo (registro interno da Balanças.com).{' '}
          <button type="button" className="font-semibold text-brand-ink underline" onClick={() => setLgpd(true)}>
            Saiba +
          </button>
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-x-4 gap-y-1">
          <Botao variante="texto" onClick={() => setSaida('DEVOLVER')}>
            Devolver ao técnico
          </Botao>
          <Botao variante="texto" onClick={() => setSaida('NAO_ASSINOU')}>
            Cliente não assinou
          </Botao>
          {f.registro.piloto && (
            <Botao variante="texto" onClick={() => setSaida('SO_PAPEL')}>
              O cliente assinou só o papel
            </Botao>
          )}
        </div>
      </div>
      {saida && (
        <FolhaDePin
          titulo="PIN do técnico"
          explicacao="Só o técnico sai desta tela."
          aoConfirmar={depoisDoPin}
          aoCancelar={() => setSaida(null)}
        />
      )}
      {pedindoMotivo && (
        <Folha
          titulo="Cliente não assinou"
          aoFechar={() => setPedindoMotivo(false)}
          rodape={
            <>
              <Botao className="flex-1" onClick={() => setPedindoMotivo(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="principal"
                className="flex-1"
                disabled={!motivo.trim()}
                onClick={() => {
                  setPedindoMotivo(false)
                  void mudarFolha(envioId, (x) => clienteNaoAssinou(x, motivo, agora())).then(
                    (n) => n && (trocar({ nome: 'comprovante', envioId }), void sincronizar()),
                  )
                }}
              >
                Registrar
              </Botao>
            </>
          }
        >
          <AreaTexto
            rotulo="Por quê? (ninguém acompanhou, a pessoa recusou…)"
            valor={motivo}
            aoMudar={setMotivo}
            obrigatorio
            autoFoco
          />
        </Folha>
      )}
      {lgpd && (
        <Folha
          titulo="Seus dados nesta folha"
          aoFechar={() => setLgpd(false)}
          rodape={
            <Botao className="flex-1" onClick={() => setLgpd(false)}>
              Fechar
            </Botao>
          }
        >
          <div className="flex flex-col gap-2 text-[16px] leading-relaxed">
            <p>
              A Balanças.com guarda o seu nome, a sua função e a imagem da sua assinatura nesta folha de campo, junto com a data e
              a hora, como registro interno de que você acompanhou o serviço.
            </p>
            <p>Guardamos só a imagem da assinatura. Velocidade, pressão e tempo do traço não são guardados.</p>
            <p>
              Esses dados não vão para o certificado e não são usados para outra finalidade. Dúvidas: fale com a Balanças.com.
            </p>
          </div>
        </Folha>
      )}
    </Tela>
  )
}

/** A folha esperando a assinatura do cliente (depois de "Devolver ao técnico"). */
export function TelaClientePendente({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  const [saida, setSaida] = useState<'NAO_ASSINOU' | 'SO_PAPEL' | null>(null)
  const [pedindoMotivo, setPedindoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  // Entregue enquanto a tela estava aberta (a sincronia apaga as leituras): o resumo da entrega, não a tela em branco
  if (f && !f.registro) return <TelaComprovante envioId={envioId} />
  if (!f?.registro) return null
  if (!faltaOCliente(f))
    return (
      <Tela>
        <Cabecalho titulo={<span className="numero-fc">{f.numero}</span>} aoVoltar={voltar} />
        <p className="p-5 text-[16px]">Esta folha não está esperando a assinatura do cliente.</p>
      </Tela>
    )
  return (
    <Tela>
      <Cabecalho
        titulo="Assinatura do cliente"
        subtitulo={<span className="numero-fc">{f.numero}</span>}
        aoVoltar={() => irDaLista()}
      />
      <div className="flex flex-col gap-3 p-5">
        <p className="text-[17px]">Você já assinou. Falta a assinatura de quem acompanhou o serviço.</p>
        <Botao
          variante="principal"
          grande
          onClick={() =>
            void mudarFolha(envioId, (x) => entregarAoCliente(x, agora())).then(
              (n) => n && trocar({ nome: 'entregaCliente', envioId }),
            )
          }
        >
          Entregar o celular a quem acompanhou
        </Botao>
        <Botao onClick={() => setSaida('NAO_ASSINOU')}>Cliente não assinou…</Botao>
        {f.registro.piloto && <Botao onClick={() => setSaida('SO_PAPEL')}>O cliente assinou só o papel</Botao>}
        <Botao
          variante="texto"
          onClick={() =>
            void mudarFolha(envioId, (x) => desfazerAssinaturaTecnico(x, agora())).then(
              (n) => n && trocar({ nome: 'revisao', envioId }),
            )
          }
        >
          Desfazer a minha assinatura e voltar à folha
        </Botao>
      </div>
      {saida && (
        <FolhaDePin
          titulo="PIN do técnico"
          aoCancelar={() => setSaida(null)}
          aoConfirmar={() => {
            const s = saida
            setSaida(null)
            if (s === 'NAO_ASSINOU') setPedindoMotivo(true)
            else
              void mudarFolha(envioId, (x) => clienteAssinouSoOPapel(x, agora())).then(
                (n) => n && (trocar({ nome: 'comprovante', envioId }), void sincronizar()),
              )
          }}
        />
      )}
      {pedindoMotivo && (
        <Folha
          titulo="Cliente não assinou"
          aoFechar={() => setPedindoMotivo(false)}
          rodape={
            <>
              <Botao className="flex-1" onClick={() => setPedindoMotivo(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="principal"
                className="flex-1"
                disabled={!motivo.trim()}
                onClick={() => {
                  setPedindoMotivo(false)
                  void mudarFolha(envioId, (x) => clienteNaoAssinou(x, motivo, agora())).then(
                    (n) => n && (trocar({ nome: 'comprovante', envioId }), void sincronizar()),
                  )
                }}
              >
                Registrar
              </Botao>
            </>
          }
        >
          <AreaTexto
            rotulo="Por quê? (ninguém acompanhou, a pessoa recusou…)"
            valor={motivo}
            aoMudar={setMotivo}
            obrigatorio
            autoFoco
          />
        </Folha>
      )}
    </Tela>
  )
}
