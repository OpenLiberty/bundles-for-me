import * as path from 'path';
import * as vscode from 'vscode';
import { allBndInstructions, BndInstructionDefinition, findBndInstruction } from './bndMetadata';
import { BndWorkspaceContext } from './bndWorkspaceContext';

interface ParsedInstruction {
    readonly key: string;
    readonly normalizedKey: string;
    readonly value: string;
    readonly keyRange: vscode.Range;
    readonly fullRange: vscode.Range;
    readonly valueRange: vscode.Range;
    readonly operator: ':' | '=' | ' ';
}

interface ParseResult {
    readonly instructions: ParsedInstruction[];
    readonly diagnostics: vscode.Diagnostic[];
}

const HEADER_PATTERN = /^\s*([-A-Za-z0-9_.]+)\s*(:|=)\s*(.*)$/;
const SHORTHAND_INCLUDE_PATTERN = /^\s*(-include)\s+(.+)$/i;
const CONTINUATION_PATTERN = /^\s+/;

export class BndLanguageSupport implements vscode.Disposable {
    private readonly diagnostics = vscode.languages.createDiagnosticCollection('bnd');
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly workspaceContext = new BndWorkspaceContext();

    constructor() {
        this.subscriptions.push(
            this.diagnostics,
            this.workspaceContext,
            vscode.languages.registerCompletionItemProvider({ language: 'bnd' }, new BndCompletionProvider()),
            vscode.languages.registerHoverProvider({ language: 'bnd' }, new BndHoverProvider(this.workspaceContext)),
            vscode.languages.registerHoverProvider({ language: 'java' }, new BndAnnotationHoverProvider(this.workspaceContext)),
            vscode.workspace.onDidOpenTextDocument((document) => this.refreshDocument(document)),
            vscode.workspace.onDidChangeTextDocument((event) => this.refreshDocument(event.document)),
            vscode.workspace.onDidCloseTextDocument((document) => this.diagnostics.delete(document.uri))
        );

        vscode.workspace.textDocuments.forEach((document) => this.refreshDocument(document));
    }

    dispose(): void {
        this.subscriptions.forEach((subscription) => subscription.dispose());
    }

    private refreshDocument(document: vscode.TextDocument): void {
        if (document.languageId !== 'bnd') {
            return;
        }

        this.diagnostics.set(document.uri, parseBndDocument(document).diagnostics);
    }
}

class BndCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
        const line = document.lineAt(position.line).text;
        const prefix = line.slice(0, position.character);
        if (prefix.includes(':') || prefix.includes('=')) {
            return [];
        }

        const visiblePrefix = prefix.trimStart();
        const kind = documentKind(document);

        return allBndInstructions()
            .filter((instruction) => appliesToDocument(instruction, kind))
            .filter((instruction) => instruction.key.toLowerCase().startsWith(visiblePrefix.toLowerCase()))
            .map((instruction) => createCompletionItem(instruction));
    }
}

class BndHoverProvider implements vscode.HoverProvider {
    constructor(private readonly workspaceContext: BndWorkspaceContext) {}

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const parsed = parseBndDocument(document);
        const instruction = parsed.instructions.find((entry) => entry.keyRange.contains(position));
        if (!instruction) {
            return undefined;
        }

        const definition = findBndInstruction(instruction.key);
        const markdown = new vscode.MarkdownString(undefined, true);
        markdown.appendMarkdown(`**${instruction.key}**\n\n`);
        if (definition) {
            markdown.appendMarkdown(`*${definition.category}*\n\n${definition.summary}\n\n${definition.detail}`);
            if (definition.example) {
                markdown.appendCodeblock(definition.example, 'bnd');
            }
        } else {
            markdown.appendMarkdown('This appears to be a workspace-defined property or an instruction the extension does not yet model. Its meaning comes from this workspace’s included configuration and build tooling, not from a safe generic assumption.');
        }

        if (instruction.value.trim()) {
            markdown.appendMarkdown('\n\nCurrent value:\n');
            markdown.appendCodeblock(instruction.value, 'bnd');
        }

        const context = await this.workspaceContext.describe(document, instruction.key, instruction.value);
        if (context) {
            markdown.appendMarkdown(`\n\n---\n\n**${context.heading}**\n\n${context.lines.join('\n\n')}`);
        }

        return new vscode.Hover(markdown, instruction.keyRange);
    }
}

class BndAnnotationHoverProvider implements vscode.HoverProvider {
    constructor(private readonly workspaceContext: BndWorkspaceContext) {}

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*(?:\.\w+)*/);
        if (!wordRange || wordRange.start.character === 0 || document.getText(new vscode.Range(wordRange.start.translate(0, -1), wordRange.start)) !== '@') {
            return undefined;
        }

        const annotationName = document.getText(wordRange);
        const context = await this.workspaceContext.describeAnnotation(document, annotationName);
        if (!context) {
            return undefined;
        }

        const markdown = new vscode.MarkdownString(undefined, true);
        markdown.appendMarkdown(`**@${annotationName}**\n\n---\n\n**${context.heading}**\n\n${context.lines.join('\n\n')}`);
        return new vscode.Hover(markdown, wordRange);
    }
}

function createCompletionItem(instruction: BndInstructionDefinition): vscode.CompletionItem {
    const item = new vscode.CompletionItem(instruction.key, vscode.CompletionItemKind.Property);
    item.detail = instruction.summary;
    item.documentation = new vscode.MarkdownString(
        `${instruction.detail}${instruction.example ? `\n\nExample:\n\`\`\`bnd\n${instruction.example}\n\`\`\`` : ''}`
    );
    item.insertText = new vscode.SnippetString(`${instruction.key}: $0`);
    return item;
}

function documentKind(document: vscode.TextDocument): 'bnd' | 'bndrun' {
    return path.extname(document.uri.fsPath).toLowerCase() === '.bndrun' ? 'bndrun' : 'bnd';
}

function appliesToDocument(definition: BndInstructionDefinition, kind: 'bnd' | 'bndrun'): boolean {
    return definition.appliesTo.includes('all') || definition.appliesTo.includes(kind);
}

export function parseBndDocument(document: vscode.TextDocument): ParseResult {
    const instructions: ParsedInstruction[] = [];
    const diagnostics: vscode.Diagnostic[] = [];
    const kind = documentKind(document);
    let currentInstruction: ParsedInstruction | undefined;

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
        const line = document.lineAt(lineIndex);
        const text = line.text;
        const trimmed = text.trim();

        if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            currentInstruction = undefined;
            continue;
        }

        const headerMatch = text.match(HEADER_PATTERN);
        const shorthandIncludeMatch = headerMatch ? undefined : text.match(SHORTHAND_INCLUDE_PATTERN);
        if (headerMatch || shorthandIncludeMatch) {
            const key = (headerMatch ?? shorthandIncludeMatch)![1];
            const operator = headerMatch ? headerMatch[2] as ':' | '=' : ' ';
            const value = headerMatch ? headerMatch[3] : shorthandIncludeMatch![2];
            const keyStart = text.indexOf(key);
            const keyRange = new vscode.Range(lineIndex, keyStart, lineIndex, keyStart + key.length);
            const valueStart = text.indexOf(value, keyStart + key.length + 1);
            const instruction: ParsedInstruction = {
                key,
                normalizedKey: key.toLowerCase(),
                value,
                keyRange,
                fullRange: line.range,
                valueRange: new vscode.Range(lineIndex, Math.max(valueStart, keyRange.end.character), lineIndex, text.length),
                operator
            };
            instructions.push(instruction);
            currentInstruction = instruction;
            continue;
        }

        if (CONTINUATION_PATTERN.test(text) && currentInstruction) {
            currentInstruction = {
                ...currentInstruction,
                value: `${currentInstruction.value}\n${trimmed}`,
                fullRange: new vscode.Range(currentInstruction.fullRange.start, line.range.end),
                valueRange: new vscode.Range(currentInstruction.valueRange.start, line.range.end)
            };
            instructions[instructions.length - 1] = currentInstruction;
            continue;
        }

        diagnostics.push(
            new vscode.Diagnostic(
                line.range,
                'This line is not a recognized bnd property assignment or continuation.',
                vscode.DiagnosticSeverity.Warning
            )
        );
        currentInstruction = undefined;
    }

    addInstructionDiagnostics(document, kind, instructions, diagnostics);
    return { instructions, diagnostics };
}

function addInstructionDiagnostics(
    document: vscode.TextDocument,
    kind: 'bnd' | 'bndrun',
    instructions: ParsedInstruction[],
    diagnostics: vscode.Diagnostic[]
): void {
    const grouped = new Map<string, ParsedInstruction[]>();

    for (const instruction of instructions) {
        const entries = grouped.get(instruction.normalizedKey) ?? [];
        entries.push(instruction);
        grouped.set(instruction.normalizedKey, entries);

        const definition = findBndInstruction(instruction.key);
        if (definition && !appliesToDocument(definition, kind)) {
            diagnostics.push(
                new vscode.Diagnostic(
                    instruction.keyRange,
                    `${instruction.key} is usually used in .${kind === 'bndrun' ? 'bnd' : 'bndrun'} files, not ${path.basename(document.uri.fsPath)}.`,
                    vscode.DiagnosticSeverity.Information
                )
            );
        }

        if (instruction.operator === '=' && instruction.key.startsWith('-')) {
            diagnostics.push(
                new vscode.Diagnostic(
                    instruction.keyRange,
                    'bnd instructions are commonly written with ":" for readability. "=" still parses, but ":" is the usual style.',
                    vscode.DiagnosticSeverity.Information
                )
            );
        }
    }

    for (const entries of grouped.values()) {
        const definition = findBndInstruction(entries[0].key);
        if (!definition?.singleton || entries.length < 2) {
            continue;
        }

        for (const duplicate of entries.slice(1)) {
            diagnostics.push(
                new vscode.Diagnostic(
                    duplicate.keyRange,
                    `${duplicate.key} is typically defined once. Multiple entries can be surprising unless you are intentionally overriding inherited configuration.`,
                    vscode.DiagnosticSeverity.Warning
                )
            );
        }
    }

    if (kind === 'bndrun') {
        const hasRunRequires = grouped.has('-runrequires');
        const hasRunBundles = grouped.has('-runbundles');

        if (!hasRunRequires && !hasRunBundles) {
            diagnostics.push(
                new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    'This .bndrun file does not declare -runrequires or -runbundles yet, so it may not be runnable or resolvable.',
                    vscode.DiagnosticSeverity.Information
                )
            );
        }
    }
}
