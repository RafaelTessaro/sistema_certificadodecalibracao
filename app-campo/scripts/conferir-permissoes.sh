#!/usr/bin/env bash
# Confere que as permissões do APK são exatamente as de android/permissoes-permitidas.txt (e o minSdk/targetSdk).
# Uso: scripts/conferir-permissoes.sh caminho/do/app.apk   (precisa do aapt2: $ANDROID_HOME/build-tools/<versão>/aapt2)
set -euo pipefail
apk="${1:?Informe o APK}"
pasta="$(cd "$(dirname "$0")/.." && pwd)"
aapt2="${AAPT2:-$(ls -d "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)}"
[ -x "$aapt2" ] || { echo "aapt2 não encontrado (defina ANDROID_HOME ou AAPT2)"; exit 2; }
esperadas="$(grep -v '^\s*#' "$pasta/android/permissoes-permitidas.txt" | sed '/^\s*$/d' | sort)"
no_apk="$("$aapt2" dump permissions "$apk" | sed -n "s/^uses-permission: name='\([^']*\)'.*/\1/p" | sort -u)"
if [ "$esperadas" != "$no_apk" ]; then
  echo "As permissões do APK mudaram. Confira e atualize android/permissoes-permitidas.txt:"
  diff <(echo "$esperadas") <(echo "$no_apk") || true
  exit 1
fi
badging="$("$aapt2" dump badging "$apk")"
grep -q "minSdkVersion:'29'" <<<"$badging" || { echo "minSdkVersion diferente de 29"; exit 1; }
grep -q "targetSdkVersion:'36'" <<<"$badging" || { echo "targetSdkVersion diferente de 36"; exit 1; }
echo "Permissões, minSdk 29 e targetSdk 36 conferidos."
