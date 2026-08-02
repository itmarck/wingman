# Legacy replacement mapping

| Legacy structure | Item structure |
| --- | --- |
| `Concept` | Stable `Item`; canonical name, aliases and definition become versioned Components |
| `Predicate` | Registered Component schema or a field within a registered schema; it is never created dynamically |
| `Axiom` | Evidence-backed `ComponentRevision` on its subject Item |
| `Link` | Typed Item reference for a simple connection, or a relationship Item with `participants` and detail Components |
| `system.supersedes` | `ComponentRevision.supersedesRevisionId` within the same Item and Component key |
| Current Axioms | Current non-rejected Component revisions not superseded by another valid revision |
| Glossary | Item identities with their current `name`, `aliases`, and `description` Components |
| Draft `concepts` | Draft `items` with local references and optional Profile references |
| Draft `predicates` | Removed; Drafts may use only registered Component schemas and Profiles |
| Draft `axioms` | Draft `components` containing schema key/version, value, evidence, validity and candidate status |
| Draft `links` | Typed references inside Components or Draft relationship Items |
| Concept reference Review | Item identity `referenceResolution`; selecting a candidate Item or confirming the proposed Item |

Entries, Interpretation identity, exact source locators, Reviews, and publication atomicity retain their existing meaning.
