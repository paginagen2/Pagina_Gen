document.addEventListener('DOMContentLoaded', () => {
  const timelineItems = [...document.querySelectorAll('.timeline-item')];
  const sectionLinks = [...document.querySelectorAll('.section-nav a')];
  const sections = sectionLinks
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  timelineItems.forEach(item => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;

      timelineItems.forEach(otherItem => {
        if (otherItem !== item) otherItem.open = false;
      });

      if (window.matchMedia('(max-width: 620px)').matches && item.contains(document.activeElement)) {
        window.requestAnimationFrame(() => {
          item.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    });
  });

  function setActiveSection(sectionId) {
    sectionLinks.forEach(link => {
      const isActive = link.getAttribute('href') === `#${sectionId}`;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  sectionLinks.forEach(link => {
    link.addEventListener('click', () => {
      setActiveSection(link.getAttribute('href').slice(1));
    });
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visibleSections = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visibleSections[0]) setActiveSection(visibleSections[0].target.id);
    }, {
      rootMargin: '-28% 0px -58% 0px',
      threshold: [0, .15, .35]
    });

    sections.forEach(section => observer.observe(section));
  }
});
