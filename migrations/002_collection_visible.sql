-- Columns and extra fields each Collection shows in the panel; everything else stays hidden.
ALTER TABLE collections ADD COLUMN visible jsonb NOT NULL DEFAULT '[]';

-- Keep what the panel showed before: defined columns, every extra field and, in Collections
-- without definitions, the general columns that hold some value.
UPDATE collections c SET visible = (
  SELECT coalesce(jsonb_agg(key), '[]') FROM (
    SELECT key FROM jsonb_object_keys(c.definitions) key WHERE key <> 'title'
    UNION SELECT field->>'id' FROM jsonb_array_elements(c.fields) field WHERE field->>'type' <> 'reference'
    UNION SELECT key FROM unnest(ARRAY['subtitle','body','category','rating','amount','url','occurredAt','dueAt']) key
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_object_keys(c.definitions) defined WHERE defined <> 'title')
      AND EXISTS (SELECT 1 FROM records r WHERE r."collectionId" = c.id AND to_jsonb(r)->>key IS NOT NULL)
  ) keys
);
