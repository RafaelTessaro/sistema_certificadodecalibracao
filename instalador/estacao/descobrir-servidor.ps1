<#
  Acha o servidor do BC Calibração na rede local, para o modo Estação. Quem chama:
    - o instalador (instalador\bc-calibracao.nsi), na página "Servidor do BC Calibração";
    - o programa das estações (instalador\estacao\lancador.nsi, "BC Calibracao.exe"), quando o
      servidor guardado não responde.
  Os dois rodam este script pelo nsExec, que esconde a janela do console (nada pisca na tela).

    powershell -NoProfile -NonInteractive -InputFormat None -ExecutionPolicy Bypass -File descobrir-servidor.ps1
        [-Saida arquivo.ini] [-Porta 4850] [-SemVarredura] [-Json]
    Variáveis de ambiente (assim nada digitado ou recebido da rede entra numa linha de comando):
      BC_CONHECIDOS  nomes e IPs já conhecidos do servidor, separados por vírgula ("SERVIDOR,192.168.0.10")
      BC_ID          id do servidor usado até agora (o "id" do /api/saude, que acompanha os dados dele).
                     Com ele, só é o esperado o servidor com esse id, mesmo que tenha mudado de nome
      BC_NOME        nome do computador servidor usado até agora. Sem BC_ID, só é o esperado o
                     servidor que informa esse nome. Sem nenhum dos dois, qualquer servidor serve.
                     Um servidor que não informa id nem nome (versão anterior à 1.2, como um servidor
                     antigo que ficou ligado) nunca é o esperado

  Como procura (só IPv4, porque o servidor escuta em 0.0.0.0, e só endereços da rede local, com a mesma
  regra do servidor, ipDaRedeLocal em server/app.ts: um nome que resolve para um IP da internet é
  descartado):
    1. Conhecidos: GET http://IP:porta/api/saude nos IPs conhecidos e, ao mesmo tempo, resolução dos nomes
       conhecidos pelo Windows (arquivo hosts, DNS, LLMNR, mDNS e NetBIOS; NOME e NOME.local), com prazo
       próprio, porque o prazo das requisições HTTP não cobre a consulta de nomes, que pode levar 15 s.
       Se responder o servidor esperado (mesmo id ou, sem id, mesmo nome), para aqui.
    2. Procura: conexões TCP na porta, em lotes de 256, em todos os endereços das sub-redes privadas
       (RFC 1918) das placas de rede ativas (sem VPN, túnel e placas virtuais sem gateway; sub-rede maior
       que /22 vira a /24 do próprio IP) e GET /api/saude nos que aceitaram. Só é BC Calibração quem
       responder "app":"bc-calibracao". Nenhuma porta nova, nada no Firewall: é a mesma porta TCP que o
       servidor já libera para a rede local.
    3. Endereço: http://NOME:porta/ se o nome que o servidor informa resolve DESTA estação para o mesmo IP
       e o servidor aceita esse nome (sobrevive a uma troca de IP); senão http://IP:porta/.
  Um servidor é um processo: as respostas com a mesma "instancia" (e o mesmo id, nome e versão) vêm do
  mesmo servidor, achado pelo IP, pelo nome ou por duas placas de rede. Respostas sem instância
  (versão antiga) contam um servidor por IP.
  Nunca troca de servidor sozinho: se o servidor esperado não aparece e aparece outro (também um sem
  nome), a situação é "outro" e quem chamou pergunta ao usuário. Dois servidores com o mesmo id ou o
  mesmo nome (cópia do disco ou da máquina virtual, servidor trocado de computador com o antigo ainda
  ligado, ou um aparelho que se faz passar pelo servidor) dão sempre "varios", e quem chamou pergunta.

  Resultado (-Saida): arquivo INI em UTF-16 com BOM (lido pelo ReadINIStr do NSIS):
    [resultado]  situacao=ok|outro|varios|nenhum|erro  quantidade=N  etapa=conhecido|procura  ms=...
    [servidor1]  nome= id= ip= versao= porta= endereco= url=  (o servidor certo, se houver, vem primeiro)
  Código de saída: 0 = ok (o esperado, sem outro com o mesmo id ou nome, ou o único quando não há um
  esperado); 10 = nenhum; 11 = vários; 12 = outro;
  9 = erro (qualquer outro código, inclusive o 1 do PowerShell quando o script nem roda, também é erro).

  Compatível com o Windows PowerShell 5.1 (Windows 10 1607 e Windows Server 2016 em diante, .NET 4.6.2+).
  Salvo em UTF-8 com BOM: sem o BOM, o 5.1 leria os acentos como ANSI.
#>
param(
  [string]$Saida = '',
  [int]$Porta = 4850,
  [string]$Conhecidos = $env:BC_CONHECIDOS,
  [string]$Id = $env:BC_ID,
  [string]$Nome = $env:BC_NOME,
  # Só para testes: redes a varrer no lugar das placas (ex.: 127.0.0.1/32,192.168.0.0/24), sem o filtro
  # de faixas privadas
  [string]$Redes = '',
  [switch]$SemVarredura,
  [switch]$Json,
  [int]$ConexaoMs = 1000,   # prazo de cada lote de conexões TCP
  [int]$HttpMs = 1500,      # prazo do GET /api/saude
  [int]$NomeMs = 2000,      # prazo da resolução de nomes
  [int]$MaxHosts = 1022     # sub-rede maior que isso (/22): só a /24 do próprio IP
)

$ErrorActionPreference = 'Stop'
$relogio = [System.Diagnostics.Stopwatch]::StartNew()

# ------------------------------------------------------------------------------------------- auxiliares
# Nome de computador ou IPv4: letras sem acento, dígitos, ponto, hífen e sublinhado. Tudo o que vem de
# fora (registro, rede, digitado) passa por aqui antes de ser usado ou gravado.
function Limpar-Host([string]$Texto) {
  $t = ([string]$Texto).Trim().TrimEnd('.')
  if ($t.Length -ge 1 -and $t.Length -le 253 -and $t -cmatch '^[A-Za-z0-9_]([A-Za-z0-9_.-]*[A-Za-z0-9_])?$' -and
    $t -notmatch '\.\.') { return $t }
  return ''
}

# Id do servidor e instância: hexadecimal, de 8 a 64 dígitos (o servidor manda 32), em minúsculas
function Limpar-Id([string]$Texto) {
  $t = ([string]$Texto).Trim()
  if ($t -match '^[0-9a-fA-F]{8,64}$') { return $t.ToLowerInvariant() }
  return ''
}

function Limpar-Versao([string]$Texto) {
  $t = ([string]$Texto).Trim()
  if ($t -cmatch '^[0-9A-Za-z.+-]{1,40}$') { return $t }
  return ''
}

function Eh-IPv4([string]$Texto) {
  if ($Texto -cnotmatch '^[0-9]{1,3}(\.[0-9]{1,3}){3}$') { return $false }
  foreach ($parte in $Texto.Split('.')) { if ([int]$parte -gt 255) { return $false } }
  return $true
}

# Endereço que o servidor aceita: a mesma regra do ipDaRedeLocal (server/app.ts) para IPv4, isto é, o
# próprio computador (127.x), as faixas privadas (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x)
# e CGNAT de VPN corporativa (100.64-127.x). O servidor nunca está fora delas.
function Eh-IPLocal([string]$Ip) {
  if (-not (Eh-IPv4 $Ip)) { return $false }
  $b = @($Ip.Split('.') | ForEach-Object { [int]$_ })
  return ($b[0] -eq 127) -or ($b[0] -eq 10) -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or
    ($b[0] -eq 192 -and $b[1] -eq 168) -or ($b[0] -eq 169 -and $b[1] -eq 254) -or ($b[0] -eq 100 -and $b[1] -ge 64 -and $b[1] -le 127)
}

# Sem repetição, sem diferenciar maiúsculas (o Select-Object -Unique diferencia)
function Unicos($Itens) {
  $vistos = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($i in $Itens) { if ($i -and $vistos.Add([string]$i)) { [string]$i } }
}

# NOME também como NOME.local (mDNS explícito); nomes com ponto (FQDN) ficam como estão
function Variantes($Nomes) {
  foreach ($n in $Nomes) {
    if (-not $n -or (Eh-IPv4 $n)) { continue }
    $n
    if ($n -notmatch '\.') { "$n.local" }
  }
}

function IP-ParaNumero([string]$Ip) {
  $b = ([System.Net.IPAddress]::Parse($Ip)).GetAddressBytes()
  return [int64]$b[0] * 16777216 + [int64]$b[1] * 65536 + [int64]$b[2] * 256 + [int64]$b[3]
}

function Numero-ParaIP([int64]$N) {
  return '{0}.{1}.{2}.{3}' -f (($N -shr 24) -band 255), (($N -shr 16) -band 255), (($N -shr 8) -band 255), ($N -band 255)
}

# Espera as tarefas até o prazo. O WaitAll lança AggregateException quando todas acabaram e alguma
# falhou (conexão recusada, nome inexistente): é o normal aqui, o resultado é lido tarefa por tarefa.
function Esperar-Tarefas($Tarefas, [int]$Ms) {
  $lista = @($Tarefas | Where-Object { $_ })
  if ($lista.Count -eq 0) { return }
  try { [void][System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]$lista, $Ms) } catch { }
}

# ------------------------------------------------------------------------------------------- nomes
# Uma consulta por nome, reaproveitada entre as etapas (nome -> tarefa do Dns.GetHostAddressesAsync)
$resolucoes = @{}

function Resolver($Nomes) {
  foreach ($n in $Nomes) {
    if (-not $n) { continue }
    $chave = $n.ToLowerInvariant()
    if ($resolucoes.ContainsKey($chave)) { continue }
    try { $tarefa = [System.Net.Dns]::GetHostAddressesAsync($n) } catch { continue }
    $resolucoes[$chave] = [pscustomobject]@{ Nome = $n; Tarefa = $tarefa }
  }
}

# Alvos { Ip; Host } dos nomes já resolvidos (espera até $Ms pelos que ainda não terminaram). Um nome
# que resolve (também) para um IP fora da rede local é descartado inteiro: o servidor nunca está lá, e
# o navegador da estação, aberto por esse nome, poderia ir para esse IP.
function Resolvidos($Nomes, [int]$Ms) {
  $itens = @(foreach ($n in $Nomes) {
      if ($n -and $resolucoes.ContainsKey($n.ToLowerInvariant())) { $resolucoes[$n.ToLowerInvariant()] }
    })
  Esperar-Tarefas @($itens | ForEach-Object { $_.Tarefa }) $Ms
  foreach ($r in $itens) {
    if ([string]$r.Tarefa.Status -ne 'RanToCompletion') { continue }
    $ips = @(Unicos @($r.Tarefa.Result | Where-Object {
          $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } | ForEach-Object { $_.ToString() }))
    if (@($ips | Where-Object { -not (Eh-IPLocal $_) }).Count -gt 0) { continue }
    foreach ($ip in $ips) { [pscustomobject]@{ Ip = $ip; Host = $r.Nome } }
  }
}

# ------------------------------------------------------------------------------------------- HTTP
# GET /api/saude em vários alvos ao mesmo tempo, sempre pelo IP e só na rede local (Eh-IPLocal). Com
# Host, manda "Host: NOME:porta":
# confere ao mesmo tempo o nome e se o servidor o aceita. Sem proxy: o proxy do Windows não serve
# para a rede local (o Invoke-WebRequest do 5.1 não tem -NoProxy, por isso o HttpClient).
function Testar-Saude($Alvos) {
  $Alvos = @($Alvos | Where-Object { $_ -and (Eh-IPLocal $_.Ip) })
  if ($Alvos.Count -eq 0) { return }
  $manipulador = New-Object System.Net.Http.HttpClientHandler
  $manipulador.UseProxy = $false
  $manipulador.AllowAutoRedirect = $false
  $cliente = New-Object System.Net.Http.HttpClient($manipulador)
  try {
    $cliente.Timeout = [TimeSpan]::FromMilliseconds($HttpMs)
    $cliente.MaxResponseContentBufferSize = 65536
    $pedidos = @(foreach ($a in $Alvos) {
        $msg = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, "http://$($a.Ip):$Porta/api/saude")
        if ($a.Host) { $msg.Headers.Host = "$($a.Host):$Porta" }
        try { [pscustomobject]@{ Alvo = $a; Tarefa = $cliente.SendAsync($msg) } } catch { }
      })
    Esperar-Tarefas @($pedidos | ForEach-Object { $_.Tarefa }) ($HttpMs + 300)
    foreach ($p in $pedidos) {
      if ([string]$p.Tarefa.Status -ne 'RanToCompletion') { continue }
      $resposta = $p.Tarefa.Result
      if ([int]$resposta.StatusCode -ne 200) { continue }
      try { $dados = $resposta.Content.ReadAsStringAsync().Result | ConvertFrom-Json } catch { continue }
      if ([string]$dados.app -ne 'bc-calibracao') { continue }
      [pscustomobject]@{
        Ip        = [string]$p.Alvo.Ip
        Host      = [string]$p.Alvo.Host
        Nome      = Limpar-Host ([string]$dados.nome)
        Id        = Limpar-Id ([string]$dados.id)
        Instancia = Limpar-Id ([string]$dados.instancia)
        Versao    = Limpar-Versao ([string]$dados.versao)
      }
    }
  } finally {
    $cliente.Dispose()
  }
}

# ------------------------------------------------------------------------------------------- varredura
# Sub-redes IPv4 privadas das placas ativas, as com gateway primeiro. Ficam de fora: loopback, túnel,
# VPN (pelo nome ou descrição da placa) e placas virtuais (Hyper-V, VirtualBox, WSL...) sem gateway;
# num Hyper-V com switch externo a rede de verdade está justamente no vEthernet, que tem gateway.
function Redes-Locais {
  if ($Redes) {
    foreach ($r in ($Redes -split '[,;\s]+')) {
      $partes = $r.Split('/')
      if ($partes.Count -eq 2 -and (Eh-IPv4 $partes[0]) -and $partes[1] -cmatch '^[0-9]{1,2}$') {
        [pscustomobject]@{ Ip = $partes[0]; Prefixo = [int]$partes[1]; ComGateway = $true }
      }
    }
    return
  }
  $vpn = 'TAP-|Tunnel|WireGuard|Wintun|OpenVPN|Fortinet|AnyConnect|GlobalProtect|PANGP|Juniper|Pulse Secure|Zscaler|Tailscale|ZeroTier|Hamachi|Npcap|WAN Miniport|Bluetooth'
  $virtual = 'Hyper-V|vEthernet|VirtualBox|VMware|Docker|WSL|Wi-Fi Direct'
  $lista = foreach ($placa in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ([string]$placa.OperationalStatus -ne 'Up') { continue }
    if (@('Loopback', 'Tunnel', 'Ppp') -contains [string]$placa.NetworkInterfaceType) { continue }
    $texto = "$($placa.Name) $($placa.Description)"
    if ($texto -match $vpn) { continue }
    $propriedades = $placa.GetIPProperties()
    $comGateway = @($propriedades.GatewayAddresses | Where-Object {
        $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
        -not $_.Address.Equals([System.Net.IPAddress]::Any) }).Count -gt 0
    if ($texto -match $virtual -and -not $comGateway) { continue }
    foreach ($u in $propriedades.UnicastAddresses) {
      if ($u.Address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
      $ip = $u.Address.ToString()
      $b = $u.Address.GetAddressBytes()
      $privado = ($b[0] -eq 10) -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168)
      if (-not $privado) { continue }
      # Prefixo pela máscara (conta os bits ligados); sem máscara, /24
      $prefixo = 24
      if ($u.IPv4Mask -and -not $u.IPv4Mask.Equals([System.Net.IPAddress]::Any)) {
        $prefixo = 0
        foreach ($octeto in $u.IPv4Mask.GetAddressBytes()) {
          for ($bit = 7; $bit -ge 0; $bit--) { if (($octeto -shr $bit) -band 1) { $prefixo++ } }
        }
      }
      [pscustomobject]@{ Ip = $ip; Prefixo = $prefixo; ComGateway = $comGateway }
    }
  }
  @($lista | Sort-Object @{ Expression = { if ($_.ComGateway) { 0 } else { 1 } } })
}

# Endereços da sub-rede (sem o da rede e o de broadcast), os da /24 do próprio IP primeiro
function Hosts-DaRede([string]$Ip, [int]$Prefixo) {
  if ($Prefixo -lt 8 -or $Prefixo -gt 32) { return }
  $n = IP-ParaNumero $Ip
  $tamanho = [int64][Math]::Pow(2, 32 - $Prefixo)
  if ($tamanho -gt ($MaxHosts + 2)) { $tamanho = 256 }
  $inicio = $n - ($n % $tamanho)
  if ($tamanho -le 2) {
    for ($i = 0; $i -lt $tamanho; $i++) { Numero-ParaIP ($inicio + $i) }
    return
  }
  $meu = $n - ($n % 256)
  $depois = New-Object System.Collections.Generic.List[string]
  for ($i = 1; $i -lt $tamanho - 1; $i++) {
    $h = $inicio + $i
    if (($h - ($h % 256)) -eq $meu) { Numero-ParaIP $h } else { $depois.Add((Numero-ParaIP $h)) }
  }
  $depois
}

# Conexões TCP simultâneas, em lotes de 256; devolve os IPs com a porta aberta. Para no primeiro lote
# em que achar alguém (normalmente o servidor está na mesma /24 da estação).
function Varrer-Porta($Ips) {
  $Ips = @($Ips)
  $abertos = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $Ips.Count; $i += 256) {
    $fim = [Math]::Min($i + 255, $Ips.Count - 1)
    $tentativas = New-Object System.Collections.Generic.List[object]
    for ($j = $i; $j -le $fim; $j++) {
      $c = New-Object System.Net.Sockets.TcpClient([System.Net.Sockets.AddressFamily]::InterNetwork)
      try {
        $t = $c.ConnectAsync([System.Net.IPAddress]::Parse($Ips[$j]), $Porta)
        $tentativas.Add([pscustomobject]@{ Ip = $Ips[$j]; Cliente = $c; Tarefa = $t })
      } catch { $c.Close() }
    }
    Esperar-Tarefas @($tentativas | ForEach-Object { $_.Tarefa }) $ConexaoMs
    foreach ($t in $tentativas) {
      if ([string]$t.Tarefa.Status -eq 'RanToCompletion' -and $t.Cliente.Connected) { $abertos.Add($t.Ip) }
      try { $t.Cliente.Close() } catch { }   # aborta as que ainda esperam (ninguém no IP, firewall que descarta)
    }
    if ($abertos.Count -gt 0) { break }
  }
  $abertos.ToArray()
}

# ------------------------------------------------------------------------------------------- resultado
function Gravar-Resultado([string]$Situacao, $Servidores, [string]$Etapa, [string]$Erro) {
  $Servidores = @($Servidores)
  $ms = $relogio.ElapsedMilliseconds
  if ($Saida) {
    $l = New-Object System.Collections.Generic.List[string]
    $l.Add('[resultado]')
    $l.Add("situacao=$Situacao")
    $l.Add("quantidade=$($Servidores.Count)")
    $l.Add("etapa=$Etapa")
    $l.Add("ms=$ms")
    if ($Erro) {
      $texto = ($Erro -replace '[\r\n]+', ' ')
      if ($texto.Length -gt 300) { $texto = $texto.Substring(0, 300) }
      $l.Add("erro=$texto")
    }
    $i = 0
    foreach ($s in $Servidores) {
      $i++
      $l.Add("[servidor$i]")
      $l.Add("nome=$($s.Nome)")
      $l.Add("id=$($s.Id)")
      $l.Add("ip=$($s.Ip)")
      $l.Add("versao=$($s.Versao)")
      $l.Add("porta=$Porta")
      $l.Add("endereco=$($s.Endereco)")
      $l.Add("url=$($s.Url)")
    }
    [System.IO.File]::WriteAllText($Saida, (($l -join "`r`n") + "`r`n"), (New-Object System.Text.UnicodeEncoding($false, $true)))
  }
  if ($Json) {
    [pscustomobject]@{ situacao = $Situacao; etapa = $Etapa; ms = $ms; erro = $Erro; servidores = $Servidores } |
      ConvertTo-Json -Compress -Depth 4
  } else {
    [Console]::Out.Write("$Situacao ($($Servidores.Count) servidor(es), etapa $Etapa, $ms ms)")
  }
}

# ------------------------------------------------------------------------------------------- algoritmo
try {
  Add-Type -AssemblyName System.Net.Http
  # O .NET Framework abre só 2 conexões por endereço: o mesmo IP pode ser testado com 2 ou 3 nomes
  [System.Net.ServicePointManager]::DefaultConnectionLimit = 64

  $nomeEsperado = Limpar-Host $Nome
  $idEsperado = Limpar-Id $Id
  $lista = @(Unicos @(([string]$Conhecidos -split '[,;\s]+') | ForEach-Object { Limpar-Host $_ }))
  $ipsConhecidos = @($lista | Where-Object { Eh-IPv4 $_ })
  $nomesConhecidos = @(Unicos (@($lista | Where-Object { -not (Eh-IPv4 $_) }) + @($nomeEsperado)))
  $variantes = @(Variantes $nomesConhecidos)
  Resolver $variantes

  $achados = New-Object System.Collections.Generic.List[object]
  $testados = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  # Testa só os alvos (IP + Host) ainda não testados e guarda o que responder
  function Testar-Novos($Alvos) {
    $novos = @(foreach ($a in @($Alvos)) { if ($a -and $testados.Add("$($a.Ip)|$($a.Host)")) { $a } })
    foreach ($r in @(Testar-Saude $novos)) { $achados.Add($r) }
  }
  # O servidor esperado: o mesmo id (os dados dele, mesmo que tenha mudado de nome) ou, sem id
  # conhecido, o mesmo nome. Sem nenhum dos dois, qualquer um. Um servidor sem id ou sem nome (versão
  # antiga) nunca é o esperado: pode ser o servidor antigo que ficou ligado, mesmo num IP conhecido (o
  # DHCP pode tê-lo dado a ele)
  $haEsperado = [bool]($idEsperado -or $nomeEsperado)
  function Eh-Esperado($S) {
    if ($idEsperado) { return [bool]($S.Id -and $S.Id -eq $idEsperado) }
    if ($nomeEsperado) { return [bool]($S.Nome -and $S.Nome -ieq $nomeEsperado) }
    return $true
  }
  function Achou-Esperado { @($achados | Where-Object { Eh-Esperado $_ }).Count -gt 0 }

  # 1) Conhecidos: os IPs agora; os nomes com prazo próprio (só mais 300 ms se o IP já respondeu)
  $etapa = 'conhecido'
  Testar-Novos @($ipsConhecidos | ForEach-Object { [pscustomobject]@{ Ip = $_; Host = '' } })
  $prazo = $NomeMs
  if (Achou-Esperado) { $prazo = 300 }
  Testar-Novos @(Resolvidos $variantes $prazo)

  # 2) Procura: varredura das sub-redes locais; os nomes conhecidos ganham mais um tempo
  if (-not (Achou-Esperado)) {
    $etapa = 'procura'
    if (-not $SemVarredura) {
      $ips = @(Unicos @(foreach ($r in @(Redes-Locais)) { Hosts-DaRede $r.Ip $r.Prefixo }))
      $abertos = @(Varrer-Porta $ips | Select-Object -First 32)
      Testar-Novos @($abertos | ForEach-Object { [pscustomobject]@{ Ip = $_; Host = '' } })
    }
    Testar-Novos @(Resolvidos $variantes 500)
  }

  # 3) Achou pelo IP? Vê se o nome que o servidor informa resolve DESTA estação para o mesmo IP e se o
  #    servidor aceita esse nome: o endereço por nome continua valendo quando o IP muda
  $semEnderecoPorNome = @(Unicos @($achados | Where-Object { $_.Nome } | ForEach-Object { $_.Nome }) | Where-Object {
      $n = $_
      @($achados | Where-Object { $_.Host -and $_.Nome -ieq $n }).Count -eq 0
    })
  if ($semEnderecoPorNome.Count -gt 0) {
    $v = @(Variantes $semEnderecoPorNome)
    Resolver $v
    $alvos = @(Resolvidos $v 1000 | Where-Object {
        $alvo = $_
        @($achados | Where-Object {
            $_.Nome -and $_.Ip -eq $alvo.Ip -and ($alvo.Host -ieq $_.Nome -or $alvo.Host -ieq "$($_.Nome).local") }).Count -gt 0
      })
    Testar-Novos $alvos
  }

  # Um servidor por processo: mesma instância, id, nome e versão (o mesmo servidor aparece pelo IP, pelo
  # nome e por cada placa de rede). Sem instância (versão antiga, ou quem não é o servidor de verdade):
  # um por IP. Nunca junta só pelo nome, que qualquer um pode informar
  $grupos = @($achados | Group-Object {
      if ($_.Instancia) { 'p:' + (@($_.Instancia, $_.Id, ([string]$_.Nome).ToLowerInvariant(), $_.Versao) -join '|') } else { 'i:' + $_.Ip }
    })
  # Mesmo nome ou mesmo id em mais de um servidor: nenhum deles é endereçado pelo nome (que pode levar a
  # qualquer um), e a situação vira "varios"
  function Repetidos($Chaves) {
    @($Chaves | Where-Object { $_ } | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
  }
  $nomesRepetidos = @(Repetidos @(foreach ($g in $grupos) { ([string]$g.Group[0].Nome).ToLowerInvariant() }))
  $idsRepetidos = @(Repetidos @(foreach ($g in $grupos) { [string]$g.Group[0].Id }))
  $servidores = @(foreach ($g in $grupos) {
      $itens = @($g.Group)
      $s = $itens[0]
      $repetido = [bool](($s.Nome -and $nomesRepetidos -contains $s.Nome.ToLowerInvariant()) -or ($s.Id -and $idsRepetidos -contains $s.Id))
      # Pelo nome se ele leva a este servidor (e só a ele); o IP é o do mesmo alvo, para o endereço e o
      # IP mostrados serem sempre do mesmo computador
      $porNome = @($itens | Where-Object { $_.Host } | Sort-Object { if ($_.Host -like '*.local') { 1 } else { 0 } })
      $porIp = @($itens | Where-Object { -not $_.Host })
      if ($porNome.Count -gt 0 -and -not $repetido) {
        $endereco = $porNome[0].Host
        $ip = $porNome[0].Ip
      } else {
        $ip = $s.Ip
        if ($porIp.Count -gt 0) { $ip = $porIp[0].Ip }
        $endereco = $ip
      }
      [pscustomobject]@{
        Nome     = $s.Nome
        Id       = $s.Id
        Ip       = $ip
        Versao   = $s.Versao
        Endereco = $endereco
        Url      = "http://${endereco}:$Porta/"
        Esperado = [bool]($haEsperado -and (Eh-Esperado $s))
        Repetido = $repetido
      }
    })
  # O esperado primeiro; depois por nome
  $servidores = @($servidores | Sort-Object @{ Expression = { if ($_.Esperado) { 0 } else { 1 } } }, Nome, Ip)

  $esperados = @($servidores | Where-Object { $_.Esperado })
  $situacao = 'nenhum'
  if ($esperados.Count -eq 1 -and -not $esperados[0].Repetido) {
    $situacao = 'ok'
  } elseif ($esperados.Count -ge 1) {
    # O esperado em dois computadores (uma cópia), ou outro com o mesmo nome: quem chamou pergunta
    $situacao = 'varios'
  } elseif ($servidores.Count -eq 1) {
    # Um só: é "ok" se não havia servidor esperado; senão é outro (outro id, outro nome ou nenhum),
    # e quem chamou pergunta: nunca troca de servidor sozinho
    $situacao = 'ok'
    if ($haEsperado) { $situacao = 'outro' }
  } elseif ($servidores.Count -gt 1) {
    $situacao = 'varios'
  }

  Gravar-Resultado $situacao $servidores $etapa ''
  $codigos = @{ ok = 0; nenhum = 10; varios = 11; outro = 12 }
  exit $codigos[$situacao]
} catch {
  try { Gravar-Resultado 'erro' @() 'erro' $_.Exception.Message } catch { }
  exit 9
}
