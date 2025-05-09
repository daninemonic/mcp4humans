/**
 * MCP Client utilities for the MCP4Humans extension
 *
 * This module provides functions for interacting with MCP servers.
 */
import { ServerConfig, Tool, ApiResponse, ToolParameterType, TransportType } from '../models/types'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
// Import the new StreamableHTTPClientTransport
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { vscLogServerAdd } from '../models/commands'

// Store active client connections
const activeClients: Record<string, Client> = {}

/**
 * Check if a server is connected
 * @param serverName The name of the server
 * @returns True if the server is connected, false otherwise
 */
export function mcpIsServerConnected(serverName: string): boolean {
    return !!activeClients[serverName]
}

/**
 * Connect to an MCP server
 * @param config The server configuration
 * @returns A promise that resolves to an ApiResponse
 */
export async function mcpConnect(config: ServerConfig): Promise<ApiResponse<void>> {
    let client: Client | undefined = undefined // To hold the client instance for the successful connection
    let finalTransport // To hold the transport instance, mainly for STDIO specific operations

    // Define client capabilities (common for all transport types)
    const clientCapabilities = {
        tools: {
            list: true,
            call: true,
        },
        resources: {
            list: true,
            read: true,
            templates: {
                list: true,
            },
        },
        prompts: {
            list: true,
            get: true,
        },
        logging: {
            setLevel: true,
        },
        roots: {
            listChanged: true,
        },
    }

    try {
        if (config.transportType === TransportType.STDIO) {
            if (!config.stdioConfig) {
                return {
                    success: false,
                    error: 'STDIO configuration is missing',
                }
            }

            // Create client identity for STDIO
            const stdioClientIdentity = {
                name: `mcp4humans-vscode-client-for-${config.name}-stdio`,
                version: '1.0.0',
            }
            client = new Client(stdioClientIdentity, { capabilities: clientCapabilities })

            let env: Record<string, string> = {}
            if (process.env.PATH) {
                env.PATH = process.env.PATH
            }
            if (config.stdioConfig.environment) {
                env = { ...env, ...config.stdioConfig.environment }
            }

            let command = config.stdioConfig.cmd
            let args = [...(config.stdioConfig.args || [])]
            let cwd = config.stdioConfig.cwd || undefined

            if (command === 'uv' && cwd) {
                if (!args.includes('--directory') && !args.includes('-d')) {
                    args = ['--directory', cwd, ...args]
                }
                cwd = undefined
            }

            console.log(
                'Connecting to STDIO server:',
                config.name,
                'command:',
                command,
                'args:',
                args,
                'cwd:',
                cwd
            )

            const stdioTransport = new StdioClientTransport({
                command: command,
                args: args,
                cwd: cwd,
                env,
                stderr: 'pipe',
            })
            finalTransport = stdioTransport // Assign to outer scope variable

            // Start the transport to get access to stderr (specific to StdioClientTransport)
            await stdioTransport.start()

            if (stdioTransport.stderr) {
                stdioTransport.stderr.on('data', (data: Buffer) => {
                    const output = data.toString()
                    console.log(`Server "${config.name}" stderr:`, output)
                    // Optionally log this to vscLogServerAdd if persistent logging is needed for stderr
                })
            }

            // Monkey-patch the start method to prevent it from being called again by client.connect
            // if client.connect internally calls it. Or ensure it's robust to multiple calls.
            // Based on typical SDK patterns, client.connect usually handles the full connection lifecycle after transport instantiation.
            // The explicit start() here is for early stderr access.
            // If client.connect also calls start(), this prevents a double call.
            const originalStart = stdioTransport.start.bind(stdioTransport)
            let startCalledByConnect = false
            stdioTransport.start = async () => {
                if (startCalledByConnect) {
                    // If client.connect calls it, let it proceed if necessary, or do nothing if already started.
                    // For now, we assume our explicit start is sufficient.
                    console.log(
                        `StdioTransport.start() called by client.connect for ${config.name} - already started.`
                    )
                    return
                }
                // This path is for the explicit call before client.connect
                await originalStart()
            }

            console.log(`Attempting client.connect for STDIO server: ${config.name}`)
            // The client.connect will use the already started stdioTransport.
            // We mark that the next call to stdioTransport.start (if any, from client.connect) is internal.
            startCalledByConnect = true
            await client.connect(stdioTransport, { timeout: 5000 })
            startCalledByConnect = false // Reset flag
        } else if (config.transportType === TransportType.HTTP) {
            // Interpreted as "HTTP-based, try StreamableHTTP then SSE"
            if (!config.httpConfig?.url) {
                return {
                    success: false,
                    error: 'HTTP (SSE/StreamableHTTP) configuration must include a URL',
                }
            }

            const baseUrl = new URL(config.httpConfig.url)
            const headers = config.httpConfig.headers
            const requestInitOptions = headers ? { requestInit: { headers } } : undefined

            // Attempt 1: StreamableHTTPTransport
            try {
                const streamableClientIdentity = {
                    name: `mcp4humans-vscode-client-for-${config.name}-streamablehttp`,
                    version: '1.0.0',
                }
                client = new Client(streamableClientIdentity, { capabilities: clientCapabilities })

                console.log(
                    'Attempting to connect to server via StreamableHTTP:',
                    config.name,
                    'url:',
                    baseUrl.toString()
                )
                const streamableTransport = new StreamableHTTPClientTransport(
                    baseUrl,
                    requestInitOptions
                )

                await client.connect(streamableTransport, { timeout: 5000 })
                finalTransport = streamableTransport
                console.log('Connected using Streamable HTTP transport for server:', config.name)
                vscLogServerAdd(config.name, 'Connected (StreamableHTTP)')
            } catch (streamableError: any) {
                const streamableErrorMessage =
                    streamableError instanceof Error
                        ? streamableError.message
                        : String(streamableError)
                console.warn(
                    `Streamable HTTP connection failed for ${config.name}: ${streamableErrorMessage}. Falling back to SSE.`
                )
                vscLogServerAdd(
                    config.name,
                    'StreamableHTTP connection failed',
                    streamableErrorMessage,
                    true
                )

                // Attempt 2: SSEClientTransport (Fallback)
                try {
                    const sseClientIdentity = {
                        name: `mcp4humans-vscode-client-for-${config.name}-sse`,
                        version: '1.0.0',
                    }
                    // Re-initialize client for the fallback attempt as per the example pattern
                    client = new Client(sseClientIdentity, { capabilities: clientCapabilities })

                    console.log(
                        'Attempting to connect to server via SSE (fallback):',
                        config.name,
                        'url:',
                        baseUrl.toString()
                    )
                    const sseTransport = new SSEClientTransport(baseUrl, requestInitOptions)

                    await client.connect(sseTransport, { timeout: 5000 })
                    finalTransport = sseTransport
                    console.log('Connected using SSE transport for server:', config.name)
                    vscLogServerAdd(config.name, 'Connected (SSE Fallback)')
                } catch (sseError: any) {
                    const sseErrorMessage =
                        sseError instanceof Error ? sseError.message : String(sseError)
                    const combinedError = `Failed to connect. StreamableHTTP Error: ${streamableErrorMessage}. SSE Fallback Error: ${sseErrorMessage}`
                    console.error(
                        `SSE connection also failed for ${config.name}: ${sseErrorMessage}`
                    )
                    vscLogServerAdd(
                        config.name,
                        'Connection failed (SSE Fallback)',
                        combinedError,
                        true
                    )
                    return {
                        success: false,
                        error: combinedError,
                    }
                }
            }
        } else {
            return {
                success: false,
                error: `Unsupported transport type: ${config.transportType}`,
            }
        }

        // If client is undefined at this point, it means an issue occurred before or during client initialization for the chosen transport.
        if (!client) {
            const clientUndefinedError = `Client was not initialized for server ${config.name}. This might indicate an unhandled transport type or an early failure.`
            console.error(clientUndefinedError)
            return { success: false, error: clientUndefinedError }
        }

        // Store the successfully connected client
        activeClients[config.name] = client
        // Log success (if not already logged by specific HTTP transport success branches)
        // STDIO path logs success after this block. HTTP paths log it within their try blocks.
        // For consistency, we can have one primary success log here if not already done.
        if (config.transportType === TransportType.STDIO) {
            console.log('Connected to MCP server (STDIO):', config.name)
            vscLogServerAdd(config.name, 'Connected (STDIO)')
        }

        return {
            success: true,
        }
    } catch (error) {
        // General catch block for errors not caught by specific transport attempts
        const errorMessage = error instanceof Error ? error.message : String(error)
        const response = {
            success: false,
            error: errorMessage,
        }
        // Ensure config.name is available for logging
        const serverNameForLog = config && config.name ? config.name : 'UnknownServer'
        vscLogServerAdd(
            serverNameForLog,
            'Connection failed',
            JSON.stringify(response, null, 2),
            true
        )
        console.error(`Failed to connect to server ${serverNameForLog} (Outer Catch):`, error)
        return response
    }
}

/**
 * Disconnect from an MCP server
 * @param serverName The name of the server
 * @returns A promise that resolves to an ApiResponse
 */
export async function mcpDisconnect(serverName: string): Promise<ApiResponse<void>> {
    try {
        const client = activeClients[serverName]
        if (!client) {
            return {
                success: false,
                error: `No active connection for server: ${serverName}`,
            }
        }

        await client.close()
        console.log('Disconnected from MCP server:', serverName)
        vscLogServerAdd(serverName, 'Disconnected')

        delete activeClients[serverName]

        return {
            success: true,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const response = {
            success: false,
            error: errorMessage,
        }
        vscLogServerAdd(serverName, 'Disconnect failed', JSON.stringify(response, null, 2), true)
        console.error(`Failed to disconnect from server ${serverName}:`, error)
        return response
    }
}

/**
 * Get the list of tools from an MCP server
 * @param serverName The name of the server
 * @returns A promise that resolves to an ApiResponse containing the tools
 */
export async function mcpGetTools(serverName: string): Promise<ApiResponse<Tool[]>> {
    try {
        const client = activeClients[serverName]
        if (!client) {
            return {
                success: false,
                error: `No active connection for server: ${serverName}`,
            }
        }

        console.log(`Getting tools list from server: ${serverName}`)
        const result = await client.listTools()

        if (!result) {
            // Check if result itself is null or undefined
            return {
                success: false,
                error: 'Error listTools: Received no result from server',
            }
        }

        vscLogServerAdd(serverName, 'ListTools', JSON.stringify(result, null, 2), false)

        if (!result.tools || result.tools.length === 0) {
            // It's possible a server legitimately has no tools. Consider if this should be an error.
            // For now, matching original behavior.
            console.log(`No tools found on server: ${serverName}`)
            return {
                success: true, // Or false, if no tools is an error condition for the caller
                data: [], // Return empty array
                // error: 'No tools found', // If treating as an error
            }
        }

        const tools: Tool[] = result.tools.map(tool => {
            const inputSchema = tool.inputSchema || { type: 'object', properties: {} }
            let cleanedDescription = tool.description
                ? tool.description.replace(/\n\s+/g, '\n')
                : ''
            const parameters = extractParametersFromSchema(inputSchema, cleanedDescription)
            if (cleanedDescription.includes('Args:')) {
                cleanedDescription = cleanedDescription.split('Args:')[0].trim()
            }

            return {
                name: tool.name,
                description: cleanedDescription,
                inputSchema: {
                    type: inputSchema.type || 'object',
                    properties: inputSchema.properties || {},
                    required: Array.isArray(inputSchema.required) ? inputSchema.required : [],
                },
                parameters,
            }
        })

        console.log(`Found ${tools.length} tools on server: ${serverName}`)
        return {
            success: true,
            data: tools,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const response = {
            success: false,
            error: errorMessage,
        }
        vscLogServerAdd(serverName, 'ListTools failed', JSON.stringify(response, null, 2), true)
        console.error(`Failed to get tools list from server ${serverName}:`, error)
        return response
    }
}

/**
 * Extract parameters from a JSON schema
 * @param schema The JSON schema to extract parameters from
 * @param cleanToolDescription The tool description to extract parameter descriptions from if not provided in schema
 * @returns An array of tool parameters
 */
function extractParametersFromSchema(schema: any, cleanToolDescription: string): any[] {
    if (!schema || !schema.properties) {
        return []
    }

    const parameters = []
    const required = Array.isArray(schema.required) ? schema.required : []

    for (const [name, prop] of Object.entries<any>(schema.properties)) {
        const isRequired = required.includes(name)
        let type = ToolParameterType.STRING

        switch (prop.type) {
            case 'number':
            case 'integer':
                type = ToolParameterType.NUMBER
                break
            case 'boolean':
                type = ToolParameterType.BOOLEAN
                break
            case 'array':
                type = ToolParameterType.ARRAY
                break
            case 'object':
                type = ToolParameterType.OBJECT
                break
            default:
                type = ToolParameterType.STRING
                break
        }

        let description = prop.description || ''
        // If description is empty and we have a tool description, try to extract it from there
        if (!description && cleanToolDescription.includes(`${name}:`)) {
            try {
                const descriptionMatch = cleanToolDescription
                    .split(`${name}:`)[1]
                    .split('\n')[0]
                    .trim()

                if (descriptionMatch) {
                    description = descriptionMatch
                }
            } catch (error) {
                console.log(`Error extracting description for parameter ${name}:`, error)
            }
        }

        parameters.push({
            name,
            type,
            required: isRequired,
            description,
            // Add other potential fields like 'default', 'enum' if your ToolParameter supports them
        })
    }

    return parameters
}

/**
 * Execute a tool on an MCP server
 * @param serverName The name of the server
 * @param toolName The name of the tool
 * @param params The parameters for the tool
 * @returns A promise that resolves to an ApiResponse containing the result
 */
export async function mcpCallTool(
    serverName: string,
    toolName: string,
    params: any
): Promise<ApiResponse<any>> {
    try {
        const client = activeClients[serverName]
        if (!client) {
            return {
                success: false,
                error: `No active connection for server: ${serverName}`,
            }
        }

        const callToolParams = {
            name: toolName,
            arguments: params,
        }

        vscLogServerAdd(
            serverName,
            `Tool Request ${toolName}`,
            JSON.stringify(callToolParams, null, 2)
        )
        console.log(`Executing tool ${toolName} on server ${serverName} with params:`, params)

        const result = await client.callTool(callToolParams)

        vscLogServerAdd(
            serverName,
            `Tool Response ${toolName}`,
            JSON.stringify(result, null, 2),
            result && !!result.isError // Ensure result is not null before accessing isError
        )

        // Check if the result indicates an error from the tool's perspective
        if (result && result.isError) {
            console.warn(
                `Tool ${toolName} executed on server ${serverName} but returned an error:`,
                result.error
            )
            return {
                success: false, // Or true, depending on how you want to handle tool-level errors
                error: `Tool execution resulted in an error: ${result.error || 'Unknown tool error'}`,
                data: result, // Optionally return the full error result
            }
        }

        console.log(`Tool ${toolName} executed successfully on server ${serverName}`)
        return {
            success: true,
            data: result,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const response = {
            success: false,
            error: errorMessage,
        }
        vscLogServerAdd(
            serverName,
            `Tool ${toolName} failed`, // Clarified log message
            JSON.stringify(response, null, 2),
            true
        )
        console.error(`Failed to execute tool ${toolName} on server ${serverName}:`, error)
        return response
    }
}
