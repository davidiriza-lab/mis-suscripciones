# Instrucciones para Claude: instalar mis-suscripciones

Sigue estos pasos en orden. Habla con el usuario en su idioma y sin tecnicismos. Solo espera al usuario donde se indica.

Si leíste este archivo con una herramienta que resume páginas, bájalo completo antes de seguir, porque los comandos van tal cual:
`curl -fsSL https://raw.githubusercontent.com/davidiriza-lab/mis-suscripciones/main/INSTALAR.md`

Reglas para toda la instalación:

- **Nunca reemplaces un archivo que ya existe sin preguntar.**
- No pidas contraseñas, llaves ni tokens.
- No instales nada que no esté en estos pasos.

## 1. Revisar el sistema

- `uname -s` debe ser `Darwin` o `Linux`. En Windows (fuera de WSL) dile que no está probado y detente.
- `node --version` debe responder. Si no hay Node.js, dile que lo instale desde nodejs.org y detente.
- `git --version` debe responder.
- Encuentra el comando `code` de VS Code: `command -v code || ls "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"`. Si no existe, pídele que abra VS Code, pulse ⌘⇧P (Ctrl+Shift+P) y ejecute `Shell Command: Install 'code' command in PATH`; luego repite. Si usa Cursor o Windsurf, usa el `cursor` o `windsurf` equivalente.

## 2. Descargar

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
rm -rf "$T"
git clone --depth 1 https://github.com/davidiriza-lab/mis-suscripciones.git "$T"
ls "$T/extension" "$T/mod"
```

## 3. Instalar el mod (la cuota de Claude)

1. Si `~/.claude/mods/mis-suscripciones` ya existe, pregunta antes de reemplazarlo.
2. Copia la carpeta:

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
mkdir -p ~/.claude/mods
cp -R "$T/mod" ~/.claude/mods/mis-suscripciones
claude plugin validate ~/.claude/mods/mis-suscripciones
```

3. Agrega la carpeta a `CLAUDE_CODE_PLUGIN_DIRS` en el bloque `env` de `~/.claude/settings.json`. Lee primero el archivo:
   - Si `env.CLAUDE_CODE_PLUGIN_DIRS` no existe, créalo con el valor `~/.claude/mods/mis-suscripciones`.
   - Si ya tiene valor, **añade** esta ruta al final separada por `:` (en Mac y Linux). No borres las que ya estén.
   - Conserva el resto del archivo tal cual. Si no es JSON válido, detente y dile al usuario.

## 4. Instalar la extensión

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
cd "$T/extension"
npx -y @vscode/vsce@3.6.0 package -o mis-suscripciones.vsix
code --install-extension mis-suscripciones.vsix --force
```

(Usa el `code` que encontraste en el paso 1.)

## 5. GPT y Gemini (opcional)

Pregunta al usuario si tiene ChatGPT (Plus o superior) y/o Google AI Pro o Ultra.

- Si sí, revisa si ya existen `~/.local/bin/cuota-gpt` y `~/.local/bin/cuota-gemini`.
- Si faltan, dile que para esa parte necesita el repo `davidiriza-lab/claude-con-gemini-y-gpt` y ofrece instalarlo siguiendo su `INSTALAR.md`:
  `curl -fsSL https://raw.githubusercontent.com/davidiriza-lab/claude-con-gemini-y-gpt/main/INSTALAR.md`
- Si no tiene ninguna, el panel funciona solo con Claude. No insistas.

## 6. Probar y cerrar

1. Pídele que **abra una sesión nueva de Claude Code** (para que cargue el mod) y que escriba cualquier mensaje.
2. Confirma que existe el archivo de cuota: `cat ~/.claude/cuota-claude.json`.
3. Pídele que en VS Code ejecute `Developer: Reload Window` y abra el ícono de velocímetro de la barra lateral, **Mis suscripciones**.
4. Dile qué ve: el anillo de Claude con su porcentaje (y los de GPT y Gemini si los instaló).
5. Limpia: `rm -rf "${TMPDIR:-/tmp}/mis-suscripciones"`.

Si el anillo de Claude sale vacío, casi siempre es que falta mandar un mensaje en una sesión nueva o que `CLAUDE_CODE_PLUGIN_DIRS` no quedó guardado: revisa `~/.claude/settings.json`.
