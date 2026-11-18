// Boas-vindas e pareamento: o app sem cadastro só mostra "Ler o QR do computador" (e, se a câmera falhar, o endereço e o
// código digitados). Também serve para "Ler o QR de novo" (endereço novo ou parear de novo) e para "Esqueci o PIN"
// (pareamento novo pelo escritório, com um PIN novo; as folhas ficam no celular).

import { useState } from 'react'
import { lerQrDoComputador, mudarEndereco, parear, voltar } from '../app/acoes.ts'
import { useApp } from '../app/loja.ts'
import { Botao, Cabecalho, CampoTexto, Tela } from '../componentes/base.tsx'
import { IconeQr } from '../componentes/Icones.tsx'
import { Logo } from '../componentes/Logo.tsx'
import { ErroQr } from '../plataforma/qr.ts'

export function TelaPareamento({ motivo }: { motivo: 'PRIMEIRA' | 'DE_NOVO' | 'ESQUECI_PIN' }) {
  const pareado = useApp((e) => !!e.pareamento)
  const [digitar, setDigitar] = useState(false)
  const [endereco, setEndereco] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cadastrar = async (dados: { endereco: string; codigo: string }) => {
    setOcupado(true)
    setErro('')
    try {
      if (!dados.codigo) {
        // QR só com o endereço: o servidor mudou de IP (o celular já está cadastrado)
        if (!pareado) {
          setErro('Este QR só tem o endereço do servidor. Leia o QR da tela "Cadastrar celular" do computador.')
          return
        }
        const problema = await mudarEndereco(dados.endereco)
        if (problema) setErro(problema)
        else voltar()
        return
      }
      const problema = await parear({ ...dados, novoPin: motivo === 'ESQUECI_PIN' })
      if (problema) setErro(problema)
    } finally {
      setOcupado(false)
    }
  }

  const lerQr = async () => {
    // Ocupado da câmera até o fim do cadastro: um segundo toque não começa outro pareamento ao mesmo tempo
    setOcupado(true)
    setErro('')
    try {
      const qr = await lerQrDoComputador()
      if (qr) await cadastrar({ endereco: qr.servidor, codigo: qr.codigo })
    } catch (e) {
      setErro(e instanceof ErroQr ? e.message : 'Não consegui ler o QR. Digite o endereço e o código.')
      setDigitar(true)
    } finally {
      setOcupado(false)
    }
  }

  const titulo = motivo === 'ESQUECI_PIN' ? 'Esqueci o PIN' : motivo === 'DE_NOVO' ? 'Ler o QR de novo' : 'Cadastrar este celular'
  return (
    <Tela>
      {motivo !== 'PRIMEIRA' && <Cabecalho titulo={titulo} aoVoltar={voltar} />}
      <div className="flex flex-col gap-5 px-5 py-6">
        {motivo === 'PRIMEIRA' && (
          <div className="flex flex-col items-center gap-3 pt-6 text-center">
            <Logo tamanho={72} />
            <h1 className="text-[26px] font-semibold">BC Calibração</h1>
            <p className="text-[17px] text-ink-2">A folha de campo no celular do técnico.</p>
          </div>
        )}
        <div className="rounded-2xl border border-line-strong bg-surface p-4 text-[16px] leading-relaxed">
          {motivo === 'ESQUECI_PIN' ? (
            <p>
              Peça ao escritório para cadastrar este celular de novo: <b>Usuários → Celulares dos técnicos → Parear de novo</b>.
              Depois, leia o QR e crie um PIN novo. As folhas continuam no celular.
            </p>
          ) : (
            <p>
              No computador do escritório: <b>Usuários → Celulares dos técnicos → Cadastrar celular</b>. Aparece um QR com o
              endereço do servidor e um código de 6 dígitos.
            </p>
          )}
        </div>
        <Botao variante="principal" grande onClick={() => void lerQr()} disabled={ocupado}>
          <IconeQr /> Ler o QR do computador
        </Botao>
        {!digitar ? (
          <Botao variante="texto" onClick={() => setDigitar(true)}>
            A câmera não funcionou? Digite o endereço e o código
          </Botao>
        ) : (
          <div className="flex flex-col gap-3">
            <CampoTexto
              rotulo="Endereço do servidor"
              valor={endereco}
              aoMudar={setEndereco}
              dica="Por exemplo, 192.168.0.10 (a porta 4850 é a de sempre)."
              maiusculas="none"
              modoTeclado="url"
            />
            <CampoTexto rotulo="Código (6 dígitos)" valor={codigo} aoMudar={setCodigo} modoTeclado="numeric" maximo={7} />
            <Botao
              variante="principal"
              onClick={() => void cadastrar({ endereco, codigo })}
              disabled={ocupado || !endereco || !codigo}
            >
              {ocupado ? 'Cadastrando…' : 'Cadastrar'}
            </Botao>
          </div>
        )}
        {erro && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[16px] text-danger">
            {erro}
          </p>
        )}
        <p className="text-center text-[14px] text-ink-2">
          O celular precisa estar no Wi-Fi da empresa. O app só conversa com o servidor do BC Calibração da empresa.
        </p>
      </div>
    </Tela>
  )
}

/** A moldura enquanto a câmera lê o QR (a câmera aparece atrás do app). */
export function MolduraQr({ aoCancelar }: { aoCancelar: () => void }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between bg-transparent"
      style={{ paddingTop: 'var(--topo)', paddingBottom: 'var(--base)' }}
    >
      <p className="mt-6 rounded-full bg-black/60 px-4 py-2 text-[16px] text-white">Aponte para o QR na tela do computador</p>
      <div className="size-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      <button
        type="button"
        onClick={aoCancelar}
        className="mb-8 min-h-[52px] rounded-2xl bg-white px-8 text-[17px] font-semibold text-[#16181b]"
      >
        Cancelar
      </button>
    </div>
  )
}
