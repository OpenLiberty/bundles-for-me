# Bnd Support

Bnd Support is a lightweight IBM Bob and VS Code extension for working with
bnd and OSGi workspaces. It provides editor support and convenient commands
for the existing `bnd` command-line tool.

## Features

- Recognizes bnd workspaces and projects
- Adds syntax highlighting for `.bnd` and `.bndrun` files
- Adds a bundle badge to `.bnd` descriptors and `.bndrun` runtime files
- Builds workspaces and projects
- Resolves and runs `.bndrun` files
- Shows bnd command output in the `Bnd` output channel

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

## Build From Source

```bash
npm install
npm run package
```

The package command creates an installable `.vsix` file in the project root.
