import * as path from 'path';
import * as vscode from 'vscode';

type BndHubItem = BndWorkspaceItem | BndDirectoryItem | BndFileItem;

const EXCLUDED_DIRECTORIES = new Set(['.git', 'build', 'node_modules', 'out', 'target']);

/**
 * Presents only the path segments that lead to Bnd descriptors, keeping large
 * workspaces navigable without mirroring every source and generated directory.
 */
export class BndHubProvider implements vscode.TreeDataProvider<BndHubItem>, vscode.Disposable {
    private readonly changeEmitter = new vscode.EventEmitter<BndHubItem | undefined>();
    private readonly watchers: vscode.FileSystemWatcher[];
    private readonly subscriptions: vscode.Disposable[];
    private readonly workspaceTrees = new Map<string, Promise<BndDirectory>>();
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;

    readonly onDidChangeTreeData = this.changeEmitter.event;

    constructor() {
        this.watchers = ['**/*.bnd', '**/*.bndrun'].map((pattern) =>
            vscode.workspace.createFileSystemWatcher(pattern, false, true, false)
        );
        this.subscriptions = [
            ...this.watchers.flatMap((watcher) => [
                watcher.onDidCreate(() => this.scheduleRefresh()),
                watcher.onDidDelete(() => this.scheduleRefresh())
            ]),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh())
        ];
    }

    getTreeItem(item: BndHubItem): vscode.TreeItem {
        return item;
    }

    async getChildren(item?: BndHubItem): Promise<BndHubItem[]> {
        if (!item) {
            return (vscode.workspace.workspaceFolders ?? []).map((folder) => new BndWorkspaceItem(folder));
        }

        if (item instanceof BndFileItem) {
            return [];
        }

        if (item instanceof BndDirectoryItem) {
            return this.childrenForDirectory(item.directory);
        }

        const root = await this.treeForWorkspace(item.workspaceFolder);
        return this.childrenForDirectory(root);
    }

    refresh(): void {
        this.workspaceTrees.clear();
        this.changeEmitter.fire(undefined);
    }

    dispose(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.changeEmitter.dispose();
        this.watchers.forEach((watcher) => watcher.dispose());
        this.subscriptions.forEach((subscription) => subscription.dispose());
    }

    private childrenForDirectory(directory: BndDirectory): BndHubItem[] {
        const directories = [...directory.directories.values()]
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((child) => new BndDirectoryItem(child));
        const files = [...directory.files]
            .sort((left, right) => path.basename(left.fsPath).localeCompare(path.basename(right.fsPath)))
            .map((uri) => new BndFileItem(uri));

        return [...directories, ...files];
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        this.refreshTimer = setTimeout(() => this.refresh(), 200);
    }

    private treeForWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<BndDirectory> {
        const key = workspaceFolder.uri.toString();
        let tree = this.workspaceTrees.get(key);

        if (!tree) {
            tree = this.scanWorkspace(workspaceFolder);
            this.workspaceTrees.set(key, tree);
        }

        return tree;
    }

    private async scanWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<BndDirectory> {
        const root: BndDirectory = {
            name: workspaceFolder.name,
            uri: workspaceFolder.uri,
            directories: new Map(),
            files: []
        };
        const [descriptors, runtimes] = await Promise.all([
            vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, '**/*.bnd')),
            vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, '**/*.bndrun'))
        ]);

        for (const uri of [...descriptors, ...runtimes]) {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            const segments = relativePath.split(path.sep);

            if (segments.length === 0 || segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
                continue;
            }

            let directory = root;
            for (const segment of segments.slice(0, -1)) {
                let child = directory.directories.get(segment);
                if (!child) {
                    child = {
                        name: segment,
                        uri: vscode.Uri.joinPath(directory.uri, segment),
                        directories: new Map(),
                        files: []
                    };
                    directory.directories.set(segment, child);
                }
                directory = child;
            }
            directory.files.push(uri);
        }

        return root;
    }
}

interface BndDirectory {
    name: string;
    uri: vscode.Uri;
    directories: Map<string, BndDirectory>;
    files: vscode.Uri[];
}

class BndWorkspaceItem extends vscode.TreeItem {
    constructor(readonly workspaceFolder: vscode.WorkspaceFolder) {
        super(workspaceFolder.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.resourceUri = workspaceFolder.uri;
        this.contextValue = 'bndWorkspace';
        this.tooltip = workspaceFolder.uri.fsPath;
    }
}

class BndDirectoryItem extends vscode.TreeItem {
    constructor(readonly directory: BndDirectory) {
        super(directory.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.resourceUri = directory.uri;
        this.contextValue = 'bndDirectory';
        this.tooltip = directory.uri.fsPath;
    }
}

class BndFileItem extends vscode.TreeItem {
    constructor(uri: vscode.Uri) {
        super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
        this.resourceUri = uri;
        this.contextValue = path.extname(uri.fsPath) === '.bndrun' ? 'bndRuntime' : 'bndDescriptor';
        this.tooltip = uri.fsPath;
        this.command = {
            command: 'vscode.open',
            title: 'Open Bnd File',
            arguments: [uri]
        };
    }
}
