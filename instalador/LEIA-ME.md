# Instalador do Windows (setup.exe)

Um único `BC-Calibracao-Setup-<versão>.exe` serve para todos os computadores da empresa. Na primeira tela ele pergunta o que o computador vai ser:

- **Servidor**: instala o BC Calibração no computador que fica sempre ligado, já com o Node.js portátil e o WinSW dentro. Não é preciso instalar mais nada nem ter internet no servidor.
- **Estação**: nos outros computadores, instala só um ícone "BC Calibração" que abre o sistema do servidor numa **janela própria**, sem abas nem barra de endereço e sem ninguém digitar IP. O servidor é encontrado sozinho na rede (veja [Estações](#estações-os-outros-computadores)).

Arquivos: `bc-calibracao.nsi` (script NSIS), `bc-calibracao.ico` (gerado a partir de `src/assets/logo/balancas-icone.svg`), `ferramentas/` (scripts copiados para a instalação do servidor), `estacao/` (o programa das estações: `lancador.nsi`, `estacao.nsh` e `descobrir-servidor.ps1`), `../scripts/empacotar-windows.sh` (monta tudo) e `../.github/workflows/instalador-windows.yml` (CI).

## Como gerar

```bash
scripts/empacotar-windows.sh
```

Ele roda `npm ci` e `npm run build`, monta `pacotes/payload/` (`server/` e `shared/` sem os testes, `dist/`, `package.json`, `package-lock.json`, `.env.exemplo` e o `node_modules` de produção), baixa o Node.js 24.21.0 (só o `node.exe` do zip oficial `win-x64`) e o WinSW 2.12.0 (`WinSW.NET461.exe`), confere os SHA-256 e sobe o servidor do payload para ver se ele responde. Depois roda o `makensis -WX` (aviso vira erro) duas vezes: primeiro o programa das estações (`estacao/lancador.nsi` → `payload/estacao/BC Calibracao.exe`, ~250 KB), depois o setup, e grava `pacotes/BC-Calibracao-Setup-<versão>.exe` e o `.sha256`. Os downloads ficam em `pacotes/cache/`.

- **Precisa de:** Node.js e npm, curl, unzip e o **NSIS 3.12 ou mais novo**. As versões anteriores têm falhas de elevação de privilégio (CVE-2025-43715 e CVE-2026-42171), e a 3.09 do Ubuntu é uma delas. O script recusa versões antigas, a menos que se use `PERMITIR_NSIS_ANTIGO=1` (só para testes). Para um `makensis` fora do PATH, use `MAKENSIS=/caminho/makensis`.
- **`PULAR_BUILD=1`:** não roda o `npm ci` nem o build e põe no pacote uma interface provisória, criada só dentro do payload. O arquivo sai como `...-teste.exe`. Serve apenas para testar o instalador enquanto o código está em obras.
- **CI:** uma tag `v1.2.0` (igual à versão do `package.json`) roda os testes, gera o setup num container `debian:testing` (NSIS 3.12+) e publica o `.exe` no Release. O botão "Run workflow" gera o setup como artefato e, se marcado "publicar", também o publica.
- **Versões fixas:** no começo do script. Para trocar o Node, mude `NODE_VERSAO` e copie o SHA-256 do `SHASUMS256.txt` oficial para `NODE_SHA256`.

## O que o instalador faz no servidor

Numa instalação nova, antes da tela "Tipo de instalação", o setup procura um servidor do BC Calibração na rede. Se já houver um, ele sugere **Estação** e pede confirmação antes de instalar um segundo servidor (com dois, cada computador pode acabar gravando num lugar diferente). Se não achar nenhum, ou não conseguir procurar (PowerShell bloqueado, por exemplo), a tela diz isso, lembra que um servidor desligado, em outra porta ou em outra rede não aparece na procura, e escolher **Servidor** também pede confirmação (o padrão é Não). Numa atualização, ou com `/S`, ele não pergunta: continua sendo o servidor.

| Item | Onde / como |
|---|---|
| Programa | `C:\Program Files\BC Calibracao` (caminho fixo, só ASCII): `server\`, `shared\`, `dist\`, `node_modules\`, `node\node.exe`, `servico\BCCalibracao.exe` (WinSW) e `.xml`, `ferramentas\` |
| Dados | `C:\ProgramData\BC Calibracao\dados`: banco `bc-calibracao.db`, `backups\`, `certificados\` (PDF de cada certificado emitido), `folhas-campo\` (PDF de cada folha de campo impressa, por ano: o registro do que foi a campo; a numeração FC parte dela e do banco), `email.json` e `id-da-instalacao.txt` (a identidade do servidor para as estações; vai junto se a pasta for levada para outro computador). É a `PASTA_DADOS` do servidor. As cópias de `backups\` são só do banco: a cópia de segurança externa precisa da pasta `dados` inteira |
| Registros | `C:\ProgramData\BC Calibracao\logs`: `BCCalibracao.out.log`, `.err.log` e `.wrapper.log`, girando a cada 10 MB (guarda 8) |
| Permissões | `C:\ProgramData\BC Calibracao` só para SYSTEM e Administradores (controle total) e LocalService (modificar). O dono passa a ser Administradores e as permissões avulsas são desfeitas a cada instalação |
| Serviço | `BCCalibracao` ("BC Calibração"), WinSW com `node.exe server\iniciar.mjs`, `PORTA`, `HOST=0.0.0.0` e `PASTA_DADOS`. Início automático; reinicia após 10 s, 30 s e 60 s em caso de falha |
| Conta do serviço | **LocalService**: um erro no sistema exposto à rede não vira controle total do servidor, como aconteceria com LocalSystem. Ela só grava na pasta de dados. Se algo não funcionar com ela, rode o setup com `/CONTA=LocalSystem` (a escolha fica guardada para as atualizações) |
| Firewall | Regra "BC Calibracao (rede local)": entrada TCP na porta, só para o `node.exe` instalado, só de `localsubnet` mais as redes extras, nos perfis **Privado e Domínio**. O perfil Público fica de fora porque é a rede em que o Windows não confia. Se a placa estiver como Pública, o setup avisa como marcá-la como Privada |
| Atalhos | Área de Trabalho e Menu Iniciar (todos os usuários): "BC Calibração" (`http://localhost:PORTA`), "Redefinir senha do BC Calibração" (pede permissão de administrador) e "Pasta dos certificados e backups" |
| Página final | Como os outros computadores acessam (instalar a estação ou abrir `http://NOMEDOCOMPUTADOR:PORTA` e os IPs no navegador) e a opção de abrir o sistema. **No primeiro acesso, abra o sistema no próprio servidor**: ele pede para criar o administrador |

**Atualização por cima:** é só rodar o setup novo. Ele para o serviço e copia o banco para `dados\backups\antes-da-versao-X.db`. A cópia é feita pelo `node.exe` instalado com `node:sqlite`, por `VACUUM INTO`, e conferida em seguida; se isso falhar, os arquivos `.db`, `-wal` e `-shm` são copiados como estão. Depois o setup troca o programa sem tocar nos dados (o `.env` da pasta do programa também fica), reinstala o serviço e o inicia. A porta, as redes e a conta continuam as mesmas.

**Desinstalação:** pelo "Aplicativos instalados" do Windows. Remove o serviço, a regra do Firewall e os atalhos e pergunta se os dados devem ser apagados. O padrão é **não**, e apagar pede uma segunda confirmação. Quando os dados ficam, a porta e as redes continuam no registro e são reaproveitadas numa reinstalação.

## Estações (os outros computadores)

Em cada um dos outros computadores, rode **o mesmo** `BC-Calibracao-Setup-<versão>.exe` e escolha **Estação**. O setup procura o servidor na rede e mostra o que achou ("Servidor encontrado: SERVIDOR (192.168.0.10), versão 1.2.0"). Normalmente é só clicar em **Instalar**. Se ele não achar, ou se você preferir, digite o nome ou o IP do servidor (com `:porta` se ela não for a 4850). Se o servidor estiver desligado no momento, dá para instalar assim mesmo: o programa procura de novo quando for aberto.

| Item | Onde / como |
|---|---|
| Programa | `C:\Program Files\BC Calibracao Estacao`: `BC Calibracao.exe` (~250 KB), `descobrir-servidor.ps1` e o ícone. Nada de Node, serviço, banco, pasta de dados ou regra de Firewall: **a estação não abre nenhuma porta** |
| Atalhos | Área de Trabalho e Menu Iniciar (todos os usuários): **BC Calibração** e, no Menu Iniciar, **Procurar o servidor do BC Calibração** (procura de novo ou deixa digitar o nome ou o IP) |
| Servidor escolhido | `HKLM\SOFTWARE\BC Calibracao Estacao` (para todos os usuários; gravado pelo setup) e `HKCU\Software\BC Calibracao Estacao` (o que o programa achou depois, para cada usuário). Valores: `Endereco`, `Porta`, `Nome` (nome do computador servidor), `Id` (o id do servidor), `Ip`, `Url`, `Geracao` e, opcional, `SemVarredura`. Cada vez que o setup roda, ele grava uma `Geracao` nova no HKLM, e o HKCU de antes dela deixa de valer: **o servidor escolhido no setup passa a valer para todos os usuários** do computador |
| Janela do sistema | Microsoft Edge em modo aplicativo (`msedge --app=http://SERVIDOR:4850/`), com um perfil só do BC Calibração em `%LOCALAPPDATA%\BC Calibracao\Navegador` (login, tamanho e posição da janela ficam nele, separados do Edge pessoal). Sem Edge, usa o Google Chrome; sem os dois, o navegador padrão (mas nunca o Internet Explorer, que não roda o sistema: aí o programa pede para instalar o Edge) |
| Desinstalação | "BC Calibração (estação)" em Aplicativos instalados. Remove o programa, os atalhos e a configuração (não mexe no servidor) |

**Como o programa acha o servidor** (cada clique no ícone):

1. Testa o servidor guardado com `GET /api/saude` (HTTP simples, sem PowerShell; leva milissegundos). Respondeu o **mesmo** servidor? Abre a janela e pronto: o programa nem aparece.
2. Não respondeu (servidor desligado, IP trocado)? Mostra "Procurando o servidor do BC Calibração na rede…" e roda o `descobrir-servidor.ps1` escondido. Ele testa o nome e o IP conhecidos e, se não der, varre a rede da estação: tenta uma conexão TCP na porta em todos os endereços das sub-redes privadas das placas ativas (uma /24 inteira em cerca de 1 segundo; sem VPN e sem placas virtuais) e só aceita quem responde `"app":"bc-calibracao"` em `/api/saude`. Usa a mesma porta que o servidor já libera para a rede local: nada novo no Firewall.
3. Achou o **mesmo** servidor, e só ele? Guarda o endereço novo para o usuário e abre. **Nunca troca de servidor sozinho**: se achar outro (inclusive um servidor de versão anterior à 1.2, que não se identifica), ou mais de um, mostra a lista e o campo continua com o servidor de antes. Trocar é clicar no outro na lista e confirmar (o padrão da pergunta é Não).
4. Não achou: mostra a mensagem com o que conferir (o servidor está ligado? na mesma rede?), o botão **Procurar de novo** e o campo para digitar o nome ou o IP.

**Como ele sabe que é o mesmo servidor:** o `/api/saude` informa o nome do computador, um `id` e uma `instancia`. O `id` é aleatório, criado na primeira vez em `dados\id-da-instalacao.txt`: continua o mesmo numa atualização, numa troca de IP ou de nome e quando a pasta de dados é levada para outro computador. É ele que a estação guarda e compara. A `instancia` muda a cada início do serviço e mostra se duas respostas vêm do mesmo processo (um servidor com duas placas de rede é um só). Dois servidores com o mesmo nome ou o mesmo `id` ao mesmo tempo, como uma cópia do disco ou da máquina virtual, ou o servidor antigo ainda ligado depois de uma migração, aparecem como **vários**, e a estação pergunta. O `id` não é senha: só distingue um servidor do outro.

**Só a rede local:** como o servidor, a estação só aceita endereços de rede local (127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x e 100.64–127.x). Um nome que leva (também) a um IP da internet, como o de um DNS que responde qualquer nome, é recusado, tanto na procura quanto no endereço digitado.

Sempre que o nome do computador servidor funciona a partir da estação (DNS, roteador ou a própria rede do Windows), o endereço guardado é `http://NOME:4850/`, e não o IP: assim a troca de IP nem é percebida e o login continua valendo. Quando o nome não funciona, fica o IP, e a procura cuida da troca.

**Dicas**

- **IP fixo no servidor:** o mais garantido é reservar o IP do servidor no roteador (reserva de DHCP). A procura é a rede de segurança.
- **Fixar na barra de tarefas:** fixe pelo atalho do Menu Iniciar (botão direito > Fixar na barra de tarefas). Fixar a janela aberta fixa o Edge, não o BC Calibração.
- **Trocar o servidor de computador:** depois de passar o sistema para o computador novo, **desinstale ou desligue o servidor antigo (obrigatório)**. Enquanto o antigo responder, as estações continuam abrindo o antigo, sem perguntar, e os certificados ficam divididos entre os dois. Com o antigo fora do ar, cada estação acha o novo e pergunta se é ele mesmo. Para ninguém precisar confirmar, rode o setup de novo em cada estação e escolha o servidor novo (ou use `/S /SERVIDOR=NOVO`): o que o setup grava vale para todos os usuários do computador.
- **Outra rede (VLAN, filial):** a varredura só alcança a rede da própria estação. Para estações em outra rede, informe o servidor na instalação (`/SERVIDOR=` ou digitando o nome ou o IP); se o nome estiver no DNS da empresa, o IP pode até mudar.
- **Antivírus corporativo:** a varredura faz cerca de 254 tentativas de conexão numa porta só, e só quando o servidor guardado não responde. Se o antivírus (EDR) reclamar, instale com `/SEMVARREDURA` (ou crie o valor `SemVarredura` = `1` em `HKLM\SOFTWARE\BC Calibracao Estacao`): a estação passa a usar só o nome e o IP conhecidos.
- **Políticas que bloqueiam o PowerShell:** a abertura normal não usa o PowerShell. Sem ele, só a procura automática deixa de funcionar; digitar o nome ou o IP continua funcionando.
- **Janelas e PDFs:** links que abrem em "nova janela" abrem uma janela comum do Edge com o mesmo login.

## Linha de comando

```
BC-Calibracao-Setup-1.2.0.exe /S /PORTA=4850 /REDES=192.168.20.0/24,10.10.0.0/16
BC-Calibracao-Setup-1.2.0.exe /S /ESTACAO                      (estação; procura o servidor)
BC-Calibracao-Setup-1.2.0.exe /S /SERVIDOR=SERVIDOR:4850       (estação com o servidor informado)
Desinstalar.exe /S                 (mantém os dados)
Desinstalar.exe /S /REMOVERDADOS   (apaga os dados)
```

- **`/REDES`:** endereços, sub-redes de /8 a /32 ou faixas `a.b.c.d-e.f.g.h`, separados por vírgula. Não precisa de aspas.
- **`/S` sozinho** instala o servidor, como sempre (num computador que já é estação, atualiza a estação).
- **`/ESTACAO`** instala como estação. **`/SERVIDOR=nome-ou-ip[:porta]`** já informa o servidor (e implica `/ESTACAO`); mesmo que ele não responda na hora, fica guardado e vale para todos os usuários do computador (rodar de novo com outro servidor troca o de todos). **`/SEMVARREDURA`**: a estação não varre a rede.
- **Códigos de saída:**
  - `0`: instalado;
  - `2`: interrompido (porta ou redes inválidas, porta ocupada em `/S`, versão mais nova instalada, falha na cópia do banco, estação pedida no computador que é o servidor, `/SERVIDOR` inválido);
  - `3`: instalado, mas o serviço não registrou, não iniciou ou não respondeu.

## Depois de instalado

- **Trocar a porta:** rode o setup de novo com `/PORTA=NNNN`. A porta fica no XML do serviço, e as variáveis do serviço valem mais que o `.env`.
- **Nomes extras** (ex.: `http://calibracao:4850`, criado no roteador): crie `C:\Program Files\BC Calibracao\.env` com `HOSTS_PERMITIDOS=calibracao` e reinicie o serviço. IPs, `localhost` e o nome do computador sempre funcionam.
- **Voltar uma cópia do banco** (o `antes-da-versao-X.db` de uma atualização ou uma cópia da pasta `backups\`), num prompt de comando como administrador:
  1. pare o serviço: `net stop BCCalibracao`;
  2. copie a cópia para `dados\restaurar.db` (a de `backups\` fica como está);
  3. passe para ela as contas e as folhas de campo de hoje, **antes** de pôr a cópia no lugar. As folhas impressas depois da cópia já estão no papel, com os técnicos: continuam registradas (e ligadas às calibrações que a cópia tem), e os nºs delas nunca se repetem:
     ```
     cd "C:\Program Files\BC Calibracao"
     node\node.exe server\ferramentas\redefinir-senha.mjs transplantar "C:\ProgramData\BC Calibracao\dados\bc-calibracao.db" "C:\ProgramData\BC Calibracao\dados\restaurar.db"
     ```
     A resposta diz quantas folhas passaram (`folhasCampo`). Com `--contas-da-copia`, as contas voltam como estavam na cópia (trocar o servidor de computador). Se o banco atual não puder ser lido, a ferramenta avisa e segue sem as folhas: elas voltam sozinhas pela pasta `folhas-campo\` quando o serviço sobe, como folhas livres (ao ligar o papel à calibração, o sistema pede confirmação, porque não sabe para qual balança a folha foi impressa);
  4. renomeie `bc-calibracao.db` para `bc-calibracao.db.antes-de-restaurar`, apague `bc-calibracao.db-wal` e `bc-calibracao.db-shm` e renomeie `restaurar.db` para `bc-calibracao.db`;
  5. inicie o serviço (`net start BCCalibracao`) ou, se a cópia é de antes de uma atualização, reinstale a versão anterior.

  Não apague nem troque a pasta `folhas-campo\` (nem a `certificados\`): voltar uma cópia mexe só no banco.
- **Pasta dos certificados e backups:** o Windows diz que você não tem permissão e oferece "Continuar". Clicar dá à sua conta acesso permanente à pasta; a próxima atualização desfaz isso.

## Não testado

Este setup foi compilado e conferido no Linux: makensis 3.12 e 3.09 sem avisos, conteúdo do `.exe` igual ao payload, servidor do payload respondendo e scripts PowerShell analisados e exercitados no PowerShell 7. A execução no Windows ainda **não foi testada**: serviço com LocalService, Firewall, ACL, atalhos, atualização por cima e desinstalação. Teste numa VM Windows Server antes de entregar.

O modo Estação foi compilado (setup e `BC Calibracao.exe` com `makensis -WX` 3.12 e 3.09, sem avisos), e a resposta do `/api/saude` com o nome do computador, o `id` e a `instancia` tem teste automatizado (`server/saude.test.ts`). As funções de `estacao/estacao.nsh` que entendem o endereço digitado, conferem se ele é da rede local (`gethostbyname` pelo plug-in System), leem a resposta do `/api/saude` (nome e `id`), gravam e leem o registro e leem o resultado da procura foram exercitadas no Wine (compiladas para 64 bits; o setup e o programa são de 32 bits). O download pelo NSISdl não pôde ser conferido lá (o Wine marca a conexão em andamento como erro), e o `descobrir-servidor.ps1` rodou no PowerShell 7 (Linux) contra servidores de verdade: varredura, nome e IP conhecidos, servidor com outro nome ou outro `id`, vários servidores, cópias com o mesmo nome e o mesmo `id`, um falso com o mesmo nome (no IP conhecido ou na varredura), um servidor com dois IPs, servidor fora da rede local e servidor de versão antiga (sem o nome), que nunca é adotado sozinho quando a estação já conhece o servidor. Falta testar no Windows (10 1607, 11 e um Server sem Edge): a conferência de rede local no programa de 32 bits, a pergunta antes de trocar de servidor, a página "Tipo de instalação" (os textos e a confirmação de Servidor com a procura em "nenhum" e em "erro") e a procura antes dela, a página do servidor (lista, "Procurar de novo", campo), o aviso "Procurando…" (plug-in Banner), o `descobrir-servidor.ps1` no Windows PowerShell 5.1 (placas de rede, varredura, nomes e `.local`), o Edge em modo aplicativo com o perfil próprio (confirmar que o `--no-first-run` evita a tela de boas-vindas), o ícone da janela (é o favicon do sistema) e a desinstalação da estação.
