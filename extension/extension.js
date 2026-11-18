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
  const add = (ia, f, filtro) => ((f && f.ventanas) || []).filter(filtro || (() => true)).forEach(w => lista.push({ ia, ...w, clave: ia + '|' + w.etiqueta }))
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
// Cuánto dura el violeta de «listo, sin revisar» si no abres el chat desde el panel.
const LISTO_MS = 2 * 60 * 60 * 1000

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

// ¿Está procesando? Se lee el final del archivo: si lo último de la conversación es Claude cerrando su turno
// (stop_reason "end_turn") o un aviso de fin de turno, terminó. Si lo último es una herramienta corriendo,
// un resultado de herramienta o tu mensaje sin respuesta, está trabajando.
function procesando(ruta) {
  let fd
  try {
    fd = fs.openSync(ruta, 'r')
    const tam = fs.fstatSync(fd).size
    const largo = Math.min(tam, 256 * 1024)
    const buf = Buffer.alloc(largo)
    fs.readSync(fd, buf, 0, largo, tam - largo)
    const lineas = buf.toString('utf8').split('\n')
    if (tam > largo) lineas.shift() // la primera puede venir cortada
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
  } catch {
    return false
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
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
        try { archivos.push({ ruta, id: n.slice(0, -6), mtime: fs.statSync(ruta).mtimeMs }) } catch {}
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
    chats.push({ id: a.id, titulo: info.titulo, proyecto: info.cwd ? path.basename(info.cwd) : '', cwd: info.cwd, mtime: a.mtime,
      abierto,
      // trabajando = abierto y su final dice que no ha cerrado el turno (sin límite de tiempo)
      vivo: abierto && procesando(a.ruta) })
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
    this.datos = { gpt: null, gemini: null, claude: alDia(leerClaude()), chats: [], actualizado: null, cargando: false }
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
      if (m && m.tipo === 'listo') this.enviar()
    })
    vista.onDidChangeVisibility(() => {
      if (!vista.visible) return
      const viejo = !this.datos.actualizado || Date.now() - this.datos.actualizado > 5 * 60 * 1000
      if (viejo) this.actualizar()
      else this.enviar()
    })
    if (!this.datos.actualizado) this.actualizar()
  }

  enviar() {
    if (this.vista) this.vista.webview.postMessage({ tipo: 'datos', datos: this.datos })
  }

  async actualizar() {
    if (this.datos.cargando) return
    this.datos.cargando = true
    this.enviar()
    const [gpt, gemini] = await Promise.all([correr(CUOTA_GPT), correr(CUOTA_GEMINI)])
    this.datos = { gpt: alDia(gpt), gemini: alDia(gemini), claude: alDia(leerClaude()), chats: this.conListos(leerChats()), actualizado: Date.now(), cargando: false }
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
      if (p.duro < AVISO_MIN_MS || pestanaActiva(p.chat.titulo)) continue
      vscode.window.showInformationMessage(`Claude terminó: «${p.chat.titulo}»`, 'Abrir').then(r => { if (r) { abrirChat(id); this.marcarVisto(id) } })
    }
    this.guardarListos(l)
    this.vivosAntes = vivos
    const nuevos = this.conListos(chats)
    const firma = cs => JSON.stringify(cs.map(c => c.id + c.vivo + c.listo + c.abierto + c.titulo))
    const cambio = firma(this.datos.chats || []) !== firma(nuevos)
    this.datos.chats = nuevos
    if (cambio) this.enviar()
  }

  refrescarClaude() {
    this.datos.chats = this.conListos(leerChats())
    this.datos.claude = alDia(leerClaude())
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
  setTimeout(() => proveedor.revisarChats(), 3000) // primera lectura un momento después del arranque (tarda ~2 s)
  contexto.subscriptions.push({ dispose: () => { clearInterval(cada); clearInterval(claude); clearInterval(chats) } })
}

function deactivate() {}

function html(webview, media) {
  const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const plantilla = fs.readFileSync(path.join(__dirname, 'media', 'panel.html'), 'utf8')
  return plantilla.replaceAll('{{NONCE}}', nonce).replaceAll('{{CSP}}', webview.cspSource)
}

module.exports = { activate, deactivate }
