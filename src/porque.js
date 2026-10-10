// Los "?" de la app: KAI explica el porqué de cada dato con los números del momento.
import { fmtNota, describeFormato } from './engine/nota.js';
import { MIN_FORECAST, MASTERY_STREAK } from './engine/motor.js';

const pct = x => Math.round(x * 100);
export const fmtRango = r => (r.min === r.max ? fmtNota(r.min) : `${fmtNota(r.min)}–${fmtNota(r.max)}`);
const fmtDias = d => (d < 1.5 ? 'mañana' : `en ${Math.round(d)} días`);

// Botón "?" que abre la explicación `key` (con un dato opcional, p. ej. el id de un tema)
export const why = (key, arg = '') => `<button class="why" data-why="${key}" data-arg="${arg}" aria-label="¿Por qué?">?</button>`;

/** Texto de cada explicación. E = motor, r = readiness(), arg = dato extra. Devuelve { titulo, html }. */
export function explicacion(key, { E, r, arg, item, nombre }) {
  const N = E.nivel;
  const f = E.formato;
  switch (key) {
    case 'rango': return {
      titulo: '¿Por qué un rango y no una nota?',
      html: `<p>Porque no puedo saberlo exacto, y prefiero no prometerte de más.</p>
        <p>Calculo cuánto sabes de cada concepto y lo paso a nota ${describeFormato(f)}. El rango es más ancho cuando:</p>
        <ul class="why-list">
          <li>llevas pocas respuestas${E.state.n < 150 ? ` (llevas ${E.state.n})` : ''};</li>
          <li>no has hecho simulacros${E.state.sims.length ? ` (llevas ${E.state.sims.length})` : ''}: son la pista más real;</li>
          <li>falta mucho para el examen: da tiempo a olvidar (o a estudiar más).</li>
        </ul>
        <p>Está algo inclinado hacia abajo a propósito: en mis pruebas tiendo a pasarme más que a quedarme corto.</p>`,
    };
    case 'olvido': return {
      titulo: '¿Por qué el día del examen sale menos que hoy?',
      html: `<p>Porque lo que estudias se olvida un poco cada día si no lo repasas. Es normal, nos pasa a todos 🙂</p>
        <p>Hoy sacarías <b>${fmtRango(r.rangoHoy)}</b>; si no repasas nada hasta el examen (${fmtDias(r.dias)}), calculo <b>${fmtRango(r.rango)}</b>.</p>
        <p>Lo que más aguanta es lo que has acertado <b>varias veces y en días distintos</b>. Por eso te iré sacando lo que se te esté olvidando: unos minutos de repaso cada día rinden más que un atracón.</p>`,
    };
    case 'dominado': return {
      titulo: '¿Qué es el % dominado?',
      html: `<p>Las preguntas que tienes <b>bien ahora mismo</b>: la última vez que te salieron, las acertaste.</p>
        <p>Es un dato exacto (no una estimación) y empieza en 0 %. No hace falta llegar al 100 %: para estar lista miro tu nota estimada y tus simulacros.</p>`,
    };
    case 'nota': return {
      titulo: `¿Por qué hace falta un ${fmtNota(N.nota)}?`,
      html: `<p>Estás en el nivel <b>${N.nombre}</b>, que es para sacar un <b>${N.promete}</b>. Pido un ${fmtNota(N.nota)} de nota estimada${r.futuro ? ' <b>para el día del examen</b> (contando lo que se olvidará)' : ''} para tener algo de margen.</p>
        ${E.hasForecast() ? '' : `<p>La calculo a partir de ${MIN_FORECAST} respuestas: antes no sé lo suficiente de ti.</p>`}`,
    };
    case 'cobertura': return {
      titulo: `¿Por qué el ${pct(N.cobertura)}% de cada tema?`,
      html: `<p>Porque una nota alta en lo que has visto no sirve si en el examen caen cosas que no has visto nunca.</p>
        <p>Con el ${pct(N.cobertura)}% de cada tema respondido, casi todo lo que pueda caer ya te ha pasado por delante. Lo que no hayas visto lo estimo por cómo te va en su apartado.</p>`,
    };
    case 'sims': return {
      titulo: `¿Por qué ${N.sims > 1 ? `${N.sims} simulacros` : 'un simulacro'}?`,
      html: `<p>El simulacro es lo más parecido al examen: preguntas de todo el temario, sin ayudas y sin ver si aciertas hasta el final.</p>
        ${N.sims > 1 ? `<p>Pido la media de los ${N.sims} últimos porque <b>uno solo se puede aprobar por suerte</b>.</p>` : ''}
        <p>Hace falta un ${fmtNota(N.notaSim)} o más.</p>`,
    };
    case 'nivel': return {
      titulo: `Nivel ${N.nombre}`,
      html: `<p>Este examen lo preparamos en nivel <b>${N.nombre}</b>, pensado para sacar un <b>${N.promete}</b>.</p>
        <p><b>Formato:</b> ${describeFormato(f)}.${f.supuesto ? ' Como no sé cómo es tu examen, me pongo en lo peor.' : ''}${f.penalizacion > 0 ? ' Si una pregunta no la ves clara, a veces es mejor dejarla en blanco.' : ''}</p>
        <p class="muted small">Ojo: calculo la nota con el material que tengo. Si en el examen entra algo que no está en tus apuntes, eso no lo puedo saber.</p>`,
    };
    case 'pregunta': {
      const p = item || {}; // { motivo, recuerdo } guardados al elegir la pregunta
      const t = {
        nueva: ['Es <b>temario nuevo</b>.', 'Elijo sobre todo de los apartados que peor llevas y de los más grandes, para que no se te quede nada atrás.'],
        fallo: ['La <b>fallaste hace poco</b>.', 'Vuelve enseguida (a las pocas preguntas) para que se te quede bien mientras la tienes fresca.'],
        confirmar: ['La fallaste antes y luego la acertaste: <b>quiero confirmarla</b>.', `Doy algo por sabido cuando lo aciertas ${MASTERY_STREAK} veces seguidas.`],
        olvido: ['<b>Se te estaba olvidando.</b>', `Hace tiempo que no la ves${p?.recuerdo != null ? ` y calculo que la recuerdas un ${pct(p.recuerdo)}%` : ''}. Repasarla justo ahora es lo que más la asienta.`],
        repaso: ['Le tocaba un <b>repaso</b>.', 'Así lo que ya sabes no se va.'],
        'todo-visto': ['Ya lo has visto todo 🎉', 'Te repaso lo que antes toque.'],
      }[p?.motivo] || ['Es parte de esta ronda.', ''];
      return { titulo: '¿Por qué esta pregunta?', html: `<p>${t[0]}</p>${t[1] ? `<p>${t[1]}</p>` : ''}` };
    }
    case 'diag': return {
      titulo: '¿Por qué el diagnóstico primero?',
      html: `<p>Para saber qué sabes ya. Así no pierdes tiempo con lo que dominas y empezamos por lo que más te hace falta${nombre ? `, ${nombre}` : ''}.</p>`,
    };
    default: return { titulo: '', html: '' };
  }
}
