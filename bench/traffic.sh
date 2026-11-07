#!/bin/sh
# Real traffic against the codag-pg container. Phases: normal 150s, incident 120s, normal 60s.
# Container: docker run -d --name codag-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=app -e POSTGRES_DB=shop postgres:16-alpine -c log_connections=on -c log_disconnections=on -c log_min_duration_statement=200
# then create roles billing (old-secret), reports, table orders; PGHOST_IP=$(docker exec codag-pg hostname -i)
q(){ docker exec -e PGPASSWORD="$2" codag-pg psql -h $PGHOST_IP -U "$1" -d shop -tAc "$3" >/dev/null 2>&1; }
normal(){ end=$(( $(date +%s) + $1 )); i=0
  while [ $(date +%s) -lt $end ]; do i=$((i+1))
    q app devpass "select sum(total) from orders where id < $((i*37 % 50000))"
    [ $((i % 5)) -eq 0 ] && q reports r3p0rts "select count(*) from orders"
    [ $((i % 9)) -eq 0 ] && q app devpass "select pg_sleep(0.3)"
    sleep 1; done; }
incident(){ end=$(( $(date +%s) + $1 )); i=0
  while [ $(date +%s) -lt $end ]; do i=$((i+1))
    q billing new-secret-2026 "select 1"
    q app devpass "select sum(total) from orders"
    [ $((i % 3)) -eq 0 ] && q app devpass "select pg_sleep(1.2)"
    [ $((i % 17)) -eq 0 ] && q reports wrong "select 1"
    sleep 0.5; done; }
date -u +"normal1 start %FT%TZ"; normal 150
date -u +"incident start %FT%TZ"; incident 120
date -u +"normal2 start %FT%TZ"; normal 60
date -u +"done %FT%TZ"
