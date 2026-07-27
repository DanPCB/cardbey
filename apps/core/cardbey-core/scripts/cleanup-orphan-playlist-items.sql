-- Remove PlaylistItem rows with broken FKs (Media / SignageAsset missing) or with no reference at all.
-- Safe to run after backup. Works with SQLite and PostgreSQL (quoted identifiers).
--
-- Inspect first:
-- SELECT pi.id, pi."mediaId", pi."assetId", m.url AS mediaUrl, sa.url AS assetUrl
-- FROM "PlaylistItem" pi
-- LEFT JOIN "Media" m ON m.id = pi."mediaId"
-- LEFT JOIN "SignageAsset" sa ON sa.id = pi."assetId"
-- LIMIT 50;

DELETE FROM "PlaylistItem"
WHERE id IN (
  SELECT pi.id FROM "PlaylistItem" pi
  LEFT JOIN "Media" m ON m.id = pi."mediaId"
  LEFT JOIN "SignageAsset" sa ON sa.id = pi."assetId"
  WHERE (pi."mediaId" IS NOT NULL AND m.id IS NULL)
     OR (pi."assetId" IS NOT NULL AND sa.id IS NULL)
     OR (pi."mediaId" IS NULL AND pi."assetId" IS NULL)
);
