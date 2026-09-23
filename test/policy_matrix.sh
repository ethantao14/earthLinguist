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
check "recorder cannot approve"                no "$(q authenticated $C $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "creator cannot approve"                 no "$(q authenticated $D $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "admin can approve"                     YES "$(q authenticated $E $'select public._p($q$update public.example set verification_status=true where id=\'e0000000-0000-0000-0000-000000000003\'$q$);')"
check "nobody can promote themselves"          no "$(q authenticated $C $'select public._p($q$update public.profiles set status=\'admin\' where id=auth.uid()$q$);')"
check "anon cannot delete legacy audio_clips"  no "$(q anon "" $'select public._p($q$delete from public.audio_clips$q$);')"

echo "the approval gate itself"
check "recorder submits, must stay unverified"  no "$(q authenticated $C $'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Rita\',\'L\',true)$q$);')"
check "recorder submits unverified work"       YES "$(q authenticated $C $'select public._p($q$insert into public.recording_session(example_id,"user",language,verification_status) values (\'e0000000-0000-0000-0000-000000000001\',\'Rita\',\'L\',false)$q$);')"

echo
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $fail
