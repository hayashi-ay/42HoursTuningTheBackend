// PUT records/{recordId}
// 申請更新
const updateRecord = async (req, res) => {
    let user = await getLinkedUser(req.headers);
  
    if (!user) {
      res.status(401).send();
      return;
    }
  
    const recordId = req.params.recordId;
    const status = req.body.status;
  
    await pool.query(`update record set status = ? where record_id = ?`, [
      `${status}`,
      `${recordId}`,
    ]);
  
    res.send({});
  };