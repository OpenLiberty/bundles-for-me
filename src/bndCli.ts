import * as vscode from 'vscode';
import { spawn } from 'child_process';

const lifecycleBanner = String.raw`
 /$$$$$$$$ /$$$$$$ /$$      /$$ /$$$$$$$$       /$$$$$$$$ /$$$$$$        /$$$$$$$$ /$$$$$$$  /$$$$$$ /$$      /$$
|__  $$__/|_  $$_/| $$$    /$$$| $$_____/      |__  $$__//$$__  $$      |__  $$__/| $$__  $$|_  $$_/| $$$    /$$$
   | $$     | $$  | $$$$  /$$$$| $$               | $$  | $$  \ $$         | $$   | $$  \ $$  | $$  | $$$$  /$$$$
   | $$     | $$  | $$ $$/$$ $$| $$$$$            | $$  | $$  | $$         | $$   | $$$$$$$/  | $$  | $$ $$/$$ $$
   | $$     | $$  | $$  $$$| $$| $$__/            | $$  | $$  | $$         | $$   | $$__  $$  | $$  | $$  $$$| $$
   | $$     | $$  | $$\  $ | $$| $$               | $$  | $$  | $$         | $$   | $$  \ $$  | $$  | $$\  $ | $$
   | $$    /$$$$$$| $$ \/  | $$| $$$$$$$$         | $$  |  $$$$$$/         | $$   | $$  | $$ /$$$$$$| $$ \/  | $$
   |__/   |______/|__/     |__/|________/         |__/   \______/          |__/   |__/  |__/|______/|__/     |__/
`.trimEnd().split('\n').slice(1);
const loadingBar = `[${' '.repeat(40)}]`;
const completeBar = `[${'='.repeat(40)}]`;

function appendLifecycleStart(outputChannel: vscode.OutputChannel, lifecycleName: string): void {
    outputChannel.appendLine('');
    lifecycleBanner.forEach((line) => outputChannel.appendLine(line));
    outputChannel.appendLine('');
    outputChannel.appendLine(`  Lifecycle: ${lifecycleName}`);
    outputChannel.appendLine(`  ${loadingBar} Running`);
}

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
    appendLifecycleStart(outputChannel, progressTitle);
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
                let finished = false;

                function finish(code: number | null, launchError?: Error): void {
                    if (finished) {
                        return;
                    }
                    finished = true;

                    if (launchError) {
                        outputChannel.appendLine(`\nFailed to launch bnd CLI: ${launchError.message}`);
                        outputChannel.appendLine(`  ${completeBar} ${progressTitle}: failed`);
                        vscode.window.showErrorMessage(
                            `Could not run the bnd CLI ("${cliPath}"). Check the bnd.cliPath setting and that bnd is on your PATH.`
                        );
                    } else {
                        outputChannel.appendLine(`\n[exit code ${code}]`);
                        outputChannel.appendLine(`  ${completeBar} ${progressTitle}: ${code === 0 ? 'done' : 'failed'}`);
                        if (code === 0) {
                            vscode.window.showInformationMessage(`${progressTitle}: done.`);
                        } else {
                            vscode.window.showErrorMessage(`${progressTitle}: failed (exit code ${code}). See Bnd output.`);
                        }
                    }
                    resolve();
                }

                child.stdout.on('data', (chunk: Buffer) => {
                    outputChannel.append(chunk.toString());
                });

                child.stderr.on('data', (chunk: Buffer) => {
                    outputChannel.append(chunk.toString());
                });

                child.on('error', (err) => {
                    finish(null, err);
                });

                child.on('close', (code) => {
                    finish(code);
                });
            });
        }
    });
}
