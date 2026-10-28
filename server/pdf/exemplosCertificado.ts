// Três certificados de exemplo, realistas, para os testes do PDF e para as amostras em server/pdf/exemplos/:
//   1. plataforma Toledo 300 kg × 50 g, classe III, com reparo, ajuste ("como encontrado" + "como deixado")
//      e declaração de conformidade pela Portaria 157/2022 em serviço;
//   2. bancada 30 kg × 5 g, sem ajuste, histerese pela MÉDIA (exemplo numérico da pesquisa 02, §9),
//      calibrada no laboratório, executada e autorizada pela mesma pessoa, com opiniões;
//   3. rodoviária 80 t × 20 kg, 4 apoios, cargas de substituição, faixa parcial, revisão (substitui o nº …)
//      e marca d'água "PRÉVIA — SEM VALOR";
//   4. o pior caso, para conferir o limite de 3 páginas: rodoviária multi-intervalo 30/60/80 t, cargas de
//      substituição até Max, ajuste com "como encontrado" (também com substituição), reparo, revisão,
//      conformidade, 4 padrões, verificação preliminar com item "não", observações e opiniões;
//   5. classe I: analítica 220 g × 0,1 mg com pesos E2 pelo certificado (com a densidade), no local de uso,
//      ajuste interno logo depois do "como encontrado", empuxo pela densidade do ar medida e convecção calculada
//      pela diferença de temperatura pesos − ar (a frase no método do certificado).
// Os resultados saem do motor de cálculo de verdade (shared/calibracao.ts).

import { calcularCalibracao, montarCarga, montarPonto } from '#shared/calibracao.ts'
import { calibracaoVazia, EMPRESA_PADRAO, TEXTOS_PADRAO } from '#shared/dominio.ts'
import type {
  Balanca,
  Calibracao,
  Cliente,
  EmissaoCertificado,
  EnsaioIndicacao,
  MetodoCarregamento,
  Padrao,
  PesoPadrao,
  PontoIndicacao,
  Signatario,
  Unidade,
} from '#shared/tipos.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from './assinaturasExemplo.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

const CRIADO = '2026-01-10T12:00:00.000Z'

/** O POP de calibração da empresa (código e revisão registrados no sistema), como sai nos exemplos. */
export const POP_EXEMPLO = 'POP-CAL-01 rev. 00'

/** Os textos do certificado com o POP dos exemplos. */
const TEXTOS_EXEMPLO = { ...TEXTOS_PADRAO, procedimento: POP_EXEMPLO }

// ---- Cadastros comuns ------------------------------------------------------------------------------

function peso(id: string, marca: string, nominal: number, correcao: number, incerteza: number): PesoPadrao {
  return { id, marca, nominal, correcao, incerteza, k: 2 }
}

function padrao(p: Partial<Padrao> & Pick<Padrao, 'id' | 'tipo' | 'identificacao' | 'descricao'>): Padrao {
  return {
    versao: 1,
    fabricante: '',
    modelo: '',
    numeroSerie: '',
    classe: '',
    material: '',
    densidade: 0,
    uso: 'CERTIFICADO',
    pesos: [],
    certificado: '',
    laboratorio: '',
    acreditacao: '',
    dataCalibracao: '',
    validade: '',
    incertezaTexto: '',
    observacoes: '',
    ativo: true,
    criadoEm: CRIADO,
    atualizadoEm: CRIADO,
    ...p,
  }
}

/** 15 pesos de 20 kg, classe M1, ferro fundido (para cargas de até 300 kg). */
const PP20 = padrao({
  id: 'pad-pp20',
  tipo: 'PESOS',
  identificacao: 'PP20-01 a 15',
  descricao: 'Pesos padrão de 20 kg',
  fabricante: 'Coelmatic',
  classe: 'M1',
  material: 'Ferro fundido',
  densidade: 7100,
  pesos: Array.from({ length: 15 }, (_, i) =>
    peso(
      `pp20-${i + 1}`,
      `20 kg nº ${String(i + 1).padStart(2, '0')}`,
      20_000,
      [120, -80, 200, 40, -150, 90, 10, -60, 180, -20, 70, 130, -110, 50, 0][i],
      300,
    ),
  ),
  certificado: 'CAL-12345/2026',
  laboratorio: 'Laboratório Metrológico Paulista Ltda.',
  acreditacao: 'CAL 0383',
  dataCalibracao: '2026-03-10',
  validade: '2028-03-10',
})

/** Jogo de pesos 1 g a 10 kg, classe M1, aço inoxidável. */
const JP01 = padrao({
  id: 'pad-jp01',
  tipo: 'PESOS',
  identificacao: 'JP-01',
  descricao: 'Jogo de pesos padrão 1 g a 10 kg',
  fabricante: 'Toledo do Brasil',
  classe: 'M1',
  material: 'Aço inoxidável',
  densidade: 7950,
  pesos: [
    peso('jp01-10k', '10 kg', 10_000, 60, 160),
    peso('jp01-5k', '5 kg', 5_000, 35, 80),
    peso('jp01-2k', '2 kg', 2_000, -12, 30),
    peso('jp01-2kb', '2 kg*', 2_000, 18, 30),
    peso('jp01-1k', '1 kg', 1_000, 8, 16),
    peso('jp01-500', '500 g', 500, 4, 8),
    peso('jp01-200', '200 g', 200, 1.2, 3),
    peso('jp01-200b', '200 g*', 200, -1, 3),
    peso('jp01-100', '100 g', 100, 0.8, 1.6),
    peso('jp01-50', '50 g', 50, 0.3, 1),
    peso('jp01-20', '20 g', 20, 0.2, 0.8),
    peso('jp01-20b', '20 g*', 20, -0.1, 0.8),
    peso('jp01-10', '10 g', 10, 0.1, 0.6),
    peso('jp01-5', '5 g', 5, 0.05, 0.5),
    peso('jp01-2', '2 g', 2, 0.02, 0.4),
    peso('jp01-2b', '2 g*', 2, -0.03, 0.4),
    peso('jp01-1', '1 g', 1, 0.01, 0.3),
  ],
  certificado: 'CAL-12346/2026',
  laboratorio: 'Laboratório Metrológico Paulista Ltda.',
  acreditacao: 'CAL 0383',
  dataCalibracao: '2026-03-10',
  validade: '2028-03-10',
})

/** Pesos do exemplo numérico da pesquisa 02 (§9.1): 4 × 5 kg e 1 × 10 kg, M1, com certificado. */
const JP05 = padrao({
  id: 'pad-jp05',
  tipo: 'PESOS',
  identificacao: 'JP-05',
  descricao: 'Pesos padrão 5 kg e 10 kg',
  classe: 'M1',
  material: 'Aço inoxidável',
  densidade: 7950,
  pesos: [
    peso('5A', '5A', 5_000, 35, 80),
    peso('5B', '5B', 5_000, -20, 80),
    peso('5C', '5C', 5_000, 60, 80),
    peso('5D', '5D', 5_000, -45, 80),
    peso('10A', '10A', 10_000, 120, 160),
  ],
  certificado: '0981/2026',
  laboratorio: 'Calibra Massa Laboratório de Metrologia',
  acreditacao: 'CAL 0529',
  dataCalibracao: '2026-02-18',
  validade: '2027-08-18',
})

/** 20 pesos de 500 kg, classe M1 (10 t por etapa de substituição). */
const PP500 = padrao({
  id: 'pad-pp500',
  tipo: 'PESOS',
  identificacao: 'PP500-01 a 20',
  descricao: 'Pesos padrão de 500 kg (bloco)',
  classe: 'M1',
  material: 'Ferro fundido',
  densidade: 7100,
  pesos: Array.from({ length: 20 }, (_, i) =>
    peso(
      `pp500-${i + 1}`,
      `500 kg nº ${i + 1}`,
      500_000,
      [4000, -3000, 2500, 0, -1500, 3500, 1000, -2000, 500, 2000][i % 10],
      8000,
    ),
  ),
  certificado: 'CAL-20877/2025',
  laboratorio: 'Unical Calibrações Ltda.',
  acreditacao: 'CAL 0529',
  dataCalibracao: '2025-11-04',
  validade: '2027-11-04',
})

const TH01 = padrao({
  id: 'pad-th01',
  tipo: 'TERMOHIGROMETRO',
  identificacao: 'TH-01',
  descricao: 'Termo-higrômetro digital',
  fabricante: 'Incoterm',
  modelo: '7666.02.0.00',
  numeroSerie: '210455',
  certificado: 'T-4410/2026',
  laboratorio: 'Visomes Comercial Metrológica',
  acreditacao: 'CAL 0102',
  dataCalibracao: '2026-01-20',
  validade: '2027-01-20',
  incertezaTexto: 'U = 0,3 °C; 2,5 %UR',
})

const BR01 = padrao({
  id: 'pad-br01',
  tipo: 'BAROMETRO',
  identificacao: 'BR-01',
  descricao: 'Barômetro digital',
  fabricante: 'Vaisala',
  modelo: 'PTB110',
  numeroSerie: 'R3150078',
  certificado: 'P-0773/2025',
  laboratorio: 'Visomes Comercial Metrológica',
  acreditacao: 'CAL 0102',
  dataCalibracao: '2025-12-02',
  validade: '2026-12-02',
  incertezaTexto: 'U = 0,4 hPa',
})

/**
 * Jogo de pesos E2, 10 mg a 200 g, aço inoxidável (balanças classe I): pelo certificado, com a densidade e a
 * incerteza padrão dela (U/2 do certificado). As correções e as incertezas (mg) ficam abaixo de 1/3 do EMA.
 */
const JE2 = padrao({
  id: 'pad-je2',
  tipo: 'PESOS',
  identificacao: 'JE2-01',
  descricao: 'Jogo de pesos padrão 10 mg a 200 g',
  fabricante: 'Häfner',
  classe: 'E2',
  material: 'Aço inoxidável',
  densidade: 7950,
  incertezaDensidade: 70,
  pesos: [
    peso('je2-200', '200 g', 200, 0.06, 0.1),
    peso('je2-100', '100 g', 100, -0.03, 0.05),
    peso('je2-50', '50 g', 50, 0.02, 0.03),
    peso('je2-20', '20 g', 20, 0.01, 0.025),
    peso('je2-20b', '20 g*', 20, -0.008, 0.025),
    peso('je2-10', '10 g', 10, 0.006, 0.02),
    peso('je2-5', '5 g', 5, -0.004, 0.016),
    peso('je2-2', '2 g', 2, 0.003, 0.012),
    peso('je2-2b', '2 g*', 2, -0.002, 0.012),
    peso('je2-1', '1 g', 1, 0.002, 0.01),
    peso('je2-500m', '500 mg', 0.5, 0.002, 0.008),
    peso('je2-200m', '200 mg', 0.2, -0.001, 0.006),
    peso('je2-200mb', '200 mg*', 0.2, 0.001, 0.006),
    peso('je2-100m', '100 mg', 0.1, 0, 0.005),
    peso('je2-50m', '50 mg', 0.05, 0.001, 0.004),
    peso('je2-20m', '20 mg', 0.02, 0, 0.003),
    peso('je2-20mb', '20 mg*', 0.02, -0.001, 0.003),
    peso('je2-10m', '10 mg', 0.01, 0, 0.0025),
  ],
  certificado: 'M-0412/2026',
  laboratorio: 'Calibra Massa Laboratório de Metrologia',
  acreditacao: 'CAL 0529',
  dataCalibracao: '2026-04-15',
  validade: '2027-04-15',
})

/** Termômetro digital de duas entradas (classe I: pesos × ar), cadastrado como "outro" (POP 6.2). */
const TD01 = padrao({
  id: 'pad-td01',
  tipo: 'OUTRO',
  identificacao: 'TD-01',
  descricao: 'Termômetro digital de duas entradas',
  fabricante: 'Fluke',
  modelo: '54-II B',
  numeroSerie: '4387211',
  certificado: 'T-4602/2026',
  laboratorio: 'Visomes Comercial Metrológica',
  acreditacao: 'CAL 0102',
  dataCalibracao: '2026-02-11',
  validade: '2027-02-11',
  incertezaTexto: 'U = 0,1 °C',
})

function cliente(c: Partial<Cliente> & Pick<Cliente, 'id' | 'nome'>): Cliente {
  return {
    versao: 1,
    tipo: 'PJ',
    razaoSocial: '',
    documento: '',
    inscricaoEstadual: '',
    contato: '',
    telefone: '',
    celular: '',
    email: '',
    emailCertificados: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    situacaoCadastral: '',
    observacoes: '',
    ativo: true,
    criadoEm: CRIADO,
    atualizadoEm: CRIADO,
    ...c,
  }
}

function balanca(b: Partial<Balanca> & Pick<Balanca, 'id' | 'clienteId' | 'tipo' | 'faixas'>): Balanca {
  return {
    versao: 1,
    fabricante: '',
    modelo: '',
    numeroSerie: '',
    identificacao: '',
    plataformaFabricante: '',
    plataformaModelo: '',
    plataformaSerie: '',
    unidade: 'kg',
    tipoFaixas: 'UNICA',
    min: 0,
    classe: 'III',
    portariaAprovacao: '',
    receptor: 'RETANGULAR',
    apoios: 4,
    dimensoes: '',
    finalidade: '',
    localInstalacao: '',
    anoFabricacao: '',
    observacoes: '',
    ativo: true,
    criadoEm: CRIADO,
    atualizadoEm: CRIADO,
    ...b,
  }
}

const TECNICO: Signatario = {
  id: 'usr-carlos',
  nome: 'Carlos Eduardo Lima',
  cargo: 'Técnico em metrologia',
  registro: 'CFT 12345678901',
  assinatura: ASSINATURA_EXEMPLO_2,
}

const RESPONSAVEL: Signatario = {
  id: 'usr-fabio',
  nome: 'Fábio de Godoy Lima',
  cargo: 'Responsável técnico',
  registro: 'CREA-SP 5062345678',
  assinatura: ASSINATURA_EXEMPLO_1,
}

// ---- Montagem ---------------------------------------------------------------------------------------

/** Ponto do erro de indicação com os pesos montados automaticamente (do maior para o menor). */
function ponto(
  id: string,
  carga: number,
  crescente: number | null,
  decrescente: number | null,
  padroes: Padrao[],
  unidade: Unidade,
  extra: Partial<PontoIndicacao> = {},
): PontoIndicacao {
  const pecas = carga > 0 ? montarCarga(carga, unidade, padroes).pecas : []
  return { id, carga, pecas, pecasManuais: false, crescente, decrescente, nivelSubstituicao: 0, ...extra }
}

function ensaio(metodo: MetodoCarregamento, pontos: PontoIndicacao[], retornoZero: number | null = null): EnsaioIndicacao {
  return { metodo, pontos, retornoZero, substituicao: { ativa: false, pecas: [], etapas: [] } }
}

function montar(
  calibracao: Calibracao,
  emissao: EmissaoCertificado,
  extra: Partial<Pick<DadosCertificadoPdf, 'marcaDagua' | 'previa'>> = {},
): DadosCertificadoPdf {
  const { resultado, comoEncontrado } = calcularCalibracao(calibracao, emissao.balanca, emissao.padroes)
  return {
    calibracao: { ...calibracao, emissao },
    emissao,
    resultado,
    comoEncontrado,
    marcaDagua: extra.marcaDagua ?? '',
    ...(extra.previa ? { previa: true } : {}),
  }
}

function calibracaoBase(id: string): Calibracao {
  return {
    ...calibracaoVazia(),
    id,
    versao: 3,
    status: 'EMITIDO',
    numero: '',
    ano: 2026,
    sequencia: null,
    revisao: 0,
    cancelamento: null,
    emissao: null,
    criadoPor: 'usr-carlos',
    criadoEm: '2026-10-01T12:00:00.000Z',
    atualizadoEm: '2026-10-14T12:00:00.000Z',
  }
}

// ---- 1. Plataforma Toledo 300 kg × 50 g ----------------------------------------------------------

export function exemploPlataforma(): DadosCertificadoPdf {
  const padroes = [PP20, JP01, TH01]
  const pesos = [PP20, JP01]
  const b = balanca({
    id: 'bal-toledo',
    clienteId: 'cli-frigo',
    tipo: 'PLATAFORMA',
    fabricante: 'Toledo do Brasil',
    modelo: '9091',
    numeroSerie: '9091-118832',
    identificacao: 'BAL-EXP-07',
    plataformaFabricante: 'Toledo do Brasil',
    plataformaModelo: '2180',
    plataformaSerie: '2180-0041273',
    faixas: [{ max: 300, e: 0.05, d: 0.05 }],
    min: 1,
    classe: 'III',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0236/2009',
    receptor: 'RETANGULAR',
    dimensoes: '100 × 100 cm',
    finalidade: 'PROCESSO',
    localInstalacao: 'Expedição — doca 2',
    anoFabricacao: '2019',
  })
  const c = cliente({
    id: 'cli-frigo',
    nome: 'Frigorífico Vale do Corumbataí',
    razaoSocial: 'FRIGORÍFICO VALE DO CORUMBATAÍ LTDA',
    documento: '11.444.777/0001-61',
    contato: 'Juliana Prado (Qualidade)',
    telefone: '(19) 3524-1100',
    email: 'qualidade@valecorumbatai.com.br',
    cep: '13505-200',
    logradouro: 'Avenida Brasil',
    numero: '2450',
    bairro: 'Jardim Paulista',
    cidade: 'Rio Claro',
    uf: 'SP',
  })
  const k: Calibracao = {
    ...calibracaoBase('cal-toledo'),
    numero: 'CC-2026-00123',
    sequencia: 123,
    clienteId: c.id,
    balancaId: b.id,
    ordemServico: 'OS-2026-0456',
    dataCalibracao: '2026-10-13',
    dataEmissao: '2026-10-14',
    local: 'CLIENTE',
    localEndereco: 'Avenida Brasil, 2450 – Jardim Paulista – Rio Claro/SP (expedição)',
    tecnicoId: TECNICO.id,
    signatarioId: RESPONSAVEL.id,
    padroesIds: padroes.map((p) => p.id),
    ambiente: { temperaturaInicial: 22.4, temperaturaFinal: 23.1, umidadeInicial: 58, umidadeFinal: 56, pressao: null },
    ajuste: { realizado: 'EXTERNO', descricao: 'ajuste de span com 200 kg de pesos padrão, após a troca da célula de carga' },
    comoEncontrado: ensaio('CONTINUO', [
      ponto('ce0', 0, 0, null, pesos, 'kg'),
      ponto('ce1', 50, 50.1, null, pesos, 'kg'),
      ponto('ce2', 100, 100.2, null, pesos, 'kg'),
      ponto('ce3', 200, 200.4, null, pesos, 'kg'),
      ponto('ce4', 300, 300.65, null, pesos, 'kg'),
    ]),
    repetibilidade: [{ id: 'rep1', carga: 150, leituras: [150, 150.05, 150, 150, 150.05] }],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: 100,
      metodo: 1,
      posicoes: [
        { rotulo: 'Centro', leitura: 100, referencia: null },
        { rotulo: 'Frente esquerda', leitura: 100.05, referencia: null },
        { rotulo: 'Trás esquerda', leitura: 100, referencia: null },
        { rotulo: 'Trás direita', leitura: 99.95, referencia: null },
        { rotulo: 'Frente direita', leitura: 100.05, referencia: null },
      ],
    },
    indicacao: ensaio(
      'CRESCENTE_DECRESCENTE',
      [
        ponto('p0', 0, 0, 0, pesos, 'kg'),
        // Min (1 kg), marcada na plaqueta, entre as cargas
        ponto('pmin', 1, 1, 1, pesos, 'kg'),
        ponto('p1', 10, 10, 10, pesos, 'kg'),
        ponto('p2', 50, 50, 50.05, pesos, 'kg'),
        ponto('p3', 100, 100, 100.05, pesos, 'kg'),
        ponto('p4', 150, 150.05, 150.05, pesos, 'kg'),
        ponto('p5', 200, 200.05, 200.05, pesos, 'kg'),
        ponto('p6', 300, 300.05, 300.05, pesos, 'kg'),
      ],
      0,
    ),
    conformidade: { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'BANDA_GUARDA' },
    proximaCalibracao: '2027-10-13',
    proximaNoCertificado: true,
    reparo: {
      houve: true,
      descricao: 'troca da célula de carga e da caixa de junção',
      marcaReparo: 'MR-SP 004512',
      selosRetirados: '118832-A e 118832-B',
      selosColocados: '0457712 e 0457713',
    },
    observacoes: 'Balança utilizada na expedição para conferência de cargas paletizadas.',
  }
  const e: EmissaoCertificado = {
    emitidoEm: '2026-10-14T13:42:00.000Z',
    emitidoPor: RESPONSAVEL.id,
    codigo: '7KQ2-9XHM',
    hashPdf: '',
    arquivo: '',
    empresa: EMPRESA_PADRAO,
    cliente: c,
    balanca: b,
    padroes,
    tecnico: TECNICO,
    signatario: RESPONSAVEL,
    textos: TEXTOS_EXEMPLO,
    substituiNumero: '',
    substituiEmissao: '',
  }
  return montar(k, e)
}

// ---- 2. Bancada 30 kg × 5 g -----------------------------------------------------------------------

export function exemploBancada(): DadosCertificadoPdf {
  const padroes = [JP05, TH01]
  const pesos = [JP05]
  const b = balanca({
    id: 'bal-bancada',
    clienteId: 'cli-maria',
    tipo: 'BALCAO',
    fabricante: 'Ramuza',
    modelo: 'DP-30',
    numeroSerie: 'R30-55871',
    identificacao: 'Caixa 1',
    faixas: [{ max: 30, e: 0.005, d: 0.005 }],
    min: 0.1,
    classe: 'III',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0109/2014',
    receptor: 'CIRCULAR',
    dimensoes: 'prato Ø 34 cm',
    finalidade: 'COMERCIAL',
    localInstalacao: 'Balcão de frios',
    anoFabricacao: '2021',
  })
  const c = cliente({
    id: 'cli-maria',
    tipo: 'PF',
    nome: 'Maria Aparecida de Souza',
    documento: '529.982.247-25',
    contato: 'Maria Aparecida',
    celular: '(19) 99812-4470',
    cep: '13504-016',
    logradouro: 'Rua 6',
    numero: '1380',
    complemento: 'loja 2',
    bairro: 'Centro',
    cidade: 'Rio Claro',
    uf: 'SP',
  })
  const k: Calibracao = {
    ...calibracaoBase('cal-bancada'),
    numero: 'CC-2026-00124',
    sequencia: 124,
    clienteId: c.id,
    balancaId: b.id,
    ordemServico: 'OS-2026-0461',
    dataCalibracao: '2026-10-14',
    dataEmissao: '2026-10-14',
    dataRecebimento: '2026-10-13',
    local: 'LABORATORIO',
    localEndereco: 'Rua 13, nº 650 – Boa Morte – Rio Claro/SP',
    tecnicoId: RESPONSAVEL.id,
    signatarioId: RESPONSAVEL.id,
    padroesIds: padroes.map((p) => p.id),
    // Sem barômetro entre os padrões: a pressão não foi medida
    ambiente: { temperaturaInicial: 21, temperaturaFinal: 22.5, umidadeInicial: 55, umidadeFinal: 54, pressao: null },
    preliminar: {
      identificavel: 'SIM',
      limpa: 'SIM',
      nivelada: 'SIM',
      aquecida: 'SIM',
      preCarga: 'SIM',
      zeroAutomatico: 'LIGADO',
    },
    repetibilidade: [{ id: 'rep1', carga: 15, leituras: [15, 15.005, 15, 15, 15.005, 15] }],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: 10,
      metodo: 1,
      posicoes: [
        { rotulo: 'Centro', leitura: 10, referencia: null },
        { rotulo: 'Frente (0°)', leitura: 10.005, referencia: null },
        { rotulo: 'Direita (90°)', leitura: 10, referencia: null },
        { rotulo: 'Trás (180°)', leitura: 9.995, referencia: null },
        { rotulo: 'Esquerda (270°)', leitura: 10.005, referencia: null },
      ],
    },
    indicacao: ensaio(
      'CRESCENTE_DECRESCENTE',
      [
        ponto('p0', 0, 0, 0, pesos, 'kg'),
        ponto('p1', 5, 5, 5.005, pesos, 'kg'),
        ponto('p2', 10, 10.005, 10.005, pesos, 'kg'),
        ponto('p3', 15, 15.005, 15.01, pesos, 'kg'),
        ponto('p4', 20, 20.005, 20.01, pesos, 'kg'),
        ponto('p5', 30, 30.01, 30.01, pesos, 'kg'),
      ],
      0,
    ),
    opcoes: { ...calibracaoVazia().opcoes, histerese: 'MEDIA' },
    opinioes:
      'Os erros encontrados são pequenos em relação à divisão da balança. Para uso comercial, a balança deve estar com a verificação periódica do IPEM-SP em dia.',
  }
  const e: EmissaoCertificado = {
    emitidoEm: '2026-10-14T18:05:00.000Z',
    emitidoPor: RESPONSAVEL.id,
    codigo: 'M4TR-8C2D',
    hashPdf: '',
    arquivo: '',
    empresa: EMPRESA_PADRAO,
    cliente: c,
    balanca: b,
    padroes,
    tecnico: { ...RESPONSAVEL, assinatura: '' },
    signatario: { ...RESPONSAVEL, assinatura: '' },
    textos: TEXTOS_EXEMPLO,
    substituiNumero: '',
    substituiEmissao: '',
  }
  return montar(k, e)
}

// ---- 3. Rodoviária 80 t × 20 kg (revisão, prévia) ----------------------------------------------------

export function exemploRodoviaria(): DadosCertificadoPdf {
  const padroes = [PP500, TH01, BR01]
  const pesos = [PP500]
  const b = balanca({
    id: 'bal-rodo',
    clienteId: 'cli-usina',
    tipo: 'RODOVIARIA',
    fabricante: 'Weightech',
    modelo: 'WT3000-i Plus',
    numeroSerie: 'WT3K-77120',
    identificacao: 'BR-01 (portaria)',
    plataformaFabricante: 'Weightech',
    plataformaModelo: 'WT-RD 80',
    plataformaSerie: 'WT-1990-0457',
    faixas: [{ max: 80_000, e: 20, d: 20 }],
    min: 400,
    classe: 'III',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0315/2013',
    receptor: 'RODOVIARIA',
    apoios: 4,
    dimensoes: '18,0 × 3,0 m',
    finalidade: 'COMERCIAL',
    localInstalacao: 'Portaria 1 — entrada de cana',
    anoFabricacao: '2016',
  })
  const c = cliente({
    id: 'cli-usina',
    nome: 'Usina São Bento',
    razaoSocial: 'USINA SÃO BENTO AÇÚCAR E ETANOL S.A.',
    documento: '45.723.174/0001-10',
    contato: 'Eng. Ricardo Menezes (Manutenção)',
    telefone: '(19) 3545-7700',
    email: 'manutencao@usinasaobento.com.br',
    cep: '13520-000',
    logradouro: 'Rodovia SP-191, km 37',
    numero: 's/n',
    bairro: 'Zona Rural',
    cidade: 'Ipeúna',
    uf: 'SP',
  })
  const L = 10_000
  const etapa = (padroesLeitura: number, substituicao: number) => ({
    leituraPadroes: padroesLeitura,
    leituraSubstituicao: substituicao,
  })
  const indicacao: EnsaioIndicacao = {
    metodo: 'CONTINUO',
    retornoZero: 20,
    pontos: [
      ponto('p0', 0, 0, null, pesos, 'kg'),
      ponto('p1', 5_000, 5_000, null, pesos, 'kg'),
      ponto('p2', L, 10_000, null, pesos, 'kg'),
      ponto('p3', 2 * L, 20_020, null, pesos, 'kg', { nivelSubstituicao: 1, carga: 2 * L }),
      ponto('p4', 3 * L, 30_020, null, pesos, 'kg', { nivelSubstituicao: 2, carga: 3 * L }),
      ponto('p5', 4 * L, 40_040, null, pesos, 'kg', { nivelSubstituicao: 3, carga: 4 * L }),
    ],
    substituicao: {
      ativa: true,
      pecas: montarCarga(L, 'kg', pesos).pecas,
      etapas: [etapa(10_000, 10_020), etapa(20_020, 20_000), etapa(30_020, 30_040)],
    },
  }
  // Nos pontos com substituição, os pesos aplicados por cima são os mesmos 10 t
  for (const p of indicacao.pontos) if (p.nivelSubstituicao > 0) p.pecas = montarCarga(L, 'kg', pesos).pecas
  const k: Calibracao = {
    ...calibracaoBase('cal-rodo'),
    numero: 'CC-2026-00098-R1',
    sequencia: 98,
    revisao: 1,
    clienteId: c.id,
    balancaId: b.id,
    ordemServico: 'OS-2026-0388',
    dataCalibracao: '2026-09-29',
    dataEmissao: '2026-10-14',
    local: 'CLIENTE',
    localEndereco: 'Rodovia SP-191, km 37 – Zona Rural – Ipeúna/SP (portaria 1)',
    tecnicoId: TECNICO.id,
    signatarioId: RESPONSAVEL.id,
    padroesIds: padroes.map((p) => p.id),
    ambiente: { temperaturaInicial: 26.8, temperaturaFinal: 31.2, umidadeInicial: 48, umidadeFinal: 39, pressao: 941 },
    preliminar: {
      identificavel: 'SIM',
      limpa: 'SIM',
      nivelada: 'NA',
      aquecida: 'SIM',
      preCarga: 'SIM',
      zeroAutomatico: 'DESLIGADO',
    },
    repetibilidade: [{ id: 'rep1', carga: L, leituras: [10_000, 10_000, 10_020] }],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: L,
      metodo: 1,
      posicoes: [
        { rotulo: 'Início (ida)', leitura: 10_000, referencia: null },
        { rotulo: 'Meio (ida)', leitura: 10_020, referencia: null },
        { rotulo: 'Fim (ida)', leitura: 10_000, referencia: null },
        { rotulo: 'Início (volta)', leitura: 10_000, referencia: null },
        { rotulo: 'Meio (volta)', leitura: 9_980, referencia: null },
        { rotulo: 'Fim (volta)', leitura: 10_000, referencia: null },
      ],
    },
    indicacao,
    conformidade: { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 60, regra: 'SIMPLES' },
    substituiId: 'cal-rodo-original',
    motivoRevisao: 'correção do número de série do indicador, transcrito com erro no certificado original',
    observacoes:
      'Carga de substituição: caminhão basculante carregado com areia, posicionado conforme as marcações da plataforma.',
  }
  const e: EmissaoCertificado = {
    emitidoEm: '2026-10-14T19:10:00.000Z',
    emitidoPor: RESPONSAVEL.id,
    codigo: 'R8WN-3QTA',
    hashPdf: '',
    arquivo: '',
    empresa: EMPRESA_PADRAO,
    cliente: c,
    balanca: b,
    padroes,
    tecnico: TECNICO,
    signatario: RESPONSAVEL,
    textos: TEXTOS_EXEMPLO,
    substituiNumero: 'CC-2026-00098',
    substituiEmissao: '2026-09-30T14:20:00.000Z',
  }
  // A prévia, como o sistema a gera para o rascunho: sem as imagens das assinaturas e sem "emitido em"
  return montar(k, e, { marcaDagua: 'PRÉVIA — SEM VALOR', previa: true })
}

// ---- 4. Pior caso: rodoviária multi-intervalo 30/60/80 t (ajuste, substituição, conformidade) ---------

export function exemploPiorCaso(): DadosCertificadoPdf {
  const padroes = [PP500, PP20, TH01, BR01]
  const pesos = [PP500, PP20]
  const b = balanca({
    id: 'bal-rodo-multi',
    clienteId: 'cli-coop',
    tipo: 'RODOVIARIA',
    fabricante: 'Toledo do Brasil',
    modelo: '9098 Plus',
    numeroSerie: '9098-773104',
    identificacao: 'BR-03 (balança de saída)',
    plataformaFabricante: 'Toledo do Brasil',
    plataformaModelo: 'Conquista 24 m',
    plataformaSerie: 'CQ24-2021-0088',
    tipoFaixas: 'MULTI_INTERVALO',
    faixas: [
      { max: 30_000, e: 10, d: 10 },
      { max: 60_000, e: 20, d: 20 },
      { max: 80_000, e: 50, d: 50 },
    ],
    min: 200,
    classe: 'III',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0098/2019',
    receptor: 'RODOVIARIA',
    apoios: 8,
    dimensoes: '24,0 × 3,2 m',
    finalidade: 'COMERCIAL',
    localInstalacao: 'Expedição — saída de grãos, portaria 2',
    anoFabricacao: '2021',
  })
  const c = cliente({
    id: 'cli-coop',
    nome: 'Coopervale',
    razaoSocial: 'COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES DO VALE DO CORUMBATAÍ',
    documento: '33.592.510/0001-54',
    contato: 'Eng. Paula Ribeiro (Qualidade e Metrologia)',
    telefone: '(19) 3526-4400',
    email: 'metrologia@coopervale.coop.br',
    cep: '13505-600',
    logradouro: 'Rodovia Washington Luís (SP-310), km 182,5',
    numero: 's/n',
    complemento: 'galpão 14',
    bairro: 'Distrito Industrial Norte',
    cidade: 'Rio Claro',
    uf: 'SP',
  })
  const L = 10_000
  /** Ponto com `nivel` etapas de substituição por baixo e os pesos por cima completando a carga. */
  const comNivel = (id: string, carga: number, nivel: number, leituraCrescente: number): PontoIndicacao => ({
    ...ponto(id, carga, leituraCrescente, null, pesos, 'kg', { nivelSubstituicao: nivel }),
    pecas: montarPonto(carga, nivel, L, 'kg', pesos).pecas,
  })
  const etapas = (leituras: Array<[number, number]>) =>
    leituras.map(([leituraPadroes, leituraSubstituicao]) => ({ leituraPadroes, leituraSubstituicao }))
  const indicacao: EnsaioIndicacao = {
    metodo: 'CONTINUO',
    retornoZero: 0,
    pontos: [
      ponto('p0', 0, 0, null, pesos, 'kg'),
      ponto('p1', 2_000, 2_000, null, pesos, 'kg'),
      ponto('p2', 5_000, 5_000, null, pesos, 'kg'),
      ponto('p3', L, 10_000, null, pesos, 'kg'),
      comNivel('p4', 2 * L, 1, 20_010),
      comNivel('p5', 3 * L, 2, 30_010),
      comNivel('p6', 4 * L, 3, 40_020),
      comNivel('p7', 5 * L, 4, 50_020),
      comNivel('p8', 6 * L, 5, 60_040),
      comNivel('p9', 7 * L, 6, 70_050),
      comNivel('p10', 8 * L, 7, 80_050),
    ],
    substituicao: {
      ativa: true,
      pecas: montarCarga(L, 'kg', pesos).pecas,
      etapas: etapas([
        [10_000, 10_010],
        [20_010, 20_000],
        [30_000, 30_010],
        [40_020, 40_000],
        [50_000, 50_020],
        [60_040, 60_000],
        [70_000, 70_050],
      ]),
    },
  }
  const comoEncontrado: EnsaioIndicacao = {
    metodo: 'CONTINUO',
    retornoZero: 20,
    pontos: [
      ponto('a0', 0, 0, null, pesos, 'kg'),
      ponto('a1', L, 10_020, null, pesos, 'kg'),
      comNivel('a2', 2 * L, 1, 20_040),
      comNivel('a3', 4 * L, 3, 40_100),
      comNivel('a4', 6 * L, 5, 60_160),
      comNivel('a5', 8 * L, 7, 80_250),
    ],
    substituicao: {
      ativa: true,
      pecas: montarCarga(L, 'kg', pesos).pecas,
      etapas: etapas([
        [10_020, 10_010],
        [20_030, 20_020],
        [30_040, 30_020],
        [40_080, 40_060],
        [50_100, 50_080],
        [60_140, 60_100],
        [70_200, 70_150],
      ]),
    },
  }
  const k: Calibracao = {
    ...calibracaoBase('cal-pior'),
    numero: 'CC-2026-00131-R1',
    sequencia: 131,
    revisao: 1,
    clienteId: c.id,
    balancaId: b.id,
    ordemServico: 'OS-2026-0541',
    dataCalibracao: '2026-10-20',
    dataEmissao: '2026-10-22',
    local: 'CLIENTE',
    localEndereco:
      'Rodovia Washington Luís (SP-310), km 182,5, galpão 14 – Distrito Industrial Norte – Rio Claro/SP (portaria 2)',
    tecnicoId: TECNICO.id,
    signatarioId: RESPONSAVEL.id,
    padroesIds: padroes.map((p) => p.id),
    ambiente: { temperaturaInicial: 24.6, temperaturaFinal: 29.8, umidadeInicial: 61, umidadeFinal: 47, pressao: 938 },
    preliminar: {
      identificavel: 'SIM',
      limpa: 'SIM',
      nivelada: 'NA',
      aquecida: 'SIM',
      preCarga: 'NAO',
      zeroAutomatico: 'DESLIGADO',
    },
    ajuste: { realizado: 'EXTERNO', descricao: 'ajuste de span com 10 000 kg de pesos padrão, após a troca das células' },
    comoEncontrado,
    repetibilidade: [{ id: 'rep1', carga: L, leituras: [10_000, 10_010, 10_000, 10_000, 10_010] }],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: L,
      metodo: 1,
      posicoes: [
        { rotulo: 'Início (ida)', leitura: 10_000, referencia: null },
        { rotulo: 'Meio (ida)', leitura: 10_010, referencia: null },
        { rotulo: 'Fim (ida)', leitura: 10_000, referencia: null },
        { rotulo: 'Início (volta)', leitura: 10_010, referencia: null },
        { rotulo: 'Meio (volta)', leitura: 9_990, referencia: null },
        { rotulo: 'Fim (volta)', leitura: 10_000, referencia: null },
      ],
    },
    indicacao,
    conformidade: { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'SIMPLES' },
    proximaCalibracao: '2027-10-20',
    proximaNoCertificado: true,
    reparo: {
      houve: true,
      descricao: 'troca de duas células de carga e do cabo de ligação ao indicador',
      marcaReparo: 'MR-SP 004611',
      selosRetirados: '773104-A e 773104-B',
      selosColocados: '0461120 e 0461121',
    },
    substituiId: 'cal-pior-original',
    motivoRevisao: 'inclusão do resultado “como encontrado”, omitido no certificado original',
    observacoes:
      'Cargas de substituição: caminhão graneleiro carregado com milho, posicionado conforme as marcações da plataforma. Pré-carga perto de Max não aplicada: o material de substituição não chegava a 80 t antes do ensaio.',
    opinioes:
      'Os erros encontrados antes do ajuste ultrapassavam o EMA em serviço acima de 40 t; recomenda-se verificar as pesagens de saída do período desde a última calibração.',
  }
  const e: EmissaoCertificado = {
    emitidoEm: '2026-10-22T14:30:00.000Z',
    emitidoPor: RESPONSAVEL.id,
    codigo: 'P1OR-CA5O',
    hashPdf: '',
    arquivo: '',
    empresa: EMPRESA_PADRAO,
    cliente: c,
    balanca: b,
    padroes,
    tecnico: TECNICO,
    signatario: RESPONSAVEL,
    textos: TEXTOS_EXEMPLO,
    substituiNumero: 'CC-2026-00131',
    substituiEmissao: '2026-10-21T12:10:00.000Z',
  }
  return montar(k, e)
}

// ---- 5. Classe I: analítica 220 g × 0,1 mg (empuxo pela densidade do ar, convecção) -----------------------

/**
 * Analítica classe I no local de uso, com pesos E2 pelo certificado: "como encontrado", ajuste interno logo em
 * seguida (POP 7.11) e os ensaios depois do ajuste. Empuxo pela densidade do ar medida (temperatura, umidade e
 * pressão) e convecção pela diferença de temperatura pesos − ar medida antes do 1º ensaio: as opções da classe I.
 * Os pontos são os sugeridos pelo sistema (0, Min, ~25 %… em múltiplos de 10 g, sem peças menores que 10 g e
 * dentro de 1/3 do EMA com os pesos E2 — 160 g = 100 g + 50 g + 10 g, e não 170 g = 100 g + 50 g + 20 g —, e as
 * cargas onde muda o EMA: 50 g e 200 g); a repetibilidade com 10 leituras de uma peça só, e a excentricidade com
 * uma peça de 1/3 de Max ou mais, pelo método 3 (zera antes de cada posição).
 */
export function exemploClasseI(): DadosCertificadoPdf {
  const padroes = [JE2, TH01, BR01, TD01]
  const pesos = [JE2]
  const b = balanca({
    id: 'bal-analitica',
    clienteId: 'cli-farma',
    tipo: 'ANALITICA',
    fabricante: 'Shimadzu',
    modelo: 'AUY220',
    numeroSerie: 'D450120387',
    identificacao: 'BA-03 (CQ)',
    unidade: 'g',
    faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
    min: 0.01,
    classe: 'I',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0270/2011',
    receptor: 'CIRCULAR',
    dimensoes: 'prato Ø 80 mm',
    finalidade: 'LABORATORIO',
    localInstalacao: 'Controle de qualidade — sala de balanças',
    anoFabricacao: '2020',
  })
  const c = cliente({
    id: 'cli-farma',
    nome: 'Farmacêutica Horto',
    razaoSocial: 'LABORATÓRIO FARMACÊUTICO HORTO FLORESTAL LTDA',
    documento: '61.827.504/0001-74',
    contato: 'Camila Torres (Garantia da Qualidade)',
    telefone: '(19) 3522-8800',
    email: 'qualidade@farmahorto.com.br',
    cep: '13506-900',
    logradouro: 'Avenida Navarro de Andrade',
    numero: '1200',
    bairro: 'Horto Florestal',
    cidade: 'Rio Claro',
    uf: 'SP',
  })
  const g = (id: string, carga: number, leitura: number) => ponto(id, carga, leitura, null, pesos, 'g')
  const k: Calibracao = {
    ...calibracaoBase('cal-analitica'),
    numero: 'CC-2026-00132',
    sequencia: 132,
    clienteId: c.id,
    balancaId: b.id,
    ordemServico: 'OS-2026-0547',
    dataCalibracao: '2026-10-26',
    dataEmissao: '2026-10-27',
    local: 'CLIENTE',
    localEndereco: 'Avenida Navarro de Andrade, 1200 – Horto Florestal – Rio Claro/SP (controle de qualidade)',
    tecnicoId: TECNICO.id,
    signatarioId: RESPONSAVEL.id,
    padroesIds: padroes.map((p) => p.id),
    // Pressão absoluta do local (Rio Claro, ≈ 612 m), lida no barômetro; ΔT pesos − ar com o termômetro TD-01
    ambiente: {
      temperaturaInicial: 22.4,
      temperaturaFinal: 22.9,
      umidadeInicial: 54,
      umidadeFinal: 55,
      pressao: 942,
      deltaTPesos: 0.3,
    },
    preliminar: {
      identificavel: 'SIM',
      limpa: 'SIM',
      nivelada: 'SIM',
      aquecida: 'SIM',
      preCarga: 'SIM',
      zeroAutomatico: 'LIGADO',
    },
    // Ajuste interno logo após o "como encontrado" (POP 7.11): o ensaio final é o de logo após um ajuste
    ajuste: { realizado: 'INTERNO', descricao: '' },
    comoEncontrado: ensaio('DESCONTINUO', [
      g('ce0', 0, 0),
      g('ce1', 50, 50.0003),
      g('ce2', 110, 110.0006),
      g('ce3', 160, 160.0009),
      g('ce4', 220, 220.0012),
    ]),
    repetibilidade: [
      {
        id: 'rep1',
        carga: 200,
        leituras: [200.0003, 200.0004, 200.0003, 200.0003, 200.0002, 200.0003, 200.0004, 200.0003, 200.0003, 200.0002],
      },
    ],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: 100,
      metodo: 3,
      posicoes: [
        { rotulo: 'Centro', leitura: 100.0001, referencia: 0 },
        { rotulo: 'Frente (0°)', leitura: 100.0003, referencia: 0 },
        { rotulo: 'Direita (90°)', leitura: 100.0002, referencia: 0.0001 },
        { rotulo: 'Trás (180°)', leitura: 100.0001, referencia: 0 },
        { rotulo: 'Esquerda (270°)', leitura: 100.0002, referencia: 0 },
      ],
    },
    indicacao: ensaio(
      'DESCONTINUO',
      [
        g('p0', 0, 0),
        // Min (10 mg), marcada na plaqueta
        g('pmin', 0.01, 0.01),
        g('p1', 50, 50.0001),
        g('p2', 60, 60.0001),
        g('p3', 110, 110.0002),
        g('p4', 160, 160.0002),
        g('p5', 200, 200.0003),
        g('p6', 220, 220.0003),
      ],
      0,
    ),
    // As opções da classe I: empuxo pela densidade do ar medida e convecção calculada (deriva: o padrão, EMA)
    opcoes: { ...calibracaoVazia().opcoes, empuxo: 'MEDIDO', conveccao: 'CALCULAR' },
    observacoes: 'Calibração no local de uso, com a capela fechada em todas as leituras.',
  }
  const e: EmissaoCertificado = {
    emitidoEm: '2026-10-27T13:20:00.000Z',
    emitidoPor: RESPONSAVEL.id,
    codigo: 'K7AN-2LTC',
    hashPdf: '',
    arquivo: '',
    empresa: EMPRESA_PADRAO,
    cliente: c,
    balanca: b,
    padroes,
    tecnico: TECNICO,
    signatario: RESPONSAVEL,
    textos: TEXTOS_EXEMPLO,
    substituiNumero: '',
    substituiEmissao: '',
  }
  return montar(k, e)
}
