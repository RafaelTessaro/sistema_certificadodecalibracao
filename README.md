# BC Calibração

Sistema da **Balanças.com** para emitir **certificados de calibração de balanças** (laboratório não acreditado, fora da RBC).
Roda num computador da empresa e é usado pelo navegador por quem está na **rede interna**. Ele não fica exposto à internet.

## O que o sistema faz

- **Clientes** (empresa ou pessoa física). Com o CNPJ, preenche razão social, endereço, telefone e e-mail. Com o CEP, preenche o endereço.
- **Balanças** dos clientes: tipo, fabricante, modelo, nº de série, identificação, portaria de aprovação de modelo, capacidade, divisões (e/d), classe, faixas, local de instalação.
- **Padrões** da empresa: jogos de pesos (peça por peça, com correção e incerteza do certificado), termo-higrômetro e barômetro.
  O sistema avisa quando um padrão está vencendo e **bloqueia a emissão** quando ele já venceu.
- **Calibração passo a passo**:
  1. Identificação e nº da **OS** do sistema de ordens de serviço
  2. Instrumento
  3. Padrões e condições ambientais
  4. Repetibilidade
  5. Excentricidade
  6. Erro de indicação, antes e depois do ajuste
  7. Conclusão
  8. Revisão

  O cálculo de erro, incerteza (k e νeff) e conformidade é feito **ao vivo** pelo método EURAMET cg-18.
- **Certificado em PDF** com:
  - número único, "Página X de Y" e "Fim do certificado";
  - rastreabilidade, incerteza expandida com k e νeff, condições ambientais e resultados antes e depois do ajuste;
  - declaração de laboratório não acreditado.
- **Revisão** (o certificado novo ganha o sufixo "-R1" e diz qual substitui) e **cancelamento** com motivo. O PDF emitido nunca muda.
- **Envio por e-mail** do PDF ao cliente, com histórico de envios, e **lembretes** de calibração para as balanças que vão vencer.
- **Usuários**:
  - administrador;
  - técnico;
  - signatário, quem autoriza a emissão, com a assinatura digitalizada.

  Há também o registro de atividades.
- **Backup** automático todo dia, cópia manual e restauração.
- **Modo claro e escuro**, e funciona no celular e no tablet da oficina.

## Instalação no servidor (Windows)

Use o instalador **`BC-Calibracao-Setup-<versão>.exe`**. Ele já traz tudo o que é preciso, então **não é necessário instalar Node, banco de dados nem mais nada**.
O instalador:

- copia o programa para `C:\Program Files\BC Calibracao`;
- guarda os dados em `C:\ProgramData\BC Calibracao\dados`;
- registra o serviço do Windows **BC Calibração**, que inicia junto com o computador;
- libera a porta **4850** no firewall **só para a rede local**;
- cria um atalho para abrir o sistema.

Detalhes, atualização e desinstalação estão em [`instalador/LEIA-ME.md`](instalador/LEIA-ME.md).

### Primeiro acesso

1. **No próprio servidor**, abra `http://localhost:4850`.
2. Crie a conta do **administrador**. Ela já é signatária.

   Por segurança, a primeira conta só pode ser criada no próprio servidor, nunca pela rede.
3. Em **Configurações**, confira:
   - os dados da empresa;
   - os textos do certificado;
   - o e-mail de envio (SMTP).
4. Em **Usuários**, cadastre os técnicos. Marque como **signatário** quem pode autorizar a emissão e envie a assinatura digitalizada de cada um.
5. Em **Padrões**, cadastre os pesos e os instrumentos com os dados dos certificados de calibração deles.

### Acesso pelos outros computadores

No navegador, abra `http://IP-DO-SERVIDOR:4850`, por exemplo `http://192.168.0.10:4850`. O endereço aparece na tela do servidor e em **Configurações**.

O acesso é recusado de fora da rede local em três camadas:

- a regra do firewall;
- o filtro de endereços do próprio sistema;
- a conferência do nome usado no navegador.

## Desenvolvimento

Requisitos: **Node.js 22.18 ou mais novo** (o servidor roda o TypeScript direto, sem compilar).

```bash
npm install
npm run dev      # interface (Vite) + servidor, com recarga automática
npm test         # testes (Vitest)
npm run lint     # oxlint
npm run build    # confere os tipos e gera a interface em dist/
npm start        # servidor de produção (serve dist/) em http://localhost:4850
```

As configurações do servidor ficam num arquivo `.env`. Veja o modelo em [`.env.exemplo`](.env.exemplo): porta, pasta de dados e nomes permitidos.

### Gerar o instalador

```bash
scripts/empacotar-windows.sh
```

No GitHub, o workflow **Instalador Windows** também gera o instalador.

### Organização do código

| Pasta | Conteúdo |
|---|---|
| `shared/` | Tipos, regras de cadastro, textos do certificado, permissões e o **motor metrológico** (`shared/metrologia`) usado igual no navegador e no servidor |
| `server/` | Fastify + SQLite embutido do Node (`node:sqlite`), geração do PDF (`server/pdf`), e-mail, backup, consultas de CNPJ/CEP e controle de acesso |
| `src/` | Interface em React + Tailwind |
| `instalador/` | Script do NSIS, serviço (WinSW) e ferramentas do instalador |
| `docs/pesquisa/` | Pesquisa que embasou o sistema, com as fontes: normas, cálculo de incerteza, modelos de certificado, design e instalador |

## Sobre o certificado (não RBC)

O certificado segue a ABNT NBR ISO/IEC 17025 (item 7.8) e o guia EURAMET cg-18 em tudo o que se aplica a um laboratório não acreditado.

- **Não usa** o logotipo nem o nome da RBC, da Cgcre, do Inmetro ou da ILAC.
- **Não usa** os termos "aferição" e "validade". O sistema avisa se eles forem digitados.
- Declara que o laboratório **não é acreditado** e que a calibração **não substitui a verificação metrológica do IPEM/Inmetro**, que é obrigatória para balanças de uso comercial.
- A data da próxima calibração **só sai no certificado se o cliente pediu**. Caso contrário, ela fica só como lembrete interno.
- A rastreabilidade é declarada pelos certificados dos padrões utilizados.

As fontes e a justificativa de cada item estão em [`docs/pesquisa/01-normas-certificado.md`](docs/pesquisa/01-normas-certificado.md) e [`docs/pesquisa/02-procedimento-tecnico-incerteza.md`](docs/pesquisa/02-procedimento-tecnico-incerteza.md).
