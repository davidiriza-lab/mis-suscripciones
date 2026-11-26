# Instrucciones para Claude: instalar mis-suscripciones

Sigue estos pasos en orden. Habla con el usuario en su idioma y sin tecnicismos. Solo espera al usuario donde se indica.

Si leíste este archivo con una herramienta que resume páginas, bájalo completo antes de seguir, porque los comandos van tal cual:
`curl -fsSL https://raw.githubusercontent.com/davidiriza-lab/mis-suscripciones/main/INSTALAR.md`

Reglas para toda la instalación:

- **Nunca reemplaces un archivo que ya existe sin preguntar.** Si es una versión anterior de esto mismo, dilo y pregunta si actualizar.
- No pidas contraseñas, llaves ni tokens. Los inicios de sesión los hace el usuario en su navegador.
- No instales nada que no esté en estos pasos.

Antes de empezar, dile en dos líneas qué vas a hacer: instalar el panel, conectar sus cuentas de Claude y, solo si las tiene, las de ChatGPT y Gemini. Todo lo demás es opcional: el panel muestra lo que conecte.

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

## 6. Conectar ChatGPT y Gemini (opcional)

El panel se adapta solo: muestra Claude siempre, y GPT y Gemini únicamente si los conecta. Lo que no conecte no aparece ni marca error.

Pregúntale, en una sola pregunta, si tiene **ChatGPT** (Plus o superior) y/o **Google AI Pro o Ultra**. Conecta solo las que tenga; no hacen falta las dos. Si no tiene ninguna, no insistas y sigue al paso 7: se pueden agregar después repitiendo esta instalación.

### 6.1 Instalar los programas de cuota

| Suscripción | Programas en `~/.local/bin/` |
|---|---|
| ChatGPT | `codex-sub`, `cuota-gpt` |
| Google | `cuota-gemini` |

Revisa solo los de las suscripciones que tiene:

```bash
T="${TMPDIR:-/tmp}/mis-suscripciones"
mkdir -p ~/.local/bin
for f in codex-sub cuota-gpt cuota-gemini; do
  if [ ! -e ~/.local/bin/$f ]; then echo "NUEVO     $f"
  elif cmp -s "$T/bin/$f" ~/.local/bin/$f; then echo "IGUAL     $f"
  else echo "DISTINTO  $f"; fi
done
```

- `NUEVO`: `cp "$T/bin/<archivo>" ~/.local/bin/ && chmod +x ~/.local/bin/<archivo>`
- `IGUAL`: ya está al día.
- `DISTINTO`: puede ser una versión anterior de esto mismo (por ejemplo del repo `claude-con-gemini-y-gpt`, que usa los mismos archivos) o algo suyo. Pregunta si reemplazarlo y, si sí, guarda antes una copia como `<archivo>.bak`.

### 6.2 ChatGPT: Codex con su cuenta

1. `~/.local/bin/codex-sub --version`. Si dice que no encontró Codex, dale dos opciones:
   - instalar en VS Code la extensión **Codex – OpenAI's coding agent** (la más fácil), o
   - en la terminal: `npm i -g @openai/codex` (necesita Node.js).

   **Espera** a que lo haga y vuelve a probar.
2. `~/.local/bin/codex-sub login status`.
   - Si dice **"Logged in using ChatGPT"**, sigue.
   - Si no hay sesión, o dice que usa una **API key** (eso se cobra aparte): pídele que corra en su terminal `~/.local/bin/codex-sub login` y elija **Sign in with ChatGPT** en el navegador. **Espera** a que te diga que ya entró y vuelve a revisar.

### 6.3 Gemini: Antigravity CLI con su cuenta de Google

No uses el viejo `gemini` CLI ni una `GEMINI_API_KEY`: Google lo cerró para cuentas personales.

1. Revisa si ya existe: `command -v agy || ls ~/.local/bin/agy`.
2. Si no existe, se instala con el instalador oficial de Google. Si no tienes permiso para correrlo tú, dale el comando:
   ```bash
   curl -fsSL https://antigravity.google/cli/install.sh | bash
   ```
   Si al terminar abre solo la pantalla de inicio de sesión, ahí no se puede escribir: que la cierre con `Ctrl+C`.
3. Iniciar sesión lo hace él, en una terminal **nueva**: `~/.local/bin/agy`. Se abre el navegador → entra con la cuenta de Google que tiene la suscripción → copia el código → lo pega en la terminal → elige un color (Enter), deja lo demás como viene y sale con `/quit`. **Espera** a que te diga que ya entró.
4. Si sale **"not eligible"**, es un problema conocido de Google con algunas cuentas de AI Pro: deja Gemini fuera por ahora (borra `~/.local/bin/cuota-gemini` si lo acabas de instalar, para que el panel no lo muestre con error).

### 6.4 Probar

```bash
~/.local/bin/cuota-gpt --json      # si conectó ChatGPT
~/.local/bin/cuota-gemini --json   # si conectó Gemini
```

Cada uno debe responder con `"ok": true`. Si da error de sesión, repite el inicio de sesión de esa parte.

Si además quiere **usar** esas suscripciones desde Claude (`/gpt`, `/gemini`, `/imagen`), eso es el repo `davidiriza-lab/claude-con-gemini-y-gpt`. Ofrécelo en una línea; no hace falta para el panel.

## 7. Probar y cerrar

1. Pídele que **abra una sesión nueva de Claude Code** (para que cargue el mod) y que escriba cualquier mensaje.
2. Confirma que existe el archivo de cuota: `cat ~/.claude/cuota-claude.json`. En Mac, confirma también `~/.local/bin/cuenta-claude --uso` (cada cuenta con sus porcentajes).
3. Pídele que en VS Code ejecute `Developer: Reload Window` y abra el ícono de velocímetro de la barra lateral, **Mis suscripciones**.
4. Pregúntale qué ve: el anillo de Claude con su porcentaje, la lista de cuentas si guardó más de una, y los anillos de GPT y Gemini si los configuró.
5. Limpia: `rm -rf "${TMPDIR:-/tmp}/mis-suscripciones"`.

Si el anillo de Claude sale vacío, casi siempre falta mandar un mensaje en una sesión nueva o `CLAUDE_CODE_PLUGIN_DIRS` no quedó guardado: revisa `~/.claude/settings.json`.

## 8. Reportar

Dile en pocas líneas:

- qué quedó instalado (panel, mod, `cuenta-claude`, GPT, Gemini) y qué no, y por qué; que lo que no conectó no aparece en el panel y se puede agregar cuando quiera repitiendo la instalación;
- qué cuentas de Claude quedaron guardadas y cuál está activa;
- que para actualizar después basta pegar otra vez el mismo mensaje con el que instaló;
- y, si usa mucho Claude Code, que el panel avisa cuando un chat se hace largo (cada mensaje cuesta más) y ofrece **Abrir limpio**. Con los comandos `/iniciar-sesion` y `/cerrar-sesion` del repo `davidiriza-lab/sesiones-claude-code`, además detecta el cierre y le deja copiado el comando para retomar.
