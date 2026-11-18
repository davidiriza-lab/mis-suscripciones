import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

// Única tarea de este mod: guardar la cuota de Claude para el panel "Mis suscripciones" de VS Code.
// Solo Claude Code conoce esa cuota, así que la escribe aquí y la extensión la lee.
// El panel, la guía y las cuotas de GPT y Gemini viven en la extensión.
async function archivoClaude($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')
  return home ? `${home}/.claude/cuota-claude.json` : null
}

type Ventana = { grupo: string; etiqueta: string; queda: number; recarga: string | null }

function claudeDe(limites: readonly SessionRateLimit[]): Ventana[] {
  return limites
    .filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')
    .map(l => ({
      grupo: 'Claude',
      etiqueta: l.kind === 'five_hour' ? 'cada 5 horas' : 'semanal',
      queda: 100 - l.percentUsed,
      recarga: l.resetsAt ?? null,
    }))
}

async function guardar($: EngineInterface, limites: readonly SessionRateLimit[]): Promise<void> {
  const ventanas = claudeDe(limites)
  if (ventanas.length === 0) return
  const archivo = await archivoClaude($)
  if (!archivo) return
  const ahora = await $.clock.now()
  await $.fs.write(archivo, JSON.stringify({ actualizado: ahora, ventanas }, null, 2)).catch(() => undefined)
}

async function guardarDesdeUso($: EngineInterface): Promise<void> {
  const uso = await $.session.usage().catch(() => null)
  if (uso) await guardar($, uso.rateLimits)
}

export const register: Register = on => {
  // al abrir la sesión, por si ya hay datos de una respuesta anterior
  on('session.start', async ($, e, next) => {
    $.clock.after(0, () => void guardarDesdeUso($))
    return next(e)
  })

  // cada vez que la cuota se mueve un punto (después de cada respuesta)
  on('session.measure', async ($, e, next) => {
    if (e.rateLimits?.length) await guardar($, e.rateLimits)
    return next(e)
  })
}
