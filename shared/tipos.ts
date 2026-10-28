// Tipos do domínio, compartilhados entre o servidor (Node) e a interface (navegador).

export type ID = string

/** Tom dos selos (badges) e avisos na interface. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand'

// ---- Clientes ----------------------------------------------------------------

/** PJ = empresa (CNPJ), PF = pessoa física (CPF). */
export type TipoCliente = 'PJ' | 'PF'

export interface Cliente {
  id: ID
  /** Incrementa a cada alteração; usado para detectar edições simultâneas. */
  versao: number
  tipo: TipoCliente
  /** Nome de exibição: nome fantasia (PJ) ou nome completo (PF). */
  nome: string
  /** Razão social (PJ), como consta na Receita. Sai no certificado. */
  razaoSocial: string
  /** CNPJ ou CPF formatado. */
  documento: string
  inscricaoEstadual: string
  /** Pessoa de contato na empresa. */
  contato: string
  telefone: string
  celular: string
  email: string
  /** E-mails que recebem os certificados (vazio = o e-mail principal). Separados por vírgula. */
  emailCertificados: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  /** Situação na Receita Federal (ex.: "ATIVA"), preenchida pela consulta de CNPJ. */
  situacaoCadastral: string
  observacoes: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type ClienteInput = Omit<Cliente, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm'>

/** Cliente com os totais calculados para as listas. */
export interface ClienteResumo extends Cliente {
  balancas: number
  certificados: number
  /** Data (yyyy-MM-dd) da última calibração emitida, ou ''. */
  ultimaCalibracao: string
}

// ---- Balanças (instrumentos de pesagem não automáticos) ----------------------------

export type Unidade = 'mg' | 'g' | 'kg' | 't'

/** Classe de exatidão (Portaria Inmetro 157/2022 e OIML R76). '' = não marcada no instrumento. */
export type ClasseExatidao = 'I' | 'II' | 'III' | 'IIII' | ''

export type TipoBalanca =
  | 'COMPUTADORA'
  | 'ETIQUETADORA'
  | 'BALCAO'
  | 'PLATAFORMA'
  | 'PISO'
  | 'RODOVIARIA'
  | 'FERROVIARIA'
  | 'ANALITICA'
  | 'SEMIANALITICA'
  | 'PRECISAO'
  | 'CONTADORA'
  | 'SUSPENSA'
  | 'TRANSPALETEIRA'
  | 'HOSPITALAR'
  | 'CHECKOUT'
  | 'OUTRA'

/** Para que a balança é usada no cliente (uso comercial e saúde exigem a verificação do Inmetro/IPEM). */
export type Finalidade = 'COMERCIAL' | 'PROCESSO' | 'LABORATORIO' | 'SAUDE' | ''

/** Formato do receptor de carga: define as posições do ensaio de excentricidade. */
export type Receptor = 'RETANGULAR' | 'CIRCULAR' | 'APOIOS' | 'RODOVIARIA' | 'GANCHO' | 'TANQUE'

/** Uma faixa (ou intervalo) de pesagem: até `max`, com divisão `d` e divisão de verificação `e`. */
export interface Faixa {
  max: number
  e: number
  d: number
}

/** ÚNICA = um só Max; MULTI_INTERVALO = d muda com a carga numa só faixa; MULTIPLAS_FAIXAS = faixas escolhidas pelo operador. */
export type TipoFaixas = 'UNICA' | 'MULTI_INTERVALO' | 'MULTIPLAS_FAIXAS'

export interface Balanca {
  id: ID
  versao: number
  clienteId: ID
  tipo: TipoBalanca
  /**
   * Fabricante, modelo e nº de série da balança como identificada pelo indicador (o mostrador): é o
   * nº de série do indicador que vale, mesmo quando a plataforma é um aparelho à parte.
   */
  fabricante: string
  modelo: string
  numeroSerie: string
  /** Identificação do cliente: TAG, patrimônio, código interno. */
  identificacao: string
  /** Plataforma (receptor de carga) com plaqueta própria. Opcional: quase nunca tem nº de série próprio. */
  plataformaFabricante: string
  plataformaModelo: string
  plataformaSerie: string
  /** Unidade da indicação (como o mostrador indica o peso): todos os valores abaixo e as leituras estão nela. */
  unidade: Unidade
  tipoFaixas: TipoFaixas
  /** Pelo menos uma; em ordem crescente de Max. Valores na `unidade` da balança. */
  faixas: Faixa[]
  /** Carga mínima (Min), na unidade da balança; 0 = não marcada. */
  min: number
  classe: ClasseExatidao
  /** Portaria de aprovação de modelo do Inmetro (PAM), ex.: "Portaria Inmetro/Dimel nº 123/2015". */
  portariaAprovacao: string
  receptor: Receptor
  /** Número de apoios (células de carga) quando o receptor é APOIOS ou RODOVIARIA. */
  apoios: number
  /** Dimensões do prato / plataforma, ex.: "40 × 50 cm". */
  dimensoes: string
  finalidade: Finalidade
  /** Onde a balança fica no cliente (setor, linha, filial). */
  localInstalacao: string
  anoFabricacao: string
  observacoes: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type BalancaInput = Omit<Balanca, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm'>

/**
 * Campos do cadastro antigo, quando a identificação principal era a da plataforma e o indicador separado
 * ficava à parte. Só continuam existindo nas cópias congeladas dos certificados emitidos antes da troca.
 */
export interface IndicadorLegado {
  indicadorFabricante?: string
  indicadorModelo?: string
  indicadorSerie?: string
}

export interface BalancaResumo extends Balanca {
  clienteNome: string
  certificados: number
  /** Última calibração emitida (yyyy-MM-dd) e o número do certificado. */
  ultimaCalibracao: string
  ultimoCertificado: string
  ultimoCertificadoId: string
  /** Próxima calibração combinada com o cliente (yyyy-MM-dd) ou ''. */
  proximaCalibracao: string
}

// ---- Padrões (pesos e instrumentos da empresa) ----------------------------------

export type TipoPadrao = 'PESOS' | 'TERMOHIGROMETRO' | 'BAROMETRO' | 'OUTRO'

/** Classes de pesos da OIML R111. */
export type ClassePeso = 'E1' | 'E2' | 'F1' | 'F2' | 'M1' | 'M1-2' | 'M2' | 'M2-3' | 'M3'

/**
 * Como a massa dos pesos entra no cálculo:
 * CERTIFICADO = valor convencional do certificado (nominal + correção), incerteza U/k;
 * NOMINAL = só o valor nominal, incerteza pelo erro máximo admissível da classe (EMA/√3).
 */
export type UsoPesos = 'CERTIFICADO' | 'NOMINAL'

/** Uma peça de um jogo de pesos. */
export interface PesoPadrao {
  id: ID
  /** Marca ou código da peça, ex.: "5A", "10 kg nº 2". */
  marca: string
  /** Valor nominal em gramas. */
  nominal: number
  /** Correção do certificado (valor convencional − nominal), em mg. */
  correcao: number
  /** Incerteza expandida do certificado, em mg. */
  incerteza: number
  /** Fator de abrangência do certificado. */
  k: number
}

export interface Padrao {
  id: ID
  versao: number
  tipo: TipoPadrao
  /** Código interno único, ex.: "JP-01", "TH-02". */
  identificacao: string
  descricao: string
  fabricante: string
  modelo: string
  numeroSerie: string
  /** Pesos: classe OIML R111, material e densidade (kg/m³; 0 = desconhecida). */
  classe: ClassePeso | ''
  material: string
  densidade: number
  uso: UsoPesos
  /** Peças do jogo (só para tipo PESOS). */
  pesos: PesoPadrao[]
  /** Certificado de calibração do padrão. */
  certificado: string
  laboratorio: string
  /** Número de acreditação do laboratório na Cgcre (ex.: "CAL 0123"). */
  acreditacao: string
  /** yyyy-MM-dd */
  dataCalibracao: string
  /** Próxima calibração do padrão (intervalo interno da empresa), yyyy-MM-dd. Vencido = não pode ser usado. */
  validade: string
  /** Instrumentos de medição (termo-higrômetro, barômetro): incerteza declarada, texto livre. */
  incertezaTexto: string
  observacoes: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type PadraoInput = Omit<Padrao, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm'>

// ---- Calibração e certificado ----------------------------------------------------

/**
 * RASCUNHO = em preenchimento; REVISAO = concluída pelo técnico, aguardando quem autoriza;
 * EMITIDO = certificado emitido (não muda mais); CANCELADO; SUBSTITUIDO = trocado por uma revisão.
 */
export type StatusCalibracao = 'RASCUNHO' | 'REVISAO' | 'EMITIDO' | 'CANCELADO' | 'SUBSTITUIDO'

export type LocalCalibracao = 'CLIENTE' | 'LABORATORIO'

/** Situação de um item da verificação preliminar (nivelamento, limpeza…). */
export type Verificacao = 'SIM' | 'NAO' | 'NA'

export type AjusteRealizado = 'NAO' | 'INTERNO' | 'EXTERNO'

/** Peça de peso usada numa carga (cópia congelada dos dados do padrão no momento do uso). */
export interface PecaCarga {
  padraoId: ID
  pesoId: ID
  quantidade: number
}

/**
 * Métodos de carregamento do ensaio de erro de indicação (EURAMET cg-18 §5.2):
 * DESCONTINUO = crescente, descarregando entre os pontos; CONTINUO = crescente sem descarregar;
 * CRESCENTE_DECRESCENTE = sobe e desce (dá a histerese); DECRESCENTE = só descendo a partir de Max.
 */
export type MetodoCarregamento = 'DESCONTINUO' | 'CONTINUO' | 'CRESCENTE_DECRESCENTE' | 'DECRESCENTE'

/** Ponto do ensaio de erro de indicação. Leituras na unidade da balança; `null` = não lido. */
export interface PontoIndicacao {
  id: ID
  /** Carga nominal aplicada (unidade da balança). */
  carga: number
  /** Pesos padrão que formam a carga (montagem automática ou escolhida). */
  pecas: PecaCarga[]
  /** A montagem foi escolhida à mão (não refazer automaticamente). */
  pecasManuais: boolean
  crescente: number | null
  decrescente: number | null
  /**
   * Cargas de substituição (rodoviárias): quantas substituições há por baixo dos pesos neste ponto.
   * 0 = só pesos padrão. Ver `EnsaioIndicacao.substituicoes`.
   */
  nivelSubstituicao: number
}

/** Uma etapa de substituição: leitura com os pesos padrão e leitura depois de trocar os pesos pela carga de substituição. */
export interface EtapaSubstituicao {
  leituraPadroes: number | null
  leituraSubstituicao: number | null
}

export interface EnsaioIndicacao {
  metodo: MetodoCarregamento
  pontos: PontoIndicacao[]
  /** Leitura do zero ao final do ensaio (retorno ao zero); `null` = não registrada. */
  retornoZero: number | null
  /** Cargas de substituição: carga de pesos padrão usada em cada etapa (pecas) e as leituras. */
  substituicao: {
    ativa: boolean
    pecas: PecaCarga[]
    etapas: EtapaSubstituicao[]
  }
}

export interface EnsaioRepetibilidade {
  id: ID
  /** Carga aplicada (não precisa ser padrão), unidade da balança. */
  carga: number
  leituras: Array<number | null>
}

/** Métodos 1 a 4 da EURAMET cg-18 §5.3 (1 = zera e desloca a carga, o mais comum). */
export type MetodoExcentricidade = 1 | 2 | 3 | 4

export interface PosicaoExcentricidade {
  /** "Centro", "Frente esquerda", "Apoio 3", "Entrada (ida)"… */
  rotulo: string
  leitura: number | null
  /** Métodos 3 e 4: zero lido antes (3) ou leitura de referência na posição 1 (4). */
  referencia: number | null
}

export interface EnsaioExcentricidade {
  aplicavel: boolean
  /** Motivo de não aplicar (ex.: balança suspensa, a carga se centra sozinha). */
  motivo: string
  carga: number
  metodo: MetodoExcentricidade
  posicoes: PosicaoExcentricidade[]
}

/** Opções do cálculo da incerteza, gravadas em cada certificado (rastreabilidade do cálculo). */
export interface OpcoesCalculo {
  /**
   * Empuxo do ar (cg-18 7.1.2-5): 'AJUSTADO' (5c, balança ajustada logo antes), 'NAO_AJUSTADO' (5d),
   * 'DELTA_T' (5e, com a variação de temperatura do local) ou 'NENHUM'.
   */
  empuxo: 'AJUSTADO' | 'NAO_AJUSTADO' | 'DELTA_T' | 'NENHUM'
  /** Variação de temperatura do local de uso (K), para a opção DELTA_T. */
  deltaTLocal: number
  /** Deriva dos pesos: D = EMA da classe (sem histórico) ou D = kD·U. */
  deriva: 'EMA' | 'KD'
  kD: number
  /** Inclui a excentricidade no orçamento de incerteza de cada ponto. */
  excentricidade: boolean
  /** Fator de abrangência: t de Student exato (ν_eff truncado), tabela G.2 do GUM (linha inferior) ou k = 2 fixo. */
  metodoK: 'T_EXATO' | 'TABELA' | 'K2'
  /** Resolução no zero: d/√12 (padrão) ou d/(4√3) para instrumento aprovado com zero automático. */
  zeroAprovado: boolean
  /** Histerese: erros de subida e descida separados (padrão cg-18) ou um erro pela média com a componente de histerese. */
  histerese: 'SEPARADO' | 'MEDIA'
  /** Divisão usada nas leituras (modo serviço / resolução aumentada); 0 = a divisão d normal. */
  divisaoTeste: number
}

/** Tabela de erros máximos admissíveis (EMA) usada na declaração de conformidade. */
export type CriterioEma = 'PORTARIA_VERIFICACAO' | 'PORTARIA_SERVICO' | 'OIML_INICIAL' | 'OIML_SERVICO' | 'CLIENTE'

/** Regra de decisão (ILAC-G8): aceitação simples (|E| ≤ EMA) ou banda de guarda (|E| + U ≤ EMA). */
export type RegraDecisao = 'SIMPLES' | 'BANDA_GUARDA'

export interface Conformidade {
  /** Só é declarada quando o cliente pediu (ISO/IEC 17025, 7.8.6). */
  solicitada: boolean
  criterio: CriterioEma
  /** Tolerância do cliente (CLIENTE), na unidade da balança. */
  toleranciaCliente: number
  regra: RegraDecisao
}

export interface CondicoesAmbientais {
  temperaturaInicial: number | null
  temperaturaFinal: number | null
  umidadeInicial: number | null
  umidadeFinal: number | null
  /** hPa; opcional. */
  pressao: number | null
}

export interface Calibracao {
  id: ID
  versao: number
  status: StatusCalibracao
  /** Número como sai no certificado (ex.: "0123/2026" ou "0123/2026-R1"); vazio no rascunho. */
  numero: string
  ano: number | null
  sequencia: number | null
  revisao: number
  clienteId: ID
  balancaId: ID
  /** Nº da ordem de serviço no sistema de OS da empresa. */
  ordemServico: string
  /** yyyy-MM-dd */
  dataCalibracao: string
  dataEmissao: string
  /** Data de recebimento do item (calibração no laboratório). */
  dataRecebimento: string
  local: LocalCalibracao
  /** Endereço onde a calibração foi feita (padrão: o endereço do cliente ou da empresa). */
  localEndereco: string
  /** Técnico que executou (usuário). */
  tecnicoId: ID
  /** Quem revisou e autorizou a emissão (usuário signatário). */
  signatarioId: ID
  /** Padrões usados: jogos de pesos, termo-higrômetro, barômetro. */
  padroesIds: ID[]
  ambiente: CondicoesAmbientais
  /** Verificação preliminar (cg-18 §4.1.3). */
  preliminar: {
    identificavel: Verificacao
    limpa: Verificacao
    nivelada: Verificacao
    aquecida: Verificacao
    preCarga: Verificacao
    /** Zero automático / rastreamento de zero no momento da calibração. */
    zeroAutomatico: 'LIGADO' | 'DESLIGADO' | 'NAO_POSSUI'
  }
  ajuste: {
    realizado: AjusteRealizado
    /** Ex.: "ajuste de span com peso de 20 kg". */
    descricao: string
  }
  /** Quando houve ajuste: erro de indicação "como encontrado", antes do ajuste (opcional, recomendado). */
  comoEncontrado: EnsaioIndicacao | null
  repetibilidade: EnsaioRepetibilidade[]
  excentricidade: EnsaioExcentricidade
  indicacao: EnsaioIndicacao
  opcoes: OpcoesCalculo
  conformidade: Conformidade
  /** Próxima calibração: lembrete interno; só sai no certificado se o cliente pediu. */
  proximaCalibracao: string
  proximaNoCertificado: boolean
  /** Intervenção de oficina permissionária (reparo/manutenção com rompimento de selos). */
  reparo: {
    houve: boolean
    descricao: string
    marcaReparo: string
    selosRetirados: string
    selosColocados: string
  }
  /** Observações que saem no certificado. */
  observacoes: string
  /** Opiniões e interpretações (17025, 7.8.7), separadas dos resultados. */
  opinioes: string
  /** Anotações internas (não saem no certificado). */
  anotacoesInternas: string
  /** Revisão: calibração emitida que esta substitui, e o motivo. */
  substituiId: ID
  motivoRevisao: string
  /** Cancelamento: motivo, quem e quando. */
  cancelamento: { motivo: string; por: string; em: string } | null
  /** Ao emitir: dados congelados (o certificado sai sempre igual) e o código de autenticidade. */
  emissao: EmissaoCertificado | null
  criadoPor: string
  criadoEm: string
  atualizadoEm: string
}

export type CalibracaoInput = Omit<
  Calibracao,
  | 'id'
  | 'versao'
  | 'status'
  | 'numero'
  | 'ano'
  | 'sequencia'
  | 'revisao'
  | 'emissao'
  | 'cancelamento'
  | 'criadoPor'
  | 'criadoEm'
  | 'atualizadoEm'
>

/** Linha das listas de calibrações (sem as leituras). */
export interface CalibracaoResumo {
  id: ID
  versao: number
  status: StatusCalibracao
  numero: string
  revisao: number
  clienteId: ID
  clienteNome: string
  balancaId: ID
  balancaDescricao: string
  balancaSerie: string
  ordemServico: string
  dataCalibracao: string
  dataEmissao: string
  proximaCalibracao: string
  tecnicoNome: string
  substituiId: ID
  atualizadoEm: string
  /** Quantas vezes o certificado foi enviado por e-mail. */
  envios: number
}

/** Dados congelados no momento da emissão. */
export interface EmissaoCertificado {
  emitidoEm: string
  emitidoPor: string
  /** Código curto de autenticidade (vai no certificado e no QR code). */
  codigo: string
  /** SHA-256 do PDF gerado. */
  hashPdf: string
  /** Nome do arquivo do PDF dentro de <dados>/certificados. */
  arquivo: string
  empresa: DadosEmpresa
  cliente: Cliente
  balanca: Balanca
  padroes: Padrao[]
  tecnico: Signatario
  signatario: Signatario
  /** Textos do certificado na data da emissão. */
  textos: TextosCertificado
  /** Número do certificado substituído (revisão). */
  substituiNumero: string
  substituiEmissao: string
}

export interface Signatario {
  id: ID
  nome: string
  cargo: string
  /** Registro profissional (CREA, CFT…), opcional. */
  registro: string
  /** Assinatura digitalizada (PNG em data URL) ou ''. */
  assinatura: string
}

// ---- Configurações -----------------------------------------------------------------

export interface DadosEmpresa {
  nomeFantasia: string
  razaoSocial: string
  cnpj: string
  inscricaoEstadual: string
  endereco: string
  bairro: string
  cidade: string
  uf: string
  cep: string
  telefone: string
  email: string
  site: string
}

export interface TextosCertificado {
  /** Código e revisão do procedimento, ex.: "PT-CAL-01 rev. 0". */
  procedimento: string
  /** Descrição curta do procedimento (sai no certificado). */
  procedimentoDescricao: string
  rastreabilidade: string
  incerteza: string
  abrangencia: string
  reproducao: string
  naoAcreditado: string
  controleLegal: string
  intervalo: string
  /** Observações que saem em todos os certificados. */
  observacoesPadrao: string
}

export interface ConfigNumeracao {
  /** Formato do número; {seq} = sequência do ano, {ano} = ano com 4 dígitos, {aa} = 2 dígitos. */
  formato: string
  /** Dígitos da sequência (zeros à esquerda). */
  digitos: number
}

export interface Configuracoes {
  empresa: DadosEmpresa
  textos: TextosCertificado
  numeracao: ConfigNumeracao
  /** Opções de cálculo padrão das novas calibrações. */
  opcoesPadrao: OpcoesCalculo
  /** A emissão exige que outra pessoa (signatário) revise e autorize; sem isso, o signatário pode emitir a própria calibração. */
  exigirRevisor: boolean
  /** Dias antes do vencimento para destacar as balanças em "Vencimentos". */
  diasAvisoVencimento: number
  /** Intervalo sugerido para a próxima calibração (lembrete interno), em meses. */
  mesesProximaPadrao: number
  /** Endereço pelo qual o QR code permite conferir o certificado (opcional; sem ele o QR traz os dados). */
  urlVerificacao: string
  /** Assunto e mensagem do e-mail do certificado; {numero}, {cliente}, {balanca}, {empresa}. */
  emailAssunto: string
  emailMensagem: string
  /** Assunto e mensagem do lembrete de vencimento; {cliente}, {balancas}, {empresa}, {data}. */
  lembreteAssunto: string
  lembreteMensagem: string
}

// ---- Painel ------------------------------------------------------------------------

export interface ResumoPainel {
  emitidosMes: number
  emitidosMesAnterior: number
  emitidosAno: number
  rascunhos: number
  /** Balanças com a próxima calibração nos próximos N dias (configuração) ou vencida. */
  vencendo: number
  vencidas: number
  padroesVencendo: Array<Pick<Padrao, 'id' | 'identificacao' | 'descricao' | 'validade'>>
  /** Certificados emitidos por mês nos últimos 12 meses (yyyy-MM → quantidade). */
  porMes: Array<{ mes: string; quantidade: number }>
  ultimos: CalibracaoResumo[]
  emAndamento: CalibracaoResumo[]
  clientes: number
  balancas: number
}

export interface Vencimento {
  balancaId: ID
  balancaDescricao: string
  numeroSerie: string
  identificacao: string
  clienteId: ID
  clienteNome: string
  clienteEmail: string
  ultimaCalibracao: string
  ultimoCertificado: string
  ultimoCertificadoId: ID
  proximaCalibracao: string
  /** Dias até a próxima (negativo = vencida). */
  dias: number
  /** Último lembrete enviado (ISO) ou ''. */
  lembreteEm: string
}

/** Folha de campo impressa: o registro de dados brutos levado ao cliente (nº FC-AAAA-NNNNN em toda página). */
export interface FolhaCampoImpressa {
  numero: string
  /** Primeira impressão (ISO) e quem imprimiu. */
  impressaEm: string
  impressaPor: string
  /** Quantas vezes foi impressa (a reimpressão mantém o número). */
  impressoes: number
  ultimaEm: string
  /** Numa revisão de certificado: a folha é a do certificado revisado (a mesma visita); não há folha nova. */
  herdada?: boolean
  /** Folhas impressas antes para a calibração e substituídas por esta (não usadas), da mais antiga para a mais nova. */
  substituidas?: string[]
  /**
   * Certificado cancelado: a folha dele passou para a calibração refeita a partir do mesmo papel ("CC-2026-00012"
   * ou "rascunho da OS 77, …"); continua sendo o registro dos dados brutos dele.
   */
  passouPara?: string
}

export interface Envio {
  id: ID
  calibracaoId: ID
  clienteId: ID
  tipo: 'CERTIFICADO' | 'LEMBRETE'
  para: string
  assunto: string
  usuarioNome: string
  em: string
}

// ---- Usuários e sessão -------------------------------------------------------------

/** O administrador faz tudo; o comum (técnico) cadastra, calibra e emite conforme a permissão de assinar. */
export type NivelUsuario = 'ADMIN' | 'COMUM'

/** Usuário como as telas recebem (o hash da senha nunca sai do servidor). */
export interface Usuario {
  id: ID
  versao: number
  /** Para entrar, escolhido pela pessoa; guardado minúsculo e com espaços simples (ex.: "maria.souza", "rafael tessaro"). */
  login: string
  /** Como aparece nas telas e no certificado (ex.: "Maria Souza"). */
  nome: string
  nivel: NivelUsuario
  ativo: boolean
  /** Senha temporária: troca obrigatória ao entrar. */
  trocarSenha: boolean
  /** Pode revisar e autorizar (assinar) certificados. */
  signatario: boolean
  /** Cargo ou função que sai no certificado (ex.: "Técnico em metrologia", "Responsável técnico"). */
  cargo: string
  /** Registro profissional (opcional). */
  registro: string
  /** Assinatura digitalizada (PNG em data URL) ou ''. */
  assinatura: string
  criadoEm: string
  atualizadoEm: string
  senhaAlteradaEm: string
  /** ISO; '' = nunca entrou. */
  ultimoAcessoEm: string
  ultimoAcessoIp: string
  /** Calculado: sessões vigentes agora. */
  sessoesAtivas: number
}

/** Quem está usando este navegador. */
export type UsuarioSessao = Pick<Usuario, 'id' | 'login' | 'nome' | 'nivel' | 'trocarSenha' | 'signatario'>

/** GET /api/sessao */
export interface EstadoSessao {
  usuario: UsuarioSessao | null
  /** Nenhum usuário cadastrado: o administrador ainda não foi criado no computador do servidor. */
  semUsuarios: boolean
  /** Sem usuários e o navegador está no próprio servidor: pode criar o administrador pela tela. */
  primeiroAcessoLocal?: boolean
  /** Versão da interface servida agora (a mesma do `ola` do tempo real). */
  build: string
  /** Só com alguém logado: a sessão do cookie foi aberta com "Manter conectado neste computador". */
  persistente?: boolean
}

export interface EntradaLogin {
  login: string
  senha: string
  manterConectado?: boolean
}
/** POST /api/sessao */
export interface RespostaLogin {
  usuario: UsuarioSessao
  build: string
}
/** `senha` vazia: o servidor gera uma temporária. */
export interface NovoUsuario {
  nome: string
  login: string
  nivel: NivelUsuario
  senha: string
  signatario: boolean
  cargo: string
  registro: string
}
export interface AlteracaoUsuario {
  nome?: string
  /** Login novo (a pessoa passa a entrar com ele; as sessões abertas continuam). */
  login?: string
  nivel?: NivelUsuario
  ativo?: boolean
  signatario?: boolean
  cargo?: string
  registro?: string
  assinatura?: string
  versao?: number
}
export interface TrocaSenha {
  senhaAtual: string
  senhaNova: string
}
/** POST /api/usuarios e POST /api/usuarios/:id/senha */
export interface ResultadoSenha {
  usuario: Usuario
  /** Só quando o servidor gerou a senha: mostrar uma única vez. */
  senhaTemporaria?: string
}

/** Campo `codigo` das respostas de erro de acesso. */
export type CodigoErroAcesso =
  | 'SEM_SESSAO'
  | 'CREDENCIAIS_INVALIDAS'
  | 'DESATIVADO'
  | 'MUITAS_TENTATIVAS'
  | 'SEM_PERMISSAO'
  | 'TROCAR_SENHA'
  | 'SENHA_ATUAL'
  | 'SENHA_IGUAL'
  | 'ULTIMO_ADMIN'
  | 'PROPRIA_CONTA'
  | 'CONFLITO'
  | 'LOGIN_EXISTENTE'
  | 'LIMITE_USUARIOS'

export type AcaoAuditoria =
  | 'LOGIN'
  | 'LOGIN_FALHOU'
  | 'BLOQUEIO'
  | 'LOGOUT'
  | 'ACESSO_NEGADO'
  | 'SENHA_TROCADA'
  | 'SENHA_REDEFINIDA'
  | 'USUARIO_CRIADO'
  | 'USUARIO_ALTERADO'
  | 'USUARIO_EXCLUIDO'
  | 'SESSOES_ENCERRADAS'
  | 'FERRAMENTA_LOCAL'
  | 'COPIA_RESTAURADA'
  | 'BACKUP_BAIXADO'
  | 'SISTEMA_ATUALIZADO'
  | 'CERTIFICADO_EMITIDO'
  | 'CERTIFICADO_CANCELADO'
  | 'CERTIFICADO_ENVIADO'
  | 'ALTERACAO'

export type GrupoAuditoria = 'acessos' | 'usuarios' | 'certificados' | 'dados' | 'alteracoes'

export interface RegistroAuditoria {
  id: number
  em: string
  usuarioId: ID
  /** Login no momento do registro ('' quando o login digitado não existe; o texto digitado nunca é gravado). */
  login: string
  ip: string
  acao: AcaoAuditoria
  /** Id do registro afetado (`:id` da rota), ou ''. */
  alvo: string
  /** Ex.: 'PUT /api/clientes/:id' ou 'nível: Comum → Administrador'. */
  detalhe: string
}

// ---- Tempo real ----------------------------------------------------------------------

/** Aviso de que algo mudou: as telas abertas recarregam o que mostram. */
export interface MensagemTempoReal {
  revisao: number
  tipo: 'cliente' | 'balanca' | 'padrao' | 'calibracao' | 'config' | 'tudo'
  id?: ID
}
