-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN "processedAt" TIMESTAMP(3);

-- Events recorded before this column existed were handled by the previous code: treat them as processed.
UPDATE "WebhookEvent" SET "processedAt" = "createdAt";
