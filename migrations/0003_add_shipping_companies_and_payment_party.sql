-- Add shipping companies master table
CREATE TABLE IF NOT EXISTS shipping_companies (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(255) NOT NULL,
  contact_name varchar(255),
  phone varchar(50),
  email varchar(255),
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Update shipments to reference shipping companies
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS shipping_company_id integer REFERENCES shipping_companies(id);

ALTER TABLE shipments
  DROP COLUMN IF EXISTS shipping_company_supplier_id;

-- Update shipment payments to support polymorphic parties
ALTER TABLE shipment_payments
  ADD COLUMN IF NOT EXISTS party_type varchar(50),
  ADD COLUMN IF NOT EXISTS party_id integer;

UPDATE shipment_payments
  SET party_type = 'supplier',
      party_id = supplier_id
  WHERE supplier_id IS NOT NULL
    AND (party_type IS NULL OR party_type = '' OR party_id IS NULL);

ALTER TABLE shipment_payments
  DROP COLUMN IF EXISTS supplier_id;

-- Remove hidden supplier flag
ALTER TABLE suppliers
  DROP COLUMN IF EXISTS is_hidden;
