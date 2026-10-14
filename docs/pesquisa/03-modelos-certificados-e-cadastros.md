# Pesquisa 03: modelos de certificado de calibração de balanças, cadastros e funcionalidades

> **Projeto:** sistema de emissão de certificados de calibração de balanças, **não RBC**, da Balanças.com (Rio Claro/SP)
> **Data da pesquisa:** 14/10/2026
> **Escopo:**
> 1. Certificados reais publicados na internet.
> 2. Cadastro da balança.
> 3. Cadastro dos padrões e dos instrumentos auxiliares.
> 4. Cadastro do cliente.
> 5. Softwares de gestão de calibração.
> 6. Numeração dos certificados.

---

## Sumário

0. [Resumo executivo](#0-resumo-executivo)
1. [Como a pesquisa foi feita e limitações](#1-como-a-pesquisa-foi-feita-e-limitações)
2. [Exemplos reais analisados](#2-exemplos-reais-analisados)
3. [Síntese: o que todos têm e o que distingue os bons](#3-síntese-o-que-todos-têm-e-o-que-distingue-os-bons)
4. [Requisitos normativos que orientam o conteúdo](#4-requisitos-normativos-que-orientam-o-conteúdo)
5. [Proposta de layout do certificado (página a página)](#5-proposta-de-layout-do-certificado-página-a-página)
6. [Cadastro do instrumento (balança)](#6-cadastro-do-instrumento-balança)
7. [Cadastro dos padrões (pesos, jogos, termo-higrômetro, barômetro)](#7-cadastro-dos-padrões)
8. [Cadastro do cliente](#8-cadastro-do-cliente)
9. [Softwares de gestão de calibração no mercado](#9-softwares-de-gestão-de-calibração-no-mercado)
10. [Funcionalidades priorizadas para o sistema](#10-funcionalidades-priorizadas-para-o-sistema)
11. [Numeração do certificado](#11-numeração-do-certificado)
12. [Decisões recomendadas e questões em aberto](#12-decisões-recomendadas-e-questões-em-aberto)
13. [Referências](#13-referências)

---

## 0. Resumo executivo

**Exemplos reais analisados**

- Foram analisados **6 certificados de calibração de balanças**:
  - 3 brasileiros:
    - RBC de bancada: Pensu Exactu, CAL 0383;
    - RBC de balança rodoviária: Sannar, CAL 0767;
    - **não RBC**: Metrotec.
  - 1 modelo didático brasileiro: UFSC, DG-METEQ-CAL-006.
  - 2 de balanças rodoviárias acreditadas em outros países: MOP do Chile e Sigma da Colômbia.
- Também foram analisados:
  - **1 certificado de pesos-padrão** (Unical, CAL 0529);
  - 2 certificados de outros instrumentos, aproveitados só pelo layout e pelo processo;
  - 1 edital público que lista o que o comprador exige (CETESB).

**O que todos os certificados têm**

- Título e número único.
- Laboratório, cliente e identificação da balança: fabricante, modelo, série, TAG, faixa e resolução.
- Datas de calibração e de emissão.
- Local da calibração e procedimento.
- Padrões com nº do certificado e validade.
- Temperatura e umidade.
- Tabela de resultados com valor de referência, indicação, erro, U e k.
- Nota de incerteza: k para cerca de 95 %, conforme GUM ou EA-4/02.
- Avisos: o resultado vale só para o item calibrado e a reprodução só pode ser integral.
- Assinatura.
- Formato **A4 retrato**.

**O que distingue os bons**

- Resultados **antes e depois do ajuste**.
- **Excentricidade com diagrama de posições** e um valor por posição.
- **Repetibilidade** com desvio-padrão.
- **k e νeff por ponto**.
- **Gráfico de erro × carga** com barras de U.
- Declaração de conformidade com **regra de decisão** explícita, comparando erro + U com o EMA.
- **Assinatura eletrônica com QR code, URL de validação e hash SHA-256**.
- "Nº de páginas incluindo anexos" e marca de **"fim do certificado"**.
- Separação clara das **informações fornecidas pelo cliente**.
- Evidência de **dupla checagem**: duas assinaturas, ou as iniciais de quem elaborou, revisou e aprovou.

**Erros encontrados, que o sistema deve impedir**

- Linhas `#VALOR!` impressas, herdadas de planilha Excel.
- Seção com título errado.
- Incerteza menor que a resolução da balança.
- Notação científica nos resultados.
- Excentricidade informada como um único número, sem carga nem posições.
- Quase nenhum certificado informa **e, classe, Min ou portaria de aprovação de modelo**. É uma oportunidade de diferenciação.

**Layout proposto**

- Três páginas no caso geral:
  1. Identificação e rastreabilidade;
  2. Resultados e gráfico;
  3. Declarações, assinaturas e QR.
- Uma variante compacta de duas páginas para balanças simples (ver §5).

**Cadastros**

- O cadastro da balança deve separar **indicador / receptor de carga / células** e suportar **multifaixa**.
- Deve guardar a **portaria de aprovação de modelo (PAM)** de forma estruturada: órgão, número e ano.
- Os padrões são cadastrados **peso a peso**. O jogo é um agrupamento, e os certificados ficam em histórico, o que permite calcular a deriva.

**Funcionalidades essenciais**

- Cálculo automático com arredondamento pela resolução.
- Bloqueio de padrões vencidos.
- Fluxo rascunho → em revisão → emitido, com aprovador diferente do executor.
- Numeração atribuída só na emissão.
- Revisão e cancelamento conforme a ISO/IEC 17025, item 7.8.8.
- QR code com página pública de verificação.
- Envio por e-mail.
- Controle de vencimento com lembrete ao cliente.
- Histórico do instrumento.

Portal do cliente, gráficos de tendência e aplicativo offline ficam para a fase 2.

**Numeração recomendada**

- Formato `CC-AAAA-NNNNN`, por exemplo `CC-2026-00123`, gerado **na emissão**.
- Sequência anual, sem reuso de números.
- Revisões com o sufixo `-R1`, que referencia o original.
- Para o QR code, um **código de verificação aleatório** e separado do número, para evitar enumeração.

---

## 1. Como a pesquisa foi feita e limitações

**Método**

- Buscas na web com WebSearch, em modo padrão e estendido, em português e espanhol.
- Termos usados: "certificado de calibração balança pdf", "balança rodoviária", "não RBC", "excentricidade repetibilidade incerteza expandida", "CAL 0222", nomes de fabricantes e de softwares.
- Os PDFs encontrados foram baixados com `curl` e extraídos com `pdftotext -layout`.
- As páginas foram renderizadas em imagem com `pdftoppm` para conferir layout, cores, QR code e assinaturas.

**Onde há certificados reais publicados**

Portais de transparência brasileiros raramente publicam o PDF pesquisável. Os certificados aparecem em:

- anexos de EIA/RIMA, como o IEMA-ES;
- relatórios de fiscalização de contrato, como o do Consórcio CICA-PR;
- sites de empresas que publicam os próprios certificados como prova de rastreabilidade (Pensu Exactu, FG Balanças);
- portais de governo de outros países: MOP do Chile, Supertransporte e IDU da Colômbia;
- documentos orientativos: UFSC e Cgcre.

**Limitações**

- Bloquearam o acesso automatizado: Scribd (certificado "BA005" CER18861/25), PDFCoffee, as páginas da Mettler Toledo (explicação do certificado ACC e certificados de exemplo) e o UNFCCC, onde há certificados da Toledo do Brasil de 2008, em inglês.
- Toledo do Brasil, Marte, Filizola, Urano, Ramuza e Shimadzu **não publicam um certificado de exemplo**. Só descrevem o serviço: Toledo é CAL 0222 em São Bernardo do Campo e CAL 0658 em Lauro de Freitas, e a Marte tem o "Portal Marte Certificados".
- As Tabelas 3 e 5 da Portaria Inmetro 157/2022 (classes e EMA) estão em imagem no PDF. Os valores do §6.5 vêm da OIML R76-1, que o RTM reproduz, e foram conferidos com o certificado chileno. **Conferir com o texto oficial antes de codificar.**
- Os certificados citados têm dados de clientes reais. Aqui se reproduz **apenas a estrutura**.

---

## 2. Exemplos reais analisados

### 2.1 Exemplo A: Pensu Exactu, laboratório RBC CAL 0383, balança eletrônica 0–5 kg, 1 página

- **URL:** https://pensuexactu.com.br/cert/EPE049.pdf
- **Origem:** certificado nº **39059.50** de uma balança Weightech WT3000-1, d = 0,0005 kg. É publicado pela própria empresa como rastreabilidade dos seus padrões. O PDF foi gerado no Excel e está datado de 06/07/26.

**Cabeçalho**

- Logo à esquerda.
- Título centralizado: "CERTIFICADO DE CALIBRAÇÃO N.º 39059.50".
- Frase de acreditação: "Laboratório de calibração acreditado pela Cgcre de acordo com a ABNT NBR ISO/IEC 17025, sob o N.º CAL0383".
- Símbolo Cgcre/RBC no canto superior direito.

**Blocos de identificação** (lista "rótulo: valor" em duas colunas)

- Instrumento.
- Solicitante e endereço.
- Interessado e endereço.
- Fabricante, modelo e nº de série.
- **Código**: a TAG do cliente.
- Faixa de medição e resolução.
- **Local de calibração** e **Local de instalação**.
- Nº do processo.
- Data de entrada, data de calibração e data de emissão.

**Procedimento**

- "PET-029 Rev.09, em três ciclos de medição pelo método da comparação direta a padrões calibrados pela RBC".

**Rastreabilidade** (tabela)

- Colunas: Padrão | Nº do Certificado (com o CAL do laboratório calibrador) | Validade (MM/AA).
- Linhas: conjunto de pesos, termo-higrômetro e barômetro.

**Condições ambientais**

- Temperatura (20,3 ± 2) °C, umidade (58 ± 5) % e pressão (912 ± 8) mbar.

**Tabela de resultados**

- Colunas exatas: `Valor Indicado (kg) | VR (kg) | EM (kg) | Desvio Padrão da Repetitividade (kg) | Incerteza da Medição (kg) | k`.
- 6 pontos, de 0,5 a 5 kg, com k = 2,00 em todos.
- **Não informa νeff.**

**Repetibilidade**

- Aparece como coluna de desvio-padrão por ponto.
- O texto justifica: "informado para análise da verificação intermediária ... conforme DOQ-CGCRE-036".

**Excentricidade**

- Um único valor: "Excentricidade: 0,001 kg". Não há carga nem posições.

**Observações**

- Nota de incerteza: k para cerca de 95 %, conforme EA-4/02.
- Declaração de acreditação.
- Definições: VR = valor de referência; EM = erro médio.
- Aviso em caixa: "válido exclusivamente para objeto calibrado ... não é permitida a reprodução parcial".

**Assinatura, QR code e numeração**

- Uma assinatura: nome sobre a linha, "Signatário Autorizado".
- Sem QR code.
- Número = nº do processo (39059) + sufixo (.50).
- Paginação "Pág. 1/1".
- Rodapé com o código do formulário: "PEF 035 / REV. 07 Apr. Out/22".

**Layout**

- A4 retrato, 1 página, preto e cinza. O logo e a linha de endereço do rodapé são azuis.

**Lição**

- O PDF imprime **9 linhas com `#VALOR!`**, erros da planilha, na tabela de resultados.
- O sistema nunca deve imprimir linhas vazias ou com erro.

### 2.2 Exemplo B: Sannar Balanças, RBC CAL 0767, **balança rodoviária** Weightech 0–100 t, d = 20 kg, 2 páginas

- **URL:** https://consorciocica.com.br/uploads/pagina/arquivos/Relatoriodefiscalizacao-SACjunho2024assinado.pdf
- **Origem:** o certificado **RBC677/2023** está nas páginas 7 e 8, anexo ao relatório de fiscalização de um consórcio intermunicipal sobre o contrato de um aterro.

**Cabeçalho** (repetido nas duas páginas)

- Logo à esquerda.
- "CERTIFICADO DE CALIBRAÇÃO N° RBC677/2023".
- Símbolo Cgcre com "CAL 0767" à direita.

**Seções** (numeradas, com faixa bege nos títulos)

1. **Dados do Cliente:**
   - cliente, endereço, cidade, estado;
   - responsável, CNPJ e **OS**.
2. **Informações Técnicas**, em duas linhas de tabela:
   - linha 1: `Tipo de Balança | Marca | Modelo | Número de Série | Faixa do Equipamento | Resolução | Unidade`;
   - linha 2: `Local da Calibração | Etiqueta Nº Inmetro | TAG | Tipo de Plataforma`.
3. **Condições Ambientais:**
   - temperatura 26,0 °C ± 2,5 °C;
   - UR 90 % ± 3 %;
   - pressão 1.020 hPa ± 5;
   - **massa específica do ar: 1,17 kg/m³**;
   - tabela do termo-baro-higrômetro com as colunas `Código | Descrição | Certificado | Data de Calibração | Validade`.
4. **Padrões de Referência:**
   - mesmas colunas;
   - exemplo de linha: "SN 01 ao SN 22 e SN 51 / Jogo de Pesos Padrão / 01122 / 08/2022 / 08/2024".
5. **Ensaio de Excentricidade:**
   - "Valor Aplicado: 22100 kg";
   - tabela `Pontos | Erros Antes do Ajuste | Resultados`, com 6 pontos;
   - **desenhos das posições** para "Plataforma Retangular ou Quadrada", "Plataforma Redonda" e "Plataforma Rodoviária", esta última com os pontos ao longo do comprimento.
6. **Ensaio de Repetibilidade.** Na prática, a seção contém outra coisa:
   - o bloco "RESULTADOS OBTIDOS ANTES DO AJUSTE: Não foi realizado ajuste na balança";
   - a tabela "Calibração – Resultados Obtidos", com as colunas exatas `Valor de Referência | Média das Leituras | Erro de Indicação | Incerteza Expandida | Veff | k`;
   - 8 pontos, de 500 a 22 000 kg, com U = 20 kg, Veff = ∞ e k = 2,00;
   - "Número de Leituras 3 / Número de Pontos Calibrados 8".
7. **Observações** (7 notas):
   - calibração feita nas instalações do cliente;
   - **cópia arquivada por cinco anos**;
   - uso publicitário só com autorização;
   - nota de incerteza: Veff, 95,45 %, EA-4/02;
   - atende à NBR ISO/IEC 17025:2017;
   - método de comparação direta, PR-7.2 Rev.05;
   - **"Esta calibração não isenta a balança do controle estabelecido pela Regulamentação Metrológica"**;
   - **"O ajuste do equipamento ... não faz parte do escopo acreditado"**.

**Assinatura**

- Assinatura manuscrita digitalizada, com o rótulo "Aprovação".
- Ao lado: "Data da Calibração" e "Data da emissão".

**Rodapé**

- "Código: RE-7.2B Rev.: 02 Ref.: PR-7.2 Página 1 de 2".
- Frase de acreditação e endereço.

**QR code:** não tem.

**Numeração**

- O prefixo "RBC" sugere uma série separada para os certificados não acreditados.
- A OS é um campo à parte.

**Layout:** A4 retrato. Logo vermelho e cinza, faixas de seção bege e tabelas com bordas.

**Pontos fortes**

- Diagramas de posição por tipo de plataforma.
- Densidade do ar.
- Bloco "antes do ajuste".
- Notas legais.

**Pontos fracos**

- A seção "Repetibilidade" não traz o desvio-padrão.
- Na excentricidade, todos os pontos aparecem como "0 kg", sem as indicações.
- U igual a d em todos os pontos.

### 2.3 Exemplo C: Metrotec, **não RBC ("rastreável")**, balança Ohaus ARC120BR de 3,1 kg, 2 páginas

- **URL:** https://www.metrotec.com.br/modelo-de-certificado-de-calibracao-balanca
- **Arquivos:** imagens `wp-content/uploads/2021/09/bal1-scaled.jpg` e `bal2-scaled.jpg`.

**Cabeçalho** (repetido)

- Logo, razão social, endereço, site e telefone.
- "Página: 1/2".
- Título grande: "CERTIFICADO DE CALIBRAÇÃO No. 51996/21".
- "Data da Calibração".
- "Solicitante" com endereço e "LOCAL DA REALIZAÇÃO DA CALIBRAÇÃO".

**Seções numeradas** (títulos em caixa alta com sublinhado)

1. **Característica do instrumento calibrado:** descrição, marca, modelo, nº de série ("N/C").
2. **INFORMAÇÕES FORNECIDAS PELO CLIENTE:**
   - identificação do instrumento (BAL-001);
   - setor e usuário;
   - **periodicidade (360)** e **validade da calibração (09/2022)**.
3. **Condições ambientais:** temperatura e umidade.
4. **Procedimento interno de calibração:** "PT-015 Revisão 01", mais texto sobre os 3 ciclos.
5. **Padrão(ões) utilizado(s):**
   - descrição;
   - identificação interna (MP-024);
   - "Lab. Executor da calibração: PADRÃO RBC";
   - nº do certificado;
   - data de validade.
6. **Resultados / incertezas de medição:**
   - cabeçalho com capacidade (0 a 3100 g), faixa de utilização (1 a 3100 g), **Status: APROVADO**, **"Limite de Erro Permissível: 0,05 % em relação ao ponto medido"** e resolução 0,01 g;
   - colunas exatas: `V.V.C.* (g) | V.I.M.* (g) | Correção (g) | U 95 % (g) | K | Limite de Erro (g) | Status`, com AP em cada linha.
7. **LAUDO FINAL APROVADO:**
   - "Não houve ajuste";
   - legenda: V.V.C. = valor verdadeiro convencional do padrão; V.I.M. = valor do instrumento médio; U 95 %.

**Final do certificado**

- Aviso em caixa sobre a reprodução integral.
- "Emissão, Santo André, 24/09/2021".
- **Duas assinaturas "Assinado Eletronicamente":** "Executor Técnico" e "Diretor Técnico".

**QR code:** não tem. O site informa o envio do PDF por e-mail com assinatura eletrônica.

**Layout:** A4 retrato, preto e branco, com títulos em fonte serifada.

**Pontos fortes** (justamente para o caso não RBC)

- Separa as **informações do cliente**, conforme a ISO/IEC 17025, item 7.8.2.2.
- Põe periodicidade e validade **como dado do cliente**, o que respeita o item 7.8.4.3.
- Usa o critério de aceitação do cliente, com status por ponto e laudo final.
- Tem dupla assinatura: executor e diretor.

**Pontos fracos**

- Não tem excentricidade, repetibilidade nem νeff.
- **U menor que a resolução** (por exemplo, 0,00041 g com d = 0,01 g). Isso é incoerente com o DOQ-CGCRE-097, item 9.2.
- Não informa Max, e nem classe.

### 2.4 Exemplo D: modelo didático da UFSC, "Diretrizes gerais de calibração – Balança Digital" (DG-METEQ-CAL-006-01, 2020), 2 folhas

- **URL:** https://extensaometrologia.paginas.ufsc.br/files/2020/09/diretriz-balanca-v00.pdf
- **Onde:** Apêndice A.1.4, que traz um modelo de certificado. Também traz o modelo do registro de campo e a planilha de incerteza.

**Cabeçalho**

- Nome e endereço do laboratório.
- "Folha: 01/02".
- "Certificado de calibração n° DIM-XX".

**Seções**

1. **Dados:**
   - solicitante e denominação;
   - fabricante e faixa nominal;
   - nº do instrumento e resolução indicada;
   - data de calibração;
   - **classe** e **valor de divisão de verificação**.
2. **Definições:** valor convencional, erro de indicação e erro de excentricidade.
3. **Procedimento:**
   - número;
   - 5 ciclos no centro;
   - método da excentricidade;
   - condições ambientais.
4. **Padrão utilizado:** texto com o jogo, a data, o laboratório, o nº do certificado e a próxima calibração.
5. **Resultados:**
   - **Erro de indicação**, colunas exatas: `V.N. (g) | V.C. (g) | Médias obtidas* (g) | Erro de indicação (g) | Incerteza de medição (g) | Fator de abrangência (k) | Graus de liberdade (νeff)`, com a nota "*média de 5 ciclos";
   - **Erro de excentricidade**: linha de diferenças por posição (Referência-2 a -5);
   - para a excentricidade, linha com `Erro de excentricidade | Incerteza | k | νeff` e figura das posições.
6. **Observações:** notas padrão.

**Por que é útil**

- É a melhor referência brasileira "limpa" de colunas.
- Separa **valor nominal** de **valor convencional**.
- Traz **k e νeff por ponto**.
- Dá à excentricidade uma incerteza própria.

**Planilha de incerteza**

- Colunas: fonte | tipo | valor | divisor | u(xi) | distribuição | ci | ui(y) | νi.
- Fontes:
  - repetibilidade;
  - resolução com carga e sem carga;
  - incerteza dos pesos;
  - deriva dos pesos.
- Exemplo: veff = 15 e k = 2,18.

### 2.5 Exemplo E: Laboratório de Calibração de Pesagem do MOP (Chile), acreditado INN LC 074, **balança rodoviária**, 3 páginas

- **URL:** https://vialidad.mop.gob.cl/uploads/sites/9/2025/04/HUARA.pdf
- **Certificados:** LCP-2026-C13 e C14, emitidos em 13/05/2026. Outros na mesma série: `.../2026/02/TIJERAL.pdf`, `.../2025/07/LAMPA-1.pdf`.

**Cabeçalho** (todas as páginas)

- Brasão do ministério.
- "CERTIFICADO DE CALIBRACIÓN – Laboratorio acreditado en la magnitud masa".
- Logo do INN com "Acreditación LC 074 / Código R.DV.LCP.011 / Versión 11".

**Página 1**

- Número, data de calibração e data de emissão.
- Procedimento: P.DV.LCP.006 v21, NCh 2562, OIML R76-1 e OIML R134-1.
- Identificação do cliente e do laboratório.
- **Equipamento:**
  - descrição, fabricante, modelo, nº de série;
  - **modelo da plataforma** (separado do instrumento);
  - capacidade máxima, faixa de utilização;
  - **classe OIML (III)**;
  - local de instalação.
- **Rastreabilidade:** o caminhão-padrão e o conjunto de 18 massas de 500 kg, com código, fabricante, modelo, nº dos certificados e "vigente hasta".
- Condições ambientais: T, UR e P.
- Textos de rastreabilidade ao SI e de limitação de responsabilidade.
- Assinatura do chefe do laboratório, com carimbo eletrônico.

**Página 2**

1. **Excentricidade:**
   - "Carga de ensayo: 8000 kg";
   - colunas: `Punto | Indicación Inicial | Indicación Final | Error Balanza | Error Máx. Permitido | Unidad`.
2. **Linealidade:** colunas exatas `Valor Nominal (kg) | Error Inicial (kg) | Error Final (kg) | Incertidumbre k=2 (kg) | Error Máximo Permisible (kg)`.
3. **Repetibilidade:** 5 leituras, diferença e erro permitido.
4. **Incerteza:** componentes ue, ur, us e up, mais a incerteza total.

**Página 3**

5. **Modo dinâmico:** pesagem por eixo, 10 pesagens, média, desvio, incerteza e % de erro.
6. **Resultado da calibração**, com **regra de decisão explícita:**
   - "CUMPLE ... OIML R76-1";
   - "El cumplimiento de los errores máximos permisibles ... considera la suma del error obtenido más la incertidumbre asociada".
7. **Observação.**

Ainda na página 3:

- **URL de validação** em `firmador.mop.gob.cl/Publico/ValidaDoc?...` e **QR code** no canto inferior direito.
- "firmado electrónicamente de acuerdo con la Ley 19.799".

**Rodapé:** "no puede ser reproducido en forma parcial – Página X de 3".

**Layout:** carta, retrato. Tabelas com cabeçalho cinza e bandeira institucional colorida.

**Pontos fortes**

- **Antes e depois** do ajuste (erro inicial e final) em todas as tabelas.
- **Coluna de EMA.**
- Conformidade com regra de decisão.
- **QR code com validação on-line.**

**Pontos fracos**

- k = 2 fixo.
- Um valor inconsistente ("5970") na tabela de erro inicial, ou seja, falta validação de digitação.

**Validação cruzada**

- O EMA impresso (±10 kg até 5000 kg; ±20 kg de 6000 a 9000 kg) bate com a tabela da OIML R76 para a classe III com e = 10 kg (ver §6.5).

### 2.6 Exemplo F: Laboratorios de Metrología Sigma (Colômbia), ONAC 11-LAC-001, **balança rodoviária** Fairbanks de 80 t, 3 páginas

- **URL:** https://www.supertransporte.gov.co/documentos/2021/Mayo/Concesiones_05/CVN04ArmeniaPereiraManizales/LaEspanola_2020C.pdf
- **Certificado:** LMS24777. Similar: `.../2021/Abril/Concesiones_29/2020/CVN05_SANTAMARTAPARAGUACHON/K97N-S_2020CALIBRACION.pdf`.

**Página 1 (capa)**

- Caixa no canto superior esquerdo: "Certificado No: **LMS24777** / Masa (instrumentos de pesaje) / Página 1 de 3".
- Logos à direita e título grande.
- Declaração de acreditação e de reprodução.
- Solicitante: razão social, endereço, cidade, data de recepção e **nº do relatório (R-9780)**.
- Instrumento:
  - descrição, fabricante, modelo, série;
  - **identificação ("No porta")**;
  - data e local.
- Método: guia SIM MWG7/cg-01, itens 5.1 a 5.3, e o procedimento PEM-06.
- **"Número de páginas del certificado incluyendo anexos: 3"**.
- Bloco de assinatura digital, data de emissão e selo "FIRMADO DIGITALMENTE".

**Página 2**

- **Características:** carga máxima, **carga mínima (cliente)** e d.
- **Condições ambientais:** mínimo e máximo de T e de UR, mais o campo **"Tolerancia del cliente"**.
- **Excentricidade:**
  - texto do método (≈ Max/3);
  - colunas `Posición No. | Indicación (kg) | Eecc | ΔEecc`;
  - **diagrama**;
  - frase de não conformidade: "El instrumento no cumple con el error máximo permitido para esta prueba".
- **Repetibilidade:** 3 cargas × 3 repetições e o desvio.

**Página 3**

- **Erro de indicação:**
  - colunas `Carga aplicada (kg) | Carga ascendente: Indicación (kg), Error (kg) | [descendente] Indicación (kg), Error (kg) | Incertidumbre Expandida (kg) | k`;
  - **gráfico de erro × carga com barras de incerteza**.
- Texto sobre a incerteza.
- **Rastreabilidade:** `Descripción | Código | Certificado No. | Fecha de próxima calibración`.
- **Observações:**
  - "se calibra hasta 71 470 kg a solicitud del cliente";
  - "la coma se utiliza como separador decimal".
- **"Fin certificado de calibración"**.

**Rodapé**

- Formulário "FEM-30 ED-06".
- Endereço.
- **"E: MR/MM  R: JL/DT  A: JL/DT"**: iniciais de quem Elaborou, Revisou e Aprovou.

**Layout:** carta, retrato. Azul e laranja da marca, título em itálico azul.

**Pontos fortes**

- Capa com resumo e assinatura.
- Nº de páginas incluindo anexos e "fim".
- Gráfico.
- Evidência de revisão (E/R/A).
- Faixa parcial justificada.

**Pontos fracos**

- U em notação científica ("8,2E+00").
- Tolerância do cliente vazia.

### 2.7 Exemplo G (padrões): Unical Calibrações, RBC CAL 0529, certificado de **20 pesos de 500 kg classe M1**, 2 páginas

- **URL:** https://padroes.fgbalancas.com.br/certificados/certificados_pesos_padroes_rodoviarias.pdf
- **Publicação:** a FG Balanças o publica em https://padroes.fgbalancas.com.br/ como prova de rastreabilidade. O certificado de balança da FG indica, **ponto a ponto, os códigos dos pesos usados**.

**Faixa vertical na margem esquerda**

- "Assinado com Assinatura Eletrônica (Lei 14.063/2020 | Regulamento 910/2014/EC)".
- **"Hash SHA256 do original: …"**.
- **"Link de validação: https://…"**.
- QR code no canto inferior esquerdo, com o rótulo "Validador".

**Seções**

1. **Dados do cliente:** solicitante, endereço, CNPJ, responsável e contratante.
2. **Objeto:**
   - "500 kg – 20 pesos";
   - colunas `Identificação/TAG (001 a 020) | Fabricante | Nº de Série | Classe Declarada (M1) | Ordem de Serviço nº`;
   - data da calibração e data de emissão.
3. **Procedimento.**
4. **Condições ambientais:** texto mais T, UR e P.
5. **Rastreabilidade:** balança, conjunto de pesos-padrão e termo-baro-higrômetro, cada um com código, certificado, CAL e vencimento.
6. **Responsabilidade:** "assinado eletronicamente por … data/hora … #id".
7. **Resultados:**
   - colunas exatas: `Identificação/Marcação | Massa Nominal (kg) | Valor Encontrado Antes do Ajuste (kg) | Após Ajuste (kg) | Incerteza Expandida (kg) | Material (Ferro Fundido) | Massa Específica (kg/m³) (7850) | k (2,00)`;
   - U = 0,008 kg;
   - legenda: N/A, N/C, "--" (não houve ajuste).
8. **Observações:** ajuste fora do escopo, cópia arquivada por 5 anos, nota de incerteza e aviso de que não isenta do controle legal.

**Por que é útil**

1. É o modelo de **assinatura eletrônica com hash e QR code**.
2. Mostra exatamente **o que o cadastro de pesos precisa ter**: massa convencional, U, k, classe declarada, material e massa específica.
3. **Coerência com a OIML R111:**
   - EMA da classe M1 para 500 kg = 25 g;
   - os desvios encontrados chegam a 13 g;
   - U = 8 g ≤ EMA/3.

### 2.8 Exemplos auxiliares (não são de balança, mas ajudam no layout e no processo)

**Evagon (RBC CAL 0446), multiparâmetro, cert. `EVQ - 20812 - 01 / 2023`, 2 páginas**

- **URL:** dentro de https://iema.es.gov.br/Media/iema/EIA-RIMA/EIA/2025/IMETAME/ANEXOS2/Anexo%20III%20-%20Certificados%20de%20Calibracao%20dos%20Equipamentos.pdf
- **Estrutura:**
  - seções numeradas de 1 a 10;
  - **Contratante × Cliente**;
  - dados do equipamento + OS;
  - condições ambientais "recomendadas" × medidas no início e no fim;
  - rastreabilidade com as colunas `Identificação | Descrição | Nº certificado | Laboratório | Data cal. | Data validade`;
  - resultados com as colunas `Valor de Referência | Leitura | Erro | U | k | Veff`;
  - notas, observações e "Página 01/02".
- **Análise crítica feita pelo cliente:** o mesmo anexo traz a **ficha de análise crítica de certificado do cliente** (HQ-ANE-160). Os itens conferidos são:
  1. nº do certificado / lote / rastreabilidade;
  2. selo de calibração / RBC / ISO;
  3. nome e endereço do provedor;
  4. procedimento (descrição, nº, versão);
  5. padrão utilizado / RBC / validade;
  6. resultados / erros / incertezas;
  7. datas de calibração e de emissão;
  8. se atende aos critérios de aceitação.
- O certificado da Balanças.com deve deixar **cada um desses itens fácil de achar**.

**ABSI (RBC CAL 0056), manômetro, `CAL - 242700/24`, "Fl. 1/2"**

- **URL:** https://www.century-sp.com.br/pdf2/Century010_01_10_2027.pdf
- **"Aprovado digitalmente através da senha do usuário dia 02/10/2024 às 08:31hs"**: é um registro simples de aprovação.
- **O PDF é criptografado:** impressão permitida, cópia e alteração bloqueadas. É gerado pelo Stimulsoft Reports.
- Nota: "A validade ... deve ser estabelecida pelo usuário ... NBR ISO 10012".

**CETESB, Cotação 5/2020/326 (o que um comprador público exige)**

- **URL:** https://sistemasinter.cetesb.sp.gov.br/servicos/INTERDESLICITACOES/Editais/COTACAO_5-2020-326.PDF
- **Exigências para o certificado:**
  - medições **antes e após os ajustes**;
  - **identificação e classe dos padrões**;
  - data;
  - **cópia dos dados brutos**;
  - **≥ 6 pontos**, com **≥ 5 medições por ponto**;
  - **desvios-padrão e repetitividade**, conforme o DOQ-CGCRE-036;
  - **k**;
  - pesos compatíveis com a OIML R76.
- **Prazo:** certificado em até **15 dias corridos**.
- **Anexo:** lista as balanças com a coluna "**Pontos de calibração**" por balança. É um requisito do cliente que deve ir para o cadastro.

### 2.9 Quadro comparativo

| Item | A Pensu | B Sannar | C Metrotec | D UFSC | E MOP-CL | F Sigma-CO | G Unical (pesos) |
|---|---|---|---|---|---|---|---|
| Acreditação | RBC | RBC | **não** | modelo | INN | ONAC | RBC |
| Instrumento | bancada 5 kg | rodoviária 100 t | bancada 3,1 kg | 500 g | rodoviária 20 t | rodoviária 80 t | 20 × 500 kg |
| Páginas | 1 | 2 | 2 | 2 | 3 | 3 | 2 |
| Número | 39059.50 | RBC677/2023 | 51996/21 | DIM-XX | LCP-2026-C13 | LMS24777 | 386/2026 |
| Max / e / classe no certificado | só a faixa | só a faixa | só a capacidade | **sim** | Max e classe | Max, Min (cliente) e d | classe |
| Erro de indicação | sim | sim | sim (como correção) | sim | sim | sim (cargas ascendentes) | n/a |
| U / k / νeff | sim / sim / — | sim / sim / sim | sim / sim / — | sim / sim / sim | sim / k=2 / — | sim / sim / — | sim / sim / — |
| Repetibilidade | s por ponto | — | — | no registro | sim | sim (3 cargas) | n/a |
| Excentricidade | 1 valor | 6 pontos + diagrama | — | sim + diagrama + U | sim + EMA | sim + diagrama + conformidade | n/a |
| Antes / depois do ajuste | — | sim ("não houve") | "não houve" | — | **sim** | — | **sim** |
| EMA / conformidade | — | — | status por ponto | — | **regra de decisão** | excentricidade | classe declarada |
| Gráfico | — | — | — | — | — | **sim** | — |
| Assinaturas | 1 | 1 (manuscrita) | **2 eletrônicas** | — | 1 eletrônica | 1 digital + E/R/A | 1 eletrônica |
| QR / validação | — | — | — | — | **QR + URL** | — | **QR + URL + hash** |

---

## 3. Síntese: o que todos têm e o que distingue os bons

### 3.1 O que é comum a todos os certificados

1. **Título** "Certificado de Calibração" e **número único** no cabeçalho de **todas** as páginas, com "Página X de Y".
2. **Identificação do emissor:**
   - nome, endereço, telefone, e-mail e site;
   - nos acreditados, frase e símbolo Cgcre com o nº CAL.
3. **Cliente:**
   - razão social e endereço;
   - às vezes distingue "solicitante / interessado" ou "contratante / cliente";
   - às vezes inclui CNPJ, responsável e OS.
4. **Instrumento:**
   - tipo ou descrição;
   - fabricante ou marca, modelo, nº de série;
   - identificação do cliente (TAG / código);
   - faixa ou capacidade e resolução, com unidade.
5. **Datas:** de calibração e de emissão. Às vezes também a de entrada ou recepção.
6. **Local da calibração**, nas instalações do cliente ou no laboratório.
7. **Procedimento:** código, revisão e resumo do método ("comparação direta com pesos-padrão", nº de ciclos).
8. **Padrões e rastreabilidade:** código, descrição, nº do certificado, laboratório ou CAL e validade.
9. **Condições ambientais:** temperatura e UR, às vezes também a pressão.
10. **Tabela de resultados:**
    - valor de referência (VR / VC / carga aplicada);
    - indicação (média);
    - erro (ou correção);
    - U e k, quase sempre também νeff.
11. **Nota de incerteza:** "incerteza padrão × k … ≈ 95 % (95,45 %) … EA-4/02 / GUM".
12. **Ressalvas padrão:**
    - os resultados referem-se só ao item calibrado;
    - a reprodução só pode ser integral.
13. **Assinatura** de pessoa autorizada.
14. **Rodapé** com o código e a revisão do formulário (controle de documentos).
15. **Layout:** A4 (ou carta) retrato, quase todo preto e cinza com uma cor de marca, tabelas com bordas e títulos de seção numerados.

### 3.2 O que distingue os bons

| Característica | Onde aparece | Por que importa |
|---|---|---|
| Resultados **antes e depois do ajuste** | MOP, Unical, Sannar, CETESB | Exigido pela ISO/IEC 17025, item 7.8.4.1 d), e pelo DOQ-CGCRE-097, item 10.2.3. Permite ao cliente avaliar o impacto nas pesagens passadas. |
| **Excentricidade** com carga, posições, diagrama e um valor por posição | Sannar, Sigma, UFSC, MOP | O DOQ-CGCRE-097, item 10.4.1, exige que o valor conste no certificado. O diagrama evita ambiguidade. |
| **Repetibilidade** (desvio-padrão) | Pensu, Sigma, MOP, CETESB | O cliente usa esse valor na **verificação intermediária**: se a correção variar mais de 3 s, a balança deve ser recalibrada (IPEM-PR). |
| **k e νeff por ponto** | UFSC, Sannar, Evagon | Mostra que a incerteza foi de fato calculada, e não usada com k = 2 fixo. |
| **Gráfico de erro × carga** com barras de U | Sigma | Leitura imediata e comparação com o EMA. |
| **Coluna de EMA e regra de decisão** | MOP, Metrotec, Sigma | Exigido pela ISO/IEC 17025, item 7.8.6, quando há declaração de conformidade. |
| **Assinatura eletrônica, QR code, URL de validação e hash** | MOP, Unical | Autenticidade verificável por qualquer pessoa. |
| **Nº de páginas incluindo anexos** e **"fim do certificado"** | Sigma | ISO/IEC 17025, item 7.8.2.1 d): clara identificação do fim do documento. |
| **Informações fornecidas pelo cliente** em bloco separado | Metrotec | ISO/IEC 17025, item 7.8.2.2. Também é o lugar certo para a **periodicidade**. |
| **Dupla checagem visível** (executor + aprovador, E/R/A) | Metrotec, Sigma, ABSI | Revisão antes da emissão, exigida pela ISO/IEC 17025, item 7.8.1.1. |
| Densidade do ar, carga mínima do cliente, faixa parcial justificada | Sannar, Sigma | Contexto técnico que evita mal-entendidos. |
| Notas legais: "não isenta do controle metrológico legal" e "ajuste fora do escopo" | Sannar, Unical, ABSI | Evitam confundir calibração com verificação do Inmetro/IPEM. |

### 3.3 Erros a evitar (o sistema deve impedir)

| Erro observado | Exemplo | Regra no sistema |
|---|---|---|
| Linhas `#VALOR!` / vazias | Pensu | Gerar a tabela só com as linhas preenchidas. Nunca usar planilha como motor de impressão. |
| Título de seção que não corresponde ao conteúdo | Sannar | Seções geradas a partir dos ensaios realmente executados. |
| U menor que a resolução, ou com mais casas decimais que d | Metrotec | Arredondar erro e U de forma compatível com d (DOQ-CGCRE-097, item 9.2). Validar U ≥ fração mínima de d. |
| Notação científica (8,2E+00) | Sigma | Formatação decimal com vírgula e casas fixas por resolução. |
| Excentricidade como valor único, sem carga nem posições | Pensu | Tabela por posição, carga de ensaio e diagrama. |
| "Validade" impressa sem acordo com o cliente | vários | A ISO/IEC 17025, item 7.8.4.3, proíbe recomendar o intervalo sem acordo. Imprimir só como "informação do cliente". |
| Valor digitado errado ("5970") | MOP | Validação de plausibilidade: erro maior que N × e gera alerta antes de enviar para revisão. |
| Imagem digitalizada de baixa qualidade | Metrotec | PDF nativo, com texto pesquisável e fontes embutidas. |
| Ausência de Max, Min, e, classe e PAM | quase todos | Campos obrigatórios no cadastro, impressos no certificado. |

---

## 4. Requisitos normativos que orientam o conteúdo

A Balanças.com **não é acreditada**, então nenhuma dessas normas é obrigatória para ela. Mesmo assim, são o padrão que os clientes auditados (ISO 9001, Anvisa, BPF) usam para fazer a análise crítica dos certificados. Segui-las torna o certificado não RBC aceitável na maioria das auditorias.

### 4.1 ABNT NBR ISO/IEC 17025:2017, item 7.8 (resumo)

Fonte do resumo: crosswalk do NIST (https://www.nist.gov/document/7-8-17025-crosswalk-reporting-results-20180201pdf).

**7.8.1.1:** revisado e autorizado antes da emissão. Daí vem o fluxo **rascunho → revisão → emitido**.

**7.8.2.1, conteúdo mínimo:**

- a) título;
- b) nome e endereço do laboratório;
- c) local da atividade, inclusive quando feita no cliente;
- d) **identificação única de todas as partes e clara identificação do fim**. Boa prática: "Página X de Y";
- e) cliente e contato;
- f) método;
- g) descrição, identificação inequívoca e, quando necessário, condição do item;
- h) data de recebimento, quando crítica;
- i) data(s) da calibração;
- j) data de emissão;
- l) declaração de que os resultados se referem só ao item;
- m) resultados com unidades;
- n) desvios do método;
- o) quem autorizou;
- p) resultados vindos de provedores externos.

**7.8.2.2:** identificar os **dados fornecidos pelo cliente**, com ressalva quando afetarem a validade dos resultados.

**7.8.4.1, conteúdo adicional dos certificados de calibração:**

- a) incerteza na mesma unidade do mensurando;
- b) condições, por exemplo as ambientais;
- c) como a rastreabilidade é assegurada;
- d) **resultados antes e depois de ajuste ou reparo**;
- e) declaração de conformidade, quando pertinente;
- f) opiniões.

**7.8.4.3:** certificado e **etiqueta não devem recomendar intervalo de calibração**, exceto por acordo com o cliente ou por exigência legal.

**7.8.6:** declaração de conformidade com **regra de decisão** documentada e aplicada.

**7.8.8, emendas:**

- a alteração após a emissão é feita por novo documento, que identifica a mudança e, se for o caso, o motivo;
- um documento novo e completo deve ter **identificação única e referenciar o original que substitui**.

### 4.2 EURAMET cg-18 v4.0 (2015), capítulo 8: conteúdo do certificado de calibração de instrumentos de pesagem não automáticos

Fonte: https://www.nist.gov/document/i-cal-gui-018calibrationguideno18webpdf

**8.1 Informações gerais**

- Laboratório e acreditação.
- Identificação do certificado: nº, data de emissão e **nº de páginas**.
- Assinaturas.
- Cliente.
- Instrumento: **fabricante, tipo, Max, d e local de instalação**.
- Aviso de reprodução integral.

**8.2 Procedimento**

- Data, local e condições ambientais ou de uso.
- **Ajuste realizado**: interno ou externo, e com qual peso.
- Anomalias e configurações de software relevantes.
- Procedimento.
- **Acordos com o cliente**: faixa limitada, especificações de conformidade.
- Rastreabilidade.

**8.3 Resultados**

- Indicações e/ou erros por carga, em valores discretos ou por equação de aproximação.
- Detalhes do carregamento.
- **Desvio-padrão** referido a uma indicação.
- **Informação do ensaio de excentricidade.**
- **U do erro de indicação.**
- **k, com comentário sobre a probabilidade de abrangência e o motivo se k ≠ 2.**
- Aviso se as leituras usaram resolução maior que a normal.

**8.4 Informações adicionais**

- "Incerteza em uso" (W = R − E(R) ± U(W)), anexável sem fazer parte do certificado.
- Declaração **opcional** de conformidade, na forma W = R ± Tol, com a faixa de validade.

### 4.3 DOQ-CGCRE-097, Rev. 00 (dez/2022): "Orientações para calibração de balanças, pesos-padrão e medição de massa de peças diversas"

Fonte: https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/doq-cgcre-97

**Formato dos resultados**

- **Tabela 2, modelo de colunas para certificado de balança:** `Valor Nominal | Indicação da balança | Erro de indicação | U | k | νeff`. Exemplo: 1 kg | 1,02 kg | 0,02 kg | 0,05 kg | 2,00 | Infinito.
- **Tabela 1, colunas para pesos:** `Valor Nominal | Valor Encontrado | U | k | νeff`.
- **9.2:** erro e incerteza **compatíveis com a resolução da balança** (uma divisão).
- **10.4.1:** o **valor da excentricidade deve constar no certificado**.

**Instrumentos auxiliares**

- **9.4, resolução máxima:**
  - barômetro: 1 mbar no laboratório e 5 mbar em campo;
  - termômetro: 0,5 °C;
  - higrômetro: 1 %.
- **9.5:** intervalo de calibração dos auxiliares **≤ 2 anos**.

**Condução da calibração**

- **10.2:** a calibração é feita nas instalações do cliente. Deve haver critérios para recusar ou interromper o serviço quando as condições forem ruins, ou aumentar a incerteza.
- **10.2.3:** os resultados **antes do autoajuste** devem ser registrados no certificado. O ajuste **não faz parte do escopo de calibração**.
- **10.3:** em balanças com resoluções distintas, a repetibilidade é feita **em cada faixa**.
- **10.4, carga de excentricidade:**
  - ≥ 1/3 de Max;
  - alternativas: até 500 kg, ≥ 1/3; de 500 a 3000 kg, 1/5; acima de 3000 kg, 1/10.
- **10.5.1:** a calibração cobre do zero a Max, salvo pedido do cliente.
- **10.5.2:** em instrumento multifaixa, **o cliente define quais faixas calibrar**.
- **10.6:** registrar **T, UR e pressão no início e no fim**.

**Incerteza**

- **10.7.1, componentes mínimos:**
  - repetibilidade;
  - divisão do instrumento;
  - incerteza dos pesos;
  - **deriva dos pesos**;
  - empuxo do ar.
- **10.7.4:** com vários pesos, **soma aritmética** do valor convencional, do erro e da incerteza.
- **10.7.5:** a deriva vale de 1 a 3 vezes U. Sem histórico, usar o **EMA da OIML R111**.

**Cargas de substituição**

- **10.9:** permitidas **a partir de 1000 kg**. É o caso típico da balança rodoviária.

### 4.4 Portaria Inmetro 157/2022, RTM de instrumentos de pesagem não automáticos

- Em vigor desde 02/01/2023. Revogou a Portaria 236/94.
- Fonte: https://www.gehaka.com.br/downloads/portaria_no_157_de_31_de_marco_de_2022.pdf

**Definições (1.6)**

- Max, Min, e (divisão de verificação), d (divisão real).
- n = Max/e.
- Múltiplas faixas × múltiplos valores de divisão.
- T (tara) e Lim (carga limite).

**EMA**

- 2.5.2: o EMA da verificação está na Tabela 5.
- **2.5.3: o EMA em serviço (fiscalização) é o dobro.**

**Inscrições obrigatórias (7.1 e 7.2)**

- Fabricante.
- **Classe, em algarismo romano dentro de um oval.**
- **Max, Min e e.**
- Se aplicável:
  - nº de série;
  - **"identificação da aprovação de modelo"**;
  - d (se d < e);
  - T, Lim e faixa de temperatura;
  - marca de cada dispositivo de instrumentos compostos.

**Apresentação das inscrições (7.4)**

- Agrupadas na **placa de identificação** ou no corpo, em local visível.
- **Max, Min, e e d repetidos junto ao mostrador.**
- A placa é selada.

**Instrumentos compostos (7.5.4.2 e 7.5.4.3)**

- As inscrições do instrumento completo ficam **no dispositivo indicador**.
- Se o indicador for trocado, as inscrições são transferidas para o novo.

**Verificação (8.8.7.1)**

- A validade da verificação é limitada a 1 ano.
- Segundo o IPEM-PR, ela expira no fim do ano civil.

**Consequência para o sistema**

- A **calibração não substitui a verificação metrológica legal** do Inmetro/IPEM para balanças usadas em transações comerciais.
- Essa frase deve sempre constar no certificado.

### 4.5 O que muda por ser um certificado **não RBC**

**O que não usar**

- O símbolo Cgcre/RBC.
- As expressões "acreditado", "RBC" ou "credenciado" aplicadas ao serviço. O uso da marca de acreditação é regido pela NIE-CGCRE-009 e pela Portaria Inmetro 274/2014.

**Como declarar a rastreabilidade**

- Por exemplo: "Calibração rastreável ao Sistema Internacional de Unidades (SI) por meio de padrões calibrados por laboratórios acreditados pela Cgcre/Inmetro (RBC), conforme a seção 4".
- Listar o **CAL** do laboratório que calibrou cada padrão.

**O que manter**

- A mesma estrutura dos certificados acreditados (§4.1 a §4.3).
- É isso que faz o certificado passar na análise crítica do cliente (ver a ficha HQ-ANE-160 no §2.8).

**Nota recomendada**

- "Esta calibração não é coberta por acreditação da Cgcre."
- "Não substitui a verificação metrológica legal (Inmetro/IPEM) nem isenta o instrumento do controle metrológico legal."

**Registro de oficina permissionária**

- Se a Balanças.com for **oficina permissionária** do Inmetro para reparo de balanças, vale ter no cadastro da empresa o **nº de registro de permissionária**.
- Esse número é útil quando houver ajuste, reparo ou rompimento de lacre.

---

## 5. Proposta de layout do certificado (página a página)

### 5.1 Princípios

1. **Três páginas no caso geral**, com a variante compacta de duas páginas descrita no §5.5. Sempre **A4 retrato** e PDF nativo (de preferência PDF/A-2b), com fontes embutidas.
2. **O cabeçalho e o rodapé se repetem em todas as páginas:**
   - número;
   - "Página X de Y";
   - código e revisão do formulário;
   - aviso de reprodução integral.
3. **As seções são geradas a partir dos dados.** Ensaio não executado não aparece. A exceção é o ajuste, que sempre é declarado, por exemplo "Ajuste: não realizado".
4. **Números com vírgula decimal**, alinhados pela vírgula. O número de casas é coerente com d (ver §5.7).
5. **Toda informação vinda do cliente aparece rotulada** como "informação fornecida pelo cliente".
6. A **conformidade é escrita em texto** ("CONFORME" / "NÃO CONFORME"), nunca só em cor, porque o certificado precisa funcionar impresso em preto e branco.

### 5.2 Página 1: identificação e rastreabilidade

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO]  BALANÇAS.COM                               CERTIFICADO DE CALIBRAÇÃO           │
│ Razão social · CNPJ · Endereço – Rio Claro/SP      Nº CC-2026-00123                    │
│ Telefone/WhatsApp · e-mail · site                  Página 1 de 3                       │
│ Calibração rastreável ao SI (padrões RBC) – serviço não acreditado pela Cgcre          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Data da calibração: 14/10/2026   Data de emissão: 15/10/2026   OS nº: OS-2026-0456     │
├─ 1. CLIENTE ──────────────────────────────────────────────────────────────────────────┤
│ Cliente: <Razão social>                                  CNPJ: <00.000.000/0000-00>    │
│ Endereço: <logradouro, nº – bairro – cidade/UF – CEP>                                  │
│ Contato/solicitante: <nome – setor>                                                    │
│ Local da calibração: instalações do cliente – <unidade / setor> (local de uso)         │
├─ 2. INSTRUMENTO CALIBRADO ────────────────────────────────────────────────────────────┤
│ Tipo: Balança de plataforma eletrônica         Identificação do cliente (TAG): BAL-07  │
│ Fabricante: <X>   Modelo: <Y>   Nº de série: <Z>   Patrimônio: <P>   Ano fab.: <AAAA>  │
│ Indicador: <fab./modelo/série>      Receptor de carga: <fab./modelo/série> 1,0×1,0 m   │
│ Max 300 kg | Min 2 kg | e = 0,1 kg | d = 0,1 kg | Classe III | n = 3000 | Unidade kg   │
│ Portaria de aprovação de modelo: Inmetro/Dimel nº <NNN>/<AAAA>                         │
│ Marca de verificação Inmetro/IPEM: <nº/ano>        Faixa calibrada: 0 a 300 kg         │
│ Condição na recepção: em uso, sem anomalias aparentes.    Ajuste realizado: NÃO        │
├─ 3. CONDIÇÕES AMBIENTAIS ─────────────────────────────────────────────────────────────┤
│ Temperatura: início 24,1 °C / fim 24,8 °C     Umidade relativa: início 61 % / fim 59 % │
│ Pressão atmosférica (quando medida): 948 hPa  Massa específica do ar: 1,10 kg/m³       │
├─ 4. PADRÕES UTILIZADOS E RASTREABILIDADE ─────────────────────────────────────────────┤
│ Código        │ Descrição               │ Classe│ Certificado │ Laboratório (Cgcre)  │ Validade│
│ JP-01         │ Jogo de pesos 1 g–5 kg  │ F2    │ 1234/2026   │ <Lab> – CAL 0000     │ 03/2027 │
│ PP20-01..15   │ 15 pesos de 20 kg       │ M1    │ 5678/2026   │ <Lab> – CAL 0000     │ 05/2027 │
│ TH-02         │ Termo-higrômetro digital│  –    │ 9012/2025   │ <Lab> – CAL 0000     │ 11/2026 │
├─ 5. MÉTODO ───────────────────────────────────────────────────────────────────────────┤
│ Procedimento PC-01 rev. 03 – Calibração de instrumentos de pesagem não automáticos por │
│ comparação direta com pesos-padrão, baseado no EURAMET cg-18 e no DOQ-CGCRE-097.       │
│ Ensaios: excentricidade, repetibilidade e erro de indicação (cargas crescentes, 1 ciclo│
│ / 2 ciclos). Carga aplicada no centro do receptor; zero verificado entre as leituras.  │
└───────────────────────────────────────────────────────────────────────────────────────┘
 CC-2026-00123 · Página 1 de 3 · FQ-07 rev.02 · Reprodução permitida somente na íntegra
```

### 5.3 Página 2: resultados

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ (cabeçalho reduzido: logo · CERTIFICADO DE CALIBRAÇÃO Nº CC-2026-00123 · Pág. 2 de 3)  │
├─ 6. ENSAIO DE EXCENTRICIDADE ─────────────────────────────────────────────────────────┤
│ Carga de ensaio: 100,0 kg (≈ 1/3 de Max)                      ┌───────────────┐        │
│ Posição     │ Indicação (kg) │ Diferença em relação ao centro │ 2           3 │        │
│ 1 (centro)  │ 100,0          │   –                (kg)        │       1       │        │
│ 2           │ 100,1          │ +0,1                           │ 5           4 │        │
│ 3           │ 100,0          │  0,0                           └───────────────┘        │
│ 4           │  99,9          │ −0,1                     (diagrama conforme o formato  │
│ 5           │ 100,0          │  0,0                      do receptor: retangular,     │
│ 1 (retorno) │ 100,0          │   –                       redondo, rodoviária com N    │
│ Erro de excentricidade (maior |diferença|): 0,1 kg        apoios)                      │
├─ 7. ENSAIO DE REPETIBILIDADE ─────────────────────────────────────────────────────────┤
│ Carga (kg) │ Nº de leituras │ Média (kg) │ Desvio-padrão s (kg) │ Amplitude (kg)       │
│ 150,0      │ 5              │ 150,0      │ 0,05                 │ 0,1                  │
├─ 8. ERRO DE INDICAÇÃO (cargas crescentes) ─────────────────────────────────────────────┤
│ Pto│ Carga aplicada (kg)│ Indicação (kg)│ Erro E (kg)│ U (kg)│ k    │ νeff │ EMA* (kg)  │
│ 1  │   0,0              │   0,0         │  0,0       │ 0,06  │ 2,00 │  ∞   │ ±0,10      │
│ 2  │  20,0              │  20,0         │  0,0       │ 0,06  │ 2,00 │  ∞   │ ±0,10      │
│ 3  │  50,0              │  50,0         │  0,0       │ 0,06  │ 2,05 │  60  │ ±0,10      │
│ …  │                    │               │            │       │      │      │            │
│ 6  │ 300,0              │ 300,1         │ +0,1       │ 0,08  │ 2,11 │  25  │ ±0,30      │
│ Carga aplicada = valor convencional dos pesos; indicação = média dos ciclos;           │
│ E = indicação − carga aplicada. *EMA em serviço (classe III, e = 0,1 kg), impresso só  │
│ quando houver declaração de conformidade (§9).                                         │
│                                                                                        │
│  Erro (kg)                                                                             │
│   +0,3 ┤                                    - - - - - - - - - - EMA (degraus)          │
│   +0,2 ┤            - - - - - - - - - - - - ┘   ┬              ┬                       │
│   +0,1 ┤- - - - - - ┘┬         ┬                │              ●                       │
│    0,0 ┼────●────────●─────────●────────────────●──────────────┴── Carga (kg)          │
│   −0,1 ┤             ┴         ┴                ┴   (barras = ±U; tracejado = ±EMA)    │
│        (gráfico erro × carga com barras ±U e, se aplicável, linhas ±EMA)               │
├─ 8.1 RESULTADOS ANTES DO AJUSTE ("como encontrado"; só se houve ajuste) ──────────────┤
│ (mesma tabela da seção 8, com o título "ANTES DO AJUSTE"; a seção 8 passa a "APÓS O    │
│  AJUSTE")                                                                              │
└───────────────────────────────────────────────────────────────────────────────────────┘
 CC-2026-00123 · Página 2 de 3 · FQ-07 rev.02 · Reprodução permitida somente na íntegra
```

### 5.4 Página 3: declarações, assinaturas e autenticidade

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
├─ 9. DECLARAÇÃO DE CONFORMIDADE (somente se solicitada pelo cliente) ───────────────────┤
│ Especificação: EMA em serviço – Portaria Inmetro 157/2022 (ou critério do cliente: …)  │
│ Regra de decisão: aceitação quando |E| + U ≤ EMA (ou: aceitação simples, |E| ≤ EMA)    │
│ Resultado: CONFORME em todos os pontos calibrados.                                     │
├─ 10. OBSERVAÇÕES ─────────────────────────────────────────────────────────────────────┤
│ • Ajuste: não realizado. (Se realizado: tipo, peso utilizado, resultados antes: 8.1.)  │
│ • Informações fornecidas pelo cliente: TAG, setor, faixa de uso, periodicidade de 12   │
│   meses (próxima calibração definida pelo cliente: 10/2027).                           │
│ • Faixa parcial a pedido do cliente / anomalias / condições desfavoráveis / desvios.   │
├─ 11. NOTAS ───────────────────────────────────────────────────────────────────────────┤
│ 1. A incerteza expandida (U) é a incerteza-padrão combinada multiplicada pelo fator de │
│    abrangência k, que, para uma distribuição t com νeff graus de liberdade efetivos,   │
│    corresponde a uma probabilidade de abrangência de aproximadamente 95,45 %.          │
│    A incerteza foi avaliada conforme o GUM (JCGM 100:2008) e o EURAMET cg-18.          │
│ 2. Os resultados referem-se exclusivamente ao instrumento calibrado, no momento e nas  │
│    condições da calibração.                                                            │
│ 3. Este certificado só pode ser reproduzido na íntegra.                                │
│ 4. Calibração não coberta por acreditação da Cgcre. Rastreabilidade ao SI por meio dos │
│    padrões listados na seção 4, calibrados por laboratórios acreditados (RBC).         │
│ 5. Esta calibração não substitui a verificação metrológica legal (Inmetro/IPEM) nem    │
│    isenta o instrumento do controle metrológico legal.                                 │
│ 6. Separador decimal: vírgula. Cópia deste certificado arquivada por 5 anos.           │
├─ 12. RESPONSÁVEIS ────────────────────────────────────────────────────────────────────┤
│   Executado por:                              Revisado e aprovado por:                 │
│   ______________________________              ______________________________           │
│   <Nome do técnico>                           <Nome do responsável técnico>            │
│   Técnico de calibração                       Responsável técnico <registro>           │
│   Assinado eletronicamente em 14/10/2026 17:40  Assinado eletronicamente em 15/10 09:12│
├─ VERIFICAÇÃO DE AUTENTICIDADE ────────────────────────────────────────────────────────┤
│  ┌──────┐  Verifique em: https://<site>/verificar/7F3K92QD                             │
│  │  QR  │  Código de verificação: 7F3K-92QD                                            │
│  └──────┘  SHA-256 do PDF original: 3a9f…c21e (conferível na página de verificação)    │
│                           ——— FIM DO CERTIFICADO ———                                   │
└───────────────────────────────────────────────────────────────────────────────────────┘
 CC-2026-00123 · Página 3 de 3 · FQ-07 rev.02 · Reprodução permitida somente na íntegra
```

### 5.5 Variantes

**Compacta (2 páginas)**

- **Quando usar:** bancada, balcão, analítica com até 8 pontos, sem ajuste e sem conformidade.
- **Página 1:** seções 1 a 5, compactadas em duas colunas.
- **Página 2:** seções 6 a 8 (sem gráfico ou com um gráfico pequeno), depois 10 a 12 e o QR code.

**Rodoviária, ferroviária ou plataforma com vários apoios**

- **Excentricidade por apoio ou par de células**, com diagrama longitudinal (como na Sannar).
- **Cargas de substituição** (DOQ-CGCRE-097, item 10.9), com uma coluna indicando a composição de cada carga: pesos + substituição.
- Pesos de 500 kg ou 1000 kg identificados por código ou faixa (por exemplo, "PP500-01 a 20").
- **Opcional:** carregamento crescente e decrescente com as colunas ascendente e descendente, como na Sigma.

**Multifaixa ou multi-intervalo**

- Uma tabela de erro de indicação por faixa calibrada. A escolha das faixas é do cliente (DOQ-CGCRE-097, item 10.5.2).
- Repetibilidade em cada faixa (item 10.3).
- e e d de cada faixa no bloco 2.

**Com ajuste**

- Seção 8.1, "antes do ajuste", seguida da seção 8, "após o ajuste".
- Observação descrevendo o ajuste.

**Anexo de dados brutos (opcional)**

- Página de anexo com todas as leituras por ciclo, para clientes que exigem, como a CETESB.
- Conta no "Página X de Y" e vem antes do "fim do certificado".

### 5.6 Textos padrão (biblioteca de frases editável no sistema)

- **Incerteza:** nota 1 acima, com a variante k = 2 "distribuição normal" quando νeff = ∞.
- **Não acreditado e rastreabilidade:** nota 4.
- **Controle legal:** nota 5.
- **Ajuste:**
  - "O ajuste foi realizado com <peso/carga> por solicitação do cliente; os resultados antes do ajuste estão na seção 8.1."
  - "Ajuste não faz parte da calibração."
- **Faixa parcial:** "A calibração foi limitada a <faixa> por solicitação do cliente."
- **Informações do cliente:** "Os dados identificados como 'informação fornecida pelo cliente' são de responsabilidade do cliente e podem afetar a validade dos resultados."
- **Leituras com resolução estendida** (modo de teste com d/10): aviso exigido pelo EURAMET cg-18, item 8.3.

### 5.7 Especificação visual

| Aspecto | Proposta |
|---|---|
| Papel e orientação | A4 retrato. Margens de 15 mm; superior e inferior de 12 mm. |
| Cabeçalho | ≈ 28 mm. Logo à esquerda; título e número à direita; "Página X de Y". Nas páginas 2+, cabeçalho reduzido. |
| Rodapé | ≈ 10 mm. Nº do certificado, página, código e revisão do formulário, aviso de reprodução. |
| Tipografia | Sem serifa: Inter, Roboto, Source Sans ou Helvetica. Corpo de 9 pt, tabelas de 8 a 8,5 pt, rodapé de 7 pt, título de 15 pt. Números tabulares. |
| Cor | Uma cor de marca nas faixas de título de seção (tom claro, 10–15 %) e no logo. Texto preto. Tabelas com cabeçalho cinza-claro e linhas de 0,5 pt. Zebra opcional. |
| Números | Vírgula decimal. Separador de milhar com espaço fino (padrão SI) ou ponto, de forma consistente. Casas decimais: indicação, carga e erro com as casas de d; U com as casas de d ou uma a mais (no máximo 2 algarismos significativos), arredondado para cima. Nunca menos casas que d. |
| Tabelas | Unidade no cabeçalho da coluna. O cabeçalho se repete se a tabela quebrar de página. Linhas sem dado não são impressas. |
| Gráfico | Vetorial, em escala de cinza com marcadores, legível em preto e branco. Eixo X é a carga, eixo Y é o erro. Barras ±U e, se houver, linhas tracejadas de ±EMA. |
| Integridade | PDF/A. Assinatura PAdES (ICP-Brasil, e-CNPJ A1) ou, no mínimo, assinatura eletrônica com hash SHA-256 registrado no servidor. Edição bloqueada. |

### 5.8 Etiqueta de calibração (fixada na balança)

```
┌──────────────────────────────────────────┐   50 × 30 mm (ou 60 × 40 mm)
│ [logo] CALIBRADO           ┌────┐        │   poliéster ou vinil, impressão térmica
│ Cert. CC-2026-00123        │ QR │        │   o QR aponta para a mesma URL de verificação
│ Data: 14/10/2026           └────┘        │
│ Próx.: 10/2027 (definida pelo cliente)   │   ← só se houver acordo (ISO/IEC 17025, 7.8.4.3)
│ Téc.: J. Silva   TAG: BAL-07             │
└──────────────────────────────────────────┘
```

Referências de mercado que já usam etiqueta com QR code: Exatitec (CAL 0859), Instemaq e Metquay.

---

## 6. Cadastro do instrumento (balança)

### 6.1 Portaria de aprovação de modelo (PAM): onde aparece na balança e como consultar

**O que é**

- Ato do Inmetro, publicado no DOU, que aprova o modelo de um instrumento de medição.
- Para balanças, é emitido com base no RTM da Portaria 157/2022 (antes, a 236/94).
- Exemplo real: **Portaria Inmetro/Dimel nº 133, de 14/05/2008**, que aprova o modelo 9097 de dispositivo indicador eletrônico Toledo.
- Uma balança composta pode ter **PAM do indicador** e **PAM do instrumento completo**.

**Onde aparece na balança**

A Portaria 157/2022 manda agrupar na **placa de identificação** (plaqueta), ou no corpo da balança em local visível (7.4.2), as seguintes inscrições:

- marca ou nome do fabricante;
- classe, em algarismo romano dentro de um oval;
- Max, Min e e;
- e, quando aplicável (7.2): nº de série, **identificação da aprovação de modelo**, d, T, Lim e faixa de temperatura.

Regras de apresentação:

- A placa é selada (7.4.4).
- Max, Min, e e d se repetem perto do mostrador (7.4.3).
- Em balanças compostas (indicador + plataforma), as inscrições do instrumento completo **ficam no indicador** (7.5.4.2).

Na prática, segundo o blog da Toledo do Brasil sobre as exigências do Inmetro, a plaqueta traz:

- fabricante (nome, endereço e CNPJ);
- modelo;
- **mês/ano de fabricação**;
- faixa de temperatura;
- nº de série;
- consumo;
- **"Port. Inmetro nº NNN/AAAA"** (número e ano da portaria de aprovação de modelo);
- Max, Min, e e d;
- classe.

Onde fica a plaqueta, por tipo de balança:

| Tipo | Localização típica |
|---|---|
| Bancada / comercial | Traseira ou embaixo da balança. |
| Plataforma e rodoviária | Lateral ou traseira do **indicador**, e na estrutura da plataforma ou no pilar. |

**Como consultar**

- Portal de Legislação do Inmetro → **Portarias de Aprovação de Modelo (PAM)**: http://www.inmetro.gov.br/legislacao/consulta.asp?seq_classe=2
- Filtros: tipo de instrumento de medida ("Balança"), marca, modelo, número do ato e ano.
- O resultado (`detalhe.asp?seq_classe=2&seq_ato=…`) traz o texto e o PDF.
- Alternativas:
  - busca no DOU (in.gov.br);
  - agregadores como o Target;
  - o IPEM-PR, que lembra que "as aprovações de modelo são documentos públicos e ficam disponíveis no site do Inmetro".

**Recomendação para o sistema**

- Guardar a PAM **estruturada**:
  - órgão (Inmetro, Inmetro/Dimel …);
  - número;
  - ano;
  - data (opcional);
  - link;
  - texto como está gravado na placa.
- Ter um **catálogo interno de modelos** (fabricante + modelo → PAM, Max/e típicos, tipo) para preencher automaticamente os cadastros seguintes.
- Sempre pedir a **foto da plaqueta**.

**Marca de verificação (selo) do Inmetro/IPEM**

- Indica o ano da verificação.
- A validade é de 1 ano, até o fim do ano civil.
- Registrar o nº, o ano e os lacres. Isso ajuda a avisar o cliente quando a verificação legal está vencida, algo diferente da calibração.

### 6.2 Tipos de balança (enum sugerido)

| Código | Rótulo | Observações para o sistema |
|---|---|---|
| `BANCADA` | De bancada / balcão (pesadora) | Prato retangular. Excentricidade em 5 posições. |
| `COMPUTADORA` | Computadora / de preço (comercial, com etiqueta ou PDV) | Uso comercial, sujeita a verificação legal. |
| `CONTADORA` | Contadora | Registrar a relação de contagem (inscrição 1:…). |
| `PLATAFORMA` | De plataforma (piso ou sobre o piso) | Dimensões C × L. Indicador separado. Células. |
| `PISO_EMBUTIDA` | De piso embutida / fosso | Idem. |
| `PALLET` | De pallet / transpaleteira / de garfo | Receptor em "U" ou garfos. Excentricidade adaptada. |
| `RODOVIARIA` | Rodoviária (pesagem de veículos) | Nº de módulos e apoios. Cargas de substituição. Excentricidade por apoio. |
| `FERROVIARIA` | Ferroviária | Idem. |
| `ANALITICA` | Analítica (d ≤ 0,1 mg) | Classe I. Mais pontos (11, segundo a UFSC). Prato redondo. |
| `SEMIANALITICA` | Semianalítica / de precisão | Classe II. |
| `PRECISAO` | De precisão / laboratório | Classe II. |
| `SUSPENSA` | Suspensa / gancho (dinamômetro) | Sem excentricidade. Carga suspensa. |
| `PESSOAS` | Antropométrica / pediátrica / pessoas | Uso em saúde. |
| `SILO_TANQUE` | Sistema de pesagem em silo / tanque (células) | Calibração por substituição ou com cargas especiais. |
| `OUTRA` | Outra (descrever) | Texto livre obrigatório. |

Separados do tipo, cadastrar também:

- **Construção:** eletrônica, mecânica ou eletromecânica.
- **Indicação:** digital ou analógica.

### 6.3 Campos do cadastro da balança

**Legenda**

- **S**: sim (obrigatório).
- **N**: não.
- **R**: recomendado (aviso se vazio).
- **C**: condicional.
- **D**: derivado (calculado).

**Identificação e situação**

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `id` | UUID | D | Interno. |
| `cliente_id` | FK Cliente | S | |
| `local_id` | FK LocalCliente (unidade/endereço) | S | Padrão: a sede. Ver §8. |
| `setor_local_instalacao` | texto(80) | R | Ex.: "Expedição", "Balança de entrada". |
| `tag_cliente` | texto(40) | R | Identificação do cliente. Vai para o certificado e a etiqueta. Aviso se repetida no mesmo cliente. |
| `patrimonio` | texto(40) | N | |
| `descricao` | texto(120) | D/editável | Gerada como "tipo + Max". |
| `tipo` | enum (§6.2) | S | Define o diagrama e o procedimento padrão. |
| `construcao` | enum (eletrônica, mecânica, eletromecânica) | S | Padrão: eletrônica. |
| `indicacao` | enum (digital, analógica) | S | |
| `fabricante` | texto + catálogo | S | Aceita "Não consta". |
| `modelo` | texto | S | Aceita "Não consta". |
| `numero_serie` | texto(60) | S | Aceita "Não consta", que gera um flag. |
| `ano_fabricacao` (`mes_fabricacao`) | inteiro AAAA (MM) | N | Vem da plaqueta. |
| `pam_orgao` / `pam_numero` / `pam_ano` / `pam_data` / `pam_url` | enum / inteiro / inteiro / data / URL | R (S se uso comercial) | Ver §6.1. |
| `pam_texto_placa` | texto | N | Exatamente como gravado. |
| `uso` | enum (transação comercial/legal, controle de processo, laboratório, saúde, logística, outro) | S | Define as notas e o alerta de verificação legal. |
| `sujeito_controle_legal` | booleano | D | Derivado do uso; editável. |
| `marca_verificacao_inmetro` | texto (nº/ano) | N | Selo IPEM. |
| `lacres` | lista de texto | N | |
| `ultima_verificacao_legal` | data/ano | N | |
| `situacao` | enum (ativa, inativa, fora de uso, sucateada, transferida) | S | |
| `fotos` | arquivos de imagem (geral, plaqueta, indicador, local) | R | Foto da plaqueta fortemente recomendada. |
| `observacoes` | texto longo | N | |
| `criado_em/por`, `atualizado_em/por` | auditoria | D | |

**Características metrológicas**

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `unidade` | enum (mg, g, kg, t) | S | |
| `max` | decimal | S | Faixa única. Se multifaixa, é o maior Max. |
| `min` | decimal | R | Da plaqueta. |
| `e` | decimal | S (= d se não declarado) | Divisão de verificação. |
| `d` | decimal | S | Divisão real (resolução). |
| `classe` | enum (I, II, III, IIII, não declarada) | S | |
| `n` | inteiro | D | n = Max/e. |
| `tipo_multiplicidade` | enum (faixa única, **múltiplas faixas**, **múltiplos intervalos/divisões**) | S | Conforme a Portaria 157/2022, itens 1.6.2.6 e 1.6.2.7. |
| `faixas[]` | subtabela: i, Max_i, Min_i, e_i, d_i | C | Obrigatório se não for faixa única. Na placa: "BAL.1 III e = 0,002 kg Max = 6 kg / BAL.2 III e = 0,005 kg Max = 15 kg". |
| `tara_max` (T = −…) | decimal | N | |
| `carga_limite` (Lim) | decimal | N | |
| `faixa_temperatura` | texto (ex.: −10/+40 °C) | N | |

**Receptor de carga, para excentricidade e cargas**

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `formato_receptor` | enum (prato redondo, prato/plataforma retangular, multi-apoio longitudinal (rodoviária/ferroviária), gancho, garfos, outro) | S | Escolhe o diagrama e o nº de posições. |
| `dimensoes` | decimal × 2 (C × L, em mm) ou Ø | R (S para plataforma e rodoviária) | |
| `n_apoios` / `n_celulas` | inteiro | C | Obrigatório para rodoviária e plataforma. Define os pontos de excentricidade. |
| `n_modulos` | inteiro | C | Rodoviária. |
| `instalacao` | enum (sobre o piso, embutida/fosso, sobre-solo com rampas, suspensa) | N | |

**Componentes (balança composta)**

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `indicador` | fabricante, modelo, nº de série, PAM, versão de firmware | C | Obrigatório para plataforma, rodoviária e piso. |
| `receptor` | fabricante, modelo, nº de série | C | |
| `celulas[]` | fabricante, modelo, capacidade (Emax), classe OIML R60 (ex.: C3), nº de série, quantidade | N | Útil para manutenção e para o histórico de troca. |
| `caixa_juncao` | texto | N | |

**Requisitos do cliente para a calibração**

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `faixa_calibrar_de` / `ate` | decimal | D/editável | Padrão de 0 a Max (DOQ-CGCRE-097, 10.5.1). |
| `faixas_calibrar` | lista | C | Multifaixa: escolha do cliente (10.5.2). |
| `pontos_calibracao` | lista de decimais | D/editável | Padrão de ≥ 6 pontos, incluindo 0 (ou Min) e Max (UFSC/CETESB). 11 pontos para a classe I. |
| `carga_excentricidade` | decimal | D | Regra do DOQ-CGCRE-097, 10.4 (§6.5). |
| `carga_repetibilidade` / `n_repeticoes` | decimal / inteiro | D | Padrão: ≈ 50 % de Max e 5 repetições (10 para a classe I, 3 para rodoviária). |
| `criterio_aceitacao` | enum (nenhum, EMA de verificação, **EMA em serviço (2×)**, % da leitura, valor absoluto, personalizado) + valor | N | Só gera declaração de conformidade se preenchido. |
| `regra_decisao` | enum (aceitação simples \|E\| ≤ EMA; banda de guarda \|E\| + U ≤ EMA) | C | Obrigatório se houver critério. |
| `periodicidade_meses` | inteiro | R | Padrão de 12 meses (IPEM-PR, HU-UFGD). Marcado como **informação do cliente**. |
| `proxima_calibracao` | data | D | Última calibração + periodicidade. Alimenta os lembretes. |
| `procedimento_id` | FK Procedimento | D/editável | Padrão definido pelo tipo de balança. |
| `exige_dados_brutos` | booleano | N | Imprime o anexo. |

### 6.4 Por que separar indicador, receptor e células

- Nas balanças de plataforma e rodoviárias, o **indicador é trocado com frequência**.
- Pela Portaria 157/2022, item 7.5.4.3, as inscrições passam para o novo indicador.
- O histórico precisa mostrar "a partir de <data>, indicador X substituído por Y".
- Por isso os componentes devem ter **vigência**: data de início e data de fim.
- O certificado imprime os componentes vigentes na data da calibração.

### 6.5 Regras de validação e valores derivados

**Classes de exatidão** (Portaria 157/2022, Tabela 3; OIML R76-1)

| Classe | Valor de e | n mín. | n máx. | Min |
|---|---|---|---|---|
| I (especial) | e ≥ 0,001 g | 50 000 | — | 100 e |
| II (fina) | 0,001 g ≤ e ≤ 0,05 g | 100 | 100 000 | 20 e |
| II (fina) | e ≥ 0,1 g | 5 000 | 100 000 | 50 e |
| III (média) | 0,1 g ≤ e ≤ 2 g | 100 | 10 000 | 20 e |
| III (média) | e ≥ 5 g | 500 | 10 000 | 20 e |
| IIII (ordinária) | e ≥ 5 g | 100 | 1 000 | 10 e |

**EMA na verificação** (Portaria 157/2022, Tabela 5; OIML R76-1). **O EMA em serviço é o dobro** (item 2.5.3).

| EMA | Classe I | Classe II | Classe III | Classe IIII |
|---|---|---|---|---|
| ±0,5 e | 0 ≤ m ≤ 50 000 e | 0 ≤ m ≤ 5 000 e | 0 ≤ m ≤ 500 e | 0 ≤ m ≤ 50 e |
| ±1,0 e | 50 000 e < m ≤ 200 000 e | 5 000 e < m ≤ 20 000 e | 500 e < m ≤ 2 000 e | 50 e < m ≤ 200 e |
| ±1,5 e | m > 200 000 e | 20 000 e < m ≤ 100 000 e | 2 000 e < m ≤ 10 000 e | 200 e < m ≤ 1 000 e |

**Exemplo:** rodoviária com Max 80 000 kg e e = 20 kg, logo n = 4000, classe III.

| Faixa de carga | EMA na verificação | EMA em serviço |
|---|---|---|
| 0 a 10 000 kg | ±10 kg | ±20 kg |
| 10 000 a 40 000 kg | ±20 kg | ±40 kg |
| 40 000 a 80 000 kg | ±30 kg | ±60 kg |

**Validações**

São avisos, não bloqueios, porque balanças antigas podem fugir à regra.

- d ≤ e ≤ 10 d. O valor de e deve ser 1, 2 ou 5 × 10^k.
- n = Max/e dentro dos limites da classe.
- Min coerente com a classe.
- Multifaixa: e1 < e2 < … e Max1 < Max2 < ….
- Max e Min impressos no certificado devem bater com a plaqueta. Pedir confirmação se a foto da plaqueta foi anexada.

**Carga de excentricidade derivada** (DOQ-CGCRE-097, 10.4)

| Max | Carga mínima de excentricidade |
|---|---|
| ≤ 500 kg | 1/3 de Max |
| > 500 kg até 3000 kg | 1/5 de Max |
| > 3000 kg | 1/10 de Max |

Nas rodoviárias, a carga é aplicada **sobre cada apoio**. A Sannar usou 22,1 t em uma balança de 100 t, com 6 posições.

**Posições de excentricidade por formato**

| Formato | Posições |
|---|---|
| Retangular ou quadrado | 5: centro, depois os 4 quadrantes. Retorna ao centro. |
| Redondo | 5: centro e 4 posições a 90°. |
| Rodoviária | Uma posição por apoio ou par de células, ao longo do comprimento (Sannar e MOP). |
| Gancho | Não se aplica. |

---

## 7. Cadastro dos padrões

### 7.1 Modelo de dados recomendado

```
Padrao (abstrato) ──┬── Peso ──(N:1 opcional)── JogoDePesos
                    ├── TermoHigrometro / Barometro / TermoBaroHigrometro
                    └── CargaSubstituicao (massa auxiliar, ex. caminhão/blocos)

CertificadoPadrao (1) ──< ResultadoPeso (uma linha por peso)  >── Peso
                    └──< ResultadoAuxiliar (uma linha por ponto/grandeza) >── Auxiliar
Padrao (1) ──< CertificadoPadrao (histórico; um "vigente" por data)
Calibracao (1) ──< PadraoUsado (snapshot: valor conv., U, k, deriva, densidade, certificado, validade)
```

**Peso individual × jogo de pesos**

- A **unidade de rastreabilidade é o peso individual.**
  - O certificado de um jogo traz uma linha por peso (como no Unical: 001 a 020).
  - A carga de ensaio é a soma de pesos específicos.
  - O DOQ-CGCRE-097, item 10.7.4, manda **somar aritmeticamente** o valor convencional, o erro, U e a deriva dos pesos usados.
- O **jogo** é um agrupamento lógico e físico (estojo, código do conjunto) que facilita a seleção no campo. Por exemplo, "JP-01 (1 g a 5 kg)" ou "PP500-01 a 20".
- Pesos repetidos no mesmo jogo são distinguidos pela marcação: 2 kg e 2 kg\* (como no certificado Unical, "\*Ponto de identificação").

### 7.2 Campos do peso-padrão

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `id` / `codigo` | UUID / texto(30) único | S | Código gravado ou etiquetado no peso, por exemplo PP20-07. |
| `jogo_id` | FK JogoDePesos | N | |
| `valor_nominal` + `unidade` | decimal + enum (mg, g, kg) | S | |
| `classe_oiml` | enum (E1, E2, F1, F2, M1, M1–2, M2, M2–3, M3) | S | OIML R111 e Portaria Inmetro 289/2021. "Classe declarada" no certificado. |
| `material` | enum (aço inox, ferro fundido, latão cromado, latão, outro) + texto | S | Afeta a densidade e o empuxo. |
| `massa_especifica` | decimal (kg/m³) + `u_massa_especifica` | R | Do certificado. Valores típicos: aço inox ≈ 7950–8000; ferro fundido ≈ 7100–7850 (Unical: 7850); latão ≈ 8400–8600. Se não informado, usar 8000 por convenção. |
| `formato` | enum (cilíndrico com botão, disco, retangular/lingote, paralelepípedo com pega "tipo maleta", lâmina/fio, outro) | S | |
| `marcacao` | texto | N | Ex.: "2 kg\*", "M1". |
| `camara_ajuste` | booleano | N | |
| `fabricante` / `numero_serie` | texto | N | |
| `proprietario` | enum (próprio, terceiro/locado) + texto | S | |
| `localizacao` | texto / FK (base, veículo, técnico) | R | Útil para rodoviárias e a logística dos pesos de 500 kg. |
| `status` | enum (ativo, em calibração, bloqueado, extraviado, baixado) | S | |
| `intervalo_calibracao_meses` | inteiro | S | Política interna. |
| `certificado_vigente_id` | FK | D | |
| `ema_classe` | decimal | D | Da tabela OIML R111 (§7.7). |
| `deriva_estimada` | decimal | D | Diferença entre os dois últimos certificados. Sem histórico, usa o EMA (DOQ-CGCRE-097, 10.7.5). |
| `fotos`, `observacoes` | arquivo / texto | N | |

### 7.3 Campos do jogo de pesos

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `codigo` | texto único | S | Ex.: JP-01. |
| `descricao` | texto | S | Ex.: "Jogo de pesos 1 g a 5 kg, 23 peças". |
| `classe_oiml` | enum | S | Igual à dos pesos ou à pior delas. |
| `composicao` | D (lista dos pesos vinculados) | D | Quantidade e soma total. |
| `estojo` | texto | N | |
| `status`, `localizacao` | enum / texto | S / R | |

### 7.4 Campos do certificado do padrão (pesos e auxiliares)

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `numero` | texto | S | |
| `laboratorio_nome` | texto | S | |
| `acreditado` + `numero_cal` | booleano + texto (ex.: CAL 0529) | S | Para dizer "rastreável à RBC", **acreditado = sim** e informar o CAL. |
| `data_calibracao` / `data_emissao` | data | S / R | |
| `data_validade` (próxima calibração) | data | S | Definida pela **política da Balanças.com**, porque o laboratório não deve recomendar intervalo. |
| `arquivo_pdf` | arquivo | S | |
| `ajuste_realizado` | booleano | S | Valores antes e depois do ajuste. |
| `analise_critica` | status (pendente/aprovado/reprovado) + checklist + quem + quando | S | Padrão não liberado para uso até ser aprovado. |
| `observacoes` | texto | N | |

**ResultadoPeso** (uma linha por peso)

- `peso_id`.
- `valor_nominal`.
- `massa_convencional_antes` e `massa_convencional_apos` (valor encontrado).
- `correcao`: D, igual a mc − nominal.
- `U`, `k` e `veff` (este opcional).
- `massa_especifica`.
- `conforme_classe`: D. A regra da OIML R111 é \|mc − m0\| ≤ δm − U e U ≤ δm/3.

**ResultadoAuxiliar** (uma linha por ponto)

- `grandeza` (T, UR ou P).
- `valor_referencia`.
- `indicacao`.
- `correcao` (ou erro).
- `U` e `k`.

### 7.5 Termo-higrômetro e barômetro

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `codigo` | texto único | S | Ex.: TH-02. |
| `tipo` | enum (termo-higrômetro, barômetro, termo-baro-higrômetro, termômetro) | S | |
| `fabricante` / `modelo` / `numero_serie` | texto | S | |
| `faixa_temperatura` / `faixa_ur` / `faixa_pressao` | texto/decimais | S (conforme o tipo) | |
| `resolucao_t` / `resolucao_ur` / `resolucao_p` | decimal | S | Validar: T ≤ 0,5 °C; UR ≤ 1 %; P ≤ 1 mbar (laboratório) ou 5 mbar (campo), conforme o DOQ-CGCRE-097, 9.4. |
| `aplica_correcao` | booleano | S | Se sim, usa a tabela do certificado para corrigir a leitura. |
| `intervalo_calibracao_meses` | inteiro | S | Aviso se for maior que 24 (DOQ-CGCRE-097, 9.5). |
| `status`, `localizacao` | enum / texto | S / R | |
| Certificados | CertificadoPadrao + ResultadoAuxiliar | S | |

### 7.6 Regras e alertas

1. **Bloqueio rígido:** padrão vencido na **data da calibração**, bloqueado ou com análise crítica pendente **não pode ser selecionado**.
   - Se o certificado do padrão for renovado depois, a calibração antiga mantém o snapshot do certificado da época.
2. **Alertas de vencimento:**
   - 60, 30, 15 e 7 dias antes, com painel "Padrões a vencer";
   - e-mail semanal ao responsável técnico;
   - aviso no aplicativo de campo ao montar a OS.
   - Referências de mercado: Calibriq ("Padrões vencendo"), Beamex CMX e GAGEtrak.
3. **Adequação do peso à balança:**
   - o erro do padrão não deve passar de **1/3 do EMA da balança** na carga aplicada (OIML R76-1, item 3.7.1);
   - sugerir a classe mínima: balança classe III até 10 000 divisões → M1 (KN Waagen); classe II → F1/F2; classe I → E2/F1 (UFSC);
   - o IPEM-PR ilustra o risco com um exemplo: um peso de 20 g classe M3 pode ter erro de até 25 mg, maior que a resolução de 1 mg de uma balança de 0,001 g.
4. **Deriva:** a cada novo certificado, calcular Δmc em relação ao anterior. Se Δmc passar de U, ou de EMA/3, alertar.
5. **Integridade:** todo certificado de padrão tem PDF anexado. A página pública de verificação da balança pode listar os padrões usados com o nº do certificado, como faz a FG Balanças.

### 7.7 EMA (δm) dos pesos, OIML R111-1, em mg (valores frequentes)

| Nominal | F1 | F2 | M1 | M2 | M3 |
|---|---|---|---|---|---|
| 1 g | 0,10 | 0,3 | 1,0 | 3,0 | 10 |
| 10 g | 0,20 | 0,6 | 2,0 | 6,0 | 20 |
| 20 g | 0,25 | 0,8 | 2,5 | 8,0 | 25 |
| 100 g | 0,5 | 1,6 | 5,0 | 16 | 50 |
| 500 g | 2,5 | 8,0 | 25 | 80 | 250 |
| 1 kg | 5,0 | 16 | 50 | 160 | 500 |
| 2 kg | 10 | 30 | 100 | 300 | 1 000 |
| 5 kg | 25 | 80 | 250 | 800 | 2 500 |
| 10 kg | 50 | 160 | 500 | 1 600 | 5 000 |
| 20 kg | 100 | 300 | 1 000 | 3 000 | 10 000 |
| 50 kg | 250 | 800 | 2 500 | 8 000 | 25 000 |
| 100 kg | 500 | 1 600 | 5 000 | 16 000 | 50 000 |
| 500 kg | 2 500 | 8 000 | 25 000 | 80 000 | 250 000 |
| 1 000 kg | 5 000 | 16 000 | 50 000 | 160 000 | 500 000 |

Conferência com as fontes:

- 20 g F1 = 0,25 mg e 20 g M3 = 25 mg (IPEM-PR).
- 50 kg M1 = 2500 mg (KN Waagen).
- 500 kg M1 = 25 g, coerente com o certificado Unical.

**Carregar a tabela completa da OIML R111 no sistema**, incluindo E1, E2, M1–2, M2–3 e os valores de 2 t e 5 t.

---

## 8. Cadastro do cliente

### 8.1 Cliente (empresa ou pessoa)

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `id` | UUID | D | |
| `tipo_pessoa` | enum (PJ, PF) | S | |
| `razao_social` / `nome` | texto(150) | S | Vai para o certificado. |
| `nome_fantasia` | texto(100) | N | |
| `cnpj` / `cpf` | texto validado (DV) | S (PJ) / R (PF) | Aviso de duplicidade. |
| `inscricao_estadual` / `municipal` | texto | N | Para faturamento. |
| `endereco` | CEP, logradouro, nº, complemento, bairro, cidade, UF | S | O CEP preenche o restante. |
| `telefone` / `whatsapp` | texto | R | |
| `email_principal` | e-mail | S | |
| `emails_certificados` | lista de e-mails | R | Destinatários do envio do certificado. |
| `emails_lembretes` | lista de e-mails | R | Destinatários dos avisos de vencimento. |
| `aceita_lembretes` (opt-in) + `data_consentimento` | booleano + data | S | LGPD. O e-mail traz link de descadastro. |
| `antecedencia_lembretes` | lista de inteiros (dias) | D/editável | Padrão: 60, 30 e 7 dias. |
| `requisitos_cliente` | texto e campos estruturados | N | Ex.: "exige RBC", nº mínimo de pontos, dados brutos, critério de aceitação padrão, prazo de entrega. |
| `formato_tag` | texto | N | Padrão da TAG do cliente. |
| `status` | enum (ativo, inativo, bloqueado) | S | |
| `observacoes` | texto | N | |
| `criado_em/por` | auditoria | D | |

### 8.2 Contatos (N por cliente)

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `nome` | texto | S | |
| `cargo` / `setor` | texto | N | |
| `email` / `telefone` / `whatsapp` | texto | R | |
| `papeis` | multi-enum (solicitante, recebe certificado, recebe lembrete, financeiro, acesso ao portal) | S | |

### 8.3 Locais e unidades de instalação (N por cliente)

| Campo | Tipo | Obr. | Observações |
|---|---|---|---|
| `nome_unidade` | texto | S | Ex.: "Fábrica 2 – Ipeúna". |
| `endereco` | igual ao do cliente | S | Pode diferir da sede. Vai para o certificado como "local da calibração". |
| `cnpj_unidade` | texto | N | Para filiais. |
| `contato_local` | FK Contato | N | |
| `instrucoes_acesso` | texto | N | Integração de segurança, EPI, horários. |

### 8.4 Solicitante × cliente no certificado

- Os certificados reais distinguem "Solicitante / Interessado" (Pensu) e "Contratante / Cliente" (Evagon e Unical).
- **Na OS e no certificado**, ter dois campos: **contratante** e **proprietário do instrumento**. O padrão é "o mesmo".
- Isso cobre os revendedores e prestadores que contratam a calibração em nome de terceiros.

---

## 9. Softwares de gestão de calibração no mercado

### 9.1 Brasileiros

| Produto | Perfil | Funcionalidades encontradas (segundo os fabricantes) | Fonte |
|---|---|---|---|
| **Calibre.Software** | SaaS ou on-premises, para laboratórios de calibração | Emissão automatizada de certificados; incerteza conforme o ISO GUM; controle de vencimentos por instrumento; acesso do cliente por "URL customizada" para ver equipamentos e certificados; "validação automática"; relatórios gerenciais; responsivo. Não menciona QR code, assinatura nem fluxo de aprovação. | https://calibre.software/ |
| **Calibriq** | Gestão completa do laboratório prestador | Fluxo **orçamento → pedido/OS → recebimento → programação/bancada → certificado → expedição/faturamento**; certificados RBC ou rastreáveis; status **"Aguardando revisão" → "Assinado"**; **código de verificação pública** (ex.: "7F3K-92QD"); cadastro de padrões e **kits**, alerta de **"padrões vencendo"**; dashboard de OS e calibrações vencidas; agenda da equipe; multiempresa e multifilial; perfis de acesso. | https://calibriq.com.br/ |
| **Cali LAB / Cali WEB** | Desktop + web, para laboratórios ISO/IEC 17025 | Controle de serviços (status e prazos); instrumentos e padrões de referência; emissão de certificados e envio aos clientes; Cali WEB disponibiliza certificados ao cliente e relatórios. | https://cali.com.br/ |
| **MK 3.3 (LCDS)** | Rede ou web | Cálculos de erros e incertezas personalizáveis; emissão de certificados; controle de validade; modelos para balanças (segundo o resumo da busca, porque a página estava fora do ar). | https://www.lcds.com.br/mk.asp |
| **Metroex** | Laboratório prestador | **Portal do cliente** ("Webview"); **QR code automático para autenticidade**; **e-mails periódicos de vencimento**; **registro em campo offline** (aplicativo); modelos de registro, incerteza e relatório personalizáveis; relatórios e indicadores. | https://metroex.com.br/ |
| **Sistema de Calibração ABC71** | Usuário final (indústria), módulo de ERP | Alerta de vencimento por e-mail; histórico; aprovação automática por tolerância; **estudo de Schumacher** para ajustar o intervalo; empréstimo de instrumentos por código de barras; 100 % em nuvem. | https://sistemadecalibracao.com.br/ |
| **Qualiex** | Usuário final | Alertas automáticos; histórico; **análise de certificados com critério de aceitação**; assinatura eletrônica. | https://qualiex.com/gestao-de-instrumentos-de-medicao/ |
| **8Quali** | Usuário final | Aviso de vencimento por e-mail; busca de certificados. | https://8quali.com.br/gestao-de-calibracao/ |
| **myLIMS (Labsoft, hoje Confience)** | LIMS genérico | Módulo de "gestão de calibração e manutenção de equipamentos". | https://www.b2bstack.com.br/compare/softexpert-eqm-vs-mylims |
| Laboratórios com sistema próprio | Referência de serviço | **Exatitec (CAL 0859):** certificado digital em até 5 dias úteis, **etiqueta com QR code na balança**, área do cliente e vencimentos controlados. **Instemaq:** etiqueta com QR code abre a página do certificado. **Marte:** "Portal Marte Certificados". **Elicrom:** software ELISA. | exatitec.com.br, instemaq.com.br/qr-code, marte.com.br |

**Nomes citados pelo usuário que não foram encontrados**

- Metroquality, SIGEM, QualiLab e Metrus **não foram encontrados** como produtos de calibração em buscas específicas. Podem ser nomes locais ou internos, ou a grafia pode ser diferente.
- Um projeto open source de certificados de balança (TScerti, de uma empresa de balanças, com portal do cliente, QR code e PWA de campo no roadmap) apareceu na busca, mas o repositório **não estava acessível** (404). Não foi verificado.

### 9.2 Internacionais

| Produto | Perfil | Funcionalidades relevantes | Fonte |
|---|---|---|---|
| **Fluke MET/TEAM (+ MET/CAL)** | Laboratórios prestadores e internos | Fluxo de trabalho (recebimento, OS, expedição); **"Equipment recall"**: relatório e **e-mails de "calibration due" personalizados por cliente, com escalonamento para até 3 níveis de contato**; **portal web do cliente** (opcional, somente leitura: status das OS, ativos, recall e certificados, cada cliente vê só os seus dados); certificados em Crystal Reports com a marca, impressão em lote; **aplicativo móvel** com sincronização; código de barras. | fluke.com (página do MET/TEAM) |
| **Beamex CMX** | Indústria de processo | **Módulo de pesagem** baseado em EURAMET, OIML e NIST: excentricidade, repetibilidade, pesagem e peso mínimo; **incerteza calculada** em cada calibração; rastreabilidade dos **jogos de pesos** e das **condições ambientais** (T antes e depois, P, UR), com data, hora e executor; **guia passo a passo** em campo; app bMobile; integração com SAP e Maximo. | beamex.com (brochura do CMX) |
| **Qualer** | Nuvem, para prestadores e clientes | **Portal do cliente** com instrumentos vencidos e a vencer; armazenamento e download de certificados; alertas; **o cliente abre a própria OS**. | https://cps.nz/qualer |
| **GAGEtrak** | Usuário final | Calendário de calibrações; **e-mail automático de vencimentos**; histórico e **trilha de auditoria**; certificados e **etiquetas com código de barras**; FDA 21 CFR Part 11; API REST; cerca de US$ 29 a 79 por usuário/mês (segundo terceiros). | getapp.com, capterra.com |
| **Metquay** | Laboratórios comerciais | **Portal do cliente com a marca do laboratório**; etiquetas com **QR code e código de barras**; certificados e etiquetas por **template**; **approval workflow**; alertas e e-mail de recall; OS em campo. | softwareadvice.com.au, getapp.com |
| **IndySoft / ProCalV5** | Médio e grande porte | Gerador de relatórios para certificados e etiquetas; ISO/IEC 17025 e Part 11; **fluxo de aprovação**; **trilha de auditoria**; rastreabilidade. | capterra.com |

### 9.3 Leitura de mercado

**O que todos têm**

- Cadastro de instrumentos e padrões.
- Controle de vencimento com alertas.
- Histórico.
- Emissão de certificado por modelo.

**O que os voltados a prestadores acrescentam**

São o caso da Balanças.com:

- **portal do cliente**;
- **lembretes ao cliente** (com escalonamento, no caso do MET/TEAM);
- **QR code ou código de verificação**;
- **fluxo de revisão e assinatura**;
- **aplicativo de campo offline**;
- **etiqueta com QR code**.

**O que é raro e diferencia**

- Cálculo de incerteza específico para balanças conforme o EURAMET cg-18 (Beamex CMX).
- Ensaios de balança guiados: excentricidade com diagrama e repetibilidade.
- Gráfico de erro × carga.
- Declaração de conformidade com regra de decisão.

---

## 10. Funcionalidades priorizadas para o sistema

### 10.1 Essencial (MVP)

1. **Cadastros:**
   - clientes, contatos e locais;
   - balanças (com componentes e faixas);
   - padrões (pesos, jogos e auxiliares) com certificados e resultados por peso;
   - técnicos e signatários;
   - procedimentos;
   - biblioteca de frases.
2. **Ordem de serviço e registro da calibração:**
   - ensaios de excentricidade (com diagrama por formato), repetibilidade e erro de indicação;
   - antes e depois do ajuste;
   - condições ambientais no início e no fim.
3. **Motor de cálculo:**
   - erro e média;
   - desvio-padrão;
   - erro de excentricidade;
   - **incerteza (U, k, νeff por Welch-Satterthwaite)** com os componentes do DOQ-CGCRE-097, item 10.7.1;
   - **arredondamento coerente com d**;
   - validação de plausibilidade.
4. **Controle de padrões:**
   - **bloqueio de padrão vencido, bloqueado ou sem análise crítica**;
   - verificação de adequação do peso (erro ≤ 1/3 do EMA);
   - snapshot do certificado do padrão em cada calibração.
5. **Geração do PDF** no layout do §5: PDF/A, gerado no servidor, idêntico em toda emissão.
6. **Fluxo de status:**
   - `rascunho → em revisão → (devolvido) → emitido → [substituído | cancelado]`;
   - **o aprovador deve ser diferente do executor** (ISO/IEC 17025, 7.8.1.1);
   - **trilha de auditoria**: quem, quando e o que mudou;
   - **depois de emitido, o certificado não pode ser editado**.
7. **Numeração automática na emissão** (§11), sem buracos nem reuso.
8. **Revisão e cancelamento** conforme a ISO/IEC 17025, 7.8.8:
   - a revisão gera um novo nº com sufixo, referencia o original e registra o motivo;
   - o original fica marcado como "substituído";
   - o cancelamento exige motivo e mantém o registro.
9. **QR code e página pública de verificação.** A página mostra:
   - status: válido, substituído (com link para o novo) ou cancelado;
   - nº e datas;
   - cliente (sem dados pessoais);
   - instrumento;
   - signatário;
   - **hash SHA-256**;
   - download do PDF original.

   O acesso é por token aleatório, com rate-limit.
10. **Envio do certificado por e-mail:** link e/ou anexo, para a lista `emails_certificados`, com registro de envio.
11. **Controle de vencimento das balanças dos clientes**, com **lembrete por e-mail**:
    - padrão em D-60, D-30 e D-7, mais um aviso de vencida em D+1;
    - **um e-mail por cliente listando todas as balanças** que vencem no período;
    - opt-out conforme a LGPD.
12. **Histórico do instrumento:** calibrações, ajustes, trocas de indicador e de células, fotos.
13. **Alertas de vencimento dos padrões:** painel e e-mail interno.
14. **Relatórios básicos:**
    - certificados emitidos por período, cliente e técnico;
    - vencimentos do mês, que também servem como previsão de demanda.
15. **Backup e retenção de no mínimo 5 anos** dos certificados, PDFs e dados brutos. É a prática dos laboratórios analisados.

### 10.2 Importante (fase 2)

16. **Gráfico de erro × carga** no certificado, mais um gráfico de **tendência** entre calibrações no histórico.
17. **Modelos de procedimento por tipo de balança:** pontos padrão, carga de excentricidade, nº de repetições, frases.
18. **Declaração de conformidade** com critério do cliente (EMA da Portaria 157/2022 em serviço, % ou valor absoluto) e **regra de decisão** configurável.
19. **Portal do cliente:**
    - login;
    - lista de balanças com status (em dia, a vencer, vencida);
    - certificados e download em lote;
    - pedido de agendamento.
    - Referências: MET/TEAM, Qualer, Metquay, Metroex, Exatitec.
20. **Etiqueta de calibração com QR code**, para impressora térmica.
21. **Assinatura digital ICP-Brasil (PAdES)** do PDF, com e-CNPJ A1, além do hash.
22. **Aplicativo ou PWA de campo offline:** coleta de leituras, fotos da plaqueta, sincronização posterior.
23. **Anexo de dados brutos** opcional, por cliente.
24. **Análise crítica dos certificados dos padrões** com checklist.
25. **Relatórios gerenciais:** produtividade, tempo entre calibração e emissão (meta de até 5 dias úteis, como a Exatitec), taxa de não conformidade.

### 10.3 Desejável ("nice to have")

26. Lembretes e envio por **WhatsApp**, com escalonamento por nível de contato (como o MET/TEAM).
27. Agenda e roteirização das visitas. Logística dos pesos de 500 kg e do caminhão.
28. Orçamento, OS e faturamento (NFS-e), integrados ou por exportação.
29. Captura automática das leituras pela **porta serial ou USB do indicador**.
30. Cálculo de **peso mínimo** e de "incerteza em uso" (EURAMET cg-18, 8.4) para clientes farmacêuticos e de laboratório.
31. Sugestão de intervalo por deriva ou histórico (método de Schumacher, como o ABC71). Só como **sugestão ao cliente**.
32. **Certificado digital em XML (DCC, PTB)**, legível por máquina.
33. Catálogo de modelos com a PAM, para preencher o cadastro automaticamente.
34. Verificação intermediária feita pelo próprio cliente, usando os dados do certificado (critério de 3 s do IPEM-PR).
35. API, multiempresa e importação de planilhas legadas.

---

## 11. Numeração do certificado

### 11.1 Padrões observados

| Emissor | Exemplo | Estrutura |
|---|---|---|
| Pensu Exactu (RBC) | `39059.50` | nº do processo + sufixo |
| Sannar (RBC) | `RBC677/2023` | prefixo do tipo (RBC) + sequencial/ano |
| Metrotec (não RBC) | `51996/21` | sequencial contínuo/ano com 2 dígitos |
| Ideal Instrumentos | `2464-24` | sequencial-ano com 2 dígitos |
| Evagon (RBC) | `EVQ - 20812 - 01 / 2023` | área do laboratório + nº da OS + item / ano |
| ABSI (RBC) | `CAL - 242700/24` | prefixo + sequencial/ano com 2 dígitos |
| Unical (RBC, pesos) | `386/2026` | sequencial/ano |
| MOP Chile | `LCP-2026-C13` | laboratório-ano-sequencial (com letra) |
| Sigma Colômbia | `LMS24777` (relatório `R-9780`) | prefixo + sequencial contínuo. O nº do relatório interno é separado. |
| UFSC (modelo) | `DIM-XX` | prefixo da área + sequencial |
| Exemplos do usuário | `CC-2026/00123`, `0123/26` | prefixo-ano/seq; seq/ano |

### 11.2 Boas práticas

1. **Único e não reutilizável.** Número cancelado continua registrado como "cancelado".
2. **Atribuído só na emissão, depois da aprovação.**
   - O rascunho usa um ID interno, por exemplo `RASC-8F2A`.
   - Isso evita buracos na sequência por desistência.
   - O número é gerado em **transação com bloqueio** (tabela de sequência por ano), sem risco de duplicar com dois aprovadores simultâneos.
3. **Ano no número, com sequência anual reiniciada.** Facilita a leitura ("de que ano é?") e o arquivamento.
4. **Prefixo do tipo de documento**, como `CC` (certificado de calibração). Assim, outros documentos ganham séries próprias:
   - `RV` (relatório de verificação);
   - `LM` (laudo de manutenção);
   - uma eventual série RBC no futuro (a Sannar separa por prefixo).
5. **Seguro para nomes de arquivo e URLs:** evitar `/` e espaços. O ideal é largura fixa com zeros à esquerda, para ordenar corretamente.
6. **O número aparece em todas as páginas**, junto com "Página X de Y".
7. **Revisão** (ISO/IEC 17025, 7.8.8):
   - novo documento com o **mesmo número-base e sufixo `-R1`, `-R2`…**;
   - a frase "Este certificado substitui o certificado nº CC-2026-00123, emitido em …; motivo: …";
   - o original fica marcado como **"Substituído por CC-2026-00123-R1"** na página de verificação.
8. **A OS e o processo ficam em campos separados.** Não convém embutir a OS no número (como fazem Evagon e Pensu), porque uma OS gera vários certificados e o número fica longo.
9. **Código de verificação separado do número:**
   - aleatório, com 8 a 10 caracteres em base32 sem caracteres ambíguos, por exemplo `7F3K-92QD` (como no Calibriq);
   - é usado no QR code e na URL;
   - impede que alguém percorra `…/00124`, `…/00125` e veja certificados de outros clientes.

### 11.3 Recomendação

| Elemento | Formato | Exemplo |
|---|---|---|
| Nº do certificado | `CC-AAAA-NNNNN` | `CC-2026-00123` |
| Revisão | `CC-AAAA-NNNNN-Rn` | `CC-2026-00123-R1` |
| Exibição alternativa (se o cliente preferir o estilo tradicional) | `NNNNN/AAAA` | `00123/2026` |
| Código de verificação | `XXXX-XXXX` (base32 sem ambíguos) | `7F3K-92QD` |
| URL do QR code | `https://<site>/verificar/<código>` | `…/verificar/7F3K92QD` |
| OS | `OS-AAAA-NNNN` | `OS-2026-0456` |

O prefixo e o número de dígitos devem ser configuráveis. Cinco dígitos comportam até 99 999 certificados por ano.

---

## 12. Decisões recomendadas e questões em aberto

### 12.1 Decisões recomendadas

1. Adotar a **estrutura do EURAMET cg-18 (§8) e da ISO/IEC 17025 (7.8)** como padrão do certificado não RBC, com as ressalvas do §4.5.
2. Layout de **3 páginas**, com variante compacta de 2 páginas. PDF gerado no servidor a partir de um template HTML/CSS ou de uma biblioteca de PDF. **Nunca usar planilha.**
3. Cadastro da balança com **PAM estruturada, foto da plaqueta, componentes com vigência e faixas**. Exigir **Max, Min, e, d e classe**, que o mercado raramente informa.
4. Padrões **peso a peso**, com certificados em histórico, snapshot por calibração e bloqueio de vencidos.
5. Fluxo **rascunho → revisão → emitido**, com aprovador diferente do executor. Numeração na emissão. Revisão `-Rn`.
6. **QR code com código aleatório, página de verificação e hash** já no MVP. É barato de fazer e é o maior sinal de profissionalismo para um emissor não acreditado.
7. **Lembretes agrupados por cliente**, com a **periodicidade tratada como informação do cliente** (ISO/IEC 17025, 7.8.4.3).

### 12.2 Questões para validar com a Balanças.com

- Quais tipos de balança predominam (bancada, plataforma, rodoviária)? A resposta define o MVP do motor de ensaios.
- A empresa tem registro de **oficina permissionária** do Inmetro/IPEM? Se tiver, o nº deve ir para o cadastro da empresa e para os laudos de ajuste.
- Quem será o **responsável técnico** que aprova (com registro no CREA ou CFT)? Haverá mais de um signatário?
- Os pesos para rodoviárias são próprios (quantos de 500 kg e 1000 kg) ou é usado caminhão de carga ou de substituição?
- Já existe padrão de TAG e numeração anterior a ser continuada, por exemplo "0123/26"?
- A assinatura será **ICP-Brasil (e-CNPJ)** ou eletrônica simples? Isso afeta o custo e o fluxo.
- Quais clientes exigem **declaração de conformidade, dados brutos ou RBC**? Os que exigem RBC ficam fora do escopo e devem ser identificados no cadastro.
- Qual o domínio da página de verificação, e a identidade visual: logo e cor da marca?

---

## 13. Referências

### Certificados e modelos analisados

1. Pensu Exactu, Certificado de calibração nº 39059.50 (CAL 0383): https://pensuexactu.com.br/cert/EPE049.pdf
2. Consórcio CICA, Relatório de fiscalização (junho/2024), com o certificado Sannar RBC677/2023 nas páginas 7 e 8: https://consorciocica.com.br/uploads/pagina/arquivos/Relatoriodefiscalizacao-SACjunho2024assinado.pdf
3. Metrotec, Modelo de certificado de calibração de balança (51996/21): https://www.metrotec.com.br/modelo-de-certificado-de-calibracao-balanca
4. UFSC, DG-METEQ-CAL-006-01, Diretrizes gerais de calibração: Balança Digital (2020): https://extensaometrologia.paginas.ufsc.br/files/2020/09/diretriz-balanca-v00.pdf
5. MOP Chile, Certificados LCP-2026-C13/C14 (Huara): https://vialidad.mop.gob.cl/uploads/sites/9/2025/04/HUARA.pdf (também `.../2026/02/TIJERAL.pdf`)
6. Laboratorios Sigma (Colômbia), Certificado LMS24777: https://www.supertransporte.gov.co/documentos/2021/Mayo/Concesiones_05/CVN04ArmeniaPereiraManizales/LaEspanola_2020C.pdf. Similar: https://www.supertransporte.gov.co/documentos/2021/Abril/Concesiones_29/2020/CVN05_SANTAMARTAPARAGUACHON/K97N-S_2020CALIBRACION.pdf
7. Unical / FG Balanças, Certificado de calibração de pesos nº 386/2026: https://padroes.fgbalancas.com.br/certificados/certificados_pesos_padroes_rodoviarias.pdf. Página: https://padroes.fgbalancas.com.br/
8. IEMA-ES, EIA Imetame, Anexo III (certificados Evagon/Ideal e ficha de análise crítica HQ-ANE-160): https://iema.es.gov.br/Media/iema/EIA-RIMA/EIA/2025/IMETAME/ANEXOS2/Anexo%20III%20-%20Certificados%20de%20Calibracao%20dos%20Equipamentos.pdf
9. ABSI, Certificado CAL-242700/24 (manômetro): https://www.century-sp.com.br/pdf2/Century010_01_10_2027.pdf
10. CETESB, Cotação 5/2020/326 (requisitos de certificado de balança): https://sistemasinter.cetesb.sp.gov.br/servicos/INTERDESLICITACOES/Editais/COTACAO_5-2020-326.PDF
11. HU-UFGD/Ebserh, POP.STEC.124: calibração de balança antropométrica (aprovação pelo executor e pelo engenheiro clínico): https://www.gov.br/hubrasil/pt-br/hospitais-universitarios/regiao-centro-oeste/hu-ufgd/acesso-a-informacao/pops-protocolos-e-processos/gad/pop-stec-124-calibracao-de-equipamento-do-tipo-balanca-antropometrica-adulto.pdf

### Normas e documentos orientativos

12. Cgcre, DOQ-CGCRE-097 Rev. 00 (dez/2022): https://www.gov.br/cdtn/pt-br/centrais-de-conteudo/documentos-cgcre-abnt-nbr-iso-iec-17025/doq-cgcre-97
13. EURAMET Calibration Guide No. 18, v4.0 (2015): https://www.nist.gov/document/i-cal-gui-018calibrationguideno18webpdf
14. NIST, ISO/IEC 17025 crosswalk, item 7.8 Reporting the results: https://www.nist.gov/document/7-8-17025-crosswalk-reporting-results-20180201pdf
15. Portaria Inmetro 157/2022 (RTM de IPNA), cópia no DOU: https://www.gehaka.com.br/downloads/portaria_no_157_de_31_de_marco_de_2022.pdf. Registro: http://www.inmetro.gov.br/legislacao/detalhe.asp?seq_classe=1&seq_ato=2968
16. Inmetro, consulta de Portarias de Aprovação de Modelo (PAM): http://www.inmetro.gov.br/legislacao/consulta.asp?seq_classe=2
17. IPEM-PR, página "Balanças" (verificação, marca e lacre): https://www.ipem.pr.gov.br/Pagina/Balancas-0
18. IPEM-PR, Recomendações para verificação intermediária de balanças: https://www.ipem.pr.gov.br/sites/default/arquivos_restritos/files/migrados/File/producao_cientifica/marco_aurelio_diniz_macial_recomendacoes_sobre_verificacao_intermediaria_balancas.pdf
19. IPEM-PR, Recomendações para garantia da qualidade dos resultados de pesagens: https://www.ipem.pr.gov.br/sites/default/arquivos_restritos/files/documento/2022-04/recomendacoes_garantia_qualidade_pesagens_balancas.pdf
20. IPEM-PR, Classificação de pesos-padrão, parte 1 (Portaria Inmetro 289/2021, OIML R111): https://www.ipem.pr.gov.br/sites/default/arquivos_restritos/files/documento/2022-05/classificacao_pesos_parte_1_2022.pdf
21. Toledo do Brasil, Exigências do Inmetro para uma balança (placa de identificação e portaria): https://www.toledobrasil.com/blog/saiba-quais-sao-as-exigencias-do-inmetro-para-uma-balanca
22. Calibração Ceime, Portaria 157/2022 parte 2 (inscrições multifaixa): https://www.calibracaoceime.com.br/2026/09/portaria-157-2022-instrumentos-de-pesagem-parte-2/
23. Target, Portaria Inmetro/Dimel 133/2008 (aprovação do indicador Toledo 9097): https://www.target.com.br/produtos/regulamentos-tecnicos-inmetro/9817/
24. KN Waagen, certificado de peso-padrão (verificação × calibração) e classe M1: https://www.knwaagen.com.br/blog/certificado-de-peso-padrao-diferenca-entre-verificacao-inicial-e-calibracao/ e https://www.knwaagen.com.br/blog/classe-m1/
25. Estática Metrologia, RBC × rastreável: https://www.estatica-metrologia.com.br/calibrar-suas-balancas-rbc-ou-rastreavel/
26. Cgcre, Ofício Circular 14/2025 (uso da marca de acreditação, NIE-CGCRE-009): https://www.gov.br/inmetro/pt-br/assuntos/acreditacao-reconhecimento-bpl/comunicados/dicor-alerta/2025/oficio-circular-14-2025-dicor-cgcre-inmetro.pdf

### Softwares

27. Calibre.Software: https://calibre.software/
28. Calibriq: https://calibriq.com.br/
29. Cali: https://cali.com.br/
30. LCDS MK 3.3: https://www.lcds.com.br/mk.asp
31. Metroex: https://metroex.com.br/
32. ABC71, Sistema de Calibração: https://sistemadecalibracao.com.br/
33. Qualiex: https://qualiex.com/gestao-de-instrumentos-de-medicao/
34. 8Quali: https://8quali.com.br/gestao-de-calibracao/
35. Exatitec (QR code na balança, área do cliente): https://www.exatitec.com.br/calibracao-balancas/
36. Instemaq, consulta de certificado por QR code: https://www.instemaq.com.br/qr-code/
37. Marte, certificado com pesos-padrão rastreados (portal de certificados): https://www.marte.com.br/certificado-de-calibracao-com-pesos-padrao-rastreados
38. Fluke MET/TEAM: https://www.fluke.com/en-gb/product/fluke-software/fluke-calibration-software/met-team-asset-management-software
39. Beamex CMX (brochura): https://beamex.com/app/uploads/2019/10/Beamex-CMX-brochure-ENG.pdf
40. Qualer (via CPS): https://cps.nz/qualer
41. GAGEtrak (Capterra): https://www.capterra.com/p/42529/GAGEtrak/
42. Metquay (Software Advice): https://www.softwareadvice.com.au/software/121279/metquay
43. IndySoft × ProCalV5 (Capterra): https://www.capterra.com/compare/42537-75737/Calibration-Management-Software-vs-CMX
