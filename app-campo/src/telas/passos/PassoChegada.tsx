// Passo 2 · Chegada ao cliente: os dados impressos ("Confere" ou "Algo diferente…", e o certo vai numa anotação), onde a
// calibração foi feita (no cliente ou no laboratório), a OS e o endereço quando a folha não trouxe, o técnico (quem está
// com o celular) e a hora de início ("Agora"). Folha em branco: o cliente digitado, como nas caixas do papel.

import { AvisoNaHora } from '../../componentes/Avisos.tsx'
import { Cartao, Escolha, Marcar, SecaoTitulo } from '../../componentes/base.tsx'
import { CampoInstante, CampoTextoDaFolha, useGravar } from '../../componentes/CamposDaFolha.tsx'
import { ConfereOuDiferente } from '../../componentes/Folhas.tsx'
import type { PropsPasso } from '../Passo.tsx'

export function PassoChegada({ f, analise, anotar }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const ch = f.registro.passos.chegada
  const folha = f.pacote?.folha
  const ci = ch.clienteInformado
  const avisos = (analise?.avisos ?? []).filter((a) => a.passo === 2 && !a.falta)
  const mudarCliente = (campo: 'razaoSocial' | 'documento' | 'endereco' | 'contato' | 'email', v: string) =>
    void gravar((r) => {
      if (r.passos.chegada.clienteInformado) r.passos.chegada.clienteInformado[campo] = v
    })
  return (
    <div className="flex flex-col gap-1 pb-4">
      {ch.conferencias.length > 0 && (
        <>
          <SecaoTitulo>Do sistema · confira</SecaoTitulo>
          <div className="px-4">
            <Cartao>
              {ch.conferencias.map((c) => (
                <ConfereOuDiferente
                  key={c.campo}
                  item={c}
                  metrologico={false}
                  aoMudar={(x) =>
                    void gravar((r) => {
                      const alvo = r.passos.chegada.conferencias.find((y) => y.campo === c.campo)
                      if (alvo) Object.assign(alvo, x)
                    })
                  }
                  aoAnotar={() => anotar(c.campo, 'DADO_DIFERENTE')}
                />
              ))}
            </Cartao>
          </div>
        </>
      )}
      {ci && (
        <>
          <SecaoTitulo>Cliente (escreva como no papel)</SecaoTitulo>
          <div className="flex flex-col gap-3 px-4">
            <CampoTextoDaFolha
              rotulo="Razão social ou nome"
              obrigatorio
              valor={ci.razaoSocial}
              aoGravar={(v) => mudarCliente('razaoSocial', v)}
              maiusculas="words"
            />
            <CampoTextoDaFolha
              rotulo="CNPJ ou CPF"
              valor={ci.documento}
              aoGravar={(v) => mudarCliente('documento', v)}
              modoTeclado="numeric"
            />
            <Marcar
              marcado={ci.enderecoIgualAoLocal}
              aoMudar={(v) =>
                void gravar((r) => {
                  if (r.passos.chegada.clienteInformado) r.passos.chegada.clienteInformado.enderecoIgualAoLocal = v
                })
              }
            >
              Endereço do cliente igual ao local da calibração
            </Marcar>
            {!ci.enderecoIgualAoLocal && (
              <CampoTextoDaFolha rotulo="Endereço do cliente" valor={ci.endereco} aoGravar={(v) => mudarCliente('endereco', v)} />
            )}
            <CampoTextoDaFolha
              rotulo="Contato"
              valor={ci.contato}
              aoGravar={(v) => mudarCliente('contato', v)}
              maiusculas="words"
            />
            <CampoTextoDaFolha rotulo="E-mail" valor={ci.email} aoGravar={(v) => mudarCliente('email', v)} maiusculas="none" />
          </div>
        </>
      )}
      <SecaoTitulo>No local</SecaoTitulo>
      <div className="flex flex-col gap-4 px-4">
        <Escolha
          rotulo="Onde a calibração foi feita"
          opcoes={[
            { valor: 'CLIENTE', texto: 'No cliente' },
            { valor: 'LABORATORIO', texto: 'No laboratório da empresa' },
          ]}
          valor={ch.local}
          aoEscolher={(v) => void gravar((r) => void (r.passos.chegada.local = v))}
        />
        {folha && !folha.os && (
          <CampoTextoDaFolha
            rotulo="Nº da OS"
            valor={ch.os}
            aoGravar={(v) => void gravar((r) => void (r.passos.chegada.os = v))}
            maximo={40}
          />
        )}
        {folha && !folha.localEndereco && ch.local !== 'LABORATORIO' && (
          <CampoTextoDaFolha
            rotulo="Endereço da calibração"
            obrigatorio
            valor={ch.localEndereco}
            aoGravar={(v) => void gravar((r) => void (r.passos.chegada.localEndereco = v))}
          />
        )}
        <div>
          <div className="mb-1 text-[15px] font-medium text-ink-2">Técnico que executou</div>
          <div className="text-[17px] font-medium">{f.registro.tecnico.nome}</div>
          {folha?.tecnicoPrevisto && folha.tecnicoPrevisto !== f.registro.tecnico.nome && (
            <div className="text-[14px] text-ink-2">Previsto na folha: {folha.tecnicoPrevisto}</div>
          )}
        </div>
        <CampoInstante
          rotulo="Hora de início"
          valor={ch.inicio}
          aoMudar={(v) => void gravar((r) => void (r.passos.chegada.inicio = v))}
        />
        {avisos.map((a) => (
          <AvisoNaHora key={`${a.codigo}|${a.campo}|${a.texto}`} aviso={a} compacto />
        ))}
      </div>
    </div>
  )
}
