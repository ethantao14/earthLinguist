#!/bin/bash
# Asserts the access model against a local Postgres loaded with the schema plus
# all migrations. Needs docker and a container named el-pg. Not wired into CI
# yet, because CI would first need a schema to load.
#
#   bash test/policy_matrix.sh
set -u
fail=0
A=00000000-0000-0000-0000-00000000000a  # viewer
B=00000000-0000-0000-0000-00000000000b  # student
C=00000000-0000-0000-0000-00000000000c  # recorder
D=00000000-0000-0000-0000-00000000000d  # creator
E=00000000-0000-0000-0000-00000000000e  # admin

q () { # role uid sql
  local claim=""
  [ -n "$2" ] && claim="set local request.jwt.claim.sub = '$2';"
  docker exec -i el-pg psql -U postgres -qtA <<SQL | tr -d ' '
begin; set local role $1; $claim
$3
rollback;
SQL
}

check () { # description expected actual
  if [ "$2" = "$3" ]; then printf "  pass  %-52s %s\n" "$1" "$3"
  else printf "  FAIL  %-52s expected %s, got %s\n" "$1" "$2" "$3"; fail=$((fail+1)); fi
}

for migration in 0010_creator_consent.sql 0010_rollback.sql 0011_require_creator_consent.sql 0011_rollback.sql \
    0012_recording_consent.sql 0012_rollback.sql 0013_require_recording_consent.sql 0013_rollback.sql; do
  if [ -s "$(dirname "$0")/../db/$migration" ]; then present=yes; else present=no; fi
  check "migration delivered: $migration" yes "$present"
done

# Since 0011 a creator needs a consent row to create examples. Seeds one for D.
CONSENT_D=$'reset role; insert into public.creator_consent(user_id,form_version,answers) values (\'00000000-0000-0000-0000-00000000000d\',\'placeholder-v1\',\'{"box1":true,"box2":true}\'); set local role authenticated;'
# Since 0013 recorders and creators need recording consent to submit sessions. Seeds a self consent row.
RECORD_OK () { echo "reset role; insert into public.recording_consent(user_id,form_version,answers) values ('$1','placeholder-v1','{\"box1\":true,\"box2\":true}'); set local role authenticated;"; }

echo "reads: how many rows each role can see"
check "anon sees verified unheld examples"      3 "$(q anon "" 'select count(*) from public.example;')"
check "student sees only class-viewable"        2 "$(q authenticated $B 'select count(*) from public.example;')"
check "creator sees no unverified work"         3 "$(q authenticated $D 'select count(*) from public.example;')"
check "admin sees everything including held"    5 "$(q authenticated $E 'select count(*) from public.example;')"
check "anon sees no held audio"                 1 "$(q anon "" 'select count(*) from public.audio;')"
check "admin sees held audio"                   2 "$(q authenticated $E 'select count(*) from public.audio;')"

echo "writes: who may do what"
check "recorder cannot create an example"      no "$(q authenticated $C $'select public._p($q$insert into public.example(width,height,title,"user") values (1,1,\'x\',\'x\')$q$);')"
check "creator can create an example"         YES "$(q authenticated $D "$CONSENT_D "$'select public._p($q$insert into public.example(width,height,title,"user") values (1,1,\'x\',\'x\')$q$);')"
check "example defaults to unapproved" false "$(docker exec -i el-pg psql -U postgres -qtA -c "select column_default from information_schema.columns where table_schema='public' and table_name='example' and column_name='verification_status'")"
check "recorder cannot approve"                no "$(q authenticated $C $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "creator cannot approve"                 no "$(q authenticated $D $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "admin can approve"                     YES "$(q authenticated $E $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "nobody can promote themselves"          no "$(q authenticated $C $'select public._p($q$update public.profiles set status=\'admin\' where id=auth.uid()$q$);')"
check "anon cannot delete legacy audio_clips"  no "$(q anon "" $'select public._p($q$delete from public.audio_clips$q$);')"

echo "the approval gate itself"
check "creator cannot publish a pre-approved example"  no "$(q authenticated $D "$CONSENT_D "$'select public._p($q$insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',true)$q$);')"
check "creator can create work awaiting approval"     YES "$(q authenticated $D "$CONSENT_D "$'select public._p($q$insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',false)$q$);')"
check "creator cannot submit pre-verified session"     no "$(q authenticated $D "$(RECORD_OK $D) "$'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Cora\',\'L\',true)$q$);')"
check "admin may publish directly"                    YES "$(q authenticated $E $'select public._p($q$insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',true)$q$);')"
check "recorder submits, must stay unverified"  no "$(q authenticated $C "$(RECORD_OK $C) "$'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Rita\',\'L\',true)$q$);')"
check "recorder submits unverified work"       YES "$(q authenticated $C "$(RECORD_OK $C) "$'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Rita\',\'L\',false)$q$);' | tail -1)"

echo "checkmarks: one per cell, even when a creator resubmits"
CELLS=$'save_checkmarks(\'e0000000-0000-0000-0000-000000000003\',\'[{"row_index":7,"column_index":7}]\')'
COUNT77=$'select count(*) from public.checkmarks where example_id=\'e0000000-0000-0000-0000-000000000003\' and row_index=7 and column_index=7;'
check "creator resubmit keeps one copy"          1 "$(q authenticated $D "select public.$CELLS; select public.$CELLS; reset role; $COUNT77" | tail -1)"
check "admin can save checkmarks"              YES "$(q authenticated $E "select public._p(\$q\$select public.$CELLS\$q\$);")"
check "recorder cannot save checkmarks"         no "$(q authenticated $C "select public._p(\$q\$select public.$CELLS\$q\$);")"
check "anon cannot save checkmarks"             no "$(q anon "" "select public._p(\$q\$select public.$CELLS\$q\$);")"
check "a blank cell is refused"                no "$(q authenticated $E "select public._p(\$q\$select public.save_checkmarks('e0000000-0000-0000-0000-000000000003','[{\"row_index\":null,\"column_index\":1}]')\$q\$);")"
check "a repeated cell is refused"              no "$(q authenticated $E $'select public._p($q$insert into public.checkmarks(example_id,row_index,column_index) values (\'e0000000-0000-0000-0000-000000000003\',8,8),(\'e0000000-0000-0000-0000-000000000003\',8,8)$q$);')"

echo "categories: everyone reads the list, only admins change it"
SEED=$'reset role; insert into public.categories(category_type) values (\'Verbs\');'
ADD=$'select public._p($q$insert into public.categories(category_type) values (\'Nouns\')$q$);'
RENAME=$'select public._p($q$update public.categories set category_type=\'Verb forms\' where category_type=\'Verbs\'$q$);'
REMOVE=$'select public._p($q$delete from public.categories where category_type=\'Verbs\'$q$);'
check "anon can read categories"                 1 "$(q anon "" "$SEED set local role anon; select count(*) from public.categories;")"
check "student can read categories"              1 "$(q authenticated $B "$SEED set local role authenticated; select count(*) from public.categories;")"
check "admin can add a category"               YES "$(q authenticated $E "$ADD")"
check "creator cannot add a category"           no "$(q authenticated $D "$ADD")"
check "anon cannot add a category"              no "$(q anon "" "$ADD")"
check "admin can rename a category"            YES "$(q authenticated $E "$SEED set local role authenticated; $RENAME")"
check "creator cannot rename a category"        no "$(q authenticated $D "$SEED set local role authenticated; $RENAME")"
check "admin can delete a category"            YES "$(q authenticated $E "$SEED set local role authenticated; $REMOVE")"
check "creator cannot delete a category"        no "$(q authenticated $D "$SEED set local role authenticated; $REMOVE")"
check "same name in other case is refused"      no "$(q authenticated $E "$SEED set local role authenticated; "$'select public._p($q$insert into public.categories(category_type) values (\'verbs\')$q$);')"
check "blank name is refused"                   no "$(q authenticated $E $'select public._p($q$insert into public.categories(category_type) values (\'   \')$q$);')"

echo "example owners: a creator's new example is theirs"
check "new example records its creator"         $D "$(q authenticated $D "$CONSENT_D "$'insert into public.example(id,width,height,title,"user",verification_status) values (\'e0000000-0000-0000-0000-0000000000aa\',1,1,\'x\',\'x\',false); reset role; select created_by from public.example where id=\'e0000000-0000-0000-0000-0000000000aa\';' | tail -1)"
check "creator cannot make one owned by another" no "$(q authenticated $D "$CONSENT_D select public._p(\$q\$insert into public.example(width,height,title,\"user\",verification_status,created_by) values (1,1,'x','x',false,'$E')\$q\$);")"
check "admin can still create examples"        YES "$(q authenticated $E $'select public._p($q$insert into public.example(width,height,title,"user") values (1,1,\'x\',\'x\')$q$);')"

echo "tags: only admins may change tags"
DRAFT=e0000000-0000-0000-0000-000000000003   # unapproved, created by the creator
PUBLISHED=e0000000-0000-0000-0000-000000000001 # approved, created by the creator
CATS=$'reset role; insert into public.categories(category_type) values (\'Verbs\'),(\'Nouns\');'
ids () { echo "array(select id from public.categories where category_type in ($1))"; }
tag () { echo "select public._p(\$q\$select public.set_example_categories('$1', $(ids "$2"))\$q\$);"; }
TAGS_ON () { echo "reset role; select string_agg(c.category_type, ',' order by c.category_type) from public.categories_example ce join public.categories c on c.id = ce.category_id where ce.example_id = '$1';"; }
check "creator cannot tag their own draft"     no "$(q authenticated $D "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "retagging replaces the old tags"      Nouns "$(q authenticated $E "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'") $(tag $DRAFT "'Nouns'") $(TAGS_ON $DRAFT)" | tail -1)"
# Return the actual SQLSTATE, including permission failures before function entry.
STATE_FN='reset role; create function pg_temp.tag_state(ex uuid, cats bigint[]) returns text language plpgsql as $$ begin perform public.set_example_categories(ex, cats); return $s$success$s$; exception when others then return SQLSTATE; end; $$;'
for uid in "$A" "$B" "$C" "$D"; do
  check "non-admin $uid gets 42501" 42501 "$(q authenticated "$uid" "$CATS $STATE_FN set local role authenticated; select pg_temp.tag_state('$DRAFT', $(ids "'Verbs'"));" | tail -1)"
done
check "anon tagging gets 42501" 42501 "$(q anon "" "$CATS $STATE_FN set local role anon; select pg_temp.tag_state('$PUBLISHED', $(ids "'Verbs'"));" | tail -1)"
check "admin can clear every tag" 0 "$(q authenticated $E "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'") select public.set_example_categories('$DRAFT', array[]::bigint[]); reset role; select count(*) from public.categories_example where example_id='$DRAFT';" | tail -1)"
check "refused retag leaves existing tags untouched" Verbs "$(q authenticated $D "$CATS insert into public.categories_example(category_id, example_id) select id, '$DRAFT' from public.categories where category_type='Verbs'; set local role authenticated; $(tag $DRAFT "'Nouns'") $(TAGS_ON $DRAFT)" | tail -1)"
check "creator cannot tag own approved example"  no "$(q authenticated $D "$CATS set local role authenticated; $(tag $PUBLISHED "'Verbs'")")"
check "creator cannot tag an ownerless draft"    no "$(q authenticated $D "$CATS update public.example set created_by = null where id = '$DRAFT'; set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "creator cannot tag another's draft"       no "$(q authenticated $D "$CATS insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000ff'); insert into public.profiles(id, first_name, status) values ('00000000-0000-0000-0000-0000000000ff', 'Other', 'creator'); update public.example set created_by = '00000000-0000-0000-0000-0000000000ff' where id = '$DRAFT'; set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "admin can tag an approved example"      YES "$(q authenticated $E "$CATS set local role authenticated; $(tag $PUBLISHED "'Verbs'")")"
check "recorder cannot tag"                      no "$(q authenticated $C "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "anon cannot tag"                          no "$(q anon "" "$CATS set local role anon; $(tag $PUBLISHED "'Verbs'")")"
check "tags are written only through the function" no "$(q authenticated $E "$CATS set local role authenticated; select public._p(\$q\$insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED' from public.categories\$q\$);")"
for operation in "update public.categories_example set category_id = (select id from public.categories where category_type='Nouns') where example_id='$PUBLISHED'" "delete from public.categories_example where example_id='$PUBLISHED'"; do
  check "direct tag update/delete is refused" no "$(q authenticated $E "$CATS insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED' from public.categories where category_type='Verbs'; set local role authenticated; select public._p(\$q\$$operation\$q\$);")"
done
check "anon sees published tags, not draft tags"   1 "$(q anon "" "$CATS insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED'::uuid from public.categories where category_type = 'Verbs' union all select id, '$DRAFT'::uuid from public.categories where category_type = 'Verbs'; set local role anon; select count(*) from public.categories_example;")"
check "deleting a category removes its tags"     1,0 "$(q authenticated $E "$CATS insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED' from public.categories where category_type = 'Verbs'; create temp table n as select count(*) as before from public.categories_example; set local role authenticated; delete from public.categories where category_type = 'Verbs'; reset role; select (select before from n) || ',' || count(*) from public.categories_example;" | tail -1)"

echo "creator consent: one agreed row per person per form version"
CC=public.creator_consent
V=placeholder-v1
OK_ANSWERS='{"box1":true,"box2":true}'
own () { echo "insert into $CC(form_version,answers) values ('$V','$OK_ANSWERS')"; }
seed () { echo "reset role; insert into $CC(user_id,form_version,answers) values ('$1','$V','$OK_ANSWERS');"; }
try () { echo "select public._p(\$q\$$1\$q\$);"; }
column_default () { q postgres "" "select column_default from information_schema.columns where table_schema='public' and table_name='creator_consent' and column_name='$1';"; }
check "creator_consent has RLS enabled" t "$(q postgres "" "select relrowsecurity from pg_class where oid='$CC'::regclass;")"
check "creator_consent columns, types, not null" 5 "$(q postgres "" "select count(*) from information_schema.columns where table_schema='public' and table_name='creator_consent' and is_nullable='NO' and (column_name,data_type) in (('id','uuid'),('user_id','uuid'),('form_version','text'),('answers','jsonb'),('created_at','timestamp with time zone'));")"
check "creator_consent has exactly 5 columns" 5 "$(q postgres "" "select count(*) from information_schema.columns where table_schema='public' and table_name='creator_consent';")"
check "creator_consent id is the primary key" 1 "$(q postgres "" "select count(*) from pg_constraint where conrelid='$CC'::regclass and contype='p' and conkey=array[(select attnum from pg_attribute where attrelid='$CC'::regclass and attname='id')];")"
check "creator_consent id defaults to random uuid" gen_random_uuid\(\) "$(column_default id)"
check "creator_consent user_id defaults to auth.uid()" auth.uid\(\) "$(column_default user_id)"
check "creator_consent created_at defaults to now()" now\(\) "$(column_default created_at)"
check "creator_consent user_id references profiles, no cascade" 1 "$(q postgres "" "select count(*) from pg_constraint where conrelid='$CC'::regclass and confrelid='public.profiles'::regclass and contype='f' and confdeltype in ('a','r') and conkey=array[(select attnum from pg_attribute where attrelid='$CC'::regclass and attname='user_id')];")"
check "creator_consent unique (user_id, form_version)" 1 "$(q postgres "" "select count(*) from pg_constraint where conrelid='$CC'::regclass and contype='u' and (select array_agg(attname::text order by attname) from pg_attribute where attrelid='$CC'::regclass and attnum = any(conkey)) = array['form_version','user_id'];")"
check "defaults fill user, id and timestamp" t "$(q authenticated $D "$(own); reset role; select user_id='$D'::uuid and id is not null and created_at=now() from $CC;" | tail -1)"
check "same person, same version twice is refused" no "$(q authenticated $D "$(own); $(try "$(own)")" | tail -1)"
check "same person, another version is allowed" YES "$(q authenticated $D "$(own); $(try "insert into $CC(form_version,answers) values ('v2','$OK_ANSWERS')")" | tail -1)"
check "two people, same version is allowed" YES "$(q authenticated $D "$(seed $A) set local role authenticated; $(try "$(own)")" | tail -1)"

for answers in '{"box1":true,"box2":false}' '{"box1":false}' '{}' '[true]' '[]' 'true' '{"box1":"true"}' '{"box1":1}' '{"box1":null}' '{"box1":[true]}' '{"box1":[]}'; do
  check "answers refused: $answers" no "$(q authenticated $D "$(try "insert into $CC(form_version,answers) values ('$V','$answers')")")"
done
check "answers refused: null" no "$(q authenticated $D "$(try "insert into $CC(form_version,answers) values ('$V',null)")")"
check "answers accepted: one true box" YES "$(q authenticated $D "$(try "insert into $CC(form_version,answers) values ('$V','{\"box1\":true}')")")"
for version in "''" "'   '" "repeat('x',51)" "null"; do
  check "form_version refused: $version" no "$(q authenticated $D "$(try "insert into $CC(form_version,answers) values ($version,'$OK_ANSWERS')")")"
done
for version in "'x'" "repeat('x',50)" "'  ' || repeat('x',50) || '  '"; do
  check "form_version accepted: $version" YES "$(q authenticated $D "$(try "insert into $CC(form_version,answers) values ($version,'$OK_ANSWERS')")")"
done

for uid in "$A" "$B" "$C" "$D" "$E"; do
  other=$A; [ "$uid" = "$A" ] && other=$B
  check "$uid inserts own consent" YES "$(q authenticated "$uid" "$(try "$(own)")")"
  check "$uid inserts own consent with own user_id" YES "$(q authenticated "$uid" "$(try "insert into $CC(user_id,form_version,answers) values ('$uid','$V','$OK_ANSWERS')")")"
  check "$uid cannot consent for another person" no "$(q authenticated "$uid" "$(try "insert into $CC(user_id,form_version,answers) values ('$other','$V','$OK_ANSWERS')")")"
  check "$uid cannot set id" no "$(q authenticated "$uid" "$(try "insert into $CC(id,form_version,answers) values (gen_random_uuid(),'$V','$OK_ANSWERS')")")"
  check "$uid cannot set created_at" no "$(q authenticated "$uid" "$(try "insert into $CC(created_at,form_version,answers) values ('2000-01-01','$V','$OK_ANSWERS')")")"
  check "$uid reads own consent" 1 "$(q authenticated "$uid" "$(seed "$uid") set local role authenticated; select count(*) from $CC where user_id='$uid';" | tail -1)"
  for operation in "update $CC set form_version='changed'" "delete from $CC"; do
    check "$uid cannot ${operation%% *} consent" no "$(q authenticated "$uid" "$(seed "$uid") $(seed "$other") set local role authenticated; $(try "$operation")" | tail -1)"
  done
done
for uid in "$A" "$B" "$C" "$D"; do
  check "$uid cannot read another's consent" 0 "$(q authenticated "$uid" "$(seed $E) set local role authenticated; select count(*) from $CC;" | tail -1)"
done
check "admin reads everyone's consent" 2 "$(q authenticated $E "$(seed $A) $(seed $D) set local role authenticated; select count(*) from $CC;" | tail -1)"
check "anon cannot insert consent" no "$(q anon "" "$(try "insert into $CC(user_id,form_version,answers) values ('$A','$V','$OK_ANSWERS')")")"
check "anon cannot read consent" no "$(q anon "" "$(seed $A) set local role anon; $(try "select 1 from $CC")" | tail -1)"
for operation in "update $CC set form_version='changed'" "delete from $CC"; do
  check "anon cannot ${operation%% *} consent" no "$(q anon "" "$(seed $A) set local role anon; $(try "$operation")" | tail -1)"
done

FN="'public.has_creator_consent(uuid)'::regprocedure"
check "has_creator_consent is stable security definer" true,s "$(q postgres "" "select prosecdef::text || ',' || provolatile::text from pg_proc where oid=$FN;")"
check "has_creator_consent pins search_path to public" t "$(q postgres "" "select 'search_path=public' = any(proconfig) from pg_proc where oid=$FN;")"
check "has_creator_consent returns boolean" boolean "$(q postgres "" "select prorettype::regtype from pg_proc where oid=$FN;")"
check "anon cannot execute has_creator_consent" f "$(q postgres "" "select has_function_privilege('anon',$FN,'execute');")"
check "authenticated can execute has_creator_consent" t "$(q postgres "" "select has_function_privilege('authenticated',$FN,'execute');")"
check "PUBLIC has no execute on has_creator_consent" t "$(q postgres "" "select proacl is not null and not exists (select 1 from aclexplode(proacl) where grantee=0) from pg_proc where oid=$FN;")"
check "has_creator_consent false without a row" f "$(q authenticated $D "select public.has_creator_consent('$D');")"
check "has_creator_consent true with a row" t "$(q authenticated $D "$(seed $D) set local role authenticated; select public.has_creator_consent('$D');" | tail -1)"
check "has_creator_consent true for any version" t "$(q authenticated $D "reset role; insert into $CC(user_id,form_version,answers) values ('$D','other-v9','$OK_ANSWERS'); set local role authenticated; select public.has_creator_consent('$D');" | tail -1)"
# Nobody may probe another person's consent, except an admin.
for uid in "$A" "$B" "$C"; do
  check "$uid probing D's consent gets false" f "$(q authenticated "$uid" "$(seed $D) set local role authenticated; select public.has_creator_consent('$D');" | tail -1)"
done
check "D asking about own consent gets true" t "$(q authenticated $D "$(seed $D) set local role authenticated; select public.has_creator_consent('$D');" | tail -1)"
check "admin asking about D's consent gets true" t "$(q authenticated $E "$(seed $D) set local role authenticated; select public.has_creator_consent('$D');" | tail -1)"

echo "creator consent: creating examples needs consent"
NEW_EXAMPLE=$'insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',false)'
check "creator without consent cannot create an example" no "$(q authenticated $D "$(try "$NEW_EXAMPLE")")"
check "creator with consent can create an example"     YES "$(q authenticated $D "$CONSENT_D $(try "$NEW_EXAMPLE")" | tail -1)"
check "another person's consent does not help a creator" no "$(q authenticated $D "$(seed $A) set local role authenticated; $(try "$NEW_EXAMPLE")" | tail -1)"
PUBLISHED_EXAMPLE=$'insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',true)'
check "consented creator still cannot publish directly" no "$(q authenticated $D "$CONSENT_D $(try "$PUBLISHED_EXAMPLE")" | tail -1)"
check "consented creator still cannot set another owner" no "$(q authenticated $D "$CONSENT_D $(try "insert into public.example(width,height,title,\"user\",verification_status,created_by) values (1,1,'x','x',false,'$E')")" | tail -1)"
check "admin without consent can create an example"    YES "$(q authenticated $E "$(try "$NEW_EXAMPLE")")"
check "recorder with consent still cannot create one"   no "$(q authenticated $C "$(seed $C) set local role authenticated; $(try "$NEW_EXAMPLE")" | tail -1)"

echo "recording consent: self rows once per version, someone-else rows tied to a session"
RC=public.recording_consent
OLD_SESSION=50000000-0000-0000-0000-000000000003  # exists, unverified, on example 1
NEW_SESSION=50000000-0000-0000-0000-0000000000aa
OTHER_SESSION=50000000-0000-0000-0000-0000000000bb
OWN_EXAMPLE=e0000000-0000-0000-0000-000000000001     # approved, created by D
OWN_DRAFT=e0000000-0000-0000-0000-000000000003       # unapproved, created by D, hidden from D
FOREIGN_EXAMPLE=e0000000-0000-0000-0000-0000000000bb # approved, created by E, seeded below
SEED_FOREIGN="reset role; insert into public.example(id,width,height,title,\"user\",verification_status,created_by) values ('$FOREIGN_EXAMPLE',1,1,'x','x',true,'$E'); set local role authenticated;"
rown () { echo "insert into $RC(form_version,answers) values ('$V','$OK_ANSWERS')"; }
rfor () { echo "insert into $RC(subject_name,recording_session_id,form_version,answers) values ('Ana','$1','$V','$OK_ANSWERS')"; }
rseed () { echo "reset role; insert into $RC(user_id,form_version,answers) values ('$1','$V','$OK_ANSWERS');"; }
rseed_for () { echo "reset role; insert into $RC(user_id,subject_name,recording_session_id,form_version,answers) values ('$1','Ana','$2','$V','$OK_ANSWERS');"; }
rcol_default () { q postgres "" "select column_default from information_schema.columns where table_schema='public' and table_name='recording_consent' and column_name='$1';"; }
rattnum () { echo "(select attnum from pg_attribute where attrelid='$RC'::regclass and attname='$1')"; }

check "recording_consent has RLS enabled" t "$(q postgres "" "select relrowsecurity from pg_class where oid='$RC'::regclass;")"
check "recording_consent columns, types, nullability" 7 "$(q postgres "" "select count(*) from information_schema.columns where table_schema='public' and table_name='recording_consent' and (column_name,data_type,is_nullable) in (('id','uuid','NO'),('user_id','uuid','NO'),('subject_name','text','YES'),('recording_session_id','uuid','YES'),('form_version','text','NO'),('answers','jsonb','NO'),('created_at','timestamp with time zone','NO'));")"
check "recording_consent has exactly 7 columns" 7 "$(q postgres "" "select count(*) from information_schema.columns where table_schema='public' and table_name='recording_consent';")"
check "recording_consent id is the primary key" 1 "$(q postgres "" "select count(*) from pg_constraint where conrelid='$RC'::regclass and contype='p' and conkey=array[$(rattnum id)];")"
check "recording_consent id defaults to random uuid" gen_random_uuid\(\) "$(rcol_default id)"
check "recording_consent user_id defaults to auth.uid()" auth.uid\(\) "$(rcol_default user_id)"
check "recording_consent created_at defaults to now()" now\(\) "$(rcol_default created_at)"
check "recording_consent user_id references profiles, no cascade" 1 "$(q postgres "" "select count(*) from pg_constraint where conrelid='$RC'::regclass and confrelid='public.profiles'::regclass and contype='f' and confdeltype in ('a','r') and conkey=array[$(rattnum user_id)];")"
check "session link is set null, deferrable, initially deferred" n,true,true "$(q postgres "" "select confdeltype::text || ',' || condeferrable::text || ',' || condeferred::text from pg_constraint where conrelid='$RC'::regclass and confrelid='public.recording_session'::regclass and contype='f' and conkey=array[$(rattnum recording_session_id)];")"
check "self rows unique per (user_id, form_version)" 1 "$(q postgres "" "select count(*) from pg_index where indrelid='$RC'::regclass and indisunique and indpred is not null and pg_get_expr(indpred, indrelid) ilike '%subject_name IS NULL%' and (select array_agg(attname::text order by attname) from pg_attribute where attrelid='$RC'::regclass and attnum = any(indkey)) = array['form_version','user_id'];")"
check "defaults fill user, id and timestamp" t "$(q authenticated $C "$(rown); reset role; select user_id='$C'::uuid and id is not null and created_at=now() and subject_name is null from $RC;" | tail -1)"
# Inserts a link to a session that never appears, then forces the deferred check; returns the SQLSTATE.
FK_STATE="reset role; create function pg_temp.fk_state() returns text language plpgsql as \$\$ begin $(rfor $NEW_SESSION); set constraints all immediate; return 'kept'; exception when others then return SQLSTATE; end; \$\$; set local role authenticated;"
check "a link to a missing session fails once checked" 23503 "$(q authenticated $C "$FK_STATE select pg_temp.fk_state();" | tail -1)"
check "a link to a session made later in the same transaction is fine" ok "$(q authenticated $C "$(rfor $NEW_SESSION); reset role; insert into public.recording_session(id,example_id,\"user\",language) values ('$NEW_SESSION','$OWN_EXAMPLE','Rita','L'); set constraints all immediate; select 'ok';" 2>/dev/null | tail -1)"
check "deleting the session keeps the name and drops the link" Ana, "$(q postgres "" "insert into public.recording_session(id,example_id,\"user\",language) values ('$NEW_SESSION','$OWN_EXAMPLE','Rita','L'); $(rseed_for $C $NEW_SESSION) set constraints all immediate; delete from public.recording_session where id='$NEW_SESSION'; select subject_name || ',' || coalesce(recording_session_id::text,'') from $RC;" | tail -1)"
check "a session link needs a subject name" no "$(q authenticated $C "$(try "insert into $RC(recording_session_id,form_version,answers) values ('$NEW_SESSION','$V','$OK_ANSWERS')")")"
check "a someone-else row linked to a new session is allowed" YES "$(q authenticated $C "$(try "$(rfor $NEW_SESSION)")")"
# A consent row may only be linked to a session that does not exist yet.
for uid in "$C" "$D" "$E"; do
  check "$uid cannot link consent to an existing session" no "$(q authenticated "$uid" "$(try "$(rfor $OLD_SESSION)")")"
done
check "a someone-else row without a session link is allowed" YES "$(q authenticated $C "$(try "insert into $RC(subject_name,form_version,answers) values ('Ana','$V','$OK_ANSWERS')")")"

for answers in '{"box1":true,"box2":false}' '{"box1":false}' '{}' '[true]' '[]' 'true' '{"box1":"true"}' '{"box1":1}' '{"box1":null}' '{"box1":[true]}' '{"box1":[]}'; do
  check "recording answers refused: $answers" no "$(q authenticated $C "$(try "insert into $RC(form_version,answers) values ('$V','$answers')")")"
done
check "recording answers refused: null" no "$(q authenticated $C "$(try "insert into $RC(form_version,answers) values ('$V',null)")")"
check "recording answers accepted: one true box" YES "$(q authenticated $C "$(try "insert into $RC(form_version,answers) values ('$V','{\"box1\":true}')")")"
for version in "''" "'   '" "repeat('x',51)" "null"; do
  check "recording form_version refused: $version" no "$(q authenticated $C "$(try "insert into $RC(form_version,answers) values ($version,'$OK_ANSWERS')")")"
done
for version in "'x'" "repeat('x',50)" "'  ' || repeat('x',50) || '  '"; do
  check "recording form_version accepted: $version" YES "$(q authenticated $C "$(try "insert into $RC(form_version,answers) values ($version,'$OK_ANSWERS')")")"
done
for name in "''" "'   '" "repeat('x',101)"; do
  check "subject_name refused: $name" no "$(q authenticated $C "$(try "insert into $RC(subject_name,form_version,answers) values ($name,'$V','$OK_ANSWERS')")")"
done
for name in "'x'" "repeat('x',100)" "'  ' || repeat('x',100) || '  '"; do
  check "subject_name accepted: $name" YES "$(q authenticated $C "$(try "insert into $RC(subject_name,form_version,answers) values ($name,'$V','$OK_ANSWERS')")")"
done

check "same person, same version, self twice is refused" no "$(q authenticated $C "$(rown); $(try "$(rown)")" | tail -1)"
check "same person, another version, self is allowed" YES "$(q authenticated $C "$(rown); $(try "insert into $RC(form_version,answers) values ('v2','$OK_ANSWERS')")" | tail -1)"
check "two people, same version, self is allowed" YES "$(q authenticated $C "$(rseed $A) set local role authenticated; $(try "$(rown)")" | tail -1)"
check "someone-else rows may repeat" YES "$(q authenticated $C "$(rfor $NEW_SESSION); $(try "$(rfor $NEW_SESSION)")" | tail -1)"
check "a self row and a someone-else row may share a version" YES "$(q authenticated $C "$(rown); $(try "$(rfor $NEW_SESSION)")" | tail -1)"

for uid in "$A" "$B" "$C" "$D" "$E"; do
  other=$A; [ "$uid" = "$A" ] && other=$B
  # Only recorders, creators and admins may give recording consent.
  may=YES; { [ "$uid" = "$A" ] || [ "$uid" = "$B" ]; } && may=no
  check "$uid inserts own recording consent" $may "$(q authenticated "$uid" "$(try "$(rown)")")"
  check "$uid inserts own someone-else consent" $may "$(q authenticated "$uid" "$(try "$(rfor $NEW_SESSION)")")"
  check "$uid inserts own recording consent with own user_id" $may "$(q authenticated "$uid" "$(try "insert into $RC(user_id,form_version,answers) values ('$uid','$V','$OK_ANSWERS')")")"
  check "$uid cannot record consent as another person" no "$(q authenticated "$uid" "$(try "insert into $RC(user_id,form_version,answers) values ('$other','$V','$OK_ANSWERS')")")"
  check "$uid cannot set recording consent id" no "$(q authenticated "$uid" "$(try "insert into $RC(id,form_version,answers) values (gen_random_uuid(),'$V','$OK_ANSWERS')")")"
  check "$uid cannot set recording consent created_at" no "$(q authenticated "$uid" "$(try "insert into $RC(created_at,form_version,answers) values ('2000-01-01','$V','$OK_ANSWERS')")")"
  check "$uid reads own recording consent" 2 "$(q authenticated "$uid" "$(rseed "$uid") $(rseed_for "$uid" $OLD_SESSION) set local role authenticated; select count(*) from $RC where user_id='$uid';" | tail -1)"
  for operation in "update $RC set form_version='changed'" "update $RC set subject_name='Someone'" "delete from $RC"; do
    check "$uid cannot ${operation%% *} recording consent: ${operation#* set }" no "$(q authenticated "$uid" "$(rseed "$uid") $(rseed_for "$uid" $OLD_SESSION) $(rseed "$other") set local role authenticated; $(try "$operation")" | tail -1)"
  done
done
for uid in "$A" "$B" "$C" "$D"; do
  check "$uid cannot read another's recording consent" 0 "$(q authenticated "$uid" "$(rseed $E) $(rseed_for $E $OLD_SESSION) set local role authenticated; select count(*) from $RC;" | tail -1)"
done
check "admin reads everyone's recording consent" 3 "$(q authenticated $E "$(rseed $A) $(rseed $C) $(rseed_for $C $OLD_SESSION) set local role authenticated; select count(*) from $RC;" | tail -1)"
check "anon cannot insert recording consent" no "$(q anon "" "$(try "insert into $RC(user_id,form_version,answers) values ('$A','$V','$OK_ANSWERS')")")"
check "anon cannot read recording consent" no "$(q anon "" "$(rseed $A) set local role anon; $(try "select 1 from $RC")" | tail -1)"
for operation in "update $RC set form_version='changed'" "delete from $RC"; do
  check "anon cannot ${operation%% *} recording consent" no "$(q anon "" "$(rseed $A) set local role anon; $(try "$operation")" | tail -1)"
done

echo "recording consent: helper functions"
for fn in has_recording_consent has_session_consent owns_example recording_session_exists; do
  FN="'public.$fn(uuid)'::regprocedure"
  check "$fn is stable security definer" true,s "$(q postgres "" "select prosecdef::text || ',' || provolatile::text from pg_proc where oid=$FN;")"
  check "$fn pins search_path to public" t "$(q postgres "" "select 'search_path=public' = any(proconfig) from pg_proc where oid=$FN;")"
  check "$fn returns boolean" boolean "$(q postgres "" "select prorettype::regtype from pg_proc where oid=$FN;")"
  check "anon cannot execute $fn" f "$(q postgres "" "select has_function_privilege('anon',$FN,'execute');")"
  check "authenticated can execute $fn" t "$(q postgres "" "select has_function_privilege('authenticated',$FN,'execute');")"
  check "PUBLIC has no execute on $fn" t "$(q postgres "" "select proacl is not null and not exists (select 1 from aclexplode(proacl) where grantee=0) from pg_proc where oid=$FN;")"
done
check "has_recording_consent false without a row" f "$(q authenticated $C "select public.has_recording_consent('$C');")"
check "has_recording_consent true with a self row" t "$(q authenticated $C "$(rseed $C) set local role authenticated; select public.has_recording_consent('$C');" | tail -1)"
check "has_recording_consent true for any version" t "$(q authenticated $C "reset role; insert into $RC(user_id,form_version,answers) values ('$C','other-v9','$OK_ANSWERS'); set local role authenticated; select public.has_recording_consent('$C');" | tail -1)"
check "has_recording_consent ignores someone-else rows" f "$(q authenticated $C "$(rseed_for $C $OLD_SESSION) reset role; insert into $RC(user_id,subject_name,form_version,answers) values ('$C','Ana','$V','$OK_ANSWERS'); set local role authenticated; select public.has_recording_consent('$C');" | tail -1)"
for uid in "$A" "$B" "$D"; do
  check "$uid probing C's recording consent gets false" f "$(q authenticated "$uid" "$(rseed $C) set local role authenticated; select public.has_recording_consent('$C');" | tail -1)"
done
check "admin asking about C's recording consent gets true" t "$(q authenticated $E "$(rseed $C) set local role authenticated; select public.has_recording_consent('$C');" | tail -1)"
check "has_session_consent true for own linked row" t "$(q authenticated $C "$(rseed_for $C $OLD_SESSION) set local role authenticated; select public.has_session_consent('$OLD_SESSION');" | tail -1)"
check "has_session_consent false without a linked row" f "$(q authenticated $C "$(rseed $C) set local role authenticated; select public.has_session_consent('$OLD_SESSION');" | tail -1)"
check "has_session_consent false for another person's linked row" f "$(q authenticated $D "$(rseed_for $C $OLD_SESSION) set local role authenticated; select public.has_session_consent('$OLD_SESSION');" | tail -1)"
check "has_session_consent false for another session" f "$(q authenticated $C "$(rseed_for $C $OLD_SESSION) set local role authenticated; select public.has_session_consent('$OTHER_SESSION');" | tail -1)"
check "recording_session_exists true for an existing session" t "$(q authenticated $C "select public.recording_session_exists('$OLD_SESSION');")"
check "recording_session_exists true for a session hidden from the caller" t "$(q authenticated $A "select public.recording_session_exists('$OLD_SESSION');")"
check "recording_session_exists false for a missing session" f "$(q authenticated $C "select public.recording_session_exists('$NEW_SESSION');")"
check "owns_example true for own approved example" t "$(q authenticated $D "select public.owns_example('$OWN_EXAMPLE');")"
check "owns_example true for own hidden draft" t "$(q authenticated $D "select public.owns_example('$OWN_DRAFT');")"
check "owns_example false for another's example" f "$(q authenticated $D "$SEED_FOREIGN select public.owns_example('$FOREIGN_EXAMPLE');" | tail -1)"
check "owns_example false for a non-owner" f "$(q authenticated $C "select public.owns_example('$OWN_DRAFT');")"
check "owns_example false for a missing example" f "$(q authenticated $D "select public.owns_example('e0000000-0000-0000-0000-0000000000ff');")"
check "owns_example false for an ownerless example" f "$(q authenticated $D "reset role; update public.example set created_by=null where id='$OWN_DRAFT'; set local role authenticated; select public.owns_example('$OWN_DRAFT');" | tail -1)"

echo "recording consent: submitting for someone else in one call"
RPC="'public.submit_recording_session_for_other(uuid,uuid,text,text,text,text,jsonb)'::regprocedure"
rpc () { echo "select public.submit_recording_session_for_other('$1','$2','L','Rita',$3,'$V','$OK_ANSWERS');"; }
# Calls the rpc and reports success or failed, so the caller can count what was left behind.
RPC_STATE='reset role; create function pg_temp.rpc_state(s uuid, ex uuid, who text) returns text language plpgsql as $$ begin perform public.submit_recording_session_for_other(s, ex, $l$L$l$, $l$Rita$l$, who, $l$placeholder-v1$l$, $l${"box1":true,"box2":true}$l$::jsonb); return $l$success$l$; exception when others then return $l$failed$l$; end; $$; set local role authenticated;'
SAVED="reset role; select (select count(*) from public.recording_session where id='$NEW_SESSION') || ',' || (select count(*) from $RC where recording_session_id='$NEW_SESSION' and subject_name='Ana' and form_version='$V' and answers='$OK_ANSWERS'::jsonb);"
check "rpc is security invoker" false "$(q postgres "" "select prosecdef::text from pg_proc where oid=$RPC;")"
check "rpc is plpgsql returning void" plpgsql,void "$(q postgres "" "select l.lanname || ',' || p.prorettype::regtype from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=$RPC;")"
check "rpc pins search_path to public" t "$(q postgres "" "select 'search_path=public' = any(proconfig) from pg_proc where oid=$RPC;")"
check "anon cannot execute the rpc" f "$(q postgres "" "select has_function_privilege('anon',$RPC,'execute');")"
check "authenticated can execute the rpc" t "$(q postgres "" "select has_function_privilege('authenticated',$RPC,'execute');")"
check "PUBLIC has no execute on the rpc" t "$(q postgres "" "select proacl is not null and not exists (select 1 from aclexplode(proacl) where grantee=0) from pg_proc where oid=$RPC;")"
check "recorder without self consent records for someone else" 1,1 "$(q authenticated $C "$(rpc $NEW_SESSION $OWN_EXAMPLE "'Ana'") $SAVED" | tail -1)"
check "rpc consent row belongs to the caller" $C "$(q authenticated $C "$(rpc $NEW_SESSION $OWN_EXAMPLE "'Ana'") reset role; select user_id from $RC where recording_session_id='$NEW_SESSION';" | tail -1)"
for uid in "$C" "$D"; do
  check "$uid rpc session stays unverified" f "$(q authenticated "$uid" "$(rpc $NEW_SESSION $OWN_EXAMPLE "'Ana'") reset role; select verification_status from public.recording_session where id='$NEW_SESSION';" | tail -1)"
done
check "admin rpc session is verified" t "$(q authenticated $E "$(rpc $NEW_SESSION $OWN_EXAMPLE "'Ana'") reset role; select verification_status from public.recording_session where id='$NEW_SESSION';" | tail -1)"
check "a refused session leaves no consent row (viewer)" failed,0 "$(q authenticated $A "$RPC_STATE select pg_temp.rpc_state('$NEW_SESSION','$OWN_EXAMPLE','Ana'); reset role; select count(*) from $RC;" | paste -sd, -)"
check "a failed session insert leaves no consent row (taken id)" failed,0 "$(q authenticated $C "$RPC_STATE select pg_temp.rpc_state('$OLD_SESSION','$OWN_EXAMPLE','Ana'); reset role; select count(*) from $RC;" | paste -sd, -)"
check "a blank subject name saves neither row" failed,0,0 "$(q authenticated $C "$RPC_STATE select pg_temp.rpc_state('$NEW_SESSION','$OWN_EXAMPLE','  '); reset role; select count(*) from $RC; select count(*) from public.recording_session where id='$NEW_SESSION';" | paste -sd, -)"
check "anon cannot call the rpc" no "$(q anon "" "select public._p(\$q\$$(rpc $NEW_SESSION $OWN_EXAMPLE "'Ana'")\$q\$);")"

echo "recording consent: submitting a session needs consent"
session () { echo "insert into public.recording_session(id,example_id,\"user\",language,verification_status) values ('$NEW_SESSION','$1','Rita','L',false)"; }
check "recorder without consent cannot submit a session" no "$(q authenticated $C "$(try "$(session $OWN_EXAMPLE)")")"
check "recorder with self consent can submit a session" YES "$(q authenticated $C "$(rseed $C) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "recorder with consent for this session can submit it" YES "$(q authenticated $C "$(rseed_for $C $NEW_SESSION) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "consent for a different session does not help" no "$(q authenticated $C "$(rseed_for $C $OLD_SESSION) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "another person's self consent does not help" no "$(q authenticated $C "$(rseed $A) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "another person's consent for this session does not help" no "$(q authenticated $C "$(rseed_for $A $NEW_SESSION) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "recorder with consent still cannot submit verified" no "$(q authenticated $C "$(rseed $C) set local role authenticated; $(try "insert into public.recording_session(example_id,\"user\",language,verification_status) values ('$OWN_EXAMPLE','Rita','L',true)")" | tail -1)"
check "creator without any consent cannot submit a session" no "$(q authenticated $D "$(try "$(session $OWN_EXAMPLE)")")"
check "creator consent covers a session on own example" YES "$(q authenticated $D "$CONSENT_D $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "creator consent covers a session on own hidden draft" YES "$(q authenticated $D "$CONSENT_D $(try "$(session $OWN_DRAFT)")" | tail -1)"
check "creator consent does not cover another's example" no "$(q authenticated $D "$SEED_FOREIGN $CONSENT_D $(try "$(session $FOREIGN_EXAMPLE)")" | tail -1)"
check "creator with recording consent can record another's example" YES "$(q authenticated $D "$SEED_FOREIGN $(rseed $D) set local role authenticated; $(try "$(session $FOREIGN_EXAMPLE)")" | tail -1)"
check "creator with only recording consent can record own example" YES "$(q authenticated $D "$(rseed $D) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
check "admin without consent can submit a session" YES "$(q authenticated $E "$(try "$(session $OWN_EXAMPLE)")")"
check "admin without consent can submit a verified session" YES "$(q authenticated $E "$(try "insert into public.recording_session(example_id,\"user\",language,verification_status) values ('$OWN_EXAMPLE','Rita','L',true)")")"
for uid in "$A" "$B"; do
  check "$uid with recording consent still cannot submit" no "$(q authenticated "$uid" "$(rseed "$uid") $(rseed_for "$uid" $NEW_SESSION) set local role authenticated; $(try "$(session $OWN_EXAMPLE)")" | tail -1)"
done
check "anon cannot submit a session" no "$(q anon "" "$(try "$(session $OWN_EXAMPLE)")")"

echo
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $fail
