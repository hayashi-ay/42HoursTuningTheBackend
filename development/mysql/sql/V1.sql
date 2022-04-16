-- select * from record_comment where linked_record_id = '82999' order by created_at desc;
CREATE UNIQUE INDEX linked_record_id_created_at_index ON record_comment(linked_record_id, created_at);

-- select * from record_item_file where linked_record_id = '2cf0aae0-c38d-4cd9-be64-0ffbf04539b3' order by item_id asc limit 1;
CREATE INDEX linked_record_id_index ON record_item_file(linked_record_id);

-- select record_id from record where status = "closed" order by updated_at desc, record_id asc limit 10 offset 0;
CREATE INDEX status_updated_at_index ON record(status, updated_at);

-- select count(*) from record where status = "open" and (category_id, application_group) in ( (3, 461), (3, 462), (3, 463), (3, 464), (3, 465) );
CREATE INDEX status_category_id_index ON record(status, category_id);

CREATE INDEX value_index on session(value);
CREATE INDEX user_id_index on group_member(user_id);
CREATE INDEX linked_record_id_index on record_comment(linked_record_id);
CREATE INDEX user_id_index on user(user_id);
CREATE INDEX group_id_index on group_info(group_id);
CREATE INDEX gid_index on group_info(group_id);
CREATE INDEX category_id_index on category(categoty_id);
CREATE INDEX group_index on category_group(group_id);
CREATE UNIQUE INDEX updated_at_record_id_index ON record(updated_at, record_id);
CREATE UNIQUE INDEX linked_record_and_item_index ON record_item_file(linked_record_id, item_id);
