# BC Calibração

Sistema da **Balanças.com** para emitir **certificados de calibração de balanças** (laboratório não acreditado, fora da RBC).
Roda num computador da empresa e é usado pelo navegador por quem está na **rede interna**. Ele não fica exposto à internet.

## O que o sistema faz

- **Clientes** (empresa ou pessoa física). Com o CNPJ, preenche razão social, endereço, telefone e e-mail. Com o CEP, preenche o endereço.
- **Balanças** dos clientes: tipo, fabricante, modelo, nº de série, identificação, portaria de aprovação de modelo, capacidade, divisões (e/d), classe, faixas, local de instalação.
- **Padrões** da empresa: jogos de pesos (peça por peça, com correção e incerteza do certificado), termo-higrômetro e barômetro.
  O sistema avisa quando um padrão está vencendo e **bloqueia a emissão** quando ele já venceu.
- **Calibração passo a passo**:
  1. Identificação e nº da **OS** do sistema de ordens de serviço
  2. Balança e ajuste (a calibração não inclui ajuste: só o ajuste interno, CAL, feito antes dos ensaios)
  3. Padrões e condições ambientais
  4. Repetibilidade
  5. Excentricidade (o método é o da classe: zera e desloca; na classe I, zera antes de cada posição)
  6. Erro de indicação
  7. Conclusão
  8. Revisão

  O cálculo de erro, incerteza (k e νeff) e conformidade é feito **ao vivo** pelo método EURAMET cg-18.
  Calibrações gravadas antes do POP de calibração (com ajuste externo, "como encontrado", reparo ou verificação
  preliminar "não") continuam abrindo e saindo no certificado como antes, só para conferência. Rodoviárias e
  ferroviárias não entram no cadastro novo (as já cadastradas continuam).

- **Folha de campo** (FOR-CAL-01) para levar ao cliente e preencher à caneta (o registro de dados brutos da ISO/IEC 17025, 7.5):
  - 8 passos na ordem do serviço no local (padrões, chegada, identificação da balança, ambiente, erro de indicação, repetibilidade, excentricidade, assinaturas e etiqueta), e cada passo diz em que etapa do sistema é digitado. Só a medição: sem ajuste, reparo nem "como encontrado" (na classe I, só a caixa do ajuste interno de rotina feito antes dos ensaios);
  - dado impresso diferente do encontrado, observações e anomalias vão no quadro **Anotações**, no fim da folha, com o nº do passo, rubrica e data (sem espaço, numa folha anexa). A hora só na chegada (passo 2), no ambiente do início e do fim (passo 4) e no término (passo 8): os ensaios não têm hora;
  - já vem com o que o sistema sabe: cliente, endereço, OS, balança, os pontos com os pesos de cada carga (0, Min, quando marcada, ~25, 50 e 75 % de Max e Max; as cargas em que o EMA muda só com a declaração de conformidade pedida, POP 7.7), o método de carregamento da classe numa linha impressa (POP 7.7, sem caixas de marcar), a carga (no mínimo 1/3, 1/5 ou 1/10 de Max, arredondada para cima) e as posições da excentricidade, a repetibilidade (em multi-intervalo e múltiplas faixas, um ensaio por intervalo) e os padrões a separar (o barômetro em toda classe: a pressão é obrigatória, POP 7.5), com os requisitos da classe (aquecimento, ΔT) e aviso de padrão vencido, de pesos que não fecham a carga (dos pontos, da repetibilidade ou da excentricidade), de Min fora das cargas, de pesos padrão abaixo do mínimo com cargas de substituição, da carga de excentricidade abaixo da Tabela 5 do POP e de intervalo sem ensaio de repetibilidade (as cargas copiadas do último certificado; o assistente avisa também);
  - nº **FC-AAAA-NNNNN** e o nº do certificado reservado em toda página, com "Página X de Y" (sem QR e sem rubrica por página: a data e as assinaturas ficam no passo 8); o mesmo nº é sempre o mesmo documento: a reimpressão é o arquivo da primeira impressão, byte a byte (o PDF fica em `dados/folhas-campo/<ano>/`, com o sha256 no banco: copie essa pasta junto com a de certificados), e a folha em branco ligada depois a uma calibração reimprime em branco, como foi a campo; o nº aparece na calibração (e na revisão dela, que usa a folha do certificado revisado, sem nº novo);
  - imprime pelo assistente da calibração, ao criar a calibração (antes da visita), pela balança, ou **em branco**, para uma balança ainda não cadastrada das classes II a IIII ou sem classe (a classe I imprime a folha da balança cadastrada); a folha avulsa (em branco, do cliente ou da balança) é ligada depois à calibração digitada pelo nº dela, na etapa 1 (Cliente e OS); a folha de um rascunho excluído fica livre para ser ligada à calibração refeita, e a de um certificado cancelado (ou de uma revisão cancelada) passa para ela pelo administrador, continua aparecendo no cancelado e volta para ele se a refeita for excluída; a avulsa ligada por engano e trocada fica livre de novo; a de outra calibração que vale, não (a mensagem diz qual); impressa para outra balança (cadastro duplicado e excluído, rascunho refeito com a balança certa), só confirmando;
  - **nº do certificado já na folha** ("pré-número"), para o técnico copiar na etiqueta da balança: é reservado na primeira impressão (da mesma sequência da emissão, nunca dado a outro papel) e o certificado é emitido com ele, mesmo em outro ano; a reimpressão e a folha nova continuam com o mesmo, e a revisão sai com o do certificado revisado. **O nº segue o papel**: a folha avulsa (também a em branco) reserva um nº dela, e a folha ligada à calibração leva para ela o nº impresso (o da etiqueta). Se a calibração já tinha nº (a folha dela não foi a campo), o dela fica **não utilizado**, com o motivo, e volta a valer se aquela folha for ligada de novo (engano no nº); a avulsa trocada leva o nº dela de volta. Calibração excluída antes da emissão: o nº volta para a folha que foi a campo (a mais nova, depois de uma folha nova), livre para a calibração refeita; a tela e os registros mostram sempre essa folha. O nº que não pode mais ser usado (na revisão, que sai com o do revisado; o de um certificado cancelado; o registrado como não utilizado) não passa, e a tela avisa para corrigir a etiqueta. A lista "Números não utilizados", em Certificados, explica os saltos na numeração e mostra os nºs em folhas ainda não ligadas (o administrador registra lá o nº de uma folha perdida). A cópia do banco restaurada leva os nºs reservados depois dela e os certificados emitidos depois dela (com o mesmo nº e o mesmo código), e a folha que volta pela pasta das folhas traz de volta o nº impresso nela. Um nº que tem PDF na pasta `certificados` nunca é emitido de novo, e nenhum PDF dela é sobrescrito;
  - calibração que já tem folha pergunta ao imprimir: **reimprimir** a mesma ou **folha nova (novo nº)**, com os dados atuais (o plano mudou antes da visita); a de antes continua registrada como substituída (não usada) e a troca vai para o registro de atividades;
  - certificado emitido só reimprime a folha que a calibração teve (nenhum nº novo depois da emissão), e a revisão de um certificado feito sem folha também não ganha nº novo (é a mesma visita);
  - rodoviária já cadastrada (o cadastro novo não a oferece, e o POP não a cobre) sem cargas de substituição no plano: a folha sugere as etapas (os pesos previstos em cada uma) e o nº de substituições de cada ponto, como o cálculo soma; pontos e etapas que não cabem juntos na página do título do passo 5: os pontos ficam nela e as etapas vão para a seguinte;
  - enxuta: 2 páginas (frente e verso), também a folha em branco; por último, depois das assinaturas (passo 8), o quadro Anotações, com linhas até o pé da última página (pelo menos 3).
- **Certificado em PDF** enxuto (2 páginas; 3 com ajuste e "como encontrado" ou muitos ensaios), com:
  - número único, o POP, "Página X de Y" em toda página e "Fim do certificado" (as assinaturas nunca ficam sozinhas na última página: vão com a última declaração);
  - a cláusula de reprodução (só na íntegra) no rodapé de toda página;
  - rastreabilidade (todo padrão precisa da acreditação Cgcre do laboratório que o calibrou), incerteza expandida com k e νeff, condições ambientais (a pressão só com o barômetro entre os padrões, e o barômetro escolhido só com a pressão registrada) e resultados antes e depois do ajuste;
  - a prévia do rascunho sai com a marca "PRÉVIA — SEM VALOR", sem as imagens das assinaturas (ninguém autorizou ainda) e com "Prévia gerada em …" no lugar de "emitido em";
  - declaração de laboratório não acreditado.
- **Assinaturas**: com a revisão por outra pessoa desligada (Configurações → Certificado), o certificado sai só com a assinatura de quem executou ("Executado por"), mesmo que outra pessoa emita; ligada, com a de quem executou e a de quem autorizou. Quem emitiu fica sempre registrado no sistema. Fica gravado na emissão: mudar a configuração depois não muda os já emitidos.
- **Correção** de um certificado emitido: sai com o mesmo nº e a data de emissão nova, como um certificado comum (sem sufixo, sem quadro de revisão e sem o motivo). Por dentro fica tudo: a versão anterior (o PDF dela continua na pasta, e o da correção é guardado como `Certificado-<nº>-versao-2.pdf`), quem corrigiu, quando e o motivo, no histórico das versões do certificado e no registro de atividades. A lista mostra uma linha por nº, com "Editado em". As revisões emitidas antes da 1.0.4, com "-R1", continuam como saíram. **Cancelamento** com motivo. O PDF emitido nunca muda: a cópia de um certificado cancelado ou substituído é ele mesmo, com a marca d'água por cima, e não um PDF refeito com o cálculo de hoje.
- **POP** (Procedimento Operacional Padrão) em Configurações → Certificado: código, revisão, data e o arquivo (PDF ou Word), com o histórico das revisões. O código e a revisão saem em todas as páginas do certificado e da folha de campo. O certificado cita a revisão usada na calibração: a impressa na folha de campo; sem folha, a que valia na data da calibração; na revisão de um certificado, a do original. A data da revisão não pode ser no futuro; sem POP registrado, o certificado não é emitido. O botão **POP** (Certificados e calibração) abre o arquivo para qualquer pessoa da equipe.
- **Padrões** com o arquivo do certificado de calibração (PDF, JPG ou PNG, até 10 MB), conferido pelo conteúdo. Trocar o arquivo com o mesmo nº de certificado corrige também os certificados já emitidos com ele; quando o padrão é calibrado de novo (outro nº), os já emitidos continuam com o arquivo do certificado deles, guardado no cadastro. Mudar o nº mantendo o arquivo antigo é recusado (o arquivo iria aos clientes com o nº novo), salvo confirmação de que só se corrigiu o nº.
- **Envio por e-mail** do PDF ao cliente junto com os certificados dos padrões usados (o arquivo do certificado de cada padrão com o nº que saiu no certificado; até 20 anexos e 18 MB), com histórico de envios e dos anexos, e **lembretes** de calibração para as balanças que vão vencer.
- **Usuários**, em dois níveis:
  - **operador**: o dia a dia (clientes, balanças, padrões, calibrações) e a emissão, a impressão e o envio dos certificados;
  - **administrador**: além disso, configurações, usuários, cópias de segurança, cancelar certificados, marcar a folha que não vai ser usada e excluir cadastros.

  À parte do nível, o administrador marca em cada usuário:
  - **técnico**: executa as calibrações (só quem tem a marca aparece em "Técnico que executou" e na folha de campo; na atualização para a 1.0.5, todos ganharam a marca);
  - **signatário**: autoriza os certificados, com a assinatura digitalizada.

  Com a revisão por outra pessoa desligada, qualquer pessoa emite. Ligada, quem digita escolhe um signatário (nunca o técnico daquela calibração nem quem escolheu ou trocou o "Técnico que executou") e envia para a autorização dele; a calibração fica "Aguardando autorização", o signatário a vê em Certificados ("Para você autorizar") e no painel, confere (pode corrigir a digitação) e clica em "Autorizar e emitir", ou devolve com uma nota. O signatário que não executou nem escolheu o técnico pode fazer tudo sozinho e autorizar direto; o que digitou a folha de outra pessoa e escolheu o técnico envia para outro signatário. Ninguém assina por outra pessoa.

  Há também o registro de atividades.

- **Backup** automático todo dia, cópia manual e restauração. As cópias são do banco (com os arquivos anexados: certificados dos padrões e POP); os PDFs dos certificados e das folhas de campo ficam nas pastas `certificados` e `folhas-campo` da pasta de dados (copie a pasta inteira). Para voltar uma cópia antiga, siga o [LEIA-ME do instalador](instalador/LEIA-ME.md#depois-de-instalado): com `redefinir-senha.mjs transplantar` antes de pôr a cópia no lugar, os usuários atuais (com senha, signatário, cargo, registro e assinatura) ficam, os certificados emitidos depois dela continuam emitidos (o mesmo nº e o mesmo código: o QR code confere) e as folhas de campo impressas depois dela continuam registradas, ligadas às calibrações; sem ele (ou com o banco atual estragado), elas voltam sozinhas pela pasta `folhas-campo` quando o servidor sobe, como folhas livres com a data da impressão, e o papel é ligado à calibração confirmando, e os nºs dos PDFs da pasta `certificados` que a cópia não conhece ficam como não utilizados (nunca são emitidos de novo). Nenhuma calibração fica com duas folhas vigentes (fica a mais nova; a outra pode ser ligada de novo pelo nº), e a numeração (FC e de certificado) nunca volta para trás.
- **Modo claro e escuro**, e funciona no celular e no tablet da oficina.

## Instalação no servidor (Windows)

Use o instalador **`BC-Calibracao-Setup-<versão>.exe`** e escolha **Servidor** na primeira tela. Ele já traz tudo o que é preciso, então **não é necessário instalar Node, banco de dados nem mais nada**.
O instalador:

- copia o programa para `C:\Program Files\BC Calibracao`;
- guarda os dados em `C:\ProgramData\BC Calibracao\dados`;
- registra o serviço do Windows **BC Calibração**, que inicia junto com o computador;
- libera a porta **4850** no firewall **só para a rede local**;
- cria um atalho para abrir o sistema.

Detalhes, atualização e desinstalação estão em [`instalador/LEIA-ME.md`](instalador/LEIA-ME.md).

### Primeiro acesso

1. **No próprio servidor**, abra `http://localhost:4850`.
2. Crie a conta do **administrador**. Ela já é signatária.

   Por segurança, a primeira conta só pode ser criada no próprio servidor, nunca pela rede.

3. Em **Configurações**, confira:
   - os dados da empresa;
   - os textos do certificado;
   - o e-mail de envio (SMTP).
4. Em **Usuários**, cadastre as pessoas (operador ou administrador). Marque como **técnico** quem executa as calibrações e como **signatário** quem pode autorizar a emissão, e envie a assinatura digitalizada de cada um.
5. Em **Padrões**, cadastre os pesos e os instrumentos com os dados dos certificados de calibração deles.
6. Terminados os testes, antes de começar a usar de verdade, **apague os testes** uma vez (com o serviço parado, no prompt de comando como administrador: `node\node.exe server\ferramentas\apagar-testes.mjs "C:\ProgramData\BC Calibracao\dados"`, na pasta do programa). Saem as calibrações, os certificados, as folhas de campo e os nºs reservados, e a numeração recomeça do 1; ficam os usuários, a empresa, as configurações, o POP, os padrões, os clientes e as balanças. O passo a passo está no [LEIA-ME do instalador](instalador/LEIA-ME.md#depois-de-instalado).

### Acesso pelos outros computadores (estações)

Em cada um dos outros computadores, rode **o mesmo instalador** e escolha **Estação**. Ele:

- acha o servidor sozinho na rede e mostra qual achou (se não achar, é só digitar o nome ou o IP dele);
- cria o ícone **BC Calibração** na Área de Trabalho e no Menu Iniciar.

O ícone abre o sistema numa **janela própria** (pelo Microsoft Edge, sem abas nem barra de endereço), sem ninguém precisar digitar IP. Se o servidor mudar de IP, o programa o encontra de novo sozinho; ele nunca troca de servidor sem perguntar. A estação não instala banco nem serviço e não abre nenhuma porta. Detalhes em [`instalador/LEIA-ME.md`](instalador/LEIA-ME.md#estações-os-outros-computadores).

Também dá para usar sem instalar nada: no navegador, abra `http://IP-DO-SERVIDOR:4850`, por exemplo `http://192.168.0.10:4850`. O endereço aparece na tela do servidor e em **Configurações**.

O acesso é recusado de fora da rede local em três camadas:

- a regra do firewall;
- o filtro de endereços do próprio sistema;
- a conferência do nome usado no navegador.

## Desenvolvimento

Requisitos: **Node.js 22.18 ou mais novo** (o servidor roda o TypeScript direto, sem compilar).

```bash
npm install
npm run dev      # interface (Vite) + servidor, com recarga automática
npm test         # testes (Vitest)
npm run lint     # oxlint
npm run build    # confere os tipos e gera a interface em dist/
npm start        # servidor de produção (serve dist/) em http://localhost:4850
```

As configurações do servidor ficam num arquivo `.env`. Veja o modelo em [`.env.exemplo`](.env.exemplo): porta, pasta de dados e nomes permitidos. O que o ambiente já define vale mais que o `.env`. No servidor instalado pelo setup do Windows, o serviço define a porta, o HOST e a pasta de dados, e o modelo instalado é o [`instalador/env-servidor.exemplo`](instalador/env-servidor.exemplo).

### Gerar o instalador

```bash
scripts/empacotar-windows.sh
```

No GitHub, o workflow **Instalador Windows** também gera o instalador.

### Organização do código

| Pasta            | Conteúdo                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/`        | Tipos, regras de cadastro, textos do certificado, permissões e o **motor metrológico** (`shared/metrologia`) usado igual no navegador e no servidor |
| `server/`        | Fastify + SQLite embutido do Node (`node:sqlite`), geração do PDF (`server/pdf`), e-mail, backup, consultas de CNPJ/CEP e controle de acesso        |
| `src/`           | Interface em React + Tailwind                                                                                                                       |
| `instalador/`    | Script do NSIS, serviço (WinSW), ferramentas do instalador e o programa das estações (`instalador/estacao`)                                         |
| `docs/pesquisa/` | Pesquisa que embasou o sistema, com as fontes: normas, cálculo de incerteza, modelos de certificado, design e instalador                            |

## Sobre o certificado (não RBC)

O certificado segue a ABNT NBR ISO/IEC 17025 (item 7.8) e o guia EURAMET cg-18 em tudo o que se aplica a um laboratório não acreditado.

- **Não usa** o logotipo nem o nome da RBC, da Cgcre, do Inmetro ou da ILAC.
- **Não usa** os termos "aferição" e "validade". O sistema avisa se eles forem digitados.
- Declara que o laboratório **não é acreditado** e que a calibração **não substitui a verificação metrológica do IPEM/Inmetro**, que é obrigatória para balanças de uso comercial.
- A data da próxima calibração **só sai no certificado se o cliente pediu**. Caso contrário, ela fica só como lembrete interno.
- A rastreabilidade é declarada pelos certificados dos padrões utilizados.

As fontes e a justificativa de cada item estão em [`docs/pesquisa/01-normas-certificado.md`](docs/pesquisa/01-normas-certificado.md) e [`docs/pesquisa/02-procedimento-tecnico-incerteza.md`](docs/pesquisa/02-procedimento-tecnico-incerteza.md).
