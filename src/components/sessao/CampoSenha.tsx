import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Input } from '../ui/Form'

/**
 * Campo de senha com o botão de mostrar/ocultar. `autoComplete` diz ao navegador o que guardar:
 * "current-password" ao entrar, "new-password" ao criar (o navegador pode sugerir uma senha forte).
 * O botão do olho fica fora da ordem do Tab (o Tab vai direto para o campo seguinte); pelo teclado,
 * Alt+F8 no campo mostra e oculta a senha (o mesmo atalho do Edge).
 */
export const CampoSenha = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { autoComplete: 'current-password' | 'new-password' }
>(function CampoSenha({ className, onKeyDown, ...props }, ref) {
  const [visivel, setVisivel] = useState(false)
  const rotulo = visivel ? 'Ocultar a senha' : 'Mostrar a senha'
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visivel ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        // Sem o olho do próprio Edge, que apareceria ao lado deste
        className={cn('pr-11 [&::-ms-reveal]:hidden', className)}
        onKeyDown={(e) => {
          if (e.altKey && e.key === 'F8') {
            e.preventDefault()
            setVisivel((v) => !v)
          }
          onKeyDown?.(e)
        }}
        {...props}
      />
      <button
        type="button"
        // Fora do Tab: o Tab segue para o próximo campo. Continua no clique e para o leitor de tela
        tabIndex={-1}
        // Não tira o foco do campo (dá para continuar digitando)
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisivel((v) => !v)}
        // Botão de alternar: o nome fica fixo e o aria-pressed diz se a senha está à mostra
        aria-label="Mostrar a senha"
        aria-pressed={visivel}
        title={`${rotulo} (Alt+F8)`}
        className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})
