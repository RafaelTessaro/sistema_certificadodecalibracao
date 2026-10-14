<#
  Auxiliar do instalador do BC Calibração (instalador\bc-calibracao.nsi). O instalador e o desinstalador
  chamam este script para o que é difícil de fazer no NSIS sem depender do idioma do Windows (a saída
  do netstat, do sc e do net muda conforme o idioma: "LISTENING" vira "ESCUTANDO" em português).

    powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File auxiliar-instalador.ps1 -Acao <ação> [...]

  Ações:
    PortaEmUso -Porta N     algum programa já escuta na porta N? (saída: nome do programa)
    Redes                   confere e normaliza as redes extras do firewall, lidas da variável de
                            ambiente BC_REDES (assim o texto digitado nunca entra numa linha de comando);
                            saída: as redes separadas por vírgula, ou a primeira que não serve
    Parar -Servico X -Pasta P [-Desativar] [-Segundos N]
                            para o serviço X e espera até N segundos; depois encerra qualquer processo
                            que ainda esteja rodando de dentro da pasta P (o node.exe e o WinSW, para
                            os arquivos poderem ser trocados). -Desativar põe o serviço em "Desativado"
                            antes, para o Windows não reiniciá-lo no meio da atualização
    Esperar -Porta N [-Segundos N]
                            espera o sistema responder em http://127.0.0.1:N/api/saude
    RedesPublicas           placas de rede classificadas como "Pública" (saída: os nomes)
    Enderecos -Porta N      até 3 endereços http://IP:N deste computador, um por linha

  Código de saída: 0 = tudo certo (porta livre, redes válidas, serviço parado, sistema respondendo,
  nenhuma rede pública); 10 = achou o problema que a ação procura (detalhe na saída padrão); qualquer
  outro (inclusive o 1 do PowerShell quando o script nem roda) = não deu para conferir, e o instalador
  segue sem a conferência.

  Compatível com o Windows PowerShell 5.1 (Windows 10 e Windows Server 2016 em diante).
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('PortaEmUso', 'Redes', 'Parar', 'Esperar', 'RedesPublicas', 'Enderecos')]
  [string]$Acao,
  [int]$Porta = 4850,
  [string]$Servico = 'BCCalibracao',
  [string]$Pasta = '',
  [int]$Segundos = 90,
  [switch]$Desativar
)

$ErrorActionPreference = 'Stop'
$PROBLEMA = 10

# Uma rede aceita pelo netsh em remoteip=: IPv4 (192.168.20.5), sub-rede IPv4 de /8 a /32
# (192.168.20.0/24), faixa IPv4 (192.168.20.10-192.168.20.50) ou IPv6 com ou sem prefixo (de /7 a /128).
# Prefixos mais curtos que /8 (ex.: 0.0.0.0/0) abririam a porta para a internet inteira: são recusados.
function Testar-Rede([string]$Texto) {
  # Só dígitos, letras de A a F, ponto, dois-pontos, barra e hífen: nada mais chega ao netsh
  if ($Texto -notmatch '^[0-9A-Fa-f:./-]+$') { return $false }
  $octeto = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
  $ipv4 = "$octeto(\.$octeto){3}"
  if ($Texto -match "^$ipv4$") { return $true }
  if ($Texto -match "^$ipv4/(?<prefixo>[0-9]{1,2})$") {
    $prefixo = [int]$Matches['prefixo']
    return ($prefixo -ge 8 -and $prefixo -le 32)
  }
  if ($Texto -match "^$ipv4-$ipv4$") { return $true }
  $partes = $Texto.Split('/')
  if ($partes.Count -gt 2 -or -not $partes[0].Contains(':')) { return $false }
  $endereco = $null
  if (-not [Net.IPAddress]::TryParse($partes[0], [ref]$endereco)) { return $false }
  if ($endereco.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetworkV6) { return $false }
  if ($partes.Count -eq 1) { return $true }
  $prefixo = 0
  if (-not [int]::TryParse($partes[1], [ref]$prefixo)) { return $false }
  return ($prefixo -ge 7 -and $prefixo -le 128)
}

try {
  switch ($Acao) {
    'PortaEmUso' {
      $conexoes = @(Get-NetTCPConnection -State Listen -LocalPort $Porta -ErrorAction SilentlyContinue)
      if ($conexoes.Count -eq 0) { exit 0 }
      $processo = Get-Process -Id $conexoes[0].OwningProcess -ErrorAction SilentlyContinue
      if ($processo) { $nome = $processo.ProcessName } else { $nome = "processo $($conexoes[0].OwningProcess)" }
      [Console]::Out.Write($nome)
      exit $PROBLEMA
    }

    'Redes' {
      $redes = New-Object System.Collections.Generic.List[string]
      foreach ($parte in ([string]$env:BC_REDES -split '[,;\s]+')) {
        if (-not $parte) { continue }
        # A rede do próprio servidor (localsubnet) sempre entra na regra
        if ($parte -ieq 'localsubnet') { continue }
        if (-not (Testar-Rede $parte)) {
          [Console]::Out.Write($parte)
          exit $PROBLEMA
        }
        if (-not ($redes | Where-Object { $_ -ieq $parte })) { $redes.Add($parte) }
      }
      [Console]::Out.Write(($redes -join ','))
      exit 0
    }

    'Parar' {
      $servicoWin = Get-Service -Name $Servico -ErrorAction SilentlyContinue
      if ($servicoWin) {
        if ($Desativar) { Set-Service -Name $Servico -StartupType Disabled -ErrorAction SilentlyContinue }
        $limite = (Get-Date).AddSeconds($Segundos)
        while ($true) {
          $servicoWin.Refresh()
          if ($servicoWin.Status -eq 'Stopped') { break }
          if ($servicoWin.Status -eq 'Running' -or $servicoWin.Status -eq 'Paused') {
            try { $servicoWin.Stop() } catch { }
          }
          if ((Get-Date) -gt $limite) { break }
          Start-Sleep -Milliseconds 500
        }
      }
      # O que sobrou rodando de dentro da pasta do programa (serviço travado, ou a ferramenta de senha
      # aberta) prenderia o node.exe: encerra, para os arquivos poderem ser trocados ou apagados
      if ($Pasta) {
        $prefixo = $Pasta.TrimEnd('\') + '\'
        Get-Process -ErrorAction SilentlyContinue |
          Where-Object { $_.Path -and $_.Path.StartsWith($prefixo, [StringComparison]::OrdinalIgnoreCase) } |
          ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
      }
      $servicoWin = Get-Service -Name $Servico -ErrorAction SilentlyContinue
      if ($servicoWin -and $servicoWin.Status -ne 'Stopped') {
        [Console]::Out.Write([string]$servicoWin.Status)
        exit $PROBLEMA
      }
      exit 0
    }

    'Esperar' {
      # 127.0.0.1 e sem proxy: o servidor escuta em IPv4 e um proxy configurado no Windows não deve atrapalhar
      $endereco = "http://127.0.0.1:$Porta/api/saude"
      $limite = (Get-Date).AddSeconds($Segundos)
      do {
        try {
          $pedido = [Net.WebRequest]::Create($endereco)
          $pedido.Proxy = $null
          $pedido.Timeout = 5000
          $resposta = $pedido.GetResponse()
          $codigo = [int]$resposta.StatusCode
          $resposta.Close()
          if ($codigo -eq 200) { exit 0 }
        } catch { }
        Start-Sleep -Seconds 2
      } while ((Get-Date) -lt $limite)
      exit $PROBLEMA
    }

    'RedesPublicas' {
      $publicas = @(Get-NetConnectionProfile -ErrorAction Stop | Where-Object { [string]$_.NetworkCategory -eq 'Public' })
      if ($publicas.Count -eq 0) { exit 0 }
      [Console]::Out.Write((($publicas | ForEach-Object { $_.InterfaceAlias }) -join ', '))
      exit $PROBLEMA
    }

    'Enderecos' {
      # Placas com rota padrão (a rede "de verdade") primeiro; sem loopback e sem 169.254 (sem DHCP)
      $comRota = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | ForEach-Object { $_.InterfaceIndex })
      $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
          Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and [string]$_.AddressState -eq 'Preferred' } |
          Sort-Object @{ Expression = { if ($comRota -contains $_.InterfaceIndex) { 0 } else { 1 } } }, InterfaceIndex |
          ForEach-Object { $_.IPAddress } |
          Select-Object -Unique -First 3)
      [Console]::Out.Write((($ips | ForEach-Object { "http://$($_):$Porta" }) -join "`r`n"))
      exit 0
    }
  }
} catch {
  [Console]::Out.Write($_.Exception.Message)
  exit 9
}
