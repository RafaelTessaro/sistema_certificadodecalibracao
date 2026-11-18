// A assinatura com o dedo, em tela cheia deitada (a tela deita sozinha e volta em pé ao sair). A área é sempre clara,
// como papel, também no modo escuro. "Limpar" à esquerda e "Confirmar" à direita, longe um do outro; "Confirmar" só fica
// ativo depois de um traço minimamente longo (um toque acidental não vale). Guardamos só a imagem (PNG): velocidade,
// pressão e tempo do traço não são guardados.

import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { bytesDoDataUrl } from '../../../shared/campo/registro.ts'
import { LIMITE_PNG_BYTES } from '../../../shared/campo/protocolo.ts'
import { deitar, ficarEmPe } from '../plataforma/orientacao.ts'
import { Botao } from './base.tsx'
import { IconeVoltar } from './Icones.tsx'

/** Comprimento mínimo do traço (px de tela) para valer como assinatura. */
const TRACO_MINIMO = 140

function comprimento(dados: ReturnType<SignaturePad['toData']>): number {
  let total = 0
  for (const traco of dados)
    for (let i = 1; i < traco.points.length; i++) {
      const a = traco.points[i - 1]
      const b = traco.points[i]
      total += Math.hypot(b.x - a.x, b.y - a.y)
    }
  return total
}

/** O PNG da assinatura, reduzido até caber no limite (300 KB). */
function pngDaAssinatura(canvas: HTMLCanvasElement): string {
  let png = canvas.toDataURL('image/png')
  let fonte: HTMLCanvasElement = canvas
  while (bytesDoDataUrl(png) > LIMITE_PNG_BYTES && fonte.width > 200) {
    const menor = document.createElement('canvas')
    menor.width = Math.round(fonte.width * 0.7)
    menor.height = Math.round(fonte.height * 0.7)
    menor.getContext('2d')!.drawImage(fonte, 0, 0, menor.width, menor.height)
    fonte = menor
    png = menor.toDataURL('image/png')
  }
  return png
}

export function AreaAssinatura({
  titulo,
  passo,
  legenda,
  frase,
  aoConfirmar,
  aoVoltar,
}: {
  titulo: string
  passo?: string
  /** "Carlos · técnico que executou". */
  legenda: string
  /** O que a assinatura significa ("Executei as medições desta folha…"). */
  frase: string
  aoConfirmar: (png: string) => void
  aoVoltar?: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pad = useRef<SignaturePad | null>(null)
  const [traco, setTraco] = useState(0)

  useEffect(() => {
    void deitar()
    const canvas = ref.current!
    const p = new SignaturePad(canvas, { penColor: '#0b0f0d', minWidth: 1.1, maxWidth: 3, throttle: 16 })
    pad.current = p
    const ajustar = () => {
      const dados = p.toData()
      const r = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = Math.round(canvas.offsetWidth * r)
      canvas.height = Math.round(canvas.offsetHeight * r)
      canvas.getContext('2d')!.scale(r, r)
      p.clear()
      if (dados.length) p.fromData(dados)
    }
    ajustar()
    const fim = () => setTraco(comprimento(p.toData()))
    p.addEventListener('endStroke', fim)
    window.addEventListener('resize', ajustar)
    return () => {
      window.removeEventListener('resize', ajustar)
      p.removeEventListener('endStroke', fim)
      p.off()
      void ficarEmPe()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-bg"
      style={{
        paddingTop: 'var(--topo)',
        paddingBottom: 'var(--base)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="flex min-h-[52px] items-center gap-2 px-2">
        {aoVoltar && (
          <button
            type="button"
            onClick={aoVoltar}
            className="flex min-h-[48px] items-center gap-1 rounded-xl px-2 text-[16px] font-medium active:bg-surface-2"
          >
            <IconeVoltar /> Voltar
          </button>
        )}
        <div className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{titulo}</div>
        {passo && <div className="px-3 text-[15px] text-ink-2">{passo}</div>}
      </div>
      <div className="relative mx-3 min-h-0 flex-1 rounded-2xl border-2 border-campo bg-papel">
        <canvas
          ref={ref}
          className="absolute inset-0 h-full w-full touch-none rounded-2xl"
          aria-label="Área para assinar com o dedo"
        />
        <div className="pointer-events-none absolute inset-x-8 bottom-[22%] border-b-2 border-dashed border-[#9aa1ab]" />
        <div className="pointer-events-none absolute bottom-[10%] left-8 text-[15px] text-[#4b5059]">✕ {legenda}</div>
      </div>
      <div className="flex items-center gap-3 px-3 py-2">
        <Botao
          onClick={() => {
            pad.current?.clear()
            setTraco(0)
          }}
        >
          Limpar
        </Botao>
        <p className="min-w-0 flex-1 text-center text-[15px] leading-snug text-ink">{frase}</p>
        <Botao
          variante="principal"
          disabled={traco < TRACO_MINIMO}
          onClick={() => ref.current && aoConfirmar(pngDaAssinatura(ref.current))}
        >
          Confirmar ▸
        </Botao>
      </div>
    </div>
  )
}
