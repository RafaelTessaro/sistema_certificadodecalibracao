import { History, Pencil, Scale, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import {
  AJUSTES,
  AJUSTES_DA_CALIBRACAO,
  capacidadeTexto,
  divisaoLegivel,
  LIMITES,
  numeroBr,
  parteSeparada,
  RECEPTORES,
  registroAnterior,
  ROTULO_CLASSE,
  semRegistroAnterior,
  TIPOS_BALANCA,
} from '#shared/dominio.ts'
import type { CalibracaoInput } from '#shared/tipos.ts'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { confirmar } from '../ui/Feedback'
import { Field, Input } from '../ui/Form'
import { Segmented } from '../ui/Misc'
import type { ContextoEtapa } from './contexto'
import { Info } from './EtapaIdentificacao'
import { type MarcaCampo, marcasDaEtapa } from './obrigatorios'
import { pedeAjusteInterno } from './util'

export function EtapaInstrumento(ctx: ContextoEtapa) {
  const { f, alterar, balanca, editarBalanca } = ctx
  const { marca } = marcasDaEtapa(ctx)
  // Sem nº de série nem TAG (nem a série da plataforma), não emite (POP 7.3): a marca nos dois e o aviso de como resolver
  const semIdentificacao = marca('identificacaoBalanca').obrigatorio
  // Ajuste externo, "como encontrado", reparo e verificação preliminar "não": só nos registros de antes do POP
  const anterior = registroAnterior(f)
  const ajusteAnterior = !!anterior && (anterior.ajusteExterno || anterior.comoEncontrado)
  const setAjuste = (realizado: 'NAO' | 'INTERNO') =>
    alterar((s) => ({
      ...s,
      ajuste: { realizado, descricao: realizado === 'NAO' ? '' : s.ajuste.descricao },
      // Sem "como encontrado" (POP 7.8); o vazio que a tela de antes criava ao escolher um ajuste sai junto
      comoEncontrado: null,
    }))
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
            <Info
              rotulo={separada?.rotulo === 'Indicador' ? 'Nº de série' : 'Nº de série (indicador)'}
              obrigatorio={semIdentificacao}
            >
              {balanca.numeroSerie}
            </Info>
            <Info rotulo="Identificação / TAG" obrigatorio={semIdentificacao}>
              {balanca.identificacao}
            </Info>
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
            <Info rotulo="Local de instalação" className="col-span-2">
              {balanca.localInstalacao}
            </Info>
          </div>
          {semIdentificacao && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Sem nº de série nem TAG, o certificado não pode ser emitido: ele precisa identificar a balança (POP 7.3). Clique
                em “Corrigir cadastro” e informe o nº de série da plaqueta ou a identificação no cliente (TAG, patrimônio).
              </span>
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          icone={<SlidersHorizontal className="h-4 w-4" />}
          titulo="Ajuste"
          descricao="A calibração não inclui ajuste. Só conta o ajuste interno (CAL) feito antes dos ensaios."
        />
        <div className="flex flex-col gap-4 px-5 pb-5">
          {ajusteAnterior ? (
            <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
              <b className="font-medium text-ink">{rotuloAjuste(f.ajuste.realizado)}</b>, como foi registrado antes. Veja o cartão
              “Registro de versão anterior”.
            </p>
          ) : (
            <>
              <Segmented
                valor={f.ajuste.realizado === 'INTERNO' ? 'INTERNO' : 'NAO'}
                aoMudar={setAjuste}
                opcoes={AJUSTES_DA_CALIBRACAO.map((a) => ({ valor: a.valor, label: a.label }))}
              />
              {f.ajuste.realizado === 'NAO' && pedeAjusteInterno(balanca) && (
                <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
                  {balanca.classe === 'I' ? 'Classe I' : 'Divisão menor que Max/100 000'}: o cliente faz o ajuste interno (CAL)
                  antes dos ensaios, se a balança tiver (POP 7.11). Se fez, marque acima.
                </p>
              )}
              {f.ajuste.realizado === 'INTERNO' && (
                <>
                  <Field label="Observação" htmlFor="k-ajuste" hint="Sai no certificado, entre parênteses." opcional>
                    <Input
                      id="k-ajuste"
                      value={f.ajuste.descricao}
                      maxLength={LIMITES.texto}
                      onChange={(ev) => alterar((s) => ({ ...s, ajuste: { ...s.ajuste, descricao: ev.target.value } }))}
                      placeholder="Ex.: função CAL feita pelo cliente"
                    />
                  </Field>
                  <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
                    O certificado informa o ajuste interno feito antes da calibração; os resultados são os de depois dele.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </Card>

      {anterior && <RegistroDeAntes f={f} alterar={alterar} marcaAjuste={marca('ajusteDescricao')} />}
    </div>
  )
}

/** Rótulo do ajuste: o da etapa (`AJUSTES_DA_CALIBRACAO`) ou, no externo, o de antes. */
const rotuloAjuste = (a: CalibracaoInput['ajuste']['realizado']) =>
  AJUSTES_DA_CALIBRACAO.find((x) => x.valor === a)?.label ?? AJUSTES[a]

/**
 * Registro de antes do POP (`registroAnterior`): o ajuste externo, o "como encontrado", o reparo e a verificação
 * preliminar com item "não" ficam só para conferência e saem no certificado como antes. "Tirar do registro" deixa
 * a calibração como uma nova (`semRegistroAnterior`).
 */
export function RegistroDeAntes({
  f,
  alterar,
  marcaAjuste,
}: Pick<ContextoEtapa, 'f' | 'alterar'> & {
  /** A marca do texto do ajuste externo (obrigatório para emitir). */
  marcaAjuste?: MarcaCampo
}) {
  const r = registroAnterior(f)
  if (!r) return null
  const pontos = f.comoEncontrado?.pontos.filter((p) => p.crescente !== null || p.decrescente !== null).length ?? 0
  const rep = f.reparo
  const tirar = async () => {
    const ok = await confirmar({
      titulo: 'Tirar os dados da versão anterior?',
      descricao:
        'Saem desta calibração e do certificado: o ajuste externo, as leituras “como encontrado”, o reparo e os itens não atendidos da verificação preliminar. O ajuste interno, se marcado, continua.',
      confirmar: 'Tirar do registro',
      perigo: true,
    })
    if (ok) alterar((s: CalibracaoInput) => semRegistroAnterior(s))
  }
  return (
    <Card>
      <CardHeader
        icone={<History className="h-4 w-4" />}
        titulo="Registro de versão anterior"
        descricao="Gravado antes do POP atual: fica só para conferência e sai no certificado como antes."
      />
      <ul className="divide-y divide-line border-t border-line text-sm">
        {r.ajusteExterno && (
          <li className="flex flex-col gap-2 px-5 py-3">
            <ItemAnterior rotulo="Ajuste">{AJUSTES.EXTERNO}</ItemAnterior>
            {/* O texto do ajuste externo é pedido para emitir: continua editável */}
            <Field label="Como foi o ajuste" htmlFor="k-ajuste-anterior" {...marcaAjuste}>
              <Input
                id="k-ajuste-anterior"
                value={f.ajuste.descricao}
                maxLength={LIMITES.texto}
                onChange={(ev) => alterar((s) => ({ ...s, ajuste: { ...s.ajuste, descricao: ev.target.value } }))}
              />
            </Field>
          </li>
        )}
        {r.comoEncontrado && (
          <li className="px-5 py-3">
            <ItemAnterior rotulo="“Como encontrado”">
              Leituras antes do ajuste em {pontos} {pontos === 1 ? 'ponto' : 'pontos'}: na etapa Erro de indicação, aba “Antes do
              ajuste”.
            </ItemAnterior>
          </li>
        )}
        {r.reparo && (
          <li className="px-5 py-3">
            <ItemAnterior rotulo="Reparo">
              {[
                rep.descricao.trim() || 'Houve reparo',
                rep.marcaReparo.trim() && `marca de reparo nº ${rep.marcaReparo.trim()}`,
                rep.selosRetirados.trim() && `selos retirados: ${rep.selosRetirados.trim()}`,
                rep.selosColocados.trim() && `selos colocados: ${rep.selosColocados.trim()}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ItemAnterior>
          </li>
        )}
        {r.preliminar.length > 0 && (
          <li className="px-5 py-3">
            <ItemAnterior rotulo="Verificação preliminar">Não atendido: {r.preliminar.join(', ')}.</ItemAnterior>
          </li>
        )}
      </ul>
      {/* A ação no rodapé do cartão: no celular, o título e a descrição ficam com a largura toda */}
      <div className="flex flex-col gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Para seguir o POP nesta calibração, tire estes dados do registro.</p>
        <Button tamanho="sm" className="self-start sm:self-auto" onClick={() => void tirar()}>
          Tirar do registro
        </Button>
      </div>
    </Card>
  )
}

function ItemAnterior({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="shrink-0 text-xs font-medium text-muted sm:w-40 sm:pt-0.5">{rotulo}</span>
      <span className="min-w-0 break-words text-ink-2">{children}</span>
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
