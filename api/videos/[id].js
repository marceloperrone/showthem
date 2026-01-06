const { updateVideo, deleteVideo, initDb } = require('../../lib/db');

module.exports = async function handler(req, res) {
  await initDb();
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const video = await updateVideo(id, req.body);
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }
      return res.status(200).json(video);
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteVideo(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Video not found' });
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
