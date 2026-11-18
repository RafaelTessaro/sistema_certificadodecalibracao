# 07 — App do celular (BC Calibração): pesquisa e decisões

Resumo das pesquisas que embasaram o app do técnico de campo (versão 1.1.0 do sistema), feitas em 18/11/2026: mercado
(01), tecnologia (02), o código existente (03), interface (04), o plano de implementação (revisão 2) e os ajustes finais
do dono (05). Os documentos de trabalho completos, com o protótipo, ficaram fora do repositório; este arquivo guarda o
essencial, as decisões e as fontes principais. Onde o plano e os ajustes finais discordam, **valem os ajustes finais**
(§6).

---

## 1. O que é e as decisões do dono

A folha de campo FOR-CAL-01 vai para o celular Android do técnico. Ele preenche no cliente, sem internet, colhe as duas
assinaturas com o dedo e, de volta ao Wi-Fi da empresa, o celular entrega a folha ao servidor. O escritório compara
(piloto) ou importa (depois do piloto, “Importar do celular do técnico”) os dados para a calibração.

Decisões do dono:

1. Nome do app no celular: **"BC Calibração"** (o mesmo do sistema; `br.com.balancas.calibracao`). No computador: **Enviar
   para o técnico**, **Celulares dos técnicos**. A pasta no repositório é `app-campo/`.
2. **Nenhuma folha nova no celular:** o técnico só preenche as folhas enviadas pelo escritório. Outra balança: papel.
3. A assinatura do cliente (dedo + nome digitado) fica **só na folha de campo**. O certificado não muda.
4. Na primeira versão: **avisos na hora** (as mesmas regras do sistema, no celular) e **folha impressa assinada** (o PDF
   da folha preenchida, com as duas assinaturas). Foto da plaqueta: depois.
5. **Uso só interno, sem burocracia:** sem código de conferência (o nº FC-AAAA-NNNNN identifica a folha nos dois lados);
   endereço do servidor pelo QR, sem procurar na rede (o dono fixa os IPs); cadastro do celular simples.

## 2. Mercado (pesquisa 01)

- Beamex (bMobile + LOGiCAL/CMX, que já calibra balança pela EURAMET cg-18), Fluke (MET/TEAM Mobile), TMA ProCal e
  IndySoft Scales seguem o mesmo roteiro: o escritório **designa** o trabalho, o celular **baixa** com conexão, o técnico
  trabalha **sem rede** e os resultados **voltam** quando o celular se conecta de novo. Não há software brasileiro de
  calibração com app de campo; os apps brasileiros de ordem de serviço (Produttivo, Auvo, Field Control) não fazem
  metrologia.
- **É sempre o celular que procura o servidor**, nunca o contrário: o Android fecha apps parados, o IP do celular muda e
  conexões que chegam de fora são recusadas.
- **Conflito se evita no desenho:** como no "check-out" da Fluke, enquanto a folha está com o técnico só o celular escreve
  nela (no sistema: a trava `NO_CELULAR`, ligada só depois do piloto). "Vence a última sincronização" (Fulcrum) perde dado
  sem ninguém ver.
- **Assinatura com o dedo** é uma assinatura eletrônica simples (na classificação da Lei 14.063/2020): não confere a
  identidade de quem assina. Entre particulares, a MP 2.200-2/2001 (art. 10, § 2º) admite outros meios de comprovar a
  autoria e a integridade de um documento eletrônico, desde que as partes os aceitem; amarrar a assinatura ao conteúdo
  assinado e reabri-la se algo mudar reforça a prova. **O valor como prova está a confirmar com o jurídico.** O cliente
  assina que **acompanhou o serviço e está ciente das condições, não dos resultados**, como na folha de papel.
- **ISO/IEC 17025, 7.5:** o que o técnico registra no celular é o registro original. Guardar como chegou, com quem e
  quando, e cada correção sem apagar o valor anterior.
- **LGPD:** guardar só a **imagem** da assinatura (velocidade e pressão do traço a aproximariam de dado biométrico), apagar
  do aparelho depois do recibo do servidor e poder descadastrar um celular perdido.
- Alerta de concorrente (Jobber): apagar ou atualizar o app antes de sincronizar perde dados. Daí: a folha só sai do
  celular com o recibo, e desinstalar é desaconselhado em todo lugar.

## 3. Tecnologia (pesquisa 02)

- **Capacitor 8.6.0** (casca Android oficial com a interface React + TypeScript + Tailwind dentro do APK), em vez de PWA
  (precisa de contexto seguro, e o sistema roda em HTTP na rede interna), React Native ou nativo (mais pesados e sem
  reaproveitar o código). O `shared/` do sistema (cálculo, plano da folha, validações) entra no app sem reescrever.
- Versões fixas, todas com mais de duas semanas: Capacitor 8.6.0, `@capacitor-community/sqlite` 8.1.1,
  `@capacitor-mlkit/barcode-scanning` 8.2.2 (QR sem internet), `signature_pad` 5.1.4, React 19.3.0, Vite 8.3.4. Android:
  `minSdk 29` (Android 10), `targetSdk 36`, AGP 8.13.0, Gradle 8.14.3, JDK 21, build-tools 35.
- **HTTP na rede interna:** o Android 9+ bloqueia HTTP em texto claro, e o `domain-config` não aceita faixa de IP. Daí o
  `network_security_config` com `base-config cleartextTrafficPermitted="true"`, e o app só fala com o servidor pelo HTTP
  nativo (`CapacitorHttp`), com prazos de conexão e de leitura.
- **Armazenamento:** SQLite no celular, gravado a cada toque. Backup do Android desligado (`allowBackup=false` e
  `dataExtractionRules`): as folhas não vão para o Google Drive do técnico; o backup é o servidor.
- **Sincronização:** ao abrir o app, ao voltar para ele e no "Atualizar agora". Com o app fechado o Android não garante o
  horário (fica para uma fase 2). Lembrete local no fim do expediente.
- **Build no GitHub Actions:** o runner `ubuntu-24.04` já traz o JDK 21 (`JAVA_HOME_21_X64`) e o Android SDK 36. Cerca de
  1 a 2 minutos por build. O release é assinado com uma chave da empresa (segredos do GitHub); sem a mesma chave o Android
  não instala por cima, e desinstalar apaga as folhas não entregues ([`docs/APP-CHAVE.md`](../APP-CHAVE.md)).
- **Distribuição:** sem Play Store. O APK vai no instalador do sistema e o servidor o oferece pela rede
  (`GET /api/campo/apk`); a atualização é o app abrir o APK no navegador do Android, que instala por cima. Pelo cabo,
  `adb install -r`.
- **Verificação de desenvolvedor do Google:** em novembro de 2026 a instalação direta no Brasil ainda não exige (FAQ
  oficial de 10/11/2026; algumas matérias dizem o contrário). Em 2027 passa a valer para todos os apps em aparelhos
  certificados (o `adb` continua isento). Fazer o cadastro (US$ 25; D-U-N-S para organização) antes de 2027.
- O protótipo compilou num contêiner (APK de debug e de release assinado de teste); sem KVM, nunca abriu num emulador.

## 4. O código existente (pesquisa 03)

- A folha de campo já era um documento controlado: nº próprio (`FC-AAAA-NNNNN`), PDF da primeira impressão guardado,
  reimpressão idêntica e o nº do certificado reservado na primeira impressão (`reservarFolhaCampo`). **Enviar para o
  técnico** faz a mesma reserva, sem contar impressão.
- O "pacote" que vai ao celular sai do mesmo plano da folha impressa (`DadosFolhaCampo`/`PlanoFolha`), congelado na
  primeira geração (os dados impressos ficam guardados para comparar depois).
- Regras do repositório que o app respeita: `shared/` puro (sem Node, DOM ou Capacitor), migrações só acrescentadas
  (migração 25), toda rota classificada em `server/acesso.ts`, o PDF do certificado byte a byte igual, a restauração de
  uma cópia transplantando o que é de hoje (contas, certificados, folhas e agora celulares e registros de campo).
- Os casos de importação (calibração com ou sem folha, folha substituída, dados digitados do papel antes de puxar,
  tentativas descartadas) foram mapeados antes de escrever o "Comparar" e o "Puxar".

## 5. Interface (pesquisa 04)

- **O app é a FOR-CAL-01 em forma de celular:** os mesmos 8 passos, nomes e a marca ● de obrigatório para emitir. O
  escritório reconhece cada campo quando os dados chegam.
- **Minhas folhas** é a tela inicial, por cliente, com o estado da entrega sempre à vista.
- **Teclado numérico do próprio app**, com teclas grandes (dá para usar de luva) e vírgula sempre visível: o teclado da
  Samsung esconde a vírgula em vários aparelhos. O valor fica **exatamente como digitado** (as casas decimais contam).
  **Próxima** segue a ordem física do carregamento; **Repetir** só na repetibilidade e na excentricidade.
- **Avisos na hora que ajudam e não travam**, de dois tipos: ▲ "Confira a digitação" (âmbar) e ▲ "Isto impede o
  certificado" (vermelho), sempre com cor, símbolo e texto. Aprovado/reprovado não aparece no celular: a conformidade é
  decidida no sistema.
- **Assinaturas em tela cheia, com o celular deitado.** Modo entrega: o cliente vê só as condições do serviço, e só o PIN
  do técnico tira o celular desse modo. Assinada, a folha tranca; reabrir apaga as duas assinaturas.
- Os mesmos tokens visuais do sistema (marca, claro e escuro), fonte Inter dentro do app.

## 6. O plano e o que os ajustes finais simplificaram

O plano (revisão 2, conferida por uma crítica de 49 pontos) definiu o domínio: os 8 passos e o mapeamento dos campos, os
estados do envio (`ENVIADA`, `NO_CELULAR`, `DEVOLVIDA`, `RECOLHIDA`) com as regras de recolher, o registro de campo
imutável com as situações `VALIDO`, `SUPERADO` e `DESCARTADO`, o piloto com o papel valendo, a correção depois da
assinatura, reabrir, encerrar sem completar, recomeçar os ensaios, a justificativa na emissão, as telas do computador e
do app e os testes.

Os ajustes finais do dono ("é de uso só interno, não vai ter distribuição, então não precisa ter tanta burocracia")
tiraram do plano:

| Saiu | Ficou no lugar |
|---|---|
| Código de conferência (ex.: `7F3A-91C2`) no app, no computador e no PDF | O nº da folha (FC-AAAA-NNNNN) e a hora |
| Descoberta do servidor (varredura da rede, mDNS) | O endereço do QR, editável no Menu ("Endereço do servidor") ou "Ler o QR de novo"; IP reservado no roteador |
| ECDH, HKDF, HMAC, AES-GCM, envelope próprio, nonce, janela de ±5 min, segredo por DPAPI | Código de 6 dígitos de uso único (10 min) → token aleatório (o servidor guarda só o sha256); JSON comum com `Authorization: Bearer` e `x-bc-calibracao: 1` |
| Relógio monotônico e contagem de reinícios | Data e hora local do celular em ISO com fuso; selo "Relógio do celular diferente (N min)" acima de 5 min |
| Fila de PDF, tabela de versões de PDF, sha256 e código no rodapé | PDF da folha gerado na hora em que é pedido; rodapé "FC-… · FOR-CAL-01 rev. 05 · gerado em …" |
| Justificativa por diferença | Um texto só na emissão, guardado em `emissao.campo` (o PDF do certificado não muda) |
| "Continuei no papel a partir daqui" | Encerrar sem completar, com o motivo |
| Plugin Kotlin próprio, checagem do bloqueio de tela, SQLCipher, minify, fotos, assinatura A1 do PDF da folha | Só plugins oficiais/consagrados; bloqueio de tela obrigatório pelo POP-CAL-01 (seção 11), conferido pelo administrador no cadastro (o app não confere) |
| Teste do aparelho em etapas | Teste de 1 minuto (abrir `http://IP:4850` no navegador do celular) + emulador no CI, informativo |

Ficaram: o piloto `registroOriginal` = `PAPEL` (padrão; "Comparar com o campo", nada vai para o rascunho) ou `CELULAR`
(trava no computador, "Importar do celular do técnico"); receber um registro sempre grava (com marcas `ORFAO`, `APARELHO_REVOGADO`,
`APOS_RECOLHER`, `FORMATO`, `RELOGIO`, `PILOTO`), e o celular revogado como "roubado" é recusado; a folha só sai do celular
com o recibo do servidor; o APK no instalador; sem a chave de assinatura no GitHub, o release do sistema sai sem o app.

## 7. O que a 1.1.0 entregou (mapa)

- `app-campo/`: o app (Capacitor + React). `src/nucleo/` é TypeScript puro e testado no Vitest da raiz (cliente da API,
  sincronia, estados da folha, trilha de correções, teclado, ordem da "Próxima", PIN); `src/plataforma/` fala com o
  Android; `android/` é o projeto Android versionado, com a lista das permissões permitidas.
- `shared/campo/`: o protocolo (rotas, prazos, `versionCode`), o pacote, o registro, os avisos e o progresso, usados igual
  no app e no servidor.
- `server/campo/` e `server/rotas/campo.ts`, `server/rotas/celulares.ts`: pareamento, autenticação do celular, envios,
  entregas, registros, importação e o APK; migração 25 em `server/db.ts`.
- `src/components/campo/`: Celulares dos técnicos, Cadastrar celular, Enviar para o técnico, Comparar/Puxar, registro de
  campo, cartões do Painel.
- CI: `.github/workflows/app-celular.yml` (APK de debug sempre; de release com os segredos; conferência da versão, da
  assinatura e das permissões), `app-celular-emulador.yml` (abre o app num Android simulado, informativo) e o
  `instalador-windows.yml`, que põe o APK no setup (`APK_CAMPO`, pasta `campo\` da instalação) e no Release.
- Documentação: "App do celular" em `instalador/LEIA-ME.md`, `instalador/GUIA-DO-TECNICO.md` (página do técnico) e
  `docs/APP-CHAVE.md` (a chave de assinatura).

## 8. Riscos e o que falta provar

| Risco | Mitigação |
|---|---|
| Perder a chave de assinatura: os celulares não atualizam mais | Duas cópias offline, senha junto da do A1, a variável `BC_APP_CERT_SHA256` faz o CI recusar outra chave |
| Verificação de desenvolvedor do Google (2027) ou bloqueio antecipado | Cadastro antes de 2027; o cabo (`adb`) continua isento |
| Wi-Fi dos celulares em outra rede ou IP do servidor trocado | Teste de 1 minuto; reserva de DHCP; `/REDES=` no setup; "Endereço do servidor" no app |
| Celular perdido ou roubado | Bloqueio de tela, PIN para assinar, Revogar (com "roubado" tudo é recusado) |
| Desinstalar o app antes de entregar | Avisos no app, no LEIA-ME, nas notas do Release e no guia do técnico; atualização sempre por cima |
| Nunca rodou num celular de verdade | Antes do piloto: QR com a câmera, assinatura deitada, SQLite depois de atualizar o APK, lembrete, entrega real, sol e luva |

## 9. Fontes principais

- Beamex bMobile e LOGiCAL; Fluke MET/TEAM Mobile; TMA ProCal; IndySoft Scales; Fulcrum (sincronização e conflitos);
  GoFormz (assinaturas reabertas se o conteúdo muda).
- MP 2.200-2/2001, art. 10, § 2º; Lei 14.063/2020 (classificação das assinaturas eletrônicas); ISO/IEC 17025:2017, 7.5;
  LGPD (Lei 13.709/2018).
- Capacitor 8 (capacitorjs.com/docs), `@capacitor-community/sqlite`, `@capacitor-mlkit/barcode-scanning`, `signature_pad`.
- Android: configuração de segurança de rede (developer.android.com/privacy-and-security/security-config), backup e
  `dataExtractionRules`, assinatura de apps (developer.android.com/studio/publish/app-signing).
- Verificação de desenvolvedor: developer.android.com/developer-verification e o FAQ
  (developer.android.com/developer-verification/guides/faq, atualizado em 10/11/2026).
- GitHub Actions: imagem do runner Ubuntu 24.04 (JDK 21, Android SDK 36, build-tools 35) e
  ReactiveCircus/android-emulator-runner (v2.38.0, com a regra do udev para o KVM).
