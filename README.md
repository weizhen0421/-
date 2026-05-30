# Chat_bot GAS Chat App

This project contains a Google Apps Script web app for `Chat_bot`.

It includes:

- A refined single-page chat interface
- Enter-to-send support
- Voice input using the browser speech recognition API
- Full conversation logging into Google Sheets
- OpenAI Responses API integration with `gpt-5.4-mini`

## Required script properties

Set one of these properties in the Apps Script project:

- `OPENAI_KEY`
- `OPENAI_API_KEY`

## Spreadsheet

The app writes logs to:

`1f70ekK9v7PFmbKOVmGRcyi6SGPzM8JIWwTG9uIUydGY`

It uses the sheet name `ChatLogs`.

## Deployment

Deploy the Apps Script project as a web app after pasting these files into the script editor.
