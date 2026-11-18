#!/usr/bin/env bash
# Confere um APK do app BC Calibração (celular), o que o CI faz depois de compilar (.github/workflows/app-celular.yml):
#   - pacote br.com.balancas.calibracao, versionName e versionCode esperados;
#   - assinatura válida (apksigner verify --print-certs); no release, recusa a chave de debug do Android e, com o
#     CERT_ESPERADO, recusa outra chave (os celulares não atualizariam: o Android só instala por cima com a mesma chave);
#   - permissões iguais a app-campo/android/permissoes-permitidas.txt, minSdk 29 e targetSdk 36
#     (app-campo/scripts/conferir-permissoes.sh).
#
# Uso: scripts/conferir-apk-celular.sh <app.apk> <versionName> <versionCode> [debug|release]
#
# Variáveis:
#   ANDROID_HOME (ou ANDROID_SDK_ROOT)  o Android SDK, com o build-tools (aapt2 e apksigner)
#   CERT_ESPERADO                       impressão SHA-256 do certificado da chave da empresa (64 dígitos hexadecimais,
#                                       com ou sem ":"); vazio = só mostra a impressão (ver docs/APP-CHAVE.md)
# Escreve a impressão SHA-256 do certificado em $GITHUB_OUTPUT (cert=...) quando roda no GitHub Actions.
set -euo pipefail

apk="${1:?Informe o APK}"
nome_esperado="${2:?Informe o versionName esperado (ex.: 1.1.0)}"
codigo_esperado="${3:?Informe o versionCode esperado (ex.: 1010000)}"
tipo="${4:-release}"
pacote="br.com.balancas.calibracao"
raiz="$(cd "$(dirname "$0")/.." && pwd)"

falhar() {
  echo "ERRO: $*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; fi
  exit 1
}

[ -s "$apk" ] || falhar "APK não encontrado: $apk"
case "$tipo" in debug | release) ;; *) falhar "tipo '$tipo' desconhecido (use debug ou release)." ;; esac

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$sdk" ] || falhar "defina ANDROID_HOME (o Android SDK)."
build_tools="$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -n1 || true)"
[ -n "$build_tools" ] && [ -x "$build_tools/aapt2" ] && [ -x "$build_tools/apksigner" ] ||
  falhar "aapt2 ou apksigner não encontrado em $sdk/build-tools."

# ---- Pacote e versão ---------------------------------------------------------------------------------------------
badging="$("$build_tools/aapt2" dump badging "$apk")" || falhar "o aapt2 não conseguiu ler o APK (arquivo corrompido ou não é um APK): $apk"
linha="$(head -n1 <<<"$badging")"
[[ "$linha" == *"name='$pacote'"* ]] || falhar "o pacote do APK não é $pacote: $linha"
[[ "$linha" == *"versionName='$nome_esperado'"* ]] || falhar "versionName diferente de $nome_esperado: $linha"
[[ "$linha" == *"versionCode='$codigo_esperado'"* ]] || falhar "versionCode diferente de $codigo_esperado: $linha"
echo "Pacote $pacote, versão $nome_esperado (versionCode $codigo_esperado)."

# ---- Assinatura --------------------------------------------------------------------------------------------------
# O apksigner é Java: o aviso "Picked up JAVA_TOOL_OPTIONS" vai para o stderr, que fica de fora
if ! assinatura="$("$build_tools/apksigner" verify --print-certs "$apk" 2>/dev/null)"; then
  "$build_tools/apksigner" verify --print-certs "$apk" >&2 || true
  falhar "assinatura do APK não confere (APK sem assinatura ou alterado)."
fi
dn="$(sed -n 's/^Signer #1 certificate DN: //p' <<<"$assinatura")"
cert="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$assinatura" | tr 'A-F' 'a-f')"
[ -n "$cert" ] || falhar "não foi possível ler a impressão SHA-256 do certificado."
assinantes="$(grep -c '^Signer #[0-9]* certificate DN:' <<<"$assinatura" || true)"
[ "$assinantes" = 1 ] || falhar "o APK tem $assinantes assinantes (esperado: 1)."
echo "Assinado por: $dn"
echo "Impressão SHA-256 do certificado: $cert"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "cert=$cert" >>"$GITHUB_OUTPUT"; fi

if [ "$tipo" = release ]; then
  [[ "$dn" != *"CN=Android Debug"* ]] || falhar "o APK de release está com a chave de debug do Android."
  esperado="$(tr -d ': \r\n' <<<"${CERT_ESPERADO:-}" | tr 'A-F' 'a-f')"
  if [ -n "$esperado" ]; then
    [[ "$esperado" =~ ^[0-9a-f]{64}$ ]] || falhar "CERT_ESPERADO não é uma impressão SHA-256 (64 dígitos hexadecimais)."
    [ "$cert" = "$esperado" ] ||
      falhar "o APK foi assinado com OUTRA chave ($cert; a da empresa é $esperado). Os celulares não atualizariam: confira os segredos BC_APP_* (docs/APP-CHAVE.md)."
    echo "É a chave da empresa (confere com a BC_APP_CERT_SHA256)."
  else
    echo "Aviso: BC_APP_CERT_SHA256 não definida; a chave não foi comparada (docs/APP-CHAVE.md)."
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      echo "::notice::Cadastre a variável BC_APP_CERT_SHA256 = $cert para o CI recusar um APK assinado com outra chave (docs/APP-CHAVE.md)."
    fi
  fi
fi

# ---- Permissões, minSdk e targetSdk ------------------------------------------------------------------------------
AAPT2="$build_tools/aapt2" bash "$raiz/app-campo/scripts/conferir-permissoes.sh" "$apk" ||
  falhar "as permissões, o minSdk ou o targetSdk do APK não são os esperados (veja acima e app-campo/android/permissoes-permitidas.txt)."
echo "APK conferido: $apk"
