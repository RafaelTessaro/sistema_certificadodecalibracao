import { api } from '../../lib/api'
import { useConsulta } from '../../lib/consulta'

/**
 * Há um certificado digital da empresa instalado (os certificados emitidos saem assinados digitalmente, sem as imagens das
 * assinaturas): o cadastro dos usuários avisa que a imagem não é usada neles.
 */
export function useAssinadosDigitalmente(): boolean {
  const { dados } = useConsulta('certificado-digital', () => api.certificadoDigital(), ['config'])
  return !!dados && dados.certificado.situacao !== 'SEM_CERTIFICADO'
}
