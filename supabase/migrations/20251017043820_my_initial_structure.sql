create sequence "public"."activities_id_seq";

create table "public"."accounts" (
    "id" bigint not null,
    "created_at" timestamp with time zone default now()
);


create table "public"."activities" (
    "id" bigint not null default nextval('activities_id_seq'::regclass),
    "timestamp" timestamp with time zone not null,
    "owner_account_id" bigint not null,
    "source_account_id" bigint not null,
    "target_account_id" bigint not null,
    "amount" bigint not null,
    "created_at" timestamp with time zone default now()
);


alter sequence "public"."activities_id_seq" owned by "public"."activities"."id";

CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id);

CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);

CREATE INDEX idx_activities_owner_timestamp ON public.activities USING btree (owner_account_id, "timestamp");

CREATE INDEX idx_activities_source ON public.activities USING btree (source_account_id);

CREATE INDEX idx_activities_target ON public.activities USING btree (target_account_id);

alter table "public"."accounts" add constraint "accounts_pkey" PRIMARY KEY using index "accounts_pkey";

alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";

alter table "public"."activities" add constraint "activities_amount_check" CHECK ((amount > 0)) not valid;

alter table "public"."activities" validate constraint "activities_amount_check";

alter table "public"."activities" add constraint "activities_owner_account_id_fkey" FOREIGN KEY (owner_account_id) REFERENCES accounts(id) not valid;

alter table "public"."activities" validate constraint "activities_owner_account_id_fkey";

alter table "public"."activities" add constraint "activities_source_account_id_fkey" FOREIGN KEY (source_account_id) REFERENCES accounts(id) not valid;

alter table "public"."activities" validate constraint "activities_source_account_id_fkey";

alter table "public"."activities" add constraint "activities_target_account_id_fkey" FOREIGN KEY (target_account_id) REFERENCES accounts(id) not valid;

alter table "public"."activities" validate constraint "activities_target_account_id_fkey";

grant delete on table "public"."accounts" to "anon";

grant insert on table "public"."accounts" to "anon";

grant references on table "public"."accounts" to "anon";

grant select on table "public"."accounts" to "anon";

grant trigger on table "public"."accounts" to "anon";

grant truncate on table "public"."accounts" to "anon";

grant update on table "public"."accounts" to "anon";

grant delete on table "public"."accounts" to "authenticated";

grant insert on table "public"."accounts" to "authenticated";

grant references on table "public"."accounts" to "authenticated";

grant select on table "public"."accounts" to "authenticated";

grant trigger on table "public"."accounts" to "authenticated";

grant truncate on table "public"."accounts" to "authenticated";

grant update on table "public"."accounts" to "authenticated";

grant delete on table "public"."accounts" to "service_role";

grant insert on table "public"."accounts" to "service_role";

grant references on table "public"."accounts" to "service_role";

grant select on table "public"."accounts" to "service_role";

grant trigger on table "public"."accounts" to "service_role";

grant truncate on table "public"."accounts" to "service_role";

grant update on table "public"."accounts" to "service_role";

grant delete on table "public"."activities" to "anon";

grant insert on table "public"."activities" to "anon";

grant references on table "public"."activities" to "anon";

grant select on table "public"."activities" to "anon";

grant trigger on table "public"."activities" to "anon";

grant truncate on table "public"."activities" to "anon";

grant update on table "public"."activities" to "anon";

grant delete on table "public"."activities" to "authenticated";

grant insert on table "public"."activities" to "authenticated";

grant references on table "public"."activities" to "authenticated";

grant select on table "public"."activities" to "authenticated";

grant trigger on table "public"."activities" to "authenticated";

grant truncate on table "public"."activities" to "authenticated";

grant update on table "public"."activities" to "authenticated";

grant delete on table "public"."activities" to "service_role";

grant insert on table "public"."activities" to "service_role";

grant references on table "public"."activities" to "service_role";

grant select on table "public"."activities" to "service_role";

grant trigger on table "public"."activities" to "service_role";

grant truncate on table "public"."activities" to "service_role";

grant update on table "public"."activities" to "service_role";


