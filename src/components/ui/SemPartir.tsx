// Os nºs que a pessoa confere com o papel (FC-… da folha, o nº do certificado na etiqueta) nunca quebram no meio: em tela
// estreita, "CC-2026-" numa linha e "00036" na outra parece outro nº. Os nºs vêm de quem monta o texto (a numeração do
// certificado segue o formato das Configurações: não dá para reconhecê-los pelo jeito).

import { pedacosSemPartir } from '../../lib/semPartir'

/** O texto com os nºs dados (`inteiros`) em trechos que não quebram. */
export function SemPartir({ texto, inteiros }: { texto: string; inteiros: ReadonlyArray<string | null | undefined> }) {
  return (
    <>
      {pedacosSemPartir(texto, inteiros).map((p, i) =>
        p.inteiro ? (
          <span key={i} className="whitespace-nowrap">
            {p.texto}
          </span>
        ) : (
          p.texto
        ),
      )}
    </>
  )
}
