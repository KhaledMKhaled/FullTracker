CREATE TABLE IF NOT EXISTS payment_allocations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES shipment_payments(id),
  shipment_id integer NOT NULL REFERENCES shipments(id),
  supplier_id integer NOT NULL REFERENCES suppliers(id),
  component varchar(50) NOT NULL,
  currency varchar(10) NOT NULL,
  allocated_amount decimal(15, 2) NOT NULL,
  created_by varchar(255) REFERENCES users(id),
  created_at timestamp DEFAULT now()
);
