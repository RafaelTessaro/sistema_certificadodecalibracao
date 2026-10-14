#!/usr/bin/env bash
# Gera o instalador único do Windows: pacotes/BC-Calibracao-Setup-<versão>.exe
# (programa + interface compilada + dependências de produção + Node.js portátil + WinSW).
# No servidor basta dar dois cliques no setup: não precisa de internet nem de outros programas.
# Detalhes em instalador/LEIA-ME.md.
#
# Uso: scripts/empacotar-windows.sh
#
# Passos:
#   1. npm ci e npm run build (a interface em dist/);
#   2. monta pacotes/payload/ com server/, shared/ (sem os testes), dist/, package.json,
#      package-lock.json, .env.exemplo e o node_modules de produção (npm ci --omit=dev numa pasta
#      temporária: só JavaScript puro, que funciona igual no Windows);
#   3. baixa o Node.js portátil oficial (só o node.exe do zip win-x64) e confere o SHA-256 pelo
#      SHASUMS256.txt oficial e pelo valor fixado abaixo;
#   4. baixa o WinSW.NET461.exe e confere o SHA-256 fixado abaixo;
#      (os downloads ficam em pacotes/cache/ e são reaproveitados)
#   5. sobe o servidor do payload com o Node daqui e confere /api/saude e a página inicial;
#   6. roda o makensis (avisos viram erro) e grava o .exe e o .sha256 em pacotes/.
#
# Variáveis:
#   PULAR_BUILD=1          não roda npm ci/npm run build e põe no pacote uma interface PROVISÓRIA
#                          (só para testar o instalador enquanto o código está em obras). O arquivo
#                          sai como BC-Calibracao-Setup-<versão>-teste.exe
#   MAKENSIS=/caminho      makensis a usar (padrão: o do PATH)
#   PERMITIR_NSIS_ANTIGO=1 aceita NSIS anterior ao 3.12 (só para testes: as versões antigas têm falhas
#                          de elevação de privilégio, CVE-2025-43715 e CVE-2026-42171)
set -euo pipefail

# Versões fixas. Para trocar o Node: mude NODE_VERSAO e copie o SHA-256 do node-v<versão>-win-x64.zip
# de https://nodejs.org/dist/v<versão>/SHASUMS256.txt para NODE_SHA256 (o script recusa se não bater).
# Node 24 é o LTS atual; passe para o 26 quando ele virar LTS (outubro de 2026).
NODE_VERSAO="24.21.0"
NODE_SHA256="158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541"
WINSW_VERSAO="2.12.0"
WINSW_SHA256="b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f"   # WinSW.NET461.exe
NSIS_MINIMO="3.12"

raiz="$(cd "$(dirname "$0")/.." && pwd)"
pacotes="$raiz/pacotes"
payload="$pacotes/payload"
cache="$pacotes/cache"
makensis="${MAKENSIS:-makensis}"
pular_build="${PULAR_BUILD:-0}"

falhar() {
  echo "ERRO: $*" >&2
  exit 1
}

# ---- Ferramentas ---------------------------------------------------------------------------------
for programa in node npm curl unzip tar; do
  command -v "$programa" >/dev/null || falhar "'$programa' não encontrado. Instale e rode de novo."
done
if command -v sha256sum >/dev/null; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
else
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
fi

if ! command -v "$makensis" >/dev/null; then
  cat >&2 <<'EOF'
ERRO: makensis (NSIS) não encontrado. Instale o NSIS 3.12 ou mais novo:
  - Debian testing/unstable:  sudo apt-get install nsis
  - macOS (Homebrew):          brew install makensis
  - Ubuntu 24.04: o apt traz a 3.09, que tem falhas de segurança; serve só para testes
    (sudo apt-get install nsis e rode com PERMITIR_NSIS_ANTIGO=1). Para o setup de verdade,
    use o workflow do GitHub (.github/workflows/instalador-windows.yml) ou um container:
      docker run --rm -v "$PWD":/src -w /src debian:testing bash -c \
        'apt-get update && apt-get install -y nsis nodejs npm curl unzip && scripts/empacotar-windows.sh'
  Se o makensis estiver fora do PATH, informe o caminho com MAKENSIS=/caminho/makensis.
EOF
  exit 1
fi
versao_nsis="$("$makensis" -VERSION 2>/dev/null | head -n1)"
if [[ "$versao_nsis" =~ ([0-9]+)\.([0-9]+) ]]; then
  # 10#: "3.09" tem o "09", que o bash leria como octal (e daria erro)
  nsis_maior=$((10#${BASH_REMATCH[1]}))
  nsis_menor=$((10#${BASH_REMATCH[2]}))
else
  falhar "não foi possível ler a versão do makensis ($versao_nsis)."
fi
minimo_maior=$((10#${NSIS_MINIMO%%.*}))
minimo_menor=$((10#${NSIS_MINIMO#*.}))
if ((nsis_maior < minimo_maior || (nsis_maior == minimo_maior && nsis_menor < minimo_menor))); then
  if [ "${PERMITIR_NSIS_ANTIGO:-0}" = 1 ]; then
    echo "ATENÇÃO: NSIS $versao_nsis é anterior ao $NSIS_MINIMO e tem falhas de segurança. Use este setup só para testes." >&2
  else
    falhar "NSIS $versao_nsis é anterior ao $NSIS_MINIMO (falhas de elevação de privilégio). Instale o $NSIS_MINIMO ou mais novo, ou rode com PERMITIR_NSIS_ANTIGO=1 só para testes."
  fi
fi

# ---- Versão --------------------------------------------------------------------------------------
versao="$(node -p 'require(process.argv[1]).version' "$raiz/package.json")"
if [[ ! "$versao" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-[0-9A-Za-z.]+)?$ ]]; then
  falhar "versão do package.json fora do formato X.Y.Z (ou X.Y.Z-algo): '$versao'."
fi
versao_num="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}.0"   # propriedades do .exe
if [ "$pular_build" = 1 ]; then versao="$versao-teste"; fi
saida="$pacotes/BC-Calibracao-Setup-$versao.exe"
echo "BC Calibração $versao (NSIS $versao_nsis, Node.js $NODE_VERSAO, WinSW $WINSW_VERSAO)"

# ---- 1. Interface --------------------------------------------------------------------------------
if [ "$pular_build" = 1 ]; then
  echo "PULAR_BUILD=1: sem npm ci/npm run build; o pacote leva uma interface PROVISÓRIA (só para teste)."
else
  echo "Instalando as dependências e compilando a interface (npm ci, npm run build)..."
  (cd "$raiz" && npm ci --no-audit --no-fund --loglevel=error) || falhar "o npm ci falhou."
  (cd "$raiz" && npm run build) ||
    falhar "o npm run build falhou (veja acima). Para testar só o instalador enquanto o código está em obras, rode com PULAR_BUILD=1."
  [ -f "$raiz/dist/index.html" ] || falhar "o npm run build não gerou dist/index.html."
fi

# ---- 2. Payload ----------------------------------------------------------------------------------
echo "Montando $payload..."
rm -rf "$payload"
mkdir -p "$payload/node" "$payload/servico" "$payload/ferramentas" "$cache"

# Código do servidor e do domínio, sem testes nem dados de teste
tar -C "$raiz" --exclude='*.test.ts' --exclude='*.test.mjs' --exclude='*.test.js' \
  --exclude='__fixtures__' --exclude='__snapshots__' -cf - server shared | tar -C "$payload" -xf -
cp "$raiz/package.json" "$raiz/package-lock.json" "$raiz/.env.exemplo" "$payload/"

if [ "$pular_build" = 1 ]; then
  # Só dentro do payload: a raiz do projeto não é tocada
  mkdir -p "$payload/dist"
  cat >"$payload/dist/index.html" <<'EOF'
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>BC Calibração (pacote de teste)</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 3rem">
    <h1>BC Calibração</h1>
    <p>Pacote de teste do instalador: a interface definitiva não foi compilada (PULAR_BUILD=1).</p>
    <p>O servidor está funcionando: <a href="/api/saude">/api/saude</a>.</p>
  </body>
</html>
EOF
else
  cp -R "$raiz/dist" "$payload/dist"
fi

echo "Dependências de produção (npm ci --omit=dev)..."
temporaria="$(mktemp -d)"
trap 'rm -rf "$temporaria"' EXIT
cp "$raiz/package.json" "$raiz/package-lock.json" "$temporaria/"
(cd "$temporaria" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
mv "$temporaria/node_modules" "$payload/node_modules"
# Atalhos de linha de comando (links simbólicos) não servem no Windows; o npm também deixa pastas
# vazias dos escopos das dependências de desenvolvimento (@types, @vitejs...)
rm -rf "$payload/node_modules/.bin"
find "$payload/node_modules" -mindepth 1 -maxdepth 2 -type d -empty -delete
# Só JavaScript puro funciona igual no Windows: um módulo nativo (.node) compilado aqui não serviria lá.
# (-print -quit em vez de "| grep -q": com pipefail, o find interrompido pelo grep daria falso negativo)
nativo="$(find "$payload/node_modules" -name '*.node' -print -quit)"
[ -z "$nativo" ] || falhar "dependência com módulo nativo ($nativo); o pacote não funcionaria no Windows."
link="$(find "$payload" -type l -print -quit)"
[ -z "$link" ] || falhar "o payload tem links simbólicos (ex.: $link), que não funcionam no Windows."

# Instalado em "C:\Program Files\BC Calibracao\" (31 caracteres), nenhum caminho pode passar de ~260
longo="$(cd "$payload" && find . -type f | awk 'length($0) - 2 + 31 > 240 { print; exit }' || true)"
[ -z "$longo" ] || falhar "caminho longo demais para o Windows depois de instalado: $longo"

cp "$raiz"/instalador/ferramentas/* "$payload/ferramentas/"
cp "$raiz/instalador/bc-calibracao.ico" "$payload/"

commit="${GITHUB_SHA:-$(git -C "$raiz" rev-parse HEAD 2>/dev/null || echo desconhecido)}"
alteracoes=false
if [ -n "$(git -C "$raiz" status --porcelain 2>/dev/null || true)" ]; then alteracoes=true; fi
interface_provisoria=false
if [ "$pular_build" = 1 ]; then interface_provisoria=true; fi
cat >"$payload/pacote.json" <<EOF
{
  "versao": "$versao",
  "commit": "$commit",
  "alteracoesNaoCommitadas": $alteracoes,
  "interfaceProvisoria": $interface_provisoria,
  "node": "$NODE_VERSAO",
  "winsw": "$WINSW_VERSAO",
  "nsis": "$versao_nsis",
  "geradoEm": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# ---- 3 e 4. Node.js portátil e WinSW (com cache) --------------------------------------------------
# Baixa para o cache, se ainda não estiver lá (arquivo parcial nunca fica com o nome final)
baixar() {
  local url="$1" destino="$2"
  if [ -s "$destino" ]; then return; fi
  echo "Baixando $url..."
  curl -fsSL --retry 3 -o "$destino.baixando" "$url"
  mv "$destino.baixando" "$destino"
}
# Confere o SHA-256; se não bater, apaga do cache (o próximo download começa do zero) e para
conferir() {
  local arquivo="$1" esperado="$2" obtido
  obtido="$(sha256 "$arquivo")"
  if [ "$obtido" != "$esperado" ]; then
    rm -f "$arquivo"
    falhar "SHA-256 de $(basename "$arquivo") não confere: esperado $esperado, obtido $obtido. O arquivo foi apagado do cache."
  fi
}

zip_node="node-v$NODE_VERSAO-win-x64.zip"
somas_node="$cache/node-v$NODE_VERSAO-SHASUMS256.txt"
baixar "https://nodejs.org/dist/v$NODE_VERSAO/$zip_node" "$cache/$zip_node"
baixar "https://nodejs.org/dist/v$NODE_VERSAO/SHASUMS256.txt" "$somas_node"
oficial="$(awk -v nome="$zip_node" '$2 == nome { print $1 }' "$somas_node")"
if [ "$oficial" != "$NODE_SHA256" ]; then
  rm -f "$somas_node"
  falhar "o SHASUMS256.txt oficial traz '$oficial' para $zip_node, diferente do NODE_SHA256 fixado neste script ($NODE_SHA256)."
fi
conferir "$cache/$zip_node" "$NODE_SHA256"
echo "Node.js $NODE_VERSAO conferido (SHA-256 $NODE_SHA256)."
unzip -j -o -q "$cache/$zip_node" "node-v$NODE_VERSAO-win-x64/node.exe" "node-v$NODE_VERSAO-win-x64/LICENSE" -d "$payload/node"

winsw="$cache/WinSW-$WINSW_VERSAO.NET461.exe"
baixar "https://github.com/winsw/winsw/releases/download/v$WINSW_VERSAO/WinSW.NET461.exe" "$winsw"
conferir "$winsw" "$WINSW_SHA256"
echo "WinSW $WINSW_VERSAO conferido (SHA-256 $WINSW_SHA256)."
cp "$winsw" "$payload/servico/WinSW.NET461.exe"
licenca_winsw="$cache/WinSW-$WINSW_VERSAO-LICENSE.txt"
baixar "https://raw.githubusercontent.com/winsw/winsw/v$WINSW_VERSAO/LICENSE.txt" "$licenca_winsw"
cp "$licenca_winsw" "$payload/servico/LICENSE-WinSW.txt"

# ---- 5. O servidor do payload sobe só com as dependências de produção? ---------------------------
echo "Conferindo se o servidor do pacote inicia..."
dados_teste="$(mktemp -d)"
trap 'rm -rf "$temporaria" "$dados_teste"' EXIT
porta_teste="$(node -e "const s = require('node:net').createServer().listen(0, '127.0.0.1', () => { console.log(s.address().port); s.close() })")"
PORTA="$porta_teste" HOST=127.0.0.1 PASTA_DADOS="$dados_teste/dados" node "$payload/server/iniciar.mjs" >"$dados_teste/servidor.log" 2>&1 &
pid_servidor=$!
servidor_ok=0
for _ in $(seq 1 40); do
  saude="$(curl -fsS -m 3 "http://127.0.0.1:$porta_teste/api/saude" 2>/dev/null || true)"
  inicio="$(curl -fsS -m 3 "http://127.0.0.1:$porta_teste/" 2>/dev/null || true)"
  if [[ "$saude" == *'"ok":true'* ]] && grep -qi '<html' <<<"$inicio"; then
    servidor_ok=1
    break
  fi
  kill -0 "$pid_servidor" 2>/dev/null || break
  sleep 0.5
done
kill "$pid_servidor" 2>/dev/null || true
wait "$pid_servidor" 2>/dev/null || true
if [ "$servidor_ok" = 1 ]; then
  echo "Servidor do pacote respondeu (/api/saude e a página inicial)."
else
  echo "--- registro do servidor ---" >&2
  tail -n 40 "$dados_teste/servidor.log" >&2 || true
  if [ "$pular_build" = 1 ]; then
    echo "ATENÇÃO: o servidor do pacote não respondeu (código em obras?). Seguindo, porque PULAR_BUILD=1." >&2
  else
    falhar "o servidor do pacote não respondeu: falta alguma dependência de produção ou o código não inicia."
  fi
fi

# ---- 6. Instalador -------------------------------------------------------------------------------
echo "Gerando o instalador com o makensis..."
# Com o locale C, o makensis do Linux (3.09 e 3.12) cai com falha de segmentação ao ler nomes de
# arquivo fora do ASCII (há um "snow ☃" nos testes do @fastify/send): roda com um locale UTF-8
locales="$(locale -a 2>/dev/null || true)"
locale_utf8="$(grep -iE '^c\.utf-?8$' <<<"$locales" | head -n1 || true)"
[ -n "$locale_utf8" ] || locale_utf8="$(grep -iE '\.utf-?8$' <<<"$locales" | head -n1 || true)"
[ -n "$locale_utf8" ] || locale_utf8="C.UTF-8"
rm -f "$saida" "$saida.sha256"
LC_ALL="$locale_utf8" "$makensis" -V2 -WX -INPUTCHARSET UTF8 \
  "-DVERSAO=$versao" "-DVERSAO_NUM=$versao_num" "-DPAYLOAD=$payload" "-DSAIDA=$saida" \
  "$raiz/instalador/bc-calibracao.nsi"
[ -s "$saida" ] || falhar "o makensis não gerou $saida."
(cd "$pacotes" && echo "$(sha256 "$saida")  $(basename "$saida")" >"$(basename "$saida").sha256")

echo
echo "Instalador gerado: $saida ($(du -h "$saida" | cut -f1))"
echo "SHA-256: $(cut -d' ' -f1 "$saida.sha256")"
if [ "$pular_build" = 1 ]; then
  echo "ATENÇÃO: pacote de TESTE, com interface provisória. Não entregue este arquivo."
fi
