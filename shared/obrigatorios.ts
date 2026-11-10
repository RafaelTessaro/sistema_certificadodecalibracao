// Os campos obrigatórios dos cadastros (a marca "●" das telas: obrigatório para salvar), com as mesmas regras de
// `normalizarCliente`, `normalizarBalanca`, `normalizarPadrao`, `normalizarNovoUsuario` e `normalizarConfig`: os testes
// conferem que o campo marcado em branco impede gravar e o não marcado não impede. Os da calibração (obrigatório para
// emitir) estão em `camposObrigatoriosEmissao` (dominio.ts), junto das pendências.

import { emailValido } from './dominio.ts'
import type { ClienteInput, OpcoesCalculo, PadraoInput, UsoPesos } from './tipos.ts'

/** Cliente: o nome; na empresa (CNPJ), a razão social, que pode faltar quando há o nome fantasia. */
export function obrigatoriosCliente(f: Pick<ClienteInput, 'tipo' | 'nome' | 'razaoSocial'>): Array<'nome' | 'razaoSocial'> {
  if (f.tipo !== 'PJ') return ['nome']
  return f.nome.trim() ? [] : ['razaoSocial']
}

/** Balança: o cliente dono, a capacidade (Max) e a divisão (d) de cada faixa (a divisão e, sem valor, é a d). */
export const OBRIGATORIOS_BALANCA = ['clienteId', 'max', 'd'] as const

/** Padrão: o código; no jogo de pesos, as peças (com o valor nominal). */
export function obrigatoriosPadrao(f: Pick<PadraoInput, 'tipo'>): Array<'identificacao' | 'pesos'> {
  return f.tipo === 'PESOS' ? ['identificacao', 'pesos'] : ['identificacao']
}

/**
 * Do padrão, o que a emissão pede (não para salvar, para usar o padrão num certificado): o nº do certificado, a
 * acreditação Cgcre do laboratório e a próxima calibração (as pendências de `pendenciasEmissao`).
 */
export const PADRAO_PARA_EMITIR = ['certificado', 'acreditacao', 'validade'] as const

/**
 * Do jogo de pesos, a classe OIML R 111 (também "○": não impede salvar, impede usar o jogo num certificado). Sem ela,
 * as peças ficam sem o EMA, que entra na incerteza (a deriva pelo EMA, o empuxo estimado e a incerteza pelo valor
 * nominal), e o cálculo dá a pendência "Pesos sem EMA conhecido". Só a dispensam os pesos usados pelo certificado com a
 * deriva pelo kD·U e o empuxo pela densidade do ar medida, ou sem empuxo. `opcoes`: as do cálculo (no cadastro do
 * padrão, as das calibrações novas, de Configurações).
 */
export function classeDosPesosParaEmitir(uso: UsoPesos, opcoes: Pick<OpcoesCalculo, 'deriva' | 'empuxo'>): boolean {
  return !(uso === 'CERTIFICADO' && opcoes.deriva === 'KD' && (opcoes.empuxo === 'MEDIDO' || opcoes.empuxo === 'NENHUM'))
}

/** Usuário: o nome e o usuário (login). A senha em branco: o sistema gera uma temporária. */
export const OBRIGATORIOS_USUARIO = ['nome', 'login'] as const

/** Dados da empresa (Configurações): a razão social, que sai no certificado. */
export const OBRIGATORIOS_EMPRESA = ['razaoSocial'] as const

/** Revisão do POP (Configurações → Certificado): o código, a revisão e a data (`normalizarPop`); o arquivo é opcional. */
export const OBRIGATORIOS_POP = ['codigo', 'revisao', 'data'] as const

/**
 * E-mail da empresa (Configurações → E-mail): o servidor e o usuário (o servidor recusa sem eles,
 * `normalizarConfigEmail`); a senha, enquanto não há uma gravada (em branco, a gravada continua); o e-mail do
 * remetente, quando o usuário não é um e-mail (sem ele, o remetente é o próprio usuário).
 */
export function obrigatoriosEmail(f: {
  usuario: string
  senhaDefinida: boolean
}): Array<'servidor' | 'usuario' | 'senha' | 'remetenteEmail'> {
  return [
    'servidor',
    'usuario',
    ...(f.senhaDefinida ? [] : (['senha'] as const)),
    ...(emailValido(f.usuario.trim()) ? [] : (['remetenteEmail'] as const)),
  ]
}
