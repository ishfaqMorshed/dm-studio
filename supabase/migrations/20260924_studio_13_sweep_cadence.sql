-- studio_13_sweep_cadence (R36)
-- The studio-sweep job (jobid 1) requeues stale generations / fin_jobs and nudges studio-generate and
-- finisher-dispatch when queued rows exist. It only fires webhooks when there is queued work and the
-- pipeline is not paused, so a 2-minute cadence is cheap and lets a large batch (100+) drain sooner
-- whenever a callback nudge is missed. Revert with: select cron.alter_job(1, schedule => '*/5 * * * *');
select cron.alter_job(job_id => 1, schedule => '*/2 * * * *');
