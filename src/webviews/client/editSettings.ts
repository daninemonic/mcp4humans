// Type definition for the VS Code API exposed by acquireVsCodeApi
interface VsCodeApi {
    postMessage(message: any): void
    getState(): any
    setState(newState: any): void
}

// Declare the VS Code API function provided by VS Code
declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

// Define interfaces for the server configuration parts
interface StdioConfig {
    cmd: string
    args: string[]
    cwd: string | null
    environment: Record<string, string> | null
}

interface HttpConfig {
    url: string
    headers: Record<string, string> | null
}

interface ServerConfig {
    name: string
    description: string
    transportType: 'stdio' | 'http'
    stdioConfig?: StdioConfig
    httpConfig?: HttpConfig
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize tables visibility
    const envVarsBody = document.getElementById('env-vars-body') as HTMLTableSectionElement | null
    if (envVarsBody && envVarsBody.children.length > 0) {
        ;(document.getElementById('env-vars-table') as HTMLTableElement | null)?.classList.remove(
            'hidden'
        )
    }

    const headersBody = document.getElementById('headers-body') as HTMLTableSectionElement | null
    if (headersBody && headersBody.children.length > 0) {
        ;(document.getElementById('headers-table') as HTMLTableElement | null)?.classList.remove(
            'hidden'
        )
    }

    // Get form elements
    const transportRadios = document.querySelectorAll('input[name="transport-type"]')
    const stdioConfigSection = document.getElementById('stdio-config') as HTMLDivElement | null
    const httpConfigSection = document.getElementById('http-config') as HTMLDivElement | null

    // Show/hide configuration sections based on transport type
    transportRadios.forEach(radio => {
        radio.addEventListener('change', event => {
            const currentTarget = event.currentTarget as HTMLInputElement
            if (currentTarget.value === 'stdio') {
                stdioConfigSection?.classList.remove('hidden')
                httpConfigSection?.classList.add('hidden')
            } else {
                stdioConfigSection?.classList.add('hidden')
                httpConfigSection?.classList.remove('hidden')
            }
        })
    })

    // Add environment variable
    const addEnvVarBtn = document.getElementById('add-env-var-btn') as HTMLButtonElement | null
    addEnvVarBtn?.addEventListener('click', () => {
        const table = document.getElementById('env-vars-table') as HTMLTableElement | null
        if (table?.classList.contains('hidden')) {
            table.classList.remove('hidden')
        }

        const tbody = document.getElementById('env-vars-body') as HTMLTableSectionElement | null
        if (!tbody) {
            return
        }

        const row = tbody.insertRow()
        row.innerHTML = `
            <td><input type="text" class="env-name" /></td>
            <td><input type="text" class="env-value" /></td>
            <td><div class="trash-icon remove-env-btn">🗑️</div></td>
        `

        const removeButton = row.querySelector('.remove-env-btn') as HTMLDivElement | null
        removeButton?.addEventListener('click', () => {
            row.remove()
            if (tbody.children.length === 0 && table) {
                table.classList.add('hidden')
            }
        })
    })

    // Add header
    const addHeaderBtn = document.getElementById('add-header-btn') as HTMLButtonElement | null
    addHeaderBtn?.addEventListener('click', () => {
        const table = document.getElementById('headers-table') as HTMLTableElement | null
        if (table?.classList.contains('hidden')) {
            table.classList.remove('hidden')
        }

        const tbody = document.getElementById('headers-body') as HTMLTableSectionElement | null
        if (!tbody) {
            return
        }

        const row = tbody.insertRow()
        row.innerHTML = `
            <td><input type="text" class="header-name" /></td>
            <td><input type="text" class="header-value" /></td>
            <td><div class="trash-icon remove-header-btn">🗑️</div></td>
        `

        const removeButton = row.querySelector('.remove-header-btn') as HTMLDivElement | null
        removeButton?.addEventListener('click', () => {
            row.remove()
            if (tbody.children.length === 0 && table) {
                table.classList.add('hidden')
            }
        })
    })

    // Add event listeners to existing remove buttons (for pre-filled rows)
    document.querySelectorAll('.remove-env-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('tr')
            const tbody = row?.parentElement as HTMLTableSectionElement | null
            const table = tbody?.closest('table') as HTMLTableElement | null
            row?.remove()
            if (tbody && tbody.children.length === 0 && table) {
                table.classList.add('hidden')
            }
        })
    })

    document.querySelectorAll('.remove-header-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('tr')
            const tbody = row?.parentElement as HTMLTableSectionElement | null
            const table = tbody?.closest('table') as HTMLTableElement | null
            row?.remove()
            if (tbody && tbody.children.length === 0 && table) {
                table.classList.add('hidden')
            }
        })
    })

    // Parse JSON button
    const parseJsonButton = document.getElementById('parse-json-button') as HTMLButtonElement | null
    parseJsonButton?.addEventListener('click', () => {
        const jsonConfigTextArea = document.getElementById(
            'json-config'
        ) as HTMLTextAreaElement | null
        const jsonText = jsonConfigTextArea?.value
        if (jsonText && jsonText.trim()) {
            vscode.postMessage({
                command: 'parseJson',
                json: jsonText,
            })
        }
    })

    // Connect button
    const connectButton = document.getElementById('connect-btn') as HTMLButtonElement | null
    connectButton?.addEventListener('click', () => {
        const server = getServerConfig()
        vscode.postMessage({
            command: 'connectAndSave',
            server,
        })
    })
})

function getServerConfig(): ServerConfig {
    const name = (document.getElementById('server-name') as HTMLInputElement).value
    const description = (document.getElementById('server-description') as HTMLInputElement).value
    const transportType = (
        document.querySelector('input[name="transport-type"]:checked') as HTMLInputElement
    ).value as 'stdio' | 'http'

    const server: ServerConfig = {
        name,
        description,
        transportType,
    }

    if (transportType === 'stdio') {
        const cmd = (document.getElementById('stdio-cmd') as HTMLInputElement).value
        const argsStr = (document.getElementById('stdio-args') as HTMLInputElement).value
        const args = argsStr ? argsStr.split(',').map(arg => arg.trim()) : []
        const cwd = (document.getElementById('stdio-cwd') as HTMLInputElement).value

        const environment: Record<string, string> = {}
        document.querySelectorAll('#env-vars-body tr').forEach(row => {
            const nameInput = row.querySelector('.env-name') as HTMLInputElement | null
            const valueInput = row.querySelector('.env-value') as HTMLInputElement | null
            if (nameInput && nameInput.value) {
                environment[nameInput.value] = valueInput?.value || ''
            }
        })

        server.stdioConfig = {
            cmd,
            args,
            cwd: cwd || null,
            environment: Object.keys(environment).length > 0 ? environment : null,
        }
    } else if (transportType === 'http') {
        const url = (document.getElementById('http-url') as HTMLInputElement).value

        const headers: Record<string, string> = {}
        document.querySelectorAll('#headers-body tr').forEach(row => {
            const nameInput = row.querySelector('.header-name') as HTMLInputElement | null
            const valueInput = row.querySelector('.header-value') as HTMLInputElement | null
            if (nameInput && nameInput.value) {
                headers[nameInput.value] = valueInput?.value || ''
            }
        })

        server.httpConfig = {
            url,
            headers: Object.keys(headers).length > 0 ? headers : null,
        }
    }
    return server
}
