export interface BndInstructionDefinition {
    readonly key: string;
    readonly appliesTo: ReadonlyArray<'bnd' | 'bndrun' | 'all'>;
    readonly category: 'OSGi manifest header' | 'bnd instruction' | 'workspace build property';
    readonly summary: string;
    readonly detail: string;
    readonly example?: string;
    readonly singleton?: boolean;
}

const instructions: BndInstructionDefinition[] = [
    {
        key: 'Bundle-Name',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Human-readable bundle display name.',
        detail: 'Sets the friendly name shown for the bundle in UIs and reports.',
        example: 'Bundle-Name: Example :: Web',
        singleton: true
    },
    {
        key: 'Bundle-SymbolicName',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Stable OSGi identity for the bundle.',
        detail: 'This is the primary bundle identifier used by the framework and resolver.',
        example: 'Bundle-SymbolicName: com.example.web',
        singleton: true
    },
    {
        key: 'Bundle-Version',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Bundle version, often macro-driven.',
        detail: 'Controls the bundle version recorded in the generated manifest and used for resolution.',
        example: 'Bundle-Version: 1.0.0.${tstamp}',
        singleton: true
    },
    {
        key: 'Bundle-Description',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Short description of the bundle.',
        detail: 'Adds descriptive manifest metadata for humans reading the bundle.',
        example: 'Bundle-Description: HTTP Whiteboard bundle.'
    },
    {
        key: 'Export-Package',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Packages this bundle makes available to other bundles.',
        detail: 'Exported packages define the public API surface other bundles may import.',
        example: 'Export-Package: com.example.api.catalog;version="1.0.0"'
    },
    {
        key: 'Private-Package',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Packages included in the bundle but not exported.',
        detail: 'Use this for implementation packages that should stay internal to the bundle.',
        example: 'Private-Package: com.example.web.resource'
    },
    {
        key: 'Import-Package',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Package imports expected from other bundles at runtime.',
        detail: 'Imports are matched by the resolver against exporting bundles and version ranges.',
        example: 'Import-Package: org.slf4j;version="[2.0,3)"'
    },
    {
        key: '-buildpath',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Bundles and artifacts available at compile time.',
        detail: 'This controls what Java compilation and bundle analysis can see during the build.',
        example: "-buildpath: osgi.core;version='[8.0.0,9.0.0)'"
    },
    {
        key: '-buildpath.shared',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Workspace-level shared compile-time dependencies.',
        detail: 'Common build path fragments can be defined once in workspace configuration and inherited by projects.',
        example: "-buildpath.shared: osgi.annotation;version='[8.1.0,9.0.0)'"
    },
    {
        key: '-dsannotations',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Enables Declarative Services annotation processing.',
        detail: 'bnd scans matching classes for DS annotations and generates component metadata.',
        example: '-dsannotations: *',
        singleton: true
    },
    {
        key: '-baseline',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Checks semantic versioning for exported packages.',
        detail: 'Useful for API stability enforcement across bundle releases.',
        example: '-baseline: *',
        singleton: true
    },
    {
        key: '-reproducible',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Enables reproducible bundle output.',
        detail: 'Helps keep generated artifacts deterministic across builds.',
        example: '-reproducible: true',
        singleton: true
    },
    {
        key: '-noextraheaders',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Suppresses extra generated manifest headers.',
        detail: 'Useful when you want leaner, more deterministic manifests.',
        example: '-noextraheaders: true',
        singleton: true
    },
    {
        key: 'javac.source',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Java source compatibility level.',
        detail: 'Configures the source language level used during compilation.',
        example: 'javac.source: 21',
        singleton: true
    },
    {
        key: 'javac.target',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Java bytecode target level.',
        detail: 'Controls the target bytecode version produced by compilation.',
        example: 'javac.target: 21',
        singleton: true
    },
    {
        key: 'src',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Primary source directory.',
        detail: 'Defines where bnd should look for project source files.',
        example: 'src: src',
        singleton: true
    },
    {
        key: 'bin',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Primary compiled output directory.',
        detail: 'Defines where class files are written before packaging.',
        example: 'bin: bin/main',
        singleton: true
    },
    {
        key: 'target-dir',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Generated output directory.',
        detail: 'Where generated jars and build artifacts are placed.',
        example: 'target-dir: generated',
        singleton: true
    },
    {
        key: '-runfw',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Selected OSGi framework implementation.',
        detail: 'Specifies which framework bundle should boot the runtime.',
        example: "-runfw: org.apache.felix.framework;version='[7.0.5,8.0.0)'",
        singleton: true
    },
    {
        key: '-runvm',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'VM arguments used when launching the runtime.',
        detail: 'Useful for assertions, memory limits, encoding, and system properties.',
        example: '-runvm: -ea, -Xmx256m',
        singleton: true
    },
    {
        key: '-runsystempackages',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Packages exposed from the JVM into the framework.',
        detail: 'Lets the runtime treat selected JRE packages as available system exports.',
        example: '-runsystempackages: sun.misc'
    },
    {
        key: '-runproperties',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Framework properties set at launch time.',
        detail: 'Provides runtime configuration values consumed by bundles and services.',
        example: '-runproperties: org.osgi.service.http.port = 8080'
    },
    {
        key: '-runpath',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Extra launcher path entries needed before resolution output.',
        detail: 'Often used for launcher helpers or bootstrap bundles such as configurators.',
        example: "-runpath: org.apache.felix.configurator;version='[1.0.14,2.0.0)'"
    },
    {
        key: '-runinitialprops',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Initial properties available to the launcher.',
        detail: 'Useful for startup-time wiring such as external config file locations.',
        example: '-runinitialprops: configurator.initial = ${fileuri;${.}/launch.json}'
    },
    {
        key: '-runrequires',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Initial requirements resolved into runnable bundles.',
        detail: 'This is the declarative runtime intent from which bnd computes the bundle closure.',
        example: "-runrequires: osgi.identity;filter:='(osgi.identity=com.example.web)'"
    },
    {
        key: '-runbundles',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Concrete bundles installed into the runtime.',
        detail: 'Usually generated from resolution and should match your requirements and repositories.',
        example: "-runbundles: com.example.web;version='[1.0.0,1.0.1)'"
    },
    {
        key: '-runrepos',
        appliesTo: ['bndrun'],
        category: 'bnd instruction',
        summary: 'Repositories available during runtime resolution.',
        detail: 'Limits or orders the repositories the resolver should consult for this launch.',
        example: '-runrepos: Workspace, OSGiR7',
        singleton: true
    },
    {
        key: 'Bundle-Vendor',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Organization or person identified as the bundle vendor.',
        detail: 'Writes the Bundle-Vendor header into the generated manifest. This is descriptive provenance for users and tooling; it does not control package resolution or service wiring.',
        example: 'Bundle-Vendor: Example Corp',
        singleton: true
    },
    {
        key: 'Bundle-Copyright',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Copyright notice recorded in the bundle manifest.',
        detail: 'Preserves legal or attribution information in the generated artifact. Macros are common when a workspace supplies a build year or release value.',
        example: 'Bundle-Copyright: Copyright (c) ${year} Example Corp',
        singleton: true
    },
    {
        key: '-include',
        appliesTo: ['all'],
        category: 'bnd instruction',
        summary: 'Imports configuration from another bnd or properties file.',
        detail: 'Included properties establish shared defaults such as version policy, imports, repositories, or build behavior. Properties declared in the current descriptor commonly specialize those shared defaults.',
        example: '-include: ~../cnf/resources/bnd/bundle.props',
        singleton: true
    },
    {
        key: 'Include-Resource',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Adds files or resources to the generated bundle.',
        detail: 'Use it to place resources such as META-INF data, service descriptors, or legal notices in the output JAR. It affects bundle contents, not OSGi dependency resolution.',
        example: 'Include-Resource: META-INF=resources/META-INF'
    },
    {
        key: 'Service-Component',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Lists Declarative Services component metadata in the bundle.',
        detail: 'The Service Component Runtime reads these OSGI-INF descriptors to activate components. The entries may be hand-authored XML or generated by -dsannotations.',
        example: 'Service-Component: OSGI-INF/*.xml'
    },
    {
        key: '-cdiannotations',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Enables CDI annotation processing for the bundle.',
        detail: 'This is build-time metadata generation for CDI-aware runtimes. It is distinct from Declarative Services, although a bundle can use both CDI and DS mechanisms.',
        example: '-cdiannotations:'
    },
    {
        key: '-dsannotations-inherit',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Controls inheritance handling during DS annotation processing.',
        detail: 'Use it only with a clear understanding of the component classes and inherited metadata in the bundle. It modifies how -dsannotations is interpreted, so the two settings should be reviewed together.',
        example: '-dsannotations-inherit: true',
        singleton: true
    },
    {
        key: '-metatypeannotations',
        appliesTo: ['bnd'],
        category: 'bnd instruction',
        summary: 'Generates OSGi Metatype metadata from annotated configuration classes.',
        detail: 'The generated metadata describes configuration attributes for administrative tools and Config Admin. It is commonly paired with DS components that consume that configuration.',
        example: '-metatypeannotations: com.example.config.ExampleConfig'
    },
    {
        key: 'Require-Capability',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Declares capabilities this bundle requires from its runtime environment.',
        detail: 'The resolver uses these requirements in addition to package imports. A common example declares the minimum Java execution environment required by the bundle.',
        example: 'Require-Capability: osgi.ee;filter:="(&(osgi.ee=JavaSE)(version=17))"'
    },
    {
        key: 'Provide-Capability',
        appliesTo: ['bnd'],
        category: 'OSGi manifest header',
        summary: 'Advertises a capability other bundles can require.',
        detail: 'Capabilities model non-package contracts such as services, execution environments, or product-specific features. A matching Require-Capability can drive resolver selection.',
        example: 'Provide-Capability: osgi.service;objectClass:List<String>="com.example.Service"'
    },
    {
        key: 'instrument.disabled',
        appliesTo: ['bnd'],
        category: 'workspace build property',
        summary: 'Disables instrumentation in a workspace-specific build pipeline.',
        detail: 'This is not a standard OSGi manifest header or a general bnd instruction. Its effect is defined by build plugins or scripts in the current workspace; inspect its declaration and build conventions before changing it.',
        example: 'instrument.disabled: true',
        singleton: true
    },
    {
        key: 'bVersion',
        appliesTo: ['bnd'],
        category: 'workspace build property',
        summary: 'Workspace-defined version input, usually consumed by macros.',
        detail: 'This property has no universal bnd meaning by itself. It becomes meaningful where macros such as ${bVersion} reference it, often through an inherited Bundle-Version definition.',
        example: 'bVersion: 1.0',
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
