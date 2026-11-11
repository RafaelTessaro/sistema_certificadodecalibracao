import { describe, expect, it } from 'vitest'
import type { RegistroAuditoria } from '#shared/tipos.ts'
import { autorDoRegistro, descreverRegistro, grupoDaAcao } from '../usuarios/auditoria'
import {
  assinaturaDaEmissao,
  diasRestantes,
  efeitoDoCnpjDaEmpresa,
  impressaoCurta,
  seloDaSituacao,
  avisoAoRemover,
  botaoDeTrocar,
  tituloAoInstalar,
  revisaoAntesDaEmissao,
  TEXTOS_INSTALAR,
  textoAguardandoAssinatura,
  textoFaixaCertificado,
} from './textos'

describe('os textos do certificado digital', () => {
  it('a ficha do certificado: assinado digitalmente, aguardando a assinatura, cancelado antes dela, ou nada', () => {
    const digital = { titular: 'BALANÇAS TESTE LTDA', cnpj: '12345678000195', certificado: 'abc' }
    expect(assinaturaDaEmissao({ hashPdf: 'f98a', assinaturaDigital: digital }, 'EMITIDO')).toEqual({
      tom: 'assinado',
      texto: 'Assinado digitalmente por BALANÇAS TESTE LTDA (CNPJ 12.345.678/0001-95), certificado ICP-Brasil.',
    })
    expect(assinaturaDaEmissao({ hashPdf: 'f98a', assinaturaDigital: digital }, 'CANCELADO')?.tom).toBe('assinado')
    expect(assinaturaDaEmissao({ hashPdf: '', assinaturaDigital: digital }, 'EMITIDO')).toEqual({
      tom: 'aguardando',
      texto:
        'Aguardando a assinatura digital: até ser assinado, o PDF não pode ser baixado nem enviado. Ele é assinado sozinho (ao abrir o PDF ou na tentativa automática) depois que o administrador resolver o problema do certificado digital da empresa.',
    })
    // Cancelado ou substituído antes de ser assinado: ninguém assina depois (a tentativa automática é só dos emitidos)
    expect(assinaturaDaEmissao({ hashPdf: '', assinaturaDigital: digital }, 'CANCELADO')).toEqual({
      tom: 'sem',
      texto: 'Cancelado antes de ser assinado digitalmente: a cópia não tem assinatura digital.',
    })
    expect(assinaturaDaEmissao({ hashPdf: '', assinaturaDigital: digital }, 'SUBSTITUIDO')?.texto).toBe(
      'Substituído antes de ser assinado digitalmente: a cópia não tem assinatura digital.',
    )
    expect(assinaturaDaEmissao({ hashPdf: 'f98a' }, 'EMITIDO')).toBeNull()
    expect(assinaturaDaEmissao({ hashPdf: '' }, 'EMITIDO')).toBeNull()
  })

  it('a faixa do Painel dos emitidos aguardando a assinatura: singular e plural', () => {
    expect(textoAguardandoAssinatura(1)).toEqual({
      destaque: '1 certificado aguardando assinatura digital.',
      texto: 'Até ser assinado, não pode ser baixado nem enviado.',
      ver: 'Veja qual é.',
    })
    expect(textoAguardandoAssinatura(1200)).toEqual({
      destaque: '1.200 certificados aguardando assinatura digital.',
      texto: 'Até serem assinados, não podem ser baixados nem enviados.',
      ver: 'Veja quais são.',
    })
  })

  it('Remover com emitidos aguardando a assinatura: só um certificado do mesmo CNPJ (14 dígitos) e titular os assina', () => {
    // A filial (mesma raiz do CNPJ) é aceita nas emissões novas, mas não assina os pendentes (pdfAssinado confere o CNPJ inteiro)
    expect(avisoAoRemover(1)).toBe(
      '1 certificado emitido ainda aguarda a assinatura digital. Sem o certificado digital, ele não poderá ser baixado nem enviado até um certificado do mesmo CNPJ e do mesmo titular ser instalado de novo.',
    )
    expect(avisoAoRemover(3)).toBe(
      '3 certificados emitidos ainda aguardam a assinatura digital. Sem o certificado digital, eles não poderão ser baixados nem enviados até um certificado do mesmo CNPJ e do mesmo titular ser instalado de novo.',
    )
    expect(`${avisoAoRemover(1)} ${avisoAoRemover(2)}`).not.toMatch(/mesma empresa/)
  })

  it('Instalar: o e-CNPJ comprado só para o sistema (não o do contador), porque o administrador do servidor pode usá-lo', () => {
    expect(TEXTOS_INSTALAR.descricao).toBe(
      'O arquivo .pfx (ou .p12) do e-CNPJ comprado só para o sistema, com a chave privada, e a senha dele.',
    )
    expect(TEXTOS_INSTALAR.qual).toMatch(/^Use um e-CNPJ comprado só para o BC Calibração, não o que o contador usa/)
    expect(TEXTOS_INSTALAR.qual).toMatch(/quem é administrador do Windows do servidor consegue usar o certificado instalado/)
    expect(Object.values(TEXTOS_INSTALAR).join(' ')).not.toMatch(/\bA1\b/)
  })

  it('Revisão antes da emissão (Configurações → Certificado): com o certificado digital, os nomes, sem as imagens', () => {
    expect(revisaoAntesDaEmissao(false)).toEqual({
      ligado:
        'quem digita escolhe um signatário (nunca o técnico que executou nem quem escolheu o técnico) e envia para a autorização dele; o signatário confere, autoriza e o certificado é emitido com duas assinaturas, a de quem executou e a de quem autorizou. O signatário que não executou nem escolheu o técnico também pode autorizar direto: ninguém assina por outra pessoa.',
      desligado:
        'qualquer pessoa que entrou no sistema emite, e o certificado sai só com a assinatura de quem executou (quem emitiu fica registrado).',
    })
    const digital = revisaoAntesDaEmissao(true)
    expect(digital.ligado).toContain(
      'o signatário confere, autoriza e o certificado é emitido com os nomes de quem executou e de quem autorizou, sem as imagens das assinaturas, e assinado digitalmente pela empresa.',
    )
    expect(digital.desligado).toBe(
      'qualquer pessoa que entrou no sistema emite, e o certificado sai com o nome de quem executou, sem a imagem da assinatura, e assinado digitalmente pela empresa (quem emitiu fica registrado).',
    )
    expect(`${digital.ligado} ${digital.desligado}`).not.toMatch(/duas assinaturas|só com a assinatura/)
    // Quem assina é a empresa, por todos: o que ninguém faz por outra pessoa é autorizar
    expect(digital.ligado).toMatch(/também pode autorizar direto: ninguém autoriza por outra pessoa\.$/)
  })

  it('o selo de cada situação', () => {
    expect(seloDaSituacao({ situacao: 'OK' })).toEqual({ texto: 'Em dia', tom: 'success' })
    expect(seloDaSituacao({ situacao: 'VENCENDO', diasParaVencer: 12 })).toEqual({ texto: 'Vence em 12 dias', tom: 'warning' })
    expect(seloDaSituacao({ situacao: 'VENCENDO', diasParaVencer: 1 }).texto).toBe('Vence amanhã')
    expect(seloDaSituacao({ situacao: 'VENCENDO', diasParaVencer: 0 }).texto).toBe('Vence hoje')
    expect(seloDaSituacao({ situacao: 'VENCIDO' })).toEqual({ texto: 'Vencido', tom: 'danger' })
    expect(seloDaSituacao({ situacao: 'NAO_ABRE' }).texto).toBe('Não abre no servidor')
    expect(seloDaSituacao({ situacao: 'CNPJ_DIFERENTE' }).texto).toBe('CNPJ diferente do da empresa')
    // O CNPJ da empresa em branco não é "diferente"
    expect(seloDaSituacao({ situacao: 'EMPRESA_SEM_CNPJ' })).toEqual({ texto: 'CNPJ da empresa em branco', tom: 'danger' })
  })

  it('o certificado que não abre neste servidor: o botão principal é enviá-lo de novo (o mesmo caminho da troca)', () => {
    const enviarDeNovo = {
      rotulo: 'Enviar o certificado de novo',
      titulo: 'Enviar o certificado digital de novo',
      principal: true,
    }
    const troca = { rotulo: 'Trocar certificado', titulo: 'Trocar o certificado digital', principal: false }
    expect(botaoDeTrocar({ situacao: 'NAO_ABRE' })).toEqual(enviarDeNovo)
    expect(botaoDeTrocar({ situacao: 'NAO_ABRE', diasParaVencer: 200 })).toEqual(enviarDeNovo)
    expect(botaoDeTrocar({ situacao: 'NAO_ABRE', diasParaVencer: 0 })).toEqual(enviarDeNovo)
    // Também vencido: o mesmo arquivo seria recusado ("venceu... escolha o renovado"), e o cartão manda instalar o novo
    expect(botaoDeTrocar({ situacao: 'NAO_ABRE', diasParaVencer: -1 })).toEqual(troca)
    for (const situacao of ['OK', 'VENCENDO', 'VENCIDO', 'AINDA_NAO_VALE', 'CNPJ_DIFERENTE', 'EMPRESA_SEM_CNPJ'] as const)
      expect(botaoDeTrocar({ situacao }), situacao).toEqual(troca)
  })

  it('o aviso depois de instalar diz o que o servidor fez: instalou, instalou o mesmo de novo ou trocou por outro', () => {
    expect(tituloAoInstalar({ havia: false, trocado: false })).toBe('Certificado digital instalado')
    expect(tituloAoInstalar({ havia: true, trocado: false })).toBe('Certificado digital instalado de novo')
    // Pelo "Enviar o certificado de novo" também: outro arquivo (o renovado) é troca, como no registro de atividades
    expect(tituloAoInstalar({ havia: true, trocado: true })).toBe('Certificado digital trocado')
  })

  it('a impressão digital abreviada e os dias restantes', () => {
    expect(impressaoCurta('dcf01fc69866419bc43380e029c0b29b690e5b4a6523edca975b49a45d068c63')).toBe('DCF0 1FC6…5D06 8C63')
    expect(diasRestantes(1200)).toBe('1.200 dias')
    expect(diasRestantes(2)).toBe('2 dias')
    expect(diasRestantes(-3)).toBe('vencido')
    // Com 1 dia ou menos, a hora (o certificado vence numa hora do dia, não no fim dele)
    expect(diasRestantes(1, '2026-11-12T09:45:11Z')).toBe('vence amanhã às 06:45')
    expect(diasRestantes(0, '2026-11-11T09:45:11Z')).toBe('vence hoje às 06:45')
    expect(diasRestantes(0)).toBe('vence hoje')
  })

  it('a faixa do Painel: só vencendo ou impedindo a emissão', () => {
    expect(textoFaixaCertificado({ situacao: 'OK', diasParaVencer: 300 })).toBeNull()
    expect(textoFaixaCertificado({ situacao: 'SEM_CERTIFICADO' })).toBeNull()
    expect(textoFaixaCertificado({ situacao: 'VENCENDO', diasParaVencer: 9, validoAte: '2026-11-20T12:00:00Z' })).toEqual({
      destaque: 'O certificado digital da empresa vence em 9 dias (20/11/2026 às 09:00).',
      texto: 'A partir desse horário, o sistema para de emitir certificados até o novo ser instalado.',
      grave: false,
      secao: 'certificado-digital',
      onde: 'Configurações → Certificado digital',
    })
    expect(textoFaixaCertificado({ situacao: 'VENCIDO' })).toMatchObject({
      grave: true,
      texto: expect.stringMatching(/não emite/),
    })
    // O CNPJ da empresa em branco: o que diz e onde resolver (Empresa, e não Certificado digital)
    expect(textoFaixaCertificado({ situacao: 'EMPRESA_SEM_CNPJ' })).toEqual({
      destaque: 'O CNPJ da empresa não está preenchido.',
      texto: 'Ele é conferido com o do certificado digital: até preencher, o sistema não emite certificados.',
      grave: true,
      secao: 'empresa',
      onde: 'Configurações → Empresa',
    })
    expect(textoFaixaCertificado({ situacao: 'CNPJ_DIFERENTE' })?.destaque).toBe(
      'O CNPJ do certificado digital é diferente do CNPJ da empresa.',
    )
  })

  it('a faixa do Painel do operador (que não abre Configurações): o que acontece e que é com o administrador', () => {
    const op = { administrador: false }
    expect(
      textoFaixaCertificado({ situacao: 'VENCENDO', diasParaVencer: 1, validoAte: '2026-11-12T12:00:00Z' }, op),
    ).toMatchObject({
      destaque: 'O certificado digital da empresa vence amanhã (12/11/2026 às 09:00).',
      texto: 'A partir desse horário, o sistema para de emitir certificados até o administrador instalar o novo.',
    })
    expect(textoFaixaCertificado({ situacao: 'NAO_ABRE' }, op)).toMatchObject({
      // "no servidor": a faixa aparece no computador de quem lê, e trocar de computador não resolve
      destaque: 'O certificado digital da empresa não abre no servidor.',
      texto: 'Até o administrador resolver, o sistema não emite certificados.',
    })
    expect(textoFaixaCertificado({ situacao: 'EMPRESA_SEM_CNPJ' }, op)?.texto).toBe(
      'Ele é conferido com o do certificado digital: até o administrador preencher, o sistema não emite certificados.',
    )
    for (const situacao of ['VENCENDO', 'VENCIDO', 'AINDA_NAO_VALE', 'NAO_ABRE', 'CNPJ_DIFERENTE', 'EMPRESA_SEM_CNPJ'] as const) {
      const f = textoFaixaCertificado({ situacao, diasParaVencer: 3 }, op)!
      expect(`${f.destaque} ${f.texto}`).not.toMatch(/Configurações|[Ii]nstale|[Tt]roque/)
    }
    expect(textoAguardandoAssinatura(2)).not.toHaveProperty('onde')
  })

  it('Configurações → Empresa: o CNPJ que bloquearia a emissão com o certificado digital instalado avisa antes de salvar', () => {
    const cert = { situacao: 'OK' as const, cnpj: '12345678000195' }
    expect(efeitoDoCnpjDaEmpresa('11.222.333/0001-81', cert)).toBe(
      'Este CNPJ não é o do certificado digital instalado (12.345.678/0001-95): ao salvar, o sistema para de emitir certificados até o certificado digital deste CNPJ ser instalado.',
    )
    expect(efeitoDoCnpjDaEmpresa('', cert)).toBe(
      'Com o CNPJ em branco, o sistema para de emitir certificados: o CNPJ da empresa é conferido com o do certificado digital instalado (12.345.678/0001-95).',
    )
    // O mesmo CNPJ (com ou sem máscara) e outro estabelecimento da mesma empresa (filial): nada
    expect(efeitoDoCnpjDaEmpresa('12.345.678/0001-95', cert)).toBeNull()
    expect(efeitoDoCnpjDaEmpresa('12.345.678/0002-76', cert)).toBeNull()
    // Sem certificado digital instalado: nada
    expect(efeitoDoCnpjDaEmpresa('11.222.333/0001-81', { situacao: 'SEM_CERTIFICADO' })).toBeNull()
    expect(efeitoDoCnpjDaEmpresa('11.222.333/0001-81', null)).toBeNull()
  })

  it('no registro de atividades: o grupo dos certificados, o detalhe da tela e o aviso automático', () => {
    const r = (x: Partial<RegistroAuditoria>): RegistroAuditoria => ({
      id: 1,
      em: '2026-11-11T12:00:00Z',
      usuarioId: 'u1',
      login: 'admin',
      ip: '127.0.0.1',
      acao: 'CERTIFICADO_DIGITAL',
      alvo: '',
      detalhe: '',
      ...x,
    })
    expect(grupoDaAcao('CERTIFICADO_DIGITAL')).toBe('certificados')
    expect(
      descreverRegistro(
        r({ detalhe: 'POST /api/certificado-digital | instalado: EMPRESA LTDA (série 01, válido até 31/12/2027)' }),
      ),
    ).toEqual({ titulo: 'Certificado digital da empresa', detalhe: 'instalado: EMPRESA LTDA (série 01, válido até 31/12/2027)' })
    const aviso = r({ usuarioId: '', login: '', ip: '', detalhe: 'O certificado digital vence em 15 dias, em 31/12/2027.' })
    expect(descreverRegistro(aviso).detalhe).toBe('O certificado digital vence em 15 dias, em 31/12/2027.')
    expect(autorDoRegistro(aviso, new Map())).toEqual({ texto: 'Aviso automático do sistema' })
  })
})
