import {
  Building2,
  ChevronDown,
  Info,
  Layers,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  TriangleAlert,
  User,
  UserPlus,
  Weight,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { forwardRef, useId, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { GRAMAS } from '#shared/calibracao.ts'
import {
  avisosBalanca,
  capacidadeTexto,
  converterMassa,
  divisaoLegivel,
  FINALIDADES,
  LIMITES,
  LISTA_TIPOS_BALANCA,
  massaNaUnidadeLegivel,
  normalizarBalanca,
  numeroBr,
  parteSeparada,
  RECEPTOR_DO_TIPO,
  RECEPTORES,
  TIPOS_BALANCA,
  UNIDADES,
} from '#shared/dominio.ts'
import { classeMinimaPesos, posicoesExcentricidade } from '#shared/metrologia/index.ts'
import type {
  Balanca,
  BalancaInput,
  ClasseExatidao,
  Cliente,
  ClienteResumo,
  Finalidade,
  Receptor,
  TipoBalanca,
  TipoFaixas,
  Unidade,
} from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { ClienteFormModal } from './ClienteFormModal'
import { Button } from './ui/Button'
import { Combobox, type OpcaoCombo } from './ui/Combobox'
import { Field, Input, NumberInput, Select, Textarea } from './ui/Form'
import { Avatar, Segmented } from './ui/Misc'
import { Modal } from './ui/Modal'
import {
  campoInvalido,
  COM_APOIOS,
  comUnidade,
  comUnidadeColuna,
  comUnidadesSugeridas,
  espelho,
  formularioInicial,
  novaFaixa,
  paraEntrada,
  textoDe,
  type ColunaUnidade,
  type FormBalanca,
} from './balancaFormulario'

/** Fabricantes comuns no Brasil (sugestões; aceita qualquer outro). */
const FABRICANTES = [
  'Toledo',
  'Filizola',
  'Urano',
  'Balmak',
  'Welmy',
  'Micheletti',
  'Ramuza',
  'Marte',
  'Shimadzu',
  'Bel',
  'Ohaus',
  'Digi-Tron',
  'Elgin',
]

const APOIOS_PADRAO: Partial<Record<Receptor, number>> = { APOIOS: 6, RODOVIARIA: 8, TANQUE: 4 }

/** Classe e unidade mais comuns por tipo (sugestões que seguem o tipo enquanto ninguém as muda). */
const CLASSE_DO_TIPO: Partial<Record<TipoBalanca, ClasseExatidao>> = { ANALITICA: 'I', SEMIANALITICA: 'II', PRECISAO: 'II' }
const classeSugerida = (t: TipoBalanca): ClasseExatidao => CLASSE_DO_TIPO[t] ?? 'III'
const unidadeSugerida = (t: TipoBalanca): Unidade => (t === 'ANALITICA' || t === 'SEMIANALITICA' || t === 'PRECISAO' ? 'g' : 'kg')

const OPCOES_CLASSE: Array<{ valor: ClasseExatidao; label: string }> = [
  { valor: 'I', label: 'I' },
  { valor: 'II', label: 'II' },
  { valor: 'III', label: 'III' },
  { valor: 'IIII', label: 'IIII' },
  { valor: '', label: 'Sem classe' },
]

const DESCRICAO_CLASSE: Record<ClasseExatidao, string> = {
  I: 'Especial: balanças analíticas de laboratório.',
  II: 'Fina: balanças de precisão e semianalíticas.',
  III: 'Média: a mais comum no comércio e na indústria.',
  IIII: 'Ordinária: pesagens grosseiras.',
  '': 'A plaqueta não indica a classe (oval com algarismo romano).',
}

const OPCOES_FAIXAS: Array<{ valor: TipoFaixas; label: string }> = [
  { valor: 'UNICA', label: 'Faixa única' },
  { valor: 'MULTI_INTERVALO', label: 'Multi-intervalo' },
  { valor: 'MULTIPLAS_FAIXAS', label: 'Múltiplas faixas' },
]

const DESCRICAO_FAIXAS: Record<TipoFaixas, string> = {
  UNICA: 'Uma capacidade e uma divisão, como “30 kg × 5 g”.',
  MULTI_INTERVALO: 'Uma capacidade só, mas a divisão aumenta com a carga, como “15/30 kg × 5/10 g”.',
  MULTIPLAS_FAIXAS: 'Faixas separadas, escolhidas no indicador (tecla de troca de faixa).',
}

// ---- Estado do formulário --------------------------------------------------------------

/** Troca o receptor; ao passar para um receptor com apoios, sugere a quantidade mais comum. */
function comReceptor(s: FormBalanca, receptor: Receptor): FormBalanca {
  const entrouComApoios = COM_APOIOS.includes(receptor) && !COM_APOIOS.includes(s.receptor)
  return { ...s, receptor, apoios: entrouComApoios ? (APOIOS_PADRAO[receptor] ?? 4) : s.apoios }
}

/** Mensagens de `normalizarBalanca` sobre a carga mínima (aparecem no campo Min, não na tabela de faixas). */
const ehDoMin = (e: string) => /\(Min\)/.test(e)
/** Mensagens que apontam engano de unidade (`errosUnidadeBalanca`): aparecem enquanto a pessoa digita. */
const ehDeUnidade = (e: string) => /Confira a unidade/.test(e)

/** Erro de cada célula da tabela de faixas, a partir das mensagens de `normalizarBalanca`. */
function errosPorFaixa(erros: string[], quantidade: number): Array<{ max?: string; e?: string; d?: string }> {
  const r: Array<{ max?: string; e?: string; d?: string }> = Array.from({ length: quantidade }, () => ({}))
  for (const e of erros) {
    if (ehDoMin(e) || !/\(Max\)|divis/i.test(e)) continue
    const m = e.match(/da faixa (\d+)/)
    const i = m ? Number(m[1]) - 1 : 0
    if (!r[i]) continue
    if (/\(e\)/.test(e)) r[i].e ??= e
    else if (/\(Max\)/.test(e)) r[i].max ??= e
    else r[i].d ??= e
  }
  return r
}

/** Carga mínima usual pela classe, em múltiplos de e (Portaria Inmetro 157/2022, tabela 3). */
const MIN_EM_E: Record<ClasseExatidao, number> = { I: 100, II: 20, III: 20, IIII: 10, '': 0 }

/** Carga mínima usual para a classe e o e informados, na unidade da balança. */
function minUsual(classe: ClasseExatidao, e: number, unidade: Unidade): { valor: number; vezes: number } | null {
  if (!(e > 0)) return null
  // Classe II com e ≥ 0,1 g: 50 e
  const vezes = classe === 'II' && e * GRAMAS[unidade] > 0.05 + 1e-12 ? 50 : MIN_EM_E[classe]
  return vezes ? { valor: Number((vezes * e).toPrecision(12)), vezes } : null
}

// ---- Modal --------------------------------------------------------------------------------

export function BalancaFormModal({
  aberto,
  aoFechar,
  balanca: balancaAtual,
  clienteId: clienteAtual,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  balanca?: Balanca
  /** Cliente já escolhido (cadastro a partir da tela do cliente): fica fixo no cadastro novo. */
  clienteId?: string
  aoSalvar?: (b: Balanca) => void
}) {
  const [salvando, setSalvando] = useState(false)
  // Enquanto a janela se fecha, continua mostrando a balança e o cliente de antes (a página pode já ter limpado)
  const [ultimos, setUltimos] = useState({ balanca: balancaAtual, clienteId: clienteAtual })
  if (aberto && (ultimos.balanca?.id !== balancaAtual?.id || ultimos.clienteId !== clienteAtual))
    setUltimos({ balanca: balancaAtual, clienteId: clienteAtual })
  const balanca = aberto ? balancaAtual : ultimos.balanca
  const clienteId = aberto ? clienteAtual : ultimos.clienteId
  // Só busca os clientes com a janela aberta (o modal fica montado nas páginas o tempo todo)
  const { dados: clientes } = useConsulta(
    aberto ? 'clientes:true' : null,
    () => api.clientes({ inativos: true }).then((r) => r.clientes),
    ['cliente'],
  )
  const fixo = !balanca && !!clienteId
  const nomeFixo = fixo ? clientes?.find((c) => c.id === clienteId)?.nome : undefined

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-3xl"
      icone={<Scale className="h-5 w-5" />}
      titulo={balanca ? 'Editar balança' : nomeFixo ? `Nova balança para ${nomeFixo}` : 'Nova balança'}
      descricao="Copie os dados da plaqueta da balança: eles saem no certificado."
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variante="primary" type="submit" form="form-balanca" disabled={salvando}>
            {salvando ? 'Salvando…' : balanca ? 'Salvar alterações' : 'Cadastrar balança'}
          </Button>
        </>
      }
    >
      {/* O formulário só existe com o modal aberto, então sempre começa com os dados atuais */}
      <FormularioBalanca
        key={balanca?.id ?? `nova-${clienteId ?? ''}`}
        balanca={balanca}
        clienteId={clienteId}
        fixo={fixo}
        clientes={clientes}
        aoSalvar={aoSalvar}
        aoFechar={aoFechar}
        setSalvando={setSalvando}
      />
    </Modal>
  )
}

function FormularioBalanca({
  balanca,
  clienteId,
  fixo,
  clientes,
  aoSalvar,
  aoFechar,
  setSalvando,
}: {
  balanca?: Balanca
  clienteId?: string
  fixo: boolean
  clientes: ClienteResumo[] | undefined
  aoSalvar?: (b: Balanca) => void
  aoFechar: () => void
  setSalvando: (v: boolean) => void
}) {
  const ids = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [f, setF] = useState<FormBalanca>(() => formularioInicial(balanca, clienteId))
  // Versão que a pessoa abriu para editar: se outra pessoa salvar antes, o servidor avisa
  const [versaoBase, setVersaoBase] = useState(balanca?.versao)
  const [tentou, setTentou] = useState(false)
  // A plaqueta da plataforma quase nunca existe: o bloco começa fechado, a não ser que já tenha dados
  const [verPlataforma, setVerPlataforma] = useState(() => !!(f.plataformaFabricante || f.plataformaModelo || f.plataformaSerie))
  const [novoCliente, setNovoCliente] = useState<{ aberto: boolean; nome?: string }>({ aberto: false })
  /** Cliente cadastrado agora: aparece na lista antes de a busca dos clientes voltar. */
  const [clienteCriado, setClienteCriado] = useState<Cliente | null>(null)

  const set = <K extends keyof FormBalanca>(k: K, v: FormBalanca[K]) => setF((s) => ({ ...s, [k]: v }))

  // ---- Derivados (validação, resumo e avisos ao vivo) ----
  const entrada = paraEntrada(f)
  const { valor, erros } = normalizarBalanca(entrada)
  const linhas = f.tipoFaixas === 'UNICA' ? f.faixas.slice(0, 1) : f.faixas
  const multi = f.tipoFaixas !== 'UNICA'
  const celulas = errosPorFaixa(erros, linhas.length)
  const invalidos = linhas.some((x) => campoInvalido(x.max) || campoInvalido(x.e) || campoInvalido(x.d)) || campoInvalido(f.min)
  const erroCliente = erros.find((e) => /cliente/i.test(e))
  const errosFaixas = [...new Set(erros.filter((e) => !ehDoMin(e) && /faixa|Max|divis/i.test(e)))]
  const erroMin = erros.find(ehDoMin)
  // Engano de unidade (n absurdo, Min menor que e) aparece já enquanto a pessoa digita; o resto, ao salvar
  const verErro = (e: string | undefined) => !!e && (tentou || ehDeUnidade(e))
  const completo =
    valor.faixas.every((x) => x.max > 0 && x.d > 0 && x.d < x.max) && (!multi || valor.faixas.length >= 2) && !invalidos
  // Sem repetir o mesmo aviso (ex.: ordem das faixas, que é conferida par a par)
  const avisos = completo ? [...new Set(avisosBalanca(valor))] : []
  const minSugerido = minUsual(f.classe, valor.faixas[0]?.e ?? 0, f.unidade)

  // ---- Clientes ----
  const opcoesClientes = useMemo<OpcaoCombo[]>(() => {
    const lista: Array<Pick<ClienteResumo, 'id' | 'nome' | 'tipo' | 'documento' | 'cidade' | 'uf' | 'ativo'>> = [
      ...(clientes ?? []),
    ]
    if (clienteCriado && !lista.some((c) => c.id === clienteCriado.id)) lista.unshift(clienteCriado)
    return lista
      .filter((c) => c.ativo || c.id === f.clienteId)
      .map((c) => ({
        valor: c.id,
        label: c.nome,
        detalhe: [c.documento, [c.cidade, c.uf].filter(Boolean).join('/'), !c.ativo && 'desativado'].filter(Boolean).join(' · '),
        icone:
          c.tipo === 'PJ' ? (
            <Building2 className="h-4 w-4 shrink-0 text-muted" />
          ) : (
            <User className="h-4 w-4 shrink-0 text-muted" />
          ),
      }))
  }, [clientes, clienteCriado, f.clienteId])
  const clienteAtual =
    clientes?.find((c) => c.id === f.clienteId) ?? (clienteCriado?.id === f.clienteId ? clienteCriado : undefined)
  const trocouCliente = !!balanca && f.clienteId !== balanca.clienteId

  // Trocar a unidade da indicação converte as cargas e leituras das calibrações abertas desta balança (servidor)
  const trocouUnidade = !!balanca && f.unidade !== balanca.unidade
  const { dados: abertas } = useConsulta(
    trocouUnidade ? `abertas-balanca:${balanca.id}` : null,
    () => api.calibracoes({ balancaId: balanca!.id, status: 'ABERTAS', limite: 1 }).then((r) => r.total),
    ['calibracao'],
  )

  // ---- Mudanças com sugestões ----
  const mudarTipo = (tipo: TipoBalanca) =>
    setF((s) => {
      let novo: FormBalanca = { ...s, tipo }
      // Receptor, classe e unidade acompanham o tipo enquanto ainda forem a sugestão do tipo anterior
      if (s.receptor === RECEPTOR_DO_TIPO[s.tipo]) novo = comReceptor(novo, RECEPTOR_DO_TIPO[tipo])
      if (s.classe === classeSugerida(s.tipo)) novo.classe = classeSugerida(tipo)
      const semNumeros = s.faixas.every((x) => !x.max.trim() && !x.e.trim() && !x.d.trim()) && !s.min.trim()
      if (semNumeros && s.unidade === unidadeSugerida(s.tipo)) novo = comUnidade(novo, unidadeSugerida(tipo))
      // e, d e Min ainda vazios seguem o tipo (rodoviária e piso: em kg)
      return comUnidadesSugeridas(novo)
    })

  const mudarUnidade = (unidade: Unidade) => setF((s) => comUnidade(s, unidade))
  const mudarUnidadeColuna = (coluna: ColunaUnidade, u: Unidade) => setF((s) => comUnidadeColuna(s, coluna, u))
  /** Usa a carga mínima sugerida, na unidade mais legível (0,1 kg → 100 g). */
  const usarMinSugerido = (valorMin: number) =>
    setF((s) => {
      const u = divisaoLegivel([valorMin], s.unidade)
      return { ...s, un: { ...s.un, min: u.unidade }, min: textoDe(u.valores[0]) }
    })

  // Mudou a capacidade ou a divisão: as colunas vazias acompanham (Max de 80 000 kg → e e d em kg)
  const mudarFaixas = (mudar: (s: FormBalanca) => FormBalanca) => setF((s) => comUnidadesSugeridas(mudar(s)))
  const mudarTipoFaixas = (tipoFaixas: TipoFaixas) =>
    mudarFaixas((s) => ({
      ...s,
      tipoFaixas,
      // Multi precisa de pelo menos 2 linhas; as linhas extras ficam guardadas (e não são gravadas) na faixa única
      faixas: tipoFaixas !== 'UNICA' && s.faixas.length < 2 ? [...s.faixas, novaFaixa()] : s.faixas,
    }))

  const mudarFaixa = (i: number, campo: 'max' | 'e' | 'd', v: string) =>
    mudarFaixas((s) => ({ ...s, faixas: s.faixas.map((x, j) => (j === i ? { ...x, [campo]: v } : x)) }))
  const adicionarFaixa = () => mudarFaixas((s) => ({ ...s, faixas: [...s.faixas, novaFaixa()].slice(0, LIMITES.faixas) }))
  const removerFaixa = (i: number) => mudarFaixas((s) => ({ ...s, faixas: s.faixas.filter((_, j) => j !== i) }))

  // ---- Salvar ----
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (erros.length || invalidos) {
      if (invalidos) toast.erro('Confira os números', 'Use só algarismos e vírgula, como 0,005.')
      else {
        const visiveis = [erroCliente, erroMin, ...errosFaixas]
        const escondido = erros.find((x) => !visiveis.includes(x))
        if (escondido) toast.erro('Confira o cadastro', escondido)
      }
      // Leva a pessoa ao primeiro campo com problema
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSalvando(true)
    try {
      const r = balanca ? await api.atualizarBalanca(balanca.id, valor, versaoBase) : await api.criarBalanca(valor)
      useTempoReal.getState().mudou('balanca')
      const nome = [r.balanca.fabricante, r.balanca.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[r.balanca.tipo]
      toast.sucesso(balanca ? 'Balança atualizada' : 'Balança cadastrada', `${nome} · ${capacidadeTexto(r.balanca)}`)
      setVersaoBase(r.balanca.versao)
      aoSalvar?.(r.balanca)
      aoFechar()
    } catch (err) {
      avisarErro('Não foi possível salvar a balança', err)
    } finally {
      setSalvando(false)
    }
  }

  const posicoes = posicoesExcentricidade(f.receptor, f.apoios)
  const plataforma = parteSeparada(f)
  const resumoPlataforma = plataforma
    ? [plataforma.nome, plataforma.serie && `série ${plataforma.serie}`].filter(Boolean).join(' · ')
    : ''
  // No celular, o número da faixa e o botão de remover ficam numa linha acima dos três campos
  const grade = multi ? 'grid-cols-3 sm:grid-cols-[2rem_repeat(3,minmax(0,1fr))_2rem]' : 'grid-cols-3'

  return (
    <>
      <form id="form-balanca" ref={formRef} onSubmit={enviar} className="flex flex-col gap-7 pb-1" noValidate>
        {/* ---- Cliente ---- */}
        <SecaoFormulario titulo="Cliente">
          {fixo ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 sm:col-span-6">
              <Avatar nome={clienteAtual?.nome ?? '?'} className="h-9 w-9 rounded-lg text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {clienteAtual?.nome ?? (
                    <span className="inline-block h-3 w-40 animate-pulse rounded-full bg-surface-3 align-middle" />
                  )}
                </p>
                <p className="tnum truncate text-xs text-muted">
                  {[clienteAtual?.documento, [clienteAtual?.cidade, clienteAtual?.uf].filter(Boolean).join('/')]
                    .filter(Boolean)
                    .join(' · ') || 'Dono da balança'}
                </p>
              </div>
            </div>
          ) : (
            <Field
              label="Cliente dono da balança"
              htmlFor={`${ids}-cliente`}
              className="sm:col-span-6"
              erro={tentou ? erroCliente : null}
              hint={
                trocouCliente
                  ? 'A balança passa para o outro cliente. Os certificados já emitidos não mudam.'
                  : 'Busque pelo nome, CNPJ ou CPF. Não achou? Cadastre na hora.'
              }
            >
              <Combobox
                id={`${ids}-cliente`}
                opcoes={opcoesClientes}
                valor={f.clienteId}
                aoMudar={(v) => set('clienteId', v)}
                placeholder={clientes ? 'Escolha o cliente…' : 'Carregando clientes…'}
                vazio="Nenhum cliente encontrado"
                invalido={tentou && !!erroCliente}
                acoes={[
                  {
                    icone: <UserPlus className="h-4 w-4" />,
                    label: (b) => (
                      <>
                        Cadastrar novo cliente
                        {b && <span className="truncate text-muted">“{b}”</span>}
                      </>
                    ),
                    aoClicar: (b) => setNovoCliente({ aberto: true, nome: b }),
                  },
                ]}
              />
            </Field>
          )}
        </SecaoFormulario>

        {/* ---- Identificação ---- */}
        <SecaoFormulario titulo="Identificação">
          <Field label="Tipo de balança" htmlFor={`${ids}-tipo`} className="sm:col-span-3">
            <Select
              id={`${ids}-tipo`}
              value={f.tipo}
              onChange={(e) => mudarTipo(e.target.value as TipoBalanca)}
              autoFocus={fixo || !!balanca}
            >
              {LISTA_TIPOS_BALANCA.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_BALANCA[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Para que é usada"
            htmlFor={`${ids}-finalidade`}
            className="sm:col-span-3"
            hint={
              f.finalidade === 'COMERCIAL' || f.finalidade === 'SAUDE' ? (
                <span className="text-warning">Exige também a verificação do Inmetro/IPEM: a calibração não a substitui.</span>
              ) : (
                'Opcional.'
              )
            }
          >
            <Select
              id={`${ids}-finalidade`}
              value={f.finalidade}
              onChange={(e) => set('finalidade', e.target.value as Finalidade)}
            >
              <option value="">Não informada</option>
              {(Object.keys(FINALIDADES) as Array<keyof typeof FINALIDADES>).map((k) => (
                <option key={k} value={k}>
                  {FINALIDADES[k]}
                </option>
              ))}
            </Select>
          </Field>

          {/* A balança é identificada pelo indicador (o mostrador): é o nº de série dele que vale */}
          <Field label="Fabricante" htmlFor={`${ids}-fab`} className="sm:col-span-2" hint="Do indicador.">
            <Input
              id={`${ids}-fab`}
              list={`${ids}-fabricantes`}
              autoComplete="off"
              value={f.fabricante}
              onChange={(e) => set('fabricante', e.target.value)}
              placeholder="Ex.: Toledo"
            />
            <datalist id={`${ids}-fabricantes`}>
              {FABRICANTES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="Modelo" htmlFor={`${ids}-modelo`} className="sm:col-span-2" hint="Do indicador.">
            <Input
              id={`${ids}-modelo`}
              value={f.modelo}
              onChange={(e) => set('modelo', e.target.value)}
              placeholder="Ex.: Prix 3 Fit, 9091"
            />
          </Field>
          <Field
            label="Nº de série"
            htmlFor={`${ids}-serie`}
            className="sm:col-span-2"
            hint="Do indicador (plaqueta do mostrador)."
          >
            <Input
              id={`${ids}-serie`}
              className="tnum"
              autoComplete="off"
              value={f.numeroSerie}
              onChange={(e) => set('numeroSerie', e.target.value)}
              placeholder="Na plaqueta"
            />
          </Field>

          <Field
            label="Identificação no cliente"
            htmlFor={`${ids}-tag`}
            className="sm:col-span-2"
            hint="TAG, patrimônio ou código interno."
          >
            <Input
              id={`${ids}-tag`}
              className="tnum"
              autoComplete="off"
              value={f.identificacao}
              onChange={(e) => set('identificacao', e.target.value)}
              placeholder="Ex.: BAL-04"
            />
          </Field>
          <Field label="Local de instalação" htmlFor={`${ids}-local`} className="sm:col-span-2" hint="Setor, linha ou filial.">
            <Input
              id={`${ids}-local`}
              value={f.localInstalacao}
              onChange={(e) => set('localInstalacao', e.target.value)}
              placeholder="Ex.: Expedição"
            />
          </Field>
          <Field label="Ano de fabricação" htmlFor={`${ids}-ano`} className="sm:col-span-2">
            <Input
              id={`${ids}-ano`}
              className="tnum"
              inputMode="numeric"
              maxLength={10}
              autoComplete="off"
              value={f.anoFabricacao}
              onChange={(e) => set('anoFabricacao', e.target.value)}
              placeholder="Ex.: 2019"
            />
          </Field>
        </SecaoFormulario>

        {/* ---- Características metrológicas ---- */}
        <SecaoFormulario titulo="Características metrológicas">
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-line bg-surface-2/50 p-4 sm:col-span-6 sm:grid-cols-6 sm:p-5">
            <Field label="Unidade da indicação" className="sm:col-span-2" hint="Como o mostrador indica o peso.">
              <Segmented
                valor={f.unidade}
                aoMudar={mudarUnidade}
                tamanho="campo"
                opcoes={UNIDADES.map((u) => ({ valor: u, label: u }))}
                className="self-start"
              />
            </Field>
            <Field label="Faixas de pesagem" className="sm:col-span-4" hint={DESCRICAO_FAIXAS[f.tipoFaixas]}>
              <Segmented
                valor={f.tipoFaixas}
                aoMudar={mudarTipoFaixas}
                tamanho="campo"
                opcoes={OPCOES_FAIXAS}
                className="self-start"
              />
            </Field>
            {trocouUnidade && !!abertas && (
              <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info sm:col-span-6">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {abertas === 1
                    ? 'Esta balança tem 1 calibração em andamento: ao salvar, as cargas e leituras dela'
                    : `Esta balança tem ${abertas} calibrações em andamento: ao salvar, as cargas e leituras delas`}{' '}
                  passam de {balanca!.unidade} para {f.unidade}
                  {balanca!.faixas[0]?.max > 0 &&
                    ` (${numeroBr(balanca!.faixas[0].max)} ${balanca!.unidade} → ${numeroBr(converterMassa(balanca!.faixas[0].max, balanca!.unidade, f.unidade))} ${f.unidade})`}
                  . Os certificados já emitidos não mudam.
                </span>
              </p>
            )}

            {/* Tabela de faixas: Max, e, d */}
            <div className="sm:col-span-6">
              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
                {/* Cabeçalho: cada coluna com a sua unidade, como na plaqueta (Max em kg, e e d em g) */}
                <div
                  className={cn(
                    'grid items-center gap-2 border-b border-line bg-surface-2/70 px-3 py-1.5 text-[12px] font-medium text-muted',
                    grade,
                  )}
                >
                  {multi && (
                    <span aria-hidden className="text-center max-sm:hidden">
                      #
                    </span>
                  )}
                  <CabecalhoColuna
                    curto="Max"
                    longo="Capacidade (Max)"
                    unidade={f.un.max}
                    aoMudar={(u) => mudarUnidadeColuna('max', u)}
                    rotulo="Unidade da capacidade máxima (Max)"
                    automatica={!f.unEscolhida.includes('max')}
                  />
                  <CabecalhoColuna
                    curto="e"
                    longo="Verificação (e)"
                    unidade={f.un.e}
                    aoMudar={(u) => mudarUnidadeColuna('e', u)}
                    rotulo="Unidade da divisão de verificação (e)"
                    automatica={!f.unEscolhida.includes('e')}
                  />
                  <CabecalhoColuna
                    curto="d"
                    longo="Divisão (d)"
                    unidade={f.un.d}
                    aoMudar={(u) => mudarUnidadeColuna('d', u)}
                    rotulo="Unidade da divisão (d)"
                    automatica={!f.unEscolhida.includes('d')}
                  />
                  {multi && <span className="max-sm:hidden" />}
                </div>
                <AnimatePresence initial={false}>
                  {linhas.map((x, i) => {
                    const nome = multi ? ` da ${f.tipoFaixas === 'MULTI_INTERVALO' ? 'parte' : 'faixa'} ${i + 1}` : ''
                    return (
                      <motion.div
                        key={x.chave}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden border-b border-line last:border-b-0"
                      >
                        <div
                          role="group"
                          aria-label={multi ? `Faixa ${i + 1}` : 'Faixa de pesagem'}
                          className={cn('grid items-center gap-2 px-3 py-2.5', grade)}
                        >
                          {multi && (
                            <span className="order-1 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1 sm:justify-self-center">
                              <span className="tnum flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-xs font-semibold text-brand-ink">
                                {i + 1}
                              </span>
                              <span className="text-xs font-medium text-muted sm:hidden">
                                {f.tipoFaixas === 'MULTI_INTERVALO' ? 'Intervalo' : 'Faixa'} {i + 1}
                              </span>
                            </span>
                          )}
                          <CampoNumerico
                            className={cn(multi && 'order-3 sm:order-none')}
                            aria-label={`Capacidade máxima (Max)${nome}, em ${f.un.max}`}
                            valor={x.max}
                            aoMudar={(v) => mudarFaixa(i, 'max', v)}
                            unidade={f.un.max}
                            invalido={campoInvalido(x.max) || verErro(celulas[i]?.max)}
                            placeholder="0"
                          />
                          <CampoNumerico
                            className={cn(multi && 'order-3 sm:order-none')}
                            aria-label={`Divisão de verificação (e)${nome}, em ${f.un.e}`}
                            valor={x.e}
                            aoMudar={(v) => mudarFaixa(i, 'e', v)}
                            unidade={f.un.e}
                            invalido={campoInvalido(x.e) || verErro(celulas[i]?.e)}
                            placeholder={espelho(f, x, 'e')}
                            title="Em branco, fica igual a d"
                          />
                          <CampoNumerico
                            className={cn(multi && 'order-3 sm:order-none')}
                            aria-label={`Divisão (d)${nome}, em ${f.un.d}`}
                            valor={x.d}
                            aoMudar={(v) => mudarFaixa(i, 'd', v)}
                            unidade={f.un.d}
                            invalido={campoInvalido(x.d) || verErro(celulas[i]?.d)}
                            placeholder={espelho(f, x, 'd')}
                            title="Em branco, fica igual a e"
                          />
                          {multi &&
                            (f.faixas.length > 2 ? (
                              <Button
                                variante="ghost"
                                tamanho="icon-sm"
                                onClick={() => removerFaixa(i)}
                                aria-label={`Remover faixa ${i + 1}`}
                                title={`Remover faixa ${i + 1}`}
                                // Fora do Tab, como o olho da senha: o Tab vai de d para o Max da linha seguinte
                                tabIndex={-1}
                                className="order-2 justify-self-end text-muted hover:text-danger sm:order-none sm:justify-self-center"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="order-2 sm:order-none" />
                            ))}
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-xs text-muted">
                  Cada coluna na unidade da plaqueta (ex.: Max em kg, e e d em g). <b className="font-medium text-ink-2">e</b> é a
                  divisão usada pelo Inmetro e <b className="font-medium text-ink-2">d</b>, o menor passo do mostrador: se a
                  plaqueta mostra só um, deixe o outro em branco.
                </p>
                {multi && f.faixas.length < LIMITES.faixas && (
                  <Button
                    tamanho="sm"
                    variante="ghost"
                    icone={<Plus className="h-3.5 w-3.5" />}
                    onClick={adicionarFaixa}
                    className="-mr-2"
                  >
                    Adicionar faixa
                  </Button>
                )}
              </div>
              {errosFaixas.some(verErro) && (
                <ul className="mt-2 space-y-0.5 text-xs font-medium text-danger">
                  {errosFaixas.filter(verErro).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>

            <Field
              label="Carga mínima (Min)"
              htmlFor={`${ids}-min`}
              className="sm:col-span-2"
              // A unidade fica no rótulo, antes do campo (como no cabeçalho da tabela): o Tab vai do campo
              // direto para a classe
              extra={
                <SeletorUnidade
                  valor={f.un.min}
                  aoMudar={(u) => mudarUnidadeColuna('min', u)}
                  rotulo="Unidade da carga mínima (Min)"
                  noRotulo
                />
              }
              erro={campoInvalido(f.min) ? 'Número inválido.' : verErro(erroMin) ? erroMin : null}
              hint={
                !f.min.trim() && minSugerido ? (
                  <button
                    type="button"
                    // Atalho para o mouse, fora do Tab: quem usa o teclado digita o valor
                    tabIndex={-1}
                    onClick={() => usarMinSugerido(minSugerido.valor)}
                    className="cursor-pointer text-left text-brand-ink hover:underline"
                  >
                    Usar {massaNaUnidadeLegivel(minSugerido.valor, f.unidade)} ({minSugerido.vezes} e, o usual da classe)
                  </button>
                ) : (
                  'Opcional. Consta na plaqueta.'
                )
              }
            >
              <CampoNumerico
                id={`${ids}-min`}
                valor={f.min}
                aoMudar={(v) => set('min', v)}
                invalido={campoInvalido(f.min) || verErro(erroMin)}
                placeholder="0"
                unidade={f.un.min}
              />
            </Field>
            <Field label="Classe de exatidão" className="sm:col-span-4" hint={DESCRICAO_CLASSE[f.classe]}>
              <Segmented
                valor={f.classe}
                aoMudar={(c) => set('classe', c)}
                tamanho="campo"
                opcoes={OPCOES_CLASSE}
                className="self-start"
              />
            </Field>

            <Field
              label="Portaria de aprovação de modelo"
              htmlFor={`${ids}-pam`}
              className="sm:col-span-6"
              hint="Consta na plaqueta da balança, ex.: Portaria Inmetro/Dimel nº 123/2015."
            >
              <Input
                id={`${ids}-pam`}
                value={f.portariaAprovacao}
                onChange={(e) => set('portariaAprovacao', e.target.value)}
                placeholder="Portaria Inmetro/Dimel nº …"
              />
            </Field>

            <ResumoMetrologico valor={valor} completo={completo} avisos={avisos} />
          </div>
        </SecaoFormulario>

        {/* ---- Receptor de carga ---- */}
        <SecaoFormulario titulo="Receptor de carga">
          <Field
            label="Formato"
            htmlFor={`${ids}-receptor`}
            className={COM_APOIOS.includes(f.receptor) ? 'sm:col-span-3' : 'sm:col-span-4'}
            hint={
              f.receptor === RECEPTOR_DO_TIPO[f.tipo] ? 'O mais comum para este tipo de balança.' : 'Onde a carga é colocada.'
            }
          >
            <Select
              id={`${ids}-receptor`}
              value={f.receptor}
              onChange={(e) => setF((s) => comReceptor(s, e.target.value as Receptor))}
            >
              {(Object.keys(RECEPTORES) as Receptor[]).map((r) => (
                <option key={r} value={r}>
                  {RECEPTORES[r]}
                </option>
              ))}
            </Select>
          </Field>
          <AnimatePresence initial={false}>
            {COM_APOIOS.includes(f.receptor) && (
              <motion.div
                key="apoios"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                className="sm:col-span-1"
              >
                <Field label="Apoios" htmlFor={`${ids}-apoios`} hint="Células de carga.">
                  <NumberInput id={`${ids}-apoios`} valor={f.apoios} aoMudar={(v) => set('apoios', v ?? 0)} min={1} max={64} />
                </Field>
              </motion.div>
            )}
          </AnimatePresence>
          <Field label="Dimensões" htmlFor={`${ids}-dim`} className="sm:col-span-2" hint="Do prato ou da plataforma.">
            <Input
              id={`${ids}-dim`}
              value={f.dimensoes}
              onChange={(e) => set('dimensoes', e.target.value)}
              placeholder="Ex.: 40 × 50 cm"
            />
          </Field>

          <div className="flex items-start gap-3 rounded-xl bg-surface-2/60 px-3.5 py-3 sm:col-span-6">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            {posicoes.length ? (
              <div className="min-w-0 text-[13px] text-ink-2">
                <p>
                  O ensaio de excentricidade terá <b className="font-medium text-ink">{posicoes.length} posições</b>:
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {posicoes.map((p) => (
                    <li key={p} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[13px] text-ink-2">
                Balança suspensa: a carga se centra sozinha, então não há ensaio de excentricidade.
              </p>
            )}
          </div>

          {/* Plaqueta própria da plataforma: rara (o nº de série que vale é o do indicador), por isso fica recolhida */}
          <div className="overflow-hidden rounded-xl border border-line sm:col-span-6">
            <button
              type="button"
              aria-expanded={verPlataforma}
              aria-controls={`${ids}-plataforma`}
              onClick={() => setVerPlataforma((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:-outline-offset-2"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  resumoPlataforma ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-2',
                )}
              >
                <Layers className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Plataforma / receptor de carga (opcional)</span>
                <span className="mt-0.5 block text-xs text-muted sm:truncate">
                  {resumoPlataforma && !verPlataforma
                    ? resumoPlataforma
                    : 'Só se a plataforma tiver plaqueta própria; o nº de série que vale é o do indicador.'}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn('h-4 w-4 shrink-0 text-muted transition-transform duration-200', verPlataforma && 'rotate-180')}
              />
            </button>
            <AnimatePresence initial={false}>
              {verPlataforma && (
                <motion.div
                  id={`${ids}-plataforma`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 gap-4 border-t border-line bg-surface-2/40 p-4 sm:grid-cols-3">
                    <Field label="Fabricante da plataforma" htmlFor={`${ids}-plat-fab`}>
                      <Input
                        id={`${ids}-plat-fab`}
                        list={`${ids}-fabricantes`}
                        autoComplete="off"
                        value={f.plataformaFabricante}
                        onChange={(e) => set('plataformaFabricante', e.target.value)}
                        placeholder="Ex.: Toledo"
                      />
                    </Field>
                    <Field label="Modelo da plataforma" htmlFor={`${ids}-plat-mod`}>
                      <Input
                        id={`${ids}-plat-mod`}
                        value={f.plataformaModelo}
                        onChange={(e) => set('plataformaModelo', e.target.value)}
                        placeholder="Ex.: 2180"
                      />
                    </Field>
                    <Field label="Nº de série da plataforma" htmlFor={`${ids}-plat-serie`}>
                      <Input
                        id={`${ids}-plat-serie`}
                        className="tnum"
                        autoComplete="off"
                        value={f.plataformaSerie}
                        onChange={(e) => set('plataformaSerie', e.target.value)}
                        placeholder="Se houver"
                      />
                    </Field>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SecaoFormulario>

        {/* ---- Observações e situação ---- */}
        <SecaoFormulario titulo="Observações">
          <Field label="Observações" htmlFor={`${ids}-obs`} className="sm:col-span-6">
            <Textarea
              id={`${ids}-obs`}
              value={f.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              placeholder="Ex.: plataforma com rampa; acesso pela doca 2"
            />
          </Field>
          {balanca && (
            <div className="overflow-hidden rounded-xl border border-line sm:col-span-6">
              <LinhaInterruptor
                ligado={f.ativo}
                aoMudar={(v) => set('ativo', v)}
                titulo="Balança em uso"
                descricao={
                  f.ativo
                    ? 'Aparece nas listas, nos vencimentos e na escolha da nova calibração.'
                    : 'Desativada: sai das listas e dos lembretes. O histórico de certificados continua guardado.'
                }
              />
            </div>
          )}
        </SecaoFormulario>
      </form>

      {/* Fora do <form>: o envio do cadastro do cliente não pode disparar o envio da balança */}
      <ClienteFormModal
        aberto={novoCliente.aberto}
        aoFechar={() => setNovoCliente({ aberto: false })}
        nomeInicial={novoCliente.nome}
        aoSalvar={(c) => {
          setClienteCriado(c)
          set('clienteId', c.id)
        }}
      />
    </>
  )
}

// ---- Resumo ao vivo -----------------------------------------------------------------------

function ResumoMetrologico({ valor, completo, avisos }: { valor: BalancaInput; completo: boolean; avisos: string[] }) {
  let classePesos: string | null = null
  if (completo) {
    try {
      classePesos = classeMinimaPesos(valor)
    } catch {
      classePesos = null
    }
  }
  const n = valor.faixas.map((x) => numeroBr(x.e > 0 ? x.max / x.e : 0, 0)).join('/')
  return (
    <div className="sm:col-span-6">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 shadow-xs">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            completo ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-muted',
          )}
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">Resumo</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={completo ? 'ok' : 'falta'}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.14 }}
              className={cn('mt-0.5 text-[15px] leading-snug', completo ? 'tnum font-semibold text-ink' : 'text-muted')}
            >
              {completo ? (
                <>
                  {capacidadeTexto(valor)}
                  <span className="mx-1.5 text-muted">·</span>n = {n}
                  <span className="mx-1.5 text-muted">·</span>
                  {valor.classe ? `classe ${valor.classe}` : 'sem classe'}
                </>
              ) : (
                'Preencha a capacidade (Max) e a divisão (d) para ver o resumo.'
              )}
            </motion.p>
          </AnimatePresence>
          {completo && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {valor.min > 0 && <span className="tnum">Min {massaNaUnidadeLegivel(valor.min, valor.unidade)}</span>}
              {classePesos && (
                <span className="inline-flex items-center gap-1">
                  <Weight className="h-3 w-3" />
                  Pesos padrão: classe {classePesos} ou melhor
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {avisos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl bg-warning-soft px-3.5 py-2.5">
              <ul className="space-y-1">
                {avisos.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[12.5px] text-warning">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 pl-5.5 text-[12px] text-warning/80">
                São só avisos: confira a plaqueta. O cadastro pode ser salvo assim.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---- Unidade de cada coluna ------------------------------------------------------------------

/**
 * Seletor compacto de unidade (mg, g, kg, t), no cabeçalho da coluna da tabela de faixas ou no rótulo do campo
 * do Min. Fica na ordem do Tab (dá para trocar a unidade só com o teclado), sempre antes dos campos: o Tab
 * entre Max, e e d, e do Min para a classe, não é interrompido.
 */
function SeletorUnidade({
  valor,
  aoMudar,
  rotulo,
  noRotulo,
}: {
  valor: Unidade
  aoMudar: (u: Unidade) => void
  rotulo: string
  /** Na linha do rótulo de um campo (20 px de altura): menor, para não passar da linha. */
  noRotulo?: boolean
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <select
        aria-label={rotulo}
        title={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value as Unidade)}
        className={cn(
          'cursor-pointer appearance-none rounded-md border border-line-strong/70 bg-surface pr-5 pl-2 font-medium text-ink-2 shadow-xs transition-colors outline-none hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-brand',
          noRotulo ? 'h-5 text-[11px] leading-none' : 'h-6 text-xs',
        )}
      >
        {UNIDADES.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-1 h-3 w-3 -translate-y-1/2 text-muted" />
    </span>
  )
}

/**
 * Título da coluna da tabela de faixas (curto no celular) com a unidade em que ela é digitada. Quando a
 * unidade muda sozinha (`automatica`: sugestão pelo tipo e pela capacidade, ex.: e e d passam para kg com o
 * Max de 1 t ou mais), o seletor pisca em amarelo, para a troca não passar despercebida.
 */
function CabecalhoColuna({
  curto,
  longo,
  unidade,
  aoMudar,
  rotulo,
  automatica,
}: {
  curto: string
  longo: string
  unidade: Unidade
  aoMudar: (u: Unidade) => void
  rotulo: string
  automatica: boolean
}) {
  const [inicial] = useState(unidade)
  const piscar = automatica && unidade !== inicial
  return (
    <div className="flex min-w-0 items-center justify-between gap-1.5">
      <span aria-hidden className="truncate">
        <span className="sm:hidden">{curto}</span>
        <span className="max-sm:hidden">{longo}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <SeletorUnidade valor={unidade} aoMudar={aoMudar} rotulo={rotulo} />
        {piscar && (
          <motion.span
            key={unidade}
            aria-hidden
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: 'easeIn' }}
            className="pointer-events-none absolute -inset-0.5 rounded-lg bg-warning-soft/60 ring-2 ring-warning"
          />
        )}
      </span>
    </div>
  )
}

// ---- Peças reaproveitadas pelos formulários de cadastro --------------------------------------

/** Seção de formulário com subtítulo discreto e grade de 6 colunas. */
export function SecaoFormulario({
  titulo,
  extra,
  children,
  className,
}: {
  titulo: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={titulo} className={cn('grid grid-cols-1 gap-4 sm:grid-cols-6', className)}>
      <div className="flex items-center gap-3 sm:col-span-6">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted uppercase">{titulo}</h3>
        <span aria-hidden className="h-px flex-1 bg-line" />
        {extra}
      </div>
      {children}
    </section>
  )
}

const campoBase =
  'tnum w-full min-w-0 rounded-xl border bg-surface text-right text-ink shadow-xs placeholder:text-muted/70 ' +
  'transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:ring-[var(--ring)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70'

export interface CampoNumericoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Texto como digitado (com vírgula); a conversão para número é feita ao salvar, com `numero()`. */
  valor: string
  aoMudar: (texto: string) => void
  /** Unidade mostrada dentro do campo, à direita. */
  unidade?: ReactNode
  invalido?: boolean
  /** Destaque amarelo (aviso que não bloqueia). */
  atencao?: boolean
  compacto?: boolean
  /** Controle à direita, dentro do campo (ex.: seletor de unidade). */
  acessorio?: ReactNode
}

/** Campo numérico que guarda o texto digitado ("0,00" não vira "0" no meio da digitação). */
export const CampoNumerico = forwardRef<HTMLInputElement, CampoNumericoProps>(function CampoNumerico(
  { valor, aoMudar, unidade, invalido, atencao, compacto, acessorio, className, ...props },
  ref,
) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={valor}
        // Só algarismos, vírgula, ponto e sinal (o "−" tipográfico vira "-")
        onChange={(e) => aoMudar(e.target.value.replace(/−/g, '-').replace(/[^\d,.\-\s]/g, ''))}
        aria-invalid={invalido || undefined}
        className={cn(
          campoBase,
          compacto ? 'h-9 rounded-lg px-2.5 text-[13px]' : 'h-10 px-3 text-sm',
          acessorio ? 'pr-16' : unidade ? (compacto ? 'pr-8' : 'pr-10') : null,
          invalido
            ? 'border-danger bg-danger-soft/40 focus:border-danger'
            : atencao
              ? 'border-warning/60 bg-warning-soft/40 focus:border-warning'
              : 'border-line-strong/80 hover:border-line-strong focus:border-brand',
        )}
        {...props}
      />
      {unidade && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 font-medium text-muted',
            compacto ? 'right-2 text-[11px]' : 'right-3 text-xs',
          )}
        >
          {unidade}
        </span>
      )}
      {acessorio && <div className="absolute inset-y-0 right-1 flex items-center">{acessorio}</div>}
    </div>
  )
})

/** Chave liga/desliga (só o desenho; quem usa cuida do clique e do `role="switch"`). */
export function Interruptor({ ligado }: { ligado: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
        ligado ? 'bg-brand' : 'bg-line-strong',
      )}
    >
      <motion.span
        animate={{ x: ligado ? 16 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={cn('h-5 w-5 rounded-full shadow-xs', ligado ? 'bg-on-brand' : 'bg-surface')}
      />
    </span>
  )
}

/** Linha inteira clicável com título, explicação e a chave (para "em uso"…). */
export function LinhaInterruptor({
  ligado,
  aoMudar,
  titulo,
  descricao,
  icone,
}: {
  ligado: boolean
  aoMudar: (v: boolean) => void
  titulo: string
  descricao?: ReactNode
  icone?: ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => aoMudar(!ligado)}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:-outline-offset-2"
    >
      {icone && (
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
            ligado ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-2',
          )}
        >
          {icone}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{titulo}</span>
        {descricao && <span className="mt-0.5 block text-xs text-muted">{descricao}</span>}
      </span>
      <Interruptor ligado={ligado} />
    </button>
  )
}
