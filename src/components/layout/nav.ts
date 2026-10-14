import { BellRing, Building2, FileBadge2, LayoutDashboard, Scale, Settings, UserCog, Weight, type LucideIcon } from 'lucide-react'
import { pode, type Permissao } from '#shared/permissoes.ts'
import type { NivelUsuario } from '#shared/tipos.ts'

export interface ItemNav {
  to: string
  label: string
  icone: LucideIcon
  descricao: string
  /** Só aparece para quem tem a permissão (o servidor também recusa as rotas da página). */
  permissao?: Permissao
}

export interface GrupoNav {
  grupo: string
  itens: ItemNav[]
}

const NAV: GrupoNav[] = [
  {
    grupo: 'Visão geral',
    itens: [
      { to: '/', label: 'Painel', icone: LayoutDashboard, descricao: 'Resumo do mês, rascunhos e vencimentos' },
      {
        to: '/certificados',
        label: 'Certificados',
        icone: FileBadge2,
        descricao: 'Calibrações em andamento e certificados emitidos',
      },
      {
        to: '/vencimentos',
        label: 'Vencimentos',
        icone: BellRing,
        descricao: 'Balanças dos clientes com a próxima calibração chegando',
      },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { to: '/clientes', label: 'Clientes', icone: Building2, descricao: 'Empresas e pessoas, com balanças e certificados' },
      { to: '/balancas', label: 'Balanças', icone: Scale, descricao: 'Instrumentos dos clientes e histórico de calibração' },
      { to: '/padroes', label: 'Padrões', icone: Weight, descricao: 'Pesos padrão e instrumentos de medição da empresa' },
    ],
  },
  {
    grupo: 'Administração',
    itens: [
      {
        to: '/usuarios',
        label: 'Usuários',
        icone: UserCog,
        descricao: 'Quem acessa o sistema, assinaturas e níveis',
        permissao: 'usuarios',
      },
      {
        to: '/configuracoes',
        label: 'Configurações',
        icone: Settings,
        descricao: 'Empresa, certificado, e-mail, aparência e backup',
        permissao: 'configuracoes',
      },
    ],
  },
]

/** Menu de quem entrou: só as páginas que o nível pode abrir, sem grupo vazio. */
export function navDoNivel(nivel: NivelUsuario | null | undefined): GrupoNav[] {
  return NAV.map((g) => ({
    grupo: g.grupo,
    itens: g.itens.filter((it) => !it.permissao || pode(nivel, it.permissao)),
  })).filter((g) => g.itens.length > 0)
}

/** Todas as páginas que o nível pode abrir (título do cabeçalho e busca global). */
export function paginasDoNivel(nivel: NivelUsuario | null | undefined): ItemNav[] {
  return navDoNivel(nivel).flatMap((g) => g.itens)
}
