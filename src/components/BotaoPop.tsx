// "POP": abre o arquivo da revisão vigente do Procedimento Operacional Padrão, para qualquer pessoa da
// equipe (o técnico consulta em campo, mostra a quem pedir). Quem registra é o administrador, em
// Configurações → Certificado.

import { BookOpenText } from 'lucide-react'
import { textoPop } from '#shared/arquivos.ts'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { toast } from '../store/ui'
import { Button } from './ui/Button'

export function BotaoPop({ className }: { className?: string }) {
  const { dados } = useConsulta('pop', () => api.pop(), ['config'])
  const atual = dados?.atual ?? null

  const abrir = () => {
    if (!atual) return toast.info('Nenhum POP registrado', 'O administrador registra o POP em Configurações → Certificado.')
    if (!atual.arquivo)
      return toast.info(
        `O arquivo do ${textoPop(atual)} ainda não foi anexado`,
        'O administrador anexa o arquivo em Configurações → Certificado.',
      )
    window.open(api.urlArquivo(atual.arquivo.sha256), '_blank', 'noopener')
  }

  return (
    <Button
      icone={<BookOpenText className="h-4 w-4" />}
      onClick={abrir}
      className={className}
      title={
        atual
          ? `Procedimento Operacional Padrão de calibração: ${textoPop(atual)}${atual.arquivo ? '' : ' (arquivo ainda não anexado)'}`
          : 'Procedimento Operacional Padrão de calibração (ainda não registrado)'
      }
    >
      POP
    </Button>
  )
}
