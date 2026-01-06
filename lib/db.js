const { Pool } = require('pg');

// PostgreSQL connection (required for Vercel - serverless has no persistent filesystem)
let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

// Initialize tables
async function initDb() {
  const db = getPool();
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      group_id VARCHAR(255) REFERENCES groups(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      username VARCHAR(255) NOT NULL,
      caption TEXT,
      description TEXT
    )
  `);
}

// ============================================
// Data Operations
// ============================================

async function getData() {
  const db = getPool();
  if (!db) throw new Error('DATABASE_URL not configured');

  const groups = await db.query('SELECT * FROM groups ORDER BY name');
  const videos = await db.query(
    'SELECT id, group_id as "groupId", url, username, caption, description FROM videos ORDER BY id'
  );

  return {
    groups: groups.rows,
    videos: videos.rows.map(v => ({ ...v, id: v.id.toString() }))
  };
}

async function saveData(data) {
  const db = getPool();
  if (!db) throw new Error('DATABASE_URL not configured');

  // Clear and repopulate (for bulk import)
  await db.query('DELETE FROM videos');
  await db.query('DELETE FROM groups');

  for (const group of data.groups || []) {
    await db.query(
      'INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)',
      [group.id, group.name, group.description || null]
    );
  }

  for (const video of data.videos || []) {
    await db.query(
      'INSERT INTO videos (group_id, url, username, caption, description) VALUES ($1, $2, $3, $4, $5)',
      [video.groupId, video.url, video.username, video.caption || null, video.description || null]
    );
  }
}

// Groups
async function getGroups() {
  const db = getPool();
  const result = await db.query('SELECT * FROM groups ORDER BY name');
  return result.rows;
}

async function createGroup(group) {
  const db = getPool();
  await db.query(
    'INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)',
    [group.id, group.name, group.description || null]
  );
  return group;
}

async function updateGroup(id, updates) {
  const db = getPool();
  const result = await db.query(
    'UPDATE groups SET id = $1, name = $2, description = $3 WHERE id = $4 RETURNING *',
    [updates.id || id, updates.name, updates.description || null, id]
  );
  return result.rows[0] || null;
}

async function deleteGroup(id) {
  const db = getPool();
  const result = await db.query('DELETE FROM groups WHERE id = $1', [id]);
  return result.rowCount > 0;
}

// Videos
async function getVideos() {
  const db = getPool();
  const result = await db.query(
    'SELECT id, group_id as "groupId", url, username, caption, description FROM videos ORDER BY id'
  );
  return result.rows.map(v => ({ ...v, id: v.id.toString() }));
}

async function createVideo(video) {
  const db = getPool();
  const result = await db.query(
    'INSERT INTO videos (group_id, url, username, caption, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [video.groupId, video.url, video.username, video.caption || null, video.description || null]
  );
  return { ...video, id: result.rows[0].id.toString() };
}

async function updateVideo(id, updates) {
  const db = getPool();
  const result = await db.query(
    'UPDATE videos SET group_id = $1, url = $2, username = $3, caption = $4, description = $5 WHERE id = $6 RETURNING id, group_id as "groupId", url, username, caption, description',
    [updates.groupId, updates.url, updates.username, updates.caption || null, updates.description || null, id]
  );
  if (result.rows[0]) {
    result.rows[0].id = result.rows[0].id.toString();
  }
  return result.rows[0] || null;
}

async function deleteVideo(id) {
  const db = getPool();
  const result = await db.query('DELETE FROM videos WHERE id = $1', [id]);
  return result.rowCount > 0;
}

module.exports = {
  initDb,
  getData,
  saveData,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getVideos,
  createVideo,
  updateVideo,
  deleteVideo
};
