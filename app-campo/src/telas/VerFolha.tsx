// "Ver a folha": tudo o que foi anotado, passo a passo, só para ler (as leituras como foram digitadas, com a hora; as
// anotações; os avisos conferidos; as correções; as tentativas recomeçadas; as assinaturas).

import type { ReactNode } from 'react'
import { leiturasDoRegistro } from '../../../shared/campo/avisos.ts'
import { formatarInstante } from '../../../shared/campo/registro.ts'
import { ROTULO_TIPO_ANOTACAO, TITULOS_PASSOS } from '../../../shared/campo/tipos.ts'
import type { AssinaturaClienteCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { voltar } from '../app/acoes.ts'
import { useFolha } from '../app/loja.ts'
import { Cabecalho, Linha, SecaoTitulo, Tela } from '../componentes/base.tsx'
import { dataBr } from '../nucleo/datas.ts'
import { rotuloDoCampo, unidadeDoCampo, valorLegivel } from '../nucleo/rotulos.ts'
import { assinantes } from './Comprovante.tsx'

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <SecaoTitulo>{titulo}</SecaoTitulo>
      <div className="mx-4 rounded-2xl border border-line-strong bg-surface px-4 py-1">{children}</div>
    </section>
  )
}

const conf = (c: { confere: boolean | null; observado?: string }) =>
  c.confere === true ? 'Confere' : c.confere === false ? `Algo diferente${c.observado ? `: ${c.observado}` : ''}` : '—'

export function TelaVerFolha({ envioId }: { envioId: string }) {
  const f = useFolha(envioId)
  if (!f?.registro) return null
  const r: RegistroCampo = f.registro
  const ps = r.passos
  const leituras = leiturasDoRegistro(r)
  const porPasso = (prefixo: RegExp) => leituras.filter((x) => prefixo.test(x.campo))
  const listaLeituras = (lista: typeof leituras) =>
    lista.length ? (
      lista.map((x) => (
        <Linha key={x.campo} rotulo={rotuloDoCampo(r, f.pacote, x.campo)}>
          <span className="tabular-nums">
            {x.leitura.valor} {unidadeDoCampo(r, f.pacote, x.campo)}
          </span>
          <span className="block text-[12px] font-normal text-ink-2">
            {formatarInstante(x.leitura.em)}
            {x.leitura.via === 'repetir' ? ' · repetida' : ''}
          </span>
        </Linha>
      ))
    ) : (
      <p className="py-2 text-[15px] text-ink-2">Nada anotado.</p>
    )
  const cliente =
    r.assinaturas.cliente && 'png' in r.assinaturas.cliente ? (r.assinaturas.cliente as AssinaturaClienteCampo) : null
  return (
    <Tela>
      <Cabecalho titulo={<span className="numero-fc">{f.numero}</span>} subtitulo="A folha, só para ler" aoVoltar={voltar} />
      {r.piloto && <p className="mx-4 mt-3 rounded-xl bg-surface-3 px-3 py-2 text-[14px] font-semibold uppercase">Piloto</p>}
      <Bloco titulo={`1 · ${TITULOS_PASSOS.padroes}`}>
        {ps.padroes.map((p) => (
          <Linha key={p.id} rotulo={p.identificacao}>
            {[p.levado ? 'levado' : '', p.usado ? 'usado' : '', p.outro ? 'outro' : ''].filter(Boolean).join(' · ') || '—'}
          </Linha>
        ))}
      </Bloco>
      <Bloco titulo={`2 · ${TITULOS_PASSOS.chegada}`}>
        {ps.chegada.conferencias.map((c) => (
          <Linha key={c.campo} rotulo={c.rotulo}>
            {conf(c)}
          </Linha>
        ))}
        {ps.chegada.clienteInformado && (
          <Linha rotulo="Cliente informado">{ps.chegada.clienteInformado.razaoSocial || '—'}</Linha>
        )}
        <Linha rotulo="Onde">
          {ps.chegada.local === 'LABORATORIO' ? 'No laboratório' : ps.chegada.local === 'CLIENTE' ? 'No cliente' : '—'}
        </Linha>
        {ps.chegada.os && <Linha rotulo="OS">{ps.chegada.os}</Linha>}
        {ps.chegada.localEndereco && <Linha rotulo="Endereço">{ps.chegada.localEndereco}</Linha>}
        <Linha rotulo="Técnico">{r.tecnico.nome}</Linha>
        <Linha rotulo="Início">{formatarInstante(ps.chegada.inicio) || '—'}</Linha>
      </Bloco>
      <Bloco titulo={`3 · ${TITULOS_PASSOS.balanca}`}>
        {ps.balanca.conferencias.map((c) => (
          <Linha key={c.campo} rotulo={`${c.rotulo} (${c.mostrado || '—'})`}>
            {conf(c)}
          </Linha>
        ))}
        {ps.balanca.informada && (
          <>
            {(['tipo', 'fabricante', 'modelo', 'numeroSerie', 'identificacao', 'localInstalacao'] as const).map((k) => (
              <Linha
                key={k}
                rotulo={
                  k === 'numeroSerie'
                    ? 'Nº de série'
                    : k === 'identificacao'
                      ? 'TAG'
                      : k === 'localInstalacao'
                        ? 'Local'
                        : k[0].toUpperCase() + k.slice(1)
                }
              >
                {ps.balanca.informada![k] || '—'}
              </Linha>
            ))}
            <Linha rotulo="Classe · unidade">
              {ps.balanca.informada.classe || '—'} · {ps.balanca.informada.unidade || '—'}
            </Linha>
            {ps.balanca.informada.faixas.map((x, i) => (
              <Linha key={i} rotulo={`Faixa ${i + 1}`}>
                Max {x.max || '—'} · e {x.e || '—'} · d {x.d || '—'}
              </Linha>
            ))}
          </>
        )}
      </Bloco>
      <Bloco titulo={`4 · ${TITULOS_PASSOS.ambiente}`}>
        {ps.ambiente.linhas.map((l, i) => (
          <Linha key={i} rotulo={rotuloDoCampo(r, f.pacote, `ambiente.linhas.${i}.em`)}>
            {formatarInstante(l.em) || '—'}
          </Linha>
        ))}
        {listaLeituras(porPasso(/^ambiente\./))}
        {ps.ambiente.pesosNoLocalDesde && (
          <Linha rotulo="Pesos no local desde">{formatarInstante(ps.ambiente.pesosNoLocalDesde)}</Linha>
        )}
      </Bloco>
      <Bloco titulo={`5 · ${TITULOS_PASSOS.indicacao}`}>
        {ps.indicacao.calInterno && (
          <Linha rotulo="CAL antes dos ensaios">
            {ps.indicacao.calInterno.feito ? formatarInstante(ps.indicacao.calInterno.em) || 'feito' : 'não'}
          </Linha>
        )}
        {listaLeituras(porPasso(/^indicacao\./))}
        {ps.indicacao.substituicao?.etapas.map((e, i) =>
          e.material ? (
            <Linha key={i} rotulo={`Etapa ${i + 1} · material`}>
              {e.material}
            </Linha>
          ) : null,
        )}
      </Bloco>
      <Bloco titulo={`6 · ${TITULOS_PASSOS.repetibilidade}`}>{listaLeituras(porPasso(/^repetibilidade\./))}</Bloco>
      <Bloco titulo={`7 · ${TITULOS_PASSOS.excentricidade}`}>
        {ps.excentricidade.aplicavel === false ? (
          <Linha rotulo="Não feita">{ps.excentricidade.motivo || '—'}</Linha>
        ) : (
          listaLeituras(porPasso(/^excentricidade\./))
        )}
      </Bloco>
      <Bloco titulo={`8 · Encerramento`}>
        <Linha rotulo="Data da calibração">{dataBr(ps.final.dataCalibracao) || '—'}</Linha>
        <Linha rotulo="Término">{formatarInstante(ps.final.termino) || '—'}</Linha>
      </Bloco>
      {r.anotacoes.length > 0 && (
        <Bloco titulo="Anotações">
          {r.anotacoes.map((a) => (
            <Linha key={a.id} rotulo={`Passo ${a.passo} · ${ROTULO_TIPO_ANOTACAO[a.tipo]} · ${formatarInstante(a.em)}`}>
              <span className="font-normal">{a.texto}</span>
            </Linha>
          ))}
        </Bloco>
      )}
      {r.avisosConferidos.length > 0 && (
        <Bloco titulo="Avisos conferidos">
          {r.avisosConferidos.map((a, i) => (
            <Linha key={i} rotulo={`${a.classe === 'IMPEDE' ? 'Impede' : 'Digitação'} · ${formatarInstante(a.em)}`}>
              <span className="font-normal">
                {a.texto}
                {a.motivo ? ` — motivo: ${a.motivo}` : ''}
              </span>
            </Linha>
          ))}
        </Bloco>
      )}
      {r.trilha.length > 0 && (
        <Bloco titulo="Correções antes de assinar">
          {r.trilha.map((c, i) => (
            <Linha key={i} rotulo={`${rotuloDoCampo(r, f.pacote, c.campo)} · ${formatarInstante(c.em)}`}>
              <s className="font-normal text-ink-2">{valorLegivel(c.de)}</s> → {valorLegivel(c.para)}
            </Linha>
          ))}
        </Bloco>
      )}
      {r.tentativas.length > 0 && (
        <Bloco titulo="Ensaios recomeçados (só consulta)">
          {r.tentativas.map((t) => (
            <Linha key={t.n} rotulo={`Tentativa ${t.n} · ${formatarInstante(t.encerradaEm)}`}>
              <span className="font-normal">{t.motivo}</span>
            </Linha>
          ))}
        </Bloco>
      )}
      {r.reaberturas.length > 0 && (
        <Bloco titulo="Reaberturas">
          {r.reaberturas.map((x, i) => (
            <Linha key={i} rotulo={formatarInstante(x.em)}>
              <span className="font-normal">{x.motivo}</span>
            </Linha>
          ))}
        </Bloco>
      )}
      {r.assinaturas.tecnico && (
        <Bloco titulo="Assinaturas">
          {assinantes(f).map((a) => (
            <p key={a} className="py-1 text-[15px]">
              {a}
            </p>
          ))}
          <div className="flex gap-2 py-2">
            <img
              src={r.assinaturas.tecnico.png}
              alt={`Assinatura de ${r.assinaturas.tecnico.nome}`}
              className="h-20 flex-1 rounded-lg bg-papel object-contain"
            />
            {cliente && (
              <img
                src={cliente.png}
                alt={`Assinatura de ${cliente.nome}`}
                className="h-20 flex-1 rounded-lg bg-papel object-contain"
              />
            )}
          </div>
        </Bloco>
      )}
      <div className="h-8" />
    </Tela>
  )
}
