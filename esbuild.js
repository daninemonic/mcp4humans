const esbuild = require('esbuild')
const glob = require('glob') // For finding client-side TS files
const fs = require('fs-extra') // For copying HTML/CSS
const path = require('path')

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started')
        })
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`)
                console.error(`    ${location.file}:${location.line}:${location.column}:`)
            })
            console.log('[watch] build finished')
        })
    },
}

async function buildExtension() {
    return esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    })
}

async function buildWebviewClients() {
    const entryPoints = glob.sync('src/webviews/client/**/*.ts')
    if (entryPoints.length === 0) {
        console.log('[webview-clients] No client TS files found. Skipping.')
        return null
    }
    return esbuild.context({
        entryPoints: entryPoints,
        bundle: true, // Bundle each entry point separately
        format: 'esm', // Or 'iife' if you prefer
        minify: production,
        sourcemap: !production,
        platform: 'browser', // Target browser environment
        outdir: 'dist/webviews/js',
        // Splitting can be useful if you have shared code between webview clients
        // splitting: true,
        // outbase: 'src/webviews/ts-client', // Helps maintain folder structure in outdir
        external: ['vscode'], // Though typically you don't use 'vscode' directly in client scripts
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin], // Optional: use if you want problem matching for client scripts too
    })
}

async function copyWebviewAssets() {
    const copyPromises = []

    // Copy HTML files
    const htmlFiles = glob.sync('src/webviews/html/**/*.html')
    htmlFiles.forEach(file => {
        const dest = file.replace('src/webviews/html', 'dist/webviews/html')
        fs.ensureDirSync(path.dirname(dest)) // Ensure directory exists
        copyPromises.push(fs.copy(file, dest))
        console.log(`[assets] Copied ${file} to ${dest}`)
    })

    // Copy CSS files
    const cssFiles = glob.sync('src/webviews/css/**/*.css')
    cssFiles.forEach(file => {
        const dest = file.replace('src/webviews/css', 'dist/webviews/css')
        fs.ensureDirSync(path.dirname(dest)) // Ensure directory exists
        copyPromises.push(fs.copy(file, dest))
        console.log(`[assets] Copied ${file} to ${dest}`)
    })

    await Promise.all(copyPromises)
    console.log('[assets] Webview HTML and CSS assets copied.')
}

async function main() {
    // Clean dist directory first
    await fs.emptyDir('dist')
    console.log('[main] Cleaned dist directory.')

    const extensionCtx = await buildExtension()
    const webviewClientsCtx = await buildWebviewClients()

    await copyWebviewAssets() // Copy assets initially

    if (watch) {
        await extensionCtx.watch()
        if (webviewClientsCtx) {
            await webviewClientsCtx.watch()
        }
        // Add watch for HTML/CSS changes if desired
        // This requires a more complex watch setup, e.g., using chokidar
        // For now, assets are copied once at the start of the watch.
        // Re-run the build if you change HTML/CSS in watch mode.
        console.log('[main] Watching for changes...')
    } else {
        await extensionCtx.rebuild()
        await extensionCtx.dispose()
        if (webviewClientsCtx) {
            await webviewClientsCtx.rebuild()
            await webviewClientsCtx.dispose()
        }
        console.log('[main] Build complete.')
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
