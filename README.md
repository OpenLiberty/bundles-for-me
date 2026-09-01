# Bnd Support

Bnd Support is a lightweight IBM Bob and VS Code extension for working with
bnd and OSGi workspaces. It provides editor support and convenient commands
for the existing `bnd` command-line tool.

## Features

- Recognizes bnd workspaces and projects
- Adds syntax highlighting for `.bnd` and `.bndrun` files
- Adds a bundle badge to `.bnd` descriptors and `.bndrun` runtime files
- Adds a Bnd Hub Activity Bar view that groups descriptors by their package paths
- Adds an interactive Bundle Graph for workspace projects
- Builds workspaces and projects
- Resolves and runs `.bndrun` files
- Shows bnd command output in the `Bnd` output channel

### Bundle Graph (New in 0.1.0)

Open **Bnd: Show Bundle Graph** from a project's `bnd.bnd` context menu or the
Command Palette to explore its local bundle wiring.

- Choose one or more input bundles from an available-bundles list
- Add direct dependencies or dependants to the input selection
- Trace dependency, dependant, or bidirectional relationships in a layered graph
- Limit the graph to one, two, three, or all reachable hops to keep large workspaces readable
- Filter mandatory and optional package dependencies, with dashed edges indicating optional wiring
- Zoom the graph and inspect full bundle identities from the list or graph tooltips

The initial graph is derived from direct `Import-Package` and `Export-Package`
declarations in workspace `bnd.bnd` files. It does not yet include resolved
repository bundles or properties inherited through `-include`.

## Install

Download the latest `.vsix` file from this repository's Releases page.

In IBM Bob or VS Code, open the Extensions view, select the `...` menu, choose
**Install from VSIX...**, and select the downloaded file. Reload the window
when prompted.

## Requirements

The `bnd` CLI must be installed and available on your `PATH`. If it is in a
different location, set `bnd.cliPath` in your editor settings.

## Commands

Use the Command Palette, file context menu, or `.bndrun` CodeLens to run:

- `Bnd: Build Workspace`
- `Bnd: Build Project`
- `Bnd: Clean`
- `Bnd: Resolve`
- `Bnd: Run`
- `Bnd: Show Project Information`
- `Bnd: Show Bundle Graph`

## Build From Source

```bash
npm install
npm run package
```

The package command creates an installable `.vsix` file in the project root.
