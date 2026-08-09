import type { InterpretationPublication } from '../ports/store.js';
import type { RegisterInterpretationInput } from './input.js';

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
export function freezeDraft(draft: RegisterInterpretationInput): RegisterInterpretationInput {
  return Object.freeze({
    ...draft,
    items: Object.freeze(
      draft.items.map((item) =>
        Object.freeze({
          ...item,
          profile: item.profile ? Object.freeze({ ...item.profile }) : undefined,
        }),
      ),
    ),
    components: Object.freeze(
      draft.components.map((component) =>
        Object.freeze({
          ...component,
          value: structuredClone(component.value),
          validTime: component.validTime ? Object.freeze({ ...component.validTime }) : undefined,
          sourceLocators: component.sourceLocators
            ? Object.freeze(
                component.sourceLocators.map((locator) => Object.freeze({ ...locator })),
              )
            : undefined,
        }),
      ),
    ),
    referenceResolutions: draft.referenceResolutions
      ? Object.freeze(
          draft.referenceResolutions.map((resolution) =>
            Object.freeze({
              ...resolution,
              candidateItemIds: Object.freeze([...resolution.candidateItemIds]),
            }),
          ),
        )
      : undefined,
    referenceDecisions: draft.referenceDecisions
      ? Object.freeze(draft.referenceDecisions.map((decision) => Object.freeze({ ...decision })))
      : undefined,
    declarations: draft.declarations
      ? Object.freeze(structuredClone(draft.declarations))
      : undefined,
  });
}
