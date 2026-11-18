// A faixa do celular no editor da calibração (1.1.0): "No celular de Carlos desde 08:12" (com o registro original no
// celular, os passos de medição ficam só para leitura: "Recolher do celular" e "Vou digitar do papel"); no piloto, só o
// aviso de que a folha foi para o celular; com o pedido de recolher em aberto, o administrador pode "Recolher à força" (o
// celular perdido ou descadastrado nunca responde); quando a folha volta, "Voltou do campo" com "Comparar com o campo"
// (piloto) ou "Puxar dados do campo".

import { ArrowDownToLine, ClipboardList, Eye, GitCompareArrows, Lock, Smartphone, TriangleAlert, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CampoDaCalibracao } from '#shared/tipos.ts'
import { celularDe, desde, informadoEm, primeiroNome, quando, ROTULO_ESTADO_CELULAR, selosDasMarcas } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { dataHora } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export function FaixaCampo({
  campo,
  aberta,
  aoRecolher,
  aoRecolherAForca,
  aoDigitarDoPapel,
  aoVerRegistro,
  aoComparar,
  aoPuxar,
}: {
  campo: CampoDaCalibracao
  /** A calibração está em andamento (rascunho ou aguardando autorização). */
  aberta: boolean
  aoRecolher: () => void
  /** Só para o administrador: "Recolher à força" com o pedido de recolher em aberto (sem ele, o botão não aparece). */
  aoRecolherAForca?: () => void
  aoDigitarDoPapel: () => void
  aoVerRegistro: (id: string) => void
  aoComparar: () => void
  aoPuxar: () => void
}) {
  const e = campo.envio
  const registro = campo.registros.find((r) => r.id === campo.registroId)
  // O primeiro nome, sem artigo nos textos ("celular de Ana"); vazio, "o técnico"
  const nome = primeiroNome(e?.tecnico ?? registro?.tecnico ?? '')
  const ultima = campo.importacoes.at(-1)
  const ativo = !!e && (e.situacao === 'ENVIADA' || e.situacao === 'NO_CELULAR')

  // A folha voltou: o registro que vale
  if (registro) {
    const selos = selosDasMarcas(registro.marcas, registro.desfecho)
    const puxar = campo.registroOriginal === 'CELULAR'
    const doRegistro = campo.importacoes.filter((i) => i.registroId === registro.id)
    const jaUsado = doRegistro.length > 0
    const jaPuxado = doRegistro.some((i) => i.tipo === 'PUXAR')
    const jaComparado = doRegistro.some((i) => i.tipo === 'COMPARACAO')
    return (
      <Caixa tom={jaUsado ? 'neutral' : 'success'} icone={<ClipboardList className="h-4 w-4" />}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            <span className="tnum whitespace-nowrap">{registro.ligadoA || registro.numero}</span> voltou do campo
            <span className="font-normal">
              {' '}
              ({registro.tecnico || nome || 'técnico'}, {quando(registro.recebidoEm)})
            </span>
          </p>
          <p className="mt-0.5 text-[12.5px] opacity-90">
            {ultima
              ? `${ultima.tipo === 'PUXAR' ? 'Dados puxados' : 'Comparado com o campo'} em ${dataHora(ultima.feitoEm)} por ${ultima.feitoPor}.`
              : puxar
                ? 'Leve os dados do celular para o rascunho com “Puxar dados do campo”.'
                : 'Piloto: compare com o que foi digitado do papel. Nada vai para o rascunho.'}
            {campo.versaoNova && ' Chegou uma versão nova da folha depois de puxar: confira as diferenças.'}
          </p>
          {selos.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {selos.map((s) => (
                <span key={s.rotulo} title={s.dica}>
                  <Badge tom={s.tom} ponto={false} className="h-5 px-2 text-[11px]">
                    {s.rotulo}
                  </Badge>
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 max-sm:w-full max-sm:pl-7">
          <Button tamanho="sm" icone={<Eye className="h-3.5 w-3.5" />} onClick={() => aoVerRegistro(registro.id)}>
            Ver registro
          </Button>
          {aberta &&
            (puxar ? (
              <Button
                tamanho="sm"
                variante={jaPuxado ? 'secondary' : 'primary'}
                icone={<ArrowDownToLine className="h-3.5 w-3.5" />}
                onClick={aoPuxar}
              >
                {jaPuxado ? 'Puxar de novo' : 'Puxar dados do campo'}
              </Button>
            ) : (
              <Button
                tamanho="sm"
                variante={jaComparado ? 'secondary' : 'primary'}
                icone={<GitCompareArrows className="h-3.5 w-3.5" />}
                onClick={aoComparar}
              >
                {jaComparado ? 'Comparar de novo' : 'Comparar com o campo'}
              </Button>
            ))}
        </div>
      </Caixa>
    )
  }

  if (!e || !ativo) return null

  const estado = e.estadoCelular ? ROTULO_ESTADO_CELULAR[e.estadoCelular] : ''
  const informado = e.estadoCelularEm ? informadoEm(e.estadoCelularEm) : ''
  const titulo =
    e.situacao === 'NO_CELULAR'
      ? `No ${celularDe(nome)} ${desde(e.recebidoEm || e.enviadoEm)}`
      : `Enviada para ${nome || 'o técnico'} · aguardando o celular`
  const pedido = !!e.recolherPedidoEm

  if (pedido)
    return (
      <Caixa tom="warning" icone={<Undo2 className="h-4 w-4" />}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Recolher pedido ao {celularDe(nome)}</p>
          <p className="mt-0.5 text-[12.5px] opacity-90">
            {e.recolherResposta === 'JA_COMECEI'
              ? `${nome || 'O técnico'} já tinha começado a folha: ela vai voltar preenchida, e você decide o que usar.`
              : 'O celular apaga a folha na próxima vez que estiver na rede da empresa (se ainda não tiver começado). As leituras já podem ser digitadas aqui.'}
          </p>
        </div>
        {aoRecolherAForca && (
          <div className="flex shrink-0 flex-wrap gap-2 max-sm:w-full max-sm:pl-7">
            <Button
              tamanho="sm"
              icone={<Undo2 className="h-3.5 w-3.5" />}
              onClick={aoRecolherAForca}
              title="Para o celular perdido, roubado ou que não vai voltar: a folha sai do celular no sistema na hora"
            >
              Recolher à força
            </Button>
          </div>
        )}
      </Caixa>
    )

  return (
    <Caixa
      tom={campo.travada ? 'brand' : 'info'}
      icone={campo.travada ? <Lock className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {titulo}
          {estado && (
            <span className="font-normal">
              {' '}
              · {estado}
              {informado ? ` (${informado})` : ''}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12.5px] opacity-90">
          {campo.travada
            ? 'Os passos de medição ficam só para leitura até a folha voltar. Conformidade, próxima calibração e observações continuam livres.'
            : 'Piloto: a folha de papel continua sendo o registro original. Pode digitar do papel normalmente.'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 max-sm:w-full max-sm:pl-7">
        {campo.travada && (
          <Button tamanho="sm" icone={<TriangleAlert className="h-3.5 w-3.5" />} onClick={aoDigitarDoPapel}>
            Vou digitar do papel
          </Button>
        )}
        <Button tamanho="sm" icone={<Undo2 className="h-3.5 w-3.5" />} onClick={aoRecolher}>
          Recolher do celular
        </Button>
      </div>
    </Caixa>
  )
}

function Caixa({
  tom,
  icone,
  children,
}: {
  tom: 'brand' | 'info' | 'success' | 'warning' | 'neutral'
  icone: ReactNode
  children: ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'mb-5 flex flex-wrap items-start gap-x-3 gap-y-2.5 rounded-2xl border px-4 py-3 text-[13.5px] sm:items-center',
        tom === 'brand' && 'border-brand/25 bg-brand-soft text-brand-ink',
        tom === 'info' && 'border-info/20 bg-info-soft text-info',
        tom === 'success' && 'border-success/25 bg-success-soft text-success',
        tom === 'warning' && 'border-warning/25 bg-warning-soft text-warning',
        tom === 'neutral' && 'border-line bg-surface-2/70 text-ink-2',
      )}
    >
      <span className="mt-0.5 shrink-0 self-start">{icone}</span>
      {children}
    </div>
  )
}
