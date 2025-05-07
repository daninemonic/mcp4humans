/**
 * Storage utilities for the MCP4Humans extension
 *
 * This module provides functions for storing and retrieving data from VSCode's extension storage.
 */
import * as vscode from 'vscode';
import { ServerConfig, ApiResponse, TransportType } from '../models/types';

/**
 * Storage keys
 */
export enum StorageKeys {
    SERVERS = 'mcp4humans.servers'
}

/**
 * Get all servers from storage
 * @param context The extension context
 * @returns A promise that resolves to an ApiResponse containing the servers
 */
export async function getServers(context: vscode.ExtensionContext): Promise<ApiResponse<ServerConfig[]>> {
    try {
        // Mock data based on the schema example
        // In a later task, this will be replaced with real storage
        const mockServers: ServerConfig[] = [
            {
                name: "context7",
                description: "Context7 MCP Server",
                transportType: "stdio" as TransportType,
                stdioConfig: {
                    cmd: "npx",
                    args: [
                        "-y",
                        "@upstash/context7-mcp@latest"
                    ]
                }
            },
            {
                name: "mcp-coda",
                description: "Codebase Analysis MCP Server",
                transportType: "stdio" as TransportType,
                stdioConfig: {
                    cmd: "python",
                    args: ["-m", "mcp_coda.server"],
                    cwd: "/path/to/mcp-coda"
                }
            },
            {
                name: "mcp-fetch",
                description: "Web Fetching MCP Server",
                transportType: "sse" as TransportType,
                sseConfig: {
                    url: "http://localhost:8000/sse",
                    headers: {
                        "Authorization": "Bearer mock-token"
                    }
                }
            }
        ];

        return {
            success: true,
            data: mockServers
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Add a server to storage
 * @param context The extension context
 * @param server The server to add
 * @returns A promise that resolves to an ApiResponse
 */
export async function addServer(
    context: vscode.ExtensionContext,
    server: ServerConfig
): Promise<ApiResponse<void>> {
    try {
        // For now, this is just a placeholder
        // In a later task, this will be implemented to use real storage
        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Update a server in storage
 * @param context The extension context
 * @param server The updated server
 * @param oldName The old name of the server (if the name has changed)
 * @returns A promise that resolves to an ApiResponse
 */
export async function updateServer(
    context: vscode.ExtensionContext,
    server: ServerConfig,
    oldName?: string
): Promise<ApiResponse<void>> {
    try {
        // For now, this is just a placeholder
        // In a later task, this will be implemented to use real storage
        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Delete a server from storage
 * @param context The extension context
 * @param name The name of the server to delete
 * @returns A promise that resolves to an ApiResponse
 */
export async function deleteServer(
    context: vscode.ExtensionContext,
    name: string
): Promise<ApiResponse<void>> {
    try {
        // For now, this is just a placeholder
        // In a later task, this will be implemented to use real storage
        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
