ALTER TABLE shipment_payments
  ADD COLUMN attachment_mime_type varchar,
  ADD COLUMN attachment_size integer,
  ADD COLUMN attachment_original_name varchar,
  ADD COLUMN attachment_uploaded_at timestamp;
