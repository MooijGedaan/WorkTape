# WorkRecall

A desktop application for Windows and macOS built with Tauri (Rust backend) and React + TypeScript (frontend). WorkRecall helps professionals maintain a detailed work activity log through periodic prompts and AI-powered summaries.

## Features

- **Work Activity Logging**: Periodic prompts to log your work activities
- **AI-Powered Summaries**: Generate professional daily summaries using OpenAI GPT
- **Local Database**: SQLite-based storage for all your work entries
- **System Tray Integration**: Runs in the background with system tray access
- **Cross-Platform**: Works on both Windows and macOS

## Setup

### Prerequisites

- Node.js (v16 or later)
- Rust (latest stable)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. **Configure OpenAI API** (for AI Summary feature):
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Edit `.env` and replace `sk-your-api-key-here` with your actual API key:
     ```
     OPENAI_API_KEY=sk-proj-...your-actual-key...
     OPENAI_MODEL=gpt-4o-mini
     OPENAI_API_URL=https://api.openai.com/v1
     ```
   - **Important**: Never commit your `.env` file to git (it's already in `.gitignore`)

### Development

Run the application in development mode:
```bash
npm run tauri dev
```

### Building

Build the application for production:
```bash
npm run tauri build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Tauri v2, Rust
- **Database**: SQLite (via tauri-plugin-sql)
- **AI**: OpenAI API (GPT-4o-mini)
