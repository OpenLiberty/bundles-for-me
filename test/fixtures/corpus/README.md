# Tooltip corpus fixtures

These are small, hand-reduced fixtures based on recurring structures in three
Apache-2.0/EPL-2.0 open-source OSGi repositories and four project layouts. They are intentionally not full
repository snapshots: tests must be deterministic, fast, and offline.

`corpus.json` records the upstream URL, inspected revision, and representative
paths for every fixture. The fixture text is reduced to the syntax relevant to
hover analysis and includes synthetic edge cases (wildcard imports, misleading
annotations in comments, and dynamic include macros). It is therefore test
data, not a claim that the upstream files have exactly this content.

To refresh the research inputs, shallow-clone the recorded repositories outside
this tree, inspect the recorded paths plus current `*.bnd`/`*.bndrun` usage, and
update both the revision and expectations. Never make the test command clone or
otherwise require network access.

Coverage dimensions:

- bnd workspace modules and `${workspace}` includes;
- Maven-style `src/main/java` modules;
- nested Ant/iPOJO modules with a descriptor beside `src`;
- DS, Metatype, CDI, wildcard annotation imports, and custom annotations;
- quoted commas, continuations, macros, selectors, and shorthand `-include`.
