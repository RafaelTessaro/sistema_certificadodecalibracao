// A sincronia ("entrega"): quem chama é sempre o celular — ao abrir o app, ao voltar para ele, em "Atualizar agora" e
// logo depois de finalizar uma folha. Uma rodada:
//
//   1. olá: informa o estado de cada folha que o celular tem; recebe a lista de envios, os pedidos de recolher, os envios
//      que o servidor não conhece, a versão do app disponível e a hora do servidor;
//   2. recolher: folha não começada (ou que o celular nem tem) → apaga e responde "Apaguei"; começada → NÃO apaga,
//      responde "Já comecei" e entrega quando estiver finalizada;
//   3. desconhecidos: não começada → apaga sem avisar; começada → entrega (o servidor grava como órfã);
//   4. novas: baixa o pacote (RECEBENDO), confere o formato, guarda e confirma (recebida); só com NO_CELULAR a folha fica
//      NOVA e pode ser começada; com RECOLHIDA, o pacote sai;
//   5. entregar: cada folha finalizada vai inteira (PUT); a folha só sai do celular quando o recibo confere (mesmo nº,
//      mesmo envio e o mesmo sha256 que o celular calculou). Repetir a entrega devolve o mesmo recibo: se a rede cair
//      depois de o servidor gravar, a próxima rodada reenvia e recebe o recibo de novo;
//   6. limpar: o resumo das entregues e o aviso das retiradas ficam 7 dias.
//
// Celular descadastrado (401 DESCADASTRADO no olá): não recebe folhas, mas continua entregando as finalizadas (o
// servidor aceita e marca), salvo o motivo "roubado" (a entrega também responde 401, e a folha fica guardada). Token
// desconhecido (401 NAO_PAREADO): nada a fazer até parear de novo; as folhas ficam intactas.
//
// Se a rede cair no meio, a rodada para (sem apagar nada) e a próxima continua de onde estiver. Puro.

import { calcularSha256Pacote, calcularSha256Registro } from '../../../shared/campo/canonico.ts'
import type { FuncaoSha256 } from '../../../shared/campo/canonico.ts'
import { CONTRATO_CAMPO, diferencaRelogioMs, reciboConfere } from '../../../shared/campo/protocolo.ts'
import type { MotivoSemFolhas, ServidorCampo } from '../../../shared/campo/protocolo.ts'
import type { Instante, PessoaCampo } from '../../../shared/campo/tipos.ts'
import type { ApiCampo, FalhaCampo } from './cliente.ts'
import {
  folhaComecada,
  folhaRecebida,
  folhaRetirada,
  marcarEntregue,
  recebimentoConfirmado,
  registrarFalhaEntrega,
} from './folha.ts'
import { expiradas } from './lista.ts'
import type { Relogio } from './relogio.ts'
import { META } from './repositorio.ts'
import type { Repositorio } from './repositorio.ts'

export interface DependenciasSincronia {
  repositorio: Repositorio
  api: ApiCampo
  relogio: Relogio
  sha256: FuncaoSha256
  versaoApp: string
}

export interface ResultadoSincronia {
  em: Instante
  /** O servidor respondeu (mesmo com erro). false = fora da rede da empresa. */
  conectou: boolean
  /** O que parou a rodada (rede que caiu, erro do servidor); null = foi até o fim. */
  falha: FalhaCampo | null
  descadastrado: boolean
  naoPareado: boolean
  servidor: ServidorCampo | null
  tecnico: PessoaCampo | null
  recebeFolhas: boolean
  motivoSemFolhas: MotivoSemFolhas | null
  appDisponivel: { versao: string; url: string } | null
  /** Hora do celular − hora do servidor (ms); null se não deu para comparar. */
  relogioDiferencaMs: number | null
  /** FCs novas, confirmadas nesta rodada. */
  novas: string[]
  /** FCs baixadas que ainda esperam a confirmação do servidor (não podem ser começadas). */
  aguardando: string[]
  /** FCs retiradas pelo escritório nesta rodada. */
  retiradas: string[]
  entregues: Array<{ numero: string; recebidoEm: string }>
  naoEntregues: Array<{ numero: string; motivo: string }>
  /** Outras frases para o técnico ("A FC-… já está em outro celular."). */
  avisos: string[]
}

function resultadoVazio(em: Instante): ResultadoSincronia {
  return {
    em,
    conectou: false,
    falha: null,
    descadastrado: false,
    naoPareado: false,
    servidor: null,
    tecnico: null,
    recebeFolhas: true,
    motivoSemFolhas: null,
    appDisponivel: null,
    relogioDiferencaMs: null,
    novas: [],
    aguardando: [],
    retiradas: [],
    entregues: [],
    naoEntregues: [],
    avisos: [],
  }
}

/** Uma rodada completa. Nunca lança exceção por causa da rede ou do servidor. */
export async function sincronizar(dep: DependenciasSincronia): Promise<ResultadoSincronia> {
  const { repositorio: repo, api, relogio } = dep
  const r = resultadoVazio(relogio.agora())
  /** A rede caiu (ou o servidor parou de responder) no meio: nenhuma chamada a mais nesta rodada. */
  let caiu = false
  const rede = (falha: FalhaCampo) => {
    if (falha.tipo === 'REDE') {
      caiu = true
      r.falha ??= falha
      return true
    }
    return false
  }

  const folhas = await repo.listar()
  const agoraCelular = relogio.agora()
  const ola = await api.ola({
    versaoApp: dep.versaoApp,
    contrato: CONTRATO_CAMPO,
    agora: agoraCelular,
    estados: folhas
      .filter((f) => f.estado !== 'ENTREGUE' && f.estado !== 'RETIRADA')
      .map((f) => ({ envioId: f.envioId, estado: f.estado })),
  })

  if (!ola.ok) {
    if (ola.falha.tipo === 'REDE') {
      r.falha = ola.falha
      return terminar(dep, r)
    }
    r.conectou = true
    if (ola.falha.codigo === 'DESCADASTRADO') r.descadastrado = true
    else {
      r.falha = ola.falha
      if (ola.falha.codigo === 'NAO_PAREADO') r.naoPareado = true
      return terminar(dep, r)
    }
  } else {
    const o = ola.valor
    r.conectou = true
    r.servidor = o.servidor ?? null
    r.tecnico = o.tecnico ?? null
    r.recebeFolhas = o.recebeFolhas
    r.motivoSemFolhas = o.motivoSemFolhas ?? null
    r.appDisponivel = o.appDisponivel ?? null
    r.relogioDiferencaMs = diferencaRelogioMs(agoraCelular, o.agora)

    // 2. Recolher
    for (const envioId of o.recolher) {
      if (caiu) break
      const f = await repo.obter(envioId)
      if (f && folhaComecada(f)) {
        if (f.respondeuJaComecei) continue
        const x = await api.recolhimento(envioId, 'JA_COMECEI')
        if (x.ok) {
          const atual = await repo.obter(envioId)
          if (atual) await repo.gravar({ ...atual, respondeuJaComecei: true })
        } else rede(x.falha)
        continue
      }
      if (f?.estado === 'ENTREGUE') continue
      if (f && f.estado !== 'RETIRADA') {
        await repo.gravar(folhaRetirada(f, 'RECOLHIDA', relogio.agora()))
        r.retiradas.push(f.numero)
      }
      const x = await api.recolhimento(envioId, 'APAGUEI')
      if (!x.ok) rede(x.falha)
    }

    // 3. Desconhecidos: a não começada sai sem aviso; a começada é entregue (órfã)
    for (const envioId of o.desconhecidos) {
      const f = await repo.obter(envioId)
      if (!f || folhaComecada(f) || f.estado === 'ENTREGUE' || f.estado === 'RETIRADA') continue
      await repo.gravar(folhaRetirada(f, 'DESCONHECIDO', relogio.agora()))
    }

    // 4. Folhas novas: baixar, guardar e confirmar
    for (const envio of o.envios) {
      if (caiu) break
      let f = await repo.obter(envio.envioId)
      if (f && f.estado !== 'RECEBENDO' && f.estado !== 'RETIRADA') continue
      if (!f || f.estado === 'RETIRADA' || !f.pacote) {
        const p = await api.pacote(envio.envioId)
        if (!p.ok) {
          if (!rede(p.falha)) r.avisos.push(`${envio.numero}: ${p.falha.mensagem}`)
          continue
        }
        f = folhaRecebida(envio, p.valor, await calcularSha256Pacote(p.valor, dep.sha256), relogio.agora())
        await repo.gravar(f)
      }
      const c = await api.recebida(envio.envioId, f.pacoteSha256)
      const atual = (await repo.obter(envio.envioId)) ?? f
      if (!c.ok) {
        if (!rede(c.falha)) {
          r.avisos.push(`${f.numero}: ${c.falha.mensagem}`)
          if (c.falha.tipo === 'HTTP' && c.falha.codigo === 'OUTRO_CELULAR' && !folhaComecada(atual)) {
            await repo.gravar(folhaRetirada(atual, 'DESCONHECIDO', relogio.agora()))
            continue
          }
        }
        r.aguardando.push(f.numero)
        continue
      }
      if (c.valor.situacao === 'RECOLHIDA') {
        if (!folhaComecada(atual)) {
          await repo.gravar(folhaRetirada(atual, 'RECOLHIDA', relogio.agora()))
          r.retiradas.push(f.numero)
        }
      } else if (c.valor.situacao === 'NO_CELULAR') {
        await repo.gravar(recebimentoConfirmado(atual, relogio.agora()))
        r.novas.push(f.numero)
      } else r.aguardando.push(f.numero)
    }
  }

  // 5. Entregar as finalizadas (também descadastrado: o servidor aceita, salvo "roubado")
  const finalizadas = (await repo.listar())
    .filter((f) => f.estado === 'FINALIZADA' && f.registro)
    .sort((a, b) =>
      (a.registro!.relogio.finalizadoEm || a.atualizadaEm).localeCompare(b.registro!.relogio.finalizadoEm || b.atualizadaEm),
    )
  for (const f of finalizadas) {
    if (caiu) break
    const registro = f.registro!
    const sha = await calcularSha256Registro(registro, dep.sha256)
    const x = await api.entregar(registro)
    const atual = await repo.obter(f.envioId)
    if (x.ok && reciboConfere(x.valor, registro, sha)) {
      // Só apaga se a folha guardada ainda é a que foi entregue (uma correção feita durante a entrega sobe na próxima)
      if (
        atual?.estado === 'FINALIZADA' &&
        atual.registro &&
        (await calcularSha256Registro(atual.registro, dep.sha256)) === sha
      ) {
        await repo.gravar(marcarEntregue(atual, x.valor, relogio.agora()))
        r.entregues.push({ numero: f.numero, recebidoEm: x.valor.recebidoEm })
      }
      continue
    }
    let motivo: string
    if (x.ok) motivo = 'O recibo do servidor não confere com a folha. Ela continua no celular; vou tentar de novo.'
    else if (rede(x.falha)) motivo = 'A conexão caiu durante a entrega. A folha continua no celular; vou tentar de novo.'
    else motivo = x.falha.mensagem
    if (atual) await repo.gravar(registrarFalhaEntrega(atual, motivo, relogio.agora()))
    r.naoEntregues.push({ numero: f.numero, motivo })
    const falha = x.ok ? null : x.falha
    if (falha?.tipo === 'HTTP' && (falha.codigo === 'NAO_PAREADO' || falha.codigo === 'DESCADASTRADO')) {
      if (falha.codigo === 'NAO_PAREADO') r.naoPareado = true
      else r.descadastrado = true
      r.falha ??= falha
      break
    }
  }
  return terminar(dep, r)
}

/** Limpa o que expirou e grava o resultado da rodada. */
async function terminar(dep: DependenciasSincronia, r: ResultadoSincronia): Promise<ResultadoSincronia> {
  const agora = dep.relogio.agora()
  for (const envioId of expiradas(await dep.repositorio.listar(), agora)) await dep.repositorio.apagar(envioId)
  await dep.repositorio.gravarMeta(META.ultimaSincronia, JSON.stringify(r))
  if (r.entregues.length) await dep.repositorio.gravarMeta(META.ultimaEntrega, agora)
  return r
}

/** A frase da faixa de entrega para o resultado da última rodada. */
export function frasesDoResultado(r: ResultadoSincronia): string[] {
  const frases: string[] = []
  if (r.entregues.length)
    frases.push(`${r.entregues.map((e) => e.numero).join(', ')}: entregue${r.entregues.length > 1 ? 's' : ''}.`)
  if (r.novas.length) frases.push(`${r.novas.length === 1 ? '1 folha nova' : `${r.novas.length} folhas novas`} do escritório.`)
  for (const n of r.retiradas) frases.push(`A ${n} foi retirada pelo escritório.`)
  for (const n of r.naoEntregues) frases.push(`Não consegui entregar a ${n.numero}. ${n.motivo}`)
  frases.push(...r.avisos)
  return frases
}
