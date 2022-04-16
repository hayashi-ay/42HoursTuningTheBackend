-- select * from record_comment where linked_record_id = '82999' order by created_at desc;
CREATE UNIQUE INDEX linked_record_id_created_at_index ON record_comment(linked_record_id, created_at);
