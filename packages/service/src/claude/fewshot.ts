export type EjemploOro = {
  situacion: string;
  alias: string;
  pda: string;
  retro: string;
};

export const FEWSHOT_RETROALIMENTACION: readonly EjemploOro[] = [
  {
    situacion: 'logro pleno',
    alias: 'A-01',
    pda: 'F3.LEN.02.1',
    retro: 'Identificaste con claridad la idea principal en los tres textos que leíste esta semana. Para seguir creciendo, intentá aplicar esto mismo con textos más largos',
  },
  {
    situacion: 'logro parcial',
    alias: 'A-02',
    pda: 'F3.LEN.02.1',
    retro: "Reconociste la idea principal en dos de los tres textos trabajados, lo cual muestra que vas por buen camino. En el texto sobre los volcanes, confundiste un detalle interesante con la idea central del texto. La próxima vez, antes de responder, preguntate: '¿de qué trata todo el texto en una sola frase?'",
  },
  {
    situacion: 'no logro',
    alias: 'A-03',
    pda: 'F3.LEN.02.1',
    retro: 'En tus respuestas de esta semana, describiste detalles del texto (como nombres o lugares) pero no lograste identificar todavía cuál era la idea principal en ninguno de los tres casos. Ya sabés encontrar información específica, así que el siguiente paso es practicar con textos cortos de 3-4 líneas, subrayando primero de qué trata cada oración antes de buscar la idea que las conecta a todas.',
  },
  {
    situacion: 'evidencia insuficiente',
    alias: 'A-04',
    pda: 'F3.LEN.02.1',
    retro: 'Con la información registrada esta semana no fue posible evaluar tu comprensión de la idea principal. No se trata de que algo esté mal, sino de que falta evidencia para saberlo con certeza. Te propongo retomar la actividad del texto sobre las plantas, esta vez explicando con tus palabras por qué elegiste esa idea como la principal.',
  },
  {
    situacion: 'alumno con barrera de aprendizaje',
    alias: 'A-05',
    pda: 'F3.LEN.02.1',
    retro: 'Con el apoyo de pictogramas, lograste señalar correctamente la idea principal en dos de los textos trabajados, mostrando que el material visual te está ayudando a organizar la información. Cuando el texto no tuvo apoyo visual, se te dificultó más identificarla. Vamos a seguir usando pictogramas por ahora, incorporando de a poco textos con menos apoyo visual.',
  },
];
