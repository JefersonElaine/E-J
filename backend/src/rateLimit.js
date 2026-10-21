const buckets = new Map();

export function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn(req);
    const bucket = buckets.get(key) || [];
    const fresh = bucket.filter((t) => now - t < windowMs);
    if (fresh.length >= max) {
      const retry = Math.ceil((windowMs - (now - fresh[0])) / 1000);
      res.setHeader("Retry-After", String(Math.max(retry, 1)));
      return res.status(429).json({ error: "Muitas tentativas. Aguarde um pouco e tente de novo." });
    }
    fresh.push(now);
    buckets.set(key, fresh);
    if (buckets.size > 5000) {
      for (const [k, times] of buckets) {
        if (!times.length || now - times[times.length - 1] > windowMs * 2) buckets.delete(k);
      }
    }
    next();
  };
}
