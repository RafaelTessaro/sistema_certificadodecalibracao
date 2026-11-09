// Os campos obrigatórios dos cadastros (a marca "●" das telas: obrigatório para salvar), com as mesmas regras de
// `normalizarCliente`, `normalizarBalanca`, `normalizarPadrao`, `normalizarNovoUsuario` e `normalizarConfig`: os testes
// conferem que o campo marcado em branco impede gravar e o não marcado não impede. Os da calibração (obrigatório para
// emitir) estão em `camposObrigatoriosEmissao` (dominio.ts), junto das pendências.

import type { ClienteInput, PadraoInput } from './tipos.ts'

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

/** Usuário: o nome e o usuário (login). A senha em branco: o sistema gera uma temporária. */
export const OBRIGATORIOS_USUARIO = ['nome', 'login'] as const

/** Dados da empresa (Configurações): a razão social, que sai no certificado. */
export const OBRIGATORIOS_EMPRESA = ['razaoSocial'] as const
