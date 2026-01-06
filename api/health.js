module.exports = async function handler(req, res) {
  const hasDb = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  res.status(200).json({
    status: 'ok',
    storage: hasDb ? 'postgresql' : 'none',
    env_keys: Object.keys(process.env).filter(k => k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('SUPABASE')).join(', ')
  });
};
