# Quota Widget (es)

[English](../README.md) · [Português](README.pt-BR.md)

Widget flotante para Windows que reúne las cuotas de uso de tus IA en un solo lugar, con barras y cuenta regresiva hasta la renovación. Soporta **Claude**, **ChatGPT (Codex)**, **Command Code**, **Ollama**, **OpenRouter**, **DeepSeek**, **Moonshot (Kimi)**, **GitHub Copilot**, **Synthetic**, **NanoGPT**, **OpenAI API**, **Anthropic API**, **xAI (Grok)**, **Mistral** y **OpenCode Go**, y se aceptan nuevos proveedores.

- **Instalar:** descarga `Quota-Widget-Setup-<versión>.exe` desde la página de [Releases](https://github.com/edilsondjr/ai-quota-widget/releases). El instalador no está firmado, así que SmartScreen puede avisar; haz clic en "Más información" y "Ejecutar de todas formas".
- **Configurar:** haz clic en ⚙ en el widget para ver un servicio por fila (activar/desactivar, estado y detalles de ventanas y claves), además del intervalo de actualización, el idioma (English/Español/Português) y el inicio con Windows. Todo queda en `~/.quotawidget/`: las claves de API se guardan localmente y cifradas por Windows (el `config.json` solo contiene los blobs cifrados) y los perfiles de inicio de sesión viven en `profiles/`. Puedes añadir proveedores personalizados con un formulario guiado o un spec JSON.
- **Compilar desde el código:** `npm install` y `npm run dist` (Node 22.12+, en Windows).
- **Aviso:** algunas de las rutas usadas no son oficiales y pueden cambiar. Úsalo solo con tus propias cuentas y bajo tu propio riesgo.

La documentación completa (en inglés) está en el [README](../README.md).
