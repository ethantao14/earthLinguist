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

echo "reads: how many rows each role can see"
check "anon sees verified unheld examples"      3 "$(q anon "" 'select count(*) from public.example;')"
check "student sees only class-viewable"        2 "$(q authenticated $B 'select count(*) from public.example;')"
check "creator sees no unverified work"         3 "$(q authenticated $D 'select count(*) from public.example;')"
check "admin sees everything including held"    5 "$(q authenticated $E 'select count(*) from public.example;')"
check "anon sees no held audio"                 1 "$(q anon "" 'select count(*) from public.audio;')"
check "admin sees held audio"                   2 "$(q authenticated $E 'select count(*) from public.audio;')"

echo "writes: who may do what"
check "recorder cannot create an example"      no "$(q authenticated $C $'select public._p($q$insert into public.example(width,height,title,"user") values (1,1,\'x\',\'x\')$q$);')"
check "creator can create an example"         YES "$(q authenticated $D $'select public._p($q$insert into public.example(width,height,title,"user") values (1,1,\'x\',\'x\')$q$);')"
check "example defaults to unapproved" false "$(docker exec -i el-pg psql -U postgres -qtA -c "select column_default from information_schema.columns where table_schema='public' and table_name='example' and column_name='verification_status'")"
check "recorder cannot approve"                no "$(q authenticated $C $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "creator cannot approve"                 no "$(q authenticated $D $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "admin can approve"                     YES "$(q authenticated $E $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "nobody can promote themselves"          no "$(q authenticated $C $'select public._p($q$update public.profiles set status=\'admin\' where id=auth.uid()$q$);')"
check "anon cannot delete legacy audio_clips"  no "$(q anon "" $'select public._p($q$delete from public.audio_clips$q$);')"

echo "the approval gate itself"
check "creator cannot publish a pre-approved example"  no "$(q authenticated $D $'select public._p($q$insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',true)$q$);')"
check "creator can create work awaiting approval"     YES "$(q authenticated $D $'select public._p($q$insert into public.example(width,height,title,"user",verification_status) values (1,1,\'x\',\'x\',false)$q$);')"
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
check "new example records its creator"         $D "$(q authenticated $D $'insert into public.example(id,width,height,title,"user",verification_status) values (\'e0000000-0000-0000-0000-0000000000aa\',1,1,\'x\',\'x\',false); reset role; select created_by from public.example where id=\'e0000000-0000-0000-0000-0000000000aa\';' | tail -1)"
check "creator cannot make one owned by another" no "$(q authenticated $D "select public._p(\$q\$insert into public.example(width,height,title,\"user\",verification_status,created_by) values (1,1,'x','x',false,'$E')\$q\$);")"
check "admin can still create examples"        YES "$(q authenticated $E $'select public._p($q$insert into public.example(width,height,title,"user") values (1,1,\'x\',\'x\')$q$);')"

echo "tags: own creator while a draft, or an admin"
DRAFT=e0000000-0000-0000-0000-000000000003   # unapproved, created by the creator
PUBLISHED=e0000000-0000-0000-0000-000000000001 # approved, created by the creator
CATS=$'reset role; insert into public.categories(category_type) values (\'Verbs\'),(\'Nouns\');'
ids () { echo "array(select id from public.categories where category_type in ($1))"; }
tag () { echo "select public._p(\$q\$select public.set_example_categories('$1', $(ids "$2"))\$q\$);"; }
TAGS_ON () { echo "reset role; select string_agg(c.category_type, ',' order by c.category_type) from public.categories_example ce join public.categories c on c.id = ce.category_id where ce.example_id = '$1';"; }
check "creator tags their own draft"           YES "$(q authenticated $D "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "retagging replaces the old tags"      Nouns "$(q authenticated $D "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'") $(tag $DRAFT "'Nouns'") $(TAGS_ON $DRAFT)" | tail -1)"
check "creator cannot tag own approved example"  no "$(q authenticated $D "$CATS set local role authenticated; $(tag $PUBLISHED "'Verbs'")")"
check "creator cannot tag an ownerless draft"    no "$(q authenticated $D "$CATS update public.example set created_by = null where id = '$DRAFT'; set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "creator cannot tag another's draft"       no "$(q authenticated $D "$CATS insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000ff'); insert into public.profiles(id, first_name, status) values ('00000000-0000-0000-0000-0000000000ff', 'Other', 'creator'); update public.example set created_by = '00000000-0000-0000-0000-0000000000ff' where id = '$DRAFT'; set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "admin can tag an approved example"      YES "$(q authenticated $E "$CATS set local role authenticated; $(tag $PUBLISHED "'Verbs'")")"
check "recorder cannot tag"                      no "$(q authenticated $C "$CATS set local role authenticated; $(tag $DRAFT "'Verbs'")")"
check "anon cannot tag"                          no "$(q anon "" "$CATS set local role anon; $(tag $PUBLISHED "'Verbs'")")"
check "tags are written only through the function" no "$(q authenticated $E "$CATS set local role authenticated; select public._p(\$q\$insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED' from public.categories\$q\$);")"
check "anon sees published tags, not draft tags"   1 "$(q anon "" "$CATS insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED'::uuid from public.categories where category_type = 'Verbs' union all select id, '$DRAFT'::uuid from public.categories where category_type = 'Verbs'; set local role anon; select count(*) from public.categories_example;")"
check "deleting a category removes its tags"     1,0 "$(q authenticated $E "$CATS insert into public.categories_example(category_id, example_id) select id, '$PUBLISHED' from public.categories where category_type = 'Verbs'; create temp table n as select count(*) as before from public.categories_example; set local role authenticated; delete from public.categories where category_type = 'Verbs'; reset role; select (select before from n) || ',' || count(*) from public.categories_example;" | tail -1)"

echo
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $fail
