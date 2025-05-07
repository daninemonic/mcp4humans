/**
 * Server Explorer Provider
 *
 * This class provides the data for the Server Explorer tree view.
 */
import * as vscode from 'vscode';
import { ServerTreeItem } from './serverTreeItem';
import { ServerConfig } from '../models/types';
import { getServers } from '../utils/storage';

/**
 * Provider for the Server Explorer tree view
 */
export class ServerExplorerProvider implements vscode.TreeDataProvider<ServerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ServerTreeItem | undefined | null | void> = new vscode.EventEmitter<ServerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ServerTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    /**
     * Constructor
     * @param context The extension context
     */
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Refresh the tree view
     */
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Get the tree item for the given element
     * @param element The element to get the tree item for
     * @returns The tree item
     */
    getTreeItem(element: ServerTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get the children of the given element
     * @param element The element to get the children for
     * @returns The children of the element
     */
    getChildren(element?: ServerTreeItem): Thenable<ServerTreeItem[]> {
        if (element) {
            // If we have an element, we're looking for its children
            // For now, we don't have any children for server items
            return Promise.resolve([]);
        } else {
            // If we don't have an element, we're looking for the root items
            return this.getServers();
        }
    }

    /**
     * Get the servers from storage
     * @returns The servers as tree items
     */
    private async getServers(): Promise<ServerTreeItem[]> {
        // Get servers from storage utility
        const response = await getServers(this.context);

        if (!response.success || !response.data) {
            // If there was an error, show it and return an empty array
            if (response.error) {
                vscode.window.showErrorMessage(`Failed to get servers: ${response.error}`);
            }
            return [];
        }

        // Map the servers to tree items
        return response.data.map(server => new ServerTreeItem(
            server.name,
            server.description || '',
            server.transportType,
            false, // isConnected - we'll implement real connection status later
            server
        ));
    }
}
