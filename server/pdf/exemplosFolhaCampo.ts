// Folhas de campo de exemplo, realistas, para os testes e as amostras:
//   1. plataforma 300 kg: rascunho criado a partir do último certificado (pontos, pesos e posições de
//      lá; conformidade pedida, com a EMA impressa), com a OS e o técnico;
//   2. balcão multi-intervalo 6/15/33 kg × 2/5/10 g, sem calibração anterior: os ensaios vêm das
//      sugestões do assistente (sugerirPontos, repetibilidadeSugerida, cargaExcentricidade) e o rascunho
//      prevê todos os padrões ativos da empresa (como o POST /api/calibracoes faz sem histórico): a folha
//      lista inteiros só os que vão a campo;
//   3. rodoviária 80 t com cargas de substituição (do último certificado);
//   4. folha em branco, para uma balança ainda não cadastrada;
//   5. rodoviária 60 t sem calibração anterior: o plano sai das sugestões, sem a substituição no rascunho (a
//      folha sugere as etapas, com os 20 × 500 kg em cada uma, e o nº de substituições de cada ponto) e sem
//      declaração de conformidade pedida.
// Os cadastros (empresa, clientes, padrões) são os dos certificados de exemplo.

import { calibracaoVazia, EMPRESA_PADRAO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao } from '#shared/tipos.ts'
import { exemploPlataforma, exemploRodoviaria, exemploBancada } from './exemplosCertificado.ts'
import type { DadosFolhaCampo } from './folhaCampo.ts'

/** Os dados de entrada de uma calibração (sem os campos que o servidor controla). */
function entrada(k: Calibracao): CalibracaoInput {
  const {
    id: _i,
    versao: _v,
    status: _s,
    numero: _n,
    ano: _a,
    sequencia: _q,
    revisao: _r,
    emissao: _e,
    cancelamento: _c,
    criadoPor: _p,
    criadoEm: _ce,
    atualizadoEm: _ae,
    ...resto
  } = k
  return resto
}

/**
 * Rascunho como o POST /api/calibracoes cria a partir do último certificado da balança: mesmos pontos,
 * pesos, posições, padrões, opções e conformidade, sem as leituras; o resto volta ao padrão.
 */
function rascunhoDe(ultima: Calibracao, extra: Partial<CalibracaoInput>): CalibracaoInput {
  const k = entrada(ultima)
  const base = calibracaoVazia(k.opcoes)
  return {
    ...base,
    clienteId: k.clienteId,
    balancaId: k.balancaId,
    padroesIds: k.padroesIds,
    opcoes: k.opcoes,
    conformidade: k.conformidade,
    proximaNoCertificado: k.proximaNoCertificado,
    local: 'CLIENTE',
    localEndereco: k.localEndereco,
    repetibilidade: k.repetibilidade.map((r) => ({ ...r, leituras: r.leituras.map(() => null) })),
    excentricidade: {
      ...k.excentricidade,
      posicoes: k.excentricidade.posicoes.map((p) => ({ ...p, leitura: null, referencia: null })),
    },
    indicacao: {
      ...k.indicacao,
      retornoZero: null,
      pontos: k.indicacao.pontos.map((p) => ({ ...p, crescente: null, decrescente: null })),
      substituicao: {
        ...k.indicacao.substituicao,
        etapas: k.indicacao.substituicao.etapas.map(() => ({ leituraPadroes: null, leituraSubstituicao: null })),
      },
    },
    ...extra,
  }
}

const IMPRESSO_POR = 'Carlos Eduardo Lima'

export function folhaPlataforma(): DadosFolhaCampo {
  const d = exemploPlataforma()
  const proxima = '2027-10-21'
  return {
    numero: 'FC-2026-00042',
    empresa: EMPRESA_PADRAO,
    cliente: d.emissao.cliente,
    balanca: d.emissao.balanca,
    calibracao: rascunhoDe(d.calibracao, {
      ordemServico: 'OS-2026-0512',
      dataCalibracao: '2026-10-21',
      proximaCalibracao: proxima,
      anotacoesInternas: 'Procurar a Juliana na portaria 2; acesso à doca só com botina.',
    }),
    padroes: d.emissao.padroes,
    tecnico: 'Carlos Eduardo Lima',
    impressoEm: '2026-10-20T17:35:00.000Z',
    impressoPor: IMPRESSO_POR,
  }
}

/**
 * Os padrões ativos da empresa de exemplo (os seis dos certificados de exemplo), na ordem da lista do
 * sistema (tipo e identificação): é o que o rascunho prevê sem calibração anterior da balança.
 */
export function padroesDaEmpresa(): Padrao[] {
  const todos = [exemploPlataforma(), exemploBancada(), exemploRodoviaria()].flatMap((d) => d.emissao.padroes)
  const unicos = [...new Map(todos.map((p) => [p.id, p])).values()]
  return unicos.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.identificacao.localeCompare(b.identificacao, 'pt-BR'))
}

export function folhaMultiIntervalo(): DadosFolhaCampo {
  const bancada = exemploBancada()
  // Sem calibração anterior: o rascunho prevê todos os padrões ativos (menos "outro"), como no sistema
  const padroes = padroesDaEmpresa()
  const cliente: Cliente = {
    ...bancada.emissao.cliente,
    id: 'cli-merc',
    tipo: 'PJ',
    nome: 'Supermercado Bom Preço',
    razaoSocial: 'SUPERMERCADO BOM PREÇO RIO CLARO LTDA',
    documento: '27.865.757/0001-02',
    contato: 'Sr. Antônio (gerente)',
    telefone: '(19) 3534-2210',
    celular: '',
    email: 'gerencia@bompreco-rc.com.br',
    cep: '13506-555',
    logradouro: 'Avenida 24-A',
    numero: '1800',
    complemento: '',
    bairro: 'Bela Vista',
  }
  const balanca: Balanca = {
    ...bancada.emissao.balanca,
    id: 'bal-balcao-multi',
    clienteId: cliente.id,
    tipo: 'COMPUTADORA',
    fabricante: 'Urano',
    modelo: 'UDC POP-S 33/3',
    numeroSerie: 'UR33-204718',
    identificacao: 'Açougue 2',
    tipoFaixas: 'MULTI_INTERVALO',
    faixas: [
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 33, e: 0.01, d: 0.01 },
    ],
    min: 0.04,
    classe: 'III',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0183/2018',
    receptor: 'RETANGULAR',
    dimensoes: 'prato 38 × 28 cm',
    finalidade: 'COMERCIAL',
    localInstalacao: 'Açougue — balcão 2',
    anoFabricacao: '2022',
  }
  // Primeira calibração desta balança: rascunho sem ensaios (o plano sai das sugestões do assistente)
  const calibracao: CalibracaoInput = {
    ...calibracaoVazia(),
    clienteId: cliente.id,
    balancaId: balanca.id,
    ordemServico: 'OS-2026-0519',
    dataCalibracao: '2026-10-22',
    local: 'CLIENTE',
    localEndereco: 'Avenida 24-A, 1800 – Bela Vista – Rio Claro/SP – CEP 13506-555',
    padroesIds: padroes.filter((p) => p.ativo && p.tipo !== 'OUTRO').map((p) => p.id),
    conformidade: { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'BANDA_GUARDA' },
  }
  return {
    numero: 'FC-2026-00043',
    empresa: EMPRESA_PADRAO,
    cliente,
    balanca,
    calibracao,
    padroes,
    tecnico: 'Fábio de Godoy Lima',
    impressoEm: '2026-10-21T11:02:00.000Z',
    impressoPor: 'Fábio de Godoy Lima',
  }
}

export function folhaRodoviaria(): DadosFolhaCampo {
  const d = exemploRodoviaria()
  return {
    numero: 'FC-2026-00044',
    empresa: EMPRESA_PADRAO,
    cliente: d.emissao.cliente,
    balanca: d.emissao.balanca,
    calibracao: rascunhoDe(d.calibracao, {
      ordemServico: 'OS-2026-0530',
      dataCalibracao: '2026-10-27',
      proximaCalibracao: '2027-10-27',
      localEndereco: 'Rodovia SP-191, km 37 – Zona Rural – Ipeúna/SP (portaria 1)',
    }),
    padroes: d.emissao.padroes,
    tecnico: 'Carlos Eduardo Lima',
    impressoEm: '2026-10-23T19:20:00.000Z',
    impressoPor: IMPRESSO_POR,
  }
}

export function folhaEmBranco(): DadosFolhaCampo {
  const d = exemploPlataforma()
  return {
    numero: 'FC-2026-00045',
    empresa: EMPRESA_PADRAO,
    cliente: null,
    balanca: null,
    calibracao: null,
    // Os padrões ativos da empresa, para marcar os levados e os usados
    padroes: [...d.emissao.padroes, ...exemploRodoviaria().emissao.padroes.filter((p) => p.tipo !== 'TERMOHIGROMETRO')],
    tecnico: '',
    impressoEm: '2026-10-21T12:00:00.000Z',
    impressoPor: IMPRESSO_POR,
  }
}

export function folhaRodoviariaSemHistorico(): DadosFolhaCampo {
  const d = exemploRodoviaria()
  const balanca: Balanca = {
    ...d.emissao.balanca,
    id: 'bal-rodo-saida',
    fabricante: 'Toledo do Brasil',
    modelo: '9098',
    numeroSerie: '9098-552301',
    identificacao: 'BR-02 (saída de açúcar)',
    plataformaFabricante: 'Toledo do Brasil',
    plataformaModelo: 'Conquista 21 m',
    plataformaSerie: '',
    faixas: [{ max: 60_000, e: 20, d: 20 }],
    min: 400,
    apoios: 6,
    dimensoes: '21,0 × 3,2 m',
    localInstalacao: 'Expedição — saída de açúcar',
    anoFabricacao: '2025',
  }
  // Primeira calibração desta balança: rascunho sem ensaios e sem conformidade pedida
  const calibracao: CalibracaoInput = {
    ...calibracaoVazia(),
    clienteId: d.emissao.cliente.id,
    balancaId: balanca.id,
    ordemServico: 'OS-2026-0534',
    dataCalibracao: '2026-10-28',
    local: 'CLIENTE',
    localEndereco: 'Rodovia SP-191, km 37 – Zona Rural – Ipeúna/SP (expedição)',
    padroesIds: d.emissao.padroes.map((p) => p.id),
  }
  return {
    numero: 'FC-2026-00046',
    empresa: EMPRESA_PADRAO,
    cliente: d.emissao.cliente,
    balanca,
    calibracao,
    padroes: d.emissao.padroes,
    tecnico: 'Carlos Eduardo Lima',
    impressoEm: '2026-10-23T19:40:00.000Z',
    impressoPor: IMPRESSO_POR,
  }
}
