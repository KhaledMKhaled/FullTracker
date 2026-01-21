-- Add linked_payment_id to party_collections
ALTER TABLE party_collections ADD COLUMN IF NOT EXISTS linked_payment_id INTEGER;

-- Add linked_collection_id to local_payments
ALTER TABLE local_payments ADD COLUMN IF NOT EXISTS linked_collection_id INTEGER;
