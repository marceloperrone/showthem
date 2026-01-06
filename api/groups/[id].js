const { updateGroup, deleteGroup, initDb } = require('../../lib/db');

module.exports = async function handler(req, res) {
  await initDb();
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const group = await updateGroup(id, req.body);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json(group);
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteGroup(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['PUT', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
