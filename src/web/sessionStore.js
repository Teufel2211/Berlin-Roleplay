const { Store } = require('express-session');
const { getClient, TABLES } = require('../supabase');

function sessionExpired(sess) {
  const expires = sess && sess.cookie && sess.cookie.expires;
  if (!expires) return false;
  return new Date(expires).getTime() <= Date.now();
}

function expireValue(sess) {
  const expires = sess && sess.cookie && sess.cookie.expires;
  return expires ? new Date(expires).toISOString() : new Date(Date.now() + 86400000).toISOString();
}

class SupabaseSessionStore extends Store {
  get(sid, cb) {
    getClient()
      .from(TABLES.sessions)
      .select('sess')
      .eq('sid', sid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return cb(error);
        if (data && !sessionExpired(data.sess)) return cb(null, data.sess);
        return cb(null, null);
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    getClient()
      .from(TABLES.sessions)
      .upsert({ sid, sess, expire: expireValue(sess) })
      .then(({ error }) => cb(error || null))
      .catch((err) => cb(err));
  }

  destroy(sid, cb) {
    getClient()
      .from(TABLES.sessions)
      .delete()
      .eq('sid', sid)
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  touch(sid, sess, cb) {
    getClient()
      .from(TABLES.sessions)
      .update({ expire: expireValue(sess) })
      .eq('sid', sid)
      .then(({ error }) => cb(error || null))
      .catch((err) => cb(err));
  }
}

module.exports = SupabaseSessionStore;
