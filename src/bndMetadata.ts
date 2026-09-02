export interface BndInstructionDefinition {
    readonly key: string;
    readonly appliesTo: ReadonlyArray<'bnd' | 'bndrun' | 'all'>;
    readonly summary: string;
    readonly detail: string;
    readonly example?: string;
    readonly singleton?: boolean;
}

const instructions: BndInstructionDefinition[] = [
    {
        key: 'Bundle-Name',
        appliesTo: ['bnd'],
        summary: 'Human-readable bundle display name.',
        detail: 'Sets the friendly name shown for the bundle in UIs and reports.',
        example: 'Bundle-Name: Example :: Web',
        singleton: true
    },
    {
        key: 'Bundle-SymbolicName',
        appliesTo: ['bnd'],
        summary: 'Stable OSGi identity for the bundle.',
        detail: 'This is the primary bundle identifier used by the framework and resolver.',
        example: 'Bundle-SymbolicName: com.example.web',
        singleton: true
    },
    {
        key: 'Bundle-Version',
        appliesTo: ['bnd'],
        summary: 'Bundle version, often macro-driven.',
        detail: 'Controls the bundle version recorded in the generated manifest and used for resolution.',
        example: 'Bundle-Version: 1.0.0.${tstamp}',
        singleton: true
    },
    {
        key: 'Bundle-Description',
        appliesTo: ['bnd'],
        summary: 'Short description of the bundle.',
        detail: 'Adds descriptive manifest metadata for humans reading the bundle.',
        example: 'Bundle-Description: HTTP Whiteboard bundle.'
    },
    {
        key: 'Export-Package',
        appliesTo: ['bnd'],
        summary: 'Packages this bundle makes available to other bundles.',
        detail: 'Exported packages define the public API surface other bundles may import.',
        example: 'Export-Package: com.example.api.catalog;version="1.0.0"'
    },
    {
        key: 'Private-Package',
        appliesTo: ['bnd'],
        summary: 'Packages included in the bundle but not exported.',
        detail: 'Use this for implementation packages that should stay internal to the bundle.',
        example: 'Private-Package: com.example.web.resource'
    },
    {
        key: 'Import-Package',
        appliesTo: ['bnd'],
        summary: 'Package imports expected from other bundles at runtime.',
        detail: 'Imports are matched by the resolver against exporting bundles and version ranges.',
        example: 'Import-Package: org.slf4j;version="[2.0,3)"'
    },
    {
        key: '-buildpath',
        appliesTo: ['bnd'],
        summary: 'Bundles and artifacts available at compile time.',
        detail: 'This controls what Java compilation and bundle analysis can see during the build.',
        example: "-buildpath: osgi.core;version='[8.0.0,9.0.0)'"
    },
    {
        key: '-buildpath.shared',
        appliesTo: ['bnd'],
        summary: 'Workspace-level shared compile-time dependencies.',
        detail: 'Common build path fragments can be defined once in workspace configuration and inherited by projects.',
        example: "-buildpath.shared: osgi.annotation;version='[8.1.0,9.0.0)'"
    },
    {
        key: '-dsannotations',
        appliesTo: ['bnd'],
        summary: 'Enables Declarative Services annotation processing.',
        detail: 'bnd scans matching classes for DS annotations and generates component metadata.',
        example: '-dsannotations: *',
        singleton: true
    },
    {
        key: '-baseline',
        appliesTo: ['bnd'],
        summary: 'Checks semantic versioning for exported packages.',
        detail: 'Useful for API stability enforcement across bundle releases.',
        example: '-baseline: *',
        singleton: true
    },
    {
        key: '-reproducible',
        appliesTo: ['bnd'],
        summary: 'Enables reproducible bundle output.',
        detail: 'Helps keep generated artifacts deterministic across builds.',
        example: '-reproducible: true',
        singleton: true
    },
    {
        key: '-noextraheaders',
        appliesTo: ['bnd'],
        summary: 'Suppresses extra generated manifest headers.',
        detail: 'Useful when you want leaner, more deterministic manifests.',
        example: '-noextraheaders: true',
        singleton: true
    },
    {
        key: 'javac.source',
        appliesTo: ['bnd'],
        summary: 'Java source compatibility level.',
        detail: 'Configures the source language level used during compilation.',
        example: 'javac.source: 21',
        singleton: true
    },
    {
        key: 'javac.target',
        appliesTo: ['bnd'],
        summary: 'Java bytecode target level.',
        detail: 'Controls the target bytecode version produced by compilation.',
        example: 'javac.target: 21',
        singleton: true
    },
    {
        key: 'src',
        appliesTo: ['bnd'],
        summary: 'Primary source directory.',
        detail: 'Defines where bnd should look for project source files.',
        example: 'src: src',
        singleton: true
    },
    {
        key: 'bin',
        appliesTo: ['bnd'],
        summary: 'Primary compiled output directory.',
        detail: 'Defines where class files are written before packaging.',
        example: 'bin: bin/main',
        singleton: true
    },
    {
        key: 'target-dir',
        appliesTo: ['bnd'],
        summary: 'Generated output directory.',
        detail: 'Where generated jars and build artifacts are placed.',
        example: 'target-dir: generated',
        singleton: true
    },
    {
        key: '-runfw',
        appliesTo: ['bndrun'],
        summary: 'Selected OSGi framework implementation.',
        detail: 'Specifies which framework bundle should boot the runtime.',
        example: "-runfw: org.apache.felix.framework;version='[7.0.5,8.0.0)'",
        singleton: true
    },
    {
        key: '-runvm',
        appliesTo: ['bndrun'],
        summary: 'VM arguments used when launching the runtime.',
        detail: 'Useful for assertions, memory limits, encoding, and system properties.',
        example: '-runvm: -ea, -Xmx256m',
        singleton: true
    },
    {
        key: '-runsystempackages',
        appliesTo: ['bndrun'],
        summary: 'Packages exposed from the JVM into the framework.',
        detail: 'Lets the runtime treat selected JRE packages as available system exports.',
        example: '-runsystempackages: sun.misc'
    },
    {
        key: '-runproperties',
        appliesTo: ['bndrun'],
        summary: 'Framework properties set at launch time.',
        detail: 'Provides runtime configuration values consumed by bundles and services.',
        example: '-runproperties: org.osgi.service.http.port = 8080'
    },
    {
        key: '-runpath',
        appliesTo: ['bndrun'],
        summary: 'Extra launcher path entries needed before resolution output.',
        detail: 'Often used for launcher helpers or bootstrap bundles such as configurators.',
        example: "-runpath: org.apache.felix.configurator;version='[1.0.14,2.0.0)'"
    },
    {
        key: '-runinitialprops',
        appliesTo: ['bndrun'],
        summary: 'Initial properties available to the launcher.',
        detail: 'Useful for startup-time wiring such as external config file locations.',
        example: '-runinitialprops: configurator.initial = ${fileuri;${.}/launch.json}'
    },
    {
        key: '-runrequires',
        appliesTo: ['bndrun'],
        summary: 'Initial requirements resolved into runnable bundles.',
        detail: 'This is the declarative runtime intent from which bnd computes the bundle closure.',
        example: "-runrequires: osgi.identity;filter:='(osgi.identity=com.example.web)'"
    },
    {
        key: '-runbundles',
        appliesTo: ['bndrun'],
        summary: 'Concrete bundles installed into the runtime.',
        detail: 'Usually generated from resolution and should match your requirements and repositories.',
        example: "-runbundles: com.example.web;version='[1.0.0,1.0.1)'"
    },
    {
        key: '-runrepos',
        appliesTo: ['bndrun'],
        summary: 'Repositories available during runtime resolution.',
        detail: 'Limits or orders the repositories the resolver should consult for this launch.',
        example: '-runrepos: Workspace, OSGiR7',
        singleton: true
    }
];

const instructionsByKey = new Map(instructions.map((instruction) => [instruction.key.toLowerCase(), instruction]));

export function allBndInstructions(): readonly BndInstructionDefinition[] {
    return instructions;
}

export function findBndInstruction(key: string): BndInstructionDefinition | undefined {
    return instructionsByKey.get(key.toLowerCase());
}
