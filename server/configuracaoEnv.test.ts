// O arquivo .env do servidor: no servidor instalado pelo setup do Windows, o serviço (WinSW) já define a porta, o HOST e
// a pasta de dados, e o .env não troca o que o ambiente define. O exemplo instalado só traz o que vale, e o servidor
// avisa (no registro de erros) quando ignora uma dessas três do .env.

import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { avisoVariavelIgnorada, mensagemPortaEmUso, variaveisIgnoradasDoEnv } from './configuracaoEnv.ts'

const raiz = new URL('../', import.meta.url)
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), 'utf8')

/** O .env que o administrador faz a partir do exemplo de desenvolvimento (o que a 1.0.2 instalava). */
const ENV_DO_EXEMPLO_ANTIGO = [
  '# Porta usada no navegador',
  'PORTA=4999',
  '# Use 127.0.0.1 para permitir só o próprio servidor.',
  'HOST=127.0.0.1',
  'PASTA_DADOS=D:\\BC-Calibracao-Dados',
  'HOSTS_PERMITIDOS=calibracao',
].join('\r\n')
/** O ambiente do serviço (bc-calibracao.nsi, EscreverXmlServico). */
const SERVICO = { PORTA: '4850', HOST: '0.0.0.0', PASTA_DADOS: 'C:\\ProgramData\\BC Calibracao\\dados', NODE_ENV: 'production' }

describe('variáveis do .env que o serviço do Windows já define', () => {
  it('PORTA, HOST e PASTA_DADOS diferentes do serviço: as três são listadas, com o valor que vale', () => {
    expect(variaveisIgnoradasDoEnv(ENV_DO_EXEMPLO_ANTIGO, SERVICO)).toEqual([
      { nome: 'PORTA', doArquivo: '4999', valendo: '4850' },
      { nome: 'HOST', doArquivo: '127.0.0.1', valendo: '0.0.0.0' },
      { nome: 'PASTA_DADOS', doArquivo: 'D:\\BC-Calibracao-Dados', valendo: 'C:\\ProgramData\\BC Calibracao\\dados' },
    ])
  })

  it('sem conflito: nada (o mesmo valor, só no .env, só no ambiente ou as outras variáveis)', () => {
    expect(variaveisIgnoradasDoEnv('', SERVICO)).toEqual([])
    expect(variaveisIgnoradasDoEnv('HOSTS_PERMITIDOS=calibracao\nSO_REDE_LOCAL=0\nNODE_ENV=development\n', SERVICO)).toEqual([])
    // O mesmo valor nos dois lugares (a porta escrita igual, a pasta com outra caixa de letras)
    expect(
      variaveisIgnoradasDoEnv('PORTA=04850\nHOST= 0.0.0.0 \nPASTA_DADOS=c:\\programdata\\BC Calibracao\\dados\\\n', SERVICO),
    ).toEqual([])
    // Só no .env (desenvolvimento, `npm start`): o .env vale
    expect(variaveisIgnoradasDoEnv(ENV_DO_EXEMPLO_ANTIGO, {})).toEqual([])
    // Só no ambiente
    expect(variaveisIgnoradasDoEnv('# nada\n', SERVICO)).toEqual([])
  })

  it('o aviso diz o que vale e como mudar de verdade', () => {
    const avisos = variaveisIgnoradasDoEnv(ENV_DO_EXEMPLO_ANTIGO, SERVICO).map(avisoVariavelIgnorada)
    expect(avisos).toEqual([
      'Aviso: PORTA=4999 do arquivo .env foi ignorada; vale a do serviço (4850). Para trocar a porta, rode o setup de novo com /PORTA=4999.',
      'Aviso: HOST=127.0.0.1 do arquivo .env foi ignorado; vale o do serviço (0.0.0.0), definido pelo instalador. Quem acessa pela rede é a regra "BC Calibracao (rede local)" do Firewall que define.',
      'Aviso: PASTA_DADOS=D:\\BC-Calibracao-Dados do arquivo .env foi ignorada; os dados continuam em C:\\ProgramData\\BC Calibracao\\dados, a pasta do instalador. A cópia de segurança precisa dessa pasta.',
    ])
  })

  it('porta em uso: definida pelo serviço, o setup troca; senão, o .env', () => {
    expect(mensagemPortaEmUso(4850, true)).toBe(
      'A porta 4850 já está em uso. Feche o outro programa ou troque a porta: no servidor instalado, rode o setup de novo com /PORTA=4851.',
    )
    expect(mensagemPortaEmUso(4850, false)).toBe(
      'A porta 4850 já está em uso. Feche o outro programa ou defina PORTA=4851 no arquivo .env.',
    )
  })
})

describe('o .env.exemplo instalado no servidor do Windows', () => {
  const exemplo = ler('instalador/env-servidor.exemplo')

  it('só traz o que vale no servidor instalado (nada de PORTA, HOST ou PASTA_DADOS)', () => {
    expect(Object.keys(parseEnv(exemplo))).toEqual(['HOSTS_PERMITIDOS'])
    expect(exemplo).not.toMatch(/^\s*(PORTA|HOST|PASTA_DADOS)\s*=/m)
    // E diz como mudar a porta, onde ficam os dados e como fazer valer
    expect(exemplo).toContain('/PORTA=')
    expect(exemplo).toContain('C:\\ProgramData\\BC Calibracao\\dados')
    expect(exemplo).toContain('net stop BCCalibracao')
  })

  it('o empacotamento põe ele no lugar do exemplo de desenvolvimento e confere o payload', () => {
    const script = ler('scripts/empacotar-windows.sh')
    expect(script).toContain('cp "$raiz/instalador/env-servidor.exemplo" "$payload/.env.exemplo"')
    expect(script).not.toMatch(/cp [^\n]*"\$raiz\/\.env\.exemplo"/)
    expect(script).toContain(`grep -Eq '^[[:space:]]*(PORTA|HOST|PASTA_DADOS)[[:space:]]*=' "$payload/.env.exemplo"`)
  })
})
