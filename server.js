const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Storage adapter interface
let storage;

// ============================================
// File Storage Implementation
// ============================================
const fileStorage = {
  async init() {
    try {
      await fs.access(DATA_FILE);
    } catch {
      // Create default data file if it doesn't exist
      await fs.writeFile(DATA_FILE, JSON.stringify({ groups: [], videos: [] }, null, 2));
    }
    console.log('Using file storage:', DATA_FILE);
  },

  async getData() {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  },

  async saveData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  },

  // Groups
  async getGroups() {
    const data = await this.getData();
    return data.groups;
  },

  async createGroup(group) {
    const data = await this.getData();
    data.groups.push(group);
    await this.saveData(data);
    return group;
  },

  async updateGroup(id, updates) {
    const data = await this.getData();
    const index = data.groups.findIndex(g => g.id === id);
    if (index === -1) return null;

    // Update video references if ID changed
    if (updates.id && updates.id !== id) {
      data.videos.forEach(v => {
        if (v.groupId === id) v.groupId = updates.id;
      });
    }

    data.groups[index] = { ...data.groups[index], ...updates };
    await this.saveData(data);
    return data.groups[index];
  },

  async deleteGroup(id) {
    const data = await this.getData();
    const index = data.groups.findIndex(g => g.id === id);
    if (index === -1) return false;

    data.groups.splice(index, 1);
    data.videos = data.videos.filter(v => v.groupId !== id);
    await this.saveData(data);
    return true;
  },

  // Videos
  async getVideos() {
    const data = await this.getData();
    return data.videos;
  },

  async createVideo(video) {
    const data = await this.getData();
    video.id = Date.now().toString(); // Simple ID generation
    data.videos.push(video);
    await this.saveData(data);
    return video;
  },

  async updateVideo(id, updates) {
    const data = await this.getData();
    const index = data.videos.findIndex(v => v.id === id);
    if (index === -1) return null;

    data.videos[index] = { ...data.videos[index], ...updates };
    await this.saveData(data);
    return data.videos[index];
  },

  async deleteVideo(id) {
    const data = await this.getData();
    const index = data.videos.findIndex(v => v.id === id);
    if (index === -1) return false;

    data.videos.splice(index, 1);
    await this.saveData(data);
    return true;
  }
};

// ============================================
// PostgreSQL Storage Implementation
// ============================================
const createPgStorage = (pool) => ({
  async init() {
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        group_id VARCHAR(255) REFERENCES groups(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        username VARCHAR(255) NOT NULL,
        caption TEXT,
        description TEXT
      )
    `);

    console.log('Using PostgreSQL storage');
  },

  async getData() {
    const groups = await this.getGroups();
    const videos = await this.getVideos();
    return { groups, videos };
  },

  async saveData(data) {
    // Clear and repopulate (for bulk import)
    await pool.query('DELETE FROM videos');
    await pool.query('DELETE FROM groups');

    for (const group of data.groups) {
      await pool.query(
        'INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)',
        [group.id, group.name, group.description || null]
      );
    }

    for (const video of data.videos) {
      await pool.query(
        'INSERT INTO videos (group_id, url, username, caption, description) VALUES ($1, $2, $3, $4, $5)',
        [video.groupId, video.url, video.username, video.caption || null, video.description || null]
      );
    }
  },

  // Groups
  async getGroups() {
    const result = await pool.query('SELECT * FROM groups ORDER BY name');
    return result.rows;
  },

  async createGroup(group) {
    await pool.query(
      'INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)',
      [group.id, group.name, group.description || null]
    );
    return group;
  },

  async updateGroup(id, updates) {
    const result = await pool.query(
      'UPDATE groups SET id = $1, name = $2, description = $3 WHERE id = $4 RETURNING *',
      [updates.id || id, updates.name, updates.description || null, id]
    );
    return result.rows[0] || null;
  },

  async deleteGroup(id) {
    const result = await pool.query('DELETE FROM groups WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Videos
  async getVideos() {
    const result = await pool.query('SELECT id, group_id as "groupId", url, username, caption, description FROM videos ORDER BY id');
    return result.rows.map(v => ({ ...v, id: v.id.toString() }));
  },

  async createVideo(video) {
    const result = await pool.query(
      'INSERT INTO videos (group_id, url, username, caption, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [video.groupId, video.url, video.username, video.caption || null, video.description || null]
    );
    return { ...video, id: result.rows[0].id.toString() };
  },

  async updateVideo(id, updates) {
    const result = await pool.query(
      'UPDATE videos SET group_id = $1, url = $2, username = $3, caption = $4, description = $5 WHERE id = $6 RETURNING id, group_id as "groupId", url, username, caption, description',
      [updates.groupId, updates.url, updates.username, updates.caption || null, updates.description || null, id]
    );
    if (result.rows[0]) {
      result.rows[0].id = result.rows[0].id.toString();
    }
    return result.rows[0] || null;
  },

  async deleteVideo(id) {
    const result = await pool.query('DELETE FROM videos WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
});

// ============================================
// API Routes
// ============================================

// Get all data
app.get('/api/data', async (req, res) => {
  try {
    const data = await storage.getData();
    res.json(data);
  } catch (err) {
    console.error('Error getting data:', err);
    res.status(500).json({ error: 'Failed to get data' });
  }
});

// Replace all data (bulk import)
app.put('/api/data', async (req, res) => {
  try {
    await storage.saveData(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// Groups CRUD
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await storage.getGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const group = await storage.createGroup(req.body);
    res.status(201).json(group);
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const group = await storage.updateGroup(req.params.id, req.body);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json(group);
  } catch (err) {
    console.error('Error updating group:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    const deleted = await storage.deleteGroup(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Videos CRUD
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await storage.getVideos();
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get videos' });
  }
});

app.post('/api/videos', async (req, res) => {
  try {
    const video = await storage.createVideo(req.body);
    res.status(201).json(video);
  } catch (err) {
    console.error('Error creating video:', err);
    res.status(500).json({ error: 'Failed to create video' });
  }
});

app.put('/api/videos/:id', async (req, res) => {
  try {
    const video = await storage.updateVideo(req.params.id, req.body);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(video);
  } catch (err) {
    console.error('Error updating video:', err);
    res.status(500).json({ error: 'Failed to update video' });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  try {
    const deleted = await storage.deleteVideo(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting video:', err);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', storage: process.env.DATABASE_URL ? 'postgresql' : 'file' });
});

// ============================================
// Initialize and Start Server
// ============================================
async function start() {
  // Choose storage based on DATABASE_URL env var
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    storage = createPgStorage(pool);
  } else {
    storage = fileStorage;
  }

  await storage.init();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Viewer: http://localhost:${PORT}/index.html`);
    console.log(`Editor: http://localhost:${PORT}/editor.html`);
  });
}

start().catch(console.error);
