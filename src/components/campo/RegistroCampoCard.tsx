// O registro de campo na ficha do certificado emitido (1.1.0): a folha que voltou do celular sem ter sido puxada antes da
// emissão (o piloto, ou a que volta "depois de recolhida", quando a emissão pediu o recolhimento e o técnico já tinha
// começado). "Ver registro" e "Comparar com o campo" (Celular | Certificado, nada muda no certificado). A comparação
// registrada tira a folha do cartão "Voltaram do campo" do Painel. O que foi puxado antes da emissão fica no
// `CampoDaEmissaoCard` (congelado na emissão).

import { ClipboardList, Eye, GitCompareArrows } from 'lucide-react'
import { useState } from 'react'
import type { Balanca, Calibracao, CampoDaCalibracao } from '#shared/tipos.ts'
import { api } from '../../lib/api'
import { quando, selosDasMarcas } from '../../lib/campo'
import { useConsulta } from '../../lib/consulta'
import { dataHora } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { CompararCampo, RegistroCampo } from './preguicosos'

/** Carrega o envio e os registros da folha da calibração e mostra o cartão (nada sem registro). */
export function RegistroCampoCard({ calibracao: k, balanca }: { calibracao: Calibracao; balanca: Balanca | undefined }) {
  const { dados: campo, recarregar } = useConsulta(`campo:calibracao:${k.id}`, () => api.campoDaCalibracao(k.id), ['calibracao'])
  if (!campo) return null
  return <CartaoRegistroCampo campo={campo} calibracao={k} balanca={balanca} aoComparar={recarregar} />
}

/**
 * O cartão, com os dados já carregados. Só aparece com um registro que vale e que não é o que já ficou congelado na
 * emissão (o puxado antes de emitir).
 */
export function CartaoRegistroCampo({
  campo,
  calibracao: k,
  balanca,
  aoComparar,
}: {
  campo: CampoDaCalibracao
  calibracao: Calibracao
  balanca: Balanca | undefined
  aoComparar: () => void
}) {
  const [registroAberto, setRegistroAberto] = useState<string | null>(null)
  const [comparando, setComparando] = useState(false)
  const registro = campo.registros.find((r) => r.id === campo.registroId)
  if (!registro || registro.id === k.emissao?.campo?.registroId) return null
  const selos = selosDasMarcas(registro.marcas, registro.desfecho)
  const comparacao = campo.importacoes.filter((i) => i.registroId === registro.id && i.tipo === 'COMPARACAO').at(-1)
  // A comparação feita no editor, antes de emitir (o piloto), foi com o rascunho, que pode ter mudado depois: não vale
  // como conferência do certificado (as duas datas são ISO)
  const antes = !!comparacao && !!k.emissao?.emitidoEm && comparacao.feitoEm < k.emissao.emitidoEm
  const comparadoComCertificado = !!comparacao && !antes
  // Só o certificado que vale é comparado (o servidor recusa o cancelado; o substituído é uma versão antiga)
  const podeComparar = k.status === 'EMITIDO' && !!balanca
  const tecnico = k.emissao?.tecnico
  return (
    <Card>
      <CardHeader
        icone={<ClipboardList className="h-4 w-4" />}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Registro de campo
            <span className="tnum font-medium whitespace-nowrap text-ink-2">{registro.ligadoA || registro.numero}</span>
          </span>
        }
        descricao={
          !comparacao
            ? 'A folha voltou do celular. Compare com o certificado: a comparação fica registrada e nada muda nele.'
            : antes
              ? `Comparado com o rascunho em ${dataHora(comparacao.feitoEm)} por ${comparacao.feitoPor}, antes da emissão.`
              : `Comparado com o certificado em ${dataHora(comparacao.feitoEm)} por ${comparacao.feitoPor}.`
        }
        acoes={
          <span className="flex flex-wrap gap-2">
            <Button tamanho="sm" icone={<Eye className="h-3.5 w-3.5" />} onClick={() => setRegistroAberto(registro.id)}>
              Ver registro
            </Button>
            {podeComparar && (
              <Button
                tamanho="sm"
                variante={comparadoComCertificado ? 'secondary' : 'primary'}
                icone={<GitCompareArrows className="h-3.5 w-3.5" />}
                onClick={() => setComparando(true)}
              >
                {comparadoComCertificado ? 'Comparar de novo' : 'Comparar com o campo'}
              </Button>
            )}
          </span>
        }
      />
      <div className="flex flex-col gap-2 px-5 pb-5 text-[13px] text-ink-2">
        <p>
          {[registro.tecnico, quando(registro.recebidoEm) && `chegou ${quando(registro.recebidoEm)}`].filter(Boolean).join(', ')}
        </p>
        {selos.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {selos.map((s) => (
              <span key={s.rotulo} title={s.dica}>
                <Badge tom={s.tom} ponto={false} className="h-5 px-2 text-[11px]">
                  {s.rotulo}
                </Badge>
              </span>
            ))}
          </span>
        )}
        {comparacao?.observacao && (
          <p className="rounded-xl bg-surface-2/60 px-3.5 py-2.5 whitespace-pre-line text-ink">{comparacao.observacao}</p>
        )}
      </div>
      {registroAberto !== null && (
        <RegistroCampo registroId={registroAberto} calibracaoAtual={k.id} aoFechar={() => setRegistroAberto(null)} />
      )}
      {podeComparar && (
        <CompararCampo
          aberto={comparando}
          aoFechar={() => setComparando(false)}
          calibracaoId={k.id}
          versao={k.versao}
          rascunho={k}
          balanca={balanca}
          registroId={registro.id}
          // Nunca o modo puxar: o certificado emitido não muda
          registroOriginal="PAPEL"
          emitido
          nomes={tecnico ? { [tecnico.id]: tecnico.nome } : undefined}
          aoComparar={aoComparar}
        />
      )}
    </Card>
  )
}
