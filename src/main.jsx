import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookmarkPlus,
  Calendar,
  Check,
  ExternalLink,
  Folder,
  Heart,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'video-bookmark-library-v1';

const starterCategories = [
  { id: 'all', name: 'All Videos', locked: true },
  { id: 'favorites', name: 'Favorites', locked: true },
  { id: 'ai', name: 'AI' },
  { id: 'programming', name: 'Programming' },
  { id: 'business', name: 'Business' },
  { id: 'health', name: 'Health' },
  { id: 'rewatch', name: 'To Rewatch' },
];

const starterVideos = [];

function loadLibrary() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { categories: starterCategories, videos: starterVideos };
    }
    const parsed = JSON.parse(stored);
    const videos = Array.isArray(parsed.videos)
      ? parsed.videos.filter(
          (video) =>
            !(
              video.url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' &&
              video.title === 'Example saved video'
            )
        )
      : [];
    return {
      categories: parsed.categories?.length ? parsed.categories : starterCategories,
      videos,
    };
  } catch {
    return { categories: starterCategories, videos: starterVideos };
  }
}

function saveLibrary(nextLibrary) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLibrary));
}

async function fetchYouTubeTitle(url) {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  );
  if (!response.ok) {
    throw new Error('Unable to read video title');
  }
  const data = await response.json();
  return data.title?.trim();
}

function getYouTubeId(url) {
  const trimmed = url.trim();
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function App() {
  const [library, setLibrary] = useState(loadLibrary);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [form, setForm] = useState({
    url: '',
    categoryId: 'rewatch',
    note: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [message, setMessage] = useState('');
  const brandClickRef = useRef({ count: 0, lastClick: 0 });

  const unlockedCategories = library.categories.filter((category) => !category.locked);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(library.categories.map((category) => [category.id, 0]));
    counts.all = library.videos.length;
    counts.favorites = library.videos.filter((video) => video.favorite).length;
    for (const video of library.videos) {
      counts[video.categoryId] = (counts[video.categoryId] || 0) + 1;
    }
    return counts;
  }, [library]);

  const filteredVideos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return library.videos
      .filter((video) => {
        if (activeCategory === 'favorites') return video.favorite;
        if (activeCategory === 'all') return true;
        return video.categoryId === activeCategory;
      })
      .filter((video) => {
        if (!term) return true;
        const categoryName =
          library.categories.find((category) => category.id === video.categoryId)?.name || '';
        return [video.title, video.note, categoryName].some((value) =>
          value.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [activeCategory, library, searchTerm]);

  function commitLibrary(nextLibrary) {
    setLibrary(nextLibrary);
    saveLibrary(nextLibrary);
  }

  function addCategory(event) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    const duplicate = library.categories.some(
      (category) => category.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setMessage('That category already exists.');
      return;
    }
    const nextCategory = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID(),
      name,
    };
    commitLibrary({ ...library, categories: [...library.categories, nextCategory] });
    setNewCategory('');
    setCategoryDrafts({ ...categoryDrafts, [nextCategory.id]: name });
    setActiveCategory(nextCategory.id);
    setMessage('Category added.');
  }

  function renameCategory(categoryId) {
    const name = (categoryDrafts[categoryId] ?? '').trim();
    const current = library.categories.find((category) => category.id === categoryId);
    if (!current || current.locked || !name) return;
    const duplicate = library.categories.some(
      (category) =>
        category.id !== categoryId && category.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setMessage('That category already exists.');
      return;
    }
    commitLibrary({
      ...library,
      categories: library.categories.map((category) =>
        category.id === categoryId ? { ...category, name } : category
      ),
    });
    setMessage('Category updated.');
  }

  async function submitVideo(event) {
    event.preventDefault();
    const youtubeId = getYouTubeId(form.url);
    if (!youtubeId) {
      setMessage('Paste a valid YouTube link first.');
      return;
    }

    setIsSaving(true);
    setMessage('Reading YouTube title...');

    let title = '';
    try {
      title = await fetchYouTubeTitle(form.url.trim());
    } catch {
      setMessage('I could not read the YouTube title. Try a public YouTube video link.');
      setIsSaving(false);
      return;
    }

    const nextVideo = {
      id: editingId || crypto.randomUUID(),
      url: form.url.trim(),
      youtubeId,
      title,
      categoryId: form.categoryId,
      note: form.note.trim(),
      favorite: editingId ? library.videos.find((video) => video.id === editingId)?.favorite || false : false,
      createdAt: editingId
        ? library.videos.find((video) => video.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    const videos = editingId
      ? library.videos.map((video) => (video.id === editingId ? nextVideo : video))
      : [nextVideo, ...library.videos];

    commitLibrary({ ...library, videos });
    setForm({ url: '', categoryId: form.categoryId, note: '' });
    setEditingId(null);
    setIsFormOpen(false);
    setIsSaving(false);
    setMessage(editingId ? 'Video updated.' : 'Video saved.');
  }

  function editVideo(video) {
    setEditingId(video.id);
    setForm({
      url: video.url,
      categoryId: video.categoryId,
      note: video.note,
    });
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAddForm() {
    setEditingId(null);
    setForm({ url: '', categoryId: form.categoryId, note: '' });
    setIsFormOpen(true);
    setMessage('');
  }

  function closeForm() {
    setEditingId(null);
    setIsFormOpen(false);
    setForm({ url: '', categoryId: form.categoryId, note: '' });
  }

  function handleBrandClick() {
    const now = Date.now();
    const previous = brandClickRef.current;
    const count = now - previous.lastClick < 800 ? previous.count + 1 : 1;
    brandClickRef.current = { count, lastClick: now };
    if (count >= 3) {
      brandClickRef.current = { count: 0, lastClick: 0 };
      setIsFormOpen(false);
      setIsSettingsOpen(true);
      setCategoryDrafts(
        Object.fromEntries(unlockedCategories.map((category) => [category.id, category.name]))
      );
      setMessage('');
    }
  }

  function closeSettings() {
    setIsSettingsOpen(false);
    setNewCategory('');
  }

  function deleteVideo(videoId) {
    commitLibrary({ ...library, videos: library.videos.filter((video) => video.id !== videoId) });
    setMessage('Video removed.');
  }

  function toggleFavorite(videoId) {
    commitLibrary({
      ...library,
      videos: library.videos.map((video) =>
        video.id === videoId ? { ...video, favorite: !video.favorite } : video
      ),
    });
  }

  const activeTitle =
    library.categories.find((category) => category.id === activeCategory)?.name || 'All Videos';

  return (
    <main className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Video categories">
        <div className="sidebar-top">
          <button className="brand brand-button" type="button" onClick={handleBrandClick}>
            <span className="brand-mark">
              <Play size={18} fill="currentColor" />
            </span>
            <div>
              <span className="brand-title">Video Shelf</span>
              <span className="brand-subtitle">Your private YouTube library</span>
            </div>
          </button>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="category-list">
          {library.categories.map((category) => (
            <button
              key={category.id}
              className={`category-item ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(category.id)}
              type="button"
              title={category.name}
            >
              {category.id === 'favorites' ? <Heart size={17} /> : <Folder size={17} />}
              <span>{category.name}</span>
              <strong>{categoryCounts[category.id] || 0}</strong>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{activeTitle}</h2>
            <p>{filteredVideos.length} saved video{filteredVideos.length === 1 ? '' : 's'}</p>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search videos or notes"
            />
          </label>
        </header>

        {isFormOpen && (
          <div className="form-layer" role="presentation">
            <button className="form-scrim" type="button" onClick={closeForm} aria-label="Close add video form" />
            <form className="video-form" onSubmit={submitVideo}>
              <div className="form-heading">
                <BookmarkPlus size={20} />
                <strong>{editingId ? 'Edit saved video' : 'Add YouTube video'}</strong>
              <button
                className="ghost-button"
                type="button"
                onClick={closeForm}
                title="Close"
              >
                <X size={16} />
                Close
              </button>
              </div>

              <div className="form-grid">
                <label>
                  YouTube URL
                  <input
                    value={form.url}
                    onChange={(event) => setForm({ ...form, url: event.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                    required
                  />
                </label>
                <label>
                  Category
                  <select
                    value={form.categoryId}
                    onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                  >
                    {unlockedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  Notes
                  <textarea
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                    placeholder="Why this is useful, what to revisit, or where to start watching."
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={isSaving}>
                  <Check size={18} />
                  {isSaving ? 'Saving...' : editingId ? 'Update video' : 'Save video'}
                </button>
                {message && <span className="status-text">{message}</span>}
              </div>
            </form>
          </div>
        )}

        {isSettingsOpen && (
          <div className="form-layer" role="presentation">
            <button className="form-scrim" type="button" onClick={closeSettings} aria-label="Close settings" />
            <section className="settings-panel" aria-label="Background settings">
              <div className="form-heading">
                <Folder size={20} />
                <strong>Background Settings</strong>
                <button className="ghost-button" type="button" onClick={closeSettings} title="Close">
                  <X size={16} />
                  Close
                </button>
              </div>

              <div className="settings-block">
                <h3>Categories</h3>
                <form className="settings-add" onSubmit={addCategory}>
                  <input
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="New category"
                    aria-label="New category"
                  />
                  <button type="submit" title="Add category">
                    <Plus size={18} />
                  </button>
                </form>
              </div>

              <div className="settings-list">
                {unlockedCategories.map((category) => (
                  <div className="settings-row" key={category.id}>
                    <input
                      value={categoryDrafts[category.id] ?? category.name}
                      onChange={(event) =>
                        setCategoryDrafts({
                          ...categoryDrafts,
                          [category.id]: event.target.value,
                        })
                      }
                      aria-label={`${category.name} category name`}
                    />
                    <button type="button" onClick={() => renameCategory(category.id)} title="Save category">
                      <Check size={17} />
                    </button>
                  </div>
                ))}
              </div>

              {message && <p className="settings-message">{message}</p>}
            </section>
          </div>
        )}

        <div className="section-title">
          <div>
            <h3>{searchTerm ? 'Search results' : 'Saved videos'}</h3>
            {!isFormOpen && message && <p>{message}</p>}
          </div>
        </div>

        {filteredVideos.length === 0 ? (
          <div className="empty-state">
            <BookmarkPlus size={34} />
            <h3>No videos here yet.</h3>
            <p>Add a YouTube link or switch categories to browse your saved library.</p>
          </div>
        ) : (
          <div className="video-grid">
            {filteredVideos.map((video) => {
              const category = library.categories.find((item) => item.id === video.categoryId);
              return (
                <article className="video-card" key={video.id}>
                  <a
                    className="thumbnail"
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${video.title}`}
                  >
                    <img
                      src={`https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`}
                      alt=""
                      loading="lazy"
                    />
                    <span>
                      <Play size={16} fill="currentColor" />
                    </span>
                  </a>
                  <div className="video-body">
                    <div className="video-meta">
                      <span>{category?.name || 'Uncategorized'}</span>
                      <span>
                        <Calendar size={13} />
                        {formatDate(video.createdAt)}
                      </span>
                    </div>
                    <h4>{video.title}</h4>
                    {video.note && <p className="note">{video.note}</p>}
                    <div className="card-actions">
                      <button
                        className={video.favorite ? 'icon-button active' : 'icon-button'}
                        type="button"
                        onClick={() => toggleFavorite(video.id)}
                        title={video.favorite ? 'Remove favorite' : 'Favorite'}
                      >
                        <Star size={17} fill={video.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => editVideo(video)}
                        title="Edit video"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => deleteVideo(video.id)}
                        title="Delete video"
                      >
                        <Trash2 size={17} />
                      </button>
                      <a className="open-link" href={video.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        Open
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <button className="floating-add" type="button" onClick={openAddForm} title="Add YouTube video">
          <Plus size={24} />
        </button>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
