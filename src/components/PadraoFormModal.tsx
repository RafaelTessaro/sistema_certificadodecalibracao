import { ChevronDown, Gauge, ListPlus, Plus, Thermometer, Trash2, TriangleAlert, Weight, Wrench, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { GRAMAS } from '#shared/calibracao.ts'
import {
  CLASSES_PESO,
  dataIsoValida,
  LIMITES,
  massaLegivel,
  normalizarPadrao,
  numero,
  numeroBr,
  PADRAO_VAZIO,
  somarMeses,
} from '#shared/dominio.ts'
import { novoId } from '#shared/id.ts'
import { emaPeso } from '#shared/metrologia/index.ts'
import type { ClassePeso, Padrao, PadraoInput, PesoPadrao, TipoPadrao, UsoPesos } from '#shared/tipos.ts'
import { api, ErroApi } from '../lib/api'
import { cn } from '../lib/cn'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { CampoNumerico, LinhaInterruptor, SecaoFormulario } from './BalancaFormModal'
import { ValidadePadraoBadge } from './Selos'
import { Button } from './ui/Button'
import { Field, Input, Select, Textarea } from './ui/Form'
import { Segmented } from './ui/Misc'
import { Modal } from './ui/Modal'

const ICONES: Record<TipoPadrao, typeof Weight> = { PESOS: Weight, TERMOHIGROMETRO: Thermometer, BAROMETRO: Gauge, OUTRO: Wrench }

/** Ícone de cada tipo de padrão (pesos, termo-higrômetro, barômetro, outro). */
export function IconePadrao({ tipo, className }: { tipo: TipoPadrao; className?: string }) {
  const Icone = ICONES[tipo] ?? Wrench
  return <Icone className={className} />
}

const ROTULO_TIPO: Record<TipoPadrao, string> = {
  PESOS: 'Pesos padrão',
  TERMOHIGROMETRO: 'Termo-higrômetro',
  BAROMETRO: 'Barômetro',
  OUTRO: 'Outro',
}
const EXEMPLO_CODIGO: Record<TipoPadrao, string> = {
  PESOS: 'JP-01',
  TERMOHIGROMETRO: 'TH-01',
  BAROMETRO: 'BR-01',
  OUTRO: 'PD-01',
}
const EXEMPLO_DESCRICAO: Record<TipoPadrao, string> = {
  PESOS: 'Ex.: Jogo de pesos de 1 kg a 20 kg',
  TERMOHIGROMETRO: 'Ex.: Termo-higrômetro digital',
  BAROMETRO: 'Ex.: Barômetro digital',
  OUTRO: 'Ex.: Termômetro de vareta',
}
const MATERIAIS = ['Aço inoxidável', 'Ferro fundido', 'Latão', 'Latão cromado']

type UnidadePeso = 'mg' | 'g' | 'kg'
const UNIDADES_PESO: UnidadePeso[] = ['mg', 'g', 'kg']

// ---- Estado do formulário --------------------------------------------------------------

/** Peça como digitada (texto). O nominal é gravado sempre em gramas; a unidade é só da tela. */
interface PesoTexto {
  id: string
  marca: string
  nominal: string
  unidade: UnidadePeso
  correcao: string
  incerteza: string
  k: string
}

type FormPadrao = Omit<PadraoInput, 'pesos' | 'densidade'> & { pesos: PesoTexto[]; densidade: string }

/** Número para o campo de texto (vírgula decimal, sem ruído binário). `zero` mostra o 0 em vez de vazio. */
function textoDe(n: number, zero = false): string {
  if (!Number.isFinite(n) || (n === 0 && !zero)) return ''
  return Number(n.toPrecision(12)).toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 12 })
}
const lerCampo = (t: string) => (t.trim() ? numero(t) : 0)
const campoInvalido = (t: string) => t.trim() !== '' && Number.isNaN(numero(t))

const unidadeDe = (gramas: number): UnidadePeso => (gramas >= 1000 ? 'kg' : gramas >= 1 ? 'g' : 'mg')
const paraGramas = (valor: number, u: UnidadePeso) => Number((valor * GRAMAS[u]).toPrecision(12))
const gramasDe = (p: PesoTexto) => paraGramas(lerCampo(p.nominal), p.unidade)

function pesoParaTexto(p: PesoPadrao): PesoTexto {
  const unidade = unidadeDe(p.nominal)
  return {
    id: p.id,
    marca: p.marca,
    nominal: textoDe(p.nominal / GRAMAS[unidade]),
    unidade,
    // Correção 0 com incerteza preenchida é um valor do certificado (não "em branco")
    correcao: textoDe(p.correcao, p.incerteza > 0),
    incerteza: textoDe(p.incerteza),
    k: textoDe(p.k),
  }
}

function formularioInicial(padrao?: Padrao, modelo?: PadraoInput): FormPadrao {
  let base: PadraoInput
  if (padrao) {
    const { id: _i, versao: _v, criadoEm: _c, atualizadoEm: _a, ...resto } = padrao
    base = { ...PADRAO_VAZIO, ...resto }
  } else base = { ...PADRAO_VAZIO, ...modelo }
  return { ...base, pesos: base.pesos.map(pesoParaTexto), densidade: textoDe(base.densidade) }
}

/** O que vai para o servidor: o que não pertence ao tipo escolhido não é gravado. */
function paraEntrada(f: FormPadrao): PadraoInput {
  const { pesos, densidade, ...resto } = f
  const ehPesos = f.tipo === 'PESOS'
  return {
    ...resto,
    classe: ehPesos ? f.classe : '',
    material: ehPesos ? f.material : '',
    densidade: ehPesos ? lerCampo(densidade) : 0,
    pesos: ehPesos
      ? pesos.map((p) => ({
          id: p.id,
          marca: p.marca.trim(),
          nominal: gramasDe(p),
          correcao: lerCampo(p.correcao),
          incerteza: lerCampo(p.incerteza),
          k: lerCampo(p.k) || 2,
        }))
      : [],
    incertezaTexto: ehPesos ? '' : f.incertezaTexto,
  }
}

/** Situação de uma peça frente à classe (OIML R111): U ≤ EMA/3 e |correção| ≤ EMA − U. */
function conferirPeca(p: PesoTexto, classe: ClassePeso | '') {
  const g = gramasDe(p)
  const ema = g > 0 && classe ? emaPeso(g, classe) : null
  const u = lerCampo(p.incerteza)
  const c = lerCampo(p.correcao)
  const uAlta = ema !== null && u > 0 && u > ema / 3 + 1e-9
  // Correção em branco conta como 0; aí só a incerteza decide (aviso acima)
  const correcaoAlta = ema !== null && p.correcao.trim() !== '' && !Number.isNaN(c) && Math.abs(c) > ema - u + 1e-9
  return { gramas: g, ema, u, c, uAlta, correcaoAlta }
}

/** Descrição sugerida para o jogo: "Jogo de pesos de 1 kg a 20 kg (8 peças)". */
function descricaoSugerida(gramas: number[]): string {
  const validos = gramas.filter((g) => g > 0)
  if (!validos.length) return ''
  const menor = Math.min(...validos)
  const maior = Math.max(...validos)
  if (validos.length === 1) return `Peso de ${massaLegivel(maior)}`
  if (menor === maior) return `Jogo de ${validos.length} pesos de ${massaLegivel(maior)}`
  return `Jogo de pesos de ${massaLegivel(menor)} a ${massaLegivel(maior)} (${validos.length} peças)`
}

// ---- "Adicionar várias peças" -------------------------------------------------------------

interface Leitura {
  /** Nominais em gramas, na ordem digitada (repetições expandidas). */
  gramas: number[]
  naoEntendidos: string[]
}

/** Uma parte da lista ("20 kg x2"): os nominais em gramas e a unidade usada, ou `null` se não deu para entender. */
function lerParte(parte: string, unidadeAnterior: UnidadePeso | null): { gramas: number[]; unidade: UnidadePeso } | null {
  const s = parte.trim().toLowerCase().replace(/\s+/g, ' ')
  const m = s.match(/^(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(mg|g|kg)?(?:\s*[x×*]\s*(\d+))?$/)
  if (!m) return null
  const unidade = (m[3] as UnidadePeso | undefined) ?? unidadeAnterior
  const valor = numero(m[2])
  const vezes = Number(m[1] ?? m[4] ?? 1)
  if (!unidade || !(valor > 0) || !(vezes >= 1 && vezes <= 50)) return null
  return { gramas: Array.from({ length: vezes }, () => paraGramas(valor, unidade)), unidade }
}

/**
 * Lê uma lista como "20 kg x2, 10 kg, 5 kg, 2 kg x2, 500 g, 3x 200 mg". Sem unidade, vale a da peça
 * anterior. A vírgula decimal ("0,5 g") é aceita: só separa a vírgula que não vem antes de um algarismo
 * (e, se a parte não fizer sentido como decimal, como em "x2,10 kg", tenta separar nela também).
 */
function lerListaPecas(texto: string): Leitura {
  const gramas: number[] = []
  const naoEntendidos: string[] = []
  let unidade: UnidadePeso | null = null
  for (const parte of texto.split(/[;\n]|,(?!\d)/)) {
    if (!parte.trim()) continue
    let lidas = lerParte(parte, unidade)
    if (!lidas && parte.includes(',')) {
      // "2 kg x2,10 kg": tenta cada pedaço; só aceita se todos fizerem sentido
      let u: UnidadePeso | null = unidade
      const pedacos: number[] = []
      for (const sub of parte.split(',')) {
        const r = lerParte(sub, u)
        if (!r) {
          pedacos.length = 0
          u = null
          break
        }
        pedacos.push(...r.gramas)
        u = r.unidade
      }
      if (pedacos.length && u) lidas = { gramas: pedacos, unidade: u }
    }
    if (!lidas) {
      naoEntendidos.push(parte.trim())
      continue
    }
    unidade = lidas.unidade
    gramas.push(...lidas.gramas)
  }
  return { gramas, naoEntendidos }
}

/**
 * Marcas automáticas: "10 kg" para peça única; "20 kg nº1", "20 kg nº2"… quando o valor se repete
 * (inclusive com as peças que já estão na tabela).
 */
function comMarcas(existentes: PesoTexto[], novas: number[]): { existentes: PesoTexto[]; novas: PesoTexto[] } {
  const total = new Map<number, number>()
  for (const g of [...existentes.map(gramasDe), ...novas]) total.set(g, (total.get(g) ?? 0) + 1)
  const usados = new Map<number, number>()
  for (const p of existentes) usados.set(gramasDe(p), (usados.get(gramasDe(p)) ?? 0) + 1)
  // Peça já existente com a marca automática simples ("10 kg") vira "10 kg nº1" quando chega outra igual
  const ajustadas = existentes.map((p) => {
    const g = gramasDe(p)
    return (total.get(g) ?? 0) > 1 && p.marca.trim() === massaLegivel(g) ? { ...p, marca: `${massaLegivel(g)} nº1` } : p
  })
  const criadas = novas.map((g) => {
    const n = (usados.get(g) ?? 0) + 1
    usados.set(g, n)
    const unidade = unidadeDe(g)
    return {
      id: novoId(),
      marca: (total.get(g) ?? 0) > 1 ? `${massaLegivel(g)} nº${n}` : massaLegivel(g),
      nominal: textoDe(g / GRAMAS[unidade]),
      unidade,
      correcao: '',
      incerteza: '',
      k: '2',
    }
  })
  return { existentes: ajustadas, novas: criadas }
}

// ---- Modal --------------------------------------------------------------------------------

export function PadraoFormModal({
  aberto,
  aoFechar,
  padrao: padraoAtual,
  modelo: modeloAtual,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  padrao?: Padrao
  /** Dados iniciais de um padrão novo (ex.: "duplicar como novo"); `de` é a identificação de origem. */
  modelo?: { dados: PadraoInput; de: string }
  aoSalvar?: (p: Padrao) => void
}) {
  const [salvando, setSalvando] = useState(false)
  // Enquanto a janela se fecha, continua mostrando o padrão de antes (a página pode já ter limpado)
  const [ultimos, setUltimos] = useState({ padrao: padraoAtual, modelo: modeloAtual })
  if (aberto && (ultimos.padrao?.id !== padraoAtual?.id || ultimos.modelo?.de !== modeloAtual?.de))
    setUltimos({ padrao: padraoAtual, modelo: modeloAtual })
  const padrao = aberto ? padraoAtual : ultimos.padrao
  const modelo = aberto ? modeloAtual : ultimos.modelo
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-3xl"
      icone={<Weight className="h-5 w-5" />}
      titulo={padrao ? `Editar ${padrao.identificacao}` : modelo ? `Novo padrão a partir de ${modelo.de}` : 'Novo padrão'}
      descricao={
        modelo
          ? 'Confira a identificação, o certificado e a correção de cada peça: eles mudam de um jogo para outro.'
          : 'Pesos e instrumentos da empresa, com os dados do certificado de calibração deles.'
      }
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variante="primary" type="submit" form="form-padrao" disabled={salvando}>
            {salvando ? 'Salvando…' : padrao ? 'Salvar alterações' : 'Cadastrar padrão'}
          </Button>
        </>
      }
    >
      <FormularioPadrao
        key={padrao?.id ?? (modelo ? `copia-${modelo.de}` : 'novo')}
        padrao={padrao}
        modelo={modelo?.dados}
        aoSalvar={aoSalvar}
        aoFechar={aoFechar}
        setSalvando={setSalvando}
      />
    </Modal>
  )
}

function FormularioPadrao({
  padrao,
  modelo,
  aoSalvar,
  aoFechar,
  setSalvando,
}: {
  padrao?: Padrao
  modelo?: PadraoInput
  aoSalvar?: (p: Padrao) => void
  aoFechar: () => void
  setSalvando: (v: boolean) => void
}) {
  const ids = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const identRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState<FormPadrao>(() => formularioInicial(padrao, modelo))
  const [versaoBase, setVersaoBase] = useState(padrao?.versao)
  const [tentou, setTentou] = useState(false)
  /** Erro do servidor na identificação (código já usado por outro padrão). */
  const [erroIdentServidor, setErroIdentServidor] = useState<{ codigo: string; mensagem: string } | null>(null)

  const set = <K extends keyof FormPadrao>(k: K, v: FormPadrao[K]) => setF((s) => ({ ...s, [k]: v }))
  const ehPesos = f.tipo === 'PESOS'

  // ---- Derivados ----
  const { valor, erros } = normalizarPadrao(paraEntrada(f))
  const conferencias = f.pesos.map((p) => conferirPeca(p, f.classe))
  const numerosInvalidos =
    campoInvalido(f.densidade) || f.pesos.some((p) => [p.nominal, p.correcao, p.incerteza, p.k].some(campoInvalido))
  const erroIdent =
    erros.find((e) => /identifica/i.test(e)) ??
    (erroIdentServidor && erroIdentServidor.codigo === f.identificacao.trim() ? erroIdentServidor.mensagem : undefined)
  const erroPesos = ehPesos ? erros.find((e) => /peça|peças/i.test(e)) : undefined
  const erroValidade = erros.find((e) => /próxima calibração/i.test(e))
  const sugestao = ehPesos && !f.descricao.trim() ? descricaoSugerida(conferencias.map((c) => c.gramas)) : ''

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (erros.length || (numerosInvalidos && ehPesos)) {
      if (numerosInvalidos && ehPesos) toast.erro('Confira os números', 'Use só algarismos e vírgula, como 0,25.')
      else {
        const escondido = erros.find((x) => x !== erroIdent && x !== erroPesos && x !== erroValidade)
        if (escondido) toast.erro('Confira o cadastro', escondido)
      }
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSalvando(true)
    try {
      const r = padrao ? await api.atualizarPadrao(padrao.id, valor, versaoBase) : await api.criarPadrao(valor)
      useTempoReal.getState().mudou('padrao')
      toast.sucesso(
        padrao ? 'Padrão atualizado' : 'Padrão cadastrado',
        [r.padrao.identificacao, r.padrao.descricao].filter(Boolean).join(' · '),
      )
      setVersaoBase(r.padrao.versao)
      aoSalvar?.(r.padrao)
      aoFechar()
    } catch (err) {
      // Código já usado: o aviso fica no próprio campo
      if (err instanceof ErroApi && err.status === 409 && /identifica/i.test(err.message)) {
        setErroIdentServidor({ codigo: f.identificacao.trim(), mensagem: err.message })
        requestAnimationFrame(() => identRef.current?.focus())
      } else avisarErro('Não foi possível salvar o padrão', err)
    } finally {
      setSalvando(false)
    }
  }

  const dataCalOk = dataIsoValida(f.dataCalibracao)

  return (
    <form id="form-padrao" ref={formRef} onSubmit={salvar} className="flex flex-col gap-7 pb-1" noValidate>
      <Field label="Tipo de padrão">
        <Segmented
          valor={f.tipo}
          aoMudar={(t) => set('tipo', t)}
          opcoes={(Object.keys(ROTULO_TIPO) as TipoPadrao[]).map((t) => ({
            valor: t,
            label: (
              <span className="flex items-center gap-1.5">
                <IconePadrao tipo={t} className="h-3.5 w-3.5" />
                {ROTULO_TIPO[t]}
              </span>
            ),
          }))}
          className="self-start"
        />
      </Field>

      {/* ---- Identificação ---- */}
      <SecaoFormulario titulo="Identificação">
        <Field
          label="Identificação"
          htmlFor={`${ids}-ident`}
          className="sm:col-span-2"
          erro={tentou || erroIdentServidor ? erroIdent : null}
          hint="Código único, usado para escolher o padrão na calibração."
        >
          <Input
            ref={identRef}
            id={`${ids}-ident`}
            className={cn('tnum font-medium', (tentou || erroIdentServidor) && erroIdent && 'border-danger!')}
            aria-invalid={(tentou || !!erroIdentServidor) && !!erroIdent ? true : undefined}
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus={!padrao}
            value={f.identificacao}
            onChange={(e) => set('identificacao', e.target.value)}
            placeholder={`Ex.: ${EXEMPLO_CODIGO[f.tipo]}`}
          />
        </Field>
        <Field
          label="Descrição"
          htmlFor={`${ids}-desc`}
          className="sm:col-span-4"
          hint={
            sugestao ? (
              <button
                type="button"
                onClick={() => set('descricao', sugestao)}
                className="cursor-pointer text-left text-brand-ink hover:underline"
              >
                Usar “{sugestao}”
              </button>
            ) : undefined
          }
        >
          <Input
            id={`${ids}-desc`}
            value={f.descricao}
            onChange={(e) => set('descricao', e.target.value)}
            placeholder={EXEMPLO_DESCRICAO[f.tipo]}
          />
        </Field>
        <Field label="Fabricante" htmlFor={`${ids}-fab`} className="sm:col-span-2">
          <Input
            id={`${ids}-fab`}
            value={f.fabricante}
            onChange={(e) => set('fabricante', e.target.value)}
            placeholder="Opcional"
          />
        </Field>
        <Field label="Modelo" htmlFor={`${ids}-mod`} className="sm:col-span-2">
          <Input id={`${ids}-mod`} value={f.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Opcional" />
        </Field>
        <Field label="Nº de série" htmlFor={`${ids}-serie`} className="sm:col-span-2">
          <Input
            id={`${ids}-serie`}
            className="tnum"
            autoComplete="off"
            value={f.numeroSerie}
            onChange={(e) => set('numeroSerie', e.target.value)}
            placeholder="Opcional"
          />
        </Field>
      </SecaoFormulario>

      {/* ---- Certificado do padrão ---- */}
      <SecaoFormulario titulo="Certificado de calibração do padrão">
        <Field label="Nº do certificado" htmlFor={`${ids}-cert`} className="sm:col-span-2" hint="Sai no certificado da balança.">
          <Input
            id={`${ids}-cert`}
            className="tnum"
            autoComplete="off"
            value={f.certificado}
            onChange={(e) => set('certificado', e.target.value)}
            placeholder="Ex.: 12345/26"
          />
        </Field>
        <Field label="Laboratório" htmlFor={`${ids}-lab`} className="sm:col-span-2">
          <Input
            id={`${ids}-lab`}
            value={f.laboratorio}
            onChange={(e) => set('laboratorio', e.target.value)}
            placeholder="Quem calibrou o padrão"
          />
        </Field>
        <Field label="Acreditação" htmlFor={`${ids}-acred`} className="sm:col-span-2" hint="Nº do laboratório na Cgcre (RBC).">
          <Input
            id={`${ids}-acred`}
            className="tnum"
            autoComplete="off"
            value={f.acreditacao}
            onChange={(e) => set('acreditacao', e.target.value)}
            placeholder="Ex.: CAL 0123"
          />
        </Field>
        <Field label="Data da calibração" htmlFor={`${ids}-data`} className="sm:col-span-3">
          <Input
            id={`${ids}-data`}
            type="date"
            className="tnum"
            value={f.dataCalibracao}
            onChange={(e) => set('dataCalibracao', e.target.value)}
          />
        </Field>
        <Field
          label="Próxima calibração"
          htmlFor={`${ids}-validade`}
          className="sm:col-span-3"
          extra={
            dataCalOk && (
              <span className="flex gap-1">
                {[12, 24].map((meses) => (
                  <button
                    key={meses}
                    type="button"
                    onClick={() => set('validade', somarMeses(f.dataCalibracao, meses))}
                    className="tnum cursor-pointer rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand-ink transition-[filter] hover:brightness-95 dark:hover:brightness-125"
                    title={`Calibração + ${meses / 12} ${meses === 12 ? 'ano' : 'anos'}`}
                  >
                    +{meses / 12} {meses === 12 ? 'ano' : 'anos'}
                  </button>
                ))}
              </span>
            )
          }
          erro={erroValidade}
          hint={
            dataIsoValida(f.validade) ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <ValidadePadraoBadge validade={f.validade} />
                Prazo interno da empresa.
              </span>
            ) : (
              'Prazo interno. Vencido, o padrão não pode ser usado.'
            )
          }
        >
          <Input
            id={`${ids}-validade`}
            type="date"
            className={cn('tnum', erroValidade && 'border-danger!')}
            aria-invalid={erroValidade ? true : undefined}
            value={f.validade}
            onChange={(e) => set('validade', e.target.value)}
          />
        </Field>
      </SecaoFormulario>

      {ehPesos ? (
        <>
          {/* ---- Jogo de pesos ---- */}
          <SecaoFormulario titulo="Classe e uso no cálculo">
            <Field
              label="Classe (OIML R111)"
              htmlFor={`${ids}-classe`}
              className="sm:col-span-2"
              hint="M1 é a comum para balanças comerciais; F1 ou F2 para as de precisão."
            >
              <Select id={`${ids}-classe`} value={f.classe} onChange={(e) => set('classe', e.target.value as ClassePeso | '')}>
                <option value="">Não informada</option>
                {CLASSES_PESO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Material" htmlFor={`${ids}-material`} className="sm:col-span-2">
              <Input
                id={`${ids}-material`}
                list={`${ids}-materiais`}
                autoComplete="off"
                value={f.material}
                onChange={(e) => set('material', e.target.value)}
              />
              <datalist id={`${ids}-materiais`}>
                {MATERIAIS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field
              label="Densidade"
              htmlFor={`${ids}-dens`}
              className="sm:col-span-2"
              erro={campoInvalido(f.densidade) ? 'Número inválido.' : null}
              hint="Opcional. Consta no certificado."
            >
              <CampoNumerico
                id={`${ids}-dens`}
                valor={f.densidade}
                aoMudar={(v) => set('densidade', v)}
                unidade="kg/m³"
                invalido={campoInvalido(f.densidade)}
                placeholder="8000"
                className="[&_input]:pr-16"
              />
            </Field>

            <div
              role="radiogroup"
              aria-label="Como usar no cálculo"
              className="grid grid-cols-1 gap-2.5 sm:col-span-6 sm:grid-cols-2"
              onKeyDown={(e) => {
                // Setas trocam a opção (padrão dos grupos de rádio)
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
                e.preventDefault()
                const outro: UsoPesos = f.uso === 'CERTIFICADO' ? 'NOMINAL' : 'CERTIFICADO'
                set('uso', outro)
                e.currentTarget.querySelector<HTMLElement>(`[data-uso="${outro}"]`)?.focus()
              }}
            >
              <OpcaoUso
                valor="CERTIFICADO"
                ativo={f.uso === 'CERTIFICADO'}
                aoEscolher={() => set('uso', 'CERTIFICADO' satisfies UsoPesos)}
                titulo="Valor do certificado"
                selo="Mais exato"
                descricao="Usa a correção e a incerteza (U) de cada peça, como estão no certificado. Peça sem U entra pelo nominal."
              />
              <OpcaoUso
                valor="NOMINAL"
                ativo={f.uso === 'NOMINAL'}
                aoEscolher={() => set('uso', 'NOMINAL' satisfies UsoPesos)}
                titulo="Só o valor nominal"
                descricao="Considera cada peça igual ao nominal e usa o erro máximo da classe (EMA) como incerteza. Mais simples, com incerteza maior."
              />
            </div>
          </SecaoFormulario>

          <TabelaPecas
            pesos={f.pesos}
            conferencias={conferencias}
            classe={f.classe}
            uso={f.uso}
            erro={tentou ? erroPesos : undefined}
            tentou={tentou}
            aoMudar={(pesos) => set('pesos', pesos)}
          />
        </>
      ) : (
        <SecaoFormulario titulo="Incerteza do instrumento">
          <Field
            label="Incerteza declarada no certificado"
            htmlFor={`${ids}-incerteza`}
            className="sm:col-span-6"
            hint="Copie como está no certificado do instrumento, com as grandezas que ele mede."
          >
            <Input
              id={`${ids}-incerteza`}
              value={f.incertezaTexto}
              onChange={(e) => set('incertezaTexto', e.target.value)}
              placeholder={f.tipo === 'BAROMETRO' ? 'Ex.: ±0,5 hPa (k=2)' : 'Ex.: ±0,5 °C; ±3 %UR (k=2)'}
            />
          </Field>
        </SecaoFormulario>
      )}

      {/* ---- Observações e situação ---- */}
      <SecaoFormulario titulo="Observações">
        <Field label="Observações" htmlFor={`${ids}-obs`} className="sm:col-span-6">
          <Textarea
            id={`${ids}-obs`}
            value={f.observacoes}
            onChange={(e) => set('observacoes', e.target.value)}
            placeholder="Ex.: estojo azul; fica no carro 2"
          />
        </Field>
        {padrao && (
          <div className="overflow-hidden rounded-xl border border-line sm:col-span-6">
            <LinhaInterruptor
              ligado={f.ativo}
              aoMudar={(v) => set('ativo', v)}
              titulo="Padrão em uso"
              descricao={
                f.ativo
                  ? 'Pode ser escolhido nas calibrações enquanto estiver dentro do prazo.'
                  : 'Desativado: não aparece na escolha dos padrões. As calibrações já feitas não mudam.'
              }
            />
          </div>
        )}
      </SecaoFormulario>
    </form>
  )
}

// ---- Uso no cálculo -----------------------------------------------------------------------

function OpcaoUso({
  valor,
  ativo,
  aoEscolher,
  titulo,
  descricao,
  selo,
}: {
  valor: UsoPesos
  ativo: boolean
  aoEscolher: () => void
  titulo: string
  descricao: string
  selo?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      data-uso={valor}
      tabIndex={ativo ? 0 : -1}
      onClick={aoEscolher}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150',
        ativo
          ? 'border-brand bg-brand-soft/60 ring-4 ring-[var(--ring)]/40'
          : 'border-line-strong/80 bg-surface hover:border-line-strong hover:bg-surface-2/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          ativo ? 'border-brand' : 'border-line-strong',
        )}
      >
        <AnimatePresence>
          {ativo && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="h-1.5 w-1.5 rounded-full bg-brand"
            />
          )}
        </AnimatePresence>
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          {titulo}
          {selo && <span className="rounded-full bg-brand-soft px-2 py-px text-[11px] font-medium text-brand-ink">{selo}</span>}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted">{descricao}</span>
      </span>
    </button>
  )
}

// ---- Tabela de peças ------------------------------------------------------------------------

const GRADE_PECAS =
  'sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_2rem]'

function TabelaPecas({
  pesos,
  conferencias,
  classe,
  uso,
  erro,
  tentou,
  aoMudar,
}: {
  pesos: PesoTexto[]
  conferencias: Array<ReturnType<typeof conferirPeca>>
  classe: ClassePeso | ''
  uso: UsoPesos
  erro?: string
  tentou: boolean
  aoMudar: (pesos: PesoTexto[]) => void
}) {
  const ids = useId()
  const gradeRef = useRef<HTMLDivElement>(null)
  const [varias, setVarias] = useState(false)
  const [lista, setLista] = useState('')
  const leitura = lerListaPecas(lista)
  const cabe = LIMITES.pesos - pesos.length
  const previa = comMarcas(pesos, leitura.gramas.slice(0, Math.max(0, cabe))).novas

  const mudar = (i: number, campo: keyof Omit<PesoTexto, 'id'>, v: string) =>
    aoMudar(pesos.map((p, j) => (j === i ? { ...p, [campo]: v } : p)))

  const adicionarUma = () => {
    if (cabe <= 0) return
    const ultima = pesos[pesos.length - 1]
    aoMudar([
      ...pesos,
      { id: novoId(), marca: '', nominal: '', unidade: ultima?.unidade ?? 'kg', correcao: '', incerteza: '', k: '2' },
    ])
    // Foco no nominal da peça nova
    requestAnimationFrame(() =>
      gradeRef.current?.querySelector<HTMLInputElement>(`input[data-lin="${pesos.length}"][data-col="nominal"]`)?.focus(),
    )
  }

  const adicionarVarias = () => {
    if (!leitura.gramas.length) return
    const { existentes, novas } = comMarcas(pesos, leitura.gramas.slice(0, Math.max(0, cabe)))
    aoMudar([...existentes, ...novas])
    if (leitura.gramas.length > cabe) toast.info('Limite de peças', `Um padrão aceita até ${LIMITES.pesos} peças.`)
    setLista('')
    setVarias(false)
  }

  /** Enter na tabela desce para a mesma coluna da peça seguinte (como numa planilha), sem salvar o formulário. */
  const navegar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return
    const el = e.target
    if (!(el instanceof HTMLInputElement) || !el.dataset.col) return
    e.preventDefault()
    const destino = gradeRef.current?.querySelector<HTMLInputElement>(
      `input[data-col="${el.dataset.col}"][data-lin="${Number(el.dataset.lin) + (e.shiftKey ? -1 : 1)}"]`,
    )
    destino?.focus()
    destino?.select()
  }

  const total = conferencias.reduce((s, c) => s + (c.gramas > 0 ? c.gramas : 0), 0)
  const avisos = conferencias.flatMap((c, i) => {
    const nome = pesos[i].marca.trim() || (c.gramas > 0 ? massaLegivel(c.gramas) : `Peça ${i + 1}`)
    const r: string[] = []
    if (c.uAlta && c.ema !== null)
      r.push(`${nome}: a incerteza (U = ${numeroBr(c.u, 3)} mg) passa de 1/3 do EMA da classe (${numeroBr(c.ema / 3, 3)} mg).`)
    if (c.correcaoAlta && c.ema !== null)
      r.push(
        `${nome}: a correção (${numeroBr(c.c, 3)} mg) passa do limite da classe ${classe} (EMA − U = ${numeroBr(c.ema - c.u, 3)} mg). A peça pode estar fora da classe.`,
      )
    return r
  })

  return (
    <SecaoFormulario
      titulo="Peças do jogo"
      extra={
        pesos.length > 0 && (
          <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">
            Total: {massaLegivel(total)} em {pesos.length} {pesos.length === 1 ? 'peça' : 'peças'}
          </span>
        )
      }
    >
      <div className="sm:col-span-6">
        {pesos.length > 0 ? (
          <div
            ref={gradeRef}
            onKeyDown={navegar}
            className="space-y-2 sm:space-y-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-line"
          >
            <div
              aria-hidden
              className={cn(
                'hidden gap-2 border-b border-line bg-surface-2/70 px-3 py-2 text-[12px] font-medium text-muted sm:grid',
                GRADE_PECAS,
              )}
            >
              <span>Marca</span>
              <span>Nominal</span>
              <span className="text-right" title="Valor do certificado menos o nominal">
                Correção (mg)
              </span>
              <span className="text-right" title="Incerteza expandida do certificado">
                U (mg)
              </span>
              <span className="text-right" title="Fator de abrangência (quase sempre 2)">
                k
              </span>
              <span className="text-right" title="Erro máximo admissível da classe (OIML R111)">
                EMA (mg)
              </span>
              <span />
            </div>
            <AnimatePresence initial={false}>
              {pesos.map((p, i) => {
                const c = conferencias[i]
                const semNominal = tentou && !(c.gramas > 0)
                const nome = p.marca.trim() || `peça ${i + 1}`
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden rounded-xl border border-line bg-surface sm:rounded-none sm:border-0 sm:border-b sm:last:border-b-0"
                  >
                    <div
                      role="group"
                      aria-label={`Peça ${i + 1}`}
                      className={cn('grid grid-cols-6 items-center gap-2 p-3 sm:px-3 sm:py-1.5', GRADE_PECAS)}
                    >
                      <Celula rotulo="Marca" className="col-span-6 sm:col-span-1">
                        <input
                          aria-label={`Marca da ${nome}`}
                          data-lin={i}
                          data-col="marca"
                          value={p.marca}
                          onChange={(e) => mudar(i, 'marca', e.target.value)}
                          placeholder={c.gramas > 0 ? massaLegivel(c.gramas) : 'Ex.: 20 kg nº1'}
                          className="h-9 w-full min-w-0 rounded-lg border border-line-strong/80 bg-surface px-2.5 text-[13px] text-ink shadow-xs transition-[border-color,box-shadow] placeholder:text-muted/70 hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-[var(--ring)] focus:outline-none"
                        />
                      </Celula>
                      <Celula rotulo="Nominal" className="col-span-6 sm:col-span-1">
                        <CampoNumerico
                          compacto
                          aria-label={`Valor nominal da ${nome}`}
                          data-lin={i}
                          data-col="nominal"
                          valor={p.nominal}
                          aoMudar={(v) => mudar(i, 'nominal', v)}
                          invalido={campoInvalido(p.nominal) || semNominal}
                          placeholder="0"
                          acessorio={
                            <span className="relative">
                              <select
                                aria-label={`Unidade do nominal da ${nome}`}
                                value={p.unidade}
                                onChange={(e) => mudar(i, 'unidade', e.target.value)}
                                className="h-7 cursor-pointer appearance-none rounded-md bg-surface-2 pr-5 pl-2 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-brand"
                              >
                                {UNIDADES_PESO.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute top-1/2 right-1 h-3 w-3 -translate-y-1/2 text-muted" />
                            </span>
                          }
                        />
                      </Celula>
                      <Celula rotulo="Correção (mg)" className="col-span-2 sm:col-span-1">
                        <CampoNumerico
                          compacto
                          aria-label={`Correção da ${nome}, em mg`}
                          data-lin={i}
                          data-col="correcao"
                          valor={p.correcao}
                          aoMudar={(v) => mudar(i, 'correcao', v)}
                          invalido={campoInvalido(p.correcao)}
                          atencao={c.correcaoAlta}
                          placeholder="0"
                          className={cn(uso === 'NOMINAL' && 'opacity-70')}
                        />
                      </Celula>
                      <Celula rotulo="U (mg)" className="col-span-2 sm:col-span-1">
                        <CampoNumerico
                          compacto
                          aria-label={`Incerteza (U) da ${nome}, em mg`}
                          data-lin={i}
                          data-col="incerteza"
                          valor={p.incerteza}
                          aoMudar={(v) => mudar(i, 'incerteza', v)}
                          invalido={campoInvalido(p.incerteza)}
                          atencao={c.uAlta}
                          placeholder="0"
                          className={cn(uso === 'NOMINAL' && 'opacity-70')}
                        />
                      </Celula>
                      <Celula rotulo="k" className="col-span-2 sm:col-span-1">
                        <CampoNumerico
                          compacto
                          aria-label={`Fator k da ${nome}`}
                          data-lin={i}
                          data-col="k"
                          valor={p.k}
                          aoMudar={(v) => mudar(i, 'k', v)}
                          invalido={campoInvalido(p.k)}
                          placeholder="2"
                          className={cn(uso === 'NOMINAL' && 'opacity-70')}
                        />
                      </Celula>
                      <Celula rotulo="EMA da classe (mg)" className="col-span-4 sm:col-span-1">
                        <p
                          className="tnum flex h-9 items-center text-[13px] text-muted sm:justify-end"
                          title={
                            classe
                              ? `Erro máximo admissível de uma peça deste valor na classe ${classe}`
                              : 'Escolha a classe para ver o EMA'
                          }
                        >
                          {c.ema !== null ? <span className="text-ink-2">{numeroBr(c.ema, 3)}</span> : '—'}
                        </p>
                      </Celula>
                      <div className="col-span-2 flex justify-end sm:col-span-1 sm:justify-center">
                        <Button
                          variante="ghost"
                          tamanho="icon-sm"
                          onClick={() => aoMudar(pesos.filter((_, j) => j !== i))}
                          aria-label={`Remover ${nome}`}
                          className="text-muted hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-7 text-center',
              erro ? 'border-danger/50 bg-danger-soft/30' : 'border-line-strong',
            )}
          >
            <Weight className="h-5 w-5 text-muted" />
            <p className="mt-1 text-sm font-medium text-ink">Nenhuma peça ainda</p>
            <p className="max-w-sm text-[13px] text-muted">
              Cadastre cada peça com os valores do certificado. Para ir mais rápido, digite a lista inteira em “Adicionar várias
              peças”.
            </p>
          </div>
        )}

        {erro && <p className="mt-2 text-xs font-medium text-danger">{erro}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={adicionarUma} disabled={cabe <= 0}>
            Adicionar peça
          </Button>
          <Button
            tamanho="sm"
            variante={varias ? 'soft' : 'ghost'}
            icone={<ListPlus className="h-3.5 w-3.5" />}
            onClick={() => setVarias((v) => !v)}
            aria-expanded={varias}
            disabled={cabe <= 0}
          >
            Adicionar várias peças
          </Button>
          {uso === 'NOMINAL' && pesos.length > 0 && (
            <span className="text-xs text-muted sm:ml-auto">Com “só o nominal”, correção e U ficam só registradas.</span>
          )}
        </div>

        <AnimatePresence initial={false}>
          {varias && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <label htmlFor={`${ids}-lista`} className="text-[13px] font-medium text-ink-2">
                    Digite as peças do jogo
                  </label>
                  <button
                    type="button"
                    onClick={() => setVarias(false)}
                    aria-label="Fechar"
                    className="-mt-1 -mr-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  id={`${ids}-lista`}
                  autoFocus
                  autoComplete="off"
                  className="mt-1.5 tnum"
                  value={lista}
                  onChange={(e) => setLista(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adiciona as peças em vez de salvar o padrão
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      adicionarVarias()
                    }
                  }}
                  placeholder="20 kg x2, 10 kg, 5 kg, 2 kg x2, 1 kg"
                />
                <p className="mt-1.5 text-xs text-muted">
                  Separe com vírgula e use “x2” para repetir. Unidades: mg, g ou kg. As marcas são criadas sozinhas (ex.: “20 kg
                  nº1”).
                </p>

                {(previa.length > 0 || leitura.naoEntendidos.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {previa.length > 0 && (
                      <div>
                        <p className="tnum text-xs font-medium text-ink-2">
                          {previa.length} {previa.length === 1 ? 'peça' : 'peças'} ·{' '}
                          {massaLegivel(previa.reduce((s, p) => s + gramasDe(p), 0))}
                        </p>
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {previa.map((p, i) => (
                            <li key={i} className="tnum rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
                              {p.marca}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {leitura.naoEntendidos.length > 0 && (
                      <p className="flex items-start gap-1.5 text-xs text-warning">
                        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span>
                          Não entendi: {leitura.naoEntendidos.map((t) => `“${t}”`).join(', ')}. Escreva o valor e a unidade, como
                          “500 g”.
                        </span>
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <Button tamanho="sm" variante="ghost" onClick={() => setVarias(false)}>
                    Cancelar
                  </Button>
                  <Button tamanho="sm" variante="primary" onClick={adicionarVarias} disabled={!previa.length}>
                    {previa.length ? `Adicionar ${previa.length} ${previa.length === 1 ? 'peça' : 'peças'}` : 'Adicionar'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {avisos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-xl bg-warning-soft px-3.5 py-2.5">
                <ul className="space-y-1">
                  {avisos.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] text-warning">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 pl-5.5 text-[12px] text-warning/80">
                  Pela OIML R111, a incerteza da peça deve ser até 1/3 do EMA e a correção não pode passar de EMA − U. São só
                  avisos: o cadastro pode ser salvo.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {pesos.length > 0 && (
          <p className="mt-2.5 text-xs text-muted">
            <b className="font-medium text-ink-2">Correção</b> = valor do certificado − nominal.{' '}
            <b className="font-medium text-ink-2">U</b> = incerteza expandida, com o fator{' '}
            <b className="font-medium text-ink-2">k</b>. <b className="font-medium text-ink-2">EMA</b> = erro máximo admissível da
            classe, calculado sozinho.
          </p>
        )}
      </div>
    </SecaoFormulario>
  )
}

/** Célula da tabela de peças: no celular mostra o rótulo em cima; na tela larga o rótulo fica no cabeçalho. */
function Celula({ rotulo, className, children }: { rotulo: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <span aria-hidden className="mb-1 block text-[11px] font-medium text-muted sm:hidden">
        {rotulo}
      </span>
      {children}
    </div>
  )
}
