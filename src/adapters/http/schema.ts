import { type TSchema, Type } from '@fastify/type-provider-typebox';

export const cursorQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const idParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const keyParamsSchema = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const errorSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});

export const mutationHeadersSchema = Type.Object(
  {
    'x-mutation-mode': Type.Optional(
      Type.Union([Type.Literal('readonly'), Type.Literal('approval'), Type.Literal('write')], {
        description: 'Mutation authorization mode. Defaults to readonly when omitted.',
      }),
    ),
  },
  { additionalProperties: true },
);

/**
 * Creates the shared cursor-page response schema.
 */
export const pageSchema = <Value extends TSchema>(value: Value) =>
  Type.Object({
    items: Type.Array(value),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  });
