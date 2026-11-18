// Menu do técnico: tema (Sistema, Claro, Escuro), hora do lembrete do fim do expediente, endereço do servidor (ou ler o
// QR de novo), Sobre (versão, servidor, aparelho, "O que o app registra sobre você"), "Esqueci o PIN" e Descadastrar
// (bloqueado com folha começada e não entregue).

import { useState } from 'react'
import { formatarInstante } from '../../../shared/campo/registro.ts'
import { descadastrar, ir, mudarEndereco, mudarHoraLembrete, mudarTema, voltar } from '../app/acoes.ts'
import { useApp } from '../app/loja.ts'
import type { Tema } from '../app/loja.ts'
import { Botao, Cabecalho, Cartao, CampoTexto, Escolha, Folha, Linha, SecaoTitulo, Tela } from '../componentes/base.tsx'
import { horaValida } from '../nucleo/datas.ts'
import { folhas as nFolhas, naoEntregues } from '../nucleo/lista.ts'

export function TelaMenu() {
  const e = useApp((s) => s)
  const [endereco, setEndereco] = useState(e.pareamento?.endereco.replace(/^http:\/\//, '') ?? '')
  const [msgEndereco, setMsgEndereco] = useState<{ texto: string; ok: boolean } | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [registra, setRegistra] = useState(false)
  const [descadastrando, setDescadastrando] = useState(false)
  const [msgDescadastro, setMsgDescadastro] = useState('')
  const pendentes = naoEntregues(e.folhas).length

  return (
    <Tela>
      <Cabecalho titulo="Menu" aoVoltar={voltar} />
      <SecaoTitulo>Aparência</SecaoTitulo>
      <div className="px-4">
        <Escolha<Tema>
          opcoes={[
            { valor: 'SISTEMA', texto: 'Sistema' },
            { valor: 'CLARO', texto: 'Claro' },
            { valor: 'ESCURO', texto: 'Escuro' },
          ]}
          valor={e.tema}
          aoEscolher={(t) => void mudarTema(t)}
        />
      </div>
      <SecaoTitulo>Lembrete do fim do expediente</SecaoTitulo>
      <div className="px-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[16px]">Avisar das folhas para entregar às</span>
          <input
            type="time"
            value={e.horaLembrete}
            onChange={(x) => horaValida(x.target.value) && void mudarHoraLembrete(x.target.value)}
            className="min-h-[52px] rounded-xl border-2 border-campo bg-surface px-3 text-[17px]"
          />
        </label>
      </div>
      <SecaoTitulo>Endereço do servidor</SecaoTitulo>
      <div className="flex flex-col gap-2 px-4">
        <CampoTexto
          rotulo="IP do servidor da empresa"
          valor={endereco}
          aoMudar={setEndereco}
          maiusculas="none"
          modoTeclado="url"
          dica="Por exemplo, 192.168.0.10 (a porta 4850 é a de sempre)."
        />
        <div className="flex gap-2">
          <Botao
            className="flex-1"
            disabled={conferindo || !endereco.trim()}
            onClick={() => {
              setConferindo(true)
              setMsgEndereco(null)
              void mudarEndereco(endereco).then((problema) => {
                setConferindo(false)
                setMsgEndereco(problema ? { texto: problema, ok: false } : { texto: 'Endereço conferido e gravado.', ok: true })
              })
            }}
          >
            {conferindo ? 'Conferindo…' : 'Conferir e gravar'}
          </Botao>
          <Botao className="flex-1" onClick={() => ir({ nome: 'pareamento', motivo: 'DE_NOVO' })}>
            Ler o QR de novo
          </Botao>
        </div>
        {msgEndereco && <p className={`text-[15px] ${msgEndereco.ok ? 'text-brand-ink' : 'text-danger'}`}>{msgEndereco.texto}</p>}
      </div>
      <SecaoTitulo>Sobre</SecaoTitulo>
      <div className="px-4">
        <Cartao>
          <Linha rotulo="App">BC Calibração (celular) {e.versaoApp}</Linha>
          <Linha rotulo="Técnico">{e.pareamento?.tecnico.nome ?? '—'}</Linha>
          <Linha rotulo="Servidor">
            {e.pareamento ? `${e.pareamento.servidor.nome} · ${e.pareamento.endereco.replace(/^http:\/\//, '')}` : '—'}
          </Linha>
          <Linha rotulo="Cadastrado em">{formatarInstante(e.pareamento?.pareadoEm) || '—'}</Linha>
          <Linha rotulo="Aparelho">{e.modeloAparelho || '—'}</Linha>
          <Linha rotulo="Id do aparelho">
            <span className="font-mono text-[13px]">{e.pareamento?.aparelhoId.slice(0, 8) ?? '—'}</span>
          </Linha>
        </Cartao>
        <Botao variante="texto" className="mt-2" onClick={() => setRegistra(true)}>
          O que o app registra sobre você
        </Botao>
      </div>
      <SecaoTitulo>PIN e cadastro</SecaoTitulo>
      <div className="flex flex-col gap-2 px-4 pb-8">
        <Botao onClick={() => ir({ nome: 'pareamento', motivo: 'ESQUECI_PIN' })}>Esqueci o PIN</Botao>
        <Botao variante="perigo" onClick={() => setDescadastrando(true)}>
          Descadastrar este celular
        </Botao>
      </div>
      {registra && (
        <Folha
          titulo="O que o app registra sobre você"
          rodape={
            <Botao className="flex-1" onClick={() => setRegistra(false)}>
              Fechar
            </Botao>
          }
        >
          <div className="flex flex-col gap-2 text-[16px] leading-relaxed">
            <p>
              O app guarda no celular as folhas que você preenche: cada leitura com a data e a hora do celular, as anotações, as
              correções e a sua assinatura (só a imagem). Junto vão o seu nome, o modelo e a identificação do celular.
            </p>
            <p>
              Na entrega, isso vai para o servidor da empresa. O servidor também anota quando o celular conversou com ele, o
              endereço do celular na rede e o estado de cada folha (para o escritório saber se a folha chegou).
            </p>
            <p>
              O app não usa GPS, não grava áudio, não tira fotos e não lê outros dados do celular. A câmera só é usada para ler o
              QR do computador.
            </p>
          </div>
        </Folha>
      )}
      {descadastrando && (
        <Folha
          titulo="Descadastrar este celular"
          rodape={
            <>
              <Botao className="flex-1" onClick={() => (setDescadastrando(false), setMsgDescadastro(''))}>
                Cancelar
              </Botao>
              <Botao
                variante="perigo"
                className="flex-1"
                disabled={pendentes > 0}
                onClick={() => void descadastrar().then((p) => (p ? setMsgDescadastro(p) : setDescadastrando(false)))}
              >
                Descadastrar
              </Botao>
            </>
          }
        >
          <p className="text-[16px]">
            {pendentes
              ? `Há ${nFolhas(pendentes)} começada${pendentes > 1 ? 's' : ''} e não entregue${pendentes > 1 ? 's' : ''}. Entregue antes de descadastrar.`
              : 'O celular esquece o cadastro, o PIN e as folhas não começadas. Para usar de novo, o escritório cadastra o celular outra vez.'}
          </p>
          {msgDescadastro && <p className="mt-2 text-[15px] text-danger">{msgDescadastro}</p>}
        </Folha>
      )}
    </Tela>
  )
}
