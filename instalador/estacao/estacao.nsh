; =============================================================================
;  estacao.nsh - Código comum do modo Estação do BC Calibração, incluído por:
;    - instalador/bc-calibracao.nsi: instalação da estação (define EST_INSTALADOR antes);
;    - instalador/estacao/lancador.nsi: o "BC Calibracao.exe" das estações (define EST_LANCADOR).
;  Inclua DEPOIS do MUI_LANGUAGE (usa o MUI_HEADER_TEXT) e com LogicLib, nsDialogs e x64 já incluídos.
;
;  Onde fica o servidor escolhido (chave Software\BC Calibracao Estacao, visão de 64 bits):
;    HKLM  o que o instalador achou ou recebeu (/SERVIDOR=), para todos os usuários do computador;
;    HKCU  o que o programa achou depois para o usuário (quando o servidor troca de IP, por exemplo).
;    Cada gravação do setup no HKLM leva uma Geracao nova (um GUID), e o programa copia para o HKCU a
;    Geracao do HKLM em que se baseou. O programa usa o HKCU só se a Geracao dele for a do HKLM; senão
;    (o setup rodou de novo depois, com o mesmo servidor ou com outro), usa o HKLM. Assim o servidor
;    escolhido pelo setup vale para todos os usuários, e o que cada um achou depois vale até a próxima
;    vez que o setup rodar.
;    Valores: Endereco (nome ou IP usado no endereço), Porta, Url (http://Endereco:Porta/, só
;    informativo: é sempre refeito do Endereco e da Porta), Nome (nome do computador servidor, como
;    ele informa em /api/saude), Id (o "id" do /api/saude, que acompanha os dados do servidor; ver
;    server/identidade.ts), Ip (último IP visto) e Geracao. Só no HKLM: SemVarredura (1 = não varre a
;    rede atrás do servidor; só nomes e endereços conhecidos).
;
;  O servidor certo é o do mesmo Id (mesmo que tenha mudado de nome ou de IP); sem Id guardado, o do
;  mesmo Nome. Nada troca de servidor sozinho: outro servidor só passa a valer quando o usuário o
;  escolhe na página "Servidor do BC Calibração" e confirma (EstConfirmarTroca). E só endereços da
;  rede local, com a mesma regra do servidor (EstResolverNaRede).
;
;  Registradores: as funções daqui usam $0-$9 e $R0-$R9 à vontade (entradas e saídas descritas em
;  cada uma); quem chama não deve contar com eles depois da chamada.
; =============================================================================

!define EST_APP          "BC Calibração"
!define EST_CHAVE        "Software\BC Calibracao Estacao"
!define EST_PORTA_PADRAO "4850"
!define EST_RESULTADO    "$PLUGINSDIR\descoberta.ini"   ; escrito pelo descobrir-servidor.ps1
!define EST_HOST_OK      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_"

Var EST_URL            ; http://SERVIDOR:4850/
Var EST_ENDERECO       ; SERVIDOR ou 192.168.0.10
Var EST_PORTA
Var EST_NOME           ; nome do computador servidor (o que ele informa); "" = ainda não se sabe
Var EST_ID             ; id do servidor (o que ele informa); "" = ainda não se sabe
Var EST_IP
Var EST_CONHECIDO_NOME ; o servidor guardado antes (EstLerConfig), para não trocar dele sem perguntar
Var EST_CONHECIDO_ID
Var EST_VERSAO
Var EST_SEM_VARREDURA  ; 1 = não varre a rede
Var EST_GERACAO        ; a Geracao do HKLM (ver acima)
Var EST_SCRIPT         ; caminho do descobrir-servidor.ps1
Var EST_SITUACAO       ; resultado da procura: ok | outro | varios | nenhum | erro
Var EST_QTD            ; quantos servidores a procura achou
Var EST_RESPOSTA       ; resposta das funções (ver cada uma)
Var hEstStatus         ; controles da página "Servidor do BC Calibração"
Var hEstLista
Var hEstCampo

; ------------------------------------------------------------ Configuração
; Lê o servidor guardado. No programa: o do usuário (HKCU), se for da mesma Geracao do HKLM; senão, o
; do computador (HKLM). No instalador, só o HKLM. O Url é refeito do Endereco e da Porta; o que não
; for um nome ou IP válido é descartado.
Function EstLerConfig
  ReadRegStr $EST_GERACAO HKLM "${EST_CHAVE}" "Geracao"
  StrCpy $EST_ENDERECO ""
!ifdef EST_LANCADOR
  ReadRegStr $0 HKCU "${EST_CHAVE}" "Geracao"
  ${If} $0 S== $EST_GERACAO
    ReadRegStr $EST_ENDERECO HKCU "${EST_CHAVE}" "Endereco"
  ${EndIf}
!endif
  ${If} $EST_ENDERECO != ""
    ReadRegStr $EST_PORTA HKCU "${EST_CHAVE}" "Porta"
    ReadRegStr $EST_NOME HKCU "${EST_CHAVE}" "Nome"
    ReadRegStr $EST_ID HKCU "${EST_CHAVE}" "Id"
    ReadRegStr $EST_IP HKCU "${EST_CHAVE}" "Ip"
  ${Else}                           ; sem HKCU, ou HKCU de antes da última gravação do setup
    ReadRegStr $EST_ENDERECO HKLM "${EST_CHAVE}" "Endereco"
    ReadRegStr $EST_PORTA HKLM "${EST_CHAVE}" "Porta"
    ReadRegStr $EST_NOME HKLM "${EST_CHAVE}" "Nome"
    ReadRegStr $EST_ID HKLM "${EST_CHAVE}" "Id"
    ReadRegStr $EST_IP HKLM "${EST_CHAVE}" "Ip"
  ${EndIf}
  ReadRegStr $EST_SEM_VARREDURA HKLM "${EST_CHAVE}" "SemVarredura"
  ${If} $EST_PORTA == ""
    StrCpy $EST_PORTA "${EST_PORTA_PADRAO}"
  ${EndIf}
  StrCpy $EST_URL ""
  ${If} $EST_ENDERECO != ""
    StrCpy $R0 "$EST_ENDERECO:$EST_PORTA"
    Call EstSeparar
    ${If} $EST_RESPOSTA != "ok"
      StrCpy $EST_ENDERECO ""
      StrCpy $EST_PORTA "${EST_PORTA_PADRAO}"
      StrCpy $EST_URL ""
    ${EndIf}
  ${EndIf}
  StrCpy $R0 $EST_NOME
  Call EstHostValido
  ${If} $R1 != "ok"
    StrCpy $EST_NOME ""
  ${EndIf}
  StrCpy $R0 $EST_ID
  Call EstIdValido
  ${If} $R1 != "ok"
    StrCpy $EST_ID ""
  ${EndIf}
  StrCpy $R0 $EST_IP
  Call EstEhIP
  ${If} $R1 != 1
    StrCpy $EST_IP ""
  ${EndIf}
  StrCpy $EST_CONHECIDO_NOME $EST_NOME
  StrCpy $EST_CONHECIDO_ID $EST_ID
FunctionEnd

; Grava o servidor em SHCTX: HKLM no instalador (SetShellVarContext all), HKCU no programa (current).
; O instalador grava uma Geracao nova, e o que ele grava passa a valer para todos os usuários (ver
; acima); o programa grava junto a Geracao do HKLM que leu.
Function EstGravarConfig
!ifdef EST_INSTALADOR
  StrCpy $0 ""
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  StrCpy $2 $0 1
  ${If} $1 != 0
  ${OrIf} $2 != "{"
    System::Call 'kernel32::GetSystemTimeAsFileTime(*l .r0)'   ; sem GUID: a data e a hora
  ${EndIf}
  StrCpy $EST_GERACAO $0
!endif
  WriteRegStr SHCTX "${EST_CHAVE}" "Url" "$EST_URL"
  WriteRegStr SHCTX "${EST_CHAVE}" "Endereco" "$EST_ENDERECO"
  WriteRegStr SHCTX "${EST_CHAVE}" "Porta" "$EST_PORTA"
  WriteRegStr SHCTX "${EST_CHAVE}" "Nome" "$EST_NOME"
  WriteRegStr SHCTX "${EST_CHAVE}" "Id" "$EST_ID"
  WriteRegStr SHCTX "${EST_CHAVE}" "Ip" "$EST_IP"
  WriteRegStr SHCTX "${EST_CHAVE}" "Geracao" "$EST_GERACAO"
FunctionEnd

; ------------------------------------------------------------ Textos
; $R0 = nome de computador ou IPv4? $R1 = "ok" se só tiver letras sem acento, dígitos, ponto, hífen e
; sublinhado (até 253) e não começar nem terminar com ponto ou hífen. Nada além disso chega a um
; endereço, ao registro ou a uma linha de comando.
Function EstHostValido
  StrCpy $R1 ""
  StrLen $1 $R0
  ${If} $1 < 1
  ${OrIf} $1 > 253
    Return
  ${EndIf}
  System::Call 'shlwapi::StrSpnW(t r10, t "${EST_HOST_OK}") i .r0'
  ${If} $0 != $1
    Return
  ${EndIf}
  StrCpy $2 $R0 1
  StrCpy $3 $R0 1 -1
  ${If} $2 == "."
  ${OrIf} $2 == "-"
  ${OrIf} $3 == "."
  ${OrIf} $3 == "-"
    Return
  ${EndIf}
  StrCpy $R1 "ok"
FunctionEnd

; $R0 = IPv4? $R1 = 1 se só tiver dígitos e três pontos
Function EstEhIP
  StrCpy $R1 0
  StrLen $1 $R0
  ${If} $1 < 7
  ${OrIf} $1 > 15
    Return
  ${EndIf}
  System::Call 'shlwapi::StrSpnW(t r10, t "0123456789.") i .r0'
  ${If} $0 != $1
    Return
  ${EndIf}
  StrCpy $2 0                       ; pontos
  StrCpy $3 0
  ${DoWhile} $3 < $1
    StrCpy $4 $R0 1 $3
    ${If} $4 == "."
      IntOp $2 $2 + 1
    ${EndIf}
    IntOp $3 $3 + 1
  ${Loop}
  ${If} $2 = 3
    StrCpy $R1 1
  ${EndIf}
FunctionEnd

; $R0 = id do servidor? $R1 = "ok" se for hexadecimal, de 8 a 64 dígitos (o servidor manda 32)
Function EstIdValido
  StrCpy $R1 ""
  StrLen $1 $R0
  ${If} $1 < 8
  ${OrIf} $1 > 64
    Return
  ${EndIf}
  System::Call 'shlwapi::StrSpnW(t r10, t "0123456789abcdefABCDEF") i .r0'
  ${If} $0 = $1
    StrCpy $R1 "ok"
  ${EndIf}
FunctionEnd

; Entende o que foi digitado: "SERVIDOR", "192.168.0.10", "192.168.0.10:4851" ou o endereço copiado do
; navegador ("http://servidor:4850/painel"). Entrada: $R0. Saída: $EST_RESPOSTA = ok | vazio |
; invalido; com ok, $EST_ENDERECO, $EST_PORTA (sem porta: ${EST_PORTA_PADRAO}) e $EST_URL.
Function EstSeparar
  StrCpy $EST_RESPOSTA "invalido"
  ${Do}                             ; espaços nas pontas
    StrCpy $0 $R0 1
    ${If} $0 == " "
    ${OrIf} $0 == "$\t"
      StrCpy $R0 $R0 "" 1
    ${Else}
      ${ExitDo}
    ${EndIf}
  ${Loop}
  ${Do}
    StrCpy $0 $R0 1 -1
    ${If} $0 == " "
    ${OrIf} $0 == "$\t"
      StrCpy $R0 $R0 -1
    ${Else}
      ${ExitDo}
    ${EndIf}
  ${Loop}
  ${If} $R0 == ""
    StrCpy $EST_RESPOSTA "vazio"
    Return
  ${EndIf}
  StrCpy $0 $R0 7
  ${If} $0 == "http://"
    StrCpy $R0 $R0 "" 7
  ${Else}
    StrCpy $0 $R0 8
    ${If} $0 == "https://"
      StrCpy $R0 $R0 "" 8
    ${EndIf}
  ${EndIf}
  StrLen $1 $R0                     ; corta o caminho ("/painel")
  StrCpy $2 0
  ${DoWhile} $2 < $1
    StrCpy $0 $R0 1 $2
    ${If} $0 == "/"
      StrCpy $R0 $R0 $2
      ${ExitDo}
    ${EndIf}
    IntOp $2 $2 + 1
  ${Loop}
  StrCpy $5 ""                      ; porta, depois do ":"
  StrLen $1 $R0
  StrCpy $2 0
  ${DoWhile} $2 < $1
    StrCpy $0 $R0 1 $2
    ${If} $0 == ":"
      IntOp $3 $2 + 1
      StrCpy $5 $R0 "" $3
      StrCpy $R0 $R0 $2
      ${ExitDo}
    ${EndIf}
    IntOp $2 $2 + 1
  ${Loop}
  Call EstHostValido
  ${If} $R1 != "ok"
    Return
  ${EndIf}
  ${If} $5 == ""
    StrCpy $5 "${EST_PORTA_PADRAO}"
  ${EndIf}
  ${Do}                             ; zeros à esquerda ("04850" seria lido como octal)
    StrCpy $0 $5 1
    StrLen $1 $5
    ${If} $0 != "0"
    ${OrIf} $1 <= 1
      ${ExitDo}
    ${EndIf}
    StrCpy $5 $5 "" 1
  ${Loop}
  IntOp $0 $5 + 0                   ; ida e volta pelo número: "48a0", "+80" e "0x50" não voltam iguais
  ${If} $0 != $5
  ${OrIf} $0 < 1
  ${OrIf} $0 > 65535
    Return
  ${EndIf}
  StrCpy $EST_ENDERECO $R0
  StrCpy $EST_PORTA $5
  StrCpy $EST_URL "http://$R0:$5/"
  StrCpy $EST_RESPOSTA "ok"
FunctionEnd

; Valor de texto de um campo de um JSON de uma linha. Entrada: $R5 = JSON, $R6 = campo.
; Saída: $R7 = valor ("" se não houver). Basta para a resposta do /api/saude.
Function EstCampoJson
  StrCpy $R7 ""
  StrCpy $0 "$\"$R6$\":$\""
  StrLen $1 $0
  StrLen $2 $R5
  StrCpy $3 0
  ${DoWhile} $3 < $2
    StrCpy $4 $R5 $1 $3
    ${If} $4 == $0
      IntOp $3 $3 + $1
      ${DoWhile} $3 < $2
        StrCpy $4 $R5 1 $3
        ${If} $4 == "$\""
          ${ExitDo}
        ${EndIf}
        StrCpy $R7 "$R7$4"
        IntOp $3 $3 + 1
      ${Loop}
      ${ExitDo}
    ${EndIf}
    IntOp $3 $3 + 1
  ${Loop}
FunctionEnd

; ------------------------------------------------------------ Rede local
!if ${NSIS_PTR_SIZE} > 4
  !define EST_HOSTENT_IPS 24        ; hostent.h_addr_list (depois de 2 ponteiros, 2 shorts e o alinhamento)
!else
  !define EST_HOSTENT_IPS 12
!endif

; $EST_ENDERECO (nome ou IPv4) leva só à rede local? A mesma regra do servidor (ipDaRedeLocal em
; server/app.ts): 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x e 100.64-127.x. O nome é resolvido
; pelo Windows como o NSISdl o resolve (gethostbyname: arquivo hosts, DNS, LLMNR, NetBIOS). Se algum
; IP dele for de fora da rede local (um DNS que responde qualquer nome com um IP da internet, por
; exemplo), o endereço é recusado: o servidor nunca está lá, e o navegador poderia ir para esse IP.
; Saída: $R1 = "ok", "fora" (algum IP de fora da rede local) ou "" (o nome não resolve); com ok,
; $R2 = o primeiro IP. Usa $0-$9.
Function EstResolverNaRede
  StrCpy $R1 ""
  StrCpy $R2 ""
  System::Alloc 1024                ; WSADATA (400 bytes no Windows de 32 bits, 408 no de 64)
  Pop $8
  System::Call 'ws2_32::WSAStartup(i 0x0202, p r8) i .r0'
  System::Free $8
  ${If} $0 <> 0
    Return
  ${EndIf}
  StrCpy $8 $EST_ENDERECO           ; já conferido pelo EstHostValido: só ASCII
  System::Call 'ws2_32::gethostbyname(m r8) p .r1'
  ${If} $1 P<> 0
    IntPtrOp $2 $1 + ${EST_HOSTENT_IPS}
    System::Call '*$2(p .r3)'       ; h_addr_list: ponteiros para os IPv4, terminada por 0
    StrCpy $R1 "ok"
    StrCpy $4 0                     ; IPs conferidos
    ${DoWhile} $4 < 32
      System::Call '*$3(p .r5)'
      ${If} $5 P= 0
        ${ExitDo}
      ${EndIf}
      System::Call '*$5(i .r6)'     ; o IPv4 na ordem da rede: o primeiro octeto é o byte de baixo
      IntOp $0 $6 & 255
      IntOp $1 $6 >> 8
      IntOp $1 $1 & 255
      IntOp $2 $6 >> 16
      IntOp $2 $2 & 255
      IntOp $7 $6 >> 24
      IntOp $7 $7 & 255
      StrCpy $9 0
      ${If} $0 = 127
      ${OrIf} $0 = 10
        StrCpy $9 1
      ${ElseIf} $0 = 172
        ${If} $1 >= 16
        ${AndIf} $1 <= 31
          StrCpy $9 1
        ${EndIf}
      ${ElseIf} $0 = 192
        ${If} $1 = 168
          StrCpy $9 1
        ${EndIf}
      ${ElseIf} $0 = 169
        ${If} $1 = 254
          StrCpy $9 1
        ${EndIf}
      ${ElseIf} $0 = 100
        ${If} $1 >= 64
        ${AndIf} $1 <= 127
          StrCpy $9 1
        ${EndIf}
      ${EndIf}
      ${If} $9 != 1
        StrCpy $R1 "fora"
        StrCpy $R2 ""
        ${ExitDo}
      ${EndIf}
      ${If} $4 = 0
        StrCpy $R2 "$0.$1.$2.$7"
      ${EndIf}
      IntOp $4 $4 + 1
      IntPtrOp $3 $3 + ${NSIS_PTR_SIZE}
    ${Loop}
    ${If} $4 = 0
    ${AndIf} $R1 == "ok"
      StrCpy $R1 ""
    ${EndIf}
  ${EndIf}
  System::Call 'ws2_32::WSACleanup()'
FunctionEnd

; ------------------------------------------------------------ Servidor
; GET $EST_URL/api/saude pelo NSISdl (HTTP puro, sem proxy, sem PowerShell: é rápido e funciona mesmo
; onde uma política bloqueia scripts). Só na rede local (EstResolverNaRede). Só vale
; "app":"bc-calibracao" com HTTP 200 e o servidor esperado: com $EST_ID preenchido, o mesmo id; sem
; ele, com $EST_NOME preenchido, o mesmo nome de computador (um servidor que não informa o id ou o
; nome não serve). Saída: $EST_RESPOSTA = ok | falhou | fora (o endereço leva para fora da rede
; local); com ok, $EST_NOME, $EST_ID e $EST_VERSAO informados pelo servidor e $EST_IP (o IP do endereço).
Function EstTestar
  StrCpy $EST_RESPOSTA "falhou"
  ${If} $EST_URL == ""
    Return
  ${EndIf}
  Call EstResolverNaRede
  ${If} $R1 == "fora"
    StrCpy $EST_RESPOSTA "fora"
    Return
  ${ElseIf} $R1 != "ok"
    Return
  ${EndIf}
  StrCpy $R8 $R2
  StrCpy $1 "api/saude"
  Delete "$PLUGINSDIR\saude.json"
  NSISdl::download_quiet /TIMEOUT=2500 /NOIEPROXY "$EST_URL$1" "$PLUGINSDIR\saude.json"
  Pop $0                            ; "success" só com HTTP 200 (o NSISdl confere a linha de status)
  ${If} $0 == "success"
    Call EstLerSaude
  ${EndIf}
FunctionEnd

; Confere a resposta do /api/saude baixada em $PLUGINSDIR\saude.json (ver EstTestar; $R8 = o IP)
Function EstLerSaude
  ClearErrors
  FileOpen $2 "$PLUGINSDIR\saude.json" r
  ${If} ${Errors}
    Return
  ${EndIf}
  FileRead $2 $R5
  FileClose $2
  StrCpy $R6 "app"
  Call EstCampoJson
  ${If} $R7 != "bc-calibracao"
    Return
  ${EndIf}
  StrCpy $R6 "nome"
  Call EstCampoJson
  StrCpy $R0 $R7
  Call EstHostValido
  ${If} $R1 != "ok"
    StrCpy $R0 ""                   ; servidor antigo (sem o nome) ou nome fora do padrão
  ${EndIf}
  StrCpy $R3 $R0
  StrCpy $R6 "id"
  Call EstCampoJson
  StrCpy $R0 $R7
  Call EstIdValido
  ${If} $R1 != "ok"
    StrCpy $R0 ""                   ; servidor antigo (sem o id)
  ${EndIf}
  StrCpy $R4 $R0
  ${If} $EST_ID != ""
    ${If} $R4 != $EST_ID
      Return                        ; outro servidor neste endereço, mesmo que tenha o mesmo nome
    ${EndIf}
  ${ElseIf} $EST_NOME != ""
  ${AndIf} $R3 != $EST_NOME         ; StrCmp não diferencia maiúsculas
    Return                          ; outro servidor neste endereço (ou um antigo, que não diz o nome)
  ${EndIf}
  ${If} $R3 != ""
    StrCpy $EST_NOME $R3            ; com o mesmo id, o nome novo (o servidor mudou de computador)
  ${EndIf}
  ${If} $R4 != ""
    StrCpy $EST_ID $R4
  ${EndIf}
  StrCpy $R6 "versao"
  Call EstCampoJson
  StrCpy $EST_VERSAO $R7 40
  StrCpy $EST_IP $R8
  StrCpy $EST_RESPOSTA "ok"
FunctionEnd

; Procura o servidor com o descobrir-servidor.ps1 ($EST_SCRIPT), escondido pelo nsExec (nenhuma janela
; de console aparece). Conhecidos: $EST_ENDERECO, $EST_IP, $EST_NOME e $EST_ID, passados por variável
; de ambiente, nunca pela linha de comando. Saída: $EST_SITUACAO e $EST_QTD; os servidores achados ficam
; em ${EST_RESULTADO} ([servidor1], [servidor2]...). Sem PowerShell (ou bloqueado), "erro".
Function EstDescobrir
  Delete "${EST_RESULTADO}"
  StrCpy $R9 "$EST_ENDERECO,$EST_IP,$EST_NOME"
  System::Call 'kernel32::SetEnvironmentVariable(t "BC_CONHECIDOS", t r19)'
  StrCpy $R9 $EST_NOME
  System::Call 'kernel32::SetEnvironmentVariable(t "BC_NOME", t r19)'
  StrCpy $R9 $EST_ID
  System::Call 'kernel32::SetEnvironmentVariable(t "BC_ID", t r19)'
  StrCpy $R8 ""
  ${If} $EST_SEM_VARREDURA == 1
    StrCpy $R8 " -SemVarredura"
  ${EndIf}
  ${If} ${RunningX64}
    StrCpy $R7 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  ${Else}
    StrCpy $R7 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  ${EndIf}
  nsExec::ExecToStack /TIMEOUT=60000 '"$R7" -NoProfile -NonInteractive -InputFormat None -ExecutionPolicy Bypass -File "$EST_SCRIPT" -Saida "${EST_RESULTADO}" -Porta $EST_PORTA$R8'
  Pop $0
  Pop $1
  DetailPrint "Procura do servidor do ${EST_APP}: $1 (código $0)"
  ReadINIStr $EST_SITUACAO "${EST_RESULTADO}" "resultado" "situacao"
  ReadINIStr $EST_QTD "${EST_RESULTADO}" "resultado" "quantidade"
  ${If} $EST_SITUACAO == ""
    StrCpy $EST_SITUACAO "erro"
  ${EndIf}
  IntOp $EST_QTD $EST_QTD + 0
FunctionEnd

; A procura com um aviso na tela ("Procurando o servidor..."): o Banner roda em outra thread e continua
; desenhado enquanto o nsExec espera. A janela principal, se houver, fica desabilitada enquanto isso.
Function EstProcurarComAviso
  ${If} $HWNDPARENT <> 0
    EnableWindow $HWNDPARENT 0
  ${EndIf}
  Banner::show /set 76 "Procurando o servidor do ${EST_APP} na rede…" /set 1030 "Isto leva alguns segundos." "${EST_APP}"
  Call EstDescobrir
  Banner::destroy
  ${If} $HWNDPARENT <> 0
    EnableWindow $HWNDPARENT 1
    BringToFront
  ${EndIf}
FunctionEnd

; A última procura deu "ok": usa o servidor 1 dela. Nunca troca sozinho um servidor conhecido por outro:
; com $EST_ID preenchido, o achado tem de ter o mesmo id; sem ele, com $EST_NOME preenchido, o mesmo
; nome. Senão (o que a procura já não devolve) nada muda e $EST_SITUACAO passa a "outro", para quem
; chamou perguntar. Saída: $EST_RESPOSTA = ok (os $EST_* são os do achado) | outro | invalido
Function EstUsarAchado
  ReadINIStr $R2 "${EST_RESULTADO}" "servidor1" "nome"
  ReadINIStr $R3 "${EST_RESULTADO}" "servidor1" "id"
  StrCpy $R4 0                      ; 1 = não é o servidor conhecido
  ${If} $EST_ID != ""
    ${If} $R3 != $EST_ID
      StrCpy $R4 1
    ${EndIf}
  ${ElseIf} $EST_NOME != ""
  ${AndIf} $R2 != $EST_NOME         ; StrCmp não diferencia maiúsculas
    StrCpy $R4 1
  ${EndIf}
  ${If} $R4 = 1
    StrCpy $EST_SITUACAO "outro"
    StrCpy $EST_RESPOSTA "outro"
    Return
  ${EndIf}
  StrCpy $R1 1
  Call EstCarregarServidor
FunctionEnd

; Usa o servidor número $R1 da última procura
Function EstCarregarServidor
  ReadINIStr $EST_ENDERECO "${EST_RESULTADO}" "servidor$R1" "endereco"
  ReadINIStr $EST_PORTA "${EST_RESULTADO}" "servidor$R1" "porta"
  ReadINIStr $EST_NOME "${EST_RESULTADO}" "servidor$R1" "nome"
  ReadINIStr $EST_ID "${EST_RESULTADO}" "servidor$R1" "id"
  ReadINIStr $EST_IP "${EST_RESULTADO}" "servidor$R1" "ip"
  ReadINIStr $EST_VERSAO "${EST_RESULTADO}" "servidor$R1" "versao"
  StrCpy $R0 $EST_NOME              ; confere tudo de novo, como se tivesse sido digitado
  Call EstHostValido
  ${If} $R1 != "ok"
    StrCpy $EST_NOME ""
  ${EndIf}
  StrCpy $R0 $EST_ID
  Call EstIdValido
  ${If} $R1 != "ok"
    StrCpy $EST_ID ""
  ${EndIf}
  StrCpy $R0 $EST_IP
  Call EstEhIP
  ${If} $R1 != 1
    StrCpy $EST_IP ""
  ${EndIf}
  StrCpy $EST_URL ""
  StrCpy $R0 "$EST_ENDERECO:$EST_PORTA"
  Call EstSeparar                   ; refaz o $EST_URL
FunctionEnd

; O endereço digitado é um dos servidores da última procura? Então o IP, o nome e o id dele são
; conhecidos (e o EstTestar confere que é ele mesmo que responde). Primeiro pelo endereço e pelo IP,
; que não se repetem na lista; depois pelo nome, que pode se repetir (dois servidores com o mesmo nome).
Function EstCompletarDaLista
  StrCpy $R0 $EST_ENDERECO
  Call EstEhIP
  ${If} $R1 == 1
    StrCpy $EST_IP $EST_ENDERECO
  ${EndIf}
  StrCpy $R2 1                      ; 1 = pelo endereço e pelo IP; 2 = pelo nome
  ${DoWhile} $R2 <= 2
    StrCpy $5 1
    ${DoWhile} $5 <= $EST_QTD
      ReadINIStr $6 "${EST_RESULTADO}" "servidor$5" "endereco"
      ReadINIStr $7 "${EST_RESULTADO}" "servidor$5" "ip"
      ReadINIStr $8 "${EST_RESULTADO}" "servidor$5" "nome"
      ReadINIStr $9 "${EST_RESULTADO}" "servidor$5" "porta"
      StrCpy $R3 0
      ${If} $9 == $EST_PORTA
        ${If} $R2 = 1
          ${If} $EST_ENDERECO == $6
          ${OrIf} $EST_ENDERECO == $7
            StrCpy $R3 1
          ${EndIf}
        ${ElseIf} $8 != ""
        ${AndIf} $EST_ENDERECO == $8
          StrCpy $R3 1
        ${EndIf}
      ${EndIf}
      ${If} $R3 = 1
        StrCpy $EST_IP $7
        StrCpy $EST_NOME $8
        ReadINIStr $EST_ID "${EST_RESULTADO}" "servidor$5" "id"
        StrCpy $R0 $EST_ID
        Call EstIdValido
        ${If} $R1 != "ok"
          StrCpy $EST_ID ""
        ${EndIf}
        Return
      ${EndIf}
      IntOp $5 $5 + 1
    ${Loop}
    IntOp $R2 $R2 + 1
  ${Loop}
FunctionEnd

; ------------------------------------------------------------ Página "Servidor do BC Calibração"
; Monta a página (quem chama faz o nsDialogs::Show depois, podendo trocar o texto dos botões).
; $EST_RESPOSTA = "erro" se a página não pôde ser criada.
Function EstPaginaCriar
  StrCpy $EST_RESPOSTA "ok"
  !insertmacro MUI_HEADER_TEXT "Servidor do ${EST_APP}" "O computador da empresa onde o sistema está instalado."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    StrCpy $EST_RESPOSTA "erro"
    Return
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 36u ""
  Pop $hEstStatus
  ${NSD_CreateListBox} 0 38u 100% 42u ""
  Pop $hEstLista
  ${NSD_OnChange} $hEstLista EstAoEscolher
  ${NSD_CreateLabel} 0 84u 100% 10u "Nome ou IP do servidor:"
  Pop $0
  ${NSD_CreateText} 0 95u 64% 13u ""
  Pop $hEstCampo
  ${NSD_SetTextLimit} $hEstCampo 255
  ${NSD_CreateButton} 67% 94u 33% 15u "Procurar de novo"
  Pop $0
  ${NSD_OnClick} $0 EstAoProcurar
  ${NSD_CreateLabel} 0 113u 100% 26u "Exemplos: SERVIDOR, 192.168.0.10 ou 192.168.0.10:4851 (quando a porta não é a ${EST_PORTA_PADRAO}). O nome e o IP do servidor aparecem na tela final da instalação dele."
  Pop $0
  Call EstMostrarResultado
FunctionEnd

; Preenche a lista, o texto e o campo com o resultado da última procura
Function EstMostrarResultado
  SendMessage $hEstLista ${LB_RESETCONTENT} 0 0
  StrCpy $R1 1
  ${DoWhile} $R1 <= $EST_QTD
    ${If} $R1 > 20
      ${ExitDo}
    ${EndIf}
    ReadINIStr $R2 "${EST_RESULTADO}" "servidor$R1" "nome"
    ReadINIStr $R3 "${EST_RESULTADO}" "servidor$R1" "ip"
    ReadINIStr $R4 "${EST_RESULTADO}" "servidor$R1" "versao"
    ${If} $R2 == ""
      StrCpy $R2 $R3
    ${Else}
      StrCpy $R2 "$R2   ($R3)"
    ${EndIf}
    ${If} $R4 != ""
      StrCpy $R2 "$R2   —   versão $R4"
    ${EndIf}
    ${NSD_LB_AddString} $hEstLista $R2
    IntOp $R1 $R1 + 1
  ${Loop}

  ; O primeiro da lista (o esperado vem primeiro), para o texto
  ReadINIStr $R2 "${EST_RESULTADO}" "servidor1" "nome"
  ReadINIStr $R3 "${EST_RESULTADO}" "servidor1" "ip"
  ReadINIStr $R4 "${EST_RESULTADO}" "servidor1" "versao"
  ${If} $R2 == ""
    StrCpy $R2 $R3
  ${Else}
    StrCpy $R2 "$R2 ($R3)"
  ${EndIf}
  StrCpy $R5 $EST_NOME
  ${If} $R5 == ""
    StrCpy $R5 $EST_ENDERECO
  ${EndIf}
  ${If} $EST_SITUACAO == "ok"
    ${NSD_SetText} $hEstStatus "Servidor encontrado: $R2, versão $R4."
  ${ElseIf} $EST_SITUACAO == "outro"
    ${NSD_SetText} $hEstStatus "O servidor usado até agora ($R5) não respondeu, mas há outro servidor do ${EST_APP} nesta rede: $R2. Se a empresa trocou mesmo de servidor, clique nele na lista. Senão, confira se o de sempre está ligado e clique em Procurar de novo."
  ${ElseIf} $EST_SITUACAO == "varios"
    ${NSD_SetText} $hEstStatus "Há $EST_QTD servidores do ${EST_APP} nesta rede, e a empresa deve usar um só. Escolha na lista o certo, conferindo o IP (o outro pode ser uma instalação antiga, de teste ou uma cópia que ficou ligada)."
  ${ElseIf} $EST_SITUACAO == "nenhum"
    ${NSD_SetText} $hEstStatus "Nenhum servidor do ${EST_APP} respondeu nesta rede. Confira se o computador servidor está ligado e conectado à rede da empresa e clique em Procurar de novo, ou digite abaixo o nome ou o IP dele."
  ${Else}
    ${NSD_SetText} $hEstStatus "Não foi possível procurar o servidor automaticamente neste computador. Digite abaixo o nome ou o IP do servidor."
  ${EndIf}

  ; Só "ok" já vem escolhido. Com "outro" e "varios", o campo fica com o servidor de antes: trocar de
  ; servidor é sempre um clique do usuário na lista (e uma confirmação, EstConfirmarTroca)
  ${If} $EST_SITUACAO == "ok"
    SendMessage $hEstLista ${LB_SETCURSEL} 0 0
    StrCpy $R1 1
    Call EstTextoDoServidor
    ${NSD_SetText} $hEstCampo $R2
  ${Else}
    ${NSD_GetText} $hEstCampo $R2
    ${If} $R2 == ""
    ${AndIf} $EST_ENDERECO != ""
      StrCpy $R2 $EST_ENDERECO
      ${If} $EST_PORTA != "${EST_PORTA_PADRAO}"
        StrCpy $R2 "$R2:$EST_PORTA"
      ${EndIf}
      ${NSD_SetText} $hEstCampo $R2
    ${EndIf}
  ${EndIf}
FunctionEnd

; $R1 = número do servidor na última procura. Saída: $R2 = "endereço" ou "endereço:porta"
Function EstTextoDoServidor
  ReadINIStr $R2 "${EST_RESULTADO}" "servidor$R1" "endereco"
  ReadINIStr $R3 "${EST_RESULTADO}" "servidor$R1" "porta"
  ${If} $R3 != ""
  ${AndIf} $R3 != "${EST_PORTA_PADRAO}"
    StrCpy $R2 "$R2:$R3"
  ${EndIf}
FunctionEnd

; Clique na lista: o servidor escolhido vai para o campo
Function EstAoEscolher
  Pop $0
  SendMessage $hEstLista ${LB_GETCURSEL} 0 0 $1
  ${If} $1 >= 0
    IntOp $R1 $1 + 1
    Call EstTextoDoServidor
    ${NSD_SetText} $hEstCampo $R2
  ${EndIf}
FunctionEnd

; "Procurar de novo": o que estiver digitado também entra na procura
Function EstAoProcurar
  Pop $0
  StrCpy $R2 $EST_ENDERECO
  StrCpy $R3 $EST_PORTA
  ${NSD_GetText} $hEstCampo $R0
  Call EstSeparar
  ${If} $EST_RESPOSTA == "ok"
    ${If} $EST_ENDERECO != $R2
    ${OrIf} $EST_PORTA != $R3
      StrCpy $EST_NOME ""           ; outro endereço: procura sem esperar um nome ou um id
      StrCpy $EST_ID ""
      StrCpy $EST_IP ""
    ${EndIf}
  ${Else}
    StrCpy $EST_ENDERECO $R2
    StrCpy $EST_PORTA $R3
  ${EndIf}
  Call EstProcurarComAviso
  Call EstMostrarResultado
FunctionEnd

; Ao sair da página: entende e testa o endereço do campo. $EST_RESPOSTA = ok (respondeu; $EST_* prontos
; para gravar), falhou (não respondeu; $EST_* com o endereço digitado), vazio (campo em branco) ou
; ficar (o aviso já foi mostrado: texto inválido, endereço fora da rede local, ou outro servidor e o
; usuário não confirmou a troca).
Function EstPaginaSair
  ${NSD_GetText} $hEstCampo $R0
  StrCpy $R4 $R0
  Call EstSeparar
  ${If} $EST_RESPOSTA == "vazio"
    Return
  ${ElseIf} $EST_RESPOSTA != "ok"
    MessageBox MB_ICONEXCLAMATION "$\"$R4$\" não é um nome ou IP de computador.$\r$\n$\r$\nDigite só o nome do computador servidor (por exemplo, SERVIDOR) ou o IP dele (por exemplo, 192.168.0.10). Se a porta não for a ${EST_PORTA_PADRAO}, acrescente dois-pontos e a porta: 192.168.0.10:4851."
    StrCpy $EST_RESPOSTA "ficar"
    Return
  ${EndIf}
  ; Quem escolhe aqui é o usuário: vale o servidor que responder neste endereço, mas trocar o servidor
  ; usado até agora por outro pede confirmação
  StrCpy $EST_NOME ""
  StrCpy $EST_ID ""
  StrCpy $EST_IP ""
  StrCpy $EST_VERSAO ""
  Call EstCompletarDaLista
  Call EstTestar
  ${If} $EST_RESPOSTA == "ok"
    Call EstConfirmarTroca
  ${ElseIf} $EST_RESPOSTA == "fora"
    MessageBox MB_ICONEXCLAMATION "$EST_ENDERECO leva a um endereço de fora da rede da empresa, e o servidor do ${EST_APP} só funciona pela rede local.$\r$\n$\r$\nConfira o nome ou digite o IP do servidor (por exemplo, 192.168.0.10)."
    StrCpy $EST_RESPOSTA "ficar"
  ${EndIf}
FunctionEnd

; O servidor que respondeu não é o usado até agora neste computador (outro id ou, sem id guardado,
; outro nome)? Pergunta antes de trocar, com Não como padrão: com dois servidores ligados, cada
; computador acabaria vendo e gravando os certificados num banco de dados diferente.
; Não: $EST_RESPOSTA = "ficar".
Function EstConfirmarTroca
  StrCpy $0 0
  ${If} $EST_CONHECIDO_ID != ""
    ${If} $EST_ID != $EST_CONHECIDO_ID
      StrCpy $0 1
    ${EndIf}
  ${ElseIf} $EST_CONHECIDO_NOME != ""
  ${AndIf} $EST_NOME != $EST_CONHECIDO_NOME
    StrCpy $0 1
  ${EndIf}
  ${If} $0 = 0
    Return
  ${EndIf}
  StrCpy $1 $EST_NOME
  ${If} $1 == ""
    StrCpy $1 $EST_ENDERECO
  ${EndIf}
  ${If} $EST_NOME != ""
  ${AndIf} $EST_NOME == $EST_CONHECIDO_NOME
    StrCpy $2 "O servidor que respondeu em $EST_ENDERECO tem o mesmo nome ($1), mas não é o servidor do ${EST_APP} usado até agora neste computador: é outra instalação, com outro banco de dados (um servidor reinstalado do zero ou uma cópia, por exemplo)."
  ${Else}
    StrCpy $3 ""
    ${If} $EST_CONHECIDO_NOME != ""
      StrCpy $3 " ($EST_CONHECIDO_NOME)"
    ${EndIf}
    StrCpy $2 "$1 não é o servidor do ${EST_APP} usado até agora neste computador$3."
  ${EndIf}
  ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "$2$\r$\n$\r$\nA empresa deve ter um servidor só. Trocar de servidor faz este computador ver e gravar os certificados em outro banco de dados: só troque se a empresa trocou mesmo de servidor.$\r$\n$\r$\nUsar $1 a partir de agora?" IDYES`
    StrCpy $EST_RESPOSTA "ficar"
    StrCpy $EST_NOME $EST_CONHECIDO_NOME   ; "Procurar de novo" volta a procurar o servidor de antes
    StrCpy $EST_ID $EST_CONHECIDO_ID
  ${EndIf}
FunctionEnd

; ------------------------------------------------------------ Navegador
; $R2 = msedge.exe ou chrome.exe. Saída: $R0 = caminho, pelo App Paths (HKLM nas visões de 64 e 32
; bits e HKCU); "" se não achar
Function EstLerAppPath
  StrCpy $R0 ""
  ${If} ${RunningX64}
    SetRegView 64
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$R2" ""
    Call EstConferirExe
  ${EndIf}
  ${If} $R0 == ""
    SetRegView 32
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$R2" ""
    Call EstConferirExe
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\$R2" ""
    Call EstConferirExe
  ${EndIf}
  ${If} ${RunningX64}
    SetRegView 64
  ${Else}
    SetRegView default
  ${EndIf}
FunctionEnd

; Tira as aspas de $R0 e o esvazia se o arquivo não existir
Function EstConferirExe
  ${If} $R0 == ""
    Return
  ${EndIf}
  StrCpy $0 $R0 1
  ${If} $0 == "$\""
    StrCpy $R0 $R0 "" 1
    StrCpy $0 $R0 1 -1
    ${If} $0 == "$\""
      StrCpy $R0 $R0 -1
    ${EndIf}
  ${EndIf}
  ${IfNot} ${FileExists} "$R0"
    StrCpy $R0 ""
  ${EndIf}
FunctionEnd

; Microsoft Edge (de preferência) ou Google Chrome, que abrem o sistema em janela própria (--app).
; Saída: $R0 = caminho ("" se não há nenhum dos dois), $R1 = pasta do perfil (Navegador ou Chrome)
Function EstAcharNavegador
  StrCpy $R1 "Navegador"
  StrCpy $R2 "msedge.exe"
  Call EstLerAppPath
  ${If} $R0 == ""
    StrCpy $R0 "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
    Call EstConferirExe
  ${EndIf}
  ${If} $R0 == ""
    StrCpy $R0 "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
    Call EstConferirExe
  ${EndIf}
  ${If} $R0 == ""
    StrCpy $R1 "Chrome"
    StrCpy $R2 "chrome.exe"
    Call EstLerAppPath
  ${EndIf}
  ${If} $R0 == ""
    StrCpy $R0 "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
    Call EstConferirExe
  ${EndIf}
  ${If} $R0 == ""
    StrCpy $R0 "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
    Call EstConferirExe
  ${EndIf}
  ${If} $R0 == ""
    StrCpy $R0 "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    Call EstConferirExe
  ${EndIf}
FunctionEnd

!ifdef EST_LANCADOR
; Abre $EST_URL numa janela própria, sem abas nem barra de endereço: Edge (ou Chrome) com --app e um
; perfil só do BC Calibração (%LOCALAPPDATA%\BC Calibracao\Navegador), separado do navegador de uso
; pessoal (login, extensões, "restaurar abas"). O tamanho e a posição da janela ficam guardados nele.
; Sem Edge nem Chrome: o navegador padrão, menos o Internet Explorer, que não roda o sistema.
Function EstAbrirSistema
  Call EstAcharNavegador
  ${If} $R0 != ""
    SetOutPath "$LOCALAPPDATA\BC Calibracao\$R1"   ; cria a pasta do perfil e é a pasta de trabalho
    ClearErrors
    Exec '"$R0" --app=$EST_URL --user-data-dir="$LOCALAPPDATA\BC Calibracao\$R1" --no-first-run --no-default-browser-check'
    ${IfNot} ${Errors}
      Return
    ${EndIf}
  ${EndIf}
  ReadRegStr $R3 HKCU "Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" "ProgId"
  ${If} $R3 == ""
  ${OrIf} $R3 == "IE.HTTP"
    ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Não encontrei o Microsoft Edge nem o Google Chrome neste computador. O ${EST_APP} abre numa janela própria pelo Microsoft Edge, que é gratuito e já vem no Windows 10 e no 11: peça para instalá-lo.$\r$\n$\r$\nAbrir o sistema no navegador padrão mesmo assim?" IDYES`
      Return
    ${EndIf}
  ${EndIf}
  ExecShell "open" "$EST_URL"
FunctionEnd
!endif
