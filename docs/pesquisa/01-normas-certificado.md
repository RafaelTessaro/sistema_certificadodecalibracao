# Pesquisa 01: Normas e requisitos para o certificado de calibração de balanças (laboratório não acreditado)

- **Contexto:** a Balanças.com (Rio Claro-SP) faz assistência técnica de instrumentos de pesagem não automáticos (IPNA) e é, provavelmente, uma oficina permissionária autorizada pelo Inmetro/IPEM-SP. Agora vai emitir certificados de calibração **sem acreditação** da Cgcre/Inmetro, ou seja, fora da RBC.
- **Data da pesquisa:** 14/10/2026.
- **Objetivo:** dizer o que o certificado deve conter, o que é recomendável, o que é proibido e quais frases usar, com as fontes.

> **Como ler este documento**
> - "**Obrigatório (17025)**": exigido pela ABNT NBR ISO/IEC 17025:2017. Nenhuma lei obriga um laboratório não acreditado a cumprir a 17025, mas ela é a referência que auditores e clientes usam para julgar um certificado de calibração. Na prática, trate esses itens como obrigatórios.
> - "**Obrigatório (legal)**": exigido por lei, por portaria do Inmetro ou por norma da Cgcre aplicável a qualquer pessoa.
> - "**Recomendado**": não há exigência formal, mas o item reduz o risco de rejeição em auditoria ou de interpretação enganosa.
> - Quando eu não consegui confirmar algo, isso está dito explicitamente, na seção 10 e ao longo do texto.
> - Os trechos da ABNT NBR ISO/IEC 17025 estão parafraseados ou citados de forma curta, porque a norma tem direitos autorais. Para citar a redação literal, use o exemplar oficial comprado da ABNT.

---

## Sumário

1. [RBC × não RBC](#1-rbc--não-rbc)
2. [Conteúdo do certificado segundo a ABNT NBR ISO/IEC 17025:2017](#2-conteúdo-do-certificado-segundo-a-abnt-nbr-isoiec-170252017)
3. [Checklist de campos do certificado](#3-checklist-de-campos-do-certificado)
4. [Calibração × verificação metrológica e o papel da oficina permissionária](#4-calibração--verificação-metrológica-e-o-papel-da-oficina-permissionária)
5. [Termos e grandezas da balança](#5-termos-e-grandezas-da-balança)
6. [Frases padrão prontas](#6-frases-padrão-prontas)
7. [Assinatura, emissão, numeração, reemissão e guarda de registros](#7-assinatura-emissão-numeração-reemissão-e-guarda-de-registros)
8. [Armadilhas: o que NÃO escrever](#8-armadilhas-o-que-não-escrever)
9. [Recomendações para o sistema](#9-recomendações-para-o-sistema)
10. [Pontos não confirmados e limitações](#10-pontos-não-confirmados-e-limitações)
11. [Fontes](#11-fontes)

---

## 1. RBC × não RBC

### 1.1 O que é a RBC e o que significa ser acreditado

- A **acreditação** é o reconhecimento formal, pela Coordenação-Geral de Acreditação do Inmetro (**Cgcre**), de que um laboratório é competente para realizar calibrações **específicas**, listadas no seu **escopo de acreditação**. A Cgcre avalia o laboratório segundo a ABNT NBR ISO/IEC 17025. O processo é regido pela NIT-DICLA-031 (Regulamento da Acreditação, rev. 26, out/2022).
- Os laboratórios de calibração acreditados formam a **Rede Brasileira de Calibração (RBC)** e recebem um número **CAL nnnn**. Fonte: esclarecimento do IPEM-PR à Vigilância Sanitária (2014).
- Por meio dos acordos de reconhecimento mútuo dos quais a Cgcre é signatária, os certificados com o símbolo de acreditação são aceitos internacionalmente. Até 2025 esses acordos eram da ILAC e da IAAC. **Desde 01/01/2026**, ILAC e IAF passaram a operar como uma só entidade, a *Global Accreditation Cooperation Incorporated* (Global ACI), e o *ILAC MRA Mark* está sendo transferido para ela (fontes: ILAC e IAF). A NIE-CGCRE-009 rev. 27 (jul/2024), consultada nesta pesquisa, ainda fala em "ILAC".

### 1.2 Diferença prática e legal

| Aspecto | Laboratório acreditado (RBC) | Laboratório não acreditado (caso da Balanças.com) |
|---|---|---|
| Base legal para emitir certificado de calibração | Nenhuma lei restringe quem emite certificado de calibração. A acreditação é voluntária. | Pode emitir certificado de calibração. Não encontrei norma brasileira que proíba ou que defina o conteúdo do certificado de um laboratório não acreditado. |
| Avaliação de competência | Por terceira parte (Cgcre), com escopo e CMC definidos, ensaios de proficiência e reavaliações periódicas | Autodeclarada, ou avaliada pelo próprio cliente. A 17025 (Anexo A, A.3.1) admite demonstrar conformidade por "avaliação externa por clientes ou autoavaliação". |
| Símbolo de acreditação, referência à acreditação, marca ILAC-MRA | Pode usar nos termos da NIE-CGCRE-009 e, em certificado que faça referência à acreditação, **deve** usar | **Não pode** usar nem fazer qualquer referência à condição de acreditado |
| Dizer que "pertence à RBC" | Pode (NIE-CGCRE-009, 11.1.14) | Não pode |
| Prova de rastreabilidade para o cliente | O próprio símbolo é a evidência (ILAC P10, Nota 3; NIT-DICLA-030, 8.2.3) | O cliente precisa avaliar a competência do laboratório (ILAC P10, rota 3b e Apêndice A; NIT-DICLA-030, 8.2.5) |
| Aceitação por cliente que é **laboratório acreditado** (ISO/IEC 17025 ou ISO 15189) | Aceito | **Só de forma excepcional**, quando o cliente demonstra por registros que não há laboratório acreditado viável, e não por razão de preço ou de distância (NIT-DICLA-030, 8.2.5, Nota 1) |
| Aceitação por cliente certificado ISO 9001 | Aceito | Geralmente aceito, desde que a rastreabilidade e a incerteza estejam documentadas (ver 2.10) |
| Clientes automotivos (IATF 16949, 7.1.5.3.2) | Aceito | Só com evidência de que o laboratório externo é aceito pelo cliente, por exemplo por avaliação de segunda parte segundo a 17025. A redação atual depende das interpretações sancionadas da IATF, que não confirmei. |
| Setores regulados (Anvisa, MAPA etc.) | Em geral aceito | **Risco.** Exemplo: a RDC Anvisa 67/2007 (farmácias de manipulação) pede calibração "utilizando padrões rastreáveis à Rede Brasileira de Calibração". O IPEM-PR entendeu, em 2014, que **só** laboratórios acreditados atendem a essa exigência. Cada regulamento setorial precisa ser verificado. |

**Conclusão prática:** um certificado que não é RBC atende bem clientes que não têm exigência regulatória ou contratual de acreditação, o que inclui a maioria das auditorias ISO 9001. Ele não atende, salvo exceção documentada, clientes que são laboratórios acreditados, e pode não atender certos setores regulados. O sistema deve permitir registrar na proposta ou contrato se o cliente aceita calibração não acreditada (17025, 7.1).

### 1.3 O que o laboratório não acreditado NÃO pode usar nem afirmar

Fonte principal: **NIE-CGCRE-009**, *Uso da marca, do símbolo e de referências à acreditação*, rev. 27, jul/2024. A norma é dirigida aos organismos acreditados e aos postulantes. O uso por terceiros não acreditados é, além disso, conduta enganosa e pode configurar crime (ver abaixo).

1. **Símbolo de acreditação da Cgcre** e a **marca da acreditação**. A marca é de uso exclusivo da Cgcre e o símbolo é de uso exclusivo dos organismos acreditados (11.1.1 e 11.1.4).
2. **Marca combinada ILAC-MRA** e frases como "A Cgcre é signatária do Acordo de Reconhecimento Mútuo da ILAC". Essas frases só podem aparecer em certificados com o símbolo (11.3 e 11.5.8.1).
3. **Qualquer referência à condição de acreditado**: "acreditado pela Cgcre", "acreditado pelo Inmetro", "credenciado pelo Inmetro", "laboratório RBC", "membro da RBC", "CAL nº...". O OAC, mesmo acreditado, só pode se referir à acreditação dentro do escopo (11.1.9 a 11.1.11). Só acreditados podem citar que pertencem à RBC (11.1.14).
4. **Sugerir que a acreditação está em andamento ou que será concedida** (11.1.10).
5. **Mencionar "rastreabilidade à RBC" em documento sem símbolo.** A NIE-CGCRE-009, ao tratar de produtores de materiais de referência (11.8.8), dá como exemplo de documento "interpretado como tendo sido emitido na condição de acreditado" justamente a "menção à rastreabilidade à Rede Brasileira de Calibração (RBC)". Evite a expressão. Declare a rastreabilidade ao SI e identifique o laboratório acreditado que calibrou seus padrões (ver 1.4).
6. **Marcas do Inmetro em geral** (logomarca, selos, marca de verificação e assemelhados). O uso é regulado pela Portaria Inmetro nº 274/2014 e pelo Catálogo de marcas. Não confirmei se essa portaria ainda está vigente sem alterações. O **Código Penal, art. 296, § 1º, III** tipifica o "uso indevido de marcas, logotipos, siglas ou quaisquer outros símbolos utilizados ou identificadores de órgãos ou entidades da Administração Pública" (pena de reclusão de 2 a 6 anos e multa). A jurisprudência citada nas fontes trata o crime como de mera conduta, inclusive em uso privado, como no caso do logotipo da Receita Federal na fachada de um escritório contábil.
7. **Para a oficina permissionária**, a Portaria Inmetro nº 457/2021 manda usar "adequadamente as marcas do Inmetro, conforme norma Inmetro" (5.5). No cartão funcional do técnico, proíbe "qualquer menção ao Inmetro, além da seguinte inscrição 'autorizada pelo órgão metrológico sob o n° ...'" (2.1.4.1). Por analogia, **não use a autorização de permissionária para dar a entender que a calibração é endossada pelo Inmetro/IPEM**. Se a autorização for citada no certificado, deixe claro que ela abrange apenas reparo e manutenção (ver frase P-15).

### 1.4 Como declarar corretamente a rastreabilidade metrológica

**Requisito:** a 17025, 7.8.4.1 c), exige "uma declaração identificando como os resultados das medições são metrologicamente rastreáveis". Rastreabilidade metrológica é a "propriedade dum resultado de medição pela qual tal resultado pode ser relacionado a uma referência através duma cadeia ininterrupta e documentada de calibrações, cada uma contribuindo para a incerteza de medição" (VIM 2012, 2.41, citado na NIT-DICLA-030, 7.10).

**Cadeia esperada pela Cgcre e pela ILAC:**
- Padrões do laboratório calibrados por um Instituto Nacional de Metrologia signatário do CIPM MRA, como o Inmetro/Dimci,
- ou por um **laboratório acreditado pela Cgcre para a calibração específica**, com certificado que contém o símbolo,
- ou por laboratório acreditado por organismo signatário dos acordos ILAC, IAAC, EA ou APAC.

Fontes: NIT-DICLA-030 rev. 15 (nov/2024), 8.2.1 a 8.2.4; ILAC-P10:07/2020.

**Atenção:** usar padrões calibrados na RBC não basta, por si só, para que o laboratório não acreditado garanta a rastreabilidade das medições que faz (IPEM-PR, 2014, com base no DOQ-CGCRE-003 rev. 04, documento antigo). Também são necessários:
- procedimento documentado e validado;
- incerteza avaliada em cada etapa;
- recalibração dos padrões em intervalos adequados;
- competência demonstrada.

O ILAC P10, Apêndice A, lista as evidências que o cliente deve pedir a um calibrador não acreditado: validação do método, procedimento de incerteza, registros de rastreabilidade, garantia da validade dos resultados, competência do pessoal, equipamentos, condições ambientais e auditorias. A NIT-DICLA-030, 8.2.5.1, lista as mesmas evidências. Tenha esse pacote pronto para enviar ao cliente.

**Redação recomendada:**

> "Os resultados desta calibração são metrologicamente rastreáveis ao Sistema Internacional de Unidades (SI) por meio dos padrões relacionados na tabela 'Padrões utilizados', calibrados por laboratório(s) acreditado(s) pela Cgcre/Inmetro para as respectivas calibrações, conforme os certificados indicados."

Junto com essa frase, inclua a **tabela de padrões**:

| Padrão (descrição) | Identificação | Classe OIML R 111 | Certificado nº | Emitido por (laboratório e nº de acreditação) | Data da calibração |
|---|---|---|---|---|---|
| Jogo de pesos 1 mg a 2 kg | BC-PP-001 | F1 | 12345/2026 | Laboratório X, Cgcre CAL 0000 | 10/03/2026 |

Citar o **número de acreditação do laboratório que calibrou os seus padrões** é factual e é o que a NIT-DICLA-030 espera ver. Não confunda isso com dizer que a Balanças.com é acreditada.

**Variante para pesos-padrão verificados pelo IPEM** (verificação legal, sem valores e sem incerteza no certificado):
- O Manual da Permissionária do IPEM-SP (2018) e a NIT-DICOL-003 aceitam pesos-padrão **verificados**, de 1 mg a 50 kg com periodicidade de 24 meses, para as atividades da oficina.
- Para calibração, a 17025, Anexo A, A.2.3, admite usar padrões que têm apenas declaração de conformidade a uma especificação. O exemplo dado pela própria norma é "Utilização de pesos de classe OIML R 111 para a calibração de uma balança". Nesse caso, o limite da especificação (EMA da classe) entra como contribuição de incerteza.
- Ressalva: a **Cgcre não aceita**, para quem precisa de rastreabilidade sob acreditação, certificados que omitam resultados e incertezas (NIT-DICLA-030, 8.2.6, Nota). Para clientes acreditados, isso reforça que pesos apenas verificados não servem.
- Frase sugerida (P-6b): "Pesos-padrão classe M1 (OIML R 111) verificados pelo IPEM-SP, certificado de verificação nº ..., de dd/mm/aaaa. O erro máximo admissível da classe foi considerado como contribuição de incerteza (ABNT NBR ISO/IEC 17025:2017, Anexo A, A.2.3)."

### 1.5 Incerteza de medição: como expressar (NIT-DICLA-021)

A NIT-DICLA-021, rev. 10 (jul/2020), *Expressão da incerteza de medição por laboratórios de calibração*, aplica-se aos acreditados e também à calibração interna. É a referência brasileira, alinhada com o ILAC-P14:09/2020 e o EA-4/02.

- O resultado é expresso como **y ± U**, ou em tabela. **Em tabela não se usa o sinal ±**: informa-se apenas U. Também não se usa "±" em "U = 0,3 °C" (A.6.1, Nota 1).
- **k e a probabilidade de abrangência devem constar do certificado**, com nota explicativa (A.6.1.1). Ver frase P-4.
- Se k ≠ 2 por graus de liberdade efetivos, a nota deve informar k e νeff (A.6.2).
- **U com no máximo 2 algarismos significativos.** O resultado é arredondado na mesma casa decimal de U (A.6.3; ILAC-P14, 5.3).
- A incerteza deve incluir as contribuições do item calibrado (A.6.4).
- Para balanças, a apresentação do erro e da incerteza deve ser **compatível com a resolução da balança** (DOQ-CGCRE-097, 9.2).
- Componentes mínimos do balanço de incerteza de balanças (DOQ-CGCRE-097, 10.7.1): repetibilidade, resolução (valor de uma divisão), incerteza dos pesos-padrão, deriva dos pesos-padrão e empuxo do ar.
- **"95 %" ou "95,45 %"?** Para distribuição normal, k = 2 corresponde a 95,45 %. A NIT-DICLA-021 e o ILAC-P14 pedem a redação "**aproximadamente 95 %**", e a tabela de k por νeff da NIT-DICLA-021 (Apêndice E) é calculada para 95,45 %. **Recomendo "aproximadamente 95 %"**. Pode-se acrescentar "(95,45 % para distribuição normal)".

---

## 2. Conteúdo do certificado segundo a ABNT NBR ISO/IEC 17025:2017

> A versão vigente é a ABNT NBR ISO/IEC 17025:2017. Não encontrei edição nova publicada nem projeto de revisão ativo confirmado. A Cgcre comenta cada requisito no DOQ-CGCRE-087 (rev. 00, mar/2018).

### 2.1 Generalidades (7.8.1)

- **7.8.1.1:** os resultados devem ser **analisados criticamente e autorizados antes da liberação**. No sistema, isso vira um fluxo "executado → revisado/autorizado → emitido".
- **7.8.1.2:** os resultados devem ser exatos, claros, objetivos e sem ambiguidade. Devem incluir tudo o que foi acordado com o cliente e o que é necessário para interpretá-los. **Todos os relatórios emitidos devem ser retidos como registros técnicos.** O certificado pode ser impresso ou eletrônico (Nota 2).
- **7.8.1.3:** quando acordado com o cliente, o relato pode ser **simplificado**. As informações omitidas de 7.8.2 a 7.8.7 devem ficar prontamente disponíveis.
- A Cgcre esclarece no DOQ-CGCRE-087 que:
  - o certificado pode ser emitido em outro idioma;
  - não usar o VIM só é não conformidade se gerar ambiguidade;
  - um mesmo certificado pode reunir vários instrumentos do mesmo cliente, desde que continue claro;
  - pode-se citar no certificado o proprietário do instrumento, desde que o cliente (contratante) também seja citado.

### 2.2 Requisitos comuns: 7.8.2.1, alíneas a) a p)

Cada certificado deve incluir pelo menos as informações abaixo, "a menos que o laboratório tenha razões válidas para não fazer isso".

| Alínea | Conteúdo (paráfrase) | Aplicação a balanças / observação |
|---|---|---|
| a) | Título | "Certificado de Calibração" |
| b) | Nome e endereço do laboratório | Razão social, CNPJ (recomendado), endereço de Rio Claro-SP |
| c) | Local onde as atividades foram realizadas, inclusive nas instalações do cliente ou em instalações temporárias ou móveis | Calibração de balança costuma ser no cliente. Informe o endereço do local de instalação. |
| d) | Identificação unívoca, com todas as partes reconhecíveis como do mesmo relatório, e clara identificação do final | Número do certificado e "Página X de Y" em todas as páginas, mais "Fim do certificado" |
| e) | Nome e informações de contato do cliente | O proprietário, se for outro, pode ser acrescentado (DOQ-CGCRE-087) |
| f) | Identificação do método utilizado | Código e revisão do procedimento interno, mais referência pública (EURAMET cg-18 v4.0, DOQ-CGCRE-097) e uma descrição resumida do método. Para procedimento interno, a Cgcre pede a descrição resumida (DOQ-CGCRE-087). |
| g) | Descrição, identificação não ambígua e, quando necessário, condição do item | Fabricante, modelo, nº de série, TAG do cliente, Max, Min, e, d, classe, nº da portaria de aprovação de modelo, estado e anomalias |
| h) | Data de recebimento do item, quando for crítica | Normalmente não se aplica à calibração no local |
| i) | Data(s) da atividade | Data ou período da calibração |
| j) | Data de emissão do relatório | Requisito novo da versão 2017 |
| k) | Plano e método de amostragem, quando pertinente | Não se aplica |
| l) | Declaração de que os resultados se referem somente aos itens calibrados | Frase P-1 |
| m) | Resultados com as unidades de medida | Tabelas de erro, repetibilidade, excentricidade e incerteza |
| n) | Adições, desvios ou exclusões em relação ao método | Por exemplo: faixa parcial, pontos definidos pelo cliente, ensaio de excentricidade não realizado e o motivo |
| o) | Identificação da(s) pessoa(s) que autoriza(m) o relatório | A Cgcre esclarece que basta identificar a pessoa, "dispensando detalhes tais como 'assinatura(s)'" (DOQ-CGCRE-087). Ver seção 7. |
| p) | Identificação clara de resultados de provedores externos | Se houver subcontratação |
| Nota | Declaração de que o relatório só pode ser reproduzido na íntegra sem aprovação | Recomendado (frase P-3) |

**7.8.2.2:** o laboratório responde por todas as informações do relatório, **exceto as fornecidas pelo cliente**. Essas devem ser **claramente identificadas**. Se puderem afetar a validade dos resultados, é obrigatório incluir uma **ressalva**. Exemplos: TAG, setor, faixa de uso e critério de aceitação informados pelo cliente. Ver frase P-11.

### 2.3 Requisitos específicos de certificados de calibração (7.8.4.1)

Além do que pede o 7.8.2, o certificado deve incluir:

| Alínea | Conteúdo | Comentário |
|---|---|---|
| a) | **Incerteza de medição** do resultado, na mesma unidade do mensurando ou em termo relativo (%) | Nota: o resultado de medição "é geralmente expresso como um único valor medido, incluindo a unidade de medida e uma incerteza de medição". A Cgcre **não aceita** certificado sem resultado e sem incerteza (NIT-DICLA-030, 8.2.6; NIE-CGCRE-009, 11.5.12; DOQ-CGCRE-087). |
| b) | **Condições** (por exemplo, ambientais) que influenciam os resultados | Temperatura, umidade relativa e pressão, registradas **no início e no fim** da calibração (DOQ-CGCRE-097, 10.6) |
| c) | **Declaração de rastreabilidade metrológica** (ver Anexo A) | Ver 1.4 |
| d) | **Resultados antes e depois de ajuste ou reparo**, se disponíveis | Segundo a Cgcre, por acordo escrito com o cliente o resultado "antes" pode ser omitido (DOQ-CGCRE-087). Se o cliente usa autoajuste, os resultados **antes** do autoajuste devem constar do certificado (DOQ-CGCRE-097, 10.2.3). O ajuste não faz parte da calibração. |
| e) | Quando pertinente, **declaração de conformidade** (ver 7.8.6) | Só quando solicitada ou acordada |
| f) | Quando apropriado, **opiniões e interpretações** (ver 7.8.7) | Opcional, separadas e identificadas |

**7.8.4.3:** o certificado **ou a etiqueta de calibração** não pode conter **recomendação de intervalo de calibração**, exceto se isso tiver sido acordado com o cliente. A Cgcre acrescenta que, se uma lei ou regulamento exigir o intervalo, a exigência legal prevalece (DOQ-CGCRE-087).

Conclusão para o sistema: o campo "próxima calibração" deve ficar **desabilitado por padrão**. Ele só aparece quando o pedido registrar "intervalo solicitado pelo cliente", com a redação da frase P-10b. A definição do intervalo é do usuário. A referência técnica é o ILAC-G24/OIML D 10:2022. O DOQ-CGCRE-036 recomenda, para laboratórios acreditados, intervalos iniciais anuais ou semestrais, ajustados pelo histórico, mas isso é decisão do dono da balança.

### 2.4 Declaração de conformidade e regra de decisão (7.1.3, 7.8.6 e ILAC-G8)

- **7.1.3:** quando o cliente pede uma declaração de conformidade (aprovado/reprovado, dentro/fora da tolerância), a especificação e a **regra de decisão** devem ser definidas e **acordadas antes**, salvo se forem inerentes à especificação.
- **7.8.6.1:** o laboratório deve **documentar a regra de decisão**, considerando o risco de falsa aceitação ou falsa rejeição, e aplicá-la. Se a regra for prescrita pelo cliente, por regulamento ou por norma, não é preciso analisar o risco de novo.
- **7.8.6.2:** a declaração deve identificar:
  - a) a quais resultados se aplica;
  - b) quais especificações são atendidas ou não;
  - c) a regra de decisão aplicada.
- **ILAC-G8:09/2019** define as opções:
  - **Aceitação simples** (w = 0): "Conforme/Não conforme" pelo valor medido. O risco de falsa aceitação chega a 50 % quando o resultado está no limite.
  - **Binária com banda de guarda** (w = U é o mais comum): aceita quando o resultado ≤ LT − w.
  - **Não binária**: Conforme / Conforme condicional / Não conforme condicional / Não conforme.
  - A tabela 1 do G8 mostra o risco de falsa aceitação (PFA) por banda de guarda: w = 1U dá PFA < 2,5 %; w = 0,83U (ISO 14253-1) dá < 5 %; w = 0 dá < 50 %.
  - A regra deve ser **acordada antes da medição**.
- A Cgcre lembra que declaração de conformidade **não é** opinião ou interpretação (DOQ-CGCRE-087).
- **Cuidado com balanças reguladas:** se a especificação usada forem os EMA da Portaria Inmetro nº 157/2022, a declaração pode ser confundida com uma verificação legal. Use sempre junto a frase P-8 (a calibração não substitui a verificação do IPEM). Ver seção 4.

### 2.5 Opiniões e interpretações (7.8.7)

- Só pessoal **autorizado** pode emiti-las. A base delas deve ser documentada (7.8.7.1).
- Devem se basear nos resultados do item calibrado e ser **claramente identificadas como tais** (7.8.7.2).
- Se comunicadas em conversa com o cliente, é preciso reter registro do diálogo (7.8.7.3).
- Não confundir com inspeção ou certificação de produto (ISO/IEC 17020 e 17065) nem com declaração de conformidade.
- Exemplos: "recomenda-se manutenção do sistema de nivelamento"; "a excentricidade observada sugere desgaste dos batentes".
- Para acreditados, a Cgcre exige que as opiniões venham **após todos os resultados**, precedidas de uma frase própria (NIE-CGCRE-009, 11.5.9). Copie a prática, adaptada (frase P-12).

### 2.6 Emendas e reemissão (7.8.8)

- **7.8.8.1:** qualquer alteração de um certificado emitido deve ser **claramente identificada** e, quando apropriado, ter o **motivo** incluído.
- **7.8.8.2:** emenda após a emissão só por **novo documento** (ou transferência de dados) com a declaração "Emenda ao Relatório [ou Certificado], número de série ..." ou redação equivalente. A emenda deve atender a todos os requisitos da norma.
- **7.8.8.3:** um novo certificado completo deve ter **identificação unívoca** e **referência ao original substituído**.
- Os registros técnicos alterados devem permitir rastrear a versão anterior: dados originais e alterados, data, aspectos alterados e responsável (7.5.2).

### 2.7 Conteúdo específico para balanças (EURAMET cg-18 v4.0, seção 8, e DOQ-CGCRE-097)

O **EURAMET Calibration Guide No. 18, v4.0 (11/2015)** é a referência internacional para calibração de IPNA. Ainda não há versão mais nova publicada. Na seção 8 ele lista o que convém constar do certificado, "consistente com a ISO/IEC 17025, que tem precedência":

- **8.1 Informações gerais:**
  - identificação do laboratório;
  - referência à acreditação: **não se aplica à Balanças.com**, omitir;
  - nº do certificado, data de emissão, número de páginas;
  - assinatura de pessoa autorizada;
  - identificação do cliente e do instrumento (fabricante, tipo, **Max, d**, local de instalação);
  - aviso de reprodução apenas na íntegra.
- **8.2 Procedimento:**
  - data e local das medições;
  - condições ambientais e de uso;
  - informação sobre **ajuste realizado** (interno ou externo e, se externo, qual peso foi usado), anomalias e configurações de software relevantes;
  - referência ou descrição do procedimento, por exemplo o intervalo de tempo entre carregamentos;
  - acordos com o cliente, como faixa limitada ou especificação para conformidade;
  - **informação de rastreabilidade**.
- **8.3 Resultados:**
  - indicações e/ou **erros** para as cargas de ensaio, ou por equação de aproximação;
  - detalhes do carregamento;
  - **desvio-padrão** (repetibilidade);
  - **resultado de excentricidade**, se realizado;
  - **incerteza expandida** do erro de indicação;
  - **k**, com comentário sobre a probabilidade de abrangência e o motivo se k ≠ 2;
  - aviso se as leituras não foram feitas com a resolução normal.
- **8.4 Informação adicional (opcional, anexa sem fazer parte do certificado):**
  - incerteza esperada em uso;
  - fórmula R ± U(R) ou "incerteza global";
  - declaração de conformidade, por exemplo |W − R| ≤ Tol.

**DOQ-CGCRE-097** (*Orientações para calibração de balanças, pesos-padrão e medição de massa de peças diversas*, rev. 00, dez/2022) é orientativo para acreditados, mas é o melhor padrão brasileiro de mercado:

- **Modelo de tabela de resultados para balanças (Tabela 2):**

| Valor nominal | Indicação da balança | Erro de indicação | U | k | νeff |
|---|---|---|---|---|---|
| 1 kg | 1,02 kg | 0,02 kg | 0,05 kg | 2,00 | Infinito |

- Itens do documento que afetam o certificado:
  - **10.4.1:** o valor obtido no ensaio de excentricidade deve constar do certificado. A carga é de cerca de 1/3 de Max até 500 kg, 1/5 de 500 kg a 3 000 kg e 1/10 acima de 3 000 kg.
  - **10.5.1 e 10.5.2:** salvo outro pedido do cliente, a calibração cobre do zero ao Max. Em balança de múltiplas faixas, o cliente define quais faixas calibrar. Se a faixa for parcial, informe no certificado (alínea n).
  - **10.6:** temperatura, umidade relativa e pressão no início e no fim.
  - **10.2.2 e 10.2.3:** instrumentos normalmente ajustados antes do uso devem ser ajustados antes da calibração, salvo acordo com o cliente. Os resultados **antes do autoajuste** devem ser registrados no certificado.
  - **10.9:** cargas de substituição podem ser usadas a partir de 1 000 kg. Informe o procedimento no certificado.
- **Observação:** o DOQ-CGCRE-097 ainda cita a Portaria Inmetro 236/94, que foi revogada pela 157/2022. Na prática, leia como 157/2022.

### 2.8 O que o mercado espera mesmo sem acreditação (ISO 9001:2015, 7.1.5)

**O que a ISO 9001:2015 pede** (paráfrase dos itens 7.1.5.1 e 7.1.5.2):
- a organização deve determinar e prover recursos de monitoramento e medição adequados e reter informação documentada que comprove essa adequação;
- quando a rastreabilidade de medição for requisito, ou for considerada essencial para a confiança nos resultados, os equipamentos devem:
  - a) ser **calibrados e/ou verificados a intervalos especificados, ou antes do uso, contra padrões rastreáveis a padrões nacionais ou internacionais**. Se esses padrões não existirem, a base usada deve ser retida como informação documentada;
  - b) ser **identificados** para que se determine sua situação;
  - c) ser protegidos contra ajustes, danos ou deterioração que invalidem a calibração;
- se um equipamento se mostrar inadequado, a organização deve avaliar se os resultados anteriores foram afetados.

**A ISO 9001 não exige acreditação do calibrador.** O auditor verifica rastreabilidade, adequação ao uso e análise crítica do certificado pelo cliente, que compara erro + U com o critério do processo. O IPEM-PR sugere, na falta de outro critério, |erro| + |U| ≤ EMA do processo.

**Situação da norma:** a **ISO 9001:2026** foi publicada em inglês em 16/09/2026 (DQS). O prazo de transição esperado é de cerca de 3 anos, a confirmar pela Global ACI. Não confirmei se o texto do 7.1.5 mudou nem se já existe edição ABNT. Durante a transição, as auditorias seguem a 2015.

**Itens essenciais para o certificado não RBC passar em auditoria ISO 9001 do cliente** (síntese baseada nos requisitos acima e na prática de auditoria; o último item é opinião técnica):
1. **Identificação inequívoca do instrumento**, que bata com o cadastro do cliente: TAG/código interno, nº de série, fabricante, modelo, Max, d, e local. Atende o 7.1.5.2 b).
2. **Data da calibração**. O cliente usa essa data para controlar o próprio intervalo.
3. **Resultados com unidade e incerteza expandida (U, k)**, sem os quais o cliente não consegue avaliar a adequação ao uso (7.1.5.1).
4. **Declaração de rastreabilidade ao SI com identificação dos padrões e dos respectivos certificados (com nº CAL do laboratório acreditado)** (7.1.5.2 a).
5. **Resultados antes e depois de ajuste ou reparo**, quando houver. Permitem ao cliente cumprir o "avaliar validade de resultados anteriores" do 7.1.5.2.
6. **Método ou procedimento identificado** e **condições ambientais**.
7. **Número único, data de emissão, paginação e identificação de quem autorizou.**
8. **Ausência de "validade" e de "aprovado"** sem regra de decisão (ver seção 8).
9. Recomendado: disponibilizar ao cliente, sob pedido, cópia dos certificados dos padrões e uma "declaração de competência", ou dossiê, conforme o ILAC P10, Apêndice A, e a NIT-DICLA-030, 8.2.5.1. Isso é especialmente útil para clientes IATF ou acreditados que usem a via excepcional.

---

## 3. Checklist de campos do certificado

Legenda de status:
- **OBR-17025**: obrigatório pela ABNT NBR ISO/IEC 17025:2017.
- **OBR-SE**: obrigatório quando aplicável.
- **OBR-LEGAL**: obrigatório por regulamento.
- **REC**: recomendado.
- **OPC**: opcional.
- **PROIB***: proibido, salvo acordo com o cliente.
- **PROIBIDO**: não pode constar.

| # | Campo | Status | Fonte | Observação para o sistema |
|---|---|---|---|---|
| 1 | Título "Certificado de Calibração" | OBR-17025 | 17025, 7.8.2.1 a) | Texto fixo. Nunca usar "certificado de aferição" nem "laudo de aferição". |
| 2 | Nome (razão social), CNPJ e endereço do laboratório | OBR-17025 (CNPJ: REC) | 7.8.2.1 b); EURAMET cg-18, 8.1 | Logotipo próprio pode. Sem logo de Inmetro, Cgcre, RBC ou ILAC. |
| 3 | Local da calibração (laboratório ou endereço do cliente) | OBR-17025 | 7.8.2.1 c) | Campo obrigatório "local de execução" |
| 4 | Número único do certificado | OBR-17025 | 7.8.2.1 d) | Sequencial, nunca reutilizado (ver 7.3) |
| 5 | "Página X de Y" e nº do certificado em todas as páginas, mais marca de "Fim do certificado" | OBR-17025 | 7.8.2.1 d) | Cabeçalho e rodapé automáticos |
| 6 | Nome e contato do cliente | OBR-17025 | 7.8.2.1 e) | |
| 7 | Proprietário ou local do instrumento, se diferente do cliente | OPC | DOQ-CGCRE-087 (nota em 7.8.2) | O cliente também deve constar |
| 8 | Procedimento ou método (código, revisão, referência e descrição resumida) | OBR-17025 | 7.8.2.1 f); DOQ-CGCRE-087 | Ex.: "PT-CAL-01 rev. 2, baseado no EURAMET cg-18 v4.0" |
| 9 | Identificação do instrumento: tipo, fabricante, modelo, nº de série, TAG do cliente | OBR-17025 | 7.8.2.1 g); EURAMET 8.1 | |
| 10 | Características metrológicas: Max, Min, e, d, n, classe de exatidão, faixas (Max1/e1...), unidade | REC (essencial na prática) | Port. 157/2022, 7.1 e 7.2; EURAMET 8.1 (Max, d) | Transcrever "conforme marcação do instrumento", sem implicar conformidade legal |
| 11 | Nº da Portaria de aprovação de modelo (PAM) | REC | Port. 157/2022, 7.2; Port. 457/2021, 5.12.2 c) | Ex.: "Portaria Inmetro/Dimel nº .../aaaa" |
| 12 | Condição do item (nivelado, limpo, anomalias, integridade e nº das marcas de selagem) | OBR-SE | 7.8.2.1 g); EURAMET 8.2; Port. 157, 8.8.7.4 d) | Registrar os selos encontrados e os deixados |
| 13 | Data de recebimento do item | OBR-SE (quando crítica) | 7.8.2.1 h) | Calibração no local: N/A |
| 14 | Data(s) da calibração | OBR-17025 | 7.8.2.1 i) | Data ou período |
| 15 | Data de emissão | OBR-17025 | 7.8.2.1 j) | Validação: emissão ≥ calibração |
| 16 | Declaração de que os resultados se referem só ao item calibrado | OBR-17025 | 7.8.2.1 l) | Frase P-1 |
| 17 | Resultados com unidades: carga de ensaio (valor de referência), indicação, erro de indicação | OBR-17025 | 7.8.2.1 m); EURAMET 8.3; DOQ-CGCRE-097, Tab. 2 | Unidades SI (kg, g, mg, t) |
| 18 | Repetibilidade (desvio-padrão, nº de repetições, carga) | REC (essencial) | EURAMET 8.3; DOQ-CGCRE-097, 10.3 | Por faixa, em balança multifaixa |
| 19 | Excentricidade (carga, posições, desvios) | REC (essencial). Se não feito: OBR-SE explicar (alínea n) | DOQ-CGCRE-097, 10.4.1; EURAMET 8.3 | |
| 20 | Incerteza expandida U por ponto, k, νeff (ou probabilidade) e nota explicativa | OBR-17025 | 7.8.4.1 a); NIT-DICLA-021 A.6; ILAC-P14, 5.2 | U com ≤ 2 algarismos significativos; resultado arredondado na casa de U; sem "±" na tabela |
| 21 | Condições ambientais (T, UR, p) no início e no fim | OBR-17025 | 7.8.4.1 b); DOQ-CGCRE-097, 10.6 | Identificar o termo-higrômetro e o barômetro (REC) |
| 22 | Declaração de rastreabilidade ao SI | OBR-17025 | 7.8.4.1 c); Anexo A; NIT-DICLA-030 | Frase P-6 |
| 23 | Tabela de padrões: identificação, classe, nº do certificado, laboratório e nº CAL, data | REC (essencial) | NIT-DICLA-030, 8.2; ILAC-P10 | Puxar do cadastro de padrões. Bloquear emissão se o padrão estiver vencido pelo intervalo interno. |
| 24 | Cargas de substituição e procedimento de carregamento | OBR-SE | EURAMET 8.2 e 8.3; DOQ-CGCRE-097, 10.9 | |
| 25 | Resultados antes e depois de ajuste ou reparo; tipo de ajuste (interno/externo, peso usado) | OBR-SE | 7.8.4.1 d); DOQ-CGCRE-097, 10.2.3; EURAMET 8.2 | Duas tabelas: "como encontrado" e "como deixado" |
| 26 | Referência à Ordem de Serviço, à marca de reparo e aos selos (se houve intervenção de permissionária) | REC | Port. 457/2021, 5.12; NIT-DICOL-002, 10.1.7 e 10.1.8 | Frase P-9b |
| 27 | Faixa calibrada, se parcial, e pontos acordados (adições, desvios, exclusões) | OBR-SE | 7.8.2.1 n); DOQ-CGCRE-097, 10.5.1 | |
| 28 | Informações fornecidas pelo cliente identificadas (*) e ressalva | OBR-SE | 7.8.2.2 | Frase P-11 |
| 29 | Resultados de provedor externo identificados | OBR-SE | 7.8.2.1 p) | |
| 30 | Declaração de conformidade com especificação e **regra de decisão** | OBR-SE (só se solicitada) | 7.8.4.1 e); 7.8.6; 7.1.3; ILAC-G8 | Exige registro prévio do acordo. Nunca omitir resultados e U. |
| 31 | Opiniões e interpretações, separadas e identificadas | OPC | 7.8.4.1 f); 7.8.7 | Após os resultados (frase P-12) |
| 32 | Intervalo de calibração ou "próxima calibração" | PROIB* | 7.8.4.3 | Só com flag "solicitado pelo cliente" (frase P-10b) |
| 33 | "Validade do certificado" ou "válido até" | PROIBIDO | 7.8.4.3; seção 8 | Não existir no modelo |
| 34 | Nota de reprodução apenas na íntegra | REC | 7.8.2.1, Nota; EURAMET 8.1 | Frase P-3 |
| 35 | Nota sobre as condições no momento da calibração e a não inclusão de efeitos de longo prazo | REC | ILAC-P14, 5.4; NIT-DICLA-021, A.6.4 | Frase P-2 |
| 36 | Declaração de que o laboratório não é acreditado | REC (não encontrei obrigação legal) | Transparência; lógica da NIE-CGCRE-009, 11.5.7 | Frase P-7 |
| 37 | Declaração de que a calibração não isenta do controle metrológico legal nem substitui a verificação do IPEM | REC (fortemente) | NIE-CGCRE-009, 11.5.11; Port. 157/2022, 8.7 a 8.9 | Frases P-8a e P-8b |
| 38 | Identificação de quem autorizou (nome e função) e assinatura | OBR-17025 (identificação); REC (assinatura) | 7.8.2.1 o); DOQ-CGCRE-087 | Ver seção 7 |
| 39 | Técnico executante | REC | 17025, 7.5.1 (registro técnico) | Pode ficar só no registro interno |
| 40 | Identificação de revisão, emenda ou reemissão, com referência ao original e motivo | OBR-SE | 7.8.8 | Ver 7.3 |
| 41 | Código de verificação de autenticidade (QR, URL ou hash) | REC | Boa prática; MP 2.200-2/2001, art. 10 | |
| 42 | Símbolo, marca ou menção à Cgcre, RBC, ILAC-MRA, Global ACI; "acreditado"; "credenciado" | **PROIBIDO** | NIE-CGCRE-009; CP art. 296, § 1º, III | Bloqueio no modelo |
| 43 | Logomarca ou selo do Inmetro ou do IPEM; imitação de marca de verificação | **PROIBIDO** | Port. Inmetro 274/2014; Port. 457/2021, 5.5; CP art. 296 | |
| 44 | Incerteza em uso / equação de aproximação ("incerteza global") | OPC | EURAMET cg-18, 8.4 | Anexo informativo |

---

## 4. Calibração × verificação metrológica e o papel da oficina permissionária

### 4.1 Definições oficiais

| Conceito | Definição | Fonte |
|---|---|---|
| **Calibração** | "Operação que estabelece, sob condições especificadas, numa primeira etapa, uma relação entre os valores e as incertezas de medição fornecidos por padrões e as indicações correspondentes com as incertezas associadas; numa segunda etapa, utiliza esta informação para estabelecer uma relação visando a obtenção dum resultado de medição a partir duma indicação." Nota 2: não confundir com o **ajuste**, "frequentemente denominado de maneira imprópria de 'autocalibração'", nem com a verificação da calibração. | VIM 2012, 2.39 (Port. Inmetro 232/2012), reproduzido no VIML, 0.14 |
| **Ajuste** | Operações num sistema de medição para que forneça indicações prescritas. A calibração é pré-requisito do ajuste. Após o ajuste, o sistema geralmente deve ser recalibrado. | VIM 2012, 3.11 / VIML, 0.15 |
| **Verificação (metrologia legal)** | "Procedimento de avaliação da conformidade (diferente da avaliação de modelo) que resulta na afixação de marca de verificação e/ou a emissão de certificado de verificação." | VIML, 2.09 (Port. Inmetro 150/2016) |
| **Verificação inicial** | Verificação de instrumento não verificado anteriormente | VIML, 2.12 |
| **Verificação subsequente** | Verificação após uma verificação anterior. Inclui a periódica obrigatória, a **após reparo** e a voluntária. | VIML, 2.13 |
| **Verificação periódica obrigatória** | Verificação subsequente em intervalos fixados por regulamento | VIML, 2.14 |
| **Certificado de verificação** | Documento que certifica que a verificação foi feita e que a **conformidade aos requisitos legais** foi constatada | VIML, 3.02 |
| **Marca de selagem / selagem** | Meios ou marca para proteger o instrumento contra modificação, reajuste ou remoção de partes não autorizados | VIML, 2.20 e 3.06 |

A diferença, em resumo:
- a **calibração** quantifica erro e incerteza e é voluntária;
- a **verificação** é um ato de **metrologia legal**, compulsório, que declara "aprovado" ou "reprovado" frente ao regulamento técnico metrológico (RTM);
- só o Inmetro e os órgãos da RBMLQ-I (no estado, o **IPEM-SP**) realizam a verificação (gov.br/Inmetro, página "Verificação"; Lei 9.933/1999, art. 3º, III: poder de polícia exclusivo do Inmetro em metrologia legal);
- o IPEM-PR resume: "são atividades distintas". A verificação "é compulsória". O resultado da calibração serve para o **detentor** decidir se o instrumento está apto ao seu uso;
- o IPEM-SP (Almanaque) lembra que "aferição" deixou de constar do VIM 2012 e do VIML e que se "deve evitar o uso da palavra 'aferição' como conceito metrológico".

### 4.2 O RTM vigente: Portaria Inmetro nº 157, de 31/03/2022

- **Confirmado:** a Portaria Inmetro nº 157/2022 "aprova o Regulamento Técnico Metrológico consolidado para instrumentos de pesagem não automáticos".
  - Entrou em vigor em **02/01/2023** (art. 4º).
  - **Revogou** a Portaria Inmetro 236/1994 e as que a alteravam: 02/1995, 101/1995, 33/1998, 261/2002, 224/2005, 166/2007, 266/2009 e 237/2012 (art. 3º).
  - Não encontrei alteração ou revogação posterior, mas confirme no portal de legislação do Inmetro, que estava fora do ar (HTTP 503) durante esta pesquisa.
- **Campo de aplicação (art. 1º, § 1º):** a pesagem para:
  - a) transações comerciais;
  - b) cálculo de pedágio, tarifa, imposto, prêmio, multa, remuneração etc.;
  - c) aplicação de lei ou regulamento e perícias;
  - d) área da saúde e pesagem de pessoas em farmácias;
  - e) fabricação de medicamentos e cosméticos;
  - f) análises químicas, clínicas, de alimentos, farmacêuticas, toxicológicas, ambientais etc.;
  - g) atividades industriais e comerciais cujo resultado influencie preço, meio ambiente ou a incolumidade das pessoas.
  - **Isso abrange a maioria das balanças dos clientes da Balanças.com.**
- **Verificação inicial (8.7):** é obrigatória antes da comercialização e é atestada "por certificado e marca de verificação" (8.7.8).
- **Verificação subsequente (8.8):** o detentor deve submeter o instrumento à **verificação periódica** e à **verificação após reparo** (8.8.1). O órgão metrológico atesta "por meio de certificado e pela colocação no instrumento da marca de verificação, acompanhada de sua validade" (8.8.3).
- **Validade da verificação (8.8.7.1):** "limitada em 1 (um) ano", contada após o ano civil da última verificação (8.8.7.3). Ela **expira antes** do prazo se, entre outros casos, houver modificações que influenciem as propriedades metrológicas, ou se a marca de verificação ou de selagem estiver "irreconhecível, obliterada, ou removida" (8.8.7.4 b e d).
- **EMA (Tabela 5)**, conforme a cópia consultada:

  | Aprovação de modelo | Verificação | Classe I | Classe II | Classe III | Classe IIII |
  |---|---|---|---|---|---|
  | ± 0,5 e | ± 1,0 e | 0 ≤ m ≤ 50 000 | 0 < m ≤ 5 000 | 0 ≤ m ≤ 500 | 0 ≤ m ≤ 50 |
  | ± 1,0 e | ± 2,0 e | 50 000 < m ≤ 200 000 | 5 000 < m ≤ 20 000 | 500 < m ≤ 2 000 | 50 < m ≤ 200 |
  | ± 1,5 e | ± 2,0 e | 200 000 < m | 20 000 < m ≤ 100 000 | 2 000 < m ≤ 10 000 | 200 < m ≤ 1 000 |

  - Na inspeção em serviço (supervisão metrológica), os EMA são o **dobro** dos da verificação (2.5.3 e 8.9).
  - A terceira linha (± 2,0 e na verificação) foi transcrita **como impressa** na cópia consultada, que é a do SIBAPEM e não a do DOU. Confira na publicação oficial antes de usar em cálculo automático de conformidade.
- **Inscrições obrigatórias (7.1):** marca do fabricante, **classe de exatidão** em algarismos romanos dentro de oval, **Max**, **Min** e **e**. Se aplicável (7.2): nº de série, **identificação da aprovação de modelo**, **d** (se d < e), T = +/−, Lim, limites de temperatura etc.

### 4.3 O que a oficina permissionária faz

A base é a **Portaria Inmetro nº 457/2021** (RTM de reparo e manutenção, vigente desde 01/12/2021). Ela revogou as Portarias 4/2013, 65/2015, 316/2015, 386/2015 e 286/2018, e foi alterada pela Portaria 50/2022 no item 2.3.9. A outra base é a **NIT-DICOL-002 rev. 03 (fev/2022)**.

- **Permissionária:** sociedade "que possui autorização do Inmetro [...] para realizar as atividades de **reparo e manutenção** em instrumentos de medição regulamentados" (457, 1.2).
  - **Reparo:** serviço corretivo.
  - **Manutenção:** serviço preventivo ou preditivo (1.4 e 1.5).
  - A autorização é precária, válida por no máximo **1 ano** e renovável (4.3).
  - A permissionária deve ter técnico responsável **registrado no órgão da RBMLQ-I** (2.1.2).
- **Padrões:** os padrões regulamentados são verificados conforme o RTM. Os demais são "calibrados por laboratório acreditado ou rastreados ao Inmetro" (457, 2.2.2 e 2.2.3). O IPEM-SP exige, no Manual da Permissionária (2018), calibração "somente por laboratórios acreditados pela Cgcre [...] ou pelo Inmetro", e aceita **verificação** para pesos-padrão de 1 mg a 50 kg, com periodicidade de 24 meses (NIT-DICOL-003, jul/2018).
- **Selagem:** para reparar, a permissionária pode romper as marcas de selagem, "desde que as substituam por outras" (457, 5.10).
  - Para IPNA usa a **marca de selagem da permissionária**, com nº de autorização e UF (DICOL-002, 7.4, 8.4 e 9.2.2).
  - A **marca de reparo** é obrigatória em IPNA após reparo ou manutenção (DICOL-002, 10.1.7.2, Tabela 2).
  - Ao afixar a marca de reparo, "devem ser removidas todas as marcas de verificação [...] anteriores" (DICOL-002, 10.1.7.3).
  - Antes de selar, a oficina deve ensaiar o instrumento e confirmar os EMA da **verificação após reparo**, usando "apenas padrões de medição devidamente calibrados e/ou verificados" (DICOL-002, 10.1.5 a 10.1.7).
- **Ordem de Serviço (457, 5.12):**
  - é obrigatória para todo serviço, em 2 vias e assinada pelo executor;
  - deve conter, no mínimo: identificação da permissionária (nome, CNPJ, endereço, telefone); data e local; identificação do instrumento (**nº de série e Portaria de Aprovação de Modelo**); descrição do serviço; executor (nome, assinatura, documento); numeração das marcas de selagem retiradas e apostas e da marca de reparo;
  - deve ser guardada por **pelo menos 2 anos** (457, 2.3.6; DICOL-002, 10.1.8).
- **Prestação de contas no PSIE:** para IPNA, até o **dia 15 do mês seguinte** ao reparo (DICOL-002, 11.3.1).
- **Após o reparo:** "Qualquer instrumento de medição, após reparo ou manutenção, deve ser submetido à verificação após reparo, salvo nos casos previstos pela legislação metrológica" (457, 10.1). A verificação é feita pelo IPEM-SP.
- **Autoverificação:** a Portaria Inmetro 400/2013, que autorizava empresas a declarar conformidade como alternativa à verificação inicial e após reparo, foi revogada pela Portaria 78/2022 (fonte agregadora; não confirmei se o regime atual abrange IPNA). **Não presuma que a Balanças.com possa substituir a verificação do IPEM.**

### 4.4 Como o certificado de calibração se relaciona com isso

1. **São documentos e atos distintos.**
   - A **OS** (Portaria 457) documenta reparo ou manutenção, selos e marca de reparo.
   - O **certificado de verificação ou a marca do IPEM** atesta a conformidade legal.
   - O **certificado de calibração** relata erros e incertezas. É serviço voluntário, regido pela 17025 e pelo acordo com o cliente.
2. **A calibração não pode romper selos.** Se o ajuste exigir abrir pontos selados, o que se faz é **manutenção/reparo de permissionária**: abre-se OS, aplica-se marca de selagem e marca de reparo, presta-se contas no PSIE, e o instrumento fica sujeito à **verificação após reparo** do IPEM. Isso também faz a validade da verificação expirar (Port. 157, 8.8.7.4). Ajustes acessíveis ao usuário, como o ajuste de zero e o autoajuste interno, são de outra natureza (DOQ-CGCRE-036, 11.1).
3. **No certificado de calibração**, quando houve intervenção:
   - registre os resultados **antes e depois** (7.8.4.1 d);
   - cite o **nº da OS**, da **marca de reparo** e dos **selos** retirados e apostos;
   - informe que o instrumento fica sujeito à verificação após reparo (frase P-9b).
4. **O certificado não pode dar a entender que substitui a verificação.** Use as frases P-8a e P-8b. Não escreva "aprovado", "liberado para uso comercial", "dentro da portaria" ou "conforme Inmetro" sem a regra de decisão e sem a ressalva legal.
5. A frase oficial que a Cgcre admite para instrumentos regulamentados é: **"Esta calibração não isenta o instrumento do controle metrológico estabelecido na regulamentação metrológica"** (NIE-CGCRE-009, 11.5.11). A norma é para acreditados, mas a redação serve como modelo.

---

## 5. Termos e grandezas da balança

Use os termos da Portaria Inmetro 157/2022 (RTM), do VIML (Port. 150/2016) e do VIM 2012 (Port. 232/2012).

| Termo (português) | Símbolo | Definição resumida | Fonte |
|---|---|---|---|
| Instrumento de pesagem não automático (IPNA) | – | Exige intervenção do operador para pôr ou retirar a carga e obter o resultado | Port. 157, 1.3 |
| Carga máxima | **Max** | Capacidade máxima de pesagem, sem considerar a capacidade aditiva de tara | Port. 157, 1.6.1.1 |
| Carga mínima | **Min** | Valor abaixo do qual os resultados podem ter erro relativo excessivo | 1.6.1.2 |
| Faixa de pesagem | – | Intervalo de Min a Max | 1.6.1.4 |
| Valor de divisão real (resolução) | **d** | Diferença entre duas indicações consecutivas (digital) ou entre marcas (analógica) | 1.6.2.2 |
| Valor de divisão de verificação | **e** | Valor em unidades de massa usado para classificar e verificar o instrumento | 1.6.2.3; VIML 5.02 |
| Número de divisões de verificação | **n** = Max/e | Max e e na mesma unidade | 1.6.2.5; VIML 5.03 |
| Classe de exatidão | **I** especial, **II** fina, **III** média, **IIII** ordinária | Marcada em algarismos romanos dentro de oval | Port. 157, Tab. 1 e 7.1 |
| Classificação (Tabela 3) | – | I: e ≥ 0,001 g; n ≥ 50 000; Min = 100e. II: 0,001 g ≤ e ≤ 0,05 g com n de 100 a 100 000 e Min = 20e, ou e ≥ 0,1 g com n de 5 000 a 100 000 e Min = 50e. III: 0,1 g ≤ e ≤ 2 g com n de 100 a 10 000, ou e ≥ 5 g com n de 500 a 10 000; Min = 20e. IIII: e ≥ 5 g; n de 100 a 1 000; Min = 10e. | Port. 157, Tab. 3 |
| Instrumento de múltiplas faixas / de múltiplos valores de divisão | Max1, e1, Min1... | Cada faixa é tratada como instrumento de faixa única | 2.2.2.3 e 2.2.2.4; 1.6.2.6 |
| Efeito máximo de tara | **T** = +..., **T** = −... | Capacidade do dispositivo aditivo ou subtrativo de tara | 1.6.1.6 |
| Carga limite | **Lim** | Carga estática máxima sem alteração permanente | 1.6.1.7 |
| Erro máximo admissível | **EMA** | Valor extremo do erro admitido por especificação ou regulamento. **Não chamar de "tolerância"**. | VIML 0.05 (VIM 4.26, Nota 2); Port. 157, 2.5 |
| Aprovação de modelo / Portaria de aprovação de modelo | PAM | Decisão do Inmetro que aprova o modelo. A marca de aprovação vai no instrumento. | Port. 157, 8.1 e 8.4; VIML 3.01 e 3.07 |
| Marca de verificação / de selagem / de reparo; plano de selagem | – | Ver 4.1 e 4.3 | VIML 3.04 e 3.06; NIT-DICOL-002, 7 |
| Verificação inicial / subsequente / periódica / após reparo | – | Ver 4.1 | VIML 2.12 a 2.14 |
| Supervisão metrológica (inspeção em serviço) | – | EMA = 2 × EMA da verificação | Port. 157, 2.5.3 e 8.9 |
| Unidades autorizadas | kg, g, mg, µg, t (quilate métrico **ct** = 0,2 g, para pedras preciosas) | Escrever com o símbolo SI correto: "kg", e não "Kg" nem "KG" | Port. 157, 2.1 (o texto oficial grafa "micrograma (mg)", erro tipográfico para µg) |
| Calibração; ajuste | – | Ver 4.1. "Autocalibração" é termo impróprio para ajuste interno. | VIM 2.39 e 3.11 |
| Indicação | **I** | Valor indicado pela balança | VIM 4.1; EURAMET cg-18 |
| Carga de ensaio / valor de referência (massa convencional) | **L**, **m_ref**, **m_c** | Valor convencional do resultado de pesagem no ar (8 000 kg/m³; 1,2 kg/m³; 20 °C) | DOQ-CGCRE-097, 7.1 (OIML D 28) |
| Erro de indicação | **E = I − m_ref** | Diferença entre a indicação e o valor de referência da carga | EURAMET cg-18; DOQ-CGCRE-097, Tab. 2 |
| Repetibilidade | **s** | Desvio-padrão de indicações repetidas da mesma carga | EURAMET cg-18; DOQ-CGCRE-097, 10.7.2 |
| Excentricidade | **ΔI_ecc** | Diferença de indicação com a carga em posições fora do centro | DOQ-CGCRE-097, 10.4 |
| Carga de substituição | **L_sub** | Carga auxiliar ajustada por comparação, usada a partir de 1 000 kg | DOQ-CGCRE-097, 10.9 |
| Peso-padrão (classes OIML R 111: E1, E2, F1, F2, M1, M1-2, M2, M2-3, M3) | – | Medida materializada de massa regulamentada | DOQ-CGCRE-097, 7.2 |
| Incerteza expandida; fator de abrangência; probabilidade de abrangência; graus de liberdade efetivos | **U**; **k**; ≈ 95 %; **νeff** | Ver 1.5. Prefira "probabilidade de abrangência" a "nível de confiança". | NIT-DICLA-021; VIM 2.35 a 2.38 |
| Rastreabilidade metrológica | – | Ver 1.4 | VIM 2.41; NIT-DICLA-030, 7.10 |
| Regra de decisão; limite de tolerância; limite de aceitação; banda de guarda | –; LT; LA; **w** | Ver 2.4 | 17025, 3.7; ILAC-G8 |

---

## 6. Frases padrão prontas

As frases estão em português do Brasil e prontas para rodapé ou observações. Os campos entre colchetes são variáveis do sistema.

**P-1. Abrangência dos resultados** (17025, 7.8.2.1 l):
> "Os resultados apresentados neste certificado referem-se exclusivamente ao instrumento calibrado, descrito no item [n], não sendo extensivos a outros instrumentos, ainda que do mesmo fabricante e modelo."

**P-2. Condições no momento da calibração** (recomendada):
> "Os resultados referem-se às condições existentes no momento da calibração. A incerteza declarada não inclui efeitos de longo prazo (deriva), de transporte, de reinstalação ou de condições de uso diferentes das registradas neste certificado."

**P-3. Reprodução** (17025, 7.8.2.1, Nota):
> "Este certificado somente pode ser reproduzido na íntegra. A reprodução parcial depende de autorização prévia, por escrito, da [Razão social da Balanças.com]."

**P-4. Incerteza (k = 2)** (NIT-DICLA-021, A.6.1.1; ILAC-P14, 5.2):
> "A incerteza expandida de medição relatada (U) é declarada como a incerteza padrão de medição multiplicada pelo fator de abrangência k = 2, de tal forma que a probabilidade de abrangência corresponda a aproximadamente 95 % (95,45 % para uma distribuição normal). A incerteza foi avaliada de acordo com o Guia para a Expressão da Incerteza de Medição (GUM) e com o EURAMET Calibration Guide No. 18."

**P-4b. Incerteza (k por νeff)** (NIT-DICLA-021, A.6.2):
> "A incerteza expandida de medição relatada é declarada como a incerteza padrão de medição multiplicada pelo fator de abrangência k = [k], o qual, para uma distribuição t com νeff = [νeff] graus de liberdade efetivos, corresponde a uma probabilidade de abrangência de aproximadamente 95 %."

**P-5. Condições ambientais** (17025, 7.8.4.1 b):
> "Condições ambientais durante a calibração – Início: temperatura [xx,x] °C, umidade relativa [xx] %, pressão atmosférica [xxxx] hPa. Fim: temperatura [xx,x] °C, umidade relativa [xx] %, pressão atmosférica [xxxx] hPa. Instrumentos de monitoramento: [identificação], certificado(s) nº [ ]."

**P-6. Rastreabilidade** (17025, 7.8.4.1 c; NIT-DICLA-030):
> "Os resultados desta calibração são metrologicamente rastreáveis ao Sistema Internacional de Unidades (SI) por meio dos padrões relacionados na tabela 'Padrões utilizados', calibrados por laboratório(s) acreditado(s) pela Cgcre/Inmetro para as respectivas calibrações, conforme os certificados de calibração indicados."

**P-6b. Variante com pesos verificados** (17025, Anexo A, A.2.3):
> "Foram utilizados pesos-padrão da classe [M1] (OIML R 111), verificados pelo [IPEM-SP], certificado de verificação nº [ ], de [dd/mm/aaaa]. O erro máximo admissível da classe foi considerado como contribuição para a incerteza de medição."

**P-7. Não acreditação.** Não encontrei norma que obrigue a declarar. É **recomendada** por transparência e para evitar interpretação enganosa:
> "A [Razão social] não é acreditada pela Coordenação-Geral de Acreditação do Inmetro (Cgcre). Esta calibração não foi realizada sob acreditação e este certificado não está abrangido pelos acordos de reconhecimento mútuo dos quais a Cgcre é signatária."

**P-8a. Controle metrológico legal** (redação da NIE-CGCRE-009, 11.5.11):
> "Esta calibração não isenta o instrumento do controle metrológico estabelecido na regulamentação metrológica."

**P-8b. Não substitui a verificação do IPEM** (Port. Inmetro 157/2022, 8.7 a 8.9):
> "Este certificado de calibração não substitui a verificação inicial, periódica ou após reparo realizada pelo Inmetro ou por órgão da Rede Brasileira de Metrologia Legal e Qualidade – Inmetro (RBMLQ-I), como o IPEM-SP, obrigatória para instrumentos utilizados nas finalidades previstas no art. 1º, § 1º, da Portaria Inmetro nº 157/2022, e não atesta a conformidade do instrumento ao Regulamento Técnico Metrológico."

**P-9a. Ajuste** (17025, 7.8.4.1 d; DOQ-CGCRE-097, 10.2):
> "Antes da calibração foi realizado ajuste [interno / externo com peso de [x] kg], conforme [instruções do fabricante / prática do cliente]. Os resultados obtidos antes e depois do ajuste são apresentados, respectivamente, nas tabelas [A] ('como encontrado') e [B] ('como deixado'). O ajuste não faz parte da calibração."

**P-9b. Reparo ou manutenção por permissionária** (Port. 457/2021, 5.12 e 10.1; NIT-DICOL-002):
> "O instrumento foi submetido a [reparo / manutenção] registrado(a) na Ordem de Serviço nº [ ], com afixação da marca de reparo nº [ ] e das marcas de selagem nº [ ] (retiradas: [ ]). Os serviços de reparo e manutenção não fazem parte da calibração. O instrumento deve ser submetido à verificação após reparo pelo órgão metrológico (IPEM-SP) antes de ser utilizado nas finalidades sujeitas ao controle metrológico legal."

**P-10a. Intervalo de calibração (padrão)** (17025, 7.8.4.3):
> "Este certificado não contém recomendação de intervalo de calibração. A definição da periodicidade das calibrações é de responsabilidade do usuário, considerando a frequência e as condições de uso, o histórico e a estabilidade do instrumento e os requisitos aplicáveis."

**P-10b. Intervalo solicitado pelo cliente** (só com o acordo registrado):
> "Data da próxima calibração informada a pedido do cliente: [dd/mm/aaaa]."

**P-11. Dados fornecidos pelo cliente** (17025, 7.8.2.2):
> "As informações identificadas com (*) foram fornecidas pelo cliente e são de sua responsabilidade. Essas informações podem afetar a validade dos resultados."

**P-12. Opiniões e interpretações** (17025, 7.8.7; adaptado da NIE-CGCRE-009, 11.5.9):
> "Opiniões e interpretações – As considerações a seguir baseiam-se nos resultados desta calibração, não fazem parte dos resultados de medição e foram emitidas por pessoal autorizado: [texto]."

**P-13. Declaração de conformidade** (17025, 7.8.6; ILAC-G8). Só quando acordada:
> "Declaração de conformidade (solicitada pelo cliente): os erros de indicação dos pontos [lista] foram comparados com [especificação: ex. 'o critério de aceitação do cliente de ± x g' ou 'os erros máximos admissíveis da Tabela 5 da Portaria Inmetro nº 157/2022, coluna Verificação, classe III, e = x g']. Regra de decisão: [aceitação simples, w = 0 (ILAC-G8:09/2019, 4.2.1) / aceitação com banda de guarda w = U (ILAC-G8:09/2019, 4.2.2)]. Resultado: [CONFORME / NÃO CONFORME] para [pontos]. Esta declaração não constitui verificação metrológica legal."

**P-14a. Reemissão** (17025, 7.8.8.3):
> "Este certificado substitui integralmente o Certificado nº [ ], emitido em [dd/mm/aaaa], que fica cancelado. Motivo da reemissão: [ ]."

**P-14b. Emenda** (17025, 7.8.8.2):
> "Emenda nº [n] ao Certificado de Calibração nº [ ], emitido em [dd/mm/aaaa]. Alteração: [campo, valor anterior → valor corrigido]. Motivo: [ ]."

**P-15. Autorização de permissionária, se for citada** (recomendada, para não induzir a erro):
> "A autorização da [Razão social] como oficina permissionária (autorização nº [ ], [IPEM-SP]) refere-se exclusivamente aos serviços de reparo e manutenção de instrumentos de medição regulamentados (Portaria Inmetro nº 457/2021) e não abrange os serviços de calibração."

**P-16. Assinatura eletrônica e autenticidade:**
> "Documento assinado eletronicamente por [nome], [função], em [dd/mm/aaaa hh:mm]. A autenticidade pode ser verificada em [URL/QR code]. [Se ICP-Brasil: A assinatura digital pode ser validada no Verificador de Conformidade do ITI (validar.iti.gov.br).]"

**P-17. Fim:**
> "— Fim do Certificado de Calibração nº [ ] —"

**Etiqueta de calibração.** Recomendo apenas:
> "CALIBRADO – Balanças.com – Certificado nº [ ] – Data: [dd/mm/aaaa]"

- Sem "próxima calibração", salvo acordo com o cliente (17025, 7.8.4.3, que se aplica também à etiqueta).
- Sem símbolo do Inmetro.
- Sem cores ou formato que imitem a marca de verificação do Inmetro.
- Para acreditados, a Cgcre veda que a etiqueta seja entendida "como significando aprovação, qualidade ou permanência da calibração" (NIE-CGCRE-009, 11.6.7). Aplique o mesmo cuidado.

---

## 7. Assinatura, emissão, numeração, reemissão e guarda de registros

### 7.1 Quem pode assinar ou autorizar

- **ISO/IEC 17025:**
  - exige a "identificação da(s) pessoa(s) que autoriza(m) o relatório" (7.8.2.1 o);
  - exige que a autorização seja dada por pessoal autorizado para "analisar criticamente, relatar e autorizar resultados" (6.2.6);
  - a Cgcre esclarece que a norma **dispensa a assinatura propriamente dita**: basta identificar a pessoa (DOQ-CGCRE-087).
  - **Recomendação:** um "signatário autorizado" designado formalmente (por exemplo, o técnico responsável), com competência registrada (6.2.5), e uma pessoa diferente do executante sempre que possível, como revisão independente.
- **Conselho profissional (CREA ou CRT/CFT): não consegui confirmar obrigação legal específica para certificados de calibração.**
  - O que encontrei:
    - o sistema Confea/CREA tende a entender a calibração como atividade técnica sujeita a ART (Res. Confea 218/1973, atividade 10, "padronização, mensuração e controle de qualidade"; Res. 1.025 sobre ART), mas o tema é controvertido (blog técnico citado nas fontes);
    - a jurisprudência (STJ/TRFs) vincula a obrigatoriedade de registro da **empresa** à sua **atividade básica** (Lei 6.839/1980, art. 1º). Acórdãos do TRF3 entendem que manutenção e reparo sem projeto não são atividade privativa de engenharia;
    - o CFT tem resoluções que atribuem calibração a técnicos industriais (Res. CFT 119/2020, Automação, art. 3º, XV; Res. CFT 260/2024, Instrumentação). Não localizei resolução específica do "Técnico em Metrologia".
  - **Recomendação:** consultar o CREA-SP e o CRT-SP. Se o signatário tiver registro (CREA ou CRT), informar o número junto ao nome. Emitir ART ou TRT quando o cliente exigir.
  - A Portaria Inmetro 457/2021 exige técnico responsável **registrado no órgão da RBMLQ-I** (IPEM-SP), não no CREA. Esse registro vale para reparo e manutenção, não para calibração.

### 7.2 Validade da assinatura digital em PDF

- **Lei 14.063/2020:** classifica as assinaturas eletrônicas em:
  - **simples:** identifica o signatário ou associa dados;
  - **avançada:** certificado não ICP-Brasil ou outro meio aceito pelas partes, associada de modo unívoco ao signatário, sob seu controle exclusivo e com detecção de qualquer alteração posterior;
  - **qualificada:** certificado ICP-Brasil, com o "nível mais elevado de confiabilidade" (art. 4º e § 1º).
  - **Importante:** o capítulo que regula níveis mínimos **não se aplica** à interação "entre pessoas naturais ou entre pessoas jurídicas de direito privado" (art. 2º, parágrafo único, II, a). Entre a Balanças.com e seus clientes vale a regra geral da MP 2.200-2/2001.
- **MP 2.200-2/2001, art. 10:**
  - os documentos eletrônicos são documentos públicos ou particulares para todos os fins legais;
  - **§ 1º:** declarações em documentos com certificação ICP-Brasil "presumem-se verdadeiros em relação aos signatários";
  - **§ 2º:** não obsta outro meio de comprovação de autoria e integridade, inclusive certificados não ICP-Brasil, "desde que admitido pelas partes como válido ou aceito pela pessoa a quem for oposto o documento".
- **gov.br:** é uma assinatura **avançada**. O ITI afirma sua validade jurídica nos termos da Lei 14.063 e do Decreto 10.543/2020, que, porém, regulam a relação com entes públicos. Entre particulares, vale se aceita (MP, § 2º). Exige conta prata ou ouro e se destina a pessoa física. Não confirmei se os termos de uso do gov.br restringem o uso empresarial em larga escala.
- **Imagem de assinatura colada no PDF:** é, no máximo, assinatura eletrônica simples. Tem baixo valor probatório e pode ser copiada.
- **Recomendação para o sistema:**
  1. Assinar o PDF com **certificado ICP-Brasil (e-CNPJ da empresa ou e-CPF do signatário)**, no padrão PAdES, para ter a presunção do § 1º.
  2. Ou usar assinatura avançada (plataforma com trilha de auditoria) e prever no contrato ou na proposta que o cliente a aceita (MP, § 2º).
  3. Incluir **código de verificação (QR/URL)** que mostre o certificado original e a versão vigente.
  4. Gerar o PDF em **PDF/A** para preservação. Isso é recomendação técnica, não exigência normativa encontrada.

### 7.3 Numeração, paginação e datas

- **Número único** (7.8.2.1 d): por exemplo, "BC-2026-000123". Sequencial, sem lacunas não justificadas, nunca reutilizado, nem em caso de cancelamento.
- **"Página X de Y"** e o número do certificado em todas as páginas, mais o marcador de fim (P-17). Se houver anexos, eles devem se identificar como parte do mesmo certificado.
- **Data da calibração ≠ data de emissão.** Ambas são obrigatórias (7.8.2.1 i e j). A data de emissão não pode ser anterior à da calibração. Em reemissão, a data de calibração se mantém e a data de emissão é a nova.
- **Reemissão** (7.8.8.3): novo identificador único, como "BC-2026-000123-R1" ou um novo número, com **referência ao original** e motivo (P-14a). O original fica marcado como "substituído" e não pode ser apagado.
- **Emenda** (7.8.8.2): documento separado "Emenda nº n ao Certificado nº ..." (P-14b). Nunca sobrescrever o PDF já emitido com o mesmo número.

### 7.4 Por quanto tempo guardar os registros

- **ISO/IEC 17025, 8.4.2:** "por um período consistente com suas obrigações contratuais". Não há prazo fixo. A Cgcre sugere considerar: tipo de registro, requisitos do cliente e do setor, exigências legais, prazo para reclamações, intervalo entre auditorias e possibilidade de repetir a atividade (DOQ-CGCRE-087).
- **Registros técnicos (7.5):** dados brutos, cálculos, pessoal, conferências e versões alteradas, com data e responsável.
- **Portaria Inmetro 457/2021:** ordens de serviço por **pelo menos 2 anos** (2.3.6; DICOL-002, 10.1.8).
- **Referências legais gerais** (não consultadas nesta pesquisa, de conhecimento geral; confirmar com assessoria jurídica):
  - CDC, art. 27: 5 anos para pretensão por dano causado por fato do produto ou serviço;
  - Código Civil, art. 206, § 3º, V: 3 anos para reparação civil;
  - Código Civil, art. 205: 10 anos, prazo geral.
- **Recomendação:** guardar certificados, dados brutos, certificados dos padrões vigentes na data e trilha de auditoria por **no mínimo 5 anos, preferencialmente 10**, e OS por no mínimo 2 anos, conforme a portaria. Isso é recomendação, não exigência normativa encontrada.

---

## 8. Armadilhas: o que NÃO escrever

| Não escrever | Por quê | Escrever no lugar |
|---|---|---|
| "Certificado de aferição", "aferido", "aferição" | Termo abandonado no VIM 2012 e no VIML. O IPEM-SP recomenda evitá-lo. É ambíguo entre calibração e verificação. | "Certificado de Calibração", "calibrado" |
| "Validade do certificado: 12 meses", "Válido até..." | A calibração não tem validade. A 17025, 7.8.4.3, proíbe recomendar intervalo no certificado e na etiqueta sem acordo com o cliente. O intervalo é decisão do usuário (ILAC-G24/OIML D 10:2022). Também confunde com a validade de 1 ano da **verificação legal** (Port. 157, 8.8.7.1). | Frase P-10a, ou P-10b se acordado |
| "Aprovado pelo Inmetro", "Certificado Inmetro", "homologado pelo Inmetro", "padrão Inmetro", "conforme Inmetro" | Só o Inmetro e a RBMLQ-I verificam e aprovam (Lei 9.933/1999, art. 3º; Port. 157, 8). É enganoso. O uso de símbolos do Inmetro pode configurar CP, art. 296, § 1º, III. | "Calibração rastreável ao SI..." (P-6) e a ressalva P-8 |
| "Laboratório acreditado", "credenciado", "RBC", "membro da RBC", "padrões RBC" (como qualificativo do laboratório), "rastreável à RBC" | Referência à acreditação é exclusiva de acreditados (NIE-CGCRE-009, 11.1.9 a 11.1.14). "Rastreabilidade à RBC" é citada pela Cgcre como menção que induz à condição de acreditado (11.8.8). A RBC é uma rede, não uma referência metrológica. | "Padrões calibrados por laboratório acreditado pela Cgcre (CAL nnnn), certificado nº..." |
| Símbolo da Cgcre, marca ILAC-MRA ou Global ACI, "reconhecido internacionalmente pelo ILAC" | Exclusivo de acreditados (NIE-CGCRE-009, 11.3 e 11.5.8; ILAC-P10, Nota 3) | Nada |
| "Calibrado conforme a ISO/IEC 17025", "certificado ISO 17025" | A 17025 não é "certificável". Para laboratório não acreditado, a afirmação sugere uma avaliação de terceira parte que não existe. **Opinião técnica**: não há vedação expressa encontrada para não acreditados, mas há risco de induzir a erro. | "Calibração realizada conforme o procedimento [PT-CAL-01], baseado no EURAMET cg-18" |
| "Balança aprovada/reprovada", "dentro da tolerância", sem especificação e sem regra de decisão | A 17025 (7.1.3 e 7.8.6) exige especificação e regra de decisão acordadas e declaradas. "Aprovado" sugere verificação legal. | Frase P-13, ou só os resultados |
| "Liberada para uso comercial", "dispensa verificação do IPEM", "atende a Portaria 157" | Só a verificação legal atesta isso (Port. 157, 8.7 a 8.9; VIML 3.02) | Frases P-8a e P-8b |
| "Tolerância" no sentido de EMA | O VIM 4.26, Nota 2 (VIML 0.05), diz que "tolerância" não deve designar EMA | "Erro máximo admissível (EMA)" ou "critério de aceitação do cliente" |
| "Autocalibração" para o ajuste interno da balança | Termo impróprio (VIM 2.39, Nota 2; DOQ-CGCRE-036, 11.1) | "Ajuste interno" ou "ajuste automático" |
| Certificado só com "conforme", sem valores e sem U | A 17025, 7.8.4.1 a), exige a incerteza. A Cgcre não aceita omitir resultados e U (NIT-DICLA-030, 8.2.6; NIE-CGCRE-009, 11.5.12). | Sempre a tabela completa |
| "± U" dentro da tabela; U com 3 ou mais algarismos significativos; erro com mais casas que U | NIT-DICLA-021, A.6.1, Nota 1, e A.6.3; DOQ-CGCRE-097, 9.2 | U com até 2 algarismos significativos, resultado arredondado na casa de U |
| "Nível de confiança de 95 %" | Não é errado no uso comum, mas o VIM e a NIT-DICLA-021 usam "probabilidade de abrangência" | "Probabilidade de abrangência de aproximadamente 95 %" |
| Omitir que houve ajuste ou reparo, ou só mostrar o "depois" | A 17025, 7.8.4.1 d), exige antes e depois, se disponíveis | Tabelas "como encontrado" e "como deixado" (P-9a) |
| Usar a autorização de permissionária ou o nº de autorização no cabeçalho como "selo de qualidade" | A Port. 457/2021 restringe menções ao Inmetro (2.1.4.1 e 5.5). Pode induzir o cliente a crer que a calibração é endossada. | Se citar, usar a P-15 |
| Sobrescrever o PDF emitido ou corrigir "em silêncio" | A 17025, 7.8.8, exige emenda identificada ou reemissão com referência ao original | P-14a ou P-14b |
| Etiqueta "Próxima calibração: ..." por padrão, ou etiqueta parecida com a marca do Inmetro | A 17025, 7.8.4.3, vale também para a etiqueta. Há risco de confusão com a marca de verificação (NIE-CGCRE-009, 11.6.7, por analogia). | Etiqueta da seção 6 |
| "Kg", "KG", "grs", "Gr" | Grafia incorreta dos símbolos SI (Port. 157, 2.1) | "kg", "g", "mg", "t" |
| Usar **e** em vez de **d** como resolução na incerteza | A contribuição de arredondamento é a da resolução real **d** (DOQ-CGCRE-097, 10.7.3; EURAMET cg-18) | Usar **d**. Em balança multifaixa, o d da faixa. |

---

## 9. Recomendações para o sistema

São decorrências práticas dos requisitos acima.

1. **Validação do próprio software.** O sistema é um "sistema de gestão da informação laboratorial" no sentido da 17025, 7.11. Por isso ele deve:
   - ser **validado antes do uso**, com registro da validação, e revalidado a cada mudança (7.11.2);
   - ter controle de acesso, proteção contra adulteração e perda, registro de falhas e de correções (7.11.3);
   - ter cálculos e transferências de dados conferidos (7.11.6). Guarde testes automatizados com casos de referência, por exemplo exemplos do EURAMET cg-18, como evidência.
2. **Fluxo de liberação:** rascunho → executado (técnico) → revisado/autorizado (signatário) → emitido e assinado → (substituído / emendado). Atende os itens 7.8.1.1 e 6.2.6.
3. **Trilha de auditoria** em dados brutos e certificados, com valor anterior, novo valor, data, usuário e motivo (7.5.2 e 7.8.8.1).
4. **Bloqueios de conteúdo:**
   - sem campo "validade";
   - "próxima calibração" só com flag de acordo com o cliente;
   - lista de termos proibidos (seção 8), validada no texto livre;
   - nenhum asset com logos de Inmetro, Cgcre, RBC ou ILAC.
5. **Cadastro de padrões** com: certificado, laboratório e nº CAL, data, valores e U ou classe, intervalo interno e situação. A emissão deve ser **impedida** se um padrão usado estiver fora do intervalo interno ou sem certificado.
6. **Cadastro do instrumento** com os campos do RTM: Max, Min, e, d, n, classe, PAM, nº de série, TAG, multifaixa. Validar a coerência, por exemplo n = Max/e e as faixas da Tabela 3, como **alerta e não como bloqueio**: o certificado transcreve o que está marcado.
7. **Pedido ou contrato** (17025, 7.1) registrando:
   - faixa e pontos;
   - se haverá ajuste;
   - se o cliente quer declaração de conformidade, com especificação e regra de decisão;
   - se o cliente quer data de próxima calibração;
   - se aceita calibração não acreditada;
   - se aceita a modalidade de assinatura eletrônica.
8. **Integração com a OS de permissionária:** se a calibração envolver rompimento de selo, o sistema deve exigir o vínculo com a OS (nº, marca de reparo e selos) e inserir a frase P-9b.
9. **Cálculo da incerteza** com no mínimo os componentes do DOQ-CGCRE-097, 10.7.1, e arredondamento automático segundo a NIT-DICLA-021, A.6.3.
10. **LGPD:** o certificado tem nomes e contatos. Minimize os dados pessoais (por exemplo, o contato do cliente pode ser institucional). Isso é recomendação, não exigência pesquisada a fundo.

---

## 10. Pontos não confirmados e limitações

- **Situação atual dos atos do Inmetro.** O portal de legislação do Inmetro (inmetro.gov.br/legislacao) e o Planalto estavam instáveis (HTTP 503) durante a pesquisa. A vigência da Portaria 157/2022, da Portaria 457/2021 e da Portaria 274/2014 foi inferida de cópias e de citações recentes. **Confirme no portal oficial ou no DOU.**
- **Tabela 5 da Portaria 157/2022.** Transcrevi a cópia do SIBAPEM. A terceira linha (± 2,0 e na verificação) deve ser conferida na publicação oficial antes de entrar em cálculo automático.
- **Revisões vigentes dos documentos da Cgcre.** As revisões citadas (NIT-DICLA-030 rev. 15, NIE-CGCRE-009 rev. 27, NIT-DICLA-021 rev. 10, DOQ-CGCRE-097 rev. 00, DOQ-CGCRE-087 rev. 00) vieram do espelho oficial do CDTN em gov.br, atualizado em 2025. Pode haver revisões mais novas no site do Inmetro.
- **Obrigatoriedade de declarar a não acreditação:** não encontrei norma que a imponha. A frase P-7 é recomendação.
- **CREA ou CRT para o signatário:** sem resposta definitiva. Consultar os conselhos.
- **ISO 9001:2026:** publicada em 16/09/2026 segundo a DQS. O texto do 7.1.5 e o prazo de transição não foram verificados na fonte primária.
- **IATF 16949, 7.1.5.3.2:** a redação atual depende das interpretações sancionadas da IATF, que não consultei.
- **Global ACI e ILAC:** a fusão a partir de 01/01/2026 está confirmada por ILAC e IAF. Não verifiquei se os documentos ILAC (G8, P10, P14, G24) foram renumerados ou substituídos.
- **Regime atual de autoverificação** (sucessora da Portaria 400/2013, a Portaria 78/2022): não verifiquei se abrange IPNA.
- **Prazos de guarda (CDC e CC):** citados de conhecimento geral, sem consulta ao texto nesta pesquisa.
- **ABNT NBR ISO/IEC 17025:2017:** consultei uma cópia de treinamento publicada por consultoria. A redação oficial deve ser conferida no exemplar da ABNT.

---

## 11. Fontes

### Inmetro, metrologia legal, IPEM
- Portaria Inmetro nº 157/2022 – RTM de instrumentos de pesagem não automáticos (cópia SIBAPEM): https://sibapem.com.br/wp-content/uploads/2023/01/Portaria-157-2022.pdf
- Portaria Inmetro nº 157/2022 – cópia do DOU (Gehaka): https://www.gehaka.com.br/downloads/portaria_no_157_de_31_de_marco_de_2022.pdf
- Inmetro – legislação, Portaria 157/2022 (indisponível no acesso): http://www.inmetro.gov.br/legislacao/detalhe.asp?seq_classe=1&seq_ato=2968
- Toledo do Brasil – comentário sobre a revogação da 236/94 pela 157/2022: https://www.toledobrasil.com/blog/portaria-inmetro-236-94-e-revogada-pela-portaria-157-2022-que-apresenta-novos-valores-de-erros-e-limites-para-substituicao-de-carga-3/
- Portaria Inmetro nº 457/2021 – RTM de reparo e manutenção (IPEM-SP): https://www.ipem.sp.gov.br/images/00DMLF/oficinas/Port457_21inmetro.pdf
- Portaria Inmetro nº 50/2022 (altera o 2.3.9 da 457/2021): https://www.legisweb.com.br/legislacao/?id=427310
- NIT-DICOL-002 rev. 03 (fev/2022) – Reparo e manutenção em metrologia legal (IPEM-SP): https://www.ipem.sp.gov.br/images/00DMLF/oficinas/NITDicol002.pdf
- IPEM-SP – Manual da Permissionária (2018): https://www.ipem.sp.gov.br/images/publicacoes/permissionaria/manual_permiss.pdf
- VIML – Portaria Inmetro nº 150/2016: https://www.gov.br/inmetro/pt-br/acesso-a-informacao/perguntas-frequentes/metrologia-legal/vocabulario-internacional-de-termos-de-metrologia-legal-viml/vocabulario_dimel-1.pdf
- Inmetro – Modalidades de controle legal: Verificação: https://www.gov.br/inmetro/pt-br/assuntos/metrologia-legal/controle-legal-de-instrumentos-de-medicao/modalidades/verificacao
- IPEM-SP (Almanaque) – Calibração versus verificação, parte 2: https://ipemsp.wordpress.com/2019/11/04/calibracao-versus-verificacao-parte-2/ e parte 1: https://ipemsp.wordpress.com/2019/10/28/calibracao-x-verificacao-metrologica/
- IPEM-PR – Esclarecimentos à Vigilância Sanitária sobre calibração e verificação (2014): https://www.saude.pr.gov.br/sites/default/arquivos_restritos/files/documento/2020-05/orientacoessobrecalibracaodeequipamentos.pdf
- Portaria Inmetro nº 78/2022 (revoga a 400/2013) – SIBAPEM: https://sibapem.com.br/wp-content/uploads/2023/01/Portaria-78-2022.pdf ; Portaria 400/2013 (NormasBrasil): https://www.normasbrasil.com.br/norma/portaria-400-2013_257536.html
- Portaria Inmetro nº 274/2014 – Regulamento de uso das marcas do Inmetro (LegisWeb): https://www.legisweb.com.br/legislacao/?id=271516

### Cgcre (acreditação) – espelho oficial no gov.br/CDTN
- Índice de documentos da Cgcre: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025
- NIT-DICLA-030 rev. 15 (nov/2024) – Rastreabilidade metrológica: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/nit-dicla-30
- NIE-CGCRE-009 rev. 27 (jul/2024) – Uso da marca, do símbolo e de referências à acreditação: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/nie-cgcre-9
- NIT-DICLA-021 rev. 10 (jul/2020) – Expressão da incerteza por laboratórios de calibração: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/nit-dicla-21
- DOQ-CGCRE-087 rev. 00 (mar/2018) – Orientações gerais sobre a 17025:2017: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/doq-cgcre-087/view
- DOQ-CGCRE-097 rev. 00 (dez/2022) – Calibração de balanças, pesos-padrão e peças diversas: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/doq-cgcre-97/view
- DOQ-CGCRE-036 rev. 03 (jul/2020) – Checagem intermediária de balanças: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/doq-cgcre-36/view
- NIT-DICLA-031 rev. 26 (out/2022) – Regulamento da acreditação: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/nit-dicla-31/view
- NIT-DICLA-062 rev. 05 (jun/2020) – 17025 no âmbito da metrologia legal: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/nit-dicla-62

### Normas e guias técnicos
- ABNT NBR ISO/IEC 17025:2017 (cópia de treinamento usada para conferência; a versão oficial deve ser adquirida na ABNT): https://www.exactusmetrologia.com.br/sites/default/files/3-nbr_iso_iec_17025-2017_versao_exclusiva_treinamento.pdf
- ILAC-G8:09/2019 – Decision Rules and Statements of Conformity: https://ilac.org/?ddownload=122722
- ILAC-P14:09/2020 – Measurement Uncertainty in Calibration: https://ilac.org/?ddownload=123348
- ILAC-P10:07/2020 – Metrological Traceability of Measurement Results: https://ilac.org/?ddownload=123220
- ILAC-G24 / OIML D 10:2022 – Recalibration intervals: https://www.oiml.org/en/files/pdf_d/d010-e22.pdf
- EURAMET Calibration Guide No. 18, v4.0 (cópia NIST): https://www.nist.gov/document/i-cal-gui-018calibrationguideno18webpdf ; anúncio EURAMET: https://www.euramet.org/publications-media-centre/news/news/update-available-euramet-calibration-guide-no-18
- OIML TC9/SC1 – revisão da R 76 em andamento: https://www.oiml.org/projectlist_view?idsc=20
- Global ACI (fusão ILAC/IAF, 2026): https://ilac.org/latest_ilac_news/a-short-history-of-the-global-accreditation-cooperation-incorporated/ e https://iaf.nu/en/news/global-accreditation-cooperation-incorporated-launch-unifies-international-accreditation-organisations-and-strengthens-worldwide-trust/
- ISO 9001:2026 – publicação em 16/09/2026 (DQS): https://www.dqsglobal.com/en/explore/blog/iso-9001-2026-changes-timeline-transition
- IATF 16949, 7.1.5.3.2 – comentário da ANAB: https://blog.ansi.org/anab/use-of-accreditation-symbols-iatf-16949/

### Legislação (assinatura, marcas, profissional)
- Lei nº 14.063/2020 (texto atualizado, Câmara): https://www2.camara.leg.br/legin/fed/lei/2020/lei-14063-23-setembro-2020-790659-normaatualizada-pl.pdf ; Planalto: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm
- MP nº 2.200-2/2001: https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm ; cópia gov.br: https://www.gov.br/servidor/pt-br/acesso-a-informacao/gestao-de-pessoas/assentamento-funcional-digital/copy_of_MP22002.pdf
- ITI – Assinatura eletrônica avançada (gov.br): https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada
- Decreto nº 10.543/2020 (cópia FURG): https://governancadigital.furg.br/images/decretos/D10543-2020-assinaturaeletronica.pdf
- Lei nº 9.933/1999 (Câmara): https://www2.camara.leg.br/legin/fed/lei/1999/lei-9933-20-dezembro-1999-370065-publicacaooriginal-1-pl.html
- Código Penal, art. 296 (Planalto): https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm ; caso do logotipo da Receita Federal (Conjur): https://www.conjur.com.br/2017-set-03/usar-logotipo-receita-fachada-escritorio-contabil-crime/
- Código Civil (Planalto): https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm ; CDC (Planalto): https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm (não consultados nesta pesquisa)
- ART em calibração (discussão): https://brunoroma.eng.br/servicos-de-calibracao-precisam-de-art-do-crea/ ; CREA-SP, emissão de ART: https://www.creasp.org.br/servico/emissao-de-art/
- Resolução CFT nº 260/2024 (Técnico em Instrumentação): https://www.crtsp.gov.br/wp-content/uploads/2024/04/ABRIL_2024_TECNICOS-EM-INSTRUMENTACAO_Resolucao-CFT-no-260-2024.pdf ; Resolução CFT nº 119/2020 (Automação): https://www.normasbrasil.com.br/norma/resolucao-119-2020_406469.html
- RDC Anvisa 67/2007 (cópia): https://fitoterapiabrasil.com.br/sites/default/files/legislacao/rdc_67-2007.pdf
