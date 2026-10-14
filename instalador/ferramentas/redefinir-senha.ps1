<#
  Cria o administrador ou redefine a senha de qualquer usuário do BC Calibração, no computador do
  servidor: esqueceu a senha, perdeu o administrador ou a conta ficou bloqueada por tentativas erradas.

  Use o atalho: no Iniciar, digite BC Calibração e abra "Redefinir senha do BC Calibração" (ou procure
  em Todos os aplicativos > BC Calibração); ele pede a permissão de administrador. O atalho abre o
  redefinir-senha.bat desta pasta, que roda este script como Administrador.

  Usa sempre a instalação: o node.exe e a ferramenta server\ferramentas\redefinir-senha.mjs da pasta
  do programa (a pasta acima desta) e o banco PastaDados\bc-calibracao.db. A pasta de dados vem do
  registro (HKLM\SOFTWARE\BC Calibracao, valor PastaDados), gravado pelo instalador; sem ele, vale
  C:\ProgramData\BC Calibracao\dados.

  Não precisa parar o servidor: a senha nova vale na hora, o bloqueio daquele usuário acaba e as
  sessões abertas daquela conta são encerradas. O bloqueio de um computador que errou muitas vezes,
  com usuários diferentes, não acaba: dura até 15 minutos.

  O primeiro administrador normalmente é criado pela tela, no primeiro acesso a http://localhost:PORTA
  feito neste computador (assim ele já fica como signatário dos certificados). Este script também cria,
  para quando não der para usar a tela.

  PowerShell como Administrador:
    powershell -ExecutionPolicy Bypass -File "C:\Program Files\BC Calibracao\ferramentas\redefinir-senha.ps1"
#>
$ErrorActionPreference = 'Stop'

$script:Raiz = Split-Path -Parent $PSScriptRoot
$script:Node = Join-Path $script:Raiz 'node\node.exe'
$script:Ferramenta = Join-Path $script:Raiz 'server\ferramentas\redefinir-senha.mjs'

function Confirmar-Administrador {
  $eu = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $eu.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute como Administrador: no Iniciar, digite BC Calibração e abra "Redefinir senha do BC Calibração".'
  }
}

# Configuração gravada pelo instalador (pasta de dados e porta), com os valores padrão se faltar algo.
function Ler-Configuracao {
  $config = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\BC Calibracao' -ErrorAction SilentlyContinue
  $dados = Join-Path $env:ProgramData 'BC Calibracao\dados'
  $porta = '4850'
  if ($config -and $config.PastaDados) { $dados = [string]$config.PastaDados }
  if ($config -and $config.Porta) { $porta = [string]$config.Porta }
  return @{ Dados = $dados; Porta = $porta }
}

# Roda a ferramenta de usuários (server\ferramentas\redefinir-senha.mjs) e devolve a resposta já
# convertida; um erro da ferramenta vira exceção com a mensagem dela. Entrada e resposta passam em
# base64 do UTF-8: o console usaria a página de código 850 e estragaria acentos (ex.: "João — Recepção"
# ou uma senha com "ç").
function Ferramenta-Usuarios([string]$Comando, [string[]]$Argumentos = @(), [string]$Entrada) {
  # Local: com 'Stop', uma linha no stderr do node viraria erro no Windows PowerShell
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = -1
  if ($PSBoundParameters.ContainsKey('Entrada')) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Entrada))
    $saida = $b64 | & $script:Node $script:Ferramenta $Comando @Argumentos --base64 2>$null
  } else {
    $saida = & $script:Node $script:Ferramenta $Comando @Argumentos --base64 2>$null
  }
  $codigo = $LASTEXITCODE
  $resposta = $null
  $texto = (@($saida) -join '').Trim()
  if ($texto) {
    try { $resposta = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($texto)) | ConvertFrom-Json }
    catch { $resposta = $null }
  }
  if ($codigo -ne 0) {
    if ($resposta -and $resposta.erro) { throw [string]$resposta.erro }
    throw "A ferramenta de usuários falhou (código $codigo)."
  }
  if ($null -eq $resposta) { throw 'A ferramenta de usuários não respondeu.' }
  return $resposta
}

# Texto digitado (já sem espaços nas pontas).
function Ler-Texto([string]$Pergunta) {
  return ([string](Read-Host $Pergunta)).Trim()
}

# Pergunta até a resposta ser S ou N.
function Perguntar-SimNao([string]$Pergunta) {
  while ($true) {
    $resposta = Ler-Texto $Pergunta
    if ($resposta -match '^s') { return $true }
    if ($resposta -match '^n') { return $false }
    Write-Host 'Responda S (sim) ou N (não).' -ForegroundColor Red
  }
}

# Nome de quem vai usar a conta: obrigatório e com até 60 caracteres, como na tela (assim, se o
# "definir" recusar algo com a senha digitada, o problema é a senha).
function Ler-Nome([string]$Pergunta) {
  while ($true) {
    $nome = Ler-Texto $Pergunta
    if ($nome -and $nome.Length -le 60) { return $nome }
    if ($nome) { Write-Host 'O nome pode ter até 60 caracteres.' -ForegroundColor Red }
  }
}

# Confere o usuário digitado com a mesma regra do sistema (shared/usuarios.ts): o erro, ou $null se
# serve. Na hora, antes de pedir a senha (o servidor continua sendo quem decide).
function Erro-Usuario([string]$Login) {
  $l = $Login.Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
  # -cmatch: com o -match comum, o [a-z] aceitaria também maiúsculas e outras letras
  if ($l -cmatch '^[a-z0-9][a-z0-9._-]{2,31}$') { return $null }
  return 'Usuário inválido: use de 3 a 32 letras sem acento, números, ponto, hífen ou sublinhado, sem espaços (ex.: fabio ou maria.souza).'
}

# Texto de uma senha lida com Read-Host -AsSecureString; a cópia em memória não gerenciada é zerada.
function Texto-Da-Senha([Security.SecureString]$Segura) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segura)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Pede a senha duas vezes, sem mostrar. Enter vazio: o sistema gera uma temporária (troca obrigatória
# no primeiro acesso). Senha digitada para outra pessoa também vira temporária.
# Devolve @{ Senha = '' ou a digitada; TrocarSenha = $true ou $false }.
function Perguntar-Senha {
  while ($true) {
    $senha = Texto-Da-Senha (Read-Host 'Senha (não aparece ao digitar; Enter = gerar uma senha temporária)' -AsSecureString)
    if ($senha -eq '') { return @{ Senha = ''; TrocarSenha = $true } }
    $repetida = Texto-Da-Senha (Read-Host 'Repita a senha' -AsSecureString)
    if ($senha -cne $repetida) {
      Write-Host 'As duas senhas não são iguais. Digite de novo.' -ForegroundColor Red
      continue
    }
    $propria = Perguntar-SimNao 'Quem vai usar esta conta é você mesmo, agora? (S/N)'
    return @{ Senha = $senha; TrocarSenha = -not $propria }
  }
}

# Pede a senha e roda o "definir" com $Entrada (login, nome, tornarAdmin). Senha recusada (comum demais,
# com o nome...): diz o motivo e pede só a senha de novo; Enter gera uma temporária, que sempre passa.
# Outro erro: mostra e devolve $null (quem chamou recomeça). Deu certo: a resposta da ferramenta.
function Definir-ComSenha([string]$Banco, [hashtable]$Entrada) {
  while ($true) {
    $senha = Perguntar-Senha
    $Entrada.senha = $senha.Senha
    $Entrada.trocarSenha = $senha.TrocarSenha
    try {
      return Ferramenta-Usuarios 'definir' @($Banco) ($Entrada | ConvertTo-Json -Compress)
    } catch {
      if (-not $senha.Senha) {
        Write-Host "Não deu certo: $($_.Exception.Message)" -ForegroundColor Red
        return $null
      }
      Write-Host "Senha recusada: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host 'Digite outra senha (ou Enter para o sistema gerar uma temporária).'
    }
  }
}

# Lista de usuários da ferramenta (situacao), administradores primeiro.
function Mostrar-Usuarios($Lista) {
  foreach ($u in @($Lista)) {
    $nivel = if ($u.nivel -eq 'ADMIN') { 'Administrador' } else { 'Comum' }
    $desativado = if ($u.ativo) { '' } else { ' (desativado)' }
    Write-Host ('  {0,-20} {1} - {2}{3}' -f $u.login, $u.nome, $nivel, $desativado)
  }
}

# Resultado do "definir": usuário, senha temporária e o que acontece no próximo acesso.
function Mostrar-ContaDefinida($Resultado) {
  $nivel = if ($Resultado.nivel -eq 'ADMIN') { 'Administrador' } else { 'Comum' }
  $feito = if ($Resultado.criado) { 'Conta criada' } else { 'Senha redefinida' }
  Write-Host ''
  Write-Host "$($feito): $($Resultado.nome) ($nivel)" -ForegroundColor Green
  Write-Host "  Usuário: $($Resultado.login)" -ForegroundColor Green
  if ($Resultado.senhaTemporaria) {
    Write-Host "  Senha temporária: $($Resultado.senhaTemporaria)" -ForegroundColor Green
    $quando = if ($Resultado.criado) { 'No primeiro acesso' } else { 'Na próxima entrada' }
    Write-Host "  Anote. $quando o sistema pede para trocar a senha." -ForegroundColor Yellow
  } elseif ($Resultado.trocarSenha) {
    Write-Host '  Na próxima entrada o sistema pede para trocar a senha.' -ForegroundColor Yellow
  }
}

try {
  Confirmar-Administrador
  if (-not (Test-Path -LiteralPath $script:Node) -or -not (Test-Path -LiteralPath $script:Ferramenta)) {
    throw "A instalação do BC Calibração em $($script:Raiz) está incompleta. Rode o instalador de novo (os dados são mantidos)."
  }
  $config = Ler-Configuracao
  $banco = Join-Path $config.Dados 'bc-calibracao.db'
  $endereco = "http://localhost:$($config.Porta)"
  if (-not (Test-Path -LiteralPath $banco)) {
    throw "O banco de dados ($banco) ainda não existe: o serviço ainda não iniciou. Confira se o sistema abre em $endereco neste computador e rode de novo."
  }

  Write-Host ''
  Write-Host 'BC Calibração: criar o administrador ou redefinir uma senha' -ForegroundColor Cyan
  for ($tentativa = 1; $tentativa -le 20; $tentativa++) {
    $situacao = Ferramenta-Usuarios 'situacao' @($banco)
    $lista = @($situacao.lista)
    Write-Host ''
    if ($lista.Count -eq 0) {
      Write-Host 'Nenhum usuário cadastrado ainda.' -ForegroundColor Yellow
      Write-Host "O jeito recomendado é abrir $endereco no navegador DESTE computador: a tela pede os dados"
      Write-Host 'do administrador e já o cadastra como signatário dos certificados.'
      if (-not (Perguntar-SimNao 'Criar o ADMINISTRADOR por aqui mesmo assim? (S/N)')) { exit 0 }
      $login = Ler-Texto 'Usuário para entrar no sistema (sem acentos nem espaços, ex.: fabio; Enter = admin)'
      if (-not $login) { $login = 'admin' }
    } else {
      Write-Host 'Usuários cadastrados:'
      Mostrar-Usuarios $lista
      if ($situacao.administradoresAtivos -eq 0) {
        Write-Host 'Nenhum administrador ativo: escolha uma conta para tornar administrador ou digite um usuário novo.' -ForegroundColor Yellow
      }
      Write-Host ''
      $login = Ler-Texto 'Usuário que vai receber a senha nova (ou um usuário novo, sem acentos nem espaços, para criar outro administrador)'
      if (-not $login) { continue }
    }
    # Usuário inválido: avisa já, antes de perguntar mais nada
    $erroLogin = Erro-Usuario $login
    if ($erroLogin) {
      Write-Host $erroLogin -ForegroundColor Red
      continue
    }

    $entrada = @{ login = $login }
    $conta = $lista | Where-Object { $_.login -eq $login } | Select-Object -First 1
    if ($conta) {
      if (-not $conta.ativo) { Write-Host 'Esta conta está desativada: com a senha nova, ela volta a ficar ativa.' -ForegroundColor Yellow }
      if ($conta.nivel -ne 'ADMIN') { $entrada.tornarAdmin = Perguntar-SimNao "Tornar $($conta.nome) administrador? (S/N)" }
    } else {
      if ($lista.Count -gt 0 -and -not (Perguntar-SimNao "Não existe o usuário '$login'. Criar um ADMINISTRADOR novo com ele? (S/N)")) {
        continue
      }
      $entrada.nome = Ler-Nome 'Nome de quem vai usar a conta (ex.: Fabio Souza)'
      $entrada.tornarAdmin = $true
    }
    # Senha recusada: pede só a senha de novo
    $resultado = Definir-ComSenha $banco $entrada
    if (-not $resultado) {
      Write-Host 'Vamos tentar de novo (para desistir, feche esta janela).'
      continue
    }
    Mostrar-ContaDefinida $resultado
    if (-not $resultado.criado) {
      Write-Host '  O bloqueio deste usuário por senha errada acabou e as sessões abertas dele foram encerradas.'
      Write-Host '  Se a tela de entrada ainda disser "Muitas tentativas erradas neste computador" (muitas senhas'
      Write-Host '  erradas no mesmo computador), espere o tempo que ela mostra (no máximo 15 minutos) ou entre por outro computador.'
    }
    Write-Host ''
    Write-Host "Pronto. Não precisa reiniciar o servidor. Endereço neste computador: $endereco" -ForegroundColor Green
    exit 0
  }
  throw 'Muitas tentativas. Abra o atalho de novo.'
} catch {
  Write-Host ''
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
