import type { Extension, ExtensionContext, ExtensionResult } from "asyar-sdk";
import { SearchEngine } from "asyar-sdk";
import { TAURI_DOCS, type DocEntry } from "./data/tauriDocs";
import DefaultView from "./DefaultView.svelte";

class TauriDocsExtension implements Extension {
  private extensionManager?: any;
  private searchEngine: SearchEngine<DocEntry>;

  constructor() {
    this.searchEngine = new SearchEngine<DocEntry>({
      getText: (d) => `${d.title} ${d.description} ${d.section} ${d.path}`,
    });
    this.searchEngine.setItems(TAURI_DOCS);
  }

  async initialize(context: ExtensionContext) {
    this.extensionManager = context.getService("ExtensionManager");
  }

  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  async viewActivated(viewId: string): Promise<void> {}
  async viewDeactivated(viewId: string): Promise<void> {}

  async executeCommand(commandId: string, args?: Record<string, any>): Promise<any> {
    if (commandId === "open") {
      this.extensionManager?.navigateToView("org.asyar.tauri-docs/DefaultView");
      return {
        type: "view",
        viewPath: "org.asyar.tauri-docs/DefaultView",
      };
    }
  }

  async search(query: string): Promise<ExtensionResult[]> {
    const results = this.searchEngine.search(query);
    return results.slice(0, 5).map((doc, i) => ({
      title: `📖 ${doc.title}`,
      subtitle: doc.description,
      score: Math.max(0.3, 0.9 - i * 0.1),
      type: "view" as const,
      icon: "📖",
      viewPath: "org.asyar.tauri-docs/DefaultView",
      action: () => {},
    }));
  }

  onUnload = () => {};
}

export default new TauriDocsExtension();
export { DefaultView };
