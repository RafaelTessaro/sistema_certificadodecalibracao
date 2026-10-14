import { BellRing, ChevronDown, FileText, Scale3d, Settings2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { CRITERIOS_EMA, REGRAS_DECISAO, somarMeses, termosSensiveis } from '#shared/dominio.ts'
import type { CriterioEma, OpcoesCalculo, RegraDecisao } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { Card, CardHeader } from '../ui/Card'
import { Field, Input, Select, Textarea } from '../ui/Form'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'

export function EtapaConclusao({ f, alterar, balanca, config }: ContextoEtapa) {
  const conf = f.conformidade
  const setConf = <K extends keyof typeof conf>(k: K, v: (typeof conf)[K]) =>
    alterar((s) => ({ ...s, conformidade: { ...s.conformidade, [k]: v } }))
  const avisosObs = termosSensiveis(`${f.observacoes}\n${f.opinioes}`)
  const semClasse = !balanca.classe && conf.criterio !== 'CLIENTE'
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={<Scale3d className="h-4 w-4" />}
          titulo="Declaração de conformidade"
          descricao="Só quando o cliente pediu: diz se os erros ficaram dentro de um limite, com a regra de decisão."
          acoes={
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={conf.solicitada}
                onChange={(e) => setConf('solicitada', e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              O cliente pediu
            </label>
          }
        />
        {conf.solicitada && (
          <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Limite (erro máximo admissível)" htmlFor="conf-crit" hint={CRITERIOS_EMA[conf.criterio].descricao}>
              <Select id="conf-crit" value={conf.criterio} onChange={(e) => setConf('criterio', e.target.value as CriterioEma)}>
                {(Object.keys(CRITERIOS_EMA) as CriterioEma[]).map((c) => (
                  <option key={c} value={c}>
                    {CRITERIOS_EMA[c].label}
                  </option>
                ))}
              </Select>
            </Field>
            {conf.criterio === 'CLIENTE' ? (
              <Field label="Tolerância do cliente (±)" htmlFor="conf-tol">
                <CampoNumero
                  id="conf-tol"
                  valor={conf.toleranciaCliente || null}
                  aoMudar={(v) => setConf('toleranciaCliente', v ?? 0)}
                  unidade={balanca.unidade}
                />
              </Field>
            ) : (
              <div />
            )}
            <Field label="Regra de decisão" htmlFor="conf-regra" className="sm:col-span-2" hint={REGRAS_DECISAO[conf.regra].descricao}>
              <Select id="conf-regra" value={conf.regra} onChange={(e) => setConf('regra', e.target.value as RegraDecisao)}>
                {(Object.keys(REGRAS_DECISAO) as RegraDecisao[]).map((r) => (
                  <option key={r} value={r}>
                    {REGRAS_DECISAO[r].label}
                  </option>
                ))}
              </Select>
            </Field>
            {semClasse && (
              <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning sm:col-span-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                A balança está sem classe de exatidão no cadastro. Corrija o cadastro ou use a tolerância do cliente.
              </p>
            )}
            <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2 sm:col-span-2">
              O certificado informa que esta declaração não equivale à verificação metrológica do Inmetro/IPEM.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          icone={<BellRing className="h-4 w-4" />}
          titulo="Próxima calibração"
          descricao="Lembrete interno para avisar o cliente. Só sai no certificado se o cliente pedir (ISO/IEC 17025, 7.8.4.3)."
        />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Data" htmlFor="k-prox" className="w-48">
              <Input id="k-prox" type="date" value={f.proximaCalibracao} onChange={(e) => alterar((s) => ({ ...s, proximaCalibracao: e.target.value }))} />
            </Field>
            {[6, 12, 24].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => alterar((s) => ({ ...s, proximaCalibracao: somarMeses(s.dataCalibracao, m) }))}
                disabled={!f.dataCalibracao}
                className="h-10 cursor-pointer rounded-xl border border-line px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface-2"
              >
                +{m} meses
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={f.proximaNoCertificado}
              onChange={(e) => alterar((s) => ({ ...s, proximaNoCertificado: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span className="text-sm">
              <span className="block font-medium text-ink-2">O cliente pediu para a data constar no certificado</span>
              <span className="block text-xs text-muted">
                Sem isso, o certificado diz que a periodicidade é definida pelo cliente (é o recomendado).
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader icone={<FileText className="h-4 w-4" />} titulo="Observações do certificado" />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Field
            label="Observações"
            htmlFor="k-obs"
            hint={config.textos.observacoesPadrao ? 'As observações padrão (Configurações) também saem.' : 'Saem no certificado.'}
          >
            <Textarea
              id="k-obs"
              value={f.observacoes}
              onChange={(e) => alterar((s) => ({ ...s, observacoes: e.target.value }))}
              placeholder="Ex.: calibração realizada na faixa de 0 a 150 kg, a pedido do cliente."
            />
          </Field>
          <Field
            label="Opiniões e interpretações (opcional)"
            htmlFor="k-opi"
            hint="Separadas dos resultados no certificado, como pede a ISO/IEC 17025 (7.8.7)."
          >
            <Textarea
              id="k-opi"
              value={f.opinioes}
              onChange={(e) => alterar((s) => ({ ...s, opinioes: e.target.value }))}
              placeholder="Ex.: recomenda-se a verificação da célula de carga na próxima manutenção."
            />
          </Field>
          {avisosObs.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              {avisosObs.map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <OpcoesAvancadas opcoes={f.opcoes} aoMudar={(o) => alterar((s) => ({ ...s, opcoes: o }))} />
    </div>
  )
}

function OpcoesAvancadas({ opcoes, aoMudar }: { opcoes: OpcoesCalculo; aoMudar: (o: OpcoesCalculo) => void }) {
  const [aberto, setAberto] = useState(false)
  const set = <K extends keyof OpcoesCalculo>(k: K, v: OpcoesCalculo[K]) => aoMudar({ ...opcoes, [k]: v })
  return (
    <Card>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left"
        aria-expanded={aberto}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
          <Settings2 className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold text-ink">Opções do cálculo da incerteza</span>
          <span className="block text-[13px] text-muted">Padrão da empresa (Configurações). Mude só se souber o motivo.</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="grid grid-cols-1 gap-4 border-t border-line px-5 py-5 sm:grid-cols-2">
          <Field label="Empuxo do ar" htmlFor="op-emp">
            <Select id="op-emp" value={opcoes.empuxo} onChange={(e) => set('empuxo', e.target.value as OpcoesCalculo['empuxo'])}>
              <option value="NAO_AJUSTADO">Balança não ajustada antes (recomendado)</option>
              <option value="AJUSTADO">Balança ajustada logo antes</option>
              <option value="DELTA_T">Com a variação de temperatura do local</option>
              <option value="NENHUM">Não considerar</option>
            </Select>
          </Field>
          {opcoes.empuxo === 'DELTA_T' && (
            <Field label="Variação de temperatura no local (K)" htmlFor="op-dt">
              <CampoNumero id="op-dt" valor={opcoes.deltaTLocal} aoMudar={(v) => set('deltaTLocal', v ?? 0)} unidade="K" />
            </Field>
          )}
          <Field label="Deriva dos pesos" htmlFor="op-der">
            <Select id="op-der" value={opcoes.deriva} onChange={(e) => set('deriva', e.target.value as OpcoesCalculo['deriva'])}>
              <option value="EMA">Erro máximo da classe (sem histórico)</option>
              <option value="KD">kD × incerteza do certificado</option>
            </Select>
          </Field>
          {opcoes.deriva === 'KD' && (
            <Field label="kD (1 a 3)" htmlFor="op-kd">
              <CampoNumero id="op-kd" valor={opcoes.kD} aoMudar={(v) => set('kD', v ?? 1)} />
            </Field>
          )}
          <Field label="Fator de abrangência (k)" htmlFor="op-k">
            <Select id="op-k" value={opcoes.metodoK} onChange={(e) => set('metodoK', e.target.value as OpcoesCalculo['metodoK'])}>
              <option value="T_EXATO">t de Student pelos graus de liberdade (recomendado)</option>
              <option value="TABELA">Tabela G.2 do GUM</option>
              <option value="K2">k = 2 fixo</option>
            </Select>
          </Field>
          <Field label="Subida e descida" htmlFor="op-hist">
            <Select id="op-hist" value={opcoes.histerese} onChange={(e) => set('histerese', e.target.value as OpcoesCalculo['histerese'])}>
              <option value="SEPARADO">Erros separados (recomendado)</option>
              <option value="MEDIA">Um erro pela média, com a histerese na incerteza</option>
            </Select>
          </Field>
          <Field label="Divisão usada nas leituras (modo serviço)" htmlFor="op-dteste" hint="0 = a divisão normal da balança.">
            <CampoNumero id="op-dteste" valor={opcoes.divisaoTeste || null} aoMudar={(v) => set('divisaoTeste', v ?? 0)} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 self-end pb-2">
            <input
              type="checkbox"
              checked={opcoes.excentricidade}
              onChange={(e) => set('excentricidade', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span className="text-sm text-ink-2">Incluir a excentricidade na incerteza de cada ponto</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 self-end pb-2">
            <input
              type="checkbox"
              checked={opcoes.zeroAprovado}
              onChange={(e) => set('zeroAprovado', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span className="text-sm text-ink-2">Balança aprovada com zero automático (resolução no zero d/4√3)</span>
          </label>
        </div>
      )}
    </Card>
  )
}
