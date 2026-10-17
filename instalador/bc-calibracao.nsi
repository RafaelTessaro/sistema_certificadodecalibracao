; =============================================================================
;  bc-calibracao.nsi - Instalador único (setup.exe) do BC Calibração, o sistema
;  de certificados de calibração de balanças da Balanças.com.
;
;  O mesmo setup serve para os dois papéis de um computador (o instalador
;  pergunta na primeira tela, numa instalação nova):
;    - Servidor: o sistema, o banco e o serviço do Windows, em UM computador;
;    - Estação: os outros computadores. Só o programa "BC Calibracao.exe"
;      (estacao\lancador.nsi), que acha o servidor na rede e abre o sistema
;      numa janela própria do Edge, sem digitar endereço (ver estacao\estacao.nsh).
;
;  Não rode o makensis à mão: use scripts/empacotar-windows.sh, que monta o
;  payload (programa + Node portátil + WinSW + programa da estação) e chama:
;
;    makensis -WX -DVERSAO=1.2.0 -DVERSAO_NUM=1.2.0.0 -DPAYLOAD=<pasta> -DSAIDA=<setup.exe> instalador/bc-calibracao.nsi
;
;  Gere o setup de produção com o NSIS 3.12 ou mais novo: as versões antigas
;  (a 3.09 do Ubuntu, por exemplo) têm falhas de elevação de privilégio
;  (CVE-2025-43715, CVE-2026-42171).
;
;  Payload esperado em ${PAYLOAD} (mesma estrutura da pasta instalada):
;    server\ shared\ dist\ node_modules\ package.json package-lock.json
;    .env.exemplo pacote.json bc-calibracao.ico
;    node\node.exe, node\LICENSE           <- só o node.exe do zip oficial win-x64
;    servico\WinSW.NET461.exe, servico\LICENSE-WinSW.txt
;    ferramentas\ (redefinir-senha.bat/.ps1, auxiliar-instalador.ps1, copiar-banco-antes.mjs)
;    estacao\BC Calibracao.exe, estacao\descobrir-servidor.ps1   <- só para as estações
;
;  O que o setup faz no SERVIDOR:
;    1. instala o programa em C:\Program Files\BC Calibracao (sem cedilha nem
;       til no caminho, para não haver problema de codificação em nenhum lugar);
;    2. guarda os dados em C:\ProgramData\BC Calibracao\dados (banco, backups,
;       certificados em PDF, email.json) e os registros em ...\logs. Só SYSTEM,
;       Administradores e a conta do serviço têm acesso a essa pasta;
;    3. registra o serviço do Windows "BC Calibração" (WinSW), com início
;       automático e reinício em caso de falha, rodando como LocalService;
;    4. cria a regra do Firewall liberando a porta só para a rede local
;       (localsubnet + as redes extras informadas), perfis Privado e Domínio;
;    5. cria os atalhos (para todos os usuários): o sistema na Área de
;       Trabalho e no Menu Iniciar, "Redefinir senha do BC Calibração" e
;       "Pasta dos certificados e backups";
;    6. atualiza por cima: para o serviço, copia o banco para
;       dados\backups\antes-da-versao-X.db, troca o programa sem tocar nos
;       dados, reinstala e inicia o serviço, mantendo a porta escolhida antes;
;    7. gera o desinstalador, que pergunta se os dados também devem ser
;       apagados (o padrão é NÃO, com dupla confirmação).
;
;  O que o setup faz numa ESTAÇÃO (nada de Node, serviço, Firewall ou dados):
;    1. procura o servidor na rede (descobrir-servidor.ps1) e mostra a página
;       "Servidor do BC Calibração" com o que achou; dá para escolher outro ou
;       digitar o nome ou o IP. Guarda em HKLM\SOFTWARE\BC Calibracao Estacao;
;    2. instala em C:\Program Files\BC Calibracao Estacao o BC Calibracao.exe,
;       o descobrir-servidor.ps1 e o ícone;
;    3. cria os atalhos "BC Calibração" (Área de Trabalho e Menu Iniciar) e
;       "Procurar o servidor do BC Calibração" (Menu Iniciar), e o desinstalador
;       próprio ("BC Calibração (estação)" em Aplicativos instalados).
;  Num computador que já é o servidor, a estação é recusada; numa estação, o
;  setup só atualiza a estação. Numa instalação nova, se já houver um servidor
;  na rede, sugere Estação; escolher Servidor sempre pede confirmação, porque
;  a procura não vê um servidor desligado, em outra porta ou em outra rede.
;
;  Linha de comando (também para instalação silenciosa, /S):
;    BC-Calibracao-Setup-1.2.0.exe /S /PORTA=4850 /REDES=192.168.20.0/24,10.10.0.0/16
;      /PORTA=  porta TCP (1 a 65535; padrão 4850, ou a já instalada)
;      /REDES=  redes extras com acesso, além da rede local do servidor
;               (IPv4, sub-rede /8 a /32, faixa a.b.c.d-e.f.g.h ou IPv6).
;               Não precisa de aspas: o valor vai até o próximo " /"
;      /CONTA=LocalSystem  roda o serviço como LocalSystem em vez de
;               LocalService (só se algo não funcionar com LocalService)
;    BC-Calibracao-Setup-1.2.0.exe /S /ESTACAO [/SERVIDOR=SERVIDOR:4850] [/SEMVARREDURA]
;      /ESTACAO     instala como estação (sem ele, /S instala o servidor,
;                   a não ser que este computador já seja uma estação)
;      /SERVIDOR=   nome ou IP do servidor, com :porta se não for a 4850
;                   (implica /ESTACAO). Sem ele, o setup procura na rede
;      /SEMVARREDURA  a estação não varre a rede atrás do servidor (só nome
;                   e endereços conhecidos), para redes com alerta de varredura
;    Desinstalar.exe /S                mantém os dados
;    Desinstalar.exe /S /REMOVERDADOS  apaga também os dados
;  Código de saída: 0 = ok; 1 = cancelado pelo usuário; 2 = interrompido
;  (porta ou redes inválidas, porta ocupada no modo silencioso, versão mais
;  nova já instalada, cópia do banco falhou, estação pedida num computador que
;  é o servidor, /SERVIDOR inválido); 3 = instalado, mas o serviço não foi
;  registrado, não iniciou ou não respondeu.
;
;  Cuidados deste script (ninguém consegue testá-lo antes de rodar no Windows):
;    - o setup é um programa de 32 bits: as ferramentas do Windows (sc, net,
;      netsh, icacls, PowerShell) são chamadas pela pasta Sysnative, que dá as
;      versões de 64 bits, e o registro é lido/gravado com SetRegView 64;
;    - comandos de console sempre por nsExec (janela escondida, saída no
;      detalhamento e código de saída na pilha), nunca ExecWait; /OEM porque
;      as ferramentas do Windows escrevem na página de código do console;
;    - nada depende do idioma do Windows: estados de serviço e de porta são
;      lidos por código de saída (sc query -> 1060 = não existe) ou pelo
;      auxiliar em PowerShell (o netstat em português escreve "ESCUTANDO");
;    - todo caminho entre aspas (C:\Program Files tem espaço);
;    - toda MessageBox tem /SD, para o modo silencioso nunca travar;
;    - o texto das redes digitado pelo usuário só chega ao netsh depois de
;      conferido pelo auxiliar, e chega a ele por variável de ambiente, não
;      pela linha de comando;
;    - cada string do NSIS tem no máximo 1024 caracteres (NSIS_MAX_STRLEN).
; =============================================================================

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma          ; melhor taxa para o node.exe (~90 MB)
SetCompressorDictSize 64
RequestExecutionLevel admin        ; serviço, firewall e ACL exigem administrador
AllowSkipFiles off                 ; erro ao gravar um arquivo: só Repetir ou Cancelar
ShowInstDetails show
ShowUninstDetails show

!ifndef VERSAO
  !define VERSAO "0.0.0"
!endif
!ifndef VERSAO_NUM                 ; X.Y.Z.W, exigido nas propriedades do .exe
  !define VERSAO_NUM "${VERSAO}.0"
!endif
!ifndef PAYLOAD
  !define PAYLOAD "..\pacotes\payload"
!endif
!ifndef SAIDA
  !define SAIDA "..\pacotes\BC-Calibracao-Setup-${VERSAO}.exe"
!endif

!define APP_NOME      "BC Calibração"
!define APP_PASTA     "BC Calibracao"           ; pastas e chave do registro: só ASCII
!define EMPRESA       "Balanças.com"
!define SERVICO       "BCCalibracao"            ; id do serviço (sc query BCCalibracao)
!define PORTA_PADRAO  "4850"
!define REGRA_FW      "BC Calibracao (rede local)"
!define ARQ_BANCO     "bc-calibracao.db"
!define CHAVE_APP     "Software\BC Calibracao"
!define CHAVE_DESINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\BCCalibracao"
; Estação: programa (atalhos) e desinstalador próprios. A configuração fica em EST_CHAVE (estacao.nsh)
!define PASTA_ESTACAO "BC Calibracao Estacao"
!define LANCADOR_EXE  "BC Calibracao.exe"
!define CHAVE_DESINST_ESTACAO "Software\Microsoft\Windows\CurrentVersion\Uninstall\BCCalibracaoEstacao"
; Ferramentas de 64 bits do Windows, vistas por um programa de 32 bits
!define SYS           "$WINDIR\Sysnative"
!define POWERSHELL    "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

Name "${APP_NOME}"
OutFile "${SAIDA}"
InstallDir "$PROGRAMFILES64\${APP_PASTA}"
BrandingText "${APP_NOME} ${VERSAO}"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"            ; GetParameters, GetOptions, GetSize, GetTime
!include "WordFunc.nsh"            ; VersionCompare
!include "x64.nsh"                 ; RunningX64
!include "WinVer.nsh"              ; AtLeastBuild
!include "nsDialogs.nsh"
!include "Sections.nsh"            ; SelectSection / UnselectSection (servidor ou estação)

Var PORTA             ; porta TCP do sistema
Var PORTA_ANT         ; porta da instalação anterior (atualização)
Var REDES             ; redes extras do firewall, já conferidas (ex.: 192.168.20.0/24,10.0.0.0/8)
Var CONTA             ; conta do serviço: LocalService (padrão) ou LocalSystem
Var DADOS_RAIZ        ; C:\ProgramData\BC Calibracao (a ACL é aplicada aqui)
Var DADOS             ; ...\dados = PASTA_DADOS do servidor
Var LOGS              ; ...\logs (registros do WinSW e do Node)
Var ATUALIZANDO       ; 1 = já existe uma instalação
Var VERSAO_ANT        ; versão instalada antes
Var NOMEPC            ; nome do computador, para o endereço na rede
Var AUXILIAR          ; caminho do auxiliar-instalador.ps1
Var RESULTADO         ; resposta das funções de conferência
Var SERVICO_EXISTIA   ; 1 = havia um serviço BCCalibracao registrado
Var COPIA_BANCO       ; arquivo da cópia feita antes da atualização ("" = nenhuma)
Var ERRO_SERVICO      ; 1 = o serviço não foi registrado ou não iniciou
Var AVISOS            ; avisos para a página final
Var TEXTO_BOAS_VINDAS
Var TEXTO_FINAL
Var APAGAR_DADOS      ; desinstalador: 1 = apagar a pasta de dados
Var hPorta            ; controles da página de configuração
Var hRedes
Var hEndereco
Var MODO              ; servidor | estacao | "" (ainda não escolhido: página "Tipo de instalação")
Var MODO_FIXO         ; 1 = o modo veio do que já está instalado ou da linha de comando
Var ESTACAO_INSTALADA ; 1 = este computador já é uma estação
Var SERVIDOR_INFORMADO ; /SERVIDOR= da linha de comando
Var SERVIDOR_CONFERIDO ; estação: 1 = o servidor escolhido respondeu
Var EST_PROCURADO     ; 1 = a procura do servidor na rede já foi feita
Var TEXTO_DESINST     ; texto da página de confirmação do desinstalador
Var hTipoServidor     ; controles da página "Tipo de instalação"
Var hTipoEstacao

; ------------------------------------------------------------------ Interface
!define MUI_ICON   "${PAYLOAD}\bc-calibracao.ico"
!define MUI_UNICON "${PAYLOAD}\bc-calibracao.ico"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Cancelar a instalação do ${APP_NOME}?"

!define MUI_WELCOMEPAGE_TITLE "Instalação do ${APP_NOME}"
!define MUI_WELCOMEPAGE_TEXT "$TEXTO_BOAS_VINDAS"
!insertmacro MUI_PAGE_WELCOME
Page custom PaginaTipoCriar PaginaTipoSair          ; servidor ou estação (só numa instalação nova)
Page custom PaginaConfigCriar PaginaConfigSair      ; servidor: porta e redes extras
Page custom PaginaEstacaoCriar PaginaEstacaoSair    ; estação: qual é o servidor
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Instalação concluída"
!define MUI_FINISHPAGE_TEXT "$TEXTO_FINAL"
!define MUI_FINISHPAGE_TEXT_LARGE
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${APP_NOME} no navegador agora"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirNavegador
!define MUI_FINISHPAGE_NOREBOOTSUPPORT
!define MUI_PAGE_CUSTOMFUNCTION_SHOW FinalAoMostrar
!insertmacro MUI_PAGE_FINISH

!define MUI_UNCONFIRMPAGE_TEXT_TOP "$TEXTO_DESINST"
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; Modo Estação: procura do servidor, página "Servidor do BC Calibração" e navegador (comum com o
; programa das estações, estacao\lancador.nsi)
!define EST_INSTALADOR
!include "estacao\estacao.nsh"

; Arquivos usados no .onInit e nas páginas vêm primeiro no bloco de dados (compressão sólida)
ReserveFile "${PAYLOAD}\ferramentas\auxiliar-instalador.ps1"
ReserveFile "${PAYLOAD}\ferramentas\copiar-banco-antes.mjs"
ReserveFile "${PAYLOAD}\estacao\descobrir-servidor.ps1"
ReserveFile /plugin nsDialogs.dll
ReserveFile /plugin nsExec.dll
ReserveFile /plugin System.dll
ReserveFile /plugin UserInfo.dll
ReserveFile /plugin Banner.dll
ReserveFile /plugin NSISdl.dll

; Propriedades do .exe (aba "Detalhes" do Windows)
VIProductVersion "${VERSAO_NUM}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName"     "${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "CompanyName"     "${EMPRESA}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "Instalador do ${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion"     "${VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductVersion"  "${VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright"  "© ${EMPRESA}"

; ------------------------------------------------------------------- Macros
; Roda o auxiliar-instalador.ps1 com os argumentos dados. Deixa o código de
; saída em $0 (0 = ok; 10 = achou o problema; outro = não deu para conferir) e
; a saída em $1. -InputFormat None: sem ele o PowerShell pode ficar esperando
; a entrada padrão quando roda pelo nsExec.
!macro AUXILIAR ARGUMENTOS
  nsExec::ExecToStack /OEM '"${POWERSHELL}" -NoProfile -NonInteractive -InputFormat None -ExecutionPolicy Bypass -File "$AUXILIAR" ${ARGUMENTOS}'
  Pop $0
  Pop $1
!macroend

; Atalho de internet (.url): abre o sistema no navegador padrão
!macro ATALHO_URL ARQUIVO
  Delete "${ARQUIVO}"
  WriteINIStr "${ARQUIVO}" "InternetShortcut" "URL" "http://localhost:$PORTA/"
  WriteINIStr "${ARQUIVO}" "InternetShortcut" "IconFile" "$INSTDIR\bc-calibracao.ico"
  WriteINIStr "${ARQUIVO}" "InternetShortcut" "IconIndex" "0"
!macroend

; Apaga os arquivos DO PROGRAMA (nunca a pasta de dados). O .env (configuração
; feita à mão, ex.: HOSTS_PERMITIDOS) e o desinstalador ficam.
!macro REMOVER_PROGRAMA
  RMDir /r "$INSTDIR\server"
  RMDir /r "$INSTDIR\shared"
  RMDir /r "$INSTDIR\dist"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\servico"
  RMDir /r "$INSTDIR\ferramentas"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\package-lock.json"
  Delete "$INSTDIR\.env.exemplo"
  Delete "$INSTDIR\pacote.json"
  Delete "$INSTDIR\bc-calibracao.ico"
!macroend

; Apaga os arquivos do programa da ESTAÇÃO (a pasta só tem estes)
!macro REMOVER_ESTACAO
  Delete "$INSTDIR\${LANCADOR_EXE}"
  Delete "$INSTDIR\descobrir-servidor.ps1"
  Delete "$INSTDIR\bc-calibracao.ico"
!macroend

; Espera o Windows apagar de fato o serviço (sc query devolve 1060 =
; ERROR_SERVICE_DOES_NOT_EXIST), até SEGUNDOS. Com a janela "Serviços" aberta,
; o serviço fica só "marcado para exclusão". Deixa em $0 o último código.
!macro ESPERAR_SERVICO_SUMIR SEGUNDOS
  StrCpy $2 0
  ${Do}
    nsExec::ExecToStack '"${SYS}\sc.exe" query ${SERVICO}'
    Pop $0
    Pop $1
    ${If} $0 == 1060
    ${OrIf} $0 == "error"
    ${OrIf} $2 >= ${SEGUNDOS}
      ${ExitDo}
    ${EndIf}
    IntOp $2 $2 + 1
    Sleep 1000
  ${Loop}
!macroend

; ============================================================ Inicialização
Function .onInit
  ; Um instalador de cada vez
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "BCCalibracaoInstalador") p .r1 ?e'
  Pop $0
  ${If} $0 = 183                    ; ERROR_ALREADY_EXISTS
    MessageBox MB_ICONEXCLAMATION "O instalador do ${APP_NOME} já está aberto." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}

  ; Windows 10 1607 / Windows Server 2016 (compilação 14393) ou mais novo: o Node 24 do servidor e o
  ; PowerShell 5.1 que as estações usam para achar o servidor
  ${IfNot} ${AtLeastBuild} 14393
    MessageBox MB_ICONSTOP "O ${APP_NOME} exige o Windows 10 (versão 1607 ou mais nova), o Windows 11 ou o Windows Server 2016 ou mais novo." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  ; Com o UAC desligado, um usuário comum chegaria aqui sem ser administrador
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "Admin"
    MessageBox MB_ICONSTOP "Rode o instalador com uma conta de administrador do Windows." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}

  SetRegView 64
  SetShellVarContext all            ; atalhos e $APPDATA para TODOS os usuários
  ; Pasta do programa fixa (ignora /D=): o serviço roda o código dela, então ela
  ; precisa ficar onde só administradores gravam (a da estação também é fixa: AplicarModo)
  StrCpy $INSTDIR "$PROGRAMFILES64\${APP_PASTA}"
  StrCpy $DADOS_RAIZ "$APPDATA\${APP_PASTA}"   ; $APPDATA = C:\ProgramData (contexto "all")
  StrCpy $DADOS "$DADOS_RAIZ\dados"
  StrCpy $LOGS "$DADOS_RAIZ\logs"
  ReadEnvStr $NOMEPC "COMPUTERNAME"
  StrCpy $ERRO_SERVICO 0
  StrCpy $SERVICO_EXISTIA 0
  StrCpy $COPIA_BANCO ""
  StrCpy $AVISOS ""
  StrCpy $SERVIDOR_CONFERIDO 0
  StrCpy $EST_PROCURADO 0
  StrCpy $EST_QTD 0

  InitPluginsDir
  File "/oname=$PLUGINSDIR\auxiliar-instalador.ps1" "${PAYLOAD}\ferramentas\auxiliar-instalador.ps1"
  File "/oname=$PLUGINSDIR\copiar-banco-antes.mjs" "${PAYLOAD}\ferramentas\copiar-banco-antes.mjs"
  File "/oname=$PLUGINSDIR\descobrir-servidor.ps1" "${PAYLOAD}\estacao\descobrir-servidor.ps1"
  StrCpy $AUXILIAR "$PLUGINSDIR\auxiliar-instalador.ps1"
  StrCpy $EST_SCRIPT "$PLUGINSDIR\descobrir-servidor.ps1"

  ; O que já está instalado: o servidor (atualização) ou uma estação
  StrCpy $ATUALIZANDO 0
  ReadRegStr $VERSAO_ANT HKLM "${CHAVE_DESINST}" "DisplayVersion"
  ReadRegStr $0 HKLM "${CHAVE_DESINST}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $ATUALIZANDO 1
  ${EndIf}
  StrCpy $ESTACAO_INSTALADA 0
  ReadRegStr $0 HKLM "${CHAVE_DESINST_ESTACAO}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $ESTACAO_INSTALADA 1
  ${EndIf}

  ; Configuração anterior do servidor (também fica guardada quando se desinstala mantendo os dados)
  ReadRegStr $PORTA HKLM "${CHAVE_APP}" "Porta"
  ${If} $PORTA == ""
    StrCpy $PORTA "${PORTA_PADRAO}"
  ${EndIf}
  StrCpy $PORTA_ANT $PORTA
  ReadRegStr $REDES HKLM "${CHAVE_APP}" "RedesExtras"
  ReadRegStr $CONTA HKLM "${CHAVE_APP}" "ContaServico"
  ; e a da estação (o servidor escolhido antes)
  Call EstLerConfig

  ; Linha de comando: /PORTA= /REDES= /CONTA= (servidor); /ESTACAO /SERVIDOR= /SEMVARREDURA (estação)
  ${GetParameters} $R8
  StrCpy $R9 "/PORTA="
  Call LerOpcao
  ${IfNot} ${Errors}
    StrCpy $PORTA $R7
  ${EndIf}
  StrCpy $R9 "/REDES="
  Call LerOpcao
  ${IfNot} ${Errors}
    StrCpy $REDES $R7
  ${EndIf}
  StrCpy $R9 "/CONTA="
  Call LerOpcao
  ${IfNot} ${Errors}
    StrCpy $CONTA $R7
  ${EndIf}
  ${If} $CONTA == "LocalSystem"     ; StrCmp não diferencia maiúsculas
    StrCpy $CONTA "LocalSystem"
  ${Else}
    StrCpy $CONTA "LocalService"
  ${EndIf}
  StrCpy $R6 0                      ; 1 = a linha de comando pede estação
  StrCpy $SERVIDOR_INFORMADO ""
  StrCpy $R9 "/SERVIDOR="
  Call LerOpcao
  ${IfNot} ${Errors}
    StrCpy $SERVIDOR_INFORMADO $R7
    StrCpy $R6 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R8 "/ESTACAO" $R7
  ${IfNot} ${Errors}
    StrCpy $R6 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R8 "/SEMVARREDURA" $R7
  ${IfNot} ${Errors}
    StrCpy $EST_SEM_VARREDURA 1
  ${EndIf}

  ; Servidor ou estação? O que já está instalado manda; depois a linha de comando; /S sozinho é o
  ; servidor, como sempre foi. Senão, a página "Tipo de instalação" pergunta.
  StrCpy $MODO ""
  ${If} $ATUALIZANDO == 1
    ${If} $R6 == 1
      MessageBox MB_ICONSTOP "Este computador é o servidor do ${APP_NOME}: o sistema e o banco de dados estão instalados nele, e ele não pode ser também uma estação.$\r$\n$\r$\nNeste computador, abra o sistema pelo atalho $\"${APP_NOME}$\" da Área de Trabalho." /SD IDOK
      SetErrorLevel 2
      Abort
    ${EndIf}
    StrCpy $MODO "servidor"
  ${ElseIf} $ESTACAO_INSTALADA == 1
  ${OrIf} $R6 == 1
    StrCpy $MODO "estacao"
  ${ElseIf} ${Silent}
    StrCpy $MODO "servidor"
  ${EndIf}
  StrCpy $MODO_FIXO 0
  ${If} $MODO != ""
    StrCpy $MODO_FIXO 1
  ${EndIf}

  ${If} $MODO == "servidor"
    Call PrepararServidor
    ${If} $RESULTADO != "ok"
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${ElseIf} $MODO == "estacao"
    Call PrepararEstacao
    ${If} $RESULTADO != "ok"
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${Else}
    StrCpy $TEXTO_BOAS_VINDAS "Este assistente instala o ${APP_NOME} ${VERSAO}.$\r$\n$\r$\nO sistema fica instalado em UM computador da empresa, o servidor. Os outros computadores, as estações, usam o sistema que está no servidor.$\r$\n$\r$\nNa próxima tela, escolha o que este computador vai ser.$\r$\n$\r$\nClique em Próximo para continuar."
  ${EndIf}
  Call AplicarModo
FunctionEnd

; Requisitos que só o servidor tem (o serviço e o Node). $RESULTADO = "ok" ou "parar" (já avisou).
Function ConferirRequisitosServidor
  StrCpy $RESULTADO "parar"
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "O servidor do ${APP_NOME} exige o Windows de 64 bits." /SD IDOK
    Return
  ${EndIf}
  ; O WinSW.NET461.exe precisa do .NET Framework 4.6.1 ou mais novo (Release >= 394254)
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} $0 < 394254
    MessageBox MB_ICONSTOP "O servidor do ${APP_NOME} precisa do .NET Framework 4.6.1 ou mais novo, que vem com o Windows atualizado. Instale o .NET Framework 4.8 pelo Windows Update e rode o instalador de novo." /SD IDOK
    Return
  ${EndIf}
  StrCpy $RESULTADO "ok"
FunctionEnd

; Servidor decidido no .onInit (atualização, ou /S): requisitos, versão, porta e redes da linha de
; comando. Numa instalação nova com janelas, a porta e as redes são conferidas na página de
; configuração. $RESULTADO = "ok" ou "parar" (já avisou).
Function PrepararServidor
  Call ConferirRequisitosServidor
  ${If} $RESULTADO != "ok"
    Return
  ${EndIf}
  StrCpy $RESULTADO "parar"
  ; Atualização: a versão instalada é mais nova?
  ${If} $ATUALIZANDO == 1
    ReadRegStr $1 HKLM "${CHAVE_APP}" "VersaoNumerica"
    ${If} $1 == ""
      StrCpy $1 $VERSAO_ANT
    ${EndIf}
    ${VersionCompare} "$1" "${VERSAO_NUM}" $2      ; 1 = a instalada é mais nova
    ${If} $2 == 1
      ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "A versão instalada ($VERSAO_ANT) é mais nova que esta (${VERSAO}). Voltar para a versão mais antiga pode não funcionar com o banco de dados atual.$\r$\n$\r$\nContinuar mesmo assim?" /SD IDNO IDYES`
        Return
      ${EndIf}
    ${EndIf}
  ${EndIf}

  Call ConferirPorta
  ${If} $RESULTADO != "ok"
    MessageBox MB_ICONSTOP "Porta inválida: $PORTA. Informe um número de 1 a 65535 (o padrão é ${PORTA_PADRAO})." /SD IDOK
    StrCpy $RESULTADO "parar"
    Return
  ${EndIf}
  Call ConferirRedes
  ${If} $RESULTADO != "ok"
    MessageBox MB_ICONSTOP "A rede $\"$RESULTADO$\" informada em /REDES não foi entendida. Use, por exemplo: 192.168.20.0/24,10.10.0.0/16" /SD IDOK
    StrCpy $RESULTADO "parar"
    Return
  ${EndIf}
  ; A página de configuração só aparece numa instalação nova e com janelas.
  ; Nos outros casos (/S, ou atualização com /PORTA=) a porta é conferida aqui.
  ; Numa atualização, a porta antiga está ocupada pelo próprio sistema: só
  ; confere se ela mudou. No modo silencioso, porta ocupada interrompe.
  ${If} ${Silent}
  ${OrIf} $ATUALIZANDO == 1
    ${If} $ATUALIZANDO == 0
    ${OrIf} $PORTA != $PORTA_ANT
      Call PortaEmUso
      ${If} $RESULTADO != ""
        ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "A porta $PORTA já está em uso pelo programa $\"$RESULTADO$\". Enquanto esse programa usar a porta, o ${APP_NOME} não vai abrir.$\r$\n$\r$\nUsar esta porta mesmo assim?" /SD IDNO IDYES`
          StrCpy $RESULTADO "parar"
          Return
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $ATUALIZANDO == 1
    StrCpy $TEXTO_BOAS_VINDAS "Este assistente atualiza o ${APP_NOME} da versão $VERSAO_ANT para a ${VERSAO}.$\r$\n$\r$\nO sistema fica fora do ar por alguns instantes. Antes de trocar o programa, o instalador faz uma cópia do banco de dados em:$\r$\n$DADOS\backups$\r$\n$\r$\nOs dados, a porta ($PORTA) e as configurações continuam como estão.$\r$\n$\r$\nPeça para quem estiver usando o sistema salvar o que está fazendo e clique em Próximo."
  ${Else}
    StrCpy $TEXTO_BOAS_VINDAS "Este assistente instala o ${APP_NOME} ${VERSAO} neste servidor.$\r$\n$\r$\nO sistema roda como serviço do Windows: inicia sozinho junto com o computador e é usado nos computadores da rede da empresa. Não é preciso instalar mais nada: o instalador já traz tudo.$\r$\n$\r$\nPrograma: $INSTDIR$\r$\nDados (banco, certificados e backups):$\r$\n$DADOS$\r$\n$\r$\nClique em Próximo para continuar."
  ${EndIf}
  StrCpy $RESULTADO "ok"
FunctionEnd

; Estação: confere o /SERVIDOR= e monta o texto de boas-vindas. $RESULTADO = "ok" ou "parar".
Function PrepararEstacao
  StrCpy $RESULTADO "ok"
  ${If} $SERVIDOR_INFORMADO != ""
    StrCpy $R0 $SERVIDOR_INFORMADO
    Call EstSeparar
    ${If} $EST_RESPOSTA != "ok"
      MessageBox MB_ICONSTOP "O servidor informado em /SERVIDOR não foi entendido: $SERVIDOR_INFORMADO$\r$\n$\r$\nUse o nome ou o IP do computador servidor, com a porta se ela não for a ${PORTA_PADRAO}. Por exemplo: /SERVIDOR=SERVIDOR ou /SERVIDOR=192.168.0.10:4851" /SD IDOK
      StrCpy $RESULTADO "parar"
      Return
    ${EndIf}
    StrCpy $EST_NOME ""             ; servidor escolhido por quem instala: vale o que responder nele,
    StrCpy $EST_ID ""               ; sem perguntar se é o mesmo de antes
    StrCpy $EST_IP ""
    StrCpy $EST_CONHECIDO_NOME ""
    StrCpy $EST_CONHECIDO_ID ""
  ${EndIf}
  ${If} $ESTACAO_INSTALADA == 1
    StrCpy $TEXTO_BOAS_VINDAS "Este computador já é uma estação do ${APP_NOME}. Este assistente atualiza o programa da estação para a versão ${VERSAO}.$\r$\n$\r$\nNa tela seguinte, confira o servidor (dá para trocar). O servidor escolhido aqui passa a valer para todos os usuários deste computador.$\r$\n$\r$\nPara fazer deste computador o servidor, desinstale antes a estação: Configurações > Aplicativos > ${APP_NOME} (estação).$\r$\n$\r$\nClique em Próximo para continuar."
  ${Else}
    StrCpy $TEXTO_BOAS_VINDAS "Este assistente instala o ${APP_NOME} nesta estação: um ícone na Área de Trabalho e no Menu Iniciar que abre o sistema do servidor numa janela própria, sem digitar endereço no navegador.$\r$\n$\r$\nO servidor é encontrado sozinho na rede. Neste computador não fica banco de dados nem serviço, e o Firewall não é alterado.$\r$\n$\r$\nClique em Próximo para continuar."
  ${EndIf}
FunctionEnd

; Lê "/NOME=valor" da linha de comando. Entrada: $R8 = parâmetros, $R9 =
; "/NOME=". Saída: $R7 = valor, sem espaços nem aspas nas pontas; flag de erro
; ligada se a opção não veio. O valor vai até o próximo " /" (espaço e barra)
; ou até o fim, então /REDES=192.168.20.0/24 funciona sem aspas (o GetOptions
; do NSIS cortaria o valor no "/24").
Function LerOpcao
  Push $0
  Push $1
  Push $2
  Push $3
  ClearErrors
  StrCpy $R7 ""
  StrLen $0 $R9
  StrLen $1 $R8
  StrCpy $2 0
  StrCpy $3 ""
  ${DoWhile} $2 < $1
    StrCpy $3 $R8 $0 $2
    ${If} $3 == $R9                 ; StrCmp: sem diferenciar maiúsculas
      ${ExitDo}
    ${EndIf}
    IntOp $2 $2 + 1
  ${Loop}
  ${If} $2 >= $1
    SetErrors                       ; opção ausente
  ${Else}
    IntOp $2 $2 + $0
    StrCpy $R7 $R8 "" $2            ; tudo depois de "/NOME="
    StrLen $1 $R7
    StrCpy $2 0
    ${DoWhile} $2 < $1
      StrCpy $3 $R7 2 $2
      ${If} $3 == " /"
        StrCpy $R7 $R7 $2
        ${ExitDo}
      ${EndIf}
      IntOp $2 $2 + 1
    ${Loop}
    ${Do}
      StrCpy $3 $R7 1
      ${If} $3 == " "
      ${OrIf} $3 == '"'
        StrCpy $R7 $R7 "" 1
      ${Else}
        ${ExitDo}
      ${EndIf}
    ${Loop}
    ${Do}
      StrCpy $3 $R7 1 -1
      ${If} $3 == " "
      ${OrIf} $3 == '"'
        StrCpy $R7 $R7 -1
      ${Else}
        ${ExitDo}
      ${EndIf}
    ${Loop}
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; Confere $PORTA: só dígitos, de 1 a 65535. Tira zeros à esquerda (o NSIS
; leria "04850" como octal). $RESULTADO = "ok" ou "invalida".
Function ConferirPorta
  StrCpy $RESULTADO "invalida"
  ${Do}
    StrCpy $R9 $PORTA 1
    StrLen $R8 $PORTA
    ${If} $R9 != "0"
    ${OrIf} $R8 <= 1
      ${ExitDo}
    ${EndIf}
    StrCpy $PORTA $PORTA "" 1
  ${Loop}
  ; Ida e volta pelo número: "48a0", " 80", "+80" e "0x50" não voltam iguais
  IntOp $R9 $PORTA + 0
  ${If} $R9 == $PORTA
  ${AndIf} $R9 >= 1
  ${AndIf} $R9 <= 65535
    StrCpy $RESULTADO "ok"
  ${EndIf}
FunctionEnd

; Confere e normaliza $REDES pelo auxiliar (o texto vai pela variável de
; ambiente BC_REDES, nunca pela linha de comando). $RESULTADO = "ok" ou a
; primeira rede que não serve. Se o PowerShell não rodar, as redes extras são
; deixadas de lado (fica só a rede local) e isso vira um aviso.
Function ConferirRedes
  StrCpy $RESULTADO "ok"
  ${If} $REDES == ""
    Return
  ${EndIf}
  StrCpy $R9 $REDES
  System::Call 'kernel32::SetEnvironmentVariable(t "BC_REDES", t r19)'
  !insertmacro AUXILIAR '-Acao Redes'
  ${If} $0 == 0
    StrCpy $REDES $1
  ${ElseIf} $0 == 10
    StrCpy $RESULTADO $1
  ${Else}
    DetailPrint "Não foi possível conferir as redes extras ($REDES): só a rede local terá acesso."
    StrCpy $AVISOS "$AVISOS$\r$\n- As redes extras ($REDES) não puderam ser conferidas e ficaram de fora do Firewall."
    StrCpy $REDES ""
  ${EndIf}
FunctionEnd

; $RESULTADO = nome do programa que já escuta em $PORTA, ou "" (livre ou não
; deu para conferir).
Function PortaEmUso
  StrCpy $RESULTADO ""
  !insertmacro AUXILIAR '-Acao PortaEmUso -Porta $PORTA'
  ${If} $0 == 10
    StrCpy $RESULTADO $1
    ${If} $RESULTADO == ""
      StrCpy $RESULTADO "desconhecido"
    ${EndIf}
  ${EndIf}
FunctionEnd

; ------------------------------------------- Página: servidor ou estação
; Só numa instalação nova, com janelas e sem /ESTACAO ou /SERVIDOR=. Antes de mostrar, procura um
; servidor na rede: se já houver um, a página sugere Estação (evita dois servidores sem querer). A
; procura não vê tudo (servidor desligado, em outra porta ou em outra rede; PowerShell bloqueado), então
; escolher Servidor sempre pede confirmação.
Function PaginaTipoCriar
  ${If} $MODO_FIXO == 1
    Abort
  ${EndIf}
  ${If} $EST_PROCURADO != 1
    StrCpy $EST_PROCURADO 1
    Call EstProcurarComAviso
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Tipo de instalação" "O que este computador vai ser no ${APP_NOME}?"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateRadioButton} 0 0 100% 12u "&Servidor: o computador onde o sistema fica instalado"
  Pop $hTipoServidor
  ${NSD_CreateLabel} 13u 13u -13u 28u "Instala o sistema, o banco de dados e o serviço do Windows. Escolha em UM só computador, o que fica sempre ligado: os certificados, os clientes e os backups ficam guardados nele."
  Pop $0
  ${NSD_CreateRadioButton} 0 45u 100% 12u "&Estação: cada um dos outros computadores da empresa"
  Pop $hTipoEstacao
  ${NSD_CreateLabel} 13u 58u -13u 28u "Instala só um ícone que abre o sistema do servidor numa janela própria, sem digitar endereço no navegador. O servidor é encontrado sozinho na rede."
  Pop $0
  ${NSD_CreateLabel} 0 92u 100% 48u ""
  Pop $1
  ${If} $EST_QTD > 0
    ReadINIStr $2 "${EST_RESULTADO}" "servidor1" "nome"
    ReadINIStr $3 "${EST_RESULTADO}" "servidor1" "ip"
    ${If} $2 == ""
      StrCpy $2 $3
    ${Else}
      StrCpy $2 "$2 ($3)"
    ${EndIf}
    ${NSD_SetText} $1 "Já existe um servidor do ${APP_NOME} nesta rede: $2. Então este computador deve ser uma estação."
    ${NSD_Check} $hTipoEstacao
  ${ElseIf} $EST_SITUACAO == "nenhum"
    ${NSD_SetText} $1 "Nenhum servidor do ${APP_NOME} respondeu nesta rede. Mas a procura não vê um servidor desligado, em outra porta (não a $EST_PORTA) ou em outra rede da empresa: se o sistema já está instalado em algum computador, escolha Estação. Se ainda não está, comece por este servidor e depois instale as estações."
  ${Else}
    ${NSD_SetText} $1 "Não foi possível procurar um servidor do ${APP_NOME} na rede a partir deste computador. Se o sistema já está instalado em algum computador da empresa, escolha Estação. Se ainda não está, comece por este servidor e depois instale as estações."
  ${EndIf}
  ${If} $MODO == "servidor"         ; voltou para esta página: mantém a escolha
    ${NSD_Uncheck} $hTipoEstacao
    ${NSD_Check} $hTipoServidor
  ${ElseIf} $MODO == "estacao"
    ${NSD_Uncheck} $hTipoServidor
    ${NSD_Check} $hTipoEstacao
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function PaginaTipoSair
  ${NSD_GetState} $hTipoServidor $0
  ${NSD_GetState} $hTipoEstacao $1
  ${If} $0 == ${BST_CHECKED}
    ${If} $EST_QTD > 0
      ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Já existe um servidor do ${APP_NOME} nesta rede. A empresa deve ter um servidor só: com dois, cada computador pode acabar gravando os certificados num lugar diferente.$\r$\n$\r$\nInstalar outro servidor mesmo assim? (Quase sempre a resposta certa é Não, e a opção certa é Estação.)" IDYES`
        Abort
      ${EndIf}
    ${Else}
      ; Nada achado não prova que não há servidor: confirma também (Não é o padrão)
      ${If} $EST_SITUACAO == "nenhum"
        StrCpy $2 "A procura não achou nenhum servidor do ${APP_NOME} nesta rede, mas ela não vê um servidor desligado, em outra porta ou em outra rede da empresa."
      ${Else}
        StrCpy $2 "Não foi possível procurar se já existe um servidor do ${APP_NOME} na rede."
      ${EndIf}
      ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$2$\r$\n$\r$\nA empresa deve ter um servidor só: com dois, cada computador pode acabar gravando os certificados num lugar diferente. Se o ${APP_NOME} já está instalado em outro computador da empresa, clique em Não e escolha Estação.$\r$\n$\r$\nInstalar o servidor neste computador?" IDYES`
        Abort
      ${EndIf}
    ${EndIf}
    Call ConferirRequisitosServidor
    ${If} $RESULTADO != "ok"
      Abort
    ${EndIf}
    StrCpy $MODO "servidor"
  ${ElseIf} $1 == ${BST_CHECKED}
    StrCpy $MODO "estacao"
    Call PrepararEstacao
  ${Else}
    MessageBox MB_ICONEXCLAMATION "Escolha Servidor ou Estação."
    Abort
  ${EndIf}
  Call AplicarModo
FunctionEnd

; ------------------------------------------- Página: porta e redes extras
Function PaginaConfigCriar
  ${If} $ATUALIZANDO == 1
  ${OrIf} $MODO != "servidor"
    Abort                           ; numa atualização, mantém a configuração anterior
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Acesso pela rede" "Porta do sistema e redes da empresa que podem acessá-lo."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 10u "Porta:"
  Pop $0
  ${NSD_CreateNumber} 0 11u 50u 13u "$PORTA"
  Pop $hPorta
  ${NSD_SetTextLimit} $hPorta 5
  ${NSD_CreateLabel} 58u 13u -58u 20u "O padrão é ${PORTA_PADRAO}. Só mude se outro programa já usar essa porta."
  Pop $0
  ${NSD_CreateLabel} 0 34u 100% 18u ""
  Pop $hEndereco
  Call AoMudarPorta                 ; preenche o endereço com a porta inicial
  ${NSD_OnChange} $hPorta AoMudarPortaEvento

  ${NSD_CreateLabel} 0 60u 100% 10u "Outras redes com acesso (opcional):"
  Pop $0
  ${NSD_CreateText} 0 71u 100% 13u "$REDES"
  Pop $hRedes
  ${NSD_SetTextLimit} $hRedes 400
  ${NSD_CreateLabel} 0 88u 100% 50u "Os computadores da mesma rede do servidor já têm acesso. Se a empresa tiver outras redes (outra VLAN, outro andar com roteador próprio, filial ligada por VPN), informe as faixas separadas por vírgula, por exemplo:  192.168.20.0/24, 10.10.0.0/16$\r$\nNa dúvida, deixe em branco."
  Pop $0
  nsDialogs::Show
FunctionEnd

; Mostra o endereço dos outros computadores com a porta digitada
Function AoMudarPorta
  ${NSD_GetText} $hPorta $R9
  ${NSD_SetText} $hEndereco "Nos outros computadores, o sistema vai abrir em http://$NOMEPC:$R9"
FunctionEnd

Function AoMudarPortaEvento
  Pop $R9                           ; o nsDialogs empurra o controle que mudou
  Call AoMudarPorta
FunctionEnd

Function PaginaConfigSair
  ${NSD_GetText} $hPorta $PORTA
  ${NSD_GetText} $hRedes $REDES
  Call ConferirPorta
  ${If} $RESULTADO != "ok"
    MessageBox MB_ICONEXCLAMATION "Porta inválida. Informe um número de 1 a 65535 (o padrão é ${PORTA_PADRAO})."
    Abort                           ; continua na página
  ${EndIf}
  Call ConferirRedes
  ${If} $RESULTADO != "ok"
    MessageBox MB_ICONEXCLAMATION "A rede $\"$RESULTADO$\" não foi entendida.$\r$\n$\r$\nUse um endereço (192.168.20.5), uma sub-rede (192.168.20.0/24, de /8 a /32) ou uma faixa (192.168.20.10-192.168.20.50), separados por vírgula."
    Abort
  ${EndIf}
  ${NSD_SetText} $hRedes $REDES
  Call PortaEmUso
  ${If} $RESULTADO != ""
    ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "A porta $PORTA já está em uso pelo programa $\"$RESULTADO$\". Enquanto esse programa usar a porta, o ${APP_NOME} não vai abrir.$\r$\n$\r$\nUsar esta porta mesmo assim?" IDYES`
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

; ------------------------------------------- Página: servidor da estação
; Procura o servidor na rede (só uma vez; "Procurar de novo" refaz) e mostra a página comum
; (estacao\estacao.nsh): lista do que achou, campo com o nome ou IP e o botão "Procurar de novo".
Function PaginaEstacaoCriar
  ${If} $MODO != "estacao"
    Abort
  ${EndIf}
  ${If} $EST_PROCURADO != 1
    StrCpy $EST_PROCURADO 1
    Call EstProcurarComAviso
  ${EndIf}
  Call EstPaginaCriar
  ${If} $EST_RESPOSTA == "erro"
    Abort
  ${EndIf}
  ${If} $SERVIDOR_INFORMADO != ""   ; /SERVIDOR= com janelas: é o que vem preenchido
    ${NSD_SetText} $hEstCampo $SERVIDOR_INFORMADO
  ${EndIf}
  nsDialogs::Show
FunctionEnd

; Testa o endereço escolhido. Servidor desligado agora não impede a instalação: o programa tenta
; de novo (e procura na rede) quando for aberto.
Function PaginaEstacaoSair
  StrCpy $SERVIDOR_CONFERIDO 0
  Call EstPaginaSair
  ${If} $EST_RESPOSTA == "ficar"
    Abort
  ${ElseIf} $EST_RESPOSTA == "vazio"
    ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "Instalar sem informar o servidor?$\r$\n$\r$\nO ${APP_NOME} procura o servidor na rede sozinho quando for aberto." IDYES`
      Abort
    ${EndIf}
    StrCpy $EST_URL ""
    StrCpy $EST_ENDERECO ""
    StrCpy $EST_PORTA "${EST_PORTA_PADRAO}"
    StrCpy $EST_NOME ""
    StrCpy $EST_ID ""
    StrCpy $EST_IP ""
  ${ElseIf} $EST_RESPOSTA != "ok"
    ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "O ${APP_NOME} não respondeu em $EST_URL.$\r$\n$\r$\nConfira o nome ou o IP e se o computador servidor está ligado. Se ele só estiver desligado agora, pode continuar: o programa tenta de novo (e procura na rede) quando for aberto.$\r$\n$\r$\nUsar este endereço mesmo assim?" IDYES`
      Abort
    ${EndIf}
  ${Else}
    StrCpy $SERVIDOR_CONFERIDO 1
  ${EndIf}
FunctionEnd

; ============================================================ Seção principal
Section "${APP_NOME}" SecPrincipal
  SectionIn RO
  SetShellVarContext all
  SetRegView 64

  ; 1) Para o serviço anterior, se existir. Fica "Desativado" até ser
  ;    reinstalado, para o Windows não reiniciá-lo no meio da troca.
  nsExec::ExecToStack '"${SYS}\sc.exe" query ${SERVICO}'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $SERVICO_EXISTIA 1
    DetailPrint "Parando o serviço ${APP_NOME}..."
    !insertmacro AUXILIAR '-Acao Parar -Servico ${SERVICO} -Pasta "$INSTDIR" -Desativar -Segundos 60'
    ${If} $0 == 10
      MessageBox MB_ICONSTOP "O serviço ${APP_NOME} não parou ($1). Reinicie o computador e rode o instalador de novo. Nada foi alterado." /SD IDOK
      Call ReativarServicoAntigo
      SetErrorLevel 2
      Abort "O serviço não parou. Nada foi alterado."
    ${ElseIf} $0 != 0
      ; PowerShell indisponível: para pelo sc/net, que esperam o serviço parar
      DetailPrint "Auxiliar indisponível ($0): parando pelo net stop."
      nsExec::ExecToLog /OEM '"${SYS}\sc.exe" config ${SERVICO} start= disabled'
      Pop $0
      nsExec::ExecToLog /OEM '"${SYS}\net.exe" stop ${SERVICO}'
      Pop $0
      Sleep 2000
    ${EndIf}
  ${EndIf}

  ; 2) Cópia de segurança do banco, com o serviço parado
  Call CopiarBancoAntes
  ${If} $RESULTADO == "cancelar"
    Call ReativarServicoAntigo
    SetErrorLevel 2
    Abort "Atualização cancelada: sem a cópia do banco, nada foi alterado."
  ${EndIf}

  ; 3) Remove o serviço antigo (é registrado de novo no passo 8, com a configuração atual)
  ${If} $SERVICO_EXISTIA == 1
    DetailPrint "Removendo o registro antigo do serviço..."
    Call RemoverServicoAntigo
  ${EndIf}

  ; 4) Remove a versão anterior DO PROGRAMA (nunca a pasta de dados)
  DetailPrint "Removendo os arquivos da versão anterior..."
  !insertmacro REMOVER_PROGRAMA

  ; 5) Copia os arquivos novos. Sempre "File /r pasta\*.*" com o SetOutPath da
  ;    pasta de destino: o makensis do Linux (3.09 e 3.12) trava com "File /r pasta"
  SetOutPath "$INSTDIR"
  File "${PAYLOAD}\package.json"
  File "${PAYLOAD}\package-lock.json"
  File "${PAYLOAD}\.env.exemplo"
  File "${PAYLOAD}\pacote.json"
  File "${PAYLOAD}\bc-calibracao.ico"
  SetOutPath "$INSTDIR\server"
  File /r "${PAYLOAD}\server\*.*"
  SetOutPath "$INSTDIR\shared"
  File /r "${PAYLOAD}\shared\*.*"
  SetOutPath "$INSTDIR\dist"
  File /r "${PAYLOAD}\dist\*.*"
  SetOutPath "$INSTDIR\ferramentas"
  File /r "${PAYLOAD}\ferramentas\*.*"
  SetOutPath "$INSTDIR\node_modules"
  File /r "${PAYLOAD}\node_modules\*.*"
  SetOutPath "$INSTDIR\node"
  File "${PAYLOAD}\node\node.exe"
  File "${PAYLOAD}\node\LICENSE"
  SetOutPath "$INSTDIR\servico"
  File "/oname=${SERVICO}.exe" "${PAYLOAD}\servico\WinSW.NET461.exe"
  File "${PAYLOAD}\servico\LICENSE-WinSW.txt"
  SetOutPath "$INSTDIR"
  StrCpy $AUXILIAR "$INSTDIR\ferramentas\auxiliar-instalador.ps1"

  ; 6) Pasta de dados (criada uma vez, preservada em atualizações) com ACL restrita
  CreateDirectory "$DADOS\backups"
  CreateDirectory "$DADOS\certificados"
  CreateDirectory "$LOGS"
  Call ProtegerPastaDados

  ; 7) Configuração do WinSW (porta, pastas e conta)
  Call EscreverXmlServico

  ; 8) Registra o serviço
  DetailPrint "Registrando o serviço ${APP_NOME} (conta $CONTA)..."
  nsExec::ExecToLog /OEM '"$INSTDIR\servico\${SERVICO}.exe" install'
  Pop $0
  ${If} $0 != 0
    StrCpy $ERRO_SERVICO 1
    StrCpy $AVISOS "$AVISOS$\r$\n- O serviço do Windows não foi registrado (código $0). Feche a janela Serviços, se estiver aberta, e rode o instalador de novo."
    MessageBox MB_ICONSTOP "Não foi possível registrar o serviço do Windows (código $0).$\r$\n$\r$\nFeche a janela $\"Serviços$\" (services.msc), se estiver aberta, e rode o instalador de novo. Os dados não foram alterados." /SD IDOK
  ${EndIf}

  ; 9) Firewall: só a rede local (e as redes extras), só para o node.exe desta instalação
  Call ConfigurarFirewall

  ; 10) Atalhos para todos os usuários
  Call CriarAtalhos

  ; 11) Desinstalador e "Programas e Recursos"
  Call GravarRegistro

  ; 12) Inicia o serviço e espera o sistema responder
  ${If} $ERRO_SERVICO == 0
    Call IniciarServico
  ${EndIf}

  ; 13) Texto da página final (endereços, primeiro acesso e avisos)
  Call MontarTextoFinal
  ${If} $ERRO_SERVICO == 1
    SetErrorLevel 3
  ${EndIf}
SectionEnd

; ============================================================ Seção da estação
; Só o programa que abre o sistema do servidor (BC Calibracao.exe), o script que acha o servidor e
; o ícone. Nada de Node, serviço, Firewall ou dados: a estação não abre nenhuma porta.
Section "-Estação" SecEstacao
  SetShellVarContext all
  SetRegView 64

  ; 1) Servidor: no modo silencioso, /SERVIDOR= ou a procura na rede (com janelas, foi a página)
  ${If} ${Silent}
    Call DefinirServidorSilencioso
  ${EndIf}

  ; 2) Programa
  DetailPrint "Instalando o programa da estação em $INSTDIR..."
  SetOutPath "$INSTDIR"
  File "${PAYLOAD}\estacao\${LANCADOR_EXE}"
  File "${PAYLOAD}\estacao\descobrir-servidor.ps1"
  File "${PAYLOAD}\bc-calibracao.ico"

  ; 3) Servidor para todos os usuários deste computador (HKLM). O programa guarda o que cada usuário
  ;    achou depois no HKCU dele, mas a Geracao nova gravada aqui faz todos voltarem a este servidor
  ;    (ver estacao\estacao.nsh): rodar o setup de novo, ou /S /SERVIDOR=, troca o de todo mundo
  Call EstGravarConfig
  ${If} $EST_SEM_VARREDURA == 1
    WriteRegStr HKLM "${EST_CHAVE}" "SemVarredura" "1"
  ${EndIf}

  ; 4) Atalhos para todos os usuários
  DetailPrint "Criando os atalhos..."
  Delete "$DESKTOP\${APP_NOME}.lnk"
  CreateShortCut "$DESKTOP\${APP_NOME}.lnk" "$INSTDIR\${LANCADOR_EXE}" "" "$INSTDIR\bc-calibracao.ico" 0 SW_SHOWNORMAL "" "Abre o ${APP_NOME} (certificados de calibração) numa janela própria"
  RMDir /r "$SMPROGRAMS\${APP_NOME}"
  CreateDirectory "$SMPROGRAMS\${APP_NOME}"
  CreateShortCut "$SMPROGRAMS\${APP_NOME}\${APP_NOME}.lnk" "$INSTDIR\${LANCADOR_EXE}" "" "$INSTDIR\bc-calibracao.ico" 0 SW_SHOWNORMAL "" "Abre o ${APP_NOME} (certificados de calibração) numa janela própria"
  CreateShortCut "$SMPROGRAMS\${APP_NOME}\Procurar o servidor do ${APP_NOME}.lnk" "$INSTDIR\${LANCADOR_EXE}" "/CONFIGURAR" "$INSTDIR\bc-calibracao.ico" 0 SW_SHOWNORMAL "" "Procura o servidor do ${APP_NOME} na rede ou permite digitar o nome ou o IP dele"

  ; 5) Desinstalador e "Aplicativos instalados"
  Call GravarRegistroEstacao

  ; 6) Texto da página final
  Call MontarTextoFinalEstacao
SectionEnd

; Servidor ou estação: escolhe a seção e a pasta (as duas fixas, ignorando /D=)
Function AplicarModo
  ${If} $MODO == "estacao"
    StrCpy $INSTDIR "$PROGRAMFILES64\${PASTA_ESTACAO}"
    !insertmacro UnselectSection ${SecPrincipal}
    !insertmacro SelectSection ${SecEstacao}
  ${Else}
    StrCpy $INSTDIR "$PROGRAMFILES64\${APP_PASTA}"
    !insertmacro SelectSection ${SecPrincipal}
    !insertmacro UnselectSection ${SecEstacao}
  ${EndIf}
FunctionEnd

; -------------------------------------------- Funções da instalação
; Instalação interrompida depois de parar o serviço antigo: volta a deixá-lo
; automático e inicia de novo (nada mais foi alterado).
Function ReativarServicoAntigo
  ${If} $SERVICO_EXISTIA == 1
    nsExec::ExecToLog /OEM '"${SYS}\sc.exe" config ${SERVICO} start= auto'
    Pop $0
    nsExec::ExecToLog /OEM '"${SYS}\net.exe" start ${SERVICO}'
    Pop $0
  ${EndIf}
FunctionEnd

; Copia o banco para dados\backups\antes-da-versao-X.db antes de trocar o
; programa. Primeiro com o node.exe ainda instalado e o copiar-banco-antes.mjs
; (node:sqlite, VACUUM INTO e conferência); se não der, copia os arquivos .db,
; -wal e -shm como estão (com o serviço parado, eles formam um conjunto
; consistente: abrir a cópia no SQLite aplica o -wal). $RESULTADO = "ok" ou
; "cancelar" (sem cópia e o usuário preferiu não continuar).
Function CopiarBancoAntes
  StrCpy $RESULTADO "ok"
  ${IfNot} ${FileExists} "$DADOS\${ARQ_BANCO}"
    Return                          ; instalação nova: ainda não há banco
  ${EndIf}
  CreateDirectory "$DADOS\backups"
  StrCpy $R0 "$DADOS\backups\antes-da-versao-${VERSAO}"
  ${If} ${FileExists} "$R0.db"      ; mesma versão instalada de novo: não sobrescreve
    ${GetTime} "" "L" $1 $2 $3 $4 $5 $6 $7
    StrCpy $R0 "$R0-em-$3-$2-$1-$5$6$7"
  ${EndIf}
  StrCpy $R0 "$R0.db"

  ${If} ${FileExists} "$INSTDIR\node\node.exe"
    DetailPrint "Copiando o banco de dados (SQLite) para $R0..."
    nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$PLUGINSDIR\copiar-banco-antes.mjs" "$DADOS\${ARQ_BANCO}" "$R0"'
    Pop $0
    ${If} $0 == 0
      StrCpy $COPIA_BANCO $R0
      Return
    ${EndIf}
    DetailPrint "A cópia pelo SQLite falhou (código $0). Copiando os arquivos do banco como estão..."
  ${Else}
    DetailPrint "Copiando os arquivos do banco de dados para $R0..."
  ${EndIf}

  ClearErrors
  CopyFiles /SILENT /FILESONLY "$DADOS\${ARQ_BANCO}" "$R0"
  ${If} ${FileExists} "$DADOS\${ARQ_BANCO}-wal"
    CopyFiles /SILENT /FILESONLY "$DADOS\${ARQ_BANCO}-wal" "$R0-wal"
  ${EndIf}
  ${If} ${FileExists} "$DADOS\${ARQ_BANCO}-shm"
    CopyFiles /SILENT /FILESONLY "$DADOS\${ARQ_BANCO}-shm" "$R0-shm"
  ${EndIf}
  ${IfNot} ${Errors}
  ${AndIf} ${FileExists} "$R0"
    StrCpy $COPIA_BANCO $R0
    Return
  ${EndIf}

  DetailPrint "Não foi possível copiar o banco de dados."
  ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Não foi possível fazer a cópia de segurança do banco de dados antes da atualização (disco cheio?).$\r$\n$\r$\nContinuar a atualização mesmo assim, sem a cópia?" /SD IDNO IDYES`
    StrCpy $RESULTADO "cancelar"
  ${EndIf}
FunctionEnd

; sc delete e espera o Windows apagar o serviço. Se a janela "Serviços"
; estiver aberta, o serviço fica "marcado para exclusão" até ela ser fechada.
Function RemoverServicoAntigo
  nsExec::ExecToLog /OEM '"${SYS}\sc.exe" delete ${SERVICO}'
  Pop $0
  ${Do}
    !insertmacro ESPERAR_SERVICO_SUMIR 20
    ${If} $0 == 1060
    ${OrIf} $0 == "error"
      Return
    ${EndIf}
    ${IfNot} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O Windows ainda não terminou de remover o serviço antigo.$\r$\n$\r$\nFeche a janela $\"Serviços$\" (services.msc) e o Gerenciador de Tarefas, se estiverem abertos, e clique em Repetir." /SD IDCANCEL IDRETRY`
      ${ExitDo}
    ${EndIf}
  ${Loop}
  DetailPrint "O serviço antigo continua marcado para exclusão."
FunctionEnd

; Só SYSTEM e Administradores (controle total) e LocalService (modificar).
; Um usuário comum logado no servidor não lê nem altera o banco, os backups,
; os certificados, o email.json nem os registros.
;   - dono = Administradores, em tudo: um usuário comum pode ter criado a pasta
;     antes (o C:\ProgramData deixa) e, como dono, poderia liberar o acesso;
;   - /reset na raiz tira permissões explícitas que tenham sido postas nela;
;   - a raiz deixa de herdar do ProgramData e recebe só as três permissões;
;   - /reset /T no conteúdo: tudo volta a só herdar da raiz (desfaz, por
;     exemplo, o acesso que o Explorer grava quando alguém clica "Continuar").
Function ProtegerPastaDados
  DetailPrint "Protegendo a pasta de dados..."
  StrCpy $R1 0
  nsExec::ExecToLog /OEM '"${SYS}\icacls.exe" "$DADOS_RAIZ" /setowner *S-1-5-32-544 /T /C /Q'
  Pop $0
  ${If} $0 != 0
    StrCpy $R1 $0
  ${EndIf}
  nsExec::ExecToLog /OEM '"${SYS}\icacls.exe" "$DADOS_RAIZ" /reset /C /Q'
  Pop $0
  ${If} $0 != 0
    StrCpy $R1 $0
  ${EndIf}
  nsExec::ExecToLog /OEM '"${SYS}\icacls.exe" "$DADOS_RAIZ" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-19:(OI)(CI)M /C /Q'
  Pop $0
  ${If} $0 != 0
    StrCpy $R1 $0
  ${EndIf}
  nsExec::ExecToLog /OEM '"${SYS}\icacls.exe" "$DADOS_RAIZ\*" /reset /T /C /Q'
  Pop $0
  ${If} $0 != 0
    StrCpy $R1 $0
  ${EndIf}
  ${If} $R1 != 0
    DetailPrint "Atenção: nem todas as permissões da pasta de dados puderam ser ajustadas (icacls: $R1)."
    StrCpy $AVISOS "$AVISOS$\r$\n- As permissões da pasta $DADOS_RAIZ não puderam ser todas ajustadas."
  ${EndIf}
FunctionEnd

; Gera servico\BCCalibracao.xml em UTF-16 com BOM (o nome tem "ç" e "ã").
; Refeito a cada instalação/atualização: não edite à mão.
Function EscreverXmlServico
  ClearErrors
  FileOpen $9 "$INSTDIR\servico\${SERVICO}.xml" w
  ${If} ${Errors}
    StrCpy $ERRO_SERVICO 1
    MessageBox MB_ICONSTOP "Não foi possível gravar a configuração do serviço em $INSTDIR\servico." /SD IDOK
    Return
  ${EndIf}
  FileWriteUTF16LE /BOM $9 '<?xml version="1.0" encoding="utf-16"?>$\r$\n'
  FileWriteUTF16LE $9 '<!-- Gerado pelo instalador do ${APP_NOME} ${VERSAO}. Para mudar a porta, rode o instalador com /PORTA=. -->$\r$\n'
  FileWriteUTF16LE $9 '<service>$\r$\n'
  FileWriteUTF16LE $9 '  <id>${SERVICO}</id>$\r$\n'
  FileWriteUTF16LE $9 '  <name>${APP_NOME}</name>$\r$\n'
  FileWriteUTF16LE $9 '  <description>Servidor do ${APP_NOME} (certificados de calibração), usado pelo navegador na rede local: http://localhost:$PORTA</description>$\r$\n'
  FileWriteUTF16LE $9 '  <executable>$INSTDIR\node\node.exe</executable>$\r$\n'
  FileWriteUTF16LE $9 '  <arguments>"$INSTDIR\server\iniciar.mjs"</arguments>$\r$\n'
  FileWriteUTF16LE $9 '  <workingdirectory>$INSTDIR</workingdirectory>$\r$\n'
  ; As variáveis do serviço valem mais que o .env da pasta do programa
  FileWriteUTF16LE $9 '  <env name="PORTA" value="$PORTA"/>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="HOST" value="0.0.0.0"/>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="PASTA_DADOS" value="$DADOS"/>$\r$\n'
  FileWriteUTF16LE $9 '  <env name="NODE_ENV" value="production"/>$\r$\n'
  FileWriteUTF16LE $9 '  <startmode>Automatic</startmode>$\r$\n'
  ; Reinício automático (o Node sai com código diferente de zero num erro
  ; fatal): 10 s, 30 s e depois a cada 60 s; o contador zera após 1 h estável
  FileWriteUTF16LE $9 '  <onfailure action="restart" delay="10 sec"/>$\r$\n'
  FileWriteUTF16LE $9 '  <onfailure action="restart" delay="30 sec"/>$\r$\n'
  FileWriteUTF16LE $9 '  <onfailure action="restart" delay="60 sec"/>$\r$\n'
  FileWriteUTF16LE $9 '  <resetfailure>1 hour</resetfailure>$\r$\n'
  ; Parar: o WinSW manda Ctrl+C (o servidor fecha o banco) e espera até 15 s
  FileWriteUTF16LE $9 '  <stoptimeout>15 sec</stoptimeout>$\r$\n'
  FileWriteUTF16LE $9 '  <serviceaccount>$\r$\n'
  ${If} $CONTA == "LocalSystem"
    FileWriteUTF16LE $9 '    <user>LocalSystem</user>$\r$\n'
  ${Else}
    FileWriteUTF16LE $9 '    <domain>NT AUTHORITY</domain>$\r$\n'
    FileWriteUTF16LE $9 '    <user>LocalService</user>$\r$\n'
  ${EndIf}
  FileWriteUTF16LE $9 '  </serviceaccount>$\r$\n'
  ; Registros: BCCalibracao.out.log (saída do Node), .err.log (erros) e
  ; .wrapper.log (WinSW); giram a cada 10 MB, guardando 8 arquivos
  FileWriteUTF16LE $9 '  <logpath>$LOGS</logpath>$\r$\n'
  FileWriteUTF16LE $9 '  <log mode="roll-by-size">$\r$\n'
  FileWriteUTF16LE $9 '    <sizeThreshold>10240</sizeThreshold>$\r$\n'
  FileWriteUTF16LE $9 '    <keepFiles>8</keepFiles>$\r$\n'
  FileWriteUTF16LE $9 '  </log>$\r$\n'
  FileWriteUTF16LE $9 '</service>$\r$\n'
  FileClose $9
FunctionEnd

; Regra de entrada TCP na porta, para o node.exe desta instalação, só de
; localsubnet (as sub-redes ligadas direto ao servidor) e das redes extras,
; nos perfis Privado e Domínio. O perfil Público fica de fora de propósito:
; uma placa "Pública" é uma rede em que o Windows não confia (Wi-Fi de
; visitantes, modem da operadora); se a rede da empresa estiver classificada
; assim, o certo é marcá-la como Privada (a página final avisa).
Function ConfigurarFirewall
  DetailPrint "Configurando o Firewall do Windows..."
  nsExec::ExecToLog /OEM '"${SYS}\netsh.exe" advfirewall firewall delete rule name="${REGRA_FW}"'
  Pop $0                            ; 1 = não havia regra: tudo bem
  StrCpy $R1 "localsubnet"
  ${If} $REDES != ""
    StrCpy $R1 "localsubnet,$REDES"
  ${EndIf}
  nsExec::ExecToLog /OEM '"${SYS}\netsh.exe" advfirewall firewall add rule name="${REGRA_FW}" description="Acesso ao BC Calibracao pelos computadores da rede local" dir=in action=allow protocol=TCP localport=$PORTA remoteip=$R1 profile=private,domain program="$INSTDIR\node\node.exe" enable=yes'
  Pop $0
  ${If} $0 != 0
  ${AndIf} $REDES != ""
    DetailPrint "O Firewall recusou as redes extras ($REDES). Tentando só com a rede local..."
    nsExec::ExecToLog /OEM '"${SYS}\netsh.exe" advfirewall firewall add rule name="${REGRA_FW}" description="Acesso ao BC Calibracao pelos computadores da rede local" dir=in action=allow protocol=TCP localport=$PORTA remoteip=localsubnet profile=private,domain program="$INSTDIR\node\node.exe" enable=yes'
    Pop $0
    ${If} $0 == 0
      StrCpy $AVISOS "$AVISOS$\r$\n- O Firewall recusou as redes extras ($REDES): só a rede local tem acesso."
    ${EndIf}
  ${EndIf}
  ${If} $0 != 0
    StrCpy $AVISOS "$AVISOS$\r$\n- A regra do Firewall não foi criada (código $0): libere a porta $PORTA à mão."
    MessageBox MB_ICONEXCLAMATION "Não foi possível criar a regra do Firewall do Windows (código $0). Os outros computadores só vão conseguir abrir o sistema depois que a porta $PORTA for liberada no Firewall." /SD IDOK
  ${EndIf}
FunctionEnd

; Marca um atalho .lnk como "Executar como administrador" (bit
; SLDF_RUNAS_USER = 0x2000 das LinkFlags, que ficam no byte 0x15 do arquivo).
; Entrada: $R0 = caminho do .lnk. Se falhar, o .bat pede a permissão sozinho.
Function MarcarAtalhoComoAdministrador
  ClearErrors
  FileOpen $0 "$R0" a
  ${IfNot} ${Errors}
    FileSeek $0 0x15 SET
    FileReadByte $0 $1
    IntOp $1 $1 | 0x20
    FileSeek $0 0x15 SET
    FileWriteByte $0 $1
    FileClose $0
  ${EndIf}
FunctionEnd

Function CriarAtalhos
  DetailPrint "Criando os atalhos..."
  SetOutPath "$INSTDIR"
  ; Área de Trabalho pública e Menu Iniciar de todos os usuários
  !insertmacro ATALHO_URL "$DESKTOP\${APP_NOME}.url"
  RMDir /r "$SMPROGRAMS\${APP_NOME}"
  CreateDirectory "$SMPROGRAMS\${APP_NOME}"
  !insertmacro ATALHO_URL "$SMPROGRAMS\${APP_NOME}\${APP_NOME}.url"
  StrCpy $R0 "$SMPROGRAMS\${APP_NOME}\Redefinir senha do ${APP_NOME}.lnk"
  CreateShortCut "$R0" "$INSTDIR\ferramentas\redefinir-senha.bat" "" "$INSTDIR\bc-calibracao.ico" 0 SW_SHOWNORMAL "" "Cria o administrador ou redefine a senha de um usuário do ${APP_NOME}"
  Call MarcarAtalhoComoAdministrador
  CreateShortCut "$SMPROGRAMS\${APP_NOME}\Pasta dos certificados e backups.lnk" "$DADOS" "" "" 0 SW_SHOWNORMAL "" "Banco de dados, certificados em PDF e cópias de segurança do ${APP_NOME}"
FunctionEnd

Function GravarRegistro
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  ; Configuração (lida na próxima atualização e pelo redefinir-senha.ps1)
  WriteRegStr HKLM "${CHAVE_APP}" "Pasta" "$INSTDIR"
  WriteRegStr HKLM "${CHAVE_APP}" "PastaDados" "$DADOS"
  WriteRegStr HKLM "${CHAVE_APP}" "PastaLogs" "$LOGS"
  WriteRegStr HKLM "${CHAVE_APP}" "Porta" "$PORTA"
  WriteRegStr HKLM "${CHAVE_APP}" "RedesExtras" "$REDES"
  WriteRegStr HKLM "${CHAVE_APP}" "ContaServico" "$CONTA"
  WriteRegStr HKLM "${CHAVE_APP}" "Versao" "${VERSAO}"
  WriteRegStr HKLM "${CHAVE_APP}" "VersaoNumerica" "${VERSAO_NUM}"
  ; "Programas e Recursos" / "Aplicativos instalados"
  WriteRegStr   HKLM "${CHAVE_DESINST}" "DisplayName"          "${APP_NOME}"
  WriteRegStr   HKLM "${CHAVE_DESINST}" "DisplayVersion"       "${VERSAO}"
  WriteRegStr   HKLM "${CHAVE_DESINST}" "Publisher"            "${EMPRESA}"
  WriteRegStr   HKLM "${CHAVE_DESINST}" "InstallLocation"      "$INSTDIR"
  WriteRegStr   HKLM "${CHAVE_DESINST}" "DisplayIcon"          "$INSTDIR\bc-calibracao.ico"
  WriteRegStr   HKLM "${CHAVE_DESINST}" "UninstallString"      '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr   HKLM "${CHAVE_DESINST}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S'
  WriteRegDWORD HKLM "${CHAVE_DESINST}" "NoModify" 1
  WriteRegDWORD HKLM "${CHAVE_DESINST}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${CHAVE_DESINST}" "EstimatedSize" $0
FunctionEnd

; Estação: desinstalador próprio, que só remove a estação (o /ESTACAO avisa o desinstalador)
Function GravarRegistroEstacao
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "${EST_CHAVE}" "Pasta" "$INSTDIR"
  WriteRegStr HKLM "${EST_CHAVE}" "Versao" "${VERSAO}"
  WriteRegStr HKLM "${EST_CHAVE}" "VersaoNumerica" "${VERSAO_NUM}"
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "DisplayName"          "${APP_NOME} (estação)"
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "DisplayVersion"       "${VERSAO}"
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "Publisher"            "${EMPRESA}"
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "InstallLocation"      "$INSTDIR"
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "DisplayIcon"          "$INSTDIR\bc-calibracao.ico"
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "UninstallString"      '"$INSTDIR\Desinstalar.exe" /ESTACAO'
  WriteRegStr   HKLM "${CHAVE_DESINST_ESTACAO}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S /ESTACAO'
  WriteRegDWORD HKLM "${CHAVE_DESINST_ESTACAO}" "NoModify" 1
  WriteRegDWORD HKLM "${CHAVE_DESINST_ESTACAO}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${CHAVE_DESINST_ESTACAO}" "EstimatedSize" $0
FunctionEnd

; Estação no modo silencioso: o /SERVIDOR= (testado, mas guardado mesmo sem resposta) ou a procura na
; rede. Sem nenhum dos dois, a estação fica sem servidor e o programa procura quando for aberto.
Function DefinirServidorSilencioso
  StrCpy $SERVIDOR_CONFERIDO 0
  ${If} $SERVIDOR_INFORMADO != ""
    Call EstTestar
    ${If} $EST_RESPOSTA == "ok"
      StrCpy $SERVIDOR_CONFERIDO 1
      DetailPrint "Servidor: $EST_URL ($EST_NOME, versão $EST_VERSAO)."
    ${ElseIf} $EST_RESPOSTA == "fora"
      DetailPrint "O servidor $EST_URL leva para fora da rede local e foi ignorado. O programa procura o servidor quando for aberto."
      StrCpy $EST_URL ""
      StrCpy $EST_ENDERECO ""
      StrCpy $EST_PORTA "${EST_PORTA_PADRAO}"
    ${Else}
      DetailPrint "O servidor $EST_URL não respondeu agora; o endereço foi guardado mesmo assim."
    ${EndIf}
    Return
  ${EndIf}
  DetailPrint "Procurando o servidor do ${APP_NOME} na rede..."
  Call EstDescobrir
  ${If} $EST_SITUACAO == "ok"
    Call EstUsarAchado
    ${If} $EST_RESPOSTA == "ok"
      StrCpy $SERVIDOR_CONFERIDO 1
      DetailPrint "Servidor: $EST_URL ($EST_NOME, versão $EST_VERSAO)."
      Return
    ${EndIf}
  ${EndIf}
  ${If} $EST_URL != ""
    DetailPrint "O servidor guardado antes ($EST_URL) foi mantido: a procura deu $\"$EST_SITUACAO$\"."
  ${Else}
    DetailPrint "Nenhum servidor definido (procura: $EST_SITUACAO). O programa procura o servidor quando for aberto."
  ${EndIf}
FunctionEnd

Function IniciarServico
  DetailPrint "Iniciando o serviço ${APP_NOME}..."
  nsExec::ExecToLog /OEM '"${SYS}\net.exe" start ${SERVICO}'
  Pop $0
  ${If} $0 != 0
    StrCpy $ERRO_SERVICO 1
    StrCpy $AVISOS "$AVISOS$\r$\n- O serviço não iniciou (código $0). Veja os registros em $LOGS."
    MessageBox MB_ICONSTOP "O serviço ${APP_NOME} não iniciou (código $0).$\r$\n$\r$\nVeja os registros em $LOGS (BCCalibracao.err.log e BCCalibracao.wrapper.log)." /SD IDOK
    Return
  ${EndIf}
  ; No primeiro início o antivírus examina o node.exe (~90 MB): pode levar um tempo
  DetailPrint "Aguardando o sistema responder em http://127.0.0.1:$PORTA (até 90 segundos)..."
  !insertmacro AUXILIAR '-Acao Esperar -Porta $PORTA -Segundos 90'
  ${If} $0 == 0
    DetailPrint "O sistema está respondendo."
  ${ElseIf} $0 == 10
    StrCpy $ERRO_SERVICO 1
    StrCpy $AVISOS "$AVISOS$\r$\n- O sistema ainda não respondeu. Espere um minuto e abra o endereço; se não abrir, veja os registros em $LOGS."
    MessageBox MB_ICONEXCLAMATION "O serviço iniciou, mas o sistema ainda não respondeu em http://localhost:$PORTA.$\r$\n$\r$\nEspere um minuto e abra o endereço. Se não abrir, veja os registros em $LOGS (BCCalibracao.err.log)." /SD IDOK
  ${Else}
    DetailPrint "Não foi possível conferir se o sistema responde (auxiliar: $0)."
  ${EndIf}
FunctionEnd

; Texto da página final (no máximo 1024 caracteres): endereços, primeiro
; acesso e avisos. Também vai para o detalhamento (modo silencioso).
Function MontarTextoFinal
  !insertmacro AUXILIAR '-Acao RedesPublicas'
  ${If} $0 == 10
    DetailPrint "Rede classificada como Pública: $1"
    StrCpy $AVISOS "$AVISOS$\r$\n- A rede $\"$1$\" está como PÚBLICA: os outros computadores não vão conseguir abrir o sistema. Marque-a como Privada (Configurações > Rede e Internet > propriedades da rede)."
    MessageBox MB_ICONEXCLAMATION "A rede $\"$1$\" está classificada como PÚBLICA no Windows. Nessa situação o Firewall não deixa os outros computadores abrirem o sistema.$\r$\n$\r$\nSe esta é a rede da empresa, marque-a como Privada: Configurações > Rede e Internet > clique na rede > Perfil de rede: Privada (no Windows Server, pelo PowerShell como administrador: Set-NetConnectionProfile -InterfaceAlias $\"$1$\" -NetworkCategory Private)." /SD IDOK
  ${EndIf}
  !insertmacro AUXILIAR '-Acao Enderecos -Porta $PORTA'
  StrCpy $R2 ""
  ${If} $0 == 0
  ${AndIf} $1 != ""
    StrCpy $R2 "$\r$\n$1"
  ${EndIf}

  ${If} $ERRO_SERVICO == 1
    StrCpy $TEXTO_FINAL "Os arquivos do ${APP_NOME} ${VERSAO} foram instalados, mas o sistema ainda não está funcionando (veja os avisos abaixo).$\r$\n$\r$\n"
  ${ElseIf} $ATUALIZANDO == 1
    StrCpy $TEXTO_FINAL "O ${APP_NOME} foi atualizado para a versão ${VERSAO} e já está funcionando.$\r$\n$\r$\n"
  ${Else}
    StrCpy $TEXTO_FINAL "O ${APP_NOME} já está funcionando como serviço do Windows e inicia sozinho junto com o computador.$\r$\n$\r$\n"
  ${EndIf}
  StrCpy $R3 "Neste servidor: http://localhost:$PORTA$\r$\nNos outros computadores: rode este mesmo instalador e escolha $\"Estação$\" (ou abra no navegador):$\r$\nhttp://$NOMEPC:$PORTA$R2"
  StrCpy $TEXTO_FINAL "$TEXTO_FINAL$R3"
  ${If} $ATUALIZANDO == 0
    StrCpy $TEXTO_FINAL "$TEXTO_FINAL$\r$\n$\r$\nNo primeiro acesso, abra o sistema NESTE servidor: ele pede para criar o administrador."
  ${ElseIf} $COPIA_BANCO != ""
    StrCpy $TEXTO_FINAL "$TEXTO_FINAL$\r$\n$\r$\nCópia do banco antes da atualização: dados\backups"
  ${EndIf}
  ${If} $AVISOS != ""
    StrCpy $TEXTO_FINAL "$TEXTO_FINAL$\r$\n$\r$\nAtenção:$AVISOS"
  ${EndIf}
  DetailPrint "----"
  DetailPrint "Neste servidor: http://localhost:$PORTA   Na rede: http://$NOMEPC:$PORTA"
  ${If} $COPIA_BANCO != ""
    DetailPrint "Cópia do banco antes da atualização: $COPIA_BANCO"
  ${EndIf}
FunctionEnd

; Texto da página final da estação: como abrir, qual servidor e os avisos (sem Edge nem Chrome)
Function MontarTextoFinalEstacao
  StrCpy $AVISOS ""
  Call EstAcharNavegador
  ${If} $R0 == ""
    StrCpy $AVISOS "$AVISOS$\r$\n- O Microsoft Edge não foi encontrado neste computador. Instale-o (é gratuito) para o sistema abrir em janela própria; sem ele, o sistema abre no navegador padrão."
    DetailPrint "Atenção: o Microsoft Edge (nem o Google Chrome) não foi encontrado."
  ${EndIf}
  StrCpy $TEXTO_FINAL "O ${APP_NOME} está pronto nesta estação. Para abrir, use o ícone $\"${APP_NOME}$\" da Área de Trabalho ou do Menu Iniciar: o sistema abre numa janela própria, sem digitar endereço.$\r$\n$\r$\n"
  ${If} $EST_URL == ""
    StrCpy $R3 "Servidor: ainda não definido. O programa procura o servidor na rede quando for aberto."
  ${Else}
    StrCpy $R2 $EST_ENDERECO
    ${If} $EST_NOME != ""
    ${AndIf} $EST_NOME != $EST_ENDERECO
      StrCpy $R2 "$EST_NOME ($EST_ENDERECO)"
    ${EndIf}
    StrCpy $R3 "Servidor: $R2, $EST_URL"
    ${If} $SERVIDOR_CONFERIDO != 1
      StrCpy $R3 "$R3$\r$\n(não respondeu agora; o programa tenta de novo e procura na rede quando for aberto)"
    ${EndIf}
  ${EndIf}
  StrCpy $TEXTO_FINAL "$TEXTO_FINAL$R3"
  StrCpy $TEXTO_FINAL "$TEXTO_FINAL$\r$\n$\r$\nSe o servidor mudar de IP, o programa o encontra sozinho. Para escolher outro servidor: Menu Iniciar > ${APP_NOME} > Procurar o servidor do ${APP_NOME}."
  ${If} $AVISOS != ""
    StrCpy $TEXTO_FINAL "$TEXTO_FINAL$\r$\n$\r$\nAtenção:$AVISOS"
  ${EndIf}
  DetailPrint "----"
  DetailPrint "Servidor da estação: $EST_URL"
FunctionEnd

; A caixa "Abrir no navegador" deixa só 60u para o texto da página final: aqui
; o texto ganha o dobro da altura e a caixa desce para logo abaixo dele. Se
; algo falhar, a página só fica como o MUI a desenhou.
Function FinalAoMostrar
  ${If} $MODO == "estacao"
    SendMessage $mui.FinishPage.Run ${WM_SETTEXT} 0 "STR:Abrir o ${APP_NOME} agora"
  ${EndIf}
  System::Call "*(i 0, i 0, i 0, i 0) p .r0"
  ${If} $0 <> 0
    System::Call "user32::GetWindowRect(p $mui.FinishPage.Text, p r0)"
    System::Call "user32::MapWindowPoints(p 0, p $mui.FinishPage, p r0, i 2)"
    System::Call "*$0(i .r1, i .r2, i .r3, i .r4)"
    System::Free $0
    IntOp $5 $4 - $2                ; altura atual (60u) em pixels
    IntOp $6 $3 - $1                ; largura
    ${If} $5 > 0
      IntOp $7 $5 * 2               ; nova altura: 120u
      System::Call "user32::SetWindowPos(p $mui.FinishPage.Text, p 0, i 0, i 0, i $6, i $7, i 0x16)"   ; NOMOVE|NOZORDER|NOACTIVATE
      IntOp $8 $2 + $7
      IntOp $9 $5 / 12              ; ~5u de espaço
      IntOp $8 $8 + $9
      System::Call "user32::SetWindowPos(p $mui.FinishPage.Run, p 0, i $1, i $8, i 0, i 0, i 0x15)"  ; NOSIZE|NOZORDER|NOACTIVATE
    ${EndIf}
  ${EndIf}
FunctionEnd

; Abre o navegador como o usuário logado: o explorer.exe repassa o endereço
; para a sessão normal, em vez de abrir um navegador "como administrador".
; Na estação, do mesmo jeito, abre o programa da estação como o usuário.
Function AbrirNavegador
  ${If} $MODO == "estacao"
    Exec '"$WINDIR\explorer.exe" "$INSTDIR\${LANCADOR_EXE}"'
  ${Else}
    Exec '"$WINDIR\explorer.exe" "http://localhost:$PORTA/"'
  ${EndIf}
FunctionEnd

; ================================================================ Desinstalador
Function un.onInit
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "Admin"
    MessageBox MB_ICONSTOP "Rode o desinstalador com uma conta de administrador do Windows." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  SetShellVarContext all
  SetRegView 64
  StrCpy $DADOS_RAIZ "$APPDATA\${APP_PASTA}"
  StrCpy $DADOS "$DADOS_RAIZ\dados"
  StrCpy $AUXILIAR "$INSTDIR\ferramentas\auxiliar-instalador.ps1"
  ; Desinstalador da estação? O registro passa /ESTACAO; rodado direto da pasta, a pasta diz
  StrCpy $MODO "servidor"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/ESTACAO" $R1
  ${IfNot} ${Errors}
    StrCpy $MODO "estacao"
  ${ElseIf} ${FileExists} "$INSTDIR\${LANCADOR_EXE}"
  ${OrIf} $INSTDIR == "$PROGRAMFILES64\${PASTA_ESTACAO}"
    StrCpy $MODO "estacao"
  ${EndIf}
  ${If} $MODO == "estacao"
    StrCpy $TEXTO_DESINST "O programa e os atalhos do ${APP_NOME} serão removidos desta estação. O sistema e os dados, que ficam no servidor, não são afetados."
  ${Else}
    StrCpy $TEXTO_DESINST "O serviço, a regra do Firewall e os atalhos do ${APP_NOME} serão removidos. Em seguida o desinstalador pergunta se os dados (banco, certificados e backups) também devem ser apagados; o padrão é mantê-los."
  ${EndIf}
FunctionEnd

; Estação: programa, atalhos e configuração. Do usuário que desinstala, também o servidor guardado e a
; pasta da janela do sistema (%LOCALAPPDATA%\BC Calibracao); as dos outros usuários ficam, mas o
; servidor que eles guardaram não volta a valer numa reinstalação: a Geracao do HKLM será outra.
Function un.RemoverEstacao
  DetailPrint "Removendo os atalhos..."
  Delete "$DESKTOP\${APP_NOME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NOME}"
  DetailPrint "Removendo o programa da estação..."
  !insertmacro REMOVER_ESTACAO
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${CHAVE_DESINST_ESTACAO}"
  DeleteRegKey HKLM "${EST_CHAVE}"
  SetShellVarContext current
  DeleteRegKey HKCU "${EST_CHAVE}"
  RMDir /r "$LOCALAPPDATA\BC Calibracao"
  SetShellVarContext all
FunctionEnd

Section "Uninstall"
  SetShellVarContext all
  SetRegView 64

  ${If} $MODO == "estacao"
    Call un.RemoverEstacao
    Return
  ${EndIf}

  ; Dados: o padrão é MANTER. Pergunta antes de remover qualquer coisa.
  ; /S mantém; /S /REMOVERDADOS apaga.
  StrCpy $APAGAR_DADOS 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/REMOVERDADOS" $R1
  ${IfNot} ${Errors}
    StrCpy $APAGAR_DADOS 1
  ${ElseIfNot} ${Silent}
    ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Apagar também os DADOS do ${APP_NOME}?$\r$\n$\r$\n$DADOS_RAIZ$\r$\n(banco de dados, certificados em PDF, cópias de segurança, configuração de e-mail e registros)$\r$\n$\r$\nRecomendado: Não. Os dados ficam guardados e voltam a ser usados se o sistema for instalado de novo." IDYES`
      ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Tem certeza? Todos os certificados, clientes, balanças e cópias de segurança serão apagados deste computador.$\r$\n$\r$\nIsto NÃO pode ser desfeito." IDYES`
        StrCpy $APAGAR_DADOS 1
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; Serviço: para (e encerra o que sobrar rodando da pasta do programa) e remove
  DetailPrint "Parando e removendo o serviço ${APP_NOME}..."
  StrCpy $0 ""
  ${If} ${FileExists} "$AUXILIAR"
    !insertmacro AUXILIAR '-Acao Parar -Servico ${SERVICO} -Pasta "$INSTDIR" -Desativar -Segundos 60'
  ${EndIf}
  ${If} $0 != 0
    nsExec::ExecToLog /OEM '"${SYS}\net.exe" stop ${SERVICO}'
    Pop $0
  ${EndIf}
  nsExec::ExecToLog /OEM '"${SYS}\sc.exe" delete ${SERVICO}'
  Pop $0
  !insertmacro ESPERAR_SERVICO_SUMIR 20
  ${If} $0 != 1060
  ${AndIf} $0 != "error"
    DetailPrint "O serviço foi marcado para exclusão: ele some quando a janela Serviços for fechada."
  ${EndIf}

  ; Firewall
  nsExec::ExecToLog /OEM '"${SYS}\netsh.exe" advfirewall firewall delete rule name="${REGRA_FW}"'
  Pop $0

  ; Atalhos
  Delete "$DESKTOP\${APP_NOME}.url"
  RMDir /r "$SMPROGRAMS\${APP_NOME}"

  ; Programa
  DetailPrint "Removendo os arquivos do programa..."
  !insertmacro REMOVER_PROGRAMA
  Delete "$INSTDIR\Desinstalar.exe"
  ${If} $APAGAR_DADOS == 1
    Delete "$INSTDIR\.env"
  ${EndIf}
  RMDir "$INSTDIR"                  ; só some se estiver vazia (sobra o .env, se houver)

  DeleteRegKey HKLM "${CHAVE_DESINST}"
  ${If} $APAGAR_DADOS == 1
    DetailPrint "Apagando os dados em $DADOS_RAIZ..."
    RMDir /r "$DADOS_RAIZ"
    DeleteRegKey HKLM "${CHAVE_APP}"
  ${Else}
    ; A porta e as redes ficam no registro para uma reinstalação usar os mesmos valores
    DetailPrint "Os dados continuam em $DADOS_RAIZ."
  ${EndIf}
SectionEnd
