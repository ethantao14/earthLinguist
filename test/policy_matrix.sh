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

for migration in 0010_creator_consent.sql 0010_rollback.sql 0011_require_creator_consent.sql 0011_rollback.sql; do
  if [ -s "$(dirname "$0")/../db/$migration" ]; then present=yes; else present=no; fi
  check "migration delivered: $migration" yes "$present"
done

# Since 0011 a creator needs a consent row to create examples. Seeds one for D.
CONSENT_D=$'reset role; insert into public.creator_consent(user_id,form_version,answers) values (\'00000000-0000-0000-0000-00000000000d\',\'placeholder-v1\',\'{"box1":true,"box2":true}\'); set local role authenticated;'

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
check "creator cannot submit pre-verified session"     no "$(q authenticated $D $'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Cora\',\'L\',true)$q$);')"
check "admin may publish directly"                    YES "$(q authenticated $E $'select public._p($q$insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',true)$q$);')"
check "recorder submits, must stay unverified"  no "$(q authenticated $C $'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Rita\',\'L\',true)$q$);')"
check "recorder submits unverified work"       YES "$(q authenticated $C $'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Rita\',\'L\',false)$q$);')"

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

for answers in '{"box1":true,"box2":false}' '{"box1":false}' '{}' '[true]' '[]' 'true' '{"box1":"true"}' '{"box1":1}' '{"box1":null}'; do
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

echo
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $fail
