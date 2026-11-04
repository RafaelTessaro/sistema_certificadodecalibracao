// O arquivo escolhido na tela (o certificado de um padrão, o POP) antes de ser enviado: conferido pelo nome e pelos
// primeiros bytes e aberto ("Abrir", antes de salvar) sempre com o tipo conferido. Nunca com o tipo que o navegador deu
// pela extensão: o endereço local (blob:) é da origem do sistema, e uma página com nome e começo de documento
// ("Certificado.pdf.html" começando com "%PDF-") aberta como página rodaria com a sessão de quem abriu.

import {
  detectarTipoArquivo,
  extensaoAceita,
  MIME_ARQUIVO,
  problemaDoArquivo,
  type FinalidadeArquivo,
  type TipoArquivo,
} from '#shared/arquivos.ts'

/** O tipo conferido de cada arquivo escolhido que passou (o mesmo objeto File volta para o campo como valor). */
const conferidos = new WeakMap<File, TipoArquivo>()

/**
 * Confere o arquivo escolhido: a extensão (a de um tipo aceito para a finalidade, ou nenhuma), o tamanho e o tipo
 * pelos primeiros bytes (o servidor confere o arquivo inteiro ao receber). Devolve o problema ou o tipo conferido.
 */
export async function conferirArquivoLocal(
  arquivo: File,
  finalidade: FinalidadeArquivo,
): Promise<{ problema: string; tipo: null } | { problema: null; tipo: TipoArquivo }> {
  let tipo: TipoArquivo | null = null
  if (extensaoAceita(arquivo.name, finalidade)) {
    try {
      tipo = detectarTipoArquivo(new Uint8Array(await arquivo.slice(0, 2048).arrayBuffer()), true)
    } catch {
      return { problema: 'Não foi possível ler o arquivo. Tente de novo.', tipo: null }
    }
  }
  const problema = problemaDoArquivo(arquivo.size, tipo, finalidade)
  if (problema || !tipo) return { problema: problema ?? problemaDoArquivo(1, null, finalidade)!, tipo: null }
  conferidos.set(arquivo, tipo)
  return { problema: null, tipo }
}

/** O tipo conferido pelo conteúdo de um arquivo escolhido; null se ele não passou por `conferirArquivoLocal`. */
export const tipoConferido = (arquivo: File): TipoArquivo | null => conferidos.get(arquivo) ?? null

/**
 * Endereço local para abrir o arquivo escolhido (ainda não enviado), com o tipo conferido: o PDF abre no leitor, a
 * imagem como imagem e o Word é baixado. '' para o arquivo que não passou pela conferência. Quem chama libera o
 * endereço (`URL.revokeObjectURL`).
 */
export function urlParaAbrir(arquivo: File): string {
  const tipo = tipoConferido(arquivo)
  return tipo ? URL.createObjectURL(new Blob([arquivo], { type: MIME_ARQUIVO[tipo] })) : ''
}
