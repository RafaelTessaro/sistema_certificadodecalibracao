# 02 — Procedimento técnico de calibração e modelo de incerteza de IPNA

**Escopo:** calibração de instrumentos de pesagem não automáticos (IPNA): balanças de bancada, de plataforma, rodoviárias, analíticas e de gancho.
**Base principal:** EURAMET Calibration Guide No. 18 (cg-18), versão 4.0 (11/2015).
**Complementos:** OIML R76-1:2006, Portaria Inmetro nº 157/2022, OIML R111-1:2004, JCGM 100:2008 (GUM), ILAC-G8:09/2019, EA-4/02 e NIT-DICLA-021.
**Data da pesquisa:** 14/10/2026.

> **Convenções deste documento**
> - Fórmulas em texto/Unicode. Os números entre parênteses, como `(7.1.1-10)`, são as equações da cg-18 v4.0.
> - Na prosa e nas tabelas usa-se vírgula decimal. Nos blocos JSON de vetores de teste usa-se ponto decimal.
> - **[NÃO CONFIRMADO]** marca algo que não consegui verificar na fonte primária. **[ATENÇÃO]** marca uma divergência encontrada entre fontes.
> - O texto da cg-18 é protegido por copyright da EURAMET: "não pode ser reproduzido senão na íntegra; extratos só com permissão". Aqui reproduzo apenas as fórmulas (métodos) e os números dos exemplos necessários à validação, sempre com atribuição. O laboratório deve manter o PDF oficial da cg-18 no seu sistema da qualidade.

---

## 0. Resumo executivo (decisões para o sistema)

1. **Modelo:** `E = I − m_ref`, com `u²(E) = u²(I) + u²(m_ref)`, onde:
   - `u²(I) = d0²/12 + dL²/12 + s² + (u_rel,ecc·I)²` (+ histerese / fluência, opcionais);
   - `u²(m_ref) = u²(δm_c) + u²(δm_B) + u²(δm_D) + u²(δm_conv)`;
   - nas cargas de substituição soma-se `u²(L_T)`.
2. **Graus de liberdade:** normalmente só a repetibilidade é do tipo A, com `ν = n − 1`. Todas as componentes retangulares têm `ν = ∞`.
   - Fórmula: `ν_eff = u⁴(E) / (s⁴/(n−1))`, truncado para o inteiro inferior.
   - Fator de abrangência: `k = t_{95,45 %}(ν_eff)`.
   - Por que importa: com 5 ou 6 leituras de repetibilidade, k fica entre 2,0 e 2,7. Usar k = 2 fixo só é aceitável quando a repetibilidade tem pelo menos 10 leituras (cg-18 B2) ou quando ν_eff é grande.
3. **Ensaios que o sistema deve suportar:**
   - Obrigatórios: repetibilidade, excentricidade e erro de indicação (≥ 5 pontos, carga crescente e opcionalmente decrescente).
   - Opcionais: mobilidade/discriminação, histerese / retorno a zero, cargas de substituição e "incerteza em uso" (anexo separado).
4. **EMA:** implementar como função `EMA(m, e, classe, contexto)`. Os contextos são "OIML inicial / aprovação de modelo", "BR verificação", "BR em serviço" e "tolerância do cliente".
   - **[ATENÇÃO]** A Portaria Inmetro 157/2022 traz valores de "verificação" que diferem da OIML R76 (ver §5.3). Por isso a tabela deve ser parametrizável.
5. **Arredondamento:**
   - U com 2 algarismos significativos (NIT-DICLA-021 §6.3).
   - E arredondado na mesma casa decimal de U.
   - Usar aritmética decimal (por exemplo, `decimal.js`), não `number` binário, no passo de apresentação.
6. **Vetores de teste:** o exemplo de 30 kg do §9 (calculado neste trabalho) e os exemplos H2 e H3 da própria cg-18 (§10). Implementei o modelo em Python e reproduzi H2 e H3 com diferença inferior a 0,5 % (§10).

---

## 1. Fontes e situação de vigência

| Documento | Versão consultada | Situação |
|---|---|---|
| EURAMET cg-18 | v4.0 (11/2015), PDF completo | Até onde verifiquei, é a versão vigente: o projeto de revisão da EURAMET terminou em 2015 com a v4.0 e não encontrei uma v5.0. |
| OIML R76-1 | 2006 (E) | Vigente. A revisão está em andamento: o NMI da Austrália consultou o 1º CD em ago–set/2023 e depois o 1.1 CD (data não confirmada). Não encontrei edição nova publicada. |
| Portaria Inmetro nº 157, de 31/03/2022 | Cópia em PDF com timbre Inmetro/Dimel (hospedada pela SIBAPEM) | Revogou a Portaria 236/1994. A Agenda Regulatória Dimel 2026-2027 (Portaria 246/2026) não lista revisão deste RTM. |
| OIML R111-1 | 2004 (E) | Vigente. |
| JCGM 100:2008 (GUM) | 2008 | Vigente. |
| EA-4/02 M | 2022 (tradução tcheca) e 1999 (inglês) | A versão 2022 remete o arredondamento à ILAC P14:09/2020. |
| NIT-DICLA-021 | §6.3, citado na ata CT-11 Inmetro (abr/2012) | **[NÃO CONFIRMADO]** a redação da revisão vigente. |
| ILAC-G8:09/2019 | Consultado via UKAS LAB 48 ed. 5, que resume e aplica o G8 | Não li o texto ILAC diretamente. |
| Guia SIM "Guidelines on the calibration of NAWI" (SIM MWG7/cg-01) | Não obtido | Segundo Fritsch (IMEKO 2017), o SIM adotou a cg-18. |
| Documento Cgcre/Inmetro específico (DOQ) sobre calibração de IPNA | **Não encontrado** | Os laboratórios RBC usam, na prática, a cg-18 (ou o guia SIM equivalente) junto com a NIT-DICLA-021. |
| Guia INM Colômbia para IPNA de alta capacidade (2025) | PDF completo | Útil para rodoviárias e substituição; é derivado da cg-18. |

Observação sobre a numeração da cg-18 v4.0:
- O modelo de incerteza da calibração está na **seção 7.1–7.3**.
- A "incerteza de um resultado de pesagem" (incerteza em uso) está nas **seções 7.4–7.5 e nos Apêndices C e G**.
- A **seção 8** trata do conteúdo do certificado, e não da incerteza em uso.

---

## 2. Ensaios de calibração

### 2.1 Pré-condições (cg-18 §4.1.3) — registrar como checklist no sistema

1. O instrumento é identificável.
2. As funções estão livres de contaminação e danos.
3. A indicação é legível e não ambígua.
4. As condições normais de uso (correntes de ar, vibração, estabilidade do local) são adequadas.
5. O aquecimento foi feito (tempo do fabricante ou do usuário).
6. O instrumento está nivelado, se aplicável.
7. Houve pré-carga até aproximadamente a maior carga de ensaio pelo menos uma vez (recomenda-se repetir).
8. Ajuste:
   - se o cliente costuma ajustar antes do uso, ajustar antes da calibração (com os meios do cliente), salvo acordo em contrário;
   - registrar se houve ajuste e se foi interno ou externo (com qual peso). Isso muda a fórmula de empuxo (§3.3.3).
9. Zero automático / rastreamento de zero: calibrar no estado definido pelo cliente e registrar esse estado.
   - Exceção: nos métodos 2 e 4 de excentricidade o dispositivo deve estar **desligado**.
10. A calibração é feita no local de uso. Se o instrumento for deslocado depois, a calibração pode ser invalidada (§4.1.2).

### 2.2 Repetibilidade (cg-18 §5.1, §6.1)

- **Objetivo:** estimar a dispersão `s` de leituras sucessivas da mesma carga. É a única componente tipo A e determina ν_eff e k.
- **Carga:**
  - não precisa ser calibrada, de preferência um corpo único;
  - é comum usar `0,5·Max ≤ L_T ≤ Max`;
  - pode ser reduzida quando Max chega a vários milhares de kg;
  - multi-intervalo: carga logo abaixo de Max1;
  - múltiplas faixas: perto do Max da faixa de menor d;
  - pode haver mais de um ponto de ensaio (`L_Tj`).
- **Número de leituras:** **≥ 5** (ou **≥ 3** se `L_T ≥ 100 kg`).
  - Para que k = 2 seja justificável sem Welch-Satterthwaite, a cg-18 (B2) pede **≥ 10**.
  - Referência legal: a OIML R76 A.4.10 usa, na verificação, 3 pesagens a cerca de 0,8·Max para as classes III e IIII (6 para I e II) e, na aprovação de modelo, 10 pesagens a 50 % e a 100 % de Max quando Max < 1000 kg.
- **Sequência:**
  1. zerar;
  2. colocar a carga e ler `I_Li`;
  3. retirar a carga, verificar o zero e rezerar se necessário (é aconselhável registrar `I_0i`);
  4. repetir.
  - Registrar também o estado do zero automático / rastreamento.
- **Cálculo:**
  ```
  Ī = (1/n)·Σ I_i            s = √[ Σ (I_i − Ī)² / (n − 1) ]            ν = n − 1      (6.1-1, 6.1-2)
  ```
- **Uso no orçamento:**
  - `u(δI_rep) = s` para leitura única (7.1.1-5);
  - `u = s/√N` se a indicação de um ponto for média de N leituras (7.1.1-6);
  - com vários pontos de repetibilidade, usar o **maior s dos dois pontos que envolvem** a carga;
  - com um único ensaio, s é representativo para toda a faixa.
- **s = 0** (comum quando d é grosseiro): a cg-18 não impõe piso. Algumas políticas usam `s_min = 0,41·d` (USP <41>, para balanças farmacêuticas; confirmado só em fontes secundárias). Sugiro deixar o piso como opção configurável do laboratório.
- **Registrar:** carga (descrição e valor aproximado), as n leituras, os zeros entre leituras, as ações de rezero, a hora e a temperatura.

### 2.3 Excentricidade (cg-18 §5.3, §6.3; OIML R76 3.6.2 / A.4.7; Portaria 157 §2.6.2)

- **Objetivo:** quantificar o efeito da posição do centro de gravidade da carga. Entra na incerteza da indicação.
- **Carga `L_ecc`:**
  - cerca de **Max/3** ou mais (`Min′ + (Max′ − Min′)/3` para faixa reduzida);
  - de preferência um corpo único;
  - não precisa ser calibrada.
  - A OIML R76 / Portaria 157 definem a carga como **1/3·(Max + efeito máximo aditivo de tara)**.
- **Posições por tipo de receptor:**

  | Receptor | Posições | Carga | Fonte |
  |---|---|---|---|
  | Retangular / quadrado, ≤ 4 apoios (bancada, plataforma, analítica) | 1 centro, 2 frente-esquerda, 3 trás-esquerda, 4 trás-direita, 5 frente-direita, no centro de cada quarto da superfície | ≈ Max/3 | cg-18 Fig. 5.3-1; R76 A.4.7.1 |
  | Circular (prato redondo) | 1 centro e 4 posições a 90° (centro de cada quadrante); "posições equivalentes" | ≈ Max/3 | cg-18 §5.3 ("dependendo do formato do prato, o número de posições pode variar"); R76 A.4.7.1 (quatro segmentos de ≈ ¼ da superfície, "Figura 9 ou croquis similares"; não vi a figura, que é imagem no PDF) |
  | Plataforma com n > 4 apoios (rodoviária modular, plataformas longas) | Carga sobre cada apoio (ou par de apoios), numa área ≈ 1/n da superfície | **Max/(n−1)** em cada apoio | R76 3.6.2.2 / A.4.7.2; Portaria 157 §2.6.2.3 |
  | Rodoviária / ferroviária, carga rolante | Veículo (o mais pesado e concentrado usual, **≤ 0,8·Max**) no início, meio e fim do receptor, no sentido normal; repetir no sentido inverso, rezerando antes de inverter. Se houver módulos: antes, sobre e depois de cada junta, nos 2 sentidos | ≤ 0,8·(Max + T) | R76 3.6.2.4 / A.4.7.4; Portaria 157 §2.6.2.5; guia INM-CO §6.4.2.2.2 |
  | Rodoviária, carga estática nos cantos (alternativa usada na cg-18 H3) | Empilhadeira com contêineres ou pesos no centro e nos 4 cantos | ≈ 1/3 Max ou o disponível | cg-18 H3 |
  | Tanque, tremonha, silo (excentricidade mínima) | Carga em cada ponto de apoio | **Max/10** em cada apoio | R76 3.6.2.3; Portaria 157 §2.6.2.4 |
  | Gancho / balança suspensa | **Não aplicável**: a carga se autocentra. Registrar "N/A" e `u(δI_ecc) = 0` | — | R76 A.4.7 nota ("se não pode ocorrer excentricidade, o ensaio não precisa ser feito") |

- **Métodos de execução (cg-18 §5.3) e cálculo de ΔI (§6.3):**

  | Método | Procedimento | ΔI |
  |---|---|---|
  | 1 | Zera; carga na posição 1; desloca para as demais | `ΔI_ecc,i = I_Li − I_L1` (6.3-1) |
  | 2 | Carga na posição 1, **tara**; desloca para as demais | idem (6.3-1) |
  | 3 | Zera; coloca na posição, retira, coloca na próxima… | `ΔI_ecc,i = (I_Li − I_0i) − I_L1` (6.3-2) |
  | 4 | Posição 1, tara; vai à posição i e volta à 1… | `ΔI_ecc,i = I_Li − I_L1i` (6.3-3), usando o I_L1 imediatamente anterior |

  - Os métodos 3 e 4 são indicados quando há deriva relevante.
  - Nos métodos 2 e 4, zero automático e rastreamento devem estar desligados.
- **Resultado:** `|ΔI_ecc,i|max`. Se dois ensaios forem feitos (por exemplo, cantos e carga rolante), usar o de **maior valor relativo** `|ΔI|max / L_ecc` (cg-18 H3).
  - O guia INM-CO usa, para carga rolante, ΔI em relação à posição central de cada sentido.
- **Registrar:** a carga, as posições (croqui), as leituras, o método e o estado do zero.

### 2.4 Erro de indicação (cg-18 §5.2, §6.2)

- **Objetivo:** determinar `E_j = I_j − m_ref,j` ao longo da faixa.
- **Pontos:** `k_L ≥ 5`, distribuídos "razoavelmente uniformes". O zero conta como ponto, segundo Fritsch / IMEKO 2017.
  - Exemplo com k_L = 5: zero (ou Min), 0,25, 0,5, 0,75 e 1·Max. Tolera-se desvio de ±0,1·Max, desde que pontos consecutivos difiram ≥ 0,2·Max.
  - Exemplo com k_L = 11: zero (ou Min) e 10 passos de 0,1·Max. Tolerância de ±0,05·Max, diferença entre pontos ≥ 0,08·Max.
  - Faixa reduzida acordada: ≥ 3 pontos, incluindo Min′ e Max′, com passo ≤ 0,15·Max.
  - A OIML R76 A.4.4.1 (verificação) pede ≥ 5 cargas (≥ 10 na determinação do erro intrínseco inicial), incluindo Max, Min (se Min ≥ 100 mg) e cargas **nas mudanças de EMA**. Para declarar conformidade com o EMA, é útil incluir 500e e 2000e (classe III).
- **Cargas:** pesos padrão rastreáveis ou cargas de substituição (§2.7).
- **Métodos de carregamento (cg-18 §5.2):**
  1. **Crescente com descarga entre os pontos (descontínuo):** representa a maioria dos usos (pesagem de cargas individuais). Exige mais manuseio.
  2. **Crescente contínuo, sem descarga:** inclui fluência, mas exige menos manuseio. É típico em substituição e rodoviárias.
  3. **Crescente e decrescente contínuo:** é o procedimento de verificação R76 e fornece a histerese.
  4. **Decrescente contínuo a partir de Max:** simula tremonha / pesagem por descarga.
  - Multi-intervalo: pode-se usar tara para obter indicações com d1.
- Em geral cada carga é aplicada **uma vez**. Pode-se repetir para combinar com a repetibilidade (aí `u_rep = s/√N`).
- **Registrar:**
  - as indicações `I_Lj` e o zero após descarga `I_0j`, quando aplicável;
  - os pesos usados em cada ponto (identificação de cada peça);
  - o método de carregamento e a hora.
  - **Registrar as indicações originais, e não os erros** (cg-18 §4.4.1).
- **Indicação líquida:** `I = I_L − I_0` (4.4.1-1a).
  - Com deriva linear de zero: `I = I_L − (I_0 + I_0i)/2` (4.4.1-1b).
- **Resolução aumentada (opcional, com consentimento do cliente, cg-18 §4.4.2):**
  - **modo serviço** com `d_T < d`;
  - ou **ponto de mudança (changeover)** com pesinhos de `d/5` ou `d/10`: `I_L = I′ + d/2 − ΔL` (4.4.2-1). Recomenda-se aplicar também no zero.
  - Nesses casos, o certificado deve **advertir** que a incerteza é menor do que a que se obtém com leituras normais (cg-18 §8.3).
- **Erro de arredondamento na verificação legal:** a R76 3.5.3.2 / Portaria 157 §2.5.4.2 exigem eliminar o erro de arredondamento quando `d > 0,2·e`, pelo método do ponto de mudança da R76 A.4.4.3: `P = I + e/2 − ΔL`, `E = P − L`, `E_c = E − E_0`.

### 2.5 Histerese, carga crescente / decrescente e retorno a zero

- A cg-18 **não define um ensaio de histerese separado**:
  - a informação vem do método 3 (crescente e decrescente);
  - a §7.1.1 admite "correções adicionais (… histerese …)" no orçamento;
  - a §7.4.4.2 trata histerese e fluência na incerteza em uso.
- **Opção A (cg-18 "pura", recomendada como padrão):** reportar E↑ e E↓ separadamente, cada um com seu orçamento (os valores de U são praticamente iguais). Não se adiciona componente de histerese.
- **Opção B (prática comum, útil quando o certificado traz um único erro por ponto):**
  ```
  Ī_j = (I↑_j + I↓_j)/2        E_j = Ī_j − m_ref,j
  u(δI_hist) = |I↓_j − I↑_j| / √12      (retangular de largura total |ΔI|; mesma forma da (7.4.4-6))
  ```
  Mantenha `u_rep = s`, sem dividir por √2: subida e descida não são repetições em condições idênticas.
- **Retorno ao zero:** após descarregar, registre `E_0`. Em calibração com carga mantida por muito tempo (substituição), a cg-18 H3 adiciona `u_rel(δI_time) = |E_0| / (Max·√3)` (7.4.4-7) à incerteza da indicação.

### 2.6 Mobilidade / discriminação (opcional; R76 3.8 e A.4.8; Portaria 157 §2.8)

- **Indicação digital (d ≥ 5 mg):**
  1. colocar a carga e pesinhos adicionais (por exemplo, 10 × d/10);
  2. retirar pesinhos até a indicação cair univocamente de I para I − d;
  3. recolocar d/10;
  4. adicionar **1,4·d**: a indicação deve passar a **I + d**.
- **Cargas:** Min, ½·Max e Max.
- **Indicação analógica:** sobrecarga igual a |EMA| deve deslocar o indicador ≥ 0,7 × o valor da sobrecarga.
- **Instrumentos de equilíbrio não automático:** sobrecarga de 0,4·|EMA| deve produzir movimento visível.
- **No sistema:** registrar aprovado / reprovado por carga. Não entra no orçamento de incerteza.

### 2.7 Cargas de substituição (rodoviárias de 30 a 120 t; cg-18 §4.3.3, §7.1.2.6; R76 3.7.3; Portaria 157 §2.7.3)

**Como funciona (cg-18 4.3.3):**
1. Aplicar `L_T1 = m_ref`, só pesos padrão (por exemplo, 10 t em 10 × 1000 kg M1), e ler `I(m_ref)`.
2. Retirar os pesos e colocar a carga de substituição `L_sub1` (caminhão / carreta com lastro, contêineres com sucata, blocos), ajustada para dar aproximadamente a mesma indicação. Ler `I(L_sub1)`:
   ```
   L_sub1 = m_ref + I(L_sub1) − I(m_ref) = m_ref + ΔI_1                       (4.3.3-3)
   ```
3. Recolocar os pesos: `L_T2 = L_sub1 + m_ref = 2·m_ref + ΔI_1` (4.3.3-4).
4. Substituir de novo `m_ref` por mais carga de substituição e repetir:
   ```
   L_Tn = n·m_ref + ΔI_1 + ΔI_2 + … + ΔI_(n−1)                                 (4.3.3-5a)
   ```
5. Com pesos aplicados em frações `m_ref,k`, onde `m_ref,1 < … < m_ref,N = m_ref`:
   ```
   L_Tn,k = (n−1)·m_ref + m_ref,k + ΔI_1 + … + ΔI_(n−1)                        (4.3.3-5b)
   ```

**Incerteza (cg-18 7.1.2.6):**
```
u²(L_Tn)   = n²·u²(m_ref) + 2·[u²(I_1) + … + u²(I_(n−1))]                       (7.1.2-15a)
u²(L_Tn,k) = [(n−1)·u(m_ref) + u(m_ref,k)]² + 2·[u²(I_1) + … + u²(I_(n−1))]      (7.1.2-15b)
se u(I_j) = cte:  u²(L_Tn) = n²·u²(m_ref) + 2·(n−1)·u²(I)                        (7.1.2-16a)
u²(E_n,k) = u²(δI_dig0) + u²(δI_digL) + u²(δI_rep) + u²(δI_ecc) + u²(L_Tn,k)     (7.1.3-1c)
```
- O fator 2 vem das duas leituras de cada substituição: `I(m_ref)` e `I(L_sub)`. Os termos `u(I_j)` entram **mesmo que ΔI_j = 0**.
- Pode ser preciso somar:
  - excentricidade das cargas de substituição;
  - **empuxo** de cargas de baixa densidade (areia, brita), considerando cavidades fechadas (densidade "global");
  - **fluência / histerese** pelo tempo em carga (H3 usa `|E_0|/(Max·√3)`).
- Na cg-18 H3 (§10.2), a repetibilidade contida em `u(L_sub)` não entra no cálculo de ν_eff: só entra a parcela direta `u(δI_rep)`. Reproduzi os valores publicados com essa convenção.

**Efeito na incerteza (ilustração, calculada com 7.1.2-16a):**
- Rodoviária com Max = 60 t, d = 20 kg, s = 10 kg, pesos padrão de 20 t (20 × 1000 kg M1, `u(m_ref) = 0,876 kg`), `u(I) = √(2·d²/12 + s²) = 12,9 kg`:

  | Carga | Só pesos (hipotético) u(E) | Com substituição u(E) | U (k = 2) com substituição |
  |---|---|---|---|
  | 20 t (só pesos) | 12,9 kg | 12,9 kg | 25,9 kg |
  | 40 t (1 substituição) | 13,0 kg | 22,4 kg | 44,9 kg |
  | 60 t (2 substituições) | 13,2 kg | 29,0 kg | 58,0 kg |

  - No modo serviço com `d_T = 4 kg`, U a 60 t cai só para 45,6 kg: a **repetibilidade domina**.
  - A nota 2 da cg-18 dá outro exemplo: Max = 5 t, d = 1 kg. Com 5 t M1, u ≈ 150 g; com 1 t de pesos + 4 t de substituição, u ≈ 1,2 kg. Conferi com 7.1.2-16a: 1,16 kg.

**Regras legais de fração mínima de pesos padrão (aplicáveis à verificação; para calibração a cg-18 não impõe mínimo, só a incerteza cresce):**
- **OIML R76 3.7.3:** pesos ≥ ½·Max. Reduz-se a ⅓·Max se o erro de repetibilidade for ≤ 0,3e, e a ⅕·Max se for ≤ 0,2e (repetibilidade medida com 3 aplicações de uma carga próxima do ponto de substituição).
- **Portaria 157 §2.7.3.1** (ensaios com Max > 1 t): pesos ≥ 1 t ou 50 % de Max, o que for maior. Reduz-se a 35 % se a "fidelidade" for ≤ 0,3e e a 20 % se for ≤ 0,2e.
- **Portaria 157 §2.7.3.2** (verificação / supervisão com Max > 100 kg): ≥ 50 % de Max. Reduz-se a 20 % se a fidelidade for ≤ 1e.
- **Portaria 157 §2.7.3.3:** a fidelidade é medida com carga de cerca de 50 % de Max, aplicada 3 vezes.
- **Alternativa (guia INM-CO, opção 2):** determinar a massa das cargas de substituição numa balança auxiliar calibrada. A incerteza então vem dessa balança.

### 2.8 Medições auxiliares (cg-18 §5.4)

- **Temperatura do ar** perto do instrumento, pelo menos uma vez (recomendado: no início e no fim) e a faixa de variação em sala controlada.
- **Pressão barométrica** ou altitude do local (opcional).
- **Umidade relativa** (opcional).
- **Convecção:** diferença de temperatura entre os pesos e o ar, ou tempo de aclimatação. Só é relevante para pesos F1 ou melhores.
- **Magnetismo** (balanças de alta resolução): pesar o mesmo peso com espaçador não metálico em cima e embaixo. Diferença significativa vai como aviso no certificado.

### 2.9 Dados mínimos a registrar (sugestão de modelo de dados)

- **Instrumento:**
  - fabricante, modelo, série, tipo e receptor (retangular, circular, rodoviária com n apoios / módulos, gancho, tanque);
  - Max, d, e, d_T (se usado), Min, classe, multi-intervalo / múltiplas faixas (Max_i, d_i);
  - local, zero automático / rastreamento, aprovação de modelo (Inmetro) sim / não;
  - ajuste antes da calibração (não / interno / externo com qual peso).
- **Padrões:** para cada peça, id, m_N, classe R111, δm_c e U (k) do certificado, validade, material / densidade (ou classe), histórico de deriva.
- **Ambiente:** t_inicial, t_final (e máximo / mínimo), UR, pressão (ou altitude), aclimatação dos pesos.
- **Ensaios:** leituras brutas de repetibilidade, excentricidade (método, posições), erro de indicação (↑ / ↓, método, composição da carga), mobilidade, substituição (cada `I(m_ref)`, `I(L_sub)`), zero de retorno.
- **Opções de cálculo** (para rastreabilidade do certificado):
  - empuxo (5a / 5c / 5d / 5e);
  - deriva (D = mpe, k_D·U ou histórico);
  - inclusão de excentricidade e de histerese (opção A ou B);
  - método de k (t exato ou tabela G.2) e regra de arredondamento.

---

## 3. Modelo matemático do erro e da incerteza (cg-18 §7.1–7.3)

### 3.1 Modelo
```
E = I − m_ref                                                      (7.1-1)
u²(E) = u²(I) + u²(m_ref)                                          (7.1-2)
I     = I_L + δI_digL + δI_rep + δI_ecc − I_0 − δI_dig0 [+ δI_hist + δI_time …]   (7.1.1-1)
m_ref = m_N + δm_c + δm_B + δm_D + δm_conv                         (7.1.2-1)
```
- As correções δ têm valor esperado zero, exceto `δm_c` (se se usa o valor do certificado) e `δm_B` (se se corrige o empuxo). Só suas incertezas entram no orçamento.
- Todas as entradas são consideradas não correlacionadas entre si.
- Dentro de cada categoria, as contribuições de vários pesos são somadas **linearmente** (correlação total; ver §3.3).

### 3.2 Incerteza da indicação

| Componente | Fórmula | Distribuição | ν |
|---|---|---|---|
| Arredondamento no zero | `u(δI_dig0) = d0/(2√3) = d0/√12` (7.1.1-2a); com d_T: `d_T/√12` (2b); instrumento aprovado R76, após zero/tara: `d0/(4√3)` (2c) | retangular | ∞ |
| Arredondamento na carga | `u(δI_digL) = d_I/√12` (7.1.1-3a) ou `d_T/√12` (3b). Em multi-intervalo, d_I é o d do intervalo da indicação | retangular | ∞ |
| Repetibilidade | `u(δI_rep) = s` (7.1.1-5); `s/√N` se I for média de N leituras (7.1.1-6) | normal | n − 1 |
| Excentricidade | `u(δI_ecc) = I·\|ΔI_ecc,i\|max / (2·L_ecc·√3)` (7.1.1-10); relativo: `u_rel = \|ΔI\|max/(2·L_ecc·√3)` (7.1.1-11) | retangular | ∞ |
| Histerese (opção B, §2.5) | `\|I↓ − I↑\|/√12` | retangular | ∞ |
| Fluência / tempo (substituição, carga longa) | `I·\|E_0\|/(Max·√3)` (7.4.4-7, usado em H3) | retangular | ∞ |

```
u²(I) = d0²/12 + d_I²/12 + s² + u_rel²(δI_ecc)·I²  [+ u²_hist + u²_time]        (7.1.1-12)
```
**No ponto zero** (convenção de H1, H2 e H3): `u²(E_0) = d0²/12 + s²`, sem `δI_digL` e sem excentricidade.

**Justificativa da excentricidade (7.1.1.4):**
- O efeito é proporcional à distância ao centro e à carga.
- Supõe-se que o centro de gravidade efetivo da carga de ensaio está, no máximo, à metade da distância das posições de excentricidade. Daí o fator 2.
- Por isso a componente é **opcional** quando a carga de cada ponto é um único corpo bem centrado. Nos exemplos H da cg-18 ela foi sempre incluída; recomendo incluí-la por padrão.

### 3.3 Incerteza da massa de referência

#### 3.3.1 Massa convencional δm_c (7.1.2.1)
- **Com certificado** (valor convencional usado):
  - `m_ref = m_N + Σδm_c,i` e `u(δm_c) = U/k` (7.1.2-2);
  - várias peças: `u(δm_c) = Σ U_i/k_i` (**soma aritmética**, correlação assumida).
- **Pelo valor nominal**, com conformidade à classe (R111): `δm_c = 0` e `u(δm_c) = Σ mpe_i/√3` (7.1.2-3).
- Requisito R111 (5.2 e 5.3): `U ≤ mpe/3` e `m_N − (mpe − U) ≤ m_c ≤ m_N + (mpe − U)`.

#### 3.3.2 Deriva δm_D (7.1.2.3)
```
D = k_D·U(δm_c),  1 ≤ k_D ≤ 3   (ou da diferença entre certificados consecutivos)        (7.1.2-10)
sem informação: D = mpe (R111)
u(δm_D) = D/√3                (7.1.2-11);   relativo: u_rel = D_rel/√3   (7.1.2-12)
```
- Não se aplica correção; a distribuição é retangular.
- Para várias peças a soma é aritmética (como em H2 e H3).
- Exemplos da cg-18: H1 usa k_D = 1,25; H2 usa D = mpe/2 (histórico); H3 usa D = mpe (sem histórico).

#### 3.3.3 Empuxo do ar δm_B (7.1.2.2, Apêndices A e E)

**(a) Com densidade do ar medida** (correção aplicada; "opção 2" dos exemplos):
```
δm_B = −m_N·(ρ_a − ρ_0)·(1/ρ − 1/ρ_c)        ρ_0 = 1,2 kg/m³, ρ_c = 8000 kg/m³      (7.1.2-4)
u_rel²(δm_B) = u²(ρ_a)·(1/ρ − 1/ρ_c)² + (ρ_a − ρ_0)²·u²(ρ)/ρ⁴                        (7.1.2-5a)
```
- Em altitude elevada há uma fórmula mais exata, que usa ρ_a1 (densidade do ar na calibração dos pesos): `u_rel² = u²(ρ_a)(1/ρ − 1/ρ_c)² + (ρ_a − ρ_0)[(ρ_a − ρ_0) − 2(ρ_a1 − ρ_0)]·u²(ρ)/ρ⁴` (7.1.2-5b).
- **Densidade do ar**, fórmula CIPM simplificada (R111 E3; cg-18 A1.1-1), válida para 600–1100 hPa, 20–80 % UR e 15–27 °C, com `u_form/ρ_a = 2,4×10⁻⁴`:
  ```
  ρ_a [kg/m³] = (0,34848·p − 0,009·UR·exp(0,061·t)) / (273,15 + t)     p em hPa, UR em %, t em °C
  ```
- **Pela altitude** (A1.2-1): `ρ_a = ρ_0·exp(−ρ_0·g·h/p_0)`, com `p_0 = 101 325 Pa` e `g = 9,81 m/s²`. A incerteza relativa é de 1,2×10⁻².
- **Incerteza de ρ_a** (A3-1): `[u(ρ_a)/ρ_a]² = (1×10⁻⁵ Pa⁻¹·u(p))² + (−4×10⁻³ K⁻¹·u(T))² + (−9×10⁻³·u(UR))² + (u_form/ρ_a)²`.
  - Aqui `u(UR)` é uma fração (0,01 = 1 %).
  - Sem medição, use `u(p) = 10 hPa`, `u(T) = ΔT/√12` e `u(UR) = ΔUR/√12`.
  - Aproximação (A3-2): `u(ρ_a)/ρ_a = √(1,07×10⁻⁴ + 1,33×10⁻⁶·ΔT²)`, com ΔT em K.
- **Densidade dos pesos** sem informação (Tabela E1, de R111 B7), em kg/m³:

  | Material | ρ | u(ρ) |
  |---|---|---|
  | Aço inox | 7950 | 70 |
  | Aço carbono | 7700 | 100 |
  | Ferro | 7800 | 100 |
  | Ferro fundido branco | 7700 | 200 |
  | Ferro fundido cinzento | 7100 | 300 |
  | Latão | 8400 | 85 |
  | Alpaca | 8600 | 85 |
  | Alumínio | 2700 | 65 |

**(b) Pesos conformes à R111, sem informação sobre ρ e ρ_a** (sem correção; "opção 1"):
```
ajustado imediatamente antes da calibração:   u_rel(δm_B) = mpe/(4·m_N·√3)                                  (7.1.2-5c)
NÃO ajustado antes:                            u_rel(δm_B) = (0,1·ρ_0/ρ_c + mpe/(4·m_N)) / √3                  (7.1.2-5d)
NÃO ajustado, com ΔT do local conhecido:       u_rel(δm_B) = √(1,07×10⁻⁴ + 1,33×10⁻⁶·ΔT²)·ρ_0/ρ_c + mpe/(4·m_N·√3)   (7.1.2-5e)
```
- `u(δm_B) = u_rel·m_N`, com m_N total da carga. Isso equivale à soma linear.
- Conferido com os exemplos:
  - (5e) H1, 50 g E2, ΔT = 5 K: 0,000 103 g ✓;
  - (5d) H1, 50 g E2: 0,000 447 g ✓;
  - (5d) H3, 10 t M1: 0,16 kg ✓.
- Para pesos ≥ 100 g (mpe proporcional a m_N), a Tabela E2.1 dá os valores relativos em mg/kg:

  | Classe | mpe/m_N | u_rel (5c) | u_rel (5d) |
  |---|---|---|---|
  | E2 | 1,6 | 0,23 | 8,89 |
  | F1 | 5,0 | 0,72 | 9,38 |
  | F2 | 16,0 | 2,31 | 11,0 |
  | M1 | 50,0 | 7,22 | 15,88 |

- A cg-18 (nota em 7.1.2.2) diz que, se esses valores são pequenos frente a `d/Max`, um cálculo mais elaborado é supérfluo.
- **Situação brasileira:** em locais altos (São Paulo, cerca de 925 hPa, ρ_a ≈ 1,087 kg/m³), um peso de ferro fundido cinzento (7100 kg/m³) tem `δm_B ≈ +1,8 mg/kg`, ou seja, 0,054 g em 30 kg. É desprezível para d = 5 g, mas não para classes I e II.

#### 3.3.4 Convecção δm_conv (7.1.2.4, Apêndice F)
- `u(δm_conv) = Δm_conv/√3` (7.1.2-13), com Δm_conv da Tabela F2.1 da cg-18 em função de ΔT (peso − ar) e da massa.
- É relevante só para pesos **F1 ou melhores**. Para M1 e F2 o sistema pode fixar 0 e registrar "não relevante".
- Implementação sugerida: tabela F2.1 + interpolação, ou um campo manual. Não reproduzo aqui a tabela inteira (copyright).
- Ordem de grandeza (F2.1): 1 kg com ΔT = 2 K dá cerca de 0,51 mg; 10 kg com ΔT = 5 K dá cerca de 7,8 mg.

#### 3.3.5 Combinação
```
u²(m_ref) = u²(δm_c) + u²(δm_B) + u²(δm_D) + u²(δm_conv)                         (7.1.2-14)
```

### 3.4 Incerteza padrão combinada do erro
```
u²(E) = u²(δI_dig0) + u²(δI_digL) + u²(δI_rep) + u²(δI_ecc) + u²(δm_c) + u²(δm_B) + u²(δm_D) + u²(δm_conv)    (7.1.3-1a)
forma compacta:  u²(E) = α² + β²·I²       (α: termos absolutos; β: termos relativos)                          (7.1.3-2)
substituição:    u²(E_n,k) = u²(δI_dig0) + u²(δI_digL) + u²(δI_rep) + u²(δI_ecc) + u²(L_Tn,k)                  (7.1.3-1c)
```

### 3.5 Graus de liberdade efetivos e fator de abrangência (cg-18 Ap. B; GUM G.4; EA-4/02 Ap. E)
```
ν_eff = u⁴(E) / Σ_i [u_i⁴(E)/ν_i]                                                (B3-1 = GUM G.2b)
```
- Componentes retangulares (tipo B com limites seguros): `ν_i = ∞`. Não entram na soma.
- Repetibilidade: `ν = n − 1`, aplicado a `u_i = u(δI_rep)`.
- Pesos com certificado em k = 2: `ν = ∞`. Se o certificado declarar k e ν_eff finitos, use esse ν na parcela `U/k`.
- `ν_eff` não inteiro: **truncar para o inteiro inferior** (GUM G.4.1 nota 1; EA-4/02 E2(c)). Se ν_eff = ∞, então k = 2.
- **k** para 95,45 % (cg-18 B1 exige 95,45 %): `k = t_{p}(ν_eff)`, com p unilateral = 0,977 25. Valores da GUM Tabela G.2:

| ν | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| k | 13,97 | 4,53 | 3,31 | 2,87 | 2,65 | 2,52 | 2,43 | 2,37 | 2,32 | 2,28 | 2,25 | 2,23 | 2,21 | 2,20 | 2,18 |

| ν | 16 | 17 | 18 | 19 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 100 | ∞ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| k | 2,17 | 2,16 | 2,15 | 2,14 | 2,13 | 2,11 | 2,09 | 2,07 | 2,06 | 2,06 | 2,05 | 2,025 | 2,000 |

- **Cálculo exato** (recomendado): quantil da t de Student `t⁻¹(0,977 25; ν)`. Minha implementação reproduz toda a Tabela G.2 com 3 algarismos.
- **Convenção conservadora** (usada nos exemplos H2 da cg-18): usar a linha tabelada imediatamente **inferior**. Exemplos: ν = 90 → linha 50 → 2,05; ν = 172 → linha 100 → 2,025. A EA-4/02 Tabela E.1 não tem a linha 100; para ν > 50 usaria 2,05.
- **Atenção:** as convenções podem mudar o 2º algarismo de U. No exemplo do §9 (ν = 28): t exato dá 2,09 e U = 8,3 g; a tabela conservadora dá 2,11 e U = 8,4 g. **Fixe uma convenção e registre-a no procedimento.**

**Distribuição não normal (cg-18 B4)**, quando uma componente retangular domina (`u_R ≤ 0,3·u_1`):
- retangular: k = 1,65;
- triangular: k = 1,90;
- trapezoidal com β < 0,95: `k = [1 − √(0,05·(1 − β²))] / √[(1 + β²)/6]`;
- forma de U: k = 1,41.

Isso é raro em balanças, porque arredondamento, repetibilidade e excentricidade costumam ter pesos comparáveis.

### 3.6 Incerteza expandida
```
U(E) = k·u(E)                                                                    (7.3-1)
```

### 3.7 Simplificações comuns e aceitas

| Simplificação | Quando é aceitável | Fonte |
|---|---|---|
| k = 2 fixo | Repetibilidade com ≥ 10 leituras ou ν_eff alto; senão calcular ν_eff. Para U(W) em uso, k = 2 "na maioria dos casos" | cg-18 B2, 7.5.1 |
| Reportar um único U (o maior) para todos os pontos | Aceito pela cg-18, com a frase "probabilidade de abrangência de pelo menos 95 %" | H1, H2, H3 |
| `m_ref ≈ m_N` e `I ≈ I_N` nos termos relativos | Sempre (os erros são pequenos) | 7.1.3 |
| Ignorar empuxo e convecção | Pesos M1 / F2 com d grosseiro: verificar `u(δm_B) ≪ d/√12` | 7.1.2.2 nota, Ap. F |
| Uma repetibilidade para toda a faixa | Um só ensaio e leituras únicas | 7.1.1.3 |
| Sem excentricidade no orçamento | Carga de cada ponto é um único corpo centrado; documentar | 7.1.1.4 |

### 3.8 Pseudocódigo (TypeScript) do núcleo

```ts
// ---------- Student t (sem dependências) ----------
function betacf(a: number, b: number, x: number): number {            // fração contínua de Lentz
  const TINY = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}
function lgamma(z: number): number {                                    // Lanczos (g=7, n=9)
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
const tCdf = (t: number, nu: number) => { const p = 0.5 * betai(nu / 2, 0.5, nu / (nu + t * t)); return t >= 0 ? 1 - p : p; };
export function coverageFactor(nuEff: number, p = 0.9545): number {
  if (!isFinite(nuEff)) return 2;                 // para p=95,45 % e ν=∞
  const nu = Math.floor(nuEff), target = 0.5 + p / 2;
  let lo = 0, hi = 1000; for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; (tCdf(mid, nu) < target) ? lo = mid : hi = mid; }
  return (lo + hi) / 2;
}

// ---------- orçamento de um ponto (cg-18 7.1) ----------
interface Peso { mN: number; dmc: number; U: number; k: number; mpe: number; }
interface Ponto { I: number; pesos: Peso[]; zero?: boolean; dI_hist?: number; }
interface Cfg {
  d0: number; dL: number; s: number; nRep: number;             // repetibilidade
  dIeccMax: number; Lecc: number; incluirEcc: boolean;         // excentricidade
  empuxo: '5c' | '5d' | '5e' | 'nenhum'; dT_local?: number;     // ver 3.3.3
  deriva: 'mpe' | { kD: number };
}
export function orcamento(p: Ponto, c: Cfg) {
  const SQ3 = Math.sqrt(3), SQ12 = Math.sqrt(12);
  const mN = p.pesos.reduce((a, w) => a + w.mN, 0);
  const mref = mN + p.pesos.reduce((a, w) => a + w.dmc, 0);
  const E = p.I - mref;
  const uDig0 = c.d0 / SQ12, uDigL = p.zero ? 0 : c.dL / SQ12, uRep = c.s;
  const uEcc = (p.zero || !c.incluirEcc) ? 0 : p.I * c.dIeccMax / (2 * c.Lecc * SQ3);
  const uHist = p.dI_hist ? Math.abs(p.dI_hist) / SQ12 : 0;
  const uC = p.pesos.reduce((a, w) => a + w.U / w.k, 0);                       // soma linear
  const uD = p.pesos.reduce((a, w) => a + (c.deriva === 'mpe' ? w.mpe : c.deriva.kD * w.U) / SQ3, 0);
  const mpeRel = mN > 0 ? p.pesos.reduce((a, w) => a + w.mpe, 0) / mN : 0;
  const urelB = c.empuxo === '5c' ? mpeRel / (4 * SQ3)
    : c.empuxo === '5d' ? (0.1 * 1.2 / 8000 + mpeRel / 4) / SQ3
    : c.empuxo === '5e' ? Math.sqrt(1.07e-4 + 1.33e-6 * (c.dT_local ?? 0) ** 2) * 1.2 / 8000 + mpeRel / (4 * SQ3)
    : 0;
  const uB = urelB * mN;
  const uI = Math.hypot(uDig0, uDigL, uRep, uEcc, uHist);
  const uMref = Math.hypot(uC, uD, uB);
  const uE = Math.hypot(uI, uMref);
  const nuEff = uRep > 0 ? uE ** 4 / (uRep ** 4 / (c.nRep - 1)) : Infinity;
  const k = coverageFactor(nuEff);
  return { mref, E, uDig0, uDigL, uRep, uEcc, uHist, uI, uC, uD, uB, uMref, uE, nuEff, k, U: k * uE };
}
```

Observações sobre o pseudocódigo:
- **Pesos de classes diferentes na mesma carga:** em `5c/5d/5e`, use `Σmpe_i/(4…)` em vez de `mpeRel·m_N`. As duas formas são idênticas em `u(δm_B) = urel·m_N` quando `mpeRel = Σmpe/Σm_N`, como no código.
- **Pesos < 100 g:** o mpe deixa de ser proporcional à massa. A fórmula continua válida peça a peça.

---

## 4. "Incerteza em uso" (cg-18 §7.4–7.5, Apêndices C e G) — opcional

### 4.1 O que é e se vale a pena
- **Regra da cg-18 (§7.4 e §8.4):** estimativas baseadas em informações **não medidas pelo laboratório** (variação de temperatura no uso, uso de tara, deriva até a próxima calibração etc.) **não podem fazer parte do certificado**. Podem ir como **anexo claramente separado**.
- Podem constar do certificado:
  - a **função aproximada do erro** `E_appr(R)`;
  - a sua incerteza `u(E_appr)`;
  - os valores de `U(W*)` (§8.4).
- **Recomendação:**
  - **Fase 1:** não incluir.
  - **Fase 2:** anexo opcional "Informações para o uso". Nele vão `E(R) = a1·R`, `U(W) ≈ U0 + b·R`, `U_gl(W)` e o **peso mínimo** (Ap. G).
  - É valioso para clientes farmacêuticos e de alimentos (USP <41>, requisito de tolerância de pesagem). Para comércio e indústria comum, agrega pouco.

### 4.2 Função de aproximação (Apêndice C)
- **Interpolação linear** entre pontos (C2.1-1 / C2.1-2):
  ```
  E(R) = E_k + (R − I_k)(E_(k+1) − E_k)/(I_(k+1) − I_k)
  U(E(R)) = U_k + (R − I_k)(U_(k+1) − U_k)/(I_(k+1) − I_k)
  ```
- **Mínimos quadrados ponderados** ("mínimo χ²"), com `p_j = 1/u²(E_j)`.
- **Reta pela origem** `E = a1·R` (C2.2-16), a mais usada:
  ```
  a1 = Σ(p·I·E) / Σ(p·I²)        u²(a1) = 1/Σ(p·I²)        χ² = Σ p·(a1·I − E)²          (C2.2-16a,b,c)
  u²(E_appr) = a1²·u²(R) + R²·u²(a1)                                                     (C2.2-16d)
  ```
- **Reta geral** `E = a0 + a1·R` (C2.2-15a…g):
  ```
  Δ = Σp·Σ(pI²) − (Σ(pI))²
  a0 = [Σ(pE)·Σ(pI²) − Σ(pI)·Σ(pIE)]/Δ
  a1 = [Σp·Σ(pIE) − Σ(pE)·Σ(pI)]/Δ
  u²(a0) = Σ(pI²)/Δ    u²(a1) = Σp/Δ    cov(a0,a1) = −Σ(pI)/Δ
  u²(E_appr) = a1²u²(R) + u²(a0) + R²u²(a1) + 2R·cov(a0,a1)
  ```
- **Teste de consistência** (C2.2-2a): `χ²_obs ≤ ν = n − n_par`.
  - Se falhar, calcule `std_fit = √[Σ(f(I_j) − E_j)²/(n − n_par)]` e refaça com `p′_j = 1/(u²(E_j) + std_fit²)` (C2.2-18).
  - Critério mais restritivo (C2.2-2b): `max|f(I_j) − E_j|/U(f(I_j)) < 1`.
- **Polinômio de grau n_a**, com `n_a + 1 ≤ n/2`: forma matricial `â = (XᵀPX)⁻¹XᵀPe` e `U(â) = (XᵀPX)⁻¹` (C2.2-6, -9), com `U(e) = U(m_ref) + U(I_cal) + U(mod)`.

### 4.3 Incerteza de um resultado de pesagem e "erro global"
```
u²(W*) = d0²/12 + dL²/12 + s² + u_rel²(δR_ecc)·R² + u²(E)                              (7.4.5-1a)
u²(W)  = u²(W*) + [u_rel²(δR_temp) + u_rel²(δR_buoy) + u_rel²(δR_adj) + u_rel²(δR_Tare) + u_rel²(δR_time)]·R²   (7.4.5-1b)
       = α_W² + β_W²·R²                                                                 (7.4.5-2)
```
Termos de uso:

| Termo | Fórmula | Nota |
|---|---|---|
| Temperatura | `u_rel(δR_temp) = K_T·ΔT/√12` (7.4.3-1) | Instrumento aprovado: `K_T ≤ mpe(Max)/(Max·ΔT_aprov)`; sem aprovação, 3 a 10 vezes isso |
| Empuxo no uso | Ajustado antes do uso: `Δρ_a·u(ρ_s)/ρ_c²` (7.4.3-2). Não ajustado: `Δρ_a/(ρ_c·√3)` (7.4.3-3), ou `√(1,07e-4 + 1,33e-6·ΔT²)·ρ_0/ρ_c` (7.4.3-4), ou `0,1·ρ_0/(ρ_c·√3)` (7.4.3-5) | — |
| Deriva do ajuste | `ΔE(Max)/(Max·√3)` (7.4.3-6) | `ΔE(Max)` vem do histórico ou do fabricante; para instrumento aprovado, `= mpe(Max)` |
| Tara | `(q_E,max − q_E,min)/√12` (7.4.4-5) | `q_E = ΔE/ΔI` entre pontos consecutivos |
| Fluência / histerese | Com dados de subida e descida: `\|ΔE_j\|max/(m_j·√12)` (7.4.4-6). Só subida: `\|E_0\|/(Max·√3)` (7.4.4-7). Sem dados: `mpe(Max)/(Max·√3)` se aprovado, ou m × isso (m = 3 a 10) | — |
| Excentricidade no uso (efeito integral) | `\|ΔI_ecc\|max/(L_ecc·√3)` (7.4.4-10) | Sem o fator 2 |

Fórmulas finais:
```
Com correção do erro:    W = R − E(R) ± U(W),   U(W) = k·u(W),  k = 2 na maioria dos casos      (7.5.1)
Sem correção ("global"): W = R ± U_gl(W),   U_gl(W) = U(W) + |E(R)|                             (7.5.2-3a)
  aproximação linear:    U(W) ≈ U(0) + [(U(Max) − U(0))/Max]·R                                  (7.5.2-3d)
                         U_gl(W) ≈ U(0) + [(U(Max) − U(0))/Max]·R + |a1|·R = α_gl + β_gl·R       (7.5.2-3e, G-3)
Peso mínimo (Ap. G):     R_min = α_gl / (Req − β_gl);   com fator de segurança SF:  R_min,SF = α_gl·SF / (Req − β_gl·SF)   (G-7, G-9)
Conformidade (7.5.3):    |E(R)| + U(W(R)) ≤ Tol(R)
```
O certificado deve dizer que U vale **somente quando o erro E é levado em conta**, ou seja, quando é corrigido (H1, H2, H3).

---

## 5. EMA de instrumentos (OIML R76-1:2006 e Portaria Inmetro 157/2022)

### 5.1 Classes, e, n e Min (R76 Tabela 3 = Portaria 157 Tabela 3)

| Classe | e | n = Max/e mínimo | n máximo | Min (limite inferior) |
|---|---|---|---|---|
| I (especial) | 0,001 g ≤ e | 50 000 (*) | — | 100·e |
| II (fina) | 0,001 g ≤ e ≤ 0,05 g | 100 | 100 000 | 20·e |
| II (fina) | 0,1 g ≤ e | 5 000 | 100 000 | 50·e |
| III (média) | 0,1 g ≤ e ≤ 2 g | 100 | 10 000 | 20·e |
| III (média) | 5 g ≤ e | 500 | 10 000 | 20·e |
| IIII (ordinária) | 5 g ≤ e | 100 | 1 000 | 10·e |

Observações:
- (*) Classe I com d < 0,1 mg: n pode ser menor que 50 000.
- Instrumento com dispositivo indicador auxiliar (só classes I e II): `d < e ≤ 10·d`, `e = 10^k kg`. Nesse caso o Min usa **d** em vez de e (R76 3.4.3).
- Instrumentos que determinam tarifa de transporte: R76 reduz Min a **5e** ("grading instruments"); a Portaria 157 §2.2.2.5 reduz a **10e** (classes II e III).
- Multi-intervalo (R76 3.3 / Portaria Tabela 4): `Max_i/e_(i+1) ≥ 50 000` (I), `5 000` (II), `500` (III), `50` (IIII). O EMA de m usa o e_i da faixa parcial em que m está.
  - Exemplo R76: 2/5/15 kg, e = 1/2/10 g, classe III → 0,5 g até 500 g; 1 g até 2 kg; 2 g até 4 kg; 3 g até 5 kg; 10 g até 15 kg.

### 5.2 EMA na verificação inicial (R76 Tabela 6) — m em múltiplos de e

| EMA (verificação inicial R76 = "aprovação de modelo" Portaria 157) | Classe I | Classe II | Classe III | Classe IIII |
|---|---|---|---|---|
| ±0,5·e | 0 ≤ m ≤ 50 000 | 0 ≤ m ≤ 5 000 | 0 ≤ m ≤ 500 | 0 ≤ m ≤ 50 |
| ±1,0·e | 50 000 < m ≤ 200 000 | 5 000 < m ≤ 20 000 | 500 < m ≤ 2 000 | 50 < m ≤ 200 |
| ±1,5·e | 200 000 < m | 20 000 < m ≤ 100 000 | 2 000 < m ≤ 10 000 | 200 < m ≤ 1 000 |

- **R76 3.5.2:** "Os EMA **em serviço** são o **dobro** dos EMA na verificação inicial" → ±1e, ±2e, ±3e. A R76 não distingue EMA de aprovação de modelo e de verificação inicial.
- **Portaria 236/1994 (revogada):** dizia exatamente o mesmo ("em serviço = dobro da verificação inicial").

### 5.3 [ATENÇÃO] Portaria Inmetro 157/2022 — Tabela 5 e itens 2.5.3, 8.8.2 e 8.9

O texto vigente consultado (PDF com timbre Inmetro; conferi visualmente a página 12) tem **duas colunas**:

| Faixa (classe III, por exemplo) | Aprovação de modelo | **Verificação** | **Em serviço** (2.5.3 / 8.9: dobro da verificação) |
|---|---|---|---|
| 0 ≤ m ≤ 500e | ±0,5e | ±1,0e | ±2,0e |
| 500e < m ≤ 2000e | ±1,0e | ±2,0e | ±4,0e |
| 2000e < m ≤ 10000e | ±1,5e | **±2,0e** | ±4,0e |

- **Diferença em relação à R76:** no Brasil, a coluna "verificação" (inicial e subsequente, §8.8.2) é o **dobro** da de aprovação de modelo nas duas primeiras faixas e **±2,0e** (não ±3,0e) na terceira. "Em serviço" (supervisão metrológica) é o dobro da "verificação".
- **Inconsistência interna:** o §8.9 diz "em serviço = o dobro daqueles aplicados na verificação inicial", e o §8.8.2 diz que a verificação subsequente usa os EMA "da verificação inicial".
- **[NÃO CONFIRMADO]** se o ±2,0e da 3ª linha é intencional ou erro de digitação (o padrão "dobro" daria ±3,0e). Não consegui acessar o texto do DOU nem o portal do Inmetro para comparar.
- **Resposta à pergunta "em serviço = 2× o inicial?":**
  - Pela R76 (e pela antiga Portaria 236/94): sim, 2× o da verificação inicial.
  - Pela Portaria 157/2022: em serviço = 2× o da "verificação". Mas a própria "verificação" já é maior que a da aprovação de modelo, ou seja, maior que o "inicial" da OIML.
- **Recomendação para o sistema:** tabela de EMA **parametrizável**, com os contextos:
  - `OIML_inicial` (= BR aprovação de modelo);
  - `OIML_servico` (2×);
  - `BR_verificacao` (conforme Tabela 5);
  - `BR_servico` (2× BR_verificacao);
  - `cliente` (tolerância livre: % de R, n·d etc.).

  O certificado deve citar qual tabela foi usada.

**Função EMA (implementável):**
```
limiares (em e):  I: [50 000, 200 000];  II: [5 000, 20 000];  III: [500, 2 000];  IIII: [50, 200]
k = m/e_i  (e_i da faixa parcial em multi-intervalo)
mult_base = 0,5 se k ≤ L1;  1,0 se k ≤ L2;  1,5 caso contrário
OIML_inicial = mult_base·e ; OIML_servico = 2·mult_base·e
BR_verificacao = {1,0; 2,0; 2,0}·e ; BR_servico = 2·BR_verificacao
```
- Fronteiras inclusivas no limite superior: m = 500e ainda é 0,5e.
- Aplicar a cargas crescentes e decrescentes, a valores líquidos com tara e à repetibilidade (|diferença| ≤ |EMA|).

**Outros limites legais úteis** (R76 3.6 / Portaria 157 §2.6):
- repetibilidade ("fidelidade"): diferença entre resultados ≤ |EMA| da carga;
- excentricidade: cada indicação dentro do EMA;
- mobilidade (§2.6).

### 5.4 Declaração de conformidade opcional e regra de decisão (ILAC-G8:09/2019, ISO/IEC 17025 7.8.6, cg-18 7.5.3)

- **Aviso legal Brasil:**
  - Declarar que o instrumento "atende ao EMA da Portaria 157" num certificado de calibração **não equivale à verificação metrológica legal**. A verificação legal é exclusiva do Inmetro / RBMLQ-I e é exigida para os usos do Art. 1º §1º.
  - Recomenda-se redigir: "conformidade com a tolerância especificada pelo cliente: EMA da tabela X, regra de decisão Y".
- **Regras (definidas e acordadas com o cliente antes da calibração e citadas no certificado):**
  1. **Aceitação simples** (w = 0, "risco compartilhado"): conforme se `|E| ≤ EMA`. No limite o risco de falsa aceitação chega a 50 %. Pela ILAC-G8 / UKAS LAB 48, a incerteza deve entrar como pré-condição, por exemplo `U ≤ EMA/3` (TUR ≥ 3) ou capacidade `C95 = (2·EMA)/(2·U) ≥ …`.
  2. **Banda de guarda w = U** (binária): conforme se `|E| + U ≤ EMA`; senão não conforme. Risco de falsa aceitação ≤ 2,5 % (unilateral; bilateral com C95 ≳ 1,5).
  3. **Não binária** (4 estados):
     - "conforme" se `|E| + U ≤ EMA`;
     - "conforme condicional" se `|E| ≤ EMA < |E| + U`;
     - "não conforme condicional" se `|E| − U ≤ EMA < |E|`;
     - "não conforme" se `|E| − U > EMA`.
- **Implementação:** avaliar por ponto (todos os pontos ↑ e ↓, além de repetibilidade e excentricidade) e retornar o pior caso.
  - Usar os **valores reportados (arredondados)**, para que o leitor possa refazer a conta. Alternativamente, usar os valores não arredondados de forma consistente; documentar a escolha.
- **Alerta prático:** em balanças limitadas pela resolução (d = e, sem modo serviço), a incerteza de calibração costuma ser U ≈ 1,2 a 2,5·d, maior que o EMA de verificação inicial (0,5 a 1,5e).
  - Nesse caso a banda de guarda quase sempre reprova contra a OIML inicial (ver §9.9).
  - Para declarar conformidade a EMA estrito, use o **ponto de mudança** ou o modo serviço (`d_T ≤ e/5`), como a R76 faz na verificação. Outra saída é declarar contra EMA "em serviço" ou contra a tolerância do cliente.

---

## 6. EMA dos pesos (OIML R111-1:2004, Tabela 1) e escolha da classe

### 6.1 Tabela 1 — EMA ±δm em **mg** (conferida visualmente no PDF oficial)

| Nominal | E1 | E2 | F1 | F2 | M1 | M1–2 | M2 | M2–3 | M3 |
|---|---|---|---|---|---|---|---|---|---|
| 5 000 kg | — | — | 25 000 | 80 000 | 250 000 | 500 000 | 800 000 | 1 600 000 | 2 500 000 |
| 2 000 kg | — | — | 10 000 | 30 000 | 100 000 | 200 000 | 300 000 | 600 000 | 1 000 000 |
| 1 000 kg | — | 1 600 | 5 000 | 16 000 | 50 000 | 100 000 | 160 000 | 300 000 | 500 000 |
| 500 kg | — | 800 | 2 500 | 8 000 | 25 000 | 50 000 | 80 000 | 160 000 | 250 000 |
| 200 kg | — | 300 | 1 000 | 3 000 | 10 000 | 20 000 | 30 000 | 60 000 | 100 000 |
| 100 kg | — | 160 | 500 | 1 600 | 5 000 | 10 000 | 16 000 | 30 000 | 50 000 |
| 50 kg | 25 | 80 | 250 | 800 | 2 500 | 5 000 | 8 000 | 16 000 | 25 000 |
| 20 kg | 10 | 30 | 100 | 300 | 1 000 | — | 3 000 | — | 10 000 |
| 10 kg | 5,0 | 16 | 50 | 160 | 500 | — | 1 600 | — | 5 000 |
| 5 kg | 2,5 | 8,0 | 25 | 80 | 250 | — | 800 | — | 2 500 |
| 2 kg | 1,0 | 3,0 | 10 | 30 | 100 | — | 300 | — | 1 000 |
| 1 kg | 0,5 | 1,6 | 5,0 | 16 | 50 | — | 160 | — | 500 |
| 500 g | 0,25 | 0,8 | 2,5 | 8,0 | 25 | — | 80 | — | 250 |
| 200 g | 0,10 | 0,3 | 1,0 | 3,0 | 10 | — | 30 | — | 100 |
| 100 g | 0,05 | 0,16 | 0,5 | 1,6 | 5,0 | — | 16 | — | 50 |
| 50 g | 0,03 | 0,10 | 0,3 | 1,0 | 3,0 | — | 10 | — | 30 |
| 20 g | 0,025 | 0,08 | 0,25 | 0,8 | 2,5 | — | 8,0 | — | 25 |
| 10 g | 0,020 | 0,06 | 0,20 | 0,6 | 2,0 | — | 6,0 | — | 20 |
| 5 g | 0,016 | 0,05 | 0,16 | 0,5 | 1,6 | — | 5,0 | — | 16 |
| 2 g | 0,012 | 0,04 | 0,12 | 0,4 | 1,2 | — | 4,0 | — | 12 |
| 1 g | 0,010 | 0,03 | 0,10 | 0,3 | 1,0 | — | 3,0 | — | 10 |
| 500 mg | 0,008 | 0,025 | 0,08 | 0,25 | 0,8 | — | 2,5 | — | — |
| 200 mg | 0,006 | 0,020 | 0,06 | 0,20 | 0,6 | — | 2,0 | — | — |
| 100 mg | 0,005 | 0,016 | 0,05 | 0,16 | 0,5 | — | 1,6 | — | — |
| 50 mg | 0,004 | 0,012 | 0,04 | 0,12 | 0,4 | — | — | — | — |
| 20 mg | 0,003 | 0,010 | 0,03 | 0,10 | 0,3 | — | — | — | — |
| 10 mg | 0,003 | 0,008 | 0,025 | 0,08 | 0,25 | — | — | — | — |
| 5 mg | 0,003 | 0,006 | 0,020 | 0,06 | 0,20 | — | — | — | — |
| 2 mg | 0,003 | 0,006 | 0,020 | 0,06 | 0,20 | — | — | — | — |
| 1 mg | 0,003 | 0,006 | 0,020 | 0,06 | 0,20 | — | — | — | — |

- "—" significa que o valor nominal não existe na classe. A R111 proíbe extrapolar.
- **Requisitos associados** (R111 5.2 e 5.3): `U(k=2) ≤ mpe/3` e `|m_c − m_N| ≤ mpe − U`. Para E1 e E2, o usuário deve usar o valor do certificado.
- **Densidade** (R111 Tabela 5, ≥ 100 g):

  | Classe | Faixa de ρ (kg/m³) |
  |---|---|
  | E1 | 7 934–8 067 |
  | E2 | 7 810–8 210 |
  | F1 | 7 390–8 730 |
  | F2 | 6 400–10 700 |
  | M1 | ≥ 4 400 |
  | M1–2 | > 3 000 |
  | M2 | ≥ 2 300 |
  | M2–3 | ≥ 1 500 |
  | M3 | sem limite |

### 6.2 Regra de escolha da classe dos pesos
- **Legal** (R76 3.7.1 / Portaria 157 §2.7.1): os pesos **não podem ter erro maior que 1/3 do EMA** do instrumento para a carga considerada.
  - Usar o EMA mais estrito: OIML inicial / aprovação de modelo.
  - Para pesos E2 ou melhores vale a **incerteza** (e não o erro) ≤ 1/3 do EMA, desde que se use o valor convencional e a estabilidade de longo prazo.
- **Calibração (cg-18 4.3.1):** o mpe ou a incerteza dos pesos deve ser "compatível com d e com as necessidades do cliente". Não há razão fixa.
- **Implementação recomendada** (verificação automática por ponto, com aviso e não bloqueio):
  ```
  pesos usados pelo valor nominal:     Σ mpe_i ≤ EMA_OIML_inicial(L)/3
  pesos usados pelo valor do certific.: Σ U_i(k=2) ≤ EMA_OIML_inicial(L)/3   (e U_i ≤ mpe_i/3)
  ```
- **Classe mínima resultante** (derivada; vale para peças ≥ 100 g, com mpe relativo constante E2 1,6, F1 5, F2 16, M1 50, M2 160, M3 500 mg/kg). A razão `Σmpe/(EMA/3)` é máxima nos limites das faixas: `6·mpe_rel·L1`, `3·mpe_rel·L2` e `2·mpe_rel·n`.

  | Classe da balança | Classe mínima dos pesos |
  |---|---|
  | IIII (n ≤ 1 000) | **M2** (M3 só no limite, com n = 1000) |
  | III, n ≤ 3 125 | **M2** (exemplo: 30 kg / 10 g) |
  | III, 3 125 < n ≤ 10 000 | **M1** (exemplo: 30 kg / 5 g, n = 6000) |
  | II, n ≤ 31 250 | **F2** |
  | II, n ≤ 100 000 | **F1** |
  | I, n ≤ 312 500 | **E2** |
  | I, acima | **E1** (ou E2 com certificado e critério de incerteza) |

---

## 7. Condições ambientais

| Grandeza | Registrar | Limites usuais / referência |
|---|---|---|
| Temperatura do ar | Início e fim (ideal: mínimo / máximo); local do sensor | Estabilidade durante o ensaio (R76 A.4.1.2): variação ≤ 1/5 da faixa de temperatura do instrumento, **sem passar de 5 °C**, e taxa ≤ 5 °C/h. Na prática: classe I ≤ 1 °C, classe II ≤ 3 °C, classes III e IIII ≤ 5 °C. Faixa de funcionamento sem marcação: −10 °C a +40 °C (R76 3.9.2.1; mínimo 5/15/30 °C para I/II/III-IIII) |
| Umidade relativa | Opcional (útil para ρ_a) | cg-18 A2.3: < 40 % → risco eletrostático em alta resolução; > 60 % → corrosão |
| Pressão / altitude | Opcional (necessária para a opção de empuxo 5a) | Sem medição: `u(p) = 10 hPa`; `p(h) = 1013,25·exp(−0,00012·h)` hPa (A2.1-2) |
| Variação de temperatura no local de uso (ΔT) | Informada pelo cliente; usada na 7.1.2-5e e em uso | Default cg-18 A2.2: escritório / laboratório com janelas 17–27 °C; sala sem janelas ΔT ≤ 5 K; galpão aberto −10 a +30 °C (ΔT ≤ 40 K) |
| ΔT peso − ar / aclimatação | Tempo de aclimatação ou ΔT | Só relevante para F1 ou melhor (Tabelas F1.2 e F2.2 da cg-18) |
| Vento, chuva, vibração (rodoviárias) | Descrição | Ver cg-18 H3 ("sem chuva, sem vento") |

- No certificado: declarar as condições "que podem afetar os resultados" (cg-18 §8.2).
- Para a opção de empuxo 5e, declarar o ΔT de uso assumido (H1 e H2 dizem que ele "deve ser apresentado no certificado").

---

## 8. Unidades e arredondamento

1. **Unidades:**
   - g, kg ou t (R76 2.1 e Portaria 157 §2.1 também admitem mg e µg);
   - a mesma unidade em I, m_ref, E e U de cada tabela;
   - vírgula decimal, espaço como separador de milhar (padrão SI / Inmetro).
2. **Incerteza expandida:** **no máximo 2 algarismos significativos** (NIT-DICLA-021 §6.3; GUM 7.2.6; EA-4/02 §6.3).
   - Arredondamento "usual" conforme GUM §7 / ISO 80000-1.
   - O GUM 7.2.6 permite arredondar **para cima**.
   - EA-4/02:1999 §6.3: se o arredondamento **reduzir U em mais de 5 %**, use o valor arredondado para cima. Com 2 algarismos a redução máxima é 0,5/10,5 = 4,8 %, então a regra só atua com 1 algarismo.
3. **Resultado (E, e também I e m_ref se apresentados):** arredondar **na mesma casa decimal do último algarismo significativo de U** (NIT-DICLA-021 §6.3; GUM 7.2.6).
   - Exemplo: E = 4,985 g, U = 7,7 g → **E = 5,0 g**.
   - A CT-11 do Inmetro discutiu apresentar mais casas que a resolução (exemplo: 50,10 °C ± 0,05 °C). É admissível, mas a cg-18 §8.4 recomenda explicar ao cliente como interpretar erros com menos dígitos que d.
4. **Regra do "5" exato:** a ABNT NBR 5891:2014 usa **meio-par** (4,85 → 4,8; 4,55 → 4,6).
   - O `Math.round` e o `toFixed` do JavaScript não implementam isso, e sofrem com binário (9,85 é guardado como 9,8499…).
   - **Use `decimal.js` (ou similar), com `ROUND_HALF_EVEN`**, no passo de apresentação.
   - Mantenha toda a cadeia de cálculo em precisão total. Só arredonde no fim.
5. **k:** apresentar com 2 casas (exemplo: k = 2,14), junto com a frase: "A incerteza expandida… multiplicada pelo fator de abrangência k = 2,14, que para uma distribuição t com ν_eff = 19 graus de liberdade efetivos corresponde a uma probabilidade de abrangência de aproximadamente 95 %" (modelo EA-4/02 §6.2).
6. **Desvio-padrão da repetibilidade:** dizer se é de leitura única ou de média (cg-18 §7.1.1.3, nota).
7. **Advertências obrigatórias no certificado:**
   - "a incerteza vale quando o erro é levado em conta";
   - leituras com resolução aumentada (§2.4);
   - se for o caso, "U é o maior valor da faixa, probabilidade ≥ 95 %".

---

## 9. EXEMPLO NUMÉRICO COMPLETO — balança classe III, Max = 30 kg, d = e = 5 g

> Exemplo construído para este trabalho; a cg-18 não tem um caso de 30 kg. Os números saíram de um script Python que reproduz H2 e H3 da cg-18 (§10). Os valores intermediários aparecem com 4 casas.
> Convenções do exemplo:
> - cg-18 "opção 1" (sem correção de empuxo; instrumento **não** ajustado antes);
> - pesos pelo **valor convencional do certificado**;
> - deriva D = mpe (sem histórico);
> - excentricidade incluída;
> - k pelo quantil t exato com ν_eff truncado.

### 9.1 Dados

**Instrumento:**
- classe III, Max = 30 kg, d = e = 5 g, n = 6000 (dentro da faixa 500–10 000);
- Min = 20e = 100 g;
- receptor retangular, 4 apoios;
- zero automático ligado; não ajustado antes da calibração.

**Pesos M1 com certificado (k = 2):**

| Peça | m_N | δm_c (certificado) | U (k = 2) | mpe M1 | Confere U ≤ mpe/3 e \|δm_c\| ≤ mpe − U? |
|---|---|---|---|---|---|
| 5A | 5 kg | +0,035 g | 0,080 g | 0,250 g | ✓ |
| 5B | 5 kg | −0,020 g | 0,080 g | 0,250 g | ✓ |
| 5C | 5 kg | +0,060 g | 0,080 g | 0,250 g | ✓ |
| 5D | 5 kg | −0,045 g | 0,080 g | 0,250 g | ✓ |
| 10A | 10 kg | +0,120 g | 0,160 g | 0,500 g | ✓ |

**Composição das cargas** (permite carregamento contínuo crescente e decrescente, método 3):

| Carga | Peças |
|---|---|
| 5 kg | 5A |
| 10 kg | 5A+5B |
| 15 kg | 5A+5B+5C |
| 20 kg | 5A+5B+5C+5D |
| 30 kg | 5A+5B+5C+5D+10A |

**Ambiente:**
- t_inicial = 21,0 °C, t_final = 22,5 °C, UR = 55 %, p = 925 hPa (opcional).
- ΔT durante a calibração = 1,5 °C ≤ 5 °C ✓.

**Verificação da classe dos pesos** (§6.2):
- 30 kg: Σmpe = 1,5 g ≤ EMA_OIML(30 kg)/3 = 7,5/3 = 2,5 g ✓.
- 10 kg: 0,5 g ≤ 5/3 = 1,67 g ✓.

### 9.2 Repetibilidade (carga ≈ 15 kg = 5A+5B+5C; 6 aplicações, zero conferido entre elas)

Leituras: 15 000 · 15 005 · 15 000 · 15 000 · 15 005 · 15 000 g
```
Ī = 15 001,6667 g
Σ(I_i − Ī)² = 4·(−1,6667)² + 2·(3,3333)² = 11,1111 + 22,2222 = 33,3333 g²
s = √(33,3333/5) = √6,6667 = 2,5820 g          ν = 5
```

### 9.3 Excentricidade (L_ecc = 10 kg, peça 10A, método 1)

| Posição | 1 centro | 2 frente-esq | 3 trás-esq | 4 trás-dir | 5 frente-dir |
|---|---|---|---|---|---|
| I (g) | 10 000 | 10 005 | 10 000 | 9 995 | 10 005 |
| ΔI = I − I_1 (g) | 0 | +5 | 0 | −5 | +5 |

```
|ΔI_ecc|max = 5 g
u_rel(δI_ecc) = 5 / (2·10 000·√3) = 1,4434×10⁻⁴      →  u(δI_ecc) = 1,4434×10⁻⁴·I
```

### 9.4 Erro de indicação — leituras (método 3: crescente e decrescente contínuos)

| Carga nominal | m_ref = m_N + Σδm_c | I↑ | I↓ | E↑ = I↑ − m_ref | E↓ = I↓ − m_ref |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0,000 | 0,000 |
| 5 kg | 5 000,035 | 5 000 | 5 005 | −0,035 | +4,965 |
| 10 kg | 10 000,015 | 10 005 | 10 005 | +4,985 | +4,985 |
| 15 kg | 15 000,075 | 15 005 | 15 010 | +4,925 | +9,925 |
| 20 kg | 20 000,030 | 20 005 | 20 010 | +4,970 | +9,970 |
| 30 kg | 30 000,150 | 30 010 | 30 010 | +9,850 | +9,850 |

Todos os valores em gramas. Após descarregar, zero = 0 (E_0 = 0).

### 9.5 Componentes comuns
```
u(δI_dig0) = u(δI_digL) = 5/√12 = 1,4434 g            (retangular, ν = ∞)
u(δI_rep)  = s = 2,5820 g                             (normal, ν = 5)
u(δm_c)    = Σ U_i/2         5 kg peça: 0,040 g ; 10 kg peça: 0,080 g        (soma linear)
u(δm_D)    = Σ mpe_i/√3      5 kg peça: 0,1443 g ; 10 kg peça: 0,2887 g      (D = mpe, sem histórico)
u_rel(δm_B) (7.1.2-5d) = (0,1·1,2/8000 + 50×10⁻⁶/4)/√3 = (1,5×10⁻⁵ + 1,25×10⁻⁵)/√3 = 1,5877×10⁻⁵
```

### 9.6 Orçamento por ponto — carga **crescente** (valores em g)

| Grandeza | 0 | 5 kg | 10 kg | 15 kg | 20 kg | 30 kg |
|---|---|---|---|---|---|---|
| m_ref | 0 | 5 000,0350 | 10 000,0150 | 15 000,0750 | 20 000,0300 | 30 000,1500 |
| I | 0 | 5 000 | 10 005 | 15 005 | 20 005 | 30 010 |
| **E** | 0,0000 | −0,0350 | 4,9850 | 4,9250 | 4,9700 | 9,8500 |
| u(δI_dig0) | 1,4434 | 1,4434 | 1,4434 | 1,4434 | 1,4434 | 1,4434 |
| u(δI_digL) | 0 | 1,4434 | 1,4434 | 1,4434 | 1,4434 | 1,4434 |
| u(δI_rep) | 2,5820 | 2,5820 | 2,5820 | 2,5820 | 2,5820 | 2,5820 |
| u(δI_ecc) | 0 | 0,7217 | 1,4441 | 2,1658 | 2,8875 | 4,3316 |
| **u(I)** | 2,9580 | 3,3696 | 3,5943 | 3,9400 | 4,3785 | 5,4402 |
| u(δm_c) | 0 | 0,0400 | 0,0800 | 0,1200 | 0,1600 | 0,2400 |
| u(δm_D) | 0 | 0,1443 | 0,2887 | 0,4330 | 0,5774 | 0,8660 |
| u(δm_B) | 0 | 0,0794 | 0,1588 | 0,2382 | 0,3175 | 0,4763 |
| u(δm_conv) | 0 | 0 | 0 | 0 | 0 | 0 |
| **u(m_ref)** | 0 | 0,1695 | 0,3390 | 0,5085 | 0,6781 | 1,0171 |
| **u(E)** | 2,9580 | 3,3739 | 3,6102 | 3,9727 | 4,4306 | 5,5345 |
| u⁴(E) (g⁴) | 76,562 | 129,570 | 169,877 | 249,090 | 385,360 | 938,216 |
| s⁴/ν = 2,582⁴/5 | 8,8889 | 8,8889 | 8,8889 | 8,8889 | 8,8889 | 8,8889 |
| **ν_eff** | 8,61 → 8 | 14,58 → 14 | 19,11 → 19 | 28,02 → 28 | 43,35 → 43 | 105,5 → 105 |
| **k** (t exato) | 2,3664 | 2,1953 | 2,1405 | 2,0933 | 2,0598 | 2,0241 |
| k (Tab. G.2 conservadora) | 2,37 | 2,20 | 2,14 | 2,11 | 2,06 | 2,025 |
| **U = k·u(E)** (t exato) | 7,0000 | 7,4066 | 7,7277 | 8,3162 | 9,1264 | 11,2023 |
| U (Tab. G.2 conservadora) | 7,0106 | 7,4225 | 7,7259 | 8,3825 | 9,1271 | 11,2073 |
| U com k = 2 fixo (só referência) | 5,9161 | 6,7477 | 7,2204 | 7,9455 | 8,8613 | 11,0689 |

**Conta detalhada do ponto de 10 kg:**
```
u²(I)     = 1,4434² + 1,4434² + 2,5820² + 1,4441² = 2,0833 + 2,0833 + 6,6667 + 2,0855 = 12,9188  → u(I) = 3,5943
u²(m_ref) = 0,0800² + 0,2887² + 0,1588² = 0,0064 + 0,0833 + 0,0252 = 0,1149                    → u(m_ref) = 0,3390
u²(E)     = 12,9188 + 0,1149 = 13,0337                                                         → u(E) = 3,6102
ν_eff     = 3,6102⁴ / (2,5820⁴/5) = 169,877/8,8889 = 19,11 → 19      k = t_0,97725(19) = 2,1405
U         = 2,1405 × 3,6102 = 7,728 g  → U = 7,7 g ;  E = 4,985 → 5,0 g
```

**Carga decrescente:** o orçamento é praticamente idêntico, porque só u(δI_ecc) muda, por I diferir em 5 g.

| Grandeza | 5 kg | 10 kg | 15 kg | 20 kg | 30 kg |
|---|---|---|---|---|---|
| E↓ | 4,9650 | 4,9850 | 9,9250 | 9,9700 | 9,8500 |
| u(E) | 3,3740 | 3,6102 | 3,9731 | 4,4311 | 5,5345 |
| ν_eff | 14 | 19 | 28 | 43 | 105 |
| U | 7,4069 | 7,7277 | 8,3170 | 9,1274 | 11,2023 |

### 9.7 Resultado como iria ao certificado (2 algarismos em U; E na casa de U; NBR 5891)

| Carga | I↑ | E↑ | I↓ | E↓ | U (k) | k | ν_eff |
|---|---|---|---|---|---|---|---|
| 0 g | 0 g | 0,0 g | 0 g | 0,0 g | 7,0 g | 2,37 | 8 |
| 5 kg | 5 000 g | 0,0 g ⁽¹⁾ | 5 005 g | 5,0 g | 7,4 g | 2,20 | 14 |
| 10 kg | 10 005 g | 5,0 g | 10 005 g | 5,0 g | 7,7 g | 2,14 | 19 |
| 15 kg | 15 005 g | 4,9 g | 15 010 g | 9,9 g | 8,3 g ⁽²⁾ | 2,09 | 28 |
| 20 kg | 20 005 g | 5,0 g | 20 010 g | 10,0 g | 9,1 g | 2,06 | 43 |
| 30 kg | 30 010 g | 10 g | 30 010 g | 10 g | 11 g | 2,02 | 105 |

- ⁽¹⁾ −0,035 arredondado para 0,1 dá −0,0. Apresente "0,0", sem sinal negativo.
- ⁽²⁾ Com a convenção conservadora da Tabela G.2: k = 2,11 e U = 8,4 g.
- **Repetibilidade:** s = 2,6 g (leitura única, 6 aplicações a 15 kg).
- **Excentricidade:** |ΔI|max = 5 g a 10 kg.
- **Alternativa aceita pela cg-18:** declarar só "U = 11 g (k = 2,02) para todos os pontos, probabilidade de abrangência ≥ 95 %".

### 9.8 Variante "indicação média + histerese" (opção B do §2.5)

`u(δI_hist) = |I↓ − I↑|/√12`. Em 5, 15 e 20 kg: 5/√12 = 1,4434 g. Em 0, 10 e 30 kg: 0.

| Grandeza | 0 | 5 kg | 10 kg | 15 kg | 20 kg | 30 kg |
|---|---|---|---|---|---|---|
| Ī | 0 | 5 002,5 | 10 005 | 15 007,5 | 20 007,5 | 30 010 |
| E | 0 | 2,4650 | 4,9850 | 7,4250 | 7,4700 | 9,8500 |
| u(δI_hist) | 0 | 1,4434 | 0 | 1,4434 | 1,4434 | 0 |
| u(E) | 2,9580 | 3,6697 | 3,6102 | 4,2270 | 4,6600 | 5,5345 |
| ν_eff | 8 | 20 | 19 | 35 | 53 | 105 |
| k | 2,3664 | 2,1330 | 2,1405 | 2,0740 | 2,0483 | 2,0241 |
| U | 7,0000 | 7,8276 | 7,7277 | 8,7668 | 9,5451 | 11,2023 |
| Certificado | 0,0 ± 7,0 | 2,5 ± 7,8 | 5,0 ± 7,7 | 7,4 ± 8,8 | 7,5 ± 9,5 | 10 ± 11 |

O arredondamento de E = 2,465 na casa de 0,1 dá 2,5, porque o algarismo seguinte é 6 > 5.

### 9.9 Declaração de conformidade (ilustração da §5.4), carga crescente, valores não arredondados

| Carga | m/e | EMA OIML inicial | EMA OIML serviço | EMA BR verificação | EMA BR serviço | \|E\| | U | \|E\|+U |
|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 2,5 | 5 | 5 | 10 | 0,000 | 7,000 | 7,00 |
| 5 kg | 1 000 | 5 | 10 | 10 | 20 | 0,035 | 7,407 | 7,44 |
| 10 kg | 2 000 | 5 | 10 | 10 | 20 | 4,985 | 7,728 | 12,71 |
| 15 kg | 3 000 | 7,5 | 15 | 10 | 20 | 4,925 | 8,316 | 13,24 |
| 20 kg | 4 000 | 7,5 | 15 | 10 | 20 | 4,970 | 9,126 | 14,10 |
| 30 kg | 6 000 | 7,5 | 15 | 10 | 20 | 9,850 | 11,202 | 21,05 |

Valores de EMA, |E|, U e |E|+U em gramas.

- **Aceitação simples** (|E| ≤ EMA):
  - contra OIML inicial: conforme até 20 kg; **não conforme a 30 kg** (9,85 > 7,5). Na série decrescente, 15 kg e 20 kg (E↓ ≈ 9,9 g) também excedem 7,5 g;
  - contra BR verificação: conforme em todos os pontos.
  - Porém U > EMA/3 em todos os pontos, então a pré-condição de incerteza não se cumpre.
- **Banda de guarda w = U:**
  - contra BR serviço: conforme até 20 kg; **não conforme a 30 kg** (21,05 > 20);
  - contra OIML serviço e contra OIML inicial: não conforme já no zero.
- **Conclusão para o produto:** com d = e e sem resolução aumentada, a declaração de conformidade com banda de guarda só é viável contra tolerâncias largas. Ver o alerta da §5.4.

### 9.10 Ilustração da opção 2 de empuxo (densidade do ar medida)
- t = 21,75 °C (média), UR = 55 %, p = 925 hPa → ρ_a = (0,34848·925 − 0,009·55·e^(0,061·21,75))/(294,9) = **1,0867 kg/m³**.
- Pesos de ferro fundido cinzento (ρ = 7100 kg/m³): δm_B = −m_N·(1,0867 − 1,2)·(1/7100 − 1/8000) = **+1,795×10⁻⁶·m_N**, ou seja, +0,054 g a 30 kg.
- É desprezível frente a d = 5 g; a cg-18 aceita omitir.

### 9.11 Incerteza em uso (ilustrativa, §4) — dados de 9.6
- **Ajuste E = a1·R** (pontos 5 a 30 kg, p = 1/u²(E)):
  - a1 = **3,1393×10⁻⁴**; u(a1) = **1,1630×10⁻⁴**;
  - χ²_obs = 0,583 ≤ ν = 4 → modelo consistente.
- **Resíduos** (g):

  | Ponto | Resíduo |
  |---|---|
  | 5 kg | +1,605 |
  | 10 kg | −1,844 |
  | 15 kg | −0,215 |
  | 20 kg | +1,310 |
  | 30 kg | −0,429 |

- **Hipóteses de uso:**
  - instrumento aprovado: K_T = mpe(Max)/(Max·50 K) = 7,5/(30 000·50) = 5×10⁻⁶/K;
  - ΔT de uso = 15 K;
  - sem ajuste antes do uso;
  - ΔE(Max) = mpe(Max) = 7,5 g;
  - tara usada; cargas nem sempre centradas.
- **Termos relativos:**

  | Termo | Valor |
  |---|---|
  | temp | 2,165×10⁻⁵ |
  | buoy | 3,023×10⁻⁶ |
  | adj | 1,443×10⁻⁴ |
  | time (7.4.4-6, 5 g/5 kg/√12) | 2,887×10⁻⁴ |
  | tare | 2,930×10⁻⁴ |
  | ecc (efeito integral) | 2,887×10⁻⁴ |
  | u(a1) | 1,163×10⁻⁴ |

- **Resultados:**
  - `u²(W) = 10,833 g² + 2,8736×10⁻⁷·R²`;
  - U(W=0) = 6,58 g; U(W=Max) = 32,8 g;
  - `U(W) ≈ 6,58 g + 8,75×10⁻⁴·R`;
  - `U_gl(W) ≈ 6,58 g + 1,19×10⁻³·R`.
- **Peso mínimo** (Req = 1 %, SF = 2): R_min = 6,58·2/(0,01 − 1,19×10⁻³·2) = **1 727 g**.
- **Nota:** o termo de "tara" é inflado pela quantização de 5 g nos erros. Esse resultado mostra por que a incerteza em uso depende muito das hipóteses. É mais um motivo para deixá-la fora do certificado.

### 9.12 Vetor de teste (JSON, ponto decimal)
```json
{
  "instrumento": {"classe": "III", "Max_g": 30000, "d_g": 5, "e_g": 5, "d0_g": 5, "ajustadoAntes": false},
  "opcoes": {"empuxo": "5d", "deriva": "mpe", "excentricidade": true, "k": "t_exato_nu_truncado"},
  "repetibilidade": {"leituras_g": [15000, 15005, 15000, 15000, 15005, 15000], "s_g": 2.581989, "nu": 5},
  "excentricidade": {"Lecc_g": 10000, "leituras_g": [10000, 10005, 10000, 9995, 10005], "dImax_g": 5},
  "pesos": {"5A": [5000, 0.035, 0.080, 0.250], "5B": [5000, -0.020, 0.080, 0.250], "5C": [5000, 0.060, 0.080, 0.250],
            "5D": [5000, -0.045, 0.080, 0.250], "10A": [10000, 0.120, 0.160, 0.500]},
  "esperado_crescente": [
    {"mN": 0,     "I": 0,     "mref": 0,         "E": 0,      "uI": 2.95804, "umref": 0,       "uE": 2.95804, "nu": 8.613,  "k": 2.36642, "U": 6.99996},
    {"mN": 5000,  "I": 5000,  "mref": 5000.035,  "E": -0.035, "uI": 3.36959, "umref": 0.16952, "uE": 3.37386, "nu": 14.577, "k": 2.19529, "U": 7.40660},
    {"mN": 10000, "I": 10005, "mref": 10000.015, "E": 4.985,  "uI": 3.59427, "umref": 0.33903, "uE": 3.61022, "nu": 19.111, "k": 2.14050, "U": 7.72766},
    {"mN": 15000, "I": 15005, "mref": 15000.075, "E": 4.925,  "uI": 3.94005, "umref": 0.50855, "uE": 3.97273, "nu": 28.023, "k": 2.09333, "U": 8.31623},
    {"mN": 20000, "I": 20005, "mref": 20000.030, "E": 4.970,  "uI": 4.37845, "umref": 0.67806, "uE": 4.43064, "nu": 43.353, "k": 2.05983, "U": 9.12639},
    {"mN": 30000, "I": 30010, "mref": 30000.150, "E": 9.850,  "uI": 5.44021, "umref": 1.01709, "uE": 5.53447, "nu": 105.549,"k": 2.02409, "U": 11.20227}
  ],
  "tolerancia_sugerida": "relativa 1e-4 em u e U; k com 1e-3"
}
```

---

## 10. Vetores de validação extraídos da cg-18 v4.0 (Apêndice H)

### 10.1 H2 — 60 kg multi-intervalo (12/30/60 kg; d = 2/5/10 g), pesos F2, situação A (não ajustado), opção 1 (5d)

**Entradas:**
- repetibilidade a 10 kg: 9 998, 10 000, 9 998, 10 000, 10 000 g → s = 1,095 g (ν = 4), usada no intervalo 1;
- repetibilidade a 25 kg: 24 995, 25 000, 24 995, 24 995, 25 000 g → s = 2,739 g, usada nos intervalos 2 e 3;
- excentricidade: |ΔI|max = 5 g com L_ecc = 20 kg;
- d0 = 2 g;
- pesos pelo nominal: u(δm_c) = mpe/√3; deriva D = mpe/2.

**Saídas publicadas:**

| Carga (g) | 0 | 10 000 | 20 000 | 40 000 | 60 000 |
|---|---|---|---|---|---|
| I (g) | 0 | 10 000 | 19 995 | 39 990 | 59 990 |
| E (g) | 0 | 0 | −5 | −10 | −10 |
| u(δI_digL) | 0 | 0,577 | 1,443 | 2,887 | 2,887 |
| u(δI_ecc) | 0 | 0,722 | 1,443 | 2,887 | 4,330 |
| u(I) | 1,238 | 1,545 | 3,464 | 4,950 | 5,909 |
| u(δm_c) | 0 | 0,092 | 0,173 | 0,346 | 0,554 |
| u(δm_D) | 0 | 0,046 | 0,087 | 0,173 | 0,277 |
| u(δm_B) (5d) | 0 | 0,110 | 0,217 | 0,433 | 0,658 |
| u(m_ref) | 0 | 0,151 | 0,290 | 0,581 | 0,904 |
| u(E) | 1,238 | 1,552 | 3,476 | 4,984 | 5,978 |
| ν_eff | 6 | 16 | 10 | 43 | 90 |
| k | 2,52 | 2,17 | 2,28 | 2,06 | 2,05 |
| U (g) | 3,120 | 3,369 | 7,926 | 10,266 | 12,254 |

**Resultado da minha implementação:**
- Bate em todos os valores das colunas 0 a 40 kg.
- **[ATENÇÃO] coluna de 60 kg:** a cg-18 usa mpe relativo de 16 mg/kg para os 3 × 20 kg F2 (Σmpe = 960 mg). A Tabela 1 da R111 dá 300 mg por 20 kg (Σ = 900 mg). Com a R111: u(δm_c) = 0,520, u(δm_D) = 0,260, u(δm_B) = 0,650 e u(E) = 5,973. A diferença em U é de 0,1 %.
- **k:** H2 usa a convenção conservadora (ν = 90 → 2,05). O t exato daria 2,028.
- **Situação B do H2** (ajustado antes, 5c, s = 0,894 e 2,236): u(δm_B) a 10 kg = 0,023; ν = 8 / 25 / 14 / 78 / 172; k = 2,37 / 2,11 / 2,20 / 2,05 / 2,025; U = 2,523 / 2,983 / 6,795 / 9,650 / 11,601.

### 10.2 H3 — rodoviária 30 000 kg, d = 10 kg (testes com d_T = 1 kg), substituição, situação A

**Entradas:**
- s = 6,74 kg (6 leituras, ν = 5);
- |ΔI_ecc|max = 15 kg com L_ecc ≈ 10 420 kg;
- E_0 = 4 kg, usado em `u_rel(δI_time) = 4/(30 000·√3)`;
- pesos: 10 × 1000 kg M1 (mpe 50 g), u(δm_c) = u(δm_D) = 50/√3 g por peça; empuxo 5d.

**Saídas publicadas (kg):**

| Carga total | 0 | 5 000 | 10 000 (m_ref) | 15 000 | 20 000 | 25 010 | 30 010 |
|---|---|---|---|---|---|---|---|
| I | 0 | 5 002 | 10 010 | 15 015 | 20 018 | 25 035 | 30 040 |
| E | 0 | 2 | 10 | 15 | 18 | 25 | 30 |
| u(I) | 6,75 | 7,08 | 7,97 | 9,27 | 10,82 | 12,54 | 14,38 |
| u(m_ref) | 0 | 0,22 | 0,44 | 0,22 | 0,44 | 0,22 | 0,44 |
| u(L_sub) | 0 | 0 | 0 | 11,28 | 11,28 | 19,02 | 19,02 |
| u(E) | 6,75 | 7,08 | 7,98 | 14,60 | 15,64 | 22,79 | 23,85 |
| ν_eff | 5 | 6 | 9 | 109 | 144 | 653 | 783 |
| k | 2,65 | 2,52 | 2,32 | 2,02 | 2,02 | 2,00 | 2,00 |
| U | 18 | 18 | 19 | 29 | 32 | 46 | 48 |

**Fórmulas conferidas:**
```
u(L_sub1) = √(u²(m_ref) + 2·u²(I(10 010)))            = √(0,44² + 2·7,97²)            = 11,28 ✓
u(L_sub1+L_sub2) = √((2·u(m_ref))² + 2·(u²(I_1)+u²(I_2))) = √(0,88² + 2·(7,97² + 10,82²)) = 19,02 ✓
u(E) a 15 000 = √(u²(I) + u²(m_ref,½) + u²(L_sub1)) = √(9,27² + 0,22² + 11,28²) = 14,60 ✓
ν_eff a 15 000 = 14,60⁴/(6,74⁴/5) = 110 (publicado: 109)
```
- Neste exemplo, ν_eff considera só a repetibilidade direta (§2.7).
- Minha implementação reproduz todos os u(E). A t exato, U = 29,5 / 31,5 / 45,7 / 47,8; a diferença para o publicado é só de arredondamento de k.

### 10.3 H1 — 220 g, d = 0,1 mg, pesos E2 (valores do certificado), situação A, opção 1 (parcial)
- s = 0,000 114 g (5 leituras); |ΔI|max = 0,2 mg a 100 g; deriva k_D = 1,25.
- Pontos 50 g e 100 g:
  - u(δm_c) = 0,000 015 g e 0,000 025 g;
  - u(δm_D) = 0,000 022 g e 0,000 036 g;
  - u(δm_B) (5d) = 0,000 447 g e 0,000 889 g;
  - u(E) = 0,000 465 g e 0,000 900 g;
  - U = 0,000 93 g e 0,001 80 g (k = 2,00).
- Zero: u(E) = 0,000 118 g, ν = 4, k = 2,87, U = 0,000 34 g.
- É útil para testar o empuxo 5d com pesos pequenos e a deriva com k_D.

### 10.4 Inconsistências encontradas na cg-18 (para não "corrigir" o software errado)
1. H2, coluna de 60 kg: mpe relativo de 16 mg/kg em vez dos valores da R111 (§10.1).
2. H1 e H2: a densidade do ar informada (1,173 kg/m³ a 990 hPa, 21 °C, 50 %) não bate com a fórmula A1.1-1 da própria guia, que dá **1,167 kg/m³**. O valor publicado corresponde a ar seco. O mesmo ocorre em H2/B (1,165 publicado contra 1,159 pela fórmula). O efeito é nulo nos resultados, porque a correção de empuxo é desprezível.
3. H4: o vetor `e` da Tabela H4.1 difere dos erros das tabelas anteriores (por exemplo, 0,213 contra 0,113 a 100 g). **Não use o H4 como vetor de teste estrito.**
4. k nos exemplos: H2 usa a tabela conservadora; H3 parece usar t exato (ν = 653 → 2,00). Por isso a tolerância dos testes deve ser definida por convenção.

---

## 11. Recomendações para o sistema

**Ensaios a suportar:**

| Ensaio | Prioridade | Observação |
|---|---|---|
| Repetibilidade (1 ou mais cargas, n ≥ 5 ou ≥ 3 se ≥ 100 kg) | Obrigatório | Alertar se n < 10 (k > 2); opção de piso de s (0,41·d) configurável |
| Excentricidade (métodos 1–4; layouts: retangular, circular, n apoios, rolante / rodoviária, tanque; "N/A" para gancho) | Obrigatório (exceto gancho / tanque) | Calcular `\|ΔI\|max/L_ecc` e usar o maior relativo |
| Erro de indicação (≥ 5 pontos; métodos 1–4; ↑ e ↓) | Obrigatório | Sugerir automaticamente pontos 0 / 25 / 50 / 75 / 100 % e as mudanças de EMA (500e e 2000e na classe III) |
| Histerese (derivada de ↑ / ↓) e retorno a zero | Opcional | Opção A (E↑ e E↓ separados) como padrão; opção B (média + histerese) |
| Mobilidade / discriminação (1,4·d em Min, ½Max, Max) | Opcional | Aprovado / reprovado |
| Cargas de substituição (cadeia `L_Tn,k`) | Necessário para rodoviárias | Guardar cada `I(m_ref)` e `I(L_sub)`; fórmulas 7.1.2-15a/b; termo de fluência `E_0`; empuxo das cargas de baixa densidade |
| Resolução aumentada (modo serviço d_T, ponto de mudança) | Opcional | Gera aviso no certificado |
| Multi-intervalo / múltiplas faixas | Desejável | d_I por intervalo; s por intervalo |
| Incerteza em uso / peso mínimo | Fase 2 | Anexo separado |
| Declaração de conformidade | Opcional | Escolha da tabela de EMA e da regra de decisão; aviso "não substitui a verificação legal" |

**Parâmetros a expor e gravar em cada certificado:**
- empuxo (`nenhum | 5c | 5d | 5e | 5a com ρ_a medido`);
- deriva (`mpe | k_D·U | histórico`);
- excentricidade no orçamento (sim / não);
- d0 (`d/√12 | d/(4√3)` para instrumento aprovado);
- método de k (`t exato | G.2 conservadora | k = 2`);
- regra de arredondamento (`meio-par | meio-para-cima | U sempre para cima`);
- tabela de EMA;
- regra de decisão.

**Testes unitários mínimos:**
1. t-quantil 95,45 % contra a Tabela G.2 (ν = 1…50, 100).
2. Exemplo de 30 kg (§9.12).
3. H2/A colunas 0–40 kg (tolerância de 0,1 %).
4. H3/A, incluindo `u(L_sub)` = 11,28 e 19,02.
5. Arredondamento:
   - (E = 4,985; U = 7,7277) → (5,0; 7,7);
   - (9,85; 11,2023) → (10; 11);
   - meio-par 4,85 → 4,8 e 4,55 → 4,6;
   - −0,035 com U = 7,4 → "0,0".
6. EMA:
   - classe III, e = 5 g: 2,5 kg → 2,5 g; 2,505 kg → 5 g; 10 kg → 5 g; 10,005 kg → 7,5 g;
   - multi-intervalo do exemplo R76.
7. Escolha da classe dos pesos (M1 para n = 6000; M2 para n = 3000).

---

## 12. Pendências e pontos não confirmados
1. **Portaria 157/2022, Tabela 5, 3ª linha da coluna "Verificação" (±2,0e):** possível erro de digitação; conferir no DOU ou no Inmetro.
2. **Documento Cgcre / DOQ específico para calibração de IPNA:** não encontrado. Também falta conferir a redação vigente da NIT-DICLA-021 (usei o §6.3 citado em ata de 2012).
3. **Texto original da ILAC-G8:09/2019 e da ILAC P14:09/2020:** não lidos diretamente. Usei o UKAS LAB 48 ed. 5 e a EA-4/02.
4. **Regra dos 5 % de arredondamento:** confirmada na EA-4/02:1999 §6.3. Não confirmei se continua na ILAC P14:09/2020. É irrelevante com 2 algarismos significativos.
5. **Piso s ≥ 0,41·d (USP <41>):** confirmado só em fontes secundárias (Mettler-Toledo, A&D, Rice Lake).
6. **Guia SIM MWG7/cg-01:** não obtido. Fritsch (IMEKO 2017) afirma que o SIM adotou a cg-18.

---

## 13. Fontes

**Primárias:**
- EURAMET Calibration Guide No. 18, v4.0 (11/2015), "Guidelines on the Calibration of Non-Automatic Weighing Instruments" (cópia NIST): https://www.nist.gov/document/i-cal-gui-018calibrationguideno18webpdf
  - Cópia INRiM: https://iris.inrim.it/handle/11696/72070
  - Tradução espanhola (CEM): https://www.cem.es/sites/default/files/euramet_cg-18_calibracionipfna.pdf
- EURAMET, projeto de revisão da cg-18 (concluído em 01/11/2015): https://www.euramet.org/technical-committees/tc-projects/details/project/review-of-euramet-calibration-guideline-no-18-guidelines-on-the-calibration-of-non-automatic-weighing-instruments
- OIML R 76-1:2006 (E), Non-automatic weighing instruments, Part 1: https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf
- OIML R 111-1:2004 (E), Weights of classes E1…M3: https://www.oiml.org/en/files/pdf_r/r111-1-e04.pdf
- Portaria Inmetro nº 157, de 31/03/2022 (RTM de IPNA): https://sibapem.com.br/wp-content/uploads/2023/01/Portaria-157-2022.pdf
- Portaria Inmetro nº 236/1994 (revogada; para comparação): https://sibapem.com.br/wp-content/uploads/2022/12/Portaria-236-1994.pdf
- Portaria Inmetro nº 246/2026, Agenda Regulatória Dimel 2026-2027: https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/agenda-regulatoria/RTAC003139.pdf
- JCGM 100:2008 (GUM), §7.2.6, Anexo G e Tabela G.2: https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf
- EA-4/02 M:2022 (tradução CAI, Tabela E.1, truncamento de ν_eff): https://www.cai.cz/wp-content/uploads/2025/11/01_08-P001-EA-04_02-M_2022_20220425o.pdf
- EA-4/02 (1999), §6.3 (2 algarismos; regra dos 5 %): https://www.isobudgets.com/pdf/documents/05_EA_4-02.pdf
- Ata da CT-11 Inmetro (abr/2012), que reproduz a NIT-DICLA-021 §6.3: https://www.gov.br/inmetro/pt-br/centrais-de-conteudo/publicacoes/ata-reuniao-ct11-abr2012.pdf
- UKAS LAB 48 ed. 5, "Decision rules and statements of conformity" (aplica a ILAC-G8:09/2019): https://ukas.com/wp-content/uploads/2023/05/LAB-48-Decision-rules-and-statements-of-conformity.pdf

**Complementares:**
- INM (Colômbia, 2025), "Guía para la calibración de IPFNA de alta capacidad" (excentricidade em rodoviárias, substituição): https://inm.gov.co/wp-content/uploads/2025/08/Guia-para-la-calibracion-de-instrumentos-de-pesaje-de-funcionamiento-no-automatico-de-alta-capacidad.pdf
- K. Fritsch et al., IMEKO TC3 2017, "EURAMET cg-18 – a practical approach…" (adoção pelo SIM; peso mínimo): https://imeko.org/publications/tc3-2017/IMEKO-TC3-2017-008.pdf
- Acta IMEKO (2019), "EURAMET cg-18 – state-of-the-art calibration guideline for NAWI": https://acta.imeko.org/index.php/acta-imeko/article/view/IMEKO-ACTA-08%20%282019%29-03-03
- NMI Austrália, consulta sobre a revisão da OIML R76 (1.1 CD): https://consult.industry.gov.au/non-automatic-weighing-instruments-oiml-r-76-revision-of-the-first-committee-draft
- Sartorius, implementação da cg-18: https://www.sartorius.com/en/products/weighing/lab-weighing-resources/calibration-guideline-euramet-cg-18-specifications-options-and-implementation-of-the-guideline-by-sartorius
- USP <41>, piso de 0,41·d (fontes secundárias):
  - Mettler-Toledo: https://www.mt.com/dam/SIPharmaEvent/How%20to%20Comply%20with%20the%20new%20USP41%20Standard.pdf
  - A&D: https://www.aandd.jp/support/materials/usp_balances.pdf
- ABNT NBR 5891:2014, regras de arredondamento (meio-par; ficha da norma): https://normas.com.br/visualizar/abnt-nbr-nm/5276/abnt-nbr5891-regras-de-arredondamento-na-numeracao-decimal
