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
  /**
   * Dimensões do prato / plataforma, ex.: "40 × 50 cm", e para que a balança é usada: o cadastro não pede mais (1.0.5),
   * nem saem nos documentos novos; o que já foi guardado continua (cópias, importação, certificados de antes).
   */
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
  /** Pesos: incerteza padrão u(ρ) da densidade, kg/m³ (k = 1; U/2 do certificado); 0 ou ausente = desconhecida. */
  incertezaDensidade?: number
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
  /**
   * Arquivo do certificado de calibração do padrão (PDF ou imagem), guardado no sistema: vai junto no e-mail
   * dos certificados emitidos com ele. Trocar o arquivo não apaga o anterior: os certificados emitidos com
   * outro nº de certificado do padrão continuam com o deles; os do mesmo nº passam a levar o novo (a correção).
   * Mudar o nº mantendo o arquivo é recusado (seria o arquivo do certificado anterior), salvo confirmação.
   * Ausente ou null = não anexado.
   */
  certificadoArquivo?: ArquivoAnexo | null
  /**
   * O arquivo de cada certificado anterior do padrão (o último de cada nº), guardado quando o nº muda: os
   * certificados emitidos com um nº antigo levam o arquivo daquele certificado (com a correção, se o arquivo
   * foi trocado antes da nova calibração). Do mais recente para o mais antigo. Ausente = nenhum.
   */
  certificadosAnteriores?: Array<{ certificado: string; arquivo: ArquivoAnexo }>
  /**
   * Os dados de cada certificado anterior do padrão (o último de cada nº), guardados pelo servidor quando o nº muda
   * (o padrão foi calibrado de novo): o rascunho de uma calibração feita antes da recalibração continua com o
   * certificado e as correções que valiam no dia (`padraoNaData`). Do mais recente para o mais antigo. Ausente =
   * nenhum (as recalibrações registradas antes desta versão não guardaram).
   */
  versoesAnteriores?: VersaoPadrao[]
}

/** O que muda no cadastro do padrão a cada calibração dele (o certificado, as datas e os valores das peças). */
export type VersaoPadrao = Pick<
  Padrao,
  | 'certificado'
  | 'laboratorio'
  | 'acreditacao'
  | 'dataCalibracao'
  | 'validade'
  | 'classe'
  | 'material'
  | 'densidade'
  | 'incertezaDensidade'
  | 'uso'
  | 'pesos'
  | 'incertezaTexto'
  | 'certificadoArquivo'
>

export type PadraoInput = Omit<Padrao, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm'>

// ---- Arquivos guardados e POP --------------------------------------------------------

/**
 * Referência a um arquivo guardado no sistema (tabela `arquivos`, pelo SHA-256 do conteúdo: o mesmo
 * arquivo enviado duas vezes é guardado uma vez só).
 */
export interface ArquivoAnexo {
  sha256: string
  /** Nome do arquivo como foi enviado (ex.: "Certificado RBC 0456-2026.pdf"). */
  nome: string
  tamanho: number
  /** Tipo MIME conferido pelo conteúdo (application/pdf, image/jpeg, image/png ou .docx). */
  tipo: string
  /** Quando foi anexado (ISO). */
  enviadoEm: string
}

/** Uma revisão registrada do POP (Procedimento Operacional Padrão de calibração). */
export interface VersaoPop {
  id: number
  /** Código do documento, ex.: "BALANÇAS-POP-123". */
  codigo: string
  /** Revisão com dois algarismos, ex.: "00". */
  revisao: string
  /** Data da revisão (yyyy-MM-dd). */
  data: string
  /** Arquivo do POP (PDF ou Word); null = ainda não anexado. */
  arquivo: ArquivoAnexo | null
  observacao: string
  criadoEm: string
  criadoPor: string
  /** A revisão que vale hoje (a última registrada); as outras foram substituídas. */
  vigente: boolean
}

/** POP congelado na emissão do certificado: a revisão que valia (sai em todas as páginas). */
export type PopEmitido = Pick<VersaoPop, 'id' | 'codigo' | 'revisao' | 'data' | 'arquivo'>

/** Certificado de calibração de um padrão usado numa calibração (para o e-mail e a ficha do certificado). */
export interface CertificadoDoPadrao {
  padraoId: ID
  identificacao: string
  descricao: string
  /** Nº do certificado do padrão (o congelado na emissão). */
  certificado: string
  arquivo: ArquivoAnexo | null
  /**
   * De onde veio o arquivo: EMISSAO = congelado no certificado emitido; CADASTRO = o do cadastro do padrão
   * (em andamento; ou, no emitido, o anexado ou trocado no cadastro depois da emissão, com o mesmo nº de
   * certificado: a correção do arquivo daquele certificado).
   */
  origem: 'EMISSAO' | 'CADASTRO' | ''
}

/** Um anexo possível do e-mail do certificado. */
export interface AnexoEmailDisponivel {
  /** 'certificado' (o PDF do certificado, sempre vai) ou 'arquivo:<sha256>'. */
  id: string
  /** Nome como chega ao cliente. */
  nome: string
  tipo: string
  tamanho: number
  obrigatorio: boolean
  /** Padrões cujo certificado é este arquivo (identificações). */
  padroes: string[]
}

// ---- Calibração e certificado ----------------------------------------------------

/**
 * RASCUNHO = em preenchimento; REVISAO = enviada para a autorização de um signatário (`Calibracao.autorizacao`; com a
 * revisão por outra pessoa ligada), aguardando ele; EMITIDO = certificado emitido (não muda mais); CANCELADO;
 * SUBSTITUIDO = trocado por uma revisão.
 */
export type StatusCalibracao = 'RASCUNHO' | 'REVISAO' | 'EMITIDO' | 'CANCELADO' | 'SUBSTITUIDO'

/**
 * Pedido de autorização (com a revisão por outra pessoa ligada): o signatário escolhido para autorizar a emissão e quem
 * pediu. Só esse signatário autoriza (`impedimentoParaEmitir` em shared/permissoes.ts).
 */
export interface PedidoAutorizacao {
  signatarioId: ID
  /** O nome na hora do pedido (para a lista e a tela). */
  signatarioNome: string
  porId: ID
  por: string
  /** ISO */
  em: string
}

/** O signatário devolveu a calibração sem autorizar, com o que precisa ser visto. */
export interface DevolucaoAutorizacao {
  nota: string
  porId: ID
  por: string
  /** ISO */
  em: string
}

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
  /**
   * O método com que as leituras foram medidas, quando a pessoa passou o ensaio para o método do POP depois delas ("Usar
   * o método do POP", no ensaio medido antes do método fixo pela classe ou com a classe trocada depois das leituras). A
   * tela oferece voltar para ele, e a subida e a descida que `metodo` pede e que faltam são pendências mesmo na
   * calibração medida antes das regras: o certificado não pode dizer que as cargas foram aplicadas de um jeito que não
   * foi feito. Na calibração começada antes do método fixo pela classe (`metodoIndicacaoDaVisita`), também a troca sem
   * leituras digitadas: aí é o método com que ela foi começada (o da folha de antes), e as telas e as pendências não
   * dizem "medido". Ausente = o método nunca foi trocado com leituras.
   */
  metodoMedido?: MetodoCarregamento
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
   * 'DELTA_T' (5e, com a variação de temperatura do local), 'MEDIDO' (correção 7.1.2-4 com a densidade do ar
   * calculada pela temperatura, umidade e pressão medidas, e incerteza 7.1.2-5a; classe I) ou 'NENHUM'.
   */
  empuxo: 'AJUSTADO' | 'NAO_AJUSTADO' | 'DELTA_T' | 'MEDIDO' | 'NENHUM'
  /**
   * Variação de temperatura do local de uso (K): na opção DELTA_T (0 = 0 K) e, na MEDIDO, para u(ρa) dos ensaios
   * sem ajuste logo antes (cg-18 A3-2; 0 = 10 K, laboratório com janelas).
   */
  deltaTLocal: number
  /** Convecção dos pesos (cg-18 7.1.2.4, Tabela F2.1); ausente = 'NAO_CONSIDERAR'. */
  conveccao?: 'NAO_CONSIDERAR' | 'CALCULAR'
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
  /**
   * hPa; obrigatória em toda calibração desde a 1.0.5 (antes, só nas classes I e II; ver `pressaoComoAviso` em
   * dominio.ts). A pressão absoluta do local, nunca a reduzida ao nível do mar.
   */
  pressao: number | null
  /** |T dos pesos − T do ar junto ao prato| medido antes do 1º ensaio, °C (= K); null ou ausente = não medido. */
  deltaTPesos?: number | null
  /** Sem medição de ΔT: diferença na chegada (°C) e minutos no local até o 1º ensaio; null ou ausente = não registrada. */
  aclimatacao?: { deltaT0: number; minutos: number } | null
}

export interface Calibracao {
  id: ID
  versao: number
  status: StatusCalibracao
  /**
   * Número como sai no certificado (ex.: "0123/2026"); vazio no rascunho. A correção emitida a partir da 1.0.4 sai com
   * o mesmo nº do certificado corrigido (`EmissaoCertificado.mesmoNumero`); a revisão emitida antes, com "-R1", "-R2"…
   */
  numero: string
  ano: number | null
  sequencia: number | null
  /**
   * Contador interno das versões do mesmo nº (0 = a primeira; cada correção, +1; a unicidade no banco é ano, sequência
   * e revisão): não sai no certificado. Na revisão emitida antes da 1.0.4, é o nº do sufixo "-R".
   */
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
  /**
   * Técnico que executou (usuário). Escolhido entre os usuários com a marca de técnico (`Usuario.tecnico`); o de uma
   * calibração continua valendo mesmo que a pessoa perca a marca depois.
   */
  tecnicoId: ID
  /**
   * Quem indicou o técnico (usuário): quem criou a calibração, quem trocou o técnico depois ou o próprio técnico ao
   * gravar a calibração dele. Fica registrado (a troca vai também para o registro de atividades); não impede ninguém de
   * autorizar desde a 1.0.5 (só o técnico não autoriza a própria). A revisão de um certificado mantém o do revisado.
   * Quem define é o servidor; ausente = calibração de antes deste campo.
   */
  tecnicoDefinidoPorId?: ID
  /** Não é usado pelo servidor na emissão (quem autoriza é quem emite); a prévia o mostra só sem pedido de autorização. */
  signatarioId: ID
  /**
   * Pedido de autorização a um signatário (com a revisão por outra pessoa ligada; status REVISAO). Quem define é o
   * servidor (`POST /api/calibracoes/:id/autorizacao`); ausente ou null = nenhum (também a enviada para revisão antes da
   * 1.0.5, que qualquer signatário que não seja o técnico autoriza).
   */
  autorizacao?: PedidoAutorizacao | null
  /** A última devolução do signatário, sem autorizar (até o próximo pedido). Quem define é o servidor. */
  devolucao?: DevolucaoAutorizacao | null
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
  /**
   * Correção (revisão): o certificado emitido que esta substitui, e o motivo. O motivo fica só no sistema (no
   * histórico das versões e no registro de atividades); só a revisão "-R1" de antes da 1.0.4 o mostra no PDF.
   */
  substituiId: ID
  motivoRevisao: string
  /**
   * Revisão de um certificado emitido antes do cálculo da classe I (gravado sem `opcoes.conveccao`), ou de uma
   * revisão dele: mantém o cálculo e as exigências da época (ver `calculoLegado` em dominio.ts). Quem define é o
   * servidor, ao criar a revisão; ausente = não.
   */
  calculoLegado?: boolean
  /**
   * Revisão de um certificado emitido com as regras do POP (`EmissaoCertificado.regrasDoPop`): a revisão também as
   * segue (os mínimos e as leituras fora do esperado são pendências; ver `regrasDoPopComoAviso` em dominio.ts). Quem
   * define é o servidor, ao criar a revisão; ausente = não (a revisão de um certificado de antes delas).
   */
  regrasDoPop?: boolean
  /**
   * Calibração em andamento que já tinha leituras quando o sistema passou a seguir as regras do POP (atualização para
   * a 1.0.3, migração 14), e a revisão do certificado dela: a visita já aconteceu e as leituras não podem ser refeitas.
   * Os mínimos do POP (pontos, subida, retorno ao zero, leituras e ensaios da repetibilidade, posições e dispensa da
   * excentricidade) ficam só como avisos; a balança que não pesa corretamente e as leituras fora do esperado continuam
   * pendências (ver `minimosDoPopComoAviso` em dominio.ts). Quem define é o servidor; ausente = não.
   */
  minimosComoAviso?: boolean
  /**
   * Calibração em andamento que já tinha leituras ou a folha de campo impressa quando a descida do "crescente e
   * decrescente" passou a ser obrigatória (atualização para a 1.0.4, migração 16), e a revisão de um certificado emitido
   * sem ela: a visita já aconteceu, e a descida que falta fica só como aviso (POP 7.7). O método do erro de indicação
   * gravado é o da visita, mesmo sem leituras (`metodoIndicacaoDaVisita`): o sistema não o troca sozinho pelo da classe.
   * O resto das regras continua. Não vale no ensaio trocado de método depois das leituras
   * (`EnsaioIndicacao.metodoMedido`). Quem define é o servidor; ausente = não.
   */
  descidaComoAviso?: boolean
  /**
   * Calibração em andamento que já tinha leituras ou a folha de campo impressa, sem a pressão atmosférica, quando a
   * pressão passou a ser obrigatória em toda classe (atualização para a 1.0.5, migração 19; antes, só nas classes I e
   * II), e a revisão de um certificado emitido sem ela: a visita já aconteceu (ou vai acontecer com a folha que dizia
   * "opcional"), e nas classes III e IIII e sem classe a falta dela fica só como aviso (`pressaoComoAviso` em
   * dominio.ts). Quem define é o servidor; ausente = não.
   */
  pressaoComoAviso?: boolean
  /**
   * Calibração em andamento com a folha de campo impressa antes da 1.0.5 com as cargas em que o EMA muda (migração 20,
   * ou a folha avulsa de antes ligada depois): até a 1.0.4 as sugestões sempre as traziam e a folha em branco mandava
   * aplicá-las; a folha do rascunho com pontos saía com os pontos dele, e por isso só é marcada quando os pontos não
   * desmentem (`folhaDeAntesComCargasDoEma`). A visita as mede (ou mediu). "Sugerir pontos" e a folha nova continuam com
   * elas mesmo sem a declaração de conformidade pedida (`comCargasDoEma` em calibracao.ts), e o aviso diz as que faltam
   * entre os pontos. Quem define é o servidor; ausente = não.
   */
  cargasDoEmaNaFolha?: boolean
  /**
   * Revisão: os padrões como foram congelados na emissão do certificado que ela substitui (o certificado e as
   * correções da época, mesmo que o padrão tenha sido calibrado de novo ou desativado depois; ver
   * `padroesDaCalibracao` em dominio.ts). Quem define é o servidor, ao criar a revisão; ausente = não é revisão.
   */
  padroesCongelados?: Padrao[]
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
  | 'tecnicoDefinidoPorId'
  | 'autorizacao'
  | 'devolucao'
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
  /**
   * Certificado corrigido com o mesmo nº (`EmissaoCertificado.mesmoNumero`): quando foi editado (ISO, a emissão desta
   * versão). A lista mostra uma linha só por nº, a versão atual, com essa anotação interna. Ausente = não foi.
   */
  editadoEm?: string
  /**
   * Versão anterior de um certificado corrigido com o mesmo nº (substituída; só aparece na aba "Substituídos"). Ausente
   * nos outros casos.
   */
  versaoAnterior?: boolean
  /**
   * Correção em andamento de um certificado emitido: o nº dele, com que ela sai (o mesmo). Ausente nos outros casos.
   */
  numeroCorrigido?: string
  /**
   * Em andamento: o nº do certificado já reservado (impresso na folha de campo, para a etiqueta), que ele
   * recebe na emissão. Ausente ou '' = ainda sem nº (é dado na emissão).
   */
  numeroReservado?: string
  /**
   * Enviada para a autorização de um signatário (status REVISAO, com o pedido): quem autoriza. Ausente nos outros casos
   * (também na enviada para revisão antes da 1.0.5, sem signatário escolhido).
   */
  aguardando?: { id: ID; nome: string }
  /**
   * Em REVISAO com a revisão por outra pessoa desligada (Configurações): ninguém autoriza (qualquer pessoa emite, só com a
   * assinatura do técnico); aparece como "Enviada para revisão" (`rotuloDaSituacao`). Ausente nos outros casos.
   */
  semAutorizacao?: boolean
  /** Rascunho devolvido pelo signatário sem autorizar (até o próximo pedido): quem devolveu. Ausente nos outros casos. */
  devolvidaPor?: string
}

/**
 * Uma versão de um certificado corrigido com o mesmo nº (`EmissaoCertificado.mesmoNumero`), no histórico interno: a
 * primeira emissão e cada correção. Só a atual vale; as anteriores ficam guardadas, marcadas como substituídas.
 */
export interface VersaoCertificado {
  id: ID
  /** 1 = a primeira emissão do nº; 2 = a primeira correção… */
  versao: number
  status: StatusCalibracao
  /** Quando e por quem esta versão foi emitida. */
  emitidoEm: string
  emitidoPor: string
  /** O motivo da correção que gerou esta versão (só no sistema); '' na primeira. */
  motivo: string
}

/**
 * Situação de um nº de certificado reservado: `reservado` (ainda não emitido), `emitido` (o certificado saiu
 * com ele) ou `nao_utilizado` (nunca vai ser emitido: a calibração foi excluída, a folha avulsa foi ligada a
 * uma calibração que já tinha nº…; o motivo fica registrado). Um nº nunca é usado de novo.
 */
export type SituacaoNumero = 'reservado' | 'emitido' | 'nao_utilizado'

/**
 * Nº de certificado reservado na impressão da folha de campo: sai na folha, o técnico o copia na etiqueta da
 * balança e o certificado é emitido com ele (mesmo que em outro ano). Mesma sequência da emissão.
 */
export interface NumeroReservado {
  id: number
  /** Como sai no certificado (ex.: "CC-2026-00042"), formatado na reserva. */
  numero: string
  ano: number
  sequencia: number
  /** A calibração dona do nº; '' = de uma folha avulsa ainda não ligada a uma calibração. */
  calibracaoId: ID
  /**
   * A folha de campo atual do nº (FC-2026-00042): a última impressa com ele para a calibração (a folha nova
   * leva o mesmo nº), a ligada a ela ou, sem dono, o papel que ficou com ele (o que foi a campo).
   */
  folha: string
  reservadoEm: string
  reservadoPor: string
  situacao: SituacaoNumero
  /** Por que não foi utilizado ('' nas outras situações). */
  motivo: string
  /** Quando foi emitido ou ficou não utilizado (ISO), e por quem. */
  situacaoEm: string
  situacaoPor: string
  /**
   * Na lista, o reservado numa folha ainda não ligada: o cliente para quem ela foi impressa e a OS impressa nela (para
   * achar o papel, ou reimprimi-lo). Ausentes = folha em branco, ou sem OS.
   */
  folhaCliente?: string
  folhaOs?: string
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
  /** Quem executou a calibração (sai em "Executado por"). */
  tecnico: Signatario
  /** Quem emitiu (o signatário que autorizou a emissão); no certificado, só com as duas assinaturas (`assinaturas`). */
  signatario: Signatario
  /**
   * Quem assina o certificado, pela revisão por outra pessoa (`Configuracoes.exigirRevisor`) no momento da emissão:
   * 'TECNICO' (desligada) = só quem executou ("Executado por"), mesmo que outra pessoa tenha emitido; 'TECNICO_E_SIGNATARIO'
   * (ligada) = quem executou e quem autorizou. Quem emitiu fica registrado de todo jeito (`signatario`, `emitidoPor`).
   * Ausente = emitido antes da 1.0.4 (as duas assinaturas, ou "Executado e autorizado por" quando eram a mesma pessoa):
   * o PDF refeito dos dados congelados sai igual ao emitido.
   */
  assinaturas?: 'TECNICO' | 'TECNICO_E_SIGNATARIO'
  /** Textos do certificado na data da emissão. */
  textos: TextosCertificado
  /** Número do certificado substituído (correção) e a data em que ele foi emitido. */
  substituiNumero: string
  substituiEmissao: string
  /**
   * Correção emitida com o mesmo nº do certificado corrigido (a partir da 1.0.4): o PDF sai como um certificado comum,
   * com a data da emissão nova, sem "-R", sem o quadro da revisão e sem o motivo (que fica só no sistema). A versão
   * anterior continua guardada, marcada como substituída só dentro do sistema. Ausente = não é correção, ou é a
   * revisão emitida antes com "-R1", que continua saindo como saía.
   */
  mesmoNumero?: boolean
  /**
   * Revisão do POP usada na calibração (a da folha de campo, ou a que valia na data dela; na revisão do certificado,
   * a do original; ver `popDaCalibracao` em server/certificados.ts). O texto que sai no certificado é
   * `textos.procedimento`. Ausente ou null = certificado de antes das revisões do POP.
   */
  pop?: PopEmitido | null
  /**
   * Calculado com as regras do POP (os mínimos, as leituras fora do esperado e a balança que não pesa corretamente
   * como pendências): a revisão dele também as segue (`Calibracao.regrasDoPop`). Ausente = emitido antes delas (1.0.2
   * ou anterior) ou sem elas (a revisão de um desses).
   */
  regrasDoPop?: boolean
  /**
   * Emitido com as regras do POP a partir da 1.0.4: o "crescente e decrescente" sai como o POP 7.7 pede, "sem zerar
   * entre os pontos" (ver `descricaoMetodo` em server/pdf/certificado.ts). Ausente = emitido antes (a 1.0.3, com as
   * regras, dizia "sem descarregar"), ou sem as regras: o PDF refeito dos dados congelados sai igual ao emitido.
   */
  carregamentoSemZerar?: boolean
  /**
   * Emitido a partir da 1.0.5, sem a finalidade de uso e as dimensões do prato (o cadastro da balança não as pede
   * mais; o que foi guardado continua na cópia congelada, `balanca`). Ausente = emitido antes, com a "Finalidade de uso
   * (*)" e as dimensões no receptor: o PDF refeito dos dados congelados sai igual ao emitido.
   */
  semFinalidadeEDimensoes?: boolean
  /**
   * Emitido a partir da 1.0.5: a inscrição estadual do cliente sai junto do CNPJ, quando ele tem (sem ela, nada).
   * Ausente = emitido antes, só com o CNPJ: o PDF refeito dos dados congelados sai igual ao emitido.
   */
  inscricaoEstadualDoCliente?: boolean
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
  /**
   * Código e revisão do POP, ex.: "BALANÇAS-POP-123 rev. 00". Vem da revisão vigente do POP (Configurações →
   * Certificado), não é digitado aqui; '' = nenhum POP registrado.
   */
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
  /**
   * Último lembrete enviado que incluiu esta balança, depois da emissão do último certificado dela (ISO), ou ''. Os
   * lembretes de antes desta versão não guardavam as balanças e não contam aqui (contam em `ultimoLembreteCliente`).
   */
  lembreteEm: string
  /** Último lembrete enviado ao cliente (ISO), com esta balança ou não, ou ''. */
  ultimoLembreteCliente?: string
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

/**
 * Situação de uma folha de campo impressa, na aba "Folhas de campo": `ligada` a uma calibração (a vigente dela),
 * `nao_ligada` (avulsa ainda não ligada, ou de uma calibração excluída: pode ser ligada), `substituida` (trocada por
 * uma folha nova da calibração: não foi a campo) ou `descartada` (não ligada, e o nº de certificado dela foi
 * registrado como não utilizado: perdida, inutilizada…).
 */
export type SituacaoFolhaCampo = 'ligada' | 'nao_ligada' | 'substituida' | 'descartada'

/** Uma folha de campo na lista de todas as impressas (aba "Folhas de campo" da página Certificados). */
export interface FolhaCampoListada {
  numero: string
  /**
   * Como foi impressa: pela calibração, avulsa (da balança, só do cliente ou em branco) ou de volta da pasta de dados (o
   * banco veio de uma cópia anterior à impressão: não se sabe para quem foi).
   */
  origem: 'calibracao' | 'avulsa' | 'recuperada'
  /** Para quem foi impressa: o cliente ('' = em branco) e a balança ('' = balança em branco). */
  clienteNome: string
  /** O cliente da folha foi excluído depois da impressão. */
  clienteExcluido?: boolean
  balancaDescricao: string
  balancaSerie: string
  /** A OS: a da calibração ligada; sem calibração, a impressa na folha ('' = nenhuma). */
  ordemServico: string
  /** O nº de certificado impresso na folha (o pré-nº, '' = nenhum) e a situação dele no registro dos nºs. */
  numeroCertificado: string
  situacaoNumero?: SituacaoNumero
  impressaEm: string
  impressaPor: string
  impressoes: number
  /**
   * A primeira impressão não terminou (o serviço caiu ou a geração do PDF deu erro, depois da reserva dos nºs): não há
   * PDF para reimprimir. A da calibração termina pela calibração (o mesmo nº); a avulsa não saiu no papel.
   */
  impressaoInterrompida?: boolean
  situacao: SituacaoFolhaCampo
  /** Ligada ou substituída: a calibração (o cliente dela, para a folha em branco). */
  calibracao?: {
    id: ID
    status: StatusCalibracao
    numero: string
    numeroReservado?: string
    clienteNome: string
    /** Em REVISAO com a revisão por outra pessoa desligada (`CalibracaoResumo.semAutorizacao`). */
    semAutorizacao?: boolean
  }
  /** Substituída: a folha nova que ficou no lugar dela. */
  substituidaPor?: string
  /** Não vai ser usada: o motivo, quando e quem registrou. */
  motivo?: string
  descartadaEm?: string
  descartadaPor?: string
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
  /** Nomes dos arquivos anexados (envios a partir desta versão). */
  anexos?: string[]
  /** Lembrete: os ids das balanças que foram no e-mail ([] nos lembretes de antes desta versão). */
  balancas?: string[]
  /**
   * Endereços que o servidor de e-mail recusou (não receberam; `para` tem só os que receberam). [] nos envios de antes
   * desta versão, que guardavam todos os digitados em `para`.
   */
  recusados?: string[]
}

/** Endereço que o servidor de e-mail recusou no envio, com o código da resposta (ex.: 550; null = sem código). */
export interface DestinatarioRecusado {
  endereco: string
  codigo: number | null
}

/** Resposta de um envio de e-mail: `para` = quem o servidor aceitou; `recusados` = os que ele recusou. */
export interface ResultadoEmail {
  ok: true
  para: string[]
  recusados: DestinatarioRecusado[]
  id: string
}

// ---- Usuários e sessão -------------------------------------------------------------

/**
 * O administrador faz tudo; o operador ('COMUM', "Operador" nas telas) faz o dia a dia, menos o que é só do administrador
 * (shared/permissoes.ts). Quem executa calibrações (`Usuario.tecnico`) e quem autoriza certificados (`Usuario.signatario`)
 * são marcas à parte, em qualquer nível.
 */
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
  /**
   * Técnico de calibração: executa as calibrações (só quem tem a marca aparece em "Técnico que executou" e na folha de
   * campo). Na atualização para a 1.0.5, todos os usuários ganharam a marca.
   */
  tecnico: boolean
  /** Signatário: autoriza (assina) os certificados quando a revisão por outra pessoa está ligada. */
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
export type UsuarioSessao = Pick<Usuario, 'id' | 'login' | 'nome' | 'nivel' | 'trocarSenha' | 'tecnico' | 'signatario'>

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
  tecnico: boolean
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
  tecnico?: boolean
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
  | 'TESTES_APAGADOS'
  | 'CERTIFICADO_EMITIDO'
  | 'CERTIFICADO_CANCELADO'
  | 'CERTIFICADO_ENVIADO'
  | 'AUTORIZACAO_PEDIDA'
  | 'AUTORIZACAO_DEVOLVIDA'
  | 'NUMERO_RESERVADO'
  | 'NUMERO_NAO_UTILIZADO'
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
