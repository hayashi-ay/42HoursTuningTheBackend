// POST records/{recordId}/comments
// コメントの投稿
const postComments = async (req, res) => {
    let user = await getLinkedUser(req.headers);
  
    if (!user) {
      res.status(401).send();
      return;
    }
  
    const recordId = req.params.recordId;
    const value = req.body.value;
  
    await pool.query(
      `
      insert into record_comment
      (linked_record_id, value, created_by, created_at)
      values (?,?,?, now());`,
      [`${recordId}`, `${value}`, user.user_id],
    );
  
    await pool.query(
      `
      update record set updated_at = now() where record_id = ?;`,
      [`${recordId}`],
    );
  
    res.send({});
  };