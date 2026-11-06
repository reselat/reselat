begin;
alter table trade_business.outreach_drafts drop constraint outreach_drafts_state_check;
alter table trade_business.outreach_drafts add constraint outreach_drafts_state_check check(state in ('draft','pending','approved','rejected'));
alter table trade_business.approval_queue drop constraint approval_queue_state_check;
alter table trade_business.approval_queue drop constraint approval_queue_human_actor_id_check;
alter table trade_business.approval_queue add constraint approval_queue_state_check check(state in ('pending','approved','rejected'));
alter table trade_business.approval_queue add constraint approval_queue_human_actor_id_check check((state='pending' and human_actor_id is null) or (state in ('approved','rejected') and human_actor_id is not null));
commit;
