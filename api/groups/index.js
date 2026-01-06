const { getGroups, createGroup, initDb } = require('../../lib/db');

module.exports = async function handler(req, res) {
  await initDb();

  try {
    if (req.method === 'GET') {
      const groups = await getGroups();
      return res.status(200).json(groups);
    }

    if (req.method === 'POST') {
      const group = await createGroup(req.body);
      return res.status(201).json(group);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
