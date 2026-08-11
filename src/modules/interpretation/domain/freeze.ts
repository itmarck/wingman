import type { InterpretationPublication } from '../ports.js';
import type { InterpretationDraft } from './input.js';

export const emptyPublication: InterpretationPublication = Object.freeze({
  itemIds: Object.freeze([]),
  revisionIds: Object.freeze([]),
});

/** Clones and freezes publication identifiers at the domain boundary. */
export function freezePublication(
  publication: InterpretationPublication,
): InterpretationPublication {
  return Object.freeze({
    itemIds: Object.freeze([...publication.itemIds]),
    revisionIds: Object.freeze([...publication.revisionIds]),
  });
}

/** Clones and freezes an inference Draft before preserving it as historical state. */
export function freezeDraft(draft: InterpretationDraft): InterpretationDraft {
  return Object.freeze({
    ...draft,
    declarations: Object.freeze(structuredClone(draft.declarations)),
    resolutions: draft.resolutions
      ? Object.freeze(
          draft.resolutions.map((resolution) =>
            Object.freeze({
              ...resolution,
              candidateItemIds: Object.freeze([...resolution.candidateItemIds]),
            }),
          ),
        )
      : undefined,
    decisions: draft.decisions
      ? Object.freeze(draft.decisions.map((decision) => Object.freeze({ ...decision })))
      : undefined,
  });
}
