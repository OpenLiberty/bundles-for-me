import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { runBndCommand } from './bndCli';
import { BndHubProvider } from './bndHub';
import { showBundleGraph } from './bundleGraph';
import { findWorkspaceRoot, findProjectRoot } from './workspaceDetection';

let outputChannel: vscode.OutputChannel;
const bndFileBadgeColor = new vscode.ThemeColor('bndTools.fileBadgeForeground');
type CommandTarget = vscode.Uri | { resourceUri?: vscode.Uri };

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('Bnd');
    context.subscriptions.push(outputChannel);

    context.subscriptions.push(
        vscode.commands.registerCommand('bnd.buildWorkspace', (target?: CommandTarget) => buildWorkspace(target)),
        vscode.commands.registerCommand('bnd.buildProject', (target?: CommandTarget) => buildProject(target)),
        vscode.commands.registerCommand('bnd.clean', (target?: CommandTarget) => cleanWorkspace(target)),
        vscode.commands.registerCommand('bnd.resolveBndrun', (target?: CommandTarget) => resolveBndrun(target)),
        vscode.commands.registerCommand('bnd.runBndrun', (target?: CommandTarget) => runBndrun(target)),
        vscode.commands.registerCommand('bnd.showProjectInfo', (target?: CommandTarget) => showProjectInfo(target)),
        vscode.commands.registerCommand('bnd.showBundleGraph', (target?: CommandTarget) => showBundleGraph(commandTargetUri(target)))
    );

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'bnd', pattern: '**/*.bndrun' },
            new BndrunCodeLensProvider()
        )
    );

    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(new BndFileDecorationProvider())
    );

    const bndHubProvider = new BndHubProvider();
    context.subscriptions.push(
        bndHubProvider,
        vscode.window.registerTreeDataProvider('bnd.hub', bndHubProvider),
        vscode.commands.registerCommand('bnd.refreshHub', () => bndHubProvider.refresh())
    );
}

export function deactivate(): void {
    // Nothing to tear down explicitly; child processes are not detached.
}

/**
 * Resolves the file the command should operate on. Commands can be invoked
 * from the editor title bar (no argument, use the active editor), from the
 * explorer context menu (uri argument provided), or from the command
 * palette (no argument, no active editor — prompt the user).
 */
async function resolveTargetUri(uri?: vscode.Uri, requiredExtension?: string): Promise<vscode.Uri | undefined> {
    if (uri) {
        return uri;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && (!requiredExtension || activeEditor.document.fileName.endsWith(requiredExtension))) {
        return activeEditor.document.uri;
    }

    vscode.window.showErrorMessage(
        requiredExtension
            ? `No ${requiredExtension} file is active or selected.`
            : 'No file is active or selected.'
    );
    return undefined;
}

function commandTargetUri(target?: CommandTarget): vscode.Uri | undefined {
    return target instanceof vscode.Uri ? target : target?.resourceUri;
}

async function buildWorkspace(target?: CommandTarget): Promise<void> {
    const targetUri = commandTargetUri(target);
    const folder = targetUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) {
        vscode.window.showErrorMessage('Open a folder containing a bnd workspace first.');
        return;
    }

    const workspaceRoot = await findWorkspaceRoot(folder.fsPath);
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No bnd workspace (cnf/build.bnd) found in this folder.');
        return;
    }

    await runBndCommand(['build'], workspaceRoot, outputChannel, 'Building workspace');
}

async function buildProject(target?: CommandTarget): Promise<void> {
    const uri = await resolveTargetUri(commandTargetUri(target));
    if (!uri) {
        return;
    }

    const projectRoot = await findProjectRoot(uri.fsPath);
    if (!projectRoot) {
        vscode.window.showErrorMessage('Could not find a bnd.bnd file for this project.');
        return;
    }

    await runBndCommand(['build'], projectRoot, outputChannel, 'Building project');
}

async function cleanWorkspace(target?: CommandTarget): Promise<void> {
    const targetUri = commandTargetUri(target);
    const folder = targetUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) {
        vscode.window.showErrorMessage('Open a folder containing a bnd workspace first.');
        return;
    }

    const workspaceRoot = await findWorkspaceRoot(folder.fsPath);
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No bnd workspace (cnf/build.bnd) found in this folder.');
        return;
    }

    await runBndCommand(['clean'], workspaceRoot, outputChannel, 'Cleaning workspace');
}

async function resolveBndrun(target?: CommandTarget): Promise<void> {
    const uri = await resolveTargetUri(commandTargetUri(target), '.bndrun');
    if (!uri) {
        return;
    }

    const cwd = path.dirname(uri.fsPath);
    await runBndCommand(
        ['resolve', 'resolve', '-W', uri.fsPath],
        cwd,
        outputChannel,
        `Resolving ${path.basename(uri.fsPath)}`
    );
}

async function runBndrun(target?: CommandTarget): Promise<void> {
    const uri = await resolveTargetUri(commandTargetUri(target), '.bndrun');
    if (!uri) {
        return;
    }

    const cwd = path.dirname(uri.fsPath);
    await runBndCommand(
        ['run', uri.fsPath],
        cwd,
        outputChannel,
        `Running ${path.basename(uri.fsPath)}`
    );
}

async function showProjectInfo(target?: CommandTarget): Promise<void> {
    const uri = await resolveTargetUri(commandTargetUri(target));
    if (!uri) {
        return;
    }

    const projectRoot = await findProjectRoot(uri.fsPath);
    if (!projectRoot) {
        vscode.window.showErrorMessage('Could not find a bnd.bnd file for this project.');
        return;
    }

    await runBndCommand(['info'], projectRoot, outputChannel, 'Fetching project information');
}

/**
 * Adds "Run" and "Resolve" CodeLens buttons at the top of any open .bndrun file.
 */
class BndrunCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!fs.existsSync(document.fileName)) {
            return [];
        }

        const topOfFile = new vscode.Range(0, 0, 0, 0);

        const runLens = new vscode.CodeLens(topOfFile, {
            title: '$(play) Run',
            command: 'bnd.runBndrun',
            arguments: [document.uri]
        });

        const resolveLens = new vscode.CodeLens(topOfFile, {
            title: '$(sync) Resolve',
            command: 'bnd.resolveBndrun',
            arguments: [document.uri]
        });

        return [runLens, resolveLens];
    }
}

/**
 * Marks Bnd descriptors and runtime definitions without replacing the active
 * file-icon theme selected by the user.
 */
class BndFileDecorationProvider implements vscode.FileDecorationProvider {
    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const extension = path.extname(uri.fsPath).toLowerCase();

        if (extension === '.bndrun') {
            return new vscode.FileDecoration('⧉', 'Bnd runtime definition', bndFileBadgeColor);
        }

        if (extension === '.bnd') {
            return new vscode.FileDecoration('⧉', 'Bnd descriptor', bndFileBadgeColor);
        }

        return undefined;
    }
}
