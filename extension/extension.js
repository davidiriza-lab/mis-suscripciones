// Mis suscripciones: panel en la barra lateral con la cuota de Claude, ChatGPT y Gemini.
//   GPT     → ~/.local/bin/cuota-gpt --json      (Codex, suscripción ChatGPT)
//   Gemini  → ~/.local/bin/cuota-gemini --json   (Antigravity, suscripción Google)
//   Claude  → ~/.claude/cuota-claude.json        (lo escribe el mod de este repo)
const vscode = require('vscode')
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = os.homedir()
const CUOTA_GPT = path.join(HOME, '.local/bin/cuota-gpt')
const CUOTA_GEMINI = path.join(HOME, '.local/bin/cuota-gemini')
const ARCHIVO_CLAUDE = path.join(HOME, '.claude/cuota-claude.json')
const CUENTA_CLAUDE = path.join(HOME, '.local/bin/cuenta-claude') // cambia entre cuentas de Claude guardadas (solo Mac)
const CADA_MS = 15 * 60 * 1000

// VS Code no hereda el PATH de la terminal: sin esto python3/agy/codex pueden no aparecer.
const ENV = { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local/bin'), process.env.PATH || ''].join(':') }

function correr(archivo) {
  return new Promise(resolve => {
    execFile(archivo, ['--json'], { env: ENV, timeout: 120000 }, (err, stdout) => {
      try {
        resolve(JSON.parse(stdout))
      } catch {
        resolve({ ok: false, ventanas: [], error: err ? `No pude leer la cuota (${err.code || err.message})` : 'Respuesta inválida' })
      }
    })
  })
}

// Cuentas de Claude guardadas con `cuenta-claude --uso`: nombre, correo, plan, cuál está activa y cuánto
// le queda a cada una (lo pregunta a Anthropic directo, así no depende de que un chat anote la cuota).
function leerCuentas() {
  return new Promise(resolve => {
    execFile(CUENTA_CLAUDE, ['--uso'], { env: ENV, timeout: 60000 }, (err, stdout) => {
      try { resolve(JSON.parse(stdout).cuentas || null) } catch { resolve(null) }
    })
  })
}
const CUENTAS_MS = 3 * 60 * 1000

function dentroDe(iso) {
  const ms = Date.parse(iso) - Date.now()
  if (isNaN(ms)) return ''
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return min + ' min'
  const h = Math.floor(min / 60)
  if (h < 24) return h + ' h ' + (min % 60) + ' min'
  const d = Math.round(h / 24)
  return d + ' día' + (d === 1 ? '' : 's')
}

const nivel = p => (p >= 50 ? 'bien' : p >= 20 ? 'ambar' : 'rojo')
const periodo = w => (String(w.etiqueta).includes('5') ? '5 horas' : 'semanal')

// Si la hora de recarga ya pasó, el tanque está lleno aunque el dato sea viejo (pasa con Claude cuando no lo usas).
function alDia(fuente) {
  if (!fuente || !Array.isArray(fuente.ventanas)) return fuente
  const ahora = Date.now()
  return { ...fuente, ventanas: fuente.ventanas.map(w => (w.recarga && Date.parse(w.recarga) <= ahora ? { ...w, queda: 100, recarga: null, recargado: true } : w)) }
}

// Todas las ventanas, con a qué IA pertenecen.
function ventanas(datos) {
  const lista = []
  const add = (ia, f, filtro) => ((f && f.ventanas) || []).filter(filtro || (() => true))
    .forEach(w => lista.push({ ia, ...w, clave: ia + '|' + (f.cuenta ? f.cuenta + '|' : '') + w.etiqueta }))
  add('Claude', datos.claude)
  add('GPT', datos.gpt)
  add('Gemini', datos.gemini, w => String(w.grupo).startsWith('Gemini'))
  return lista
}

// ── Chats de Claude Code: ~/.claude/projects/<carpeta>/<sesión>.jsonl ──
// El título es la última línea "custom-title" (si lo renombraste) o "ai-title". Se cachea por fecha de
// modificación para no releer archivos que no cambiaron.
const PROYECTOS = path.join(HOME, '.claude/projects')
const cacheChats = new Map() // ruta → { mtime, leido, titulo, cwd }
const rutasChats = new Map() // id → ruta del .jsonl
// Cuánto dura el violeta de «listo, sin revisar» si no abres el chat desde el panel.
const LISTO_MS = 2 * 60 * 60 * 1000

// Chat largo: un chat nuevo arranca en ~120 mil tokens (lo que Claude Code carga al empezar). Cada mensaje
// vuelve a mandar todo el contexto, así que a 300 mil cada respuesta ya cuesta ~2.5 veces lo de un chat
// nuevo, y a 500 mil, ~4 veces. Se avisa una vez por nivel; si el chat se compacta y baja, se reinicia.
const BASE_TOKENS = 120000
const LARGO_TOKENS = 300000
const MUY_LARGO_TOKENS = 500000
const nivelLargo = t => (t >= MUY_LARGO_TOKENS ? 2 : t >= LARGO_TOKENS ? 1 : 0)
const enMiles = t => Math.round(t / 1000) + ' mil'

// Chats abiertos ahora: cada uno corre su propio proceso de Claude Code con el número del chat
// (`--resume=<id>` o `--session-id <id>`). Un chat sin proceso no puede estar trabajando.
// Un chat NUEVO arranca sin número (`--resume`) y solo después se relanza con él. Esos procesos se guardan
// con su hora de arranque para emparejarlos con el chat cuyo archivo nació después.
function chatsAbiertos() {
  try {
    const salida = require('child_process').execFileSync('ps', ['-axo', 'etime=,command='], { encoding: 'utf8', timeout: 5000 })
    const ids = new Set(), sinNumero = []
    for (const linea of salida.split('\n')) {
      if (!/native-binary\/claude|\/claude --output-format/.test(linea)) continue
      const encontrados = [...linea.matchAll(/--(?:resume|session-id)[= ]([0-9a-f-]{36})/gi)].map(m => m[1])
      if (encontrados.length) encontrados.forEach(id => ids.add(id))
      else sinNumero.push(Date.now() - segundosDe(linea.trim().split(/\s+/)[0]) * 1000)
    }
    return { ids, sinNumero }
  } catch {
    return null // si ps falla, no se descarta ningún chat por esto
  }
}

// etime de ps: [[dd-]hh:]mm:ss → segundos
function segundosDe(etime) {
  const [dias, resto] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const p = resto.split(':').map(Number)
  while (p.length < 3) p.unshift(0)
  return Number(dias) * 86400 + p[0] * 3600 + p[1] * 60 + p[2]
}

function estaAbierto(abiertos, id, ruta) {
  if (abiertos.ids.has(id)) return true
  if (!abiertos.sinNumero.length) return false
  try {
    const nacio = fs.statSync(ruta).birthtimeMs
    return abiertos.sinNumero.some(inicio => nacio >= inicio - 5000) // el chat nació después de que arrancó ese proceso
  } catch { return false }
}

// Se lee el final del archivo una sola vez para saber dos cosas:
//   trabajando → si lo último es Claude cerrando su turno (stop_reason "end_turn") o un aviso de fin de turno,
//                terminó. Si es una herramienta corriendo, un resultado o tu mensaje sin respuesta, está trabajando.
//   tokens     → tamaño del contexto en el último mensaje de Claude (entrada + caché). Es lo que se vuelve a
//                mandar en cada mensaje: entre más largo el chat, más cuesta cada respuesta.
function leerFinal(ruta) {
  let fd
  try {
    fd = fs.openSync(ruta, 'r')
    const tam = fs.fstatSync(fd).size
    const largo = Math.min(tam, 512 * 1024)
    const buf = Buffer.alloc(largo)
    fs.readSync(fd, buf, 0, largo, tam - largo)
    const lineas = buf.toString('utf8').split('\n')
    if (tam > largo) lineas.shift() // la primera puede venir cortada
    return { trabajando: procesando(lineas), tokens: contexto(lineas), ...cierre(lineas) }
  } catch {
    return { trabajando: false, tokens: 0, cerrada: false, cierreTs: null, despues: 0 }
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
}

function contexto(lineas) {
  for (let i = lineas.length - 1; i >= 0; i--) {
    const l = lineas[i]
    if (!l.includes('"usage"')) continue
    let o
    try { o = JSON.parse(l) } catch { continue }
    const u = o.type === 'assistant' && !o.isSidechain && o.message && o.message.usage
    if (!u) continue
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
  }
  return 0
}

// ¿Ya se hizo /cerrar-sesion? Ese comando (repo davidiriza-lab/sesiones-claude-code) termina con el bloque
// «⛔ CIERRA ESTA CONVERSACIÓN AHORA». Si no lo tienes instalado, esto nunca se activa.
// Solo cuenta si lo escribió Claude en su respuesta (no si apareció leyendo el archivo del comando).
// despues = mensajes tuyos escritos en ese chat después del cierre: cada uno vuelve a pagar todo el contexto.
const MARCA_CIERRE = 'CIERRA ESTA CONVERSACIÓN AHORA'
// El bloque real cierra la respuesta y pide /clear justo después; si la frase solo se menciona a media respuesta, no cuenta.
function esBloqueCierre(texto) {
  const i = texto.lastIndexOf(MARCA_CIERRE)
  if (i < 0) return false
  const resto = texto.slice(i)
  return resto.length < 700 && resto.includes('/clear')
}
function cierre(lineas) {
  let cierreTs = null, despues = 0
  for (const l of lineas) {
    if (l.includes('"type":"assistant"') && l.includes(MARCA_CIERRE)) {
      let o
      try { o = JSON.parse(l) } catch { continue }
      const c = o.message && o.message.content
      const texto = Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : ''
      if (o.type === 'assistant' && !o.isSidechain && esBloqueCierre(texto)) { cierreTs = o.timestamp || 'sin-hora'; despues = 0 }
    } else if (cierreTs && l.includes('"type":"user"')) {
      let o
      try { o = JSON.parse(l) } catch { continue }
      if (o.type !== 'user' || o.isMeta || o.isSidechain) continue
      const c = o.message && o.message.content
      const texto = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : ''
      if (!texto.trim() || /^\s*<(task-notification|local-command|command-name|command-message|system-reminder)/.test(texto)) continue
      despues++
    }
  }
  return { cerrada: Boolean(cierreTs), cierreTs, despues }
}

function procesando(lineas) {
  {
    for (let i = lineas.length - 1; i >= 0; i--) {
      const l = lineas[i].trim()
      if (!l) continue
      let o
      try { o = JSON.parse(l) } catch { continue }
      if (o.type === 'system' && o.subtype === 'stop_hook_summary') return false
      if (o.type === 'assistant') {
        const stop = o.message && o.message.stop_reason
        return !(stop === 'end_turn' || stop === 'stop_sequence' || stop === 'max_tokens' || stop === 'refusal')
      }
      if (o.type === 'user') {
        const c = o.message && o.message.content
        const texto = typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text || '').join(' ') : ''
        if (/^\[Request interrupted/.test(texto.trim())) return false // lo detuviste tú
        // avisos automáticos (tarea en segundo plano, comandos locales): no son un mensaje tuyo esperando respuesta
        if (o.isMeta || /^\s*<(task-notification|local-command|command-name|command-message|system-reminder)/.test(texto)) continue
        return true // tu mensaje o un resultado de herramienta, esperando respuesta
      }
    }
    return false
  }
}

function datosDeChat(ruta) {
  const texto = fs.readFileSync(ruta, 'utf8')
  let titulo = null, custom = null, cwd = null
  for (const m of texto.matchAll(/"type":"ai-title","aiTitle":"((?:[^"\\]|\\.)*)"/g)) titulo = m[1]
  for (const m of texto.matchAll(/"type":"custom-title","customTitle":"((?:[^"\\]|\\.)*)"/g)) custom = m[1]
  const c = texto.match(/"cwd":"((?:[^"\\]|\\.)*)"/)
  if (c) cwd = c[1]
  const limpiar = s => (s ? JSON.parse('"' + s + '"') : null)
  return { titulo: limpiar(custom) || limpiar(titulo), cwd: limpiar(cwd) }
}

// ¿Tiene los comandos /iniciar-sesion y /cerrar-sesion (repo davidiriza-lab/sesiones-claude-code)?
function tieneSesiones() {
  const c = path.join(HOME, '.claude')
  return ['commands/iniciar-sesion.md', 'skills/iniciar-sesion/SKILL.md'].some(r => fs.existsSync(path.join(c, r)))
}

// Comando para retomar el chat en uno nuevo (lo que «Abrir limpio» deja en el portapapeles).
// Solo si tienes /iniciar-sesion. Proyecto, en este orden: carpeta del último STATE.md que tocó el chat
// (/cerrar-sesion lo escribe al final), el /iniciar-sesion con el que arrancó, la carpeta del chat o su título.
const corta = r => (r.startsWith(HOME + '/') ? '~' + r.slice(HOME.length) : r)
function comandoRetomar(id, titulo) {
  if (!tieneSesiones()) return null
  try {
    const texto = fs.readFileSync(rutasChats.get(id), 'utf8')
    let state = null
    for (const m of texto.matchAll(/"file_path":"((?:[^"\\]|\\.)*\/STATE\.md)"/g)) state = m[1]
    if (state) return '/iniciar-sesion ' + corta(path.dirname(JSON.parse('"' + state + '"')))
    // el /iniciar-sesion con el que arrancó el chat (como comando escrito o como skill)
    let args = null
    for (const m of texto.matchAll(/<command-name>\/iniciar-sesion<\/command-name>(?:\\n|\s)*<command-args>([^<]+)<\/command-args>/g)) args = m[1]
    for (const m of texto.matchAll(/"skill":"iniciar-sesion","args":"((?:[^"\\]|\\.)+)"/g)) args = JSON.parse('"' + m[1] + '"')
    if (args && args.trim()) return '/iniciar-sesion ' + args.trim()
    const { cwd } = datosDeChat(rutasChats.get(id))
    if (cwd && cwd !== HOME && cwd.startsWith(HOME + '/')) return '/iniciar-sesion ' + corta(cwd)
  } catch {}
  return titulo ? '/iniciar-sesion ' + String(titulo).replace(/^Inicio de sesión (en|de|del)\s+/i, '') : null
}

function leerChats(max = 40) {
  const abiertos = chatsAbiertos()
  let archivos = []
  try {
    for (const carpeta of fs.readdirSync(PROYECTOS)) {
      const dir = path.join(PROYECTOS, carpeta)
      let nombres
      try { nombres = fs.readdirSync(dir) } catch { continue }
      for (const n of nombres) {
        if (!n.endsWith('.jsonl')) continue
        const ruta = path.join(dir, n)
        try { archivos.push({ ruta, id: n.slice(0, -6), mtime: fs.statSync(ruta).mtimeMs }); rutasChats.set(n.slice(0, -6), ruta) } catch {}
      }
    }
  } catch { return [] }
  archivos.sort((a, b) => b.mtime - a.mtime)
  const chats = []
  for (const a of archivos) {
    if (chats.length >= max) break
    let info = cacheChats.get(a.ruta)
    // Un chat que está trabajando cambia cada pocos segundos: su título se relee como mucho cada 5 min.
    const releer = !info || !info.titulo ? info?.mtime !== a.mtime : info.mtime !== a.mtime && Date.now() - info.leido > 5 * 60 * 1000
    if (releer) {
      try { info = { mtime: a.mtime, leido: Date.now(), ...datosDeChat(a.ruta) } } catch { continue }
      cacheChats.set(a.ruta, info)
    }
    if (!info.titulo) continue // chats vacíos o que nunca tuvieron título
    // abierto = lo tienes abierto ahora en Claude Code (aunque esté quieto): son tus chats activos
    const abierto = abiertos ? estaAbierto(abiertos, a.id, a.ruta) : Date.now() - a.mtime < 10 * 60 * 1000
    // el final solo se lee en los abiertos; se cachea por fecha de modificación
    if (abierto && info.finalMtime !== a.mtime) { info.final = leerFinal(a.ruta); info.finalMtime = a.mtime }
    const final = abierto ? info.final : { trabajando: false, tokens: 0, cerrada: false, cierreTs: null, despues: 0 }
    chats.push({ id: a.id, titulo: info.titulo, proyecto: info.cwd ? path.basename(info.cwd) : '', cwd: info.cwd, mtime: a.mtime,
      abierto,
      // trabajando = abierto y su final dice que no ha cerrado el turno (sin límite de tiempo)
      vivo: abierto && final.trabajando,
      tokens: final.tokens,
      largo: nivelLargo(final.tokens),
      cerrada: final.cerrada, cierreTs: final.cierreTs, despues: final.despues })
  }
  return chats
}

function leerClaude() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_CLAUDE, 'utf8'))
  } catch {
    return null
  }
}

class Proveedor {
  constructor(contexto) {
    this.contexto = contexto
    this.vista = null
    this.datos = { gpt: null, gemini: null, claude: this.claudeActual(), chats: [], actualizado: null, cargando: false }
    this.barra = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.barra.command = 'workbench.view.extension.suscripciones'
    this.barra.text = '$(dashboard) …'
    this.barra.tooltip = 'Mis suscripciones: leyendo cuotas'
    this.barra.show()
    contexto.subscriptions.push(this.barra)
  }

  // Indicador en la barra de abajo: lo más bajo de cada IA, siempre a la vista.
  pintarBarra() {
    const lista = ventanas(this.datos)
    if (!lista.length) return
    const min = ia => {
      const vs = lista.filter(w => w.ia === ia)
      return vs.length ? Math.min(...vs.map(w => Math.round(w.queda))) : null
    }
    const partes = [['C', min('Claude')], ['G', min('GPT')], ['Ge', min('Gemini')]].filter(([, v]) => v !== null)
    this.barra.text = '$(dashboard) ' + partes.map(([k, v]) => k + ' ' + v).join(' · ')
    const peor = Math.min(...lista.map(w => w.queda))
    this.barra.backgroundColor = peor < 20 ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : peor < 50 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined
    this.barra.tooltip = new vscode.MarkdownString('**Mis suscripciones**\n\n' + lista.map(w =>
      `${w.ia} · ${periodo(w)}: **${Math.round(w.queda)}%**` + (w.recargado ? ' (ya se recargó)' : w.recarga ? ` · recarga en ${dentroDe(w.recarga)}` : '')
    ).join('\n\n') + '\n\nClic para abrir el panel')
  }

  // Avisos: al bajar de 20% y cuando un tanque bajo se recarga. Recuerda lo ya avisado entre reinicios.
  avisar() {
    const antes = this.contexto.globalState.get('niveles') || {}
    const ahora = {}
    for (const w of ventanas(this.datos)) {
      const p = Math.round(w.queda), n = nivel(p)
      ahora[w.clave] = n
      const previo = antes[w.clave]
      if (!previo) continue // primera vez que lo vemos: solo se guarda
      if (n === 'rojo' && previo !== 'rojo') {
        vscode.window.showWarningMessage(`${w.ia} (${periodo(w)}) al ${p}%.` + (w.recarga ? ` Se recarga en ${dentroDe(w.recarga)}.` : ''), 'Ver panel')
          .then(r => { if (r) vscode.commands.executeCommand('workbench.view.extension.suscripciones') })
      } else if (n === 'bien' && previo === 'rojo') {
        vscode.window.showInformationMessage(`${w.ia} se recargó: ya tienes ${p}% (${periodo(w)}).`)
      }
    }
    this.contexto.globalState.update('niveles', { ...antes, ...ahora })
  }

  resolveWebviewView(vista) {
    this.vista = vista
    const media = vscode.Uri.joinPath(this.contexto.extensionUri, 'media')
    vista.webview.options = { enableScripts: true, localResourceRoots: [media] }
    vista.webview.html = html(vista.webview, media)
    vista.webview.onDidReceiveMessage(m => {
      if (m && m.tipo === 'actualizar') this.actualizar()
      if (m && m.tipo === 'abrir' && typeof m.id === 'string') { abrirChat(m.id); this.marcarVisto(m.id) }
      if (m && m.tipo === 'cerrar' && typeof m.id === 'string') this.cerrarChat(m.id)
      if (m && m.tipo === 'limpio' && typeof m.id === 'string') this.abrirLimpio(m.id)
      if (m && m.tipo === 'listo') this.enviar()
      if (m && m.tipo === 'cuenta' && Number.isInteger(m.n)) this.cambiarCuenta(m.n)
    })
    vista.onDidChangeVisibility(() => {
      if (!vista.visible) return
      const viejo = !this.datos.actualizado || Date.now() - this.datos.actualizado > 5 * 60 * 1000
      if (viejo) this.actualizar()
      else this.enviar()
    })
    if (!this.datos.actualizado) this.actualizar()
    this.refrescarCuentas()
  }

  // La cuota de Claude sale de la cuenta activa (consulta directa). Si no hay consulta reciente,
  // se usa la que anotan los chats en ~/.claude/cuota-claude.json (puede ser de otra cuenta).
  claudeActual() {
    const cs = this.datos && this.datos.cuentas, act = cs && cs.find(c => c.activa)
    if (act && act.ventanas && act.ventanas.length && Date.now() - (this.cuentasLeidas || 0) < 20 * 60 * 1000)
      return alDia({ actualizado: this.cuentasLeidas, ventanas: act.ventanas, cuenta: act.nombre })
    return alDia(leerClaude())
  }

  async refrescarCuentas() {
    const cs = await leerCuentas()
    if (cs) { this.datos.cuentas = cs; this.cuentasLeidas = Date.now() }
    this.datos.claude = this.claudeActual()
    this.enviar()
    this.pintarBarra()
    this.avisar()
  }

  // Cambia la cuenta de Claude con `cuenta-claude <n>`. Solo los chats nuevos usan la cuenta nueva.
  cambiarCuenta(n) {
    if (this.datos.cambiandoCuenta) return
    this.datos.cambiandoCuenta = n
    this.enviar()
    execFile(CUENTA_CLAUDE, [String(n)], { env: ENV, timeout: 20000 }, async (err, stdout, stderr) => {
      this.datos.cambiandoCuenta = null
      await this.refrescarCuentas()
      if (err) { vscode.window.showErrorMessage('No pude cambiar de cuenta: ' + ((stderr || '').trim() || err.message)); return }
      const c = (this.datos.cuentas || []).find(x => x.n === n)
      const r = await vscode.window.showInformationMessage(
        `Claude: ahora usas la cuenta ${c ? c.nombre + ' (' + c.email + ')' : n}. Los chats nuevos van con esta cuenta; cierra los que tengas abiertos.`, 'Abrir chat nuevo')
      if (!r) return
      try { await vscode.commands.executeCommand('claude-vscode.editor.open') }
      catch { await vscode.commands.executeCommand('claude-vscode.newConversation') }
    })
  }

  enviar() {
    if (this.vista) this.vista.webview.postMessage({ tipo: 'datos', datos: this.datos })
  }

  async actualizar() {
    if (this.datos.cargando) return
    this.datos.cargando = true
    this.enviar()
    const [gpt, gemini] = await Promise.all([correr(CUOTA_GPT), correr(CUOTA_GEMINI)])
    this.datos = { gpt: alDia(gpt), gemini: alDia(gemini), claude: this.claudeActual(), chats: this.conListos(leerChats()), actualizado: Date.now(), cargando: false, cuentas: this.datos.cuentas }
    await this.refrescarCuentas()
    this.enviar()
    this.pintarBarra()
    this.avisar()
  }

  // Cada 15 s: punto verde en los chats que trabajan y aviso cuando uno termina.
  // «Listo, sin revisar» (violeta): terminó y no lo has abierto. Se apaga al abrirlo desde el panel,
  // al volver a escribirle o a las 2 h. Se guarda entre reinicios.
  listos() {
    const ahora = Date.now(), todos = this.contexto.globalState.get('chatsListos') || {}
    const vigentes = {}
    for (const [id, t] of Object.entries(todos)) if (ahora - t < LISTO_MS) vigentes[id] = t
    return vigentes
  }

  guardarListos(l) { this.contexto.globalState.update('chatsListos', l) }

  conListos(chats) {
    const l = this.listos()
    const cerrados = this.contexto.globalState.get('chatsCerrados') || {}
    let cambio = false
    const res = chats.map(c => {
      const t = cerrados[c.id]
      // lo cerraste (pestaña o ×): baja a Recientes hasta que vuelva a tener actividad
      if (t && (c.vivo || c.mtime > t + 5000)) { delete cerrados[c.id]; cambio = true }
      const inactivo = Boolean(cerrados[c.id])
      return { ...c, abierto: c.abierto && !inactivo, listo: !c.vivo && !inactivo && Boolean(l[c.id]) }
    })
    if (cambio) this.contexto.globalState.update('chatsCerrados', cerrados)
    return res
  }

  // Mandar un chat a inactivo: botón × del panel, o al cerrar su pestaña en VS Code.
  cerrarChat(id) {
    const cerrados = this.contexto.globalState.get('chatsCerrados') || {}
    cerrados[id] = Date.now()
    this.contexto.globalState.update('chatsCerrados', cerrados)
    const l = this.listos()
    if (l[id]) { delete l[id]; this.guardarListos(l) }
    this.datos.chats = this.conListos(this.datos.chats || [])
    this.enviar()
  }

  // Pestañas de chat de Claude Code (webview «claudeVSCodePanel», etiqueta = título del chat).
  // Si una pestaña que estaba abierta desaparece, ese chat se cerró: pasa a inactivo al instante.
  revisarPestanas() {
    const titulos = new Set()
    try {
      for (const g of vscode.window.tabGroups.all) for (const t of g.tabs) {
        if (t.input instanceof vscode.TabInputWebview && String(t.input.viewType).includes('claudeVSCodePanel')) titulos.add(t.label)
      }
    } catch { return }
    if (this.pestanasAntes) {
      for (const titulo of this.pestanasAntes) {
        if (titulos.has(titulo)) continue
        const c = (this.datos.chats || []).find(x => x.titulo === titulo && !x.vivo)
        if (c) this.cerrarChat(c.id)
      }
    }
    this.pestanasAntes = titulos
  }

  marcarVisto(id) {
    const l = this.listos()
    if (!l[id]) return
    delete l[id]
    this.guardarListos(l)
    this.datos.chats = this.conListos(this.datos.chats || [])
    this.enviar()
  }

  revisarChats() {
    const chats = leerChats()
    const vivos = new Set(chats.filter(c => c.vivo).map(c => c.id))
    const l = this.listos()
    const ahora = Date.now()
    this.inicio = this.inicio || {}       // id → cuándo empezó a trabajar
    this.porAvisar = this.porAvisar || {} // id → { chat, duro, veces } esperando confirmar que terminó
    for (const id of vivos) {
      delete l[id] // volvió a trabajar: deja de estar «listo»
      delete this.porAvisar[id] // era una pausa entre pasos, no el final
      if (!this.inicio[id]) this.inicio[id] = ahora
    }
    if (this.vivosAntes) {
      for (const c of chats) {
        if (this.vivosAntes.has(c.id) && !vivos.has(c.id)) {
          l[c.id] = ahora
          this.porAvisar[c.id] = { chat: c, duro: ahora - (this.inicio[c.id] || ahora), veces: 0 }
          delete this.inicio[c.id]
        }
      }
    }
    // Avisar solo si: sigue terminado en la siguiente revisión, trabajó más de 2 min y no es la pestaña que estás viendo.
    for (const [id, p] of Object.entries(this.porAvisar)) {
      if (vivos.has(id)) continue
      p.veces++
      if (p.veces < 2) continue
      delete this.porAvisar[id]
      if (p.duro < AVISO_MIN_MS || pestanaActiva(p.chat.titulo) || (p.chat.cerrada && !p.chat.despues)) continue
      vscode.window.showInformationMessage(`Claude terminó: «${p.chat.titulo}»`, 'Abrir').then(r => { if (r) { abrirChat(id); this.marcarVisto(id) } })
    }
    this.guardarListos(l)
    this.vivosAntes = vivos
    const nuevos = this.conListos(chats)
    this.avisarLargos(nuevos)
    this.avisarCierres(nuevos)
    const firma = cs => JSON.stringify(cs.map(c => c.id + c.vivo + c.listo + c.abierto + c.largo + c.cerrada + c.despues + c.titulo))
    const cambio = firma(this.datos.chats || []) !== firma(nuevos)
    this.datos.chats = nuevos
    if (cambio) this.enviar()
  }

  // Aviso de chat largo: solo en chats abiertos y con el turno ya cerrado (no a media tarea),
  // una vez al pasar de 300 mil y otra al pasar de 500 mil. Aquí sí avisa aunque lo tengas enfrente.
  avisarLargos(chats) {
    const avisados = this.contexto.globalState.get('chatsLargos') || {}
    let cambio = false
    for (const c of chats) {
      if (!c.largo) { if (avisados[c.id]) { delete avisados[c.id]; cambio = true } continue } // se compactó: se reinicia
      if (!c.abierto || c.vivo || (c.cerrada && !c.despues) || (avisados[c.id] || 0) >= c.largo) continue
      avisados[c.id] = c.largo
      cambio = true
      const veces = (c.tokens / BASE_TOKENS).toFixed(1).replace('.0', '')
      const texto = (c.largo === 2 ? 'Chat muy largo' : 'Chat largo') + `: «${c.titulo}» va en ${enMiles(c.tokens)} tokens. ` +
        `Cada mensaje ya cuesta ~${veces} veces lo de un chat nuevo. ` +
        (tieneSesiones() ? 'Conviene /cerrar-sesion y seguir en uno limpio.' : 'Conviene seguir en un chat limpio.')
      const aviso = c.largo === 2 ? vscode.window.showWarningMessage(texto, 'Abrir chat limpio', 'Abrir') : vscode.window.showInformationMessage(texto, 'Abrir chat limpio', 'Abrir')
      aviso.then(r => {
        if (r === 'Abrir chat limpio') this.abrirLimpio(c.id)
        else if (r) { abrirChat(c.id); this.marcarVisto(c.id) }
      })
    }
    if (cambio) this.contexto.globalState.update('chatsLargos', avisados)
  }

  // Después de /cerrar-sesion lo que ahorra es que tu siguiente mensaje caiga en un chat nuevo.
  //   recién cerrado → ofrece abrir un chat limpio (solo si el cierre tiene menos de 30 min: al instalar
  //                    no avisa de cierres viejos)
  //   le volviste a escribir → avisa que sigue pagando todo el contexto
  // Una vez por cierre (se recuerda por la hora del bloque de cierre).
  avisarCierres(chats) {
    const vistos = this.contexto.globalState.get('cierresVistos') || {}
    let cambio = false
    for (const c of chats) {
      if (!c.abierto || c.vivo || !c.cerrada) continue
      const v = vistos[c.id] && vistos[c.id].ts === c.cierreTs ? vistos[c.id] : { ts: c.cierreTs }
      const reciente = Date.now() - Date.parse(c.cierreTs) < 30 * 60 * 1000
      let texto = null, tipo = 'info'
      if (!c.despues && !v.cerrado) {
        v.cerrado = true
        if (reciente) texto = `«${c.titulo}» ya se cerró y quedó guardado. Abre un chat limpio para seguir sin arrastrar sus ${enMiles(c.tokens)} tokens.`
      } else if (c.despues && !v.reabierto) {
        v.reabierto = true
        tipo = 'warn'
        texto = `Sigues escribiendo en «${c.titulo}», que ya se cerró: cada mensaje vuelve a pagar sus ${enMiles(c.tokens)} tokens. Abre un chat limpio.`
      } else continue
      vistos[c.id] = v
      cambio = true
      if (!texto) continue
      const aviso = tipo === 'warn' ? vscode.window.showWarningMessage(texto, 'Abrir chat limpio') : vscode.window.showInformationMessage(texto, 'Abrir chat limpio')
      aviso.then(r => { if (r) this.abrirLimpio(c.id) })
    }
    if (cambio) this.contexto.globalState.update('cierresVistos', vistos)
  }

  // Lo mismo que /clear, que ninguna extensión puede escribir en un chat: cierra la pestaña del chat viejo
  // (su contexto deja de usarse y no gasta nada) y abre una conversación nueva en pestaña.
  async abrirLimpio(id) {
    const c = (this.datos.chats || []).find(x => x.id === id)
    if (c) {
      try {
        for (const g of vscode.window.tabGroups.all) for (const t of g.tabs) {
          if (t.input instanceof vscode.TabInputWebview && String(t.input.viewType).includes('claudeVSCodePanel') && t.label === c.titulo) await vscode.window.tabGroups.close(t)
        }
      } catch {}
    }
    // el comando para retomar ese proyecto queda copiado, listo para pegarlo en el chat nuevo
    const comando = comandoRetomar(id, c ? c.titulo : '')
    if (comando) {
      await vscode.env.clipboard.writeText(comando)
      vscode.window.showInformationMessage(`Copiado: ${comando} · pégalo en el chat nuevo (${process.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+V).`)
    }
    this.cerrarChat(id)
    try { await vscode.commands.executeCommand('claude-vscode.editor.open') }
    catch { await vscode.commands.executeCommand('claude-vscode.newConversation') }
  }

  refrescarClaude() {
    this.datos.chats = this.conListos(leerChats())
    this.datos.claude = this.claudeActual()
    this.datos.gpt = alDia(this.datos.gpt)
    this.datos.gemini = alDia(this.datos.gemini)
    this.enviar()
    this.pintarBarra()
    this.avisar()
  }
}

// Solo se avisa si el chat trabajó al menos esto: las respuestas cortas las ves tú.
const AVISO_MIN_MS = 2 * 60 * 1000

// ¿Es ese chat la pestaña que tienes enfrente? Las pestañas de Claude Code son webviews «claudeVSCodePanel»
// con el título del chat. (Si lo usas en la barra lateral no hay pestaña y no se puede saber.)
function pestanaActiva(titulo) {
  try {
    const g = vscode.window.tabGroups.activeTabGroup
    const t = g && g.activeTab
    return Boolean(vscode.window.state.focused && t && t.input instanceof vscode.TabInputWebview &&
      String(t.input.viewType).includes('claudeVSCodePanel') && t.label === titulo)
  } catch { return false }
}

// Abre el chat en Claude Code, como la lista oficial: es lo mismo que hace su enlace
// vscode://anthropic.claude-code/open?session=<id>.
async function abrirChat(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return
  try {
    await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id)
  } catch {
    await vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open?session=' + id))
  }
}

function activate(contexto) {
  const proveedor = new Proveedor(contexto)
  contexto.subscriptions.push(
    vscode.window.registerWebviewViewProvider('suscripciones.vista', proveedor, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('suscripciones.actualizar', () => proveedor.actualizar()),
    vscode.window.tabGroups.onDidChangeTabs(() => proveedor.revisarPestanas()),
  )
  setTimeout(() => proveedor.revisarPestanas(), 4000) // registrar qué pestañas de Claude hay abiertas al arrancar
  proveedor.actualizar() // al arrancar VS Code, para que el indicador de abajo tenga datos sin abrir el panel
  const cada = setInterval(() => proveedor.actualizar(), CADA_MS)
  // Claude cambia más seguido y leerlo es gratis: cada minuto.
  const claude = setInterval(() => proveedor.refrescarClaude(), 60 * 1000)
  const chats = setInterval(() => proveedor.revisarChats(), 15 * 1000)
  const cuentas = setInterval(() => proveedor.refrescarCuentas(), CUENTAS_MS) // cuota de cada cuenta de Claude
  setTimeout(() => proveedor.revisarChats(), 3000) // primera lectura un momento después del arranque (tarda ~2 s)
  contexto.subscriptions.push({ dispose: () => { clearInterval(cada); clearInterval(claude); clearInterval(chats); clearInterval(cuentas) } })
}

function deactivate() {}

function html(webview, media) {
  const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const plantilla = fs.readFileSync(path.join(__dirname, 'media', 'panel.html'), 'utf8')
  return plantilla.replaceAll('{{NONCE}}', nonce).replaceAll('{{CSP}}', webview.cspSource)
}

module.exports = { activate, deactivate }
