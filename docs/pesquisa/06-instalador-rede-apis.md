# 06 — Instalador único, serviço do Windows, PDF, APIs de CNPJ/CEP, segurança na rede local e backup

> **Pesquisa feita em 14/10/2026.** Os testes rodaram num container Linux (Ubuntu 24.04) com NSIS 3.09 (apt) e 3.12 (pacote Debian), Node 22.22 e Node 24.21.
> Os itens marcados **[testado]** foram executados aqui. Os marcados **[doc]** vêm da documentação oficial listada na seção 8. Os marcados **[não testado]** dependem de Windows e não puderam ser executados no container.

## Sumário das decisões

| Tema | Recomendação | Motivo principal |
|---|---|---|
| Instalador | **NSIS 3.12** (`makensis` no Linux, no CI Ubuntu ou dentro de um container `debian:testing`) | Gratuito (licença zlib), compila no Linux **[testado]** e gera um setup.exe de 23,6 MB já com o Node 24 dentro. A versão 3.12 corrige o CVE-2026-42171; o apt do Ubuntu 24.04 instala a 3.09, que é vulnerável |
| Runtime | Só o `node.exe` do zip oficial `node-v24.21.0-win-x64.zip`. Migrar para o **Node 26 LTS** quando ele virar LTS (28/10/2026) | Nada para o cliente instalar. O npm não vai junto |
| Serviço | **WinSW v2.12.0**, arquivo `WinSW.NET461.exe` (656 KB, MIT) | Configuração em XML versionável, reinício automático, logs com rotação, conta LocalService |
| Dados | `C:\ProgramData\CertCal\{db,backups,logs}`, separado de `C:\Program Files\CertCal` | Atualizar ou desinstalar o programa não toca nos dados |
| PDF | **pdfmake 0.3.11** com a fonte Inter embutida **[testado]** | Cabeçalho de tabela repetido, "Página X de Y", QR code e SVG nativos, PDF/A-2b, sem Chromium |
| CNPJ | Ordem de consulta: OpenCNPJ → CNPJá aberta → CNPJ.ws pública → BrasilAPI, com cache no SQLite | As três primeiras (e também a ReceitaWS, 3/min) trazem telefone **e** e-mail. BrasilAPI e Minha Receita devolvem `email: null` **[testado]** |
| CEP | Ordem de consulta: ViaCEP → OpenCEP → BrasilAPI v2 | ViaCEP é o mais completo. OpenCEP tem o mesmo formato e não tem cota |
| Rede | Escutar em `0.0.0.0` + filtro de IP RFC 1918/loopback/link-local na aplicação + regra de firewall `remoteip=localsubnet` | Três camadas independentes |
| HTTPS | Começar com HTTP na LAN, endurecido. Adotar HTTPS com **CA própria distribuída por GPO** quando houver Wi-Fi compartilhado ou domínio AD. **Não** usar certificado autoassinado "cru" | O Chrome 154 (previsto para out/2026) não vai alertar em HTTP para IPs privados nem para nomes de rótulo único |
| Senhas | `crypto.scrypt` com N=2^17, r=8, p=1 e `maxmem` de 256 MiB | Valores mínimos do OWASP. Cerca de 0,5 s por login **[testado]** |
| Tentativas | 5 erros livres, depois bloqueio progressivo (30 s → 30 min) por usuário+IP e por IP, guardado no SQLite | **[testado]** |
| Backup | `sqlite.backup()` diário às 02:30 + conferência de integridade + retenção de 14 diários, 8 semanais e 12 mensais | Não trava o servidor: o `VACUUM INTO` travou o event loop por 293 ms num banco de 114 MB **[testado]** |

---

## 1. Instalador do Windows

### 1.1 Comparação NSIS × Inno Setup × WiX

| Critério | **NSIS** | **Inno Setup** | **WiX Toolset (MSI)** |
|---|---|---|---|
| Versão atual | 3.12 (19/04/2026). O apt do Ubuntu 24.04 instala a 3.09 | 7.1.0 (12/08/2026) e 6.7.3 (26/05/2026) | v6 (abr/2025) e v7 |
| Licença / custo | zlib/libpng, grátis inclusive para uso comercial | Grátis, mas o autor **pede** licença comercial a empresas com faturamento acima de US$ 5 mil/ano ("not strictly required"). Num CI, espera-se ao menos 1 licença | Código aberto (MS-RL), mas a partir da v6 vale a **Open Source Maintenance Fee**: empresas com receita acima de US$ 10 mil/ano devem patrocinar o projeto (de US$ 10 a 60/mês) |
| Compila no Linux? | **Sim**: `apt-get install nsis` e `makensis` **[testado]** | Não oficialmente: precisa de Windows (runner `windows-latest`) ou de Wine | Não: a v4 em diante precisa de Windows. No Linux só existe o `wixl` (msitools), que cobre parte da sintaxe |
| Linguagem | Script próprio (macros, LogicLib) e plugins nsExec e nsDialogs | Seções declarativas (`[Files]`, `[Run]`, `[UninstallRun]`) + Pascal Script | XML declarativo (MSI) |
| Serviço do Windows | Via `nsExec` chamando o WinSW / `sc.exe` | Via `[Run]` chamando o WinSW | Nativo (`ServiceInstall`), mas o executável precisa ser um serviço de verdade (WinSW) |
| Firewall | `netsh advfirewall` via `nsExec` | `[Run]` com `netsh` | Extensão `WixToolset.Firewall` (`Scope="localSubnet"`) |
| Atualização por cima | Manual: ler o registro, parar o serviço, copiar | Automática pelo `AppId` | `MajorUpgrade`: robusto, porém complexo |
| Curva de aprendizado | Média | Baixa | Alta |
| Deploy por GPO/Intune | `.exe /S` | `.exe /VERYSILENT` | Melhor: o MSI é nativo do GPO |

**Recomendação: NSIS.** O desenvolvimento e o CI podem ser 100% Linux, a licença é livre e o script abaixo cobre todos os requisitos. O Inno Setup seria a segunda opção (o script fica mais simples), mas exige Windows ou Wine para compilar e tem o pedido de licença comercial. O WiX só compensa se a empresa for distribuir o sistema por GPO em muitas máquinas, o que não é o caso: é um único servidor.

### 1.2 Teste do NSIS neste container **[testado]**

- `apt-get install -y nsis` instalou o **NSIS v3.09-4** (Ubuntu 24.04) sem erro.
- Um script mínimo em `/tmp/claude-0/nsis-teste/minimo.nsi` gerou `teste-setup.exe` (101 KB). O `file` identifica o resultado como `PE32 executable (GUI) ... Nullsoft Installer self-extracting archive`.
- O **script completo da seção 1.4** compilou **sem nenhum aviso** com payload real: `node.exe` 24.21.0 (93,6 MB), `WinSW.NET461.exe` v2.12.0 e um app de exemplo. Resultados:
  - `CertCal-Setup-1.2.0.exe` de **23,6 MB** (LZMA sólido), em cerca de 1 minuto de compilação;
  - mesmo resultado com o **NSIS 3.12** do Debian (`nsis_3.12-1_amd64.deb`). O manifesto do .exe confirma `Nullsoft Install System v3.12-1` e `requireAdministrator`.
- Arquivos do teste: `/tmp/claude-0/nsis-teste/completo/` (`instalador/certcal.nsi`, `payload/`).
- **Não testado:** a execução do setup.exe no Windows (serviço, firewall, ACL, atalhos). Isso precisa ser validado numa VM Windows Server 2019/2022 antes da entrega.

> **Segurança do próprio NSIS:** o CVE-2025-43715 (corrigido na 3.11) e o CVE-2026-42171 (corrigido na 3.12) permitem elevação de privilégio quando o instalador roda como SYSTEM. Gere os setups de produção com a **3.12+**, por exemplo num job de CI com `container: debian:testing`, cujo apt já traz a 3.12. Use a 3.09 do Ubuntu apenas em desenvolvimento.

### 1.3 Layout instalado

```
C:\Program Files\CertCal\            <- programa (substituído a cada atualização)
  runtime\node.exe, LICENSE           <- Node portátil oficial (só o executável)
  app\server\...                      <- Fastify (bundle esbuild ou dist + node_modules de produção)
  app\web\...                         <- build do Vite (React)
  service\CertCal.exe, CertCal.xml    <- WinSW renomeado + configuração gerada pelo setup
  certcal.ico, CertCal.url, Desinstalar.exe
C:\ProgramData\CertCal\              <- dados (NUNCA apagados por atualização)
  db\certcal.db (+ -wal/-shm)         <- SQLite em modo WAL
  backups\certcal-AAAA-MM-DD_HHMMSS.db, antes-da-versao-X.Y.Z.db
  logs\CertCal.out.log, CertCal.err.log, CertCal.wrapper.log
```

Por que `ProgramData`: é o local padrão do Windows para dados de serviço compartilhados entre usuários. O setup aplica uma ACL que deixa só SYSTEM, Administradores e LocalService acessarem a pasta. Assim, um usuário comum logado no servidor não consegue copiar nem alterar o banco.

### 1.4 Script completo do instalador (NSIS) — `instalador/certcal.nsi`

Compilado sem avisos no NSIS 3.09 e no 3.12 **[testado]**. A execução no Windows ainda está **[não testado]**.

```nsis
; =============================================================================
;  certcal.nsi - Instalador único (setup.exe) do Sistema de Certificados de
;  Calibração. Compila no Linux, no Windows ou num runner ubuntu-latest:
;
;    makensis -DVERSAO=1.2.0 -DPAYLOAD=../payload instalador/certcal.nsi
;
;  Estrutura esperada em ${PAYLOAD} (gerada pelo script de build):
;    runtime\node.exe, runtime\LICENSE  <- só o node.exe do zip oficial win-x64
;    app\server\index.mjs               <- servidor Fastify empacotado (esbuild)
;    app\web\...                        <- build do React (vite build)
;    service\WinSW.NET461.exe           <- WinSW v2.12.0 (MIT, .NET Framework 4.6.1+)
;    assets\certcal.ico
;
;  O que o setup faz:
;    1. instala Node + app em C:\Program Files\CertCal (programa);
;    2. guarda os dados em C:\ProgramData\CertCal (banco, backups, logs), que
;       NUNCA é apagado pela atualização;
;    3. registra o serviço do Windows (WinSW) com início automático e reinício
;       em caso de falha, rodando como LocalService (menos privilégio);
;    4. cria a regra de firewall liberando a porta só para a rede local;
;    5. cria atalhos (Área de Trabalho e menu Iniciar) para http://localhost:PORTA;
;    6. aceita atualização por cima (para o serviço, faz backup do banco,
;       troca os arquivos, reinicia);
;    7. gera o desinstalador, que pergunta se os dados devem ser apagados
;       (o padrão é manter).
;
;  Parâmetros de linha de comando (instalação silenciosa):
;    CertCal-Setup-1.2.0.exe /S /PORTA=8080 /REDES=localsubnet
;    /REDES aceita a sintaxe do netsh, ex.: localsubnet,10.0.0.0/8,192.168.0.0/16
;    Desinstalador: Desinstalar.exe /S [/REMOVERDADOS]
; =============================================================================

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma          ; melhor taxa para o node.exe (~94 MB)
SetCompressorDictSize 64

!ifndef VERSAO
  !define VERSAO "0.0.0"
!endif
!ifndef PAYLOAD
  !define PAYLOAD "..\payload"
!endif

!define APP_ID        "CertCal"     ; nome interno: pasta, chave de registro
!define APP_NOME      "Sistema de Certificados de Calibração"
!define EMPRESA       "Sua Empresa Ltda."
!define SERVICO       "CertCal"     ; nome do serviço do Windows (sc query CertCal)
!define PORTA_PADRAO  "8080"
!define REGRA_FW      "CertCal (rede local)"
!define ARQ_BANCO     "certcal.db"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define APP_KEY       "Software\${APP_ID}"

Name "${APP_NOME}"
OutFile "CertCal-Setup-${VERSAO}.exe"
InstallDir "$PROGRAMFILES64\${APP_ID}"
RequestExecutionLevel admin        ; serviço + firewall exigem administrador
BrandingText "${APP_NOME} ${VERSAO}"
ShowInstDetails show
ShowUninstDetails show

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"            ; GetParameters, GetOptions, GetSize
!include "WordFunc.nsh"            ; VersionCompare
!include "x64.nsh"                 ; RunningX64, SetRegView
!include "WinVer.nsh"              ; AtLeastWin10
!include "nsDialogs.nsh"

Var PORTA          ; porta TCP do sistema
Var REDES          ; endereços remotos liberados no firewall
Var DADOS          ; C:\ProgramData\CertCal
Var ATUALIZANDO    ; 1 = já existe uma instalação
Var VERSAO_ANT     ; versão instalada anteriormente
Var NOMEPC         ; nome do computador (para mostrar o endereço na rede)
Var hCampoPorta

; ----------------------------------------------------------------- Interface
!define MUI_ICON   "${PAYLOAD}\assets\certcal.ico"
!define MUI_UNICON "${PAYLOAD}\assets\certcal.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_PRE PularSeAtualizacao   ; não pergunta a pasta numa atualização
!insertmacro MUI_PAGE_DIRECTORY
Page custom PaginaPortaCriar PaginaPortaSair
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Instalação concluída"
!define MUI_FINISHPAGE_TEXT "O sistema já está rodando como serviço do Windows e inicia sozinho junto com o servidor.$\r$\n$\r$\nNeste servidor: http://localhost:$PORTA$\r$\nNos outros computadores da rede: http://$NOMEPC:$PORTA"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o sistema no navegador"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirNavegador
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; Propriedades do .exe (aba "Detalhes" do Windows)
VIProductVersion "${VERSAO}.0"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName"     "${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "CompanyName"     "${EMPRESA}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "Instalador do ${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion"     "${VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductVersion"  "${VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright"  "© ${EMPRESA}"

; ================================================================ Inicialização
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este sistema exige Windows de 64 bits." /SD IDOK
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}          ; Node 24 exige Windows 10 / Server 2016 ou mais novo
    MessageBox MB_ICONSTOP "Este sistema exige Windows 10, Windows Server 2016 ou mais recente." /SD IDOK
    Abort
  ${EndIf}

  SetShellVarContext all            ; atalhos para TODOS os usuários
  SetRegView 64                     ; registro de 64 bits (o setup é 32 bits)
  StrCpy $DADOS "$APPDATA\${APP_ID}"   ; com SetShellVarContext all, $APPDATA = C:\ProgramData
  ReadEnvStr $NOMEPC "COMPUTERNAME"

  ; Já instalado? Reaproveita pasta e porta (atualização por cima)
  StrCpy $ATUALIZANDO 0
  ReadRegStr $0 HKLM "${UNINST_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
    StrCpy $ATUALIZANDO 1
    ReadRegStr $VERSAO_ANT HKLM "${UNINST_KEY}" "DisplayVersion"
    ${VersionCompare} "$VERSAO_ANT" "${VERSAO}" $1   ; 1 = instalada é mais nova
    ${If} $1 == 1
      MessageBox MB_YESNO|MB_ICONEXCLAMATION "A versão instalada ($VERSAO_ANT) é mais nova que esta (${VERSAO}). Continuar mesmo assim?" /SD IDNO IDYES +2
      Abort
    ${EndIf}
  ${EndIf}

  ReadRegStr $PORTA HKLM "${APP_KEY}" "Porta"
  ${If} $PORTA == ""
    StrCpy $PORTA "${PORTA_PADRAO}"
  ${EndIf}
  ReadRegStr $REDES HKLM "${APP_KEY}" "RedesFirewall"
  ${If} $REDES == ""
    StrCpy $REDES "localsubnet"
  ${EndIf}

  ; Parâmetros /PORTA= e /REDES= (úteis com /S)
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/PORTA=" $R1
  ${IfNot} ${Errors}
    StrCpy $PORTA $R1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/REDES=" $R1
  ${IfNot} ${Errors}
    StrCpy $REDES $R1
  ${EndIf}
FunctionEnd

Function PularSeAtualizacao
  ${If} $ATUALIZANDO == 1
    Abort                           ; "Abort" numa função PRE pula a página
  ${EndIf}
FunctionEnd

; ------------------------------------------------------ Página: escolher porta
Function PaginaPortaCriar
  ${If} $ATUALIZANDO == 1
    Abort                           ; numa atualização mantém a porta anterior
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Porta de acesso" "Porta TCP em que o sistema vai atender na rede da empresa."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 40u "Os outros computadores vão acessar http://$NOMEPC:PORTA pelo navegador. Use uma porta livre entre 1024 e 65535. Se não souber, mantenha ${PORTA_PADRAO}."
  Pop $0
  ${NSD_CreateNumber} 0 48u 60u 13u "$PORTA"
  Pop $hCampoPorta
  nsDialogs::Show
FunctionEnd

Function PaginaPortaSair
  ${NSD_GetText} $hCampoPorta $PORTA
  ${If} $PORTA < 1024               ; comparação numérica do LogicLib
  ${OrIf} $PORTA > 65535
    MessageBox MB_ICONEXCLAMATION "Porta inválida. Informe um número entre 1024 e 65535."
    Abort                           ; permanece na página
  ${EndIf}
  ; Aviso se outra aplicação já escuta nessa porta
  nsExec::ExecToStack 'cmd.exe /C netstat -ano -p TCP | findstr /R /C:":$PORTA .*LISTENING"'
  Pop $0                            ; código de saída do findstr (0 = achou)
  Pop $1
  ${If} $0 == 0
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "A porta $PORTA já está em uso por outro programa. Usar mesmo assim?" IDYES +2
    Abort
  ${EndIf}
FunctionEnd

; ============================================================== Seção principal
Section "Sistema" SecPrincipal
  SectionIn RO
  SetShellVarContext all
  SetRegView 64

  ; 1) Para e remove o serviço antigo (libera o node.exe para ser substituído)
  DetailPrint "Parando o serviço ${SERVICO} (se existir)..."
  Call RemoverServicoSeExistir

  ; 2) Numa atualização, cópia de segurança do banco com o serviço parado
  ${If} $ATUALIZANDO == 1
  ${AndIf} ${FileExists} "$DADOS\db\${ARQ_BANCO}"
    CreateDirectory "$DADOS\backups"
    DetailPrint "Backup do banco antes da atualização..."
    CopyFiles /SILENT "$DADOS\db\${ARQ_BANCO}" "$DADOS\backups\antes-da-versao-${VERSAO}.db"
    ${If} ${FileExists} "$DADOS\db\${ARQ_BANCO}-wal"
      CopyFiles /SILENT "$DADOS\db\${ARQ_BANCO}-wal" "$DADOS\backups\antes-da-versao-${VERSAO}.db-wal"
    ${EndIf}
  ${EndIf}

  ; 3) Remove a versão anterior DO PROGRAMA (nunca a pasta de dados)
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\service"

  ; 4) Copia os arquivos
  SetOutPath "$INSTDIR\runtime"
  File "${PAYLOAD}\runtime\node.exe"
  File "${PAYLOAD}\runtime\LICENSE"
  SetOutPath "$INSTDIR\app"
  File /r "${PAYLOAD}\app\*.*"
  SetOutPath "$INSTDIR\service"
  File "/oname=${SERVICO}.exe" "${PAYLOAD}\service\WinSW.NET461.exe"
  SetOutPath "$INSTDIR"
  File "/oname=certcal.ico" "${PAYLOAD}\assets\certcal.ico"

  ; 5) Pasta de dados (criada uma vez, preservada em atualizações)
  CreateDirectory "$DADOS\db"
  CreateDirectory "$DADOS\backups"
  CreateDirectory "$DADOS\logs"
  ; Só SYSTEM e Administradores (controle total) + LocalService (modificar).
  ; Usuários comuns logados no servidor não conseguem copiar/alterar o banco.
  nsExec::ExecToLog 'icacls "$DADOS" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-19:(OI)(CI)M /T /C /Q'
  Pop $0

  ; 6) Configuração do WinSW (gerada aqui por causa da porta e dos caminhos)
  Call EscreverXmlServico

  ; 7) Registra e inicia o serviço
  DetailPrint "Registrando o serviço ${SERVICO}..."
  nsExec::ExecToLog '"$INSTDIR\service\${SERVICO}.exe" install'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Falha ao registrar o serviço (código $0). Veja $DADOS\logs." /SD IDOK
  ${EndIf}
  nsExec::ExecToLog '"$INSTDIR\service\${SERVICO}.exe" start'
  Pop $0

  ; 8) Firewall: libera a porta SÓ para a rede local, em qualquer perfil
  ;    (Domínio/Privado/Público), restrito ao node.exe desta instalação.
  DetailPrint "Configurando o Firewall do Windows..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${REGRA_FW}"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${REGRA_FW}" dir=in action=allow protocol=TCP localport=$PORTA remoteip=$REDES profile=any program="$INSTDIR\runtime\node.exe" enable=yes'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "Não foi possível criar a regra de firewall (código $0). Libere a porta $PORTA manualmente." /SD IDOK
  ${EndIf}

  ; 9) Atalhos: arquivo .url abre o navegador padrão em http://localhost:PORTA
  WriteINIStr "$INSTDIR\${APP_ID}.url" "InternetShortcut" "URL" "http://localhost:$PORTA/"
  WriteINIStr "$INSTDIR\${APP_ID}.url" "InternetShortcut" "IconFile" "$INSTDIR\certcal.ico"
  WriteINIStr "$INSTDIR\${APP_ID}.url" "InternetShortcut" "IconIndex" "0"
  CopyFiles /SILENT "$INSTDIR\${APP_ID}.url" "$DESKTOP\${APP_NOME}.url"
  CreateDirectory "$SMPROGRAMS\${APP_NOME}"
  CopyFiles /SILENT "$INSTDIR\${APP_ID}.url" "$SMPROGRAMS\${APP_NOME}\${APP_NOME}.url"
  CreateShortCut "$SMPROGRAMS\${APP_NOME}\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"

  ; 10) Desinstalador + "Programas e Recursos"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayName"          "${APP_NOME}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayVersion"       "${VERSAO}"
  WriteRegStr   HKLM "${UNINST_KEY}" "Publisher"            "${EMPRESA}"
  WriteRegStr   HKLM "${UNINST_KEY}" "InstallLocation"      "$INSTDIR"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayIcon"          "$INSTDIR\certcal.ico"
  WriteRegStr   HKLM "${UNINST_KEY}" "UninstallString"      '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr   HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" $0
  WriteRegStr   HKLM "${APP_KEY}" "Porta"         "$PORTA"
  WriteRegStr   HKLM "${APP_KEY}" "RedesFirewall" "$REDES"
  WriteRegStr   HKLM "${APP_KEY}" "Dados"         "$DADOS"
  WriteRegStr   HKLM "${APP_KEY}" "Versao"        "${VERSAO}"
SectionEnd

; ------------------------------------------------- Funções auxiliares (setup)
; Para (stop síncrono) e remove o serviço, esperando o SCM apagá-lo de fato.
Function RemoverServicoSeExistir
  nsExec::ExecToStack 'sc.exe query "${SERVICO}"'
  Pop $0                            ; 1060 = serviço não existe
  Pop $1
  ${If} $0 == 0
    nsExec::ExecToLog 'net.exe stop "${SERVICO}"'   ; espera parar
    Pop $0
    nsExec::ExecToLog 'sc.exe delete "${SERVICO}"'
    Pop $0
    ; Se o services.msc estiver aberto o serviço fica "marcado para exclusão":
    ; aguarda até 15 s.
    StrCpy $2 0
    ${Do}
      Sleep 1000
      IntOp $2 $2 + 1
      nsExec::ExecToStack 'sc.exe query "${SERVICO}"'
      Pop $0
      Pop $1
      ${If} $0 != 0                 ; 1060: o serviço já não existe
      ${OrIf} $2 >= 15
        ${ExitDo}
      ${EndIf}
    ${Loop}
    Sleep 1000                      ; folga para o Windows liberar o node.exe
  ${EndIf}
FunctionEnd

; Gera service\CertCal.xml em UTF-16 com BOM (aceita acentos em qualquer caminho)
Function EscreverXmlServico
  FileOpen $9 "$INSTDIR\service\${SERVICO}.xml" w
  FileWriteUTF16LE /BOM $9 '<?xml version="1.0" encoding="utf-16"?>$\r$\n'
  FileWriteUTF16LE $9 '<service>$\r$\n'
  FileWriteUTF16LE $9 '  <id>${SERVICO}</id>$\r$\n'
  FileWriteUTF16LE $9 '  <name>${APP_NOME}</name>$\r$\n'
  FileWriteUTF16LE $9 '  <description>Servidor web local do ${APP_NOME} (porta $PORTA).</description>$\r$\n'
  FileWriteUTF16LE $9 '  <executable>$INSTDIR\runtime\node.exe</executable>$\r$\n'
  ; --disable-warning: esconde o aviso "SQLite is experimental" do node:sqlite
  FileWriteUTF16LE $9 '  <arguments>--disable-warning=ExperimentalWarning "$INSTDIR\app\server\index.mjs"</arguments>$\r$\n'
  FileWriteUTF16LE $9 '  <workingdirectory>$INSTDIR\app</workingdirectory>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="NODE_ENV" value="production"/>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="HOST" value="0.0.0.0"/>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="PORT" value="$PORTA"/>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="CERTCAL_DADOS" value="$DADOS"/>$\r$\n'
  FileWriteUTF16LE $9 '  <startmode>Automatic</startmode>$\r$\n'
  ; Reinício automático: 10 s, 30 s e 60 s; contador zera após 1 h estável
  FileWriteUTF16LE $9 '  <onfailure action="restart" delay="10 sec"/>$\r$\n'
  FileWriteUTF16LE $9 '  <onfailure action="restart" delay="30 sec"/>$\r$\n'
  FileWriteUTF16LE $9 '  <onfailure action="restart" delay="60 sec"/>$\r$\n'
  FileWriteUTF16LE $9 '  <resetfailure>1 hour</resetfailure>$\r$\n'
  ; WinSW manda Ctrl+C (o Node recebe SIGINT) e espera até 20 s antes de matar
  FileWriteUTF16LE $9 '  <stoptimeout>20 sec</stoptimeout>$\r$\n'
  FileWriteUTF16LE $9 '  <serviceaccount>$\r$\n'
  FileWriteUTF16LE $9 '    <domain>NT AUTHORITY</domain>$\r$\n'
  FileWriteUTF16LE $9 '    <user>LocalService</user>$\r$\n'
  FileWriteUTF16LE $9 '  </serviceaccount>$\r$\n'
  ; Logs: stdout/stderr do Node em CertCal.out.log / CertCal.err.log,
  ; girando a cada 10 MB e mantendo 8 arquivos
  FileWriteUTF16LE $9 '  <logpath>$DADOS\logs</logpath>$\r$\n'
  FileWriteUTF16LE $9 '  <log mode="roll-by-size">$\r$\n'
  FileWriteUTF16LE $9 '    <sizeThreshold>10240</sizeThreshold>$\r$\n'
  FileWriteUTF16LE $9 '    <keepFiles>8</keepFiles>$\r$\n'
  FileWriteUTF16LE $9 '  </log>$\r$\n'
  FileWriteUTF16LE $9 '</service>$\r$\n'
  FileClose $9
FunctionEnd

; Abre o navegador como o usuário logado (o explorer.exe repassa a URL para a
; sessão não elevada, em vez de abrir um navegador "como administrador")
Function AbrirNavegador
  Exec '"$WINDIR\explorer.exe" "http://localhost:$PORTA/"'
FunctionEnd

; ================================================================ Desinstalador
Function un.onInit
  SetShellVarContext all
  SetRegView 64
  ReadRegStr $DADOS HKLM "${APP_KEY}" "Dados"
  ${If} $DADOS == ""
    StrCpy $DADOS "$APPDATA\${APP_ID}"   ; C:\ProgramData\CertCal
  ${EndIf}
FunctionEnd

Section "Uninstall"
  ; Serviço
  DetailPrint "Parando e removendo o serviço ${SERVICO}..."
  nsExec::ExecToLog 'net.exe stop "${SERVICO}"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\service\${SERVICO}.exe" uninstall'
  Pop $0
  Sleep 1500

  ; Firewall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${REGRA_FW}"'
  Pop $0

  ; Atalhos
  Delete "$DESKTOP\${APP_NOME}.url"
  RMDir /r "$SMPROGRAMS\${APP_NOME}"

  ; Programa
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\service"
  Delete "$INSTDIR\certcal.ico"
  Delete "$INSTDIR\${APP_ID}.url"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"                  ; só remove se estiver vazia

  ; Dados: padrão é MANTER. /S mantém; /S /REMOVERDADOS apaga.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/REMOVERDADOS" $R1
  ${IfNot} ${Errors}
    RMDir /r "$DADOS"
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Deseja APAGAR também os dados do sistema (banco de dados, certificados, backups e logs) em:$\r$\n$DADOS ?$\r$\n$\r$\nRecomendado: Não (os dados ficam guardados para uma reinstalação)." /SD IDNO IDNO manterDados
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Tem certeza? Esta ação NÃO pode ser desfeita." /SD IDNO IDNO manterDados
    RMDir /r "$DADOS"
    manterDados:
  ${EndIf}

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "${APP_KEY}"
SectionEnd
```

#### Detalhes que o script resolve (e por quê)

| Ponto | Solução no script |
|---|---|
| Firewall "só rede local" | Usa `netsh ... remoteip=localsubnet profile=any program=...node.exe`. `LocalSubnet` é uma palavra-chave oficial do Windows e cobre apenas as sub-redes **diretamente conectadas** ao servidor. `profile=any` evita que a regra "suma" se a placa de rede for classificada como "Pública" |
| Empresa com várias VLANs | Com `LocalSubnet`, os PCs de outra VLAN (outra sub-rede roteada) ficam **bloqueados**. Nesse caso, instale com `/REDES=localsubnet,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` ou com a faixa exata da empresa |
| Equivalente em PowerShell | `New-NetFirewallRule -DisplayName "CertCal (rede local)" -Direction Inbound -Protocol TCP -LocalPort 8080 -Program "$env:ProgramFiles\CertCal\runtime\node.exe" -RemoteAddress LocalSubnet -Profile Any -Action Allow`. O script usa o `netsh` porque ele existe em todas as versões e é mais simples de citar dentro do NSIS |
| Atualização por cima | Lê `InstallLocation` no registro, pula as páginas de pasta e de porta, para e remove o serviço, faz backup do banco (`antes-da-versao-X.db`), troca `app\`, `runtime\` e `service\` e reinstala o serviço. A pasta `ProgramData` não é tocada |
| Downgrade acidental | `VersionCompare` avisa se a versão instalada for mais nova |
| Desinstalação | Remove serviço, regra de firewall, atalhos e programa. **Pergunta** se deve apagar os dados (padrão "Não", com dupla confirmação). Em modo silencioso mantém os dados, a menos que se passe `/REMOVERDADOS` |
| Atalho abrindo o navegador | Arquivo `.url` (`[InternetShortcut] URL=http://localhost:8080/`), que abre o navegador padrão. A página final mostra também `http://NOME-DO-SERVIDOR:8080` para os outros PCs |
| Abrir o navegador sem ser como admin | Usa `Exec explorer.exe "http://..."`: o Explorer repassa a URL para a sessão normal do usuário |
| Acentos no XML do WinSW | `FileWriteUTF16LE /BOM` grava o XML em UTF-16 com BOM, então caminhos e nomes com "ç/ã" não quebram |
| Serviço "marcado para exclusão" | Se o `services.msc` estiver aberto, o `sc delete` só marca o serviço. O script espera até 15 s antes de reinstalar |
| Setup 32 bits instalando programa 64 bits | `$PROGRAMFILES64` + `SetRegView 64` + a verificação `RunningX64`. Os comandos `sc`, `netsh` e `icacls` de 32 bits funcionam normalmente |
| Instalação silenciosa | `CertCal-Setup-1.2.0.exe /S /PORTA=8080`, útil para suporte remoto |

#### Assinatura de código e SmartScreen

Sem assinatura, um setup.exe baixado da internet mostra "O Windows protegeu o computador". Se for copiado por pendrive ou pasta de rede, normalmente não recebe a marca da web (Mark of the Web) e o aviso não aparece. Para assinar no próprio Linux existe o `osslsigncode` (`apt-get install osslsigncode`, versão 2.8), que usa um certificado de assinatura de código (OV/EV ou Azure Trusted Signing). Isso é opcional para uso interno.

### 1.5 Montagem do payload e CI (Ubuntu)

`instalador/montar-payload.sh` (esboço; adapte aos caminhos do repositório):

```bash
#!/usr/bin/env bash
# Monta build/payload para o makensis. Roda no Linux, no macOS ou no CI.
set -euo pipefail
NODE_VER=24.21.0   # trocar para 26.x quando o Node 26 virar LTS (28/10/2026)
NODE_SHA=158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541   # SHASUMS256.txt oficial
WINSW_VER=2.12.0
WINSW_SHA=b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f  # WinSW.NET461.exe (calculado em 14/10/2026)
P=build/payload; C=build/cache
rm -rf "$P"; mkdir -p "$P"/{runtime,app/server,app/web,service,assets} "$C"

# 1) Node portátil oficial: só o node.exe (o npm não é necessário em produção)
Z="$C/node-v$NODE_VER-win-x64.zip"
[ -f "$Z" ] || curl -fsSL -o "$Z" "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-win-x64.zip"
echo "$NODE_SHA  $Z" | sha256sum -c -
unzip -j -o -q "$Z" "node-v$NODE_VER-win-x64/node.exe" "node-v$NODE_VER-win-x64/LICENSE" -d "$P/runtime"

# 2) WinSW (wrapper de serviço)
W="$C/WinSW.NET461.exe"
[ -f "$W" ] || curl -fsSL -o "$W" "https://github.com/winsw/winsw/releases/download/v$WINSW_VER/WinSW.NET461.exe"
echo "$WINSW_SHA  $W" | sha256sum -c -
cp "$W" "$P/service/"

# 3) Aplicação: front (vite build) + servidor com dependências de produção
npm ci && npm run build                          # gera web/dist e server/dist
cp -r web/dist/. "$P/app/web/"
cp -r server/dist/. server/package.json server/package-lock.json "$P/app/server/"
(cd "$P/app/server" && npm ci --omit=dev --ignore-scripts)
# Dependências JS puras servem no Windows. Addon nativo (.node) compilado no Linux não serve:
if find "$P/app" -name '*.node' | grep -q .; then echo "ERRO: addon nativo encontrado"; exit 1; fi
cp instalador/certcal.ico "$P/assets/"
```

Usar o `node:sqlite` embutido em vez do `better-sqlite3` é o que torna isso possível: não há addon nativo para compilar para o Windows, e o mesmo `node_modules` montado no Linux funciona no servidor.

`.github/workflows/instalador.yml`:

```yaml
name: instalador
on:
  push: { tags: ['v*'] }
  workflow_dispatch:
jobs:
  setup-exe:
    runs-on: ubuntu-latest
    container: debian:testing          # traz NSIS 3.12 (corrige CVE-2026-42171)
    steps:
      - run: apt-get update && apt-get install -y --no-install-recommends nsis curl unzip ca-certificates git nodejs npm
      - uses: actions/checkout@v5
      - run: bash instalador/montar-payload.sh
      - run: makensis -V2 -DVERSAO="${GITHUB_REF_NAME#v}" -DPAYLOAD=../build/payload instalador/certcal.nsi
      - uses: actions/upload-artifact@v5
        with: { name: setup, path: instalador/CertCal-Setup-*.exe }
```

(Confira as versões atuais das actions. Para o build do front e do servidor, use a mesma versão de Node da produção, por exemplo com `actions/setup-node`.)

### 1.6 Se preferir Inno Setup (trecho equivalente, **[não testado]**: requer Windows)

```ini
[Setup]
AppId={{8C1B3F6E-1A2B-4C3D-9E8F-CE47CA1CE7A1}
AppName=Sistema de Certificados de Calibração
AppVersion=1.2.0
DefaultDirName={autopf}\CertCal
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
[Dirs]
Name: "{commonappdata}\CertCal\db"; Flags: uninsneveruninstall
[Files]
Source: "payload\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "payload\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs ignoreversion
Source: "payload\service\WinSW.NET461.exe"; DestDir: "{app}\service"; DestName: "CertCal.exe"
[Run]
Filename: "{app}\service\CertCal.exe"; Parameters: "install"; Flags: runhidden
Filename: "{app}\service\CertCal.exe"; Parameters: "start"; Flags: runhidden
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""CertCal (rede local)"" dir=in action=allow protocol=TCP localport=8080 remoteip=localsubnet profile=any"; Flags: runhidden
[UninstallRun]
Filename: "{app}\service\CertCal.exe"; Parameters: "stop"; Flags: runhidden; RunOnceId: "Parar"
Filename: "{app}\service\CertCal.exe"; Parameters: "uninstall"; Flags: runhidden; RunOnceId: "Remover"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""CertCal (rede local)"""; Flags: runhidden; RunOnceId: "Firewall"
```

(No Inno ainda faltaria escrever em Pascal Script a página de porta, a pergunta sobre os dados e o backup antes da atualização.)

---

## 2. Wrapper de serviço

### 2.1 Comparação

| Opção | Situação em out/2026 | Prós | Contras | Veredito |
|---|---|---|---|---|
| **WinSW** | v2.12.0 estável (28/01/2023). A v3 está em alpha (alpha.11, também de jan/2023). Licença MIT, 14,4 mil estrelas, sem release desde 2023 | XML versionável; `onfailure` (reinício), `resetfailure`, `stoptimeout` (envia Ctrl+C e depois mata); conta de serviço (LocalService, NetworkService, gMSA); logs `roll-by-size`, `roll-by-time` e `roll-by-size-time`; comandos `install`, `uninstall`, `start`, `stop`, `stopwait`, `restart` e `status`. `WinSW.NET461.exe` tem só 656 KB e usa o .NET Framework 4.6.1+, que já vem no Windows 10 e no Server 2016+ | Projeto parado (mas maduro: é o que o Jenkins usa no Windows) | **Recomendado** |
| NSSM | 2.24 (2014); pré-release 2.24-101 (2017), obrigatória a partir do Windows 10 Creators Update. Na prática, sem manutenção | Simples, configuração no registro (`nssm set`) | Abandonado. É **frequentemente sinalizado por antivírus/EDR**, porque atacantes o usam para persistência (ex.: mineradores; ver o DFIR Report) | Evitar |
| node-windows (npm) | 1.0.0-beta.8 (ago/2022) | API em JS | Por baixo usa um `winsw.exe` antigo embutido + `sudowin`/`elevate.vbs`. Exige rodar um script Node como admin para instalar. Beta há 4 anos | Evitar: use o WinSW direto |
| `sc.exe create` direto | — | Nativo | **Não funciona com `node.exe`**: o SCM espera que o executável chame `StartServiceCtrlDispatcher` e informe `SERVICE_RUNNING` em até 30 s. Como o `node.exe` é um programa de console comum, o Windows dá o **erro 1053** ("o serviço não respondeu a tempo") e encerra o processo. Também não há como parar o serviço de forma limpa nem capturar o stdout | Impossível sem wrapper |
| Node SEA (exe único) | Estabilidade 1.1 (desenvolvimento ativo); `node --build-sea` só no v25.5+ | Um único `.exe` com nome próprio | **Não é um serviço**: continua precisando do WinSW. Exige bundle em arquivo único, os assets do front precisam ir embutidos, Defender/SmartScreen desconfiam mais de exes não assinados e é preciso reconstruir a cada atualização do Node | Não vale a pena (detalhes abaixo) |
| shawl (Rust) | 1.9.0 (mai/2026), MIT, mantido | Exe único sem .NET; envia Ctrl+C; reinicia se o código de saída for diferente de zero | Logs fixos ao lado do exe (2 MB × 2 arquivos); menos opções que o WinSW | Alternativa, caso a falta de releases do WinSW incomode |

### 2.2 Node SEA com `node:sqlite` **[testado]**

Gerei um SEA no Linux (Node 22.22 + `postject`) com um script que abre um banco `node:sqlite`. Ele rodou com `isSea= true sqlite ok = 42 sqlite_version= 3.50.4`. Ou seja, o `node:sqlite` **funciona dentro do SEA**, porque é módulo nativo do Node e o SEA só carrega módulos nativos. O executável ficou com 123 MB no Linux; no Windows o `node.exe` sozinho já tem 94 MB.

**Conclusão:** não compensa. O instalador já esconde a "pasta com muitos arquivos", o SEA não dispensa o wrapper de serviço e traz restrições de build. Se o objetivo é ver um nome amigável no Gerenciador de Tarefas, basta copiar `node.exe` como `certcal-servidor.exe` (e ajustar o XML e a regra de firewall).

### 2.3 Configuração do WinSW gerada pelo setup (resultado)

```xml
<?xml version="1.0" encoding="utf-16"?>
<service>
  <id>CertCal</id>
  <name>Sistema de Certificados de Calibração</name>
  <description>Servidor web local do Sistema de Certificados de Calibração (porta 8080).</description>
  <executable>C:\Program Files\CertCal\runtime\node.exe</executable>
  <arguments>--disable-warning=ExperimentalWarning "C:\Program Files\CertCal\app\server\index.mjs"</arguments>
  <workingdirectory>C:\Program Files\CertCal\app</workingdirectory>
  <env name="NODE_ENV" value="production"/>
  <env name="HOST" value="0.0.0.0"/>
  <env name="PORT" value="8080"/>
  <env name="CERTCAL_DADOS" value="C:\ProgramData\CertCal"/>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>20 sec</stoptimeout>
  <serviceaccount>
    <domain>NT AUTHORITY</domain>
    <user>LocalService</user>
  </serviceaccount>
  <logpath>C:\ProgramData\CertCal\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>   <!-- KB: gira a cada 10 MB -->
    <keepFiles>8</keepFiles>
  </log>
</service>
```

- **Logs:** a saída padrão do Node vai para `CertCal.out.log`, os erros para `CertCal.err.log` e o próprio WinSW escreve em `CertCal.wrapper.log`. No modo `roll-by-size` o arquivo gira a cada `sizeThreshold` KB e são mantidos `keepFiles` arquivos (padrão 10 MB × 8). No `roll-by-time` os arquivos ganham a data no nome (`<pattern>yyyyMMdd</pattern>`), mas os antigos não são apagados. A compactação em zip está marcada como quebrada na própria documentação.
- **Reinício automático:** se o Node sair com código diferente de zero, o SCM reinicia após 10 s, 30 s e 60 s. O contador de falhas zera depois de 1 h estável.
- **LocalService × LocalSystem:** o LocalService tem privilégios mínimos, e o setup dá a ele permissão de modificar `ProgramData\CertCal`. Se os backups precisarem ir para um compartilhamento de rede (`\\nas\...`), use `NetworkService` e dê acesso à conta do computador (`SERVIDOR$`), ou use uma conta de serviço dedicada.
- **`--disable-warning=ExperimentalWarning`:** no Node 22 o `node:sqlite` ainda mostra o aviso de experimental. No **Node 24.21 o aviso já não aparece** **[testado]**, porque o módulo virou "release candidate". O flag não causa problema em nenhuma das versões.

### 2.4 Desligamento limpo no Node (para o `stoptimeout` funcionar)

O WinSW envia Ctrl+C, que no Windows o Node recebe como `SIGINT`. Fechar o banco faz o checkpoint do WAL:

```js
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.once(sinal, async () => {
    app.log.info(`recebido ${sinal}, encerrando...`);
    await app.close();   // para de aceitar conexões e termina as requisições em andamento
    db.close();          // checkpoint do WAL
    process.exit(0);
  });
}
```

---

## 3. PDF do certificado sem instalar nada

### 3.1 Edge headless no servidor

| Sistema | Edge vem instalado? | Fonte |
|---|---|---|
| Windows 10 / 11 | Sim (Edge Chromium) | — |
| Windows Server 2019 / 2022 (Desktop Experience) | **Não.** Só o IE11 (no 2022, o IE é recurso opcional). É preciso baixar o "Edge for Business". As imagens do Azure Marketplace já trazem o Edge; as AMIs da AWS, não | Microsoft Q&A, AWS re:Post |
| Windows Server 2025 | Sim: o "Microsoft Edge" aparece entre os apps fixados por padrão no menu Iniciar | "What's new in Windows Server 2025" (Microsoft Learn) |
| Server Core (qualquer versão) | Não | — |

Mesmo quando o Edge existe (`msedge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=C:\saida.pdf file:///...`), há problemas:

- cada PDF sobe um navegador de 100 a 300 MB;
- rodando como LocalService é preciso informar um `--user-data-dir` gravável;
- o Edge se atualiza sozinho e pode mudar o layout do certificado sem aviso;
- "Página X de Y" exige CSS `@page { @bottom-right { content: counter(page) " de " counter(pages) } }` (margin boxes existem só a partir do Chromium 131) ou o `puppeteer-core` com `headerTemplate`.

**Veredito:** não depender do Edge, porque o sistema precisa rodar em Server 2019/2022 sem nada instalado.

### 3.2 Bibliotecas JavaScript (todas MIT; tamanho medido aqui com `npm install` **[testado]**)

| Biblioteca | Versão | Tabela com cabeçalho repetido | Página X de Y | Cabeçalho/rodapé repetido | QR code | Vetor (SVG) | Fonte embutida | `node_modules` | Avaliação |
|---|---|---|---|---|---|---|---|---|---|
| **pdfmake** | 0.3.11 (12/06/2026); 0.3.x estável desde 01/01/2026 | **Nativo** (`headerRows`, `dontBreakRows`) | **Nativo**: `footer: (pag, total) => ...` | **Nativo**: funções `header` e `footer` | **Nativo** (`{ qr }`) | **Nativo** (`{ svg }`) | TTF com subconjunto automático | 39 MB (inclui builds de navegador) | **Melhor relação resultado × esforço** |
| pdfkit | 0.20.2 (29/08/2026) | `doc.table()` desde a 0.17, mas sem repetição garantida do cabeçalho | Manual: `bufferPages: true` e, no final, `switchToPage(i)` para escrever | Manual (evento `pageAdded`) | Precisa da lib `qrcode` | Precisa do `svg-to-pdfkit` | TTF | 26 MB | Base do pdfmake. Use só se precisar de controle de baixo nível |
| @react-pdf/renderer | 4.9.0 | Não tem componente de tabela (é preciso montar com `View` e flexbox). Dá para repetir uma linha com `fixed`, mas ela repete em todas as páginas | `<Text fixed render={({pageNumber,totalPages}) => ...}/>` | `fixed` | Gerar PNG com a `qrcode` | `<Svg>` (subconjunto) | TTF via `Font.register` | 38 MB (com React 19) | Bom para quem pensa em React, mas mais pesado e com tabelas trabalhosas |
| jsPDF + autotable | 4.2.1 + 5.0.8 | Sim (autotable `showHead: 'everyPage'`) | `putTotalPages('{total}')` | Hook `didDrawPage` | Plugin/imagem | Limitado | TTF convertida para base64 | 59 MB | Feito para o navegador; tipografia e quebras mais fracas |

**Recomendação: pdfmake 0.3.11 no servidor Node.** Motivos: é declarativo (o certificado vira um objeto JSON montado a partir do banco), tem tudo o que o certificado precisa sem plugins, gera PDF/A-2b e o resultado é idêntico em qualquer Windows.

Riscos e cuidados:

- **CVE-2026-26801** (SSRF): na 0.3 o pdfmake passou a baixar imagens e fontes por URL. Use 0.3.8+ e chame `pdfmake.setUrlAccessPolicy(() => false)` e `pdfmake.setLocalAccessPolicy(...)`, como no exemplo abaixo.
- Use a **Inter estática** (`extras/ttf/Inter-*.ttf` do release v4.1 do rsms/inter, licença OFL), não a `InterVariable.ttf`.
- No logo SVG, converta os textos em curvas para não depender de fontes.

### 3.3 Exemplo testado: certificado com cabeçalho repetido, "Página X de Y", QR code, SVG e Inter **[testado]**

Resultado: PDF de 2 páginas, 45 KB, gerado em 345 ms. O `pdffonts` mostra `Inter-Bold`, `Inter-Regular` e `Inter-Italic` como `CID TrueType ... emb yes sub yes uni yes`. Nas imagens renderizadas, o cabeçalho, o cabeçalho da tabela e o rodapé "Página 1 de 2" e "Página 2 de 2" aparecem nas duas páginas, e acentos, "±", "µm" e "°C" saem corretos.

```js
// Teste: certificado de calibração com pdfmake 0.3 (Node), fontes Inter embutidas,
// cabeçalho/rodapé repetidos, "Página X de Y", tabela longa com cabeçalho repetido,
// logo SVG vetorial e QR code nativo.
const path = require('node:path');
const pdfmake = require('pdfmake');

const F = (n) => path.join(__dirname, 'fonts', n);
pdfmake.setFonts({
  Inter: {
    normal: F('Inter-Regular.ttf'),
    bold: F('Inter-Bold.ttf'),
    italics: F('Inter-Italic.ttf'),
    bolditalics: F('Inter-BoldItalic.ttf'),
  },
});
// Segurança (CVE-2026-26801): não deixar o pdfmake buscar URLs nem ler arquivos fora de fonts/
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((p) => p.startsWith(path.join(__dirname, 'fonts')));

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
  <rect x="0" y="0" width="40" height="40" rx="8" fill="#0F4C81"/>
  <path d="M8 28 L20 10 L32 28 Z" fill="#FFFFFF"/>
  <text x="48" y="26" font-size="16" font-family="Helvetica" font-weight="bold" fill="#0F4C81">METRO</text>
</svg>`;

const linhas = [];
for (let i = 1; i <= 70; i++) {
  const nominal = (i * 10).toFixed(2);
  linhas.push([
    { text: String(i), alignment: 'center' },
    { text: nominal, alignment: 'right' },
    { text: (i * 10 + (i % 3 - 1) * 0.02).toFixed(3), alignment: 'right' },
    { text: ((i % 3 - 1) * 0.02).toFixed(3), alignment: 'right' },
    { text: '± 0,015', alignment: 'right' },
    { text: '2,00', alignment: 'center' },
  ]);
}

const numeroCert = 'CC-2026-000123';
const docDefinition = {
  pageSize: 'A4',
  pageMargins: [40, 90, 40, 60], // [esq, topo, dir, base]: o topo/base reservam espaço p/ header/footer
  info: { title: `Certificado ${numeroCert}`, author: 'Laboratório Exemplo', subject: 'Certificado de calibração' },
  defaultStyle: { font: 'Inter', fontSize: 9, color: '#1F2937' },

  // Cabeçalho repetido em TODAS as páginas (função recebe página atual e total)
  header: (currentPage, pageCount) => ({
    margin: [40, 24, 40, 0],
    columns: [
      { svg: LOGO_SVG, width: 120 },
      {
        stack: [
          { text: 'CERTIFICADO DE CALIBRAÇÃO', bold: true, fontSize: 13, color: '#0F4C81', alignment: 'right' },
          { text: `Nº ${numeroCert}`, fontSize: 9, alignment: 'right' },
        ],
      },
    ],
  }),

  // Rodapé repetido com "Página X de Y"
  footer: (currentPage, pageCount) => ({
    margin: [40, 10, 40, 0],
    columns: [
      { text: 'Este certificado só pode ser reproduzido na íntegra.', fontSize: 7, color: '#6B7280' },
      { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 8 },
    ],
  }),

  content: [
    {
      columns: [
        {
          width: '*',
          table: {
            widths: [90, '*'],
            body: [
              [{ text: 'Cliente', bold: true }, 'Indústria Exemplo Ltda. — CNPJ 12.ABC.345/01DE-35'],
              [{ text: 'Instrumento', bold: true }, 'Paquímetro digital 0–150 mm, nº série 12345'],
              [{ text: 'Data da calibração', bold: true }, '14/10/2026'],
              [{ text: 'Acentuação', bold: true }, 'ação, coração, você, pôr, Ü, ñ, “aspas”, — travessão, ±, µm, °C'],
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { width: 90, qr: `https://cert.exemplo.local/v/${numeroCert}`, fit: 85, eccLevel: 'M', alignment: 'right' },
      ],
      columnGap: 12,
    },
    { text: 'Resultados', bold: true, fontSize: 11, margin: [0, 14, 0, 6] },
    {
      table: {
        headerRows: 1,          // a 1ª linha se repete automaticamente em cada página
        dontBreakRows: true,    // não quebra uma linha no meio
        widths: [24, '*', '*', '*', '*', 40],
        body: [
          ['#', 'Valor nominal (mm)', 'Indicação (mm)', 'Erro (mm)', 'U (mm)', 'k'].map((t) => ({
            text: t, bold: true, color: '#FFFFFF', fillColor: '#0F4C81', alignment: 'center',
          })),
          ...linhas,
        ],
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex > 0 && rowIndex % 2 === 0 ? '#F3F4F6' : null),
        hLineColor: () => '#D1D5DB', vLineColor: () => '#D1D5DB',
      },
    },
    { text: 'Assinatura do responsável técnico', margin: [0, 30, 0, 0], alignment: 'center', italics: true },
  ],
};

(async () => {
  const t = Date.now();
  const doc = pdfmake.createPdf(docDefinition);
  await doc.write(path.join(__dirname, 'certificado.pdf'));
  console.log('PDF gerado em', Date.now() - t, 'ms');
})();
```

**PDF/A para arquivamento** (útil para os registros da ISO/IEC 17025): basta adicionar `version: '1.7', subset: 'PDF/A-2b', tagged: true, lang: 'pt-BR'` ao `docDefinition`. O `pdfinfo` confirmou `pdfaid:part 2 / conformance B` e `Tagged: yes` **[testado]**. Ainda falta validar com o veraPDF antes de declarar conformidade.

Para servir o PDF no Fastify:

```js
app.get('/api/certificados/:id/pdf', async (req, reply) => {
  const buffer = await pdfmake.createPdf(montarDocDefinition(await carregar(req.params.id))).getBuffer();
  return reply.type('application/pdf')
    .header('Content-Disposition', `inline; filename="certificado-${req.params.id}.pdf"`)
    .send(buffer);
});
```

#### "Página X de Y" e cabeçalho repetido nas alternativas (referência)

```js
// @react-pdf/renderer
<Page size="A4" style={{ paddingTop: 90, paddingBottom: 60 }}>
  <View fixed style={{ position: 'absolute', top: 24, left: 40, right: 40 }}><Cabecalho /></View>
  <Text fixed style={{ position: 'absolute', bottom: 24, right: 40 }}
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
  {/* conteúdo */}
</Page>

// pdfkit "puro"
const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 90, bottom: 60, left: 40, right: 40 } });
// ... conteúdo ...
const { start, count } = doc.bufferedPageRange();
for (let i = start; i < start + count; i++) {
  doc.switchToPage(i);
  desenharCabecalho(doc);
  doc.text(`Página ${i + 1} de ${count}`, 40, doc.page.height - 40, { align: 'right', lineBreak: false });
}
doc.end();
```

---

## 4. APIs gratuitas de CNPJ e CEP (testadas ao vivo em 14/10/2026)

Nenhum host foi bloqueado pelo proxy do container. Houve só duas falhas, ambas do lado dos serviços: o **ViaCEP** teve resets intermitentes de conexão (provavelmente o antiabuso agindo sobre o IP compartilhado do proxy) e a **AwesomeAPI** respondeu `429 QuotaExceeded` já na primeira chamada.

### 4.1 CNPJ: resultado do teste

CNPJs usados: **00.000.000/0001-91** (Banco do Brasil, matriz), **33.000.167/0001-01** (Petrobras) e **00.000.000/E08G-12**, o primeiro CNPJ alfanumérico emitido (filial do BB, aberta em 31/07/2026).

| API | URL | HTTP (3 CNPJs) | **Telefone** | **E-mail** | Aceita alfanumérico? | Limite | Dado mais recente visto |
|---|---|---|---|---|---|---|---|
| **OpenCNPJ** | `https://api.opencnpj.org/{cnpj}` | 200, 200, 200 | ✅ `telefones[]` | ✅ `email` | ✅ | Sem cota fixa nem chave; aceita picos acima de 100 req/s em consultas pontuais; responde **429** se o volume alto for contínuo | `updated_at` 2026-09-15 (base mensal da Receita) |
| **CNPJá aberta** | `https://open.cnpja.com/office/{cnpj}` | 200, 200, 200 | ✅ `phones[]` | ✅ `emails[]` | ✅ | **5 consultas/min por IP**, sem cadastro | `updated` 2026-10-13 (cache próprio, o mais fresco) |
| **ReceitaWS** | `https://receitaws.com.br/v1/cnpj/{cnpj}` | 200, 200, 200 | ✅ `telefone` (já formatado) | ✅ `email` | ✅ (devolve `00.000.000/E08G-12`) | **3/min** (cabeçalho `x-ratelimit-limit: 3`) | `ultima_atualizacao` 2026-10-13 |
| **CNPJ.ws pública** | `https://publica.cnpj.ws/cnpj/{cnpj}` | 200, 200, 200 | ✅ `estabelecimento.ddd1`/`telefone1` | ✅ `estabelecimento.email` | ✅ | **3/min por IP** (`x-ratelimit-limit: 3`). Mais de 360 respostas 429 numa hora bloqueiam o IP por 1 h | `atualizado_em` 2026-09-12 |
| **BrasilAPI** | `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` | 200, 200, 200 | ✅ `ddd_telefone_1` | ❌ **`email: null`** nos 3 | ✅ | Sem cota publicada (uso justo) | Usa os dados do Minha Receita |
| **Minha Receita** | `https://minhareceita.org/{cnpj}` | 200, 200, 200 | ✅ `ddd_telefone_1` | ❌ **`email: null`** nos 3 | ✅ | Sem limite numérico; "sem garantia de nível de serviço" | O projeto **remove dados "em prol da privacidade"** e para evitar SPAM (por isso o e-mail sai nulo) |

**Resposta direta:** trazem **telefone e e-mail** a **OpenCNPJ, CNPJá aberta, ReceitaWS e CNPJ.ws pública**. A **BrasilAPI e o Minha Receita trazem telefone, mas não e-mail**.

Valores de exemplo devolvidos para o BB (matriz): telefone `(61) 3493-9002`, fax `(61) 3493-1040`, e-mail `secex@bb.com.br`.

### 4.2 Nomes exatos dos campos

| Dado | OpenCNPJ | CNPJá aberta | ReceitaWS | CNPJ.ws pública | BrasilAPI / Minha Receita |
|---|---|---|---|---|---|
| Razão social | `razao_social` | `company.name` | `nome` | `razao_social` | `razao_social` |
| Nome fantasia | `nome_fantasia` | `alias` | `fantasia` | `estabelecimento.nome_fantasia` | `nome_fantasia` |
| Situação cadastral | `situacao_cadastral` ("Ativa") | `status.text` ("Ativa"), `status.id` | `situacao` ("ATIVA") | `estabelecimento.situacao_cadastral` ("Ativa") | `descricao_situacao_cadastral` ("ATIVA") e `situacao_cadastral` (2) |
| Logradouro | `tipo_logradouro` + `logradouro` | `address.street` (já com o tipo) | `logradouro` (com o tipo abreviado, ex.: "AV") | `estabelecimento.tipo_logradouro` + `logradouro` | `descricao_tipo_de_logradouro` + `logradouro` |
| Número | `numero` | `address.number` | `numero` | `estabelecimento.numero` | `numero` |
| Complemento | `complemento` (com espaços repetidos) | `address.details` | `complemento` | `estabelecimento.complemento` | `complemento` |
| Bairro | `bairro` | `address.district` | `bairro` | `estabelecimento.bairro` | `bairro` |
| Município | `municipio` (+ `codigo_municipio` SIAFI) | `address.city` (+ `address.municipality` = IBGE) | `municipio` | `estabelecimento.cidade.nome` (+ `cidade.ibge_id`) | `municipio` (+ `codigo_municipio_ibge`) |
| UF | `uf` | `address.state` | `uf` | `estabelecimento.estado.sigla` | `uf` |
| CEP | `cep` ("70040912") | `address.zip` | `cep` ("70.040-912") | `estabelecimento.cep` | `cep` |
| **Telefone** | `telefones[]` = `{ddd, numero, is_fax}` | `phones[]` = `{type, area, number}` | `telefone` ("(61) 3493-9002") | `estabelecimento.ddd1`+`telefone1`, `ddd2`+`telefone2`, `ddd_fax`+`fax` | `ddd_telefone_1`, `ddd_telefone_2`, `ddd_fax` ("6134939002") |
| **E-mail** | `email` (MAIÚSCULAS) | `emails[]` = `{ownership, address, domain}` | `email` | `estabelecimento.email` | `email` (sempre `null`) |
| CNPJ devolvido | `cnpj` (14 caracteres) | `taxId` | `cnpj` (formatado) | `estabelecimento.cnpj` | `cnpj` |
| Extras úteis | `cnaes[]`, `QSA` | `company.members`, `simples`, `simei` | `qsa`, `simples`, `atividade_principal` | `inscricoes_estaduais[]`, `socios` | `qsa`, `cnaes_secundarios`, `regime_tributario` |

> **LGPD:** em CNPJs de MEI/EI, a razão social costuma conter o **nome e o CPF** do empresário, e o telefone e o e-mail são pessoais. Grave só o que o certificado precisa.

### 4.3 Cliente com fallback e formato único **[testado]**

Foi testado com Node 24.21 nos três CNPJs acima e em um CEP de Rio Claro. Como o ViaCEP falhou no container, o código caiu automaticamente para o OpenCEP. Guarde as respostas no SQLite (tabela `cache_cnpj` com validade de 30 dias e `cache_cep` com 180 dias) para não depender das cotas.

```js
// consultas.js - CNPJ e CEP com fallback entre APIs gratuitas e formato único de saída
const TIMEOUT = 8000;
const soDigitosOuLetras = (s) => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const juntarFone = (ddd, num) => (ddd && num ? `(${ddd}) ${num}` : null);
const limpar = (v) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t === '' ? null : t; };

async function obterJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (r.status === 404) return null;                       // CNPJ/CEP inexistente
  if (!r.ok) throw new Error(`${new URL(url).host} respondeu HTTP ${r.status}`);
  return r.json();
}

// ------------------------------------------------------------------ CNPJ
const fontesCnpj = [
  {
    nome: 'OpenCNPJ',                                       // sem cota fixa; e-mail + telefones
    url: (c) => `https://api.opencnpj.org/${c}`,
    mapear: (j) => ({
      razaoSocial: j.razao_social, nomeFantasia: j.nome_fantasia, situacao: j.situacao_cadastral,
      logradouro: [j.tipo_logradouro, j.logradouro].filter(Boolean).join(' '), numero: j.numero,
      complemento: j.complemento, bairro: j.bairro, municipio: j.municipio, uf: j.uf, cep: j.cep,
      telefones: (j.telefones ?? []).filter((t) => !t.is_fax).map((t) => juntarFone(t.ddd, t.numero)),
      email: j.email,
    }),
  },
  {
    nome: 'CNPJá (aberta)',                                 // 5 consultas/min por IP; e-mail + telefones
    url: (c) => `https://open.cnpja.com/office/${c}`,
    mapear: (j) => ({
      razaoSocial: j.company?.name, nomeFantasia: j.alias, situacao: j.status?.text,
      logradouro: j.address?.street, numero: j.address?.number, complemento: j.address?.details,
      bairro: j.address?.district, municipio: j.address?.city, uf: j.address?.state, cep: j.address?.zip,
      telefones: (j.phones ?? []).map((t) => juntarFone(t.area, t.number)),
      email: j.emails?.[0]?.address,
    }),
  },
  {
    nome: 'CNPJ.ws (pública)',                              // 3 consultas/min por IP; e-mail + telefones
    url: (c) => `https://publica.cnpj.ws/cnpj/${c}`,
    mapear: ({ razao_social, estabelecimento: e = {} }) => ({
      razaoSocial: razao_social, nomeFantasia: e.nome_fantasia, situacao: e.situacao_cadastral,
      logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '), numero: e.numero,
      complemento: e.complemento, bairro: e.bairro, municipio: e.cidade?.nome, uf: e.estado?.sigla, cep: e.cep,
      telefones: [juntarFone(e.ddd1, e.telefone1), juntarFone(e.ddd2, e.telefone2)],
      email: e.email,
    }),
  },
  {
    nome: 'BrasilAPI',                                      // sem e-mail (dados do Minha Receita)
    url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`,
    mapear: (j) => ({
      razaoSocial: j.razao_social, nomeFantasia: j.nome_fantasia, situacao: j.descricao_situacao_cadastral,
      logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), numero: j.numero,
      complemento: j.complemento, bairro: j.bairro, municipio: j.municipio, uf: j.uf, cep: j.cep,
      telefones: [j.ddd_telefone_1, j.ddd_telefone_2].map((t) => (t ? juntarFone(t.slice(0, 2), t.slice(2)) : null)),
      email: j.email,                                       // vem null
    }),
  },
];

export async function consultarCnpj(entrada) {
  const cnpj = soDigitosOuLetras(entrada);                  // aceita o formato alfanumérico
  const erros = [];
  for (const f of fontesCnpj) {
    try {
      const j = await obterJson(f.url(cnpj));
      if (j === null) return null;                          // inexistente: não adianta tentar outra
      const d = f.mapear(j);
      return {
        cnpj, fonte: f.nome,
        ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.filter(Boolean) : limpar(v)])),
      };
    } catch (e) { erros.push(`${f.nome}: ${e.message}`); }  // timeout, 429, 5xx: tenta a próxima
  }
  throw new Error(`Nenhuma API de CNPJ respondeu (${erros.join('; ')})`);
}

// ------------------------------------------------------------------ CEP
const fontesCep = [
  { nome: 'ViaCEP', url: (c) => `https://viacep.com.br/ws/${c}/json/`,
    mapear: (j) => (j.erro ? null : { logradouro: j.logradouro, complemento: j.complemento, bairro: j.bairro, municipio: j.localidade, uf: j.uf, ibge: j.ibge }) },
  { nome: 'OpenCEP', url: (c) => `https://opencep.com/v1/${c}`,
    mapear: (j) => ({ logradouro: j.logradouro, complemento: j.complemento, bairro: j.bairro, municipio: j.localidade, uf: j.uf, ibge: j.ibge }) },
  { nome: 'BrasilAPI', url: (c) => `https://brasilapi.com.br/api/cep/v2/${c}`,
    mapear: (j) => ({ logradouro: j.street, complemento: null, bairro: j.neighborhood, municipio: j.city, uf: j.state, ibge: j.ibge?.city ?? null }) },
];

export async function consultarCep(entrada) {
  const cep = String(entrada).replace(/\D/g, '');
  if (cep.length !== 8) throw new Error('CEP deve ter 8 dígitos');
  const erros = [];
  for (const f of fontesCep) {
    try {
      const j = await obterJson(f.url(cep));
      const d = j && f.mapear(j);
      if (!d) continue;                                     // ViaCEP: {"erro":"true"}; tenta a próxima
      return { cep, fonte: f.nome, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, limpar(v)])) };
    } catch (e) { erros.push(`${f.nome}: ${e.message}`); }
  }
  if (erros.length === fontesCep.length) throw new Error(`Nenhuma API de CEP respondeu (${erros.join('; ')})`);
  return null;
}
```

### 4.4 CEP: resultado do teste (CEPs de Rio Claro-SP: 13500-110 e 13506-555)

| API | URL | Resultado | Campos (nomes exatos) | Limite / observações |
|---|---|---|---|---|
| **ViaCEP** | `https://viacep.com.br/ws/{cep}/json/` | 13500-110: 200 em 0,13 s. 13506-555: reset de conexão no JSON, mas o `/xml/` respondeu 200 | `cep`, `logradouro`, `complemento`, `unidade`, `bairro`, `localidade`, `uf`, `estado`, `regiao`, `ibge`, `gia`, `ddd`, `siafi` | Sem número publicado: "uso massivo para validação de bases ... poderá bloquear seu acesso por tempo indeterminado". CEP inexistente devolve **HTTP 200** com `{"erro": "true"}` |
| **OpenCEP** | `https://opencep.com/v1/{cep}` | 200, 200 (0,3 a 0,5 s) | `cep`, `logradouro`, `complemento`, `unidade` (às vezes), `bairro`, `localidade`, `uf`, `ibge` | "Grátis e sem limites": arquivos estáticos (Google Cloud Storage + Cloudflare). Inexistente devolve **404** `{"error": true}` |
| **BrasilAPI v2** | `https://brasilapi.com.br/api/cep/v2/{cep}` | 200, 200 (2,5 a 3,4 s) | `cep`, `state`, `city`, `neighborhood`, `street`, `service`, `ibge.city`, `ibge.state`, `timezoneName`, `location.coordinates.latitude`/`longitude` | Sem `complemento`. As coordenadas foram **idênticas** para os 2 CEPs (centro da cidade, não da rua). Agrega open-cep, correios, viacep, widenet e correios-alt. Inexistente devolve 404 `CepPromiseError`. A v1 é igual, sem `location`, e mais rápida (0,2 a 0,5 s) |
| **AwesomeAPI** | `https://cep.awesomeapi.com.br/json/{cep}` | **429** `QuotaExceeded` nas duas chamadas | (pela documentação) `cep`, `address_type`, `address_name`, `address`, `state`, `district`, `lat`, `lng`, `city`, `city_ibge`, `ddd` | Sem chave, a cota por IP esgota (aqui o IP é compartilhado). Com chave gratuita: **100 mil requisições/mês**. Sem chave a resposta tem cache de 1 min |

**Recomendação para CEP:** ViaCEP, depois OpenCEP, depois BrasilAPI v2, com cache. Nenhuma API de CEP traz telefone ou e-mail, apenas endereço.

### 4.5 CNPJ alfanumérico (em produção desde 31/07/2026)

- **Base legal:** IN RFB 2.229/2024, que alterou a IN RFB 2.119/2022. A Receita começou a emitir em **31/07/2026**. O primeiro foi **00.000.000/E08G-12**, uma filial do Banco do Brasil. Os CNPJs existentes **não mudam** e os dois formatos convivem. CNPJs numéricos continuam sendo emitidos aleatoriamente.
- **Formato:** 14 posições. As **12 primeiras** (raiz de 8 + ordem de 4) aceitam `0-9` e `A-Z` **maiúsculas**. As **2 últimas** (DV) são **sempre numéricas**. Regex: `^[0-9A-Z]{12}[0-9]{2}$`.
- **Máscara:** igual à atual, `SS.SSS.SSS/SSSS-NN` (ex.: `12.ABC.345/01DE-35`). Mantenha os zeros à esquerda e guarde no banco **sem máscara e em maiúsculas**, num campo `TEXT` de 14 caracteres. Nunca use `INTEGER`.
- **Cálculo do DV** (módulo 11, regra oficial da Receita):
  1. Converta cada caractere para **(código ASCII − 48)**. Os dígitos continuam valendo 0 a 9, e as letras viram A=17, B=18, …, Z=42.
  2. Multiplique da direita para a esquerda pelos pesos 2, 3, …, 9, recomeçando em 2 (sobre as 12 posições, isso dá 5 4 3 2 9 8 7 6 5 4 3 2).
  3. Some e calcule o resto da divisão por 11. Se o resto for menor que 2, o DV é 0; senão, o DV é 11 − resto.
  4. Repita o processo sobre as 13 posições (12 + 1º DV) para obter o 2º DV.
  5. Exemplo oficial: `12ABC34501DE`. Primeira soma = 459, resto 8, DV1 = 3. Segunda soma = 424, resto 6, DV2 = 5. Resultado: **12.ABC.345/01DE-35**.
- A mesma rotina valida os CNPJs numéricos antigos (para eles o resultado é idêntico).
- **Letras:** a Receita orienta aceitar **todas** as letras. Ela mesma evita combinações ofensivas ou confusas na geração. Há guias não oficiais que dizem para evitar I, O, Q e F, mas o validador **não** deve rejeitá-las.
- Todas as 6 APIs de CNPJ testadas **aceitaram** o `00000000E08G12` **[testado]**.
- Simulador oficial (gera até 1.000 CNPJs fictícios para teste): `https://servicos.receitafederal.gov.br/servico/cnpj-alfa/simular`.

Implementação **[testado]**: os casos `12ABC34501DE35`, `00000000000191`, `33000167000101`, `00000000E08G12`, `12345678000A08` e `AA345678000A29` dão válido, e `12ABC34501DE36` dá inválido.

```js
// Cálculo do DV do CNPJ (numérico e alfanumérico) - regra da Receita (módulo 11, valor = ASCII - 48)
export function calcularDV(base12) {
  const b = base12.toUpperCase();
  if (!/^[0-9A-Z]{12}$/.test(b)) throw new Error('base inválida');
  const valores = [...b].map((c) => c.charCodeAt(0) - 48);
  const dv = (vals) => {
    let peso = 2, soma = 0;
    for (let i = vals.length - 1; i >= 0; i--) { soma += vals[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(valores);
  const d2 = dv([...valores, d1]);
  return `${d1}${d2}`;
}
export function validarCNPJ(entrada) {
  const c = String(entrada).toUpperCase().replace(/[.\/-]/g, '');
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111...
  return calcularDV(c.slice(0, 12)) === c.slice(12);
}
export const formatarCNPJ = (c) => c.toUpperCase().replace(/^(.{2})(.{3})(.{3})(.{4})(\d{2})$/, '$1.$2.$3/$4-$5');
for (const t of ['12ABC34501DE35', '00000000000191', '33000167000101', '00000000E08G12', '12345678000A08', 'AA345678000A29', '12ABC34501DE36'])
  console.log(t.padEnd(16), validarCNPJ(t), formatarCNPJ(t));
```

No front (React), aplique a máscara aceitando letras: converta para maiúsculas, remova o que não for `[0-9A-Z]`, limite a 14 caracteres e formate com `formatarCNPJ`. Use `inputMode="text"`, e não `numeric`, senão o teclado do celular não mostra letras.

---

## 5. Segurança na rede local

### 5.1 Três camadas para "só a rede da empresa"

1. **Firewall do Windows** (no instalador): regra de entrada `remoteip=localsubnet` (ou as faixas da empresa), `profile=any`, restrita ao `node.exe` e à porta. Pacotes de fora nem chegam ao Node.
2. **Escutar em `0.0.0.0`**, que é necessário para os PCs da rede acessarem, mas com um **filtro na aplicação** que recusa qualquer IP de origem fora de loopback, RFC 1918 (10/8, 172.16/12, 192.168/16), link-local (169.254/16, fe80::/10) e ULA IPv6 (fc00::/7). Use `trustProxy: false` (o padrão do Fastify), para que ninguém forje o IP com `X-Forwarded-For`. O filtro protege mesmo que alguém crie por engano um redirecionamento de porta no roteador. **[testado]**: `192.168.1.20`, `::ffff:192.168.1.20`, `10.1.2.3`, `172.31.255.1`, `::1`, `fe80::1%eth0` e `fd12::5` são aceitos; `172.32.0.1`, `8.8.8.8`, `2804:14c::1` e `100.64.0.1` (CGNAT) são recusados.
3. **Autenticação** em todas as rotas, exceto o login e os arquivos estáticos do front.

### 5.2 HTTPS na LAN: vale a pena?

| Opção | Experiência do usuário | Segurança | Recomendação |
|---|---|---|---|
| HTTP puro na LAN | Sem avisos. O **Chrome 154** (previsto para out/2026) vai pedir confirmação antes de abrir sites HTTP **públicos**, mas **trata como privados** IPs locais (`192.168.0.1`), nomes de rótulo único (`http://servidor:8080`) e atalhos como `intranet/`. Ele também não repete o aviso para sites visitados com frequência | Senha e cookie trafegam em claro na LAN. Só um atacante **dentro** da rede consegue explorar | **Fase 1**, com as mitigações abaixo |
| Certificado autoassinado "cru" | Aviso vermelho em todo PC e em toda renovação. Ensina o usuário a clicar em "continuar mesmo assim" | Criptografa, mas sem autenticar o servidor | **Não** |
| **CA própria da empresa** (gerada na instalação) + certificado do servidor assinado por ela | Sem avisos depois que a CA é instalada em "Autoridades de Certificação Raiz Confiáveis" dos PCs. Num domínio AD isso é feito **por GPO**; sem domínio, com `certutil -addstore -f Root certcal-ca.cer` em cada PC. Chrome e Edge usam o repositório do Windows; o Firefox no Windows também, por padrão (preferência `security.enterprise_roots.enabled`) | Completa | **Fase 2**: quando houver domínio AD, Wi-Fi compartilhado com visitantes na mesma sub-rede ou exigência de auditoria |
| Domínio público + Let's Encrypt (DNS-01) apontando para IP privado | Sem avisos | Completa | Só se a empresa já tiver domínio e uma API de DNS. A renovação exige saída para a internet |

**Mitigações da fase 1 (HTTP):**

- acessar por `http://NOMEDOSERVIDOR:8080` (rótulo único) ou pelo IP, e não por um FQDN que pareça público;
- cookie `HttpOnly` + `SameSite=Strict`;
- sessões curtas;
- bloqueio de tentativas;
- Wi-Fi de visitantes em VLAN separada (aí a regra `LocalSubnet` já bloqueia os visitantes).

**Pegadinhas do HTTP:**

- O **`@fastify/helmet` envia `upgrade-insecure-requests` por padrão**. Num site HTTP fora do localhost, isso faz o navegador pedir JS e CSS via `https://`, e a página quebra. Desative quando não houver HTTPS **[testado]**.
- APIs de navegador que exigem contexto seguro **não existem** em `http://192.168.x.x`: `crypto.randomUUID()`, `crypto.subtle`, `navigator.clipboard` e service worker. Em `localhost` elas funcionam, o que esconde o problema durante o desenvolvimento. Use `crypto.getRandomValues()`, que funciona em HTTP.
- O prefixo de cookie `__Host-` e o atributo `Secure` só funcionam com HTTPS.

**Esboço da fase 2: CA própria com ferramentas nativas do Windows** **[não testado]**. Rodaria no instalador, com a opção `/HTTPS`. O `New-SelfSignedCertificate` aceita `-Signer` e SAN com `IPAddress` via `-TextExtension`.

```powershell
# criar-certificados.ps1 (PowerShell 5.1, Windows Server 2016+). Executar como administrador.
param([string]$Destino = "$env:ProgramData\CertCal\tls", [Parameter(Mandatory)][string]$SenhaPfx)
New-Item -ItemType Directory -Force $Destino | Out-Null
$nome = $env:COMPUTERNAME
$ips  = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' }).IPAddress
$san  = (@("DNS=$nome", "DNS=localhost", "IPAddress=127.0.0.1") + ($ips | ForEach-Object { "IPAddress=$_" })) -join '&'

$ca = New-SelfSignedCertificate -Subject "CN=CertCal CA ($nome)" -CertStoreLocation Cert:\LocalMachine\My `
      -KeyUsage CertSign, CRLSign, DigitalSignature -KeyLength 3072 -HashAlgorithm SHA256 `
      -NotAfter (Get-Date).AddYears(10) -TextExtension @('2.5.29.19={critical}{text}ca=true&pathlength=0')
$srv = New-SelfSignedCertificate -Subject "CN=$nome" -Signer $ca -CertStoreLocation Cert:\LocalMachine\My `
      -KeyExportPolicy Exportable -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5) `
      -TextExtension @("2.5.29.17={text}$san", '2.5.29.37={text}1.3.6.1.5.5.7.3.1')

Export-Certificate    -Cert $ca  -FilePath "$Destino\certcal-ca.cer" | Out-Null     # distribuir aos PCs (GPO)
Export-PfxCertificate -Cert $srv -FilePath "$Destino\servidor.pfx" `
      -Password (ConvertTo-SecureString $SenhaPfx -AsPlainText -Force) | Out-Null
Import-Certificate -FilePath "$Destino\certcal-ca.cer" -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
```

No Fastify: `Fastify({ https: { pfx: readFileSync(...servidor.pfx), passphrase } })`. Guarde a senha do PFX protegida com a ACL da pasta. CAs privadas não estão sujeitas ao limite de 398 dias de validade dos certificados públicos.

### 5.3 Código: filtro de rede, senhas, sessões e tentativas **[testado]**

`seguranca.js`:

```js
// seguranca.js - camadas de segurança para uso em rede local (Fastify 5 + node:sqlite)
import net from 'node:net';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// ---------------------------------------------------------------- 1) Só rede local
const faixasPermitidas = new net.BlockList();
faixasPermitidas.addSubnet('127.0.0.0', 8, 'ipv4');    // loopback
faixasPermitidas.addSubnet('10.0.0.0', 8, 'ipv4');     // RFC 1918
faixasPermitidas.addSubnet('172.16.0.0', 12, 'ipv4');  // RFC 1918
faixasPermitidas.addSubnet('192.168.0.0', 16, 'ipv4'); // RFC 1918
faixasPermitidas.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local (APIPA)
faixasPermitidas.addAddress('::1', 'ipv6');            // loopback IPv6
faixasPermitidas.addSubnet('fe80::', 10, 'ipv6');      // link-local IPv6
faixasPermitidas.addSubnet('fc00::', 7, 'ipv6');       // ULA IPv6 (equivale ao RFC 1918)

export function ipDaRedeLocal(ip) {
  if (!ip) return false;
  ip = ip.replace(/%.*$/, '');                          // remove zona: fe80::1%eth0
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);  // IPv4 mapeado em IPv6
  if (m) ip = m[1];
  const familia = net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null;
  return familia !== null && faixasPermitidas.check(ip, familia);
}

export function somenteRedeLocal(fastify) {
  // trustProxy fica DESLIGADO (padrão): request.ip é o IP real do socket,
  // ninguém consegue "fingir" ser da rede local com X-Forwarded-For.
  fastify.addHook('onRequest', async (request, reply) => {
    if (!ipDaRedeLocal(request.socket.remoteAddress)) {
      request.log.warn({ ip: request.socket.remoteAddress }, 'acesso recusado: fora da rede local');
      return reply.code(403).send({ erro: 'Acesso permitido somente pela rede da empresa.' });
    }
  });
}

// ---------------------------------------------------------------- 2) Senhas (scrypt)
// OWASP: N=2^17, r=8, p=1 (128 MiB). maxmem precisa ser > 128*N*r, senão o
// Node lança ERR_CRYPTO_INVALID_SCRYPT_PARAMS (o padrão do Node é 32 MiB).
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const TAM_CHAVE = 64;

export async function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const chave = await scryptAsync(senha.normalize('NFC'), sal, TAM_CHAVE, SCRYPT);
  // formato autodescritivo: permite aumentar o custo no futuro sem quebrar nada
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${chave.toString('base64')}`;
}

export async function conferirSenha(senha, armazenado) {
  const [alg, N, r, p, salB64, chaveB64] = String(armazenado).split('$');
  if (alg !== 'scrypt') return { ok: false };
  const esperado = Buffer.from(chaveB64, 'base64');
  const params = { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem };
  const obtido = await scryptAsync(senha.normalize('NFC'), Buffer.from(salB64, 'base64'), esperado.length, params);
  const ok = obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
  const precisaRehash = ok && (+N !== SCRYPT.N || +r !== SCRYPT.r || +p !== SCRYPT.p);
  return { ok, precisaRehash };
}

// Hash "falso" para gastar o mesmo tempo quando o usuário não existe
// (evita descobrir logins válidos pelo tempo de resposta)
export const HASH_FICTICIO = await gerarHashSenha(randomBytes(16).toString('hex'));

// ---------------------------------------------------------------- 3) Sessões
// O cookie leva um token aleatório; no banco fica só o SHA-256 dele.
export const novoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

export function opcoesCookie({ https }) {
  return {
    path: '/',
    httpOnly: true,          // JavaScript da página não lê o cookie (mitiga XSS)
    sameSite: 'strict',      // não vai em requisições vindas de outros sites (CSRF)
    secure: https,           // só quando houver HTTPS; em HTTP o navegador descartaria o cookie
    maxAge: 60 * 60 * 10,    // 10 h (um expediente); o servidor também controla expiração
  };
}

// ---------------------------------------------------------------- 4) Tentativas de login
// Bloqueio progressivo por (usuário + IP) e por IP, guardado no SQLite
// (sobrevive a reinício do serviço).
export function criarLimitadorLogin(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tentativas_login (
    chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL, bloqueado_ate INTEGER NOT NULL DEFAULT 0, atualizado INTEGER NOT NULL)`);
  const ler = db.prepare('SELECT falhas, bloqueado_ate FROM tentativas_login WHERE chave = ?');
  const gravar = db.prepare(`INSERT INTO tentativas_login(chave, falhas, bloqueado_ate, atualizado) VALUES (?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET falhas = excluded.falhas, bloqueado_ate = excluded.bloqueado_ate, atualizado = excluded.atualizado`);
  const apagar = db.prepare('DELETE FROM tentativas_login WHERE chave = ?');
  const LIVRES = 5;                          // 5 erros sem punição
  const espera = (falhas) => Math.min(2 ** (falhas - LIVRES - 1) * 30_000, 30 * 60_000); // 6ª falha: 30 s; 7ª: 1 min; 8ª: 2 min... até 30 min

  return {
    bloqueadoAte(chaves) {
      const agora = Date.now();
      return Math.max(0, ...chaves.map((c) => ler.get(c)?.bloqueado_ate ?? 0).filter((t) => t > agora));
    },
    registrarFalha(chaves) {
      const agora = Date.now();
      for (const c of chaves) {
        const falhas = (ler.get(c)?.falhas ?? 0) + 1;
        gravar.run(c, falhas, falhas > LIVRES ? agora + espera(falhas) : 0, agora);
      }
    },
    registrarSucesso(chaves) { for (const c of chaves) apagar.run(c); },
  };
}
```

`servidor.js` (mínimo, junta as camadas). Teste com Node 24.21:

- login correto: `Set-Cookie: sessao=...; Max-Age=36000; Path=/; HttpOnly; SameSite=Strict`, sem `upgrade-insecure-requests` na CSP e sem HSTS;
- `Origin: http://evil.example`: `403 Origem inválida`;
- 8 senhas erradas seguidas: `401 ×6`, depois `429`, e a **senha certa também fica bloqueada** até expirar o prazo (`Retry-After`).

```js
// servidor.js - exemplo mínimo que junta as camadas (teste local)
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { DatabaseSync } from 'node:sqlite';
import {
  somenteRedeLocal, gerarHashSenha, conferirSenha, HASH_FICTICIO,
  novoToken, hashToken, opcoesCookie, criarLimitadorLogin,
} from './seguranca.js';

const HTTPS = process.env.CERTCAL_HTTPS === '1';
const db = new DatabaseSync(process.env.DB ?? ':memory:', { timeout: 5000 });
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, senha TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    criada INTEGER NOT NULL, expira INTEGER NOT NULL);`);
db.prepare('INSERT OR IGNORE INTO usuarios(login, senha) VALUES (?, ?)').run('admin', await gerarHashSenha('troque-esta-senha'));

const limitador = criarLimitadorLogin(db);
const app = Fastify({ logger: { level: 'warn' }, trustProxy: false });

somenteRedeLocal(app);                                   // 1ª camada na aplicação
await app.register(cookie);
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      // Em HTTP, o padrão do helmet ("upgrade-insecure-requests") faria o
      // navegador pedir JS/CSS via https:// e a página quebraria.
      'upgrade-insecure-requests': HTTPS ? [] : null,
    },
  },
  strictTransportSecurity: HTTPS,                        // HSTS só faz sentido com HTTPS
});
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' }); // teto geral por IP

// Proteção CSRF extra: em métodos que alteram dados, o Origin deve ser o próprio servidor
app.addHook('onRequest', async (req, reply) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return reply.code(403).send({ erro: 'Origem inválida' });
  }
});

app.post('/api/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
  const { login = '', senha = '' } = req.body ?? {};
  const chaves = [`u:${String(login).toLowerCase()}|ip:${req.ip}`, `ip:${req.ip}`];
  const ate = limitador.bloqueadoAte(chaves);
  if (ate) {
    reply.header('Retry-After', Math.ceil((ate - Date.now()) / 1000));
    return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde e tente novamente.' });
  }
  const usuario = db.prepare('SELECT id, senha FROM usuarios WHERE login = ?').get(String(login));
  const { ok, precisaRehash } = await conferirSenha(String(senha), usuario?.senha ?? HASH_FICTICIO);
  if (!usuario || !ok) {
    limitador.registrarFalha(chaves);
    return reply.code(401).send({ erro: 'Usuário ou senha inválidos.' });  // mensagem genérica
  }
  limitador.registrarSucesso(chaves);
  if (precisaRehash) db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(await gerarHashSenha(senha), usuario.id);
  const token = novoToken();                               // token novo a cada login (evita fixação de sessão)
  const agora = Date.now();
  db.prepare('INSERT INTO sessoes VALUES (?, ?, ?, ?)').run(hashToken(token), usuario.id, agora, agora + 10 * 3600_000);
  reply.setCookie(HTTPS ? '__Host-sessao' : 'sessao', token, opcoesCookie({ https: HTTPS }));
  return { ok: true };
});

app.get('/api/eu', async (req, reply) => {
  const token = req.cookies[HTTPS ? '__Host-sessao' : 'sessao'];
  const s = token && db.prepare('SELECT usuario_id, expira FROM sessoes WHERE token_hash = ?').get(hashToken(token));
  if (!s || s.expira < Date.now()) return reply.code(401).send({ erro: 'Sessão expirada' });
  return { usuario: s.usuario_id };
});

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 8080) });
console.log('ouvindo em', app.server.address());
```

**Resumo das decisões de segurança:**

- **Cookie de sessão:** `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` de 10 h. Use `Secure` + prefixo `__Host-` quando houver HTTPS. O valor é um token aleatório de 256 bits; no banco fica só o **SHA-256** do token, então um vazamento do banco não entrega sessões válidas. Gere um token novo a cada login e apague a sessão no logout e na troca de senha. `SameSite=Strict` + conferência de `Origin` nos POST/PUT/PATCH/DELETE dispensa token CSRF.
- **scrypt:** N=2^17, r=8, p=1 (128 MiB), **com `maxmem` explícito**. Sem ele, o Node lança `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, porque o padrão é 32 MiB; isso acontece até com N=2^15 e r=8 **[testado]**. Leva cerca de 0,5 s por hash neste container. O sal tem 16 bytes e a chave 64 bytes. O formato `scrypt$N$r$p$sal$hash` permite subir o custo depois (com rehash no login). A comparação usa `timingSafeEqual`, e um hash fictício iguala o tempo de resposta quando o usuário não existe. Alternativa: o Node 24.7+ tem `crypto.argon2()`, a primeira escolha do OWASP, mas ainda experimental. Fique com o scrypt.
- **Limite de tentativas:** use duas chaves, `usuário+IP` (protege a conta sem permitir que outro PC a bloqueie) e `IP` (protege contra testar muitos usuários). Os 5 primeiros erros são livres; depois a espera vai de 30 s a 1 min, 2 min e assim por diante, até 30 min. O registro fica no SQLite e sobrevive a um reinício. Somam-se a isso o `@fastify/rate-limit` global (300/min por IP) e o da rota de login (20/min). A mensagem de erro é genérica ("Usuário ou senha inválidos"). Registre as tentativas na trilha de auditoria.
- **Outros:**
  - primeiro acesso com troca obrigatória da senha inicial;
  - perfis de acesso (quem só consulta e quem assina certificados);
  - limite de tamanho do corpo das requisições (`bodyLimit`);
  - nunca montar SQL com concatenação (use `prepare` com `?`);
  - logs sem senha nem token.

---

## 6. Backup automático do SQLite em execução

### 6.1 `VACUUM INTO` × `sqlite.backup()` **[testado]**

| Método | Disponível em | Como funciona | Banco de 114 MB (WAL) |
|---|---|---|---|
| `db.exec("VACUUM INTO 'arquivo.db'")` | SQLite 3.27+ (qualquer Node com `node:sqlite`) | Uma instrução SQL. Gera uma cópia **compactada e desfragmentada**. Falha se o destino já existir | 297 ms no total, mas **o event loop ficou travado 293 ms**: o `DatabaseSync` é síncrono, então o servidor para de responder durante a cópia |
| `await backup(db, 'arquivo.db', { rate })` | Node **22.16+**, 23.8+, 24, 26 | API de backup online do SQLite em etapas assíncronas. Escritas feitas pela mesma conexão entram na cópia; escritas de outra conexão reiniciam o processo | 886 ms no total, com **bloqueio máximo de 6 ms** |

Os dois geraram cópias íntegras (`PRAGMA integrity_check = ok`, mesma contagem de linhas).

**Recomendação:** `backup()`, porque não trava o sistema. O `VACUUM INTO` fica para uma compactação ocasional, de madrugada.

A cópia **herda o modo WAL**. Abrir o backup para conferir criava `-wal` e `-shm` soltos **[testado]**, então o módulo converte o backup para `journal_mode=DELETE`, que gera um arquivo único e autocontido.

### 6.2 Módulo de backup com conferência e retenção **[testado]**

Teste: 1 backup real + 400 dias de backups simulados. A retenção manteve **30 arquivos** (14 diários + 8 semanais + 12 mensais, que se sobrepõem) e preservou o `antes-da-versao-1.2.0.db` criado pelo instalador. Nenhum `-wal` ou `-shm` sobrou.

```js
// backup.js - backup automático do SQLite em execução + retenção (Node 22.16+ / 24 / 26)
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, rename, rm, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';

const PREFIXO = 'certcal-';
const carimbo = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Faz uma cópia consistente do banco SEM parar o sistema.
 * - sqlite.backup() roda em etapas assíncronas: não trava o event loop
 *   (VACUUM INTO, por ser síncrono no DatabaseSync, travou ~300 ms num banco de 114 MB).
 * - grava primeiro num .tmp, confere a integridade e só então renomeia.
 */
export async function fazerBackup(db, pastaBackups, { copiaExtra } = {}) {
  await mkdir(pastaBackups, { recursive: true });
  const final = path.join(pastaBackups, `${PREFIXO}${carimbo()}.db`);
  const tmp = `${final}.tmp`;
  await backup(db, tmp, { rate: 200 });           // 200 páginas por etapa

  // A cópia herda o modo WAL do original; voltar para DELETE deixa o backup
  // como um arquivo único (sem .db-wal/.db-shm soltos) e confere a integridade.
  const teste = new DatabaseSync(tmp);
  try {
    teste.exec('PRAGMA journal_mode = DELETE');
    const r = teste.prepare('PRAGMA integrity_check').get();
    if (r.integrity_check !== 'ok') throw new Error(`backup corrompido: ${r.integrity_check}`);
  } finally { teste.close(); }

  await rename(tmp, final);
  if (copiaExtra) {                               // 2º disco / pendrive / pasta sincronizada
    await mkdir(copiaExtra, { recursive: true });
    await copyFile(final, path.join(copiaExtra, path.basename(final)));
  }
  return final;
}

/**
 * Retenção "avô-pai-filho": mantém os N backups mais recentes de cada dia (diários),
 * o último de cada semana (semanais) e o último de cada mês (mensais).
 */
export async function aplicarRetencao(pastaBackups, { diarios = 14, semanais = 8, mensais = 12 } = {}) {
  const arquivos = (await readdir(pastaBackups))
    .filter((f) => f.startsWith(PREFIXO) && f.endsWith('.db'))
    .sort().reverse();                            // nome tem data => ordem cronológica (mais novo primeiro)
  const manter = new Set();
  const dias = new Set(), semanas = new Set(), meses = new Set();
  for (const f of arquivos) {
    const [, a, m, d] = /(\d{4})-(\d{2})-(\d{2})_/.exec(f);
    const data = new Date(+a, +m - 1, +d);
    const dia = `${a}-${m}-${d}`;
    const segunda = new Date(data); segunda.setDate(data.getDate() - ((data.getDay() + 6) % 7));
    const semana = `${segunda.getFullYear()}-${segunda.getMonth() + 1}-${segunda.getDate()}`;
    const mes = `${a}-${m}`;
    if (!dias.has(dia) && dias.size < diarios) { dias.add(dia); manter.add(f); }
    if (!semanas.has(semana) && semanas.size < semanais) { semanas.add(semana); manter.add(f); }
    if (!meses.has(mes) && meses.size < mensais) { meses.add(mes); manter.add(f); }
  }
  // backups manuais / pré-atualização (outro prefixo) nunca são apagados aqui
  const apagar = arquivos.filter((f) => !manter.has(f));
  for (const f of apagar) await rm(path.join(pastaBackups, f), { force: true });
  return { mantidos: manter.size, apagados: apagar.length };
}

/** Agenda: um backup por dia no horário escolhido + um ao iniciar se o último tiver mais de 24 h. */
export function agendarBackups(db, pastaBackups, { hora = 2, minuto = 30, log = console } = {}) {
  const executar = async () => {
    try {
      const arq = await fazerBackup(db, pastaBackups);
      const ret = await aplicarRetencao(pastaBackups);
      log.info?.({ arq, ...ret }, 'backup concluído');
    } catch (e) { log.error?.(e, 'falha no backup'); }
  };
  const agendarProximo = () => {
    const agora = new Date(), alvo = new Date(agora);
    alvo.setHours(hora, minuto, 0, 0);
    if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
    setTimeout(async () => { await executar(); agendarProximo(); }, alvo - agora).unref();
  };
  (async () => {                                   // servidor pode ter ficado desligado de madrugada
    const ultimos = (await readdir(pastaBackups).catch(() => [])).filter((f) => f.startsWith(PREFIXO)).sort();
    const ultimo = ultimos.at(-1);
    const idade = ultimo ? Date.now() - (await stat(path.join(pastaBackups, ultimo))).mtimeMs : Infinity;
    if (idade > 24 * 3600_000) await executar();
  })();
  agendarProximo();
}
```

Uso no `index.mjs`:

```js
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { agendarBackups } from './backup.js';
const DADOS = process.env.CERTCAL_DADOS;            // C:\ProgramData\CertCal (definido no XML do WinSW)
const db = new DatabaseSync(path.join(DADOS, 'db', 'certcal.db'), { timeout: 5000 });
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
agendarBackups(db, path.join(DADOS, 'backups'), { hora: 2, minuto: 30, log: app.log });
```

### 6.3 Boas práticas

- **Regra 3-2-1:** a pasta `backups` fica no mesmo disco do banco e **não basta**. Configure `copiaExtra` para um segundo disco ou para uma pasta sincronizada (OneDrive/Google Drive). Também pode-se agendar uma cópia para o NAS, lembrando que o LocalService não acessa a rede: use NetworkService ou uma conta dedicada.
- **Antes de migrações de schema** (versão nova do sistema), o instalador já copia o banco com o serviço parado. A aplicação deve fazer outro `backup()` antes de aplicar as migrações (`PRAGMA user_version`).
- **Restauração:**
  1. parar o serviço (`net stop CertCal`);
  2. renomear o `certcal.db` atual (e apagar `-wal`/`-shm`);
  3. copiar o backup escolhido como `certcal.db`;
  4. iniciar o serviço (`net start CertCal`).

  Vale ter na tela de administração uma opção "Baixar backup agora", que chama `fazerBackup` e devolve o arquivo.
- **Monitorar:** mostre a data do último backup no painel do administrador e um alerta se ele tiver mais de 48 h.
- Os backups contêm dados de clientes, então a pasta tem a mesma ACL restrita do banco.

---

## 7. Checklist de implementação

1. [ ] Servidor lê `PORT`, `HOST` e `CERTCAL_DADOS` do ambiente, trata `SIGINT` e usa `DatabaseSync` (funciona no 22, no 24 e no 26; no 26.11+ `Database` é o nome novo).
2. [ ] `instalador/certcal.nsi` + `montar-payload.sh` + workflow com `debian:testing` (NSIS 3.12).
3. [ ] Testar numa VM Windows Server 2019 e 2022: instalação, porta ocupada, atualização por cima com dados, desinstalação mantendo e apagando dados, `/S`, acesso de outro PC da mesma sub-rede **e** de outra VLAN.
4. [ ] pdfmake com Inter estática, `setUrlAccessPolicy(() => false)` e PDF/A-2b validado no veraPDF.
5. [ ] Consulta de CNPJ e CEP com fallback e cache no SQLite. Validação de CNPJ alfanumérico no back e no front.
6. [ ] Camadas de rede, cookies, scrypt, bloqueio de tentativas e helmet sem `upgrade-insecure-requests`.
7. [ ] Backup diário com `backup()`, retenção, cópia extra e alerta de backup atrasado.

---

## 8. Fontes

**Instalador e serviço**

- NSIS 3.12 (19/04/2026) — https://nsis.sourceforge.io/ ; changelog — https://nsis.sourceforge.io/Docs/AppendixF.html
- NSIS CVE-2026-42171 / CVE-2025-43715 — https://security-tracker.debian.org/tracker/source-package/nsis
- Pacotes Debian do NSIS — https://sources.debian.org/api/src/nsis/ ; https://deb.debian.org/debian/pool/main/n/nsis/
- Inno Setup: downloads e versões — https://jrsoftware.org/isdl.php ; licença comercial — https://jrsoftware.org/isorder.php
- WiX: Open Source Maintenance Fee — https://docs.firegiant.com/wix/osmf/ ; WiX v6 — https://www.firegiant.com/blog/2025/4/7/wix-v600-available/
- New-NetFirewallRule (palavras-chave de `-RemoteAddress` e `-Profile`) — https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule
- netsh advfirewall — https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/netsh-advfirewall-firewall-control-firewall-behavior
- Node.js: releases (`index.json`, SHASUMS) — https://nodejs.org/dist/ ; calendário — https://github.com/nodejs/Release/blob/main/schedule.json
- WinSW: repositório (MIT) e releases — https://github.com/winsw/winsw ; https://github.com/winsw/winsw/releases/tag/v2.12.0
- WinSW: configuração XML — https://github.com/winsw/winsw/blob/v2/doc/xmlConfigFile.md ; logs — https://github.com/winsw/winsw/blob/v2/doc/loggingAndErrorReporting.md
- NSSM — https://nssm.cc/download ; abuso por malware — https://thedfirreport.com/2020/04/20/sqlserver-or-the-miner-in-the-basement
- node-windows — https://www.npmjs.com/package/node-windows ; shawl — https://github.com/mtkennerly/shawl
- Node SEA — https://nodejs.org/api/single-executable-applications.html
- node:sqlite (`backup()`, `Database`/`DatabaseSync`, estabilidade) — https://nodejs.org/api/sqlite.html ; DEP0210 — https://nodejs.org/api/deprecations.html

**PDF**

- pdfmake: changelog (0.3.0 em 01/01/2026; CVE-2026-26801 na 0.3.6; `setLocalAccessPolicy` na 0.3.8) — https://cdn.jsdelivr.net/npm/pdfmake@0.3.10/CHANGELOG.md ; docs — https://pdfmake.github.io/docs/0.3/
- pdfkit: changelog — https://github.com/foliojs/pdfkit/blob/master/CHANGELOG.md
- react-pdf (`fixed`, `render`) — https://react-pdf.org/advanced
- Fonte Inter v4.1 — https://github.com/rsms/inter/releases/tag/v4.1
- Chrome 131: margin boxes em `@page` — https://developer.chrome.com/blog/print-margins
- Edge no Windows Server 2019 — https://learn.microsoft.com/en-us/answers/questions/385897/install-edge-on-server-2019-when-is-ie11-end-of-li ; https://repost.aws/questions/QULd05yWoQRaO2umLk4764lg/windows-2019-amis-packaged-with-edge
- Windows Server 2025 (Edge fixado no Iniciar) — https://learn.microsoft.com/en-us/windows-server/get-started/whats-new-windows-server-2025

**APIs**

- OpenCNPJ (limites na aba "Limites") — https://opencnpj.org/
- CNPJá: termos (5 consultas/min sem login) — https://cnpja.com/subscription/tos
- CNPJ.ws: limitações da API pública — https://docs.cnpj.ws/referencia-de-api/api-publica/limitacoes
- ReceitaWS — https://developers.receitaws.com.br/
- Minha Receita: limites e privacidade — https://docs.minhareceita.org/ ; https://codeberg.org/cuducos/minha-receita (`docs/servidor/passo-a-passo.md`, "Questões de privacidade")
- BrasilAPI (CNPJ via Minha Receita) — https://brasilapi.com.br/docs ; https://github.com/BrasilAPI/BrasilAPI
- ViaCEP — https://viacep.com.br/ ; OpenCEP — https://opencep.com/ ; AwesomeAPI — https://docs.awesomeapi.com.br/
- CNPJ alfanumérico, perguntas e respostas da Receita (regra do DV, máscara, exemplo 12.ABC.345/01DE-35) — https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf
- Implantação em 31/07/2026 — https://agenciagov.ebc.com.br/noticias/202607/implantacao-do-cnpj-alfanumerico-ocorrera-a-partir-de-31-de-julho ; primeiro CNPJ emitido — https://fenacon.org.br/noticias/primeiro-cnpj-alfanumerico-e-emitido-pela-receita-federal/

**Segurança**

- OWASP Password Storage Cheat Sheet (parâmetros do scrypt) — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Node crypto (`scrypt`, `argon2` no v24.7+) — https://nodejs.org/api/crypto.html
- helmet (`upgrade-insecure-requests` por padrão) — https://github.com/helmetjs/helmet
- Chrome "HTTPS by default" (Chrome 154, sites privados excluídos) — https://blog.google/security/https-by-defau/ (originalmente https://security.googleblog.com/2025/10/https-by-default.html)
- New-SelfSignedCertificate (`-Signer`, SAN com IPAddress) — https://learn.microsoft.com/en-us/powershell/module/pki/new-selfsignedcertificate
- Firefox e CAs do sistema operacional — https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox
