import * as path from 'path';

export type AnnotationFamily = 'Declarative Services' | 'OSGi Metatype' | 'CDI';

export interface TextSource {
    readonly path: string;
    readonly text: string;
}

export interface AnnotationUse {
    readonly qualifiedName: string;
    readonly className?: string;
}

export interface AnnotationDirectiveEvidence {
    readonly familyUseCount: number;
    readonly familyClassCount: number;
    readonly configuredClasses: readonly string[];
    readonly configuredFamilyUseCount: number;
    readonly projectSpecificAnnotations: readonly string[];
}

/** Parse the property subset needed by hover analysis without running bnd. */
export function propertiesIn(text: string): ReadonlyMap<string, string> {
    const lines = text.split(/\r?\n/);
    const properties = new Map<string, string>();
    let currentKey: string | undefined;
    for (const line of lines) {
        const match = line.match(/^\s*([-A-Za-z0-9_.]+)\s*[:=]\s*(.*)$/)
            ?? line.match(/^\s*(-include)\s+(.+)$/i);
        if (match) {
            currentKey = match[1].toLowerCase();
            properties.set(currentKey, match[2]);
        } else if (currentKey !== undefined && /^\s+/.test(line)) {
            properties.set(currentKey, `${properties.get(currentKey)}\n${line.trim()}`);
        } else if (line.trim().length > 0 && !line.trimStart().match(/^[#!]/)) {
            currentKey = undefined;
        }
    }
    return properties;
}

export function propertyValue(text: string, requestedKey: string): string | undefined {
    return propertiesIn(text).get(requestedKey.toLowerCase());
}

/** Split bnd clauses while preserving commas inside quotes, macros, and braces. */
export function splitBndList(value: string): string[] {
    return splitTopLevel(value, ',');
}

function splitTopLevel(value: string, delimiter: ',' | ';'): string[] {
    const entries: string[] = [];
    let start = 0;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    let macroDepth = 0;
    let braceDepth = 0;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === '\\') {
            escaped = true;
            continue;
        }
        if (quote) {
            if (character === quote) {
                quote = undefined;
            }
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '$' && value[index + 1] === '{') {
            macroDepth += 1;
            index += 1;
            continue;
        }
        if (character === '{') {
            braceDepth += 1;
            continue;
        }
        if (character === '}' && macroDepth > 0) {
            macroDepth -= 1;
            continue;
        }
        if (character === '}' && braceDepth > 0) {
            braceDepth -= 1;
            continue;
        }
        if (character === delimiter && macroDepth === 0 && braceDepth === 0) {
            entries.push(value.slice(start, index));
            start = index + 1;
        }
    }
    entries.push(value.slice(start));
    return entries;
}

export function packagesFromValue(value: string): string[] {
    return splitBndList(value)
        .map((entry) => entry.replace(/\\\s*\r?\n\s*/g, '').trim().replace(/\\$/, '').trim())
        .map((entry) => splitTopLevel(entry, ';')[0].trim())
        .filter((entry) => entry.length > 0 && entry !== '\\' && !entry.includes('${'));
}

export function classEntries(value: string): string[] {
    return packagesFromValue(value).filter((entry) =>
        !entry.startsWith('!')
        && /^(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*$/.test(entry)
    );
}

export function analyzeAnnotationDirective(
    value: string,
    family: AnnotationFamily,
    sources: readonly TextSource[]
): AnnotationDirectiveEvidence {
    const uses = sources.flatMap(annotationUsesIn);
    const familyUses = uses.filter((use) => annotationFamily(use.qualifiedName) === family);
    const configuredClasses = classEntries(value);
    const configuredClassUses = configuredClasses.length > 0
        ? sources
            .filter((source) => configuredClasses.some((className) => declaredTypesIn(source).includes(className)))
            .flatMap(annotationUsesIn)
        : familyUses;
    return {
        familyUseCount: familyUses.length,
        familyClassCount: new Set(familyUses.map((use) => use.className).filter(Boolean)).size,
        configuredClasses,
        configuredFamilyUseCount: configuredClassUses.filter((use) => annotationFamily(use.qualifiedName) === family).length,
        projectSpecificAnnotations: [...new Set(
            configuredClassUses
                .filter((use) => !annotationFamily(use.qualifiedName))
                .map((use) => use.qualifiedName)
        )]
    };
}

export function annotationUsesIn(source: TextSource): AnnotationUse[] {
    const code = maskJavaCommentsAndStrings(source.text);
    const packageName = sourcePackage(code);
    const className = code.match(/\b(?:class|interface|enum|record)\s+(\w+)/)?.[1];
    const fullyQualifiedClass = packageName && className ? `${packageName}.${className}` : undefined;
    const imports = new Map<string, string>();
    const wildcardImports: string[] = [];
    for (const match of code.matchAll(/^\s*import\s+([\w.*]+)\s*;/gm)) {
        const imported = match[1];
        if (imported.endsWith('.*')) {
            wildcardImports.push(imported.slice(0, -2));
        } else {
            imports.set(imported.slice(imported.lastIndexOf('.') + 1), imported);
        }
    }

    const uses: AnnotationUse[] = [];
    for (const match of code.matchAll(/@([A-Za-z_]\w*(?:\.\w+)*)\b/g)) {
        if (match[1] === 'interface') {
            continue;
        }
        uses.push({
            qualifiedName: resolveAnnotationName(match[1], imports, wildcardImports),
            className: fullyQualifiedClass
        });
    }
    return uses;
}

export function declaredTypesIn(source: TextSource): string[] {
    const code = maskJavaCommentsAndStrings(source.text);
    const packageName = sourcePackage(code);
    if (!packageName) {
        return [];
    }
    return [...code.matchAll(/\b(?:class|interface|enum|record|@interface)\s+(\w+)/g)]
        .map((match) => `${packageName}.${match[1]}`);
}

export function sourcePackage(text: string): string | undefined {
    return text.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
}

export function annotationFamily(qualifiedName: string): AnnotationFamily | undefined {
    if (qualifiedName.startsWith('org.osgi.service.component.annotations.')) {
        return 'Declarative Services';
    }
    if (qualifiedName.startsWith('org.osgi.service.metatype.annotations.')) {
        return 'OSGi Metatype';
    }
    if (/^(jakarta|javax)\.(enterprise|inject|decorator|interceptor)\./.test(qualifiedName)) {
        return 'CDI';
    }
    return undefined;
}

/**
 * Resolve only stable local bnd macros. Dynamic macros remain unresolved so a
 * hover never claims to understand a build-time conditional.
 */
export function localIncludePath(entry: string, descriptorPath: string, workspacePath?: string): string | undefined {
    let candidate = entry.trim().replace(/^[~-]+/, '').trim();
    if (!candidate || candidate.startsWith('jar:') || candidate.includes('!')) {
        return undefined;
    }
    const descriptorDirectory = path.dirname(descriptorPath);
    candidate = candidate.replace(/\$\{\.\}/g, '.');
    candidate = candidate.replace(/\$\{project\}/g, descriptorDirectory);
    if (workspacePath) {
        candidate = candidate.replace(/\$\{workspace\}/g, workspacePath);
    }
    if (candidate.includes('${')) {
        return undefined;
    }
    return path.resolve(descriptorDirectory, candidate);
}

/** Match the conventional and nested source layouts seen in bnd and Maven projects. */
export function sourcesForDescriptor(descriptorPath: string, sources: readonly TextSource[]): TextSource[] {
    const sourceRoot = `${path.dirname(descriptorPath)}${path.sep}src${path.sep}`;
    return sources.filter((source) => source.path.startsWith(sourceRoot));
}

function resolveAnnotationName(name: string, imports: ReadonlyMap<string, string>, wildcardImports: readonly string[]): string {
    if (name.includes('.')) {
        return name;
    }
    const explicit = imports.get(name);
    if (explicit) {
        return explicit;
    }
    const knownFamilyImport = wildcardImports.find((importedPackage) =>
        importedPackage === 'org.osgi.service.component.annotations'
        || importedPackage === 'org.osgi.service.metatype.annotations'
        || /^(jakarta|javax)\.(enterprise|inject|decorator|interceptor)(\.|$)/.test(importedPackage)
    );
    return knownFamilyImport ? `${knownFamilyImport}.${name}` : name;
}

function maskJavaCommentsAndStrings(text: string): string {
    let result = '';
    let state: 'code' | 'line-comment' | 'block-comment' | 'string' | 'character' | 'text-block' = 'code';
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];
        const nextTwo = text.slice(index, index + 3);
        if (state === 'code') {
            if (character === '/' && next === '/') {
                state = 'line-comment';
                result += '  ';
                index += 1;
            } else if (character === '/' && next === '*') {
                state = 'block-comment';
                result += '  ';
                index += 1;
            } else if (nextTwo === '"""') {
                state = 'text-block';
                result += '   ';
                index += 2;
            } else if (character === '"') {
                state = 'string';
                result += ' ';
            } else if (character === "'") {
                state = 'character';
                result += ' ';
            } else {
                result += character;
            }
        } else if (state === 'line-comment') {
            result += character === '\n' ? '\n' : ' ';
            if (character === '\n') {
                state = 'code';
            }
        } else if (state === 'block-comment') {
            if (character === '*' && next === '/') {
                result += '  ';
                index += 1;
                state = 'code';
            } else {
                result += character === '\n' ? '\n' : ' ';
            }
        } else if (state === 'text-block') {
            if (nextTwo === '"""') {
                result += '   ';
                index += 2;
                state = 'code';
            } else {
                result += character === '\n' ? '\n' : ' ';
            }
        } else {
            const delimiter = state === 'string' ? '"' : "'";
            if (character === '\\' && next !== undefined) {
                result += next === '\n' ? ' \n' : '  ';
                index += 1;
            } else if (character === delimiter) {
                result += ' ';
                state = 'code';
            } else {
                result += character === '\n' ? '\n' : ' ';
            }
        }
    }
    return result;
}
