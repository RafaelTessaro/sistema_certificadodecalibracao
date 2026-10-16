// Três certificados de exemplo, realistas, para os testes do PDF e para as amostras em server/pdf/exemplos/:
//   1. plataforma Toledo 300 kg × 50 g, classe III, com reparo, ajuste ("como encontrado" + "como deixado")
//      e declaração de conformidade pela Portaria 157/2022 em serviço;
//   2. bancada 30 kg × 5 g, sem ajuste, histerese pela MÉDIA (exemplo numérico da pesquisa 02, §9),
//      calibrada no laboratório, executada e autorizada pela mesma pessoa, com opiniões;
//   3. rodoviária 80 t × 20 kg, 4 apoios, cargas de substituição, faixa parcial, revisão (substitui o nº …)
//      e marca d'água "PRÉVIA — SEM VALOR".
// Os resultados saem do motor de cálculo de verdade (shared/calibracao.ts).

import { calcularCalibracao, montarCarga } from '#shared/calibracao.ts'
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
  extra: Partial<Pick<DadosCertificadoPdf, 'marcaDagua'>> = {},
): DadosCertificadoPdf {
  const { resultado, comoEncontrado } = calcularCalibracao(calibracao, emissao.balanca, emissao.padroes)
  return {
    calibracao: { ...calibracao, emissao },
    emissao,
    resultado,
    comoEncontrado,
    marcaDagua: extra.marcaDagua ?? '',
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
    textos: TEXTOS_PADRAO,
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
    ambiente: { temperaturaInicial: 21, temperaturaFinal: 22.5, umidadeInicial: 55, umidadeFinal: 54, pressao: 925 },
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
    textos: TEXTOS_PADRAO,
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
    textos: { ...TEXTOS_PADRAO, observacoesPadrao: 'Separador decimal: vírgula. Separador de milhar: espaço.' },
    substituiNumero: 'CC-2026-00098',
    substituiEmissao: '2026-09-30T14:20:00.000Z',
  }
  return montar(k, e, { marcaDagua: 'PRÉVIA — SEM VALOR' })
}
