// A faixa do Painel do certificado digital da empresa: vence em 30 dias ou menos, já venceu, ainda não vale, não abre no
// servidor, tem o CNPJ diferente do da empresa ou o CNPJ da empresa está em branco (nos cinco últimos, o sistema não
// emite certificados até resolver). Para o administrador, o caminho até a seção de Configurações em que resolve; para o
// operador, que também emite mas não abre Configurações, o aviso de que é com o administrador (sem link).

import { ArrowRight, FileKey2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useConsulta } from '../../lib/consulta'
import { usePode } from '../../store/sessao'
import { textoFaixaCertificado } from './textos'

export function FaixaCertificadoDigital() {
  const podeConfigurar = usePode('configuracoes')
  const { dados } = useConsulta('certificado-digital', () => api.certificadoDigital(), ['config'])
  const faixa = dados ? textoFaixaCertificado(dados.certificado, { administrador: podeConfigurar }) : null
  if (!faixa) return null
  const classe = cn(
    'mb-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-[13.5px] transition-colors',
    faixa.grave ? 'border-danger/20 bg-danger-soft text-danger' : 'border-warning/20 bg-warning-soft text-warning',
  )
  const conteudo = (
    <>
      <FileKey2 className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <b className="font-semibold">{faixa.destaque}</b> {faixa.texto}
        {podeConfigurar && ` Veja em ${faixa.onde}.`}
      </span>
    </>
  )
  if (!podeConfigurar)
    return (
      <div role="status" className={classe}>
        {conteudo}
      </div>
    )
  return (
    <Link
      to={`/configuracoes?secao=${faixa.secao}`}
      className={cn(classe, faixa.grave ? 'hover:border-danger/40' : 'hover:border-warning/40')}
    >
      {conteudo}
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  )
}
