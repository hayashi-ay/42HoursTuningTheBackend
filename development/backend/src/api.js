const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const jimp = require('jimp');

const mysql = require('mysql2/promise');

const { performance } = require('perf_hooks');


// MEMO: 設定項目はここを参考にした
// https://github.com/sidorares/node-mysql2#api-and-configuration
// https://github.com/mysqljs/mysql
const mysqlOption = {
  host: 'mysql',
  user: 'backend',
  password: 'backend',
  database: 'app',
  waitForConnections: true,
  connectionLimit: 150,
};
const pool = mysql.createPool(mysqlOption);

const mylog = (obj) => {
  return ;
  if (Array.isArray(obj)) {
    for (const e of obj) {
      console.log(e);
    }
    return;
  }
  console.log(obj);
};

const getLinkedUser = async (headers) => {
  const target = headers['x-app-key'];
  mylog(target);
  const qs = `SELECT * FROM session WHERE value = ?`;

  const [rows] = await pool.query(qs, [`${target}`]);

  if (rows.length !== 1) {
    mylog('セッションが見つかりませんでした。');
    return undefined;
  }

  return { user_id: rows[0].linked_user_id };
};

const filePath = 'file/';

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
    `SELECT * FROM group_member WHERE user_id = ?
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
    `INSERT INTO record
    (record_id, status, title, detail, category_id, application_group, created_by, created_at, updated_at)
    VALUES (?, "open", ?, ?, ?, ?, ?, now(), now())`,
    [
      `${newId}`,
      `${body.title}`,
      `${body.detail}`,
      body.categoryId,
      userPrimary.group_id,
      user.user_id,
    ],
  );

  let values = [];

  for (const e of body.fileIdList) {
    values.push([`${newId}`, `${e.fileId}`, `${e.thumbFileId}`, new Date()])
  }
  await pool.query(
    `INSERT INTO record_item_file
      (linked_record_id, linked_file_id, linked_thumbnail_file_id, created_at)
      VALUES ?`,
    [values],
  );

  res.send({ recordId: newId });
};

// GET /records/{recordId}
// 文書詳細取得
const getRecord = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;

  const recordQs = `SELECT * FROM record WHERE record_id = ?`;

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

  const searchPrimaryGroupQs = `SELECT * FROM group_member WHERE user_id = ? and is_primary = true`;
  const searchUserQs = `SELECT * FROM user WHERE user_id = ?`;
  const searchGroupQs = `SELECT * FROM group_info WHERE group_id = ?`;
  const searchCategoryQs = `SELECT * FROM category WHERE category_id = ?`;

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

  const searchItemQs = `SELECT rf.item_id, f.name
    FROM record_item_file rf
    LEFT JOIN
    file f
    ON rf.linked_file_id = f.file_id
    WHERE rf.linked_record_id = ? order by rf.item_id asc`;
  const [itemResult] = await pool.query(searchItemQs, [line.record_id]);

  const searchFileQs = `SELECT * FROM file WHERE file_id = ?`;
  for (let i = 0; i < itemResult.length; i++) {
    const item = itemResult[i];
    let fileName = item.name ? item.name : '';

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

// GET /record-views/tomeActive
// 自分宛一覧
const tomeActive = async (req, res) => {
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

  const searchTargetQs = `SELECT c.category_id, c.application_group
    FROM group_member g
    LEFT JOIN category_group c
    ON g.group_id = c.group_id
    WHERE user_id = ?`;

  const [targetResult] = await pool.query(searchTargetQs, [user.user_id]);
  const targetCategoryAppGroupList = targetResult.map(r => ({categoryId: r.category_id, applicationGroup: r.application_group}));

  let searchRecordQs =
    `SELECT r.*,
    u.name as createdByName,
    gi.name as applicationGroupName,
    la.access_time as access_time
    FROM record r
    LEFT JOIN user u
    ON r.created_by = u.user_id
    LEFT JOIN group_info gi
    ON r.application_group = gi.group_id
    LEFT JOIN record_last_access la
    ON r.record_id = la.record_id AND r.created_by = la.user_id
    WHERE r.status = "open" and (r.category_id, r.application_group) in (`;
  let recordCountQs =
    'SELECT count(*) FROM record WHERE status = "open" and (category_id, application_group) in (';
  const param = [];

  for (let i = 0; i < targetCategoryAppGroupList.length; i++) {
    if (i !== 0) {
      searchRecordQs += ', (?, ?)';
      recordCountQs += ', (?, ?)';
    } else {
      searchRecordQs += ' (?, ?)';
      recordCountQs += ' (?, ?)';
    }
    param.push(targetCategoryAppGroupList[i].categoryId);
    param.push(targetCategoryAppGroupList[i].applicationGroup);
  }
  searchRecordQs += ' ) order by r.updated_at desc, r.record_id  limit ? offset ?';
  recordCountQs += ' )';
  param.push(limit);
  param.push(offset);

  const [recordResult] = await pool.query(searchRecordQs, param);

  const items = Array(recordResult.length);
  let count = 0;

  const searchThumbQs =
    'SELECT * FROM record_item_file WHERE linked_record_id = ? order by item_id asc limit 1';

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: recordResult[i].applicationGroupName,
      createdBy: null,
      createdByName: recordResult[i].createdByName,
      createAt: '',
      commentCount: recordResult[i].comment_count,
      isUnConfirmed: true,
      thumbNailItemId: null,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let thumbNailItemId = null;
    let isUnConfirmed = true;

    const [itemResult] = await pool.query(searchThumbQs, [recordId]);
    if (itemResult.length === 1) {
      thumbNailItemId = itemResult[0].item_id;
    }

    if (recordResult[i].access_time) {
      mylog(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(recordResult[i].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.createdBy = createdBy;
    resObj.createAt = line.created_at;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.thumbNailItemId = thumbNailItemId;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const [recordCountResult] = await pool.query(recordCountQs, param);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

// GET /record-views/allActive
// 全件一覧
const allActive = async (req, res) => {
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

  const searchRecordQs = `SELECT record_id FROM record WHERE status = "open" order by updated_at desc, record_id asc limit ? offset ?`;
  const getRecordsQs = `SELECT r.*,
    u.name as createdByName,
    gi.name as applicationGroupName,
    rf.item_id as thumbNailItemId,
    la.access_time as access_time
    FROM record r
    LEFT JOIN user u
    ON r.created_by = u.user_id
    LEFT JOIN group_info gi
    ON r.application_group = gi.group_id
    LEFT JOIN (
      SELECT linked_record_id, item_id FROM record_item_file WHERE linked_record_id in (?) order by item_id asc limit 1
    ) AS rf
    ON r.record_id = rf.linked_record_id
    LEFT JOIN record_last_access la
    ON r.record_id = la.record_id AND r.created_by = la.user_id
    WHERE r.record_id in (?)`;

  const [recordIdResult] = await pool.query(searchRecordQs, [limit, offset]);
  let ids = recordIdResult.map(r => r.record_id);
  const [recordResult] = await pool.query(getRecordsQs, [ids, ids]);

  const items = Array(recordResult.length);
  let count = 0;

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: recordResult[i].applicationGroupName,
      createdBy: null,
      createdByName: recordResult[i].createdByName,
      createAt: '',
      commentCount: recordResult[i].comment_count,
      isUnConfirmed: true,
      thumbNailItemId: recordResult[i].thumbNailItemId,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let isUnConfirmed = true;

    if (recordResult[i].access_time) {
      mylog(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(recordResult[i].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.createdBy = createdBy;
    resObj.createAt = line.created_at;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const recordCountQs = 'SELECT count(*) FROM record WHERE status = "open"';

  const [recordCountResult] = await pool.query(recordCountQs);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

// GET /record-views/allClosed
// クローズ一覧
const allClosed = async (req, res) => {
  var t0 = performance.now();
  console.log( 'Do allClosed' );
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

  const searchRecordQs = `SELECT record_id from (SELECT record_id, updated_at FROM record WHERE status = "closed" order by updated_at desc limit ? offset ?) as c order by updated_at desc, record_id asc`;
  const getRecordsQs = `SELECT r.*,
    u.name as createdByName,
    gi.name as applicationGroupName,
    rf.item_id as thumbNailItemId,
    la.access_time as access_time
    FROM record r
    LEFT JOIN user u
    ON r.created_by = u.user_id
    LEFT JOIN group_info gi
    ON r.application_group = gi.group_id
    LEFT JOIN (
      SELECT linked_record_id, item_id FROM record_item_file WHERE linked_record_id in (?) order by item_id asc limit 1
    ) AS rf
    ON r.record_id = rf.linked_record_id
    LEFT JOIN record_last_access la
    ON r.record_id = la.record_id AND r.created_by = la.user_id
    WHERE r.record_id in (?)`;

  const [recordIdResult] = await pool.query(searchRecordQs, [limit, offset]);
  let ids = recordIdResult.map(r => r.record_id);
  const [recordResult] = await pool.query(getRecordsQs, [ids, ids]);

  var t2 = performance.now();
  console.log("Call to allClosed middle took " + (t2 - t0) + " milliseconds.");

  const items = Array(recordResult.length);
  let count = 0;

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: recordResult[i].applicationGroupName,
      createdBy: null,
      createdByName: recordResult[i].createdByName,
      createAt: '',
      commentCount: recordResult[i].comment_count,
      isUnConfirmed: true,
      thumbNailItemId: recordResult[i].thumbNailItemId,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let isUnConfirmed = true;

    if (recordResult[i].access_time) {
      mylog(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(recordResult[i].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.createdBy = createdBy;
    resObj.createAt = line.created_at;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const recordCountQs = 'SELECT count(*) FROM record WHERE status = "closed"';

  const [recordCountResult] = await pool.query(recordCountQs);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
  var t1 = performance.now();
  console.log("Call to allClosed took " + (t1 - t0) + " milliseconds.");
};

// GET /record-views/mineActive
// 自分が申請一覧
const mineActive = async (req, res) => {
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

  const searchRecordQs = `SELECT r.*,
    u.name as createdByName,
    gi.name as applicationGroupName,
    la.access_time as access_time
    FROM record r
    LEFT JOIN user u
    ON r.created_by = u.user_id
    LEFT JOIN group_info gi
    ON r.application_group = gi.group_id
    LEFT JOIN record_last_access la
    ON r.record_id = la.record_id AND r.created_by = la.user_id
    WHERE r.created_by = ? and r.status = "open"
    order by r.updated_at desc, r.record_id asc limit ? offset ?`;

  const searchThumbQs =
    'SELECT * FROM record_item_file WHERE linked_record_id = ? order by item_id asc limit 1';
  const [recordResult] = await pool.query(searchRecordQs, [user.user_id, limit, offset]);
  mylog(recordResult);

  const items = Array(recordResult.length);
  let count = 0;

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: recordResult[i].applicationGroupName,
      createdBy: null,
      createdByName: recordResult[i].createdByName,
      createAt: '',
      commentCount: recordResult[i].comment_count,
      isUnConfirmed: true,
      thumbNailItemId: null,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let thumbNailItemId = null;
    let isUnConfirmed = true;

    const [itemResult] = await pool.query(searchThumbQs, [recordId]);
    if (itemResult.length === 1) {
      thumbNailItemId = itemResult[0].item_id;
    }

    if (recordResult[i].access_time) {
      mylog(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(recordResult[i].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.createdBy = createdBy;
    resObj.createAt = line.created_at;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.thumbNailItemId = thumbNailItemId;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const recordCountQs = 'SELECT count(*) FROM record WHERE created_by = ? and status = "open"';

  const [recordCountResult] = await pool.query(recordCountQs, [user.user_id]);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

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

  await pool.query(`update record set status = ? WHERE record_id = ?`, [
    `${status}`,
    `${recordId}`,
  ]);

  res.send({});
};

// GET records/{recordId}/comments
// コメントの取得
const getComments = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;

  const commentQs = `SELECT r.*,
    u.name as userName,
    gi.name as createdByPrimaryGroupName
    FROM record_comment r
    LEFT JOIN user u
    ON r.created_by = u.user_id
    LEFT JOIN group_member gm
    ON r.created_by = gm.user_id AND gm.is_primary = true
    LEFT JOIN group_info gi
    ON gm.group_id = gi.group_id
    WHERE linked_record_id = ? order by created_at desc`;

  const [commentResult] = await pool.query(commentQs, [`${recordId}`]);
  mylog(commentResult);

  const commentList = Array(commentResult.length);

  for (let i = 0; i < commentResult.length; i++) {
    let commentInfo = {
      commentId: '',
      value: '',
      createdBy: null,
      createdByName: commentResult[i].userName,
      createdByPrimaryGroupName: commentResult[i].createdByPrimaryGroupName,
      createdAt: null,
    };
    const line = commentResult[i];

    commentInfo.commentId = line.comment_id;
    commentInfo.value = line.value;
    commentInfo.createdBy = line.created_by;
    commentInfo.createdAt = line.created_at;

    commentList[i] = commentInfo;
  }

  res.send({ items: commentList });
};

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
    INSERT INTO record_comment
    (linked_record_id, value, created_by, created_at)
    VALUES (?,?,?, now());`,
    [`${recordId}`, `${value}`, user.user_id],
  );

  await pool.query(
    `
    update record set comment_count = comment_count + 1, updated_at = now() WHERE record_id = ?;`,
    [`${recordId}`],
  );

  res.send({});
};

// GET categories/
// カテゴリーの取得
const getCategories = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const [rows] = await pool.query(`SELECT * FROM category`);

  for (const row of rows) {
    mylog(row);
  }

  const items = {};

  for (let i = 0; i < rows.length; i++) {
    items[`${rows[i]['category_id']}`] = { name: rows[i].name };
  }

  res.send({ items });
};

// POST files/
// ファイルのアップロード
const postFiles = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const base64Data = req.body.data;
  mylog(base64Data);

  const name = req.body.name;

  const newId = uuidv4();
  const newThumbId = uuidv4();

  const binary = Buffer.from(base64Data, 'base64');

  fs.writeFileSync(`${filePath}${newId}_${name}`, binary);

  const image = await jimp.read(fs.readFileSync(`${filePath}${newId}_${name}`));
  mylog(image.bitmap.width);
  mylog(image.bitmap.height);

  const size = image.bitmap.width < image.bitmap.height ? image.bitmap.width : image.bitmap.height;
  await image.cover(size, size);

  await image.writeAsync(`${filePath}${newThumbId}_thumb_${name}`);

  await pool.query(
    `INSERT INTO file (file_id, path, name)
        VALUES (?, ?, ?)`,
    [`${newId}`, `${filePath}${newId}_${name}`, `${name}`],
  );
  await pool.query(
    `INSERT INTO file (file_id, path, name)
        VALUES (?, ?, ?)`,
    [`${newThumbId}`, `${filePath}${newThumbId}_thumb_${name}`, `thumb_${name}`],
  );

  res.send({ fileId: newId, thumbFileId: newThumbId });
};

// GET records/{recordId}/files/{itemId}
// 添付ファイルのダウンロード
const getRecordItemFile = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;
  mylog(recordId);
  const itemId = Number(req.params.itemId);
  mylog(itemId);

  const [rows] = await pool.query(
    `SELECT f.name, f.path FROM record_item_file r
    INNER JOIN file f
    ON
    r.linked_record_id = ?
    AND
    r.item_id = ?
    AND
    r.linked_file_id = f.file_id`,
    [`${recordId}`, `${itemId}`],
  );

  if (rows.length !== 1) {
    res.status(404).send({});
    return;
  }
  mylog(rows[0]);

  const fileInfo = rows[0];

  const data = fs.readFileSync(fileInfo.path);
  const base64 = data.toString('base64');
  mylog(base64);

  res.send({ data: base64, name: fileInfo.name });
};

// GET records/{recordId}/files/{itemId}/thumbnail
// 添付ファイルのサムネイルダウンロード
const getRecordItemFileThumbnail = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;
  mylog(recordId);
  const itemId = Number(req.params.itemId);
  mylog(itemId);

  const [rows] = await pool.query(
    `SELECT f.name, f.path FROM record_item_file r
    INNER JOIN file f
    ON
    r.linked_record_id = ?
    AND
    r.item_id = ?
    AND
    r.linked_thumbnail_file_id = f.file_id`,
    [`${recordId}`, `${itemId}`],
  );

  if (rows.length !== 1) {
    res.status(404).send({});
    return;
  }
  mylog(rows[0]);

  const fileInfo = rows[0];

  const data = fs.readFileSync(fileInfo.path);
  const base64 = data.toString('base64');
  mylog(base64);

  res.send({ data: base64, name: fileInfo.name });
};

module.exports = {
  postRecords,
  getRecord,
  tomeActive,
  allActive,
  allClosed,
  mineActive,
  updateRecord,
  getComments,
  postComments,
  getCategories,
  postFiles,
  getRecordItemFile,
  getRecordItemFileThumbnail,
};
