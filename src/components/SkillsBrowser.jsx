import { useState, useEffect, useMemo } from 'react';
import { Loader2, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import './SkillsBrowser.css';

export default function SkillsBrowser() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    const fetchSkills = async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/skills');
        const data = await resp.json();
        setSkills(data.skills || []);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    fetchSkills();
  }, []);

  // Unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(skills.map(s => s.category).filter(Boolean))];
    return cats.sort();
  }, [skills]);

  // Filtered skills
  const filtered = useMemo(() => {
    let result = skills;
    if (activeCategory) {
      result = result.filter(s => s.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [skills, search, activeCategory]);

  if (loading) {
    return (
      <div className="skills-loading">
        <Loader2 size={18} className="spinner" />
        <span>Loading skills...</span>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="skills-browser">
      <div className="skills-browser-header">
        <h3>Installed Skills</h3>
        <span className="skills-count-badge">{skills.length} skills</span>
      </div>

      <input
        type="text"
        className="skills-search"
        placeholder="Search skills by name or category..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {categories.length > 0 && (
        <div className="skills-category-chips">
          <button
            className={`skills-category-chip ${!activeCategory ? 'active' : ''}`}
            onClick={() => setActiveCategory(null)}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`skills-category-chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="skills-list">
        {filtered.length === 0 ? (
          <div className="skills-empty">No skills match your search.</div>
        ) : (
          filtered.map((skill, idx) => (
            <div key={skill.name + idx} className="skill-row">
              <span className="skill-name">{skill.name}</span>
              {skill.category && (
                <span className="skill-category-badge">{skill.category}</span>
              )}
              {skill.source && (
                <span className={`skill-source-badge ${skill.source}`}>
                  {skill.source}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
