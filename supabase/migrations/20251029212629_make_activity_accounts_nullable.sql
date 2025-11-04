alter table "public"."activities" alter column "source_account_id" drop not null;

alter table "public"."activities" alter column "target_account_id" drop not null;

alter table "public"."activities" add constraint "activity_must_have_account" CHECK (((source_account_id IS NOT NULL) OR (target_account_id IS NOT NULL))) not valid;

alter table "public"."activities" validate constraint "activity_must_have_account";


