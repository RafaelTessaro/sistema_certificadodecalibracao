<#
  Proteção do certificado digital da empresa pelo Windows (DPAPI, escopo da máquina) para o BC Calibração.
  Quem chama é o serviço (server/assinatura/cofre.ts), nunca uma pessoa:
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File protecao-windows.ps1 proteger|abrir
  Entrada padrão: 2 linhas em base64 (os dados e a entropia). Saída padrão: o resultado em base64. Nada vai para arquivo
  nem para a linha de comando. O escopo da máquina vale para o serviço como LocalService ou LocalSystem (opção /CONTA do
  instalador); o arquivo cifrado só abre neste computador, com esta instalação do Windows. Nele, QUALQUER conta deste
  computador abre o que foi cifrado: por isso a entropia que o serviço manda leva, além do sha256 do certificado (público),
  um segredo aleatório guardado fora da pasta dados (C:\ProgramData\BC Calibracao\certificado-digital.segredo, só para
  SYSTEM, Administradores e a conta LocalService, que é a de todo serviço que roda como ela). Sem ele, a cópia da pasta
  dados não abre em outro computador nem, aqui, por uma conta que não é administradora.
  Precisa do Windows PowerShell 5.1 no modo de linguagem completo: com o AppLocker ou o WDAC no modo restrito
  (ConstrainedLanguage), o tipo ProtectedData é bloqueado e o sistema recusa com uma mensagem (nunca guarda aberto).
#>
param([Parameter(Mandatory = $true)][ValidateSet('proteger', 'abrir')][string]$Acao)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$linhas = [Console]::In.ReadToEnd().Split("`n")
if ($linhas.Length -lt 2) { throw 'Entrada incompleta.' }
$dados = [Convert]::FromBase64String($linhas[0].Trim())
$entropia = [Convert]::FromBase64String($linhas[1].Trim())
$escopo = [System.Security.Cryptography.DataProtectionScope]::LocalMachine
if ($Acao -eq 'proteger') {
  $saida = [System.Security.Cryptography.ProtectedData]::Protect($dados, $entropia, $escopo)
} else {
  $saida = [System.Security.Cryptography.ProtectedData]::Unprotect($dados, $entropia, $escopo)
}
[Console]::Out.Write([Convert]::ToBase64String($saida))
