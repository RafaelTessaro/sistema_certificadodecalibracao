import { Building2, ExternalLink, FilePlus2, Link2, Loader2, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { enderecoCliente, enderecoEmpresa, LOCAIS } from '#shared/dominio.ts'
import type { FolhaCampoImpressa, LocalCalibracao } from '#shared/tipos.ts'
import { TEXTO_FOLHA_NOVA } from '../../lib/folhaCampo'
import { dataHora } from '../../lib/format'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field, Input, Select, Textarea } from '../ui/Form'
import { Segmented } from '../ui/Misc'
import type { ContextoEtapa } from './contexto'

export function EtapaIdentificacao({ f, alterar, cliente, equipe, config, folhaCampo, vincularFolha, novaFolha }: ContextoEtapa) {
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => alterar((s) => ({ ...s, [k]: v }))
  const mudarLocal = (local: LocalCalibracao) =>
    alterar((s) => ({
      ...s,
      local,
      // Sugere o endereço certo; o que foi digitado à mão para outro endereço continua
      localEndereco:
        !s.localEndereco || s.localEndereco === enderecoCliente(cliente) || s.localEndereco === enderecoEmpresa(config.empresa)
          ? local === 'CLIENTE'
            ? enderecoCliente(cliente)
            : enderecoEmpresa(config.empresa)
          : s.localEndereco,
    }))
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={<Building2 className="h-4 w-4" />}
          titulo="Cliente"
          descricao="Quem solicitou a calibração (sai no certificado)"
          acoes={
            <Link
              to={`/clientes/${cliente.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline"
            >
              Ver cadastro <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 pb-5 text-sm sm:grid-cols-2">
          <Info rotulo={cliente.tipo === 'PJ' ? 'Razão social' : 'Nome'}>{cliente.razaoSocial || cliente.nome}</Info>
          <Info rotulo={cliente.tipo === 'PJ' ? 'CNPJ' : 'CPF'}>{cliente.documento}</Info>
          <Info rotulo="Endereço" className="sm:col-span-2">
            {enderecoCliente(cliente)}
          </Info>
        </div>
      </Card>

      <Card>
        <CardHeader titulo="Dados da calibração" descricao="Ordem de serviço, datas, local e quem executou" />
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-6">
          <Field
            label="Nº da ordem de serviço"
            htmlFor="k-os"
            className="sm:col-span-2"
            hint="O número da OS no sistema de ordens de serviço da empresa."
          >
            <Input
              id="k-os"
              value={f.ordemServico}
              onChange={(e) => set('ordemServico', e.target.value)}
              placeholder="Ex.: 12345"
            />
          </Field>
          <Field label="Data da calibração" htmlFor="k-data" className="sm:col-span-2">
            <Input id="k-data" type="date" value={f.dataCalibracao} onChange={(e) => set('dataCalibracao', e.target.value)} />
          </Field>
          {/* Só o nome na lista (cabe na coluna); o cargo de quem foi escolhido aparece embaixo */}
          <Field
            label="Técnico que executou"
            htmlFor="k-tec"
            className="sm:col-span-2"
            hint={equipe.find((u) => u.id === f.tecnicoId)?.cargo || undefined}
          >
            <Select id="k-tec" value={f.tecnicoId} onChange={(e) => set('tecnicoId', e.target.value)}>
              <option value="">Escolha…</option>
              {equipe.map((u) => (
                <option key={u.id} value={u.id} title={u.cargo || undefined}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </Field>

          {/* Recomeça do nº ligado sempre que ele muda (ao ligar ou ao imprimir pelo assistente) */}
          <CampoFolhaCampo
            key={folhaCampo?.numero ?? ''}
            folha={folhaCampo}
            revisao={!!f.substituiId}
            vincular={vincularFolha}
            nova={novaFolha}
          />

          <Field label="Onde a calibração foi feita" className="sm:col-span-6">
            <Segmented
              valor={f.local}
              aoMudar={mudarLocal}
              opcoes={(Object.keys(LOCAIS) as LocalCalibracao[]).map((l) => ({ valor: l, label: LOCAIS[l] }))}
            />
          </Field>
          <Field
            label="Endereço da calibração"
            htmlFor="k-end"
            className={f.local === 'LABORATORIO' ? 'sm:col-span-4' : 'sm:col-span-6'}
            hint="Sai no certificado como local de execução."
          >
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input id="k-end" className="pl-9" value={f.localEndereco} onChange={(e) => set('localEndereco', e.target.value)} />
            </div>
          </Field>
          {f.local === 'LABORATORIO' && (
            <Field label="Data de recebimento" htmlFor="k-receb" className="sm:col-span-2" hint="Quando a balança chegou.">
              <Input
                id="k-receb"
                type="date"
                value={f.dataRecebimento}
                onChange={(e) => set('dataRecebimento', e.target.value)}
              />
            </Field>
          )}

          <Field
            label="Anotações internas"
            htmlFor="k-notas"
            className="sm:col-span-6"
            hint="Ficam só no sistema (não saem no certificado)."
          >
            <Textarea
              id="k-notas"
              value={f.anotacoesInternas}
              onChange={(e) => set('anotacoesInternas', e.target.value)}
              placeholder="Ex.: contato na portaria, horário combinado, observações da visita"
            />
          </Field>
        </div>
      </Card>
    </div>
  )
}

/**
 * Nº da folha de campo: a impressa pela calibração ou a avulsa (em branco, do cliente ou da balança)
 * preenchida no cliente, ligada aqui pelo nº do alto do papel; a reimpressão passa a usar esse nº. Com
 * folha própria, "Folha nova (novo nº)" tira outra, com os dados atuais (o plano mudou antes da visita): a
 * de antes fica registrada como não usada. Numa revisão, a folha é a do certificado revisado.
 */
function CampoFolhaCampo({
  folha,
  revisao,
  vincular,
  nova,
}: {
  folha: FolhaCampoImpressa | null
  /** Revisão de certificado: sem folha, o revisado foi feito sem ela (não há folha para imprimir). */
  revisao: boolean
  vincular: (numero: string) => Promise<boolean>
  nova: () => void
}) {
  const [numero, setNumero] = useState(folha?.numero ?? '')
  const [ligando, setLigando] = useState(false)
  const pode = !!numero.trim() && numero.trim().toUpperCase() !== folha?.numero && !ligando
  const impressa = folha ? `impressa em ${dataHora(folha.impressaEm)}${folha.impressaPor ? ` por ${folha.impressaPor}` : ''}` : ''
  const naoUsadas = folha?.substituidas?.length
    ? ` Substitui a ${folha.substituidas.join(', ')} (não usada${folha.substituidas.length > 1 ? 's' : ''}).`
    : ''
  const ligar = async () => {
    if (!pode) return
    setLigando(true)
    await vincular(numero.trim())
    setLigando(false)
  }
  return (
    <Field
      label="Folha de campo nº"
      htmlFor="k-folha"
      className="sm:col-span-6"
      hint={
        !folha && revisao
          ? 'O certificado revisado foi feito sem folha de campo impressa pelo sistema: a revisão é a mesma visita, sem folha para imprimir. Se houve nova visita com uma folha avulsa, informe o nº do alto dela.'
          : !folha
            ? 'Foi preenchida no cliente uma folha avulsa (em branco, do cliente ou da balança)? Informe o nº do alto dela: a calibração fica com esse nº.'
            : folha.herdada
              ? `Do certificado revisado (a mesma visita), ${impressa}.`
              : `${impressa.charAt(0).toUpperCase()}${impressa.slice(1)}.${naoUsadas} Se no cliente foi preenchida outra folha (em branco ou da balança), informe o nº dela.`
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="k-folha"
          className="tnum sm:w-56"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ligar()
          }}
          placeholder="FC-AAAA-NNNNN"
          autoComplete="off"
        />
        <Button
          icone={ligando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          disabled={!pode}
          onClick={() => void ligar()}
        >
          Ligar à calibração
        </Button>
        {folha && !folha.herdada && (
          <Button
            variante="ghost"
            icone={<FilePlus2 className="h-4 w-4" />}
            onClick={nova}
            title={`${TEXTO_FOLHA_NOVA}: para quando o plano mudou e a ${folha.numero} ainda não foi a campo`}
          >
            Folha nova (novo nº)
          </Button>
        )}
      </div>
    </Field>
  )
}

export function Info({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted">{rotulo}</p>
      <p className="mt-0.5 break-words text-ink-2">{children || <span className="text-muted">—</span>}</p>
    </div>
  )
}
