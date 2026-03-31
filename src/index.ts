import type { Extension, ExtensionContext } from "asyar-sdk";
import DefaultView from "./DefaultView.svelte";

class TauriDocsExtension implements Extension {
  private extensionManager?: any;

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

  onUnload = () => {};
}

export default new TauriDocsExtension();
export { DefaultView };
