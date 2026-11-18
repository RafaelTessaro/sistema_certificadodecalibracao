// O bloco "Registro de campo" de "Revisão e emissão" e da autorização (1.1.0): a folha que voltou do celular (FC, quando
// chegou, o técnico, as marcas, o desfecho), os avisos vistos no local e, depois de "Puxar dados do campo", as diferenças
// dos dados brutos com o celular e a justificativa (um texto só): sem ela, a emissão fica pendente. Na emissão, as
// diferenças e a justificativa ficam congeladas no certificado (só dado: o PDF não muda).

import { Check, ClipboardList, Eye, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { CampoDaCalibracao } from '#shared/tipos.ts'
import { quando, rotuloDoDesfecho, selosDasMarcas } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { dataHora } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Textarea } from '../ui/Form'

export function BlocoRegistroCampo({
  campo,
  aberta,
  aoVerRegistro,
  aoJustificar,
}: {
  campo: CampoDaCalibracao
  /** Em andamento: a justificativa pode ser escrita. */
  aberta: boolean
  aoVerRegistro: (id: string) => void
  /** Grava a justificativa ('' tira); true se gravou. */
  aoJustificar: (texto: string) => Promise<boolean>
}) {
  const registro = campo.registros.find((r) => r.id === campo.registroId)
  const [texto, setTexto] = useState(campo.justificativa?.texto ?? '')
  const [salvando, setSalvando] = useState(false)
  const [ultimo, setUltimo] = useState(campo.justificativa?.texto ?? '')
  // A justificativa gravada mudou (outra pessoa, ou acabou de gravar): a caixa acompanha, se não estiver sendo editada
  const gravada = campo.justificativa?.texto ?? ''
  if (gravada !== ultimo) {
    setUltimo(gravada)
    if (texto === ultimo) setTexto(gravada)
  }
  if (!registro) return null
  const selos = selosDasMarcas(registro.marcas, registro.desfecho)
  const comparacoes = campo.importacoes.filter((i) => i.tipo === 'COMPARACAO')
  const diferencas = campo.divergencias
  const pendente = campo.puxado && diferencas.length > 0 && !gravada
  const mudou = texto.trim() !== gravada

  const salvar = async () => {
    setSalvando(true)
    try {
      await aoJustificar(texto.trim())
    } finally {
      setSalvando(false)
    }
  }

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
        descricao={`Voltou do celular de ${registro.tecnico || 'técnico'} ${quando(registro.recebidoEm)}${
          campo.registroOriginal === 'PAPEL' ? ' · piloto: o papel é o registro original' : ''
        }`}
        acoes={
          <Button tamanho="sm" icone={<Eye className="h-3.5 w-3.5" />} onClick={() => aoVerRegistro(registro.id)}>
            Ver registro
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {(selos.length > 0 || (campo.desfecho && campo.desfecho !== 'COMPLETA')) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selos.map((s) => (
              <span key={s.rotulo} title={s.dica}>
                <Badge tom={s.tom} ponto={false}>
                  {s.rotulo}
                </Badge>
              </span>
            ))}
            {campo.desfecho && campo.desfecho !== 'COMPLETA' && campo.motivoDesfecho && (
              <span className="text-[13px] text-ink-2">
                {rotuloDoDesfecho(campo.desfecho)}: {campo.motivoDesfecho}
              </span>
            )}
          </div>
        )}

        {campo.problema && (
          <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {campo.problema}
          </p>
        )}

        {campo.avisosConferidos.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">Avisos vistos no local</p>
            <ul className="flex flex-col gap-1.5">
              {campo.avisosConferidos.map((a, i) => (
                <li
                  key={i}
                  className={cn(
                    'rounded-xl px-3.5 py-2 text-[13px]',
                    a.classe === 'IMPEDE' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                  )}
                >
                  <span className="font-medium">{a.texto}</span>
                  <span className="block text-[12px] text-ink-2">
                    {a.motivo ? `Motivo do técnico: ${a.motivo}` : 'O técnico conferiu: está certo.'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {comparacoes.length > 0 && !campo.puxado && (
          <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
            {comparacoes.map((c) => (
              <li key={c.id}>
                Comparado com o campo em {dataHora(c.feitoEm)} por {c.feitoPor}
                {c.observacao ? `: ${c.observacao}` : '.'}
              </li>
            ))}
          </ul>
        )}

        {campo.puxado && (
          <div className="flex flex-col gap-3">
            {diferencas.length === 0 ? (
              <p className="flex items-center gap-2 text-[13px] text-success">
                <Check className="h-4 w-4" /> Os dados brutos continuam iguais aos do celular desde que foram puxados.
              </p>
            ) : (
              <>
                <p className={cn('text-[13px] font-medium', pendente ? 'text-warning' : 'text-ink-2')}>
                  {diferencas.length} {diferencas.length === 1 ? 'dado bruto mudou' : 'dados brutos mudaram'} depois de puxar os
                  dados do celular. {pendente ? 'Escreva uma justificativa para emitir.' : ''}
                </p>
                <div className="scroll-fino max-h-56 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0">
                      <tr className="bg-surface-2 text-left text-xs text-muted">
                        <th className="px-3 py-2 font-medium">Dado</th>
                        <th className="px-3 py-2 font-medium">No celular</th>
                        <th className="px-3 py-2 font-medium">No certificado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diferencas.map((x) => (
                        <tr key={x.chave} className="border-t border-line">
                          <td className="px-3 py-1.5 text-ink">{x.rotulo}</td>
                          <td className="tnum px-3 py-1.5 text-ink-2">{x.celular || '—'}</td>
                          <td className="tnum px-3 py-1.5 font-medium text-ink">{x.certificado || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label htmlFor="justificativa-campo" className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-2">Justificativa das diferenças</span>
                  <Textarea
                    id="justificativa-campo"
                    value={texto}
                    maxLength={1000}
                    disabled={!aberta}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Ex.: leitura conferida no papel assinado; digitação do papel corrigida."
                    className={cn('min-h-[72px]', pendente && 'border-warning/60')}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {campo.justificativa && (
                    <p className="text-xs text-muted">
                      Escrita por {campo.justificativa.por} em {dataHora(campo.justificativa.em)}. Vai junto com o certificado
                      (não sai no PDF).
                    </p>
                  )}
                  {aberta && (
                    <Button
                      tamanho="sm"
                      variante={pendente ? 'primary' : 'secondary'}
                      className="ml-auto"
                      disabled={salvando || !mudou || (!texto.trim() && !gravada)}
                      icone={salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      onClick={() => void salvar()}
                    >
                      {texto.trim() ? 'Salvar justificativa' : 'Tirar a justificativa'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
