/**
 * Server Explorer Provider
 * 
 * This class provides the data for the Server Explorer tree view.
 */
import * as vscode from 'vscode';
import { ServerTreeItem } from './serverTreeItem';
import { ServerConfig } from '../models/types';

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
        this._onDidChangeTreeData.fire();
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
            return Promise.resolve(this.getServers());
        }
    }

    /**
     * Get the servers from storage
     * @returns The servers as tree items
     */
    private getServers(): ServerTreeItem[] {
        // For now, return mock data
        // This will be replaced with real storage in a later task
        const mockServers: ServerConfig[] = [
            {
                name: 'Mock STDIO Server',
                description: 'A mock STDIO server for testing',
                transportType: 'stdio',
                stdioConfig: {
                    cmd: 'python',
                    args: ['-m', 'mcp_server'],
                    cwd: '/path/to/server'
                }
            },
            {
                name: 'Mock SSE Server',
                description: 'A mock SSE server for testing',
                transportType: 'sse',
                sseConfig: {
                    url: 'http://localhost:8000/sse'
                }
            }
        ];

        return mockServers.map(server => new ServerTreeItem(
            server.name,
            server.description || '',
            server.transportType,
            false, // isConnected
            server
        ));
    }
}
