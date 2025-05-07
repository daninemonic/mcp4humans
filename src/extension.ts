/**
 * MCP4Humans VSCode Extension
 *
 * This extension provides a user interface for interacting with MCP (Model Context Protocol) servers,
 * similar to the MCP4Humans Electron application.
 */
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ServerExplorerProvider } from './views/serverExplorerProvider';

/**
 * Activates the extension
 * @param context The extension context
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log('MCP4Humans extension is now active');

	// Register the ServerExplorerProvider
	const serverExplorerProvider = new ServerExplorerProvider(context);
	const serverExplorerView = vscode.window.createTreeView('mcp4humans.serverExplorer', {
		treeDataProvider: serverExplorerProvider,
		showCollapseAll: false
	});

	// Register commands
	registerCommands(context, serverExplorerProvider);

	// Add disposables to context
	context.subscriptions.push(serverExplorerView);
}

/**
 * Deactivates the extension
 */
export function deactivate(): void {
	// Clean up resources when the extension is deactivated
	console.log('MCP4Humans extension is now deactivated');
}
