# 04 — Direção de design e UX

- **Projeto:** sistema interno de emissão de certificados de calibração de balanças — Balanças.com
- **Stack-alvo:** React 19 · Tailwind CSS v4 · lucide-react · rede local da empresa
- **Data:** 14/10/2026
- **Escopo:** direção visual, tokens, layout, componentes, UX da entrada de leituras, design do certificado em PDF, wireframes, motion e acessibilidade.
- **Fora de escopo:** identidade da marca (cores e logo vêm de outro levantamento). Aqui a cor de marca é um **placeholder azul** (`oklch(0.545 0.19 258)` ≈ `#136adc`) e todo o sistema é construído para **trocar a marca sem quebrar contraste** (seção 1.3). A **seção 1.12** aplica o método ao **verde oficial `#019F42`** identificado no levantamento 05.

---

## Sumário

0. [Princípios e o que aprendemos com as referências](#0-princípios-e-o-que-aprendemos-com-as-referências)
1. [Tokens de design](#1-tokens-de-design)
2. [Padrões de layout](#2-padrões-de-layout)
3. [Componentes](#3-componentes)
4. [UX da entrada de dados de calibração](#4-ux-da-entrada-de-dados-de-calibração)
5. [Design do certificado em PDF](#5-design-do-certificado-em-pdf)
6. [Wireframes ASCII](#6-wireframes-ascii)
7. [Microinterações, motion e acessibilidade](#7-microinterações-motion-e-acessibilidade)
8. [Checklist de implementação e decisões em aberto](#8-checklist-de-implementação-e-decisões-em-aberto)
9. [Fontes](#9-fontes)

---

## 0. Princípios e o que aprendemos com as referências

### 0.1 Cinco princípios de design

1. **Calma com densidade.** Muita informação, pouco ruído: cinzas neutros, uma cor de marca usada com parcimônia, bordas suaves, poucos separadores. É o rumo do refresh do Linear de 2026, que deixou a navegação "alguns pontos mais apagada" para o conteúdo se destacar e reduziu bordas e separadores.
2. **Os números são os protagonistas.** Leituras, erros e incertezas usam algarismos tabulares, ficam alinhados à direita e têm sempre a mesma quantidade de casas decimais na coluna. Cor só onde há significado (EMA, vencimento, status).
3. **Teclado primeiro, toque possível.** O escritório usa teclado (⌘K/Ctrl+K, Enter/Tab na planilha). O técnico usa tablet: alvos de toque de 44 px, teclado numérico e ações fixas no rodapé.
4. **Confiança metrológica visível.** Todo valor calculado mostra de onde veio (orçamento de incerteza, padrões usados, regra de decisão). Padrão vencido não entra. Certificado emitido não muda; corrige-se com uma revisão.
5. **Nada se perde.** Salvamento automático contínuo, cópia local, recuperação de rascunho e nenhuma tecla (Esc, voltar do navegador) que descarte dados em silêncio.

### 0.2 Referências de produto: o que adotar e o que evitar

| Referência | Adotar | Evitar |
|---|---|---|
| **Linear** | Densidade calma; sidebar mais apagada que o conteúdo (refresh de mar/2026); temas gerados a partir de **3 variáveis** (base, acento, contraste) em espaço **LCH**, no lugar de 98 variáveis; Inter Display nos títulos e Inter no resto; navegação por teclado (⌘K, sequências tipo `G` + letra); bordas arredondadas de baixo contraste. | Atalhos que ninguém descobre (sempre exibir a dica no tooltip e no ⌘K); cinza frio e azulado demais (o próprio Linear migrou para um cinza menos saturado). |
| **Vercel Dashboard / Geist** | Cinzas com **papéis explícitos**: 1–3 fundos de componente (normal, hover, ativo), 4–6 bordas (normal, hover, ativo), 7–8 fundo de alto contraste, 9 texto secundário, 10 texto primário. "Materiais" com raio de **6 px** (superfícies base) e **12 px** (menus, modais); `label-13` com algarismos tabulares; sidebar redimensionável e recolhível (redesign recente da navegação, com barra flutuante inferior no mobile). | Sombras ornamentais, brilhos, vidro e gradientes. A própria diretriz do Geist os rejeita. |
| **Stripe Dashboard** | Cor construída em espaço perceptual (CIELAB) com **níveis consistentes entre matizes**: cores a 5 níveis de distância garantem contraste para texto pequeno e a 4 níveis para ícones e texto grande. Os badges subiram um nível de fundo e de texto para se diferenciarem. Filtros de tabela como **chips**. | Cores de status idênticas para coisas diferentes. |
| **Attio** | Tabela tipo planilha. **Células preenchidas automaticamente ("enriched") em lilás**, que adotamos para os campos vindos de CNPJ e CEP. Página de registro com abas e um bloco de "destaques" no topo. | Configurabilidade excessiva (o nosso domínio é fixo). |
| **shadcn/ui** | Tokens semânticos em `oklch` (`background`, `card`, `popover`, `muted`, `accent`, `border`, `input`, `ring`, `sidebar-*`) mapeados com `@theme inline`. **Sidebar** com grupos, modo `collapsible="icon"`, atalho **⌘B/Ctrl+B**, largura de 16rem (18rem no mobile). Data table com TanStack Table. `Command` (cmdk). Toasts com Sonner. | Copiar o tema neutro "puro" (`oklch(x 0 0)`), que é sem personalidade. Vamos tingir os cinzas com o matiz da marca. |
| **Radix Themes / Colors** | Escala de **12 passos com papéis**: 1–2 fundo do app, 3–5 componente (normal, hover, pressionado), 6–8 bordas (sutil, interativa, forte/foco), 9–10 sólido (normal, hover), 11–12 texto (baixo e alto contraste). Os passos 11 e 12 garantem **APCA Lc 60 e Lc 90** sobre o passo 2. **Cinzas "naturais"** pareados ao matiz: slate para azul, sage para verde, mauve para vermelho e roxo, sand para amarelo e laranja. Cores **alfa** para sobreposições. | Customizar a escala Radix à mão. A própria Radix avisa que isso quebra a acessibilidade; se a marca não cabe, gera-se uma escala própria ao lado. |
| **Tailwind Plus / Catalyst** | `SidebarLayout` (vira menu no mobile) e `StackedLayout`; projetado em torno da **Inter**; ícones de **16 px** nos componentes e **20 px** nos itens de navegação; Headless UI; *description lists*; formulários de configurações em duas colunas. | Usar o kit "cru": a cara padrão do Tailwind é reconhecível demais. |
| **Material 3** | **Superfícies tonais** em vez de sombras no escuro: `surface-container-lowest … highest` usam os tons 100/96/94/92/90 no claro e 4/10/12/17/22 no escuro (`surface` = 98 no claro e 6 no escuro). `primary` usa o tom 40 no claro e o 80 no escuro. **Níveis de contraste** (padrão, médio, alto). Tokens de motion: 50–1000 ms; *emphasized* `cubic-bezier(0.2, 0, 0, 1)`. | Componentes com cara de Android (FAB, ripple). |
| **Material (dark theme)** | Fundo **#121212** em vez de preto puro, porque no cinza escuro se percebe sombra e profundidade. Texto branco com **15,8:1** sobre esse fundo. Elevação por **superfícies mais claras**. Cores dessaturadas no escuro. | Usar preto `#000`: tem contraste extremo e "halo" no texto, além de ninguém perceber a elevação. |
| **Apple HIG** | Contraste **mínimo de 4,5:1** e alvo de **7:1** para texto pequeno em cores próprias; fundos **base × elevados** (no escuro, os elevados são mais claros); cores semânticas em vez de valores fixos; respeitar a preferência do sistema e testar os dois modos (incluindo "Aumentar contraste"). | Forçar um modo; usar imagens e logotipos sem variante escura. |

### 0.3 O que o domínio de calibração exige

| Fonte | O que observamos | Implicação de UX para nós |
|---|---|---|
| **Beamex CMX** | Certificados configuráveis, filtros de vencimento para agendar, histórico/tendência de deriva, conformidade com ISO 17025 e 21 CFR Part 11. | Lista de vencimentos filtrável no painel; histórico de calibrações por balança, com tendência do erro. |
| **Fluke MET/TEAM** | Ativos com histórico de OS, rastreabilidade, clientes e locais; alertas automáticos; certificados personalizados; acesso do cliente. | Balança como entidade central (histórico, local, cliente); alertas de vencimento. |
| **Qualer** | Próxima data de serviço definida pelo resultado; alerta de qualificações e certificados vencidos; gestão de padrões de referência; motor de incerteza; etiquetas. | Gestão de padrões com vencimento e **bloqueio de uso**; cálculo de incerteza embutido; etiqueta opcional para a balança. |
| **Softwares brasileiros** (Metroex, Calibre.Software, Cali, Qualyteam, Presys, Calibra Fácil) | Incerteza pelo GUM, emissão automática, assinatura eletrônica/ICP-Brasil, controle de prazos. O Calibra Fácil (código aberto) segue **rascunho → execução → revisão técnica → aprovação**, mantém **versões aprovadas imutáveis com emendas no histórico** e usa **QR code para uma página pública de verificação**. | Estados de documento claros; revisão por segunda pessoa (opcional); QR de autenticidade; assinatura digital opcional. |
| **ISO/IEC 17025:2017, 7.8** | Conteúdo mínimo: título, laboratório, cliente, item, datas, resultados com unidade, incerteza, rastreabilidade e quem autoriza. **Identificação do fim do documento** (o "página X de Y" é boa prática). **Não recomendar intervalo de calibração** salvo acordo com o cliente. **Emendas** como novo documento que identifica o original. Resultados **antes e depois de ajuste**. Regra de decisão quando há declaração de conformidade. | Rodapé "Página X de Y" e marca "Fim do certificado"; campo "próxima calibração" só com acordo do cliente; fluxo **Revisar = novo certificado que substitui o anterior**; tabelas "antes do ajuste / após ajuste"; regra de decisão explícita. |
| **EURAMET cg-18 v4.0** | Repetibilidade com **≥ 5 aplicações** (≥ 3 se a carga for ≥ 100 kg). Erro de indicação com **≥ 5 cargas** distribuídas (0 ou Min, 25, 50, 75 e 100 % da Max). Excentricidade em **5 posições** (centro, frente-esquerda, fundo-esquerda, fundo-direita, frente-direita) com cerca de **Max/3**. O §8 lista o conteúdo recomendado do certificado, incluindo k e a probabilidade de abrangência. | Etapas do wizard espelham o guia; quantidades mínimas validadas; diagrama interativo da plataforma na excentricidade. |
| **Portaria Inmetro 157/2022** | EMA por classe (I, II, III, IIII) em múltiplos de **e**, em faixas de carga (Tabela 5). Em serviço, o EMA é **o dobro** do da verificação. | EMA calculado por linha a partir de classe, e e critério; alerta visual quando o erro ultrapassa o EMA. Os valores exatos e o critério ficam a cargo do levantamento técnico. |

---

## 1. Tokens de design

### 1.1 Arquitetura dos tokens

Três camadas, como em shadcn/ui, Radix e Geist:

| Camada | Exemplos | Quem usa | Muda com o tema? |
|---|---|---|---|
| **Primitivos** | `--brand-50…950`, `--gray-50…950` | Só a camada semântica (e gráficos) | Não |
| **Semânticos** | `--bg`, `--surface`, `--fg-muted`, `--border`, `--primary`, `--success-subtle` | **Todos os componentes** (`bg-surface text-fg border-border`) | **Sim** (claro, escuro e alto contraste) |
| **De componente** | `--row-h`, `--control-h`, `--cell-px` | Tabela, inputs, planilha | Sim (densidade e toque) |

Regras:

- Componentes **nunca** usam primitivos nem cores do Tailwind (`bg-blue-600`, `text-zinc-500`). Usam só utilitários semânticos. Assim a troca de marca, de tema ou de contraste acontece em um único arquivo.
- O tema é um atributo no `<html>`: `data-theme="light|dark"` (resolvido a partir de claro, escuro ou sistema), `data-contrast="high"` (opcional) e `data-density="compact"` (opcional).
- Os valores são escritos em **OKLCH**, que é perceptualmente uniforme: o mesmo L parece igualmente claro em qualquer matiz. É o que o Linear adotou (LCH) e o que a Stripe faz com CIELAB. Cada valor traz o hex equivalente em comentário. Todos os contrastes abaixo foram **calculados** (WCAG 2.x), não estimados.

### 1.2 Escala neutra: superfícies, bordas e texto

Os cinzas são **levemente tingidos com o matiz da marca** (h = 255, croma ≤ 0,016), o "par natural" da Radix (slate para azul). Se a marca oficial for verde, use h ≈ 150 (sage). Se for vermelha ou roxa, h ≈ 300 a 20 (mauve). Se for amarela ou laranja, h ≈ 70 (sand), com croma ≤ 0,010 para não ficar "barrento", como o Linear observou.

#### Tema claro

| Token | Papel | OKLCH | Hex | Contraste relevante |
|---|---|---|---|---|
| `--bg` | Fundo do app: canvas, sidebar, topbar | `oklch(0.982 0.003 255)` | `#f8f9fb` | — |
| `--surface` | Painel de conteúdo e cards | `oklch(1 0 0)` | `#ffffff` | — |
| `--surface-raised` | Card elevado (hover, cabeçalho fixo, barra de ações) | `oklch(1 0 0)` + `shadow-sm` | `#ffffff` | No claro, a elevação vem da sombra |
| `--surface-overlay` | Popover, menu, modal, drawer, ⌘K | `oklch(1 0 0)` + `shadow-md/lg` | `#ffffff` | — |
| `--surface-sunken` | Poço: células calculadas, cabeçalho de tabela, área de upload | `oklch(0.972 0.004 255)` | `#f4f6f8` | — |
| `--muted` | Preenchimento sutil: chips, trilho, avatar | `oklch(0.962 0.005 255)` | `#f0f3f6` | — |
| `--hover` | Sobreposição de hover (funciona sobre qualquer superfície) | `oklch(0.215 0.012 255 / 0.045)` | — | — |
| `--press` | Sobreposição pressionada | `oklch(0.215 0.012 255 / 0.08)` | — | — |
| `--active` | Item de navegação ativo | `oklch(0.93 0.007 255)` | `#e5e8ed` | — |
| `--border-subtle` | Separador de linhas, divisórias internas | `oklch(0.94 0.005 255)` | `#e9ebee` | — |
| `--border` | Borda de card, painel e popover | `oklch(0.905 0.007 255)` | `#dde0e4` | 1,32:1 (decorativa) |
| `--border-strong` | Borda de controles secundários, hover de card | `oklch(0.84 0.010 255)` | `#c6cbd1` | 1,63:1 |
| `--input` | Borda de input, select, checkbox | `oklch(0.80 0.012 255)` | `#b9bec6` | 1,87:1 (3,3:1 no alto contraste) |
| `--input-hover` | Hover de input | `oklch(0.72 0.014 255)` | `#9fa5ad` | 2,48:1 |
| `--fg` | Texto primário e ícones ativos | `oklch(0.215 0.012 255)` | `#161a1f` | **17,5:1** no surface e **16,6:1** no bg |
| `--fg-muted` | Texto secundário, rótulos de coluna, ícones | `oklch(0.495 0.016 255)` | `#5c626b` | **6,2:1** no surface e **5,8:1** no bg |
| `--fg-subtle` | Terciário: placeholder, metadados, unidades | `oklch(0.545 0.015 255)` | `#6a7179` | **4,9:1** no surface e **4,7:1** no bg (AA) |
| `--fg-disabled` | Texto desabilitado (isento de contraste na WCAG) | `oklch(0.70 0.010 255)` | `#9a9fa5` | 2,7:1 |

#### Tema escuro (sem preto puro)

O canvas fica em L 0,18, praticamente o `#121212` do Material (L 0,182) e o `slate1` da Radix (L 0,179). Cada camada sobe de **+0,02 a +0,03 em L**, como os containers tonais do Material 3 (tons 6, 10, 12, 17, 22) e os fundos "elevados" mais claros da Apple.

| Token | Papel | OKLCH | Hex | Contraste relevante |
|---|---|---|---|---|
| `--bg` | Canvas, sidebar, topbar | `oklch(0.18 0.006 255)` | `#101214` | — |
| `--surface` | Painel de conteúdo e cards | `oklch(0.21 0.007 255)` | `#16181c` | — |
| `--surface-raised` | Card elevado, cabeçalho fixo | `oklch(0.238 0.008 255)` | `#1c1f23` | — |
| `--surface-overlay` | Popover, menu, modal, drawer, ⌘K | `oklch(0.258 0.009 255)` | `#212428` | — |
| `--surface-sunken` | Poço: células calculadas, cabeçalho de tabela | `oklch(0.192 0.006 255)` | `#121417` | — |
| `--muted` | Chips, trilhos | `oklch(0.255 0.008 255)` | `#202327` | — |
| `--hover` | Sobreposição de hover | `oklch(0.952 0.003 255 / 0.06)` | — | — |
| `--press` | Sobreposição pressionada | `oklch(0.952 0.003 255 / 0.10)` | — | — |
| `--active` | Item de navegação ativo | `oklch(0.305 0.012 255)` | `#2b2f35` | — |
| `--border-subtle` | Separadores | `oklch(0.265 0.008 255)` | `#232529` | — |
| `--border` | Bordas de card e painel | `oklch(0.31 0.009 255)` | `#2d3135` | 1,36:1 |
| `--border-strong` | Controles secundários | `oklch(0.385 0.010 255)` | `#404449` | 1,81:1 |
| `--input` | Borda de input | `oklch(0.405 0.011 255)` | `#45494f` | 1,96:1 (≥ 3:1 no alto contraste) |
| `--input-hover` | Hover de input | `oklch(0.48 0.012 255)` | `#595e64` | — |
| `--fg` | Texto primário (não branco puro, para evitar halo) | `oklch(0.952 0.003 255)` | `#eeeff1` | **15,5:1** no surface e **13,5:1** no overlay |
| `--fg-muted` | Texto secundário | `oklch(0.775 0.010 255)` | `#b2b6bc` | **8,7:1** no surface e **7,7:1** no overlay |
| `--fg-subtle` | Terciário e placeholder | `oklch(0.665 0.012 255)` | `#8f949b` | **5,8:1** no surface e **5,1:1** no overlay |
| `--fg-disabled` | Desabilitado | `oklch(0.48 0.010 255)` | `#5a5e63` | 2,7:1 |

> **Por que hover em alfa?** No escuro, `--muted` (L 0,255) e `--surface-overlay` (L 0,258) quase coincidem: um hover sólido sumiria dentro de um menu. A sobreposição alfa (`--hover`) funciona sobre qualquer camada. É a mesma razão das escalas alfa da Radix e do "gray-alpha" do Geist.

#### Rampa neutra primitiva (para gráficos, ilustrações e casos raros)

| Passo | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L | 0.985 | 0.967 | 0.925 | 0.872 | 0.710 | 0.556 | 0.442 | 0.372 | 0.275 | 0.210 | 0.150 |
| C (h 255) | 0.002 | 0.003 | 0.005 | 0.007 | 0.012 | 0.015 | 0.016 | 0.014 | 0.010 | 0.008 | 0.006 |
| Hex | `#f9fafb` | `#f3f4f6` | `#e4e6e9` | `#d2d5d9` | `#9da2a9` | `#6e747c` | `#4d545c` | `#3b4148` | `#24282d` | `#16191c` | `#090b0e` |

### 1.3 Derivar a escala da cor de marca (50–950) e usá-la nos dois temas

#### Algoritmo (OKLCH, escada de luminosidade fixa)

A ideia é a mesma de Stripe e Radix: **todo matiz segue a mesma curva de luminosidade**, então o contraste depende do passo e não da cor. Trocar a marca não muda nenhum contraste do sistema.

1. Converter o hex oficial da marca para OKLCH e obter `(L₀, C₀, h₀)`.
2. Para cada passo, usar a **luminosidade fixa** da tabela abaixo, o **mesmo matiz h₀** e o croma `C₀ × fator`.
3. **Mapear para o gamut sRGB** reduzindo só o croma e preservando L e h. Isso é feito com `toGamut` do culori; não use *clamp* por canal, que desloca o matiz.
4. **Validar o contraste** automaticamente: branco sobre 600 ≥ 4,5:1; 600 sobre `--bg` ≥ 4,5:1; 500 contra branco ≥ 3:1 (anel de foco); 400 sobre o surface escuro ≥ 4,5:1.
5. Exceções:
   - **Marca clara** (L₀ > 0,70: amarelo, lima, ciano claro). O botão primário usa a cor original da marca (ou o passo 400) com **texto escuro (passo 950)**, como a Radix faz com `amber`, `lime` e `sky`. A escala serve para o resto.
   - **Se branco sobre 600 < 4,5:1**, o primário passa a ser 700.
   - **Amarelos e laranjas.** Nos passos 700–950, gire o matiz −5° a −10° para evitar o tom "oliva" ou "barro".
   - **Marca quase cinza** (C₀ < 0,04). Use C = 0,04 como mínimo; o foco e a seleção precisam de cor.
6. O **hex exato da marca** continua sendo usado no logo. A interface usa a escala; o passo 600 fica perto da marca quando L₀ ≈ 0,55.

| Passo | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **L fixo** | 0.975 | 0.945 | 0.895 | 0.825 | 0.735 | 0.645 | 0.545 | 0.480 | 0.415 | 0.355 | 0.275 |
| **Fator de croma** | 0.10 | 0.22 | 0.42 | 0.66 | 0.88 | 1.00 | 1.00 | 0.92 | 0.80 | 0.66 | 0.50 |

#### Exemplo com o placeholder (h 258, C 0,19)

| Passo | OKLCH | Hex | Branco sobre ele | Ele sobre `#16181c` (surface escuro) |
|---|---|---|---|---|
| 50 | `oklch(0.975 0.012 258)` | `#f2f7ff` | — | 16,5:1 |
| 100 | `oklch(0.945 0.026 258)` | `#e2eeff` | — | 15,2:1 |
| 200 | `oklch(0.895 0.051 258)` | `#c8deff` | — | 13,0:1 |
| 300 | `oklch(0.825 0.088 258)` | `#a2c8ff` | — | 10,4:1 |
| 400 | `oklch(0.735 0.138 258)` | `#71aaff` | 2,4:1 | **7,5:1** |
| 500 | `oklch(0.645 0.190 258)` | `#398afe` | 3,4:1 | 5,3:1 |
| 600 | `oklch(0.545 0.190 258)` | `#136adc` | **5,1:1** | 3,5:1 |
| 700 | `oklch(0.480 0.175 258)` | `#0458bd` | 6,7:1 | 2,7:1 |
| 800 | `oklch(0.415 0.152 258)` | `#02479c` | 8,8:1 | 2,0:1 |
| 900 | `oklch(0.355 0.125 258)` | `#05387b` | 11,3:1 | 1,6:1 |
| 950 | `oklch(0.275 0.095 258)` | `#032555` | 15,0:1 | 1,2:1 |

Fiz o teste com outras seis marcas hipotéticas (azul `#1d4ed8`, verde `#15803d`, laranja `#ea580c`, vermelho `#c81e1e`, teal `#0f766e` e amarelo `#facc15`). Com L 0,545 no passo 600, o branco sobre 600 ficou entre 4,6:1 e 5,3:1 em todas. A exceção prevista é o amarelo, que cai na regra da "marca clara".

#### Mapeamento de uso da marca

| Token semântico | Uso | Claro | Escuro |
|---|---|---|---|
| `--primary` | Botão primário, switch ligado, checkbox marcado, passo atual do wizard | 600 `#136adc` (texto branco 5,1:1) | 600 `#136adc` (texto branco 5,1:1; 3,5:1 contra o surface) |
| `--primary-hover` | Hover do primário | 700 `#0458bd` | `oklch(0.565 0.19 258)` `#1c71e2` (branco 4,7:1). No escuro, o hover **clareia** levemente |
| `--primary-active` | Pressionado | 800 | 700 |
| `--primary-fg` | Texto e ícone sobre o primário | `#ffffff` | `#ffffff` |
| `--link` / `--link-hover` | Links em texto | 600 (4,8:1 no bg) / 700 | 400 `#71aaff` (7,5:1) / 300 |
| `--ring` | Anel de foco (2 px, offset de 2 px) | 500 `#398afe` (3,4:1 contra o branco, acima de 3:1) | 400 `#71aaff` (8,0:1 contra o bg) |
| `--primary-subtle` | Linha selecionada, item ativo com cor, fundo de chip ativo | 50 `#f2f7ff` | `oklch(0.29 0.07 258)` `#132b4d` |
| `--primary-subtle-fg` | Texto sobre o subtle | 700 (6,2:1) | 300 `#a2c8ff` (8,3:1) |
| `--primary-subtle-border` | Borda do subtle | 200 | `oklch(0.40 0.10 258)` `#22477d` |
| `--selection` | `::selection` | 200 `#c8deff` | `oklch(0.36 0.11 258)` `#123b75` (texto 9,6:1) |

Regra de parcimônia: **na mesma tela, só um botão primário**. A cor de marca aparece em foco, seleção, links, o passo atual e o primário. Não aparece em ícones decorativos, títulos nem fundos grandes.

#### Script de geração (Node + culori)

```js
// scripts/gerar-escala-marca.mjs
// uso: node scripts/gerar-escala-marca.mjs "#1f5fd1"   (npm i -D culori)
import { converter, formatHex, toGamut, wcagContrast } from "culori";

const paraOklch = converter("oklch");
const noGamut = toGamut("rgb", "oklch"); // reduz o croma até caber no sRGB, preservando L e h

const PASSOS  = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const L_FIXO  = [0.975, 0.945, 0.895, 0.825, 0.735, 0.645, 0.545, 0.48, 0.415, 0.355, 0.275];
const FATOR_C = [0.10, 0.22, 0.42, 0.66, 0.88, 1.0, 1.0, 0.92, 0.80, 0.66, 0.50];

const marca = paraOklch(process.argv[2]);
const C0 = Math.max(marca.c ?? 0, 0.04);
const h0 = marca.h ?? 255;
const claro = marca.l > 0.70; // amarelo, lima, ciano claro: primário com texto escuro

const escala = Object.fromEntries(
  PASSOS.map((p, i) => {
    let h = h0;
    if (h0 >= 50 && h0 <= 110 && p >= 700) h = h0 - 8; // amarelos/laranjas: evita o "oliva"
    return [p, noGamut({ mode: "oklch", l: L_FIXO[i], c: C0 * FATOR_C[i], h })];
  }),
);

for (const [p, cor] of Object.entries(escala)) {
  const { l, c, h } = paraOklch(cor);
  console.log(`  --brand-${p}: oklch(${l.toFixed(3)} ${c.toFixed(3)} ${(h ?? 0).toFixed(1)}); /* ${formatHex(cor)} */`);
}

const W = "#ffffff", BG = "#f8f9fb", SURF_ESCURO = "#16181c";
const checar = (nome, v, min) => console.log(`${v >= min ? "OK  " : "FALHA"} ${nome}: ${v.toFixed(2)} (mín. ${min})`);
checar("branco sobre 600 (botão)", wcagContrast(W, escala[600]), 4.5);
checar("600 sobre bg (link)", wcagContrast(escala[600], BG), 4.5);
checar("500 contra branco (anel de foco)", wcagContrast(escala[500], W), 3);
checar("400 sobre surface escuro (link escuro)", wcagContrast(escala[400], SURF_ESCURO), 4.5);
if (claro) console.log("Marca clara: use a cor original como primário com texto --brand-950.");
```

O resultado é colado nos primitivos `--brand-*` (seção 1.11). Mais nada muda.

### 1.4 Cores semânticas

Os matizes são fixos e independentes da marca: sucesso h 150, atenção h 70, perigo h 27 e info h 235. Se a marca for azul, `info` pode reaproveitar a marca. Se a marca for vermelha, o perigo continua h 27, mas o botão primário nunca é usado para ações destrutivas.

Cada cor tem cinco papéis:

- **solid**: botão destrutivo, barra de progresso, ponto de status.
- **solid-fg**: texto sobre o solid.
- **subtle**: fundo de badge, alerta ou célula.
- **subtle-fg**: texto e ícone sobre o subtle.
- **subtle-border**: borda do badge ou alerta.

Há ainda **text**, para texto colorido sobre a superfície (por exemplo "+0,010 kg" fora do EMA).

#### Claro

| Cor | solid / solid-fg | subtle (fundo) | subtle-fg | subtle-border | text (sobre o surface) |
|---|---|---|---|---|---|
| **Sucesso** | `oklch(0.545 0.15 150)` `#00873c` / branco (4,6:1) | `oklch(0.968 0.028 150)` `#e8faeb` | `oklch(0.47 0.112 150)` `#1e6c37` (5,9:1) | `oklch(0.89 0.06 150)` `#c0e7c6` | `oklch(0.50 0.128 150)` `#177739` (5,6:1) |
| **Atenção** | `oklch(0.80 0.16 70)` `#fea92f` / `oklch(0.26 0.06 70)` `#351e00` (8,2:1) | `oklch(0.968 0.023 70)` `#fff2e4` | `oklch(0.47 0.102 70)` `#7e4f00` (6,4:1) | `oklch(0.89 0.06 70)` `#f5d5b0` | `oklch(0.50 0.108 70)` `#8a5600` (6,2:1) |
| **Perigo** | `oklch(0.545 0.20 27)` `#cb2526` / branco (5,5:1) | `oklch(0.968 0.016 27)` `#fff1ef` | `oklch(0.47 0.15 27)` `#9e2d28` (6,7:1) | `oklch(0.89 0.058 27)` `#ffcdc6` | `oklch(0.50 0.17 27)` `#b02b27` (6,5:1) |
| **Info** | `oklch(0.545 0.116 235)` `#0079a9` / branco (4,9:1) | `oklch(0.968 0.018 235)` `#eaf7ff` | `oklch(0.47 0.098 235)` `#076289` (6,2:1) | `oklch(0.89 0.06 235)` `#b5e2fd` | `oklch(0.50 0.106 235)` `#006c97` (5,9:1) |
| **Neutro** (rascunho) | `--gray-600` / branco | `oklch(0.955 0.006 255)` `#edf0f4` | `oklch(0.45 0.016 255)` `#4f565e` (6,5:1) | `--border` | `--fg-muted` |

#### Escuro

Os **sólidos são os mesmos do claro**, porque o texto branco continua passando e eles ficam a ≥ 3,2:1 do surface escuro. Os **subtle** são fundos escuros e dessaturados com texto claro, como recomenda o Material ("cores dessaturadas no escuro").

| Cor | solid / solid-fg | subtle (fundo) | subtle-fg | subtle-border | text |
|---|---|---|---|---|---|
| **Sucesso** | `#00873c` / branco (3,8:1 contra o surface) | `oklch(0.285 0.055 150)` `#13321b` | `oklch(0.83 0.09 150)` `#9dd8a9` (8,6:1) | `oklch(0.40 0.08 150)` `#235430` | `oklch(0.78 0.112 150)` `#81cc91` (9,3:1) |
| **Atenção** | `#fea92f` / `#1a0f03` (9,8:1) | `oklch(0.285 0.05 70)` `#3a250b` | `oklch(0.83 0.096 70)` `#f0bd81` (8,5:1) | `oklch(0.40 0.08 70)` `#633f0c` | `oklch(0.78 0.12 70)` `#e8a95c` (8,7:1) |
| **Perigo** | `#cb2526` / branco (3,2:1 contra o surface) | `oklch(0.285 0.055 27)` `#411e1b` | `oklch(0.83 0.094 27)` `#ffb0a6` (8,4:1) | `oklch(0.40 0.08 27)` `#6c3530` | `oklch(0.78 0.129 27)` `#ff968a` (8,5:1) |
| **Info** | `#0079a9` / branco | `oklch(0.285 0.055 235)` `#062e41` | `oklch(0.83 0.078 235)` `#95d0f3` (8,5:1) | `oklch(0.40 0.08 235)` `#0b4e6c` | `oklch(0.78 0.098 235)` `#76c2ed` (9,1:1) |
| **Neutro** | `--gray-500` / branco | `oklch(0.29 0.008 255)` `#292c2f` | `oklch(0.82 0.01 255)` `#c0c4cb` (8,0:1) | `--border` | `--fg-muted` |

**Regras:**

- **Cor nunca sozinha.** Todo status leva ícone e texto. Isso cobre daltonismo, impressão em P&B e o modo `forced-colors`.
- **Cores de status são reservadas.** Verde, âmbar e vermelho só significam status. Nunca viram "série 4" de um gráfico nem decoração.
- **O "solid" de atenção não leva texto branco** (1,9:1). Use-o só com texto escuro ou como ponto e barra.

### 1.5 Cores especiais

| Token | Uso | Claro | Escuro |
|---|---|---|---|
| `--autofill` | Fundo de campo **preenchido automaticamente** (CNPJ/CEP). Lilás, inspirado nas células "enriched" do Attio. Não é a cor de marca, para não confundir com foco ou seleção | `oklch(0.962 0.020 295)` `#f3f0ff` (texto 15,6:1) | `oklch(0.265 0.045 295)` `#272139` (texto 13,4:1) |
| `--autofill-border` | Borda do campo auto-preenchido | `oklch(0.86 0.07 295)` `#d4c9fb` | `oklch(0.40 0.09 295)` `#4c3c73` |
| `--autofill-icon` | Ícone `Sparkles` e texto "Preenchido via…" | `oklch(0.52 0.17 295)` `#734dbe` (5,3:1) | `oklch(0.78 0.12 295)` `#bda8fc` (7,5:1) |
| `--scrim` | Véu atrás de modal e drawer | `oklch(0.18 0.01 255 / 0.45)` | `oklch(0 0 0 / 0.60)` |
| `--chart-grid` | Grade e eixos de gráfico (linha fina sólida) | `--border-subtle` | `--border-subtle` |
| `--chart-series` | Série principal (pontos e barras de incerteza) | `--brand-600` | `--brand-400` |

> Se a marca oficial for roxa ou lilás, troque o matiz do autofill para teal (h ≈ 190), para que continue distinto da marca.

### 1.6 Raio de borda

Usamos a escala padrão do Tailwind v4, com papéis fixos alinhados aos "materiais" do Geist (6 px base e 12 px flutuantes):

| Utilitário | Valor | Uso |
|---|---|---|
| `rounded-sm` | 4 px | Checkbox, marcadores internos, barras do gráfico |
| `rounded-md` | 6 px | **Botões, inputs, selects, badges, chips, células focadas, tooltip** |
| `rounded-lg` | 8 px | Itens de menu e da sidebar (pílula de hover), toasts |
| `rounded-xl` | 12 px | **Cards, popovers, menus, modais, drawer (lado interno)** |
| `rounded-2xl` | 16 px | Painel de conteúdo "inset", command palette |
| `rounded-full` | — | Avatar, ponto de status, switch, chip de filtro ativo |

Regra de concentricidade: o raio interno é o raio externo menos o padding. Por exemplo, um card de 12 px com padding de 6 px leva um item interno de 6 px.

### 1.7 Sombras e elevação (claro × escuro)

No claro, a elevação vem de **sombra**. No escuro, vem de **superfície mais clara + realce interno de 1 px**, porque sombras quase não aparecem sobre fundo escuro (Material e Apple).

| Camada | Elementos | Claro | Escuro |
|---|---|---|---|
| 0 · Canvas | Fundo, sidebar, topbar | `--bg` | `--bg` |
| 1 · Painel e card | Conteúdo, cards, tabelas | `--surface` + `border` | `--surface` + `border` |
| 2 · Elevado | Card em hover, cabeçalho fixo com rolagem, barra de ações do wizard | `--surface` + `shadow-sm` | `--surface-raised` + `shadow-sm` |
| 3 · Flutuante | Popover, dropdown, tooltip, combobox | `--surface-overlay` + `border` + `shadow-md` | `--surface-overlay` + `shadow-md` (já inclui o anel interno) |
| 4 · Modal | Modal, drawer, ⌘K, toast | `--surface-overlay` + `shadow-lg` + `--scrim` | `--surface-overlay` + `shadow-lg` + `--scrim` |

```css
/* Claro: sombras curtas, frias e de baixa opacidade */
--elev-1: 0 1px 2px 0 oklch(0.22 0.02 255 / 0.06);
--elev-2: 0 1px 3px 0 oklch(0.22 0.02 255 / 0.08), 0 1px 2px -1px oklch(0.22 0.02 255 / 0.06);
--elev-3: 0 4px 12px -2px oklch(0.22 0.02 255 / 0.10), 0 2px 4px -2px oklch(0.22 0.02 255 / 0.06);
--elev-4: 0 16px 40px -8px oklch(0.22 0.02 255 / 0.18), 0 4px 12px -4px oklch(0.22 0.02 255 / 0.08);

/* Escuro: sombra preta mais forte + realce interno para definir a borda */
--elev-1: 0 1px 2px 0 oklch(0 0 0 / 0.40);
--elev-2: 0 1px 3px 0 oklch(0 0 0 / 0.50), inset 0 1px 0 0 oklch(1 0 0 / 0.04);
--elev-3: 0 8px 20px -4px oklch(0 0 0 / 0.55), inset 0 0 0 1px oklch(1 0 0 / 0.06);
--elev-4: 0 24px 48px -12px oklch(0 0 0 / 0.65), inset 0 0 0 1px oklch(1 0 0 / 0.08);
```

Sem `backdrop-blur` atrás de modais. É caro em PCs modestos da rede local e não ajuda a legibilidade.

### 1.8 Espaçamento, tamanhos e densidade

Base de **4 px** (`--spacing: 0.25rem`, o padrão do Tailwind v4). Use só os passos 1, 1.5, 2, 3, 4, 5, 6, 8, 10 e 12.

| Passo | px | Uso típico |
|---|---|---|
| 1 | 4 | Ícone ↔ texto em badge; gap entre chips |
| 1.5 | 6 | Padding vertical de item de menu |
| 2 | 8 | Ícone ↔ texto em botão; gap de toolbar |
| 3 | 12 | Padding horizontal de células e inputs; gap entre campos na mesma linha |
| 4 | 16 | Padding de card no tablet; gap do grid de cards; espaço entre campos (vertical) |
| 6 | 24 | Padding de card e de página no desktop; gap entre grupos de campos |
| 8 | 32 | Entre seções da página |
| 10–12 | 40–48 | Respiro antes do título da página e em estados vazios |

| Componente | Desktop (padrão) | Compacto (`data-density="compact"`) | Toque (`pointer: coarse`) |
|---|---|---|---|
| `--control-h` (botão, input, select) | **36 px** | 32 px | **44 px** |
| Botão pequeno (toolbar, ações de linha) | 32 px | 28 px | 40 px |
| `--row-h` (linha de tabela) | **40 px** | 32 px | **48 px** |
| Linha da planilha de leituras | 40 px | 36 px | 48 px |
| Item da sidebar | 32 px | 28 px | 40 px |
| Topbar | 56 px | 48 px | 56 px |
| Sidebar expandida / recolhida | 256 px / 48 px | igual | overlay de 288 px |

O alvo mínimo de clique é de 24 × 24 px (WCAG 2.2, critério 2.5.8 AA). No toque usamos 44 px, como a Apple; o Material recomenda 48 dp.

### 1.9 Tipografia

#### Inter ou Geist?

| Critério | **Inter 4.x** (rsms) | **Geist** (Vercel) |
|---|---|---|
| Licença | OFL | OFL |
| Algarismos tabulares (`tnum`) | Sim | Recomendados no guia (label-13), mas os recursos OpenType são pouco documentados |
| Zero cortado (`zero`), dígitos abertos (`ss01`), alternâncias de caixa (`case`) | Sim | Não documentado |
| Tamanho óptico (texto ↔ display) | **Sim** (`opsz` na InterVariable; equivale a "Inter Display" nos títulos) | Não |
| Uso em referências | Linear, Catalyst/Tailwind Plus, Figma | Vercel |
| Caráter | Neutro, técnico, muito legível em 13–14 px | Mais geométrico e "Vercel" |

**Decisão: Inter (InterVariable 4.x) para a interface e para o PDF.** Os motivos:

1. Os recursos numéricos estão documentados: `tnum` para colunas e `zero` para números de série, que evita a confusão entre O e 0.
2. O eixo óptico deixa os títulos elegantes sem uma segunda família.
3. O Catalyst foi desenhado em torno dela.

Não é preciso fonte mono na interface. Se algum dia for necessária (logs de SMTP, por exemplo), use Geist Mono.

**Auto-hospedar a fonte.** A rede local pode não ter internet. Baixe `InterVariable.woff2` (e a itálica) de rsms.me/inter e sirva de `/fonts`. Também dá para usar `@fontsource-variable/inter`, que registra a família "Inter Variable". No PDF, embuta as instâncias estáticas TTF (400, 500 e 600).

#### Escala tipográfica (UI densa de dados)

| Token Tailwind | Tamanho / altura de linha | Peso | Uso |
|---|---|---|---|
| `text-xs` | 12 / 16 | 500 | Badges, legendas, cabeçalhos de coluna, contadores, atalhos (`kbd`) |
| `text-ui` *(novo)* | **13 / 18** | 400–500 | Tabela compacta, metadados, itens da sidebar, ajuda de campo |
| `text-sm` | **14 / 20** | 400 / 500 | **Corpo padrão**, inputs (desktop), botões, células de tabela |
| `text-base` | 16 / 24 | 500–600 | Título de card e de seção; **inputs em telas de toque** (evita o zoom do iOS) |
| `text-lg` | 18 / 28 | 600 | Título de drawer e modal |
| `text-xl` | 20 / 28 | 600, `tracking-[-0.01em]` | **Título da página** |
| `text-2xl` | 24 / 32 | 600 | Número do certificado na visualização |
| `text-3xl` | 30 / 36 | 600 | **Valor de KPI** (algarismos proporcionais) |

Pesos: 400 (texto), 500 (rótulos, botões, cabeçalhos de coluna, item ativo) e 600 (títulos, valores de KPI). **Não use 700** na interface.

#### Números e medições

- **Algarismos tabulares** (`tabular-nums`) em toda coluna de números: tabelas, planilha de leituras, eixos de gráfico e datas em coluna. **Algarismos proporcionais** em valores grandes e isolados (KPIs), porque com `tnum` um "121" fica frouxo em tamanho grande.
- **`slashed-zero`** em números de série, número de certificado e códigos de verificação.
- **Alinhamento à direita**, com a **mesma quantidade de casas decimais na coluna**, ditada pela divisão d da balança. Por exemplo, com d = 0,005 kg, tudo leva 3 casas.
- **Formato pt-BR** com `Intl.NumberFormat('pt-BR', { minimumFractionDigits: n, maximumFractionDigits: n })`: vírgula decimal e ponto de milhar ("1.284").
  - Unidade separada por espaço não separável: `10,005 kg`.
  - Erros sempre com sinal: `+0,005` e `−0,005` (sinal de menos U+2212).
  - A unidade vai **no cabeçalho** da coluna ("Indicação (kg)") e não se repete em cada célula.
- **Datas** no formato `dd/mm/aaaa`. Datas relativas ("há 3 dias", "vence em 12 dias") só para recência e prazo, com a data exata no tooltip.

### 1.10 Motion

Valores baseados nos tokens do Material 3 (curto: 50–200 ms) e em práticas de interface rápida: *ease-out* na entrada, nada acima de 250 ms na interface comum.

| Token | Valor | Uso |
|---|---|---|
| `--duration-instant` | 100 ms | Cor de hover, pressionar botão, ações de linha aparecendo |
| `--duration-fast` | 150 ms | Tooltip, popover, dropdown, checkbox, troca de aba, saída de overlays |
| `--duration-base` | 200 ms | Entrada de toast, accordion, destaque de auto-preenchimento |
| `--duration-slow` | 250 ms | Entrada de modal e drawer, colapso da sidebar |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Padrão (M3 *standard/emphasized*) |
| `--ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Entradas (M3 *emphasized decelerate*) |
| `--ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Saídas (M3 *emphasized accelerate*), com cerca de 150 ms |

### 1.11 CSS completo (Tailwind v4): `src/styles/app.css`

```css
/* ============================================================
   Balanças.com · Certificados — tokens de design (Tailwind v4)
   ============================================================ */
@import "tailwindcss";

/* Fonte auto-hospedada (a rede local pode não ter internet) */
@font-face {
  font-family: "InterVariable";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/InterVariable.woff2") format("woff2");
}
@font-face {
  font-family: "InterVariable";
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/InterVariable-Italic.woff2") format("woff2");
}

/* dark: controlado pelo atributo no <html> (claro/escuro/sistema resolvido por script) */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
@custom-variant hc   (&:where([data-contrast="high"], [data-contrast="high"] *));
/* Toque: use a variante nativa `pointer-coarse:` do Tailwind ≥ 4.1 */

/* ---------------- PRIMITIVOS (não mudam com o tema) ---------------- */
:root {
  /* Marca — PLACEHOLDER: regenerar com scripts/gerar-escala-marca.mjs */
  --brand-50:  oklch(0.975 0.012 258); /* #f2f7ff */
  --brand-100: oklch(0.945 0.026 258); /* #e2eeff */
  --brand-200: oklch(0.895 0.051 258); /* #c8deff */
  --brand-300: oklch(0.825 0.088 258); /* #a2c8ff */
  --brand-400: oklch(0.735 0.138 258); /* #71aaff */
  --brand-500: oklch(0.645 0.190 258); /* #398afe */
  --brand-600: oklch(0.545 0.190 258); /* #136adc */
  --brand-700: oklch(0.480 0.175 258); /* #0458bd */
  --brand-800: oklch(0.415 0.152 258); /* #02479c */
  --brand-900: oklch(0.355 0.125 258); /* #05387b */
  --brand-950: oklch(0.275 0.095 258); /* #032555 */

  /* Neutro tingido com o matiz da marca */
  --gray-50:  oklch(0.985 0.002 255); /* #f9fafb */
  --gray-100: oklch(0.967 0.003 255); /* #f3f4f6 */
  --gray-200: oklch(0.925 0.005 255); /* #e4e6e9 */
  --gray-300: oklch(0.872 0.007 255); /* #d2d5d9 */
  --gray-400: oklch(0.710 0.012 255); /* #9da2a9 */
  --gray-500: oklch(0.556 0.015 255); /* #6e747c */
  --gray-600: oklch(0.442 0.016 255); /* #4d545c */
  --gray-700: oklch(0.372 0.014 255); /* #3b4148 */
  --gray-800: oklch(0.275 0.010 255); /* #24282d */
  --gray-900: oklch(0.210 0.008 255); /* #16191c */
  --gray-950: oklch(0.150 0.006 255); /* #090b0e */

  /* Componentes: densidade padrão */
  --control-h: 36px;
  --control-h-sm: 32px;
  --row-h: 40px;
  --cell-px: 12px;
  --sidebar-w: 16rem;
  --sidebar-w-icon: 3rem;
  --topbar-h: 56px;

  /* Motion */
  --duration-instant: 100ms;
  --duration-fast: 150ms;
  --duration-base: 200ms;
  --duration-slow: 250ms;
}
[data-density="compact"] {
  --control-h: 32px; --control-h-sm: 28px; --row-h: 32px; --cell-px: 8px; --topbar-h: 48px;
}
@media (pointer: coarse) { /* tablet do técnico: sempre confortável */
  :root, [data-density="compact"] {
    --control-h: 44px; --control-h-sm: 40px; --row-h: 48px; --cell-px: 12px; --topbar-h: 56px;
  }
}

/* ---------------- SEMÂNTICOS · CLARO ---------------- */
:root, [data-theme="light"] {
  color-scheme: light;
  --bg:              oklch(0.982 0.003 255); /* #f8f9fb */
  --surface:         oklch(1 0 0);           /* #ffffff */
  --surface-raised:  oklch(1 0 0);
  --surface-overlay: oklch(1 0 0);
  --surface-sunken:  oklch(0.972 0.004 255); /* #f4f6f8 */
  --muted:           oklch(0.962 0.005 255); /* #f0f3f6 */
  --hover:           oklch(0.215 0.012 255 / 0.045);
  --press:           oklch(0.215 0.012 255 / 0.08);
  --active:          oklch(0.93 0.007 255);  /* #e5e8ed */

  --border-subtle:   oklch(0.94 0.005 255);  /* #e9ebee */
  --border:          oklch(0.905 0.007 255); /* #dde0e4 */
  --border-strong:   oklch(0.84 0.010 255);  /* #c6cbd1 */
  --input:           oklch(0.80 0.012 255);  /* #b9bec6 */
  --input-hover:     oklch(0.72 0.014 255);  /* #9fa5ad */

  --fg:              oklch(0.215 0.012 255); /* #161a1f  17,5:1 */
  --fg-muted:        oklch(0.495 0.016 255); /* #5c626b   6,2:1 */
  --fg-subtle:       oklch(0.545 0.015 255); /* #6a7179   4,9:1 */
  --fg-disabled:     oklch(0.70 0.010 255);  /* #9a9fa5 */

  --primary:               var(--brand-600);
  --primary-hover:         var(--brand-700);
  --primary-active:        var(--brand-800);
  --primary-fg:            oklch(1 0 0);
  --primary-subtle:        var(--brand-50);
  --primary-subtle-fg:     var(--brand-700);
  --primary-subtle-border: var(--brand-200);
  --link:                  var(--brand-600);
  --link-hover:            var(--brand-700);
  --ring:                  var(--brand-500);
  --selection:             var(--brand-200);

  --success: oklch(0.545 0.15 150);  --success-fg: oklch(1 0 0);
  --success-subtle: oklch(0.968 0.028 150); --success-subtle-fg: oklch(0.47 0.112 150);
  --success-subtle-border: oklch(0.89 0.06 150); --success-text: oklch(0.50 0.128 150);

  --warning: oklch(0.80 0.16 70);    --warning-fg: oklch(0.26 0.06 70);
  --warning-subtle: oklch(0.968 0.023 70); --warning-subtle-fg: oklch(0.47 0.102 70);
  --warning-subtle-border: oklch(0.89 0.06 70); --warning-text: oklch(0.50 0.108 70);

  --danger: oklch(0.545 0.20 27);    --danger-fg: oklch(1 0 0);
  --danger-subtle: oklch(0.968 0.016 27); --danger-subtle-fg: oklch(0.47 0.15 27);
  --danger-subtle-border: oklch(0.89 0.058 27); --danger-text: oklch(0.50 0.17 27);

  --info: oklch(0.545 0.116 235);    --info-fg: oklch(1 0 0);
  --info-subtle: oklch(0.968 0.018 235); --info-subtle-fg: oklch(0.47 0.098 235);
  --info-subtle-border: oklch(0.89 0.06 235); --info-text: oklch(0.50 0.106 235);

  --neutral-subtle: oklch(0.955 0.006 255); --neutral-subtle-fg: oklch(0.45 0.016 255);
  --neutral-subtle-border: var(--border);

  --autofill: oklch(0.962 0.020 295); --autofill-border: oklch(0.86 0.07 295);
  --autofill-icon: oklch(0.52 0.17 295);
  --scrim: oklch(0.18 0.01 255 / 0.45);

  --elev-1: 0 1px 2px 0 oklch(0.22 0.02 255 / 0.06);
  --elev-2: 0 1px 3px 0 oklch(0.22 0.02 255 / 0.08), 0 1px 2px -1px oklch(0.22 0.02 255 / 0.06);
  --elev-3: 0 4px 12px -2px oklch(0.22 0.02 255 / 0.10), 0 2px 4px -2px oklch(0.22 0.02 255 / 0.06);
  --elev-4: 0 16px 40px -8px oklch(0.22 0.02 255 / 0.18), 0 4px 12px -4px oklch(0.22 0.02 255 / 0.08);
}

/* ---------------- SEMÂNTICOS · ESCURO ---------------- */
[data-theme="dark"] {
  color-scheme: dark;
  --bg:              oklch(0.18 0.006 255);  /* #101214 */
  --surface:         oklch(0.21 0.007 255);  /* #16181c */
  --surface-raised:  oklch(0.238 0.008 255); /* #1c1f23 */
  --surface-overlay: oklch(0.258 0.009 255); /* #212428 */
  --surface-sunken:  oklch(0.192 0.006 255); /* #121417 */
  --muted:           oklch(0.255 0.008 255); /* #202327 */
  --hover:           oklch(0.952 0.003 255 / 0.06);
  --press:           oklch(0.952 0.003 255 / 0.10);
  --active:          oklch(0.305 0.012 255); /* #2b2f35 */

  --border-subtle:   oklch(0.265 0.008 255); /* #232529 */
  --border:          oklch(0.31 0.009 255);  /* #2d3135 */
  --border-strong:   oklch(0.385 0.010 255); /* #404449 */
  --input:           oklch(0.405 0.011 255); /* #45494f */
  --input-hover:     oklch(0.48 0.012 255);  /* #595e64 */

  --fg:              oklch(0.952 0.003 255); /* #eeeff1  15,5:1 */
  --fg-muted:        oklch(0.775 0.010 255); /* #b2b6bc   8,7:1 */
  --fg-subtle:       oklch(0.665 0.012 255); /* #8f949b   5,8:1 */
  --fg-disabled:     oklch(0.48 0.010 255);  /* #5a5e63 */

  --primary:               var(--brand-600);
  --primary-hover:         oklch(0.565 0.19 258); /* #1c71e2 — clareia no escuro */
  --primary-active:        var(--brand-700);
  --primary-fg:            oklch(1 0 0);
  --primary-subtle:        oklch(0.29 0.07 258);  /* #132b4d */
  --primary-subtle-fg:     var(--brand-300);
  --primary-subtle-border: oklch(0.40 0.10 258);  /* #22477d */
  --link:                  var(--brand-400);
  --link-hover:            var(--brand-300);
  --ring:                  var(--brand-400);
  --selection:             oklch(0.36 0.11 258);  /* #123b75 */

  --success-subtle: oklch(0.285 0.055 150); --success-subtle-fg: oklch(0.83 0.09 150);
  --success-subtle-border: oklch(0.40 0.08 150); --success-text: oklch(0.78 0.112 150);

  --warning-fg: oklch(0.18 0.03 70);
  --warning-subtle: oklch(0.285 0.05 70); --warning-subtle-fg: oklch(0.83 0.096 70);
  --warning-subtle-border: oklch(0.40 0.08 70); --warning-text: oklch(0.78 0.12 70);

  --danger-subtle: oklch(0.285 0.055 27); --danger-subtle-fg: oklch(0.83 0.094 27);
  --danger-subtle-border: oklch(0.40 0.08 27); --danger-text: oklch(0.78 0.129 27);

  --info-subtle: oklch(0.285 0.055 235); --info-subtle-fg: oklch(0.83 0.078 235);
  --info-subtle-border: oklch(0.40 0.08 235); --info-text: oklch(0.78 0.098 235);

  --neutral-subtle: oklch(0.29 0.008 255); --neutral-subtle-fg: oklch(0.82 0.01 255);

  --autofill: oklch(0.265 0.045 295); --autofill-border: oklch(0.40 0.09 295);
  --autofill-icon: oklch(0.78 0.12 295);
  --scrim: oklch(0 0 0 / 0.60);

  --elev-1: 0 1px 2px 0 oklch(0 0 0 / 0.40);
  --elev-2: 0 1px 3px 0 oklch(0 0 0 / 0.50), inset 0 1px 0 0 oklch(1 0 0 / 0.04);
  --elev-3: 0 8px 20px -4px oklch(0 0 0 / 0.55), inset 0 0 0 1px oklch(1 0 0 / 0.06);
  --elev-4: 0 24px 48px -12px oklch(0 0 0 / 0.65), inset 0 0 0 1px oklch(1 0 0 / 0.08);
}

/* ---------------- ALTO CONTRASTE (Configurações › Aparência) ---------------- */
[data-contrast="high"] {
  --border: oklch(0.78 0.012 255);  --border-strong: oklch(0.64 0.014 255);
  --input:  oklch(0.64 0.014 255);  /* ≥ 3:1 sobre branco (WCAG 1.4.11) */
  --fg-muted: oklch(0.42 0.016 255); --fg-subtle: oklch(0.47 0.016 255);
}
[data-theme="dark"][data-contrast="high"] {
  --border: oklch(0.45 0.010 255);  --border-strong: oklch(0.58 0.012 255);
  --input:  oklch(0.58 0.012 255);  /* ≥ 3:1 sobre o surface escuro */
  --fg: oklch(0.985 0.002 255); --fg-muted: oklch(0.86 0.008 255); --fg-subtle: oklch(0.78 0.010 255);
}

/* ---------------- MAPEAMENTO PARA UTILITÁRIOS ---------------- */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-overlay: var(--surface-overlay);
  --color-surface-sunken: var(--surface-sunken);
  --color-muted: var(--muted);
  --color-hover: var(--hover);
  --color-press: var(--press);
  --color-active: var(--active);

  --color-border-subtle: var(--border-subtle);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-input: var(--input);
  --color-input-hover: var(--input-hover);

  --color-fg: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-fg-subtle: var(--fg-subtle);
  --color-fg-disabled: var(--fg-disabled);

  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-active: var(--primary-active);
  --color-primary-fg: var(--primary-fg);
  --color-primary-subtle: var(--primary-subtle);
  --color-primary-subtle-fg: var(--primary-subtle-fg);
  --color-primary-subtle-border: var(--primary-subtle-border);
  --color-link: var(--link);
  --color-link-hover: var(--link-hover);
  --color-ring: var(--ring);

  --color-success: var(--success);           --color-success-fg: var(--success-fg);
  --color-success-subtle: var(--success-subtle);
  --color-success-subtle-fg: var(--success-subtle-fg);
  --color-success-subtle-border: var(--success-subtle-border);
  --color-success-text: var(--success-text);

  --color-warning: var(--warning);           --color-warning-fg: var(--warning-fg);
  --color-warning-subtle: var(--warning-subtle);
  --color-warning-subtle-fg: var(--warning-subtle-fg);
  --color-warning-subtle-border: var(--warning-subtle-border);
  --color-warning-text: var(--warning-text);

  --color-danger: var(--danger);             --color-danger-fg: var(--danger-fg);
  --color-danger-subtle: var(--danger-subtle);
  --color-danger-subtle-fg: var(--danger-subtle-fg);
  --color-danger-subtle-border: var(--danger-subtle-border);
  --color-danger-text: var(--danger-text);

  --color-info: var(--info);                 --color-info-fg: var(--info-fg);
  --color-info-subtle: var(--info-subtle);
  --color-info-subtle-fg: var(--info-subtle-fg);
  --color-info-subtle-border: var(--info-subtle-border);
  --color-info-text: var(--info-text);

  --color-neutral-subtle: var(--neutral-subtle);
  --color-neutral-subtle-fg: var(--neutral-subtle-fg);
  --color-neutral-subtle-border: var(--neutral-subtle-border);

  --color-autofill: var(--autofill);
  --color-autofill-border: var(--autofill-border);
  --color-autofill-icon: var(--autofill-icon);
  --color-scrim: var(--scrim);

  --color-brand-50: var(--brand-50);   --color-brand-100: var(--brand-100);
  --color-brand-200: var(--brand-200); --color-brand-300: var(--brand-300);
  --color-brand-400: var(--brand-400); --color-brand-500: var(--brand-500);
  --color-brand-600: var(--brand-600); --color-brand-700: var(--brand-700);
  --color-brand-800: var(--brand-800); --color-brand-900: var(--brand-900);
  --color-brand-950: var(--brand-950);

  --shadow-xs: var(--elev-1);
  --shadow-sm: var(--elev-2);
  --shadow-md: var(--elev-3);
  --shadow-lg: var(--elev-4);
}

@theme {
  --font-sans: "InterVariable", "Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace;

  --text-ui: 0.8125rem;              /* 13px */
  --text-ui--line-height: 1.125rem;  /* 18px */

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0.05, 0.7, 0.1, 1);
  --ease-exit: cubic-bezier(0.3, 0, 0.8, 0.15);

  --animate-skeleton: skeleton 1.6s ease-in-out infinite;
  @keyframes skeleton { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

  --animate-autofill: autofill-in 200ms var(--ease-standard) both;
  @keyframes autofill-in { from { background-color: transparent; } }
}

/* ---------------- BASE ---------------- */
@layer base {
  html { -webkit-text-size-adjust: 100%; }
  body {
    background-color: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    font-size: 0.875rem; line-height: 1.25rem;  /* 14/20 */
    font-optical-sizing: auto;                  /* Inter Display automática nos títulos */
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  ::selection { background: var(--selection); color: var(--fg); }

  /* Evita o "flash" de transições ao trocar de tema */
  [data-theme-switching] *, [data-theme-switching] *::before, [data-theme-switching] *::after {
    transition: none !important;
  }
  /* Toque: input com 16px evita o zoom automático do Safari/iPadOS */
  @media (pointer: coarse) { input, select, textarea { font-size: 16px; } }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important; scroll-behavior: auto !important;
    }
  }
}
```

Exemplos de uso:

```tsx
// Botão primário
<button className="inline-flex h-(--control-h) items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium
  text-primary-fg shadow-xs transition-colors duration-100 ease-standard hover:bg-primary-hover
  active:bg-primary-active disabled:bg-muted disabled:text-fg-disabled">
  <Plus className="size-4" aria-hidden /> Nova calibração
</button>

// Card (o tema troca só os tokens; não é preciso usar dark: nos componentes)
<section className="rounded-xl border border-border bg-surface p-6">…</section>

// Célula numérica
<td className="px-(--cell-px) text-right tabular-nums text-fg">10,005</td>
```


### 1.12 Aplicação à marca oficial (verde, do levantamento `05-identidade-e-arquitetura-existente.md`)

O levantamento de identidade, que ficou pronto em paralelo, indica o **verde `#019F42`** (variações `#07AA51` e `#0B9E4F`, todas com matiz OKLCH ≈ 149–151°) e a **Inter Variable servida localmente**. A fonte confirma a decisão da seção 1.9. O mesmo levantamento observa que **branco sobre `#0B9E4F` dá só 3,5:1** (reprova o AA). A escala abaixo resolve isso.

Passando `#019F42` (`oklch(0.613 0.174 148.6)`) pelo algoritmo da seção 1.3:

| Passo | OKLCH | Hex | Branco sobre ele | Ele sobre o `--bg` claro | Ele sobre o surface escuro |
|---|---|---|---|---|---|
| 50 | `oklch(0.975 0.017 148.6)` | `#effaf0` | — | — | 16,6:1 |
| 100 | `oklch(0.945 0.038 148.6)` | `#dcf4df` | — | — | 15,3:1 |
| 200 | `oklch(0.895 0.073 148.6)` | `#bcebc2` | — | — | 13,4:1 |
| 300 | `oklch(0.825 0.115 148.6)` | `#90db9c` | — | — | 10,8:1 |
| 400 | `oklch(0.735 0.154 148.6)` | `#59c371` | 2,2:1 | 2,1:1 | **8,0:1** |
| 500 | `oklch(0.645 0.174 148.6)` | `#1ea94c` | 3,1:1 | 2,9:1 | 5,8:1 |
| 600 | `oklch(0.545 0.155 148.6)` | `#008737` | **4,65:1** | 4,4:1 | 3,8:1 |
| 700 | `oklch(0.480 0.137 148.6)` | `#00712d` | 6,2:1 | **5,9:1** | 2,9:1 |
| 800 | `oklch(0.415 0.118 148.6)` | `#005c23` | 8,2:1 | 7,8:1 | 2,2:1 |
| 900 | `oklch(0.355 0.101 148.6)` | `#00491a` | 10,7:1 | 10,1:1 | 1,7:1 |
| 950 | `oklch(0.275 0.079 148.6)` | `#00320f` | 14,4:1 | 13,6:1 | 1,2:1 |

Ajustes de mapeamento para o verde, que é mais claro que o placeholder azul no mesmo L:

- **Claro:** primário 600 `#008737` (branco 4,65:1); hover 700; **link 700** `#00712d` (5,9:1 sobre o `--bg`; o 600 dá só 4,4:1); **anel de foco 600** (o 500 dá só 2,9:1 sobre o `--bg`); subtle = 50 com texto 700.
- **Escuro:** primário 600 (branco 4,65:1; 3,8:1 contra o surface); **hover 700** (clarear reprovaria o branco: L 0,565 dá 4,3:1); link e anel 400 `#59c371` (8,0:1); subtle `oklch(0.29 0.07 148.6)` `#0c3416` com texto 300 `#90db9c` (8,4:1).
- **O verde da identidade (`#019F42`/`#07AA51`) continua no logo**, na barra do item ativo e em ícones de destaque. **Nunca com texto branco.** É o mesmo alerta do sistema de Orçamentos citado no levantamento.
- **Conflito com "sucesso".** O primário e os status positivos ("Emitido", "Válida") ficam no mesmo matiz. Diferencie pela **forma**: o primário é sólido e só aparece em botões; os status são *subtle* com ícone. Opcionalmente, desloque o sucesso para h ≈ 160 (esmeralda), com os mesmos L e C da seção 1.4.
- **Cinzas:** mantenha o neutro frio de croma baixo (h 255) da seção 1.2. Ele combina com qualquer matiz e com os tokens dos outros sistemas internos da empresa (`#f5f6f7` / `#0e1012`) descritos no levantamento 05. A alternativa *sage* (h ≈ 150, croma ≤ 0,010) deixaria o app mais "verde", mas diferente dos sistemas irmãos.
- **Nomes de tokens:** o levantamento 05 mostra um código existente com nomes como `--ink`, `--line` e `--surface-2`. Na implementação, convém **unificar** com a nomenclatura daqui (`--fg`, `--border`, `--surface-raised`) ou criar aliases. Os papéis são equivalentes.

---

## 2. Padrões de layout

### 2.1 Shell do aplicativo: "L invertido" com painel inset

A navegação (sidebar) e o canvas usam `--bg`. O conteúdo fica num **painel `--surface` arredondado** (`rounded-2xl`, borda `--border`, margem de 8 px do canvas), como na variante `inset` da sidebar do shadcn e no "L invertido" do Linear. A navegação recua; o trabalho ganha destaque.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ canvas (--bg)                                                                        │
│ ┌──────────────┐ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ SIDEBAR      │ │ TOPBAR 56px  breadcrumbs · · · · · · · [Buscar… Ctrl K]  (sino) │ │
│ │ 256px        │ ├─────────────────────────────────────────────────────────────────┤ │
│ │ (recolhe     │ │ CABEÇALHO DA PÁGINA  título · descrição · ações · abas          │ │
│ │  para 48px)  │ │                                                                 │ │
│ │              │ │ CONTEÚDO (painel --surface, rounded-2xl, rola internamente)     │ │
│ │ grupos       │ │                                                                 │ │
│ │ ...          │ │                                                                 │ │
│ │ usuário/tema │ │                                                                 │ │
│ └──────────────┘ └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Abaixo de `lg` (1024 px), o painel deixa de ser inset: ocupa a tela inteira, sem margem nem raio, para ganhar espaço.
- Quem rola é o **painel**, não a janela. A topbar fica fixa dentro dele e ganha `border-b` e `shadow-xs` quando o conteúdo rola por baixo.
- Inclua um link "Pular para o conteúdo" (visível no foco) como primeiro elemento focável.

### 2.2 Sidebar recolhível com grupos

| Grupo | Itens (ícone lucide) | Observações |
|---|---|---|
| *(topo)* | Logo + nome da empresa · botão **"Nova calibração"** (`Plus`, estilo secundário, dica `C`) | A ação global mais frequente fica sempre a um clique |
| **Visão geral** | Painel (`LayoutDashboard`) | — |
| **Operação** | Certificados (`FileCheck2`) · Clientes (`Building2`) · Balanças (`Scale`) | Certificados mostra um badge com o nº de rascunhos |
| **Metrologia** | Padrões (`Weight`) | Ponto âmbar ou vermelho quando há padrão vencendo ou vencido |
| **Sistema** | Configurações (`Settings`) | Só para administradores |
| *(rodapé)* | Usuário (avatar, nome, papel) → menu: Tema, Atalhos de teclado (`?`), Sair | Seletor de tema também em Configurações › Aparência |

Especificação:

- **Larguras:** 256 px expandida e **48 px** recolhida (rail de ícones), iguais às constantes da sidebar do shadcn. Abaixo de 1024 px vira drawer de 288 px sobre o conteúdo.
- **Recolher:** botão `PanelLeft` no topo da sidebar e atalho **Ctrl+B / ⌘B**. O estado fica salvo por usuário (localStorage + preferência no servidor). A largura anima em 250 ms com `ease-standard`.
- **Recolhida:**
  - Cada ícone tem tooltip à direita, com 300 ms de atraso, mostrando o rótulo e o atalho.
  - Os rótulos de grupo viram separadores de 1 px.
  - Os badges viram um ponto de 6 px no canto do ícone.
- **Item:**
  - Altura de 32 px, `rounded-lg`, padding de 8 px, ícone de 16 px e texto `text-ui` (13 px).
  - **Inativo:** texto `--fg-muted` e ícone `--fg-subtle`.
  - **Hover:** `bg-hover`.
  - **Ativo:** `bg-active`, texto `--fg` com peso 500 e ícone `--fg`. Não use cor de marca no item ativo; isso mantém a calma (Linear 2026).
- **Rótulo de grupo:** `text-xs`, peso 500, `--fg-subtle`, em *sentence case* (não CAIXA ALTA), com `mt-6 mb-1`.
- **Faixas de largura:**
  - ≥ 1280 px: expandida por padrão.
  - 1024–1279 px: recolhida por padrão.
  - < 1024 px: off-canvas, aberta pelo botão `Menu` na topbar.

### 2.3 Topbar com busca global (⌘K / Ctrl+K)

- **Altura:** 56 px (48 px no compacto).
- **Esquerda:** botão de menu (só < 1024 px) e breadcrumbs.
- **Direita:**
  - **Gatilho de busca** com aparência de input (280–400 px): ícone `Search`, texto "Buscar clientes, balanças, certificados…" e `kbd` "Ctrl K". Mostre "⌘K" no macOS, detectado por `navigator.userAgentData?.platform` com *fallback* para `navigator.platform`.
  - Sino (`Bell`) com o contador de vencimentos.
- Clicar no gatilho, ou teclar Ctrl+K / ⌘K de qualquer lugar (mesmo dentro de um input), abre a **command palette** (seção 3.9).
- Nas listas, **`/`** foca o filtro local da tabela (padrão do GitHub e do Linear) quando o foco não está num campo.

### 2.4 Breadcrumbs

- Mostram a **hierarquia de entidades**, sem "Início": `Clientes › Padaria Bom Pão Ltda › Balança TOL-0042`.
- **Último item:** página atual em `--fg`, com `aria-current="page"` e sem link.
- **Anteriores:** links `--fg-muted` (hover `--fg`).
- **Separador:** `ChevronRight` de 14 px em `--fg-subtle`, com `aria-hidden`.
- Nomes longos são truncados em 24ch, com o nome completo no `title` e no tooltip. Com mais de 3 níveis, os do meio colapsam num botão "…" com menu.
- No tablet, um botão `ArrowLeft` antes dos breadcrumbs leva ao nível anterior.
- No wizard: `Certificados › Nova calibração · rascunho R-0091`.

### 2.5 Cabeçalho de página

```
Título da página  [badge]                                [Ação secundária] [Ação primária]
Descrição curta em --fg-muted (máx. 80ch)
───────────────────────────────────────────────────────────────────────────────────────
Abas (sublinhado de 2px na marca)  |  ou  toolbar de filtros da tabela
```

- **Título:** `text-xl` 600, com `pt-6 pb-1`. **Descrição:** `text-sm` em `--fg-muted`.
- **Uma única ação primária por página**, sempre à direita. As secundárias usam estilo `outline`/`ghost` e as raras vão para o menu `⋯` (`MoreHorizontal`).
- **Detalhe de entidade:** ícone ou avatar de 40 px + nome + linha de metadados (`CNPJ · Cidade/UF · cliente desde 2019`) + badges.
- **Abas:** 40 px de altura, texto 14/500 em `--fg-muted`, ativa em `--fg` com sublinhado de 2 px em `--primary`. Cada aba **muda a URL** (`?aba=balancas`).

### 2.6 Largura do conteúdo

| Tipo de página | Largura máxima | Observação |
|---|---|---|
| Listas e tabelas | fluida, até **1536 px** | Tabelas aproveitam a largura; padding lateral de 24 px (16 px no tablet) |
| Painel | **1280 px** (`max-w-7xl`), centralizado | — |
| Detalhe (cliente, balança, padrão) | 1280 px | — |
| Formulário de cadastro | **768 px** (`max-w-3xl`) | Ou o layout "configurações": descrição da seção em 1/3 e campos em 2/3, até 1024 px |
| Configurações | subnavegação de 220 px + conteúdo de até 768 px | — |
| Wizard de calibração | fluido, até 1440 px | Trilho de etapas (240 px) + conteúdo + painel de resultados (320 px) |
| Visualização do certificado | página A4 com 840 px + painel lateral de 360 px | — |
| Texto corrido (ajuda e termos) | 68ch | — |

### 2.7 Grid do painel (KPIs + listas)

- **Grid:** 12 colunas, gap de 24 px (16 px no tablet).
- **Linha 0, filtros:** saudação e data à esquerda; seletor de período à direita ("Este mês ▾": Este mês, Mês anterior, Últimos 90 dias, Este ano, Personalizado). Os filtros ficam **numa linha acima de tudo** e valem para todos os blocos.
- **Linha 1, KPIs:** 4 cards de 3 colunas cada (`xl`); 2 × 2 no `md`; empilhados no `sm`.
  1. **Certificados emitidos** no período, com variação em relação ao período anterior e sparkline de 12 meses.
  2. **Calibrações de clientes vencendo** em 30 dias, com o nº de vencidas ao lado.
  3. **Padrões vencendo** em 60 dias, com o nº de vencidos. Isso é crítico, porque padrão vencido bloqueia calibrações.
  4. **Rascunhos em aberto**, com atalho "Continuar".
- **Linha 2, listas:**
  - **Últimos certificados** (8 colunas): tabela de 8 linhas e link "Ver todos".
  - Coluna direita (4 colunas), com dois cards empilhados: **Vencendo em breve** (clientes e balanças, com ação "Avisar cliente") e **Padrões a recalibrar**.
- **Anatomia do card de KPI:**
  - Rótulo em `text-sm`/500 `--fg-muted`, *sentence case* e sem dois-pontos.
  - Valor em `text-3xl`/600 com **algarismos proporcionais**.
  - Contexto: variação com sinal e período nomeado ("▲ 12% vs. setembro"). A cor segue direção × se subir é bom: para emitidos, subir é bom (`--success-text`); para vencidos, subir é ruim (`--danger-text`). Sempre com ícone `TrendingUp`/`TrendingDown`.
  - Sparkline opcional de 12 pontos (linha de 2 px), cinza com o mês atual na cor da marca.
  - **O card inteiro é clicável** e leva à lista já filtrada (por exemplo, Balanças com o filtro "Vence em ≤ 30 dias").

### 2.8 Responsividade (o tablet do técnico)

| Faixa | Dispositivo típico | Sidebar | Tabelas | Wizard |
|---|---|---|---|---|
| ≥ 1280 px | Desktop do escritório | Expandida | Todas as colunas | 3 colunas: etapas · planilha · resultados ao vivo |
| 1024–1279 px | Tablet em paisagem, notebook | Rail de ícones | Esconde colunas de baixa prioridade | Etapas viram um seletor no topo ("Etapa 6 de 8 · Erro de indicação ▾"); os resultados viram um painel recolhível à direita |
| 768–1023 px | Tablet em retrato | Off-canvas | Colunas essenciais; ações de linha sempre visíveis (`⋯`) | Uma coluna; resultados e gráfico num acordeão abaixo da planilha; **barra de ações fixa no rodapé** |
| < 768 px | Celular (uso eventual) | Off-canvas | Vira lista de cards | Somente consulta: ver e enviar certificado |

Regras específicas para toque (`pointer: coarse`):

- **Alvos de 44 px**, linhas de 48 px, inputs de 16 px (sem zoom do iOS) e espaçamento de pelo menos 8 px entre alvos.
- **Teclado certo para cada campo:**
  - Leituras: `inputmode="decimal"`. No iPad em pt-BR, o teclado mostra a vírgula; aceite "," e ".".
  - CPF, CEP e telefone: `inputmode="numeric"`.
  - Navegação na planilha: `enterkeyhint="next"`, e `enterkeyhint="done"` na última célula.
- **Nada só no hover.** Ações de linha ficam visíveis num botão `⋯`; tooltips também abrem com toque longo ou foco.
- **Teclado virtual:** a célula focada fica centralizada (`scrollIntoView({ block: "center" })`) e o layout acompanha `visualViewport`, para a barra de ações não ficar atrás do teclado.
- **Barra inferior fixa** com `padding-bottom: env(safe-area-inset-bottom)`.
- **Conectividade** (decisão em aberto, ver seção 8). Calibração em campo pode acontecer **fora da rede local**. O design já prevê um indicador "Sem conexão: salvo neste dispositivo" e uma fila de sincronização.

---

## 3. Componentes

Base recomendada: **shadcn/ui** (código copiado para o projeto, em cima de primitivas Radix/Base UI acessíveis), restilizado com os tokens acima. Também: **TanStack Table** nas tabelas, **cmdk** na command palette, **Sonner** nos toasts e **lucide-react** nos ícones (16 px nos componentes, 20 px em estados vazios e 1,75 de traço em tamanhos ≥ 20 px).

### 3.1 Botões

| Variante | Visual | Uso |
|---|---|---|
| `primary` | `bg-primary text-primary-fg` + `shadow-xs` | **Uma por tela**: Salvar, Avançar, Emitir |
| `secondary` | `bg-surface border border-border-strong text-fg` + `shadow-xs`; hover `bg-hover` | Ações comuns: Editar, Exportar, Cancelar |
| `ghost` | Sem fundo; hover `bg-hover` | Toolbar, ações de linha, ícones |
| `destructive` | `bg-danger text-danger-fg` | Só dentro do modal de confirmação (Cancelar certificado, Excluir) |
| `link` | `text-link underline-offset-4 hover:underline` | Ações em texto |

- **Tamanhos:** `sm` 32 px, `md` 36 px (padrão), `lg` 40 px; 44 px no toque. Ícone de 16 px, gap de 8 px, padding horizontal de 12 px.
- **Botão só com ícone:** quadrado, com `aria-label` e tooltip mostrando o rótulo e o atalho.
- **Carregando:** um spinner substitui o ícone, a largura se mantém, o texto muda ("Salvando…") e o botão recebe `aria-busy="true"`. Sem bloquear a tela.
- **Desabilitado:** evite desabilitar sem explicar. Prefira manter habilitado e validar no clique. Se desabilitar, ponha um tooltip com o motivo ("Faltam 2 leituras na etapa Repetibilidade").

### 3.2 Tabela de dados

| Aspecto | Especificação |
|---|---|
| **Densidade** | Linha de **40 px** (padrão), 32 px (compacta, opção em Aparência) e 48 px (toque). Texto `text-sm`; `text-ui` (13 px) no compacto. Padding horizontal `--cell-px` (12/8 px) |
| **Cabeçalho** | **Fixo** (`sticky top-0`) dentro do contêiner que rola, com `bg-surface-sunken` e `border-b`. Rótulos em `text-xs` 500 `--fg-muted`, *sentence case*, com a **unidade no cabeçalho** ("Capacidade (kg)"). Cada rótulo segue o alinhamento da sua coluna |
| **Alinhamento** | Texto à esquerda, **números à direita** com `tabular-nums` e casas decimais constantes, status à esquerda. Nada centralizado, exceto checkbox e ícone isolado |
| **Linhas** | Separador `border-b border-border-subtle`. **Sem zebra** (Ström-Awn: tinta mínima). Hover `bg-hover` (100 ms) |
| **Coluna fixa** | Em tabelas largas, a 1ª coluna (identificador) fica fixa à esquerda e a de ações à direita, com sombra sutil quando há rolagem horizontal |
| **Ordenação** | Clique no cabeçalho ordena (asc → desc → original). A coluna ativa mostra `ArrowUp`/`ArrowDown` de 14 px; no hover das demais aparece `ChevronsUpDown` em `--fg-subtle`. Use `aria-sort`. Ordenação padrão explícita (por exemplo, "Emitido em ↓"). Estado na URL |
| **Filtros como chips** | A toolbar acima da tabela tem uma busca local (`/`, com ícone `Search` e debounce de 200 ms, que ignora acentos e pontuação, então "bom pao" acha "Bom Pão" e "11222333" acha o CNPJ formatado), seguida de chips "**+ Status**", "**+ Período**", "**+ Cliente**" com borda tracejada `--border-strong`. Ao aplicar, o chip fica sólido (`bg-primary-subtle text-primary-subtle-fg`, `rounded-full`) com o texto "Status: Emitido, Rascunho" e um `×` para remover. "Limpar filtros" aparece com 2 ou mais filtros ativos. **Todos os filtros ficam na URL** (compartilháveis, e o botão Voltar funciona). Contador de resultados à direita ("128 certificados") |
| **Linha clicável** | A linha inteira abre o detalhe. Use um `<a>` real na célula principal, estendido com `::after` absoluto (padrão *stretched link*), para que botão do meio e Ctrl+clique abram em nova aba. Foco por teclado: `focus-visible` com anel inset de 2 px na linha. **↑/↓** move entre linhas e **Enter** abre |
| **Ações no hover** | Coluna final com 2 ou 3 botões `ghost` só com ícone (por exemplo, `Download` PDF, `Mail` enviar, `MoreHorizontal`). Aparecem com `opacity-0 → 100` (100 ms) em `group-hover` e **`group-focus-within`**. **No toque ficam sempre visíveis.** Nunca ponha a única forma de fazer algo só no hover |
| **Seleção em massa** | Checkbox na 1ª coluna (Shift+clique seleciona intervalo). Ao selecionar, aparece uma **barra flutuante** no rodapé: "3 selecionados · Enviar por e-mail · Baixar PDFs (.zip) · Limpar" |
| **Paginação × rolagem** | **Paginação numerada** (padrão de 50; opções 25/50/100), com "1–50 de 1.284" e Anterior/Próxima. Ela dá orientação ("está na página 3"), mantém o rodapé alcançável e combina com o filtro na URL. **Sem rolagem infinita** em registros de negócio. Virtualização só no histórico de auditoria. Ao voltar de um detalhe, restaure a página e a posição de rolagem |
| **Carregando** | 1ª carga: 8 linhas skeleton com a geometria final. **Recarga** (filtro, página): mantém as linhas com `opacity-60` e uma barra de progresso de 2 px no topo da tabela. Nunca pisque o skeleton de novo |
| **Vazio** | Distinga **"sem dados"** (1º uso, com CTA de criar) de **"sem resultados"** ("Nenhum certificado com estes filtros" + "Limpar filtros") |
| **Responsivo** | Colunas com prioridade 1–3. Abaixo de `lg` saem as de prioridade 3 e abaixo de `md` as de prioridade 2. Abaixo de 640 px, a lista vira cards. Menu "Colunas" (`Columns3`) para mostrar ou ocultar |

### 3.3 Badges de status

Há **dois componentes para duas dimensões diferentes**, para que "Emitido" e "Válida" (ambos positivos) não se confundam numa mesma linha:

- **`StatusBadge`** (estado do documento): pílula `rounded-md`, 22 px de altura, `px-2`, `text-xs` 500, ícone de 12 px, fundo `*-subtle`, texto `*-subtle-fg` e `ring-1 ring-inset ring-*-subtle-border`.
- **`ValidityIndicator`** (prazo): **ponto de 8 px + texto** em `--fg`, sem fundo. Leva o prazo relativo no texto e a data exata no tooltip. Em listas de alerta (painel) pode usar a forma de badge.

| Dimensão | Estado | Texto exibido | Ícone lucide | Tokens |
|---|---|---|---|---|
| Documento | **Rascunho** | Rascunho | `PencilLine` | neutral-subtle |
| Documento | Em revisão *(se o fluxo de 2 pessoas estiver ativo)* | Em revisão | `Eye` | info-subtle |
| Documento | **Emitido** | Emitido | `BadgeCheck` | success-subtle |
| Documento | **Cancelado** | Cancelado | `Ban` | danger-subtle. O nº na linha fica com `line-through` em `--fg-muted` |
| Documento | Substituído *(revisado, ISO 17025 7.8.8)* | Substituído por BC-2026-00131 | `History` | neutral-subtle, com o link para o novo |
| Calibração do cliente | **Válida** | Válida até 14/10/2027 | ponto ou `CircleCheck` | success |
| Calibração do cliente | **Vence em ≤ 30 dias** | Vence em 12 dias | ponto ou `Clock` | warning |
| Calibração do cliente | **Vencida** | Vencida há 5 dias | ponto ou `CircleAlert` | danger |
| Calibração do cliente | Sem data-alvo | Sem previsão | `CircleDashed` | neutral |
| Padrão | Válido / Vence em ≤ 60 dias / Vencido | idem | idem | idem |
| Padrão | **Bloqueado** (vencido ou fora de uso) | Bloqueado: vencido em 02/09/2026 | `Lock` | danger-subtle |
| Resultado (planilha) | Dentro do EMA / Indeterminado / Fora do EMA | Conforme / Indeterminado / Fora do EMA | `CircleCheck` / `CircleHelp` / `OctagonX` | success / warning / danger |

> O prazo de "vence em X dias" do cliente é uma **data-alvo interna**, usada nos lembretes e no painel. Ela **não** vai para o certificado, a não ser que o cliente tenha pedido (ISO 17025 7.8.4.3). Os limiares (30 dias para clientes e 60 para padrões) ficam em Configurações.

### 3.4 Formulários

#### Estrutura e rótulos

- **Rótulo acima** do campo (`text-sm` 500 `--fg`, `mb-1.5`). Marque o **"(opcional)"** em `--fg-subtle` em vez de asteriscos, porque a maioria dos campos aqui é obrigatória.
- **Ajuda** abaixo, em `text-ui` `--fg-muted`, presa ao campo por `aria-describedby`.
- **Seções** com título (`text-base` 600) e descrição. Em telas largas, use o layout "configurações": título e descrição à esquerda (1/3) e campos à direita (2/3).
- **A largura do campo reflete o conteúdo**: CEP com 10ch, UF com 6ch, Número com 8ch, CNPJ com 22ch. Isso orienta o preenchimento.
- Duas colunas só para pares naturais (Cidade + UF, Telefone + E-mail). A ordem segue o formulário de papel ou a Receita.
- **Ações:** "Cancelar" (secundário) e "Salvar cliente" (primário) **à direita**. Em formulários longos ficam numa **barra fixa** no rodapé do painel, com o indicador "Alterações não salvas" à esquerda. Atalho **Ctrl+S / ⌘S**.

#### Validação inline

- **Momento:**
  - Formato (CPF/CNPJ com DV, e-mail, CEP) é validado no **blur**.
  - Obrigatórios são validados no **envio**.
  - **Depois do primeiro erro**, o campo revalida a cada digitação: o erro some assim que corrigido ("recompensar cedo, punir tarde").
- **Visual do erro:**
  - Borda `--danger`.
  - Ícone `CircleAlert` de 14 px e mensagem em `text-ui` `--danger-text`, **substituindo** o texto de ajuda.
  - `aria-invalid="true"`.
  - A mensagem diz como corrigir: "CNPJ inválido: confira os 2 últimos dígitos".
- **No envio com erros:**
  - Um resumo no topo ("2 campos precisam de atenção") com links para cada campo.
  - Foco no primeiro campo com erro.
  - Nunca limpe o que foi digitado.
- **Avisos não bloqueantes** (âmbar), como "Este CNPJ está com situação BAIXADA na Receita". Ficam visíveis, mas permitem salvar.

#### Máscaras (CPF, CNPJ alfanumérico, CEP e telefone)

> **Atenção (2026):** desde **julho de 2026**, a Receita emite **CNPJ alfanumérico** (IN RFB 2.229/2024): `AA.AAA.AAA/AAAA-DV`. As 12 primeiras posições aceitam **0–9 e A–Z**; os 2 DVs continuam numéricos. O cálculo segue em módulo 11, com valor do caractere = código ASCII − 48 (A = 17, B = 18…). O campo **não pode** usar `inputmode="numeric"`: use `inputmode="text"` e `autocapitalize="characters"`, e converta para maiúsculas. Os CNPJs numéricos antigos continuam válidos.

| Campo | Máscara | Teclado | Armazenar como |
|---|---|---|---|
| CPF | `000.000.000-00` | `inputmode="numeric"` | 11 dígitos |
| CNPJ | `AA.AAA.AAA/AAAA-00` | `inputmode="text"`, `autocapitalize="characters"`, `spellcheck={false}` | 14 caracteres maiúsculos, sem pontuação |
| CEP | `00000-000` | `inputmode="numeric"`, `autocomplete="postal-code"` | 8 dígitos |
| Telefone | `(00) 0000-0000` ou `(00) 00000-0000` (troca automaticamente no 11º dígito) | `inputmode="tel"`, `autocomplete="tel"` | Dígitos (DDD + número) |

Regras:

- **Colar sempre funciona.** Aceite o texto com ou sem pontuação e espaços e reformate.
- A máscara **não pode atrapalhar a edição no meio do texto**: preserve a posição do cursor. Use uma lib de máscara que faça isso (por exemplo `@react-input/mask` ou `react-imask`) ou as funções abaixo para formatar na exibição e na colagem.
- **Placeholder** com o formato em `--fg-subtle` ("00.000.000/0000-00"), mas **o rótulo nunca é o placeholder**.

```ts
// src/lib/documentos.ts — testado com 11.222.333/0001-81 e com o exemplo da Receita 12.ABC.345/01DE-35
export function aplicarPadrao(valor: string, padrao: string, aceita: RegExp): string {
  const chars = valor.toUpperCase().split("").filter((c) => aceita.test(c));
  let saida = "", i = 0;
  for (const p of padrao) {
    if (i >= chars.length) break;
    saida += p === "#" || p === "A" ? chars[i++] : p;
  }
  return saida;
}
export const formatarCPF  = (v: string) => aplicarPadrao(v, "###.###.###-##", /\d/);
export const formatarCNPJ = (v: string) => aplicarPadrao(v, "AA.AAA.AAA/AAAA-##", /[0-9A-Z]/);
export const formatarCEP  = (v: string) => aplicarPadrao(v, "#####-###", /\d/);
export const formatarTelefone = (v: string) =>
  aplicarPadrao(v, v.replace(/\D/g, "").length > 10 ? "(##) #####-####" : "(##) ####-####", /\d/);

export function cnpjValido(entrada: string): boolean {
  const v = entrada.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[0-9A-Z]{12}\d{2}$/.test(v) || /^(.)\1{13}$/.test(v)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48; // '0'..'9' → 0..9 ; 'A' → 17 …
  const dv = (base: string) => {
    let peso = 2, soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += valor(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(v.slice(0, 12));
  const d2 = dv(v.slice(0, 12) + d1);
  return v.endsWith(`${d1}${d2}`);
}

export function cpfValido(entrada: string): boolean {
  const v = entrada.replace(/\D/g, "");
  if (!/^\d{11}$/.test(v) || /^(\d)\1{10}$/.test(v)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(v.slice(0, 9));
  return v.endsWith(`${d1}${dv(v.slice(0, 9) + d1)}`);
}
```

#### Pessoa física × jurídica

- No topo do formulário fica um **controle segmentado** "Pessoa jurídica | Pessoa física", com PJ como padrão.
- A troca **mostra e esconde campos sem perder o que foi digitado**: o estado guarda ambos.
  - **PJ:** CNPJ (com busca), Razão social, Nome fantasia, Inscrição estadual (opcional), Situação cadastral (somente leitura, vinda da consulta).
  - **PF:** CPF, Nome completo.
  - **Comuns:** endereço (com CEP), contatos (vários: nome, função, e-mail, telefone, "recebe certificados por e-mail"), observações.
- **Detecção de duplicidade:** CNPJ ou CPF já cadastrado mostra, inline, "Já existe um cliente com este CNPJ: **Padaria Bom Pão Ltda** [Abrir cliente]" e impede salvar duplicado.

#### Preenchimento automático por CNPJ e CEP

A consulta é feita pelo backend, num serviço como BrasilAPI ou ViaCEP; a decisão técnica fica em outro documento. A rede local **pode estar sem internet**, então a consulta é sempre **um atalho e nunca uma barreira**.

| Momento | CNPJ | CEP |
|---|---|---|
| **Gatilho** | Ao completar 14 caracteres **com DV válido** (consulta automática com debounce de 300 ms) ou pelo botão "Buscar" (`Search`) dentro do campo | Ao completar 8 dígitos |
| **"Buscando…"** | Spinner de 14 px dentro do campo (à direita), texto de ajuda "Consultando a Receita Federal…" com `aria-live="polite"`, e os campos-alvo (razão social, fantasia, endereço, telefone, e-mail) com **skeleton** e `aria-busy` | Spinner no campo CEP, "Buscando endereço…" e skeleton em logradouro, bairro, cidade e UF |
| **Sucesso** | Os campos são preenchidos **em cascata** (30 ms entre eles, 200 ms de fade). Cada campo preenchido ganha **destaque lilás** (`bg-autofill`, borda `--autofill-border` e ícone `Sparkles` de 14 px à direita, com o tooltip "Preenchido pela consulta ao CNPJ em 14/10/2026 10:32"). No topo da seção aparece um alerta info: "Dados preenchidos a partir do CNPJ. Situação: **ATIVA**. Revise antes de salvar. [Desfazer]" | Preenche logradouro, bairro, cidade e UF com o mesmo destaque e **leva o foco para "Número"**, o próximo campo natural |
| **Campos já editados pelo usuário** | **Não são sobrescritos.** Mostram uma dica inline: "A Receita informa: 'Rua X, 120' [Usar este]" | Idem |
| **Edição de campo destacado** | Ao editar, o destaque some (o campo passa a ser do usuário) | Idem |
| **Situação ≠ ATIVA** | Alerta âmbar: "Situação cadastral: BAIXADA desde 03/2024". Permite salvar | — |
| **Não encontrado** | Ajuda em âmbar: "CNPJ não encontrado na base pública. Preencha manualmente." | "CEP não encontrado. Preencha o endereço." |
| **Sem internet / erro** | Ajuda neutra: "Não foi possível consultar agora (sem conexão). Preencha manualmente." e botão "Tentar de novo". **Nunca bloqueia** | Idem |

#### Outros campos

- **Datas:** input mascarado `dd/mm/aaaa` com calendário em popover (ícone `Calendar`); aceita digitação ("141026" vira "14/10/2026") e "hoje" com a tecla `H`.
- **Combobox** (cliente, balança, padrão): busca por nome ou documento, lista com duas linhas (nome + documento ou série) e "Cadastrar novo…" no fim da lista, que abre um **drawer**.
- **Campos numéricos com unidade:** sufixo fixo ("kg", "°C", "%UR") em `--fg-subtle` dentro do campo, alinhamento à direita e `tabular-nums`.
- **Textarea:** cresce até 8 linhas e mostra o contador só perto do limite.

### 3.5 Modal × drawer × página

| Use | Quando | Exemplos neste sistema | Largura |
|---|---|---|---|
| **Página** | Entidade principal, tarefa longa, algo que precisa de URL própria ou é revisitado | Lista e detalhe de cliente, **cadastro completo de cliente**, wizard de calibração, visualização do certificado, configurações | — |
| **Drawer** (painel lateral à direita) | Criar ou editar uma entidade **secundária sem perder o contexto**, ou consultar detalhes ao lado da lista | Nova balança (a partir do cliente ou do wizard), novo cliente rápido **dentro do wizard** (mesmo componente de formulário, em versão compacta), novo padrão, prévia de certificado a partir da lista, filtros avançados no tablet | 480–560 px (tela inteira < 768 px) |
| **Modal** (diálogo centralizado) | Decisão curta ou confirmação que **bloqueia** até ser respondida | Emitir certificado, **cancelar certificado (motivo obrigatório)**, excluir rascunho, enviar por e-mail (destinatários + mensagem), atalhos de teclado | 440–560 px |
| **Popover** | Seleção rápida ancorada a um controle | Datas, menus de filtro, menu de colunas, detalhes de incerteza de uma célula | 240–360 px |
| **Inline** | Edição pontual sem trocar de contexto | Renomear, editar observação, marcar contato como "recebe certificados" | — |

Regras de comportamento:

- **Esc** fecha modal, drawer e popover. Se houver alterações, pergunta antes: "Descartar alterações? [Continuar editando] [Descartar]".
- Clicar fora fecha popovers. **Não** fecha drawers e modais que tenham formulário.
- O foco fica preso dentro do overlay e **volta ao elemento de origem** ao fechar.
- **Nunca empilhe** modal sobre modal. Drawer sobre página é permitido; modal de confirmação sobre drawer também.
- O título do overlay diz a ação ("Nova balança para Padaria Bom Pão"); o botão primário repete o verbo ("Cadastrar balança").

### 3.6 Toasts

Use a **Sonner**, o componente padrão do shadcn/ui, com toasts empilhados e suporte a *promise*.

- **Posição:** canto inferior direito no desktop e topo centralizado no tablet, para não cobrir a barra de ações. No máximo **3 visíveis**; a pilha expande no hover.
- **Duração:**
  - Sucesso: 4 s.
  - Info: 5 s.
  - Com ação ("Desfazer"): 8 s.
  - **Erro: fica até ser fechado**, sempre com ação ("Tentar de novo" ou "Ver detalhes").
  - O tempo **pausa** com hover ou foco.
- **Promise:** "Enviando certificado…" vira "Certificado enviado para compras@bompao.com.br" ou "Falha no envio: servidor SMTP recusou [Ver detalhes]".
- **"Desfazer"** em ações reversíveis (excluir rascunho, remover contato), usando exclusão suave no backend.
- **Não use toast** para:
  - Erros de validação (vão inline).
  - Informação crítica que precisa permanecer (use um alerta ou banner na página).
  - Confirmar algo que já é visível na tela.
- **Acessibilidade:** região `aria-live="polite"` (`assertive` para erros) e atalho para focar os toasts (a Sonner usa Alt+T).
- **Visual:** `bg-surface-overlay`, `shadow-lg`, `rounded-lg`, ícone de status à esquerda e texto `text-sm`. A cor fica **só no ícone**; o toast em si é neutro.

### 3.7 Estados vazios

Estrutura (centralizada, `py-12`, largura máxima de 400 px):

1. **Ícone** lucide de 20 px dentro de um quadrado de 40 px `rounded-xl`, com `bg-muted` e borda `--border`. Opcionalmente, uma ilustração em linha de 1,5 px em `--fg-subtle`, sem cor (monocromática, para combinar com os dois temas).
2. **Título** (`text-base` 600): o que é a tela, sem "Ops!".
3. **Descrição** (1–2 linhas, `--fg-muted`): por que está vazia e o que fazer.
4. **CTA primário** e, se houver, um link secundário.

| Tela | Ícone | Título | Descrição | Ações |
|---|---|---|---|---|
| Clientes (1º uso) | `Building2` | Nenhum cliente cadastrado | Cadastre o primeiro cliente para começar a emitir certificados. Com o CNPJ, preenchemos o resto. | **[Cadastrar cliente]** · Importar planilha |
| Balanças do cliente | `Scale` | Nenhuma balança deste cliente | Cadastre as balanças para calibrar e acompanhar os vencimentos. | **[Cadastrar balança]** |
| Certificados | `FileCheck2` | Nenhum certificado emitido ainda | Comece uma calibração; o certificado é gerado ao final. | **[Nova calibração]** |
| Padrões | `Weight` | Nenhum padrão cadastrado | Os pesos padrão e o termo-higrômetro são necessários para calibrar. | **[Cadastrar padrão]** |
| Busca e filtros sem resultado | `SearchX` | Nada encontrado | Nenhum resultado para "bom pao" com os filtros atuais. | **[Limpar filtros]** |
| Painel: nada vencendo | `CircleCheck` (`--success-text`) | Tudo em dia | Nenhum padrão vence nos próximos 60 dias. | — |
| Erro de carregamento | `CloudOff` | Não foi possível carregar | O servidor da rede local não respondeu. | **[Tentar de novo]** |

### 3.8 Skeleton loading

- **Mesma geometria do conteúdo final** (linhas de tabela, cards de KPI, blocos de formulário), para que a troca não cause salto de layout.
- Blocos em `bg-muted` com `rounded-md` e animação `animate-skeleton` (pulso de opacidade de 1,6 s). Com `prefers-reduced-motion`, ficam estáticos.
- **Atraso de 300 ms** antes de exibir (cargas rápidas na rede local não piscam) e, uma vez exibido, **mínimo de 400 ms** na tela.
- **Só na primeira carga.** Em recarga, mantenha o conteúdo anterior com `opacity-60` e uma barra de progresso de 2 px no topo.
- O contêiner recebe `aria-busy="true"` e um texto `sr-only` "Carregando certificados…".

### 3.9 Command palette (⌘K / Ctrl+K)

Base: **cmdk** (via o `Command` do shadcn). É a navegação rápida do escritório.

- **Abertura:** Ctrl+K / ⌘K de qualquer lugar, pelo gatilho da topbar ou pelo item "Buscar" do menu. **Sem animação de abertura** (ou só 100 ms de opacidade): ações de teclado repetidas centenas de vezes por dia não devem esperar animação.
- **Visual:** 640 px de largura, a 15vh do topo, `rounded-2xl`, `bg-surface-overlay`, `shadow-lg` e `--scrim`. Input de 48 px sem borda; separador; lista com altura máxima de 400 px.
- **Conteúdo** (grupos na ordem):
  1. **Ações:** Nova calibração (`C`), Novo cliente, Nova balança, Novo padrão.
  2. **Ir para:** Painel (`G P`), Certificados (`G E`), Clientes (`G C`), Balanças (`G B`), Padrões (`G T`), Configurações (`G S`).
  3. **Resultados de busca** (com mais de 2 caracteres): clientes (nome, CNPJ/CPF), balanças (nº de série, TAG, modelo) e certificados (nº, cliente).
  4. **Preferências:** Tema claro, Tema escuro, Seguir o sistema; Densidade compacta.
  5. **Recentes** (quando a busca está vazia): os 5 últimos itens abertos.
- **Busca:**
  - Ignora acentos e caixa (`normalize("NFD")`) e ignora pontuação de documentos ("11222333" acha "11.222.333/0001-81").
  - Destaca o trecho que casou em `font-medium`.
  - Resultados do servidor com debounce de 150 ms.
- **Item:** ícone do tipo (16 px), título, linha secundária em `--fg-subtle` (por exemplo "Balança · Toledo 2098 · série 4471-B") e atalho à direita em `kbd`. Selecionado: `bg-hover` com barra de 2 px `--primary` à esquerda.
- **Rodapé:** "↑↓ navegar · ↵ abrir · Ctrl+↵ abrir em nova aba · Esc fechar".
- **Acessibilidade:** padrão combobox + listbox (já resolvido pelo cmdk), com o anúncio do número de resultados.

### 3.10 Seletor de tema (claro, escuro, sistema)

- **Onde:**
  - Menu do usuário (submenu "Tema").
  - Configurações › Aparência, como **controle segmentado** de 3 opções com ícone e texto: `Sun` Claro · `Moon` Escuro · `Monitor` Sistema.
  - Command palette.
- **Padrão:** "Sistema", respeitando `prefers-color-scheme`, como recomendam a Apple e o Tailwind.
- **Persistência:**
  - `localStorage` para aplicar **antes da pintura**.
  - Preferência do usuário no servidor, para seguir o usuário em outro computador da rede.
- **Sem flash:** script inline no `<head>`, antes do CSS, e `<meta name="color-scheme" content="light dark">`.
- **Troca instantânea:** ao trocar, adicione `data-theme-switching` ao `<html>` por um *frame*. Isso desliga as transições e evita que tudo "anime" de cor.
- **No modo Sistema**, ouça `matchMedia("(prefers-color-scheme: dark)").addEventListener("change", …)` e atualize ao vivo.
- **Contraste e densidade:** Configurações › Aparência também tem "Contraste: Padrão | Alto" (o padrão segue `prefers-contrast: more`) e "Densidade: Confortável | Compacta".
- **Logo com duas variantes** (clara e escura). O PDF é **sempre** claro.

```html
<!-- index.html, dentro de <head>, antes do CSS -->
<meta name="color-scheme" content="light dark" />
<script>
  (function () {
    try {
      var pref = localStorage.getItem("tema") || "sistema";           // "claro" | "escuro" | "sistema"
      var escuro = pref === "escuro" ||
        (pref === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var raiz = document.documentElement;
      raiz.dataset.theme = escuro ? "dark" : "light";
      var contraste = localStorage.getItem("contraste");                // "alto" | null
      if (contraste === "alto" ||
          (!contraste && window.matchMedia("(prefers-contrast: more)").matches)) raiz.dataset.contrast = "high";
      var densidade = localStorage.getItem("densidade");
      if (densidade === "compacta") raiz.dataset.density = "compact";
    } catch (e) { document.documentElement.dataset.theme = "light"; }
  })();
</script>
```

### 3.11 Outros componentes

| Componente | Especificação |
|---|---|
| **Tooltip** | Atraso de 400 ms (0 ms entre tooltips vizinhos), `rounded-md`, `bg-fg text-bg` (invertido), `text-xs`, máximo de 240 px. Nunca contém a única informação essencial |
| **Dropdown menu** | `rounded-xl`, `p-1`, itens de 32 px `rounded-lg` com ícone de 16 px e atalho à direita. Item destrutivo em `--danger-text` no fim, depois de um separador |
| **Description list** (dados do cliente, instrumento) | Grid de 2 colunas: rótulo `text-ui` `--fg-muted` (160 px) e valor `text-sm` `--fg`. Botão "Copiar" (`Copy`) no hover de CNPJ, série e nº de certificado, com o check "Copiado" por 1,5 s |
| **Alert / banner** | Inline na página: ícone + título + texto + ação, com `*-subtle`, `rounded-lg` e borda `*-subtle-border`. Banner global (por exemplo, "2 padrões vencidos: calibrações que os usam estão bloqueadas") no topo do painel, fechável por sessão |
| **Kbd** | `text-xs`, `font-sans`, `px-1.5`, 20 px de altura, `rounded`, `bg-muted`, borda `--border` e `border-b-2` (tecla) |
| **Avatar** | Iniciais, 24 ou 32 px, `rounded-full`, cor neutra derivada do nome (nunca cores de status) |
| **Switch / checkbox** | 16 px (20 px no toque, com alvo de 44 px). Marcado com `--primary`. O rótulo é clicável |

---

## 4. UX da entrada de dados de calibração

Esta é a tela mais crítica. O técnico **lê o mostrador e digita**, muitas vezes de pé, no tablet, nas instalações do cliente. Os objetivos são: **velocidade** (sem tirar a mão do teclado), **zero erro de digitação não percebido**, **feedback metrológico imediato** e **nenhuma perda de dados**.

### 4.1 Estrutura do wizard

Segundo a NN/g, wizards devem:

- mostrar **todas as etapas** com a atual destacada;
- ter botões com rótulos **descritivos** ("Avançar: Excentricidade", e não "Próximo");
- permitir **sair, salvar e retomar**;
- oferecer **um caminho mais rápido quando a tarefa é repetitiva**.

A calibração é repetitiva, então:

1. **Etapas 1 e 2 em ordem** (cliente e instrumento definem a unidade, d, e, Max e classe, que as planilhas usam).
2. **Etapas 3 a 6 em qualquer ordem.** O técnico pode fazer a excentricidade antes da repetibilidade, conforme a ordem física dos ensaios.
3. A **Revisão** está sempre acessível. A **Emissão** só fica liberada quando o checklist passa.
4. **"Repetir configuração da última calibração desta balança"** preenche procedimento, pontos de carga, composição dos padrões e opções do certificado. Só faltam as leituras e o ambiente.

**Trilho de etapas** (desktop, coluna de 240 px; vira um seletor no topo abaixo de 1280 px):

```
 ✓  1  Cliente e OS            Padaria Bom Pão · OS 2291
 ✓  2  Instrumento             Toledo 2098 · Max 30 kg · d = 5 g
 ✓  3  Padrões e ambiente      KIT-F1-02 + 2 × 10 kg M1 · 22,4 °C · 55 %UR
 ✓  4  Repetibilidade          5/5 · s = 0,0000 kg
 ✓  5  Excentricidade          |ΔI| máx 0,005 kg
 ●  6  Erro de indicação       5 de 6 pontos · 1 fora do EMA
 ○  7  Revisão
 ○  8  Emissão
```

- **Estados da etapa:**
  - Concluída: `CircleCheck` em `--success-text`.
  - **Atual:** círculo cheio `--primary`, rótulo 500 e `bg-active`.
  - Pendente: círculo vazado em `--fg-subtle`.
  - Com aviso: `TriangleAlert` em `--warning-text`.
  - Com erro: `CircleAlert` em `--danger-text`.
- Cada etapa concluída exibe **um resumo de uma linha**, que ajuda a recuperar o contexto ao retomar.
- **Cabeçalho do wizard:**
  - Breadcrumbs, título "Nova calibração" e o identificador do rascunho.
  - **Indicador de salvamento** (seção 4.6).
  - "Sair" (ghost) e o menu `⋯` (Excluir rascunho, Atalhos).
- **Rodapé fixo:** `[← Voltar: Padrões e ambiente]` · · · `[Avançar: Excentricidade →]`. **Ctrl+Enter** avança e **Ctrl+S** força o salvamento. Não use Alt+←, que é o "voltar" do navegador.

### 4.2 Conteúdo das etapas

| # | Etapa | Campos e comportamento |
|---|---|---|
| 1 | **Cliente e OS** | Cliente (combobox por nome ou CNPJ/CPF; "Cadastrar novo…" abre um drawer com o mesmo formulário de cliente). Contato solicitante. Nº da OS (opcional). Data da calibração (hoje). Local: **Laboratório** ou **Instalações do cliente** (endereço do cliente, editável). Técnico executor (o usuário logado). **Opções do certificado:** [ ] "O cliente solicitou a indicação da próxima calibração" (só então aparece a data ou intervalo, conforme ISO 17025 7.8.4.3); [ ] "Incluir declaração de conformidade" (abre a especificação, por exemplo Portaria 157/2022 classe III em verificação ou em serviço, e a **regra de decisão**: aceitação simples ou banda de guarda) |
| 2 | **Instrumento** | Balança do cliente (combobox por série, TAG ou modelo; "Cadastrar balança…" abre um drawer). Ao escolher, aparece um card-resumo (fabricante, modelo, nº de série, TAG, **Max, d, e, classe, unidade**, local) com "Editar dados". **Faixa calibrada:** total ou reduzida (Min–Max). Multi-faixa ou multi-intervalo em "Avançado". **Inspeção inicial** (checklist): nivelada, limpa, zero estável, sem danos visíveis, mais observações. Botão "Repetir configuração da última calibração (14/10/2025)" |
| 3 | **Padrões e ambiente** | **Pesos padrão** agrupados por kit, com checkbox. Cada linha mostra identificação, valor nominal, classe OIML (E2, F1, M1…), nº e laboratório do certificado e **validade**. **Padrão vencido aparece desabilitado**, com `Lock` e o motivo ("Vencido em 02/09/2026: não pode ser usado"). Isso mantém a rastreabilidade. Resumo: "Carga disponível: 85 kg · cobre Max 30 kg ✓". **Termo-higrômetro** (também é um padrão com validade). **Condições ambientais:** temperatura e umidade inicial e final (°C, %UR) e pressão (hPa, opcional). ΔT é calculado, com aviso se passar do limite configurado. **Procedimento** (por exemplo, "PT-01 · Calibração de IPNA conforme EURAMET cg-18") |
| 4 | **Repetibilidade** | Carga de ensaio (sugestão de 0,5 Max a Max, por exemplo "15 kg (0,5 Max)") com a composição dos padrões. Nº de repetições: **mínimo de 5** (ou **3 se a carga for ≥ 100 kg**), validado. Planilha: nº · indicação com carga · indicação sem carga (zero, opcional). **Calculados:** média, **desvio padrão s**, amplitude (máx − mín) e referência ao EMA nessa carga. No painel: gráfico de pontos (*strip plot*) com as leituras |
| 5 | **Excentricidade** | Carga Lecc (sugestão **≈ Max/3**, por exemplo 10 kg). Método (1–4 do cg-18; padrão 1). Formato da plataforma (retangular, circular). **Diagrama interativo** da plataforma com as 5 posições (1 centro, 2 frente-esquerda, 3 fundo-esquerda, 4 fundo-direita, 5 frente-direita): a posição da célula focada acende no diagrama, e **tocar numa posição foca a célula** (alvos de 56 px no tablet). Os valores aparecem dentro do diagrama. **Calculados:** ΔIᵢ = Iᵢ − I₁ por posição e \|ΔI\| máximo comparado ao EMA da carga |
| 6 | **Erro de indicação** | Modo de carregamento (crescente com descarga entre pontos · crescente contínuo · crescente e decrescente · decrescente). **Pontos sugeridos automaticamente:** 5 (0/Min, 25, 50, 75, 100 % Max) ou 11 (passos de 10 %), editáveis. A composição de padrões de cada ponto é sugerida pelo sistema e pode ser trocada. Planilha completa (4.3) com o **painel de resultados ao vivo** (erro, incerteza, EMA e gráfico). Interruptor **"Houve ajuste"**: cria as abas **"Antes do ajuste"** e **"Após o ajuste"** com os mesmos pontos (ISO 17025 7.8.4 d), e o PDF mostra as duas tabelas |
| 7 | **Revisão** | **Checklist automático:** padrões válidos ✓, ambiente registrado ✓, mínimo de leituras ✓, todos os pontos preenchidos ✓, signatário definido ✓. **Resumo de cada etapa** com "Editar". **Avisos** (pontos fora do EMA ou indeterminados, ΔT alto). **Prévia do PDF** (miniaturas das páginas, com abertura em tamanho real). Observações do certificado (texto livre e modelos). Signatário (responsável técnico). Com o fluxo de 2 pessoas ativo, o botão vira "Enviar para revisão" |
| 8 | **Emissão** | Modal de confirmação, geração do número e do PDF, e a tela de sucesso com as próximas ações (4.8) |

### 4.3 Planilha de leituras: navegação por teclado

**Implementação:** um grid próprio (`role="grid"`, `aria-rowcount`, `aria-colindex`) com `<input>` nativo em cada célula editável e **roving tabindex**. As tabelas são pequenas (≤ 11 linhas), então um componente sob medida é mais acessível e mais fácil de estilizar que um grid genérico.

O modelo de teclado segue o **WAI-ARIA APG (Data Grid)**, ajustado à **velocidade de digitação de leituras**, ao estilo do Excel:

| Tecla | Modo navegação (célula selecionada) | Modo edição (digitando) |
|---|---|---|
| Dígito, `,` `.` `-` | **Entra em edição substituindo o conteúdo** (como no Excel) | Digita |
| **Enter** | Entra em edição | **Confirma e desce** para a mesma coluna na linha seguinte (leitura do próximo ponto) |
| Shift+Enter | — | Confirma e sobe |
| **Tab** / Shift+Tab | Próxima / anterior célula editável; no fim da linha vai para o início da próxima; na última célula **sai do grid** (sem prender o foco) | Confirma e move |
| ↑ ↓ | Move entre linhas | **Confirma e move** |
| ← → | Move entre colunas | Move o cursor dentro do texto |
| **F2** | Edita sem apagar (cursor no fim) | Volta ao modo navegação |
| **Esc** | — | **Cancela a edição** e restaura o valor anterior. Esc nunca sai do wizard |
| Delete / Backspace | Limpa a célula (desfazível) | Apaga caractere |
| Home / End · Ctrl+Home / Ctrl+End | 1ª / última célula da linha · 1ª / última do grid | Início / fim do texto |
| **Ctrl+V** | **Cola uma coluna do Excel** (valores separados por quebra de linha ou tab) a partir da célula atual, para baixo | Cola no texto |
| Ctrl+D | Copia o valor da célula de cima | — |
| Ctrl+Z / Ctrl+Shift+Z | Desfaz / refaz no grid | Desfaz no texto |

**Anatomia visual da planilha:**

- **Grade fina nos dois sentidos** (`--border-subtle`). Ao contrário das tabelas de dados, a planilha precisa delimitar a célula.
- **Cabeçalho fixo** com a **unidade fixa** do instrumento: "Indicação (kg)". A unidade é definida na etapa 2 e não muda no meio da calibração. Durante a edição, a célula mostra o sufixo "kg" em `--fg-subtle`, como confirmação.
- **Células editáveis:**
  - Fundo `--surface`, texto à direita com `tabular-nums` e casas decimais forçadas pela resolução d (d = 0,005 kg → 3 casas).
  - **Foco:** anel de 2 px `--ring` com `rounded-sm`.
  - **Editando:** `shadow-sm` e cursor visível.
- **Células calculadas:**
  - Fundo `--surface-sunken`, texto `--fg` e **sem aparência de input**.
  - O cabeçalho dessas colunas leva o ícone `Calculator` de 12 px e o tooltip "Calculado automaticamente".
  - Clicar numa célula de U abre o **popover do orçamento de incerteza**.
- **Primeira coluna fixa** (nº e carga nominal).

**Proteções contra erro de digitação** (avisos âmbar, não bloqueantes):

- **Não múltiplo de d.** Sublinhado pontilhado âmbar e tooltip: "A indicação 10,003 não é múltipla de d = 0,005 kg. Confira."
- **Vírgula esquecida.** Se o técnico digita "10005" e o valor passa de 1,2 × Max, aparece: "Faltou a vírgula? **[Usar 10,005]**". A correção é um clique ou Enter.
- **Valor improvável.** Se \|E\| > 10 × EMA ou o desvio passa de 5 % da carga: "Valor improvável para a carga de 10 kg. Confira a leitura."
- **Separador decimal:** aceita "," e "."; exibe sempre com vírgula.
- **Caracteres inválidos** (letras) são ignorados no input, sem mensagem.

**Cálculo ao vivo:**

- Ao confirmar a célula (e com debounce de 100 ms enquanto digita), o sistema recalcula o **erro E = I − m_ref**, a **incerteza expandida U (k = 2)** e o **EMA** da linha.
- As células que mudam fazem um "flash" `bg-primary-subtle` que some em 250 ms (desativado com *reduced motion*).
- Uma região `aria-live="polite"`, que fala só ao confirmar a célula, anuncia o resultado: "Ponto 4, 20 quilos: erro mais 0,010 quilograma, fora do EMA de 0,0075."

**Colunas da planilha "Erro de indicação":**

| Nº | Carga nominal (kg) | Padrões | Valor da carga (kg) | Indicação ↑ (kg) | [Indicação ↓ (kg)] | **Erro E (kg)** | **U, k = 2 (kg)** | **EMA (kg)** | Situação |
|---|---|---|---|---|---|---|---|---|---|
| editável | editável | chips (popover para trocar) | calculado (soma dos valores convencionais) | **editável** | editável (se crescente e decrescente) | calculado | calculado | calculado | ícone + texto |

**Popover "Por que este U?"** (orçamento de incerteza do ponto, conforme EURAMET cg-18 §7):

| Componente | Distribuição | u (kg) | Contribuição |
|---|---|---|---|
| Resolução no zero (d₀/2√3) | Retangular | 0,00144 | ▇▇ 12 % |
| Resolução na carga (d/2√3) | Retangular | 0,00144 | ▇▇ 12 % |
| Repetibilidade (s = 0 nas 5 repetições) | Normal | 0 | — 0 % |
| Excentricidade (\|ΔI\|máx = 0,005 kg com Lecc = 10 kg, proporcional à carga) | Retangular | 0,00361 | ▇▇▇▇▇▇▇▇ 76 % |
| Padrões (U/k dos certificados: 2 × M1 10 kg + F1 5 kg) | Normal | 0,00011 | ▏ <1 % |
| **Incerteza combinada u_c** | — | **0,00415** | — |
| **U (k = 2, ≈ 95 %)** | — | **0,0083** | — |

> Os números são ilustrativos. As fórmulas e componentes definitivos vêm do levantamento técnico de metrologia. O design só exige que o **orçamento seja visível** para dar confiança e permitir auditoria. O Calibra Fácil, por exemplo, gera uma "impressão digital" do cálculo.

### 4.4 Indicação visual quando o erro passa do EMA

| Situação | Critério | Célula "Erro E" | Coluna "Situação" | Gráfico |
|---|---|---|---|---|
| **Conforme** | \|E\| + U ≤ EMA | Texto `--fg` normal | `CircleCheck` "Conforme" (success) | Ponto na cor da série |
| **Indeterminado** | \|E\| ≤ EMA < \|E\| + U | Texto `--warning-text` | `CircleHelp` "Indeterminado" (warning) | Ponto âmbar |
| **Fora do EMA** | \|E\| > EMA | **Fundo `--danger-subtle`**, texto `--danger-subtle-fg` 600 e **barra de 3 px `--danger` à esquerda da linha** | `OctagonX` "Fora do EMA" (danger) | Ponto vermelho com rótulo direto ("+0,010") |

- **Banner acima da planilha** quando há ponto fora do EMA: "1 ponto fora do EMA (20 kg: +0,010 kg; EMA ±0,0075 kg). Se o instrumento for ajustado, registre também os resultados após o ajuste. **[Registrar ajuste]**". O botão liga "Houve ajuste" e cria a aba "Após o ajuste".
- **A coluna EMA é transparente.** O tooltip mostra o raciocínio: "Classe III · e = 5 g · carga = 4.000e → faixa 2.000e–10.000e → ±1,5e = ±7,5 g (Portaria Inmetro 157/2022, Tabela 5; o critério aplicável é definido no levantamento técnico)".
- **Regra de decisão** (Configurações e etapa 1). Com **aceitação simples**, a tela continua mostrando U ao técnico, mas o PDF declara só "conforme" ou "não conforme". Com **banda de guarda**, vale a tabela acima. A regra usada é sempre impressa no certificado quando há declaração de conformidade (ISO 17025 7.8.6).
- **Nunca só cor:** ícone + texto na coluna "Situação", marcador na linha e símbolo no gráfico.

### 4.5 Mini gráfico erro × carga com barras de incerteza

| Elemento | Especificação |
|---|---|
| Tamanho | 288 × 180 px no painel ao vivo; 640 × 280 px na Revisão; o contêiner inclui a faixa do eixo X (sem rolagem interna) |
| Eixos | X = carga (0 a Max, com marcas nos pontos de ensaio); Y = erro, **simétrico em torno de zero** e escalado a 1,15 × max(EMA, \|E\| + U). Texto `text-xs` em `--fg-subtle` e `tabular-nums` |
| Grade | Só horizontais, linha fina **sólida** de 1 px `--chart-grid`; linha do zero de 1 px `--border-strong` |
| Envelope do EMA | Linhas **em degrau** (`stepAfter`) em ±EMA(carga), de 1 px **tracejadas** em `--danger-text` com 60 % de opacidade. Aqui o tracejado é semântico: é um limite. A faixa permitida entre elas é preenchida com `--muted` |
| Pontos | Círculos de **8 px** na cor da série (`--brand-600` no claro, `--brand-400` no escuro) com **anel de 2 px na cor da superfície**. Indeterminado em `--warning` e fora do EMA em `--danger` |
| Barras de incerteza | ±U, verticais de 1,5 px na cor do ponto, com remates de 6 px |
| Rótulos | **Seletivos**: só o ponto fora do EMA recebe rótulo direto; o resto fica no tooltip e na planilha |
| Legenda | É uma série só, então não há caixa de legenda. A legenda de símbolos fica numa linha abaixo: "● erro · ┆ ±U · ╌ EMA" |
| Interação | Hover ou foco num ponto (alvo de 24 px) abre um tooltip **com o valor em destaque**: "**+0,010 kg** · U 0,005 · EMA ±0,0075 · carga 20,000 kg". **Destaque vinculado**: selecionar uma linha na planilha acende o ponto e vice-versa |
| Acessibilidade | `role="img"` com um `aria-label` de resumo ("6 pontos; 1 fora do EMA em 20 kg"). A planilha é a "visão tabela" equivalente |
| Atualização | Os pontos deslizam 150 ms para a nova posição; sem animação com *reduced motion* |
| Implementação | SVG próprio (~150 linhas, controle total) ou Recharts (`ComposedChart` + `Scatter` + `ErrorBar` + `Line type="stepAfter"`) |

### 4.6 Salvamento automático do rascunho

- **Quando existe o rascunho:** ao concluir a etapa 1, o servidor cria o registro e um identificador (`R-0091`). Antes disso, os dados ficam só no dispositivo.
- **Duas camadas:**
  1. **Diário local** (IndexedDB), gravado **a cada alteração**. Sobrevive a queda de energia, aba fechada e falta de rede.
  2. **Servidor:** `PATCH` com debounce de **800 ms** depois da última alteração e no máximo a cada 5 s durante digitação contínua. Envia só o que mudou e leva o nº de versão (concorrência otimista).
- **Indicador no cabeçalho** do wizard, discreto, com `aria-live="polite"` e sem anunciar cada salvamento:

| Estado | Visual |
|---|---|
| Salvo | `Check` + "Salvo às 14:32" em `--fg-subtle` |
| Salvando | Spinner de 12 px + "Salvando…" |
| Pendente (offline ou erro) | `CloudOff` em `--warning-text` + "Sem conexão: salvo neste dispositivo". Reenvio automático com espera crescente e o botão "Tentar agora" |
| Conflito | `TriangleAlert` + "Alterado em outro dispositivo" → modal (abaixo) |

- **Duas abas ou dois dispositivos:** um `BroadcastChannel` detecta o mesmo rascunho aberto em outra aba e deixa uma delas **somente leitura**, com o banner "Este rascunho está aberto em outra aba. [Editar aqui]". Se houver conflito de versão no servidor, aparece um modal: "Este rascunho foi alterado no tablet de Carlos às 14:30. [Ver diferenças] [Manter o meu] [Usar o outro]".
- **Sessão expirada:** abre um **modal de login por cima da tela**. Não há redirecionamento e nada se perde.

### 4.7 Prevenção de perda de dados

1. **`beforeunload`** só quando há alterações **ainda não enviadas ao servidor**. Se está tudo salvo, sair é livre.
2. **Bloqueio de navegação interna** (por exemplo, `useBlocker` do React Router) com a mesma condição: "Há alterações que ainda não chegaram ao servidor. Elas estão guardadas neste dispositivo. [Ficar] [Sair mesmo assim]".
3. **"Sair" do wizard não assusta:** como tudo está salvo, mostra só o toast "Rascunho R-0091 salvo. Continue em Certificados › Rascunhos".
4. **Esc nunca descarta** dados do wizard. Cancela só a edição da célula.
5. **Exclusão de rascunho:** modal de confirmação com o resumo ("Padaria Bom Pão · Toledo 2098 · 18 leituras"), exclusão suave e toast com **"Desfazer"** por 8 s.
6. **Recuperação ao abrir:** se o diário local tem dados mais novos que o servidor, aparece o banner "Recuperamos alterações não enviadas de 14:31 (3 leituras). [Aplicar] [Descartar]".
7. **Undo/redo** na planilha (Ctrl+Z e Ctrl+Shift+Z) com histórico por etapa.
8. **Mudança destrutiva de configuração** (trocar a balança ou a unidade depois de já haver leituras) pede confirmação e explica o impacto: "As 18 leituras serão mantidas, mas os EMAs serão recalculados".

### 4.8 Revisão, emissão e depois

- **Emitir** (primário na Revisão; desabilitado com tooltip enquanto o checklist falha). Abre o modal:
  > **Emitir o certificado BC-2026-00124?**
  > Padaria Bom Pão Ltda · Toledo 2098 (série 4471-B) · calibrado em 14/10/2026 · signatário: Eng. Marina Souza
  > Depois da emissão, os dados ficam **bloqueados**. Correções exigem uma **revisão**, que é um novo certificado que substitui este.
  > [Cancelar] [**Emitir e gerar PDF**]
- **Tela de sucesso:** um check que se desenha em 200 ms, o número em destaque (`text-2xl`, `slashed-zero`) e as ações **Baixar PDF**, **Enviar por e-mail** (já com os contatos marcados como "recebe certificados"), **Imprimir**, **Ver certificado** e "Nova calibração para este cliente".
- **Cancelar certificado:** modal destrutivo com **motivo obrigatório** (mínimo de 10 caracteres) e confirmação digitando o nº do certificado. O status passa a "Cancelado". O PDF, se baixado de novo, sai com a marca d'água "CANCELADO".
- **Revisar (emenda, ISO 17025 7.8.8):** cria um rascunho "Revisão 1 de BC-2026-00124" pré-preenchido. Ao emitir, o original vira "Substituído por BC-2026-00131" e o novo PDF traz: "Este certificado substitui o certificado nº BC-2026-00124, emitido em 14/10/2026. Motivo: …".

---

## 5. Design do certificado em PDF

O certificado é o produto que o cliente vê, imprime e arquiva. Ele precisa ser **sóbrio, rigoroso e bonito**: tipografia limpa, muito espaço em branco, tabelas legíveis, a cor da marca em doses mínimas e funcionando bem impresso em preto e branco.

### 5.1 Página, margens e grid

| Item | Valor |
|---|---|
| Formato | A4 retrato, 210 × 297 mm |
| Margens | Superior 12 mm (até o cabeçalho) · laterais **16 mm** · inferior 12 mm. Nada a menos de 5 mm da borda (limite das impressoras de escritório) |
| Área útil | 178 mm de largura |
| Grid | **12 colunas** de ≈ 11,2 mm com calhas de 4 mm. Blocos de dados usam 3, 4 ou 6 colunas, e tabelas usam toda a largura |
| Zonas verticais | Cabeçalho da 1ª página: 12–42 mm (bloco de título). Cabeçalho das demais: 12–26 mm (compacto). Rodapé: 279–285 mm. Corpo: do fim do cabeçalho até 272 mm |
| Ritmo | Entrelinha base de 12 pt (corpo 9 pt). Espaços em múltiplos de 4 pt: 4, 8, 12, 16 e 24 pt; 24 pt entre seções |

### 5.2 Hierarquia tipográfica (Inter estática embutida: 400, 500 e 600)

| Elemento | Tamanho / entrelinha | Peso | Cor | Notas |
|---|---|---|---|---|
| Título "Certificado de calibração" | 16 / 20 pt | 600 | `#161a1f` | Uma vez, na 1ª página |
| Nº do certificado | 12 / 16 pt | 600 | `#161a1f` | `tnum` + `zero` (zero cortado) |
| Título de seção ("3  Calibração") | 10 / 14 pt | 600 | `#161a1f` | Número da seção na cor da marca (passo 700), fio de 0,5 pt abaixo |
| Rótulo de campo | 7 / 9 pt, CAIXA ALTA, +4 % de espaçamento | 500 | `#5c626b` | Em papel, caixa alta pequena é um padrão clássico de formulário técnico |
| Valor de campo | 9 / 12 pt | 400 | `#161a1f` | — |
| Texto corrido e declarações | 8,5 / 12 pt | 400 | `#161a1f` | Máximo de 100 caracteres por linha |
| Cabeçalho de tabela | 7,5 / 10 pt | 500 | `#5c626b` | Fundo `#f4f6f8`, unidade entre parênteses |
| Célula de tabela | 8,5 / 11 pt | 400 | `#161a1f` | **`tnum`**, à direita, mesmas casas decimais por coluna |
| Rodapé | 7 / 9 pt | 400 | `#5c626b` | — |

O corpo mínimo é de **7 pt**. Não use itálico nos números.

### 5.3 Cabeçalho e rodapé (em todas as páginas)

- **Cabeçalho da 1ª página:**
  - Logo (altura de 10 mm, versão clara).
  - Dados do laboratório: razão social, CNPJ, endereço e contato, em 7 pt.
  - À direita: "Certificado de calibração", **Nº BC-2026-00124**, data de emissão, revisão e a acreditação, se houver (por exemplo, o selo e o nº da Cgcre, só quando aplicável).
  - Por baixo, um **fio de 1 pt na cor da marca** atravessando a área útil.
- **Cabeçalho das demais páginas (compacto):** logo de 7 mm à esquerda; "Certificado de calibração nº BC-2026-00124" à direita; fio de 0,5 pt em cinza.
- **Rodapé de todas as páginas** (fio de 0,5 pt acima):
  - **Linha 1:** "Este certificado só pode ser reproduzido na íntegra, sem autorização por escrito da Balanças.com." (EURAMET cg-18 §8.1).
  - **Linha 2:** "BC-2026-00124 · emitido em 14/10/2026 · verifique em verificar.balancas.com/c/7KQ2-9XHM" à esquerda e **"Página X de Y"** à direita, com `tnum`.
- **Fim do documento:** depois das assinaturas, centralizado, aparece "— Fim do certificado —" em 7,5 pt `#5c626b` (ISO 17025 7.8.2.1 d).

### 5.4 Estrutura e ordem das seções

O conteúdo segue a ISO 17025 (7.8.2 e 7.8.4) e o EURAMET cg-18 (§8):

1. **Cliente:** razão social ou nome, CNPJ/CPF, endereço, solicitante e OS.
2. **Instrumento calibrado:** tipo, fabricante, modelo, nº de série, identificação (TAG), **Max, d, e, classe**, local de instalação e faixa calibrada (se reduzida).
3. **Calibração:** data, local (laboratório ou cliente), procedimento, condições ambientais (início → fim), inspeção inicial e **ajuste** (realizado ou não, interno ou externo).
4. **Padrões utilizados e rastreabilidade:** tabela (padrão, classe, nº do certificado, laboratório e acreditação, validade) e a declaração de rastreabilidade ao SI.
5. **Resultados:**
   - 5.1 **Repetibilidade:** leituras, média, **s**, carga e nº de repetições.
   - 5.2 **Excentricidade:** mini diagrama da plataforma (25 × 18 mm) e tabela das posições 1–5 com ΔI.
   - 5.3 **Erro de indicação:** tabela; com ajuste, **"Antes do ajuste"** e **"Após o ajuste"**.
   - Gráfico opcional erro × carga (80 × 45 mm, em cinza com pontos pretos, porque o certificado precisa funcionar em P&B).
6. **Incerteza de medição:** "A incerteza expandida de medição relatada é declarada como a incerteza padrão combinada multiplicada pelo fator de abrangência k = 2, que, para uma distribuição normal, corresponde a uma probabilidade de abrangência de aproximadamente 95 %."
7. **Declaração de conformidade** (só se solicitada): especificação, critério (verificação ou em serviço) e **regra de decisão** utilizada.
8. **Observações:**
   - "Os resultados referem-se exclusivamente ao instrumento calibrado, nas condições especificadas."
   - Ajustes realizados.
   - **Próxima calibração, só se solicitada pelo cliente.**
   - "Substitui o certificado nº …", em revisões.
9. **Assinaturas, QR code e fim do certificado.**

### 5.5 Tabelas de medição legíveis

- **Sem linhas verticais.** Use um fio de 0,5 pt sob o cabeçalho, fios de 0,25 pt `#e9ebee` entre linhas e um fio de 0,5 pt no fim da tabela. Linhas com cerca de 5,5 mm de altura.
- **Cabeçalho alinhado pela base**, com a unidade: "Indicação (kg)", "Erro (kg)", "U (kg)". Os símbolos são explicados numa nota abaixo da tabela: "E = I − m_ref · U = incerteza expandida, k = 2".
- **Números à direita, com a mesma quantidade de casas decimais** (ditada por d) e sinal explícito nos erros (+0,005 / −0,005).
- **Grupos de colunas** (medição × incerteza × conformidade) separados por **espaço extra** (6 mm), não por linhas.
- **Conformidade com símbolo e texto**, sem depender de cor: "✓ Conforme", "? Indeterminado", "✕ Não conforme".
- **Quebra de página:** nenhuma linha se parte. Se a tabela continuar, repita o cabeçalho e marque "(continuação)". O título da seção nunca fica sozinho no fim da página.

### 5.6 Cores discretas da marca

- A marca aparece **só** no logo, no fio de 1 pt do cabeçalho da 1ª página e nos números de seção (passo 700, que imprime bem e passa contraste).
- Texto em `#161a1f`, secundário em `#5c626b`, fios `#dde0e4` e `#e9ebee`, fundo de cabeçalho de tabela `#f4f6f8`.
- **QR code sempre preto sobre branco** (leitura confiável). Nada de fundos coloridos grandes: menos de 5 % da página com tinta colorida.
- O PDF é **sempre em tema claro**, mesmo gerado com a interface em modo escuro.

### 5.7 QR code de autenticidade

| Item | Especificação |
|---|---|
| Tamanho e posição | **22 × 22 mm** (mínimo de 18 mm para leitura a 20–30 cm), nível de correção **M**, zona de silêncio de ≥ 4 módulos. Na última página, ao lado das assinaturas |
| Conteúdo | URL com **código aleatório não sequencial** (por exemplo, 10 caracteres base32: `https://verificar.balancas.com/c/7KQ29XHM4P`), para impedir a enumeração de certificados |
| Texto ao lado | "Verifique a autenticidade deste certificado" + URL curta + código "7KQ2-9XHM" (`slashed-zero`). A URL também aparece **no rodapé de todas as páginas** |
| Página de verificação | Nº, data de emissão, cliente (nome parcialmente mascarado), instrumento (modelo e série), **status** (Válido / Cancelado / Substituído por …) e o **hash SHA-256** do PDF original para comparação |
| **Restrição da rede local** | O sistema roda na LAN, então **a URL do QR precisa ser alcançável pela internet**. As opções vão para a decisão de arquitetura: (a) um endpoint público mínimo, só leitura, sincronizado a partir da LAN; (b) uma página no site da empresa que consulta esse endpoint; (c) sem exposição pública, o QR traz o código + hash e o cliente confirma com a empresa. **Não imprima um QR que leve a um endereço interno** (`192.168.x.x`) |

### 5.8 Área de assinatura

```
  Executado por                                   Responsável técnico (signatário autorizado)

                                                   [imagem da assinatura 40 × 14 mm]
  ______________________________                  ______________________________     ┌────────┐
  Carlos Lima                                      Eng. Marina Souza                  │ QR     │
  Técnico de calibração                            Responsável técnico · CREA-SP …   │ 22 mm  │
                                                                                      └────────┘
  Mauá, 14 de outubro de 2026                      Verifique: verificar.balancas.com/c/7KQ2-9XHM

                                   — Fim do certificado —
```

- Imagem da assinatura em **PNG transparente**, cadastrada em Configurações, com prévia sobre papel branco.
- Com **assinatura digital ICP-Brasil (PAdES)**, que é opcional, acrescente "Documento assinado digitalmente por MARINA SOUZA em 14/10/2026 10:41". A validação acontece no leitor de PDF.
- **Marcas d'água:**
  - Prévia de rascunho: "RASCUNHO — SEM VALIDADE" na diagonal, cinza a 8 %.
  - Certificado cancelado: "CANCELADO" na diagonal, vermelho a 12 %.
- **Metadados do PDF:** título "Certificado de calibração BC-2026-00124", autor, assunto, idioma `pt-BR`, fontes embutidas (subconjunto). Se a biblioteca permitir, **PDF/A-2b** para arquivamento.

### 5.9 Notas de implementação (a decisão técnica fica no documento de arquitetura)

- **@react-pdf/renderer:** cabeçalho e rodapé com `fixed`; número de página com `<Text render={({ pageNumber, totalPages }) => \`Página ${pageNumber} de ${totalPages}\`} fixed />` (o `totalPages` só existe em `Text`); `wrap={false}` nas linhas e blocos que não podem quebrar; `minPresenceAhead` nos títulos de seção; Inter registrada em **TTF estático** (400, 500 e 600).
- **Alternativa:** HTML/CSS impresso com Chromium headless. A tipografia fica melhor e o CSS é reaproveitado, mas o servidor fica mais pesado. Os números de página saem do `footerTemplate` com `pageNumber` e `totalPages`.

### 5.10 Referências de relatórios técnicos bonitos

- **Faturas e recibos da Stripe:** hierarquia clara, muito branco, tons de cinza com um acento só.
- **Accuracy Calibration Certificate da Mettler-Toledo:** resultados *as found* e *as left*, incerteza na calibração e "em uso", anexo de peso mínimo.
- **Certificados de institutos nacionais (NIST, PTB):** seções numeradas, declarações padronizadas, rigor de unidades.
- **Grid suíço (Müller-Brockmann):** colunas, alinhamentos fortes e assimetria controlada.
- **Tabelas:** Matthew Butterick (*Practical Typography*: tire as bordas e devolva só as necessárias; aumente o padding) e Matt Ström-Awn (números à direita, algarismos tabulares, unidades no cabeçalho, sem zebra, sem centralizar).
- **Checklists de conteúdo:** EURAMET cg-18 §8 e o *crosswalk* ISO 17025 7.8 do NIST.

### 5.11 Wireframe do PDF

**Página 1 de 3** (o fio duplo `═` é o fio de 1 pt na cor da marca)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│  [LOGO]  Balanças.com Assistência Técnica Ltda              Certificado de calibração    │
│          CNPJ 00.000.000/0001-00                            Nº BC-2026-00124             │
│          Rua Exemplo, 100 · Mauá/SP · 09300-000             Emissão 14/10/2026 · Rev. 0  │
│          (11) 0000-0000 · laboratorio@balancas.com                                       │
│  ══════════════════════════════════════════════════════════════════════════════════════  │
│                                                                                          │
│  1  Cliente                                                                              │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  RAZÃO SOCIAL                 CNPJ                     SOLICITANTE            OS         │
│  Padaria Bom Pão Ltda         11.222.333/0001-81       João Pereira           2291       │
│  ENDEREÇO                                                                                │
│  Av. Brasil, 1500 · Centro · Santo André/SP · 09010-000                                  │
│                                                                                          │
│  2  Instrumento calibrado                                                                │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  TIPO                          FABRICANTE / MODELO      Nº DE SÉRIE      IDENTIFICAÇÃO   │
│  IPNA · balança de plataforma  Toledo 2098              4471-B           TOL-0042        │
│  CAPACIDADE (Max)   DIVISÃO (d)    DIVISÃO DE VERIF. (e)   CLASSE    LOCAL               │
│  30 kg              0,005 kg       0,005 kg                III       Balcão de vendas    │
│                                                                                          │
│  3  Calibração                                                                           │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  DATA           LOCAL                        PROCEDIMENTO                                │
│  14/10/2026     Instalações do cliente       PT-01 rev. 3 · base EURAMET cg-18 v4.0      │
│  TEMPERATURA          UMIDADE RELATIVA        AJUSTE                                     │
│  22,4 → 22,9 °C       55 → 54 %UR             Realizado: resultados antes e após (5.3)   │
│                                                                                          │
│  4  Padrões utilizados e rastreabilidade                                                 │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  Padrão                          Classe   Certificado     Laboratório          Validade  │
│  ······················································································  │
│  Conjunto de massas 1 g a 5 kg   F1       12345/26        Lab. X · RBC         03/2027   │
│  Massas 10 kg #03 e #04          M1       12346/25        Lab. X · RBC         11/2026   │
│  Termo-higrômetro TH-02          —        9876/26         Lab. Y · RBC         05/2027   │
│  Os padrões são rastreáveis ao Sistema Internacional de Unidades (SI) por meio da Rede   │
│  Brasileira de Calibração (RBC/Inmetro).                                                 │
│                                                                                          │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  Este certificado só pode ser reproduzido na íntegra, sem autorização por escrito.       │
│  BC-2026-00124 · emitido em 14/10/2026 · verificar.balancas.com/c/7KQ2-9XHM  Pág. 1 de 3 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Página 2 de 3**

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  [logo]                                       Certificado de calibração nº BC-2026-00124 │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  5  Resultados                                                                           │
│                                                                                          │
│  5.1 Repetibilidade · carga 15 kg · 5 repetições                                         │
│  Leitura (kg)      1          2          3          4          5      Média     s (kg)   │
│  ······················································································  │
│               15,000     15,000     15,000     15,000     15,000     15,000    0,0000    │
│                                                                                          │
│  5.2 Excentricidade · carga 10 kg (≈ Max/3)                                              │
│  Posição              1       2       3       4       5 ┌─────────────────┐ 1 centro     │
│  ······················································ │ 3             4 │ 2 frente-esq.│
│  Indicação (kg)  10,000  10,005  10,000   9,995  10,005 │        1        │ 3 fundo-esq. │
│  ΔI (kg)              —  +0,005   0,000  −0,005  +0,005 │ 2             5 │ 4 fundo-dir. │
│  Maior |ΔI|: 0,005 kg                                   └───── frente ────┘ 5 frente-dir.│
│                                                                                          │
│  5.3 Erro de indicação · cargas crescentes com descarga entre pontos                     │
│                                                                                          │
│  Antes do ajuste                                                                         │
│  Nº   Carga (kg)  Indicação (kg)  Erro (kg)    U (kg)    k     EMA (kg)  Conformidade    │
│  ······················································································  │
│  1       5,000          5,000        0,000     0,0043   2,00   ±0,005    ✓ Conforme      │
│  2      10,000         10,000        0,000     0,0050   2,00   ±0,005    ✓ Conforme      │
│  3      15,000         15,000        0,000     0,0060   2,00   ±0,0075   ✓ Conforme      │
│  4      20,000         20,010       +0,010     0,0071   2,00   ±0,0075   ✕ Não conforme  │
│  5      25,000         25,005       +0,005     0,0083   2,00   ±0,0075   ? Indeterminado │
│  6      30,000         30,000        0,000     0,0096   2,00   ±0,0075   ? Indeterminado │
│                                                                                          │
│  Após o ajuste                                                                           │
│  (mesma estrutura, com os resultados após o ajuste)                                      │
│                                                                                          │
│  E = I − m_ref · U = incerteza expandida (k = 2, ≈ 95 %) · EMA: Portaria Inmetro         │
│  157/2022 (Tabela 5), classe III · regra de decisão: banda de guarda (|E| + U ≤ EMA)     │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  Este certificado só pode ser reproduzido na íntegra, sem autorização por escrito.       │
│  BC-2026-00124 · emitido em 14/10/2026 · verificar.balancas.com/c/7KQ2-9XHM  Pág. 2 de 3 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

A página 3 traz a incerteza (6), a declaração de conformidade (7), as observações (8), a área de assinatura com o QR (5.8) e "— Fim do certificado —".

---

## 6. Wireframes ASCII

Convenções:

- `▌` marca o item ativo, a linha selecionada ou a célula focada.
- `[ ]` é um campo ou botão; `( )` é um chip, opção ou segmento.
- `✦` marca um campo auto-preenchido.
- `●` é um ponto de status; a cor vem do token e o texto vai sempre junto.
- `ƒ` marca uma coluna calculada.

Os ícones são do lucide-react (seção 2.2) e foram omitidos para legibilidade. A largura de referência é de 1440 px no desktop e 768 px no tablet. A barra lateral (256 px) aparece expandida.

### 6.1 Painel

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Painel                                      [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ Bom dia, Ana                                                   [ Este mês         ▾ ] │
│ └──────────────────┘ │ Quarta-feira, 14 de outubro de 2026 · dados de 01/10 a 14/10                          │
│                      │                                                                                       │
│ Visão geral          │ ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐ │
│ ▌ Painel             │ │Certificados     │   │Calibrações de   │   │Padrões vencendo │   │Rascunhos        │ │
│                      │ │emitidos         │   │clientes vencendo│   │em 60 dias       │   │em aberto        │ │
│ Operação             │ │                 │   │em 30 dias       │   │                 │   │                 │ │
│   Certificados   (3) │ │48               │   │23               │   │2                │   │3                │ │
│   Clientes           │ │▲ 12% vs. set.   │   │● 7 já vencidas  │   │● 1 vencido·bloq.│   │R-0091 · Bom Pão │ │
│   Balanças           │ │▁▂▃▂▄▅▄▆▅▇▆█ 12 m│   │Ver lista →      │   │Ver padrões →    │   │Continuar →      │ │
│                      │ └─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘ │
│ Metrologia           │                                                                                       │
│   Padrões          ● │ ┌──────────────────────────────────────────────────────────┐ ┌──────────────────────┐ │
│                      │ │Últimos certificados                  Ver todos →         │ │Vencendo em breve     │ │
│ Sistema              │ ├──────────────────────────────────────────────────────────┤ ├──────────────────────┤ │
│   Configurações      │ │Nº            Cliente         Balança     Data  Status    │ │Mercado Dois Irmãos   │ │
│                      │ ├──────────────────────────────────────────────────────────┤ │Filizola 15 kg        │ │
│                      │ │BC-2026-00124 Padaria Bom Pão Toledo 2098 14/10 ✓ Emitido │ │● Vence em 3 dias     │ │
│                      │ │BC-2026-00123 Frigorífico Va… Balmak 300  13/10 ✓ Emitido │ │        [@ Avisar]    │ │
│                      │ │BC-2026-00122 Farmácia Sol    Shimadzu AY 13/10 ✓ Emitido │ ├──────────────────────┤ │
│                      │ │R-0090        Mercado Ideal   Filizola 15 12/10 ✎ Rascunho│ │Restaurante Sabor     │ │
│                      │ │BC-2026-00121 Lab. Análise    Marte AD5   12/10 ⊘ Cancel. │ │Toledo Prix 3         │ │
│                      │ │BC-2026-00120 Açougue Boi     Urano 30    11/10 ✓ Emitido │ │● Vencida há 5 dias   │ │
│                      │ │BC-2026-00119 Padaria Trigo   Toledo 9094 10/10 ✓ Emitido │ │        [@ Avisar]    │ │
│                      │ │BC-2026-00118 Hortifruti 3M   Ramuza 15   10/10 ✓ Emitido │ │Ver todos (30) →      │ │
│                      │ └──────────────────────────────────────────────────────────┘ └──────────────────────┘ │
│                      │                                                              ┌──────────────────────┐ │
│                      │                                                              │Padrões a recalibrar  │ │
│                      │                                                              ├──────────────────────┤ │
│                      │                                                              │M1-10kg #03           │ │
│ ──────────────────── │                                                              │● Vence em 41 dias    │ │
│ (AS) Ana Souza     ⋯ │                                                              │TH-01 termo-higr.     │ │
│      Administradora  │                                                              │● Vencido: bloqueado  │ │
│                      │                                                              │Ver padrões →         │ │
│                      │                                                              └──────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- A linha de filtros (período) fica acima de tudo e vale para todos os blocos. Cada card de KPI inteiro leva à lista filtrada.
- O valor dos KPIs usa algarismos proporcionais; a tabela "Últimos certificados" usa algarismos tabulares e status com ícone e texto.
- "Vencendo em breve" tem uma ação direta (**Avisar**: e-mail de lembrete ao contato do cliente). "Padrões a recalibrar" destaca o padrão **bloqueado**.

### 6.2 Clientes (lista)

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Clientes                                    [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ Clientes                                               [⇪ Importar]  [+ Novo cliente] │
│ └──────────────────┘ │ Empresas e pessoas atendidas · 214 clientes                                           │
│                      │                                                                                       │
│ Visão geral          │ [⌕ Filtrar por nome, CNPJ/CPF ou cidade…   / ]  (+ Tipo) (Cidade: Santo André ×)      │
│   Painel             │ (+ Situação) (+ Vencimento)                         Limpar filtros      38 clientes   │
│                      │                                                                                       │
│ Operação             │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│   Certificados   (3) │ │□ Cliente ↑              CNPJ / CPF         Cidade/UF      Bal.  Próx. vencimento  │ │
│ ▌ Clientes           │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│   Balanças           │ │□ Açougue Boi Gordo Ltda 45.118.902/0001-30 Santo André/SP    2  ● 02/11/2026      │ │
│                      │ │□ Farmácia Sol Nascente  08.441.215/0002-77 Santo André/SP    5  ● 17/10/2026      │ │
│ Metrologia           │ │□ Hortifruti 3 Marias ME 31.902.664/0001-05 Santo André/SP    3  ● 21/03/2027      │ │
│   Padrões          ● │ │■ Padaria Bom Pão Ltda   11.222.333/0001-81 Santo André/SP    4  ● 14/10/2027      │ │
│                      │ │□ Mercado Dois Irmãos    12.ABC.345/01DE-35 Santo André/SP    6  ● vencida 09/10  ⋯│ │
│ Sistema              │ │□ José Carlos Pereira    529.982.247-25     Santo André/SP    1  ○ sem previsão    │ │
│   Configurações      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │1–38 de 38          Linhas por página [50 ▾]       ‹ Anterior  1  Próxima ›        │ │
│                      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
│                      │                                                                                       │
│                      │ Legenda: ● verde = válida · ● âmbar = vence ≤ 30 dias · ● vermelho = vencida.         │
│ ──────────────────── │ Linha em hover (Mercado Dois Irmãos): fundo --hover + ações [▸ Calibrar] [@] [⋯].     │
│ (AS) Ana Souza     ⋯ │ Linha selecionada (■) com fundo --primary-subtle → barra flutuante:                   │
│      Administradora  │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│                      │ │1 selecionado    [@ Enviar lembrete de vencimento]  [⇩ Exportar CSV]   Limpar      │ │
│                      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- A busca local (`/`) ignora acentos e pontuação, e os chips de filtro ficam na URL.
- A linha inteira abre o detalhe; as ações aparecem no hover ou no foco.
- O CNPJ alfanumérico (2026) aparece no mesmo formato visual do numérico.

### 6.3 Cliente: formulário PF/PJ com preenchimento automático por CNPJ e CEP

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Clientes › Novo cliente                     [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ Novo cliente                                                                          │
│ └──────────────────┘ │ Com o CNPJ, buscamos razão social e endereço automaticamente.                         │
│                      │                                                                                       │
│ Visão geral          │ ┌────────────────────┬────────────────────┐                                           │
│   Painel             │ │ ● Pessoa jurídica  │ ○ Pessoa física    │  ← troca sem perder dados                 │
│                      │ └────────────────────┴────────────────────┘                                           │
│ Operação             │                                                                                       │
│   Certificados   (3) │ Identificação           ┌──────────────────────────────────────────────────────────┐  │
│ ▌ Clientes           │ Dados da empresa como   │✦ Dados preenchidos a partir do CNPJ. Situação: ATIVA.    │  │
│   Balanças           │ constam na Receita.     │  Revise antes de salvar.                     [Desfazer]  │  │
│                      │                         └──────────────────────────────────────────────────────────┘  │
│ Metrologia           │                         CNPJ                                 Situação cadastral       │
│   Padrões          ● │                         [11.222.333/0001-81      ✓  ⌕ ]      ● Ativa desde 05/1998    │
│                      │                         Consultado na Receita · 14/10 10:32                           │
│ Sistema              │                                                                                       │
│   Configurações      │                         Razão social                                                  │
│                      │                         [Padaria Bom Pão Ltda                                   ✦]    │
│                      │                         Nome fantasia                   Inscrição estadual (opcional) │
│                      │                         [Padaria Bom Pão             ✦]  [123.456.789.110          ]  │
│                      │ ····················································································· │
│                      │ Endereço                CEP                                                           │
│                      │ Impresso no             [09010-000   ✓ ]   ✦ Endereço preenchido pelo CEP             │
│                      │ certificado.            Logradouro                                  Número            │
│                      │                         [Avenida Brasil                        ✦]  [1500▌    ] ← foco │
│                      │                         Complemento (opcional)        Bairro                          │
│                      │                         [                       ]     [Centro                   ✦]    │
│                      │                         Cidade                                      UF                │
│                      │                         [Santo André                            ✦]  [SP    ✦]         │
│                      │ ····················································································· │
│                      │ Contatos                ┌───────────────────────────────────────────────────────────┐ │
│                      │ Quem recebe os          │Nome           Função     E-mail                   Recebe @│ │
│                      │ certificados por        ├───────────────────────────────────────────────────────────┤ │
│                      │ e-mail.                 │João Pereira   Gerente    joao@bompao.com.br          ■   ⋯│ │
│                      │                         │Compras        —          compras@bompao.com.br       ■   ⋯│ │
│                      │                         └───────────────────────────────────────────────────────────┘ │
│                      │                         [+ Adicionar contato]                                         │
│                      │                                                                                       │
│                      │ Observações (opcional)  [                                                          ]  │
│                      │                                                                                       │
│                      │ ───────────────────────────────────────────────────────────────────────────────────── │
│                      │ ● Alterações não salvas · Ctrl+S                         [Cancelar]  [Salvar cliente] │
│                      │                                                                                       │
│                      │ ESTADO "BUSCANDO…" (logo após digitar o 14º caractere válido):                        │
│ ──────────────────── │ CNPJ [11.222.333/0001-81   ◌ ]  Consultando a Receita Federal…  (aria-live)           │
│ (AS) Ana Souza     ⋯ │ Razão social  [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒]   ← skeleton, aria-busy, só leitura       │
│      Administradora  │ Sem internet: "Não foi possível consultar agora. Preencha manualmente." [Tentar]      │
│                      │ Duplicado:    "Já existe cliente com este CNPJ: Padaria Bom Pão Ltda" [Abrir cliente] │
│                      │ ✦ = auto-preenchido: fundo --autofill (lilás) + ícone Sparkles + tooltip de origem.   │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- A mesma tela serve para **Editar cliente**, com o título "Editar · Padaria Bom Pão Ltda" e o botão "Salvar alterações".
- Dentro do wizard, o mesmo formulário abre num **drawer** em versão compacta.
- Depois do auto-preenchimento do CEP, o foco vai para **Número**.

### 6.4 Detalhe do cliente

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Clientes › Padaria Bom Pão Ltda             [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ ┌────┐ Padaria Bom Pão Ltda  [PJ] [● Ativa]    [✎ Editar]  [⋯]  [+ Nova calibração]   │
│ └──────────────────┘ │ │ PB │ CNPJ 11.222.333/0001-81 ⧉ · Santo André/SP · cliente desde 03/2019             │
│                      │ └────┘                                                                                │
│ Visão geral          │ Visão geral    Balanças (4)    Certificados (17)    Contatos (2)    Histórico         │
│   Painel             │ ━━━━━━━━━━━                                                                           │
│                      │                                                                                       │
│ Operação             │ ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐ │
│   Certificados   (3) │ │Próximo vencimento       │  │Último certificado       │  │Balanças                 │ │
│ ▌ Clientes           │ │● 02/11/2026             │  │BC-2026-00124            │  │4 ativas                 │ │
│   Balanças           │ │Toledo Prix 3 · 19 dias  │  │14/10/2026 · ✓ Emitido   │  │1 com ajuste em 2026     │ │
│                      │ └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘ │
│ Metrologia           │                                                                                       │
│   Padrões          ● │ ┌───────────────────────────────────────────────────────────┐ ┌─────────────────────┐ │
│                      │ │Dados cadastrais                                 [✎ Editar]│ │Contatos             │ │
│ Sistema              │ ├───────────────────────────────────────────────────────────┤ ├─────────────────────┤ │
│   Configurações      │ │Razão social     Padaria Bom Pão Ltda                      │ │João Pereira         │ │
│                      │ │Nome fantasia    Padaria Bom Pão                           │ │Gerente · recebe @   │ │
│                      │ │CNPJ             11.222.333/0001-81                     ⧉  │ │joao@bompao.com.br   │ │
│                      │ │Insc. estadual   123.456.789.110                           │ │(11) 98765-4321      │ │
│                      │ │Endereço         Av. Brasil, 1500 · Centro                 │ ├─────────────────────┤ │
│                      │ │                 Santo André/SP · 09010-000                │ │Compras · recebe @   │ │
│                      │ │Observações      Acesso pela doca dos fundos, 7h–11h.      │ │compras@bompao.com.br│ │
│                      │ └───────────────────────────────────────────────────────────┘ └─────────────────────┘ │
│                      │                                                                                       │
│                      │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│                      │ │Balanças                                            [+ Nova balança]               │ │
│                      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │TAG       Modelo         Série     Max × d         Validade                        │ │
│                      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │TOL-0042  Toledo 2098    4471-B    30 kg × 5 g     ● até 14/10/2027    [▸ Calibrar]│ │
│                      │ │TOL-0043  Toledo Prix 3  88120     15 kg × 5 g     ● vence 02/11/2026  [▸ Calibrar]│ │
│                      │ │FIL-0007  Filizola BP15  A-5512    15 kg × 5 g     ● até 21/03/2027                │ │
│                      │ │RAM-0002  Ramuza DP30    30311     30 kg × 10 g    ● até 30/06/2027                │ │
│                      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
│                      │                                                                                       │
│                      │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│                      │ │Certificados recentes                                             Ver todos (17) → │ │
│                      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │Nº              Balança     Calibrado   Status          Ações                      │ │
│ ──────────────────── │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│ (AS) Ana Souza     ⋯ │ │BC-2026-00124   TOL-0042    14/10/2026  ✓ Emitido       [⇩ PDF] [@] [⋯]            │ │
│      Administradora  │ │BC-2025-00311   TOL-0043    02/11/2025  ✓ Emitido       [⇩ PDF] [@] [⋯]            │ │
│                      │ │BC-2025-00290   TOL-0042    10/10/2025  ↺ Substituído   por BC-2025-00297          │ │
│                      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- As abas mudam a URL (`?aba=balancas`).
- O botão primário contextual "+ Nova calibração" abre o wizard com o cliente já escolhido. "▸ Calibrar" numa balança já escolhe também o instrumento.
- Certificados substituídos mostram o vínculo com a revisão.

### 6.5 Balanças / equipamentos

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Balanças                                    [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ Balanças                                                           [+ Nova balança]   │
│ └──────────────────┘ │ Instrumentos de pesagem dos clientes · 612 balanças                                   │
│                      │                                                                                       │
│ Visão geral          │ Todas (612)   Vencendo ≤ 30 dias (23)   Vencidas (7)   Sem calibração (12)            │
│   Painel             │ ━━━━━━━━━━━━                                                                          │
│                      │ [⌕ Série, TAG, modelo ou cliente…  / ]  (+ Cliente) (+ Fabricante) (+ Classe)         │
│ Operação             │ (+ Capacidade)                                              [⫼ Colunas]   612 balanças│
│   Certificados   (3) │                                                                                       │
│   Clientes           │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│ ▌ Balanças           │ │TAG      Fabr./modelo   Série  Cliente           Max × d        Cl. Validade ↑     │ │
│                      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│ Metrologia           │ │RES-0011 Toledo Prix 3  77120  Restaurante Sabor 15 kg × 5 g    III ● vencida 09/10│ │
│   Padrões          ● │ │MDI-0003 Filizola BP15  A-9921 Mercado Dois Irm. 15 kg × 5 g    III ● em 3 dias    │ │
│                      │ │FSN-0002 Shimadzu AY220 D45009 Farmácia Sol      220 g × 0,1 mg I   ● em 12 dias   │ │
│ Sistema              │ │TOL-0043 Toledo Prix 3  88120  Padaria Bom Pão   15 kg × 5 g    III ● em 19 dias   │ │
│   Configurações      │ │FRV-0101 Balmak RB300   B3-117 Frigorífico Vale  300 kg × 50 g  III ● até 13/10/27 │ │
│                      │ │TOL-0042 Toledo 2098    4471-B Padaria Bom Pão   30 kg × 5 g    III ● até 14/10/27 │ │
│                      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │1–50 de 612                   Linhas [50 ▾]     ‹ Anterior  1 2 3 … 13  Próxima ›  │ │
│                      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
│                      │                                                                                       │
│                      │ Ações na linha (hover/foco; sempre visíveis no toque): [▸ Calibrar] [⧉ Histórico] [⋯] │
│                      │ "Calibrar" abre o wizard com cliente e balança já preenchidos (etapas 1–2 prontas).   │
│                      │                                                                                       │
│                      │ DRAWER "Nova balança" (480 px, à direita, sem sair da lista):                         │
│                      │                                    ┌────────────────────────────────────────────────┐ │
│                      │                                    │Nova balança                                ✕   │ │
│                      │                                    ├────────────────────────────────────────────────┤ │
│                      │                                    │Cliente             [Padaria Bom Pão Ltda ▾]    │ │
│                      │                                    │Fabricante          [Toledo               ▾]    │ │
│                      │                                    │Modelo              [Prix 3                ]    │ │
│                      │                                    │Nº de série         [88120                 ]    │ │
│                      │                                    │Identificação (TAG) [TOL-0043              ]    │ │
│                      │                                    │Capacidade Max      [   15,000 ] kg             │ │
│                      │                                    │Divisão d           [    0,005 ] kg             │ │
│                      │                                    │Divisão e           [    0,005 ] kg             │ │
│ ──────────────────── │                                    │Classe              (I) (II) (●III) (IIII)      │ │
│ (AS) Ana Souza     ⋯ │                                    │Local de instalação [Balcão de frios       ]    │ │
│      Administradora  │                                    ├────────────────────────────────────────────────┤ │
│                      │                                    │                 [Cancelar] [Cadastrar balança] │ │
│                      │                                    └────────────────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.6 Padrões (pesos padrão com vencimento)

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Padrões                                     [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ Padrões                                                             [+ Novo padrão]   │
│ └──────────────────┘ │ Pesos padrão e instrumentos auxiliares usados nas calibrações                         │
│                      │                                                                                       │
│ Visão geral          │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│   Painel             │ │⊘ 1 padrão vencido está bloqueado: TH-01 (termo-higrômetro), vencido em 02/09/2026.│ │
│                      │ │  Calibrações que dependem dele não podem ser emitidas.    [Registrar recalibração]│ │
│ Operação             │ └───────────────────────────────────────────────────────────────────────────────────┘ │
│   Certificados   (3) │                                                                                       │
│   Clientes           │ Todos (38)   Massas (35)   Auxiliares (3)      [⌕ Identificação ou certificado…  / ]  │
│   Balanças           │ ━━━━━━━━━━                                                                            │
│                      │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│ Metrologia           │ │Identificação    Descrição             Cl.   Certificado   Validade ↑              │ │
│ ▌ Padrões          ● │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │TH-01            Termo-higrômetro      —     RBC 9001/25   ● Vencido · ⊘ Bloqueado │ │
│ Sistema              │ │M1-10kg #03      Massa 10 kg cilíndr.  M1    RBC 12346/25  ● Vence em 41 dias      │ │
│   Configurações      │ │M1-10kg #04      Massa 10 kg cilíndr.  M1    RBC 12346/25  ● Vence em 41 dias      │ │
│                      │ │▾ KIT-F1-02      Conjunto 1 g a 5 kg   F1    RBC 12345/26  ● Até 03/2027           │ │
│                      │ │   └ F1-5kg      Massa 5 kg            F1    (do kit)      ● Até 03/2027           │ │
│                      │ │   └ F1-2kg      Massa 2 kg            F1    (do kit)      ● Até 03/2027           │ │
│                      │ │   └ … 10 peças                                                                    │ │
│                      │ │M1-20kg #01      Massa 20 kg           M1    RBC 11002/26  ● Até 05/2027           │ │
│                      │ │TH-02            Termo-higrômetro      —     RBC 9876/26   ● Até 05/2027           │ │
│                      │ ├───────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │1–38 de 38                                                 ‹ Anterior  1  Próxima ›│ │
│                      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
│                      │                                                                                       │
│                      │ DETALHE (drawer ao clicar em M1-10kg #03):                                            │
│                      │        ┌────────────────────────────────────────────────────────────────────────────┐ │
│                      │        │M1-10kg #03 · Massa 10 kg                      [Registrar recalibração] ✕   │ │
│                      │        ├────────────────────────────────────────────────────────────────────────────┤ │
│                      │        │Valor nominal        10 kg            Classe OIML    M1                     │ │
│                      │        │Valor convencional   10,000 12 kg     Incerteza U    0,000 16 kg (k=2)      │ │
│                      │        │Certificado          RBC 12346/25     Laboratório    Lab. X (CAL 0000)      │ │
│ ──────────────────── │        │Calibrado em         25/11/2025       Validade       24/11/2026 (41 dias)   │ │
│ (AS) Ana Souza     ⋯ │        ├────────────────────────────────────────────────────────────────────────────┤ │
│      Administradora  │        │Histórico de certificados: 2025 ▸ 2024 ▸ 2023 (deriva +0,02 g/ano)          │ │
│                      │        │Usado em 214 calibrações · última: BC-2026-00124                            │ │
│                      │        └────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- Ordenação padrão: **validade ascendente**, para que vencidos e "vencendo" apareçam primeiro.
- Os kits são agrupados e expansíveis.
- Um padrão vencido fica **bloqueado** (não aparece como selecionável no wizard) e gera um banner no painel.

### 6.7 Nova calibração (wizard)

**Desktop: etapa 6, Erro de indicação.** A sidebar se recolhe automaticamente (modo foco, ainda acessível por Ctrl+B).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆  Certificados › Nova calibração · rascunho R-0091            ✓ Salvo às 14:32 · Ctrl+S      [Sair]  [⋯]                │
│    Padaria Bom Pão Ltda · Toledo 2098 (TOL-0042) · Max 30 kg · d = e = 0,005 kg · classe III · unidade: kg               │
├──────────────────────┬──────────────────────────────────────────────────────────────────────┬────────────────────────────┤
│ Etapas               │ 6  Erro de indicação                                                 │ Resultados ao vivo         │
│                      │ Pontos distribuídos de 0 a Max (EURAMET cg-18 §5.2). Valores em kg.  │                            │
│ ✓ 1 Cliente e OS     │                                                                      │ Pontos medidos        5/6  │
│   Bom Pão · OS 2291  │ Carga [Crescente c/ descarga ▾]  Pontos [6 ▾]  Houve ajuste [━●]     │ Fora do EMA             1  │
│ ✓ 2 Instrumento      │                                                                      │ Indeterminados          1  │
│   Toledo 2098 · 30 kg│ ┌─────────────────┐                                                  │ |E| máx   +0,010 (20 kg)   │
│ ✓ 3 Padrões/ambiente │ │ Antes do ajuste │  Após o ajuste                                   │ U máx (k=2)       0,0083   │
│   KIT-F1-02 + 2×10kg │ ┴─────────────────┴───────────────────────────────────────────────── │ ────────────────────────── │
│   22,4 °C · 55 %UR   │ ┌──────────────────────────────────────────────────────────────────┐ │ Erro × carga (kg)          │
│ ✓ 4 Repetibilidade   │ │✕ 1 ponto fora do EMA: 20 kg → E = +0,010 kg (EMA ±0,0075 kg).    │ │ +0,010┤          ●         │
│   5/5 · s = 0,0000   │ │  Registre também os resultados após o ajuste.  [Ir para "Após"]  │ │       │     ╌╌╌╌╌│╌╌╌╌╌    │
│ ✓ 5 Excentricidade   │ └──────────────────────────────────────────────────────────────────┘ │ +0,005┤╌╌╌╌╌╌    ┴ ●       │
│   |ΔI| máx 0,005     │ ┌──┬──────┬────────┬──────┬─────────┬──────┬──────┬───────┬────────┐ │      0┼──●──●──●───┴───    │
│▐● 6 Erro de indicação│ │Nº│Carga │Padrões │m_ref │Indicação│E ƒ   │U ƒ   │EMA ƒ  │Situação│ │ −0,005┤╌╌╌╌╌╌              │
│   5/6 · 1 fora do EMA│ ├──┼──────┼────────┼──────┼─────────┼──────┼──────┼───────┼────────┤ │       │     ╌╌╌╌╌╌╌╌╌╌╌    │
│ ○ 7 Revisão          │ │ 1│ 5,000│F1 5 kg │ 5,000│    5,000│ 0,000│0,0043│±0,005 │✓ Conf. │ │       └─────────────────   │
│ ○ 8 Emissão          │ │ 2│10,000│M1 #03  │10,000│   10,000│ 0,000│0,0050│±0,005 │✓ Conf. │ │        0    10   20   30kg │
│                      │ │ 3│15,000│#03+F1  │15,000│   15,000│ 0,000│0,0060│±0,0075│✓ Conf. │ │ ● erro  ┴│ ±U  ╌ ±EMA      │
│ ──────────────────── │ │▌4│20,000│#03+#04 │20,000│   20,010│+0,010│0,0071│±0,0075│✕ Fora  │ │ ────────────────────────── │
│ Atalhos (?)          │ │ 5│25,000│2×M1+F1 │25,000│[25,005▌]│+0,005│0,0083│±0,0075│? Indet.│ │ Incerteza · ponto 5  [?]   │
│ Enter  desce         │ │ 6│30,000│2×M1+F1 │30,000│         │      │      │±0,0075│○       │ │ Resolução zero      12 %   │
│ Tab    próxima col.  │ └──┴──────┴────────┴──────┴─────────┴──────┴──────┴───────┴────────┘ │ Resolução carga     12 %   │
│ F2     editar        │ ƒ = calculado (fundo --surface-sunken). Linha 4: --danger-subtle +   │ Excentricidade      76 %   │
│ Esc    desfaz célula │ barra vermelha. Célula [25,005▌] em edição: Enter → linha 6.         │ Repetib. + padrão   <1 %   │
│ Ctrl+V cola coluna   │ ! "20,003 não é múltiplo de d = 0,005 kg" (aviso âmbar, não bloqueia)│ u_c 0,0041 · U 0,0083 kg   │
│ Ctrl+↵ avançar       │                                                                      │                            │
│                      │ ──────────────────────────────────────────────────────────────────── │                            │
│                      │ [← Voltar: Excentricidade]                  [Avançar: Revisão →]     │                            │
└──────────────────────┴──────────────────────────────────────────────────────────────────────┴────────────────────────────┘
```

**Etapa 3: Padrões e ambiente**

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 3  Padrões e ambiente                                                                    │
│ Selecione as massas e o termo-higrômetro. Padrões vencidos ficam bloqueados.             │
│                                                                                          │
│ Pesos padrão                                  Selecionados: 31,111 kg ✓ cobre Max 30 kg  │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │  Identif.    Descrição                   Cl. Certificado    Validade                 │ │
│ ├──────────────────────────────────────────────────────────────────────────────────────┤ │
│ │■ KIT-F1-02   Conjunto 1 g a 5 kg (12 pç) F1  RBC 12345/26   ● até 03/2027            │ │
│ │■ M1-10kg #03 Massa 10 kg                 M1  RBC 12346/25   ● vence em 41 dias       │ │
│ │■ M1-10kg #04 Massa 10 kg                 M1  RBC 12346/25   ● vence em 41 dias       │ │
│ │□ M1-20kg #01 Massa 20 kg                 M1  RBC 11002/26   ● até 05/2027            │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│ Termo-higrômetro  [TH-02 · RBC 9876/26 · até 05/2027         ▾]                          │
│                   ⊘ TH-01 indisponível: vencido em 02/09/2026 (bloqueado)                │
│                                                                                          │
│ Condições ambientais        Início            Fim               Variação                 │
│ Temperatura                 [   22,4 ] °C     [   22,9 ] °C     ΔT 0,5 °C ✓              │
│ Umidade relativa            [     55 ] %UR    [     54 ] %UR                             │
│ Pressão (opcional)          [        ] hPa                                               │
│                                                                                          │
│ Procedimento  [PT-01 rev. 3 · Calibração de IPNA (base EURAMET cg-18 v4.0)       ▾]      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Etapa 5: Excentricidade, com diagrama interativo da plataforma** (posições do EURAMET cg-18, Fig. 5.3-1)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 5  Excentricidade                                                                        │
│ Carga [ 10,000 ] kg (≈ Max/3)    Padrões [M1-10kg #03 ▾]    Método [1 · sem tara ▾]      │
│                                                                                          │
│  ┌──────────────────────────────┐    Posição          Indicação (kg)   ΔI (kg)           │
│  │ (3)                      (4) │    ────────────────────────────────────────            │
│  │ 10,000                 9,995 │    1 Centro              10,000          —             │
│  │                              │    2 Frente-esquerda     10,005     +0,005             │
│  │             (1)              │    3 Fundo-esquerda      10,000      0,000             │
│  │            10,000            │    4 Fundo-direita        9,995     −0,005             │
│  │                              │    ▌5 Frente-direita   [10,005▌]    +0,005             │
│  │ (2)                    ▐(5)▌ │                                                        │
│  │ 10,005               10,005▌ │    |ΔI| máx 0,005 kg · EMA(10 kg) ±0,005               │
│  └─────────── frente ───────────┘    ✓ Dentro do EMA                                     │
│                                                                                          │
│ Tocar numa posição do diagrama foca a célula; a célula focada acende a posição (▐ ▌).    │
│ Plataforma [Retangular ▾] (circular e gancho mudam o desenho e as posições)              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Tablet em retrato: etapa 6**

```
┌────────────────────────────────────────────────────────────────────────┐
│ ←  Nova calibração · R-0091                   ✓ Salvo 14:32    ⋯       │
│ ────────────────────────────────────────────────────────────────────── │
│ [ Etapa 6 de 8 · Erro de indicação                             ▾ ]     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────  │
│ Toledo 2098 · Max 30 kg · d 0,005 kg · valores em kg                   │
│                                                                        │
│ ┌─────────────────┐                                                    │
│ │ Antes do ajuste │  Após o ajuste                                     │
│ ┴─────────────────┴─────────────────────────────────────────────────── │
│ ┌───┬────────┬───────────┬────────┬────────┬────────────┐              │
│ │ Nº│  Carga │ Indicação │      E │      U │ Situação   │              │
│ ├───┼────────┼───────────┼────────┼────────┼────────────┤              │
│ │ 1 │  5,000 │     5,000 │  0,000 │ 0,0043 │ ✓ Conforme │              │
│ │ 2 │ 10,000 │    10,000 │  0,000 │ 0,0050 │ ✓ Conforme │              │
│ │ 3 │ 15,000 │    15,000 │  0,000 │ 0,0060 │ ✓ Conforme │              │
│ │ ▌4│ 20,000 │    20,010 │ +0,010 │ 0,0071 │ ✕ Fora EMA │              │
│ │ 5 │ 25,000 │ [25,005▌] │ +0,005 │ 0,0083 │ ? Indet.   │              │
│ │ 6 │ 30,000 │           │        │        │ ○          │              │
│ └───┴────────┴───────────┴────────┴────────┴────────────┘              │
│ Linhas de 48 px · alvos ≥ 44 px · célula focada centralizada na tela   │
│                                                                        │
│ ▸ Resultados e gráfico   1 fora do EMA · 1 indeterminado    (acordeão) │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ [← Excentricidade]                            [Avançar: Revisão →]     │
│ (barra fixa no rodapé + env(safe-area-inset-bottom))                   │
└────────────────────────────────────────────────────────────────────────┘

Teclado virtual · inputmode="decimal" · enterkeyhint="next"
┌───────┬───────┬───────┐
│   1   │   2   │   3   │
│   4   │   5   │   6   │
│   7   │   8   │   9   │
│   ,   │   0   │   ⌫   │
└───────┴───────┴───────┘   [ Próximo ↵ ] → desce para a linha 6
```

**Etapas 7 e 8: Revisão, confirmação e sucesso**

```
┌────────────────────────────────────────────────────────────────────────┐
│ 7  Revisão                                                             │
│                                                                        │
│ Checklist                                  Prévia do certificado       │
│ ✓ Padrões dentro da validade               ┌──────┐ ┌──────┐ ┌──────┐  │
│ ✓ Condições ambientais registradas         │▤▤▤▤▤ │ │▤▤▤▤▤ │ │▤▤▤   │  │
│ ✓ Repetibilidade: 5 de 5 leituras          │▤▤▤▤  │ │▦▦▦▦▦ │ │▤▤ ▣QR│  │
│ ✓ Excentricidade: 5 de 5 posições          │▤▤▤▤▤ │ │▦▦▦▦▦ │ │ ✎    │  │
│ ✓ Erro de indicação: 6 de 6 pontos         └──────┘ └──────┘ └──────┘  │
│ ! 1 ponto fora do EMA antes do ajuste       pág. 1   pág. 2   pág. 3   │
│   (resultados após o ajuste registrados)   [⤢ Abrir em tamanho real]   │
│                                                                        │
│ Resumo por etapa                                                       │
│ Cliente e OS ......... Padaria Bom Pão · OS 2291           [Editar]    │
│ Instrumento .......... Toledo 2098 · 4471-B · 30 kg × 5 g  [Editar]    │
│ Padrões e ambiente ... KIT-F1-02 + 2 × M1 10 kg · 22,4 °C  [Editar]    │
│ …                                                                      │
│                                                                        │
│ Observações do certificado   [Modelos ▾]                               │
│ [Instrumento ajustado em campo; resultados antes e após na seção 5.3.] │
│ Signatário  [Eng. Marina Souza · Responsável técnico ▾]                │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ [← Voltar: Erro de indicação]                  [Emitir certificado]    │
└────────────────────────────────────────────────────────────────────────┘

MODAL DE CONFIRMAÇÃO (sobre --scrim):
┌────────────────────────────────────────────────────────────────┐
│ Emitir o certificado BC-2026-00124?                         ✕  │
│                                                                │
│ Padaria Bom Pão Ltda · Toledo 2098 (série 4471-B)              │
│ Calibrado em 14/10/2026 · Signatário: Eng. Marina Souza        │
│                                                                │
│ Após a emissão os dados ficam bloqueados. Correções            │
│ exigem uma revisão (novo certificado que substitui este).      │
│                                                                │
│                           [Cancelar]  [Emitir e gerar PDF]     │
└────────────────────────────────────────────────────────────────┘

TELA DE SUCESSO:
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                         ( ✓ )                                  │
│              Certificado emitido                               │
│                 BC-2026-00124                                  │
│                                                                │
│   [⇩ Baixar PDF]  [@ Enviar por e-mail]  [⎙ Imprimir]          │
│                                                                │
│   Ver certificado  ·  Nova calibração para este cliente        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.8 Visualização do certificado

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Certificados › BC-2026-00124                [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ BC-2026-00124  [✓ Emitido]           [@ Enviar por e-mail] [⎙] [⋯] [⇩ Baixar PDF]     │
│ └──────────────────┘ │ Padaria Bom Pão Ltda · Toledo 2098 (TOL-0042) · emitido em 14/10/2026 · Marina Souza  │
│                      │                                                                                       │
│ Visão geral          │ ┌──────────────────────────────────────────────────┐ ┌──────────────────────────────┐ │
│   Painel             │ │ ◂ 1/3 ▸     − 100% +     [⤢]                     │ │Resumo                        │ │
│                      │ ├──────────────────────────────────────────────────┤ │Cliente   Padaria Bom Pão     │ │
│ Operação             │ │  ┌─────────────────────────────────────────┐     │ │Balança   TOL-0042 · 30 kg    │ │
│ ▌ Certificados   (3) │ │  │ [LOGO] Balanças.com      Certificado de │     │ │Calibrado 14/10/2026          │ │
│   Clientes           │ │  │                          calibração     │     │ │Próx. (interna) 14/10/2027    │ │
│   Balanças           │ │  │                          BC-2026-00124  │     │ ├──────────────────────────────┤ │
│                      │ │  │ ═══════════════════════════════════════ │     │ │Resultados                    │ │
│ Metrologia           │ │  │ 1 Cliente                               │     │ │Antes do ajuste: 1 fora EMA   │ │
│   Padrões          ● │ │  │ ▤▤▤▤▤▤▤▤▤▤▤   ▤▤▤▤▤▤▤▤▤▤   ▤▤▤▤▤▤       │     │ │Após o ajuste: ver seção 5.3  │ │
│                      │ │  │ 2 Instrumento calibrado                 │     │ │U máx 0,0096 kg (k = 2)       │ │
│ Sistema              │ │  │ ▤▤▤▤▤▤▤▤▤   ▤▤▤▤▤▤▤   ▤▤▤▤▤   ▤▤▤▤      │     │ ├──────────────────────────────┤ │
│   Configurações      │ │  │ 3 Calibração                            │     │ │Autenticidade                 │ │
│                      │ │  │ ▤▤▤▤▤▤   ▤▤▤▤▤▤▤▤▤▤▤   ▤▤▤▤▤▤▤▤▤▤▤      │     │ │▣ QR  código 7KQ2-9XHM  ⧉     │ │
│                      │ │  │ 4 Padrões e rastreabilidade             │     │ │verificar.balancas.com/…      │ │
│                      │ │  │ ▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦     │     │ ├──────────────────────────────┤ │
│                      │ │  │ ▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦     │     │ │Envios                        │ │
│                      │ │  │                                         │     │ │→ joao@bompao.com.br          │ │
│                      │ │  │ ─────────────────────────────────────── │     │ │  14/10 10:45 · entregue      │ │
│                      │ │  │ Reprodução só na íntegra…   Pág. 1 de 3 │     │ ├──────────────────────────────┤ │
│                      │ │  └─────────────────────────────────────────┘     │ │Histórico                     │ │
│                      │ │   página A4 renderizada (canvas/PDF.js)          │ │● 14/10 10:41 emitido         │ │
│                      │ └──────────────────────────────────────────────────┘ │● 14/10 10:45 enviado         │ │
│                      │                                                      │● 14/10 09:02 rascunho        │ │
│                      │                                                      └──────────────────────────────┘ │
│                      │                                                                                       │
│                      │ Menu ⋯ : Revisar (emitir revisão) · Cancelar certificado · Copiar link de verificação │
│                      │         · Duplicar como nova calibração · Baixar dados (CSV)                          │
│                      │                                                                                       │
│                      │ MODAL "Enviar por e-mail" (destinatários = contatos marcados "recebe certificados"):  │
│                      │ ┌──────────────────────────────────────────────────────────────────┐                  │
│                      │ │Enviar certificado por e-mail                                  ✕  │                  │
│                      │ ├──────────────────────────────────────────────────────────────────┤                  │
│                      │ │Para     [joao@bompao.com.br ×] [compras@bompao.com.br ×] [  ]    │                  │
│                      │ │Assunto  [Certificado de calibração BC-2026-00124           ]     │                  │
│                      │ │Mensagem [Prezado João, segue em anexo o certificado…       ]     │                  │
│                      │ │         [                                                  ]     │                  │
│                      │ │Anexo    ▤ BC-2026-00124.pdf (184 KB)                             │                  │
│                      │ ├──────────────────────────────────────────────────────────────────┤                  │
│                      │ │                                        [Cancelar]  [@ Enviar]    │                  │
│                      │ └──────────────────────────────────────────────────────────────────┘                  │
│                      │                                                                                       │
│                      │ MODAL "Cancelar" (destrutivo; botão --danger habilitado após digitar o número):       │
│                      │ ┌──────────────────────────────────────────────────────────────────┐                  │
│                      │ │Cancelar o certificado BC-2026-00124?                          ✕  │                  │
│                      │ ├──────────────────────────────────────────────────────────────────┤                  │
│                      │ │O certificado continuará no histórico com o status "Cancelado".   │                  │
│                      │ │Motivo (obrigatório)                                              │                  │
│ ──────────────────── │ │[Emitido para o cliente errado.                            ]      │                  │
│ (AS) Ana Souza     ⋯ │ │Digite BC-2026-00124 para confirmar  [                    ]       │                  │
│      Administradora  │ ├──────────────────────────────────────────────────────────────────┤                  │
│                      │ │                           [Voltar]  [Cancelar certificado]       │                  │
│                      │ └──────────────────────────────────────────────────────────────────┘                  │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- A ação primária é **Baixar PDF**; e-mail e impressão ficam como secundárias. Revisar e Cancelar ficam no menu `⋯`, longe do clique acidental.
- O painel lateral mostra o resumo, a autenticidade (QR e código), os envios e o histórico de auditoria.
- Um certificado **cancelado** mostra um banner vermelho no topo ("Cancelado em 15/10/2026 por Ana Souza. Motivo: …") e a prévia com a marca d'água "CANCELADO". Um **substituído** mostra o link para a revisão.

### 6.9 Configurações

```
┌──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Balanças.com     « │ Configurações › Empresa                     [⌕ Buscar…              Ctrl K]  (sino 3) │
│                      ├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                                       │
│ │ + Nova calibração│ │ Configurações                                                                         │
│ └──────────────────┘ │                                                                                       │
│                      │ Organização           │ Empresa                                                       │
│ Visão geral          │ ▌Empresa              │ Dados impressos no cabeçalho do certificado.                  │
│   Painel             │  Responsável técnico  │                                                               │
│                      │   e assinatura        │ Razão social                                                  │
│ Operação             │  Certificado          │ [Balanças.com Assistência Técnica Ltda              ]         │
│   Certificados   (3) │  Numeração            │ CNPJ                           Telefone                       │
│   Clientes           │  Vencimentos          │ [00.000.000/0001-00 ✓]          [(11) 0000-0000      ]        │
│   Balanças           │                       │ Endereço                                                      │
│                      │ Comunicação           │ [Rua Exemplo, 100 · Mauá/SP · 09300-000             ]         │
│ Metrologia           │  E-mail (SMTP)        │ E-mail de contato              Site                           │
│   Padrões          ● │                       │ [laboratorio@balancas.com ]    [balancas.com        ]         │
│                      │ Sistema               │                                                               │
│ Sistema              │  Aparência            │ Logotipo                                                      │
│ ▌ Configurações      │  Usuários             │ ┌──────────────────────┐  ┌──────────────────────┐            │
│                      │  Backup               │ │ fundo claro          │  │ fundo escuro         │            │
│                      │                       │ │   [ LOGO ]           │  │   [ LOGO ]           │            │
│                      │                       │ │ PNG/SVG · ≤ 1 MB     │  │ usado no tema escuro │            │
│                      │                       │ │ [Trocar] [Remover]   │  │ [Enviar arquivo]     │            │
│                      │                       │ └──────────────────────┘  └──────────────────────┘            │
│                      │                       │ O PDF usa sempre a versão para fundo claro.                   │
│                      │                       │                                                               │
│ ──────────────────── │                       │ Acreditação (opcional)                                        │
│ (AS) Ana Souza     ⋯ │                       │ [ ] Laboratório acreditado (Cgcre)  Nº [        ]             │
│      Administradora  │                       │                                                               │
│                      │                       │ ────────────────────────────────────────────────────────────  │
│                      │                       │ Alterações não salvas            [Descartar] [Salvar]         │
└──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

Demais seções (mesmo layout: subnavegação à esquerda e conteúdo de até 768 px):

```
CERTIFICADO:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Certificado                                                                           │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Procedimento padrão   [PT-01 rev. 3 · Calibração de IPNA (EURAMET cg-18) ▾]           │
│Declaração de conformidade  ( Nunca | ●Quando o cliente pedir | Sempre )              │
│Regra de decisão      ( Aceitação simples | ●Banda de guarda: |E| + U ≤ EMA )         │
│Próxima calibração no PDF   ( ●Só se o cliente solicitar | Nunca )  ISO 17025 7.8.4.3 │
│Gráfico erro × carga no PDF [✓]     Marca d'água em prévias [✓] RASCUNHO              │
│Textos padrão  [Observações ▾] [Declaração de incerteza ▾] [Rastreabilidade ▾]        │
└──────────────────────────────────────────────────────────────────────────────────────┘

VENCIMENTOS:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Vencimentos e lembretes                                                               │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Intervalo interno padrão para clientes  [12] meses (não vai para o certificado)       │
│Avisar "vence em breve"  clientes [30] dias · padrões [60] dias                       │
│Lembrete por e-mail ao cliente  [✓] 30 dias antes   Modelo [Lembrete ▾]               │
└──────────────────────────────────────────────────────────────────────────────────────┘

RESPONSÁVEL TÉCNICO E ASSINATURA:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Responsável técnico e assinatura                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Signatários autorizados                                        [+ Adicionar]          │
│● Eng. Marina Souza · Responsável técnico · CREA-SP 000000   padrão  [Editar]         │
│○ Carlos Lima · Técnico de calibração (executor)                     [Editar]         │
│                                                                                      │
│Assinatura de Marina Souza (PNG transparente)                                         │
│┌────────────────────────────────────┐   Prévia sobre papel:                          │
││        ~~~ Marina Souza ~~~        │   ┌───────────────────────────────┐            │
││                                    │   │    ~~~ Marina Souza ~~~       │            │
││ [Enviar imagem] [Desenhar] [Limpar]│   │ ───────────────────────────── │            │
│└────────────────────────────────────┘   │ Eng. Marina Souza · CREA-SP … │            │
│                                         └───────────────────────────────┘            │
│Certificado digital A1 (ICP-Brasil, opcional) [Enviar .pfx]  ● válido até 08/2027     │
└──────────────────────────────────────────────────────────────────────────────────────┘

E-MAIL (SMTP):
┌──────────────────────────────────────────────────────────────────────────────────────┐
│E-mail (SMTP)                                                                         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Servidor [smtp.balancas.com      ]  Porta [587]  Segurança (STARTTLS ▾)               │
│Usuário  [certificados@balancas.com]  Senha [••••••••••]  [mostrar]                   │
│Remetente [Balanças.com <certificados@balancas.com>]                                  │
│Modelo da mensagem  [Prezado(a) {contato}, segue o certificado {numero}…]             │
│Variáveis: {cliente} {contato} {numero} {balanca} {data}                              │
│                                                                                      │
│[Enviar e-mail de teste]   ✓ Último teste: 14/10 09:10 · entregue                     │
└──────────────────────────────────────────────────────────────────────────────────────┘

NUMERAÇÃO:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Numeração                                                                             │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Prefixo [BC ]  Separador [-]  Ano [AAAA ▾]  Dígitos [5]  Reinicia [todo ano ▾]        │
│Próximo número  [  125 ]        Prévia:  BC-2026-00125                                │
│Rascunhos: R-0001 (não consome a numeração oficial)                                   │
│! Alterar a sequência exige confirmação e fica registrado na auditoria.               │
└──────────────────────────────────────────────────────────────────────────────────────┘

APARÊNCIA:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Aparência (preferência pessoal)                                                       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Tema       ( Claro | Escuro | ●Sistema )        ← ícones Sun/Moon/Monitor             │
│Contraste  ( Padrão | Alto )                    ← segue prefers-contrast              │
│Densidade  ( Confortável | Compacta )           ← linhas 40 px / 32 px                │
│Sidebar    [✓] Recolher automaticamente no wizard (modo foco)                         │
└──────────────────────────────────────────────────────────────────────────────────────┘

USUÁRIOS:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Usuários                                                       [+ Convidar]           │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Nome             E-mail                     Papel              Status                 │
│Ana Souza        ana@balancas.com           Administradora     ● Ativa                │
│Marina Souza     marina@balancas.com        Signatária (RT)    ● Ativa                │
│Carlos Lima      carlos@balancas.com        Técnico            ● Ativo                │
│Recepção         recepcao@balancas.com      Somente leitura    ○ Inativo              │
│Papéis: Administrador · Signatário (emite e assina) · Técnico (rascunhos) · Leitura   │
└──────────────────────────────────────────────────────────────────────────────────────┘

BACKUP:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│Backup                                                                                │
├──────────────────────────────────────────────────────────────────────────────────────┤
│Automático  [✓] diário às [23:30]   Destino [\\servidor\backups\certificados]         │
│Retenção    [30] diários · [12] mensais                 Incluir PDFs [✓]              │
│Último backup  ✓ 13/10/2026 23:30 · 412 MB · verificado                               │
│[Fazer backup agora]   [Restaurar…] (pede confirmação digitando RESTAURAR)            │
│! Sem backup há mais de 2 dias → banner no painel para administradores.               │
└──────────────────────────────────────────────────────────────────────────────────────┘

```

- **Permissões:** só administradores veem Usuários, Backup, Numeração e SMTP. O signatário vê "Responsável técnico" (a própria assinatura). Aparência é sempre pessoal.
- **Senha do SMTP:** nunca é exibida depois de salva ("••••" + "Alterar senha").

---

## 7. Microinterações, motion e acessibilidade

### 7.1 Princípios de motion

1. **Motion explica, não enfeita.** Mostra de onde algo veio (popover a partir do botão, drawer pela lateral), o que mudou (célula recalculada) e o que está acontecendo (salvando).
2. **Rápido:** 100–250 ms. Entradas com *ease-out* (`--ease-enter`); saídas ~30 % mais curtas (`--ease-exit`).
3. **Ações de teclado repetidas não animam.** Command palette, navegação na planilha, troca de célula e foco são **instantâneos**. Animar algo usado centenas de vezes por dia faz a interface parecer lenta.
4. **Só `opacity` e `transform`** (acelerados pela GPU). Nada que mova o layout durante a digitação.
5. **Sem *shake*, *bounce* nem piscar.** Erro se comunica com cor, ícone e texto, não com tremor (que também é um problema vestibular).
6. **`prefers-reduced-motion`:** desliga deslocamentos e escalas. Mantém só fades curtos (≤ 100 ms) ou nenhum.

### 7.2 Catálogo de microinterações

| Interação | Animação | Duração / curva | Com *reduced motion* |
|---|---|---|---|
| Hover em botão, linha, item | Cor de fundo | 100 ms `--ease-standard` | Igual (só cor) |
| Pressionar botão | `scale(0.98)` + `bg-primary-active` | 100 ms | Só cor |
| Anel de foco | Aparece **instantaneamente** | 0 ms | — |
| Tooltip | Fade + `translateY(2px → 0)`, atraso de 400 ms | 150 ms `--ease-enter` | Só fade |
| Dropdown, popover, combobox | Fade + `scale(0.98 → 1)` a partir da origem | 150 ms entrada / 100 ms saída | Só fade |
| Modal | Scrim com fade de 200 ms; painel com fade + `scale(0.98 → 1)` + `translateY(4px → 0)` | 250 ms entrada / 150 ms saída | Só fade |
| Drawer | `translateX(16px → 0)` + fade (sem deslizar a tela inteira) | 250 ms / 200 ms | Só fade |
| Toast | `translateY(8px → 0)` + fade; pilha expande no hover | 200 ms / 150 ms | Só fade |
| Recolher a sidebar | Largura 256 → 48 px; rótulos somem em 100 ms | 250 ms `--ease-standard` | Instantâneo |
| Command palette | **Nenhuma** (ou fade de 100 ms) | — | Nenhuma |
| Troca de aba | O sublinhado desliza até a nova aba | 200 ms | Instantâneo |
| Auto-preenchimento (CNPJ/CEP) | Campos ganham o fundo lilás **em cascata** (30 ms entre eles) e o ícone `Sparkles` faz `scale(0.8 → 1)` | 200 ms cada | Estado final direto |
| Recalcular na planilha | *Flash* `bg-primary-subtle` nas células que mudaram, sumindo | 250 ms | Sem *flash* |
| Erro passa do EMA | Fundo `danger-subtle` em *crossfade* + ícone `OctagonX`; **sem tremor** | 150 ms | Instantâneo |
| Indicador "Salvando…" | O spinner só aparece se o salvamento passar de **300 ms** (evita cintilar); depois o `Check` entra com fade | 150 ms | Só texto |
| Botão "Copiar" | Ícone `Copy` → `Check` e volta após 1,5 s | 150 ms | Troca direta |
| Etapa concluída no wizard | O check do ícone se desenha (`stroke-dashoffset`) | 200 ms | Estático |
| Pontos do gráfico | Deslizam para a nova posição | 150 ms | Instantâneo |
| Skeleton | Pulso de opacidade 1 → 0,55 | 1,6 s em loop | Estático |
| Troca de tema | **Sem transição** (`data-theme-switching`) | — | — |
| Sucesso da emissão | Check desenhado + número com fade | 300 ms (única exceção, celebrar sem exagero) | Estático |
| Contadores (badges da sidebar) | *Crossfade* do número | 150 ms | Troca direta |

### 7.3 Acessibilidade: checklist (meta: WCAG 2.2 AA, com alguns itens AAA)

**Contraste**

- [ ] Todo texto ≥ 4,5:1 (texto grande ≥ 3:1). Os tokens da seção 1 já foram **calculados** e passam nos dois temas, inclusive `--fg-subtle` (4,7–5,8:1).
- [ ] Elementos não textuais com significado (ícones de status, anel de foco, bordas de input no modo alto contraste) ≥ 3:1 (1.4.11).
- [ ] Status sempre com **ícone + texto**, nunca só cor (1.4.1).
- [ ] Um teste automatizado de contraste dos tokens no CI (script como o da seção 1.3), rodando nos temas claro, escuro e alto contraste.

**Foco e teclado**

- [ ] Foco visível em tudo: `outline: 2px solid var(--ring)` com `outline-offset: 2px`. Isso atende inclusive o 2.4.13 (AAA: perímetro de 2 px e mudança ≥ 3:1). Nunca `outline: none` sem substituto.
- [ ] Foco **não escondido** por elementos fixos (2.4.11): `scroll-padding-top: var(--topbar-h)` e `scroll-padding-bottom` igual à altura da barra de ações fixa.
- [ ] Ordem de Tab lógica. Link "Pular para o conteúdo" como primeiro elemento.
- [ ] **Roving tabindex** em grid, abas, menus, controle segmentado e trilho de etapas.
- [ ] Overlays: foco preso, Esc fecha e o foco **volta à origem**.
- [ ] **Atalhos de uma tecla** (`C`, `G P`, `/`, `?`) só valem fora de campos editáveis e **podem ser desligados** em Aparência (2.1.4).
- [ ] Folha de atalhos acessível pela tecla `?` e pelo menu do usuário.

**Semântica e leitores de tela**

- [ ] `lang="pt-BR"`; landmarks (`header`, `nav`, `main`); hierarquia de títulos (um `h1` por página).
- [ ] Atributos ARIA nos lugares certos:
  - `aria-current="page"` na navegação e nos breadcrumbs;
  - `aria-sort` nas tabelas;
  - `aria-invalid` e `aria-describedby` nos formulários;
  - `aria-busy` em carregamentos;
  - `role="grid"` com índices na planilha;
  - `role="dialog"` com `aria-modal` e título em modais e drawers.
- [ ] Regiões `aria-live`:
  - `polite`: autosave, resultado do cálculo ao confirmar a célula, resultado da busca de CNPJ/CEP e número de resultados de filtro;
  - `assertive`: erros.
- [ ] Botões só com ícone com `aria-label`, e ícones decorativos com `aria-hidden`.
- [ ] Badges com nome acessível completo ("Status: emitido"; "Calibração vence em 12 dias, em 26/10/2026").
- [ ] Gráfico com `role="img"` e resumo; a planilha é a alternativa em tabela.

**Formulários e prevenção de erros**

- [ ] Rótulos visíveis e atributos `autocomplete` (`organization`, `postal-code`, `address-line1`, `tel`, `email`).
- [ ] Erro identificado em texto, com sugestão de correção (3.3.1 e 3.3.3).
- [ ] **Prevenção de erro (3.3.4):** emissão e cancelamento são confirmados; rascunhos têm desfazer; o certificado emitido é corrigido por revisão.
- [ ] **Entrada redundante (3.3.7):** auto-preenchimento por CNPJ/CEP, "repetir configuração da última calibração" e contatos reaproveitados no envio de e-mail.

**Tamanho, zoom e preferências**

- [ ] Alvos ≥ 24 × 24 px (2.5.8); 44 px no toque.
- [ ] Zoom de 200 % sem perda e *reflow* a 320 px nas páginas de conteúdo. Tabelas de dados podem rolar na horizontal (exceção prevista).
- [ ] `prefers-reduced-motion`, `prefers-contrast: more` (ativa o alto contraste) e `prefers-color-scheme` respeitados.
- [ ] **`forced-colors`** (Windows, alto contraste): componentes com borda real (não só fundo), e ícones de status com `forced-color-adjust: auto`.

**Testes**

- axe-core nos testes de componentes (Vitest/Playwright).
- Lighthouse.
- Uma rodada **só de teclado** por tela.
- NVDA + Firefox (Windows do escritório) e VoiceOver + Safari (iPad).
- Capturas de tela de regressão nos temas claro, escuro e alto contraste.

### 7.4 Folha de atalhos

| Contexto | Atalho | Ação |
|---|---|---|
| Global | Ctrl+K / ⌘K | Command palette |
| Global | Ctrl+B / ⌘B | Recolher ou expandir a sidebar |
| Global | `C` | Nova calibração |
| Global | `G` então `P` / `E` / `C` / `B` / `T` / `S` | Ir para Painel / Certificados / Clientes / Balanças / Padrões / Configurações |
| Global | `?` | Folha de atalhos |
| Listas | `/` | Focar o filtro |
| Listas | ↑ ↓ e Enter | Navegar entre linhas e abrir |
| Formulários | Ctrl+S / ⌘S | Salvar |
| Wizard | Ctrl+Enter | Avançar etapa |
| Wizard | Ctrl+S | Salvar agora |
| Planilha | Enter, Tab, setas, F2, Esc, Ctrl+V, Ctrl+D, Ctrl+Z | Ver a seção 4.3 |

---

## 8. Checklist de implementação e decisões em aberto

### 8.1 Ordem sugerida de construção

1. **Tokens** (`app.css` da seção 1.11), fonte auto-hospedada e script anti-flash de tema. Uma página interna "Kitchen sink" com todos os tokens e componentes nos temas claro, escuro e alto contraste.
2. **Shell:** sidebar recolhível, topbar, breadcrumbs, ⌘K e seletor de tema.
3. **Tabela de dados + badges + estados vazios e skeleton** (base de todas as listas).
4. **Formulários:** máscaras, validação, PF/PJ, auto-preenchimento CNPJ/CEP e drawer.
5. **Wizard:** estrutura, trilho de etapas e **autosave em duas camadas** antes de qualquer planilha.
6. **Planilha de leituras:** teclado, cálculo ao vivo, EMA, gráfico e orçamento de incerteza.
7. **PDF do certificado:** layout, cabeçalho e rodapé, QR e assinatura.
8. **Visualização do certificado** e configurações.
9. **Passada de polimento:** motion, auditoria de acessibilidade, testes nos dois temas e no iPad.

### 8.2 Decisões em aberto (dependem de outros levantamentos)

| # | Decisão | Impacto no design | Responsável |
|---|---|---|---|
| 1 | **Cor oficial e logo da marca** | Rodar o script da seção 1.3, colar os primitivos `--brand-*`, ajustar o matiz dos cinzas e conferir o logo em claro e escuro | Levantamento de identidade |
| 2 | **Conectividade do tablet em campo** (VPN para a LAN ou *offline-first* com sincronização) | O indicador "Sem conexão: salvo neste dispositivo" e o diário local já estão previstos. Com *offline-first*, entra uma tela de fila de sincronização | Arquitetura |
| 3 | **Endpoint público para o QR** de autenticidade | Sem ele, o QR não funciona fora da LAN (seção 5.7) | Arquitetura / infra |
| 4 | **Biblioteca do PDF** (@react-pdf/renderer × Chromium headless) | Ambas suportam o layout proposto; muda só a implementação | Arquitetura |
| 5 | **Revisão por segunda pessoa** antes de emitir | Acrescenta o estado "Em revisão" e o botão "Enviar para revisão" | Dono / responsável técnico |
| 6 | **Critério de EMA** (verificação × em serviço), **regra de decisão** padrão e **orçamento de incerteza** definitivo | Valores da coluna EMA, estados conforme/indeterminado/fora e o popover de incerteza | Levantamento técnico de metrologia |
| 7 | **Assinatura digital ICP-Brasil (PAdES)** | Campo em Configurações e selo de texto no PDF | Dono |
| 8 | **Fonte da marca** | Se a identidade usar outra fonte, ela vai só no logo e nos títulos de marketing; a interface continua em Inter | Levantamento de identidade |

---

## 9. Fontes

**Sistemas de design e produtos de referência**

- Linear, "How we redesigned the Linear UI (part II)": https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear, "A calmer interface for a product in motion" (mar/2026): https://linear.app/now/behind-the-latest-design-refresh
- Linear changelog, "New Linear UI" (mar/2024): https://linear.app/changelog/2024-03-20-new-linear-ui
- Vercel Geist, visão geral: https://vercel.com/geist
- Geist, cores: https://vercel.com/geist/colors
- Geist, tipografia: https://vercel.com/geist/typography
- Geist, materiais: https://vercel.com/geist/materials
- Vercel, tokens (`design.md`): https://vercel.com/design.md
- Vercel, redesign da navegação do dashboard: https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- Stripe, "Designing accessible color systems": https://stripe.com/blog/accessible-color-systems
- Stripe Apps, padrões de design: https://docs.stripe.com/stripe-apps/patterns
- Stripe Apps, controles de filtro: https://docs.stripe.com/stripe-apps/patterns/filter-controls
- Attio, views: https://attio.com/help/reference/managing-your-data/views
- Attio, glossário (células "enriched" em lilás): https://attio.com/help/reference/attio-101/attio-glossary
- shadcn/ui, theming: https://ui.shadcn.com/docs/theming
- shadcn/ui, sidebar: https://ui.shadcn.com/docs/components/sidebar
- shadcn/ui, data table: https://ui.shadcn.com/docs/components/data-table
- Radix Colors, "Understanding the scale": https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Radix Colors, "Composing a palette": https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette
- Radix Colors, gerador de paleta custom: https://www.radix-ui.com/colors/custom
- Radix Colors, escalas em hex: https://github.com/radix-ui/colors/tree/main/src
- Radix Themes, cor: https://www.radix-ui.com/themes/docs/theme/color
- Tailwind CSS v4, theme variables: https://tailwindcss.com/docs/theme
- Tailwind CSS v4, dark mode: https://tailwindcss.com/docs/dark-mode
- Tailwind CSS v4, paleta padrão: https://tailwindcss.com/docs/colors
- Catalyst UI kit: https://catalyst.tailwindui.com/docs
- Tailwind blog, Catalyst application layouts: https://tailwindcss.com/blog/2024-05-24-catalyst-application-layouts
- Tailwind Plus, application shells: https://tailwindcss.com/plus/ui-blocks/application-ui/application-shells/sidebar
- Material Design 3, superfícies tonais: https://material.io/blog/tone-based-surface-color-m3
- Material Color Utilities (tons das cores de papel do M3): https://github.com/material-foundation/material-color-utilities/blob/main/typescript/dynamiccolor/color_spec_2021.ts
- Material Web, tokens de motion do M3: https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-motion.scss
- Material Design (M2), dark theme (#121212, 15,8:1): https://m2.material.io/design/color/dark-theme
- Apple Human Interface Guidelines, Dark Mode: https://developer.apple.com/design/human-interface-guidelines/dark-mode
- IBM Carbon, estilo da data table (alturas de linha): https://carbondesignsystem.com/components/data-table/style/
- Visa Design System, tabela: https://design.visa.com/components/table/usage/
- Maersk Design System, tabela: https://designsystem.maersk.com/components/table/

**Cor, tipografia e componentes**

- Evil Martians, "OKLCH in CSS: why we moved from RGB and HSL": https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- Adobe Leonardo (cores por contraste-alvo): https://leonardocolor.io/
- Inter (rsms): https://rsms.me/inter/
- Geist Font: https://github.com/vercel/geist-font
- cmdk: https://github.com/pacocoursey/cmdk
- Sonner: https://sonner.emilkowal.ski/
- Emil Kowalski, "Building a toast component": https://emilkowal.ski/ui/building-a-toast-component
- Diretrizes de animação de Emil Kowalski (cópia comunitária, fonte secundária): https://www.ui-skills.com/skills/emilkowalski/emil-design-eng
- Matt Ström-Awn, "Design better data tables": https://mattstromawn.com/writing/tables/
- Matthew Butterick, *Practical Typography*, tabelas: https://practicaltypography.com/tables.html
- react-pdf, conteúdo dinâmico e número de páginas: https://react-pdf.org/docs/v4/advanced/dynamic-content

**Acessibilidade e UX**

- WCAG 2.2, Focus Appearance (2.4.13): https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- WCAG 2.2, Target Size Minimum (2.5.8): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WAI-ARIA APG, padrão Grid: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- WAI-ARIA APG, combobox: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/
- Nielsen Norman Group, "Wizards: Definition and Design Recommendations": https://www.nngroup.com/articles/wizards/

**Domínio: calibração e metrologia**

- Beamex CMX (avaliações e recursos): https://www.softwareadvice.com/za/cmms/beamex-cmx-profile/
- Beamex CMX, comparativo: https://www.capterra.com/compare/42537-75737/Calibration-Management-Software-vs-CMX
- Fluke MET/TEAM: https://www.fluke.com/en-gb/product/fluke-software/fluke-calibration-software/met-team-asset-management-software
- Qualer, recursos (2.7): https://info.qualer.com/sp_feature_all
- Comparativo de softwares de calibração (inclui Qualer): https://geekflare.com/software/best-calibration-management-software/
- Calibra Fácil (código aberto, ISO/IEC 17025, Brasil): https://github.com/CalibraFacil/calibrafacil
- Metroex: https://metroex.com.br/
- Calibre.Software: https://calibre.software/
- Cali: https://cali.com.br/
- Qualyteam, gestão de calibrações: https://qualyteam.com/pb/software-gestao-calibracoes-calib/
- Presys, software de calibração: https://presys.com.br/software-de-calibracao/
- NIST, *crosswalk* ISO/IEC 17025:2017 7.8 (relato de resultados): https://www.nist.gov/document/7-8-17025-crosswalk-reporting-results-20180201pdf
- EURAMET cg-18 v4.0, "Guidelines on the Calibration of Non-Automatic Weighing Instruments" (cópia NIST): https://www.nist.gov/document/i-cal-gui-018calibrationguideno18webpdf
- Portaria Inmetro nº 157/2022 (RTM de instrumentos de pesagem não automáticos): https://sibapem.com.br/wp-content/uploads/2023/01/Portaria-157-2022.pdf
- Mettler-Toledo, Accuracy Calibration Certificate (exemplo de certificado técnico): https://www.mt.com/us/en/home/library/datasheets/lab-analytical-instruments/accuracy-calibration-certificate-for-tga.html

**CNPJ alfanumérico**

- Serpro: https://serpro.gov.br/menu/noticias/noticias-2024/cnpj-alfanumerico
- COAD, "CNPJ terá letras e números a partir de julho de 2026": https://www.coad.com.br/home/noticias-detalhe/128583/cnpj-tera-letras-e-numeros-a-partir-de-julho-de-2026
- TJRJ, flashcard do CNPJ alfanumérico (máscara e exemplo): https://portaltj.tjrj.jus.br/documents/d/guest/flashcard_cnpj_com_caracteres_alfanumericos_v1-0
