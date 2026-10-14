# Instalador do Windows (setup.exe)

Um único `BC-Calibracao-Setup-<versão>.exe` instala o BC Calibração no servidor Windows da empresa, já com o Node.js portátil e o WinSW dentro. Não é preciso instalar mais nada nem ter internet no servidor.

Arquivos: `bc-calibracao.nsi` (script NSIS), `bc-calibracao.ico` (gerado a partir de `src/assets/logo/balancas-icone.svg`), `ferramentas/` (scripts copiados para a instalação), `../scripts/empacotar-windows.sh` (monta tudo) e `../.github/workflows/instalador-windows.yml` (CI).

## Como gerar

```bash
scripts/empacotar-windows.sh
```

Ele roda `npm ci` e `npm run build`, monta `pacotes/payload/` (`server/` e `shared/` sem os testes, `dist/`, `package.json`, `package-lock.json`, `.env.exemplo` e o `node_modules` de produção), baixa o Node.js 24.21.0 (só o `node.exe` do zip oficial `win-x64`) e o WinSW 2.12.0 (`WinSW.NET461.exe`), confere os SHA-256 e sobe o servidor do payload para ver se ele responde. Depois roda o `makensis -WX` (aviso vira erro) e grava `pacotes/BC-Calibracao-Setup-<versão>.exe` e o `.sha256`. Os downloads ficam em `pacotes/cache/`.

- **Precisa de:** Node.js e npm, curl, unzip e o **NSIS 3.12 ou mais novo**. As versões anteriores têm falhas de elevação de privilégio (CVE-2025-43715 e CVE-2026-42171), e a 3.09 do Ubuntu é uma delas. O script recusa versões antigas, a menos que se use `PERMITIR_NSIS_ANTIGO=1` (só para testes). Para um `makensis` fora do PATH, use `MAKENSIS=/caminho/makensis`.
- **`PULAR_BUILD=1`:** não roda o `npm ci` nem o build e põe no pacote uma interface provisória, criada só dentro do payload. O arquivo sai como `...-teste.exe`. Serve apenas para testar o instalador enquanto o código está em obras.
- **CI:** uma tag `v1.2.0` (igual à versão do `package.json`) roda os testes, gera o setup num container `debian:testing` (NSIS 3.12+) e publica o `.exe` no Release. O botão "Run workflow" gera o setup como artefato e, se marcado "publicar", também o publica.
- **Versões fixas:** no começo do script. Para trocar o Node, mude `NODE_VERSAO` e copie o SHA-256 do `SHASUMS256.txt` oficial para `NODE_SHA256`.

## O que o instalador faz

| Item | Onde / como |
|---|---|
| Programa | `C:\Program Files\BC Calibracao` (caminho fixo, só ASCII): `server\`, `shared\`, `dist\`, `node_modules\`, `node\node.exe`, `servico\BCCalibracao.exe` (WinSW) e `.xml`, `ferramentas\` |
| Dados | `C:\ProgramData\BC Calibracao\dados`: banco `bc-calibracao.db`, `backups\`, `certificados\` e `email.json`. É a `PASTA_DADOS` do servidor |
| Registros | `C:\ProgramData\BC Calibracao\logs`: `BCCalibracao.out.log`, `.err.log` e `.wrapper.log`, girando a cada 10 MB (guarda 8) |
| Permissões | `C:\ProgramData\BC Calibracao` só para SYSTEM e Administradores (controle total) e LocalService (modificar). O dono passa a ser Administradores e as permissões avulsas são desfeitas a cada instalação |
| Serviço | `BCCalibracao` ("BC Calibração"), WinSW com `node.exe server\iniciar.mjs`, `PORTA`, `HOST=0.0.0.0` e `PASTA_DADOS`. Início automático; reinicia após 10 s, 30 s e 60 s em caso de falha |
| Conta do serviço | **LocalService**: um erro no sistema exposto à rede não vira controle total do servidor, como aconteceria com LocalSystem. Ela só grava na pasta de dados. Se algo não funcionar com ela, rode o setup com `/CONTA=LocalSystem` (a escolha fica guardada para as atualizações) |
| Firewall | Regra "BC Calibracao (rede local)": entrada TCP na porta, só para o `node.exe` instalado, só de `localsubnet` mais as redes extras, nos perfis **Privado e Domínio**. O perfil Público fica de fora porque é a rede em que o Windows não confia. Se a placa estiver como Pública, o setup avisa como marcá-la como Privada |
| Atalhos | Área de Trabalho e Menu Iniciar (todos os usuários): "BC Calibração" (`http://localhost:PORTA`), "Redefinir senha do BC Calibração" (pede permissão de administrador) e "Pasta dos certificados e backups" |
| Página final | Endereços para os outros computadores (`http://NOMEDOCOMPUTADOR:PORTA` e os IPs) e a opção de abrir o sistema. **No primeiro acesso, abra o sistema no próprio servidor**: ele pede para criar o administrador |

**Atualização por cima:** é só rodar o setup novo. Ele para o serviço e copia o banco para `dados\backups\antes-da-versao-X.db`. A cópia é feita pelo `node.exe` instalado com `node:sqlite`, por `VACUUM INTO`, e conferida em seguida; se isso falhar, os arquivos `.db`, `-wal` e `-shm` são copiados como estão. Depois o setup troca o programa sem tocar nos dados (o `.env` da pasta do programa também fica), reinstala o serviço e o inicia. A porta, as redes e a conta continuam as mesmas.

**Desinstalação:** pelo "Aplicativos instalados" do Windows. Remove o serviço, a regra do Firewall e os atalhos e pergunta se os dados devem ser apagados. O padrão é **não**, e apagar pede uma segunda confirmação. Quando os dados ficam, a porta e as redes continuam no registro e são reaproveitadas numa reinstalação.

## Linha de comando

```
BC-Calibracao-Setup-1.2.0.exe /S /PORTA=4850 /REDES=192.168.20.0/24,10.10.0.0/16
Desinstalar.exe /S                 (mantém os dados)
Desinstalar.exe /S /REMOVERDADOS   (apaga os dados)
```

- **`/REDES`:** endereços, sub-redes de /8 a /32 ou faixas `a.b.c.d-e.f.g.h`, separados por vírgula. Não precisa de aspas.
- **Códigos de saída:**
  - `0`: instalado;
  - `2`: interrompido (porta ou redes inválidas, porta ocupada em `/S`, versão mais nova instalada, falha na cópia do banco);
  - `3`: instalado, mas o serviço não registrou, não iniciou ou não respondeu.

## Depois de instalado

- **Trocar a porta:** rode o setup de novo com `/PORTA=NNNN`. A porta fica no XML do serviço, e as variáveis do serviço valem mais que o `.env`.
- **Nomes extras** (ex.: `http://calibracao:4850`, criado no roteador): crie `C:\Program Files\BC Calibracao\.env` com `HOSTS_PERMITIDOS=calibracao` e reinicie o serviço. IPs, `localhost` e o nome do computador sempre funcionam.
- **Voltar o banco anterior a uma atualização:**
  1. pare o serviço: `net stop BCCalibracao`;
  2. apague `bc-calibracao.db-wal` e `bc-calibracao.db-shm`;
  3. copie o `antes-da-versao-X.db` por cima de `bc-calibracao.db`;
  4. reinstale a versão anterior.
- **Pasta dos certificados e backups:** o Windows diz que você não tem permissão e oferece "Continuar". Clicar dá à sua conta acesso permanente à pasta; a próxima atualização desfaz isso.

## Não testado

Este setup foi compilado e conferido no Linux: makensis 3.12 e 3.09 sem avisos, conteúdo do `.exe` igual ao payload, servidor do payload respondendo e scripts PowerShell analisados e exercitados no PowerShell 7. A execução no Windows ainda **não foi testada**: serviço com LocalService, Firewall, ACL, atalhos, atualização por cima e desinstalação. Teste numa VM Windows Server antes de entregar.
