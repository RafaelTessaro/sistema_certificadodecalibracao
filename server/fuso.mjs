// A empresa fica em Rio Claro/SP: o servidor conta o dia (a data de emissão do certificado, a data padrão da calibração,
// o ano da numeração, os vencimentos) pelo horário de Brasília em qualquer computador, como a linha "emitido em …, às …
// (horário de Brasília)" do certificado e as datas da tela. Num servidor com o fuso em UTC, das 21h à meia-noite daqui o
// dia já seria o seguinte, e o certificado sairia com duas datas de emissão. Quem configurou outro fuso (TZ) fica com ele.
// Carregado primeiro por server/iniciar.mjs.

if (!process.env.TZ) process.env.TZ = 'America/Sao_Paulo'
