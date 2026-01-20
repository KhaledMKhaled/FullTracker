ALTER TABLE "shipments"
ADD COLUMN "shipping_company_supplier_id" integer;

ALTER TABLE "shipments"
ADD CONSTRAINT "shipments_shipping_company_supplier_id_suppliers_id_fk"
FOREIGN KEY ("shipping_company_supplier_id")
REFERENCES "suppliers"("id")
ON DELETE NO ACTION
ON UPDATE NO ACTION;
