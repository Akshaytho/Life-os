## What changed

Describe the behavior/product/architecture change.

## Canonical artifact comparison

**Artifact:** `docs/product/PRODUCT_DOCTRINE.md`  
**Artifact version reviewed:** `x.y.z`

### Sections touched

List the canonical artifact sections materially affected by this change.

### Classification

For every material product change, mark one:

- [ ] ALIGNED — directly implements the artifact
- [ ] REFINEMENT — improves implementation without changing ownership/meaning
- [ ] EXTENSION — adds capability without contradicting the artifact
- [ ] CONFLICT — contradicts the current artifact; do not merge unresolved
- [ ] SUPERSEDING DECISION — artifact updated after explicit product decision

### Pre-implementation comparison

Explain how the proposed change fits the relevant artifact rules. Call out any ambiguity rather than silently choosing a new product rule.

### Post-implementation comparison

After implementation, compare the actual behavior/rendered UI with the artifact:

- [ ] Domain ownership still matches the artifact
- [ ] Life OS AI / ChatGPT responsibilities still match the artifact
- [ ] Trust/authority/provenance boundaries are preserved
- [ ] UI uses progressive disclosure where data can become deep
- [ ] UI adapts to realistic variable input/data shapes
- [ ] Sample data did not become a hard-coded product rule
- [ ] No hidden high-authority AI mutation was introduced
- [ ] Mobile-first visual review completed when UI changed
- [ ] Any doctrine change is reflected in the artifact version/change log

## Validation

Record CI, tests, visual review, and any manual validation performed.

## Decision notes

If this PR introduces or supersedes a product decision, state the explicit decision and why. Otherwise write `None`.
