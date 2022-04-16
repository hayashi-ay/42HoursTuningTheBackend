// GET /records/{recordId}
// 文書詳細取得
const getRecord = async (req, res) => {
    let user = await getLinkedUser(req.headers);
  
    if (!user) {
      res.status(401).send();
      return;
    }
  
    const recordId = req.params.recordId;
  
    const recordQs = `select * from record where record_id = ?`;
  
    const [recordResult] = await pool.query(recordQs, [`${recordId}`]);
    mylog(recordResult);
  
    if (recordResult.length !== 1) {
      res.status(404).send({});
      return;
    }
  
    let recordInfo = {
      recordId: '',
      status: '',
      title: '',
      detail: '',
      categoryId: null,
      categoryName: '',
      applicationGroup: '',
      applicationGroupName: null,
      createdBy: null,
      createdByName: null,
      createdByPrimaryGroupName: null,
      createdAt: null,
      files: [],
    };
  
    const searchPrimaryGroupQs = `select * from group_member where user_id = ? and is_primary = true`;
    const searchUserQs = `select * from user where user_id = ?`;
    const searchGroupQs = `select * from group_info where group_id = ?`;
    const searchCategoryQs = `select * from category where category_id = ?`;
  
    const line = recordResult[0];
  
    const [primaryResult] = await pool.query(searchPrimaryGroupQs, [line.created_by]);
    if (primaryResult.length === 1) {
      const primaryGroupId = primaryResult[0].group_id;
  
      const [groupResult] = await pool.query(searchGroupQs, [primaryGroupId]);
      if (groupResult.length === 1) {
        recordInfo.createdByPrimaryGroupName = groupResult[0].name;
      }
    }
  
    const [appGroupResult] = await pool.query(searchGroupQs, [line.application_group]);
    if (appGroupResult.length === 1) {
      recordInfo.applicationGroupName = appGroupResult[0].name;
    }
  
    const [userResult] = await pool.query(searchUserQs, [line.created_by]);
    if (userResult.length === 1) {
      recordInfo.createdByName = userResult[0].name;
    }
  
    const [categoryResult] = await pool.query(searchCategoryQs, [line.category_id]);
    if (categoryResult.length === 1) {
      recordInfo.categoryName = categoryResult[0].name;
    }
  
    recordInfo.recordId = line.record_id;
    recordInfo.status = line.status;
    recordInfo.title = line.title;
    recordInfo.detail = line.detail;
    recordInfo.categoryId = line.category_id;
    recordInfo.applicationGroup = line.application_group;
    recordInfo.createdBy = line.created_by;
    recordInfo.createdAt = line.created_at;
  
    const searchItemQs = `select * from record_item_file where linked_record_id = ? order by item_id asc`;
    const [itemResult] = await pool.query(searchItemQs, [line.record_id]);
    mylog('itemResult');
    mylog(itemResult);
  
    const searchFileQs = `select * from file where file_id = ?`;
    for (let i = 0; i < itemResult.length; i++) {
      const item = itemResult[i];
      const [fileResult] = await pool.query(searchFileQs, [item.linked_file_id]);
  
      let fileName = '';
      if (fileResult.length !== 0) {
        fileName = fileResult[0].name;
      }
  
      recordInfo.files.push({ itemId: item.item_id, name: fileName });
    }
  
    await pool.query(
      `
      INSERT INTO record_last_access
      (record_id, user_id, access_time)
      VALUES
      (?, ?, now())
      ON DUPLICATE KEY UPDATE access_time = now()`,
      [`${recordId}`, `${user.user_id}`],
    );
  
    res.send(recordInfo);
  };