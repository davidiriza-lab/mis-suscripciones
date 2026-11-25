# Instrucciones para Claude: instalar mis-suscripciones

Sigue estos pasos en orden. Habla con el usuario en su idioma y sin tecnicismos. Solo espera al usuario donde se indica.

Si leíste este archivo con una herramienta que resume páginas, bájalo completo antes de seguir, porque los comandos van tal cual:
`curl -fsSL https://raw.githubusercontent.com/davidiriza-lab/mis-suscripciones/main/INSTALAR.md`

Reglas para toda la instalación:

- **Nunca reemplaces un archivo que ya existe sin preguntar.** Si es una versión anterior de esto mismo, dilo y pregunta si actualizar.
- No pidas contraseñas, llaves ni tokens. Los inicios de sesión los hace el usuario en su navegador.
- No instales nada que no esté en estos pasos.

Antes de empezar, dile en dos líneas qué vas a hacer: instalar el panel, conectar sus cuentas de Claude y, si las tiene, las de ChatGPT y Gemini.

## 1. Revisar el sistema

- `uname -s` debe ser `Darwin` (Mac) o `Linux`. En Windows (fuera de WSL) dile que no está probado y detente. En Linux todo funciona menos el cambio entre varias cuentas de Claude (paso 5).
- `git --version` y `python3 --version` deben responder. En una Mac nueva pueden abrir una ventana que ofrece instalar las "herramientas de línea de comandos": que acepte, espere a que termine y vuelve a probar.
- Encuentra el comando `code` de VS Code: `command -v code || ls "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"`. Si no existe, pídele que abra VS Code, pulse ⌘⇧P (Ctrl+Shift+P) y ejecute `Shell Command: Install 'code' command in PATH`; luego repite. Si usa Cursor o Windsurf, usa el `cursor` o `windsurf` equivalente.

## 2. Descargar

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
rm -rf "$T"
git clone --depth 1 https://github.com/davidiriza-lab/mis-suscripciones.git "$T"
curl -fsSL -o "$T/mis-suscripciones.vsix" \
  https://github.com/davidiriza-lab/mis-suscripciones/releases/latest/download/mis-suscripciones.vsix \
  || echo "SIN VSIX"
ls "$T/extension" "$T/mod" "$T/bin"
```

Si dice `SIN VSIX`, en el paso 4 se arma la extensión con Node.js.

## 3. Instalar el mod (la cuota de Claude)

1. Si `~/.claude/mods/mis-suscripciones` ya existe, compáralo con `diff -r "$T/mod" ~/.claude/mods/mis-suscripciones`. Si es igual, sáltate este paso. Si es distinto, pregunta antes de reemplazarlo.
2. Copia la carpeta:

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
mkdir -p ~/.claude/mods
rm -rf ~/.claude/mods/mis-suscripciones
cp -R "$T/mod" ~/.claude/mods/mis-suscripciones
claude plugin validate ~/.claude/mods/mis-suscripciones
```

(Si `claude` no está en el PATH, sáltate la validación; no es necesaria.)

3. Agrega la carpeta a `CLAUDE_CODE_PLUGIN_DIRS` en el bloque `env` de `~/.claude/settings.json`. Lee primero el archivo:
   - Si `env.CLAUDE_CODE_PLUGIN_DIRS` no existe, créalo con el valor `~/.claude/mods/mis-suscripciones`.
   - Si ya tiene valor y no incluye esta ruta, **añádela** al final separada por `:`. No borres las que ya estén.
   - Conserva el resto del archivo tal cual. Si no es JSON válido, detente y dile al usuario.

## 4. Instalar la extensión

Usa el `code` que encontraste en el paso 1. Si ya tenía una versión anterior, esto la actualiza.

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
code --install-extension "$T/mis-suscripciones.vsix" --force
```

Si no hubo `.vsix` en el paso 2, ármalo (necesita Node.js; si no lo tiene, dile que lo instale desde nodejs.org y detente):

```bash
cd "$T/extension"
npx -y @vscode/vsce@3.6.0 package -o "$T/mis-suscripciones.vsix"
code --install-extension "$T/mis-suscripciones.vsix" --force
```

## 5. Configurar sus cuentas de Claude

El panel muestra cuánto le queda a cada cuenta de Claude y deja cambiar de una a otra con un clic, sin volver a iniciar sesión. Para eso se instala `cuenta-claude`, que guarda cada cuenta en el Llavero de la Mac.

**En Linux sáltate este paso**: el panel mostrará la cuenta con la que esté usando Claude Code.

### 5.1 Instalar `cuenta-claude`

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
mkdir -p ~/.local/bin
if [ ! -e ~/.local/bin/cuenta-claude ]; then echo NUEVO
elif cmp -s "$T/bin/cuenta-claude" ~/.local/bin/cuenta-claude; then echo IGUAL
else echo DISTINTO; fi
```

- `NUEVO`: `cp "$T/bin/cuenta-claude" ~/.local/bin/ && chmod +x ~/.local/bin/cuenta-claude`
- `IGUAL`: ya está al día.
- `DISTINTO`: pregunta si reemplazarlo. Si sí, guarda antes una copia como `cuenta-claude.bak`.

### 5.2 Guardar la cuenta actual

1. Corre `~/.local/bin/cuenta-claude`.
   - Si dice **"No hay sesión de Claude en el Llavero"**, pídele que inicie sesión en Claude Code con `/login` y repite.
   - La primera vez, la Mac puede pedir permiso para usar el Llavero: que elija **Permitir siempre**.
2. Pregúntale cómo quiere llamar a la cuenta con la que está ahora (por ejemplo "Personal" o "Trabajo"; corto, porque se ve en el panel) y guárdala:

```bash
~/.local/bin/cuenta-claude guardar "Personal"
```

Aunque tenga una sola cuenta, guárdala: así el panel le pregunta a Anthropic cuánto le queda cada 3 minutos, sin esperar a que un chat lo anote.

### 5.3 Agregar sus otras cuentas

Pregúntale si usa otra cuenta de Claude en esta computadora (por ejemplo la del trabajo). Si no, sigue al 5.4. Si sí, repite esto por cada una:

1. Pídele que, **en Claude Code** (en la terminal con `claude` o en el chat de VS Code), escriba `/login`, elija entrar con su suscripción de Claude y, en el navegador, entre con **la otra cuenta**. Que use `/login` directo, sin `/logout` antes. **Espera** a que te diga que ya entró.
2. Pregúntale el nombre de esa cuenta y guárdala:

```bash
~/.local/bin/cuenta-claude guardar "Trabajo"
```

3. Corre `~/.local/bin/cuenta-claude`: deben salir todas las cuentas guardadas, con un `●` en la activa, su correo y su organización. Un mismo correo puede estar dos veces si son organizaciones o suscripciones distintas (al hacer `/login`, el navegador pregunta cuál). Si guardar dice que ya existe esa cuenta, el `/login` no cambió de cuenta u organización: que lo repita eligiendo la otra.

### 5.4 Dejar activa la principal

Pregúntale con cuál quiere trabajar normalmente y cámbiala con su número de la lista:

```bash
~/.local/bin/cuenta-claude 1
```

Explícale:

- En el panel, debajo de Claude, sale la lista **Cuentas** con lo que le queda a cada una. La activa tiene punto naranja. Clic en otra para cambiar.
- Solo los chats **nuevos** usan la cuenta nueva: los abiertos siguen con la anterior.
- En la terminal también puede cambiar: `cuenta-claude` (lista), `cuenta-claude 2` (cambia), `cuenta-claude renombrar 2 "Nuevo"`, `cuenta-claude borrar "Nombre"`.
- Si una cuenta sale con "sesión vencida", basta cambiar a ella, hacer `/login` con esa cuenta una vez y correr `cuenta-claude guardar "Nombre"`.

## 6. Configurar ChatGPT y Gemini (opcional)

Pregúntale, en una sola pregunta, si tiene **ChatGPT** (Plus o superior) y/o **Google AI Pro o Ultra**. Si no tiene ninguna, el panel funciona solo con Claude: no insistas y sigue al paso 7.

Para cada una que tenga, revisa si ya funciona:

```bash
~/.local/bin/cuota-gpt --json      # ChatGPT
~/.local/bin/cuota-gemini --json   # Gemini
```

- Si responde con `"ok": true`, esa ya está lista.
- Si el archivo no existe, esa parte viene del repo `davidiriza-lab/claude-con-gemini-y-gpt`. Dile que se instala aparte y ofrece hacerlo ahora siguiendo su `INSTALAR.md` (instala solo la parte de las suscripciones que tiene; ese instalador lo guía para entrar a Codex con su cuenta de ChatGPT y a Antigravity con su cuenta de Google):
  `curl -fsSL https://raw.githubusercontent.com/davidiriza-lab/claude-con-gemini-y-gpt/main/INSTALAR.md`
- Si existe pero responde con error de sesión:
  - **ChatGPT**: que corra en su terminal `~/.local/bin/codex-sub login` y elija **Sign in with ChatGPT** (no una API key, que se cobra aparte).
  - **Gemini**: que abra una terminal nueva, corra `~/.local/bin/agy`, entre con la cuenta de Google que tiene la suscripción y salga con `/quit`.

  **Espera** a que te diga que ya entró y vuelve a probar.

## 7. Probar y cerrar

1. Pídele que **abra una sesión nueva de Claude Code** (para que cargue el mod) y que escriba cualquier mensaje.
2. Confirma que existe el archivo de cuota: `cat ~/.claude/cuota-claude.json`. En Mac, confirma también `~/.local/bin/cuenta-claude --uso` (cada cuenta con sus porcentajes).
3. Pídele que en VS Code ejecute `Developer: Reload Window` y abra el ícono de velocímetro de la barra lateral, **Mis suscripciones**.
4. Pregúntale qué ve: el anillo de Claude con su porcentaje, la lista de cuentas si guardó más de una, y los anillos de GPT y Gemini si los configuró.
5. Limpia: `rm -rf "${TMPDIR:-/tmp}/mis-suscripciones"`.

Si el anillo de Claude sale vacío, casi siempre falta mandar un mensaje en una sesión nueva o `CLAUDE_CODE_PLUGIN_DIRS` no quedó guardado: revisa `~/.claude/settings.json`.

## 8. Reportar

Dile en pocas líneas:

- qué quedó instalado (panel, mod, `cuenta-claude`, GPT, Gemini) y qué no, y por qué;
- qué cuentas de Claude quedaron guardadas y cuál está activa;
- que para actualizar después basta pegar otra vez el mismo mensaje con el que instaló;
- y, si usa mucho Claude Code, que el panel avisa cuando un chat se hace largo (cada mensaje cuesta más) y ofrece **Abrir limpio**. Con los comandos `/iniciar-sesion` y `/cerrar-sesion` del repo `davidiriza-lab/sesiones-claude-code`, además detecta el cierre y le deja copiado el comando para retomar.
