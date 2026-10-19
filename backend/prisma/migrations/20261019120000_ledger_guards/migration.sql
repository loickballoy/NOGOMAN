-- Every journal entry must balance to zero. Checked at commit time so an entry's
-- postings can be inserted one by one inside the same transaction.
CREATE OR REPLACE FUNCTION assert_journal_entry_balanced() RETURNS trigger AS $$
DECLARE
  total BIGINT;
BEGIN
  SELECT COALESCE(SUM("amountXof"), 0) INTO total FROM "Posting" WHERE "entryId" = NEW."entryId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'journal entry % is unbalanced (sum %)', NEW."entryId", total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER posting_balanced
  AFTER INSERT OR UPDATE ON "Posting"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_entry_balanced();

-- Ledger history is append-only.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posting_no_delete BEFORE DELETE ON "Posting"
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
CREATE TRIGGER journal_no_delete BEFORE DELETE OR UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

ALTER TABLE "Review" ADD CONSTRAINT review_rating_range CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Job" ADD CONSTRAINT job_positive CHECK ("rateXof" > 0 AND "workersNeeded" > 0 AND "durationDays" > 0);
ALTER TABLE "WorkUnit" ADD CONSTRAINT work_unit_amounts CHECK ("grossXof" > 0 AND "farmerFeeXof" >= 0 AND "workerFeeXof" >= 0 AND "workerFeeXof" <= "grossXof");
ALTER TABLE "Payout" ADD CONSTRAINT payout_positive CHECK ("amountXof" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_positive CHECK ("amountXof" > 0);
