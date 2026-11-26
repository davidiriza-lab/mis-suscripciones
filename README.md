# Mis suscripciones

Un panel en la barra lateral de VS Code con lo que te queda de Claude (en todas tus cuentas), ChatGPT y Gemini, y tus chats de Claude Code en vivo.

Si pagas varias suscripciones de IA, esto te dice de un vistazo cuál tiene aire y cuál está por agotarse, sin abrir tres páginas. Todo sale de tus **suscripciones**, nunca de una API que se cobre aparte.

- **Un anillo por IA que tengas**: Claude siempre; GPT y Gemini solo si los conectas (son opcionales y el panel se adapta). Cada anillo muestra el tanque que más se está gastando.
- **Detalle por IA**: el otro tanque (5 horas o semanal) y cuándo se recarga.
- **Varias cuentas de Claude** (Mac): lo que le queda a cada una y cambio de cuenta con un clic, sin volver a iniciar sesión.
- **Indicador en la barra de abajo** (`C 97 · G 97 · Ge 100`) y aviso cuando una baja de 20 % o cuando se recarga.
- **Tus chats de Claude Code**: verde mientras trabajan, violeta cuando terminaron y no los has revisado, con buscador y aviso cuando uno termina una tarea larga.
- **Aviso de chat largo** (300 mil y 500 mil tokens): cada mensaje de un chat largo cuesta varias veces lo de uno nuevo. Con **Abrir limpio** cierras esa pestaña y abres un chat nuevo.
- **Guía** de para qué es buena cada IA.

## Instalar: pega esto en Claude Code

```
Lee https://raw.githubusercontent.com/davidiriza-lab/mis-suscripciones/main/INSTALAR.md
y sigue sus instrucciones al pie de la letra.
```

Claude revisa qué tienes, instala la extensión y el mod, te guía para conectar tus cuentas de Claude y, solo si las tienes, las de ChatGPT y Gemini, y prueba que el panel lea tus cuotas. Pide permiso antes de tocar cualquier archivo que ya exista. Al terminar, abre VS Code de nuevo (`Developer: Reload Window`).

**Para actualizar**, pega el mismo mensaje: instala la versión nueva encima.

## Qué necesitas

- **VS Code** y **Claude Code** en Mac o Linux. En Windows no está probado.
- **Python 3** (viene en Mac con las herramientas de línea de comandos) para `cuenta-claude`.
- Opcional, para ver GPT: **ChatGPT Plus** o superior y **Codex** (la extensión de VS Code o `npm i -g @openai/codex`).
- Opcional, para ver Gemini: **Google AI Pro o Ultra** y **Antigravity CLI** (`agy`). El instalador te guía con los dos.

Sin GPT ni Gemini el panel funciona igual, solo con Claude. Lo que conectes después aparece solo.

## Cómo funciona

| Dato | De dónde sale |
|---|---|
| Claude | `~/.local/bin/cuenta-claude --uso`, que le pregunta a Anthropic cuánto le queda a cada cuenta guardada (cada 3 min). Si no está, `~/.claude/cuota-claude.json`, que escribe el mod de la carpeta `mod/` desde Claude Code |
| GPT | `~/.local/bin/cuota-gpt --json` (si no está instalado, GPT no aparece) |
| Gemini | `~/.local/bin/cuota-gemini --json` (si no está instalado, Gemini no aparece) |
| Chats | los archivos de sesión de `~/.claude/projects/` y los procesos de Claude Code abiertos |

Se actualiza cada 15 minutos, al abrir el panel si el dato tiene más de 5, o con el botón de actualizar. Claude se relee cada minuto porque es gratis.

## Qué trae

| Carpeta | Qué es |
|---|---|
| `extension/` | La extensión de VS Code: el panel, el indicador y los avisos. |
| `mod/` | El mod de Claude Code. Su única tarea es guardar la cuota de Claude. |
| `bin/cuenta-claude` | Guarda tus cuentas de Claude en el Llavero de la Mac y cambia entre ellas. |
| `bin/cuota-gpt`, `bin/codex-sub` | Opcional: leen lo que te queda de ChatGPT a través de Codex. |
| `bin/cuota-gemini` | Opcional: lee lo que te queda de Gemini a través de Antigravity CLI. |

## Varias cuentas de Claude

`cuenta-claude` guarda una copia de la sesión de cada cuenta en el Llavero y, al cambiar, la pone como la activa de Claude Code. No toca los tokens de tus conectores MCP. Solo los chats nuevos usan la cuenta nueva.

```bash
cuenta-claude                      # lista, con ● en la activa
cuenta-claude guardar "Trabajo"    # guarda la cuenta con la que estás ahora
cuenta-claude 2                    # cambia a la cuenta 2 (o por nombre)
cuenta-claude renombrar 2 "Otra"
cuenta-claude borrar "Otra"
```

Para agregar una cuenta: en Claude Code haz `/login` con ella (sin `/logout` antes) y luego `cuenta-claude guardar "Nombre"`. Solo Mac por ahora.

## Personalizar la guía

La lista de "para qué sirve cada IA" es la constante `GUIA` en `extension/media/panel.html`. Cámbiala por cómo reparte tu trabajo cada una y reinstala la extensión.

## Límites conocidos

- Si Claude espera que apruebes un permiso, el chat se ve verde: no deja rastro en los archivos.
- Si usas Claude en la barra lateral y no en una pestaña, no se puede saber qué chat estás viendo.

## Licencia

MIT.
