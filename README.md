# Mis suscripciones

Un panel en la barra lateral de VS Code con lo que te queda de Claude, ChatGPT y Gemini, y tus chats de Claude Code en vivo.

Si pagas varias suscripciones de IA, esto te dice de un vistazo cuál tiene aire y cuál está por agotarse, sin abrir tres páginas. Todo sale de tus **suscripciones**, nunca de una API que se cobre aparte.

- **Tres anillos arriba**: Claude, GPT y Gemini. Cada uno muestra el tanque que más se está gastando.
- **Detalle por IA**: el otro tanque (5 horas o semanal) y cuándo se recarga.
- **Indicador en la barra de abajo** (`C 97 · G 97 · Ge 100`) y aviso cuando una baja de 20 % o cuando se recarga.
- **Tus chats de Claude Code**: verde mientras trabajan, violeta cuando terminaron y no los has revisado, con buscador y aviso cuando uno termina una tarea larga.
- **Guía** de para qué es buena cada IA.

## Instalar: pega esto en Claude Code

```
Lee https://raw.githubusercontent.com/davidiriza-lab/mis-suscripciones/main/INSTALAR.md
y sigue sus instrucciones al pie de la letra.
```

Claude revisa qué tienes, instala la extensión y el mod, y prueba que el panel lea tus cuotas. Pide permiso antes de tocar cualquier archivo que ya exista. Al terminar, abre VS Code de nuevo (`Developer: Reload Window`).

## Qué necesitas

- **VS Code** y **Claude Code** en Mac o Linux. En Windows no está probado.
- **Node.js**, solo para empaquetar la extensión (una vez).
- Para ver GPT y Gemini, los scripts `cuota-gpt` y `cuota-gemini` del repo [claude-con-gemini-y-gpt](https://github.com/davidiriza-lab/claude-con-gemini-y-gpt). Sin ellos el panel funciona, pero solo con Claude.

## Cómo funciona

| Dato | De dónde sale |
|---|---|
| Claude | `~/.claude/cuota-claude.json`, que escribe el mod de la carpeta `mod/` desde Claude Code (solo Claude Code conoce esa cuota) |
| GPT | `~/.local/bin/cuota-gpt --json` |
| Gemini | `~/.local/bin/cuota-gemini --json` |
| Chats | los archivos de sesión de `~/.claude/projects/` y los procesos de Claude Code abiertos |

Se actualiza cada 15 minutos, al abrir el panel si el dato tiene más de 5, o con el botón de actualizar. Claude se relee cada minuto porque es gratis.

## Qué trae

| Carpeta | Qué es |
|---|---|
| `extension/` | La extensión de VS Code: el panel, el indicador y los avisos. |
| `mod/` | El mod de Claude Code. Su única tarea es guardar la cuota de Claude. |

## Personalizar la guía

La lista de "para qué sirve cada IA" es la constante `GUIA` en `extension/media/panel.html`. Cámbiala por cómo reparte tu trabajo cada una y reinstala la extensión.

## Límites conocidos

- Si Claude espera que apruebes un permiso, el chat se ve verde: no deja rastro en los archivos.
- Si usas Claude en la barra lateral y no en una pestaña, no se puede saber qué chat estás viendo.

## Licencia

MIT.
