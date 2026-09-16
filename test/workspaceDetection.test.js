const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const detection = require('../out/workspaceDetection');

function makeTempWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'bnd-workspace-detection-'));
}

function writeFile(filePath, contents = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}

test('finds a bnd workspace from a nested project file', async () => {
    const root = makeTempWorkspace();
    const source = path.join(root, 'example.bundle', 'src', 'Example.java');
    writeFile(path.join(root, 'cnf', 'build.bnd'));
    writeFile(path.join(root, 'example.bundle', 'bnd.bnd'));
    writeFile(source);

    assert.equal(await detection.findWorkspaceRoot(source), root);
});

test('finds the nearest bnd.bnd project inside a workspace', async () => {
    const root = makeTempWorkspace();
    const project = path.join(root, 'example.bundle');
    const source = path.join(project, 'src', 'Example.java');
    writeFile(path.join(root, 'cnf', 'build.bnd'));
    writeFile(path.join(project, 'bnd.bnd'));
    writeFile(source);

    assert.equal(await detection.findProjectRoot(source), project);
});

test('does not cross above a bnd workspace to find an unrelated parent project', async () => {
    const root = makeTempWorkspace();
    const workspace = path.join(root, 'workspace');
    const source = path.join(workspace, 'src', 'Example.java');
    writeFile(path.join(root, 'bnd.bnd'));
    writeFile(path.join(workspace, 'cnf', 'build.bnd'));
    writeFile(source);

    assert.equal(await detection.findProjectRoot(source), undefined);
});

test('does not treat a differently named standalone bnd file as a workspace project', async () => {
    const root = makeTempWorkspace();
    const descriptor = path.join(root, 'spell.english.bnd');
    writeFile(descriptor);

    assert.equal(await detection.findWorkspaceRoot(descriptor), undefined);
    assert.equal(await detection.findProjectRoot(descriptor), undefined);
});

test('returns undefined for paths that no longer exist', async () => {
    const root = makeTempWorkspace();
    const missing = path.join(root, 'deleted', 'bnd.bnd');

    assert.equal(await detection.findWorkspaceRoot(missing), undefined);
    assert.equal(await detection.findProjectRoot(missing), undefined);
});
