#!/usr/bin/env bash
# Teste de fumaça do app BC Calibração (celular) num Android simulado, já ligado e com o adb conectado
# (.github/workflows/app-celular-emulador.yml, pelo reactivecircus/android-emulator-runner). Informativo: não bloqueia
# o instalador.
#   1. instala o APK de debug (por cima, como no celular: adb install -r);
#   2. abre o app e espera ESPERA segundos (padrão 30);
#   3. confere que o processo continua vivo e que o logcat não tem FATAL EXCEPTION nem ANR do app;
#   4. grava em <saída>: tela.png (a captura da tela), logcat.txt, console.txt (o console da interface, pelo
#      Capacitor) e resultado.txt.
#
# Uso: scripts/testar-app-no-emulador.sh <app-debug.apk ou pasta com ele> [pasta de saída]
set -uo pipefail

pacote="br.com.balancas.calibracao"
entrada="${1:?Informe o APK de debug (ou a pasta com ele)}"
saida="${2:-saida-emulador}"
espera="${ESPERA:-30}"
mkdir -p "$saida"

if [ -d "$entrada" ]; then
  apk="$(find "$entrada" -maxdepth 1 -name '*-debug.apk' -print -quit)"
  [ -n "$apk" ] || apk="$(find "$entrada" -maxdepth 1 -name '*.apk' -print -quit)"
else
  apk="$entrada"
fi
if [ -z "$apk" ] || [ ! -s "$apk" ]; then
  echo "::error::APK de debug não encontrado em $entrada."
  exit 1
fi

registrar() { echo "$*" | tee -a "$saida/resultado.txt"; }
: >"$saida/resultado.txt"
registrar "APK: $(basename "$apk")"
adb wait-for-device
registrar "Android: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
adb logcat -c || true

if ! adb install -r "$apk"; then
  registrar "FALHOU: o Android não instalou o APK."
  echo "::error::O Android simulado não instalou o APK de debug."
  exit 1
fi
registrar "Instalado."

adb shell am start -W -n "$pacote/.MainActivity" | tee -a "$saida/resultado.txt"
sleep "$espera"

pid="$(adb shell pidof "$pacote" | tr -d '\r' || true)"
adb exec-out screencap -p >"$saida/tela.png" || true
adb logcat -d >"$saida/logcat.txt" || true
grep -E 'Capacitor/Console|chromium' "$saida/logcat.txt" >"$saida/console.txt" || true

falhas=0
if [ -n "$pid" ]; then
  registrar "Processo vivo depois de ${espera} s (pid $pid)."
else
  registrar "FALHOU: o app não está rodando depois de ${espera} s."
  echo "::error::O app fechou sozinho no Android simulado (veja logcat.txt no artefato)."
  falhas=1
fi
# Um travamento do app aparece no logcat como "FATAL EXCEPTION: <thread>" e, logo abaixo, "Process: <pacote>, PID: …"
if grep -A2 'FATAL EXCEPTION' "$saida/logcat.txt" | grep -q "Process: $pacote"; then
  registrar "FALHOU: FATAL EXCEPTION do app no logcat."
  grep -A20 'FATAL EXCEPTION' "$saida/logcat.txt" | head -n 40
  echo "::error::FATAL EXCEPTION do app no logcat (veja logcat.txt no artefato)."
  falhas=1
fi
if grep -q "ANR in $pacote" "$saida/logcat.txt"; then
  registrar "FALHOU: o app parou de responder (ANR)."
  echo "::error::O app parou de responder (ANR) no Android simulado."
  falhas=1
fi
if [ "$falhas" = 0 ]; then
  registrar "OK: o app abriu e continua aberto, sem FATAL EXCEPTION."
fi
exit "$falhas"
