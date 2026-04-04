export interface DocEntry {
  title: string;
  path: string;
  section: string;
  description: string;
}

export const TAURI_DOCS: DocEntry[] = [
  // Getting Started
  { title: 'Quick Start', path: '/start/create-project/', section: 'Getting Started', description: 'Create a new Tauri project from scratch' },
  { title: 'Prerequisites', path: '/start/prerequisites/', section: 'Getting Started', description: 'System requirements and development setup' },
  { title: 'Frontend Configuration', path: '/start/frontend/', section: 'Getting Started', description: 'Configure your frontend framework with Tauri' },
  { title: 'Migrate from v1', path: '/start/migrate/from-tauri-1/', section: 'Getting Started', description: 'Migration guide from Tauri v1 to v2' },

  // Core Concepts
  { title: 'Commands', path: '/develop/calling-rust/', section: 'Core Concepts', description: 'Call Rust functions from your frontend using commands' },
  { title: 'Events', path: '/develop/calling-frontend/', section: 'Core Concepts', description: 'Communicate between Rust and frontend using events' },
  { title: 'State Management', path: '/develop/state-management/', section: 'Core Concepts', description: 'Manage application state in Tauri' },
  { title: 'Window Management', path: '/reference/webview/', section: 'Core Concepts', description: 'Create and manage application windows and webviews' },
  { title: 'Inter-Process Communication', path: '/concept/inter-process-communication/', section: 'Core Concepts', description: 'How Tauri handles IPC between processes' },

  // Plugins
  { title: 'Plugins Overview', path: '/develop/plugins/', section: 'Plugins', description: 'Extend Tauri with community and official plugins' },
  { title: 'File System', path: '/plugin/file-system/', section: 'Plugins', description: 'Read and write files using the fs plugin' },
  { title: 'HTTP Client', path: '/plugin/http-client/', section: 'Plugins', description: 'Make HTTP requests from your app' },
  { title: 'Shell', path: '/plugin/shell/', section: 'Plugins', description: 'Execute shell commands and open URLs' },
  { title: 'Clipboard', path: '/plugin/clipboard-manager/', section: 'Plugins', description: 'Read and write clipboard contents' },
  { title: 'Notifications', path: '/plugin/notification/', section: 'Plugins', description: 'Send native desktop notifications' },
  { title: 'System Tray', path: '/plugin/system-tray/', section: 'Plugins', description: 'Add system tray icons and menus' },
  { title: 'Global Shortcut', path: '/plugin/global-shortcut/', section: 'Plugins', description: 'Register global keyboard shortcuts' },
  { title: 'Dialog', path: '/plugin/dialog/', section: 'Plugins', description: 'Open native file and message dialogs' },
  { title: 'Updater', path: '/plugin/updater/', section: 'Plugins', description: 'Auto-update your application' },
  { title: 'Deep Linking', path: '/plugin/deep-linking/', section: 'Plugins', description: 'Handle custom URL schemes and deep links' },
  { title: 'Store', path: '/plugin/store/', section: 'Plugins', description: 'Persistent key-value storage' },
  { title: 'Stronghold', path: '/plugin/stronghold/', section: 'Plugins', description: 'Encrypted database and secret management' },
  { title: 'Barcode Scanner', path: '/plugin/barcode-scanner/', section: 'Plugins', description: 'Scan barcodes and QR codes on mobile' },
  { title: 'Biometric', path: '/plugin/biometric/', section: 'Plugins', description: 'Authenticate using fingerprint or face recognition' },

  // Configuration
  { title: 'Configuration Overview', path: '/reference/config/', section: 'Configuration', description: 'tauri.conf.json reference and options' },
  { title: 'Permissions', path: '/security/permissions/', section: 'Configuration', description: 'Configure security permissions for your app' },
  { title: 'Content Security Policy', path: '/security/csp/', section: 'Configuration', description: 'Set CSP headers for your webview' },
  { title: 'Capabilities', path: '/security/capabilities/', section: 'Configuration', description: 'Define runtime capabilities and access controls' },

  // Distribution
  { title: 'Building', path: '/distribute/build/', section: 'Distribution', description: 'Build your app for production' },
  { title: 'Code Signing', path: '/distribute/sign/', section: 'Distribution', description: 'Sign your application for distribution' },
  { title: 'Windows Installer', path: '/distribute/windows/', section: 'Distribution', description: 'Create Windows installers (MSI/NSIS)' },
  { title: 'macOS Bundle', path: '/distribute/macos/', section: 'Distribution', description: 'Create macOS app bundles and DMGs' },
  { title: 'Linux Package', path: '/distribute/linux/', section: 'Distribution', description: 'Create Linux packages (AppImage/Deb)' },

  // Reference
  { title: 'JavaScript API', path: '/reference/javascript/', section: 'Reference', description: 'Complete JavaScript/TypeScript API reference' },
  { title: 'Rust API (tauri crate)', path: '/reference/rust/', section: 'Reference', description: 'Complete Rust crate documentation' },
  { title: 'CLI Reference', path: '/reference/cli/', section: 'Reference', description: 'Tauri CLI commands and options' },
];
