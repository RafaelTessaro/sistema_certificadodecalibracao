# App BC Calibração (celular)

O app do técnico de campo: a folha de campo FOR-CAL-01 enviada pelo escritório ("Enviar para o técnico") é preenchida
no celular, sem rede, no cliente; o técnico assina (PIN + desenho), quem acompanhou assina (nome, função e desenho,
vendo só as condições do serviço) e, de volta ao Wi-Fi da empresa, o celular entrega a folha ao servidor.

Capacitor 8.6.0 + React 19 + Vite + Tailwind v4. A interface vai dentro do APK. Android 10 ou mais novo (minSdk 29,
targetSdk 36). Versão do app = versão do sistema (`package.json`): `1.1.0` → versionCode `1010000`.

## Pastas

- `src/nucleo/` — TypeScript puro (sem Capacitor): cliente da API, sincronia, estados da folha, trilha, teclado, ordem
  da "Próxima", PIN, repositório. Testado pelo `npm test` da raiz (`app-campo/src/nucleo/**/*.test.ts`). Importa o
  `shared/` do sistema por caminho relativo.
- `src/plataforma/` — o que fala com o Android: SQLite, HTTP (só `CapacitorHttp.request`, com prazos), preferências,
  QR (ML Kit), notificação do fim do expediente, orientação da tela, eventos.
- `src/telas/`, `src/componentes/` — a interface.
- `android/` — o projeto Android (versionado). `android/permissoes-permitidas.txt` é a lista das permissões do APK.

## Compilar

```bash
cd app-campo
npm ci
npm run typecheck
npm run build          # interface (dist/)
npx cap sync android   # copia para o Android
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk (ARM e x86_64, chave de debug)
./gradlew assembleRelease      # só ARM; sem as variáveis abaixo, sai sem assinatura
```

Precisa do JDK 21 e do Android SDK (platform 36, build-tools 35) em `ANDROID_HOME`.

Assinatura do release (o keystore nunca entra no repositório; como criar e guardar a chave e os segredos do CI:
[`docs/APP-CHAVE.md`](../docs/APP-CHAVE.md)):

| Variável | O quê |
|---|---|
| `BC_APP_KEYSTORE_FILE` | caminho do arquivo `.jks` |
| `BC_APP_KEYSTORE_SENHA` | senha do keystore |
| `BC_APP_CHAVE_ALIAS` | alias da chave |
| `BC_APP_CHAVE_SENHA` | senha da chave |
| `BC_APP_VERSAO` (opcional) | `1.1.0+1` numa correção só do app (versionCode `1010001`) |
| `BC_APP_VERSION_CODE` (opcional) | o versionCode calculado pelo CI (sem ela, sai da versão) |

Conferir as permissões e o minSdk/targetSdk do APK: `scripts/conferir-permissoes.sh caminho/do/app.apk`.

## Instalar pelo cabo

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

O `-r` instala por cima, sem perder as folhas. A atualização normal é pelo próprio app ("Há uma versão nova"), que
abre o APK servido pelo servidor (`/api/campo/apk`) no navegador do Android. Sempre a mesma chave de assinatura: com
outra chave, o Android não atualiza (e desinstalar apaga as folhas não entregues).

## Recomendações para o celular do técnico

- Bloqueio de tela ligado (PIN ou digital do Android; obrigatório pelo POP-CAL-01) e "Data e hora automáticas" ligado.
- No roteador da empresa, reservar o IP do servidor (o app usa o endereço que veio no QR; se mudar, Menu → "Endereço do
  servidor" ou Menu → "Ler o QR de novo", com o QR que o escritório gera em "Parear de novo").
- Teste de 1 minuto: abrir `http://IP-DO-SERVIDOR:4850` no navegador do celular; se a tela de entrar do sistema
  aparecer, a rede está certa.
