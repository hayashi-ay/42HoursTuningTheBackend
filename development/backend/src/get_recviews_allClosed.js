// GET /record-views/allClosed
// クローズ一覧
const allClosed = async (req, res) => {
    let user = await getLinkedUser(req.headers);
  
    if (!user) {
      res.status(401).send();
      return;
    }
  
    let offset = Number(req.query.offset);
    let limit = Number(req.query.limit);
  
    if (Number.isNaN(offset) || Number.isNaN(limit)) {
      offset = 0;
      limit = 10;
    }
  
    const searchRecordQs = `select r.*,
      u.name as createdByName,
      gi.name as applicationGroupName,
      rc.commentCount
      from record r
      left join user u
      on r.created_by = u.user_id
      left join group_info gi
      on r.application_group = gi.group_id
      left join (
        select linked_record_id, count(*) as commentCount FROM record_comment group by linked_record_id
      ) as rc
      on r.record_id = rc.linked_record_id
      where status = "closed" order by updated_at desc, record_id asc limit ? offset ?`;
  
    const [recordResult] = await pool.query(searchRecordQs, [limit, offset]);
    mylog(recordResult);
  
    const items = Array(recordResult.length);
    let count = 0;
  
    const searchThumbQs =
      'select * from record_item_file where linked_record_id = ? order by item_id asc limit 1';
    const countQs = 'select count(*) from record_comment where linked_record_id = ?';
    const searchLastQs = 'select * from record_last_access where user_id = ? and record_id = ?';
  
    for (let i = 0; i < recordResult.length; i++) {
      const resObj = {
        recordId: recordResult[i].record_id,
        title: recordResult[i].title,
        applicationGroup: recordResult[i].application_group,
        applicationGroupName: recordResult[i].applicationGroupName,
        createdBy: null,
        createdByName: recordResult[i].createdByName,
        createAt: '',
        commentCount: recordResult[i].commentCount,
        isUnConfirmed: true,
        thumbNailItemId: null,
        updatedAt: '',
      };
  
      const line = recordResult[i];
      mylog(line);
      const recordId = recordResult[i].record_id;
      const createdBy = line.created_by;
      const updatedAt = line.updated_at;
      let thumbNailItemId = null;
      let isUnConfirmed = true;
  
      const [itemResult] = await pool.query(searchThumbQs, [recordId]);
      if (itemResult.length === 1) {
        thumbNailItemId = itemResult[0].item_id;
      }
  
      const [lastResult] = await pool.query(searchLastQs, [user.user_id, recordId]);
      if (lastResult.length === 1) {
        mylog(updatedAt);
        const updatedAtNum = Date.parse(updatedAt);
        const accessTimeNum = Date.parse(lastResult[0].access_time);
        if (updatedAtNum <= accessTimeNum) {
          isUnConfirmed = false;
        }
      }
  
      resObj.recordId = recordId;
      resObj.createdBy = createdBy;
      resObj.createAt = line.created_at;
      resObj.isUnConfirmed = isUnConfirmed;
      resObj.thumbNailItemId = thumbNailItemId;
      resObj.updatedAt = updatedAt;
  
      items[i] = resObj;
    }
  
    const recordCountQs = 'select count(*) from record where status = "closed"';
  
    const [recordCountResult] = await pool.query(recordCountQs);
    if (recordCountResult.length === 1) {
      count = recordCountResult[0]['count(*)'];
    }
  
    res.send({ count: count, items: items });
  };