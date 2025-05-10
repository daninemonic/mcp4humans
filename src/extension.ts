/**
 * MCP4Humans VSCode Extension
 *
 * This extension provides a user interface for interacting with MCP (Model Context Protocol) servers,
 * similar to the MCP4Humans Electron application.
 */
import * as vscode from 'vscode'
import { registerCommands } from './commands'
import { ServerListProvider } from './webviews/server/serverList'
import { StorageService } from './services/storage'

/**
 * Activates the extension
 * @param context The extension context
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('MCP4Humans extension is now active')

    // Instantiate StorageService
    const storageService = new StorageService(context)

    // Register the new ServerListProvider
    const serverListProvider = new ServerListProvider(context.extensionUri, storageService)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ServerListProvider.viewId, serverListProvider)
    )

    // Register commands, passing the new provider and storage service
    registerCommands(context, serverListProvider, storageService)
}

/**
 * Deactivates the extension
 */
export function deactivate(): void {
    // Clean up resources when the extension is deactivated
    console.log('MCP4Humans extension is now deactivated')
}
