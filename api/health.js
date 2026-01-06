module.exports = async function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    storage: process.env.DATABASE_URL ? 'postgresql' : 'none'
  });
};
