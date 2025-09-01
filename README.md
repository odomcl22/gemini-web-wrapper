# Gemini Web Wrapper (Electron) — v1.0.0

An **unofficial desktop app for Google Gemini**, built with Electron.  
This wrapper securely loads [Gemini](https://gemini.google.com/app), supports Google sign-in inside the app, persists your login sessions, and provides a desktop-like experience on macOS, Windows, and Linux.

---

## ✨ Features (v1.0.0)

- **In-app Google login**: Sign in once and stay signed in across restarts (cookies stored per profile).
- **Popup allowlist**: Google auth/consent popups open inside the app; everything else opens in your browser.
- **Tray menu**: Quick show/hide and launch with multiple profiles (e.g. personal vs work).
- **Profiles**: Independent login sessions via persistent Electron partitions.
- **Auto-updates**: Integrated with GitHub Releases (via `electron-updater`).
- **Download manager**: All downloads routed to `~/Downloads/GeminiWrapper`.
- **Window persistence**: Remembers window size/position between launches.
- **Security**:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
  - CSP fallback injection
  - External navigation restricted to browser
- **Custom icon support** (mac `.icns`, Windows `.ico`, Linux `.png`).
- **Optional mobile UA spoofing**: Run with `MOBILE=1 npm start` to test mobile-only Gemini features (experimental).

---

## 🚀 Quick Start

Clone and install:

```bash
git clone https://github.com/YOUR_GH_USERNAME/gemini-web-wrapper.git
cd gemini-web-wrapper
npm install