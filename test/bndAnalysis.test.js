const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const analysis = require('../out/bndAnalysis');
const corpusRoot = path.join(__dirname, 'fixtures', 'corpus');
const manifest = JSON.parse(fs.readFileSync(path.join(corpusRoot, 'corpus.json'), 'utf8'));

function filesUnder(directory, suffix) {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            result.push(...filesUnder(entryPath, suffix));
        } else if (entry.name.endsWith(suffix)) {
            result.push({ path: entryPath, text: fs.readFileSync(entryPath, 'utf8') });
        }
    }
    return result;
}

for (const fixture of manifest.projects) {
    test(`corpus: ${fixture.id}`, () => {
        const fixtureRoot = path.join(corpusRoot, fixture.id);
        const descriptorPath = path.join(fixtureRoot, fixture.descriptor);
        const descriptorText = fs.readFileSync(descriptorPath, 'utf8');
        const properties = analysis.propertiesIn(descriptorText);
        const sources = analysis.sourcesForDescriptor(descriptorPath, filesUnder(fixtureRoot, '.java'));

        for (const key of fixture.expected.propertyKeys) {
            assert.ok(properties.has(key), `expected ${key} in ${fixture.id}`);
        }
        if (fixture.expected.localSourceFiles !== undefined) {
            assert.equal(sources.length, fixture.expected.localSourceFiles);
        }
        if (fixture.expected.packages) {
            assert.deepEqual(analysis.packagesFromValue(properties.get('import-package')), fixture.expected.packages);
        }
        if (fixture.expected.annotationFamilies) {
            const counts = {};
            for (const use of sources.flatMap(analysis.annotationUsesIn)) {
                const family = analysis.annotationFamily(use.qualifiedName);
                if (family) counts[family] = (counts[family] || 0) + 1;
            }
            assert.deepEqual(counts, fixture.expected.annotationFamilies);

            const directives = {
                'Declarative Services': '-dsannotations',
                'OSGi Metatype': '-metatypeannotations',
                'CDI': '-cdiannotations'
            };
            for (const [family, expectedCount] of Object.entries(fixture.expected.annotationFamilies)) {
                const directive = directives[family];
                if (!properties.has(directive)) continue;
                const evidence = analysis.analyzeAnnotationDirective(properties.get(directive), family, sources);
                assert.equal(evidence.familyUseCount, expectedCount);
                if (fixture.id === 'apache-aries-maven-cdi') {
                    assert.deepEqual(evidence.configuredClasses, ['org.apache.aries.example.Factory']);
                    assert.deepEqual(evidence.projectSpecificAnnotations, ['org.apache.aries.blueprint.annotation.Bean']);
                }
            }
        }
        if (fixture.expected.localIncludes !== undefined) {
            const entries = analysis.splitBndList(properties.get('-include'));
            const resolved = entries
                .map((entry) => analysis.localIncludePath(entry, descriptorPath, fixtureRoot))
                .filter((entry) => entry && fs.existsSync(entry));
            assert.equal(resolved.length, fixture.expected.localIncludes);
        }
    });
}

test('keeps commas inside quotes and nested macros', () => {
    assert.deepEqual(
        analysis.splitBndList('one;version="[1,2)",${if;${flag};two,three;four},five'),
        ['one;version="[1,2)"', '${if;${flag};two,three;four}', 'five']
    );
    assert.deepEqual(analysis.packagesFromValue('${packages;VERSIONED}'), []);
    assert.deepEqual(analysis.classEntries('org.example.*,org.example.Real,!org.example.Skip'), ['org.example.Real']);
});

test('supports shorthand optional includes and rejects dynamic includes', () => {
    const properties = analysis.propertiesIn('-include ~local.bnd\nBundle-Name: example');
    assert.equal(properties.get('-include'), '~local.bnd');
    assert.match(analysis.localIncludePath('~${.}/local.bnd', '/workspace/project/bnd.bnd'), /project\/local\.bnd$/);
    assert.equal(analysis.localIncludePath('${if;${flag};a.bnd;b.bnd}', '/workspace/project/bnd.bnd'), undefined);
});

test('does not collect annotations from Java comments or strings', () => {
    const uses = analysis.annotationUsesIn({
        path: '/sample/src/Example.java',
        text: `package sample;
            import org.osgi.service.component.annotations.Component;
            // @Component
            class Example { String value = "@Component"; @Component void activate() {} }`
    });
    assert.deepEqual(uses.map((use) => use.qualifiedName), ['org.osgi.service.component.annotations.Component']);
});
