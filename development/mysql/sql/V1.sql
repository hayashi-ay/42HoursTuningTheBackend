CREATE INDEX value_index on session(value);
CREATE INDEX user_id_index on group_member(user_id);
CREATE UNIQUE INDEX updated_at_record_id_index ON record (updated_at, record_id);
CREATE INDEX linked_record_id_index on record_comment(linked_record_id);
CREATE UNIQUE INDEX linked_record_id_created_at_index ON record_comment (linked_record_id, created_at);
