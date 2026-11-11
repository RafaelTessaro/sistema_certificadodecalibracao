// Campos obrigatórios em destaque nas telas: a marca "●" (com "obrigatório" para o leitor de tela) ao lado do rótulo, a
// legenda de uma linha, "opcional" nos opcionais, o destaque do obrigatório em branco depois de a pessoa passar por ele
// e, na revisão, cada pendência levando à etapa e ao campo dela. As marcas vêm de `camposObrigatoriosEmissao` (as
// mesmas regras das pendências; conferido em shared/obrigatorios.test.ts). Desenhado no servidor (sem DOM).

import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  BALANCA_VAZIA,
  calibracaoVazia,
  camposObrigatoriosEmissao,
  CLIENTE_VAZIO,
  CONFIG_PADRAO,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PENDENCIA_TECNICO_EXCLUIDO,
} from '#shared/dominio.ts'
import { PENDENCIA_RETORNO_ZERO } from '#shared/metrologia/index.ts'
import type { Balanca, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import calibracaoForm from '../../pages/CalibracaoForm.tsx?raw'
import configuracoes from '../../pages/Configuracoes.tsx?raw'
import formBalanca from '../BalancaFormModal.tsx?raw'
import cartaoPop from '../CartaoPop.tsx?raw'
import formCliente from '../ClienteFormModal.tsx?raw'
import formPadrao from '../PadraoFormModal.tsx?raw'
import { Field, LegendaObrigatorio } from '../ui/Form'
import editarUsuario from '../usuarios/EditarUsuarioModal.tsx?raw'
import novoUsuario from '../usuarios/NovoUsuarioModal.tsx?raw'
import type { ContextoEtapa } from './contexto'
import { EtapaExcentricidade } from './EtapaExcentricidade'
import { EtapaIdentificacao } from './EtapaIdentificacao'
import { EtapaInstrumento } from './EtapaInstrumento'
import { EtapaPadroes } from './EtapaPadroes'
import { EtapaRepetibilidade } from './EtapaRepetibilidade'
import { PENDENCIA_POP } from '#shared/arquivos.ts'
import { destinoDaPendencia, destinoForaDaCalibracao, etapaTemMarcas } from './obrigatorios'

vi.mock('../../store/sessao', () => ({
  useSessao: (seletor: (s: { usuario: { id: string; nome: string; signatario: boolean } }) => unknown) =>
    seletor({ usuario: { id: 'ana', nome: 'Ana', signatario: true } }),
  usePode: () => false,
}))
const { EtapaRevisao } = await import('./EtapaRevisao')

const balancaIII = {
  ...BALANCA_VAZIA,
  id: 'b1',
  classe: 'III',
  numeroSerie: 'SN-1',
  faixas: [{ max: 30, e: 0.01, d: 0.01 }],
} as Balanca
const balancaI = {
  ...balancaIII,
  tipo: 'ANALITICA',
  classe: 'I',
  unidade: 'g',
  faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
} as Balanca

function contexto(f: CalibracaoInput, balanca = balancaIII, extra: Partial<ContextoEtapa> = {}): ContextoEtapa {
  return {
    f,
    alterar: () => {},
    balanca,
    cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
    padroes: [],
    selecionados: [],
    calc: null,
    config: CONFIG_PADRAO,
    equipe: [],
    status: 'RASCUNHO',
    editarBalanca: () => {},
    folhaCampo: null,
    vincularFolha: async () => true,
    novaFolha: () => {},
    ...extra,
  }
}

const desenhar = (Etapa: ComponentType<ContextoEtapa>, ctx: ContextoEtapa) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Etapa, ctx)))
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
/** Um Field com um campo dentro, com as props dadas. */
const campo = (props: Omit<Parameters<typeof Field>[0], 'children'>) =>
  renderToStaticMarkup(createElement(Field, props as Parameters<typeof Field>[0], createElement('input')))

describe('Field: a marca, o "opcional" e o destaque', () => {
  it('obrigatório: o ponto da marca (aria-hidden) e "(obrigatório)" para o leitor de tela', () => {
    const html = campo({ label: 'Técnico', obrigatorio: true })
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*rounded-full[^"]*bg-brand/)
    expect(html).toContain('<span class="sr-only"> (obrigatório)</span>')
    expect(html).not.toContain('opcional')
    expect(html).not.toContain('data-pendente')
  })

  it('○ vazada: obrigatório só para emitir (o certificado do padrão)', () => {
    const html = campo({ label: 'Nº do certificado', obrigatorio: true, vazada: true })
    expect(html).toMatch(/rounded-full border-\[1\.5px\] border-brand/)
    expect(html).toContain('(obrigatório para emitir)')
  })

  it('opcional: "opcional" ao lado do rótulo; com a marca, não', () => {
    expect(texto(campo({ label: 'OS', opcional: true }))).toContain('OS opcional')
    expect(campo({ label: 'OS', opcional: true, obrigatorio: true })).not.toContain('opcional')
  })

  it('pendente: a borda em destaque (data-pendente) e "Obrigatório para emitir" no lugar da dica; o erro vence', () => {
    const html = campo({ label: 'Data', obrigatorio: true, pendente: true, hint: 'A dica' })
    expect(html).toContain('data-pendente=""')
    expect(texto(html)).toContain('Obrigatório para emitir')
    expect(texto(html)).not.toContain('A dica')
    const comErro = campo({ label: 'Data', pendente: true, erro: 'Data inválida.' })
    expect(comErro).not.toContain('data-pendente')
    expect(texto(comErro)).toContain('Data inválida.')
  })

  it('a legenda de uma linha: para salvar, para emitir e, no padrão, também o ○', () => {
    expect(texto(renderToStaticMarkup(createElement(LegendaObrigatorio, { para: 'salvar' })))).toContain(
      'obrigatório para salvar',
    )
    expect(texto(renderToStaticMarkup(createElement(LegendaObrigatorio, { para: 'emitir' })))).toContain(
      'obrigatório para emitir',
    )
    const padrao = texto(renderToStaticMarkup(createElement(LegendaObrigatorio, { para: 'salvar', vazada: true })))
    expect(padrao).toMatch(/obrigatório para salvar .*obrigatório para emitir/)
  })
})

describe('etapas da calibração: as marcas seguem as regras da emissão', () => {
  const nova = (classe: Balanca['classe'] = 'III') =>
    calibracaoVazia(classe === 'I' ? opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I') : undefined, classe)

  it('Cliente e OS: a data, o técnico e o endereço (no cliente) com a marca; a OS e as anotações opcionais', () => {
    const t = texto(desenhar(EtapaIdentificacao, contexto({ ...nova(), local: 'CLIENTE' })))
    expect(t).toContain('Data da calibração (obrigatório)')
    expect(t).toContain('Técnico que executou (obrigatório)')
    expect(t).toContain('Endereço da calibração (obrigatório)')
    expect(t).toContain('Nº da ordem de serviço opcional')
    expect(t).toContain('Anotações internas opcional')
    // No laboratório, o endereço não é pedido para emitir
    expect(texto(desenhar(EtapaIdentificacao, contexto({ ...nova(), local: 'LABORATORIO' })))).not.toContain(
      'Endereço da calibração (obrigatório)',
    )
    // Com reparo (registro de antes), a OS passa a ser obrigatória
    const reparo = { ...nova(), reparo: { ...nova().reparo, houve: true } }
    expect(texto(desenhar(EtapaIdentificacao, contexto(reparo)))).toContain('Nº da ordem de serviço (obrigatório)')
  })

  it('Cliente e OS: a inscrição estadual do cliente, quando tem (sai no certificado embaixo do CNPJ)', () => {
    const comIe = {
      ...CLIENTE_VAZIO,
      id: 'c1',
      tipo: 'PJ',
      razaoSocial: 'Mercado Bom Preço Ltda',
      documento: '24.414.402/0001-09',
    }
    const t = texto(
      desenhar(
        EtapaIdentificacao,
        contexto(nova(), balancaIII, { cliente: { ...comIe, inscricaoEstadual: '587229409110' } as Cliente }),
      ),
    )
    expect(t).toContain('CNPJ 24.414.402/0001-09 Inscrição estadual 587229409110')
    expect(texto(desenhar(EtapaIdentificacao, contexto(nova(), balancaIII, { cliente: comIe as Cliente })))).not.toContain(
      'Inscrição estadual',
    )
  })

  it('o destaque do obrigatório em branco só depois de a pessoa passar por ele (ou chegar à revisão)', () => {
    const f = { ...nova(), tecnicoId: '' }
    expect(desenhar(EtapaIdentificacao, contexto(f))).not.toContain('data-pendente')
    const visto = desenhar(EtapaIdentificacao, contexto(f, balancaIII, { destacar: (c) => c.campo === 'tecnicoId' }))
    expect(visto.match(/data-pendente/g)).toHaveLength(1)
    expect(texto(visto)).toContain('Técnico que executou (obrigatório) Escolha… Obrigatório para emitir')
    // Preenchido, não destaca mais
    const preenchido = desenhar(EtapaIdentificacao, contexto({ ...f, tecnicoId: 't1' }, balancaIII, { destacar: () => true }))
    expect(texto(preenchido)).not.toMatch(/Técnico que executou \(obrigatório\)[^.]*Obrigatório para emitir/)
  })

  it('Padrões e ambiente: a pressão obrigatória em toda classe (como na folha, "Pressão ●"); a umidade e o ΔT na classe I', () => {
    const iii = texto(desenhar(EtapaPadroes, contexto(nova('III'))))
    expect(iii).toContain('Pesos padrão usados (obrigatório)')
    expect(iii).toContain('Temperatura (obrigatório)')
    expect(iii).toContain('Pressão (obrigatório)')
    expect(iii).not.toContain('Umidade relativa (obrigatório)')
    const i = texto(desenhar(EtapaPadroes, contexto(nova('I'), balancaI)))
    expect(i).toContain('Umidade relativa (obrigatório)')
    expect(i).toContain('Pesos × ar (convecção) (obrigatório)')
    expect(i).toContain('Pressão (obrigatório)')
  })

  it('a calibração medida quando a pressão era opcional: sem a marca, "opcional" (só aviso)', () => {
    const t = texto(desenhar(EtapaPadroes, contexto({ ...nova('III'), pressaoComoAviso: true })))
    expect(t).not.toContain('Pressão (obrigatório)')
    expect(t).toContain('Leitura opcional')
  })

  it('Excentricidade: a carga usada com a marca, como a "Carga aplicada" da repetibilidade; com as leituras e sem ela, o erro', () => {
    const feita = (carga: number, leitura: number | null): CalibracaoInput => ({
      ...nova('III'),
      excentricidade: {
        aplicavel: true,
        motivo: '',
        carga,
        metodo: 1,
        posicoes: ['Centro', 'Frente', 'Direita', 'Atrás', 'Esquerda'].map((rotulo) => ({ rotulo, leitura, referencia: null })),
      },
    })
    const vazia = texto(desenhar(EtapaExcentricidade, contexto(feita(10, null))))
    expect(vazia).toContain('Carga usada (obrigatório)')
    expect(vazia).not.toContain('Informe a carga usada no ensaio.')
    const semCarga = desenhar(EtapaExcentricidade, contexto(feita(0, 10)))
    expect(texto(semCarga)).toContain('Carga usada (obrigatório)')
    expect(texto(semCarga)).toContain('Informe a carga usada no ensaio.')
    // No registro de antes das regras do POP, a falta dela é aviso (sem a marca)
    expect(texto(desenhar(EtapaExcentricidade, contexto({ ...feita(0, 10), substituiId: 'orig' })))).not.toContain(
      'Carga usada (obrigatório)',
    )
  })

  it('Repetibilidade: a marca no título também sem nenhum ensaio (como "Erro de indicação ●"); o nº de cada leitura à vista', () => {
    const vazia = texto(desenhar(EtapaRepetibilidade, contexto(nova('III'))))
    expect(vazia).toContain('Repetibilidade (obrigatório)')
    const comEnsaio = { ...nova('III'), repetibilidade: [{ id: 'r1', carga: 15, leituras: [null, null, null, null, null] }] }
    const html = desenhar(EtapaRepetibilidade, contexto(comEnsaio))
    expect(texto(html)).toContain('Repetibilidade (obrigatório)')
    expect(texto(html)).toContain('Carga aplicada (obrigatório)')
    // O nº da leitura vem depois do campo (por cima dele) e acima dele na pilha: o fundo do campo não o cobre
    expect(html).toMatch(/aria-label="Leitura 1"[\s\S]*?<span[^>]*class="[^"]*z-10[^"]*"[^>]*>1<\/span>/)
  })

  it('Balança e ajuste: sem nº de série nem TAG, os dois com a marca e o aviso de como resolver (e a legenda da etapa)', () => {
    const semId = { ...balancaIII, numeroSerie: '', identificacao: '' }
    const t = texto(desenhar(EtapaInstrumento, contexto(nova('III'), semId)))
    expect(t).toContain('Nº de série (indicador) (obrigatório)')
    expect(t).toContain('Identificação / TAG (obrigatório)')
    expect(t).toContain('Sem nº de série nem TAG, o certificado não pode ser emitido')
    expect(t).toContain('Corrigir cadastro')
    const campos = camposObrigatoriosEmissao(nova('III'), { padroes: [], classe: 'III', balanca: semId })
    expect(etapaTemMarcas(campos, 'instrumento')).toBe(true)
    // Com a série (basta uma das duas), sem marca nem aviso
    const ok = texto(desenhar(EtapaInstrumento, contexto(nova('III'))))
    expect(ok).not.toContain('(obrigatório)')
    expect(ok).not.toContain('Sem nº de série nem TAG')
    expect(
      etapaTemMarcas(camposObrigatoriosEmissao(nova('III'), { padroes: [], classe: 'III', balanca: balancaIII }), 'instrumento'),
    ).toBe(false)
  })

  it('a legenda "● obrigatório para emitir" só nas etapas com marca', () => {
    const campos = camposObrigatoriosEmissao({ ...nova('III'), local: 'LABORATORIO' }, { padroes: [], classe: 'III' })
    expect(etapaTemMarcas(campos, 'identificacao')).toBe(true)
    expect(etapaTemMarcas(campos, 'padroes')).toBe(true)
    expect(etapaTemMarcas(campos, 'instrumento')).toBe(false)
    expect(etapaTemMarcas(campos, 'conclusao')).toBe(false)
    expect(calibracaoForm).toMatch(/etapaTemMarcas\(obrigatorios, etapa\)[\s\S]{0,80}<LegendaObrigatorio para="emitir"/)
  })
})

describe('revisão: cada pendência leva à etapa e ao campo dela', () => {
  const k = { ...calibracaoVazia(undefined, 'III'), local: 'CLIENTE' as const }
  const campos = camposObrigatoriosEmissao(k, { padroes: [], classe: 'III' })

  it('a pendência de um campo em branco: a etapa e o controle', () => {
    expect(destinoDaPendencia('Informe o técnico que executou a calibração.', campos)).toEqual({
      etapa: 'identificacao',
      alvo: 'k-tec',
    })
    expect(destinoDaPendencia('Informe a data da calibração.', campos)).toEqual({ etapa: 'identificacao', alvo: 'k-data' })
    expect(destinoDaPendencia('Escolha pelo menos um jogo de pesos padrão.', campos)).toEqual({
      etapa: 'padroes',
      alvo: 'k-pesos',
    })
    expect(
      destinoDaPendencia('Registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões; POP 7.5).', campos),
    ).toEqual({ etapa: 'padroes', alvo: 'amb-p' })
    expect(destinoDaPendencia(PENDENCIA_RETORNO_ZERO, campos)).toEqual({ etapa: 'indicacao', alvo: 'k-retorno-zero' })
  })

  it('as outras, pelo começo do texto; sem etapa (o POP), nenhuma', () => {
    expect(destinoDaPendencia(PENDENCIA_TECNICO_EXCLUIDO, campos)).toEqual({ etapa: 'identificacao', alvo: 'k-tec' })
    expect(destinoDaPendencia('Repetibilidade a 10 kg: 3 leituras; o mínimo é 5 (POP, Tabela 4).', campos)?.etapa).toBe(
      'repetibilidade',
    )
    expect(destinoDaPendencia('Erro de indicação: falta a leitura de subida em 10 kg (POP 7.7).', campos)?.etapa).toBe(
      'indicacao',
    )
    expect(destinoDaPendencia('O padrão JP-01 está sem a acreditação Cgcre do laboratório que o calibrou.', campos)?.etapa).toBe(
      'padroes',
    )
    expect(destinoDaPendencia('Temperatura no início fora da faixa (−40 °C a 80 °C): confira o valor digitado.', campos)).toEqual(
      { etapa: 'padroes', alvo: 'amb-ti' },
    )
    expect(
      destinoDaPendencia('Balança classe I: a convecção precisa entrar no cálculo (Opções do cálculo, na Conclusão).', campos)
        ?.etapa,
    ).toBe('conclusao')
    expect(destinoDaPendencia('A próxima calibração precisa ser depois da data da calibração.', campos)).toEqual({
      etapa: 'conclusao',
      alvo: 'k-prox',
    })
    // O jogo sem a classe (sem o EMA da R111): o cadastro do padrão, pela etapa Padrões e ambiente
    expect(
      destinoDaPendencia(
        'Pesos sem EMA conhecido (OIML R 111): o jogo P-02 está sem a classe. O EMA entra na incerteza dos pesos (deriva, empuxo ou valor nominal); confira a classe no cadastro do padrão.',
        campos,
      ),
    ).toEqual({ etapa: 'padroes', alvo: 'k-pesos' })
    expect(destinoDaPendencia('Pesos sem incerteza conhecida (classe ou U do certificado) em 10 kg.', campos)?.etapa).toBe(
      'padroes',
    )
    expect(destinoDaPendencia('Excentricidade: informe a carga usada no ensaio (POP 7.10).', campos)?.etapa).toBe(
      'excentricidade',
    )
    expect(destinoDaPendencia('Registre o POP em Configurações.', campos)).toBeNull()
  })

  it('o POP sem registro: o texto diz que é com o administrador; só ele tem o caminho até Configurações', () => {
    expect(PENDENCIA_POP).toContain('o administrador registra')
    expect(destinoForaDaCalibracao(PENDENCIA_POP, true)).toEqual({
      titulo: 'Configurações',
      para: '/configuracoes?secao=certificado',
    })
    expect(destinoForaDaCalibracao(PENDENCIA_POP, false)).toBeNull()
    expect(destinoForaDaCalibracao('Informe o técnico que executou a calibração.', true)).toBeNull()
    expect(destinoDaPendencia(PENDENCIA_POP, [])).toBeNull()
  })

  it('na etapa Revisão e emissão, a pendência com destino é um botão com o nome da etapa', () => {
    const html = renderToStaticMarkup(
      createElement(EtapaRevisao, {
        ctx: contexto(k),
        gravada: { status: 'RASCUNHO' },
        pendencias: ['Informe o técnico que executou a calibração.', 'Registre o POP em Configurações.'],
        destinoDe: (p: string) => (p.startsWith('Informe o técnico') ? { titulo: 'Cliente e OS', ir: () => {} } : null),
        salvando: false,
        aoVisualizar: () => {},
        aoPedirAutorizacao: () => {},
        aoVoltarRascunho: () => {},
        aoDevolver: () => {},
        aoEmitir: () => {},
      }),
    )
    expect(html).toMatch(/<button type="button" title="Ir para Cliente e OS"[^>]*>[\s\S]*?Informe o técnico/)
    expect(html).toMatch(/<p [^>]*>[\s\S]*?Registre o POP em Configurações\./)
    expect(texto(html)).toContain('Clique num item para ir até ele.')
  })
})

describe('cadastros: a legenda "● obrigatório para salvar" e as marcas das regras de gravar', () => {
  it('cliente, balança, padrão, usuário, empresa e nova calibração usam as listas de shared/obrigatorios.ts', () => {
    expect(formCliente).toContain('obrigatoriosCliente(f)')
    expect(formCliente).toContain('<LegendaObrigatorio para="salvar" />')
    expect(formBalanca).toMatch(/OBRIGATORIOS_BALANCA\.includes\('clienteId'\)/)
    expect(formBalanca).toMatch(/OBRIGATORIOS_BALANCA\.includes\('max'\)/)
    expect(formBalanca).toMatch(/OBRIGATORIOS_BALANCA\.includes\('d'\)/)
    expect(formPadrao).toContain('<LegendaObrigatorio para="salvar" vazada />')
    expect(formPadrao).toMatch(/obrigatoriosPadrao\(f\)\.includes\('identificacao'\)/)
    for (const c of ['certificado', 'acreditacao', 'validade']) expect(formPadrao).toContain(`paraEmitir('${c}')`)
    // A classe do jogo de pesos (○), pela regra do cálculo (`classeDosPesosParaEmitir`, conferida em shared)
    expect(formPadrao).toMatch(/classeDosPesosParaEmitir\(f\.uso, config\?\.opcoesPadrao \?\? OPCOES_CALCULO_PADRAO\)/)
    expect(formPadrao).toMatch(/label="Classe \(OIML R111\)"[\s\S]{0,120}obrigatorio=\{classeParaEmitir\}\s+vazada/)
    for (const u of [novoUsuario, editarUsuario]) {
      expect(u).toContain('<LegendaObrigatorio para="salvar"')
      expect(u).toContain("OBRIGATORIOS_USUARIO.includes('nome')")
      expect(u).toContain("OBRIGATORIOS_USUARIO.includes('login')")
    }
    expect(configuracoes).toContain("OBRIGATORIOS_EMPRESA.includes('razaoSocial')")
    // Configurações → E-mail e Registrar o POP: os que impedem salvar também com a marca e a legenda
    expect(configuracoes).toContain('obrigatoriosEmail({ usuario, senhaDefinida: atual.senhaDefinida })')
    for (const c of ['servidor', 'usuario', 'senha', 'remetenteEmail'])
      expect(configuracoes).toContain(`obrigatorio={obrigatorio('${c}')}`)
    expect(cartaoPop).toContain('<LegendaObrigatorio para="salvar" />')
    for (const c of ['codigo', 'revisao', 'data']) expect(cartaoPop).toContain(`obrigatorio={OBRIGATORIOS_POP.includes('${c}')}`)
    expect(calibracaoForm).toContain('<LegendaObrigatorio para="começar"')
  })
})
