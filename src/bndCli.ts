import * as vscode from 'vscode';
import { spawn } from 'child_process';

/**
 * Runs the bnd CLI with the given arguments in the given working directory,
 * streaming stdout/stderr into the provided output channel. Shows a progress
 * notification while the command runs and a toast on completion or failure.
 */
export function runBndCommand(
    args: string[],
    cwd: string,
    outputChannel: vscode.OutputChannel,
    progressTitle: string
): Promise<void> {
    const cliPath = vscode.workspace.getConfiguration('bnd').get<string>('cliPath', 'bnd');

    outputChannel.show(true);
    outputChannel.appendLine(`\n> ${cliPath} ${args.join(' ')}`);
    outputChannel.appendLine(`  (in ${cwd})`);

    return new Promise<void>((resolveOuter) => {
        const progressPromise = vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: progressTitle,
                cancellable: false
            },
            runChildProcess
        );

        progressPromise.then(() => resolveOuter());

        function runChildProcess(): Promise<void> {
            return new Promise<void>((resolve) => {
                const child = spawn(cliPath, args, { cwd, shell: false });

                child.stdout.on('data', (chunk: Buffer) => {
                    outputChannel.append(chunk.toString());
                });

                child.stderr.on('data', (chunk: Buffer) => {
                    outputChannel.append(chunk.toString());
                });

                child.on('error', (err) => {
                    outputChannel.appendLine(`\nFailed to launch bnd CLI: ${err.message}`);
                    vscode.window.showErrorMessage(
                        `Could not run the bnd CLI ("${cliPath}"). Check the bnd.cliPath setting and that bnd is on your PATH.`
                    );
                    resolve();
                });

                child.on('close', (code) => {
                    outputChannel.appendLine(`\n[exit code ${code}]`);
                    if (code === 0) {
                        vscode.window.showInformationMessage(`${progressTitle}: done.`);
                    } else {
                        vscode.window.showErrorMessage(`${progressTitle}: failed (exit code ${code}). See Bnd output.`);
                    }
                    resolve();
                });
            });
        }
    });
}
