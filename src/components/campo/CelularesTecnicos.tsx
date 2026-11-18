// Usuários → "Celulares dos técnicos" (só o administrador): os celulares com o app BC Calibração — o técnico, o aparelho,
// a versão do app, "visto hoje às 07:55 · 192.168.0.23" e quantas folhas estão nele —, com Renomear, Parear de novo e
// Revogar (com o motivo), "Cadastrar celular" e a configuração do registro original (papel no piloto, ou o celular).

import { FileStack, Pencil, Plus, RefreshCw, ShieldOff, Smartphone, TriangleAlert, Unplug } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { RegistroOriginal } from '#shared/campo/tipos.ts'
import {
  type CelularListado,
  type ConfiguracaoCampo,
  MOTIVOS_REVOGACAO,
  type MotivoRevogacao,
  ROTULO_MOTIVO_REVOGACAO,
  type Usuario,
} from '#shared/tipos.ts'
import { api, ErroApi } from '../../lib/api'
import { textoVisto } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { dataHora } from '../../lib/format'
import { useTempoReal } from '../../store/tempoReal'
import { avisarErro, toast } from '../../store/ui'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { confirmar } from '../ui/Feedback'
import { Field, Input, Select, Textarea } from '../ui/Form'
import { Avatar } from '../ui/Misc'
import { Modal } from '../ui/Modal'
import { Linha, Tabela, Td, Th } from '../ui/Table'
import { MenuAcoes, type AcaoMenu } from '../usuarios/MenuAcoes'
import { CadastrarCelularModal } from './CadastrarCelularModal'
import { GrupoEscolha, OpcaoEscolha } from './OpcaoEscolha'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function CelularesTecnicos({ usuarios, aoMudar }: { usuarios: Usuario[]; aoMudar?: () => void }) {
  const [celulares, setCelulares] = useState<CelularListado[] | null>(null)
  const [erro, setErro] = useState('')
  const [rodada, setRodada] = useState(0)
  const [cadastrando, setCadastrando] = useState(false)
  const [pareandoDeNovo, setPareandoDeNovo] = useState<CelularListado | null>(null)
  const [renomeando, setRenomeando] = useState<CelularListado | null>(null)
  const [revogando, setRevogando] = useState<CelularListado | null>(null)
  const carregar = useCallback(() => setRodada((r) => r + 1), [])

  useEffect(() => {
    let valendo = true
    api.celulares().then(
      (r) => {
        if (!valendo) return
        setCelulares(r.celulares)
        setErro('')
      },
      (e: unknown) => valendo && setErro(e instanceof Error ? e.message : 'Erro inesperado.'),
    )
    return () => {
      valendo = false
    }
  }, [rodada])

  // Os celulares não passam pelo tempo real: busca de novo quando a janela volta a ter foco
  useEffect(() => {
    window.addEventListener('focus', carregar)
    return () => window.removeEventListener('focus', carregar)
  }, [carregar])

  const tecnicos = usuarios.filter((u) => u.ativo && u.tecnico)
  const lista = celulares ?? []
  const valendo = lista.filter((c) => !c.revogado)
  const fechouAlgo = () => {
    carregar()
    aoMudar?.()
  }

  const acoes = (c: CelularListado): Array<AcaoMenu | 'sep'> => [
    { label: 'Renomear', icone: <Pencil className="h-4 w-4" />, aoClicar: () => setRenomeando(c) },
    {
      label: 'Parear de novo',
      icone: <Unplug className="h-4 w-4" />,
      aoClicar: () => setPareandoDeNovo(c),
      motivo: !c.tecnicoAtivo ? 'O técnico deste celular está desativado ou foi excluído.' : undefined,
    },
    'sep',
    {
      label: 'Revogar',
      icone: <ShieldOff className="h-4 w-4" />,
      aoClicar: () => setRevogando(c),
      perigo: true,
      motivo: c.revogado ? 'Este celular já foi revogado.' : undefined,
    },
  ]

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          icone={<Smartphone className="h-4 w-4" />}
          titulo="Celulares dos técnicos"
          descricao={
            celulares
              ? `O app BC Calibração no celular de quem vai a campo · ${plural(valendo.length, 'celular', 'celulares')}`
              : 'Carregando…'
          }
          acoes={
            <>
              <Button variante="ghost" tamanho="icon-sm" onClick={carregar} aria-label="Atualizar" title="Atualizar">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                tamanho="sm"
                variante="primary"
                icone={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setCadastrando(true)}
              >
                Cadastrar celular
              </Button>
            </>
          }
        />
        {erro && !celulares ? (
          <p className="border-t border-line px-5 py-6 text-sm text-danger">{erro}</p>
        ) : celulares && lista.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-t border-line px-5 py-8 text-center">
            <Smartphone className="h-6 w-6 text-muted" />
            <p className="text-sm font-medium text-ink">Nenhum celular cadastrado</p>
            <p className="max-w-md text-[13px] text-muted">
              Cadastre o celular de quem vai a campo para enviar as folhas de campo para ele. O técnico preenche no cliente, sem
              internet, e a folha volta quando o celular entra no Wi-Fi da empresa.
            </p>
          </div>
        ) : (
          celulares && (
            <Tabela className="border-t border-line">
              <thead>
                <tr>
                  <Th>Técnico</Th>
                  <Th className="max-md:hidden">Aparelho</Th>
                  <Th className="max-lg:hidden">Na rede</Th>
                  <Th className="max-sm:hidden">Folhas</Th>
                  <Th className="max-sm:hidden">Situação</Th>
                  <Th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {lista.map((c, i) => (
                  <Linha key={c.id} indice={i} className={cn(c.revogado && 'opacity-70')}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar nome={c.tecnicoNome || '?'} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{c.tecnicoNome || 'Técnico excluído'}</p>
                          <p className="truncate text-xs text-ink-2">{c.nome}</p>
                          <p className="truncate text-xs text-muted lg:hidden">{textoVisto(c.ultimoContato, c.ultimoIp)}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="max-md:hidden">
                      <p className="text-ink-2">{c.modelo || '—'}</p>
                      <p className="tnum text-xs text-muted">
                        {c.versaoApp ? `App ${c.versaoApp}` : 'Versão do app não informada'}
                      </p>
                    </Td>
                    <Td className="max-lg:hidden">
                      <p className="tnum text-[13px] whitespace-nowrap text-ink-2">{textoVisto(c.ultimoContato, c.ultimoIp)}</p>
                      <p className="text-xs text-muted">Pareado em {dataHora(c.pareadoEm)}</p>
                    </Td>
                    <Td className="max-sm:hidden">
                      <span
                        className={cn(
                          'tnum inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap',
                          c.folhasNoCelular ? 'font-medium text-ink' : 'text-muted',
                        )}
                      >
                        <FileStack className="h-3.5 w-3.5" />
                        {c.folhasNoCelular ? plural(c.folhasNoCelular, 'folha no celular', 'folhas no celular') : 'Nenhuma folha'}
                      </span>
                    </Td>
                    <Td className="max-sm:hidden">
                      {c.revogado ? (
                        <span
                          title={[c.revogadoTexto, c.revogadoEm && `Em ${dataHora(c.revogadoEm)} por ${c.revogadoPor}`]
                            .filter(Boolean)
                            .join(' · ')}
                        >
                          <Badge tom="danger">
                            Revogado{c.revogadoMotivo ? ` · ${ROTULO_MOTIVO_REVOGACAO[c.revogadoMotivo].toLowerCase()}` : ''}
                          </Badge>
                        </span>
                      ) : !c.tecnicoAtivo ? (
                        <Badge tom="neutral">Técnico desativado</Badge>
                      ) : (
                        <Badge tom="success">Ativo</Badge>
                      )}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <MenuAcoes rotulo={`Ações do ${c.nome}`} itens={acoes(c)} />
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )
        )}
        <p className="border-t border-line bg-surface-2/50 px-5 py-3 text-xs text-muted">
          O celular grava o endereço do servidor que vem no QR. Reserve o IP do servidor no roteador para não mudar. O app
          registra os horários das leituras e os contatos com o servidor só para a integridade da folha de campo, nunca para
          controle de ponto.
        </p>
      </Card>

      <ConfiguracaoCampoCard />

      <CadastrarCelularModal
        aberto={cadastrando || !!pareandoDeNovo}
        tecnicos={tecnicos}
        pareandoDeNovo={pareandoDeNovo}
        aoFechar={() => {
          setCadastrando(false)
          setPareandoDeNovo(null)
          fechouAlgo()
        }}
        aoPareado={(c) => {
          toast.sucesso(
            'Celular pareado',
            c ? `${c.modelo || c.nome} · ${c.tecnicoNome}. Já pode receber folhas.` : 'Já pode receber folhas.',
          )
          useTempoReal.getState().mudou('config')
          fechouAlgo()
        }}
      />
      <RenomearModal
        celular={renomeando}
        aoFechar={() => setRenomeando(null)}
        aoSalvar={() => {
          setRenomeando(null)
          fechouAlgo()
        }}
      />
      <RevogarModal
        celular={revogando}
        aoFechar={() => setRevogando(null)}
        aoRevogar={() => {
          setRevogando(null)
          fechouAlgo()
        }}
      />
    </>
  )
}

function RenomearModal({
  celular,
  aoFechar,
  aoSalvar,
}: {
  celular: CelularListado | null
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [ultimo, setUltimo] = useState(celular)
  if (celular && celular !== ultimo) {
    setUltimo(celular)
    setNome(celular.nome)
  }
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!celular || !nome.trim()) return
    setSalvando(true)
    try {
      await api.renomearCelular(celular.id, nome.trim())
      toast.sucesso('Celular renomeado')
      aoSalvar()
    } catch (erro) {
      avisarErro('Não foi possível renomear', erro)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Modal
      aberto={!!celular}
      aoFechar={aoFechar}
      largura="max-w-md"
      icone={<Pencil className="h-5 w-5" />}
      titulo="Renomear celular"
      descricao="O nome aparece no registro de atividades e nos registros de campo."
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variante="primary" type="submit" form="form-renomear-celular" disabled={salvando || !nome.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="form-renomear-celular" onSubmit={(e) => void enviar(e)}>
        <Field label="Nome do celular" htmlFor="celular-nome">
          <Input id="celular-nome" autoFocus value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

function RevogarModal({
  celular,
  aoFechar,
  aoRevogar,
}: {
  celular: CelularListado | null
  aoFechar: () => void
  aoRevogar: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoRevogacao | ''>('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [ultimo, setUltimo] = useState(celular)
  if (celular && celular !== ultimo) {
    setUltimo(celular)
    setMotivo('')
    setTexto('')
  }
  const c = celular ?? ultimo
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!celular || !motivo) return
    setSalvando(true)
    try {
      await api.revogarCelular(celular.id, motivo, texto.trim())
      toast.sucesso('Celular revogado', 'Ele não recebe mais folhas. Na próxima conexão, o app avisa que foi descadastrado.')
      aoRevogar()
    } catch (erro) {
      avisarErro('Não foi possível revogar', erro)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Modal
      aberto={!!celular}
      aoFechar={aoFechar}
      largura="max-w-md"
      icone={<ShieldOff className="h-5 w-5 text-danger" />}
      titulo={c ? `Revogar ${c.nome}?` : 'Revogar celular'}
      descricao="O celular deixa de receber folhas e o app avisa que foi descadastrado. A linha fica na lista, como histórico."
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variante="danger" type="submit" form="form-revogar-celular" disabled={salvando || !motivo}>
            {salvando ? 'Revogando…' : 'Revogar'}
          </Button>
        </>
      }
    >
      <form id="form-revogar-celular" className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)}>
        <Field label="Motivo" htmlFor="revogar-motivo" obrigatorio>
          <Select id="revogar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRevogacao)}>
            <option value="">Escolha o motivo…</option>
            {MOTIVOS_REVOGACAO.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MOTIVO_REVOGACAO[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Detalhe" htmlFor="revogar-texto" opcional>
          <Textarea
            id="revogar-texto"
            value={texto}
            maxLength={300}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: perdido na visita à Usina Exemplo"
          />
        </Field>
        {motivo && (
          <p
            className={cn(
              'flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]',
              motivo === 'ROUBADO' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info',
            )}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {motivo === 'ROUBADO'
              ? 'Roubado: o celular não entrega mais nada, nem as folhas já preenchidas. Se ele aparecer de novo, cadastre outra vez.'
              : 'As folhas que já estão preenchidas no celular ainda podem ser entregues, marcadas como “aparelho revogado”.'}
          </p>
        )}
      </form>
    </Modal>
  )
}

/** Configuração do app do celular (só o administrador muda): o registro original da calibração. */
function ConfiguracaoCampoCard() {
  const [config, setConfig] = useState<ConfiguracaoCampo | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    let valendo = true
    api.configuracaoCampo().then(
      (r) => valendo && setConfig(r.config),
      () => {},
    )
    return () => {
      valendo = false
    }
  }, [])
  const escolher = async (registroOriginal: RegistroOriginal) => {
    if (!config || config.registroOriginal === registroOriginal || salvando) return
    if (registroOriginal === 'CELULAR') {
      const ok = await confirmar({
        titulo: 'O celular passa a ser o registro original?',
        descricao:
          'Faça isso só depois do piloto validado (o protocolo assinado e a revisão do formulário e do POP em vigor). A partir daí, enquanto a folha estiver no celular, as leituras ficam só para leitura no computador, e “Puxar dados do campo” preenche o rascunho.',
        confirmar: 'Passar para o celular',
      })
      if (!ok) return
    }
    setSalvando(true)
    try {
      const r = await api.salvarConfiguracaoCampo({ ...config, registroOriginal })
      setConfig(r.config)
      useTempoReal.getState().mudou('config')
      toast.sucesso(
        'Configuração salva',
        registroOriginal === 'PAPEL' ? 'A folha de papel é o registro original (piloto).' : 'O celular é o registro original.',
      )
    } catch (e) {
      avisarErro('Não foi possível salvar a configuração', e)
      if (e instanceof ErroApi && e.status === 409)
        api.configuracaoCampo().then(
          (r) => setConfig(r.config),
          () => {},
        )
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Card>
      <CardHeader
        icone={<FileStack className="h-4 w-4" />}
        titulo="Registro original da calibração"
        descricao="Qual folha vale como registro da visita: a de papel (piloto) ou a do celular"
      />
      <div className="px-5 pb-5">
        {config ? (
          <GrupoEscolha rotulo="Registro original">
            <OpcaoEscolha
              marcada={config.registroOriginal === 'PAPEL'}
              aoEscolher={() => void escolher('PAPEL')}
              desabilitada={salvando}
              titulo="A folha de papel (piloto)"
              texto="O técnico leva o papel e o celular. Nada trava no computador: quem digita a calibração digita do papel e usa “Comparar com o campo” para conferir. Nada do celular vai para o rascunho."
            />
            <OpcaoEscolha
              marcada={config.registroOriginal === 'CELULAR'}
              aoEscolher={() => void escolher('CELULAR')}
              desabilitada={salvando}
              titulo="A folha do celular"
              texto="Enquanto a folha está no celular, as leituras ficam só para leitura aqui. Quando ela volta, “Puxar dados do campo” preenche o rascunho, e o que mudar depois pede uma justificativa na emissão."
            />
          </GrupoEscolha>
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        )}
      </div>
    </Card>
  )
}
