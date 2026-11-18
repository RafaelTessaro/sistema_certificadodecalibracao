# Chave de assinatura do app do celular

Todo APK do app BC Calibração (celular) sai assinado com uma chave da empresa. O Android só instala uma versão nova
**por cima** da antiga (sem perder as folhas que estão no celular) se as duas tiverem a **mesma chave**. Por isso:

- a chave é criada **uma vez só** e usada para sempre;
- **se ela se perder**, os celulares não aceitam mais atualizações: seria preciso entregar todas as folhas, desinstalar o
  app e instalar de novo, com outra chave, em cada celular;
- **se ela vazar**, alguém poderia fazer um app falso que instala por cima do verdadeiro. Guarde-a como o certificado
  digital A1 da empresa.

O GitHub usa a chave para assinar o APK que vai no instalador (`.github/workflows/app-celular.yml`). Sem ela, o release
do sistema sai normalmente, **sem o app do celular**, e as notas do Release dizem isso.

## 1. Criar a chave (uma vez, no computador do dono)

Precisa do `keytool`, que vem com o Java (JDK 17 ou mais novo; por exemplo o "Microsoft Build of OpenJDK" ou o "Eclipse
Temurin"). No Prompt de Comando (ou no terminal), numa pasta só sua:

```
keytool -genkeypair -v -keystore bc-calibracao-app.jks -storetype PKCS12 -alias bc-calibracao -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=BC Calibracao, O=Balancas.com, L=Rio Claro, ST=SP, C=BR"
```

- Ele pede uma **senha** (duas vezes). Use uma senha longa e guarde-a junto das senhas do certificado A1. No formato PKCS12,
  a senha da chave é a mesma do arquivo.
- `-validity 10000` são cerca de 27 anos.
- O arquivo `bc-calibracao-app.jks` é a chave. **Nunca** ponha esse arquivo no repositório (o `.gitignore` recusa `*.jks`),
  em e-mail, WhatsApp ou numa pasta sincronizada sem senha.

Anote a **impressão digital SHA-256** do certificado (ela não é segredo):

```
keytool -list -v -keystore bc-calibracao-app.jks -alias bc-calibracao
```

Procure a linha `SHA256:` (por exemplo `65:24:0D:04:…:D5`).

## 2. Guardar a chave

- **Duas cópias offline:** um pen drive no cofre da empresa e outra cópia cifrada fora da empresa.
- A senha no mesmo lugar das senhas do certificado A1.
- Anote também o alias (`bc-calibracao`) e a impressão SHA-256.

## 3. Cadastrar os 4 segredos no GitHub

Transforme o arquivo em texto (base64):

- **Windows (PowerShell):**
  ```
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\bc-calibracao-app.jks")) | Set-Clipboard
  ```
  (o texto vai para a área de transferência)
- **Linux:** `base64 -w0 bc-calibracao-app.jks` · **macOS:** `base64 -i bc-calibracao-app.jks`

No GitHub, no repositório do sistema:

1. **Settings** (Configurações) → no menu da esquerda, **Secrets and variables** → **Actions**.
2. Na aba **Secrets**, clique em **New repository secret** e crie os 4, com os nomes exatamente assim:

   | Nome | Valor |
   |---|---|
   | `BC_APP_KEYSTORE_B64` | o texto base64 do arquivo `.jks` (cole tudo, numa linha só) |
   | `BC_APP_KEYSTORE_SENHA` | a senha do arquivo |
   | `BC_APP_CHAVE_ALIAS` | `bc-calibracao` |
   | `BC_APP_CHAVE_SENHA` | a senha da chave (no PKCS12, a mesma do arquivo) |

3. Recomendado: na aba **Variables**, clique em **New repository variable** e crie `BC_APP_CERT_SHA256` com a impressão
   SHA-256 do passo 1 (com ou sem os ":"). Com ela, o CI **recusa** um APK assinado com outra chave (um segredo trocado por
   engano), que os celulares não aceitariam como atualização.

Depois de salvo, o GitHub não mostra mais o valor dos segredos: só deixa trocar. Apague o arquivo de texto base64, se
tiver gravado um.

## 4. Conferir

Na aba **Actions** do GitHub, abra **App do celular** → **Run workflow**. No fim:

- o passo **APK de release (assinado com a chave da empresa)** rodou (sem os segredos, ele fica cinza, pulado);
- o passo **Confere os APKs** mostra "Assinado por: CN=BC Calibracao…" e a impressão SHA-256, igual à anotada;
- nos artefatos da execução aparece **app-celular-release**, com o `BC-Calibracao-App-<versão>.apk` e o `.sha256`.

Esse APK já pode ser instalado pelo cabo (`adb install -r`) para o piloto. O instalador do sistema (tag `v*`) passa a
trazer o app e a publicá-lo no Release.

Mensagens de erro do CI:

- "O segredo BC_APP_KEYSTORE_B64 não é um base64 válido": cole de novo o texto do passo 3, inteiro.
- "O keystore não abre com a BC_APP_KEYSTORE_SENHA ou não tem o alias": confira a senha e o alias.
- "o APK foi assinado com OUTRA chave": o arquivo nos segredos não é a chave da empresa. Não publique: confira os segredos
  com as cópias do passo 2.

## 5. Se a chave se perder ou vazar

- **Perdeu (e não há cópia):** crie outra chave (passo 1) e troque os segredos e a variável. Em cada celular: entregue
  **todas** as folhas, desinstale o app (desinstalar apaga as folhas não entregues), instale o novo e cadastre o celular
  como novo em **Cadastrar celular** (o app reinstalado ganha outra identificação, e o **Parear de novo** não serve). Depois,
  revogue o cadastro antigo com o motivo **Troca de aparelho**.
- **Vazou:** faça o mesmo, o quanto antes, e troque também as senhas.

## 6. Cadastro de desenvolvedor no Google (fazer antes de 2027)

Hoje (novembro de 2026) a instalação direta de um APK (pelo navegador ou pelo cabo), fora da Play Store, não exige
cadastro. O Google anunciou que, **em 2027**, os celulares Android certificados só vão instalar apps de desenvolvedores
verificados (a instalação pelo cabo, com o `adb`, continua liberada). Para o app continuar instalando e atualizando pelo
navegador:

1. Crie uma conta na **Android Developer Console** (developer.android.com/developer-verification), do tipo de
   distribuição completa ("Full distribution"; a "Limited distribution" é para estudantes e hobistas). Custa US$ 25, uma vez
   só, e pede a verificação de identidade.
2. Conta como **organização** (recomendado, em nome da Balanças.com): precisa do número **D-U-N-S** da empresa, que é
   gratuito mas pode levar até 28 dias para sair. Comece cedo.
3. Registre o pacote **`br.com.balancas.calibracao`** com a impressão SHA-256 da chave (passo 1).

Não precisa publicar na Play Store. Se o Google mudar as regras antes, o caminho que sempre funciona é a instalação pelo
cabo (veja "App do celular" em `instalador/LEIA-ME.md`).
