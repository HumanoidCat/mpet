const pptxgen = require('pptxgenjs');
const path = require('path');

const OUT = process.argv[2] || '/tmp/MPET-Presentación-Final.pptx';
const IMG = '/sessions/wonderful-admiring-planck/mnt/mpet/docs/img/arquitectura-final.png';

const NAVY = '16233F';
const NAVY2 = '24365E';
const ICE = 'DCE7F5';
const ICE2 = 'EEF4FB';
const ACC = '17A398';
const WARN = 'C2543A';
const TXT = '1E2430';
const MUT = '5A6478';
const WHITE = 'FFFFFF';

const H = 'Cambria';
const B = 'Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.3 x 7.5
pres.author = 'Equipo MPET';
pres.title = 'MPET - Presentación técnica';

const W = 13.3, HT = 7.5;
const M = 0.75;

// ---------- helpers ----------
function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  return s;
}
function lightSlide(kicker, title) {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: W - 2 * M, h: 0.28,
      fontFace: B, fontSize: 11, bold: true, color: ACC, charSpacing: 2, margin: 0,
    });
  }
  if (title) {
    s.addText(title, {
      x: M, y: 0.72, w: W - 2 * M, h: 0.75,
      fontFace: H, fontSize: 32, bold: true, color: NAVY, margin: 0, valign: 'top',
    });
  }
  return s;
}
function stat(s, x, y, w, value, label, color) {
  s.addText(value, {
    x, y, w, h: 0.85, fontFace: H, fontSize: 44, bold: true,
    color: color || NAVY, align: 'left', margin: 0, valign: 'middle',
  });
  s.addText(label, {
    x, y: y + 0.85, w, h: 0.75, fontFace: B, fontSize: 12.5,
    color: MUT, align: 'left', margin: 0, valign: 'top',
  });
}
function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, fill: { color: fill || ICE2 }, line: { color: fill || ICE2 }, rectRadius: 0.12,
  });
}
function bullets(s, x, y, w, items, size) {
  s.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: true, breakLine: i !== items.length - 1, paraSpaceAfter: 8 },
    })),
    { x, y, w, h: 3.6, fontFace: B, fontSize: size || 15, color: TXT, valign: 'top', margin: 0 }
  );
}
function foot(s, txt) {
  s.addText(txt, {
    x: M, y: HT - 0.55, w: W - 2 * M, h: 0.3,
    fontFace: B, fontSize: 9.5, color: MUT, italic: true, margin: 0,
  });
}

// ============ 1 · portada ============
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.55, w: 1.15, h: 1.15, fill: { color: ACC }, line: { color: ACC }, rectRadius: 0.28,
  });
  s.addText('MPET', {
    x: M, y: 1.55, w: 1.15, h: 1.15, fontFace: H, fontSize: 17, bold: true,
    color: WHITE, align: 'center', valign: 'middle', margin: 0,
  });
  s.addText('My Personal English Teacher', {
    x: M, y: 2.95, w: 10.5, h: 0.95, fontFace: H, fontSize: 46, bold: true, color: WHITE, margin: 0,
  });
  s.addText('Práctica de inglés conversacional con análisis de señales, ejecutada por completo en el navegador', {
    x: M, y: 3.95, w: 9.6, h: 0.8, fontFace: B, fontSize: 17, color: ICE, margin: 0,
  });
  s.addText('Presentación técnica  ·  Señales y Sistemas', {
    x: M, y: 5.35, w: 8, h: 0.32, fontFace: B, fontSize: 13, bold: true, color: ACC, margin: 0,
  });
  s.addText('Alejandro Zamora  ·  Fabrizio Espinoza  ·  Isaac Morum  ·  José Pablo Monestel', {
    x: M, y: 5.72, w: 11, h: 0.32, fontFace: B, fontSize: 13, color: ICE, margin: 0,
  });
  s.addText('humanoidcat.github.io/mpet', {
    x: M, y: 6.15, w: 8, h: 0.32, fontFace: B, fontSize: 12, color: '8FA6C4', margin: 0,
  });
  s.addNotes('Presentación técnica del proyecto final. 10 a 15 minutos con demostración en vivo al cierre.');
}

// ============ 2 · el problema ============
{
  const s = lightSlide('El problema', 'La dificultad no es de conocimiento, es de producción oral');
  const cols = [
    ['Barrera fonética', 'El español tiene cinco vocales; el inglés supera las once. Pares mínimos como ship / sheep se colapsan en un mismo sonido para el oído no entrenado.'],
    ['Práctica inaccesible', 'La práctica oral efectiva exige un interlocutor que corrija en el momento. Tutorías e intercambios son costosos, dependen de horarios y de conexión estable.'],
    ['Retroalimentación opaca', 'Las aplicaciones masivas devuelven un veredicto binario, correcto o incorrecto, sin explicar QUÉ falló: qué vocal, qué consonante, qué entonación.'],
  ];
  const cw = (W - 2 * M - 0.6) / 3;
  cols.forEach(([t, d], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 2.0, cw, 3.15, ICE2);
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.35, y: 2.35, w: 0.5, h: 0.5, fill: { color: NAVY }, line: { color: NAVY },
    });
    s.addText(String(i + 1), {
      x: x + 0.35, y: 2.35, w: 0.5, h: 0.5, fontFace: H, fontSize: 15, bold: true,
      color: WHITE, align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(t, {
      x: x + 0.35, y: 3.0, w: cw - 0.7, h: 0.42, fontFace: H, fontSize: 18, bold: true, color: NAVY, margin: 0,
    });
    s.addText(d, {
      x: x + 0.35, y: 3.5, w: cw - 0.7, h: 1.5, fontFace: B, fontSize: 13, color: TXT, margin: 0, valign: 'top',
    });
  });
  s.addText('El estudiante no puede corregir lo que no distingue: sin retroalimentación externa, el error se fosiliza.', {
    x: M, y: 5.5, w: W - 2 * M, h: 0.5, fontFace: B, fontSize: 15, italic: true, color: NAVY, margin: 0,
  });
  s.addNotes('Tres causas identificables. La tercera es la que abre el hueco que el proyecto ocupa: nadie explica qué falló.');
}

// ============ 3 · el problema como senales ============
{
  const s = lightSlide('El problema como señales', 'Evaluar pronunciación es un problema de análisis de señales');
  const rows = [
    ['Ruido ambiental y del canal', 'Contamina toda medición posterior', 'Filtro pasa-banda 80 - 8 000 Hz, normalización por valor eficaz'],
    ['Variabilidad entre hablantes', 'La misma palabra produce señales muy distintas', 'Coeficientes cepstrales en escala mel, normalización cepstral'],
    ['Diferencias de velocidad', 'Nadie dice la frase al mismo ritmo', 'Alineamiento temporal dinámico'],
    ['Restricción de tiempo real', 'La corrección debe llegar en menos de 2 s', 'Análisis fuera del hilo principal: 2.14 % de un núcleo'],
  ];
  let y = 2.05;
  rows.forEach(([a, b2, c]) => {
    card(s, M, y, W - 2 * M, 0.82, ICE2);
    s.addText(a, { x: M + 0.3, y, w: 3.3, h: 0.82, fontFace: H, fontSize: 15, bold: true, color: NAVY, valign: 'middle', margin: 0 });
    s.addText(b2, { x: M + 3.7, y, w: 4.0, h: 0.82, fontFace: B, fontSize: 13, color: MUT, valign: 'middle', margin: 0 });
    s.addText(c, { x: M + 7.9, y, w: 3.6, h: 0.82, fontFace: B, fontSize: 13, bold: true, color: ACC, valign: 'middle', margin: 0 });
    y += 0.95;
  });
  s.addText('Dificultad  ·  Consecuencia  ·  Etapa que la atiende', {
    x: M, y: 6.05, w: 8, h: 0.3, fontFace: B, fontSize: 11, italic: true, color: MUT, margin: 0,
  });
  s.addNotes('Cada dificultad tiene una etapa responsable. Esta diapositiva es el índice de la cadena que viene después.');
}

// ============ 4 · arquitectura ============
{
  const s = lightSlide('Arquitectura', 'Cuatro módulos desacoplados por contrato');
  s.addImage({ path: IMG, x: 1.15, y: 1.75, w: 11.0, h: 4.35 });
  s.addText('Los contratos se congelaron en la primera semana. Cada módulo trae un simulacro de sus dependencias: la interfaz se desarrolló contra datos simulados desde el día uno.', {
    x: M, y: 6.25, w: W - 2 * M, h: 0.6, fontFace: B, fontSize: 13, color: MUT, margin: 0,
  });
  s.addNotes('Toda modificación de los contratos compartidos pasa por una solicitud marcada shared-change, revisada por los cuatro.');
}

// ============ 5 · la cadena ============
{
  const s = lightSlide('La cadena de señales', 'De la presión acústica a una distancia comparable');
  const steps = [
    ['Captura', '48 kHz'],
    ['Decimación', 'x3, FIR 127'],
    ['Pasa-banda', '80 - 8 000 Hz'],
    ['Detección de voz', 'energía + periodicidad'],
    ['STFT', '512 / 256'],
    ['MFCC + YIN', '13 coef.'],
    ['DTW', 'Sakoe-Chiba 15 %'],
  ];
  const cw = (W - 2 * M - 0.6 * 6) / 7 + 0.6;
  const bw = (W - 2 * M - 0.35 * 6) / 7;
  steps.forEach(([t, d], i) => {
    const x = M + i * (bw + 0.35);
    card(s, x, 2.05, bw, 1.35, i === steps.length - 1 ? NAVY : ICE2);
    s.addText(t, {
      x: x + 0.08, y: 2.2, w: bw - 0.16, h: 0.6, fontFace: H, fontSize: 13.5, bold: true,
      color: i === steps.length - 1 ? WHITE : NAVY, align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(d, {
      x: x + 0.08, y: 2.75, w: bw - 0.16, h: 0.5, fontFace: B, fontSize: 11,
      color: i === steps.length - 1 ? ICE : MUT, align: 'center', valign: 'top', margin: 0,
    });
  });
  s.addText('Cada etapa descarta deliberadamente algo que no debe influir en la comparación', {
    x: M, y: 3.6, w: W - 2 * M, h: 0.4, fontFace: B, fontSize: 14, italic: true, color: MUT, align: 'center', margin: 0,
  });
  stat(s, M, 4.35, 3.0, '73.8 dB', 'Atenuación de alias del filtro de decimación, 127 coeficientes');
  stat(s, M + 3.2, 4.35, 3.0, '0.115 Hz', 'Error de frecuencia fundamental. El criterio del plan era 3 Hz', ACC);
  stat(s, M + 6.4, 4.35, 3.0, '0.009 %', 'Error de los coeficientes cepstrales frente a librosa. El criterio era 5 %', ACC);
  stat(s, M + 9.6, 4.35, 2.2, '21.4 ms', 'Costo del análisis por segundo de audio');
  s.addNotes('Las tres cifras del centro son los criterios formales del plan, todos superados por dos ordenes de magnitud.');
}

// ============ 6 · verificacion ============
{
  const s = lightSlide('Verificación', 'Contra la teoría, no contra otra biblioteca');
  card(s, M, 2.0, 6.2, 4.0, ICE2);
  s.addText('Cinco niveles, en orden de solidez', {
    x: M + 0.35, y: 2.2, w: 5.5, h: 0.4, fontFace: H, fontSize: 17, bold: true, color: NAVY, margin: 0,
  });
  bullets(s, M + 0.35, 2.7, 5.5, [
    'Casos de solución analítica cerrada: una senoide centrada debe dar magnitud N/2 exacta',
    'La definición como referencia: la DFT directa se implementa dentro de la prueba',
    'Propiedades estructurales: linealidad, Parseval, simetría conjugada',
    'Señales sintéticas de parámetros conocidos',
    'Grabaciones reales, solo para calibración',
  ], 13);

  card(s, M + 6.6, 2.0, W - 2 * M - 6.6, 4.0, NAVY);
  s.addText('Lo que esa estrategia no cubre', {
    x: M + 6.95, y: 2.2, w: 4.5, h: 0.4, fontFace: H, fontSize: 17, bold: true, color: WHITE, margin: 0,
  });
  s.addText('Los cuatro primeros niveles verifican que cada etapa cumple su definición. No verifican que el sistema sirva a su propósito.', {
    x: M + 6.95, y: 2.7, w: 4.6, h: 1.0, fontFace: B, fontSize: 13.5, color: ICE, margin: 0, valign: 'top',
  });
  s.addText('Los dos hallazgos de fondo del proyecto aparecieron al contrastar contra una referencia externa y contra voz real.', {
    x: M + 6.95, y: 3.75, w: 4.6, h: 1.0, fontFace: B, fontSize: 13.5, bold: true, color: ACC, margin: 0, valign: 'top',
  });
  s.addText('655 pruebas  ·  46 archivos  ·  integración continua en cada solicitud', {
    x: M + 6.95, y: 5.15, w: 4.6, h: 0.6, fontFace: B, fontSize: 13, color: WHITE, margin: 0, valign: 'top',
  });
  s.addNotes('Esta es la diapositiva que justifica por que se implemento todo a mano: permite verificar contra la definición.');
}

// ============ 7 · el defecto de escala ============
{
  const s = lightSlide('Hallazgo 1', 'Cuatro niveles de prueba en verde, con un defecto vivo');
  s.addText('La verificación cruzada contra librosa 0.11.0 encontró que la cadena aplicaba al espectro de potencia una corrección de amplitud que hundía veinticuatro de las veintiséis bandas mel por debajo del valor mínimo del logaritmo. Dejaban de responder a la señal.', {
    x: M, y: 2.0, w: 7.4, h: 1.6, fontFace: B, fontSize: 15, color: TXT, margin: 0, valign: 'top',
  });
  s.addText('Cada etapa era correcta por separado. El defecto estaba en la escala con que se encadenaban, y por eso ningún nivel deducible lo detectó.', {
    x: M, y: 3.7, w: 7.4, h: 1.2, fontFace: B, fontSize: 15, bold: true, color: NAVY, margin: 0, valign: 'top',
  });
  card(s, M + 7.9, 2.0, 3.85, 3.3, ICE2);
  s.addText('Error frente a librosa', {
    x: M + 8.2, y: 2.25, w: 3.2, h: 0.4, fontFace: B, fontSize: 12, bold: true, color: MUT, margin: 0,
  });
  s.addText('5.02 %', {
    x: M + 8.2, y: 2.7, w: 3.2, h: 0.7, fontFace: H, fontSize: 34, bold: true, color: WARN, margin: 0,
  });
  s.addText('antes', { x: M + 8.2, y: 3.35, w: 3.2, h: 0.3, fontFace: B, fontSize: 12, color: MUT, margin: 0 });
  s.addText('0.009 %', {
    x: M + 8.2, y: 3.85, w: 3.2, h: 0.7, fontFace: H, fontSize: 34, bold: true, color: ACC, margin: 0,
  });
  s.addText('después', { x: M + 8.2, y: 4.5, w: 3.2, h: 0.3, fontFace: B, fontSize: 12, color: MUT, margin: 0 });
  foot(s, 'Evidencia reproducible: docs/evidencias/s5/s5-t2-mfcc.md');
  s.addNotes('Este es el argumento de por que se conservo el quinto nivel de verificación pese a su costo.');
}

// ============ 8 · pronunciacion: el planteamiento ============
{
  const s = lightSlide('La evaluación de pronunciación', 'El planteamiento y lo que lo desmintió');
  card(s, M, 2.0, 5.6, 2.1, ICE2);
  s.addText('Planteamiento', { x: M + 0.35, y: 2.2, w: 4.9, h: 0.35, fontFace: B, fontSize: 12, bold: true, color: MUT, margin: 0 });
  s.addText('Comparar los coeficientes cepstrales del estudiante contra una referencia sintetizada, alineados temporalmente, y convertir la distancia en puntuación.', {
    x: M + 0.35, y: 2.6, w: 4.9, h: 1.3, fontFace: B, fontSize: 13.5, color: TXT, margin: 0, valign: 'top',
  });
  card(s, M + 6.0, 2.0, 5.6, 2.1, ICE2);
  s.addText('Sobre señales sintéticas', { x: M + 6.35, y: 2.2, w: 4.9, h: 0.35, fontFace: B, fontSize: 12, bold: true, color: MUT, margin: 0 });
  s.addText('31 puntos de separación entre el peor caso bien pronunciado y el mejor mal pronunciado, sobre los 20 que exigía el criterio.', {
    x: M + 6.35, y: 2.6, w: 4.9, h: 1.3, fontFace: B, fontSize: 13.5, color: TXT, margin: 0, valign: 'top',
  });
  card(s, M, 4.35, W - 2 * M, 1.85, NAVY);
  s.addText('Con voz real, la identidad del hablante domina la medición', {
    x: M + 0.4, y: 4.55, w: 6.4, h: 0.45, fontFace: H, fontSize: 20, bold: true, color: WHITE, margin: 0,
  });
  s.addText('Medido sobre cuarenta grabaciones de dos hablantes', {
    x: M + 0.4, y: 5.05, w: 6.4, h: 0.4, fontFace: B, fontSize: 13, color: ICE, margin: 0,
  });
  s.addText('7.08', { x: M + 7.4, y: 4.55, w: 1.9, h: 0.7, fontFace: H, fontSize: 38, bold: true, color: WARN, margin: 0 });
  s.addText('cuesta cambiar de voz', { x: M + 7.4, y: 5.25, w: 2.0, h: 0.5, fontFace: B, fontSize: 12, color: ICE, margin: 0 });
  s.addText('1.20', { x: M + 9.7, y: 4.55, w: 1.9, h: 0.7, fontFace: H, fontSize: 38, bold: true, color: ICE, margin: 0 });
  s.addText('cuesta pronunciar mal', { x: M + 9.7, y: 5.25, w: 2.0, h: 0.5, fontFace: B, fontSize: 12, color: ICE, margin: 0 });
  s.addNotes('Unidades de distancia del alineamiento. La identidad del hablante pesa casi seis veces más que el error de pronunciación.');
}

// ============ 9 · por que, y la via que si funciona ============
{
  const s = lightSlide('Hallazgo 2', 'No es un defecto: es el límite del método');
  s.addText('Comparar coeficientes cepstrales mide parecido acústico. La longitud del tracto vocal escala las frecuencias de los formantes en los mismos coeficientes que distinguen una vocal de otra: no se puede suprimir uno sin suprimir el otro. Se ensayaron ocho procedimientos de normalización.', {
    x: M, y: 1.95, w: W - 2 * M, h: 1.1, fontFace: B, fontSize: 15, color: TXT, margin: 0, valign: 'top',
  });
  s.addText('La vía que sí funciona ya estaba en el proyecto', {
    x: M, y: 3.15, w: W - 2 * M, h: 0.45, fontFace: H, fontSize: 21, bold: true, color: NAVY, margin: 0,
  });
  s.addText('El reconocedor de voz es un modelo acústico entrenado con miles de hablantes. Comparando la TRANSCRIPCIÓN contra una frase objetivo, el error se manifiesta en el texto y la identidad del hablante deja de intervenir.', {
    x: M, y: 3.62, w: 6.5, h: 1.5, fontFace: B, fontSize: 14.5, color: TXT, margin: 0, valign: 'top',
  });
  const chart = [{
    name: 'Errores detectados de 10',
    labels: ['Vía acústica', 'Transcripción contra frase objetivo'],
    values: [6, 8],
  }];
  s.addChart(pres.ChartType.bar, chart, {
    x: M + 6.9, y: 3.3, w: 4.9, h: 2.4,
    barDir: 'bar', chartColors: [NAVY, ACC], showLegend: false,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: B,
    dataLabelFontSize: 13, dataLabelColor: TXT,
    catAxisLabelColor: MUT, catAxisLabelFontFace: B, catAxisLabelFontSize: 11,
    valAxisLabelColor: MUT, valAxisHidden: true,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    valAxisMaxVal: 10, barGapWidthPct: 60,
  });
  s.addText('Sin ningún umbral que calibrar: se marca error cuando lo transcrito no coincide con la frase pedida.', {
    x: M, y: 5.4, w: 6.5, h: 0.8, fontFace: B, fontSize: 13, italic: true, color: MUT, margin: 0, valign: 'top',
  });
  s.addNotes('Un tercio más de errores detectados. El costo es que marca 14 de 30 tomas correctas, y eso se explica en la siguiente.');
}

// ============ 10 · consecuencias de diseno ============
{
  const s = lightSlide('Consecuencia', 'El resultado no se documentó: reorientó la funcionalidad');
  const items = [
    ['La pronunciación solo se evalúa en modo práctica', 'Sin frase objetivo no existe una pronunciación correcta contra la cual comparar. En conversación libre no se puntúa, y la interfaz lo declara.'],
    ['La señal principal es el texto, no la acústica', 'Con catorce tomas correctas marcadas de cada treinta, decirle al estudiante «lo dijiste mal» sería incorrecto una de cada dos veces. El mensaje dice «no entendí bien».'],
    ['El modo práctica trabaja sobre un banco de frases medido', 'Las frases son pares mínimos cuyo comportamiento está caracterizado. Con una frase propia el sistema avisa, pero no impide practicar.'],
  ];
  let y = 1.95;
  items.forEach(([t, d], i) => {
    s.addShape(pres.ShapeType.ellipse, {
      x: M, y: y + 0.08, w: 0.55, h: 0.55, fill: { color: ACC }, line: { color: ACC },
    });
    s.addText(String(i + 1), {
      x: M, y: y + 0.08, w: 0.55, h: 0.55, fontFace: H, fontSize: 16, bold: true,
      color: WHITE, align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(t, {
      x: M + 0.85, y, w: 10.6, h: 0.45, fontFace: H, fontSize: 19, bold: true, color: NAVY, margin: 0,
    });
    s.addText(d, {
      x: M + 0.85, y: y + 0.48, w: 10.6, h: 0.8, fontFace: B, fontSize: 14, color: TXT, margin: 0, valign: 'top',
    });
    y += 1.5;
  });
  s.addText('Una medición adicional que el modo práctica aprovecha: la tasa de tomas marcadas se duplica al hablar deprisa, 9 de 20 frente a 5 de 10. Como el modo práctica propone la frase y la sintetiza, puede controlar esa variable.', {
    x: M, y: 6.35, w: W - 2 * M, h: 0.6, fontFace: B, fontSize: 12.5, italic: true, color: MUT, margin: 0,
  });
  s.addNotes('El punto de esta diapositiva: una medición negativa produjo un diseno mejor, no un parrafo de disculpa.');
}

// ============ 11 · peso de descarga ============
{
  const s = lightSlide('Canal de inferencia', 'El peso de descarga es un recurso escaso');
  s.addText('Ejecutar los modelos en el navegador impone que cada megabyte sea tiempo de espera antes del primer uso. Reducir peso cuantizando más quedó descartado por medición: bajar de 8 a 4 bits resultó 3.8 veces más lento y además más pesado en este entorno.', {
    x: M, y: 1.95, w: 6.3, h: 1.5, fontFace: B, fontSize: 14.5, color: TXT, margin: 0, valign: 'top',
  });
  s.addText('La observación que lo resuelve', {
    x: M, y: 3.5, w: 6.3, h: 0.4, fontFace: H, fontSize: 19, bold: true, color: NAVY, margin: 0,
  });
  s.addText('Un turno no necesita los cuatro modelos a la vez. El estudiante primero habla, y solo después pulsa escuchar. El sintetizador se descarga cuando hace falta.', {
    x: M, y: 3.95, w: 6.3, h: 1.2, fontFace: B, fontSize: 14.5, color: TXT, margin: 0, valign: 'top',
  });
  const chart = [{
    name: 'MiB de la primera carga',
    labels: ['Antes', 'Ahora'],
    values: [411.5, 302.6],
  }];
  s.addChart(pres.ChartType.bar, chart, {
    x: M + 6.9, y: 2.0, w: 4.9, h: 3.0,
    barDir: 'col', chartColors: [NAVY, ACC], showLegend: false,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: B,
    dataLabelFontSize: 13, dataLabelColor: TXT,
    catAxisLabelColor: MUT, catAxisLabelFontFace: B, catAxisLabelFontSize: 12,
    valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    barGapWidthPct: 90,
  });
  s.addText('26 % menos de espera inicial, sin tocar ningún modelo', {
    x: M + 6.9, y: 5.1, w: 4.9, h: 0.5, fontFace: B, fontSize: 13.5, bold: true, color: ACC, align: 'center', margin: 0,
  });
  s.addNotes('El sintetizador son 88.1 MiB adicionales que se descargan la primera vez que se pulsa escuchar.');
}

// ============ 12 · eleccion del sintetizador ============
{
  const s = lightSlide('Elección por medición', 'Tres sintetizadores, el mismo banco de palabras');
  const rows = [
    ['', 'SpeechT5', 'MMS-TTS', 'Kokoro-82M'],
    ['Fallos en 14 palabras trampa', '-', '7', '1'],
    ['Fallos en 5 palabras de control', '-', '2', '0'],
    ['Determinista', '-', 'No', 'Sí'],
    ['Descarga medida', '613 MB', '109.0 MiB', '88.1 MiB'],
  ];
  let y = 2.0;
  rows.forEach((r, ri) => {
    const head = ri === 0;
    if (!head) card(s, M, y, W - 2 * M, 0.72, ri % 2 ? WHITE : ICE2);
    const ws = [4.6, 2.2, 2.2, 2.8];
    let x = M + 0.3;
    r.forEach((c, ci) => {
      s.addText(c, {
        x, y, w: ws[ci], h: head ? 0.5 : 0.72,
        fontFace: head ? B : (ci === 3 ? H : B),
        fontSize: head ? 12 : 14,
        bold: head || ci === 3 || ci === 0,
        color: head ? MUT : (ci === 3 ? ACC : (ci === 0 ? NAVY : TXT)),
        valign: 'middle', margin: 0, align: ci === 0 ? 'left' : 'center',
      });
      x += ws[ci];
    });
    y += head ? 0.55 : 0.78;
  });
  s.addText('Por qué importa la determinación', {
    x: M, y: 5.9, w: 5.4, h: 0.4, fontFace: H, fontSize: 17, bold: true, color: NAVY, margin: 0,
  });
  s.addText('MMS-TTS muestrea ruido para variar la prosodia. Dos síntesis del mismo texto puntuaban 49.5 sobre 100 al compararse entre sí: la mitad de la escala se consumía antes de que el estudiante cometiera un solo error.', {
    x: M, y: 6.35, w: W - 2 * M, h: 0.9, fontFace: B, fontSize: 13.5, color: TXT, margin: 0, valign: 'top',
  });
  s.addNotes('Mismo banco, misma frase portadora, mismo criterio y el mismo reconocedor para juzgar. Solo así los números significan lo mismo.');
}

// ============ 13 · bilingue ============
{
  const s = lightSlide('El tutor bilingüe', 'El bilingüismo se resuelve en el reconocedor, no en el tutor');
  s.addText('Un principiante recurre al español cuando todavía no consigue armar la frase en inglés. Atenderlo parecía exigir un tutor multilingüe, y con el, su latencia. La observación que lo resuelve: el tutor nunca necesitó saber español, necesitaba recibir en inglés lo que el estudiante quiso decir.', {
    x: M, y: 1.95, w: W - 2 * M, h: 1.1, fontFace: B, fontSize: 15, color: TXT, margin: 0, valign: 'top',
  });
  s.addText('Whisper multilingüe, que ya estaba cargado, tiene una tarea de traducción.', {
    x: M, y: 3.1, w: W - 2 * M, h: 0.45, fontFace: B, fontSize: 15, bold: true, color: NAVY, margin: 0,
  });
  const rows = [
    ['', 'Con tutor multilingüe', 'Con traducción en el reconocedor'],
    ['Latencia de la respuesta', '7 a 16 s', '~1.5 s'],
    ['Atiende al estudiante en español', 'Sí', 'Sí'],
    ['Origen de la traducción', 'La generaba el modelo', 'Literal, la del reconocedor'],
    ['Peso adicional', '~500 MiB', 'Ninguno'],
  ];
  let y = 3.75;
  rows.forEach((r, ri) => {
    const head = ri === 0;
    if (!head) card(s, M, y, W - 2 * M, 0.62, ri % 2 ? WHITE : ICE2);
    const ws = [4.6, 3.4, 3.8];
    let x = M + 0.3;
    r.forEach((c, ci) => {
      s.addText(c, {
        x, y, w: ws[ci], h: head ? 0.42 : 0.62,
        fontFace: head ? B : (ci === 2 ? H : B), fontSize: head ? 12 : 13.5,
        bold: head || ci === 2 || ci === 0,
        color: head ? MUT : (ci === 2 ? ACC : (ci === 0 ? NAVY : TXT)),
        valign: 'middle', margin: 0, align: ci === 0 ? 'left' : 'center',
      });
      x += ws[ci];
    });
    y += head ? 0.48 : 0.66;
  });
  s.addText('Cuesta una segunda pasada del reconocedor, y solo cuando el turno vino en español.', {
    x: M, y: 6.5, w: W - 2 * M, h: 0.4, fontFace: B, fontSize: 12.5, italic: true, color: MUT, margin: 0,
  });
  s.addNotes('Antes de sumar un modelo conviene inventariar lo que los que ya están saben hacer.');
}

// ============ 14 · latencia ============
{
  const s = lightSlide('Latencia', 'Medida en la aplicación desplegada, no estimada');
  const chart = [{
    name: 'Retroalimentación, ms',
    labels: ['Turno 1', 'Turno 2', 'Turno 3', 'Turno 4'],
    values: [397, 749, 777, 1282],
  }];
  s.addChart(pres.ChartType.bar, chart, {
    x: M, y: 2.0, w: 6.6, h: 3.4,
    barDir: 'col', chartColors: [ACC], showLegend: false,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: B,
    dataLabelFontSize: 12, dataLabelColor: TXT,
    catAxisLabelColor: MUT, catAxisLabelFontFace: B, catAxisLabelFontSize: 12,
    valAxisLabelColor: MUT, valAxisLabelFontFace: B, valAxisLabelFontSize: 11,
    valGridLine: { color: 'E6E6E6', size: 1 }, catGridLine: { style: 'none' },
    valAxisMaxVal: 2000, barGapWidthPct: 70,
  });
  s.addText('Presupuesto del plan: 2 000 ms', {
    x: M, y: 5.45, w: 6.6, h: 0.4, fontFace: B, fontSize: 13, bold: true, color: MUT, align: 'center', margin: 0,
  });
  card(s, M + 7.2, 2.0, 4.6, 3.4, ICE2);
  s.addText('El orden es lo que permite cumplirlo', {
    x: M + 7.55, y: 2.25, w: 3.9, h: 0.8, fontFace: H, fontSize: 18, bold: true, color: NAVY, margin: 0,
  });
  s.addText('La transcripción y la corrección se envían a la interfaz en cuanto están listas, sin esperar a la respuesta del tutor.\n\nLa respuesta conversacional llega después, en torno a 1.5 s, y las sugerencias se calculan en segundo plano.\n\nEl procesamiento de señales no es el factor limitante: 67 ms de un presupuesto de 2 000.', {
    x: M + 7.55, y: 3.1, w: 3.9, h: 2.2, fontFace: B, fontSize: 13.5, color: TXT, margin: 0, valign: 'top',
  });
  s.addNotes('Cuatro turnos consecutivos cronometrados en la aplicación desplegada, con reconocimiento y gramática incluidos.');
}

// ============ 15 · limitaciones ============
{
  const s = lightSlide('Limitaciones declaradas', 'Decisiones conscientes, no omisiones');
  const items = [
    ['La puntuación acústica depende más de quién habla que de cómo pronuncia', 'Cuantificado en 7.08 frente a 1.20. Motivó el rediseño de la funcionalidad hacia el modo práctica.'],
    ['Un error de un solo fonema se diluye en la puntuación global', 'El margen observado, del orden del 10 %, coincide con la fracción de la frase que cambió. De ahí la puntuación por palabra.'],
    ['El tutor no mantiene el hilo entre turnos', 'Un T5 de instrucciones transforma frases, no dialoga. La memoria conversacional exige un modelo de chat y su latencia: es un compromiso explícito.'],
    ['La detección de habla es frágil sobre voz real', 'La fracción de tramas sonoras se sitúa entre 0.11 y 0.41 frente a un umbral de 0.10.'],
    ['Firefox y Safari no se probaron en dispositivo real', 'Los trabajadores de inferencia usan módulos ECMAScript, sin soporte en Firefox anterior a la versión 114.'],
  ];
  let y = 1.95;
  items.forEach(([t, d]) => {
    s.addText(t, { x: M, y, w: 11.6, h: 0.4, fontFace: H, fontSize: 15.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: M, y: y + 0.38, w: 11.6, h: 0.5, fontFace: B, fontSize: 12.5, color: MUT, margin: 0, valign: 'top' });
    y += 0.95;
  });
  s.addNotes('Declarar el límite medido vale más que ocultarlo: es lo que permite decir con precisión hasta dónde llega el sistema.');
}

// ============ 16 · cierre ============
{
  const s = darkSlide();
  s.addText('Demostración en vivo', {
    x: M, y: 2.15, w: 10.5, h: 0.9, fontFace: H, fontSize: 42, bold: true, color: WHITE, margin: 0,
  });
  s.addText('humanoidcat.github.io/mpet', {
    x: M, y: 3.1, w: 10.5, h: 0.5, fontFace: B, fontSize: 20, color: ACC, margin: 0,
  });
  const kpis = [
    ['0.115 Hz', 'error de frecuencia\nfundamental'],
    ['0.009 %', 'error de coeficientes\ncepstrales'],
    ['655', 'pruebas en\nintegración continua'],
    ['0', 'llamadas a servicios\nexternos'],
  ];
  kpis.forEach(([v, l], i) => {
    const x = M + i * 3.0;
    s.addText(v, { x, y: 4.5, w: 2.7, h: 0.7, fontFace: H, fontSize: 30, bold: true, color: WHITE, margin: 0 });
    s.addText(l, { x, y: 5.2, w: 2.7, h: 0.8, fontFace: B, fontSize: 12.5, color: ICE, margin: 0, valign: 'top' });
  });
  s.addText('Todo el procesamiento de señales y toda la inferencia ocurren en el navegador del usuario.', {
    x: M, y: 6.35, w: 11.5, h: 0.4, fontFace: B, fontSize: 13.5, italic: true, color: '8FA6C4', margin: 0,
  });
  s.addNotes('Cerrar con la demo: un turno hablado en inglés y uno en español para mostrar la traducción, y un turno de modo práctica.');
}

pres.writeFile({ fileName: OUT }).then(() => console.log('escrito ' + OUT));
