// O PIN do técnico (6 dígitos, pessoal): guardado só como PBKDF2-SHA256 com sal aleatório (WebCrypto), nunca o PIN.
// 5 erros seguidos fazem esperar 30 s, e a espera dobra a cada novo erro (até 30 min). "Esqueci o PIN" = parear de novo
// pelo escritório (as folhas ficam). Puro: recebe o WebCrypto (globalThis.crypto no app e no Node 22+).

export const REGEX_PIN = /^\d{6}$/
export const pinValido = (v: unknown): v is string => typeof v === 'string' && REGEX_PIN.test(v)

export interface HashPin {
  versao: 1
  /** base64 */
  sal: string
  iteracoes: number
  /** base64 dos 32 bytes derivados. */
  hash: string
}

/** Iterações do PBKDF2: lento o bastante contra força bruta fora do celular, rápido no aparelho (≈ 0,2 s). */
export const ITERACOES_PIN = 150_000

// O tipo do WebCrypto pelo `globalThis.crypto`: o mesmo no app (DOM) e no Node (os testes ponta a ponta do servidor)
type Cripto = Pick<typeof globalThis.crypto, 'getRandomValues' | 'subtle'>
const cripto = (c?: Cripto): Cripto => {
  const x = c ?? (globalThis as { crypto?: Cripto }).crypto
  if (!x?.subtle) throw new Error('WebCrypto indisponível.')
  return x
}

const paraBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derivar(pin: string, sal: Uint8Array, iteracoes: number, c: Cripto): Promise<Uint8Array> {
  const chave = await c.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await c.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as Uint8Array<ArrayBuffer>, iterations: iteracoes },
    chave,
    256,
  )
  return new Uint8Array(bits)
}

/** O hash de um PIN novo (com sal novo). */
export async function criarHashPin(pin: string, opcoes: { iteracoes?: number; cripto?: Cripto } = {}): Promise<HashPin> {
  if (!pinValido(pin)) throw new Error('O PIN tem 6 dígitos.')
  const c = cripto(opcoes.cripto)
  const sal = c.getRandomValues(new Uint8Array(16))
  const iteracoes = opcoes.iteracoes ?? ITERACOES_PIN
  return { versao: 1, sal: paraBase64(sal), iteracoes, hash: paraBase64(await derivar(pin, sal, iteracoes, c)) }
}

/** O PIN confere com o hash guardado? (comparação em tempo constante) */
export async function conferirPin(pin: string, guardado: HashPin, opcoes: { cripto?: Cripto } = {}): Promise<boolean> {
  if (!pinValido(pin) || !guardado || guardado.versao !== 1) return false
  const esperado = deBase64(guardado.hash)
  const obtido = await derivar(pin, deBase64(guardado.sal), guardado.iteracoes, cripto(opcoes.cripto))
  if (esperado.length !== obtido.length) return false
  let dif = 0
  for (let i = 0; i < esperado.length; i++) dif |= esperado[i] ^ obtido[i]
  return dif === 0
}

/** Lê o hash guardado (texto JSON das preferências); null se não houver ou estiver estragado. */
export function lerHashPin(texto: string | null | undefined): HashPin | null {
  if (!texto) return null
  try {
    const h = JSON.parse(texto) as HashPin
    return h && h.versao === 1 && typeof h.sal === 'string' && typeof h.hash === 'string' && h.iteracoes > 0 ? h : null
  } catch {
    return null
  }
}

// ---- Tentativas ---------------------------------------------------------------------------------------------------------

export interface TentativasPin {
  /** Erros seguidos desde o último acerto. */
  erros: number
  /** Até quando esperar (ms do relógio); 0 = pode tentar. */
  bloqueadoAte: number
  /** A última espera (ms), para dobrar na próxima. */
  ultimaEsperaMs: number
}

export const ERROS_ANTES_DE_ESPERAR = 5
export const ESPERA_INICIAL_MS = 30_000
export const ESPERA_MAXIMA_MS = 30 * 60_000

export const semTentativas = (): TentativasPin => ({ erros: 0, bloqueadoAte: 0, ultimaEsperaMs: 0 })

/** Milissegundos que ainda faltam para poder tentar (0 = pode). */
export function esperaRestante(t: TentativasPin, agoraMs: number): number {
  return Math.max(0, t.bloqueadoAte - agoraMs)
}

/** Um erro: no 5º seguido espera 30 s; cada erro depois disso dobra a espera. */
export function registrarErroPin(t: TentativasPin, agoraMs: number): TentativasPin {
  const erros = t.erros + 1
  if (erros < ERROS_ANTES_DE_ESPERAR) return { ...t, erros }
  const espera = t.ultimaEsperaMs ? Math.min(t.ultimaEsperaMs * 2, ESPERA_MAXIMA_MS) : ESPERA_INICIAL_MS
  return { erros, bloqueadoAte: agoraMs + espera, ultimaEsperaMs: espera }
}

/** Acertou: zera os erros e a espera. */
export const registrarAcertoPin = (): TentativasPin => semTentativas()

/** "Espere 30 s" / "Espere 2 min" (o que mostrar enquanto bloqueado). */
export function textoDaEspera(ms: number): string {
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `Muitos erros. Espere ${s} s para tentar de novo.`
  return `Muitos erros. Espere ${Math.ceil(s / 60)} min para tentar de novo.`
}

/** Lê as tentativas guardadas (texto JSON). */
export function lerTentativas(texto: string | null | undefined): TentativasPin {
  if (!texto) return semTentativas()
  try {
    const t = JSON.parse(texto) as TentativasPin
    return Number.isFinite(t.erros) && Number.isFinite(t.bloqueadoAte) && Number.isFinite(t.ultimaEsperaMs) ? t : semTentativas()
  } catch {
    return semTentativas()
  }
}
