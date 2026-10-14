# 05 · Identidade visual e arquitetura dos sistemas existentes da Balanças.com

> Pesquisa feita em 14/10/2026 sobre os repositórios clonados localmente, **somente leitura**:
>
> | Repositório | Caminho | Último commit analisado |
> |---|---|---|
> | BC Fichas Control (modelo principal) | `/home/user/rafaeltessaro/bc-fichas-control` | `72ccb0b` (versão 2.6.0) |
> | Checklist, OS e orçamentos | `/home/user/rafaeltessaro/balan-as.com---or-amentos` | `c7a9240` (versão 1.0.0) |
> | Site da empresa | `/home/user/rafaeltessaro/site-balancass` | `1e19e36` |
> | BC Fichas (caixa .NET/Avalonia) | `/home/user/rafaeltessaro/bc-fichas-pagamentos` | `acaf98f` |
> | BC Backup (Electron) | `/home/user/bc-backup` | `2692f96` |
>
> Todos os caminhos abaixo são relativos à raiz do repositório citado, salvo quando indicado.

---

## Resumo executivo

- **Marca:** monograma "bq" (um "b" e um "q" entrelaçados, simetria de 180°) dentro de um anel, **verde + cinza-grafite + branco**. O vetor oficial está no site em `compartilhado/img/logo/*.svg` (4 variantes). Os PNG dos sistemas e o papel timbrado são rasterizações do mesmo desenho.
- **Verde da marca:** o vetor usa `#019F42`; o timbrado e os PNG usam `#07AA51`; o BC Fichas Control usa `#0B9E4F` como token `--brand`; o Orçamentos usa `#08A951`. Todos ficam no mesmo matiz (OKLCH ≈ 149–151°). O **cinza** é `#58585A` (SVG) / `#5A5B5D` (timbrado, PNG e Orçamentos).
- **Fonte dos sistemas internos:** **Inter Variable**, servida **localmente** (woff2 latin + latin-ext), sem Google Fonts. O site usa Big Shoulders + Archivo + Martian Mono (Google Fonts). O timbrado usa Poppins.
- **Identidade "oficial":**
  - para a **marca e os documentos**: o site (`compartilhado/`) e o papel timbrado (`src/assets/timbrado.jpg` do BC Fichas Control);
  - para a **interface de sistema**: o **BC Fichas Control** (tokens em `src/index.css`, componentes em `src/components/ui`).
  
  O Orçamentos é da mesma família (verde + neutros, Inter, tema claro/escuro/sistema), mas tem outro design system ("Bancada", CSS puro). A consistência é boa na essência e fraca nos detalhes (hex, raios, nomes de token).
- **Arquitetura modelo (BC Fichas Control):**
  - servidor Node ≥ 22.18 rodando **TypeScript direto** (sem build do servidor), com **Fastify 5** e o **SQLite embutido do Node (`node:sqlite`)**;
  - interface **React 19 + Vite 8 + Tailwind 4**, compilada em `dist/` e servida pelo próprio Fastify;
  - **SSE** para o tempo real e usuários com **scrypt + cookie de sessão**;
  - backups `VACUUM INTO`, consultas de CNPJ/CEP com fallback e e-mail com nodemailer;
  - **pacote Windows com Node portátil**, instalado como **tarefa agendada do Windows** (não usa WinSW, NSSM nem sc.exe).
- **Portas em uso:**

  | Porta | Uso |
  |---|---|
  | 3000 | BC Fichas Control |
  | 5173 | Vite em desenvolvimento |
  | 4980–5009 | Orçamentos (4980 padrão, com fallback automático) |
  | 8765 | Painel no celular do BC Fichas .NET |
  | 5199 | Dev do BC Backup |
  | 9123 | Só exemplo de teste da ponte de cartão |

  **Sugestão para o novo sistema: 4850** (ver §4.4).
- **Inscrição estadual:** **não aparece em nenhum repositório**. É preciso pedir ao dono.

---

## 1. Identidade visual

### 1.1 Logos

#### Arquivos

| Arquivo | Formato e tamanho | Cores | Uso |
|---|---|---|---|
| `site-balancass/compartilhado/img/logo/balancas-icone.svg` | SVG, `viewBox="-100 -100 200 200"` | anel `#58585A`, "bq" `#019F42` | **Principal, fundo claro.** Favicon do site |
| `site-balancass/compartilhado/img/logo/balancas-icone-claro.svg` | SVG | anel `#FFFFFF`, "bq" `#019F42` | **Fundo escuro** (versão "clara") |
| `site-balancass/compartilhado/img/logo/balancas-icone-branco.svg` | SVG | tudo `#FFFFFF` | Monocromático sobre verde ou foto |
| `site-balancass/compartilhado/img/logo/balancas-icone-preto.svg` | SVG | tudo `#0A0A0A` | Monocromático, impressão P&B |
| `site-balancass/compartilhado/img/logo/logo-antigo.png` | PNG 193×35 | — | Logotipo horizontal antigo "BALANÇAS.COM / AUTOMAÇÃO COMERCIAL" (não usar) |
| `site-balancass/site/img/logo-512.png` (= `linha-verde/img/logo-512.png`) | PNG 512×512 RGB, fundo branco | anel `#494949`, "bq" `#019F42` | apple-touch-icon e `logo` do JSON-LD |
| `site-balancass/hospedagem/favicon.ico` | ICO 16 e 32 | — | Favicon do site publicado |
| `bc-fichas-control/src/assets/logo-mark.png` | PNG 128×128 RGBA | anel `#5A5B5D`, "bq" `#07AA51`, contornos brancos | Logo do menu lateral e da tela de entrada |
| `bc-fichas-control/public/favicon.png` | PNG 64×64 RGBA | idem | Favicon |
| `balan-as.com---or-amentos/public/img/logo-simbolo.png` | PNG 112×112 RGBA | anel `#5A5B5D`, "bq" `#07AA51` | Menu, favicon, checklist impresso |
| `balan-as.com---or-amentos/public/img/logo-completo.png` | PNG 320×112 RGBA | grafite `#5A5B5D` + verde `#07AA51` | Símbolo + "BALANÇAS.COM / Equipamentos e Sistemas / (19) 3023-9050" (recorte do timbrado) |
| `balan-as.com---or-amentos/public/img/app-192*.png`, `app-512*.png` (com e sem *maskable*), `apple-touch-icon.png` (180), `icone.ico` (7 tamanhos) | PNG e ICO | `#58595B` + `#00A850` | Ícones de PWA e de atalho do Windows |

Outras marcas de produto, que **não** são a marca Balanças.com:

- **BC Fichas:** `bc-fichas-pagamentos/cartao/src/BCFichas.App/Assets/icone.png` e `icone.ico`;
- **BC Backup:** `bc-backup/build/brand/icone-original.png` e `resources/logo.svg`, `wordmark.svg`. É um squircle preto com nuvem menta.

#### Como o símbolo é desenhado

O SVG do site é desenhado assim:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" role="img" aria-label="Balanças.com">
  <defs>
    <path id="b" d="M -30 -91.2 L -30 0 A 30 30 0 0 0 26 15 L 26 56.3 A 62 62 0 0 1 -62 0 L -62 -73.3 A 96 96 0 0 1 -30 -91.2 Z"/>
    <path id="q" d="M 30 91.2 L 30 0 A 30 30 0 0 0 -26 -15 L -26 -56.3 A 62 62 0 0 1 62 0 L 62 73.3 A 96 96 0 0 1 30 91.2 Z"/>
    <mask id="m"><rect x="-100" y="-100" width="200" height="200" fill="#fff"/><circle r="34" fill="#000"/>
      <use href="#b" fill="#000" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
      <use href="#q" fill="#000" stroke="#000" stroke-width="8" stroke-linejoin="round"/></mask>
  </defs>
  <circle r="100" fill="#58585A" mask="url(#m)"/>   <!-- anel/disco cinza com o miolo e os vãos recortados -->
  <use href="#b" fill="#019F42"/>                    <!-- "b" verde -->
  <use href="#q" fill="#019F42"/>                    <!-- "q" verde (o "b" girado 180°) -->
</svg>
```

- **Disco:** um disco de raio 100 tem um **furo central de raio 34**. A máscara também recorta o "b" e o "q" com um **contorno de 8 unidades**, que vira o "fio branco" entre as letras e o anel.
- **"b":** haste vertical à esquerda e barriga em arco (raios 30 e 62). O topo é cortado pela curva de raio 96.
- **"q":** o mesmo desenho girado 180°. As duas letras se encaixam em volta do furo.
- **No site:** o mesmo desenho existe como `<symbol id="lv-logo">` inline em `site/index.html`. Lá o disco usa `currentColor`, para ficar claro sobre o preto.
- **Wordmark no site:** "Balanças.com" em Big Shoulders 900, maiúsculas, com o ponto em verde (`.logo__dot`). Abaixo vem "Automação comercial" em Martian Mono 8,5 px. Veja `site/css/base.css`, linhas 298–304.
- **Wordmark no timbrado e no `logo-completo.png`:** "BALANÇAS.COM" em **Poppins** negrito, cinza `#5A5B5D`, com o subtítulo "Equipamentos e Sistemas".

#### Variantes claro e escuro na prática

| Situação | Como fazem hoje | Recomendação para o novo sistema |
|---|---|---|
| Tema claro | BC Fichas Control: `logo-mark.png` com `rounded-full shadow-xs ring-1 ring-line` (menu e entrada) | `balancas-icone.svg` |
| Tema escuro | BC Fichas Control usa **o mesmo PNG** (o anel cinza some no fundo `#0E1012`). O Orçamentos troca a cor do texto "BALANÇAS" (`--cinza-marca: #a9b0ac`), mas mantém o PNG | `balancas-icone-claro.svg` (anel branco) |
| PDF | Imagem do timbrado inteira | Igual (§2) |

### 1.2 Cores

#### 1.2.1 BC Fichas Control: `src/index.css` (Tailwind v4)

Os tokens são variáveis CSS em `:root` (claro) e `[data-theme='dark']` (escuro). Um bloco `@theme inline` os expõe como utilitários do Tailwind (`bg-surface`, `text-ink`, `border-line`, `bg-brand-soft` etc.).

O modo escuro é ligado assim:

```css
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```

| Papel (token CSS → classe Tailwind) | Claro | Escuro |
|---|---|---|
| `--bg` → `bg-bg` (página, menu lateral) | `#f5f6f7` | `#0e1012` |
| `--surface` → `bg-surface` (cartões, campos, modais) | `#ffffff` | `#16181b` |
| `--surface-2` → `bg-surface-2` (hover, cabeçalho de tabela, rodapé de modal) | `#f4f5f7` | `#1c1f23` |
| `--surface-3` → `bg-surface-3` (trilho de segmentado) | `#eceef1` | `#24282d` |
| `--border` → `border-line` | `#e7e9ec` | `#262a2f` |
| `--border-strong` → `border-line-strong` (campos, botão secundário) | `#d5d9de` | `#343940` |
| `--ink` → `text-ink` (títulos) | `#16181b` | `#f1f3f5` |
| `--ink-2` → `text-ink-2` (corpo) | `#4b5059` | `#b3b9c2` |
| `--muted` → `text-muted` (metadados) | `#858b94` | `#7c838d` |
| **`--brand`** → `bg-brand` (primária) | **`#0b9e4f`** | **`#14b05c`** |
| `--brand-hover` | `#098a45` | `#1cc068` |
| `--brand-ink` (texto verde) | `#077a3c` | `#4fd18a` |
| `--brand-soft` (fundo verde suave) | `#e7f6ee` | `rgb(20 176 92 / 0.14)` |
| `--ring` (anel de foco dos campos) | `rgb(11 158 79 / 0.32)` | `rgb(20 176 92 / 0.4)` |
| `--success` / `--success-soft` | `#0f8a47` / `#e6f5ec` | `#3ccf7f` / `rgb(60 207 127 / .13)` |
| `--warning` / `--warning-dot` / `--warning-soft` | `#a86200` / `#f0a020` / `#fdf3e0` | `#f2b64a` / `#f0a020` / `rgb(242 182 74 / .13)` |
| `--danger` / `--danger-soft` | `#c93636` / `#fcecec` | `#f07474` / `rgb(240 116 116 / .13)` |
| `--info` / `--info-soft` | `#2468c8` / `#e9f1fc` | `#6aa5f0` / `rgb(106 165 240 / .13)` |
| `--neutral` / `--neutral-soft` | `#5d636c` / `#eff1f3` | `#a2a8b1` / `rgb(162 168 177 / .12)` |
| `--series-1` / `--series-2` (gráficos) | `#0b9e4f` / `#2a78d6` | `#14b05c` / `#3987e5` |
| `--grid` / `--axis` (gráficos) | `#eceef1` / `#c9cdd3` | `#24282d` / `#3a3f46` |

Outras cores fixas:

- **Avatares** (`src/components/ui/Misc.tsx`): verde `#e7f6ee`/`#077a3c`, azul `#e9f1fc`/`#2468c8`, laranja `#fdf0e7`/`#b5521c`, roxo `#f3eefc`/`#5b45b5`, rosa `#fcecf2`/`#b8336a`, com as variantes escuras ao lado.
- **Overlay dos modais:** `rgb(10 12 14 / 0.42)`.
- **`<meta name="theme-color">`:** `#0b9e4f`.

> **Atenção (acessibilidade):** o botão primário põe **texto branco sobre `#0b9e4f`**. O contraste é **3,49:1** e reprova o AA para texto normal (o mínimo é 4,5). No escuro, branco sobre `#14b05c` dá 2,84:1. O Orçamentos resolveu isso com um verde de ação mais escuro (abaixo). Para o novo sistema, recomendo um token `--brand-action` (ver §1.3).

#### 1.2.2 Orçamentos: `public/css/app.css` (design system "Bancada", CSS puro)

| Token | Claro | Escuro | Observação do próprio arquivo |
|---|---|---|---|
| `--verde` | `#08a951` | `#34c77b` | identidade: ícones, barra do item ativo, progresso. "NÃO usar com texto branco" |
| `--verde-escuro` | `#067a3b` | `#5bd896` | texto e links verdes (5,45:1) |
| `--verde-hover` | `#066f37` | `#22bd69` | hover do primário |
| `--verde-claro` / `--verde-suave` | `#eaf6ef` / `#ddf2e5` | `#16291f` / `#1a3526` | item ativo, seleção |
| **`--verde-acao`** | **`#078541`** (4,73:1 com branco) | **`#08a951`** com texto `#04140b` | fundo do botão primário |
| `--cinza-marca` | `#5a5b5d` | `#a9b0ac` | cor do logotipo |
| `--texto` / `--texto-2` / `--texto-suave` / `--texto-fraco` | `#1f2422` / `#454648` / `#5d6461` / `#687069` | `#e8ecea` / `#c9cfcc` / `#a0a8a4` / `#878f8b` | neutros com leve toque verde |
| `--borda` / `--borda-forte` | `#e1e5e3` / `#8e9692` | `#303633` / `#6e7773` | |
| `--fundo` / `--superficie` / `--superficie-2` / `--cinza-claro` | `#f3f5f4` / `#ffffff` / `#f8faf9` / `#edf0ee` | `#131615` / `#1b1f1d` / `#222725` / `#2a302d` | |
| `--perigo` / `--alerta` / `--info` / `--roxo` | `#b42318` / `#8a5300` / `#1d5fbf` / `#5b3fa0` | `#f2766e` / `#f2c25b` / `#86b4f5` / `#bfa9f5` | cada um tem o seu `*-fundo` |
| `--cor-foco` | `#08a951` | `#4cd68e` | anel `0 0 0 2px superficie, 0 0 0 4px foco` |

As cores dos status da OS (texto / fundo) são:

| Status | Claro | Escuro |
|---|---|---|
| Em análise | `#1d5fbf` / `#eaf2fd` | `#86b4f5` / `#16253a` |
| Aguardando aprovação | `#8a5300` / `#fff3d6` | `#f2c25b` / `#33280f` |
| Aprovada | `#067a3b` / `#e4f5eb` | `#5bd896` / `#16291f` |
| Aguardando peça | `#5b3fa0` / `#f1ecfb` | `#bfa9f5` / `#271f3d` |
| Liberada | `#0b6e80` / `#e1f4f7` | `#6bd0e3` / `#10292f` |
| Entregue | `#4c5250` / `#eef0ef` | `#b4bbb7` / `#272c2a` |
| Recusada | `#b42318` / `#fdecec` | `#f59a94` / `#3a1a18` |

O tema fica no atributo `data-tema="claro|escuro"` do `<html>`.

#### 1.2.3 Site: `site-balancass/site/css/base.css` (design "Linha Verde") e painel PHP

- **`site/css/base.css`:**
  - `--ink #0A0A0A`, `--ink-2 #131313`, `--ink-3 #1B1B1A` (fundos pretos);
  - `--paper #F4F4F0`, `--paper-2 #EAEAE4`, `--paper-3 #DCDCD5` (off-white);
  - `--white #FFFFFF`;
  - **`--green #019F42`** e `--green-deep #007A35` (texto verde sobre claro, 5,4:1);
  - `--volt #C6FF3D` (só em etiquetas pequenas);
  - `--line #494949`, `--grey #8A8A85`, `--muted #55554F`, `--body-dark #CFCFC9`, `--body-paper #2A2A28`;
  - ângulo único **−12°** (`--slash`, `--tan 0.2126`): botões e faixas com pontas cortadas.
- **Painel PHP** (`site/painel/assets/painel.css`): mesma base, mais `--green-soft #E2F2E7`, `--red #B3261E`, `--amber #7A5200`.
- O site é **escuro por padrão** (`body` em `--ink`), com seções `.on-paper` e `.on-green`. Não tem alternância de tema.

#### 1.2.4 PDFs (constantes fixas)

| Origem | Verde | Texto | Secundário | Linha | Outros |
|---|---|---|---|---|---|
| `bc-fichas-control/src/lib/pdf.ts` (jsPDF, em RGB) | `[11,158,79]` = `#0B9E4F` | `TINTA [50,52,56]` = `#323438` | `[110,112,118]` = `#6E7076` | `[226,228,232]` = `#E2E4E8` | fundo dos blocos `(244,246,245)` = `#F4F6F5`; aviso de cancelado `[190,40,40]` = `#BE2828` |
| `balan-as.com---or-amentos/src/pdf/orcamento.js` (pdfmake) | `#08A951`, verde-escuro `#067A3B` | `#454648` | rótulo `#7B7D80`, suave `#9A9C9F` | `#E7E9E8`, borda `#D9DDDA` | grafite `#5A5B5D`, `#EFF1F0`, `#F2F8F4` |
| Timbrado (`timbrado-original.png`, cores medidas) | `#07AA51` | — | faixa do rodapé `#5A5B5D` (90,91,93) | marca-d'água `#F5F5F5` | texto do rodapé `#F7F7F7` (247,247,247) |

#### 1.2.5 Produtos com marca própria (não são a identidade Balanças.com)

- **BC Fichas .NET** (`bc-fichas-pagamentos/cartao/src/BCFichas.App/Estilos/Cores.axaml`): paleta Tailwind clássica.
  - Verdes: `CorPrimaria #16A34A`, `#15803D`, `#DCFCE7`, `CorMarca #22C55E`.
  - Preto esverdeado: `#07110B`, `#0B1510`.
  - Neutros slate: `#F1F5F9`, `#E2E8F0`, `#0F172A`, `#64748B`.
  - Pix: `#32BCAD`.
- **BC Backup** (`bc-backup/docs/research/06-identidade-preto-verde.md`): **menta** `#00C795` (claro) / `#00D9A0` (escuro) com texto preto `#00140F` e fonte Geist. O documento proíbe azul como marca.

#### 1.2.6 Equivalentes em OKLCH e contraste

Calculados a partir do hex. Nenhum projeto usa oklch no código.

| Cor | OKLCH | Contraste do branco sobre ela | Contraste de `#16181b` sobre ela |
|---|---|---|---|
| `#019F42` (SVG oficial) | `oklch(61.3% 0.174 148.6)` | 3,48 | 5,12 |
| `#07AA51` (timbrado e PNG) | `oklch(64.6% 0.174 150.5)` | 3,05 | 5,83 |
| `#08A951` (Orçamentos `--verde`) | `oklch(64.3% 0.173 150.6)` | 3,09 | 5,76 |
| `#0B9E4F` (BC Fichas `--brand`) | `oklch(61.3% 0.161 151.4)` | 3,49 | 5,10 |
| `#098A45` (BC Fichas `--brand-hover`) | `oklch(55.6% 0.145 151.7)` | 4,44 | 4,01 |
| `#078541` (Orçamentos `--verde-acao`) | `oklch(54.1% 0.142 151.3)` | **4,73** | 3,76 |
| `#077A3C` (BC Fichas `--brand-ink`) | `oklch(50.8% 0.133 151.6)` | 5,44 | 3,27 |
| `#007A35` (site `--green-deep`) | `oklch(50.6% 0.140 149.7)` | 5,48 | 3,25 |
| `#14B05C` (BC Fichas `--brand`, escuro) | `oklch(66.5% 0.170 152.0)` | 2,84 | 6,26 |
| `#58585A` / `#5A5B5D` (cinza da marca) | `oklch(46.1% 0.003 286)` / `oklch(47.1% 0.003 264)` | 7,10 / 6,80 | — |
| `#16181B` (BC Fichas `--ink`) | `oklch(20.8% 0.007 258.4)` | 17,79 | — |

### 1.3 Qual identidade é a mais "oficial" e se é consistente

1. **Marca (logo, nome, dados):** o **site** é a fonte mais oficial.
   - Foi escolhido pelo dono: "Linha Verde · Variação 3 (Painel)".
   - Tem o **logo vetorizado** (`compartilhado/img/logo/*.svg`) e o arquivo de dados da empresa (`compartilhado/dados/empresa.js`), que o painel do site mantém atualizado.
   - O documento de marca existente é `docs/AVALIACAO-DOS-DESIGNS.md`, mais `linha-verde/COMPONENTES.md`. Eles registram a decisão e as recomendações dos jurados, por exemplo "menos tons de menta, puxando para o **preto/verde/branco** da marca", a faixa diagonal verde e os "números de prova em dígitos de visor de balança". **Não há um manual de marca formal**: não existe documento com regras de uso do logo, área de proteção ou cores Pantone/CMYK.
2. **Documentos impressos:** o **papel timbrado** (`bc-fichas-control/src/assets/timbrado.jpg`) é o original da empresa, extraído da planilha antiga e com o endereço atualizado pelo script. É a peça "oficial" dos PDFs. Ele usa **verde `#07AA51`, grafite `#5A5B5D` e Poppins**.
3. **Interface de sistema:** o **BC Fichas Control** é o mais maduro. Tem tokens completos de claro e escuro, componentes React reutilizáveis, animação, acessibilidade e 601 testes. É a referência a seguir.

**Consistência entre os projetos:**

| Aspecto | BC Fichas Control | Orçamentos | Site | BC Fichas .NET / BC Backup |
|---|---|---|---|---|
| Verde | `#0B9E4F` | `#08A951` (+ `#078541` para ação) | `#019F42` | `#16A34A` / menta `#00D9A0` |
| Cinza da marca | não usa (neutros frios) | `#5A5B5D` | `#494949` e `#58585A` | — |
| Neutros | cinza frio levemente azulado | cinza com toque verde | preto e off-white quente | slate / preto esverdeado |
| Fonte | Inter (local) | Inter (local) | Big Shoulders, Archivo, Martian Mono (Google) | Inter (TTF) / Geist |
| Raios | 8–24 px (bem arredondado) | 6–12 px | 0 (cortes a −12°) | — |
| Tema claro/escuro/sistema | sim (`data-theme`) | sim (`data-tema`) | só escuro | BC Backup sim |
| PDF | jsPDF + `timbrado.jpg` | pdfmake + cabeçalho e rodapé PNG | — | — |

**Conclusão:**

- A essência é **consistente**: verde no mesmo matiz (148–152° em OKLCH), cinza-grafite, monograma "bq", Inter nos sistemas, tema claro/escuro/sistema, PT-BR e timbrado nos PDFs.
- Os **valores exatos não são**: há 4 hex de verde, escalas de raio diferentes e nomes de token diferentes.
- BC Fichas (.NET) e BC Backup são **marcas de produto** à parte.

**Recomendação para o novo sistema:**

- Copiar **o `src/index.css` do BC Fichas Control** (mesmos papéis e nomes de token, para os sistemas parecerem irmãos). Assim, quem usa os dois sistemas reconhece as mesmas telas.
- Acrescentar `--brand-action: #078541` (claro) para botões preenchidos com texto branco. No escuro, `#08A951` com texto `#04140b`, como no Orçamentos. Assim o AA passa.
- Usar os **SVG do site** como logo da interface: `balancas-icone.svg` no claro e `balancas-icone-claro.svg` no escuro.

### 1.4 Fontes

| Onde | Fonte | Como é carregada |
|---|---|---|
| BC Fichas Control | **Inter Variable** (pesos 100–900), `font-feature-settings: 'cv11', 'ss01'` | **Local**: `src/assets/fonts/inter-latin-wght-normal.woff2` e `inter-latin-ext-wght-normal.woff2` (nomes do @fontsource, copiados para o repositório) + `LICENSE-Inter.txt` (OFL). Dois `@font-face` com `unicode-range` em `src/index.css`. `--font-sans: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif` |
| Orçamentos | **Inter** (100–900) | **Local**: `public/fonts/inter-*-wght-normal.woff2` + `Inter-LICENSE.txt`. Pilha `--fonte: 'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, …`. Escala: 12/13/14/16/20/24/28 px; peso de título 600 (560 no escuro) |
| Site | **Big Shoulders** (títulos, 700–900, maiúsculas), **Archivo** (texto, largura 62–125, 400–800), **Martian Mono** (rótulos técnicos, 400–500) | **Google Fonts** (`fonts.googleapis.com/css2?family=Big+Shoulders…&family=Archivo…&family=Martian+Mono…&display=swap`). A proposta 1 usa **DSEG7 Classic Bold** local (dígitos de visor LCD) |
| Papel timbrado | **Poppins** (rodapé em Poppins Light 300; o wordmark parece Poppins Bold) | `scripts/timbrado/fonte/Poppins-Light-latin.ttf` (OFL), convertida do `@fontsource/poppins` |
| PDF do BC Fichas Control | **Helvetica** (fonte padrão do PDF, WinAnsi) | Embutida no jsPDF. `src/lib/pdfTexto.ts#txt()` troca ou remove caracteres fora do Windows-1252 |
| PDF do Orçamentos | **Roboto** | `pdfmake/fonts/Roboto`, que vem com o pdfmake |
| BC Fichas .NET | Inter (Regular, Medium, SemiBold, Bold) | TTF em `cartao/src/BCFichas.App/Assets/Fontes/` |
| BC Backup | Geist / Geist Mono | `@fontsource-variable/geist` (npm) |

### 1.5 Raio, sombras e espaçamento

**BC Fichas Control** (Tailwind v4: `lg` = 8 px, `xl` = 12 px, `2xl` = 16 px, `3xl` = 24 px):

- **Raios:**
  - botão `sm`: 8 px (`rounded-lg`);
  - botão `md`, campos, itens do menu e segmentado: **12 px** (`rounded-xl`);
  - cartões, toasts, paleta Ctrl+K e StatCard: **16 px** (`rounded-2xl`);
  - modais e cartão da tela de entrada: **24 px** (`rounded-3xl`; no celular só em cima, como bottom sheet);
  - badges e avatar do logo: `rounded-full`.
- **Sombras** (tokens; utilitários `shadow-xs`, `shadow-card`, `shadow-float`):
  ```css
  --shadow-sm: 0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.04);       /* shadow-xs  */
  --shadow-md: 0 4px 12px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.04); /* shadow-card */
  --shadow-lg: 0 24px 48px -12px rgb(16 24 40 / 0.18), 0 8px 16px -8px rgb(16 24 40 / 0.08); /* shadow-float */
  /* escuro: 0 1px 2px rgb(0 0 0/.3) · 0 6px 16px -4px rgb(0 0 0/.45) · 0 24px 48px -12px rgb(0 0 0/.6) */
  ```
- **Espaçamento:**
  - escala padrão do Tailwind (0,25 rem);
  - conteúdo `max-w-[1320px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8`;
  - cabeçalho `h-16` (64 px);
  - menu lateral 256 px (76 px recolhido, 272 px no celular);
  - campos e botões `h-10` (40 px);
  - `CardHeader px-5 pt-5 pb-3`, modal `px-6 pt-6`.
- **Tipografia:**
  - título da página `text-[26px] font-semibold tracking-[-0.025em]`;
  - título do cartão `text-[15px] font-semibold`;
  - rótulos `text-[13px] font-medium text-ink-2`;
  - cabeçalho de tabela `text-[12px] text-muted`;
  - números com `.tnum` (`font-variant-numeric: tabular-nums`).
- **Movimento:** biblioteca `motion`:
  - molas `stiffness 400–600, damping 30–40`;
  - transição de página de 0,22 s com curva `[0.22, 1, 0.36, 1]`;
  - `MotionConfig reducedMotion="user"` e `@media (prefers-reduced-motion)`.

**Orçamentos:**

- raios `--raio-p 6px` (botões, campos), `--raio 8px` (cartões, menus, toasts), `--raio-g 12px` (modais, indicadores);
- sombras `--sombra-1/2/3`;
- menu 248 px, topo 56 px, campo 40 px (44 px em tela de toque);
- modais 440/600/840 px;
- durações 120/200/240 ms.

**Site:** sem raio (paralelogramos a −12°); botões de 54 px, maiúsculos e com espaçamento entre letras.

### 1.6 Componentes de interface do BC Fichas Control

Todos ficam em `src/components/ui/` e usam `cn()` de `src/lib/cn.ts`, que só junta classes.

| Componente | Arquivo | Estilo |
|---|---|---|
| **Button** | `Button.tsx` | `motion.button` com `whileTap scale .97`. Variantes: `primary` (`bg-brand text-white shadow-xs hover:bg-brand-hover`), `secondary` (padrão: `bg-surface border border-line-strong/80`), `ghost`, `soft` (`bg-brand-soft text-brand-ink`), `danger` (`bg-danger text-white`, no escuro `text-bg`). Tamanhos: `sm h-8 px-3 text-[13px] rounded-lg`, `md h-10 px-4 text-sm rounded-xl`, `icon h-10 w-10`, `icon-sm h-8 w-8`. Prop `icone` |
| **Card, CardHeader** | `Card.tsx` | `rounded-2xl border border-line bg-surface shadow-xs`. O cabeçalho tem um ícone de 32 px em `bg-surface-2`, título de 15 px semibold, descrição de 13 px muted e ações à direita |
| **Badge** | `Badge.tsx` | `h-6 rounded-full px-2.5 text-xs font-medium` com um **ponto** de 6 px. Tons `neutral`, `info`, `success`, `warning`, `danger` e `brand` (fundo `*-soft` e texto na cor) |
| **Field, Input, Textarea, Select** | `Form.tsx` | Base: `rounded-xl border border-line-strong/80 bg-surface text-sm shadow-xs hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-[var(--ring)]`. Input com ícone à esquerda (`pl-9`). Select com chevron. `Field` tem rótulo, `hint` muted e `erro` em `text-danger` |
| **CurrencyInput** | `Form.tsx` | Valor em R$ como em maquininha (os dígitos entram pela direita), `tnum` alinhado à direita, colar "R$ 1.234,56" funciona |
| **NumberInput** | `Form.tsx` | − e + nas pontas, aceita vazio |
| **Modal, Drawer** | `Modal.tsx` | Em portal. Overlay `rgb(10 12 14/.42)` com `backdrop-blur-[3px]`. Painel `rounded-t-3xl sm:rounded-3xl border bg-surface shadow-float max-h-[92dvh]`. Cabeçalho com ícone em tile 40 px `bg-brand-soft`, título `text-lg font-semibold`, botão X. Rodapé `border-t bg-surface-2/60 px-6 py-4` com botões à direita. Pilha global: Esc fecha só o do topo. Trava a rolagem do `body`. Drawer lateral com mola |
| **Tabela, Th, Td, Linha** | `Table.tsx` | `border-separate border-spacing-0 text-sm`. Th `sticky top-0 bg-surface-2/70 px-4 py-2.5 text-[12px] font-medium text-muted`, primeira coluna `pl-5`. Td `border-b border-line px-4 py-3 text-ink-2`, números `tnum text-right`. `Linha` entra escalonada (atraso de 22 ms por linha) e tem hover `bg-surface-2/70` |
| **Toaster e `toast.*`** | `Feedback.tsx` + `store/ui.ts` | Canto inferior direito, 360 px, `rounded-2xl border bg-surface p-3.5 shadow-float`, ícones `CircleCheck`, `CircleAlert` e `Info` coloridos. Fecha sozinho (3,5 s; 6 s para erro), no máximo 4 na tela |
| **`confirmar()` e ConfirmHost** | `Feedback.tsx` | Confirmação por promessa, com `perigo` (ícone de triângulo e botão `danger`) e `digitar: 'APAGAR'` para ações irreversíveis |
| **PageHeader, EmptyState, Segmented, SearchInput, Avatar, AnimatedNumber, Menu (dropdown em portal), StatCard (KPI; `destaque` = cartão verde)** | `Misc.tsx` | O Segmented tem indicador animado (`layoutId`) e contagem em `bg-brand-soft` |
| **Combobox** | `Combobox.tsx` | Busca com teclado (↑ ↓ Home End Enter Esc), padrão ARIA combobox e ações no rodapé ("Cadastrar novo…") |
| **Sidebar** | `components/layout/Sidebar.tsx` | `bg-bg border-r`. Logo de 36 px redondo, nome de 15 px semibold e subtítulo xs. Grupos com rótulo `text-[11px] font-semibold uppercase tracking-[0.06em] text-muted`. Itens `h-10 rounded-xl text-[14px] font-medium`. O **ativo** é uma pílula animada `bg-surface shadow-xs ring-1 ring-line` com ícone `text-brand` (traço 2,2). Contadores em `bg-warning-soft text-warning`. Rodapé com menu do usuário, **seletor de tema** (Sol, Lua e Monitor, segmentado) e botão de recolher |
| **Layout (cabeçalho)** | `components/layout/Layout.tsx` | `sticky h-16 border-b bg-bg/80 backdrop-blur-xl`. Botão de busca (`w-72`, `kbd` com "Ctrl K"), ação primária ("Novo evento"), menu móvel em Drawer |
| **AvisoConexao, TelaConexao** | `components/layout/` | Faixa amarela quando o tempo real cai; tela de carregando ou erro |
| **Tela de entrada** | `src/pages/Entrar.tsx` | Fundo `bg-bg` com brilho `bg-brand-soft blur-3xl` atrás. Logo de 56 px, cartão `rounded-3xl p-6 sm:p-8 shadow-card`, checkbox "Manter conectado neste computador", aviso LGPD no rodapé |

No **Orçamentos** os componentes são classes CSS em `app.css`, `telas.css` e `cadastros.css`:

- **Botões:** `.btn` (40 px, raio 6 px, `border 1px --borda-forte`), `.btn-primario` (`--verde-acao`), `.btn-fantasma`, `.btn-perigo`, `.btn-p` e `.btn-g`.
- **Formulários e cartões:** `.campo` com `.entrada`, `.cartao` com `.cartao-topo` e `.cartao-corpo`.
- **Menu:** `.menu-item.ativo` tem uma **barra verde à esquerda** (`::before`) e fundo `--verde-claro`.
- **Outros:** `.segmentado` (C/NC/N/A), selos de status, toasts e modais.
- **Ícones:** Lucide, gerados em `public/js/icones.js` por `npm run icones`.

---

## 2. Papel timbrado e PDF

### 2.1 Como o timbrado é gerado (BC Fichas Control)

| Arquivo | O que é |
|---|---|
| `scripts/timbrado/timbrado-original.png` | Timbrado original da empresa (2481×3508, A4 a 300 dpi, com transparência), extraído da planilha original. Tem o **endereço antigo**: "Avenida 12, Número 1313, Entre as ruas 13 e 14, Bairro Santa Cruz, Rio Claro - SP" |
| `scripts/timbrado/gerar_timbrado.py` | Apaga o endereço antigo do rodapé e escreve o novo em Poppins Light, nas medidas originais. Gera o JPEG |
| `scripts/timbrado/fonte/Poppins-Light-latin.ttf` + `OFL.txt` | Fonte do rodapé |
| `scripts/timbrado/README.md` | Documentação (medidas, como regenerar, de onde vem a fonte) |
| **`src/assets/timbrado.jpg`** | **Saída usada pelo sistema**: 1654×2339 (A4 a 200 dpi), JPEG com qualidade 82, progressivo |

O script `gerar_timbrado.py` (Pillow + numpy + opencv) segue estes passos:

1. Abre o original e confere se tem 2481×3508.
2. Na região `REGIAO = (630, 3335, 1560, 3460)`, cria uma máscara do texto antigo (diferença maior que 4 em relação ao fundo `(90,91,93)`, dilatada com elipse 9×9). Reconstrói o fundo com **convolução normalizada** (média dos vizinhos válidos numa janela de 61×61).
3. Desenha `ENDERECO_NOVO = ('Rua 13, Número 650, Entre as Avenidas 9 e 11,', 'Bairro da Boa Morte, Rio Claro - SP')`:
   - fonte de **39,7 px**, x = **647,25**;
   - baselines **3386** e **3433**;
   - cor `(247,247,247)`;
   - superamostragem 4×, layout libraqm (kerning).
   
   O script recusa um texto largo demais, que invadiria o desenho do canto.
4. Redimensiona para 1654×2339 (LANCZOS) e salva em JPEG com qualidade 82, `optimize` e `progressive`. O resultado é determinístico (byte a byte).

Opções do script: `--revisao /tmp/rev` gera `antes.png`, `depois.png` e `pagina.png`; `--validar` mede o casamento da fonte com o original.

O desenho do timbrado tem estas partes:

- **Cabeçalho à esquerda:** logo, "BALANÇAS.COM", "Equipamentos e Sistemas" e "(19) 3023-9050".
- **Cabeçalho à direita:** "recepcao@balancass.com" e "balancass.com" com ícone de envelope; "(19) 3023-9050" com ícone de WhatsApp.
- **Corpo:** marca-d'água gigante do "bq" em `#F5F5F5`.
- **Rodapé:** faixa grafite com padrão de circuito, "CNPJ: 12.403.843/0001-18 | Rua 13, Número 650, Entre as Avenidas 9 e 11, Bairro da Boa Morte, Rio Claro - SP" e uma curva verde no canto inferior direito.

### 2.2 Bibliotecas de PDF e onde o timbrado é aplicado

#### BC Fichas Control: **jsPDF 4** (gerado no navegador, carregado sob demanda com `import()`)

- **`src/lib/pdf.ts`:** `carregarTimbrado()` (carrega `timbrado.jpg` uma vez, importado pelo Vite como URL), as cores `VERDE`, `TINTA`, `SECUNDARIO` e `LINHA`, e o **Resumo de locação**.
- **`src/lib/pdfRecibo.ts`:** recibo (texto justificado, valor por extenso e assinatura).
- **`src/lib/pdfContrato.ts`:** contrato. Segue o CDC art. 54: corpo de no mínimo 12 pt e cláusulas restritivas em negrito.
- **`src/lib/pdfTexto.ts`:** `txt()` deixa o texto seguro para a fonte padrão (Latin-1 + extras do Windows-1252; ★ vira "*", → vira "->").

O timbrado entra como **imagem de fundo da página inteira**, em cada página:

```ts
const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
const L = 22, R = 188              // margens esquerda e direita (mm)
doc.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
// O conteúdo nunca pode invadir a curva verde (~268 mm) nem a faixa cinza do rodapé (~278 mm)
const LIMITE = 262
let y = 60                          // 1ª página: o conteúdo começa abaixo do cabeçalho
const garantirEspaco = (altura: number) => {
  if (y + altura <= LIMITE) return
  doc.addPage(); doc.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST'); y = 52
}
```

Padrões visuais do PDF:

- título em `helvetica bold 19` com sublinhado verde arredondado (`roundedRect(L, y+3, 18, 1.2, …)`);
- "Emitido em…" à direita, em 9 pt cinza;
- rótulos em MAIÚSCULAS 7,5 pt cinza, com o valor em 11 pt abaixo;
- linhas de valores com filete `#E2E4E8`;
- **caixa verde arredondada** com "VALOR TOTAL" em branco;
- blocos em `#F4F6F5` com raio de 1,5 mm.

No contrato, o conteúdo vai de 58 a 246 mm na primeira página e de 50 a 246 mm nas demais, com o rodapé (página e rubricas) em 254 mm. O envio por e-mail manda o PDF em base64 para o servidor (§3.8).

#### Orçamentos: **pdfmake 0.3** (gerado no servidor Node)

- **`src/pdf/orcamento.js`** usa o timbrado **partido em duas imagens**: `public/img/timbrado-cabecalho.png` (1240×1488, cabeçalho + marca-d'água) e `timbrado-rodape.png` (1240×174).
  - As duas são esticadas na largura da página em `background` (cabeçalho em (0,0), rodapé colado ao pé).
  - Margens com timbrado: `[1,5 cm, 4 cm, 1,5 cm, 3,4 cm]`.
  - Paginação "Orçamento nº X • Página N de M" na faixa clara acima do rodapé.
  - Sem timbrado, monta um cabeçalho em texto com os dados de `cfg.empresa`.
- **`src/imagens.js`:** o usuário pode trocar as imagens em Configurações. Elas ficam em `dados/timbrado-cabecalho.png` e `dados/timbrado-rodape.png`.
- **Segurança:** antes de criar o documento, chama `pdfmake.setUrlAccessPolicy(() => false)` e `setLocalAccessPolicy`, liberando só a pasta das fontes e as imagens do timbrado.
- **Problema:** o rodapé PNG do Orçamentos traz "**R. Treze, 650 - Consolação**, Rio Claro - SP". É um endereço **diferente** do timbrado do BC Fichas, que diz "Rua 13, Número 650… Bairro da Boa Morte". Veja §2.3.
- O **checklist A4** é uma página HTML para imprimir (`public/imprimir/checklist.html`, `.css` e `.js`, com `@page`), com `logo-simbolo.png` e os dados da empresa no topo. Não é PDF.

**Para o novo sistema:**

- **jsPDF no navegador** (como o BC Fichas Control) evita fontes e PDF no servidor e já está pronto com o timbrado atualizado.
- **pdfmake no servidor** (como o Orçamentos) é melhor se o certificado precisar ser **gerado e guardado no servidor** (número sequencial, imutável, enviado por e-mail sem o navegador), com tabelas longas e quebra de página automática. Um certificado de calibração tem tabelas de ensaios e incertezas e precisa ser reemitido idêntico, então **pdfmake no servidor** com o `timbrado.jpg` atualizado como `background` parece o mais adequado. A alternativa é jsPDF com os dados congelados, como o contrato do BC Fichas faz.

### 2.3 Dados da empresa encontrados (com a fonte)

| Dado | Valor | Onde aparece |
|---|---|---|
| Nome fantasia / marca | **Balanças.com** (site); "BALANÇAS.COM" (timbrado, Orçamentos); "BALANCAS.COM" (Receita) | `site-balancass/compartilhado/dados/empresa.js`, timbrado, `balan-as.com---or-amentos/src/config-padrao.js`, fixtures de CNPJ |
| Subtítulo | "**Equipamentos e Sistemas**" (timbrado, Orçamentos) **×** "**Automação Comercial**" (site) | divergente |
| Frase | "A medida certa para o seu negócio" | `empresa.js` |
| Razão social | **FABIO DE GODOY LIMA LTDA** ("Fabio de Godoy Lima Ltda" no site) | `bc-fichas-control/shared/dominio.ts` (`CONFIG_PADRAO.empresaRazaoSocial`), `empresa.js`, fixtures da Receita |
| CNPJ | **12.403.843/0001-18** | todos |
| Inscrição estadual | **não encontrada em nenhum repositório** (nem em seeds, configs, README, fixtures ou JSON-LD) | — pedir ao dono |
| Endereço | **Rua 13, nº 650, entre as Avenidas 9 e 11, Bairro da Boa Morte, Rio Claro - SP** | `CONFIG_PADRAO.empresaEndereco`, timbrado atualizado, `empresa.js` (`"rua": "Rua 13, 650"`, `"referencia": "Entre as Avenidas 9 e 11"`, `"bairro": "Boa Morte"`) |
| CEP | **13500-120** | `empresa.js`, Receita |
| Cidade / UF | Rio Claro - SP | todos |
| Endereço divergente | "R. Treze, 650 - **Consolação**" | `balan-as.com---or-amentos/src/config-padrao.js` e `public/img/timbrado-rodape.png` (desatualizados) |
| Endereço antigo | "Avenida 12, Número 1313, Entre as ruas 13 e 14, Bairro Santa Cruz" | `timbrado-original.png` (só para histórico) |
| Telefone e WhatsApp | **(19) 3023-9050**; link `+551930239050`; WhatsApp `551930239050` | todos |
| Telefone na Receita | (19) 8118-2225; fax (19) 3524-0090 (cadastro antigo) | `server/consultas/__fixtures__/cnpj-*.json` |
| E-mail | **recepcao@balancass.com** (timbrado, `CONFIG_PADRAO`, Orçamentos) **×** **balancas.com@gmail.com** (site `empresa.js`, JSON-LD, Receita) | divergente: confirmar qual vai no certificado |
| Site | **balancass.com** (com dois "s"); canônico `https://balancass.com/` | timbrado, Orçamentos, site |
| Credenciamento | "**Oficina autorizada pelo IPEM-SP**" (oficina permissionária). O número da permissionária **não está preenchido** (`empresa.permissionaria: ''` no Orçamentos) | `empresa.js` (`ipem`), `config-padrao.js` |
| Fundação | 05/08/2010 ("Desde 2010"); fundador com 25+ anos no ramo | Receita (fixture), `empresa.js` |
| Natureza / porte | Sociedade Empresária Limitada; Micro Empresa; optante pelo Simples (desde 01/01/2017) | fixtures da CNPJ.ws |
| CNAE principal | 4751-2/01 (comércio varejista de equipamentos e suprimentos de informática). Secundários vistos: 4530-7/03, 9511-8/00 | fixtures |
| Horário | Seg a sex 8h–11h e 13h–18h; sábado 8h–12h; domingo e feriados fechado | `empresa.js` |
| Representante legal | Fabio de Godoy Lima (usado como `empresaRepresentante` no seed) | `bc-fichas-control/shared/seed.ts` |
| Equipe (site) | Fábio Godoy (fundador e diretor), **Maurício Ritter (técnico de balanças)**, Lizi Ellen (administrativo e vendas), Rafael Tessaro (sistemas e suporte) | `empresa.js` |
| Redes | facebook.com/balancas.comrc; Google Maps `cid=12422356528564941318` (nota 5,0, 56 avaliações) | `empresa.js` |

No BC Fichas Control, esses dados ficam editáveis em **Configurações** e são gravados como JSON na tabela `config` (chave `'geral'`). Os campos são `empresaNome`, `empresaRazaoSocial`, `empresaCnpj`, `empresaCidade`, `empresaEndereco`, `empresaTelefone`, `empresaEmail`, `empresaRepresentante` e `empresaRepresentanteCpf`. O Orçamentos guarda o equivalente em `config.empresa` (`nome`, `razaoSocial`, `permissionaria`, `subtitulo`, `cnpj`, `endereco`, `cidade`, `telefone`, `whatsapp`, `email`, `site`).

---

## 3. Arquitetura do BC Fichas Control

### 3.1 Estrutura e build

```
bc-fichas-control/
  index.html               HTML do Vite: aplica o tema salvo antes de pintar (sem "flash")
  vite.config.ts           React + Tailwind; proxy /api → localhost:3000 em dev; config do vitest
  tsconfig.json            referências: tsconfig.app.json (src), tsconfig.node.json (vite.config), tsconfig.server.json (server + shared, strict)
  package.json             "type": "module"; engines node >= 22.18; "imports": { "#shared/*": "./shared/*" }
  shared/                  regras usadas pelo servidor E pela interface (tipos, cálculo, validação, permissões, documentos)
  server/                  Node: Fastify + node:sqlite (TypeScript executado direto pelo Node)
    iniciar.mjs            confere a versão do Node, chdir para a raiz, esconde o ExperimentalWarning, importa index.ts
    index.ts               lê .env (process.loadEnvFile), cria o app, listen, mostra os endereços, sinais e erros fatais
    app.ts                 criarApp(): segurança, acesso, rotas, arquivos estáticos, tarefas em segundo plano
    db.ts                  abrirBanco + migrações (PRAGMA user_version) + transacao() + meta
    repositorio.ts         CRUD de domínio (transação, versão otimista, revisão global e publicação no tempo real)
    acesso.ts              tabela de acesso por rota, cookie e ganchos onRequest/preHandler/onResponse (auditoria)
    usuarios.ts, senha.ts, limiteTentativas.ts   usuários, sessões, scrypt, bloqueio por tentativas
    tempoReal.ts           Server-Sent Events
    backup.ts              cópias automáticas VACUUM INTO
    email.ts               nodemailer + configuração SMTP em arquivo
    consultas/             CNPJ e CEP (motor com fallback, cache, normalização de texto, fixtures e testes)
    rotas/                 dados.ts, anexos.ts, contratos.ts, consultas.ts, usuarios.ts
    google/                sincronização com o Google Agenda (conta de serviço)
    ferramentas/           copiar-banco.mjs, redefinir-senha.mjs (ferramentas de linha de comando para os scripts do Windows)
    auxiliaresTeste.ts     app de teste com banco em memória e usuários
  src/                     React (páginas, componentes, stores zustand, lib/api, PDF)
  public/favicon.png
  deploy/windows/*.ps1, deploy/windows/iniciar-servidor.bat, deploy/linux/bc-fichas.service
  INSTALAR.bat, ATUALIZAR.bat, REDEFINIR-SENHA.bat
  scripts/empacotar-windows.sh, scripts/timbrado/
  .github/workflows/pacote-windows.yml
  .env.exemplo, .gitattributes (*.ps1 e *.bat em CRLF), .oxlintrc.json, .prettierrc.json
```

Scripts do `package.json`:

```json
"dev": "concurrently -k -n servidor,web -c green,blue \"npm:dev:servidor\" \"npm:dev:web\"",
"dev:web": "vite",
"dev:servidor": "node --watch server/iniciar.mjs",
"build": "tsc -b && vite build",
"start": "node server/iniciar.mjs",
"usuarios": "node server/ferramentas/redefinir-senha.mjs",
"test": "vitest run",
"lint": "oxlint",
"format": "prettier --write src server shared"
```

Pontos do build:

- **O servidor não é compilado.** O Node ≥ 22.18 remove os tipos do TypeScript sozinho (*type stripping*), por isso `erasableSyntaxOnly` e `allowImportingTsExtensions` nos tsconfig, e os imports com extensão `.ts`.
- O `tsc -b` só checa os tipos (`noEmit`). O `vite build` gera `dist/`.
- **Dependências de produção: só 4**: `fastify ^5.12.5`, `@fastify/static ^10.1.5`, `nodemailer ^10.0.13` e `date-fns ^4.4.0`.
- O resto fica em `devDependencies`, porque vai compilado para `dist/`: `react 19.2`, `react-dom`, `react-router-dom 7` (**HashRouter**), `zustand 5`, `motion 13`, `lucide-react`, `recharts 3`, `jspdf 4`, `tailwindcss 4` + `@tailwindcss/vite`, `vite 8`, `@vitejs/plugin-react 6`, `typescript ~6.0`, `vitest 5`, `oxlint`, `prettier` e `concurrently`.
- **Por que isso importa:** o pacote do Windows instala com `npm ci --omit=dev` e **não pode ter módulo nativo** (`*.node`). Por isso SQLite do Node e scrypt do `node:crypto`, sem `better-sqlite3`, `bcrypt` ou `argon2`.
- **Prettier:** `semi: false`, `singleQuote: true`, `printWidth: 130`, `trailingComma: all`.

### 3.2 Servidor Fastify

- **Inicialização (`server/index.ts`):**
  - lê `.env` se existir (`process.loadEnvFile('.env')`);
  - variáveis: `PORTA` (padrão **3000**), `HOST` (padrão `0.0.0.0`), `PASTA_DADOS` (padrão `dados`) e `HOSTS_PERMITIDOS`;
  - com `EADDRINUSE`, avisa "A porta 3000 já está em uso… defina PORTA=3001";
  - mostra `http://localhost:porta` e cada IPv4 da rede;
  - `uncaughtException`: grava no stderr com `writeSync` e encerra com `exit(1)`, e o serviço reinicia;
  - nos sinais SIGINT, SIGTERM, SIGHUP e SIGBREAK chama `app.close()`, com 5 s de garantia.
- **`criarApp()` (`server/app.ts`):**
  - `Fastify({ logger: { level: 'warn' }, bodyLimit: 50 MB, trustProxy: false })`.
  - Abre o banco em `<pastaDados>/bc-fichas.db` e cria `TempoReal`, `Repositorio`, `BackupsAutomaticos` e `ServicoUsuarios`.
  - **Gancho de segurança `onRequest`**, que vale para qualquer requisição:
    1. **Host permitido** (contra *DNS rebinding*): `hostPermitido()` aceita IP, `localhost`, `*.localhost`, o nome do computador (`os.hostname()`) e `HOSTS_PERMITIDOS`. Fora disso responde 403.
    2. Cabeçalhos `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` e `Referrer-Policy: same-origin`; `Cache-Control: no-store` em `/api`.
    3. **CSRF:** todo método que não é GET nem HEAD exige `Origin` igual ao `Host` (quando vier) e o cabeçalho **`x-bc-fichas: 1`**:
       ```ts
       export const CABECALHO_APP = 'x-bc-fichas'
       if (req.method === 'GET' || req.method === 'HEAD') return
       if (origem && new URL(origem).host !== req.headers.host) throw new ErroApi(403, 'Requisição de outro site bloqueada.')
       if (req.headers[CABECALHO_APP] !== '1') throw new ErroApi(403, 'Requisição bloqueada.')
       ```
  - `instalarAcesso()` (§3.4).
  - `setErrorHandler`: `ErroApi(status, mensagem, dados)` vira `{ erro, ...dados }` e o `Retry-After` sai de `esperarSegundos`. Erro 5xx vira mensagem genérica, com o detalhe no log.
  - `GET /api/saude`: completo para o próprio computador (versão, revisão, build, conectados, horário) e só `{ ok, versao }` pela rede. Os scripts do Windows usam essa rota para saber se o servidor subiu.
  - **Rotas registradas:** `rotasDados`, `rotasAnexos`, `rotasContratos`, as rotas de e-mail, `rotasConsultas`, as do Google e `rotasUsuarios`. `app.all('/api/*')` responde 404 em JSON.
  - **Interface:** `@fastify/static` serve `dist/`.
    - Arquivos em `assets/` (com hash no nome) saem com `Cache-Control: public, max-age=31536000, immutable`; o `index.html` sai com `no-cache`.
    - O **build** é o SHA-1 (12 caracteres) do `dist/index.html`. Ele vai na mensagem de boas-vindas do SSE, e as abas recarregam quando o servidor é atualizado.
    - Sem `dist/`, responde uma página que manda rodar `npm run build`.
    - Como o front usa HashRouter, não precisa de fallback de SPA.
  - **Tarefas em segundo plano:** backups diários, Google e uma **varredura a cada 60 s** (sessões vencidas, fechamento do SSE delas, limite de tentativas e limpeza diária da auditoria).
  - `preClose` fecha as conexões SSE (senão o `app.close()` trava); `onClose` roda `PRAGMA wal_checkpoint(TRUNCATE)` e `db.close()`.
- **Rotas principais** (`server/rotas/dados.ts`, `anexos.ts`, `contratos.ts`, `usuarios.ts`, `email.ts`, `consultas.ts`):

  | Grupo | Rotas |
  |---|---|
  | Dados | `GET /api/dados` (carga completa), `GET /api/stream` (SSE) |
  | Cadastros | CRUD `/api/clientes`, `/api/eventos` (PATCH, `duplicar`, `repetir`), `/api/maquinas` (+ `quantidade`), `/api/ordens`, `/api/reclamacoes` |
  | Configurações | `PUT /api/config`, `PUT /api/config/servicos` |
  | Backup | `GET /api/backup` (JSON), `POST /api/backup/restaurar`, `/mesclar`, `GET` e `POST /api/backups` (cópias .db), `POST /api/exemplo`, `POST /api/limpar` (com `{confirmacao:'APAGAR'}`) |
  | Anexos | `POST /api/eventos/:id/anexos` (arquivo cru `application/octet-stream`, nome em `x-nome`, tipo em `x-tipo`, até 25 MB), `GET` e `DELETE /api/anexos/:id` |
  | Contratos | `/api/contratos` (+ `/arquivo` da cópia assinada) |
  | E-mail | `/api/email/config`, `/api/email/teste`, `/api/email/enviar` |
  | Consultas | `/api/consultas/cnpj/:cnpj`, `/api/consultas/cep/:cep` |
  | Sessão e usuários | `/api/sessao` (GET, POST, DELETE), `/api/minha-senha`, `/api/usuarios` (+ `/senha`, `/sessoes`), `/api/auditoria` |
  | Google | `/api/google/*` |

### 3.3 Banco de dados

- **Motor:** **SQLite embutido do Node** (`import { DatabaseSync } from 'node:sqlite'`), sem dependência nativa. Não usa `better-sqlite3` nem JSON em arquivo.
- **Arquivo:** `<PASTA_DADOS>/bc-fichas.db`, com `-wal` e `-shm`. No Windows fica em `C:\BC-Fichas-Control\dados\`.
- **Abertura (`server/db.ts`):**
  ```ts
  const db = new DatabaseSync(arquivo)
  db.exec('PRAGMA busy_timeout = 5000')   // antes do WAL: o servidor e a ferramenta de senha podem abrir juntos
  ativarWal(db)                           // PRAGMA journal_mode = WAL, com novas tentativas por até 10 s se "database is locked"
  db.exec('PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
  migrar(db)
  ```
- **Migrações:** um array `MIGRACOES: string[]`. Cada item roda uma vez, em ordem, controlado por `PRAGMA user_version`, dentro de `BEGIN IMMEDIATE`, e relê a versão já com a trava. A regra do arquivo é: "Nunca altere um item já publicado — acrescente outro".
- **`transacao(db, fn)`:** usa `BEGIN IMMEDIATE`, e as chamadas aninhadas reaproveitam a transação externa (um `WeakSet` marca o banco em transação).
- **Padrão das tabelas:** **documento JSON** + colunas indexadas:
  ```sql
  CREATE TABLE clientes (id TEXT PRIMARY KEY, dados TEXT NOT NULL, versao INTEGER NOT NULL, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL);
  CREATE TABLE eventos  (id TEXT PRIMARY KEY, codigo INTEGER NOT NULL UNIQUE, cliente_id TEXT NOT NULL REFERENCES clientes(id), dados TEXT NOT NULL, versao …);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);      -- 'geral' → JSON das Configurações
  CREATE TABLE meta   (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);      -- 'revisao', 'proximo_codigo', 'proxima_os'
  -- migração 2: maquinas (identificacao UNIQUE COLLATE NOCASE), ordens_servico (numero UNIQUE)
  -- migração 3: reclamacoes, anexos (id, evento_id, nome, tipo, tamanho, criado_em)
  -- migração 4: contratos (numero UNIQUE; dados congelados no JSON; sem FK para o evento)
  -- migração 5: usuarios, sessoes, auditoria (fora do backup JSON)
  ```
  As tabelas de usuários (migração 5):
  ```sql
  CREATE TABLE usuarios (id TEXT PRIMARY KEY, login TEXT NOT NULL, nome TEXT NOT NULL,
    nivel TEXT NOT NULL CHECK (nivel IN ('ADMIN','COMUM')), senha_hash TEXT NOT NULL,  -- '$scrypt$ln=15,r=8,p=3$<sal>$<hash>'
    ativo INTEGER NOT NULL DEFAULT 1, trocar_senha INTEGER NOT NULL DEFAULT 0, versao INTEGER NOT NULL,
    criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, senha_alterada_em TEXT NOT NULL,
    ultimo_acesso_em TEXT NOT NULL DEFAULT '', ultimo_acesso_ip TEXT NOT NULL DEFAULT '');
  CREATE UNIQUE INDEX usuarios_login ON usuarios(login);
  CREATE TABLE sessoes (id TEXT PRIMARY KEY /* SHA-256 do token */, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em INTEGER NOT NULL, usada_em INTEGER NOT NULL, expira_em INTEGER NOT NULL, persistente INTEGER NOT NULL DEFAULT 0, ip TEXT NOT NULL DEFAULT '');
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT NOT NULL, usuario_id TEXT, login TEXT, ip TEXT,
    acao TEXT NOT NULL, alvo TEXT, detalhe TEXT);
  ```
- **Concorrência otimista:** cada documento tem `versao`. O cliente manda a `versao` que estava editando, e o repositório responde **409** "… foi alterado por outra pessoa enquanto você editava" com o registro atual.
- **Revisão global:** toda gravação incrementa `meta.revisao` dentro da transação e publica `{ revisao, tipo, acao, dado }` no SSE. Se o cliente percebe que pulou uma revisão, recarrega tudo.
- **IDs:** UUID v4 (`shared/id.ts`). Há uma alternativa com `crypto.getRandomValues`, porque `crypto.randomUUID` não existe em HTTP fora do localhost.
- **Validação:** feita em `shared/dominio.ts` (`normalizarX(entrada) → { valor, erros }`) e usada pelo servidor e pela tela. Tem limites de segurança (`LIMITES`).
- **Pasta de dados** (`dados/`):

  | Item | Conteúdo |
  |---|---|
  | `bc-fichas.db` (+ `-wal`, `-shm`) | banco |
  | `backups/` | cópias `.db` |
  | `anexos/<evento>/` | arquivos anexados |
  | `anexos-removidos/<data>/` | anexos apagados, que podem voltar |
  | `contratos/` | cópias assinadas |
  | `email.json` | configuração SMTP |
  | `google/credenciais.json` | chave do Google |
  | `servidor.log` | log do servidor no Windows |

### 3.4 Autenticação

- **Níveis:** `ADMIN` e `COMUM`. A matriz fica num arquivo só, **`shared/permissoes.ts`** (`PERMISSOES: Record<Permissao, NivelUsuario[]>`, `pode(nivel, p)`, mensagens e rótulos), usado pelo servidor e pelas telas (`usePode`).
  - Algumas permissões são "só na tela" (`SO_NA_TELA`: ver faturamento e exportar planilhas): a API não esconde, só a interface.
- **Tabela de acesso que falha fechada (`server/acesso.ts`):**
  - `TABELA_ACESSO: Record<'MÉTODO /rota', 'publico' | 'logado' | Permissao>`.
  - O gancho `onRoute` **recusa subir o servidor** se uma rota `/api` não estiver na tabela; o `onReady` recusa se sobrar uma entrada sem rota.
  - O gancho `onRequest` resolve a sessão do cookie e responde, nesta ordem: 401 `SEM_SESSAO`, 403 `TROCAR_SENHA`, 403 `SEM_PERMISSAO` (gravando `ACESSO_NEGADO` na auditoria, no máximo 1 por minuto por usuário e rota).
  - O `preHandler` aplica "regras finas" que reescrevem o corpo para o nível COMUM.
  - O `onResponse` grava cada gravação bem-sucedida na **auditoria** (`ALTERACAO`, com os nomes dos campos do PATCH, nunca os valores).
- **Cookie de sessão:**
  ```ts
  export function nomeCookieSessao(porta?: number) { return porta ? `bcf_sessao_${porta}` : 'bcf_sessao' }   // um nome por porta
  export function cookieSessao(nome, token, maxAgeSegundos) {
    return `${nome}=${token}; Path=/; HttpOnly; SameSite=Strict${maxAgeSegundos ? `; Max-Age=${maxAgeSegundos}` : ''}`
  } // sem Secure (HTTP pelo IP da rede local) e sem Domain; sem Max-Age vale até fechar o navegador
  ```
  > Cookies **não** são separados por porta. Por isso o nome tem a porta. O novo sistema deve usar **outro prefixo** (ex.: `bcc_sessao_<porta>`), senão um sistema derruba a sessão do outro no mesmo IP.
- **Token:** `randomBytes(32).toString('base64url')`, que só existe no cookie. O banco guarda **SHA-256 em hex** (`sessoes.id`).
- **Hash de senha (`server/senha.ts`):**
  - **scrypt** do `node:crypto`, com `N=2^15, r=8, p=3` (~260 ms), sal de 16 bytes, hash de 32 bytes;
  - formato `$scrypt$ln=15,r=8,p=3$<sal b64url>$<hash b64url>`;
  - `maxmem` calculado (o padrão de 32 MiB recusaria esses parâmetros);
  - semáforo de **no máximo 2 hashes simultâneos**;
  - `timingSafeEqual` na comparação;
  - `precisaRefazerHash()` refaz o hash no login quando os parâmetros mudam.
- **Senha temporária:** `xxxx-xxxx-xxxx` com um alfabeto sem caracteres ambíguos (`abcdefghjkmnpqrstuvwxyz23456789`, ~59 bits). O usuário é obrigado a trocar no primeiro acesso (`trocar_senha`).
- **Política de senha (`shared/usuarios.ts`):**
  - de 8 a 128 caracteres, sem regra de composição;
  - recusa senhas comuns (`shared/senhasComuns.ts`), sequências de teclado, um caractere repetido, a senha que contém o login ou o nome e a que contém "**fichas**" (o nome do sistema; **trocar no novo sistema**).
  - Login com `^[a-z0-9][a-z0-9._-]{2,31}$`, normalizado para minúsculas. Máximo de 50 usuários.
- **Prazos da sessão (`server/usuarios.ts`):**
  ```ts
  export const PRAZOS_SESSAO = {
    normal:               { inatividadeMs: 4 * HORA, maximoMs: 12 * HORA },
    manterConectado:      { inatividadeMs: 7 * DIA,  maximoMs: 30 * DIA },
    manterConectadoAdmin: { inatividadeMs: 7 * DIA,  maximoMs: 7 * DIA },
    gravarUsoACadaMs: 5 * MINUTO,
  }
  ```
  Desativar o usuário, mudar o nível ou redefinir a senha encerra as sessões dele **na hora**, inclusive o SSE.
- **Limite de tentativas (`server/limiteTentativas.ts`, em memória):**
  ```ts
  par:   { modo: 'seguidas', livres: 5, esperaInicialMs: 30 s, esperaMaximaMs: 15 min, esquecerMs: 1 h }   // login|IP; a espera dobra
  senha: { mesma regra, para a senha atual na troca da própria senha }
  ip:    { modo: 'janela', falhas: 20, janelaMs: 15 min, bloqueioMs: 15 min }   // o computador inteiro
  login: { modo: 'janela', falhas: 50, janelaMs: 1 h,    bloqueioMs: 15 min }   // de qualquer IP; não vale para o loopback
  ```
  Responde 429 com `Retry-After` e `motivo: 'computador'` quando o bloqueio é por IP. Redefinir a senha destrava `par`, `login` e `senha`, mas não `ip`.
- **Primeiro administrador:** **só pelo computador do servidor**, nunca pela tela.
  - A ferramenta `server/ferramentas/redefinir-senha.mjs` tem os comandos `situacao`, `definir` (JSON na entrada padrão), `encerrar-sessoes` e `transplantar`, com entrada e saída em base64 do UTF-8 para o PowerShell não estragar os acentos.
  - Os scripts INSTALAR e ATUALIZAR chamam essa ferramenta (`Garantir-Administrador`).
  - O atalho do Menu Iniciar "**Redefinir senha do BC Fichas**" abre o `REDEFINIR-SENHA.bat` elevado.
- **Redefinição de senha:**
  - pela tela, o administrador usa ⋯ → Redefinir senha, e o sistema gera uma senha temporária;
  - pelo servidor, o atalho acima (vale para administradores esquecidos);
  - a senha nova vale na hora, e as sessões caem em até 1 minuto (varredura).
- **Front:**
  - `src/store/sessao.ts` (zustand): estados `verificando | anonimo | logado | erro`, `semUsuarios`, `expirou`;
  - **BroadcastChannel** `bc-fichas-sessao` para avisar as outras abas (entrou, saiu, trocou a senha);
  - **batimento** de 5 min e conferência no foco (no máximo a cada 30 s);
  - `SessaoEncerradaModal` cobre a tela sem desmontá-la, e o que estava digitado continua;
  - `lib/api.ts#definirAoErroSessao` recebe 401 e 403 `TROCAR_SENHA` de qualquer requisição.

### 3.5 Tempo real: SSE (não WebSocket)

- **Servidor (`server/tempoReal.ts`):**
  - `GET /api/stream` usa `reply.hijack()`;
  - cabeçalhos `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`;
  - primeira mensagem: `retry: 3000\nevent: ola\ndata: {"revisao":N,"build":"…"}`;
  - cada alteração sai como `id: <revisao>\ndata: <json>`;
  - `: ping` a cada 25 s;
  - cada conexão sabe o dono (`sessaoId`, `usuarioId`), para `encerrarSessoes()` e `encerrarUsuario()`;
  - sem sessão, responde um `ola` com `semSessao: true` e fecha.
- **Mensagens:** `MensagemTempoReal` (`shared/tipos.ts`) = `{ revisao, tipo: 'cliente'|'evento'|…|'config', acao: 'salvo', dado } | {…, acao: 'excluido', id } | { tipo: 'tudo', acao: 'recarregar' }`.
- **Cliente (`src/lib/api.ts#conectarTempoReal`):**
  - usa `EventSource`;
  - uma **aba escondida por mais de 30 s fecha a conexão** (o navegador limita ~6 conexões por servidor) e reabre ao voltar;
  - com `semSessao`, para e só volta com `reabrir()`.
- **Store `src/store/dados.ts`:**
  - aplica cada mensagem com `mesclar()`, que nunca volta para uma versão mais antiga;
  - guarda numa fila as mensagens que chegam durante a carga;
  - se a revisão pulou, roda `recarregar()`;
  - se o `build` mudou, recarrega a página (no máximo 1 vez a cada 30 s);
  - se a recarga falha, tenta de novo com espera crescente e mostra a faixa "AvisoConexao".

### 3.6 Backup e restauração

- **Automático (`server/backup.ts`):**
  - `VACUUM INTO` gera uma cópia consistente mesmo com o sistema em uso, em `dados/backups/bc-fichas_<AAAA-MM-DD_HH-mm-ss>_<motivo>.db`;
  - motivos `diario`, `antes-restaurar`, `antes-limpar`, `manual` (os scripts acrescentam `antes-atualizar` e `antes-restaurar-copia`);
  - o diário é conferido a cada hora e roda se o último tiver mais de 24 h;
  - **guarda as 30 mais recentes de cada motivo**.
- **Pela tela (Configurações → Dados e backup):**
  - baixar o **JSON** (`GET /api/backup`, `VERSAO_BACKUP = 6`), restaurar e mesclar, sempre com uma cópia `.db` antes;
  - "cópia agora", que lista as 10 últimas;
  - **usuários, senhas e auditoria não vão no JSON**.
- **Restaurar um `.db`:** `deploy/windows/restaurar-copia.ps1` faz o seguinte:
  1. lista as 15 mais recentes;
  2. para o servidor;
  3. guarda o banco atual (ou uma cópia "bruta" com `-wal` e `-shm` se estiver corrompido);
  4. `copiar-banco.mjs` (que roda `PRAGMA integrity_check` e `VACUUM INTO`);
  5. `redefinir-senha.mjs transplantar` mantém os **usuários de hoje** (ou os da cópia, com `-ContasDaCopia` ou num computador novo);
  6. troca os arquivos, religa o servidor e confere o administrador.
- No fechamento, `PRAGMA wal_checkpoint(TRUNCATE)` deixa o `.db` completo sozinho.
- **Anexos e contratos assinados ficam fora do JSON.** O README orienta copiar a pasta `dados` inteira com `robocopy`, excluindo o `.db` em uso.

### 3.7 Consultas de CNPJ e CEP

**Arquitetura:** o **servidor** acessa a internet. O navegador chama `GET /api/consultas/cnpj/:cnpj` e `GET /api/consultas/cep/:cep` (permissão `logado`), com tempo limite de 30 s no front. Sem internet, só essas rotas respondem 503, e o cadastro continua à mão.

**Motor genérico (`server/consultas/motor.ts`):**

```ts
export async function consultarEmOrdem<T>(chave, provedores: Provedor<T>[], { fetch, timeoutMs }) {
  for (const p of provedores) {
    resp = await fetch(p.url(chave), { headers: { Accept: 'application/json', 'User-Agent': 'BC-Fichas-Control/2.0 (+servidor local)' },
                                      signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
    // erro de rede ou tempo esgotado → próximo; 429 ou 5xx → próximo
    // interpretar(): 'ok' → devolve; 'naoEncontrado' definitivo → devolve; não definitivo → continua; 'falha' → continua
  }
  // { tipo: 'indisponivel', semInternet: (todas as falhas foram de rede), falhas: [...] }
}
```

- **Cache em memória** (`CacheTemporario`): até 1000 itens, **24 h** para quem foi encontrado e **1 h** para "não encontrado".
- **Pedidos simultâneos para a mesma chave são unificados** (`emAndamento`).
- **Tempo limite: 8 s por provedor.**
- `fetch` e provedores são injetáveis nos testes, que usam os fixtures de `server/consultas/__fixtures__/`.

**Ordem de fallback:**

| Consulta | 1º | 2º | 3º |
|---|---|---|---|
| CNPJ | **BrasilAPI** `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` | **CNPJ.ws** `https://publica.cnpj.ws/cnpj/{cnpj}` | **Minha Receita** `https://minhareceita.org/{cnpj}` |
| CEP | **BrasilAPI v2** `https://brasilapi.com.br/api/cep/v2/{cep}` (o 404 dela **não** é definitivo) | **ViaCEP** `https://viacep.com.br/ws/{cep}/json/` (`erro: true` = não existe) | **OpenCEP** `https://opencep.com/v1/{cep}` |

O Orçamentos usa outra ordem para CNPJ: BrasilAPI → **CNPJá** (`open.cnpja.com/office/`) → Minha Receita → **ReceitaWS**. Lá não há CEP.

**Campos devolvidos (`DadosCnpj`, `server/consultas/cnpj.ts`), já normalizados:**

| Campo | BrasilAPI e Minha Receita | CNPJ.ws |
|---|---|---|
| `razaoSocial` (como na Receita) | `razao_social` | `razao_social` |
| `nomeFantasia` (formato de título, preservando siglas) | `nome_fantasia` | `estabelecimento.nome_fantasia` |
| `nomeSugerido` | fantasia ou, na falta, razão social em formato de título | idem |
| `situacaoCadastral` (ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA) | `descricao_situacao_cadastral` | `estabelecimento.situacao_cadastral` |
| `dataAbertura` (yyyy-MM-dd) | `data_inicio_atividade` | idem |
| `atividadePrincipal` | `cnae_fiscal_descricao` | `atividade_principal.descricao` |
| **`telefone`** "(19) 8118-2225" | `ddd_telefone_1` ou `_2` | `ddd1`+`telefone1` ou `ddd2`+`telefone2` |
| **`email`** (validado e em minúsculas; vazio se inválido) | `email` (a BrasilAPI costuma trazer `null`) | `estabelecimento.email` |
| `cep`, `logradouro` (tipo + nome, sem repetir), `numero`, `complemento`, `bairro`, `cidade`, `uf` | campos com o mesmo nome / `municipio` | `cidade.nome`, `estado.sigla` |
| `fonte` | provedor que respondeu | |

- **Telefone e e-mail vêm, sim**, mas o e-mail com frequência vem vazio (BrasilAPI).
- **Inscrição estadual não é mapeada.** A CNPJ.ws pública costuma trazer `estabelecimento.inscricoes_estaduais[]`, mas o fixture e o código não usam: seria um acréscimo útil no novo sistema (verificar o formato atual da API).
- `server/consultas/texto.ts`:
  - `formatoTitulo()`: "BAIRRO DA BOA MORTE" vira "Bairro da Boa Morte", mantendo LTDA, ME, EPP, S/A, algarismos romanos e siglas só de consoantes;
  - também tem `juntarLogradouro()`, `formatarTelefone()`, `formatarCep()` e `formatarEmail()`.

**CNPJ alfanumérico** (`shared/documentos.ts`, IN RFB 2.229/2024, em vigor desde julho de 2026):

- `normalizarCnpj()` mantém as letras **maiúsculas** e descarta rótulos colados ("CNPJ:", "nº", "(matriz)").
- `cnpjValido()` aceita `^[0-9A-Z]{12}\d{2}$` e calcula o DV pelo módulo 11 com o **valor ASCII − 48** ("A" vale 17).
- `mascaraCnpj()` gera `12.ABC.345/01DE-35`.
- No serviço, se o CNPJ é alfanumérico e os provedores não respondem, sai um **404** com `motivo: 'cnpj_alfanumerico'` e a mensagem "preencha à mão". Só a falta de internet é tratada como tal.

**Front (`src/lib/consultas.ts` + `ClienteFormModal.tsx`):**

- consulta automática com **atraso de 400 ms** quando o CNPJ completo é válido; o botão "Consultar" sobrescreve;
- `mesclarConsulta()` preenche só campos vazios ou que vieram da consulta anterior (não apaga o que o usuário digitou);
- `mesclarCep()` não apaga rua e bairro com um CEP geral da mesma cidade;
- `tomSituacao()`, `avisoSituacao()` (alerta para BAIXADA, INAPTA, SUSPENSA e NULA) e `erroDeConsulta()` (tipos `invalido | naoEncontrado | naoSuportado | semInternet | semServidor`).

### 3.8 E-mail (nodemailer)

O módulo é `server/email.ts`.

- **Onde fica a configuração:** **arquivo** `<pastaDados>/email.json`, **fora do banco**, para a senha não ir nas cópias.
  - Grava num arquivo temporário e faz `rename` (atômico), com modo `0600`. No Windows a proteção vem do ACL da pasta.
  - Uma migração tira a configuração antiga da tabela `meta`.
- **A senha nunca vai ao navegador.** `configPublica()` devolve `senhaDefinida` e `configurado`. O usuário COMUM só recebe `{configurado, remetenteNome, remetenteEmail}`.
- **Regra contra exfiltração:** a senha em branco mantém a gravada **só se** servidor, porta, usuário e segurança forem os mesmos. Senão, pede a senha de novo. Isso impede apontar o envio para um servidor de terceiros e receber a senha.
- **Transporte:**
  ```ts
  nodemailer.createTransport({ host: c.servidor, port: c.porta, secure: c.seguranca === 'SSL',
    requireTLS: c.seguranca === 'STARTTLS', ignoreTLS: c.seguranca === 'NENHUMA',
    auth: { user: c.usuario, pass: c.senha }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 })
  ```
- **Limites:** 10 destinatários, **1 anexo PDF** (precisa começar com `%PDF-` e terminar em `.pdf`) de até 15 MB, texto de até 20.000 caracteres e **30 e-mails por hora**.
- **Erros em português**, com a dica da "senha de app" do Gmail e do Outlook (EAUTH 534/535, conexão, envelope, TLS).
- **Rotas:** `GET`, `PUT` e `DELETE /api/email/config`, `POST /api/email/teste` e `POST /api/email/enviar` (o PDF vai em base64).
- **WhatsApp:** `src/lib/envio.ts` monta o `wa.me` com a mensagem pronta e baixa o PDF para anexar à mão.
- **No Orçamentos:** a configuração SMTP fica na tabela `config` **junto com a senha**, e o **backup JSON exporta a tabela `config` crua (com a senha)**. Não copiar esse modelo.

### 3.9 Stores do front (zustand) e cliente da API

- **`src/store/ui.ts`:** `useUI` com `tema` e `sidebarRecolhida`, persistido em `localStorage` (`bc-fichas:ui`) via `armazenamentoSeguro`, que cai para a memória se o `localStorage` falhar. Também tem `aplicarTema()`, `useToasts`, `toast.sucesso`, `toast.erro`, `toast.info` e `avisarErro()`.
- **`src/store/sessao.ts`:** sessão (§3.4).
- **`src/store/dados.ts`:** estado dos domínios, mais `status`, `revisao` e `conectado`.
  - Ações assíncronas (`salvarCliente(dados, alvo?)`, …) chamam a API e mesclam a resposta.
  - Usa `Alvo {id, versao}` para a concorrência otimista.
  - `iniciar()` abre o SSE e carrega `/api/dados`.
- **`src/lib/api.ts`:**
  - `requisitar(metodo, caminho, corpo?, timeoutMs = 20_000)` usa `fetch` com `AbortController`, o cabeçalho **`x-bc-fichas: 1`** e `cache: 'no-store'`;
  - lança `ErroApi(status, mensagem, dados)`, com `status 0` = sem conexão;
  - 401 e 403 `TROCAR_SENHA` avisam a sessão;
  - `api.*` é tipado com `#shared/tipos.ts`;
  - `enviarArquivo()` usa **XMLHttpRequest** para ter o progresso do upload (corpo cru e cabeçalhos `x-nome` e `x-tipo`);
  - `conectarTempoReal()` (§3.5).
- **`src/main.tsx`:** no `vite:preloadError` (chunk antigo depois de uma atualização), recarrega a página uma vez a cada 30 s.
- **`src/App.tsx`:**
  - `HashRouter`;
  - `RotaPermitida` por permissão;
  - página Usuários com `lazy()`;
  - `MotionConfig reducedMotion="user"`;
  - `Toaster`, `ConfirmHost` e `SessaoEncerradaModal` sempre montados por cima.

### 3.10 Tema claro, escuro e sistema

O tema é aplicado antes da renderização, em `index.html`:

```html
<script>
  try {
    var t = JSON.parse(localStorage.getItem('bc-fichas:ui') || '{}').state?.tema || 'system'
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch (e) {}
</script>
```

Em tempo de execução:

- `store/ui.ts#aplicarTema(tema)` define o `data-theme`;
- `App.tsx` escuta `matchMedia('(prefers-color-scheme: dark)')` quando o tema é `system`;
- o seletor fica no menu lateral (segmentado com Sol, Lua e Monitor; no menu recolhido é um botão que alterna) e em Configurações;
- `useCores()` relê as variáveis CSS (`MutationObserver` no `data-theme`) para os gráficos do Recharts;
- `body` tem `transition: background-color .3s, color .3s`.

O Orçamentos faz o mesmo em `public/js/tema.js`: `data-tema` com `claro | escuro | sistema` em `localStorage('tema')`. Ele também troca a `<meta name="theme-color">` (`#f3f5f4` no claro, `#131615` no escuro), que colore a barra da janela no modo `--app`.

### 3.11 Busca global Ctrl+K

O arquivo é `src/components/layout/CommandPalette.tsx`.

- **Estado:** um store zustand `usePaleta` com `{ aberta, abrir, fechar }`.
- **Atalho:** um listener global de `keydown` alterna com `(ctrlKey || metaKey) && key === 'k'`. O botão do cabeçalho mostra "Ctrl K" ou "⌘ K".
- **Resultados, agrupados:**
  - **Ações rápidas:** novo evento, novo cliente, nova manutenção e nova máquina, com `chaves` de sinônimos;
  - **Páginas:** as que o nível pode ver;
  - **Sua conta:** "Trocar minha senha" e "Sair", que só aparecem ao buscar;
  - **dados:** clientes, eventos, contratos e máquinas, até 6 por grupo.
- **Busca:** `normalizar()` (sem acentos e em minúsculas).
- **Teclado:** ↑ ↓ Enter, e Esc fecha.
- **Visual:** portal com overlay e blur, painel `max-w-xl rounded-2xl border bg-surface shadow-float` a `pt-[12vh]`, campo de 56 px de altura, lista com `max-h-[52vh]`, rótulos de grupo em 11 px maiúsculos e itens com tile de ícone de 28 px.

### 3.12 Testes e lint

- **Vitest 5** (`vite.config.ts`: `environment: 'node'`, `include: src/**, shared/**, server/**/*.test.ts`), com **601 casos** (`it` e `test`).
  - **Servidor:** `app.inject()` do Fastify com banco `:memory:` e scrypt leve (`PARAMETROS_LEVES`, liberado só com `process.env.VITEST`, numa trava em `criarApp`). `server/auxiliaresTeste.ts#criarAppComLogin()` cria `admin` e `comum` com cookie.
  - **Consultas:** `fetch` falso + fixtures JSON reais dos provedores.
  - **Snapshot:** `shared/__snapshots__/contrato.test.ts.snap`.
  - **PDF:** os testes do PDF (`pdfContrato.test.ts`, `pdfRecibo.test.ts`) rodam no Node.
- **oxlint** (`.oxlintrc.json`): plugins `react`, `typescript` e `oxc`; `react/rules-of-hooks: error`; `react/only-export-components: warn`; ignora `.claude/**`, `dist/**` e `dados/**`.
- **CI:** o workflow do pacote roda `npm ci && npm test` antes de empacotar. Não há um passo separado de lint ou `tsc` no CI; o `tsc -b` roda dentro do `npm run build` no empacotamento.

---

## 4. Instalação e empacotamento no Windows

### 4.1 BC Fichas Control

#### Pacote: `scripts/empacotar-windows.sh` (bash; Linux, macOS ou WSL)

1. Pega o código do **último commit** com `git archive HEAD` e avisa se houver alterações não commitadas.
2. Instala tudo, roda `npm run build` e apaga o `node_modules`. Depois instala só a produção: `npm ci --omit=dev --ignore-scripts`. Apaga as pastas de escopo vazias.
3. **Recusa o pacote se houver um módulo nativo** (`find node_modules -name '*.node'`).
4. **Node portátil:** `NODE_VERSAO="${NODE_VERSAO:-24.21.0}"`.
   - Baixa `node-v24.21.0-win-x64.zip` de `nodejs.org/dist` (com cache em `~/.cache/bc-fichas-control`).
   - **Confere o SHA-256** com o `SHASUMS256.txt` oficial (`sha256sum -c` ou `shasum -a 256 -c`).
   - Extrai a distribuição inteira em `BC-Fichas-Control/node/` (com npm).
5. Grava `pacote.json` (`{versao, commit, node, geradoEm}`). Essa é a marca de "pacote completo": os scripts pulam o `npm ci` e o build.
6. Grava `COMO-INSTALAR.txt` em UTF-8 com BOM e CRLF, para abrir no Bloco de Notas.
7. Gera `pacotes/BC-Fichas-Control-<versão>-windows.zip`. A pasta interna é `BC-Fichas-Control`.

#### Publicação: `.github/workflows/pacote-windows.yml`

- **Gatilho:** `push` (exceto `**.md`) e `workflow_dispatch`. Só o branch padrão publica. `concurrency` cancela a execução anterior.
- **Ambiente:** `ubuntu-latest`, Node 24.
- **Passos:** `npm ci` + `npm test`, depois `scripts/empacotar-windows.sh pacotes`.
- **Publicação na página de versões (Releases):**
  ```bash
  tag="v$versao"
  if gh release view "$tag"; then gh release upload "$tag" "$arquivo" --clobber; gh release edit "$tag" --notes "$notas"
  else gh release create "$tag" "$arquivo" --target "$GITHUB_SHA" --title "BC Fichas Control $versao" --notes "$notas"; fi
  ```
  Um commit novo na mesma versão substitui o `.zip`.

#### Instalação: `INSTALAR.bat` → `deploy/windows/instalar-servico.ps1`

**`INSTALAR.bat`:**

- confere se foi extraído (se `deploy\windows\instalar-servico.ps1` existe);
- recusa uma pasta em unidade de rede;
- **pede elevação** com `Start-Process cmd.exe … -Verb RunAs`, passando o caminho entre aspas (funciona com espaço, parênteses e "&");
- roda `Unblock-File` nos `.ps1`;
- chama o PowerShell com `-ExecutionPolicy Bypass`.

O `ATUALIZAR.bat` e o `REDEFINIR-SENHA.bat` têm a mesma estrutura.

**`instalar-servico.ps1`** (parâmetros `-Porta N`, `-IncluirRedePublica`, `-SemPerguntas`):

1. `Confirmar-Administrador`. Se já houver instalação em outra pasta, manda usar o ATUALIZAR.
2. `Exigir-PastaFixa`: recusa `C:\Users\…` (Downloads, Área de Trabalho, OneDrive).
3. `Exigir-Node`: usa `.\node\node.exe` se existir e confere a versão (≥ 22.18).
4. Lê a porta: `-Porta` grava `PORTA=` no `.env` (criado a partir de `.env.exemplo`, em UTF-8 sem BOM). Sem o parâmetro, lê o `.env` com o próprio Node (`process.loadEnvFile`, resposta em base64 por causa da página de código 850). O padrão é **3000**.
5. Sem `node_modules`, roda `npm ci`; sem `dist`, roda `npm run build` (só na instalação a partir do código).
6. **`Proteger-Pasta`:** só **SYSTEM e Administradores** acessam a pasta do sistema e a de dados.
   ```powershell
   icacls $pasta /setowner '*S-1-5-32-544' /T /C /Q
   icacls $pasta /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /C /Q
   icacls (Join-Path $pasta '*') /reset /T /C /Q
   ```
7. **O serviço é uma tarefa agendada do Windows.** Não usa WinSW, NSSM nem `sc.exe`:
   ```powershell
   $bat = Join-Path $PSScriptRoot 'iniciar-servidor.bat'
   $acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$bat`" servico`"" -WorkingDirectory $script:Raiz
   $gatilho = New-ScheduledTaskTrigger -AtStartup
   $config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
     -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
   $usuario = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
   Register-ScheduledTask -TaskName 'BC Fichas Control' -Action $acao -Trigger $gatilho -Settings $config -Principal $usuario
   ```
   A tarefa inicia com o Windows, **antes do login**, como SYSTEM. A pasta instalada é descoberta depois pelo `WorkingDirectory` da tarefa (`Pasta-Instalada`).

   **`deploy/windows/iniciar-servidor.bat`** reinicia o Node se ele parar:
   ```bat
   cd /d "%~dp0..\.."
   if exist "node\node.exe" set "PATH=%CD%\node;%PATH%"
   if not exist dados mkdir dados
   :inicio
   node server\iniciar.mjs >> dados\servidor.log 2>&1
   if /i not "%~1"=="servico" goto :eof
   echo [%date% %time%] servidor parou (codigo %errorlevel%); reiniciando em 5 s >> dados\servidor.log
   ping -n 6 127.0.0.1 >nul      & REM o "timeout" falha quando roda como SYSTEM
   goto inicio
   ```
8. **Firewall:**
   ```powershell
   $perfis = if ($IncluirRedePublica) { 'Private,Domain,Public' } else { 'Private,Domain' }
   New-NetFirewallRule -DisplayName 'BC Fichas Control' -Direction Inbound -Protocol TCP -LocalPort $Porta -Action Allow -Profile $perfis
   ```
   A regra limita **pelo perfil da rede** (Privada e Domínio), **não** pelo endereço remoto. O BC Fichas .NET é mais restrito: `netsh … remoteip=localsubnet`. **Para o novo sistema, acrescentar `-RemoteAddress LocalSubnet`.** O script também avisa quando a rede está como Pública e mostra o comando `Set-NetConnectionProfile … -NetworkCategory Private`.
9. Roda `Start-ScheduledTask` e `Esperar-Servidor`, que tenta `http://127.0.0.1:<porta>/api/saude` 20 vezes a cada 2 s (~40 s, porque o antivírus examina o `node.exe` na primeira vez).
10. **Atalho:** `Criar-AtalhoRedefinirSenha` cria em `%ProgramData%\Microsoft\Windows\Start Menu\Programs\BC Fichas Control\Redefinir senha do BC Fichas.lnk`.
    - O atalho chama `powershell -EncodedCommand` com `Start-Process cmd /c "REDEFINIR-SENHA.bat elevado" -Verb RunAs`.
    - **Não há atalho na Área de Trabalho nem para abrir o sistema.** O acesso é pelo navegador, com favoritos ou "Criar atalho… Abrir como janela" do Chrome.
11. `Garantir-Administrador`: pergunta login, nome e senha (duas vezes, com `-AsSecureString`). Enter gera uma senha temporária; `PULAR` adia.
12. Mostra os endereços `http://<IPv4>:<porta>` (sem 127.* e sem 169.254.*).

#### Atualização: `ATUALIZAR.bat` → `deploy/windows/atualizar.ps1`

O pacote novo é extraído em **outra pasta** (ex.: `C:\BC-Fichas-Control-novo`), e o ATUALIZAR roda de lá:

1. Acha a instalação pela tarefa agendada e recusa se ela estiver dentro da pasta nova.
2. Para o servidor: `Stop-ScheduledTask` e encerra o `node.exe` cuja linha de comando contém `server\iniciar.mjs`.
3. **Copia o banco** com `copiar-banco.mjs` para `dados\backups\bc-fichas_<data>_antes-atualizar.db`.
4. Troca os arquivos, preservando a pasta `dados` e o `.env`:
   ```powershell
   $manter = @('dados', '.env')
   foreach ($item in Get-ChildItem -LiteralPath $origem -Force) {
     if ($manter -contains $item.Name) { continue }
     $alvo = Join-Path $instalada $item.Name
     if (Test-Path -LiteralPath $alvo) { Remove-Item -LiteralPath $alvo -Recurse -Force }
     Copy-Item -LiteralPath $item.FullName -Destination $alvo -Recurse -Force
   }
   ```
5. Sem `pacote.json` (instalação pelo código), roda `npm ci` e o build.
6. Roda `Proteger-Pasta` de novo, religa o servidor e confere a saúde.
7. **Se der erro antes de trocar os arquivos, religa a versão anterior.** Se der erro depois, avisa que o servidor ficou parado e que os dados estão intactos.
8. Recria o atalho e confere o administrador fora do `try` principal (assim um erro aí nunca deixa o servidor parado).

As abas abertas recarregam sozinhas, porque o `build` mudou.

Outros scripts:

- `desinstalar-servico.ps1`: remove a tarefa, o firewall e o atalho, sem apagar os dados.
- `restaurar-copia.ps1`: §3.6.
- `deploy/linux/bc-fichas.service`: unidade systemd com `Restart=always` e `User=bcfichas` em `/opt/bc-fichas`.

### 4.2 Orçamentos (balan-as.com---or-amentos)

Aqui o modelo é diferente: um **aplicativo local aberto pelo usuário**, não um serviço.

#### Pacote: `scripts/empacotar-windows.js` (Node, `npm run empacotar`)

- Pega o `git archive HEAD` para `dist/BalancasOrcamentos/` e roda `npm ci --omit=dev`, recusando módulos nativos.
- **Node portátil `v24.21.0`:**
  - baixa o `SHASUMS256.txt` e o `node-v24.21.0-win-x64.zip`;
  - **confere o SHA-256** com o `crypto` do Node e apaga o zip se não bater;
  - extrai **só** o `node.exe` e o `LICENSE` para a pasta `runtime/`.
- Resultado: `dist/BalancasOrcamentos-windows.zip` (~46 MB), com `COMO INSTALAR.txt` em CRLF.
- **Variante `--dividir`:** dois zips com menos de 29 MB cada.
  - O `node.exe` é cortado em `.parte1` (dentro do zip 1) e `.parte2` (no zip 2).
  - O `runtime\montar.bat` gerado junta as partes na primeira execução (`copy /b`), procurando a parte 2 em Downloads e nas pastas acima.
  - **Confere o SHA-256 do `node.exe` com `certutil -hashfile`.**

#### Publicação: `.github/workflows/pacote-windows.yml`

- **Gatilho:** push em `main`, `master` e `claude/**` (exceto `.md`) e `workflow_dispatch`.
- **Sem testes** (o projeto não tem).
- **Release:** `gh release delete pacote-windows --yes --cleanup-tag`, depois `gh release create pacote-windows … --latest`.
- **Link fixo:** `https://github.com/RafaelTessaro/Balan-as.com---Or-amentos/releases/latest/download/BalancasOrcamentos-windows.zip`.

#### Execução: `iniciar.bat`

1. Usa `chcp 65001`.
2. Usa `runtime\node.exe`. Se só existir `runtime\montar.bat`, junta as partes. Sem `runtime`, usa o Node instalado e confere se tem `node:sqlite`. Sem `node_modules`, roda `npm install --omit=dev`.
3. **Atalhos:** cria "**Orcamentos BALANCAS.COM**" na **Área de Trabalho** e no **menu Iniciar** com PowerShell e `WScript.Shell`.
   - O atalho usa `WindowStyle 7` (janela preta minimizada) e o ícone `public\img\icone.ico`.
   - Grava a última pasta usada em `%LOCALAPPDATA%\Orcamentos BALANCAS.COM\ultima-pasta.txt`.
   - **Não deixa uma pasta nova e vazia tomar o atalho de uma pasta que já tem `dados\balancas.db`** (evita dividir os dados).
4. `set NODE_USE_ENV_PROXY=1` (o proxy do sistema vale para a consulta de CNPJ). Depois roda `"%NODE%" --no-warnings server.js`.
5. Em erro, mostra um `Popup` do WScript (a janela pode estar minimizada) e `pause`.

#### Servidor: `server.js`

- Express 5, `express.json({limit:'25mb'})`.
- **Backup a cada inicialização:** `VACUUM INTO` em `dados/backups/balancas-<data>.db`, guardando os 20 mais recentes.
- **`src/instancia.js`:**
  - porta própria **4980** gravada em `dados/servidor.json` (`{ "porta": 4980, "janela": "aplicativo" | "navegador" }`);
  - rota `GET /api/identidade` (`{app:'balancas-orcamentos', nome, versao, porta, pasta, enderecos, redes}`);
  - se a porta estiver ocupada, pergunta quem está nela:
    - se for o mesmo sistema e a mesma pasta, só abre a janela;
    - se for outra cópia, avisa e não abre;
    - se for outro programa, tenta a **próxima porta (até 30 tentativas: 4980–5009)** e grava a escolha;
  - também trata `EACCES` (porta reservada pelo Hyper-V ou WSL);
  - registra o PID em `dados/servidor.pid`.
- **`src/janela.js`:** abre em **modo `--app`** no navegador padrão, se for Edge, Chrome ou Brave (lê o ProgId de `UserChoice` ou `UserChoiceLatest` no registro). Senão usa o Edge. `"janela": "navegador"` abre numa aba comum.
- Variáveis: `PORT` (porta fixa), `HOST` (`0.0.0.0`), `DATA_DIR` (`./dados`), `NAO_ABRIR_NAVEGADOR=1` e `JANELA=navegador`.

#### Comportamento

- **Firewall:** o próprio Windows pergunta na primeira vez; o README manda permitir "redes privadas". Não há regra criada por script.
- **Atualização:** fechar a janela preta e **extrair o zip novo por cima da pasta**. A pasta `dados` é mantida, porque o zip não a contém.
- **Sem serviço e sem início automático:** o sistema só roda enquanto a janela preta estiver aberta.
- **Sem login:** não há autenticação. Qualquer um na rede acessa `http://IP:4980`.

### 4.3 Comparação e o que adotar

| Aspecto | BC Fichas Control | Orçamentos | Para o novo sistema |
|---|---|---|---|
| Modelo | Servidor na rede, sem ninguém logado | App local que abre janela própria | **Servidor** (como o BC Fichas): certificados são documentos da empresa, com vários usuários |
| Processo | Tarefa agendada (SYSTEM, AtStartup) + `.bat` em laço | Janela de console do usuário | Tarefa agendada (copiar `instalar-servico.ps1`) |
| Node | Distribuição inteira em `node\` (24.21.0, SHA-256) | Só `node.exe` em `runtime\` (24.21.0, SHA-256; partes com `certutil`) | Pasta `node\` (simples e com npm para o modo código-fonte) |
| Porta | `.env` `PORTA=3000`, `-Porta` | `dados/servidor.json` 4980 + fallback + `/api/identidade` | `.env` + `/api/identidade` para detectar conflito |
| Firewall | `New-NetFirewallRule`, perfis Private e Domain | Pergunta do Windows | `New-NetFirewallRule … -Profile Private,Domain -RemoteAddress LocalSubnet` |
| Atalhos | Menu Iniciar "Redefinir senha…" | Área de Trabalho + Menu Iniciar para abrir o sistema | Ambos: redefinir senha + "Abrir Certificados" (URL no navegador) |
| Atualização | Pasta separada + ATUALIZAR (cópia do banco, preserva `dados` e `.env`, volta atrás em erro) | Extrair por cima | ATUALIZAR do BC Fichas |
| Release | `v<versão>`, testes antes, `--clobber` | Tag única `pacote-windows`, sem testes, link fixo `latest` | BC Fichas com testes + link fixo `latest` |
| Proteção da pasta | `icacls` só SYSTEM e Administradores | nenhuma | `icacls` |

### 4.4 Portas em uso (para escolher a do novo sistema)

| Sistema | Porta | Situação | Onde está definido |
|---|---|---|---|
| BC Fichas Control (produção) | **3000/TCP** (padrão; `PORTA` no `.env`) | escuta em `0.0.0.0`, firewall Private e Domain. A mensagem de erro sugere **3001** como alternativa, e o README dá **8080** como exemplo de `-Porta` | `server/index.ts`, `.env.exemplo`, `comum.ps1#Ler-Porta` |
| BC Fichas Control (desenvolvimento) | **5173** (Vite) → proxy `/api` para a 3000 | só no computador do desenvolvedor | `vite.config.ts` |
| Orçamentos | **4980/TCP** (padrão) e, se ocupada, **4981…5009** (30 tentativas). Até a versão anterior usava **3000** (conflitava com o BC Fichas) | escuta em `0.0.0.0` | `src/instancia.js` (`PORTA_PADRAO = 4980`, `TENTATIVAS = 30`) |
| BC Fichas (.NET), módulo `rede`: "Painel no celular" | **8765/TCP** | só rede local (`remoteip=localsubnet`), nos tablets do evento | `rede/src/BCFichas.Core/Configuracao.cs` (`PortaPainel = 8765`) |
| BC Fichas (.NET), módulo `cartao`: ponte da maquininha | Bluetooth/SPP; `tcp://127.0.0.1:9123` só aparece como **exemplo de teste** | não é porta fixa | `cartao/src/BCFichas.Core/Pagamento/ConexaoPonte.cs` |
| BC Backup | nenhuma em produção (Electron, IPC). **5199** só no `npm run dev:web` | desenvolvimento | `vite.web.config.ts` |
| Site | 80/443 na HostGator | fora da rede local | — |

**Sugestão: porta 4850/TCP** para o sistema de certificados, pelos motivos abaixo:

- não é usada por nenhum sistema da empresa;
- fica fora da faixa de fallback do Orçamentos (4980–5009);
- fica longe de 3000, 3001, 5173, 5199, 8080 e 8765;
- fica abaixo da faixa dinâmica do Windows (49152–65535), onde o Hyper-V e o WSL costumam reservar portas.

Recomendações para a porta:

- Torne a porta configurável (`PORTA` no `.env` + `instalar-servico.ps1 -Porta`).
- Implemente um `GET /api/identidade` (como o Orçamentos) para detectar outro programa na porta.
- Use um **nome de cookie próprio com a porta** e um **cabeçalho CSRF próprio** (ex.: `x-bc-certificados: 1`).
- Use um nome de tarefa e de regra de firewall próprios (ex.: "BC Certificados").

---

## 5. Domínio de balanças (do Orçamentos), para o cadastro de equipamentos

### 5.1 Campos da OS e do equipamento

A tabela é `ordens` (`src/db.js`, migrações v1 e v2), e a tela é `public/js/paginas/ordem.js`, seção "1. Identificação do equipamento".

| Campo (coluna) | Rótulo na tela | Exemplo (placeholder) |
|---|---|---|
| `numero` | nº interno do checklist (sequencial, `UNIQUE`) | — |
| `numero_os` | **Nº da OS** (obrigatório; "gerado no sistema de ordens de serviço") | 12345 |
| `data_entrada` | Data de entrada | date |
| `tecnico` | Técnico (lista de `config.tecnicos[] = {nome, documento}`; "o documento aparece na OS impressa", Portaria Inmetro 457/2021) | — |
| `cliente_id`, `cliente_nome`, `cliente_tipo` (PF/PJ), `cliente_documento`, `cliente_cidade`, `cliente_telefone`, `cliente_email` | cliente (copiado para a OS) | — |
| **`equipamento`** | **Equipamento / marca / modelo** (texto livre) | "Toledo Prix 5 Plus 15 kg" |
| **`numero_serie`** | **Nº de série** | — |
| **`capacidade`** | **Capacidade** | "15 kg / 5 g" |
| **`pam`** | **PAM (portaria de aprovação do modelo)** | "Portaria Inmetro 236/2014" |
| **`selo`** | **Selo de reparo nº** | — |
| **`lacre1`, `lacre2`** | **Lacre 1 e Lacre 2 na entrada** | "Nº do lacre" |
| **`lacre_saida1`, `lacre_saida2`** | **Lacre 1 e Lacre 2 na saída** ("Balança que chega com dois lacres deve sair com dois lacres") | — |
| `lacres_aplicados` | (antigo, texto livre, migrado para os lacres de saída) | — |
| `acessorios` (JSON) + `acessorios_outros` | Acessórios recebidos: **Prato, Fonte/cabo, Bateria, Bobina/etiquetas** + "Outros…" | — |
| `defeito_relatado` | Defeito relatado / solicitação do cliente | — |
| `tensao_entrada` | Tensão de entrada: **110 V, Bivolt, 220 V, Não identificada** | — |
| `tensao_saida` | Tensão testada na saída: **110 V, Bivolt, 220 V** | — |
| `checklist` (JSON `[{item, entrada, saida, obs}]`) | Checklist funcional **C / NC / N/A** na entrada e após a manutenção. Um NC exige observação | — |
| `servico_executado`, `observacoes` | — | — |
| `desconto`, `validade_dias` (10), `prazo_conclusao`, `formas_pagamento` (JSON), `condicoes`, `garantia`, `orcamento_enviado_em` | orçamento | — |
| `status`, `data_situacao` | situação (abaixo) | — |

As outras tabelas são `ordem_itens` (`tipo` serviço ou peça, `descricao`, `nome_interno`, `valor_unitario`, `quantidade`, `posicao`), `historico`, `clientes` (`tipo` PF/PJ, `nome`, `documento`, `telefone`, `whatsapp`, `email`, `endereco`, `cidade`), `servicos` (`nome`, `nome_os`, `valor`) e `pecas` (`nome`, `codigo`, `valor`).

**Status da OS** (`src/ordens.js`):

```js
const STATUS = { em_analise: 'Em análise', aguardando_aprovacao: 'Aguardando aprovação', aprovada: 'Aprovada',
  aguardando_peca: 'Aguardando peça', concluida: 'Liberada', entregue: 'Entregue', recusada: 'Recusada' }
```

### 5.2 Checklists (`src/config-padrao.js`)

**Itens padrão** (vieram da planilha `Checklist_Tecnico_Orcamento_revisado.xlsm`):

1. Liga e inicializa normalmente
2. Pesagem correta / dentro da tolerância
3. Peso estabilizado, sem oscilações
4. Displays do operador e do cliente
5. Teclado e teclas de função
6. Bateria segura carga e recarrega
7. Impressão, avanço e parada da etiqueta
8. Comunicação serial / USB / rede / sistema
9. Cadastro de produtos e chamada por PLU
10. Venda de produto e venda de diversos
11. Carcaça, prato, cabos, conectores e pés
12. Teste em 220 V (quando aplicável)

**Itens sugeridos (Portaria Inmetro 157/2022, adicionáveis em Configurações):** são os mais próximos de um **ensaio de calibração** e servem de ponto de partida para o novo sistema.

- Identificação conferida (nº de série, PAM e plaqueta legível)
- Lacres e selo do IPEM íntegros na entrada
- Nivelamento (bolha) e pés niveladores
- Retorno ao zero e função tara
- **Excentricidade** (≈ 1/3 da capacidade nos cantos)
- **Repetibilidade** (3 pesagens com ≈ 50% da capacidade)
- **Pesagem com pesos-padrão** (mínimo, 50% e máximo)
- Etiqueta: preço × peso = total e código de barras lido no PDV

O rodapé do checklist impresso diz "Checklist técnico de oficina • Revisão 1.0 • Documento interno".

### 5.3 Tipos de balança

- **Por mão de obra, no Orçamentos** (migração v2):

  | Serviço | Valor |
  |---|---|
  | Mão de obra – balança com compressor | R$ 190 |
  | Mão de obra – balança sem compressor | R$ 150 |
  | Mão de obra – PET | R$ 120 |

  Os três saem na OS como "**Limpeza, regulagem, calibração e lacração**". Também há "Formatação" (R$ 120) e peças (Cabeçote Térmico Toledo R$ 980, Cabeçote Térmico Filizola R$ 300, Teclado Prix 5 Plus Preto 32 kg R$ 280, Teclado Filizola R$ 250).
- **Por categoria, no site** (`site/assistencia.html` e `compartilhado/dados/produtos.js`, categoria `balancas`):
  - **A** Com impressora de etiquetas (açougue, padaria, frios);
  - **B** Computadoras e Pesadoras (balcão, hortifrúti, pet shop);
  - **C** De checkout (embutidas no caixa e integradas ao PDV);
  - **D** Industriais e plataformas (conferência);
  - **E** Médico-hospitalares (farmácias, clínicas, academias).
- **Marcas atendidas:** Toledo, Balmak, Filizola, Urano, Welmy, Micheletti e outras.
- **Catálogo com modelos e capacidades** (`site-balancass/compartilhado/dados/produtos.js`, 20 balanças, campo `especificacoes [["Capacidade", "32 kg (2 g até 6 kg / 5 g até 15 kg / 10 g até 32 kg)"], …]`):

  | Categoria | Modelos |
  |---|---|
  | Com etiqueta | Toledo Prix 7E, 7T, 6, 5 Plus, 4 Trend, 4 Uno, 4 Due; Balmak EDGE (33 kg); Urano BA37 (31 kg) |
  | Computadoras | Toledo Prix 3 Fit, 3 Plus; Balmak ONE (15 kg/5 g ou 30 kg multi-faixa) |
  | Pesadoras | Toledo Prix 9094 Plus; Balmak ONE Pesadora |
  | Checkout | Toledo Prix 8217; Balmak BCK-30 |
  | Industriais | Toledo Prix 2098/2098C; Balmak K-300 (300 kg) |
  | Médico-hospitalar | Toledo Prix 2096PP; Balmak BK-200F |

  Serve para alimentar um autocompletar de marca e modelo.

### 5.4 Proposta de reaproveitamento no cadastro de equipamentos

A partir dos campos acima e do `Maquina` do BC Fichas Control (`identificacao` única sem diferenciar maiúsculas, `modelo`, `numeroSerie`, `dataAquisicao`, `status`, `observacoes`), um equipamento do novo sistema poderia ter:

| Campo | Origem |
|---|---|
| `clienteId` | BC Fichas / Orçamentos |
| `identificacao` ou TAG/patrimônio do cliente (única por cliente) | ideia do `Maquina.identificacao` |
| `tipo` (A–E acima) | site |
| `marca`, `modelo` (autocompletar com o catálogo) | `equipamento` do Orçamentos, quebrado em campos |
| `numeroSerie` | Orçamentos |
| `capacidadeMaxima` + `divisao` (com suporte a **multi-faixa**, ex.: 2 g até 6 kg / 5 g até 15 kg / 10 g até 32 kg) | Orçamentos `capacidade` + catálogo |
| `pam` (portaria de aprovação do modelo) | Orçamentos |
| `selo`, `lacres` (entrada e saída) | Orçamentos, se o certificado também registrar a lacração |
| `tensao` | Orçamentos |
| `localInstalacao`, `observacoes`, `status` (ativo/desativado) | BC Fichas |

Campos metrológicos típicos de certificado, como classe de exatidão, `e` ≠ `d`, pesos-padrão usados com a rastreabilidade, incerteza, temperatura e umidade, **não existem em nenhum repositório**. Precisam vir da pesquisa normativa (outros documentos de `docs/pesquisa`).

---

## 6. Arquivos que valem ser copiados ou adaptados quase integralmente

Legenda: **C** = copiar quase igual; **A** = adaptar (nomes, textos, domínio); **I** = só como inspiração.

### 6.1 Do BC Fichas Control (`/home/user/rafaeltessaro/bc-fichas-control/`)

| Arquivo | Como | Justificativa |
|---|---|---|
| `src/index.css` | **C** | Tokens claro e escuro, `@theme inline`, `@custom-variant dark`, Inter local, foco, `.tnum`, `.scroll-fino`, movimento reduzido. É a base da identidade comum. Acrescentar `--brand-action` (AA) |
| `src/assets/fonts/*` (2 woff2 + LICENSE) | **C** | Inter local, funciona sem internet |
| `src/assets/timbrado.jpg` + `scripts/timbrado/*` (script, original, Poppins, README) | **C** | Papel timbrado já com o endereço atual e um gerador determinístico para mudanças futuras (e-mail, IPEM etc.) |
| `index.html` | **A** | Script anti-flash do tema, `theme-color`, `lang="pt-BR"`. Trocar o nome da chave do `localStorage` |
| `src/main.tsx` | **C** | Recarrega no `vite:preloadError` depois de atualizar o servidor |
| `src/components/ui/{Button,Card,Badge,Form,Modal,Table,Feedback,Misc,Combobox}.tsx` | **C** | Biblioteca de componentes pronta (variantes, acessibilidade, animação, CurrencyInput e NumberInput) |
| `src/lib/{cn,storage,useCores,hoje,csv}.ts` e partes de `format.ts` | **C** | Utilitários: `armazenamentoSeguro`, `baixarArquivo`, `nomeArquivoSeguro`, `moeda`, `dataCurta`, `normalizar`, `iniciais` |
| `src/store/ui.ts` | **C** | Tema (claro, escuro, sistema), menu recolhido e toasts |
| `src/components/layout/{Layout,Sidebar,CommandPalette,nav.ts,AvisoConexao,TelaConexao}.tsx` | **A** | Esqueleto do app (menu por nível, cabeçalho, busca Ctrl+K, aviso de conexão). Trocar os itens, a ação primária ("Novo certificado") e os grupos da paleta |
| `src/App.tsx` | **A** | HashRouter, `RotaPermitida`, telas de sessão por cima, `MotionConfig`, aplicação do tema |
| `src/components/sessao/*`, `src/pages/Entrar.tsx`, `src/components/usuarios/*`, `src/pages/Usuarios.tsx`, `src/store/sessao.ts` | **A** | Login, troca obrigatória de senha, sessão encerrada, gestão de usuários e auditoria (só renomear "BC Fichas") |
| `src/lib/api.ts` | **A** | `requisitar`/`ErroApi`/tempo limite/cabeçalho CSRF, `enviarArquivo` com progresso, `conectarTempoReal` (SSE com aba escondida e `semSessao`). Trocar os endpoints de domínio |
| `src/store/dados.ts` | **I/A** | Padrão de store com revisão, fila, `mesclar` por versão e reconexão |
| `src/lib/pdf.ts` (`carregarTimbrado`, cores, `garantirEspaco`) + `src/lib/pdfTexto.ts` | **C/A** | Aplicação do timbrado em cada página e limites seguros (60/52/262 mm). `txt()` se ficar com fontes padrão |
| `src/lib/pdfRecibo.ts`, `src/lib/pdfContrato.ts` | **I** | Exemplos de layout (título com filete verde, caixa de valor, assinatura, documento congelado e "CANCELADO") |
| `src/lib/consultas.ts`, `src/components/ClienteFormModal.tsx` | **A** | Preenchimento por CNPJ e CEP no formulário (`mesclarConsulta`, avisos de situação, atraso de 400 ms, alfanumérico) |
| `src/lib/envio.ts`, `src/components/EnviarDocumentoModal.tsx` | **A** | Envio por e-mail (PDF em base64) e WhatsApp (`wa.me` + baixar o PDF) |
| `src/components/ErroInesperado.tsx` | **C** | Error boundary |
| `shared/documentos.ts` (+ teste) | **C** | CPF, CNPJ (inclusive o **alfanumérico**), CEP e telefone: validação e máscaras |
| `shared/id.ts` | **C** | UUID v4 que funciona em HTTP na rede local |
| `shared/permissoes.ts` | **A** | Padrão de matriz única de permissões (servidor e tela) |
| `shared/usuarios.ts`, `shared/senhasComuns.ts` | **A** | Login, política de senha e auditoria. **Trocar o teste de "fichas"** pelo nome do novo sistema |
| `shared/tipos.ts` (blocos de usuário, sessão, auditoria e `MensagemTempoReal`) | **A** | Contratos de tipos compartilhados |
| `shared/extenso.ts` | **I** | Valor por extenso (se o certificado ou o orçamento precisar) |
| `server/iniciar.mjs`, `server/index.ts` | **C** | Checagem da versão do Node, `chdir`, `.env`, mensagens de porta ocupada, sinais, erro fatal |
| `server/app.ts` | **A** | Host permitido (DNS rebinding), CSRF, cabeçalhos, tratamento de erros, `/api/saude`, estáticos com cache e `build`, tarefas e fechamento |
| `server/db.ts` | **C** | `node:sqlite` com WAL, `busy_timeout`, migrações por `user_version`, `transacao` aninhável e `meta`. Trocar as migrações |
| `server/erros.ts`, `server/contexto.ts`, `server/extensoes.ts` | **C** | Infraestrutura |
| `server/repositorio.ts` | **I** | Padrão de documento JSON + `versao` (409) + `revisao` + publicação. Reescrever para certificados |
| `server/acesso.ts` | **A** | Tabela de acesso que falha fechada, cookie (**trocar o nome**), regras de auditoria |
| `server/senha.ts`, `server/limiteTentativas.ts`, `server/usuarios.ts`, `server/rotas/usuarios.ts` | **C/A** | Autenticação completa, testada e sem dependência nativa |
| `server/tempoReal.ts` | **C** | SSE com batimento, dono da conexão e build |
| `server/backup.ts` | **A** | Cópias `VACUUM INTO` por motivo (trocar o prefixo `bc-fichas_`) |
| `server/consultas/*` (+ `__fixtures__`, `consultas.test.ts`) + `server/rotas/consultas.ts` | **C** | CNPJ e CEP com fallback, cache, normalização de texto e CNPJ alfanumérico. Trocar o `User-Agent`. Eventualmente mapear a inscrição estadual da CNPJ.ws |
| `server/email.ts` | **C/A** | SMTP com a senha só no servidor, regra contra exfiltração, limites e erros em português. Trocar assunto e texto do teste. Talvez permitir mais de um anexo |
| `server/rotas/anexos.ts` | **I/A** | Upload cru com progresso, nomes seguros, "removidos" recuperáveis (útil para anexar o certificado do padrão, fotos ou o PDF assinado) |
| `server/ferramentas/copiar-banco.mjs`, `server/ferramentas/redefinir-senha.mjs` | **C/A** | Usados pelos scripts do Windows (cópia consistente, administrador, transplantar) |
| `server/auxiliaresTeste.ts` | **A** | App de teste com login real |
| `INSTALAR.bat`, `ATUALIZAR.bat`, `REDEFINIR-SENHA.bat` | **C/A** | Elevação robusta, checagem de zip e rede, `Unblock-File` |
| `deploy/windows/comum.ps1`, `instalar-servico.ps1`, `atualizar.ps1`, `desinstalar-servico.ps1`, `restaurar-copia.ps1`, `redefinir-senha.ps1`, `iniciar-servidor.bat` | **A** | Tarefa agendada SYSTEM, firewall, `icacls`, atalho, administrador, atualização com volta atrás e restauração. Trocar `NomeTarefa`, a porta padrão, `bc-fichas.db`, a pasta do Menu Iniciar e os textos. **Acrescentar `-RemoteAddress LocalSubnet`** |
| `deploy/linux/bc-fichas.service` | **A** | systemd |
| `scripts/empacotar-windows.sh` | **A** | Pacote com Node portátil e SHA-256, recusa de módulo nativo, `pacote.json`, `COMO-INSTALAR.txt` |
| `.github/workflows/pacote-windows.yml` | **A** | Testes e release por versão. Considerar também um link fixo `latest` como o do Orçamentos |
| `package.json` (scripts, `engines`, `imports #shared/*`), `tsconfig*.json`, `vite.config.ts`, `.oxlintrc.json`, `.prettierrc.json`, `.gitattributes`, `.gitignore`, `.env.exemplo` | **C/A** | Mesmo padrão técnico (CRLF para `.ps1` e `.bat` é essencial) |

### 6.2 Do Orçamentos (`/home/user/rafaeltessaro/balan-as.com---or-amentos/`)

| Arquivo | Como | Justificativa |
|---|---|---|
| `src/config-padrao.js` (checklist, `itensSugeridos` da Portaria 157/2022, acessórios, tensões, técnicos com documento, `empresa.permissionaria`) | **A** | Domínio de balanças pronto para os ensaios e o cadastro |
| `src/instancia.js` | **A** (portar para TypeScript) | `/api/identidade` + detecção de quem está na porta, `EACCES` (Hyper-V/WSL), PID: evita conflito entre os sistemas da empresa |
| `src/pdf/orcamento.js` | **I/A** | Se o PDF for gerado no servidor: pdfmake com timbrado em `background`, políticas de acesso a arquivos e quebras com `headerRows` e `dontBreakRows`. Usar o **timbrado atualizado** do BC Fichas, não os PNG com "Consolação" |
| `public/imprimir/checklist.*` | **I** | Folha A4 em HTML para impressão (checklist em branco ou preenchido) |
| `public/css/app.css` (tokens `--verde-acao`, `--st-*`, alvos de toque `pointer: coarse`) | **I** | Soluções de contraste e de uso em tablet que faltam no BC Fichas |
| `src/janela.js` | **I** | Só se o novo sistema também for aberto como "aplicativo" no servidor |
| `public/img/logo-completo.png` | **I** | Logotipo horizontal com o subtítulo (para o e-mail ou a tela de entrada, se não usar o SVG) |
| `scripts/empacotar-windows.js` (`--dividir` + `montar.bat` com `certutil`) | **I** | Se precisar mandar o pacote por e-mail ou WhatsApp em partes de menos de 30 MB |

**Não copiar:**

- o backup JSON com a senha SMTP em claro;
- o `restaurar` que monta SQL com nomes de coluna vindos do arquivo;
- a ausência de login.

### 6.3 Do site (`/home/user/rafaeltessaro/site-balancass/`)

| Arquivo | Como | Justificativa |
|---|---|---|
| `compartilhado/img/logo/balancas-icone.svg`, `-claro.svg`, `-branco.svg`, `-preto.svg` | **C** | Logo vetorial oficial nas 4 variantes (melhor que o PNG de 128 px do BC Fichas, sobretudo no tema escuro) |
| `compartilhado/dados/empresa.js` | **I** | Fonte dos dados da empresa (com as divergências do §2.3) |
| `compartilhado/dados/produtos.js` (categoria `balancas`) | **I** | Lista de marcas, modelos e capacidades para o autocompletar |
| `site/img/logo-512.png` | **C** | Ícone PWA e e-mail |

---

## 7. Pontos de atenção e recomendações

1. **Divergências de dados da empresa** a confirmar com o dono antes do primeiro certificado:
   - e-mail: recepcao@balancass.com × balancas.com@gmail.com;
   - subtítulo: "Equipamentos e Sistemas" × "Automação Comercial";
   - bairro no Orçamentos: "Consolação" × "Boa Morte";
   - **inscrição estadual** (inexistente nos repositórios);
   - número de credenciamento ou permissionária no IPEM-SP;
   - nome e documento do técnico responsável. O site cita **Maurício Ritter, técnico de balanças**.
2. **Contraste do botão primário:** o BC Fichas Control reprova o AA com branco sobre `#0b9e4f` (3,49:1). Usar `#078541` (claro) e `#08A951` com texto escuro (escuro), como o Orçamentos.
3. **Logo no tema escuro:** usar o `balancas-icone-claro.svg` em vez do PNG com anel cinza.
4. **Isolamento entre os sistemas no mesmo servidor:**
   - porta própria (sugestão 4850);
   - cookie `<prefixo>_sessao_<porta>`;
   - cabeçalho CSRF próprio;
   - chaves de `localStorage` e `BroadcastChannel` próprias;
   - nome de tarefa, de regra de firewall e de pasta do Menu Iniciar próprios;
   - pasta de instalação própria (ex.: `C:\BC-Certificados`);
   - `/api/identidade`.
5. **Firewall:** restringir a `LocalSubnet` além dos perfis Private e Domain.
6. **PDF de certificado:** gerar e **guardar o PDF ou os dados congelados no servidor** (como o contrato do BC Fichas guarda `dados` no momento da emissão), com numeração sequencial em `meta`, para reemitir idêntico. Avaliar o pdfmake no servidor com o `timbrado.jpg` atualizado.
7. **Testes no CI:** manter o padrão do BC Fichas (`npm test` antes de empacotar) e acrescentar `npm run lint` e `tsc -b` explícitos.
