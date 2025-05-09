// Type definition for the VS Code API exposed by acquireVsCodeApi
interface VsCodeApi {
    postMessage(message: any): void
    getState(): WebviewState | undefined
    setState(newState: WebviewState): void
}

// Declare the VS Code API function provided by VS Code
declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

interface WebviewState {
    activeTab: string
    // Add other state properties here if needed in the future
}

// Get the current state from storage or initialize it.
// The `${initialActiveTab}` placeholder will be replaced by the extension with the actual initial tab.
const state: WebviewState = vscode.getState() || { activeTab: '${initialActiveTab}' }

// Function to switch tabs
function switchTab(tabId: string): void {
    // Update active tab in state
    state.activeTab = tabId
    vscode.setState(state)

    // Remove active class from all tabs and tab contents
    document.querySelectorAll<HTMLDivElement>('.tab').forEach(tab => {
        tab.classList.remove('active')
    })
    document.querySelectorAll<HTMLDivElement>('.tab-content').forEach(content => {
        content.classList.remove('active')
    })

    // Add active class to selected tab and content
    const activeTabElement = document.querySelector<HTMLDivElement>(`.tab[data-tab="${tabId}"]`)
    const activeContentElement = document.getElementById(`${tabId}-tab`) as HTMLDivElement | null

    activeTabElement?.classList.add('active')
    activeContentElement?.classList.add('active')

    // Notify the extension about the tab change
    vscode.postMessage({
        command: 'tabChanged',
        tab: tabId,
    })
}

// Initialize tabs based on saved state or initial placeholder
document.addEventListener('DOMContentLoaded', () => {})

// Event delegation for clicks
document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement

    // Handle tab clicks
    if (target.classList.contains('tab')) {
        const tabId = target.getAttribute('data-tab')
        if (tabId) {
            switchTab(tabId)
        }
        return // Important to stop further processing if it was a tab click
    }

    // Handle result header toggle
    const resultHeader = target.closest('.result-header')
    if (resultHeader) {
        const resultContent = resultHeader.nextElementSibling as HTMLElement | null
        const resultToggle = resultHeader.querySelector('.result-toggle') as HTMLElement | null
        if (resultContent && resultToggle) {
            resultContent.classList.toggle('open')
            resultToggle.classList.toggle('open')
            resultToggle.textContent = resultContent.classList.contains('open') ? '▲' : '▼'
        }
        return // Stop if it was a result toggle
    }

    // Handle log entry expand/collapse
    const logEntryHeader = target.closest('.log-entry-header')
    if (logEntryHeader && logEntryHeader.parentElement?.classList.contains('expandable')) {
        const logEntry = logEntryHeader.parentElement
        const rawData = logEntry.querySelector('.log-raw-data') as HTMLElement | null
        const toggle = logEntry.querySelector('.log-entry-toggle') as HTMLElement | null
        if (rawData && toggle) {
            rawData.classList.toggle('hidden')
            toggle.classList.toggle('open')
            toggle.textContent = rawData.classList.contains('hidden') ? '▼' : '▲'
        }
        return // Stop if it was a log entry toggle
    }

    // Handle other specific button clicks by ID
    switch (target.id) {
        case 'connect-to-server-btn':
            vscode.postMessage({ command: 'connect' })
            break
        case 'disconnect-from-server-btn':
            vscode.postMessage({ command: 'disconnect' })
            break
        case 'edit-server-btn':
            vscode.postMessage({ command: 'serverEdit' })
            break
        case 'delete-server-btn':
            const deleteConfirmationModal = document.getElementById(
                'delete-confirmation-modal'
            ) as HTMLDivElement | null
            if (deleteConfirmationModal) {
                deleteConfirmationModal.style.display = 'flex'
            }
            break
        case 'cancel-delete-btn':
            const cancelDeleteButton = document.getElementById(
                'delete-confirmation-modal'
            ) as HTMLDivElement | null
            if (cancelDeleteButton) {
                cancelDeleteButton.style.display = 'none'
            }
            break
        case 'confirm-delete-btn':
            const confirmDeleteButton = document.getElementById(
                'delete-confirmation-modal'
            ) as HTMLDivElement | null
            if (confirmDeleteButton) {
                confirmDeleteButton.style.display = 'none'
            }
            vscode.postMessage({ command: 'deleteServer' })
            break
        case 'clear-logs-btn':
            // The serverName placeholder will be interpolated by the extension when the HTML is rendered.
            // We don't need to fetch it here from the DOM again.
            vscode.postMessage({
                command: 'clearLogs',
                serverName: '${serverName}',
            })
            break
    }
})

// Handle form submissions
document.addEventListener('submit', (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement
    if (form.classList.contains('tool-form')) {
        e.preventDefault()

        const toolName = form.getAttribute('data-tool-name')
        if (!toolName) {
            return
        }

        const parameters: Record<string, any> = {}
        let parseError = false

        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            '[data-parameter]'
        ).forEach(input => {
            const inputEl: HTMLInputElement = input as HTMLInputElement
            const textAreaEl: HTMLTextAreaElement = input as HTMLTextAreaElement
            const name = input.getAttribute('data-parameter')
            if (!name) {
                return
            }

            let value: any = input.value

            if (input.type === 'number') {
                value = inputEl.valueAsNumber // Use valueAsNumber for correct type
                if (isNaN(value)) {
                    value = null
                } // Handle cases where conversion fails
            } else if (input.tagName === 'SELECT') {
                if (input.value === 'true') {
                    value = true
                } else if (input.value === 'false') {
                    value = false
                }
                // else leave as string if other select options exist
            } else if (input.tagName === 'TEXTAREA' && textAreaEl.placeholder === '{}') {
                // Object
                try {
                    value = value.trim() ? JSON.parse(value) : {} // Default to empty object if empty
                } catch (error) {
                    const errorElement = form.querySelector<HTMLElement>(
                        `[data-error-for="${name}"]`
                    )
                    if (errorElement) {
                        errorElement.textContent = 'Invalid JSON object'
                    }
                    parseError = true
                }
            } else if (
                input.tagName === 'INPUT' &&
                input.type === 'text' &&
                input.placeholder?.includes('["item1"')
            ) {
                // Array from text input
                try {
                    value = value.trim() ? JSON.parse(value) : [] // Default to empty array if empty
                    if (!Array.isArray(value)) {
                        throw new Error('Not an array')
                    }
                } catch (error) {
                    const errorElement = form.querySelector<HTMLElement>(
                        `[data-error-for="${name}"]`
                    )
                    if (errorElement) {
                        errorElement.textContent = 'Invalid JSON array (e.g., ["a", "b"] or [1, 2])'
                    }
                    parseError = true
                }
            }
            parameters[name] = value
        })

        // Clear previous errors
        form.querySelectorAll<HTMLElement>('.parameter-error').forEach(el => {
            el.textContent = ''
        })

        // Don't submit if there was a JSON parsing error
        if (parseError) {
            return
        }

        const sendButton = form.querySelector('.send-button') as HTMLButtonElement | null
        const loadingSpinner = form.querySelector('.loading-spinner') as HTMLElement | null
        const buttonText = form.querySelector('.button-text') as HTMLElement | null

        const toolCard = document.getElementById(`tool-${toolName}`) as HTMLElement | null
        const resultContainer = toolCard?.querySelector('.result-container') as HTMLElement | null
        const resultTextEl = resultContainer?.querySelector('.result-text') as HTMLElement | null

        if (sendButton) {
            sendButton.disabled = true
        }
        loadingSpinner?.classList.remove('hidden')
        resultContainer?.classList.add('hidden') // Hide old result while loading
        if (buttonText) {
            buttonText.textContent = 'Sending...'
        }
        if (resultTextEl) {
            resultTextEl.textContent = ''
        }

        vscode.postMessage({
            command: 'callMCPTool',
            toolName: toolName,
            params: parameters,
        })
    }
})

interface ToolResultMessage {
    command: 'toolResult'
    toolName: string
    resultType: 'success' | 'error' | 'failed'
    contentType: 'raw' | 'text' | 'json' | 'image'
    data: any
    mimeType?: string
}

interface LogsUpdatedMessage {
    command: 'logsUpdated'
}

type ExtensionMessage = ToolResultMessage | LogsUpdatedMessage

// Handle messages from the extension
window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
    const message = event.data

    if (message.command === 'logsUpdated') {
        if (state.activeTab === 'log') {
            vscode.postMessage({ command: 'refreshLogs' })
        }
    } else if (message.command === 'toolResult') {
        const { toolName, resultType, contentType, data, mimeType } = message

        const toolCard = document.getElementById(`tool-${toolName}`) as HTMLElement | null
        if (!toolCard) {
            return
        }

        const form = toolCard.querySelector('.tool-form') as HTMLFormElement | null
        if (form) {
            const sendButton = form.querySelector('.send-button') as HTMLButtonElement | null
            const loadingSpinner = form.querySelector('.loading-spinner') as HTMLElement | null
            const buttonText = form.querySelector('.button-text') as HTMLElement | null

            if (sendButton) {
                sendButton.disabled = false
            }
            loadingSpinner?.classList.add('hidden')
            if (buttonText) {
                buttonText.textContent = 'Send'
            }
        }

        const resultContainer = toolCard.querySelector('.result-container') as HTMLElement | null
        if (!resultContainer) {
            return
        }
        const resultHeader = resultContainer.querySelector('.result-header') as HTMLElement | null
        const resultStatusTextEl = resultContainer.querySelector(
            '.result-status-text'
        ) as HTMLElement | null
        const resultContent = resultContainer.querySelector('.result-content') as HTMLElement | null
        const resultTextEl = resultContainer.querySelector('.result-text') as HTMLElement | null // Usually a <pre> tag

        if (!resultHeader || !resultStatusTextEl || !resultContent || !resultTextEl) {
            return
        }

        resultContainer.classList.remove('hidden')
        resultHeader.className = 'result-header ' // Reset classes then add new one
        resultHeader.classList.add(resultType)

        let statusTextContent = '✓ Success'
        if (resultType === 'error') {
            statusTextContent = '✗ Error'
        } else if (resultType === 'failed') {
            statusTextContent = '⚠ Failed'
        }

        resultStatusTextEl.textContent = statusTextContent
        resultStatusTextEl.classList.remove('success', 'error', 'failed')
        resultStatusTextEl.classList.add(resultType)

        // Clear previous content and reset display style for text area
        resultTextEl.textContent = ''
        resultTextEl.style.display = 'block'

        // Remove any existing images from the result content area
        const existingImage = resultContent.querySelector('.result-image')
        if (existingImage) {
            existingImage.remove()
        }

        if (contentType === 'image' && data) {
            const img = document.createElement('img')
            img.src = `data:${mimeType};base64,${data}`
            img.className = 'result-image'
            img.alt = 'Tool result image'
            resultTextEl.style.display = 'none' // Hide the <pre> tag if showing an image
            resultContent.appendChild(img)
        } else if (contentType === 'text') {
            resultTextEl.textContent = data
        } else if (contentType === 'json' || contentType === 'raw') {
            try {
                resultTextEl.textContent = JSON.stringify(data, null, 2)
            } catch (e) {
                resultTextEl.textContent = 'Error: Could not stringify incoming data.'
                console.error('Error stringifying data:', e, data)
            }
        } else {
            resultTextEl.textContent =
                typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        }

        // Ensure the result content area is open
        resultContent.classList.add('open')
        const resultToggle = resultHeader.querySelector('.result-toggle') as HTMLElement | null
        if (resultToggle) {
            resultToggle.classList.add('open')
            resultToggle.textContent = '▲'
        }
    }
})
