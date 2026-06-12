<div align="center">

# Quantum Bunker

**Secure, ephemeral real-time messaging vaults.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
</div>

## 🛡️ Overview

Quantum Bunker is a zero-knowledge, secure, ephemeral chat application built for privacy-conscious users. The server acts as a blind relay, never logging or storing decrypted payloads. Sessions are ephemeral, bound to a specific `sessionId` (Vault Hash), and automatically expire or can be manually destroyed.

## ✨ Features

- **Zero-Knowledge Architecture:** The server never stores your messages.
- **Ephemeral Vaults:** Chat rooms expire automatically or when explicitly destroyed.
- **Anti-Capture Security:** Built-in "blur-to-reveal" mechanism and automatic app focus blackout to thwart screenshots and recordings.
- **Read Receipts:** Track message delivery and read status instantly.
- **Group Sessions:** Dynamic host controls and participant kicking.
- **Session Persistence:** Recover your host status upon accidental refresh.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- Gemini API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/quantum-bunker.git
   cd quantum-bunker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Copy `.env.example` to `.env.local` and add your Gemini API Key.
   ```bash
   cp .env.example .env.local
   ```
   *Note: Edit `.env.local` to include `GEMINI_API_KEY=your_api_key_here`.*

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

5. **Access the Application:**
   Open your browser and navigate to the localhost port indicated in the terminal.

## 🚢 Deployment Strategy

- **`main` branch**: Production-ready code.
- **`staging` branch**: Pre-prod and smoke testing.
- **`develop` branch**: Active daily development.
- **Deployments**: We use GitHub Environments and Rulesets. Code flows from `feature/*` -> `develop` -> `staging` -> `main`. See `docs/workflow.md` for full details.

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
