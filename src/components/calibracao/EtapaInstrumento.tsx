import { ClipboardCheck, Pencil, Scale, SlidersHorizontal, Wrench } from 'lucide-react'
import { Fragment } from 'react'
import {
  AJUSTES,
  capacidadeTexto,
  divisaoLegivel,
  FINALIDADES,
  numeroBr,
  parteSeparada,
  RECEPTORES,
  ROTULO_CLASSE,
  TIPOS_BALANCA,
} from '#shared/dominio.ts'
import type { AjusteRealizado, CalibracaoInput, RespostaVerificacao, ZeroAutomatico } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field, Input } from '../ui/Form'
import { Segmented } from '../ui/Misc'
import type { ContextoEtapa } from './contexto'
import { Info } from './EtapaIdentificacao'

const VERIFICACOES: Array<{ chave: Exclude<keyof CalibracaoInput['preliminar'], 'zeroAutomatico'>; texto: string }> = [
  { chave: 'identificavel', texto: 'Balança identificada (série, modelo, plaqueta legível)' },
  { chave: 'limpa', texto: 'Limpa, sem danos ou contaminação no prato/plataforma' },
  { chave: 'nivelada', texto: 'Nivelada (bolha centralizada, quando houver)' },
  { chave: 'aquecida', texto: 'Ligada e aquecida pelo tempo do fabricante' },
  { chave: 'preCarga', texto: 'Pré-carga aplicada (carga perto de Max pelo menos uma vez)' },
]

export function EtapaInstrumento({ f, alterar, balanca, editarBalanca }: ContextoEtapa) {
  const prel = f.preliminar
  const setPrel = (k: keyof CalibracaoInput['preliminar'], v: string) =>
    alterar((s) => ({ ...s, preliminar: { ...s.preliminar, [k]: v } }))
  const semResposta = Object.values(prel).filter((v) => !v).length
  const algumNao = Object.values(prel).includes('NAO')
  const setAjuste = (realizado: AjusteRealizado) =>
    alterar((s) => ({
      ...s,
      ajuste: { ...s.ajuste, realizado },
      // Com ajuste, o ensaio "como encontrado" usa os mesmos pontos do erro de indicação (sem leituras)
      comoEncontrado:
        realizado === 'NAO'
          ? null
          : (s.comoEncontrado ?? {
              ...s.indicacao,
              retornoZero: null,
              pontos: s.indicacao.pontos.map((p) => ({ ...p, crescente: null, decrescente: null })),
            }),
    }))
  const setReparo = (k: keyof CalibracaoInput['reparo'], v: string | boolean) =>
    alterar((s) => ({ ...s, reparo: { ...s.reparo, [k]: v } }))
  // e na unidade mais legível, como na plaqueta (0,005 kg → 5 g)
  const e = divisaoLegivel(
    balanca.faixas.map((x) => x.e),
    balanca.unidade,
  )
  // Plataforma com plaqueta própria (ou, numa cópia antiga, o indicador separado)
  const separada = parteSeparada(balanca)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={<Scale className="h-4 w-4" />}
          titulo="Balança calibrada"
          descricao="Confira com a plaqueta da balança: estes dados saem no certificado"
          acoes={
            <Button tamanho="sm" icone={<Pencil className="h-3.5 w-3.5" />} onClick={editarBalanca}>
              Corrigir cadastro
            </Button>
          }
        />
        {/* Colunas pela largura do cartão, não da janela: com a coluna "Resultados ao vivo" ao lado, o cartão é
            estreito mesmo numa tela larga (4 colunas a partir de 42rem, 3 a partir de 36rem) */}
        <div className="@container px-5 pb-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm @xl:grid-cols-3 @2xl:grid-cols-4">
            <Info rotulo="Tipo">{TIPOS_BALANCA[balanca.tipo]}</Info>
            <Info rotulo="Fabricante / modelo">{[balanca.fabricante, balanca.modelo].filter(Boolean).join(' ')}</Info>
            <Info rotulo={separada?.rotulo === 'Indicador' ? 'Nº de série' : 'Nº de série (indicador)'}>
              {balanca.numeroSerie}
            </Info>
            <Info rotulo="Identificação / TAG">{balanca.identificacao}</Info>
            <Info rotulo="Capacidade × divisão">
              <SemQuebrarUnidade texto={capacidadeTexto(balanca)} />
            </Info>
            <Info rotulo="Verificação (e)">
              <span className="whitespace-nowrap">
                {e.valores.map((v) => numeroBr(v)).join('/')} {e.unidade}
              </span>
            </Info>
            <Info rotulo="Classe de exatidão">{ROTULO_CLASSE[balanca.classe]}</Info>
            <Info rotulo="Portaria de aprovação">{balanca.portariaAprovacao}</Info>
            <Info rotulo="Receptor de carga">{RECEPTORES[balanca.receptor]}</Info>
            {separada && (
              <Info rotulo={separada.rotulo}>
                {[separada.nome, separada.serie && `nº de série ${separada.serie}`].filter(Boolean).join(' · ')}
              </Info>
            )}
            <Info rotulo="Finalidade">{balanca.finalidade ? FINALIDADES[balanca.finalidade] : ''}</Info>
            <Info rotulo="Local de instalação" className="col-span-2">
              {balanca.localInstalacao}
            </Info>
          </div>
        </div>
        {balanca.finalidade === 'COMERCIAL' || balanca.finalidade === 'SAUDE' ? (
          <p className="mx-5 mb-5 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
            Balança de uso {balanca.finalidade === 'COMERCIAL' ? 'comercial' : 'na saúde'}: a calibração não substitui a
            verificação do Inmetro/IPEM. O certificado já traz essa ressalva.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          icone={<ClipboardCheck className="h-4 w-4" />}
          titulo="Verificação antes de calibrar"
          descricao="Condições da balança no início (EURAMET cg-18, 4.1.3). Responda cada item como encontrou na balança."
        />
        <ul className="divide-y divide-line border-t border-line">
          {VERIFICACOES.map((v) => (
            <li key={v.chave} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-ink-2">{v.texto}</span>
              {/* Sem resposta (''), nenhuma opção fica marcada */}
              <Segmented<RespostaVerificacao>
                tamanho="sm"
                valor={prel[v.chave]}
                aoMudar={(x) => setPrel(v.chave, x)}
                opcoes={[
                  { valor: 'SIM', label: 'Sim' },
                  { valor: 'NAO', label: 'Não' },
                  { valor: 'NA', label: 'N/A' },
                ]}
              />
            </li>
          ))}
          <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-ink-2">Zero automático / rastreamento de zero</span>
            <Segmented<ZeroAutomatico | ''>
              tamanho="sm"
              valor={prel.zeroAutomatico}
              aoMudar={(x) => setPrel('zeroAutomatico', x)}
              opcoes={[
                { valor: 'LIGADO', label: 'Ligado' },
                { valor: 'DESLIGADO', label: 'Desligado' },
                { valor: 'NAO_POSSUI', label: 'Não possui' },
                { valor: 'NAO_VERIFICADO', label: 'Não verificado' },
              ]}
            />
          </li>
        </ul>
        {(semResposta > 0 || algumNao) && (
          <div className="flex flex-col gap-2 px-5 py-4">
            {semResposta > 0 && (
              <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
                {semResposta === 1 ? 'Falta responder 1 item' : `Faltam responder ${semResposta} itens`}. O certificado só é
                emitido com todos respondidos.
              </p>
            )}
            {algumNao && (
              <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
                Algum item não foi atendido. Registre o que aconteceu nas observações do certificado (etapa “Conclusão”).
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          icone={<SlidersHorizontal className="h-4 w-4" />}
          titulo="Ajuste"
          descricao="Se a balança foi ajustada, o certificado mostra os resultados antes e depois do ajuste"
        />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Segmented
            valor={f.ajuste.realizado}
            aoMudar={setAjuste}
            opcoes={(Object.keys(AJUSTES) as AjusteRealizado[]).map((a) => ({ valor: a, label: AJUSTES[a] }))}
          />
          {f.ajuste.realizado !== 'NAO' && (
            <>
              <Field
                label="Como foi o ajuste"
                htmlFor="k-ajuste"
                hint={
                  f.ajuste.realizado === 'EXTERNO'
                    ? 'Informe o peso usado. Ex.: “Ajuste de span com peso padrão de 20 kg”.'
                    : undefined
                }
              >
                <Input
                  id="k-ajuste"
                  value={f.ajuste.descricao}
                  onChange={(e) => alterar((s) => ({ ...s, ajuste: { ...s.ajuste, descricao: e.target.value } }))}
                  placeholder={
                    f.ajuste.realizado === 'EXTERNO' ? 'Ajuste de span com peso de 20 kg' : 'Ajuste interno pelo menu da balança'
                  }
                />
              </Field>
              <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
                Na etapa <b className="font-medium text-ink">Erro de indicação</b> aparece a aba{' '}
                <b className="font-medium text-ink">Antes do ajuste</b>, para as leituras “como encontrado”. É recomendado: o
                cliente usa esses valores para avaliar as pesagens feitas antes.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          icone={<Wrench className="h-4 w-4" />}
          titulo="Reparo ou manutenção"
          descricao="Houve intervenção da oficina (selos rompidos)? Fica registrado no certificado com a OS."
          acoes={
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={f.reparo.houve}
                onChange={(e) => setReparo('houve', e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Houve reparo
            </label>
          }
        />
        <div className={cn('grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2', !f.reparo.houve && 'hidden')}>
          <Field label="Serviço realizado" htmlFor="k-rep" className="sm:col-span-2">
            <Input
              id="k-rep"
              value={f.reparo.descricao}
              onChange={(e) => setReparo('descricao', e.target.value)}
              placeholder="Ex.: troca da célula de carga"
            />
          </Field>
          <Field label="Marca de reparo nº" htmlFor="k-marca">
            <Input id="k-marca" value={f.reparo.marcaReparo} onChange={(e) => setReparo('marcaReparo', e.target.value)} />
          </Field>
          <Field label="Selos retirados" htmlFor="k-selos-r">
            <Input id="k-selos-r" value={f.reparo.selosRetirados} onChange={(e) => setReparo('selosRetirados', e.target.value)} />
          </Field>
          <Field label="Selos colocados" htmlFor="k-selos-c" className="sm:col-span-2">
            <Input id="k-selos-c" value={f.reparo.selosColocados} onChange={(e) => setReparo('selosColocados', e.target.value)} />
          </Field>
        </div>
      </Card>
    </div>
  )
}

/**
 * "6/15/33 kg × 2/5/10 g" sem deixar a unidade sozinha na linha de baixo: se não couber, quebra no " × ".
 */
function SemQuebrarUnidade({ texto }: { texto: string }) {
  const partes = texto.split(' × ')
  return partes.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && ' × '}
      <span className="whitespace-nowrap">{p}</span>
    </Fragment>
  ))
}
