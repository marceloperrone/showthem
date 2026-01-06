const { getData, saveData, initDb } = require('../lib/db');

module.exports = async function handler(req, res) {
  try {
    // Initialize DB tables on first request
    await initDb();

    if (req.method === 'GET') {
      const data = await getData();
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      await saveData(req.body);
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
