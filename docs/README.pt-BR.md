# Quota Widget (pt-BR)

[English](../README.md) · [Español](README.es.md)

Widget flutuante para Windows que reúne as quotas de uso das suas IAs em um só lugar, com barras e contagem regressiva até a renovação. Hoje suporta **Claude**, **ChatGPT (Codex)**, **Command Code**, **Ollama**, **OpenRouter**, **DeepSeek**, **Moonshot (Kimi)**, **GitHub Copilot**, **Synthetic**, **NanoGPT**, **OpenAI API**, **Anthropic API**, **xAI (Grok)**, **Mistral** e **OpenCode Go**, e novos provedores são bem-vindos.

- **Instalar:** baixe o `Quota-Widget-Setup-<versão>.exe` na página de [Releases](https://github.com/edilsondjr/ai-quota-widget/releases). O instalador não é assinado, então o SmartScreen pode avisar; clique em "Mais informações" e "Executar assim mesmo".
- **Configurar:** clique no ⚙ do widget para ver um serviço por linha (ligar/desligar, status e detalhes de janelas e chaves), além do intervalo de atualização, do idioma (English/Español/Português) e do início com o Windows. Tudo fica em `~/.quotawidget/`: as chaves de API são guardadas locais e criptografadas pelo Windows (o `config.json` só tem os blobs criptografados) e os perfis de login ficam em `profiles/`. Dá para adicionar provedores personalizados com um formulário guiado ou um spec JSON.
- **Gerar do código:** `npm install` e `npm run dist` (Node 22.12+, no Windows).
- **Aviso:** algumas das rotas usadas não são oficiais e podem mudar. Use apenas com as suas próprias contas e por sua conta e risco.

A documentação completa (em inglês) está no [README](../README.md).
