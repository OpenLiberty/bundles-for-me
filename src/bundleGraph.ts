import * as path from 'path';
import * as vscode from 'vscode';
import { findProjectRoot, findWorkspaceRoot } from './workspaceDetection';

const EXCLUDED_DIRECTORIES = new Set(['.git', 'build', 'node_modules', 'out', 'target']);

interface BundleNode {
    id: string;
    name: string;
    descriptor: string;
    exports: string[];
}

interface BundleEdge {
    source: string;
    target: string;
    packages: string[];
    optional: boolean;
}

interface BundleGraph {
    nodes: BundleNode[];
    edges: BundleEdge[];
    selectedId?: string;
    workspaceName: string;
}

interface ImportedPackage {
    name: string;
    optional: boolean;
}

/**
 * Opens a descriptor-derived view of the selected project's local package
 * dependencies. Resolution-aware graphing can be added later without changing
 * the webview protocol.
 */
export async function showBundleGraph(target?: vscode.Uri): Promise<void> {
    const startUri = target ?? vscode.window.activeTextEditor?.document.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!startUri) {
        vscode.window.showErrorMessage('Open a bnd workspace or select a bnd.bnd file first.');
        return;
    }

    const workspaceRoot = await findWorkspaceRoot(startUri.fsPath);
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No bnd workspace (cnf/build.bnd) found for the selected file.');
        return;
    }

    const projectRoot = await findProjectRoot(startUri.fsPath);
    const graph = await buildBundleGraph(vscode.Uri.file(workspaceRoot), projectRoot);
    if (graph.nodes.length === 0) {
        vscode.window.showInformationMessage('No project bnd.bnd descriptors were found in this workspace.');
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'bnd.bundleGraph',
        `Bundle Graph: ${graph.workspaceName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = bundleGraphHtml(graph);
}

async function buildBundleGraph(workspaceRoot: vscode.Uri, selectedProjectRoot?: string): Promise<BundleGraph> {
    const descriptors = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '**/bnd.bnd'),
        new vscode.RelativePattern(workspaceRoot, '**/{.git,build,node_modules,out,target}/**')
    );
    const usableDescriptors = descriptors.filter((uri) => {
        const relativeSegments = path.relative(workspaceRoot.fsPath, uri.fsPath).split(path.sep);
        return !relativeSegments.some((segment) => EXCLUDED_DIRECTORIES.has(segment));
    });
    const parsedBundles = await Promise.all(usableDescriptors.map((uri) => parseBundle(uri)));
    const nodes = parsedBundles.map(({ node }) => node);
    const exporters = new Map<string, BundleNode[]>();

    for (const bundle of parsedBundles) {
        for (const exportedPackage of bundle.node.exports) {
            const bundles = exporters.get(exportedPackage) ?? [];
            bundles.push(bundle.node);
            exporters.set(exportedPackage, bundles);
        }
    }

    const edgeMap = new Map<string, BundleEdge>();
    for (const bundle of parsedBundles) {
        for (const importedPackage of bundle.imports) {
            for (const [exportedPackage, providers] of exporters) {
                if (!packageMatches(exportedPackage, importedPackage.name)) {
                    continue;
                }
                for (const provider of providers) {
                    if (provider.id === bundle.node.id) {
                        continue;
                    }
                    const key = `${bundle.node.id}\u0000${provider.id}`;
                    const edge = edgeMap.get(key) ?? {
                        source: bundle.node.id,
                        target: provider.id,
                        packages: [],
                        optional: true
                    };
                    edge.packages.push(importedPackage.name);
                    edge.optional &&= importedPackage.optional;
                    edgeMap.set(key, edge);
                }
            }
        }
    }

    const selectedDescriptor = selectedProjectRoot && path.join(selectedProjectRoot, 'bnd.bnd');
    return {
        nodes: nodes.sort((left, right) => left.name.localeCompare(right.name)),
        edges: [...edgeMap.values()].map((edge) => ({
            ...edge,
            packages: [...new Set(edge.packages)].sort()
        })),
        selectedId: nodes.find((node) => node.descriptor === selectedDescriptor)?.id,
        workspaceName: path.basename(workspaceRoot.fsPath)
    };
}

async function parseBundle(uri: vscode.Uri): Promise<{ node: BundleNode; imports: ImportedPackage[] }> {
    const properties = parseProperties(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
    const projectName = path.basename(path.dirname(uri.fsPath));
    const symbolicName = clauseName(properties.get('bundle-symbolicname')) || projectName;
    const exports = splitClauses(properties.get('export-package') ?? '')
        .map(clauseName)
        .filter((packageName): packageName is string => Boolean(packageName));
    const imports = splitClauses(properties.get('import-package') ?? '')
        .map((clause) => ({
            name: clauseName(clause),
            optional: /resolution\s*:=\s*optional/i.test(clause)
        }))
        .filter((entry): entry is ImportedPackage => Boolean(entry.name));

    return {
        node: {
            id: uri.toString(),
            name: symbolicName,
            descriptor: uri.fsPath,
            exports
        },
        imports
    };
}

function parseProperties(contents: string): Map<string, string> {
    const properties = new Map<string, string>();
    let pending = '';

    for (const rawLine of contents.replace(/\r/g, '').split('\n')) {
        const line = pending ? `${pending}${rawLine.trimStart()}` : rawLine;
        if (/\\\s*$/.test(line)) {
            pending = line.replace(/\\\s*$/, '');
            continue;
        }
        pending = '';
        if (/^\s*(#|!|$)/.test(line)) {
            continue;
        }
        const match = line.match(/^\s*([^:=\s]+)\s*[:=]\s*(.*)$/);
        if (match) {
            properties.set(match[1].toLowerCase(), match[2].trim());
        }
    }

    return properties;
}

function splitClauses(value: string): string[] {
    const clauses: string[] = [];
    let current = '';
    let quoted = false;

    for (const character of value) {
        if (character === '"') {
            quoted = !quoted;
        }
        if (character === ',' && !quoted) {
            clauses.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    if (current) {
        clauses.push(current);
    }
    return clauses;
}

function clauseName(clause: string | undefined): string | undefined {
    const name = clause?.split(';', 1)[0].trim();
    return name && !name.startsWith('!') && name !== '*' ? name : undefined;
}

function packageMatches(exportedPackage: string, importedPackage: string): boolean {
    return exportedPackage === importedPackage
        || (exportedPackage.endsWith('.*') && importedPackage.startsWith(exportedPackage.slice(0, -1)));
}

function bundleGraphHtmlLegacy(graph: BundleGraph): string {
    const graphData = JSON.stringify(graph).replace(/</g, '\\u003c');
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    :root { color-scheme: dark; --ink: #e6e2d9; --muted: #a59e91; --canvas: #171916; --panel: #20231f; --line: #454a42; --accent: #f6c344; --node: #2b302a; --selected: #e09b25; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 13px Georgia, 'Times New Roman', serif; color: var(--ink); background: radial-gradient(circle at top right, #3c3a1c 0, transparent 34%), var(--canvas); }
    header { display: flex; align-items: baseline; gap: 14px; padding: 18px 22px 14px; border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: 25px; letter-spacing: .02em; color: var(--accent); } .subtitle { color: var(--muted); }
    main { display: grid; grid-template-columns: 270px minmax(0, 1fr); min-height: calc(100vh - 62px); }
    aside { padding: 16px; background: color-mix(in srgb, var(--panel) 92%, transparent); border-right: 1px solid var(--line); }
    label { display: block; margin: 12px 0 5px; color: var(--muted); font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: .08em; }
    input, select { width: 100%; border: 1px solid #61685d; border-radius: 4px; color: var(--ink); background: #151713; padding: 7px; }
    #bundles { margin-top: 12px; max-height: calc(100vh - 270px); overflow: auto; border-top: 1px solid var(--line); }
    button.bundle { display: block; width: 100%; padding: 9px 4px; text-align: left; color: var(--ink); background: none; border: 0; border-bottom: 1px solid #353a33; cursor: pointer; font: inherit; }
    button.bundle:hover, button.bundle.active { color: var(--accent); background: #303226; }
    #graph { min-height: 540px; width: 100%; overflow: auto; padding: 18px; }
    svg { width: 100%; min-width: 760px; min-height: 600px; background: linear-gradient(135deg, rgba(255,255,255,.018) 25%, transparent 25%) 0 0 / 22px 22px; border: 1px solid var(--line); border-radius: 8px; }
    .edge { stroke: #899080; stroke-width: 1.4; fill: none; marker-end: url(#arrow); } .edge.optional { stroke-dasharray: 6 5; }
    .node rect { fill: var(--node); stroke: #777e70; stroke-width: 1.3; rx: 7; } .node.selected rect { stroke: var(--selected); stroke-width: 3; fill: #443917; }
    .node text { fill: var(--ink); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; pointer-events: none; } .node { cursor: pointer; }
    #empty { color: var(--muted); padding: 60px; text-align: center; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid var(--line); } #bundles { max-height: 160px; } }
</style>
</head>
<body>
<header><h1>Bundle Graph</h1><span class="subtitle">Direct package wiring from workspace descriptors</span></header>
<main>
<aside>
  <label for="filter">Bundles</label><input id="filter" placeholder="Filter by symbolic name">
  <label for="mode">Display</label><select id="mode"><option value="dependencies">Selected + dependencies</option><option value="dependants">Selected + dependants</option><option value="both">Selected + both</option></select>
  <label for="edge-filter">Dependencies</label><select id="edge-filter"><option value="all">All (mandatory + optional)</option><option value="mandatory">Mandatory only</option><option value="optional">Optional only</option></select>
  <div id="bundles"></div>
</aside>
<section id="graph"></section>
</main>
<script>
const graph = ${graphData};
let selectedId = graph.selectedId || graph.nodes[0]?.id;
const filter = document.getElementById('filter'); const mode = document.getElementById('mode'); const edgeFilter = document.getElementById('edge-filter');
function eligibleEdges() { return graph.edges.filter(edge => edgeFilter.value === 'all' || (edgeFilter.value === 'optional' ? edge.optional : !edge.optional)); }
function visibleGraph() {
  const edges = eligibleEdges(); const visible = new Set([selectedId]); const queue = [selectedId];
  while (queue.length) { const current = queue.shift(); for (const edge of edges) { const forward = mode.value !== 'dependants' && edge.source === current ? edge.target : undefined; const backward = mode.value !== 'dependencies' && edge.target === current ? edge.source : undefined; for (const next of [forward, backward]) if (next && !visible.has(next)) { visible.add(next); queue.push(next); } } }
  return { nodes: graph.nodes.filter(node => visible.has(node.id)), edges: edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)) };
}
function esc(value) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderList() { const query = filter.value.toLowerCase(); const list = document.getElementById('bundles'); list.innerHTML = graph.nodes.filter(n => n.name.toLowerCase().includes(query)).map(n => '<button class="bundle ' + (n.id === selectedId ? 'active' : '') + '" data-id="' + esc(n.id) + '">' + esc(n.name) + '</button>').join(''); list.querySelectorAll('button').forEach(button => button.onclick = () => { selectedId = button.dataset.id; render(); }); }
function renderGraph() {
  const container = document.getElementById('graph'); const data = visibleGraph(); if (!data.nodes.length) { container.innerHTML = '<div id="empty">Select a bundle to explore its workspace dependencies.</div>'; return; }
  const width = Math.max(800, Math.ceil(Math.sqrt(data.nodes.length)) * 220); const height = Math.max(600, Math.ceil(data.nodes.length / 4) * 155);
  const columns = Math.max(3, Math.floor(width / 210)); const positions = new Map(data.nodes.map((node, index) => [node.id, { x: 115 + (index % columns) * (width - 230) / Math.max(1, columns - 1), y: 90 + Math.floor(index / columns) * 130 }]));
  const defs = '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#899080"/></marker></defs>';
  const edges = data.edges.map(edge => { const a = positions.get(edge.source), b = positions.get(edge.target); return '<path class="edge ' + (edge.optional ? 'optional' : '') + '" d="M' + (a.x + 74) + ',' + (a.y + 20) + ' L' + (b.x - 74) + ',' + (b.y + 20) + '"><title>' + esc(edge.packages.join(', ')) + '</title></path>'; }).join('');
  const nodes = data.nodes.map(node => { const p = positions.get(node.id); const label = node.name.length > 21 ? node.name.slice(0, 20) + '...' : node.name; return '<g class="node ' + (node.id === selectedId ? 'selected' : '') + '" data-id="' + esc(node.id) + '" transform="translate(' + (p.x - 78) + ' ' + p.y + ')"><rect width="156" height="42"/><text x="10" y="25">' + esc(label) + '</text><title>' + esc(node.name + ' - ' + node.descriptor) + '</title></g>'; }).join('');
  container.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Bundle dependency graph">' + defs + edges + nodes + '</svg>';
  container.querySelectorAll('.node').forEach(node => node.onclick = () => { selectedId = node.dataset.id; render(); });
}
function render() { renderList(); renderGraph(); } filter.oninput = renderList; mode.onchange = renderGraph; edgeFilter.onchange = renderGraph; render();
</script>
</body></html>`;
}

function bundleGraphHtml(graph: BundleGraph): string {
    const graphData = JSON.stringify(graph).replace(/</g, '\\u003c');
    return /* html */ `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root{color-scheme:dark;--ink:var(--vscode-foreground,#ddd);--muted:var(--vscode-descriptionForeground,#999);--bg:var(--vscode-editor-background,#1e1e1e);--panel:var(--vscode-sideBar-background,#252526);--line:var(--vscode-panel-border,#454545);--accent:var(--vscode-focusBorder,#3794ff);--node:var(--vscode-editorWidget-background,#2d2d30)}
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--bg);font:var(--vscode-font-size,13px) var(--vscode-font-family,sans-serif)}header{display:flex;gap:12px;align-items:baseline;padding:14px 18px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:18px}.muted{color:var(--muted);font-size:12px}
#setup{display:grid;grid-template-columns:minmax(250px,1fr) 118px minmax(250px,1fr);gap:14px;padding:15px 18px;background:var(--panel);border-bottom:1px solid var(--line)}.label{display:flex;justify-content:space-between;margin-bottom:7px;color:var(--muted);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}input,select,button{font:inherit}input,select{width:100%;padding:6px 8px;color:var(--ink);background:var(--vscode-input-background,#3c3c3c);border:1px solid var(--vscode-input-border,var(--line));border-radius:3px}.list{height:145px;margin-top:8px;overflow:auto;border:1px solid var(--line);background:var(--bg)}.bundle{display:block;width:100%;overflow:hidden;padding:5px 8px;border:0;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent);color:var(--ink);background:transparent;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.bundle:hover,.bundle.focused{background:var(--vscode-list-hoverBackground,#2a2d2e)}.bundle.focused{outline:1px solid var(--accent);outline-offset:-1px}.actions{display:flex;flex-direction:column;justify-content:center;gap:7px;padding-top:18px}.action,.tool{padding:6px 8px;border:1px solid var(--line);border-radius:3px;color:var(--ink);background:var(--vscode-button-secondaryBackground,#3a3d41);cursor:pointer}.action:hover,.tool:hover{background:var(--vscode-button-secondaryHoverBackground,#45494e)}.action:disabled{opacity:.45;cursor:default}
#toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:12px;padding:10px 18px;border-bottom:1px solid var(--line)}#toolbar label{display:grid;gap:4px;color:var(--muted);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}#toolbar select{min-width:165px}#zoom{display:flex;gap:6px;align-items:center;margin-left:auto}#zoom-value{width:40px;text-align:center;color:var(--muted);font-variant-numeric:tabular-nums}.notice{padding:9px 18px;color:var(--muted);font-size:12px}#graph{min-height:480px;padding:18px;overflow:auto}svg{display:block;border:1px solid var(--line);border-radius:4px;background-image:radial-gradient(color-mix(in srgb,var(--line) 55%,transparent) 1px,transparent 1px);background-size:18px 18px}.edge{stroke:var(--ink);stroke-opacity:.55;stroke-width:1.4;fill:none;marker-end:url(#arrow)}.edge.optional{stroke-dasharray:5 4}.node{cursor:pointer}.node rect{fill:var(--node);stroke:var(--line);stroke-width:1.2;rx:4}.node.input rect{fill:color-mix(in srgb,var(--accent) 18%,var(--node));stroke:var(--accent);stroke-width:2.2}.node.focused rect{stroke:#fff;stroke-width:2.2}.node text{fill:var(--ink);font:11px var(--vscode-editor-font-family,monospace);pointer-events:none}@media(max-width:760px){#setup{grid-template-columns:1fr}.actions{flex-direction:row;padding:0}#zoom{margin-left:0}}
</style></head><body>
<header><h1>Bundle Graph</h1><span class="muted">bundle wiring sprawl</span></header>
<section id="setup"><section><div class="label"><span>Available bundles</span><span id="available-count"></span></div><input id="filter" placeholder="Filter available bundles"><div id="available" class="list"></div></section><section class="actions"><button id="add" class="action">Add &gt;</button><button id="remove" class="action">&lt; Remove</button><button id="add-deps" class="action">Add deps</button><button id="add-dependants" class="action">Add dependants</button></section><section><div class="label"><span>Selected input bundles</span><span id="selected-count"></span></div><div id="selected" class="list"></div></section></section>
<section id="toolbar"><label>Mode<select id="mode"><option value="dependencies">Selected + dependencies</option><option value="dependants">Selected + dependants</option><option value="both">Selected + both</option></select></label><label>Depth<select id="depth"><option value="1">One hop</option><option value="2">Two hops</option><option value="3">Three hops</option><option value="99">All reachable</option></select></label><label>Dependencies<select id="edge-filter"><option value="all">All (mandatory + optional)</option><option value="mandatory">Mandatory only</option><option value="optional">Optional only</option></select></label><div id="zoom"><button id="zoom-out" class="tool">-</button><span id="zoom-value">100%</span><button id="zoom-in" class="tool">+</button><button id="fit" class="tool">Fit</button></div></section>
<div class="notice">Solid edges are mandatory; dashed edges are optional. Start with one hop, then add bundles or increase depth deliberately.</div><section id="graph"></section>
<script>
const graph=${graphData};const selectedIds=new Set(graph.selectedId?[graph.selectedId]:graph.nodes.slice(0,1).map(n=>n.id));let focusedId=graph.selectedId||graph.nodes[0]?.id,availableChoice,zoom=1;const filter=document.getElementById('filter'),mode=document.getElementById('mode'),depth=document.getElementById('depth'),edgeFilter=document.getElementById('edge-filter');
function esc(v){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function edges(){return graph.edges.filter(e=>edgeFilter.value==='all'||(edgeFilter.value==='optional'?e.optional:!e.optional))}function button(n,focused){return '<button class="bundle '+(focused?'focused':'')+'" data-id="'+esc(n.id)+'" title="'+esc(n.name+' - '+n.descriptor)+'">'+esc(n.name)+'</button>'}
function renderLists(){const q=filter.value.toLowerCase(),available=graph.nodes.filter(n=>!selectedIds.has(n.id)&&n.name.toLowerCase().includes(q)),selected=graph.nodes.filter(n=>selectedIds.has(n.id));document.getElementById('available').innerHTML=available.map(n=>button(n,n.id===availableChoice)).join('');document.getElementById('selected').innerHTML=selected.map(n=>button(n,n.id===focusedId)).join('');document.getElementById('available-count').textContent=available.length+' bundles';document.getElementById('selected-count').textContent=selected.length+' selected';document.querySelectorAll('#available .bundle').forEach(b=>b.onclick=()=>{availableChoice=b.dataset.id;renderLists()});document.querySelectorAll('#selected .bundle').forEach(b=>b.onclick=()=>{focusedId=b.dataset.id;render()});document.getElementById('add').disabled=!availableChoice;document.getElementById('remove').disabled=!focusedId||!selectedIds.has(focusedId)}
function neighborhood(){const all=edges(),levels=new Map(),queue=[];selectedIds.forEach(id=>{levels.set(id,0);queue.push(id)});const limit=Number(depth.value);while(queue.length){const current=queue.shift(),level=levels.get(current);if(Math.abs(level)>=limit)continue;all.forEach(e=>{const next=[];if(mode.value!=='dependants'&&e.source===current)next.push([e.target,level+1]);if(mode.value!=='dependencies'&&e.target===current)next.push([e.source,level-1]);next.forEach(p=>{const old=levels.get(p[0]);if(old===undefined||Math.abs(p[1])<Math.abs(old)){levels.set(p[0],p[1]);queue.push(p[0])}})})}return{levels,nodes:graph.nodes.filter(n=>levels.has(n.id)),edges:all.filter(e=>levels.has(e.source)&&levels.has(e.target))}}
function lines(name){const parts=name.split('.');let line='',out=[];parts.forEach(part=>{const next=line?line+'.'+part:part;if(next.length>29&&line){out.push(line);line=part}else line=next});if(line)out.push(line);return out.length>2?[out[0],out.slice(1).join('.').slice(0,26)+'...']:out}function renderGraph(){const host=document.getElementById('graph'),data=neighborhood();if(!data.nodes.length){host.innerHTML='<div class="notice">Select one or more input bundles to render a graph.</div>';return}const columns=[...new Set([...data.levels.values()])].sort((a,b)=>a-b),groups=new Map(columns.map(c=>[c,data.nodes.filter(n=>data.levels.get(n.id)===c).sort((a,b)=>a.name.localeCompare(b.name))])),largest=Math.max(...[...groups.values()].map(g=>g.length)),width=Math.max(720,columns.length*270+90),height=Math.max(420,largest*92+110),positions=new Map();columns.forEach((c,i)=>groups.get(c).forEach((n,row)=>positions.set(n.id,{x:145+i*270,y:56+row*92})));const defs='<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs>';const paths=data.edges.map(e=>{const a=positions.get(e.source),b=positions.get(e.target),mid=(a.x+b.x)/2;return '<path class="edge '+(e.optional?'optional':'')+'" d="M'+(a.x+105)+','+(a.y+29)+' C'+mid+','+(a.y+29)+' '+mid+','+(b.y+29)+' '+(b.x-105)+','+(b.y+29)+'"><title>'+esc(e.packages.join(', '))+'</title></path>'}).join('');const nodes=data.nodes.map(n=>{const p=positions.get(n.id),text=lines(n.name).map((line,i)=>'<tspan x="10" dy="'+(i?'14':'0')+'">'+esc(line)+'</tspan>').join('');return '<g class="node '+(selectedIds.has(n.id)?'input ':'')+(n.id===focusedId?'focused':'')+'" data-id="'+esc(n.id)+'" transform="translate('+(p.x-105)+' '+p.y+')"><rect width="210" height="58"/><text x="10" y="'+(lines(n.name).length>1?'22':'33')+'">'+text+'</text><title>'+esc(n.name+' - '+n.descriptor)+'</title></g>'}).join('');host.innerHTML='<svg style="width:'+Math.round(width*zoom)+'px;height:'+Math.round(height*zoom)+'px" viewBox="0 0 '+width+' '+height+'">'+defs+paths+nodes+'</svg>';host.querySelectorAll('.node').forEach(n=>n.onclick=()=>{focusedId=n.dataset.id;if(!selectedIds.has(focusedId))selectedIds.add(focusedId);render()})}
function addRelated(kind){edges().forEach(e=>{if(kind==='deps'&&selectedIds.has(e.source))selectedIds.add(e.target);if(kind==='dependants'&&selectedIds.has(e.target))selectedIds.add(e.source)})}function updateZoom(){document.getElementById('zoom-value').textContent=Math.round(zoom*100)+'%'}function render(){renderLists();renderGraph();updateZoom()}document.getElementById('add').onclick=()=>{if(availableChoice){selectedIds.add(availableChoice);focusedId=availableChoice;availableChoice=undefined;render()}};document.getElementById('remove').onclick=()=>{selectedIds.delete(focusedId);focusedId=selectedIds.values().next().value;render()};document.getElementById('add-deps').onclick=()=>{addRelated('deps');render()};document.getElementById('add-dependants').onclick=()=>{addRelated('dependants');render()};document.getElementById('zoom-in').onclick=()=>{zoom=Math.min(2,zoom+.2);renderGraph();updateZoom()};document.getElementById('zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.2);renderGraph();updateZoom()};document.getElementById('fit').onclick=()=>{zoom=1;renderGraph();updateZoom()};filter.oninput=renderLists;mode.onchange=renderGraph;depth.onchange=renderGraph;edgeFilter.onchange=renderGraph;render();
</script></body></html>`;
}
