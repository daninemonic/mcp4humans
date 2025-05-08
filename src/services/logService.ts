/**
 * Log service for the MCP4Humans extension
 *
 * This module provides logging functionality for server operations.
 */
import * as vscode from 'vscode'

/**
 * Interface for a log entry
 */
export interface LogEntry {
    /** Server name */
    serverName: string
    /** Log message */
    message: string
    /** Raw JSON data (optional) */
    rawData?: string
    /** Whether this is an error message */
    isError: boolean
    /** Timestamp of the log entry */
    timestamp: Date
}

/**
 * Class to manage server logs
 */
export class LogService {
    private static instance: LogService
    private logs: Map<string, LogEntry[]> = new Map()
    private maxLogEntries: number = 100
    private _onLogUpdated = new vscode.EventEmitter<string>()

    /** Event that fires when logs are updated for a server */
    public readonly onLogUpdated = this._onLogUpdated.event

    /**
     * Get the singleton instance of the LogService
     */
    public static getInstance(): LogService {
        if (!LogService.instance) {
            LogService.instance = new LogService()
        }
        return LogService.instance
    }

    /**
     * Private constructor to enforce singleton pattern
     */
    private constructor() {}

    /**
     * Add a log entry for a server
     * @param serverName Name of the server
     * @param message Log message
     * @param rawData Optional raw JSON data
     * @param isError Whether this is an error message
     */
    public addLog(
        serverName: string,
        message: string,
        rawData?: string,
        isError: boolean = false
    ): void {
        // Create the log entry
        const logEntry: LogEntry = {
            serverName,
            message,
            rawData,
            isError,
            timestamp: new Date(),
        }

        // Get or create the log array for this server
        if (!this.logs.has(serverName)) {
            this.logs.set(serverName, [])
        }

        const serverLogs = this.logs.get(serverName)!

        // Add the new log entry
        serverLogs.push(logEntry)

        // If we've exceeded the maximum number of entries, remove the oldest one
        if (serverLogs.length > this.maxLogEntries) {
            serverLogs.shift()
        }
    }

    /**
     * Get all logs for a server
     * @param serverName Name of the server
     * @returns Array of log entries for the server, sorted by timestamp (newest first)
     */
    public getLogs(serverName: string): LogEntry[] {
        const logs = this.logs.get(serverName) || []
        return [...logs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    }

    /**
     * Clear all logs for a server
     * @param serverName Name of the server
     */
    public clearLogs(serverName: string): void {
        this.logs.set(serverName, [])
        this._onLogUpdated.fire(serverName)
    }

    /**
     * Clear all logs
     */
    public clearAllLogs(): void {
        this.logs.clear()
        // Notify for all servers (we don't know which ones had logs)
        for (const serverName of this.logs.keys()) {
            this._onLogUpdated.fire(serverName)
        }
    }
}
