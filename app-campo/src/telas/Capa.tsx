// A capa da folha ("Antes de sair"): cliente, OS, balança, o nº do certificado reservado (copie na etiqueta no fim), o
// recado do escritório, a lista do que separar (só um lembrete, fora do registro) e os avisos para resolver antes de
// sair. "Começar a folha" só depois da confirmação do servidor; depois, "Continuar do passo n".

import { useState } from 'react'
import { passoDaEtapa, TITULOS_ETAPAS } from '../../../shared/campo/progresso.ts'
import { numeroBr } from '../../../shared/dominio.ts'
import { formatarInstante } from '../../../shared/campo/registro.ts'
import { ir, mudarFolha, trocar, voltar } from '../app/acoes.ts'
import { useAnalise } from '../app/analise.ts'
import { lerEstado, useFolha } from '../app/loja.ts'
import { Botao, Cabecalho, Cartao, Marcar, SecaoTitulo, Selo, Tela } from '../componentes/base.tsx'
import { comecar } from '../nucleo/folha.ts'
import { dataBr } from '../nucleo/datas.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'

export function TelaCapa({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  const analise = useAnalise(f?.registro, f?.pacote)
  const [separados, setSeparados] = useState<Record<string, boolean>>({})
  if (!f) return null
  const p = f.pacote
  const folha = p?.folha
  const b = p?.balanca
  const hoje = relogioDoAparelho.hoje()
  const data = folha?.dataPrevista || f.resumo.dataPrevista
  const dataTexto = data ? (data === hoje ? 'prevista para hoje' : `prevista para ${dataBr(data)}`) : 'sem data prevista'

  const comecarFolha = async () => {
    const e = lerEstado()
    if (!e.pareamento) return
    const nova = await mudarFolha(envioId, (x) =>
      comecar(
        x,
        e.pareamento!.tecnico,
        { id: e.pareamento!.aparelhoId, modelo: e.modeloAparelho, versaoApp: e.versaoApp },
        relogioDoAparelho.agora(),
      ),
    )
    if (nova) trocar({ nome: 'passo', envioId, etapa: 'padroes' })
  }

  const proxima = analise?.progresso.proxima ?? f.etapaAtual ?? 'padroes'
  return (
    <Tela
      rodape={
        f.estado === 'NOVA' ? (
          <Botao variante="principal" grande className="w-full" onClick={() => void comecarFolha()}>
            Começar a folha
          </Botao>
        ) : f.estado === 'RECEBENDO' ? (
          <p className="py-2 text-center text-[16px] text-ink-2">
            Conecte-se à rede da empresa para confirmar o recebimento. Depois, a folha pode ser começada.
          </p>
        ) : f.estado === 'EM_PREENCHIMENTO' || f.estado === 'REABERTA' ? (
          <Botao
            variante="principal"
            grande
            className="w-full"
            onClick={() => ir({ nome: 'passo', envioId, etapa: f.etapaAtual ?? proxima })}
          >
            Continuar do passo {passoDaEtapa(f.etapaAtual ?? proxima)}
          </Botao>
        ) : null
      }
    >
      <Cabecalho titulo={<span className="numero-fc">{f.numero}</span>} subtitulo={folha?.formulario.titulo} aoVoltar={voltar} />
      {folha?.piloto && (
        <div className="bg-surface-3 px-4 py-2 text-center text-[14px] font-semibold uppercase tracking-wide">
          Piloto · a folha de papel continua sendo o registro original
        </div>
      )}
      <div className="flex flex-col gap-3 p-4">
        <Cartao>
          <div className="text-[19px] font-semibold">{f.resumo.cliente || 'Cliente a informar no local'}</div>
          {(folha?.localEndereco || p?.cliente?.endereco) && (
            <div className="text-[16px] text-ink-2">{folha?.localEndereco || p?.cliente?.endereco}</div>
          )}
          <div className="mt-1 text-[16px]">
            {folha?.os ? `${/^os\b/i.test(folha.os) ? '' : 'OS '}${folha.os} · ` : ''}
            {dataTexto}
          </div>
        </Cartao>
        <Cartao>
          <div className="text-[17px] font-semibold">{f.resumo.balanca || 'Balança informada no local'}</div>
          {b && b.faixas.length > 0 && (
            <div className="mt-1 text-[16px] text-ink-2">
              Max {numeroBr(b.faixas.at(-1)!.max)} {b.unidade} · d {numeroBr(b.faixas[0].d)} {b.unidade}
              {b.classe ? ` · classe ${b.classe}` : ''}
            </div>
          )}
          {!b && (
            <div className="mt-1 text-[15px] text-ink-2">
              Folha {f.resumo.tipo === 'branco' ? 'em branco' : 'só do cliente'}: os dados da balança são escritos no passo 3.
            </div>
          )}
        </Cartao>
        {folha?.numeroCertificado && (
          <Cartao>
            <div className="text-[15px] text-ink-2">Certificado reservado</div>
            <div className="numero-fc text-[20px] font-semibold">{folha.numeroCertificado}</div>
            <div className="text-[15px] text-ink-2">Copie na etiqueta no fim.</div>
          </Cartao>
        )}
        {folha?.recado && (
          <Cartao className="border-brand">
            <div className="text-[15px] font-semibold text-brand-ink">Recado do escritório</div>
            <p className="mt-1 text-[16px]">{folha.recado}</p>
          </Cartao>
        )}
        {folha?.anotacoesInternas && (
          <Cartao>
            <div className="text-[15px] font-semibold text-ink-2">Acesso e observações</div>
            <p className="mt-1 text-[16px]">{folha.anotacoesInternas}</p>
          </Cartao>
        )}
      </div>
      {p && (p.padroes.previstos.length > 0 || folha!.avisosAntesDeSair.length > 0) && (
        <>
          <SecaoTitulo>Antes de sair · separar</SecaoTitulo>
          <div className="flex flex-col gap-2 px-4">
            {p.padroes.previstos.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2">
                <Marcar marcado={!!separados[x.id]} aoMudar={(v) => setSeparados((s) => ({ ...s, [x.id]: v }))}>
                  {x.identificacao}
                  {x.separar ? ` · ${x.separar}` : ''}
                </Marcar>
                {x.situacao === 'VENCIDO' && <Selo tom="vermelho">▲ Vencido</Selo>}
                {x.situacao === 'VENCENDO' && <Selo tom="ambar">▲ Vence logo</Selo>}
              </div>
            ))}
            <p className="text-[14px] text-ink-2">Esta lista é só um lembrete: "Levado" e "Usado" são marcados no passo 1.</p>
            {folha!.avisosAntesDeSair.map((a, i) => (
              <p key={i} className="rounded-xl bg-warning-soft px-3 py-2 text-[15px] text-warning-ink">
                ▲ {a}
              </p>
            ))}
          </div>
        </>
      )}
      <div className="px-4 pb-6 pt-4 text-[14px] text-ink-2">
        Recebida do escritório em {formatarInstante(f.recebidaEm)}
        {folha?.enviadaPor ? ` · enviada por ${folha.enviadaPor}` : ''}.
        {f.etapaAtual && f.estado !== 'NOVA' && ` Parou em: ${TITULOS_ETAPAS[f.etapaAtual]}.`}
      </div>
      {f.registro && (
        <div className="px-4 pb-6">
          <Botao className="w-full" onClick={() => ir({ nome: 'verFolha', envioId })}>
            Ver a folha
          </Botao>
        </div>
      )}
    </Tela>
  )
}
