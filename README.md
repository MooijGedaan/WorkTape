# WorkTape

A desktop application for Windows and macOS built with Tauri (Rust backend) and React + TypeScript (frontend). WorkTape helps professionals maintain a detailed work activity log through periodic prompts and AI-powered summaries.

## Features

### Work Activity Logging
- **Manual Entry**: Add work log entries at any time through the Work Log view
- **Inline Input**: Streamlined input form with side-by-side text field and submit button
- **Automatic Timestamps**: Every entry is automatically timestamped for accurate record-keeping
- **Entry Management**: View all your work entries in a chronological table with delete functionality
- **Persistent Storage**: All entries are stored locally in a SQLite database

### AI-Powered Summaries
- **Daily Summaries**: Generate professional narrative summaries of your work for any day using AI
- **Date Selection**: Choose any date to summarize using an intuitive date picker or quick "Today"/"Yesterday" buttons
- **Persistent Summaries**: Generated summaries are automatically saved to the database and persist across sessions
- **Smart Validation**: Requires at least 2 work entries before allowing summary generation
- **Overwrite Protection**: Button changes to "Overwrite Summary" when a summary already exists for the selected date
- **Copy to Clipboard**: One-click copying of generated summaries for use in emails, reports, or performance reviews
- **Date-Specific Titles**: Summary headers clearly indicate which date the summary covers (e.g., "AI Summary of November 15, 2025")

### User Interface
- **Custom Title Bar**: Modern, frameless window design with custom title bar
  - Minimize, maximize, and close window controls
  - Draggable window area for repositioning
  - "New Entry" button placeholder for future quick-add functionality
- **Resizable Sidebar**: Adjustable sidebar width (200-480px) for personalized layout
  - Smooth drag-to-resize with visual feedback (blue indicator on hover)
  - Width persists during session
- **Navigation**:
  - Home: Dashboard and overview
  - Work Log: View and manage all work entries
  - AI Summary: Generate and view AI-powered daily summaries
  - Settings: Application configuration
  - Export: Data export functionality (planned)
  - Help & Support: Access to help resources (planned)
- **Dark Mode Support**: Full dark mode theming throughout the application
- **Responsive Layout**: Optimized content area with maximum width constraints for readability
- **Error Handling**: Clear, user-friendly error messages for validation failures and API issues

### Data Management
- **Local Database**: SQLite-based storage for all your data
  - `work_entries` table: Stores all work log entries with descriptions and timestamps
  - `ai_summaries` table: Persists AI-generated summaries with creation and update timestamps
  - `settings` table: Application configuration (prompt intervals, etc.)
- **Database Migrations**: Automatic schema versioning and migration system
- **Privacy First**: All data stored locally on your machine - no cloud sync or external data transmission (except AI summary generation via a secure proxy service)

### System Integration
- **System Tray Integration**: Runs in the background with system tray access (planned)
- **Periodic Prompts**: Configurable interval-based prompts to log your work activities (planned)
- **Cross-Platform**: Works on both Windows and macOS
- **Native Performance**: Built with Tauri for fast, lightweight native application experience

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

3. **Configure the AI proxy** (for AI Summary feature):
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and set your app token:
     ```
     WORKTAPE_APP_TOKEN=your-app-token-here
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
- **AI**: GPT-4o-mini (via proxy service)
