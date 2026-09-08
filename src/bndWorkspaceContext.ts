import * as path from 'path';
import * as vscode from 'vscode';
import {
    AnnotationFamily,
    AnnotationUse,
    TextSource,
    analyzeAnnotationDirective,
    annotationFamily,
    annotationUsesIn,
    classEntries,
    localIncludePath,
    packagesFromValue,
    propertiesIn,
    propertyValue,
    sourcesForDescriptor,
    splitBndList
} from './bndAnalysis';

interface WorkspaceModule {
    readonly descriptor: vscode.Uri;
    readonly symbolicName?: string;
    readonly exportedPackages: readonly string[];
}

interface JavaSource extends TextSource {
    readonly uri: vscode.Uri;
}

interface WorkspaceIndex {
    readonly modules: readonly WorkspaceModule[];
    readonly runFiles: readonly JavaSource[];
    readonly configurationSources: readonly JavaSource[];
}

interface IncludeTrace {
    readonly sources: readonly JavaSource[];
    readonly unresolved: readonly string[];
}

export interface ContextualHover {
    readonly heading: string;
    readonly lines: readonly string[];
}

/**
 * A deliberately lightweight workspace index. It explains configuration from
 * the files the user has open without requiring a successful bnd build.
 */
export class BndWorkspaceContext implements vscode.Disposable {
    private index: WorkspaceIndex | undefined;
    private loading: Promise<WorkspaceIndex> | undefined;
    private javaSources: readonly JavaSource[] | undefined;
    private javaLoading: Promise<readonly JavaSource[]> | undefined;
    private readonly watcher: vscode.FileSystemWatcher;
    private readonly textDocumentListener: vscode.Disposable;

    constructor() {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*.{bnd,bndrun,java}');
        const invalidate = () => this.clear();
        this.watcher.onDidChange(invalidate);
        this.watcher.onDidCreate(invalidate);
        this.watcher.onDidDelete(invalidate);
        this.textDocumentListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document.languageId === 'bnd' || event.document.languageId === 'java') {
                this.clear();
            }
        });
    }

    dispose(): void {
        this.watcher.dispose();
        this.textDocumentListener.dispose();
    }

    async describe(document: vscode.TextDocument, key: string, value: string): Promise<ContextualHover | undefined> {
        const normalizedKey = key.toLowerCase();
        const trace = await this.resolveIncludes(document);
        const originLines = this.describePropertyOrigin(document, key, trace);

        if (normalizedKey === '-include') {
            return this.describeIncludes(trace);
        }

        if (!['-dsannotations', '-metatypeannotations', '-cdiannotations', '-dsannotations-inherit', 'service-component', 'private-package', 'export-package', 'bundle-symbolicname', 'import-package', 'bversion'].includes(normalizedKey)) {
            return originLines.length > 0 ? { heading: 'Project configuration', lines: originLines } : undefined;
        }

        const index = await this.getIndex();
        const module = index.modules.find((candidate) => candidate.descriptor.fsPath === document.uri.fsPath);
        let contextual: ContextualHover;

        switch (normalizedKey) {
            case '-dsannotations':
                contextual = this.describeAnnotationDirective(document, value, 'Declarative Services', await this.getJavaSources());
                break;
            case '-metatypeannotations':
                contextual = this.describeAnnotationDirective(document, value, 'OSGi Metatype', await this.getJavaSources());
                break;
            case '-cdiannotations':
                contextual = this.describeAnnotationDirective(document, value, 'CDI', await this.getJavaSources());
                break;
            case '-dsannotations-inherit':
                contextual = this.describeAnnotationInheritance(document, await this.getJavaSources());
                break;
            case 'service-component':
                contextual = this.describeServiceComponents(document, value, await this.getJavaSources());
                break;
            case 'private-package':
                contextual = this.describePrivatePackages(document, value, await this.getJavaSources());
                break;
            case 'export-package':
                contextual = this.describeExportedPackages(document, value, await this.getJavaSources());
                break;
            case 'bundle-symbolicname':
                contextual = this.describeBundleIdentity(document, value, module, index);
                break;
            case 'import-package':
                contextual = this.describeImportedPackages(value, index);
                break;
            case 'bversion':
                contextual = this.describeVersionInput(document, trace);
                break;
            default:
                return undefined;
        }
        return { heading: contextual.heading, lines: [...contextual.lines, ...originLines] };
    }

    async describeAnnotation(document: vscode.TextDocument, annotationName: string): Promise<ContextualHover | undefined> {
        const annotation = annotationUseAt(document.getText(), annotationName);
        const family = annotationFamily(annotation.qualifiedName);
        const index = await this.getIndex();
        const descriptor = nearestDescriptor(document.uri, index.configurationSources);
        const className = annotation.className ?? path.basename(document.uri.fsPath, '.java');
        let explicitlyConfigured = false;
        const lines = family
            ? [`This is a **${family}** annotation on \`${className}\`. It is build-time input; bnd or a workspace build plugin can turn it into runtime metadata.`]
            : [`This is a project-specific annotation on \`${className}\`. The extension will only connect it to configuration when its containing class is explicitly named by a local bnd processing directive.`];

        if (descriptor) {
            const properties = propertiesIn(descriptor.text);
            const directives = ['-dsannotations', '-metatypeannotations', '-cdiannotations'];
            const explicitlyNamedBy = directives.filter((directive) => classEntries(properties.get(directive) ?? '').includes(annotation.className ?? ''));
            const expectedDirective = family ? annotationDirective(family) : undefined;
            if (explicitlyNamedBy.length > 0) {
                explicitlyConfigured = true;
                lines.push(`\`${relativePath(descriptor.uri)}\` explicitly names this class in ${explicitlyNamedBy.map((directive) => `\`${directive}\``).join(', ')}. The class is therefore part of that build-time metadata processing path.`);
            } else if (expectedDirective && properties.has(expectedDirective.toLowerCase())) {
                const configuredClasses = classEntries(properties.get(expectedDirective) ?? '');
                lines.push(`The nearest descriptor, \`${relativePath(descriptor.uri)}\`, declares \`${expectedDirective}\`. This annotation is part of that processing family${configuredClasses.length > 0 ? ', although this class is not explicitly named in the directive' : ''}.`);
            } else {
                lines.push(expectedDirective
                    ? `No local \`${expectedDirective}\` declaration was found in \`${relativePath(descriptor.uri)}\`. It may be inherited through \`-include\` or handled by workspace tooling.`
                    : `No local processing directive explicitly names this class in \`${relativePath(descriptor.uri)}\`.`);
            }
        } else {
            lines.push(`No containing \`.bnd\` descriptor was found, so the extension cannot identify which build rule processes this annotation.`);
        }
        if (!family && !explicitlyConfigured) {
            return undefined;
        }
        return { heading: 'Bnd relationship', lines };
    }

    private async resolveIncludes(document: vscode.TextDocument): Promise<IncludeTrace> {
        const sources: JavaSource[] = [];
        const unresolved: string[] = [];
        const visited = new Set<string>([document.uri.fsPath]);

        const visit = async (uri: vscode.Uri, text: string, depth: number): Promise<void> => {
            if (depth > 8) {
                return;
            }
            const includes = propertyValue(text, '-include');
            if (!includes) {
                return;
            }
            for (const entry of splitBndList(includes)) {
                const workspacePath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
                const candidate = localIncludePath(entry, uri.fsPath, workspacePath);
                if (!candidate) {
                    unresolved.push(entry.trim());
                    continue;
                }
                const includeUri = vscode.Uri.file(candidate);
                if (visited.has(includeUri.fsPath)) {
                    continue;
                }
                visited.add(includeUri.fsPath);
                try {
                    const source = await this.readSource(includeUri);
                    sources.push(source);
                    await visit(includeUri, source.text, depth + 1);
                } catch {
                    unresolved.push(entry.trim());
                }
            }
        };

        await visit(document.uri, document.getText(), 0);
        return { sources, unresolved };
    }

    private describeIncludes(trace: IncludeTrace): ContextualHover {
        const lines: string[] = [];
        if (trace.sources.length > 0) {
            lines.push(`This descriptor imports shared configuration from ${trace.sources.map((source) => `\`${relativePath(source.uri)}\``).join(', ')}.`);
            const keys = [...new Set(trace.sources.flatMap((source) => [...propertiesIn(source.text).keys()]))];
            if (keys.length > 0) {
                lines.push(`The resolved include${plural(trace.sources.length)} contributes ${keys.length} property${plural(keys.length)}, including ${keys.slice(0, 6).map((key) => `\`${key}\``).join(', ')}${keys.length > 6 ? ', ...' : ''}.`);
            }
        } else {
            lines.push('No local include files could be resolved from this descriptor.');
        }
        if (trace.unresolved.length > 0) {
            lines.push(`Not resolved by the extension: ${trace.unresolved.slice(0, 4).map((entry) => `\`${entry}\``).join(', ')}${trace.unresolved.length > 4 ? ', ...' : ''}. These may be optional, macro-based, or JAR-based includes.`);
        }
        return { heading: 'Configuration inheritance', lines };
    }

    private describePropertyOrigin(document: vscode.TextDocument, key: string, trace: IncludeTrace): string[] {
        const localProperties = propertiesIn(document.getText());
        const normalizedKey = key.toLowerCase();
        const inheritedFrom = trace.sources.filter((source) => propertiesIn(source.text).has(normalizedKey));
        const lines = localProperties.has(normalizedKey) ? ['Declared in this file.'] : [];

        if (inheritedFrom.length > 0) {
            const locations = inheritedFrom.map((source) => `\`${relativePath(source.uri)}\``).join(', ');
            lines.push(localProperties.has(normalizedKey)
                ? `An included file also declares this property: ${locations}. Review the include order when changing the local value.`
                : `Inherited from ${locations}.`);
        }
        return lines;
    }

    private clear(): void {
        this.index = undefined;
        this.loading = undefined;
        this.javaSources = undefined;
        this.javaLoading = undefined;
    }

    private async getIndex(): Promise<WorkspaceIndex> {
        if (this.index) {
            return this.index;
        }
        if (!this.loading) {
            this.loading = this.buildIndex().then((index) => {
                this.index = index;
                this.loading = undefined;
                return index;
            });
        }
        return this.loading;
    }

    private async buildIndex(): Promise<WorkspaceIndex> {
        const [descriptorUris, runUris] = await Promise.all([
            vscode.workspace.findFiles('**/*.bnd', '**/{node_modules,.git}/**'),
            vscode.workspace.findFiles('**/*.bndrun', '**/{node_modules,.git}/**')
        ]);
        const [descriptors, runFiles] = await Promise.all([
            Promise.all(descriptorUris.map((uri) => this.readSource(uri))),
            Promise.all(runUris.map((uri) => this.readSource(uri)))
        ]);

        return {
            modules: descriptors.map((source) => ({
                descriptor: source.uri,
                symbolicName: propertyValue(source.text, 'Bundle-SymbolicName'),
                exportedPackages: packagesFromValue(propertyValue(source.text, 'Export-Package') ?? '')
            })),
            runFiles,
            configurationSources: descriptors
        };
    }

    private async getJavaSources(): Promise<readonly JavaSource[]> {
        if (this.javaSources) {
            return this.javaSources;
        }
        if (!this.javaLoading) {
            this.javaLoading = this.loadJavaSources();
        }
        return this.javaLoading;
    }

    private async loadJavaSources(): Promise<readonly JavaSource[]> {
        const uris = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git}/**');
        const sources = await Promise.all(uris.map((uri) => this.readSource(uri)));
        this.javaSources = sources;
        this.javaLoading = undefined;
        return sources;
    }

    private async readSource(uri: vscode.Uri): Promise<JavaSource> {
        const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === uri.fsPath);
        if (openDocument) {
            return { uri, path: uri.fsPath, text: openDocument.getText() };
        }
        return { uri, path: uri.fsPath, text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8') };
    }

    private describeAnnotationDirective(document: vscode.TextDocument, value: string, family: AnnotationFamily, sources: readonly JavaSource[]): ContextualHover {
        const localSources = sourcesForDocument(document, sources);
        const evidence = analyzeAnnotationDirective(value, family, localSources);
        const lines = [
            `Detected **${evidence.familyUseCount}** ${family} annotation${plural(evidence.familyUseCount)} in this bundle across ${evidence.familyClassCount} class${plural(evidence.familyClassCount)}.`
        ];
        if (evidence.configuredClasses.length > 0) {
            lines.push(`This directive explicitly names ${evidence.configuredClasses.map((name) => `\`${name}\``).join(', ')}. ${evidence.configuredFamilyUseCount > 0 ? `The extension matched ${evidence.configuredFamilyUseCount} relevant annotation${plural(evidence.configuredFamilyUseCount)} on those configured class${plural(evidence.configuredClasses.length)}.` : 'No matching source annotation was found on those classes; the class may be generated, supplied by another source root, or use a different annotation family.'}`);
            if (evidence.projectSpecificAnnotations.length > 0) {
                lines.push(`Configured classes also carry project-specific annotations: ${evidence.projectSpecificAnnotations.slice(0, 6).map((name) => `\`@${shortName(name)}\``).join(', ')}${evidence.projectSpecificAnnotations.length > 6 ? ', ...' : ''}. They are shown as related context; the extension does not assume this directive consumes them without a declared rule.`);
            }
        } else {
            lines.push('No explicit class list is present. Processing scope is determined by bnd and workspace configuration, so the annotation inventory above is evidence rather than a claim that every annotation is processed.');
        }
        return { heading: 'Annotation relationship', lines };
    }

    private describeAnnotationInheritance(document: vscode.TextDocument, sources: readonly JavaSource[]): ContextualHover {
        const uses = sourcesForDocument(document, sources).flatMap(annotationUsesIn).filter((use) => annotationFamily(use.qualifiedName) === 'Declarative Services');
        return {
            heading: 'Annotation relationship',
            lines: [
                `This setting modifies how \`-dsannotations\` handles inheritance. The bundle currently contains **${uses.length}** Declarative Services annotation${plural(uses.length)} across ${new Set(uses.map((use) => use.className).filter(Boolean)).size} class${plural(new Set(uses.map((use) => use.className).filter(Boolean)).size)}.`,
                'Review this setting together with -dsannotations and the component class hierarchy; it changes metadata-generation behavior, not service resolution by itself.'
            ]
        };
    }

    private describeServiceComponents(document: vscode.TextDocument, value: string, sources: readonly JavaSource[]): ContextualHover {
        const dsUses = sourcesForDocument(document, sources).flatMap(annotationUsesIn).filter((use) => annotationFamily(use.qualifiedName) === 'Declarative Services');
        return {
            heading: 'Annotation relationship',
            lines: [
                `Service-Component points the runtime at component metadata. This bundle has **${dsUses.length}** Declarative Services annotation${plural(dsUses.length)} that may generate matching OSGI-INF descriptors when \`-dsannotations\` is configured.`,
                `Current metadata declaration: \`${value.replace(/\s+/g, ' ').trim()}\`.`
            ]
        };
    }

    private describePrivatePackages(document: vscode.TextDocument, value: string, sources: readonly JavaSource[]): ContextualHover {
        const packages = packagesFromValue(value);
        if (packages.length === 0) {
            return { heading: 'Workspace impact', lines: ['No packages are configured as private in this declaration.'] };
        }

        const localSources = sourcesForDocument(document, sources);
        const externalSources = sources.filter((source) => !localSources.includes(source));
        const externalImports = importingSources(externalSources, packages);
        const lines = [
            `This keeps **${packages.length}** package${plural(packages.length)} inside this bundle’s implementation boundary: ${packages.map((entry) => `\`${entry}\``).join(', ')}.`,
            'The classes are packaged in the JAR but are not advertised to the OSGi resolver as public API.'
        ];

        if (externalImports.length > 0) {
            lines.push(`**Potential boundary leak:** ${describeSources(externalImports)} import${plural(externalImports.length)} one of these private packages. Those consumers cannot rely on an OSGi package import being available.`);
        } else {
            lines.push('No Java imports from other workspace modules reference these private packages.');
        }
        return { heading: 'Why this exists in this workspace', lines };
    }

    private describeExportedPackages(document: vscode.TextDocument, value: string, sources: readonly JavaSource[]): ContextualHover {
        const packages = packagesFromValue(value);
        if (packages.length === 0) {
            return { heading: 'Workspace impact', lines: ['No packages are exported by this declaration.'] };
        }

        const localSources = sourcesForDocument(document, sources);
        const consumers = importingSources(sources.filter((source) => !localSources.includes(source)), packages);
        const lines = [
            `This declares **${packages.length}** public package${plural(packages.length)} for other OSGi bundles to import. Changing a type or its exported version can therefore affect downstream resolution.`,
            consumers.length > 0
                ? `Workspace consumers: ${describeSources(consumers)} import${plural(consumers.length)} these API packages.`
                : 'No Java imports from other workspace modules currently reference these exported packages.'
        ];
        return { heading: 'Why this exists in this workspace', lines };
    }

    private describeBundleIdentity(document: vscode.TextDocument, value: string, module: WorkspaceModule | undefined, index: WorkspaceIndex): ContextualHover {
        const symbolicName = value.trim();
        const lines = [
            `This is the bundle’s stable resolver identity. Other configuration refers to the bundle name, not its display name or project directory.`
        ];
        const runFiles = index.runFiles.filter((source) => source.text.includes(`osgi.identity=${symbolicName}`) || new RegExp(`\\b${escapeRegExp(symbolicName)};`).test(source.text));
        if (runFiles.length > 0) {
            lines.push(`Included by runtime assembly: ${runFiles.map((source) => `\`${relativePath(source.uri)}\``).join(', ')}.`);
        } else {
            lines.push('No workspace `.bndrun` file currently names this bundle in `-runrequires` or `-runbundles`.');
        }
        if (module && module.exportedPackages.length > 0) {
            lines.push(`This bundle publishes ${module.exportedPackages.map((entry) => `\`${entry}\``).join(', ')}.`);
        }
        return { heading: 'Why this exists in this workspace', lines };
    }

    private describeImportedPackages(value: string, index: WorkspaceIndex): ContextualHover {
        const packages = packagesFromValue(value).filter((entry) => !entry.startsWith('!') && entry !== '*');
        const exporters = index.modules.filter((module) => module.symbolicName && module.exportedPackages.some((exportedPackage) => packages.some((importedPackage) => packageMatches(exportedPackage, importedPackage))));
        const lines = [
            `This bundle declares **${packages.length}** explicit runtime package import${plural(packages.length)}. bnd records them in the manifest; the resolver must find compatible exporters at runtime.`
        ];
        if (exporters.length > 0) {
            lines.push(`Workspace descriptors that may satisfy part of this contract: ${exporters.slice(0, 8).map((module) => `\`${module.symbolicName}\``).join(', ')}${exporters.length > 8 ? ', ...' : ''}.`);
        } else {
            lines.push('No matching workspace exporter was found. The packages may come from an external repository, the framework, or an included third-party bundle.');
        }
        return { heading: 'Why this exists in this workspace', lines };
    }

    private describeVersionInput(document: vscode.TextDocument, trace: IncludeTrace): ContextualHover {
        const sources = [{ uri: document.uri, text: document.getText() }, ...trace.sources];
        const consumers = sources.filter((source) => propertyValue(source.text, 'Bundle-Version')?.includes('${bVersion}'));
        const lines = consumers.length > 0
            ? [`This workspace value is consumed by \`Bundle-Version\` in ${consumers.map((source) => `\`${relativePath(source.uri)}\``).join(', ')}. Changing it changes the base version selected by that macro.`]
            : ['No local Bundle-Version macro referencing `${bVersion}` was found. It may be consumed by another included file or by workspace build tooling.'];
        return { heading: 'Why this exists in this workspace', lines };
    }
}

function sourcesForDocument(document: vscode.TextDocument, sources: readonly JavaSource[]): JavaSource[] {
    return sourcesForDescriptor(document.uri.fsPath, sources) as JavaSource[];
}

function importingSources(sources: readonly JavaSource[], packages: readonly string[]): JavaSource[] {
    return sources.filter((source) => packages.some((packageName) => new RegExp(`^\\s*import\\s+${escapeRegExp(packageName)}(?:\\.|;)`, 'm').test(source.text)));
}

function packageMatches(exportedPackage: string, importedPackage: string): boolean {
    if (exportedPackage === importedPackage) {
        return true;
    }
    if (exportedPackage.endsWith('.*')) {
        return importedPackage.startsWith(exportedPackage.slice(0, -1));
    }
    return false;
}

function annotationUseAt(text: string, annotationName: string): AnnotationUse {
    const source: JavaSource = { uri: vscode.Uri.file('annotation.java'), path: 'annotation.java', text };
    return annotationUsesIn(source).find((use) => use.qualifiedName.endsWith(`.${annotationName}`) || use.qualifiedName === annotationName)
        ?? { qualifiedName: annotationName };
}

function annotationDirective(family: AnnotationFamily): string {
    switch (family) {
        case 'Declarative Services':
            return '-dsannotations';
        case 'OSGi Metatype':
            return '-metatypeannotations';
        case 'CDI':
            return '-cdiannotations';
    }
}

function shortName(qualifiedName: string): string {
    return qualifiedName.slice(qualifiedName.lastIndexOf('.') + 1);
}

function nearestDescriptor(sourceUri: vscode.Uri, descriptors: readonly JavaSource[]): JavaSource | undefined {
    return descriptors
        .filter((descriptor) => sourceUri.fsPath.startsWith(`${path.dirname(descriptor.uri.fsPath)}${path.sep}`))
        .sort((left, right) => {
            const directoryLength = path.dirname(right.uri.fsPath).length - path.dirname(left.uri.fsPath).length;
            if (directoryLength !== 0) {
                return directoryLength;
            }
            return path.basename(left.uri.fsPath) === 'bnd.bnd' ? -1 : 1;
        })[0];
}

function describeSources(sources: readonly JavaSource[]): string {
    const modules = [...new Set(sources.map(sourceModuleName))];
    return modules.map((module) => `\`${module}\``).join(', ');
}

function sourceModuleName(source: JavaSource): string {
    const segments = source.uri.fsPath.split(path.sep);
    const sourceIndex = segments.lastIndexOf('src');
    return sourceIndex > 0 ? segments[sourceIndex - 1] : path.basename(path.dirname(source.uri.fsPath));
}

function relativePath(uri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder ? path.relative(folder.uri.fsPath, uri.fsPath) : path.basename(uri.fsPath);
}

function plural(count: number): string {
    return count === 1 ? '' : 's';
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
