import { useEffect, useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import { api, formatAgo } from '../api.js';

// Siste innlegg fra bloggen til FiveM Norge (blogg.fivemnorge.xyz)
export default function BlogCard() {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    let alive = true;
    api.backend.api('GET', '/api/public/blog').then((p) => alive && setPosts(Array.isArray(p) ? p.slice(0, 3) : [])).catch(() => alive && setPosts([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!posts?.length) return null;
  const open = (url) => /^https:\/\/blogg\.fivemnorge\.xyz\//.test(url) && api.openExternal(url);
  return (
    <section className="card pc blog-card">
      <div className="card-head">
        <h2>Fra bloggen</h2>
        <Newspaper size={18} strokeWidth={1.8} className="muted-icon" />
      </div>
      <ul className="blog-list">
        {posts.map((p) => (
          <li key={p.url}>
            <button type="button" className="blog-item" onClick={() => open(p.url)}>
              {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <span className="blog-ph" aria-hidden="true" />}
              <span className="blog-text">
                <span className="blog-cat">{p.category}</span>
                <b>{p.title}</b>
                <span className="muted-sm">{formatAgo(p.at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="text-btn" onClick={() => api.openExternal('https://blogg.fivemnorge.xyz/')}>
        Alle innlegg <ExternalLink size={13} />
      </button>
    </section>
  );
}
