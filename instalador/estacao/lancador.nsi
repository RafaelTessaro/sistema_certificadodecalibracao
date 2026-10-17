; =============================================================================
;  lancador.nsi - "BC Calibracao.exe", o programa das estações do BC Calibração.
;
;  É o que os atalhos "BC Calibração" das estações abrem (instalado pelo setup no modo Estação, em
;  C:\Program Files\BC Calibracao Estacao, ao lado do descobrir-servidor.ps1). Não instala nada:
;    1. lê o servidor guardado (o HKCU, se for da Geracao atual do HKLM; senão o HKLM: o que o setup
;       grava vale para todos os usuários; ver estacao.nsh);
;    2. testa GET /api/saude nele pelo NSISdl (HTTP puro, ~10 ms na rede local, sem PowerShell);
;    3. respondeu o BC Calibração (o mesmo servidor: mesmo id ou, sem id guardado, mesmo nome de
;       computador, se ele já é conhecido)? Abre o sistema numa janela própria (Edge ou Chrome com
;       --app) e sai, sem nunca ter mostrado janela;
;    4. não respondeu (servidor desligado, IP trocado): mostra "Procurando o servidor..." e procura na
;       rede com o descobrir-servidor.ps1 (PowerShell escondido pelo nsExec: nada pisca). Achou o mesmo
;       servidor, e só ele (ou o único, se ainda não havia um)? Guarda no HKCU e abre;
;    5. não achou, achou outro (também um servidor de versão antiga, que não informa o nome) ou vários
;       (também dois com o mesmo nome ou id, como uma cópia): mostra a página "Servidor do BC
;       Calibração" (lista do que achou, campo com o servidor de antes, "Procurar de novo"). Nunca troca
;       de servidor sozinho: trocar é escolher outro na lista e confirmar.
;  Com /CONFIGURAR (atalho "Procurar o servidor do BC Calibração" no Menu Iniciar), vai direto para a
;  procura e a página, mesmo com o servidor respondendo.
;
;  Roda como o usuário (nunca pede permissão de administrador) e é um programa de janela: não abre
;  console. Gerado por scripts/empacotar-windows.sh antes do setup:
;    makensis -WX -DVERSAO=1.2.0 -DVERSAO_NUM=1.2.0.0 -DICONE=<ico> -DSAIDA=<payload>\estacao\BC Calibracao.exe lancador.nsi
; =============================================================================

Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails nevershow

!ifndef VERSAO
  !define VERSAO "0.0.0"
!endif
!ifndef VERSAO_NUM
  !define VERSAO_NUM "${VERSAO}.0"
!endif
!ifndef ICONE
  !define ICONE "..\bc-calibracao.ico"
!endif
!ifndef SAIDA
  !define SAIDA "BC Calibracao.exe"
!endif

!define APP_NOME "BC Calibração"
!define EMPRESA  "Balanças.com"

Name "${APP_NOME}"
Caption "${APP_NOME}"
OutFile "${SAIDA}"
BrandingText "${APP_NOME} ${VERSAO}"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"            ; GetParameters, GetOptions
!include "x64.nsh"                 ; RunningX64
!include "nsDialogs.nsh"

Var CONFIGURAR                     ; 1 = aberto pelo "Procurar o servidor" (/CONFIGURAR)

!define MUI_ICON "${ICONE}"
!define MUI_DISABLE_INSERT_LANGUAGE_AFTER_PAGES_WARNING   ; só há a página própria (nsDialogs)
Page custom PaginaCriar PaginaSair
!insertmacro MUI_LANGUAGE "PortugueseBR"

!define EST_LANCADOR
!include "estacao.nsh"

ReserveFile /plugin NSISdl.dll
ReserveFile /plugin System.dll
ReserveFile /plugin Banner.dll
ReserveFile /plugin nsExec.dll
ReserveFile /plugin nsDialogs.dll

VIProductVersion "${VERSAO_NUM}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName"     "${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "CompanyName"     "${EMPRESA}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion"     "${VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductVersion"  "${VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright"  "© ${EMPRESA}"

; Nada a instalar: sem a página de instalação, a seção nunca roda (o NSIS só exige que exista uma).
; O aviso 8000 ("Page instfiles not used") é justamente isso.
!pragma warning disable 8000
Section "-"
SectionEnd

Function .onInit
  ; Já aberto (procurando ou na página)? Traz a janela para a frente em vez de abrir outra
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "BCCalibracaoEstacao") p .r1 ?e'
  Pop $0
  ${If} $0 = 183                    ; ERROR_ALREADY_EXISTS
    FindWindow $0 "#32770" "${APP_NOME}"
    ${If} $0 <> 0
      System::Call 'user32::SetForegroundWindow(p r0)'
    ${EndIf}
    Quit
  ${EndIf}

  SetShellVarContext current        ; $LOCALAPPDATA e SHCTX (= HKCU) do usuário
  ${If} ${RunningX64}
    SetRegView 64                   ; a mesma visão do registro em que o instalador gravou
  ${EndIf}
  InitPluginsDir
  StrCpy $EST_SCRIPT "$EXEDIR\descobrir-servidor.ps1"

  StrCpy $CONFIGURAR 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/CONFIGURAR" $R1
  ${IfNot} ${Errors}
    StrCpy $CONFIGURAR 1
  ${EndIf}

  Call EstLerConfig

  ; Caminho rápido: o servidor guardado responde? Abre e pronto (nenhuma janela deste programa)
  ${If} $CONFIGURAR == 0
  ${AndIf} $EST_URL != ""
    Call EstTestar
    ${If} $EST_RESPOSTA == "ok"
      ; Servidor guardado sem o nome ou o id (instalado com ele desligado), ou que mudou de nome (o
      ; mesmo id): guarda agora, para reconhecê-lo se mudar de IP
      ${If} $EST_NOME S!= $EST_CONHECIDO_NOME
      ${OrIf} $EST_ID S!= $EST_CONHECIDO_ID
        Call EstGravarConfig
      ${EndIf}
      Call EstAbrirSistema
      Quit
    ${EndIf}
  ${EndIf}

  ; Procura na rede. Achou o mesmo servidor (ou o único, na primeira vez)? Guarda para este usuário e abre
  Call EstProcurarComAviso
  ${If} $CONFIGURAR == 0
  ${AndIf} $EST_SITUACAO == "ok"
    Call EstUsarAchado              ; nome diferente do conhecido: vira "outro" e vai para a página
    ${If} $EST_RESPOSTA == "ok"
      Call EstGravarConfig
      Call EstAbrirSistema
      Quit
    ${EndIf}
  ${EndIf}
  ; Senão, a página "Servidor do BC Calibração"
FunctionEnd

Function PaginaCriar
  Call EstPaginaCriar
  ${If} $EST_RESPOSTA == "erro"
    Abort
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Abrir"
  GetDlgItem $0 $HWNDPARENT 2
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Fechar"
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd

Function PaginaSair
  Call EstPaginaSair
  ${If} $EST_RESPOSTA == "ficar"
    Abort
  ${ElseIf} $EST_RESPOSTA == "vazio"
    MessageBox MB_ICONEXCLAMATION "Digite o nome ou o IP do computador servidor do ${APP_NOME}, ou clique em Procurar de novo."
    Abort
  ${ElseIf} $EST_RESPOSTA != "ok"
    MessageBox MB_ICONEXCLAMATION "O ${APP_NOME} não respondeu em $EST_URL.$\r$\n$\r$\nConfira se o nome ou o IP está certo e se o computador servidor está ligado e na mesma rede deste computador."
    Abort
  ${EndIf}
  Call EstGravarConfig
  Call EstAbrirSistema
  Quit
FunctionEnd
