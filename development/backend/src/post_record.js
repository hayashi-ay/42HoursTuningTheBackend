// POST /records
// 申請情報登録
const postRecords = async (req, res) => {
    let user = await getLinkedUser(req.headers);
  
    if (!user) {
      res.status(401).send();
      return;
    }
  
    mylog(user);
  
    const body = req.body;
    mylog(body);
  
    let [rows] = await pool.query(
      `select * from group_member where user_id = ?
      AND is_primary = true`,
      [user.user_id],
    );
  
    if (rows.length !== 1) {
      mylog('申請者のプライマリ組織の解決に失敗しました。');
      res.status(400).send();
      return;
    }
  
    const userPrimary = rows[0];
  
    mylog(userPrimary);
  
    const newId = uuidv4();
  
    await pool.query(
      `insert into record
      (record_id, status, title, detail, category_id, application_group, created_by, created_at, updated_at)
      values (?, "open", ?, ?, ?, ?, ?, now(), now())`,
      [
        `${newId}`,
        `${body.title}`,
        `${body.detail}`,
        body.categoryId,
        userPrimary.group_id,
        user.user_id,
      ],
    );
  
    for (const e of body.fileIdList) {
      await pool.query(
        `insert into record_item_file
          (linked_record_id, linked_file_id, linked_thumbnail_file_id, created_at)
          values (?, ?, ?, now())`,
        [`${newId}`, `${e.fileId}`, `${e.thumbFileId}`],
      );
    }
  
    res.send({ recordId: newId });
  };