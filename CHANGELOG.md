# Changelog

All notable changes to Bnd Support are documented in this file.

The project history preserved in this repository begins with version `0.0.2`.
Versions `0.0.3` through `0.0.7` and `0.0.9` through `0.0.10` were development
builds without separately recorded release notes.

## [Unreleased]

## [0.1.3] - 2026-09-08

### Added

- Two-way annotation context: bnd annotation directives now identify configured classes and detected source annotations, while Java annotation hovers identify the nearest bnd descriptor and related processing directive.
- Generic support for project-specific annotations on classes explicitly named by `-dsannotations`, `-metatypeannotations`, or `-cdiannotations`, without treating them as standard OSGi annotations.
- Deferred source indexing so annotation evidence is collected only for hovers that need it.
- An offline, provenance-recorded tooltip corpus based on bndtools/bnd, Apache Felix, and Apache Aries, with automated coverage for workspace, Maven, nested Ant, DS, Metatype, and CDI patterns.
- Pure tooltip-analysis helpers and regression tests for quoted or macro-contained commas, wildcard annotation imports, Java comment/string false positives, conventional source layouts, and shorthand includes.

### Fixed

- Local `-include` context now resolves stable `${workspace}`, `${project}`, and `${.}` paths while leaving dynamic macros explicitly unresolved.
- Package and instruction clause analysis no longer splits on commas inside quoted ranges or nested macros.
- Annotation inventories ignore annotation-like text in Java comments and strings and recognize known OSGi/CDI wildcard imports.

## [0.1.2] - 2026-09-03

### Added
- Contextual bnd hovers for `-dsannotations`, `Private-Package`, `Export-Package`, and `Bundle-SymbolicName`, including detected DS annotations, API consumers, private-package boundary leaks, and `.bndrun` assembly references.
- Lightweight workspace indexing of bnd descriptors, runnable definitions, and Java sources to explain configuration using local project evidence.
- Configuration-inheritance hovers that resolve readable local `-include` files, identify local declarations, and flag macro-, JAR-, or optional includes the extension cannot resolve.
- Instruction categories that distinguish OSGi manifest headers, bnd instructions, and workspace-specific build properties.
- Rich hover documentation for `Bundle-Vendor`, `Bundle-Copyright`, `-include`, `Include-Resource`, `Service-Component`, `-cdiannotations`, `-dsannotations-inherit`, `-metatypeannotations`, `Require-Capability`, `Provide-Capability`, `instrument.disabled`, and `bVersion`.
- Import-Package context that identifies potential workspace exporters without assuming external dependencies are missing.

- Phase 1 editor intelligence for `.bnd` and `.bndrun` files.
- Instruction-aware completion for common bundle, workspace, and runtime headers.
- Hover help that explains what key instructions do and shows example usage.
- Lightweight semantic parsing that supports multi-line instruction values.

### Changed

- Added inline diagnostics for malformed property lines, duplicate singleton
  instructions, and incomplete `.bndrun` launch definitions.
- Replaced the generic "recognized key" hover fallback with an explicit explanation that unsupported properties may be workspace-defined.

## [0.1.0] - 2026-08-31

### Added

- Interactive Bundle Graph for workspace `bnd.bnd` projects.
- Bundle discovery using `Bundle-SymbolicName`, `Import-Package`, and
  `Export-Package` declarations.
- Bndtools-inspired Available bundles and Selected input bundles lists.
- Controls to add or remove input bundles, dependencies, and dependants.
- Layered dependency, dependant, and bidirectional graph modes.
- One-hop, two-hop, three-hop, and all-reachable traversal limits for large
  workspaces.
- Mandatory and optional dependency filtering, with optional edges displayed
  as dashed lines.
- Graph zoom controls, wrapped node labels, and full bundle details in
  tooltips.
- `Bnd: Show Bundle Graph` command, available from the Command Palette, the
  `bnd.bnd` Explorer context menu, and Bnd Hub descriptor entries.

### Documentation

- Added Bundle Graph usage and data-source limitations to the extension page.

### Known Limitations

- The graph currently models direct package declarations in workspace
  descriptors. It does not yet include resolved repository bundles or settings
  inherited through `-include`.

## [0.0.12] - 2026-08-31

### Added

- `TIME TO TRIM` lifecycle banner for every Bnd CLI command.
- Lifecycle name, start state, and completed or failed status bars in the Bnd
  Output channel.

### Changed

- Made Bnd process completion idempotent to avoid duplicate results after a
  launch failure.

## [0.0.11] - 2026-08-31

### Added

- Bnd Hub Activity Bar view for browsing `.bnd` and `.bndrun` files by their
  package paths.
- Hub refresh command and automatic refresh after Bnd file creation or removal.
- Context-menu lifecycle actions in Bnd Hub and Explorer: build workspace,
  build project, clean, resolve, run, and show project information where
  applicable.

### Changed

- Lifecycle commands now use the Bnd file selected from the Hub or Explorer to
  locate the appropriate nested workspace or project root.

## [0.0.8] - 2026-08-31

### Added

- Bnd file decorations for `.bnd` descriptors and `.bndrun` runtime files.
- Bnd Support extension and Activity Bar branding using the bundle icon.

## [0.0.2] - 2026-08-31

### Added

- Bnd workspace and project detection using `cnf/build.bnd` and `bnd.bnd`.
- Bnd language support and syntax highlighting for `.bnd` and `.bndrun` files.
- Bnd CLI configuration through `bnd.cliPath`.
- Commands to build workspaces and projects, clean, resolve and run `.bndrun`
  files, and show project information.
- `.bndrun` editor CodeLens actions for resolve and run.
- Bnd Output channel with streamed CLI output and completion notifications.

## [0.0.1] - Initial Development Release

### Added

- Initial Bnd Support extension prototype, preceding the repository's recorded
  `0.0.2` baseline.
