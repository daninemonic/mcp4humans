/**
 * Commands module for the MCP4Humans extension
 *
 * This module registers all the commands used by the extension.
 */
import * as vscode from 'vscode';
import { ServerExplorerProvider } from './views/serverExplorerProvider';
import { ServerDetailWebview } from './webviews/serverDetailWebview';

/**
 * Registers all commands for the extension
 * @param context The extension context
 * @param serverExplorerProvider The server explorer provider
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    serverExplorerProvider: ServerExplorerProvider
): void {
    // Register the refresh command
    const refreshCommand = vscode.commands.registerCommand(
        'mcp4humans.refreshServerList',
        () => {
            serverExplorerProvider.refresh();
            vscode.window.showInformationMessage('Server list refreshed');
        }
    );

    // Register the add server command
    const addServerCommand = vscode.commands.registerCommand(
        'mcp4humans.addServer',
        () => {
            // This will be implemented in a later task
            vscode.window.showInformationMessage('Add server command triggered');
        }
    );

    // Register the edit server command
    const editServerCommand = vscode.commands.registerCommand(
        'mcp4humans.editServer',
        (server) => {
            // This will be implemented in a later task
            vscode.window.showInformationMessage(`Edit server command triggered for ${server?.name || 'unknown'}`);
        }
    );

    // Register the delete server command
    const deleteServerCommand = vscode.commands.registerCommand(
        'mcp4humans.deleteServer',
        (server) => {
            // This will be implemented in a later task
            vscode.window.showInformationMessage(`Delete server command triggered for ${server?.name || 'unknown'}`);
        }
    );

    // Register the open server detail command
    const openServerDetailCommand = vscode.commands.registerCommand(
        'mcp4humans.openServerDetail',
        (server) => {
            if (server) {
                // Create or show the server detail webview
                ServerDetailWebview.createOrShow(context.extensionUri, server, false);
            }
        }
    );

    // Register the connect server command
    const connectServerCommand = vscode.commands.registerCommand(
        'mcp4humans.connectServer',
        (server) => {
            // This will be implemented in a later task
            vscode.window.showInformationMessage(`Connect server command triggered for ${server?.name || 'unknown'}`);

            // Update the server detail webview if it's open
            if (ServerDetailWebview.currentPanel && server) {
                ServerDetailWebview.currentPanel.update(server, true);
            }
        }
    );

    // Register the disconnect server command
    const disconnectServerCommand = vscode.commands.registerCommand(
        'mcp4humans.disconnectServer',
        (server) => {
            // This will be implemented in a later task
            vscode.window.showInformationMessage(`Disconnect server command triggered for ${server?.name || 'unknown'}`);

            // Update the server detail webview if it's open
            if (ServerDetailWebview.currentPanel && server) {
                ServerDetailWebview.currentPanel.update(server, false);
            }
        }
    );

    // Add all commands to subscriptions
    context.subscriptions.push(
        refreshCommand,
        addServerCommand,
        editServerCommand,
        deleteServerCommand,
        openServerDetailCommand,
        connectServerCommand,
        disconnectServerCommand
    );
}
