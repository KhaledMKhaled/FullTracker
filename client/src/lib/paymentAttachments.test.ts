import assert from "node:assert/strict";
import test from "node:test";
import { getPaymentAttachmentPreviewUrl, hasPaymentAttachment } from "./paymentAttachments";

const samplePayment = {
  attachmentUrl: "/uploads/payments/sample.png",
};

test("hasPaymentAttachment returns true when attachmentUrl exists", () => {
  assert.equal(hasPaymentAttachment(samplePayment), true);
});

test("getPaymentAttachmentPreviewUrl builds preview endpoint", () => {
  assert.equal(getPaymentAttachmentPreviewUrl(55), "/api/payments/55/attachment/preview");
});
