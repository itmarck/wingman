-- A general yes/no column; each Collection defines what it means, e.g. "Watched".
ALTER TABLE records ADD COLUMN checked boolean;
