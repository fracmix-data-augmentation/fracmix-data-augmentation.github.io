/* ── BibTeX copy ── */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('copyBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const text = document.getElementById('bibtexCode').textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i> Copy'; }, 2000);
      });
    });
  }

  /* ── Result table tabs (if present) ── */
  const rtabs = document.querySelectorAll('.rtab');
  const tables = document.querySelectorAll('.result-table-wrap');

  rtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      rtabs.forEach(t => t.classList.remove('active'));
      tables.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('tbl-' + tab.dataset.table);
      if (target) target.classList.add('active');
    });
  });

  /* ── Result-card comparison modal ── */
  const overlay  = document.getElementById('chartModalOverlay');
  const closeBtn = document.getElementById('chartModalClose');
  const titleEl  = document.getElementById('chartModalTitle');
  const noteEl   = document.getElementById('chartModalNote');
  const canvas   = document.getElementById('chartModalCanvas');
  let modalChart = null;

  if (overlay && canvas) {
    const COLOR_OURS     = { bg: 'rgba(79,70,229,0.85)',  border: '#4f46e5' };
    const COLOR_BASELINE = { bg: 'rgba(165,180,252,0.55)', border: '#a5b4fc' };
    const COLOR_VANILLA  = { bg: 'rgba(209,213,219,0.6)',  border: '#9ca3af' };

    function openModal(cfg) {
      titleEl.textContent = cfg.title || 'Comparison';
      noteEl.textContent  = cfg.note || '';

      const lastIdx = cfg.data.length - 1;
      const bg = [], border = [];
      cfg.data.forEach((_, i) => {
        if (i === lastIdx)      { bg.push(COLOR_OURS.bg);     border.push(COLOR_OURS.border); }
        else if (i === 0)       { bg.push(COLOR_VANILLA.bg);  border.push(COLOR_VANILLA.border); }
        else                    { bg.push(COLOR_BASELINE.bg); border.push(COLOR_BASELINE.border); }
      });

      if (modalChart) { modalChart.destroy(); modalChart = null; }

      const minVal = Math.min(...cfg.data);
      const maxVal = Math.max(...cfg.data);
      const yMin = Math.max(0, Math.floor(minVal - (maxVal - minVal) * 0.4 - 1));

      modalChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: cfg.labels,
          datasets: [{
            data: cfg.data,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: 2,
            borderRadius: 6,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const isOurs = ctx.dataIndex === lastIdx;
                  return ` ${ctx.parsed.y}${isOurs ? '  ★ Ours' : ''}`;
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: false, min: yMin, ticks: { color: '#6b7280' }, grid: { color: '#f3f4f6' } },
            x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false } }
          }
        }
      });

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    document.querySelectorAll('[data-chart]').forEach(card => {
      const trigger = () => {
        try {
          const cfg = JSON.parse(card.getAttribute('data-chart'));
          openModal(cfg);
        } catch (e) { /* ignore malformed config */ }
      };
      card.addEventListener('click', trigger);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); }
      });
    });

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

});
