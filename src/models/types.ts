/**
 * Type definitions for the MCP4Humans extension
 */

/**
 * Transport type for MCP servers
 */
export type TransportType = 'stdio' | 'sse';

/**
 * Configuration for an MCP STDIO server
 */
export interface StdioConfig {
    /**
     * Command to run the server
     */
    cmd: string;

    /**
     * Arguments for the command
     */
    args: string[];

    /**
     * Working directory for the command
     */
    cwd?: string | null;

    /**
     * Environment variables to pass to the server process
     */
    environment?: Record<string, string> | null;
}

/**
 * Configuration for an MCP SSE server
 */
export interface SSEConfig {
    /**
     * URL for the SSE server (format: http[s]://{host}:{port}/sse)
     */
    url: string;

    /**
     * Headers for the SSE connection
     */
    headers?: Record<string, string>;
}

/**
 * Configuration for an MCP server
 */
export interface ServerConfig {
    /**
     * Name of the server (used as unique identifier)
     */
    name: string;

    /**
     * Description of the server
     */
    description?: string;

    /**
     * Transport type (stdio or sse)
     */
    transportType: TransportType;

    /**
     * Configuration for STDIO transport
     * Required if transportType is 'stdio'
     */
    stdioConfig?: StdioConfig;

    /**
     * Configuration for SSE transport
     * Required if transportType is 'sse'
     */
    sseConfig?: SSEConfig;
}

/**
 * Parameter for an MCP tool
 */
export interface ToolParameter {
    /**
     * Name of the parameter
     */
    name: string;

    /**
     * Data type of the parameter
     */
    type: string;

    /**
     * Whether the parameter is required
     */
    required: boolean;

    /**
     * Description of the parameter
     */
    description: string;
}

/**
 * Definition of an MCP tool
 */
export interface Tool {
    /**
     * Name of the tool
     */
    name: string;

    /**
     * Description of the tool
     */
    description: string;

    /**
     * Input schema for the tool
     */
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * Schema for an MCP server
 */
export interface ServerSchema extends ServerConfig {
    /**
     * List of tools provided by the server
     */
    tools: Tool[];
}

/**
 * Response type for API functions
 */
export interface ApiResponse<T> {
    /**
     * Whether the operation was successful
     */
    success: boolean;

    /**
     * The data returned by the operation
     */
    data?: T;

    /**
     * Error message if the operation failed
     */
    error?: string;
}
