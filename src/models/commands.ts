/**
 * Commands module for the MCP4Humans extension
 *
 * This module registers all the commands used by the extension.
 */
import * as vscode from 'vscode'
import { ServerConfig, ServerSchema } from './types'

// Enum to define mcp4humans commands list
export enum MCP4HumansCommand {
    LogServerAdd = 'mcp4humans.logServerAdd',
    MCPConnect = 'mcp4humans.mcpConnect',
    MCPDisconnect = 'mcp4humans.mcpDisconnect',
    ServerTreeRefresh = 'mcp4humans.serverTreeRefresh',
    ServerViewAdd = 'mcp4humans.serverViewAdd',
    ServerViewDetail = 'mcp4humans.serverViewDetail',
    ServerViewEdit = 'mcp4humans.serverViewEdit',
    StorageAddServer = 'mcp4humans.storageAddServer',
    StorageDeleteServer = 'mcp4humans.storageDeleteServer',
    StorageUpdateServer = 'mcp4humans.storageUpdateServer',
}

export const vscLogServerAdd = (
    serverName: string,
    message: string,
    rawData?: string,
    isError: boolean = false
) => {
    vscode.commands.executeCommand(
        MCP4HumansCommand.LogServerAdd,
        serverName,
        message,
        rawData,
        isError
    )
}

export const vscMCPConnect = async (server: ServerConfig) => {
    await vscode.commands.executeCommand(MCP4HumansCommand.MCPConnect, server)
}

export const vscMCPDisconnect = async (server: ServerConfig) => {
    await vscode.commands.executeCommand(MCP4HumansCommand.MCPDisconnect, server)
}
export const vscServerTreeRefresh = () => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerTreeRefresh)
}

export const vscServerViewAdd = () => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerViewAdd)
}

export const vscServerViewDetail = (server: ServerSchema) => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerViewDetail, server)
}

export const vscServerViewEdit = (server: ServerSchema) => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerViewEdit, server)
}

export const vscStorageAddServer = async (schema: ServerSchema) => {
    await vscode.commands.executeCommand(MCP4HumansCommand.StorageAddServer, schema)
}

export const vscStorageDeleteServer = async (serverName: string) => {
    await vscode.commands.executeCommand(MCP4HumansCommand.StorageDeleteServer, serverName)
}

export const vscStorageUpdateServer = async (schema: ServerSchema, oldName?: string) => {
    await vscode.commands.executeCommand(MCP4HumansCommand.StorageUpdateServer, schema, oldName)
}
