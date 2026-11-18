// Auxiliar dos testes do app do celular no servidor: um "celular" que pareia, chama as rotas /api/campo com o token e
// monta um registro de campo finalizado e assinado a partir do pacote baixado (com o núcleo puro de shared/campo).

import { calcularConteudoSha256, calcularSha256Pacote, calcularSha256Registro, sha256Hex } from '#shared/campo/canonico.ts'
import { cabecalhosDoCelular, cabecalhosSemToken, CONTRATO_CAMPO, type RespostaParear } from '#shared/campo/protocolo.ts'
import { registroInicial } from '#shared/campo/registro.ts'
import type { AssinaturaDoClienteCampo, PacoteCampo, RegistroCampo } from '#shared/campo/tipos.ts'
import type { PareamentoIniciado, ResultadoEnvioCampo } from '#shared/tipos.ts'
import type { AppComLogin } from '../auxiliaresTeste.ts'
import { ASSINATURA_EXEMPLO_1 } from '../pdf/assinaturasExemplo.ts'

export const APARELHO_TESTE = '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70'
export const OUTRO_APARELHO = '7a2d3b0f-4c5e-4d9f-8b20-3c4d5e6f7081'

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE'

/** Hora "do celular" para o cabeçalho x-bc-agora (a do servidor, a menos que o teste mude). */
export const agoraIso = () => new Date().toISOString()

/** Uma chamada do celular (com o token, o cabeçalho contra CSRF e a hora do celular). */
export function chamarCelular(
  t: AppComLogin,
  token: string,
  metodo: Metodo,
  url: string,
  o: { payload?: unknown; agora?: string; headers?: Record<string, string>; remoteAddress?: string } = {},
) {
  return t.app.inject({
    method: metodo,
    url,
    headers: { ...cabecalhosDoCelular(token, o.agora ?? agoraIso()), ...o.headers },
    ...(o.payload !== undefined ? { payload: o.payload as object } : {}),
    ...(o.remoteAddress ? { remoteAddress: o.remoteAddress } : {}),
  })
}

/** O administrador pede o código ("Cadastrar celular") para o técnico. */
export async function pedirCodigo(t: AppComLogin, usuarioId = t.comumId): Promise<PareamentoIniciado> {
  const r = await t.chamar('POST', '/api/celulares/pareamento', { cookie: t.cookieAdmin, payload: { usuarioId } })
  if (r.statusCode !== 200) throw new Error(`pareamento: ${r.statusCode} ${r.body}`)
  return r.json().pareamento
}

/** O celular manda o código (POST /api/campo/parear, pública). */
export function mandarCodigo(
  t: AppComLogin,
  codigo: string,
  o: { aparelhoId?: string; modelo?: string; versaoApp?: string; remoteAddress?: string } = {},
) {
  return t.app.inject({
    method: 'POST',
    url: '/api/campo/parear',
    headers: cabecalhosSemToken(agoraIso()),
    payload: {
      codigo,
      aparelhoId: o.aparelhoId ?? APARELHO_TESTE,
      modelo: o.modelo ?? 'Samsung SM-A546E',
      versaoApp: o.versaoApp ?? '1.1.0',
    },
    ...(o.remoteAddress ? { remoteAddress: o.remoteAddress } : {}),
  })
}

/** Cadastra o celular do técnico (o comum, por padrão) e devolve o token. */
export async function parearCelular(
  t: AppComLogin,
  o: { usuarioId?: string; aparelhoId?: string } = {},
): Promise<RespostaParear> {
  const { codigo } = await pedirCodigo(t, o.usuarioId)
  const r = await mandarCodigo(t, codigo, { aparelhoId: o.aparelhoId })
  if (r.statusCode !== 200) throw new Error(`parear: ${r.statusCode} ${r.body}`)
  return r.json()
}

/** "Enviar para o técnico" a folha de uma calibração. */
export async function enviarCalibracao(
  t: AppComLogin,
  calibracaoId: string,
  o: { tecnicoId?: string; dataPrevista?: string; recado?: string; cookie?: string } = {},
): Promise<ResultadoEnvioCampo> {
  const r = await t.chamar('POST', `/api/calibracoes/${calibracaoId}/enviar-tecnico`, {
    cookie: o.cookie ?? t.cookieAdmin,
    payload: { tecnicoId: o.tecnicoId ?? t.comumId, dataPrevista: o.dataPrevista ?? '', recado: o.recado ?? '' },
  })
  if (r.statusCode !== 200) throw new Error(`enviar: ${r.statusCode} ${r.body}`)
  return r.json()
}

/** O celular baixa o pacote e confirma o recebimento. */
export async function baixarEConfirmar(t: AppComLogin, token: string, envioId: string): Promise<PacoteCampo> {
  const p = await chamarCelular(t, token, 'GET', `/api/campo/envios/${envioId}/pacote`)
  if (p.statusCode !== 200) throw new Error(`pacote: ${p.statusCode} ${p.body}`)
  const pacote = p.json() as PacoteCampo
  const r = await chamarCelular(t, token, 'POST', `/api/campo/envios/${envioId}/recebida`, {
    payload: { pacoteSha256: calcularSha256Pacote(pacote, sha256Hex) },
  })
  if (r.statusCode !== 200) throw new Error(`recebida: ${r.statusCode} ${r.body}`)
  return pacote
}

/**
 * Um registro finalizado e assinado pelo técnico a partir do pacote: os dados impressos conferidos, o início e o término,
 * e o desfecho "incompleta" (sem as leituras), com a assinatura do cliente dispensada (laboratório), salvo outra.
 */
export function registroDoPacote(
  pacote: PacoteCampo,
  o: {
    tecnico?: { id: string; nome: string }
    aparelhoId?: string
    agora?: string
    cliente?: AssinaturaDoClienteCampo
    ajustar?: (r: RegistroCampo) => void
  } = {},
): RegistroCampo {
  const agora = o.agora ?? '2026-11-18T08:00:00-03:00'
  const r = registroInicial(
    pacote,
    o.tecnico ?? { id: 'tec', nome: 'Comum Teste' },
    { id: o.aparelhoId ?? APARELHO_TESTE, modelo: 'Samsung SM-A546E', versaoApp: '1.1.0' },
    { pacoteSha256: calcularSha256Pacote(pacote, sha256Hex), agora },
  )
  r.contrato = CONTRATO_CAMPO
  r.passos.chegada.conferencias.forEach((x) => (x.confere = true))
  r.passos.balanca.conferencias.forEach((x) => (x.confere = true))
  r.passos.chegada.local = 'LABORATORIO'
  r.passos.chegada.inicio = agora
  r.passos.final.dataCalibracao = agora.slice(0, 10)
  r.passos.final.termino = agora
  r.desfecho = 'INCOMPLETA'
  r.motivoDesfecho = 'Teste do servidor: sem as leituras.'
  o.ajustar?.(r)
  return assinar(r, agora, o.cliente)
}

/** Finaliza e assina (o técnico e a alternativa do cliente): `conteudoSha256` sobre o conteúdo como está. */
export function assinar(
  r: RegistroCampo,
  agora = '2026-11-18T08:00:00-03:00',
  cliente?: AssinaturaDoClienteCampo,
): RegistroCampo {
  r.relogio.finalizadoEm = agora
  const conteudo = calcularConteudoSha256(r, sha256Hex)
  r.assinaturas = {
    tecnico: { nome: r.tecnico.nome, png: ASSINATURA_EXEMPLO_1, em: agora, conteudoSha256: conteudo },
    cliente: cliente ?? { dispensada: 'LABORATORIO' },
  }
  return r
}

/** O sha256 que o celular calcula para o registro (o recibo confere com ele). */
export const shaDoRegistro = (r: RegistroCampo) => calcularSha256Registro(r, sha256Hex)

/** O celular entrega o registro (PUT /api/campo/registros/:envioId). */
export function entregar(
  t: AppComLogin,
  token: string,
  envioId: string,
  registro: unknown,
  o: { agora?: string; headers?: Record<string, string> } = {},
) {
  return chamarCelular(t, token, 'PUT', `/api/campo/registros/${envioId}`, {
    payload: registro,
    agora: o.agora,
    headers: o.headers,
  })
}
